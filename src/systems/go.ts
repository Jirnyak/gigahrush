/* ── ГО 9×9 ──────────────────────────────────────────────────────────────────
 *
 * Камни стоят НА пересечениях, а не в клетках, поэтому доска здесь — плоский
 * массив из 81 пункта, а не сетка фигур: группа определяется связностью по
 * четырём соседям, и почти вся логика сводится к одному заливочному обходу.
 *
 * Счёт китайский (камни на доске + окружённая территория) с коми 6.5 белым:
 * половинка очка делает ничью невозможной, так что расчёт ставки всегда
 * однозначен и отдельной ветки «ничья» тут нет.
 */

import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { registerTabletopGame } from './tabletop';
import { controlBindingLabel } from './controls';

export type GoSide = 'player' | 'npc';
/** Ничьих нет: коми 6.5 не даёт счёту сойтись. */
export type GoWinner = GoSide | '';
export type GoPhase = 'player_turn' | 'npc_turn' | 'finished';

export const GO_SIZE = 9;
export const GO_POINTS = GO_SIZE * GO_SIZE;
export const GO_KOMI = 6.5;
export const GO_EMPTY = 0;
/** Чёрные — кресло 'player', ходят первыми. */
export const GO_BLACK = 1;
export const GO_WHITE = 2;
export const GO_PASS = -1;

/** Верхняя граница партии. На 9×9 столько ходов не бывает, но стол не должен
 *  висеть вечно, если обе стороны упрямо доливают камни. */
const GO_MAX_MOVES = 220;
/** Пустая область такого размера, окружённая только своими, считается своей
 *  устоявшейся территорией: доливать туда бессмысленно. Больший размер ещё
 *  может оказаться незакрытым центром, туда ходить можно. */
const GO_SETTLED_REGION = 12;
/** Раньше этого числа камней доска ещё не разыграна, и «веду по счёту» ничего
 *  не значит: на пустой доске белые ведут на одно коми и спасовали бы вторым
 *  ходом. */
const GO_ENDGAME_STONES = 30;

export interface GoSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  board: readonly number[];
  phase: GoPhase;
  winner: GoWinner;
  message: string;
  log: readonly string[];
  cursorX: number;
  cursorY: number;
  /** False only at a co-op table while the other human moves. */
  yourTurn: boolean;
  /** Каким цветом играет это кресло: доска не разворачивается, поэтому цвет
   *  сообщается явно. */
  yourStone: number;
  yourCaptures: number;
  theirCaptures: number;
  koIndex: number;
  passes: number;
  scoreBlack: number;
  scoreWhite: number;
  komi: number;
}

export interface GoInput {
  leftNav?: boolean;
  rightNav?: boolean;
  upNav?: boolean;
  downNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface GoInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

export interface GoGroup {
  stones: number[];
  /** Дамэ — свободные пункты, примыкающие к группе. */
  liberties: number;
}

export interface GoMoveResult {
  board: number[];
  captured: number;
  /** Пункт, запрещённый противнику следующим ходом, или -1. */
  koIndex: number;
}

export interface GoScore {
  black: number;
  white: number;
  blackTerritory: number;
  whiteTerritory: number;
}

interface GoGame {
  open: boolean;
  npcId: number;
  npcName: string;
  playerName: string;
  stakeRubles: number;
  board: number[];
  phase: GoPhase;
  winner: GoWinner;
  settled: boolean;
  message: string;
  log: string[];
  cursorX: number;
  cursorY: number;
  /** Своё перекрестие у второго кресла: доска общая, курсоры раздельные. */
  npcCursorX: number;
  npcCursorY: number;
  koIndex: number;
  passes: number;
  moves: number;
  capturesBlack: number;
  capturesWhite: number;
  /** Co-op table: a human sits in the 'npc' seat, so its turn waits for input
   *  instead of being played out by `chooseGoMove`. */
  remote: boolean;
}

let game: GoGame | null = null;

export function goIndex(x: number, y: number): number {
  return y * GO_SIZE + x;
}

export function goX(idx: number): number {
  return idx % GO_SIZE;
}

export function goY(idx: number): number {
  return (idx / GO_SIZE) | 0;
}

const NEIGHBORS: readonly (readonly number[])[] = buildNeighbors();
const DIAGONALS: readonly (readonly [number, number])[] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

function buildNeighbors(): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < GO_SIZE; y++) {
    for (let x = 0; x < GO_SIZE; x++) {
      const list: number[] = [];
      if (x > 0) list.push(goIndex(x - 1, y));
      if (x < GO_SIZE - 1) list.push(goIndex(x + 1, y));
      if (y > 0) list.push(goIndex(x, y - 1));
      if (y < GO_SIZE - 1) list.push(goIndex(x, y + 1));
      out.push(list);
    }
  }
  return out;
}

export function createGoBoard(): number[] {
  return new Array<number>(GO_POINTS).fill(GO_EMPTY);
}

export function goOpponentStone(stone: number): number {
  return stone === GO_BLACK ? GO_WHITE : GO_BLACK;
}

/** Штампы вместо очистки: обход группы вызывается сотнями раз за ход бота, а
 *  доска фиксированного размера. */
const visitMark = new Int32Array(GO_POINTS);
let visitEpoch = 0;

/** Группа камней одного цвета и её дамэ. */
export function goGroup(board: readonly number[], idx: number): GoGroup {
  const color = board[idx];
  if (color === GO_EMPTY) return { stones: [], liberties: 0 };
  visitEpoch++;
  visitMark[idx] = visitEpoch;
  const stones: number[] = [idx];
  let liberties = 0;
  for (let i = 0; i < stones.length; i++) {
    for (const n of NEIGHBORS[stones[i]]) {
      if (visitMark[n] === visitEpoch) continue;
      visitMark[n] = visitEpoch;
      const v = board[n];
      if (v === GO_EMPTY) liberties++;
      else if (v === color) stones.push(n);
    }
  }
  return { stones, liberties };
}

export function goLiberties(board: readonly number[], idx: number): number {
  return goGroup(board, idx).liberties;
}

/** Ход по правилам: занятость, ко, снятие групп без дамэ, запрет самоубийства.
 *  `null` — ход незаконен, доска остаётся прежней. */
export function applyGoMove(
  board: readonly number[],
  idx: number,
  stone: number,
  koIndex = GO_PASS,
): GoMoveResult | null {
  if (idx < 0 || idx >= GO_POINTS) return null;
  if (board[idx] !== GO_EMPTY) return null;
  if (idx === koIndex) return null;
  const next = board.slice() as number[];
  next[idx] = stone;
  const foe = goOpponentStone(stone);
  let captured = 0;
  let lastCaptured = GO_PASS;
  for (const n of NEIGHBORS[idx]) {
    if (next[n] !== foe) continue;
    const group = goGroup(next, n);
    if (group.liberties > 0) continue;
    for (const s of group.stones) {
      next[s] = GO_EMPTY;
      lastCaptured = s;
    }
    captured += group.stones.length;
  }
  const own = goGroup(next, idx);
  if (own.liberties === 0) return null;
  // Ко возникает ровно в одной форме: одиноким камнем сняли один камень и сам
  // остался в атари — значит обратный ход вернул бы позицию.
  const ko = captured === 1 && own.stones.length === 1 && own.liberties === 1 ? lastCaptured : GO_PASS;
  return { board: next, captured, koIndex: ko };
}

export function goMoveIsLegal(board: readonly number[], idx: number, stone: number, koIndex = GO_PASS): boolean {
  return applyGoMove(board, idx, stone, koIndex) !== null;
}

interface GoRegion {
  stones: number[];
  /** Цвет, окруживший область целиком, иначе GO_EMPTY. */
  owner: number;
}

function emptyRegion(board: readonly number[], start: number, seen: Uint8Array): GoRegion {
  const stones = [start];
  seen[start] = 1;
  let touchBlack = false;
  let touchWhite = false;
  for (let i = 0; i < stones.length; i++) {
    for (const n of NEIGHBORS[stones[i]]) {
      const v = board[n];
      if (v === GO_BLACK) { touchBlack = true; continue; }
      if (v === GO_WHITE) { touchWhite = true; continue; }
      if (!seen[n]) { seen[n] = 1; stones.push(n); }
    }
  }
  const owner = touchBlack === touchWhite ? GO_EMPTY : touchBlack ? GO_BLACK : GO_WHITE;
  return { stones, owner };
}

/** Китайский счёт: камни на доске плюс окружённая территория, коми белым. */
export function goScore(board: readonly number[], komi = GO_KOMI): GoScore {
  let black = 0;
  let white = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;
  const seen = new Uint8Array(GO_POINTS);
  for (let i = 0; i < GO_POINTS; i++) {
    if (board[i] === GO_BLACK) { black++; continue; }
    if (board[i] === GO_WHITE) { white++; continue; }
    if (seen[i]) continue;
    const region = emptyRegion(board, i, seen);
    if (region.owner === GO_BLACK) blackTerritory += region.stones.length;
    else if (region.owner === GO_WHITE) whiteTerritory += region.stones.length;
  }
  return {
    black: black + blackTerritory,
    white: white + whiteTerritory + komi,
    blackTerritory,
    whiteTerritory,
  };
}

/** Свой глаз: все четыре соседа свои, и диагонали не захвачены противником.
 *  Заполнять такой пункт — убивать собственную группу. */
export function goIsOwnEye(board: readonly number[], idx: number, stone: number): boolean {
  if (board[idx] !== GO_EMPTY) return false;
  for (const n of NEIGHBORS[idx]) {
    if (board[n] !== stone) return false;
  }
  const x = goX(idx);
  const y = goY(idx);
  const foe = goOpponentStone(stone);
  let foeDiagonals = 0;
  let offBoard = 0;
  for (const [dx, dy] of DIAGONALS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= GO_SIZE || ny < 0 || ny >= GO_SIZE) { offBoard++; continue; }
    if (board[goIndex(nx, ny)] === foe) foeDiagonals++;
  }
  return offBoard > 0 ? foeDiagonals === 0 : foeDiagonals <= 1;
}

/** Пункты, куда ходить незачем: своя закрытая территория. Считается один раз
 *  на ход бота, а не на каждого кандидата. */
function settledOwnPoints(board: readonly number[], stone: number): Uint8Array {
  const seen = new Uint8Array(GO_POINTS);
  const mask = new Uint8Array(GO_POINTS);
  for (let i = 0; i < GO_POINTS; i++) {
    if (board[i] !== GO_EMPTY || seen[i]) continue;
    const region = emptyRegion(board, i, seen);
    if (region.owner !== stone || region.stones.length > GO_SETTLED_REGION) continue;
    for (const s of region.stones) mask[s] = 1;
  }
  return mask;
}

/** Третья линия ценнее первой: на 9×9 там и территория, и устойчивость. */
const LINE_VALUE = [0, 1.5, 3, 2.5, 2];

function lineValue(idx: number): number {
  const x = goX(idx);
  const y = goY(idx);
  return LINE_VALUE[Math.min(x, GO_SIZE - 1 - x)] + LINE_VALUE[Math.min(y, GO_SIZE - 1 - y)];
}

/** Оценка одного хода. Никакого перебора вглубь: только позиция до хода,
 *  позиция после и соседние группы — 81 кандидат, каждый в пределах доски. */
function scoreGoCandidate(board: readonly number[], idx: number, stone: number, next: GoMoveResult): number {
  const foe = goOpponentStone(stone);
  let score = 1 + lineValue(idx) + next.captured * 14;
  let rescue = 0;
  for (const n of NEIGHBORS[idx]) {
    const v = board[n];
    if (v === GO_EMPTY) { score += 0.4; continue; }
    const before = goGroup(board, n);
    if (v === stone) {
      if (before.liberties === 1) rescue = Math.max(rescue, before.stones.length);
      else if (before.liberties === 2) score += 3;
      else score += 0.8;
    } else {
      score += before.liberties === 2 ? 4 : 1.2;
    }
  }
  const own = goGroup(next.board, idx);
  if (rescue > 0 && own.liberties >= 2) score += 9 + rescue * 3;
  if (own.liberties === 1 && next.captured === 0) score -= 10;
  for (const n of NEIGHBORS[idx]) {
    if (next.board[n] !== foe) continue;
    const group = goGroup(next.board, n);
    if (group.liberties === 1) score += 3 + group.stones.length * 2;
  }
  return score;
}

function occupiedPoints(board: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < GO_POINTS; i++) if (board[i] !== GO_EMPTY) n++;
  return n;
}

function hashBoard(board: readonly number[]): number {
  let h = 2166136261;
  for (let i = 0; i < GO_POINTS; i++) h = Math.imul(h ^ (board[i] + 1), 16777619);
  return h >>> 0;
}

/** Ровные оценки разводятся детерминированной добавкой от самой позиции: бот
 *  не повторяется от партии к партии и при этом не трогает RNG. */
function tieBreak(hash: number, idx: number): number {
  return ((Math.imul(hash ^ idx, 2654435761) >>> 21) & 7) * 0.12;
}

/** Эвристический выбор. `GO_PASS` — пас. */
export function chooseGoMove(
  board: readonly number[],
  stone: number,
  koIndex: number,
  opponentPassed: boolean,
): number {
  if (opponentPassed && occupiedPoints(board) >= GO_ENDGAME_STONES) {
    const score = goScore(board);
    const mine = stone === GO_BLACK ? score.black : score.white;
    const theirs = stone === GO_BLACK ? score.white : score.black;
    if (mine > theirs) return GO_PASS;
  }
  const skip = settledOwnPoints(board, stone);
  const hash = hashBoard(board);
  let best = GO_PASS;
  let bestValue = 0;
  for (let idx = 0; idx < GO_POINTS; idx++) {
    if (board[idx] !== GO_EMPTY || skip[idx]) continue;
    if (goIsOwnEye(board, idx, stone)) continue;
    const next = applyGoMove(board, idx, stone, koIndex);
    if (!next) continue;
    const value = scoreGoCandidate(board, idx, stone, next) + tieBreak(hash, idx);
    if (value > bestValue) { bestValue = value; best = idx; }
  }
  return best;
}

function otherSide(side: GoSide): GoSide {
  return side === 'player' ? 'npc' : 'player';
}

function stoneOfSide(side: GoSide): number {
  return side === 'player' ? GO_BLACK : GO_WHITE;
}

/** Whose input the board waits for. */
function seatToAct(g: GoGame): GoSide | null {
  if (g.phase === 'player_turn') return 'player';
  if (g.phase === 'npc_turn') return 'npc';
  return null;
}

function cursorOf(g: GoGame, seat: GoSide): { x: number; y: number } {
  return seat === 'player' ? { x: g.cursorX, y: g.cursorY } : { x: g.npcCursorX, y: g.npcCursorY };
}

function setCursor(g: GoGame, seat: GoSide, x: number, y: number): void {
  if (seat === 'player') { g.cursorX = x; g.cursorY = y; return; }
  g.npcCursorX = x; g.npcCursorY = y;
}

function sideName(g: GoGame, side: GoSide): string {
  if (side === 'npc') return g.npcName;
  return g.remote ? g.playerName : 'Вы';
}

function clampBoard(v: number): number {
  return Math.max(0, Math.min(GO_SIZE - 1, v));
}

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

export function goStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

function appendLog(g: GoGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function anyGroupInAtari(board: readonly number[], stone: number): boolean {
  for (let i = 0; i < GO_POINTS; i++) {
    if (board[i] !== stone) continue;
    if (goGroup(board, i).liberties === 1) return true;
  }
  return false;
}

function publishGoSettlementEvent(
  state: GameState, player: Entity, npc: Entity, winner: GoWinner, amount: number, stake: number,
): void {
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
    tags: ['gambling', 'go', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function transferGoStake(
  state: GameState, player: Entity, npc: Entity, winner: GoWinner, stake: number,
): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishGoSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function settleGoGame(g: GoGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc')) return;
  g.settled = true;
  g.phase = 'finished';
  const amount = transferGoStake(state, player, npc, g.winner, g.stakeRubles);
  const line = g.remote
    ? `Го: ${sideName(g, g.winner)} забрал ₽${amount}.`
    : g.winner === 'player'
      ? `Го: вы выиграли ₽${amount}.`
      : `Го: вы проиграли ₽${amount}.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

interface GoTurnCtx {
  state: GameState;
  player: Entity;
  npc: Entity;
}

function finishGo(g: GoGame, ctx: GoTurnCtx): void {
  const score = goScore(g.board);
  g.winner = score.black > score.white ? 'player' : 'npc';
  appendLog(g, `Счёт: чёрные ${formatScore(score.black)}, белые ${formatScore(score.white)} с коми.`);
  settleGoGame(g, ctx.state, ctx.player, ctx.npc);
}

function seatPass(g: GoGame, ctx: GoTurnCtx, seat: GoSide): void {
  g.passes++;
  g.moves++;
  g.koIndex = GO_PASS;
  appendLog(g, `${sideName(g, seat)}: пас.`);
  if (g.passes >= 2) {
    appendLog(g, 'Два паса подряд — партия окончена.');
    finishGo(g, ctx);
    return;
  }
  g.phase = seat === 'player' ? 'npc_turn' : 'player_turn';
}

function commitGoMove(g: GoGame, ctx: GoTurnCtx, seat: GoSide, next: GoMoveResult): void {
  const stone = stoneOfSide(seat);
  g.board = next.board;
  g.koIndex = next.koIndex;
  g.passes = 0;
  g.moves++;
  if (stone === GO_BLACK) g.capturesBlack += next.captured;
  else g.capturesWhite += next.captured;
  const atari = anyGroupInAtari(g.board, goOpponentStone(stone)) ? ' Атари.' : '';
  appendLog(g, next.captured > 0
    ? `${sideName(g, seat)} снимает камней: ${next.captured}.${atari}`
    : `${sideName(g, seat)}: камень поставлен.${atari}`);
  if (g.moves >= GO_MAX_MOVES) {
    appendLog(g, 'Доска исчерпана, считаем.');
    finishGo(g, ctx);
    return;
  }
  g.phase = seat === 'player' ? 'npc_turn' : 'player_turn';
}

function placeSeatStone(g: GoGame, ctx: GoTurnCtx, seat: GoSide, idx: number): void {
  if (g.board[idx] !== GO_EMPTY) { appendLog(g, 'Пункт занят.'); return; }
  if (idx === g.koIndex) { appendLog(g, 'Ко: сразу возвращать позицию нельзя.'); return; }
  const next = applyGoMove(g.board, idx, stoneOfSide(seat), g.koIndex);
  if (!next) { appendLog(g, 'Так нельзя: у группы не остаётся дамэ.'); return; }
  commitGoMove(g, ctx, seat, next);
}

/** One seat's move: navigate, place a stone or pass. `seat` is 'player' against
 *  an NPC and either chair at a co-op table. Доска общая и не разворачивается —
 *  разное у кресел только перекрестие и цвет камней. */
function playSeatTurn(
  g: GoGame,
  ctx: GoTurnCtx & { input: GoInput },
  seat: GoSide,
): GoInputResult {
  const cursor = cursorOf(g, seat);
  let cx = cursor.x;
  let cy = cursor.y;
  if (ctx.input.leftNav) cx = clampBoard(cx - 1);
  if (ctx.input.rightNav) cx = clampBoard(cx + 1);
  if (ctx.input.upNav) cy = clampBoard(cy - 1);
  if (ctx.input.downNav) cy = clampBoard(cy + 1);
  setCursor(g, seat, cx, cy);

  if (ctx.input.dropEdge) {
    seatPass(g, ctx, seat);
    return { handled: true };
  }
  if (ctx.input.interactEdge) placeSeatStone(g, ctx, seat, goIndex(cx, cy));
  return { handled: true };
}

function playAiTurn(g: GoGame, ctx: GoTurnCtx): void {
  const move = chooseGoMove(g.board, GO_WHITE, g.koIndex, g.passes > 0);
  const next = move === GO_PASS ? null : applyGoMove(g.board, move, GO_WHITE, g.koIndex);
  if (!next) { seatPass(g, ctx, 'npc'); return; }
  commitGoMove(g, ctx, 'npc', next);
}

export function startGoGame(
  ctx: GoTurnCtx,
  options: { stake?: number; remote?: boolean } = {},
): boolean {
  const stake = options.stake ?? goStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    playerName: ctx.player.name ?? 'Игрок',
    stakeRubles: stake,
    board: createGoBoard(),
    phase: 'player_turn',
    winner: '',
    settled: false,
    message: '',
    log: [],
    cursorX: 4,
    cursorY: 4,
    npcCursorX: 4,
    npcCursorY: 4,
    koIndex: GO_PASS,
    passes: 0,
    moves: 0,
    capturesBlack: 0,
    capturesWhite: 0,
    remote: options.remote === true,
  };
  appendLog(game, game.remote
    ? `Доска расчерчена. Чёрные — ${game.playerName}, ходят первыми.`
    : 'Доска расчерчена. Вы чёрными, ваш ход первый.');
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
    tags: ['gambling', 'go', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  return true;
}

export function closeGoGame(): void {
  game = null;
}

/** A table the host runs for us: we hold no game, only the view it ships. */
let remoteView: GoSnapshot | null = null;

export function setGoRemoteView(view: unknown): void {
  remoteView = (view as GoSnapshot | null) ?? null;
}

export function isGoGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getGoSnapshot(): GoSnapshot {
  return remoteView ?? buildGoView('player');
}

function mirrorWinner(winner: GoWinner): GoWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

/** The board as `seat` may see it, always computed from the live game. */
export function buildGoView(seat: GoSide): GoSnapshot {
  const g = game;
  if (!g) {
    return {
      open: false, npcId: -1, npcName: '', stakeRubles: 0, board: [], phase: 'finished',
      winner: '', message: '', log: [], cursorX: 0, cursorY: 0, yourTurn: false,
      yourStone: GO_BLACK, yourCaptures: 0, theirCaptures: 0, koIndex: GO_PASS, passes: 0,
      scoreBlack: 0, scoreWhite: GO_KOMI, komi: GO_KOMI,
    };
  }
  const mirror = seat === 'npc';
  const cursor = cursorOf(g, seat);
  const acts = seatToAct(g) === seat;
  const score = goScore(g.board);
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: mirror ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    board: [...g.board],
    phase: g.phase === 'finished' ? 'finished' : acts ? 'player_turn' : 'npc_turn',
    winner: mirror ? mirrorWinner(g.winner) : g.winner,
    message: g.message,
    log: [...g.log],
    cursorX: cursor.x,
    cursorY: cursor.y,
    yourTurn: acts,
    yourStone: mirror ? GO_WHITE : GO_BLACK,
    yourCaptures: mirror ? g.capturesWhite : g.capturesBlack,
    theirCaptures: mirror ? g.capturesBlack : g.capturesWhite,
    koIndex: g.koIndex,
    passes: g.passes,
    scoreBlack: score.black,
    scoreWhite: score.white,
    komi: GO_KOMI,
  };
}

export function handleGoInput(ctx: GoTurnCtx & { input: GoInput; seat?: GoSide }): GoInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  if (g.phase === 'finished') {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) {
      return { handled: true, closeInterface: true };
    }
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Уйти из-за доски — сдаться: ставка достаётся оставшемуся.
    g.winner = otherSide(seat);
    appendLog(g, `${sideName(g, seat)}: сдался.`);
    settleGoGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }

  // Co-op table: both chairs are humans and play through the very same turn
  // code, so the AI block below never runs.
  if (g.remote) {
    if (seatToAct(g) !== seat) return { handled: true };
    return playSeatTurn(g, ctx, seat);
  }

  if (g.phase === 'npc_turn') {
    playAiTurn(g, ctx);
    return { handled: true };
  }
  return playSeatTurn(g, ctx, 'player');
}

/** Walking away mid-table is conceding: the stake goes to whoever stayed. */
function forfeitGo(ctx: GoTurnCtx & { quitter: GoSide }): void {
  const g = game;
  if (!g || g.phase === 'finished') return;
  g.winner = otherSide(ctx.quitter);
  appendLog(g, `${sideName(g, ctx.quitter)}: сдался.`);
  settleGoGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'go',
  title: 'ГО',
  menuLabel: 'Играть в го',
  itemId: 'go_set',
  order: 36,
  stake: goStakeFromNpc,
  start: (ctx, options) => startGoGame(ctx, options),
  close: closeGoGame,
  isOpen: isGoGameOpen,
  input: ctx => handleGoInput(ctx),
  snapshot: getGoSnapshot,
  view: seat => buildGoView(seat),
  setView: setGoRemoteView,
  forfeit: ctx => forfeitGo(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} расстилает разлинованную доску и две банки камней.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      'Камень ставят на пересечение. Группа без дамэ снимается. Ко возвращать сразу нельзя.',
      `Считаем по-китайски: камни и территория, белым коми ${GO_KOMI}.`,
    ],
    message: `${controlBindingLabel('gameMenu')} поставить, ${controlBindingLabel('drop')} пас.`,
  }),
});
