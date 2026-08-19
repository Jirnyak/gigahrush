import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  applyGoMove,
  buildGoView,
  chooseGoMove,
  closeGoGame,
  createGoBoard,
  GO_BLACK,
  GO_KOMI,
  GO_PASS,
  GO_WHITE,
  goIndex,
  goIsOwnEye,
  goLiberties,
  goScore,
  goStakeFromNpc,
  handleGoInput,
  startGoGame,
  transferGoStake,
} from '../src/systems/go';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function boardFrom(rows: readonly string[]): number[] {
  const board = createGoBoard();
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'B') board[goIndex(x, y)] = GO_BLACK;
      if (ch === 'W') board[goIndex(x, y)] = GO_WHITE;
    });
  });
  return board;
}

function stonesOn(board: readonly number[]): number {
  return board.filter(v => v !== 0).length;
}

function table(overrides: { playerMoney?: number; npcMoney?: number } = {}) {
  closeGoGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: overrides.playerMoney ?? 100 });
  const npc = makeTestNpc({ id: 7, name: 'Старик у окна', money: overrides.npcMoney ?? 100 });
  return { state, player, npc };
}

test('дамэ считаются по всей группе, а не по камню', () => {
  assert.equal(goLiberties(boardFrom(['B']), goIndex(0, 0)), 2);
  const center = createGoBoard();
  center[goIndex(4, 4)] = GO_BLACK;
  assert.equal(goLiberties(center, goIndex(4, 4)), 4);

  // Две связанные точки делят общее дыхание: 6 дамэ, а не 4+4.
  const pair = createGoBoard();
  pair[goIndex(4, 4)] = GO_BLACK;
  pair[goIndex(4, 5)] = GO_BLACK;
  assert.equal(goLiberties(pair, goIndex(4, 4)), 6);
  assert.equal(goLiberties(pair, goIndex(4, 5)), 6);

  const pressed = boardFrom(['WB', 'B.']);
  assert.equal(goLiberties(pressed, goIndex(0, 0)), 0);
});

test('группа без дамэ снимается с доски', () => {
  const board = boardFrom(['WB']);
  const result = applyGoMove(board, goIndex(0, 1), GO_BLACK);
  assert.ok(result);
  assert.equal(result.captured, 1);
  assert.equal(result.board[goIndex(0, 0)], 0);
  assert.equal(result.board[goIndex(0, 1)], GO_BLACK);
  // Исходная доска не трогается.
  assert.equal(board[goIndex(0, 0)], GO_WHITE);
});

test('снимается вся группа целиком', () => {
  const board = boardFrom([
    '.BB.',
    'BWWB',
    'B.WB',
    '.BB.',
  ]);
  const result = applyGoMove(board, goIndex(1, 2), GO_BLACK);
  assert.ok(result);
  assert.equal(result.captured, 3);
  // Восемь чёрных плюс поставленный, белых не осталось.
  assert.equal(stonesOn(result.board), 9);
});

test('самоубийство запрещено, но ход со взятием разрешён', () => {
  const suicide = boardFrom(['.B', 'B.']);
  assert.equal(applyGoMove(suicide, goIndex(0, 0), GO_WHITE), null);
  assert.equal(applyGoMove(suicide, goIndex(0, 0), GO_BLACK)?.captured, 0);

  // Тот же безнадёжный пункт становится законным, когда ход что-то снимает.
  const takes = boardFrom(['.BW', 'BW.', 'W..']);
  const result = applyGoMove(takes, goIndex(0, 0), GO_WHITE);
  assert.ok(result);
  assert.equal(result.captured, 2);
});

test('ко: немедленный возврат позиции запрещён', () => {
  const board = boardFrom([
    '.BW.',
    'B.BW',
    '.BW.',
  ]);
  const taken = applyGoMove(board, goIndex(1, 1), GO_WHITE);
  assert.ok(taken);
  assert.equal(taken.captured, 1);
  assert.equal(taken.koIndex, goIndex(2, 1));

  assert.equal(applyGoMove(taken.board, goIndex(2, 1), GO_BLACK, taken.koIndex), null);
  // Без запрета ко этот же ход законен — значит блокирует именно ко, а не форма.
  const retake = applyGoMove(taken.board, goIndex(2, 1), GO_BLACK, GO_PASS);
  assert.ok(retake);
  assert.equal(retake.captured, 1);

  // Обычное взятие группы из двух камней ко не создаёт.
  const plain = applyGoMove(boardFrom(['WW.', 'BB.']), goIndex(2, 0), GO_BLACK);
  assert.ok(plain);
  assert.equal(plain.captured, 2);
  assert.equal(plain.koIndex, GO_PASS);
});

test('китайский счёт: камни, территория и коми белым', () => {
  const board = createGoBoard();
  for (let y = 0; y < 9; y++) {
    board[goIndex(3, y)] = GO_BLACK;
    board[goIndex(5, y)] = GO_WHITE;
  }
  const score = goScore(board);
  assert.equal(score.blackTerritory, 27);
  assert.equal(score.whiteTerritory, 27);
  assert.equal(score.black, 36);
  assert.equal(score.white, 36 + GO_KOMI);
  // Без коми та же позиция была бы ничьей — коми её и разводит.
  assert.equal(goScore(board, 0).white, goScore(board, 0).black);
  // Спорная область не достаётся никому.
  assert.equal(goScore(boardFrom(['BW'])).blackTerritory, 0);
});

test('пустая доска считается как 0 против коми', () => {
  const score = goScore(createGoBoard());
  assert.equal(score.black, 0);
  assert.equal(score.white, GO_KOMI);
});

test('бот берёт группу в атари и не забивает собственный глаз', () => {
  const atari = boardFrom(['BW']);
  assert.equal(chooseGoMove(atari, GO_WHITE, GO_PASS, false), goIndex(0, 1));

  const eye = boardFrom([
    '..WWW',
    '..W.W',
    '..WWW',
  ]);
  assert.equal(goIsOwnEye(eye, goIndex(3, 1), GO_WHITE), true);
  assert.notEqual(chooseGoMove(eye, GO_WHITE, GO_PASS, false), goIndex(3, 1));
});

test('бот выбирает только законные ходы и уважает ко', () => {
  const board = boardFrom([
    '.BW.',
    'B.BW',
    '.BW.',
  ]);
  const taken = applyGoMove(board, goIndex(1, 1), GO_WHITE);
  assert.ok(taken);
  const move = chooseGoMove(taken.board, GO_BLACK, taken.koIndex, false);
  assert.notEqual(move, taken.koIndex);
  assert.ok(move === GO_PASS || applyGoMove(taken.board, move, GO_BLACK, taken.koIndex) !== null);
});

test('партия против NPC: ход игрока, затем ход бота', () => {
  const { state, player, npc } = table();
  assert.equal(startGoGame({ state, player, npc }), true);

  handleGoInput({ state, player, npc, input: { interactEdge: true } });
  let view = buildGoView('player');
  assert.equal(stonesOn(view.board), 1);
  assert.equal(view.board[goIndex(4, 4)], GO_BLACK);
  assert.equal(view.yourTurn, false);

  handleGoInput({ state, player, npc, input: {} });
  view = buildGoView('player');
  assert.equal(stonesOn(view.board), 2);
  assert.equal(view.yourTurn, true);
  assert.equal(view.yourStone, GO_BLACK);
  closeGoGame();
});

test('занятый пункт и ко отклоняются без потери хода', () => {
  const { state, player, npc } = table();
  startGoGame({ state, player, npc }, { remote: true });
  handleGoInput({ state, player, npc, input: { interactEdge: true }, seat: 'player' });
  // Второе кресло целится в тот же пункт: ход не проходит, очередь не уходит.
  handleGoInput({ state, player, npc, input: { interactEdge: true }, seat: 'npc' });
  const view = buildGoView('npc');
  assert.equal(stonesOn(view.board), 1);
  assert.equal(view.yourTurn, true);
  assert.match(view.message, /занят/i);
  closeGoGame();
});

test('два паса подряд заканчивают партию и делят ставку по счёту', () => {
  const { state, player, npc } = table({ playerMoney: 100, npcMoney: 100 });
  const stake = goStakeFromNpc(npc);
  assert.equal(stake, 10);
  startGoGame({ state, player, npc }, { remote: true, stake });

  handleGoInput({ state, player, npc, input: { dropEdge: true }, seat: 'player' });
  assert.equal(buildGoView('player').passes, 1);
  assert.equal(buildGoView('npc').yourTurn, true);

  handleGoInput({ state, player, npc, input: { dropEdge: true }, seat: 'npc' });
  const view = buildGoView('player');
  assert.equal(view.phase, 'finished');
  // Пустая доска: 0 против коми 6.5, забирают белые.
  assert.equal(view.winner, 'npc');
  assert.equal(buildGoView('npc').winner, 'player');
  assert.equal(player.money, 90);
  assert.equal(npc.money, 110);
  closeGoGame();
});

test('в кооперативе бот не ходит за кресло npc', () => {
  const { state, player, npc } = table();
  startGoGame({ state, player, npc }, { remote: true });
  handleGoInput({ state, player, npc, input: { interactEdge: true }, seat: 'player' });
  assert.equal(buildGoView('player').yourTurn, false);

  // Сколько бы кадров ни прошло, доска ждёт второго человека.
  for (let i = 0; i < 8; i++) {
    handleGoInput({ state, player, npc, input: {}, seat: 'player' });
    handleGoInput({ state, player, npc, input: {} });
  }
  const waiting = buildGoView('npc');
  assert.equal(stonesOn(waiting.board), 1);
  assert.equal(waiting.yourTurn, true);
  assert.equal(waiting.yourStone, GO_WHITE);

  // Ходит второе кресло — камень белый.
  handleGoInput({ state, player, npc, input: { rightNav: true, interactEdge: true }, seat: 'npc' });
  const after = buildGoView('npc');
  assert.equal(stonesOn(after.board), 2);
  assert.equal(after.board[goIndex(5, 4)], GO_WHITE);
  assert.equal(after.yourTurn, false);
  closeGoGame();
});

test('у кресел раздельные курсоры', () => {
  const { state, player, npc } = table();
  startGoGame({ state, player, npc }, { remote: true });
  handleGoInput({ state, player, npc, input: { leftNav: true }, seat: 'player' });
  assert.equal(buildGoView('player').cursorX, 3);
  assert.equal(buildGoView('npc').cursorX, 4);
  closeGoGame();
});

test('выход из-за доски отдаёт ставку оставшемуся', () => {
  const { state, player, npc } = table();
  startGoGame({ state, player, npc }, { stake: 10 });
  const result = handleGoInput({ state, player, npc, input: { escEdge: true } });
  assert.equal(result.closeInterface, true);
  assert.equal(buildGoView('player').winner, 'npc');
  assert.equal(player.money, 90);
  closeGoGame();
});

test('ставка не может уйти дальше кошелька платящего', () => {
  const state = makeGameState();
  const player = makeTestPlayer({ money: 3 });
  const npc = makeTestNpc({ id: 8, money: 500 });
  assert.equal(transferGoStake(state, player, npc, 'npc', 40), 3);
  assert.equal(player.money, 0);
  assert.equal(npc.money, 503);
  assert.equal(transferGoStake(state, player, npc, '', 40), 0);
});

test('партия против бота доигрывается до счёта за разумное число ходов', () => {
  const { state, player, npc } = table();
  startGoGame({ state, player, npc });
  // Игрок пасует каждый ход, бот сам должен довести партию до конца.
  for (let i = 0; i < 600 && buildGoView('player').phase !== 'finished'; i++) {
    const view = buildGoView('player');
    handleGoInput({ state, player, npc, input: view.yourTurn ? { dropEdge: true } : {} });
  }
  const view = buildGoView('player');
  assert.equal(view.phase, 'finished');
  assert.equal(view.winner, 'npc');
  closeGoGame();
});
