import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  backgammonLegalMovesFor,
  backgammonStakeFromNpc,
  closeBackgammonGame,
  getBackgammonSnapshot,
  handleBackgammonInput,
  startBackgammonGame,
  transferBackgammonStake,
  type BackgammonSetup,
} from '../src/systems/backgammon';
import { getRecentEvents } from '../src/systems/events';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

/** Кости выпадают по списку: rollBackgammonDice берёт `floor(rand()*6)+1`. */
function dieSeq(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length] ?? 1;
    i++;
    return (value - 1) / 6;
  };
}

function points(spec: Record<number, number>): number[] {
  const out = new Array<number>(24).fill(0);
  for (const key of Object.keys(spec)) out[Number(key)] = spec[Number(key)];
  return out;
}

function openTable(setup: BackgammonSetup, dice: readonly number[], remote = false) {
  closeBackgammonGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 50 });
  const npc = makeTestNpc({ id: 9, name: 'Сосед с нардами', money: 100 });
  assert.equal(startBackgammonGame({ state, player, npc }, { rng: dieSeq(dice), setup, remote }), true);
  return { state, player, npc };
}

function press(table: ReturnType<typeof openTable>, input: Record<string, boolean>, seat?: 'player' | 'npc') {
  return handleBackgammonInput({ state: table.state, player: table.player, npc: table.npc, input, seat });
}

test('нарды: ставка десять процентов, перевод упирается в деньги платящего', () => {
  const state = makeGameState();
  const player = makeTestPlayer({ money: 3 });
  const npc = makeTestNpc({ money: 107 });

  assert.equal(backgammonStakeFromNpc(npc), 10);
  assert.equal(backgammonStakeFromNpc(makeTestNpc({ money: 0 })), 0);
  assert.equal(transferBackgammonStake(state, player, npc, 'npc', 20), 3);
  assert.equal(player.money, 0);
  assert.equal(npc.money, 110);
  assert.equal(transferBackgammonStake(state, player, npc, 'player', 20), 20);
  assert.equal(player.money, 20);
  assert.equal(npc.money, 90);
});

test('нарды: за ход с головы снимается только одна шашка', () => {
  const table = openTable({ turn: 'player' }, [3, 5], true);
  press(table, { interactEdge: true });
  const rolled = getBackgammonSnapshot();
  assert.equal(rolled.own[0], 15);
  assert.deepEqual([...rolled.dice], [3, 5]);

  press(table, { interactEdge: true });
  const after = getBackgammonSnapshot();
  assert.equal(after.own[0], 14);
  assert.equal(after.own[3], 1);
  assert.equal(backgammonLegalMovesFor('player').some(move => move.from === 0), false);
  assert.equal(backgammonLegalMovesFor('player').some(move => move.from === 3), true);
  closeBackgammonGame();
});

test('нарды: первый ход дублем снимает с головы две шашки и даёт четыре хода', () => {
  const table = openTable({ turn: 'player' }, [3, 3], true);
  press(table, { interactEdge: true });
  assert.equal(getBackgammonSnapshot().dice.length, 4);

  press(table, { interactEdge: true });
  assert.equal(getBackgammonSnapshot().own[0], 14);
  assert.equal(backgammonLegalMovesFor('player').some(move => move.from === 0), true);

  press(table, { interactEdge: true });
  const after = getBackgammonSnapshot();
  assert.equal(after.own[0], 13);
  assert.equal(after.own[3], 2);
  assert.equal(backgammonLegalMovesFor('player').some(move => move.from === 0), false);
  closeBackgammonGame();
});

test('нарды: на занятый соперником пункт вставать нельзя', () => {
  // Пункт 8 своего пути занят соперником: его индекс того же пункта — (8+12)%24.
  const table = openTable({ turn: 'player', player: points({ 5: 1 }), npc: points({ 20: 1, 0: 14 }) }, [3, 4], true);
  press(table, { interactEdge: true });
  const moves = backgammonLegalMovesFor('player');
  assert.equal(moves.some(move => move.from === 5 && move.die === 3), false);
  assert.equal(moves.some(move => move.from === 5 && move.die === 4), true);
  closeBackgammonGame();
});

test('нарды: шесть занятых подряд запирают соперника и потому запрещены', () => {
  const blocked = openTable(
    { turn: 'player', player: points({ 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 }), npc: points({ 0: 15 }) },
    [6, 1],
    true,
  );
  press(blocked, { interactEdge: true });
  assert.equal(backgammonLegalMovesFor('player').some(move => move.from === 4 && move.die === 6), false);
  closeBackgammonGame();

  // Та же расстановка, но одна шашка соперника уже прошла блок — ряд законен.
  const allowed = openTable(
    { turn: 'player', player: points({ 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 }), npc: points({ 0: 14, 23: 1 }) },
    [6, 1],
    true,
  );
  press(allowed, { interactEdge: true });
  assert.equal(backgammonLegalMovesFor('player').some(move => move.from === 4 && move.die === 6), true);
  closeBackgammonGame();
});

test('нарды: выброс открыт, только когда все шашки дома', () => {
  const early = openTable({ turn: 'player', player: points({ 10: 1, 23: 14 }), npc: points({ 0: 15 }) }, [3, 4], true);
  press(early, { interactEdge: true });
  assert.equal(backgammonLegalMovesFor('player').every(move => move.to < 24), true);
  closeBackgammonGame();

  const home = openTable({ turn: 'player', player: points({ 23: 15 }), npc: points({ 0: 15 }) }, [3, 4], true);
  press(home, { interactEdge: true });
  assert.equal(backgammonLegalMovesFor('player').some(move => move.to === 24), true);
  closeBackgammonGame();
});

test('нарды: выведенные пятнадцать шашек закрывают партию, марс платит вдвое', () => {
  const table = openTable(
    { turn: 'player', player: points({ 23: 1 }), playerOff: 14, npc: points({ 0: 15 }) },
    [1, 2],
    true,
  );
  press(table, { interactEdge: true });
  press(table, { interactEdge: true });
  const snapshot = getBackgammonSnapshot();
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.winner, 'player');
  assert.equal(snapshot.ownOff, 15);
  assert.equal(table.player.money, 70);
  assert.equal(table.npc.money, 80);
  assert.equal(getRecentEvents(table.state, { type: 'gambling_win', tags: ['backgammon'], limit: 1 })[0]?.itemValue, 20);
  closeBackgammonGame();
});

test('нарды: без единого хода ход пропускается', () => {
  // Обе кости ведут на пункты, занятые соперником: 6 и 7 своего пути.
  const table = openTable(
    { turn: 'player', player: points({ 5: 1 }), npc: points({ 18: 1, 19: 1, 0: 13 }) },
    [1, 2],
    true,
  );
  press(table, { interactEdge: true });
  const snapshot = getBackgammonSnapshot();
  assert.equal(snapshot.yourTurn, false);
  assert.equal(snapshot.phase, 'npc_turn');
  assert.ok(snapshot.log.some(line => line.includes('пропуск')));
  closeBackgammonGame();
});

test('нарды: за кооп-столом ИИ не ходит за сторону npc', () => {
  const coop = openTable({ turn: 'npc' }, [4, 2], true);
  const waiting = getBackgammonSnapshot();
  assert.equal(waiting.yourTurn, false);
  assert.equal(waiting.rolled, false);
  // Голова соперника видна в своей рамке как пункт (0+12)%24.
  assert.equal(waiting.foe[12], 15);
  press(coop, { leftNav: true });
  assert.equal(getBackgammonSnapshot().foe[12], 15);

  // Второй человек ходит сам, тем же обработчиком, за стул 'npc'.
  press(coop, { interactEdge: true }, 'npc');
  press(coop, { interactEdge: true }, 'npc');
  assert.equal(getBackgammonSnapshot().foe[12], 14);
  closeBackgammonGame();

  // Против NPC тот же стол ходит сам, без ввода.
  openTable({ turn: 'npc' }, [4, 2]);
  const solo = getBackgammonSnapshot();
  assert.ok(solo.foe[12] < 15);
  assert.equal(solo.yourTurn, true);
  closeBackgammonGame();
});
