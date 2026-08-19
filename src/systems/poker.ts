/* ── Покер: техасский холдем один на один ────────────────────────────────────
 *
 * Отличие от остальных столов: банк здесь не фиксирован. Анте приходит извне
 * (`options.stake`), а дальше банк растет только внутри модуля — ставками и
 * повышениями. Деньги при этом никуда не уходят до расчета: у сторон копится
 * взнос (`paid`), и в конце проигравший отдает ровно свой взнос, обрезанный по
 * реальному карману. Поэтому кредита не возникает даже при рассинхроне.
 */

import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { mathRng as rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';

export type PokerSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type PokerRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type PokerSide = 'player' | 'npc';
export type PokerWinner = PokerSide | 'draw' | '';
export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type PokerActionId = 'check' | 'call' | 'bet' | 'raise' | 'fold';

export interface PokerCard {
  id: number;
  suit: PokerSuit;
  rank: PokerRank;
}

/** Оценка руки: категория плюс список тайбрейкеров от старшего к младшему.
 *  Сравнивать только через `comparePokerHands` — внутри лексикографика. */
export interface PokerHandValue {
  category: number;
  ranks: number[];
  label: string;
}

export interface PokerActionOption {
  id: PokerActionId;
  label: string;
  amount: number;
}

export interface PokerSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  /** Анте: с него начинается банк и им же меряется шаг ставки. */
  stakeRubles: number;
  potRubles: number;
  toCall: number;
  street: PokerStreet;
  streetLabel: string;
  board: readonly PokerCard[];
  playerHand: readonly PokerCard[];
  /** Пусто, пока карты соперника закрыты. */
  npcHand: readonly PokerCard[];
  npcHandCount: number;
  playerPaid: number;
  npcPaid: number;
  handLabel: string;
  actions: readonly PokerActionOption[];
  selectedIndex: number;
  /** False только за кооп-столом, пока думает второй человек. */
  yourTurn: boolean;
  finished: boolean;
  winner: PokerWinner;
  message: string;
  log: readonly string[];
}

export interface PokerInput {
  leftNav?: boolean;
  rightNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface PokerInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface PokerGame {
  open: boolean;
  npcId: number;
  npcName: string;
  /** Имя кресла 'player' — нужно, чтобы зеркалить стол второму человеку. */
  playerName: string;
  anteRubles: number;
  deck: PokerCard[];
  board: PokerCard[];
  hole: Record<PokerSide, PokerCard[]>;
  /** Взнос за всю раздачу и взнос за текущую улицу. */
  paid: Record<PokerSide, number>;
  streetPaid: Record<PokerSide, number>;
  acted: Record<PokerSide, boolean>;
  /** Потолок взноса: реальные деньги на момент раздачи. */
  bankroll: Record<PokerSide, number>;
  cursor: Record<PokerSide, number>;
  street: PokerStreet;
  toAct: PokerSide;
  raises: number;
  reveal: boolean;
  finished: boolean;
  /** Кооп-стол: в кресле 'npc' сидит человек, ИИ за него не ходит. */
  remote: boolean;
  rand: () => number;
  winner: PokerWinner;
  settled: boolean;
  message: string;
  log: string[];
}

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
const RANK_LABELS: Record<PokerRank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const SUIT_LABELS: Record<PokerSuit, string> = {
  clubs: 'C',
  diamonds: 'D',
  hearts: 'H',
  spades: 'S',
};
const STREET_LABELS: Record<PokerStreet, string> = {
  preflop: 'ПРЕФЛОП',
  flop: 'ФЛОП',
  turn: 'ТЕРН',
  river: 'РИВЕР',
  showdown: 'ВСКРЫТИЕ',
};
const CATEGORY_LABELS = [
  'Старшая карта',
  'Пара',
  'Две пары',
  'Тройка',
  'Стрит',
  'Флеш',
  'Фулл-хаус',
  'Каре',
  'Стрит-флеш',
];

/** Потолок повышений на улицу: банк обязан быть конечным, а цикл ИИ — сходиться. */
const MAX_RAISES_PER_STREET = 3;
const BLUFF_CHANCE = 0.08;

let game: PokerGame | null = null;

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

function otherSide(side: PokerSide): PokerSide {
  return side === 'player' ? 'npc' : 'player';
}

/** Голос лога. Против NPC его читает один человек, поэтому свое кресло — «вы».
 *  За кооп-столом лог читают оба, поэтому названы все. */
function sideName(g: PokerGame, side: PokerSide, capitalized = false): string {
  if (side === 'npc') return g.npcName;
  if (g.remote) return g.playerName;
  return capitalized ? 'Вы' : 'вы';
}

function appendLog(g: PokerGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

export function makePokerCard(suit: PokerSuit, rank: PokerRank): PokerCard {
  return { id: SUITS.indexOf(suit) * RANKS.length + (rank - 2), suit, rank };
}

export function createPokerDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makePokerCard(suit, rank));
  }
  return deck;
}

export function shufflePokerDeck(deck: readonly PokerCard[], rand = rng): PokerCard[] {
  const out = deck.map(card => ({ ...card }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(rand() * (i + 1))));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function formatPokerCard(card: PokerCard): string {
  return `${RANK_LABELS[card.rank]}${SUIT_LABELS[card.suit]}`;
}

export function formatPokerStreet(street: PokerStreet): string {
  return STREET_LABELS[street];
}

export function pokerStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

/* ── Оценка руки ─────────────────────────────────────────────────────────── */

function handValue(category: number, ranks: number[]): PokerHandValue {
  const royal = category === 8 && ranks[0] === 14;
  return { category, ranks, label: royal ? 'Флеш-рояль' : CATEGORY_LABELS[category] ?? '' };
}

/** Старшая карта стрита или 0. Туз играет и снизу: A-2-3-4-5 — тоже стрит. */
function straightHigh(ranks: readonly number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  const uniq = [...set].sort((a, b) => b - a);
  let run = 1;
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] !== uniq[i - 1] - 1) { run = 1; continue; }
    run++;
    if (run >= 5) return uniq[i] + 4;
  }
  return 0;
}

function kickers(ranks: readonly number[], used: readonly number[], count: number): number[] {
  return ranks.filter(rank => !used.includes(rank)).slice(0, count);
}

/** Лучшая пятерка из семи карт (работает и на меньшем наборе — нужно префлопу). */
export function evaluatePokerHand(cards: readonly PokerCard[]): PokerHandValue {
  const rankCounts = new Map<number, number>();
  const bySuit = new Map<PokerSuit, number[]>();
  for (const card of cards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
    const list = bySuit.get(card.suit) ?? [];
    list.push(card.rank);
    bySuit.set(card.suit, list);
  }
  const allRanks = [...rankCounts.keys()].sort((a, b) => b - a);
  let flush: number[] | null = null;
  for (const list of bySuit.values()) {
    if (list.length >= 5) flush = list.slice().sort((a, b) => b - a);
  }
  if (flush) {
    const sf = straightHigh(flush);
    if (sf) return handValue(8, [sf]);
  }
  // Группы по убыванию размера, внутри размера — по старшинству.
  const groups = [...rankCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [topRank, topCount] = groups[0] ?? [0, 0];
  const second = groups[1];
  if (topCount === 4) return handValue(7, [topRank, ...kickers(allRanks, [topRank], 1)]);
  if (topCount === 3 && second && second[1] >= 2) return handValue(6, [topRank, second[0]]);
  if (flush) return handValue(5, flush.slice(0, 5));
  const straight = straightHigh(allRanks);
  if (straight) return handValue(4, [straight]);
  if (topCount === 3) return handValue(3, [topRank, ...kickers(allRanks, [topRank], 2)]);
  if (topCount === 2 && second && second[1] === 2) {
    return handValue(2, [topRank, second[0], ...kickers(allRanks, [topRank, second[0]], 1)]);
  }
  if (topCount === 2) return handValue(1, [topRank, ...kickers(allRanks, [topRank], 3)]);
  return handValue(0, allRanks.slice(0, 5));
}

export function comparePokerHands(a: PokerHandValue, b: PokerHandValue): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.ranks[i] ?? 0) - (b.ranks[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/* ── Деньги и ставки ─────────────────────────────────────────────────────── */

function potOf(g: PokerGame): number {
  return g.paid.player + g.paid.npc;
}

function roomOf(g: PokerGame, side: PokerSide): number {
  return Math.max(0, g.bankroll[side] - g.paid[side]);
}

/** Ставки живут, пока обе стороны могут доложить: сторона в олл-ине их закрывает. */
function bettingAllowed(g: PokerGame): boolean {
  return roomOf(g, 'player') > 0 && roomOf(g, 'npc') > 0;
}

function toCallOf(g: PokerGame, side: PokerSide): number {
  const diff = g.streetPaid[otherSide(side)] - g.streetPaid[side];
  return Math.max(0, Math.min(diff, roomOf(g, side)));
}

function raiseCostOf(g: PokerGame, side: PokerSide): number {
  if (g.raises >= MAX_RAISES_PER_STREET || !bettingAllowed(g)) return 0;
  const call = toCallOf(g, side);
  const cost = Math.min(call + g.anteRubles, roomOf(g, side));
  return cost > call ? cost : 0;
}

function pay(g: PokerGame, side: PokerSide, amount: number): number {
  const moved = Math.max(0, Math.min(Math.floor(amount), roomOf(g, side)));
  g.paid[side] += moved;
  g.streetPaid[side] += moved;
  return moved;
}

function pokerActionOptions(g: PokerGame, side: PokerSide): PokerActionOption[] {
  if (g.finished) return [];
  const call = toCallOf(g, side);
  const out: PokerActionOption[] = [];
  if (call <= 0) out.push({ id: 'check', label: 'ПРОПУСК', amount: 0 });
  else out.push({ id: 'call', label: `УРАВНЯТЬ ${call}Р`, amount: call });
  const raise = raiseCostOf(g, side);
  if (raise > 0) {
    out.push(call <= 0
      ? { id: 'bet', label: `СТАВКА ${raise}Р`, amount: raise }
      : { id: 'raise', label: `ПОВЫСИТЬ ${raise}Р`, amount: raise });
  }
  out.push({ id: 'fold', label: 'ПАС', amount: 0 });
  return out;
}

/* ── Ход раздачи ─────────────────────────────────────────────────────────── */

function nextStreet(street: PokerStreet): PokerStreet {
  if (street === 'preflop') return 'flop';
  if (street === 'flop') return 'turn';
  if (street === 'turn') return 'river';
  return 'showdown';
}

function dealBoard(g: PokerGame, count: number): void {
  for (let i = 0; i < count; i++) {
    const card = g.deck.shift();
    if (card) g.board.push(card);
  }
}

function roundClosed(g: PokerGame): boolean {
  if (!g.acted.player || !g.acted.npc) return false;
  return g.streetPaid.player === g.streetPaid.npc || !bettingAllowed(g);
}

/** Недостающий колл делает часть ставки неоплаченной — она возвращается автору. */
function refundUncalled(g: PokerGame): void {
  const diff = g.streetPaid.player - g.streetPaid.npc;
  const side: PokerSide = diff > 0 ? 'player' : 'npc';
  const excess = Math.abs(diff);
  if (excess <= 0) return;
  g.paid[side] -= excess;
  g.streetPaid[side] -= excess;
}

function showdown(g: PokerGame, state: GameState, player: Entity, npc: Entity): void {
  g.street = 'showdown';
  g.reveal = true;
  const playerValue = evaluatePokerHand([...g.hole.player, ...g.board]);
  const npcValue = evaluatePokerHand([...g.hole.npc, ...g.board]);
  const cmp = comparePokerHands(playerValue, npcValue);
  g.winner = cmp > 0 ? 'player' : cmp < 0 ? 'npc' : 'draw';
  appendLog(g, `Вскрытие: ${sideName(g, 'player', true)} — ${playerValue.label}, ${g.npcName} — ${npcValue.label}.`);
  settlePokerGame(g, state, player, npc);
}

function closeStreet(g: PokerGame, state: GameState, player: Entity, npc: Entity): void {
  refundUncalled(g);
  if (g.street === 'river') {
    showdown(g, state, player, npc);
    return;
  }
  const street = nextStreet(g.street);
  g.street = street;
  dealBoard(g, street === 'flop' ? 3 : 1);
  g.streetPaid = { player: 0, npc: 0 };
  g.acted = { player: false, npc: false };
  g.raises = 0;
  // Кнопка у кресла 'player': до флопа оно ходит первым, после флопа — последним.
  g.toAct = 'npc';
  appendLog(g, `${STREET_LABELS[street]}: ${g.board.map(formatPokerCard).join(' ')}. Банк ${potOf(g)}Р.`);
  // Кто-то в олл-ине — торговли больше нет, доска просто дораздается до вскрытия.
  if (!bettingAllowed(g)) closeStreet(g, state, player, npc);
}

function actionLine(g: PokerGame, side: PokerSide, action: PokerActionId, amount: number): string {
  const you = side === 'player' && !g.remote;
  const name = sideName(g, side, true);
  const pot = potOf(g);
  if (action === 'check') return `${name} ${you ? 'пропускаете' : 'пропускает'} без ставки.`;
  if (action === 'call') return `${name} ${you ? 'уравниваете' : 'уравнивает'} ${amount}Р. Банк ${pot}Р.`;
  if (action === 'bet') return `${name} ${you ? 'ставите' : 'ставит'} ${amount}Р. Банк ${pot}Р.`;
  if (action === 'raise') return `${name} ${you ? 'повышаете' : 'повышает'} на ${amount}Р. Банк ${pot}Р.`;
  return `${name} ${you ? 'пасуете' : 'пасует'}. Банк ${pot}Р уходит сопернику.`;
}

function applyPokerAction(
  g: PokerGame, side: PokerSide, action: PokerActionId,
  state: GameState, player: Entity, npc: Entity,
): boolean {
  if (g.finished || g.toAct !== side) return false;
  if (action === 'fold') {
    g.winner = otherSide(side);
    appendLog(g, actionLine(g, side, 'fold', 0));
    settlePokerGame(g, state, player, npc);
    return true;
  }
  const option = pokerActionOptions(g, side).find(entry => entry.id === action);
  if (!option) return false;
  const moved = option.amount > 0 ? pay(g, side, option.amount) : 0;
  appendLog(g, actionLine(g, side, action, moved));
  g.acted[side] = true;
  if (action === 'bet' || action === 'raise') {
    g.acted[otherSide(side)] = false;
    g.raises++;
  }
  if (roundClosed(g)) closeStreet(g, state, player, npc);
  else g.toAct = otherSide(side);
  return true;
}

/* ── ИИ соперника ────────────────────────────────────────────────────────── */

/** Префлоп судится по двум картам: старшинство, пара, масть, связка. */
export function preflopStrength(hole: readonly PokerCard[]): number {
  const ranks = hole.map(card => card.rank).sort((a, b) => b - a);
  const high = ranks[0] ?? 2;
  const low = ranks[1] ?? 2;
  let strength = (high - 2) / 12 * 0.45 + (low - 2) / 12 * 0.25;
  if (high === low) strength += 0.35;
  else {
    if (hole[0] && hole[1] && hole[0].suit === hole[1].suit) strength += 0.07;
    if (high - low <= 2) strength += 0.05;
  }
  return Math.max(0, Math.min(1, strength));
}

/** Готовая комбинация: категория задает полку, старшая карта чуть двигает. */
export function madeHandStrength(value: PokerHandValue): number {
  const base = [0.10, 0.28, 0.46, 0.60, 0.72, 0.80, 0.88, 0.95, 0.99][value.category] ?? 0.1;
  return Math.max(0, Math.min(1, base + ((value.ranks[0] ?? 2) - 2) / 12 * 0.06));
}

/** Решение отделено от стола, чтобы его можно было проверить числами. */
export function decidePokerAction(input: {
  strength: number;
  toCall: number;
  pot: number;
  canRaise: boolean;
  bluffRoll: number;
}): PokerActionId {
  const { strength, toCall, pot, canRaise } = input;
  const bluff = input.bluffRoll < BLUFF_CHANCE;
  if (toCall <= 0) {
    if (canRaise && (strength > 0.62 || bluff)) return 'bet';
    return 'check';
  }
  // Шансы банка: доля, которую колл занимает в банке после него.
  const odds = toCall / Math.max(1, pot + toCall);
  if (canRaise && strength > 0.72 && strength >= odds + 0.30) return 'raise';
  if (canRaise && bluff && strength < 0.35) return 'raise';
  if (strength >= odds + 0.05 || bluff) return 'call';
  return 'fold';
}

function seatStrength(g: PokerGame, side: PokerSide): number {
  const hole = g.hole[side];
  if (g.board.length === 0) return preflopStrength(hole);
  return madeHandStrength(evaluatePokerHand([...hole, ...g.board]));
}

function advancePokerNpc(g: PokerGame, state: GameState, player: Entity, npc: Entity): void {
  // Кооп-стол: в кресле 'npc' человек, ИИ за него не ходит — стол просто ждет.
  if (g.remote) return;
  for (let guard = 0; guard < 32 && !g.finished && g.toAct === 'npc'; guard++) {
    const action = decidePokerAction({
      strength: seatStrength(g, 'npc'),
      toCall: toCallOf(g, 'npc'),
      pot: potOf(g),
      canRaise: raiseCostOf(g, 'npc') > 0,
      bluffRoll: g.rand(),
    });
    if (!applyPokerAction(g, 'npc', action, state, player, npc)) return;
  }
}

/* ── Расчет ──────────────────────────────────────────────────────────────── */

function publishPokerSettlementEvent(state: GameState, player: Entity, npc: Entity, winner: PokerWinner, amount: number, stake: number): void {
  if (winner !== 'player' && winner !== 'npc') return;
  const playerWin = winner === 'player';
  publishEvent(state, {
    type: playerWin ? 'gambling_win' : 'gambling_loss',
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name,
    actorFaction: player.faction,
    targetId: npc.id,
    targetName: npc.name,
    targetFaction: npc.faction,
    itemValue: amount,
    severity: playerWin ? 2 : 1,
    privacy: 'local',
    tags: ['gambling', 'poker', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

/** Переводит банк победителю. `amount` — взнос проигравшего: он и есть выигрыш,
 *  свои деньги никто не «выигрывает». Обрезается по реальному карману плательщика,
 *  чтобы стол не мог увести в минус. */
export function transferPokerStake(state: GameState, player: Entity, npc: Entity, winner: PokerWinner, amount: number): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const moved = Math.min(Math.max(0, Math.floor(amount)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - moved;
  receiver.money = cleanMoney(receiver) + moved;
  publishPokerSettlementEvent(state, player, npc, winner, moved, Math.max(0, Math.floor(amount)));
  return moved;
}

function settlePokerGame(g: PokerGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || !g.winner) return;
  g.settled = true;
  g.finished = true;
  g.reveal = true;
  if (g.winner === 'draw') {
    appendLog(g, 'Равные руки. Банк расходится по карманам.');
    state.msgs.push(msg('Покер: ничья, деньги не переходят.', state.time, '#8cf'));
    return;
  }
  const amount = transferPokerStake(state, player, npc, g.winner, g.paid[otherSide(g.winner)]);
  const line = g.remote
    ? `Покер: ${sideName(g, g.winner, true)} забрал ${amount}Р.`
    : g.winner === 'player'
      ? `Покер: вы выиграли ${amount}Р.`
      : `Покер: вы проиграли ${amount}Р.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

/* ── Стол ────────────────────────────────────────────────────────────────── */

export function startPokerGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { rng?: () => number; deck?: readonly PokerCard[]; stake?: number; remote?: boolean } = {},
): boolean {
  const ante = options.stake ?? pokerStakeFromNpc(ctx.npc);
  if (ante <= 0 || cleanMoney(ctx.player) < ante || cleanMoney(ctx.npc) < ante) return false;
  const rand = options.rng ?? rng;
  const deck = options.deck ? options.deck.map(card => ({ ...card })) : shufflePokerDeck(createPokerDeck(), rand);
  if (deck.length < 9) return false;
  // Порядок сдачи: игрок, соперник, игрок, соперник, затем флоп, терн, ривер.
  const hole: Record<PokerSide, PokerCard[]> = { player: [], npc: [] };
  for (let i = 0; i < 2; i++) {
    const playerCard = deck.shift();
    const npcCard = deck.shift();
    if (playerCard) hole.player.push(playerCard);
    if (npcCard) hole.npc.push(npcCard);
  }
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    playerName: ctx.player.name ?? 'Игрок',
    anteRubles: ante,
    deck,
    board: [],
    hole,
    paid: { player: ante, npc: ante },
    streetPaid: { player: ante, npc: ante },
    acted: { player: false, npc: false },
    bankroll: { player: cleanMoney(ctx.player), npc: cleanMoney(ctx.npc) },
    cursor: { player: 0, npc: 0 },
    street: 'preflop',
    toAct: 'player',
    raises: 0,
    reveal: false,
    finished: false,
    remote: options.remote === true,
    rand,
    winner: '',
    settled: false,
    message: '',
    log: [],
  };
  appendLog(game, `Анте ${ante}Р с каждого. Банк ${ante * 2}Р. Ваши карты: ${hole.player.map(formatPokerCard).join(' ')}.`);
  publishEvent(ctx.state, {
    type: 'gambling_bet',
    x: ctx.player.x,
    y: ctx.player.y,
    actorId: ctx.player.id,
    actorName: ctx.player.name,
    actorFaction: ctx.player.faction,
    targetId: ctx.npc.id,
    targetName: ctx.npc.name,
    targetFaction: ctx.npc.faction,
    itemValue: ante,
    severity: 1,
    privacy: 'local',
    tags: ['gambling', 'poker', 'bet'],
    data: { stake: ante, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  return true;
}

export function closePokerGame(): void {
  game = null;
}

/** Стол, который ведет хост: своей раздачи у нас нет, только присланный вид. */
let remoteView: PokerSnapshot | null = null;

export function setPokerRemoteView(view: unknown): void {
  remoteView = (view as PokerSnapshot | null) ?? null;
}

export function isPokerGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getPokerSnapshot(): PokerSnapshot {
  return remoteView ?? buildPokerView('player');
}

function emptyPokerView(): PokerSnapshot {
  return {
    open: false,
    npcId: -1,
    npcName: '',
    stakeRubles: 0,
    potRubles: 0,
    toCall: 0,
    street: 'preflop',
    streetLabel: STREET_LABELS.preflop,
    board: [],
    playerHand: [],
    npcHand: [],
    npcHandCount: 0,
    playerPaid: 0,
    npcPaid: 0,
    handLabel: '',
    actions: [],
    selectedIndex: 0,
    yourTurn: false,
    finished: false,
    winner: '',
    message: '',
    log: [],
  };
}

function mirrorWinner(winner: PokerWinner): PokerWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

function clampCursor(g: PokerGame, side: PokerSide, count: number): number {
  const index = Math.max(0, Math.min(Math.max(0, count - 1), g.cursor[side]));
  g.cursor[side] = index;
  return index;
}

/** Стол глазами кресла `seat`: свои карманные карты открыты, чужие — только на
 *  вскрытии. Для 'player' это исходный вид, 'npc' — тот же стол зеркально. */
function buildPokerView(seat: PokerSide): PokerSnapshot {
  const g = game;
  if (!g) return emptyPokerView();
  const foe = otherSide(seat);
  const options = pokerActionOptions(g, seat);
  const selectedIndex = clampCursor(g, seat, options.length);
  // Против NPC соперник отвечает inline, поэтому кресло никогда не ждет.
  const acts = !g.finished && (!g.remote || g.toAct === seat);
  const own = g.hole[seat];
  const handLabel = own.length > 0 ? evaluatePokerHand([...own, ...g.board]).label : '';
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: seat === 'npc' ? g.playerName : g.npcName,
    stakeRubles: g.anteRubles,
    potRubles: potOf(g),
    toCall: toCallOf(g, seat),
    street: g.street,
    streetLabel: STREET_LABELS[g.street],
    board: [...g.board],
    playerHand: [...own],
    npcHand: g.reveal ? [...g.hole[foe]] : [],
    npcHandCount: g.hole[foe].length,
    playerPaid: g.paid[seat],
    npcPaid: g.paid[foe],
    handLabel,
    actions: acts ? options : [],
    selectedIndex,
    yourTurn: acts,
    finished: g.finished,
    winner: seat === 'npc' ? mirrorWinner(g.winner) : g.winner,
    message: g.message,
    log: [...g.log],
  };
}

/** `seat` — кресло, из которого пришел ввод. Против NPC это всегда 'player'. */
export function handlePokerInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: PokerInput; seat?: PokerSide;
}): PokerInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  const options = pokerActionOptions(g, seat);
  if (ctx.input.leftNav) {
    g.cursor[seat] = Math.max(0, clampCursor(g, seat, options.length) - 1);
    return { handled: true };
  }
  if (ctx.input.rightNav) {
    g.cursor[seat] = Math.min(Math.max(0, options.length - 1), clampCursor(g, seat, options.length) + 1);
    return { handled: true };
  }
  if (g.finished) {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Уйти из-за стола — тот же пас: банк достается тому, кто остался.
    forfeitPoker({ state: ctx.state, player: ctx.player, npc: ctx.npc, quitter: seat });
    return { handled: true, closeInterface: true };
  }
  // Кооп-стол ждет своей очереди; стол против NPC ждать не заставляет.
  if (g.remote && g.toAct !== seat) return { handled: true };
  if (ctx.input.dropEdge) {
    applyPokerAction(g, seat, 'fold', ctx.state, ctx.player, ctx.npc);
    return { handled: true };
  }
  if (ctx.input.interactEdge) {
    const option = options[clampCursor(g, seat, options.length)];
    if (!option) return { handled: true };
    if (!applyPokerAction(g, seat, option.id, ctx.state, ctx.player, ctx.npc)) {
      appendLog(g, 'Так сейчас нельзя.');
      return { handled: true };
    }
    advancePokerNpc(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true };
  }
  return { handled: true };
}

/** Уход из-за стола посреди раздачи — сдача: банк достается оставшемуся. */
function forfeitPoker(ctx: { state: GameState; player: Entity; npc: Entity; quitter: PokerSide }): void {
  const g = game;
  if (!g || g.finished) return;
  g.winner = otherSide(ctx.quitter);
  appendLog(g, actionLine(g, ctx.quitter, 'fold', 0));
  settlePokerGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'poker',
  title: 'ПОКЕР',
  menuLabel: 'Играть в покер',
  itemId: 'card_deck',
  order: 34,
  stake: pokerStakeFromNpc,
  start: (ctx, options) => startPokerGame(ctx, options),
  close: closePokerGame,
  isOpen: isPokerGameOpen,
  input: ctx => handlePokerInput(ctx),
  snapshot: getPokerSnapshot,
  view: seat => buildPokerView(seat),
  setView: setPokerRemoteView,
  forfeit: ctx => forfeitPoker(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} тасует колоду и придвигает две карты рубашкой вверх.`,
      `Анте с каждого: ${ctx.stake}Р.`,
      'Холдем на двоих: флоп, терн, ривер, торговля после каждой улицы.',
    ],
    message: 'Пас отдает банк сопернику. Повышения растят банк до вскрытия.',
  }),
});
