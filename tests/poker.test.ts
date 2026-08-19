import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  closePokerGame,
  comparePokerHands,
  createPokerDeck,
  decidePokerAction,
  evaluatePokerHand,
  getPokerSnapshot,
  handlePokerInput,
  makePokerCard,
  pokerStakeFromNpc,
  startPokerGame,
  transferPokerStake,
  type PokerCard,
  type PokerRank,
  type PokerSnapshot,
  type PokerSuit,
} from '../src/systems/poker';
import { tabletopGame } from '../src/systems/tabletop';
import { getRecentEvents } from '../src/systems/events';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function c(suit: PokerSuit, rank: PokerRank): PokerCard {
  return makePokerCard(suit, rank);
}

function deckWith(front: readonly PokerCard[]): PokerCard[] {
  const used = new Set(front.map(card => card.id));
  return [...front, ...createPokerDeck().filter(card => !used.has(card.id))];
}

/** Вид чужого кресла достается через реестр — так же, как его берет кооп-слой. */
function seatView(seat: 'player' | 'npc'): PokerSnapshot {
  return tabletopGame('poker')?.view(seat) as PokerSnapshot;
}

function press(ctx: { state: ReturnType<typeof makeGameState>; player: ReturnType<typeof makeTestPlayer>; npc: ReturnType<typeof makeTestNpc> }, seat: 'player' | 'npc', input: Record<string, boolean>): void {
  handlePokerInput({ state: ctx.state, player: ctx.player, npc: ctx.npc, input, seat });
}

test('оценка семи карт узнает каждую комбинацию', () => {
  const royal = evaluatePokerHand([
    c('spades', 14), c('spades', 13), c('spades', 12), c('spades', 11), c('spades', 10), c('hearts', 2), c('clubs', 3),
  ]);
  assert.equal(royal.category, 8);
  assert.equal(royal.label, 'Флеш-рояль');

  const wheel = evaluatePokerHand([
    c('clubs', 14), c('clubs', 2), c('clubs', 3), c('clubs', 4), c('clubs', 5), c('hearts', 13), c('spades', 9),
  ]);
  assert.equal(wheel.category, 8);
  assert.equal(wheel.ranks[0], 5);

  assert.equal(evaluatePokerHand([
    c('spades', 9), c('hearts', 9), c('clubs', 9), c('diamonds', 9), c('spades', 4), c('hearts', 2), c('clubs', 7),
  ]).category, 7);
  assert.equal(evaluatePokerHand([
    c('spades', 6), c('hearts', 6), c('clubs', 6), c('diamonds', 11), c('spades', 11), c('hearts', 2), c('clubs', 4),
  ]).category, 6);
  assert.equal(evaluatePokerHand([
    c('hearts', 2), c('hearts', 5), c('hearts', 9), c('hearts', 12), c('hearts', 3), c('spades', 14), c('clubs', 13),
  ]).category, 5);
  assert.equal(evaluatePokerHand([
    c('hearts', 5), c('spades', 6), c('clubs', 7), c('diamonds', 8), c('hearts', 9), c('spades', 2), c('clubs', 13),
  ]).category, 4);
  assert.equal(evaluatePokerHand([
    c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 8), c('hearts', 12), c('spades', 2), c('clubs', 13),
  ]).category, 3);
  assert.equal(evaluatePokerHand([
    c('hearts', 5), c('spades', 5), c('clubs', 8), c('diamonds', 8), c('hearts', 12), c('spades', 2), c('clubs', 13),
  ]).category, 2);
  assert.equal(evaluatePokerHand([
    c('hearts', 5), c('spades', 5), c('clubs', 8), c('diamonds', 10), c('hearts', 12), c('spades', 2), c('clubs', 13),
  ]).category, 1);
  const high = evaluatePokerHand([
    c('hearts', 4), c('spades', 5), c('clubs', 8), c('diamonds', 10), c('hearts', 12), c('spades', 2), c('clubs', 14),
  ]);
  assert.equal(high.category, 0);
  assert.deepEqual(high.ranks, [14, 12, 10, 8, 5]);
});

test('сравнение рук идет по категории, потом по тайбрейкерам', () => {
  const acesUp = evaluatePokerHand([
    c('hearts', 14), c('spades', 14), c('clubs', 9), c('diamonds', 9), c('hearts', 12), c('spades', 2), c('clubs', 3),
  ]);
  const acesLow = evaluatePokerHand([
    c('hearts', 14), c('spades', 14), c('clubs', 9), c('diamonds', 9), c('hearts', 11), c('spades', 2), c('clubs', 3),
  ]);
  assert.ok(comparePokerHands(acesUp, acesLow) > 0);
  assert.equal(comparePokerHands(acesUp, acesUp), 0);

  const flush = evaluatePokerHand([
    c('hearts', 2), c('hearts', 5), c('hearts', 9), c('hearts', 12), c('hearts', 3), c('spades', 14), c('clubs', 14),
  ]);
  const trips = evaluatePokerHand([
    c('hearts', 5), c('spades', 5), c('clubs', 5), c('diamonds', 8), c('hearts', 12), c('spades', 2), c('clubs', 13),
  ]);
  assert.ok(comparePokerHands(flush, trips) > 0);
});

test('улицы идут по порядку: префлоп, флоп, терн, ривер, вскрытие', () => {
  closePokerGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 100 });
  const npc = makeTestNpc({ id: 7, name: 'Сосед с картами', money: 100 });
  const ctx = { state, player, npc };
  const deck = deckWith([
    c('spades', 14), c('clubs', 2),
    c('spades', 13), c('diamonds', 7),
    c('spades', 12), c('spades', 11), c('spades', 10),
    c('hearts', 3), c('diamonds', 4),
  ]);

  // Кооп-стол: обе стороны под ручным управлением, ИИ не вмешивается.
  assert.equal(startPokerGame(ctx, { deck, stake: 10, remote: true }), true);
  assert.equal(getPokerSnapshot().street, 'preflop');
  assert.equal(getPokerSnapshot().board.length, 0);
  assert.equal(getPokerSnapshot().potRubles, 20);

  press(ctx, 'player', { interactEdge: true });
  press(ctx, 'npc', { interactEdge: true });
  assert.equal(getPokerSnapshot().street, 'flop');
  assert.equal(getPokerSnapshot().board.length, 3);

  press(ctx, 'npc', { interactEdge: true });
  press(ctx, 'player', { interactEdge: true });
  assert.equal(getPokerSnapshot().street, 'turn');
  assert.equal(getPokerSnapshot().board.length, 4);

  press(ctx, 'npc', { interactEdge: true });
  press(ctx, 'player', { interactEdge: true });
  assert.equal(getPokerSnapshot().street, 'river');
  assert.equal(getPokerSnapshot().board.length, 5);

  press(ctx, 'npc', { interactEdge: true });
  press(ctx, 'player', { interactEdge: true });
  const final = getPokerSnapshot();
  assert.equal(final.street, 'showdown');
  assert.equal(final.finished, true);
  assert.equal(final.winner, 'player');
  assert.equal(player.money, 110);
  assert.equal(npc.money, 90);
  closePokerGame();
});

test('повышение растит банк, а колл его уравнивает', () => {
  closePokerGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 100 });
  const npc = makeTestNpc({ id: 8, name: 'Сосед с картами', money: 100 });
  const ctx = { state, player, npc };

  assert.equal(startPokerGame(ctx, { stake: 10, remote: true, rng: () => 0.5 }), true);
  assert.equal(getPokerSnapshot().potRubles, 20);
  // Курсор: 0 — пропуск, 1 — ставка, 2 — пас.
  press(ctx, 'player', { rightNav: true });
  press(ctx, 'player', { interactEdge: true });
  assert.equal(getPokerSnapshot().potRubles, 30);
  assert.equal(seatView('npc').toCall, 10);
  press(ctx, 'npc', { interactEdge: true });
  assert.equal(getPokerSnapshot().potRubles, 40);
  assert.equal(getPokerSnapshot().street, 'flop');
  closePokerGame();
});

test('пас отдает банк сопернику и публикует проигрыш', () => {
  closePokerGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 100 });
  const npc = makeTestNpc({ id: 9, name: 'Сосед с картами', money: 100 });

  assert.equal(startPokerGame({ state, player, npc }, { stake: 10, rng: () => 0.5 }), true);
  const result = handlePokerInput({ state, player, npc, input: { dropEdge: true } });
  assert.equal(result.handled, true);
  const snapshot = getPokerSnapshot();
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.winner, 'npc');
  assert.equal(player.money, 90);
  assert.equal(npc.money, 110);
  assert.equal(getRecentEvents(state, { type: 'gambling_loss', tags: ['poker'], limit: 1 })[0]?.itemValue, 10);
  closePokerGame();
});

test('анте — десятая часть кармана, а расчет не уводит плательщика в минус', () => {
  const state = makeGameState();
  const player = makeTestPlayer({ money: 3 });
  const npc = makeTestNpc({ money: 107 });

  assert.equal(pokerStakeFromNpc(npc), 10);
  assert.equal(transferPokerStake(state, player, npc, 'npc', 40), 3);
  assert.equal(player.money, 0);
  assert.equal(npc.money, 110);
  assert.equal(transferPokerStake(state, player, npc, 'player', 40), 40);
  assert.equal(player.money, 40);
  assert.equal(npc.money, 70);
  assert.equal(transferPokerStake(state, player, npc, 'draw', 40), 0);
  assert.equal(player.money, 40);
});

test('банк не превышает карман: короткий стек уходит в олл-ин без долга', () => {
  closePokerGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 12 });
  const npc = makeTestNpc({ id: 10, name: 'Сосед с картами', money: 100 });
  const ctx = { state, player, npc };

  assert.equal(startPokerGame(ctx, { stake: 10, remote: true }), true);
  press(ctx, 'player', { rightNav: true });
  press(ctx, 'player', { interactEdge: true });
  // Свободных денег у игрока осталось два рубля — ставка обрезается по ним.
  assert.equal(getPokerSnapshot().playerPaid, 12);
  assert.ok(player.money >= 0);
  closePokerGame();
});

test('за кооп-столом ИИ не ходит за кресло npc', () => {
  closePokerGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 100 });
  const npc = makeTestNpc({ id: 11, name: 'Второй игрок', money: 100 });
  const ctx = { state, player, npc };
  const deck = deckWith([
    c('spades', 14), c('clubs', 2),
    c('spades', 13), c('diamonds', 7),
    c('spades', 12), c('spades', 11), c('spades', 10),
    c('hearts', 3), c('diamonds', 4),
  ]);

  assert.equal(startPokerGame(ctx, { deck, stake: 10, remote: true }), true);
  press(ctx, 'player', { interactEdge: true });
  // Ход ушел ко второму человеку и там и остался: доска не сдана, банк не вырос.
  const mine = getPokerSnapshot();
  assert.equal(mine.yourTurn, false);
  assert.equal(mine.actions.length, 0);
  assert.equal(mine.street, 'preflop');
  assert.equal(mine.board.length, 0);
  assert.equal(mine.potRubles, 20);

  // Ввод из чужого кресла в чужой ход игнорируется, ИИ его не подменяет.
  press(ctx, 'player', { interactEdge: true });
  assert.equal(getPokerSnapshot().street, 'preflop');

  const other = seatView('npc');
  assert.equal(other.yourTurn, true);
  assert.deepEqual(other.playerHand.map(card => card.id), [c('clubs', 2).id, c('diamonds', 7).id]);
  assert.equal(other.npcHand.length, 0);
  assert.equal(other.npcHandCount, 2);
  assert.equal(other.npcName, 'Вы');
  closePokerGame();
});

test('против NPC соперник отвечает сразу, не заставляя кресло ждать', () => {
  closePokerGame();
  const state = makeGameState();
  const player = makeTestPlayer({ money: 100 });
  const npc = makeTestNpc({ id: 12, name: 'Сосед с картами', money: 100 });

  assert.equal(startPokerGame({ state, player, npc }, { stake: 10, rng: () => 0.5 }), true);
  handlePokerInput({ state, player, npc, input: { interactEdge: true } });
  const snapshot = getPokerSnapshot();
  assert.equal(snapshot.yourTurn, true);
  // Соперник либо уравнял и открыл флоп, либо поставил и ждет ответа.
  assert.ok(snapshot.board.length === 3 || snapshot.toCall > 0);
  closePokerGame();
});

test('решение ИИ считает шансы банка', () => {
  assert.equal(decidePokerAction({ strength: 0.9, toCall: 0, pot: 20, canRaise: true, bluffRoll: 0.9 }), 'bet');
  assert.equal(decidePokerAction({ strength: 0.2, toCall: 0, pot: 20, canRaise: true, bluffRoll: 0.9 }), 'check');
  assert.equal(decidePokerAction({ strength: 0.9, toCall: 10, pot: 20, canRaise: true, bluffRoll: 0.9 }), 'raise');
  assert.equal(decidePokerAction({ strength: 0.5, toCall: 10, pot: 200, canRaise: false, bluffRoll: 0.9 }), 'call');
  assert.equal(decidePokerAction({ strength: 0.05, toCall: 40, pot: 20, canRaise: false, bluffRoll: 0.9 }), 'fold');
  // Редкий блеф платит там, где расчет пасует.
  assert.notEqual(decidePokerAction({ strength: 0.05, toCall: 40, pot: 20, canRaise: false, bluffRoll: 0 }), 'fold');
});

test('покер зарегистрирован в реестре настольных игр', () => {
  const def = tabletopGame('poker');
  assert.ok(def);
  assert.equal(def?.title, 'ПОКЕР');
  assert.equal(def?.menuLabel, 'Играть в покер');
  assert.equal(def?.itemId, 'card_deck');
  assert.equal(def?.order, 34);
  assert.equal(def?.stake(makeTestNpc({ money: 250 })), 25);
});
