/* ── Шахматы: полные правила, минимакс и вторая табуретка ─────────────────────
 *
 * Одна из настольных игр реестра `systems/tabletop.ts`: правила здесь, панель —
 * в `render/chess_ui.ts` под тем же id.
 *
 * Доска — `Int8Array(64)`, положительный код = сторона `player` (внизу, ходит
 * первой), отрицательный = `npc`. Позиция копируется целиком на каждый ход:
 * 64 байта дешевле, чем аккуратная отмена хода, и перебор всё равно ограничен
 * потолком узлов, а не памятью.
 *
 * Координаты как в шашках: x слева направо, y сверху вниз, y=7 — своя горняя
 * линия у `player`. Поэтому нотация совпадает с настоящей: файл = a..h по x,
 * горизонталь = 8-y, и `player` играет белыми снизу.
 */

import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { mathRng as rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';
import { controlBindingLabel } from './controls';

export type ChessSide = 'player' | 'npc';
export type ChessWinner = ChessSide | 'draw' | '';
export type ChessPhase = 'player_turn' | 'npc_turn' | 'finished';
export type ChessPieceKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type ChessStatus = 'none' | 'check' | 'checkmate' | 'stalemate';

const PAWN = 1;
const KNIGHT = 2;
const BISHOP = 3;
const ROOK = 4;
const QUEEN = 5;
const KING = 6;

const KINDS: readonly ChessPieceKind[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

const BOARD_MAX = 7;

/** Права на рокировку живут битовой маской: сброс права — одна операция при
 *  любом ходе королём или ладьёй и при взятии ладьи на её поле. */
const CASTLE_PLAYER_K = 1;
const CASTLE_PLAYER_Q = 2;
const CASTLE_NPC_K = 4;
const CASTLE_NPC_Q = 8;
const CASTLE_ALL = CASTLE_PLAYER_K | CASTLE_PLAYER_Q | CASTLE_NPC_K | CASTLE_NPC_Q;

const DIAG: readonly (readonly number[])[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO: readonly (readonly number[])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND: readonly (readonly number[])[] = [...ORTHO, ...DIAG];
const KNIGHT_STEPS: readonly (readonly number[])[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

const BACK_RANK: readonly number[] = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];

export interface ChessPosition {
  board: Int8Array;
  turn: ChessSide;
  castle: number;
  /** Поле, на которое можно взять на проходе, или -1. */
  ep: number;
  /** Полуходы без взятий и без ходов пешкой — правило пятидесяти ходов. */
  halfmove: number;
}

export interface ChessMove {
  from: number;
  to: number;
  /** Снятый с доски код (со знаком), 0 если ход тихий. */
  captured: number;
  epCapture: boolean;
  /** 1 — короткая рокировка, -1 — длинная, 0 — обычный ход. */
  castleSide: number;
  promote: boolean;
  /** Пешка через клетку: открывает взятие на проходе. */
  double: boolean;
  /** Порядок перебора; вне поиска не значит ничего. */
  order?: number;
}

export interface ChessPieceView {
  side: ChessSide;
  kind: ChessPieceKind;
  x: number;
  y: number;
}

export interface ChessSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  pieces: readonly ChessPieceView[];
  phase: ChessPhase;
  winner: ChessWinner;
  message: string;
  log: readonly string[];
  cursorX: number;
  cursorY: number;
  /** Поле выбранной фигуры или -1. Клетки — y*8+x в системе смотрящего. */
  selectedSquare: number;
  moveTargets: readonly number[];
  captureTargets: readonly number[];
  lastFrom: number;
  lastTo: number;
  /** Поле короля под шахом или -1. */
  checkSquare: number;
  /** Доска развёрнута на 180°: подписи линий тоже. */
  mirrored: boolean;
  /** False только за кооп-столом, пока ходит второй человек. */
  yourTurn: boolean;
}

export interface ChessInput {
  leftNav?: boolean;
  rightNav?: boolean;
  upNav?: boolean;
  downNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface ChessInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface ChessGame {
  open: boolean;
  npcId: number;
  npcName: string;
  playerName: string;
  stakeRubles: number;
  pos: ChessPosition;
  winner: ChessWinner;
  finished: boolean;
  settled: boolean;
  message: string;
  log: string[];
  cursorX: number;
  cursorY: number;
  selectedSquare: number;
  /** Курсор и выбор кресла 'npc' — в тех же координатах доски. Против ИИ не
   *  используются: машине курсор не нужен. */
  npcCursorX: number;
  npcCursorY: number;
  npcSelectedSquare: number;
  lastFrom: number;
  lastTo: number;
  /** Ключи позиций с последнего необратимого хода — троекратное повторение. */
  history: string[];
  remote: boolean;
}

let game: ChessGame | null = null;

// ── Доска ───────────────────────────────────────────────────────────────────

function sqOf(x: number, y: number): number { return y * 8 + x; }
function sqx(sq: number): number { return sq & 7; }
function sqy(sq: number): number { return sq >> 3; }
function onBoard(x: number, y: number): boolean { return x >= 0 && x < 8 && y >= 0 && y < 8; }

function otherSide(side: ChessSide): ChessSide {
  return side === 'player' ? 'npc' : 'player';
}

function signOf(side: ChessSide): number {
  return side === 'player' ? 1 : -1;
}

function sideOfCode(code: number): ChessSide {
  return code > 0 ? 'player' : 'npc';
}

function isOwn(code: number, side: ChessSide): boolean {
  return side === 'player' ? code > 0 : code < 0;
}

function kindName(code: number): ChessPieceKind {
  return KINDS[Math.abs(code) - 1];
}

function initialBoard(): Int8Array {
  const board = new Int8Array(64);
  for (let x = 0; x < 8; x++) {
    board[sqOf(x, 0)] = -BACK_RANK[x];
    board[sqOf(x, 1)] = -PAWN;
    board[sqOf(x, 6)] = PAWN;
    board[sqOf(x, 7)] = BACK_RANK[x];
  }
  return board;
}

export function initialChessPosition(): ChessPosition {
  return { board: initialBoard(), turn: 'player', castle: CASTLE_ALL, ep: -1, halfmove: 0 };
}

/** Позиция из восьми строк сверху вниз: заглавные — `player`, строчные — `npc`,
 *  точка — пусто. Нужна тестам и отладке, чтобы ставить фикстуры руками. */
export function chessPositionFromRows(
  rows: readonly string[],
  turn: ChessSide = 'player',
  options: { castle?: number; ep?: number; halfmove?: number } = {},
): ChessPosition {
  const board = new Int8Array(64);
  const letters = 'pnbrqk';
  for (let y = 0; y < 8 && y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < 8 && x < row.length; x++) {
      const ch = row[x];
      const idx = letters.indexOf(ch.toLowerCase());
      if (idx < 0) continue;
      const kind = idx + 1;
      board[sqOf(x, y)] = ch === ch.toUpperCase() ? kind : -kind;
    }
  }
  return {
    board,
    turn,
    castle: options.castle ?? 0,
    ep: options.ep ?? -1,
    halfmove: options.halfmove ?? 0,
  };
}

export function chessSquareName(sq: number): string {
  return `${'abcdefgh'[sqx(sq)]}${8 - sqy(sq)}`;
}

// ── Генерация ходов ─────────────────────────────────────────────────────────

function mk(from: number, to: number, captured: number): ChessMove {
  return { from, to, captured, epCapture: false, castleSide: 0, promote: false, double: false };
}

function genPawnMoves(pos: ChessPosition, from: number, out: ChessMove[]): void {
  const side = sideOfCode(pos.board[from]);
  const dy = side === 'player' ? -1 : 1;
  const x = sqx(from);
  const y = sqy(from);
  const lastY = side === 'player' ? 0 : 7;
  const startY = side === 'player' ? 6 : 1;
  if (onBoard(x, y + dy) && pos.board[sqOf(x, y + dy)] === 0) {
    const step = mk(from, sqOf(x, y + dy), 0);
    step.promote = y + dy === lastY;
    out.push(step);
    if (y === startY && pos.board[sqOf(x, y + 2 * dy)] === 0) {
      const jump = mk(from, sqOf(x, y + 2 * dy), 0);
      jump.double = true;
      out.push(jump);
    }
  }
  for (const dx of [-1, 1]) {
    const nx = x + dx;
    const ny = y + dy;
    if (!onBoard(nx, ny)) continue;
    const to = sqOf(nx, ny);
    const target = pos.board[to];
    if (target !== 0 && !isOwn(target, side)) {
      const take = mk(from, to, target);
      take.promote = ny === lastY;
      out.push(take);
    } else if (target === 0 && to === pos.ep) {
      const take = mk(from, to, pos.board[sqOf(nx, y)]);
      take.epCapture = true;
      out.push(take);
    }
  }
}

function genStepMoves(
  pos: ChessPosition, from: number, steps: readonly (readonly number[])[], out: ChessMove[],
): void {
  const side = sideOfCode(pos.board[from]);
  const x = sqx(from);
  const y = sqy(from);
  for (const [dx, dy] of steps) {
    const nx = x + dx;
    const ny = y + dy;
    if (!onBoard(nx, ny)) continue;
    const target = pos.board[sqOf(nx, ny)];
    if (target !== 0 && isOwn(target, side)) continue;
    out.push(mk(from, sqOf(nx, ny), target));
  }
}

function genSlideMoves(
  pos: ChessPosition, from: number, dirs: readonly (readonly number[])[], out: ChessMove[],
): void {
  const side = sideOfCode(pos.board[from]);
  const x = sqx(from);
  const y = sqy(from);
  for (const [dx, dy] of dirs) {
    for (let step = 1; step < 8; step++) {
      const nx = x + dx * step;
      const ny = y + dy * step;
      if (!onBoard(nx, ny)) break;
      const target = pos.board[sqOf(nx, ny)];
      if (target !== 0 && isOwn(target, side)) break;
      out.push(mk(from, sqOf(nx, ny), target));
      if (target !== 0) break;
    }
  }
}

function genCastleMoves(pos: ChessPosition, from: number, out: ChessMove[]): void {
  const side = sideOfCode(pos.board[from]);
  const homeY = side === 'player' ? 7 : 0;
  if (sqx(from) !== 4 || sqy(from) !== homeY) return;
  const enemy = otherSide(side);
  // Через шах не рокируются, и из шаха тоже: поле прибытия проверит общий
  // фильтр легальности, здесь остаются старт и транзит.
  if (isSquareAttacked(pos.board, 4, homeY, enemy)) return;
  const rook = signOf(side) * ROOK;
  const shortBit = side === 'player' ? CASTLE_PLAYER_K : CASTLE_NPC_K;
  const longBit = side === 'player' ? CASTLE_PLAYER_Q : CASTLE_NPC_Q;
  if ((pos.castle & shortBit) !== 0
    && pos.board[sqOf(5, homeY)] === 0 && pos.board[sqOf(6, homeY)] === 0
    && pos.board[sqOf(7, homeY)] === rook
    && !isSquareAttacked(pos.board, 5, homeY, enemy)) {
    const move = mk(from, sqOf(6, homeY), 0);
    move.castleSide = 1;
    out.push(move);
  }
  if ((pos.castle & longBit) !== 0
    && pos.board[sqOf(1, homeY)] === 0 && pos.board[sqOf(2, homeY)] === 0 && pos.board[sqOf(3, homeY)] === 0
    && pos.board[sqOf(0, homeY)] === rook
    && !isSquareAttacked(pos.board, 3, homeY, enemy)) {
    const move = mk(from, sqOf(2, homeY), 0);
    move.castleSide = -1;
    out.push(move);
  }
}

function genPieceMoves(pos: ChessPosition, from: number, out: ChessMove[]): void {
  switch (Math.abs(pos.board[from])) {
    case PAWN: genPawnMoves(pos, from, out); break;
    case KNIGHT: genStepMoves(pos, from, KNIGHT_STEPS, out); break;
    case BISHOP: genSlideMoves(pos, from, DIAG, out); break;
    case ROOK: genSlideMoves(pos, from, ORTHO, out); break;
    case QUEEN: genSlideMoves(pos, from, AROUND, out); break;
    case KING: genStepMoves(pos, from, AROUND, out); genCastleMoves(pos, from, out); break;
    default: break;
  }
}

function genPseudoMoves(pos: ChessPosition, side: ChessSide): ChessMove[] {
  const out: ChessMove[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const code = pos.board[sq];
    if (code !== 0 && isOwn(code, side)) genPieceMoves(pos, sq, out);
  }
  return out;
}

function attackedByRay(
  board: Int8Array, x: number, y: number, dirs: readonly (readonly number[])[], slider: number, queen: number,
): boolean {
  for (const [dx, dy] of dirs) {
    for (let step = 1; step < 8; step++) {
      const nx = x + dx * step;
      const ny = y + dy * step;
      if (!onBoard(nx, ny)) break;
      const code = board[sqOf(nx, ny)];
      if (code === 0) continue;
      if (code === slider || code === queen) return true;
      break;
    }
  }
  return false;
}

export function isSquareAttacked(board: Int8Array, x: number, y: number, by: ChessSide): boolean {
  const s = signOf(by);
  // Пешка `player` идёт вверх, значит бьёт снизу — искать её надо на y+1.
  const pawnY = by === 'player' ? y + 1 : y - 1;
  if (pawnY >= 0 && pawnY < 8) {
    for (const dx of [-1, 1]) {
      if (onBoard(x + dx, pawnY) && board[sqOf(x + dx, pawnY)] === s * PAWN) return true;
    }
  }
  for (const [dx, dy] of KNIGHT_STEPS) {
    if (onBoard(x + dx, y + dy) && board[sqOf(x + dx, y + dy)] === s * KNIGHT) return true;
  }
  for (const [dx, dy] of AROUND) {
    if (onBoard(x + dx, y + dy) && board[sqOf(x + dx, y + dy)] === s * KING) return true;
  }
  if (attackedByRay(board, x, y, ORTHO, s * ROOK, s * QUEEN)) return true;
  return attackedByRay(board, x, y, DIAG, s * BISHOP, s * QUEEN);
}

function kingSquare(board: Int8Array, side: ChessSide): number {
  const code = signOf(side) * KING;
  for (let sq = 0; sq < 64; sq++) if (board[sq] === code) return sq;
  return -1;
}

export function isChessKingAttacked(board: Int8Array, side: ChessSide): boolean {
  const sq = kingSquare(board, side);
  if (sq < 0) return false;
  return isSquareAttacked(board, sqx(sq), sqy(sq), otherSide(side));
}

function castleMaskOfSquare(sq: number): number {
  switch (sq) {
    case 0: return CASTLE_NPC_Q;
    case 7: return CASTLE_NPC_K;
    case 4: return CASTLE_NPC_K | CASTLE_NPC_Q;
    case 56: return CASTLE_PLAYER_Q;
    case 63: return CASTLE_PLAYER_K;
    case 60: return CASTLE_PLAYER_K | CASTLE_PLAYER_Q;
    default: return 0;
  }
}

export function applyChessMove(pos: ChessPosition, move: ChessMove): ChessPosition {
  const board = pos.board.slice();
  const piece = board[move.from];
  const side = sideOfCode(piece);
  const kind = Math.abs(piece);
  board[move.from] = 0;
  if (move.epCapture) board[sqOf(sqx(move.to), sqy(move.from))] = 0;
  board[move.to] = move.promote ? signOf(side) * QUEEN : piece;
  if (move.castleSide !== 0) {
    const y = sqy(move.from);
    const rookFrom = move.castleSide === 1 ? sqOf(7, y) : sqOf(0, y);
    const rookTo = move.castleSide === 1 ? sqOf(5, y) : sqOf(3, y);
    board[rookTo] = board[rookFrom];
    board[rookFrom] = 0;
  }
  const castle = pos.castle & ~castleMaskOfSquare(move.from) & ~castleMaskOfSquare(move.to);
  const ep = move.double ? sqOf(sqx(move.from), (sqy(move.from) + sqy(move.to)) >> 1) : -1;
  const reset = kind === PAWN || move.captured !== 0;
  return { board, turn: otherSide(side), castle, ep, halfmove: reset ? 0 : pos.halfmove + 1 };
}

/** Ход вместе с уже посчитанной позицией после него. Перебор всё равно сделает
 *  этот шаг, поэтому дешевле отдать ему готовое: иначе каждый ход копирует
 *  доску дважды — на проверку легальности и на спуск. */
interface ChessBranch {
  move: ChessMove;
  next: ChessPosition;
}

function legalBranches(pos: ChessPosition, side: ChessSide = pos.turn): ChessBranch[] {
  const enemy = otherSide(side);
  // Короля ищем один раз на позицию, а не на каждый ход: после хода он либо
  // там же, либо ровно на поле прибытия.
  const homeKing = kingSquare(pos.board, side);
  const out: ChessBranch[] = [];
  for (const move of genPseudoMoves(pos, side)) {
    const next = applyChessMove(pos, move);
    const king = move.from === homeKing ? move.to : homeKing;
    if (king >= 0 && isSquareAttacked(next.board, sqx(king), sqy(king), enemy)) continue;
    out.push({ move, next });
  }
  return out;
}

export function legalChessMoves(pos: ChessPosition, side: ChessSide = pos.turn): ChessMove[] {
  return legalBranches(pos, side).map(branch => branch.move);
}

export function chessPositionStatus(pos: ChessPosition): ChessStatus {
  const check = isChessKingAttacked(pos.board, pos.turn);
  if (legalChessMoves(pos, pos.turn).length > 0) return check ? 'check' : 'none';
  return check ? 'checkmate' : 'stalemate';
}

/** Голые короли и король с одной лёгкой фигурой мат не ставят. */
function insufficientMaterial(board: Int8Array): boolean {
  let minors = 0;
  for (let sq = 0; sq < 64; sq++) {
    const kind = Math.abs(board[sq]);
    if (kind === 0 || kind === KING) continue;
    if (kind === PAWN || kind === ROOK || kind === QUEEN) return false;
    minors++;
    if (minors > 1) return false;
  }
  return true;
}

function positionKey(pos: ChessPosition): string {
  let key = `${pos.turn === 'player' ? 'w' : 'b'}${String.fromCharCode(65 + pos.castle, 65 + pos.ep + 1)}`;
  for (let sq = 0; sq < 64; sq++) key += String.fromCharCode(78 + pos.board[sq]);
  return key;
}

// ── Нотация ─────────────────────────────────────────────────────────────────

const FIGURE_LETTER: readonly string[] = ['', 'К', 'С', 'Л', 'Ф', 'Кр'];

export function chessMoveNotation(pos: ChessPosition, move: ChessMove): string {
  if (move.castleSide === 1) return '0-0';
  if (move.castleSide === -1) return '0-0-0';
  const letter = FIGURE_LETTER[Math.abs(pos.board[move.from]) - 1] ?? '';
  const link = move.captured !== 0 ? ':' : '-';
  return `${letter}${chessSquareName(move.from)}${link}${chessSquareName(move.to)}${move.promote ? 'Ф' : ''}`;
}

// ── Оценка ──────────────────────────────────────────────────────────────────

const PIECE_VALUE: readonly number[] = [0, 100, 320, 330, 500, 900, 0];

/* Таблицы полей записаны сверху вниз для стороны `player` (белые внизу); для
 * `npc` тот же квадрат читается зеркально по вертикали. */
const PST_PAWN: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_KNIGHT: readonly number[] = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_BISHOP: readonly number[] = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_ROOK: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_QUEEN: readonly number[] = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_KING_MID: readonly number[] = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST_KING_END: readonly number[] = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];
const PST: readonly (readonly number[])[] = [PST_PAWN, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MID];

/** Ниже этого запаса тяжёлых фигур король перестаёт прятаться и идёт в центр. */
const ENDGAME_MATERIAL = 1300;

/** Плюс — за `npc`: так же, как шашки считают свою доску. */
export function evaluateChessBoard(board: Int8Array): number {
  let heavy = 0;
  for (let sq = 0; sq < 64; sq++) {
    const kind = Math.abs(board[sq]);
    if (kind !== PAWN && kind !== KING) heavy += PIECE_VALUE[kind];
  }
  const endgame = heavy < ENDGAME_MATERIAL;
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const code = board[sq];
    if (code === 0) continue;
    const kind = Math.abs(code);
    const table = kind === KING && endgame ? PST_KING_END : PST[kind - 1];
    const own = code > 0;
    const place = own ? sq : sqOf(sqx(sq), 7 - sqy(sq));
    const value = PIECE_VALUE[kind] + table[place];
    score += own ? -value : value;
  }
  return score;
}

// ── Перебор ─────────────────────────────────────────────────────────────────

const AI_MAX_DEPTH = 4;
/** Жёсткий потолок узлов и потолок времени: первый держит перебор на быстрой
 *  машине, второй — на медленной, где те же узлы стоят втрое дороже. Ход
 *  считается прямо в кадре, поэтому зависать здесь нечему. */
const AI_NODE_CAP = 6000;
const AI_TIME_BUDGET_MS = 24;
const MATE_SCORE = 100000;

let searchNodes = 0;
let searchAborted = false;
let searchStarted = 0;

/** Часы дёргаем раз на 256 узлов: сам вызов дороже проверки счётчика. */
function outOfSearchBudget(): boolean {
  if (searchNodes++ >= AI_NODE_CAP) return true;
  return (searchNodes & 255) === 0 && Date.now() - searchStarted > AI_TIME_BUDGET_MS;
}

function sideScore(pos: ChessPosition): number {
  const score = evaluateChessBoard(pos.board);
  return pos.turn === 'npc' ? score : -score;
}

/** Дешёвая сортировка: сперва крупная добыча дешёвой фигурой, потом превращения.
 *  Без неё альфа-бета почти не режет и потолок узлов съедается впустую. */
function orderBranches(pos: ChessPosition, branches: ChessBranch[]): void {
  for (const { move } of branches) {
    const victim = move.captured !== 0 ? PIECE_VALUE[Math.abs(move.captured)] : 0;
    const attacker = PIECE_VALUE[Math.abs(pos.board[move.from])];
    move.order = victim * 8 - attacker + (move.promote ? 800 : 0);
  }
  branches.sort((a, b) => (b.move.order ?? 0) - (a.move.order ?? 0));
}

/** Спокойный горизонт: досчитываем только взятия, иначе перебор бросает фигуры
 *  ровно на последнем полуходе. */
function quiesce(pos: ChessPosition, alpha: number, beta: number, ply: number): number {
  if (outOfSearchBudget()) { searchAborted = true; return alpha; }
  const branches = legalBranches(pos, pos.turn);
  if (branches.length === 0) return isChessKingAttacked(pos.board, pos.turn) ? -MATE_SCORE + ply : 0;
  const stand = sideScore(pos);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const captures = branches.filter(({ move }) => move.captured !== 0 || move.promote);
  orderBranches(pos, captures);
  for (const branch of captures) {
    const score = -quiesce(branch.next, -beta, -alpha, ply + 1);
    if (searchAborted) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(pos: ChessPosition, depth: number, alpha: number, beta: number, ply: number): number {
  if (outOfSearchBudget()) { searchAborted = true; return alpha; }
  if (depth <= 0) return quiesce(pos, alpha, beta, ply);
  const branches = legalBranches(pos, pos.turn);
  if (branches.length === 0) return isChessKingAttacked(pos.board, pos.turn) ? -MATE_SCORE + ply : 0;
  orderBranches(pos, branches);
  let best = -Infinity;
  for (const branch of branches) {
    const score = -negamax(branch.next, depth - 1, -beta, -alpha, ply + 1);
    if (searchAborted) return best === -Infinity ? alpha : best;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function shuffleRoots(branches: ChessBranch[]): void {
  for (let i = branches.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = branches[i];
    branches[i] = branches[j];
    branches[j] = swap;
  }
}

/** Итеративное углубление: каждая глубина уточняет ход, а исчерпанный потолок
 *  узлов просто отдаёт лучшее из последней ПОЛНОСТЬЮ досчитанной глубины. */
export function chooseChessAiMove(pos: ChessPosition): ChessMove | null {
  const roots = legalBranches(pos, pos.turn);
  if (roots.length === 0) return null;
  searchNodes = 0;
  searchAborted = false;
  searchStarted = Date.now();
  // Тасовка один раз до сортировки: сортировка стабильна, поэтому равные по
  // порядку ходы остаются перемешанными и NPC не играет одну и ту же партию.
  // Разыгрывать равенство внутри цикла нельзя — там счёт отсечённого хода
  // всего лишь граница, а не оценка.
  shuffleRoots(roots);
  orderBranches(pos, roots);
  let best = roots[0];
  for (let depth = 1; depth <= AI_MAX_DEPTH; depth++) {
    let bestScore = -Infinity;
    let bestBranch: ChessBranch | null = null;
    for (const branch of roots) {
      const score = -negamax(branch.next, depth - 1, -Infinity, -bestScore, 1);
      if (searchAborted) break;
      if (score > bestScore) {
        bestScore = score;
        bestBranch = branch;
      }
    }
    if (searchAborted) break;
    if (bestBranch) {
      best = bestBranch;
      // Лучший ход глубины идёт первым на следующей: отсечения работают раньше.
      roots.splice(roots.indexOf(bestBranch), 1);
      roots.unshift(bestBranch);
    }
  }
  return best.move;
}

// ── Партия ──────────────────────────────────────────────────────────────────

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

export function chessStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

function appendLog(g: ChessGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function sideName(g: ChessGame, side: ChessSide): string {
  if (side === 'npc') return g.npcName;
  return g.remote ? g.playerName : 'Вы';
}

function seatToAct(g: ChessGame): ChessSide | null {
  return g.finished ? null : g.pos.turn;
}

function cursorOf(g: ChessGame, seat: ChessSide): { x: number; y: number } {
  return seat === 'player' ? { x: g.cursorX, y: g.cursorY } : { x: g.npcCursorX, y: g.npcCursorY };
}

function setCursor(g: ChessGame, seat: ChessSide, x: number, y: number): void {
  if (seat === 'player') { g.cursorX = x; g.cursorY = y; return; }
  g.npcCursorX = x;
  g.npcCursorY = y;
}

function selectionOf(g: ChessGame, seat: ChessSide): number {
  return seat === 'player' ? g.selectedSquare : g.npcSelectedSquare;
}

function setSelection(g: ChessGame, seat: ChessSide, sq: number): void {
  if (seat === 'player') g.selectedSquare = sq;
  else g.npcSelectedSquare = sq;
}

function clampBoard(v: number): number {
  return Math.max(0, Math.min(BOARD_MAX, v));
}

/** Доска из другого кресла: настоящий разворот стола на 180°, чтобы у второго
 *  человека тоже стояли свои фигуры снизу. */
function mirrorSquare(sq: number): number {
  return sq < 0 ? sq : 63 - sq;
}

function publishChessSettlementEvent(
  state: GameState, player: Entity, npc: Entity, winner: ChessWinner, amount: number, stake: number,
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
    tags: ['gambling', 'chess', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function transferChessStake(
  state: GameState, player: Entity, npc: Entity, winner: ChessWinner, stake: number,
): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishChessSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function settleChessGame(g: ChessGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc' && g.winner !== 'draw')) return;
  g.settled = true;
  g.finished = true;
  if (g.winner === 'draw') {
    appendLog(g, 'Ничья. Деньги остаются в карманах.');
    state.msgs.push(msg('Шахматы: ничья, ставка не переходит.', state.time, '#8cf'));
    return;
  }
  const amount = transferChessStake(state, player, npc, g.winner, g.stakeRubles);
  const line = g.remote
    ? `Шахматы: ${sideName(g, g.winner)} забрал ₽${amount}.`
    : g.winner === 'player'
      ? `Шахматы: вы выиграли ₽${amount}.`
      : `Шахматы: вы проиграли ₽${amount}.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

/** Итог позиции после хода: мат, пат и три ничейных правила. */
function updateGameEnd(g: ChessGame, ctx: { state: GameState; player: Entity; npc: Entity }): void {
  const mover = otherSide(g.pos.turn);
  const status = chessPositionStatus(g.pos);
  if (status === 'checkmate') {
    appendLog(g, `Мат. ${sideName(g, mover)} ставит мат.`);
    g.winner = mover;
  } else if (status === 'stalemate') {
    appendLog(g, 'Пат. Ходить нечем, но шаха нет.');
    g.winner = 'draw';
  } else if (g.pos.halfmove >= 100) {
    appendLog(g, 'Ничья: пятьдесят ходов без взятий и без пешек.');
    g.winner = 'draw';
  } else if (repetitionCount(g) >= 3) {
    appendLog(g, 'Ничья: позиция повторилась трижды.');
    g.winner = 'draw';
  } else if (insufficientMaterial(g.pos.board)) {
    appendLog(g, 'Ничья: матовать нечем.');
    g.winner = 'draw';
  } else if (status === 'check') {
    appendLog(g, `Шах королю. ${sideName(g, g.pos.turn)} под боем.`);
  }
  if (g.winner) settleChessGame(g, ctx.state, ctx.player, ctx.npc);
}

function repetitionCount(g: ChessGame): number {
  if (g.history.length === 0) return 0;
  const key = g.history[g.history.length - 1];
  let count = 0;
  for (const entry of g.history) if (entry === key) count++;
  return count;
}

function commitMove(
  g: ChessGame, ctx: { state: GameState; player: Entity; npc: Entity }, move: ChessMove, side: ChessSide,
): void {
  const notation = chessMoveNotation(g.pos, move);
  const wasPawn = Math.abs(g.pos.board[move.from]) === PAWN;
  g.pos = applyChessMove(g.pos, move);
  g.lastFrom = move.from;
  g.lastTo = move.to;
  // Необратимый ход обнуляет историю: повториться позиция сможет только внутри
  // текущего отрезка, и хранить дальше нечего.
  if (wasPawn || move.captured !== 0) g.history.length = 0;
  g.history.push(positionKey(g.pos));
  appendLog(g, `${sideName(g, side)}: ${notation}`);
  if (move.promote) appendLog(g, 'Пешка прошла. На доске ферзь.');
  if (move.epCapture) appendLog(g, 'Взятие на проходе.');
  updateGameEnd(g, ctx);
}

export function startChessGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { stake?: number; remote?: boolean } = {},
): boolean {
  const stake = options.stake ?? chessStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    playerName: ctx.player.name ?? 'Игрок',
    stakeRubles: stake,
    pos: initialChessPosition(),
    winner: '',
    finished: false,
    settled: false,
    message: '',
    log: [],
    cursorX: 4,
    cursorY: 6,
    selectedSquare: -1,
    npcCursorX: BOARD_MAX - 4,
    npcCursorY: BOARD_MAX - 6,
    npcSelectedSquare: -1,
    lastFrom: -1,
    lastTo: -1,
    history: [],
    remote: options.remote === true,
  };
  game.history.push(positionKey(game.pos));
  appendLog(game, game.remote
    ? `Доска расставлена. Белые у ${game.playerName}, ход первый.`
    : 'Доска расставлена. Белые ваши, ход первый.');
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
    tags: ['gambling', 'chess', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  return true;
}

export function closeChessGame(): void {
  game = null;
}

/** Стол, который ведёт хост: у нас нет партии, только присланный вид. */
let remoteView: ChessSnapshot | null = null;

export function setChessRemoteView(view: unknown): void {
  remoteView = (view as ChessSnapshot | null) ?? null;
}

export function isChessGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getChessSnapshot(): ChessSnapshot {
  return remoteView ?? buildChessView('player');
}

function emptyChessView(): ChessSnapshot {
  return {
    open: false,
    npcId: -1,
    npcName: '',
    stakeRubles: 0,
    pieces: [],
    phase: 'finished',
    winner: '',
    message: '',
    log: [],
    cursorX: 0,
    cursorY: 0,
    selectedSquare: -1,
    moveTargets: [],
    captureTargets: [],
    lastFrom: -1,
    lastTo: -1,
    checkSquare: -1,
    mirrored: false,
    yourTurn: false,
  };
}

function mirrorWinner(winner: ChessWinner): ChessWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

function viewPieces(g: ChessGame, mirror: boolean): ChessPieceView[] {
  const pieces: ChessPieceView[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const code = g.pos.board[sq];
    if (code === 0) continue;
    const seen = mirror ? mirrorSquare(sq) : sq;
    pieces.push({
      side: mirror ? otherSide(sideOfCode(code)) : sideOfCode(code),
      kind: kindName(code),
      x: sqx(seen),
      y: sqy(seen),
    });
  }
  return pieces;
}

export function buildChessView(seat: ChessSide): ChessSnapshot {
  const g = game;
  if (!g) return emptyChessView();
  const mirror = seat === 'npc';
  const cursor = cursorOf(g, seat);
  const acts = seatToAct(g) === seat;
  const selected = selectionOf(g, seat);
  const targets = selected >= 0 ? legalChessMoves(g.pos, g.pos.turn).filter(m => m.from === selected) : [];
  const kingSq = isChessKingAttacked(g.pos.board, g.pos.turn) ? kingSquare(g.pos.board, g.pos.turn) : -1;
  const seen = (sq: number): number => (mirror ? mirrorSquare(sq) : sq);
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: mirror ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    pieces: viewPieces(g, mirror),
    phase: g.finished ? 'finished' : acts ? 'player_turn' : 'npc_turn',
    winner: mirror ? mirrorWinner(g.winner) : g.winner,
    message: g.message,
    log: [...g.log],
    cursorX: mirror ? BOARD_MAX - cursor.x : cursor.x,
    cursorY: mirror ? BOARD_MAX - cursor.y : cursor.y,
    selectedSquare: seen(selected),
    moveTargets: targets.filter(m => m.captured === 0).map(m => seen(m.to)),
    captureTargets: targets.filter(m => m.captured !== 0).map(m => seen(m.to)),
    lastFrom: seen(g.lastFrom),
    lastTo: seen(g.lastTo),
    checkSquare: seen(kingSq),
    mirrored: mirror,
    yourTurn: acts,
  };
}

export function handleChessInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: ChessInput; seat?: ChessSide;
}): ChessInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  if (g.finished) {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Встать из-за стола — сдаться: ставка уходит тому, кто остался.
    g.winner = otherSide(seat);
    settleChessGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }

  // Кооп-стол: оба кресла — люди, ход второго ждёт его же клавиш, и блок ИИ
  // ниже за него не играет.
  if (g.remote) {
    if (seatToAct(g) !== seat) return { handled: true };
    return playSeatTurn(g, ctx, seat);
  }

  if (g.pos.turn === 'npc') {
    const move = chooseChessAiMove(g.pos);
    if (move) commitMove(g, ctx, move, 'npc');
    else updateGameEnd(g, ctx);
    return { handled: true };
  }

  return playSeatTurn(g, ctx, 'player');
}

/** Ход одного кресла: курсор, выбор фигуры, ход или взятие. `seat` — 'player'
 *  против NPC и любое из двух за кооп-столом. Кресло 'npc' смотрит на
 *  развёрнутую доску, поэтому его навигация инвертирована. */
function playSeatTurn(
  g: ChessGame,
  ctx: { state: GameState; player: Entity; npc: Entity; input: ChessInput },
  seat: ChessSide,
): ChessInputResult {
  const flip = seat === 'npc' ? -1 : 1;
  const cursor = cursorOf(g, seat);
  let { x: cx, y: cy } = cursor;
  if (ctx.input.leftNav) cx = clampBoard(cx - flip);
  if (ctx.input.rightNav) cx = clampBoard(cx + flip);
  if (ctx.input.upNav) cy = clampBoard(cy - flip);
  if (ctx.input.downNav) cy = clampBoard(cy + flip);
  setCursor(g, seat, cx, cy);

  if (ctx.input.dropEdge) {
    setSelection(g, seat, -1);
    return { handled: true };
  }
  if (!ctx.input.interactEdge) return { handled: true };

  const target = sqOf(cx, cy);
  const code = g.pos.board[target];
  const selected = selectionOf(g, seat);
  if (selected >= 0) {
    const move = legalChessMoves(g.pos, seat).find(m => m.from === selected && m.to === target);
    if (move) {
      setSelection(g, seat, -1);
      commitMove(g, ctx, move, seat);
      return { handled: true };
    }
    if (code !== 0 && isOwn(code, seat)) {
      selectSquare(g, seat, target);
      return { handled: true };
    }
    setSelection(g, seat, -1);
    return { handled: true };
  }
  if (code !== 0 && isOwn(code, seat)) selectSquare(g, seat, target);
  return { handled: true };
}

function selectSquare(g: ChessGame, seat: ChessSide, sq: number): void {
  if (legalChessMoves(g.pos, seat).some(m => m.from === sq)) {
    setSelection(g, seat, sq);
    return;
  }
  setSelection(g, seat, -1);
  appendLog(g, 'Этой фигуре ходить некуда.');
}

/** Уход из-за стола посреди партии — сдача: ставка достаётся оставшемуся. */
function forfeitChess(ctx: { state: GameState; player: Entity; npc: Entity; quitter: ChessSide }): void {
  const g = game;
  if (!g || g.finished) return;
  g.winner = otherSide(ctx.quitter);
  settleChessGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'chess',
  title: 'ШАХМАТЫ',
  menuLabel: 'Играть в шахматы',
  itemId: 'chess_set',
  order: 35,
  stake: chessStakeFromNpc,
  start: (ctx, options) => startChessGame(ctx, options),
  close: closeChessGame,
  isOpen: isChessGameOpen,
  input: ctx => handleChessInput(ctx),
  snapshot: getChessSnapshot,
  view: seat => buildChessView(seat),
  setView: setChessRemoteView,
  forfeit: ctx => forfeitChess(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} раскладывает доску. Черный ферзь заменен гайкой.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      'Белые ваши, ход первый. Пешка на последней горизонтали становится ферзем.',
    ],
    message: `${controlBindingLabel('gameMenu')} выбрать/ходить, ${controlBindingLabel('drop')} отмена.`,
  }),
});
