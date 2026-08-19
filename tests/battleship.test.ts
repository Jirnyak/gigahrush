import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  BATTLESHIP_BOARD_SIZE,
  BATTLESHIP_CELL,
  BATTLESHIP_FLEET_SIZES,
  battleshipStakeFromNpc,
  buildBattleshipView,
  chooseBattleshipShot,
  closeBattleshipGame,
  debugBattleshipFleet,
  fireAtFleet,
  getBattleshipSnapshot,
  handleBattleshipInput,
  placeBattleshipFleet,
  startBattleshipGame,
  transferBattleshipStake,
  type BattleshipFleet,
} from '../src/systems/battleship';
import { seededRandom } from '../src/core/rand';
import { getRecentEvents } from '../src/systems/events';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const SIZE = BATTLESHIP_BOARD_SIZE;
const CELLS = SIZE * SIZE;

function table(overrides: { money?: number; remote?: boolean; seed?: number } = {}) {
  closeBattleshipGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: overrides.money ?? 500 });
  const npc = makeTestNpc({ id: 21, name: 'Сосед с тетрадью', money: overrides.money ?? 500 });
  const started = startBattleshipGame({ state, player, npc }, {
    remote: overrides.remote,
    rng: seededRandom(overrides.seed ?? 7),
  });
  assert.equal(started, true);
  return { state, player, npc };
}

function aim(ctx: ReturnType<typeof table>, x: number, y: number): void {
  for (let i = 0; i < SIZE; i++) handleBattleshipInput({ ...ctx, input: { leftNav: true, upNav: true } });
  for (let i = 0; i < x; i++) handleBattleshipInput({ ...ctx, input: { rightNav: true } });
  for (let i = 0; i < y; i++) handleBattleshipInput({ ...ctx, input: { downNav: true } });
}

function fireAt(ctx: ReturnType<typeof table>, cell: number): void {
  aim(ctx, cell % SIZE, (cell / SIZE) | 0);
  handleBattleshipInput({ ...ctx, input: { interactEdge: true } });
}

function neighbours(cell: number): number[] {
  const out: number[] = [];
  const x = cell % SIZE;
  const y = (cell / SIZE) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) out.push(ny * SIZE + nx);
    }
  }
  return out;
}

test('расстановка дает классический флот и корабли не касаются даже углами', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const fleet = placeBattleshipFleet(seededRandom(seed));
    assert.deepEqual(
      fleet.ships.map(ship => ship.size).sort((a, b) => b - a),
      [...BATTLESHIP_FLEET_SIZES],
      `сид ${seed}`,
    );
    assert.equal(fleet.shipAt.filter(v => v > 0).length, BATTLESHIP_FLEET_SIZES.reduce((a, b) => a + b, 0));

    for (let i = 0; i < fleet.ships.length; i++) {
      const ship = fleet.ships[i];
      assert.equal(ship.cells.length, ship.size);
      const xs = new Set(ship.cells.map(c => c % SIZE));
      const ys = new Set(ship.cells.map(c => (c / SIZE) | 0));
      assert.ok(xs.size === 1 || ys.size === 1, `корабль не в линию, сид ${seed}`);
      for (const cell of ship.cells) {
        for (const n of neighbours(cell)) {
          const other = fleet.shipAt[n];
          assert.ok(other === 0 || other === i + 1, `корабли соприкасаются, сид ${seed}`);
        }
      }
    }
  }
});

test('убитый корабль обводится промахами по всем восьми соседям', () => {
  const fleet = placeBattleshipFleet(seededRandom(11));
  const single = fleet.ships.find(ship => ship.size === 1)!;
  const cell = single.cells[0];

  assert.equal(fireAtFleet(fleet, cell), 'sunk');
  assert.equal(fleet.shots[cell], BATTLESHIP_CELL.SUNK);
  for (const n of neighbours(cell)) assert.equal(fleet.shots[n], BATTLESHIP_CELL.MISS);
  assert.equal(fireAtFleet(fleet, cell), 'invalid');

  const four = fleet.ships.find(ship => ship.size === 4)!;
  for (let i = 0; i < 3; i++) assert.equal(fireAtFleet(fleet, four.cells[i]), 'hit');
  assert.equal(fireAtFleet(fleet, four.cells[3]), 'sunk');
  for (const shipCell of four.cells) {
    assert.equal(fleet.shots[shipCell], BATTLESHIP_CELL.SUNK);
    for (const n of neighbours(shipCell)) assert.notEqual(fleet.shots[n], BATTLESHIP_CELL.EMPTY);
  }
});

test('попадание оставляет ход, промах передает его противнику', () => {
  const ctx = table();
  const enemy = debugBattleshipFleet('npc')!;
  const shipCell = enemy.shipAt.findIndex(v => v > 0);
  const waterCell = enemy.shipAt.findIndex((v, i) => v === 0 && neighbours(i).every(n => enemy.shipAt[n] === 0));

  fireAt(ctx, shipCell);
  assert.equal(getBattleshipSnapshot().phase, 'player_turn');
  assert.equal(getBattleshipSnapshot().yourTurn, true);
  assert.equal(getBattleshipSnapshot().enemy[shipCell] !== BATTLESHIP_CELL.EMPTY, true);

  fireAt(ctx, waterCell);
  assert.equal(getBattleshipSnapshot().enemy[waterCell], BATTLESHIP_CELL.MISS);
  assert.equal(getBattleshipSnapshot().phase, 'npc_turn');
  assert.equal(getBattleshipSnapshot().yourTurn, false);
  closeBattleshipGame();
});

test('вид кресла не раскрывает чужой флот', () => {
  const ctx = table();
  const enemy = debugBattleshipFleet('npc')!;
  const own = debugBattleshipFleet('player')!;

  const shipCell = enemy.shipAt.findIndex(v => v > 0);
  fireAt(ctx, shipCell);

  const view = buildBattleshipView('player');
  assert.equal(view.enemy.length, CELLS);
  // Чужое поле — ровно отстрелянный слой, ни клеткой больше.
  assert.deepEqual([...view.enemy], [...enemy.shots]);
  assert.ok(view.enemy.some(code => code !== BATTLESHIP_CELL.EMPTY), 'выстрел не отражен в виде');
  for (let cell = 0; cell < CELLS; cell++) {
    if (enemy.shots[cell] === BATTLESHIP_CELL.EMPTY) {
      assert.equal(view.enemy[cell], BATTLESHIP_CELL.EMPTY, `клетка ${cell} выдает чужое поле`);
    }
    assert.notEqual(view.enemy[cell], BATTLESHIP_CELL.SHIP);
  }
  // Свое поле видно целиком, иначе играть нечем.
  assert.equal(view.own.filter(code => code === BATTLESHIP_CELL.SHIP).length, BATTLESHIP_FLEET_SIZES.reduce((a, b) => a + b, 0));

  // Ни один массив снимка не повторяет карту чужого флота, включая вложенные.
  const layout = enemy.shipAt.map(v => (v ? 1 : 0)).join('');
  for (const arr of numericArrays(view)) {
    assert.notEqual(arr.map(v => (v ? 1 : 0)).join(''), layout);
  }

  // Второе кресло симметрично: флот игрока для него так же закрыт.
  const npcView = buildBattleshipView('npc');
  for (let cell = 0; cell < CELLS; cell++) {
    if (own.shots[cell] === BATTLESHIP_CELL.EMPTY) assert.equal(npcView.enemy[cell], BATTLESHIP_CELL.EMPTY);
  }
  assert.equal(npcView.enemy.some(code => code === BATTLESHIP_CELL.SHIP), false);
  closeBattleshipGame();
});

function numericArrays(value: unknown, out: number[][] = []): number[][] {
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'number')) out.push(value as number[]);
    else for (const item of value) numericArrays(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) numericArrays(item, out);
  }
  return out;
}

test('в кооп-режиме за кресло npc ходит человек, а не ИИ', () => {
  const ctx = table({ remote: true });
  const enemy = debugBattleshipFleet('npc')!;
  const own = debugBattleshipFleet('player')!;
  const waterCell = enemy.shipAt.findIndex((v, i) => v === 0 && neighbours(i).every(n => enemy.shipAt[n] === 0));

  handleBattleshipInput({ ...ctx, input: { interactEdge: true }, seat: 'npc' });
  assert.equal(own.shots.every(code => code === BATTLESHIP_CELL.EMPTY), true, 'чужое кресло сходило вне очереди');

  fireAt(ctx, waterCell);
  assert.equal(getBattleshipSnapshot().phase, 'npc_turn');

  // Сколько бы кадров ни прошло, ИИ за второго человека не стреляет.
  for (let i = 0; i < 40; i++) {
    ctx.state.time += 1;
    handleBattleshipInput({ ...ctx, input: {}, seat: 'player' });
    handleBattleshipInput({ ...ctx, input: {} });
  }
  assert.equal(own.shots.every(code => code === BATTLESHIP_CELL.EMPTY), true, 'ИИ выстрелил в кооп-режиме');

  // Ход второго человека проходит только с его кресла.
  handleBattleshipInput({ ...ctx, input: { interactEdge: true }, seat: 'npc' });
  assert.equal(own.shots.filter(code => code !== BATTLESHIP_CELL.EMPTY).length > 0, true);
  closeBattleshipGame();
});

test('против NPC ИИ стреляет сам, выдержав паузу между залпами', () => {
  const ctx = table();
  const enemy = debugBattleshipFleet('npc')!;
  const own = debugBattleshipFleet('player')!;
  const waterCell = enemy.shipAt.findIndex((v, i) => v === 0 && neighbours(i).every(n => enemy.shipAt[n] === 0));

  fireAt(ctx, waterCell);
  handleBattleshipInput({ ...ctx, input: {} });
  assert.equal(own.shots.every(code => code === BATTLESHIP_CELL.EMPTY), true, 'ИИ выстрелил без паузы');

  ctx.state.time += 5;
  handleBattleshipInput({ ...ctx, input: {} });
  assert.equal(own.shots.filter(code => code !== BATTLESHIP_CELL.EMPTY).length > 0, true);
  closeBattleshipGame();
});

test('ИИ ищет через клетку и добивает раненый корабль по линии', () => {
  const empty = new Array<number>(CELLS).fill(BATTLESHIP_CELL.EMPTY);
  for (let i = 0; i < 20; i++) {
    const cell = chooseBattleshipShot(empty, seededRandom(i + 1));
    assert.equal((cell % SIZE + ((cell / SIZE) | 0)) % 2, 0, 'поиск сошел с шахматного шага');
  }

  const wounded = [...empty];
  wounded[5 * SIZE + 5] = BATTLESHIP_CELL.HIT;
  const around = new Set([4 * SIZE + 5, 6 * SIZE + 5, 5 * SIZE + 4, 5 * SIZE + 6]);
  for (let i = 0; i < 20; i++) {
    assert.ok(around.has(chooseBattleshipShot(wounded, seededRandom(i + 1))), 'добивание бьет не по соседям');
  }

  wounded[5 * SIZE + 6] = BATTLESHIP_CELL.HIT;
  const ends = new Set([5 * SIZE + 4, 5 * SIZE + 7]);
  for (let i = 0; i < 20; i++) {
    assert.ok(ends.has(chooseBattleshipShot(wounded, seededRandom(i + 1))), 'направление корабля не определено');
  }

  const done: BattleshipFleet['shots'] = new Array<number>(CELLS).fill(BATTLESHIP_CELL.MISS);
  assert.equal(chooseBattleshipShot(done, seededRandom(1)), -1);
});

test('потопленный флот заканчивает партию и переводит ставку', () => {
  const ctx = table({ money: 200 });
  const enemy = debugBattleshipFleet('npc')!;
  for (const ship of enemy.ships) {
    for (const cell of ship.cells) fireAt(ctx, cell);
  }

  const snapshot = getBattleshipSnapshot();
  assert.equal(snapshot.phase, 'finished');
  assert.equal(snapshot.winner, 'player');
  assert.equal(snapshot.enemySunk, BATTLESHIP_FLEET_SIZES.length);
  assert.equal(ctx.player.money, 220);
  assert.equal(ctx.npc.money, 180);
  assert.equal(getRecentEvents(ctx.state, { type: 'gambling_win', tags: ['battleship'], limit: 1 })[0]?.itemValue, 20);
  assert.equal(handleBattleshipInput({ ...ctx, input: { interactEdge: true } }).closeInterface, true);
  closeBattleshipGame();
});

test('ставка — десятая доля денег NPC, расчет ограничен кошельком платящего', () => {
  const state = makeGameState();
  const player = makeTestPlayer({ money: 3 });
  const npc = makeTestNpc({ money: 107 });

  assert.equal(battleshipStakeFromNpc(npc), 10);
  assert.equal(battleshipStakeFromNpc(makeTestNpc({ money: 9 })), 1);
  assert.equal(battleshipStakeFromNpc(makeTestNpc({ money: 0 })), 0);
  assert.equal(transferBattleshipStake(state, player, npc, 'npc', 10), 3);
  assert.equal(player.money, 0);
  assert.equal(npc.money, 110);
  assert.equal(transferBattleshipStake(state, player, npc, 'player', 10), 10);
  assert.equal(player.money, 10);
  assert.equal(npc.money, 100);
  assert.equal(getRecentEvents(state, { type: 'gambling_win', tags: ['battleship'], limit: 1 }).length, 1);
});

test('партия открывается со ставкой и публикует событие пари', () => {
  const ctx = table({ money: 200 });
  const snapshot = getBattleshipSnapshot();
  assert.equal(snapshot.open, true);
  assert.equal(snapshot.npcId, 21);
  assert.equal(snapshot.stakeRubles, 20);
  assert.equal(snapshot.ownSunk, 0);
  assert.equal(snapshot.enemySunk, 0);
  assert.equal(snapshot.phase, 'player_turn');
  assert.equal(getRecentEvents(ctx.state, { type: 'gambling_bet', tags: ['battleship'], limit: 1 }).length, 1);
  assert.equal(ctx.player.money, 200);
  assert.equal(ctx.npc.money, 200);
  closeBattleshipGame();
});
