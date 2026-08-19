/* ── Длинные нарды ───────────────────────────────────────────────────────────
 *
 * Не короткие: шашки не бьются и бара нет. Обе стороны идут по кругу из 24
 * пунктов в одну сторону, головы стоят напротив друг друга, поэтому весь модуль
 * считает не в «пунктах доски», а в СВОЁМ пути каждой стороны: индекс 0 —
 * голова, 23 — последний пункт перед выбросом, дом — 18..23. Пункт соперника,
 * стоящий на том же месте доски, всегда лежит по индексу `(i + 12) % 24` —
 * головы разнесены ровно на полдоски. Одна формула вместо двух систем координат.
 */

import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { mathRng as rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';
import { controlBindingLabel } from './controls';

export type BackgammonSide = 'player' | 'npc';
export type BackgammonWinner = BackgammonSide | '';
export type BackgammonPhase = 'player_turn' | 'npc_turn' | 'finished';

export interface BackgammonMove {
  from: number;
  die: number;
  /** `POINTS` означает выброс за доску. */
  to: number;
}

export interface BackgammonRoll {
  dieA: number;
  dieB: number;
  /** Дубль ходится четыре раза, поэтому бросок раскрывается в список ходов. */
  values: number[];
}

/** Расстановка для тестов и отладки: по умолчанию все шашки на голове. */
export interface BackgammonSetup {
  player?: readonly number[];
  npc?: readonly number[];
  playerOff?: number;
  npcOff?: number;
  turn?: BackgammonSide;
}

export interface BackgammonSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  /** Свои шашки по своему пути: 0 — голова, 23 — край дома. */
  own: readonly number[];
  /** Шашки соперника в ТОЙ ЖЕ рамке: панель рисует одну доску. */
  foe: readonly number[];
  ownOff: number;
  foeOff: number;
  /** Как выпало; пусто, пока кости не брошены. */
  roll: readonly number[];
  /** Остаток бросков этого хода. */
  dice: readonly number[];
  dieChoices: readonly number[];
  dieIndex: number;
  rolled: boolean;
  cursor: number;
  /** Куда встанет шашка под курсором выбранной костью; -1 — некуда. */
  targetIndex: number;
  moves: readonly BackgammonMove[];
  canMove: boolean;
  phase: BackgammonPhase;
  finished: boolean;
  winner: BackgammonWinner;
  /** False только за кооп-столом, пока ходит второй человек. */
  yourTurn: boolean;
  message: string;
  log: readonly string[];
}

export interface BackgammonInput {
  leftNav?: boolean;
  rightNav?: boolean;
  upNav?: boolean;
  downNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface BackgammonInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface BackgammonGame {
  open: boolean;
  npcId: number;
  npcName: string;
  playerName: string;
  stakeRubles: number;
  checkers: Record<BackgammonSide, number[]>;
  off: Record<BackgammonSide, number>;
  cursor: Record<BackgammonSide, number>;
  dieIndex: Record<BackgammonSide, number>;
  /** Сколько ходов сторона уже отыграла: нужно правилу первого хода. */
  turns: Record<BackgammonSide, number>;
  /** Сколько шашек снято с головы в текущем ходу. */
  headTaken: number;
  roll: number[];
  dice: number[];
  rolled: boolean;
  phase: BackgammonPhase;
  /** Кооп-стол: в стуле 'npc' сидит человек, и ИИ за него не ходит. */
  remote: boolean;
  winner: BackgammonWinner;
  settled: boolean;
  rand: () => number;
  message: string;
  log: string[];
}

const POINTS = 24;
const CHECKERS = 15;
const PRIME_LEN = 6;
const HOME_START = POINTS - PRIME_LEN;
const HEAD = 0;
/** Головы стоят напротив: полдоски между ними. */
const OPPOSITE = POINTS / 2;
/** Бросок плюс четыре хода дубля плюс закрытие хода. */
const AI_STEP_GUARD = 8;

let game: BackgammonGame | null = null;

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

function appendLog(g: BackgammonGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function otherSide(side: BackgammonSide): BackgammonSide {
  return side === 'player' ? 'npc' : 'player';
}

/** Индекс того же пункта доски в пути соперника. */
function foeIndex(index: number): number {
  return (index + OPPOSITE) % POINTS;
}

/** Whose input the table waits for. */
function seatToAct(g: BackgammonGame): BackgammonSide | null {
  if (g.phase === 'player_turn') return 'player';
  if (g.phase === 'npc_turn') return 'npc';
  return null;
}

/** Log voice: against an NPC the log speaks to the one human reading it, at a
 *  co-op table both seats read it, so everyone is named. */
function sideName(g: BackgammonGame, side: BackgammonSide): string {
  if (side === 'npc') return g.npcName;
  return g.remote ? g.playerName : 'Вы';
}

function emptyPoints(): number[] {
  return new Array<number>(POINTS).fill(0);
}

function sanitizePoints(src: readonly number[] | undefined): number[] {
  const out = emptyPoints();
  if (!src) {
    out[HEAD] = CHECKERS;
    return out;
  }
  for (let i = 0; i < POINTS && i < src.length; i++) {
    const value = Math.floor(src[i] ?? 0);
    out[i] = Number.isFinite(value) ? Math.max(0, Math.min(CHECKERS, value)) : 0;
  }
  return out;
}

function sanitizeOff(value: number | undefined): number {
  const off = Math.floor(value ?? 0);
  return Number.isFinite(off) ? Math.max(0, Math.min(CHECKERS, off)) : 0;
}

export function rollBackgammonDice(rand = rng): BackgammonRoll {
  const dieA = Math.max(1, Math.min(6, Math.floor(rand() * 6) + 1));
  const dieB = Math.max(1, Math.min(6, Math.floor(rand() * 6) + 1));
  const values = dieA === dieB ? [dieA, dieA, dieA, dieA] : [dieA, dieB];
  return { dieA, dieB, values };
}

export function backgammonStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

/* ── Правила ─────────────────────────────────────────────────────────────── */

/** Выброс открыт, только когда на доске не осталось шашек вне дома. */
function allHome(g: BackgammonGame, side: BackgammonSide): boolean {
  const own = g.checkers[side];
  for (let i = 0; i < HOME_START; i++) if (own[i] > 0) return false;
  return true;
}

/** Есть ли в доме шашка дальше от края, чем `from`: перебором старшей кости
 *  выбрасывают только когда сзади уже пусто. */
function hasBehindInHome(g: BackgammonGame, side: BackgammonSide, from: number): boolean {
  const own = g.checkers[side];
  for (let i = HOME_START; i < from; i++) if (own[i] > 0) return true;
  return false;
}

/** Свой первый ход дублем снимает с головы две шашки, все прочие — одну. */
function headAllowance(g: BackgammonGame, side: BackgammonSide): number {
  const isDouble = g.roll.length === 2 && g.roll[0] === g.roll[1];
  return g.turns[side] === 0 && isDouble ? 2 : 1;
}

/** Шесть занятых подряд пунктов законны, только если хоть одна шашка соперника
 *  уже прошла блок: иначе это полное запирание. Проверяем лишь ряды, которые
 *  накрывают только что занятый пункт — остальные не изменились. */
function primeTraps(g: BackgammonGame, side: BackgammonSide, own: readonly number[], to: number): boolean {
  const foe = g.checkers[otherSide(side)];
  if (g.off[otherSide(side)] > 0) return false;
  for (let start = to - PRIME_LEN + 1; start <= to; start++) {
    let full = true;
    for (let k = 0; k < PRIME_LEN; k++) {
      if (own[(start + k + POINTS) % POINTS] <= 0) { full = false; break; }
    }
    if (!full) continue;
    const last = foeIndex((start + PRIME_LEN - 1 + POINTS) % POINTS);
    let ahead = false;
    for (let i = last + 1; i < POINTS; i++) if (foe[i] > 0) { ahead = true; break; }
    if (!ahead) return true;
  }
  return false;
}

function isLegalMove(g: BackgammonGame, side: BackgammonSide, from: number, die: number): boolean {
  const own = g.checkers[side];
  if (die <= 0 || from < 0 || from >= POINTS || own[from] <= 0) return false;
  if (from === HEAD && g.headTaken >= headAllowance(g, side)) return false;
  const to = from + die;
  if (to >= POINTS) {
    if (!allHome(g, side)) return false;
    return to === POINTS || !hasBehindInHome(g, side, from);
  }
  if (g.checkers[otherSide(side)][foeIndex(to)] > 0) return false;
  const after = own.slice();
  after[from]--;
  after[to]++;
  return !primeTraps(g, side, after, to);
}

/** Короткое объяснение отказа: игроку надо видеть, какое правило сработало. */
function moveRefusal(g: BackgammonGame, side: BackgammonSide, from: number, die: number): string {
  const own = g.checkers[side];
  if (own[from] <= 0) return 'На этом пункте нет ваших шашек.';
  if (from === HEAD && g.headTaken >= headAllowance(g, side)) return 'С головы за ход снимают одну шашку.';
  const to = from + die;
  if (to >= POINTS) return 'Выброс открыт, только когда все шашки дома.';
  if (g.checkers[otherSide(side)][foeIndex(to)] > 0) return 'Пункт занят соперником.';
  return 'Шесть занятых подряд заперли бы соперника.';
}

function legalMoves(g: BackgammonGame, side: BackgammonSide): BackgammonMove[] {
  const out: BackgammonMove[] = [];
  const seen: number[] = [];
  for (const die of g.dice) {
    if (seen.includes(die)) continue;
    seen.push(die);
    for (let from = 0; from < POINTS; from++) {
      if (isLegalMove(g, side, from, die)) out.push({ from, die, to: Math.min(from + die, POINTS) });
    }
  }
  return out;
}

function applyMove(g: BackgammonGame, side: BackgammonSide, from: number, die: number): boolean {
  if (!isLegalMove(g, side, from, die)) return false;
  const own = g.checkers[side];
  const to = from + die;
  own[from]--;
  if (to >= POINTS) {
    g.off[side]++;
    appendLog(g, `${sideName(g, side)}: шашка выброшена, снято ${g.off[side]} из ${CHECKERS}.`);
  } else {
    own[to]++;
  }
  if (from === HEAD) g.headTaken++;
  const idx = g.dice.indexOf(die);
  if (idx >= 0) g.dice.splice(idx, 1);
  return true;
}

/* ── Ход ─────────────────────────────────────────────────────────────────── */

function beginTurn(g: BackgammonGame, side: BackgammonSide): void {
  g.phase = side === 'player' ? 'player_turn' : 'npc_turn';
  g.rolled = false;
  g.roll = [];
  g.dice = [];
  g.headTaken = 0;
  g.dieIndex[side] = 0;
}

/** Курсор встаёт на первую играбельную шашку, чтобы ход начинался с рабочего
 *  пункта, а не с пустого. */
function focusCursor(g: BackgammonGame, side: BackgammonSide): void {
  const moves = legalMoves(g, side);
  if (moves.length > 0) g.cursor[side] = moves[0].from;
}

function rollFor(g: BackgammonGame, side: BackgammonSide, rand: () => number): void {
  const roll = rollBackgammonDice(rand);
  g.roll = [roll.dieA, roll.dieB];
  g.dice = [...roll.values];
  g.rolled = true;
  g.dieIndex[side] = 0;
  const tail = roll.dieA === roll.dieB ? ' Дубль: четыре хода.' : '';
  appendLog(g, `${sideName(g, side)}: ${roll.dieA} и ${roll.dieB}.${tail}`);
  focusCursor(g, side);
}

function settleBackgammonGame(g: BackgammonGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc')) return;
  g.settled = true;
  g.phase = 'finished';
  const loser = otherSide(g.winner);
  // Марс: соперник не вывел ни одной шашки — ставка идёт вдвойне, но перевод
  // всё равно упирается в реальные деньги платящего.
  const mars = g.off[g.winner] >= CHECKERS && g.off[loser] <= 0;
  const amount = transferBackgammonStake(state, player, npc, g.winner, g.stakeRubles * (mars ? 2 : 1));
  const mark = mars ? ' Марс.' : '';
  const line = g.remote
    ? `Нарды: ${sideName(g, g.winner)} забрал ₽${amount}.${mark}`
    : g.winner === 'player'
      ? `Нарды: вы выиграли ₽${amount}.${mark}`
      : `Нарды: вы проиграли ₽${amount}.${mark}`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

/** Закрывает ход, когда броски кончились или ходить нечем. */
function finishTurnIfDone(g: BackgammonGame, state: GameState, player: Entity, npc: Entity, side: BackgammonSide): void {
  if (g.phase === 'finished') return;
  if (g.off[side] >= CHECKERS) {
    g.winner = side;
    settleBackgammonGame(g, state, player, npc);
    return;
  }
  if (!g.rolled) return;
  if (g.dice.length > 0 && legalMoves(g, side).length > 0) return;
  if (g.dice.length > 0) appendLog(g, `${sideName(g, side)}: ходов нет, пропуск.`);
  g.turns[side]++;
  beginTurn(g, otherSide(side));
}

function scoreNpcMove(g: BackgammonGame, move: BackgammonMove): number {
  const own = g.checkers.npc;
  if (move.to >= POINTS) return 1000;
  // Хвост первым: чем дальше от края шашка стояла, тем полезнее её сдвинуть.
  let score = (POINTS - move.from) * 2 + move.die;
  if (move.to >= HOME_START) score += 30;
  if (own[move.to] > 0) score += 8;
  else if (move.to < HOME_START) score -= 4;
  if (own[move.from] === 2) score -= 6;
  // Пункты сразу перед головой соперника душат его выход.
  const foeIdx = foeIndex(move.to);
  if (foeIdx >= 1 && foeIdx <= PRIME_LEN) score += 30 - foeIdx * 2;
  return score;
}

function chooseNpcMove(g: BackgammonGame): BackgammonMove | null {
  let best: BackgammonMove | null = null;
  let bestScore = -Infinity;
  for (const move of legalMoves(g, 'npc')) {
    const score = scoreNpcMove(g, move);
    if (score > bestScore || (score === bestScore && best && move.from < best.from)) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

function advanceNpc(g: BackgammonGame, state: GameState, player: Entity, npc: Entity): void {
  // Кооп-стол: в стуле 'npc' сидит человек, за него ничего не двигается.
  if (g.remote) return;
  for (let guard = 0; guard < AI_STEP_GUARD && g.phase === 'npc_turn'; guard++) {
    if (!g.rolled) {
      rollFor(g, 'npc', g.rand);
      finishTurnIfDone(g, state, player, npc, 'npc');
      continue;
    }
    const move = chooseNpcMove(g);
    if (move) applyMove(g, 'npc', move.from, move.die);
    finishTurnIfDone(g, state, player, npc, 'npc');
    if (!move) return;
  }
}

/* ── Стол ────────────────────────────────────────────────────────────────── */

function publishBackgammonSettlementEvent(state: GameState, player: Entity, npc: Entity, winner: BackgammonWinner, amount: number, stake: number): void {
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
    tags: ['gambling', 'backgammon', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function transferBackgammonStake(state: GameState, player: Entity, npc: Entity, winner: BackgammonWinner, stake: number): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishBackgammonSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function openingSide(rand: () => number): BackgammonSide {
  const roll = rollBackgammonDice(rand);
  return roll.dieA >= roll.dieB ? 'player' : 'npc';
}

export function startBackgammonGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { rng?: () => number; stake?: number; remote?: boolean; setup?: BackgammonSetup } = {},
): boolean {
  const stake = options.stake ?? backgammonStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  const rand = options.rng ?? rng;
  const first = options.setup?.turn ?? openingSide(rand);
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    playerName: ctx.player.name ?? 'Игрок',
    stakeRubles: stake,
    checkers: { player: sanitizePoints(options.setup?.player), npc: sanitizePoints(options.setup?.npc) },
    off: { player: sanitizeOff(options.setup?.playerOff), npc: sanitizeOff(options.setup?.npcOff) },
    cursor: { player: HEAD, npc: HEAD },
    dieIndex: { player: 0, npc: 0 },
    turns: { player: 0, npc: 0 },
    headTaken: 0,
    roll: [],
    dice: [],
    rolled: false,
    phase: first === 'player' ? 'player_turn' : 'npc_turn',
    remote: options.remote === true,
    winner: '',
    settled: false,
    rand,
    message: '',
    log: [],
  };
  appendLog(game, `Доска расставлена, по ${CHECKERS} шашек на голове. Кон за ${first === 'player' && !game.remote ? 'вами' : sideName(game, first)}.`);
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
    itemValue: stake,
    severity: 1,
    privacy: 'local',
    tags: ['gambling', 'backgammon', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  advanceNpc(game, ctx.state, ctx.player, ctx.npc);
  return true;
}

export function closeBackgammonGame(): void {
  game = null;
}

/** A table the host runs for us: we hold no game, only the view it ships. */
let remoteView: BackgammonSnapshot | null = null;

export function setBackgammonRemoteView(view: unknown): void {
  remoteView = (view as BackgammonSnapshot | null) ?? null;
}

export function isBackgammonGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getBackgammonSnapshot(): BackgammonSnapshot {
  return remoteView ?? buildBackgammonView('player');
}

/** Свободные ходы стороны — для панели, тестов и отладки. */
export function backgammonLegalMovesFor(side: BackgammonSide): readonly BackgammonMove[] {
  return game ? legalMoves(game, side) : [];
}

function dieChoicesOf(g: BackgammonGame): number[] {
  const out: number[] = [];
  for (const die of g.dice) if (!out.includes(die)) out.push(die);
  return out;
}

function selectedDie(g: BackgammonGame, seat: BackgammonSide): number {
  const choices = dieChoicesOf(g);
  if (choices.length <= 0) return 0;
  const idx = Math.max(0, Math.min(choices.length - 1, g.dieIndex[seat]));
  return choices[idx];
}

const emptySnapshot: BackgammonSnapshot = {
  open: false,
  npcId: -1,
  npcName: '',
  stakeRubles: 0,
  own: [],
  foe: [],
  ownOff: 0,
  foeOff: 0,
  roll: [],
  dice: [],
  dieChoices: [],
  dieIndex: 0,
  rolled: false,
  cursor: 0,
  targetIndex: -1,
  moves: [],
  canMove: false,
  phase: 'finished',
  finished: false,
  winner: '',
  yourTurn: false,
  message: '',
  log: [],
};

/** Стол глазами `seat`: свои шашки в своём пути, чужие — в той же рамке. Для
 *  'player' это исходный вид дословно. */
function buildBackgammonView(seat: BackgammonSide): BackgammonSnapshot {
  const g = game;
  if (!g) return emptySnapshot;
  const acts = seatToAct(g) === seat;
  const foeCheckers = g.checkers[otherSide(seat)];
  const own = [...g.checkers[seat]];
  const die = selectedDie(g, seat);
  const cursor = g.cursor[seat];
  const moves = acts ? legalMoves(g, seat) : [];
  const canMove = acts && g.rolled && isLegalMove(g, seat, cursor, die);
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: seat === 'npc' ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    own,
    foe: own.map((_, i) => foeCheckers[foeIndex(i)]),
    ownOff: g.off[seat],
    foeOff: g.off[otherSide(seat)],
    roll: [...g.roll],
    dice: [...g.dice],
    dieChoices: dieChoicesOf(g),
    dieIndex: g.dieIndex[seat],
    rolled: g.rolled,
    cursor,
    targetIndex: canMove ? Math.min(cursor + die, POINTS) : -1,
    moves,
    canMove,
    phase: g.phase === 'finished' ? 'finished' : acts ? 'player_turn' : 'npc_turn',
    finished: g.phase === 'finished',
    winner: g.winner === '' ? '' : g.winner === seat ? 'player' : 'npc',
    yourTurn: acts,
    message: g.message,
    log: [...g.log],
  };
}

function stepCursor(g: BackgammonGame, seat: BackgammonSide, dir: number): void {
  const own = g.checkers[seat];
  let idx = g.cursor[seat];
  for (let step = 0; step < POINTS; step++) {
    idx = (idx + dir + POINTS) % POINTS;
    if (own[idx] > 0) break;
  }
  g.cursor[seat] = idx;
}

function stepDie(g: BackgammonGame, seat: BackgammonSide, dir: number): void {
  const count = dieChoicesOf(g).length;
  if (count <= 0) return;
  g.dieIndex[seat] = (g.dieIndex[seat] + dir + count) % count;
}

function playSeatMove(g: BackgammonGame, ctx: { state: GameState; player: Entity; npc: Entity }, seat: BackgammonSide, rand: () => number): void {
  if (!g.rolled) {
    rollFor(g, seat, rand);
    finishTurnIfDone(g, ctx.state, ctx.player, ctx.npc, seat);
    advanceNpc(g, ctx.state, ctx.player, ctx.npc);
    return;
  }
  const from = g.cursor[seat];
  const die = selectedDie(g, seat);
  if (!applyMove(g, seat, from, die)) {
    appendLog(g, moveRefusal(g, seat, from, die));
    return;
  }
  g.dieIndex[seat] = 0;
  finishTurnIfDone(g, ctx.state, ctx.player, ctx.npc, seat);
  if (seatToAct(g) === seat) focusCursor(g, seat);
  advanceNpc(g, ctx.state, ctx.player, ctx.npc);
}

export function handleBackgammonInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: BackgammonInput; seat?: BackgammonSide; rng?: () => number;
}): BackgammonInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  if (ctx.input.leftNav) { stepCursor(g, seat, -1); return { handled: true }; }
  if (ctx.input.rightNav) { stepCursor(g, seat, 1); return { handled: true }; }
  if (ctx.input.upNav) { stepDie(g, seat, -1); return { handled: true }; }
  if (ctx.input.downNav) { stepDie(g, seat, 1); return { handled: true }; }
  if (g.phase === 'finished') {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Walking away is conceding: the stake goes to whoever stayed.
    g.winner = otherSide(seat);
    settleBackgammonGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }
  if (seatToAct(g) !== seat) return { handled: true };
  if (ctx.input.dropEdge) { stepDie(g, seat, 1); return { handled: true }; }
  if (ctx.input.interactEdge) {
    playSeatMove(g, ctx, seat, ctx.rng ?? g.rand);
    return { handled: true };
  }
  return { handled: true };
}

/** Walking away mid-table is conceding: the stake goes to whoever stayed. */
function forfeitBackgammon(ctx: { state: GameState; player: Entity; npc: Entity; quitter: BackgammonSide }): void {
  const g = game;
  if (!g || g.phase === 'finished') return;
  g.winner = otherSide(ctx.quitter);
  settleBackgammonGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'backgammon',
  title: 'НАРДЫ',
  menuLabel: 'Играть в нарды',
  itemId: 'backgammon_set',
  order: 37,
  stake: backgammonStakeFromNpc,
  start: (ctx, options) => startBackgammonGame(ctx, options),
  close: closeBackgammonGame,
  isOpen: isBackgammonGameOpen,
  input: ctx => handleBackgammonInput(ctx),
  snapshot: getBackgammonSnapshot,
  view: seat => buildBackgammonView(seat),
  setView: setBackgammonRemoteView,
  forfeit: ctx => forfeitBackgammon(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} раскладывает доску и стучит костями по фанере.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      `Длинные нарды: по ${CHECKERS} шашек на голове, с головы за ход одна, шесть подряд запирать нельзя. Марс платит вдвое.`,
    ],
    message: `${controlBindingLabel('gameMenu')} бросить/сходить, ${controlBindingLabel('drop')} меняет кость, ${controlBindingLabel('menuLeft')}/${controlBindingLabel('menuRight')} выбирают пункт.`,
  }),
});
