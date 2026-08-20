/* ── Замок детерминизма настолок и денег ─────────────────────────────────────
 *
 * Ставка настольной игры уходит в `player.money`, поэтому раздача, броски и
 * расстановка обязаны идти через общий `rng()` из `src/core/rand.ts`, а не через
 * `Math.random()`. Иначе сейв-скам переигрывает одну и ту же партию до выигрыша,
 * тесты становятся невоспроизводимы, а в онлайне хост и пир расходятся в исходе.
 *
 * Проверяется обе стороны: одинаковый сид даёт побайтово одинаковую партию, а
 * разные сиды всё-таки расходятся — значит источник действительно подключен.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { seedGlobalRng } from '../src/core/rand';
import { Cell, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { rollDicePair, startDiceGame, handleDiceInput, closeDiceGame } from '../src/systems/dice';
import { rollBackgammonDice } from '../src/systems/backgammon';
import { createPokerDeck, shufflePokerDeck } from '../src/systems/poker';
import { createDurakDeck, shuffleDurakDeck } from '../src/systems/durak';
import { createDominoSet, shuffleDominoSet } from '../src/systems/domino';
import {
  BATTLESHIP_BOARD_SIZE,
  BATTLESHIP_CELL,
  chooseBattleshipShot,
  placeBattleshipFleet,
} from '../src/systems/battleship';
import { randomChalkRgb } from '../src/systems/chalk';
import {
  activateGamblingBet,
  clearGamblingMachines,
  closeGamblingMachine,
  openGamblingMachine,
  placeGamblingMachine,
} from '../src/systems/gambling';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const SEED = 20260820;

/** Прогоняет один и тот же розыгрыш дважды от одного сида. */
function twice<T>(seed: number, run: () => T): [T, T] {
  seedGlobalRng(seed);
  const a = run();
  seedGlobalRng(seed);
  const b = run();
  return [a, b];
}

function sameFromSameSeed<T>(label: string, run: () => T): void {
  const [a, b] = twice(SEED, run);
  assert.deepEqual(a, b, `${label}: один сид дал разный результат`);
}

/** Тот же розыгрыш на разных сидах обязан хоть раз разойтись. */
function variesAcrossSeeds<T>(label: string, run: () => T): void {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    seedGlobalRng(SEED + i * 7919);
    seen.add(JSON.stringify(run()));
  }
  assert.ok(seen.size > 1, `${label}: результат не зависит от сида`);
}

test('броски костей и нард детерминированы от сида', () => {
  const dicePairs = () => Array.from({ length: 8 }, () => rollDicePair());
  sameFromSameSeed('кости', dicePairs);
  variesAcrossSeeds('кости', dicePairs);

  const backgammon = () => Array.from({ length: 8 }, () => rollBackgammonDice());
  sameFromSameSeed('нарды', backgammon);
  variesAcrossSeeds('нарды', backgammon);
});

test('тасовка колод и раздача домино детерминированы от сида', () => {
  const poker = () => shufflePokerDeck(createPokerDeck()).map(card => card.id);
  sameFromSameSeed('покер', poker);
  variesAcrossSeeds('покер', poker);

  const durak = () => shuffleDurakDeck(createDurakDeck()).map(card => card.id);
  sameFromSameSeed('дурак', durak);
  variesAcrossSeeds('дурак', durak);

  const domino = () => shuffleDominoSet(createDominoSet()).map(tile => tile.id);
  sameFromSameSeed('домино', domino);
  variesAcrossSeeds('домино', domino);
});

test('расстановка флота и выбор залпа детерминированы от сида', () => {
  sameFromSameSeed('морской бой: флот', () => placeBattleshipFleet());
  variesAcrossSeeds('морской бой: флот', () => placeBattleshipFleet());

  const volley = () => {
    const board = new Array<number>(BATTLESHIP_BOARD_SIZE * BATTLESHIP_BOARD_SIZE).fill(BATTLESHIP_CELL.EMPTY);
    const picked: number[] = [];
    for (let i = 0; i < 6; i++) {
      const cell = chooseBattleshipShot(board);
      if (cell < 0) break;
      board[cell] = BATTLESHIP_CELL.MISS;
      picked.push(cell);
    }
    return picked;
  };
  sameFromSameSeed('морской бой: залп', volley);
  variesAcrossSeeds('морской бой: залп', volley);
});

test('цвет мела в предмете детерминирован от сида', () => {
  sameFromSameSeed('мел', () => randomChalkRgb());
  variesAcrossSeeds('мел', () => randomChalkRgb());
});

/** Полная партия в кости: те же входы на том же сиде — тот же карман. */
function playDiceMatch(seed: number): { player: number; npc: number; log: readonly string[] } {
  seedGlobalRng(seed);
  closeDiceGame();
  const state: GameState = makeGameState();
  const player: Entity = makeTestPlayer({ money: 500 });
  const npc: Entity = makeTestNpc({ id: 5, name: 'Сосед с костями', money: 500 });
  assert.equal(startDiceGame({ state, player, npc }), true);
  const roll = { interactEdge: true } as never;
  const hold = { dropEdge: true } as never;
  handleDiceInput({ state, player, npc, input: roll });
  handleDiceInput({ state, player, npc, input: roll });
  handleDiceInput({ state, player, npc, input: hold });
  const log = state.msgs.map(m => m.text);
  closeDiceGame();
  return { player: player.money ?? 0, npc: npc.money ?? 0, log };
}

test('одна и та же партия в кости на одном сиде даёт один и тот же исход', () => {
  assert.deepEqual(playDiceMatch(SEED), playDiceMatch(SEED));

  const outcomes = new Set<string>();
  for (let i = 0; i < 12; i++) outcomes.add(JSON.stringify(playDiceMatch(SEED + i * 7919)));
  assert.ok(outcomes.size > 1, 'партия в кости не зависит от сида');
});

test('выигрыш автомата детерминирован от сида', () => {
  const spin = (seed: number): number => {
    seedGlobalRng(seed);
    clearGamblingMachines();
    const world = new World();
    const idx = world.idx(40, 40);
    world.cells[idx] = Cell.FLOOR;
    const machine = placeGamblingMachine(world, 40, 40, 'slots');
    assert.ok(machine, 'автомат не встал на клетку');
    const state = makeGameState();
    const player = makeTestPlayer({ money: 5000 });
    openGamblingMachine(state, machine);
    let money = 0;
    for (let i = 0; i < 6; i++) {
      activateGamblingBet(world, state, player);
      money = player.money ?? 0;
    }
    closeGamblingMachine();
    clearGamblingMachines();
    return money;
  };

  assert.equal(spin(SEED), spin(SEED));
  const purses = new Set<number>();
  for (let i = 0; i < 12; i++) purses.add(spin(SEED + i * 7919));
  assert.ok(purses.size > 1, 'исход автомата не зависит от сида');
});

/** Псевдоним `mathRng as rng` маскировал нарушение и при чтении, и при grep. */
test('настолки и деньги не тянут Math.random через mathRng', () => {
  const files = [
    'gambling', 'dice', 'poker', 'durak', 'backgammon',
    'domino', 'battleship', 'checkers', 'chess', 'chalk',
  ];
  for (const name of files) {
    const path = fileURLToPath(new URL(`../src/systems/${name}.ts`, import.meta.url));
    const src = readFileSync(path, 'utf8');
    assert.ok(!/\bmathRng\b|\bmathIrand\b/.test(src), `${name}.ts тянет косметический RNG в деньги`);
    assert.ok(!/\bMath\.random\b/.test(src), `${name}.ts зовет Math.random напрямую`);
  }
});
