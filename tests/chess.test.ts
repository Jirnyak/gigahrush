import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  applyChessMove,
  buildChessView,
  chessMoveNotation,
  chessPositionFromRows,
  chessPositionStatus,
  chessSquareName,
  chessStakeFromNpc,
  chooseChessAiMove,
  closeChessGame,
  handleChessInput,
  initialChessPosition,
  isChessKingAttacked,
  legalChessMoves,
  startChessGame,
  transferChessStake,
  type ChessInput,
  type ChessPosition,
} from '../src/systems/chess';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

/** Ходы в тестах задаются полями: так фикстура читается как партия. */
function play(pos: ChessPosition, from: string, to: string): ChessPosition {
  const move = legalChessMoves(pos).find(m => chessSquareName(m.from) === from && chessSquareName(m.to) === to);
  assert.ok(move, `ход ${from}-${to} должен быть легален`);
  return applyChessMove(pos, move);
}

function targetsFrom(pos: ChessPosition, from: string): string[] {
  return legalChessMoves(pos)
    .filter(m => chessSquareName(m.from) === from)
    .map(m => chessSquareName(m.to))
    .sort();
}

const EMPTY_ROWS = ['........', '........', '........', '........', '........', '........', '........', '........'];

function rowsWith(placements: Record<string, string>): string[] {
  const rows = EMPTY_ROWS.map(row => row.split(''));
  for (const [square, piece] of Object.entries(placements)) {
    const x = 'abcdefgh'.indexOf(square[0]);
    const y = 8 - Number(square[1]);
    rows[y][x] = piece;
  }
  return rows.map(row => row.join(''));
}

test('стартовая расстановка даёт двадцать первых ходов белым', () => {
  const pos = initialChessPosition();
  assert.equal(pos.turn, 'player');
  assert.equal(legalChessMoves(pos).length, 20);
  assert.deepEqual(targetsFrom(pos, 'e2'), ['e3', 'e4']);
  assert.deepEqual(targetsFrom(pos, 'g1'), ['f3', 'h3']);
});

test('фигуры ходят по своим правилам и не проходят сквозь чужие', () => {
  const pos = chessPositionFromRows(rowsWith({
    e1: 'K', e8: 'k', d4: 'N', a1: 'R', h1: 'B', d1: 'Q', d5: 'p',
  }));
  assert.deepEqual(targetsFrom(pos, 'd4'), ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5']);
  assert.deepEqual(targetsFrom(pos, 'a1'), ['a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'c1']);
  assert.deepEqual(targetsFrom(pos, 'h1'), ['d5', 'e4', 'f3', 'g2']);
  assert.deepEqual(
    targetsFrom(pos, 'd1'),
    ['a4', 'b1', 'b3', 'c1', 'c2', 'd2', 'd3', 'e2', 'f3', 'g4', 'h5'],
  );
});

test('пешка бьёт по диагонали и не бьёт вперёд', () => {
  const pos = chessPositionFromRows(rowsWith({ e1: 'K', e8: 'k', c2: 'P', c3: 'n', d3: 'b' }));
  assert.deepEqual(targetsFrom(pos, 'c2'), ['d3']);
});

test('пешка идёт через клетку только с начальной горизонтали', () => {
  const pos = chessPositionFromRows(rowsWith({ e1: 'K', e8: 'k', a2: 'P', b3: 'P' }));
  assert.deepEqual(targetsFrom(pos, 'a2'), ['a3', 'a4']);
  assert.deepEqual(targetsFrom(pos, 'b3'), ['b4']);
});

test('связанная фигура не ходит: король остался бы под боем', () => {
  const pos = chessPositionFromRows(rowsWith({ e1: 'K', e2: 'N', e8: 'r', a8: 'k' }));
  assert.deepEqual(targetsFrom(pos, 'e2'), []);
  assert.equal(isChessKingAttacked(pos.board, 'player'), false);
});

test('короткая и длинная рокировка переставляют ладью', () => {
  const pos = chessPositionFromRows(rowsWith({ e1: 'K', a1: 'R', h1: 'R', e8: 'k' }), 'player', { castle: 1 | 2 });
  assert.ok(targetsFrom(pos, 'e1').includes('g1'));
  assert.ok(targetsFrom(pos, 'e1').includes('c1'));

  const short = legalChessMoves(pos).find(m => m.castleSide === 1)!;
  assert.equal(chessMoveNotation(pos, short), '0-0');
  const afterShort = applyChessMove(pos, short);
  assert.equal(afterShort.board[7 * 8 + 6], 6, 'король на g1');
  assert.equal(afterShort.board[7 * 8 + 5], 4, 'ладья на f1');
  assert.equal(afterShort.castle, 0);

  const long = legalChessMoves(pos).find(m => m.castleSide === -1)!;
  const afterLong = applyChessMove(pos, long);
  assert.equal(afterLong.board[7 * 8 + 2], 6, 'король на c1');
  assert.equal(afterLong.board[7 * 8 + 3], 4, 'ладья на d1');
});

test('рокировка запрещена через битое поле и без прав', () => {
  const attacked = chessPositionFromRows(rowsWith({ e1: 'K', h1: 'R', f8: 'r', a8: 'k' }), 'player', { castle: 1 });
  assert.equal(targetsFrom(attacked, 'e1').includes('g1'), false);

  const noRights = chessPositionFromRows(rowsWith({ e1: 'K', h1: 'R', a8: 'k' }), 'player', { castle: 0 });
  assert.equal(targetsFrom(noRights, 'e1').includes('g1'), false);

  const inCheck = chessPositionFromRows(rowsWith({ e1: 'K', h1: 'R', e8: 'r' }), 'player', { castle: 1 });
  assert.equal(targetsFrom(inCheck, 'e1').includes('g1'), false);
});

test('взятие на проходе доступно один ход и снимает пешку с её поля', () => {
  let pos = chessPositionFromRows(rowsWith({ e1: 'K', e8: 'k', d5: 'P', e7: 'p', a7: 'p' }), 'npc');
  pos = play(pos, 'e7', 'e5');
  assert.equal(chessSquareName(pos.ep), 'e6');
  const ep = legalChessMoves(pos).find(m => m.epCapture);
  assert.ok(ep, 'взятие на проходе должно быть в списке');
  assert.equal(chessSquareName(ep.to), 'e6');
  const after = applyChessMove(pos, ep);
  assert.equal(after.board[3 * 8 + 4], 0, 'снятая пешка ушла с e5');
  assert.equal(after.board[2 * 8 + 4], 1, 'бьющая пешка встала на e6');

  // Право на взятие живёт ровно один полуход.
  const skipped = play(play(pos, 'e1', 'e2'), 'a7', 'a6');
  assert.equal(skipped.ep, -1);
  assert.equal(legalChessMoves(skipped).some(m => m.epCapture), false);
});

test('пешка на последней горизонтали становится ферзём без меню', () => {
  const pos = chessPositionFromRows(rowsWith({ e1: 'K', a8: 'k', g7: 'P', h8: 'r' }));
  const promo = legalChessMoves(pos).find(m => m.promote && chessSquareName(m.to) === 'g8');
  assert.ok(promo);
  assert.equal(chessMoveNotation(pos, promo), 'g7-g8Ф');
  const after = applyChessMove(pos, promo);
  assert.equal(after.board[0 * 8 + 6], 5, 'на g8 стоит ферзь');
  const capturePromo = legalChessMoves(pos).find(m => m.promote && chessSquareName(m.to) === 'h8');
  assert.ok(capturePromo);
  assert.equal(applyChessMove(pos, capturePromo).board[7], 5);
});

test('шах виден, а детский мат заканчивает партию', () => {
  let pos = initialChessPosition();
  pos = play(pos, 'e2', 'e4');
  pos = play(pos, 'e7', 'e5');
  pos = play(pos, 'd1', 'h5');
  pos = play(pos, 'b8', 'c6');
  pos = play(pos, 'f1', 'c4');
  pos = play(pos, 'g8', 'f6');
  assert.equal(chessPositionStatus(pos), 'none');

  const mate = legalChessMoves(pos).find(m => chessSquareName(m.from) === 'h5' && chessSquareName(m.to) === 'f7');
  assert.ok(mate);
  assert.equal(chessMoveNotation(pos, mate), 'Фh5:f7');
  const after = applyChessMove(pos, mate);
  assert.equal(after.turn, 'npc');
  assert.equal(isChessKingAttacked(after.board, 'npc'), true);
  assert.equal(chessPositionStatus(after), 'checkmate');
  assert.equal(legalChessMoves(after).length, 0);
});

test('пат: ходов нет, но шаха нет', () => {
  const pos = chessPositionFromRows(rowsWith({ h8: 'k', g6: 'Q', a1: 'K' }), 'npc');
  assert.equal(isChessKingAttacked(pos.board, 'npc'), false);
  assert.equal(legalChessMoves(pos).length, 0);
  assert.equal(chessPositionStatus(pos), 'stalemate');
});

test('ИИ отдаёт легальный ход и берёт подвешенного ферзя', () => {
  const pos = chessPositionFromRows(rowsWith({ e8: 'k', a8: 'r', a4: 'Q', e1: 'K', h2: 'P' }), 'npc');
  const started = Date.now();
  const move = chooseChessAiMove(pos);
  const spent = Date.now() - started;
  assert.ok(move);
  assert.ok(legalChessMoves(pos).some(m => m.from === move.from && m.to === move.to));
  assert.equal(chessSquareName(move.to), 'a4');
  assert.ok(spent < 5000, `ход искался ${spent} мс`);
});

test('ИИ укладывается в потолок узлов на стартовой позиции', () => {
  const pos = applyChessMove(initialChessPosition(), legalChessMoves(initialChessPosition())[0]);
  const started = Date.now();
  const move = chooseChessAiMove(pos);
  const spent = Date.now() - started;
  assert.ok(move);
  assert.ok(spent < 5000, `ход искался ${spent} мс`);
});

test('счётчик пятидесяти ходов растёт на тихих ходах и обнуляется взятием', () => {
  let pos = chessPositionFromRows(rowsWith({ e1: 'K', e8: 'k', a1: 'R', h8: 'r', d4: 'P', e5: 'p' }), 'player', { halfmove: 40 });
  pos = play(pos, 'a1', 'a2');
  assert.equal(pos.halfmove, 41);
  pos = play(pos, 'h8', 'h7');
  assert.equal(pos.halfmove, 42);
  pos = play(pos, 'a2', 'a3');
  assert.equal(pos.halfmove, 43);
  pos = play(pos, 'h7', 'h6');
  assert.equal(pos.halfmove, 44);
  const capture = legalChessMoves(pos).find(m => m.captured !== 0);
  assert.ok(capture, 'взятие d4:e5 должно быть доступно');
  assert.equal(applyChessMove(pos, capture).halfmove, 0);
  // Ход пешкой без взятия тоже обнуляет счётчик.
  assert.equal(play(pos, 'd4', 'd5').halfmove, 0);
});

test('ставка — десятая часть денег NPC, перевод режется по кошельку платящего', () => {
  assert.equal(chessStakeFromNpc(makeTestNpc({ money: 250 })), 25);
  assert.equal(chessStakeFromNpc(makeTestNpc({ money: 0 })), 0);
  const state = makeGameState();
  const player = makeTestPlayer({ money: 5 });
  const npc = makeTestNpc({ id: 7, money: 100 });
  assert.equal(transferChessStake(state, player, npc, 'npc', 40), 5);
  assert.equal(player.money, 0);
  assert.equal(npc.money, 105);
});

interface Table {
  state: ReturnType<typeof makeGameState>;
  player: ReturnType<typeof makeTestPlayer>;
  npc: ReturnType<typeof makeTestNpc>;
}

function press(table: Table, input: ChessInput, seat?: 'player' | 'npc') {
  return handleChessInput({ ...table, input, seat });
}

/** Поле в координатах кресла: второе кресло смотрит на развёрнутую доску. */
function seatSquare(square: string, seat: 'player' | 'npc'): { x: number; y: number } {
  const x = 'abcdefgh'.indexOf(square[0]);
  const y = 8 - Number(square[1]);
  return seat === 'npc' ? { x: 7 - x, y: 7 - y } : { x, y };
}

/** Ход через клавиши: доводим курсор до поля и жмём выбор — ровно то, что
 *  делает человек за панелью. */
function seatMove(table: Table, seat: 'player' | 'npc', from: string, to: string): void {
  for (const square of [from, to]) {
    const goal = seatSquare(square, seat);
    for (let guard = 0; guard < 16; guard++) {
      const view = buildChessView(seat);
      if (view.cursorX === goal.x && view.cursorY === goal.y) break;
      if (view.cursorX < goal.x) press(table, { rightNav: true }, seat);
      else if (view.cursorX > goal.x) press(table, { leftNav: true }, seat);
      else if (view.cursorY < goal.y) press(table, { downNav: true }, seat);
      else press(table, { upNav: true }, seat);
    }
    press(table, { interactEdge: true }, seat);
  }
}

test('в кооп-режиме за кресло npc ИИ не ходит', () => {
  closeChessGame();
  const table: Table = {
    state: makeGameState(),
    player: makeTestPlayer({ money: 100 }),
    npc: makeTestNpc({ id: 11, name: 'Сосед', money: 100 }),
  };
  assert.equal(startChessGame(table, { remote: true, stake: 10 }), true);

  seatMove(table, 'player', 'e2', 'e4');

  const afterPlayer = buildChessView('player');
  assert.equal(afterPlayer.yourTurn, false, 'ход ушёл второму креслу');
  assert.ok(afterPlayer.pieces.some(p => p.side === 'player' && p.kind === 'pawn' && p.x === 4 && p.y === 4));

  const before = JSON.stringify(buildChessView('player').pieces);
  for (let tick = 0; tick < 6; tick++) press(table, {}, 'player');
  assert.equal(JSON.stringify(buildChessView('player').pieces), before, 'машина не ходила за второго человека');

  // Второе кресло видит свою доску развёрнутой и ходит само.
  const remoteSeat = buildChessView('npc');
  assert.equal(remoteSeat.mirrored, true);
  assert.equal(remoteSeat.yourTurn, true);
  assert.ok(remoteSeat.pieces.some(p => p.side === 'player' && p.kind === 'king' && p.y === 7));
  seatMove(table, 'npc', 'e7', 'e5');
  const afterRemote = buildChessView('player');
  assert.notEqual(JSON.stringify(afterRemote.pieces), before, 'второй человек сходил сам');
  assert.ok(afterRemote.pieces.some(p => p.side === 'npc' && p.kind === 'pawn' && p.x === 4 && p.y === 3));
  assert.equal(afterRemote.yourTurn, true);
  closeChessGame();
});

test('троекратное повторение позиции закрывает партию ничьёй', () => {
  closeChessGame();
  const table: Table = {
    state: makeGameState(),
    player: makeTestPlayer({ money: 100 }),
    npc: makeTestNpc({ id: 14, name: 'Табельщик', money: 100 }),
  };
  assert.equal(startChessGame(table, { remote: true, stake: 10 }), true);
  for (let round = 0; round < 2; round++) {
    seatMove(table, 'player', 'b1', 'c3');
    seatMove(table, 'npc', 'b8', 'c6');
    seatMove(table, 'player', 'c3', 'b1');
    seatMove(table, 'npc', 'c6', 'b8');
  }
  const view = buildChessView('player');
  assert.equal(view.winner, 'draw');
  assert.equal(view.phase, 'finished');
  assert.equal(table.player.money, 100, 'ничья не двигает ставку');
  assert.equal(table.npc.money, 100);
  closeChessGame();
});

test('против NPC машина отвечает на следующем такте', () => {
  closeChessGame();
  const table: Table = {
    state: makeGameState(),
    player: makeTestPlayer({ money: 100 }),
    npc: makeTestNpc({ id: 12, name: 'Инженер', money: 100 }),
  };
  assert.equal(startChessGame(table, { stake: 10 }), true);

  seatMove(table, 'player', 'e2', 'e4');
  assert.equal(buildChessView('player').yourTurn, false);

  const started = Date.now();
  press(table, {});
  const spent = Date.now() - started;
  const view = buildChessView('player');
  assert.equal(view.yourTurn, true, 'машина сходила и вернула ход');
  assert.equal(view.pieces.filter(p => p.side === 'npc').length, 16);
  assert.ok(spent < 5000, `ответ машины занял ${spent} мс`);
  closeChessGame();
});

test('выход из-за стола посреди партии отдаёт ставку оставшемуся', () => {
  closeChessGame();
  const table: Table = {
    state: makeGameState(),
    player: makeTestPlayer({ money: 100 }),
    npc: makeTestNpc({ id: 13, name: 'Вахтёр', money: 100 }),
  };
  assert.equal(startChessGame(table, { stake: 10 }), true);
  const result = press(table, { escEdge: true });
  assert.equal(result.closeInterface, true);
  assert.equal(table.player.money, 90);
  assert.equal(table.npc.money, 110);
  assert.equal(buildChessView('player').phase, 'finished');
  closeChessGame();
});
