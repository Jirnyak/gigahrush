/* ── Морской бой: две страницы в клетку ──────────────────────────────────────
 *
 * Скрытая информация здесь не украшение, а само правило игры. Чужое поле уходит
 * в вид кресла ровно тем массивом выстрелов, который по нему уже отстрелян, —
 * карта чужого флота лежит в другом поле структуры и физически не может попасть
 * ни в панель, ни в сетевой снимок. По этой же причине ИИ получает на вход
 * только массив выстрелов: подсмотреть ему неоткуда.
 *
 * Случайность идет через `mathRng`, как и у остальных настольных игр: партия не
 * попадает в сейв и не трогает симуляцию, а расстановка и выбор залпа принимают
 * явный источник — тесты гоняют их на своем сиде.
 */

import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { mathRng as rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';
import { controlBindingLabel } from './controls';

export type BattleshipSide = 'player' | 'npc';
export type BattleshipWinner = BattleshipSide | '';
export type BattleshipPhase = 'player_turn' | 'npc_turn' | 'finished';
export type BattleshipShotResult = 'invalid' | 'miss' | 'hit' | 'sunk';

export const BATTLESHIP_BOARD_SIZE = 10;
/** Подписи столбцов бумажного поля. */
export const BATTLESHIP_COLUMNS = 'АБВГДЕЖЗИК';
/** Классический флот: один четырехпалубный, два трехпалубных, три двухпалубных,
 *  четыре однопалубных. */
export const BATTLESHIP_FLEET_SIZES: readonly number[] = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

/** Один алфавит клеток для правил, панели и тестов. `SHIP` бывает только на
 *  своем поле — чужое отдается как есть, отстрелянным. */
export const BATTLESHIP_CELL = { EMPTY: 0, SHIP: 1, MISS: 2, HIT: 3, SUNK: 4 } as const;

const { EMPTY, SHIP, MISS, HIT, SUNK } = BATTLESHIP_CELL;
const SIZE = BATTLESHIP_BOARD_SIZE;
const BOARD_MAX = SIZE - 1;
const BOARD_CELLS = SIZE * SIZE;
/** Пауза между залпами ИИ: без нее серия попаданий проходит за один кадр и
 *  игрок видит только итог. */
const NPC_SHOT_DELAY = 0.8;
/** Случайная раскладка изредка загоняет себя в тупик на последнем корабле;
 *  переложить поле целиком дешевле, чем откатывать шаги. */
const FLEET_LAYOUT_ATTEMPTS = 32;

export interface BattleshipShip {
  size: number;
  cells: number[];
  hits: number;
}

export interface BattleshipFleet {
  ships: BattleshipShip[];
  /** Номер корабля + 1, либо 0. Это и есть скрытая половина поля. */
  shipAt: number[];
  /** Что по клетке отстреляно: EMPTY | MISS | HIT | SUNK. Публичная половина. */
  shots: number[];
}

export interface BattleshipSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  /** Свое поле целиком: корабли, промахи, раны, потопленные. */
  own: readonly number[];
  /** Чужое поле ТОЛЬКО отстрелянным. Неотстрелянная клетка всегда EMPTY. */
  enemy: readonly number[];
  ownSunk: number;
  enemySunk: number;
  phase: BattleshipPhase;
  winner: BattleshipWinner;
  message: string;
  log: readonly string[];
  cursorX: number;
  cursorY: number;
  /** Ложь только за чужим ходом. */
  yourTurn: boolean;
}

export interface BattleshipInput {
  leftNav?: boolean;
  rightNav?: boolean;
  upNav?: boolean;
  downNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface BattleshipInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface BattleshipGame {
  open: boolean;
  npcId: number;
  npcName: string;
  playerName: string;
  stakeRubles: number;
  playerFleet: BattleshipFleet;
  npcFleet: BattleshipFleet;
  phase: BattleshipPhase;
  winner: BattleshipWinner;
  settled: boolean;
  message: string;
  log: string[];
  cursorX: number;
  cursorY: number;
  /** Прицел кресла 'npc'. Против ИИ он только показывает, куда тот выстрелил. */
  npcCursorX: number;
  npcCursorY: number;
  /** Кооп-стол: в кресле 'npc' человек, поэтому его ход ждет ввода, а не ИИ. */
  remote: boolean;
  /** Раньше этого времени ИИ не стреляет. */
  npcReadyAt: number;
}

let game: BattleshipGame | null = null;

// ── Поле и флот ──────────────────────────────────────────────────────────────

function cellIndex(x: number, y: number): number {
  return y * SIZE + x;
}

function cellX(cell: number): number {
  return cell % SIZE;
}

function cellY(cell: number): number {
  return (cell / SIZE) | 0;
}

function inBoard(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= BOARD_MAX && y <= BOARD_MAX;
}

export function battleshipCellLabel(cell: number): string {
  return `${BATTLESHIP_COLUMNS[cellX(cell)]}${cellY(cell) + 1}`;
}

function emptyFleet(): BattleshipFleet {
  return { ships: [], shipAt: new Array(BOARD_CELLS).fill(0), shots: new Array(BOARD_CELLS).fill(EMPTY) };
}

/** Корабли не соприкасаются даже углами, поэтому занятой считается вся рамка
 *  вокруг уже стоящего корпуса. */
function fleetFits(fleet: BattleshipFleet, x: number, y: number, size: number, horizontal: boolean): boolean {
  for (let i = 0; i < size; i++) {
    const cx = x + (horizontal ? i : 0);
    const cy = y + (horizontal ? 0 : i);
    if (!inBoard(cx, cy)) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (inBoard(cx + dx, cy + dy) && fleet.shipAt[cellIndex(cx + dx, cy + dy)]) return false;
      }
    }
  }
  return true;
}

function addShip(fleet: BattleshipFleet, x: number, y: number, size: number, horizontal: boolean): void {
  const ship: BattleshipShip = { size, cells: [], hits: 0 };
  for (let i = 0; i < size; i++) {
    const cell = cellIndex(x + (horizontal ? i : 0), y + (horizontal ? 0 : i));
    ship.cells.push(cell);
    fleet.shipAt[cell] = fleet.ships.length + 1;
  }
  fleet.ships.push(ship);
}

function layFleet(rand: () => number): BattleshipFleet {
  const fleet = emptyFleet();
  for (const size of BATTLESHIP_FLEET_SIZES) {
    const spots: number[] = [];
    for (let cell = 0; cell < BOARD_CELLS; cell++) {
      if (fleetFits(fleet, cellX(cell), cellY(cell), size, true)) spots.push(cell * 2);
      if (size > 1 && fleetFits(fleet, cellX(cell), cellY(cell), size, false)) spots.push(cell * 2 + 1);
    }
    if (!spots.length) return fleet;
    const spot = spots[Math.min(spots.length - 1, Math.floor(rand() * spots.length))];
    addShip(fleet, cellX(spot >> 1), cellY(spot >> 1), size, (spot & 1) === 0);
  }
  return fleet;
}

/** Автоматическая расстановка: сторонняя игра должна начинаться сразу, руками
 *  корабли никто не расставляет. */
export function placeBattleshipFleet(rand: () => number = rng): BattleshipFleet {
  let fleet = emptyFleet();
  for (let attempt = 0; attempt < FLEET_LAYOUT_ATTEMPTS && fleet.ships.length < BATTLESHIP_FLEET_SIZES.length; attempt++) {
    fleet = layFleet(rand);
  }
  return fleet;
}

export function battleshipFleetSunkCount(fleet: BattleshipFleet): number {
  let sunk = 0;
  for (const ship of fleet.ships) if (ship.hits >= ship.size) sunk++;
  return sunk;
}

function fleetIsDead(fleet: BattleshipFleet): boolean {
  return fleet.ships.length > 0 && battleshipFleetSunkCount(fleet) === fleet.ships.length;
}

/** Убитый корабль обводится промахами: вокруг него по правилам гарантированно
 *  вода, и добивать соседние клетки незачем. */
function surroundSunkShip(fleet: BattleshipFleet, ship: BattleshipShip): void {
  for (const cell of ship.cells) {
    fleet.shots[cell] = SUNK;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cellX(cell) + dx;
        const ny = cellY(cell) + dy;
        if (inBoard(nx, ny) && fleet.shots[cellIndex(nx, ny)] === EMPTY) fleet.shots[cellIndex(nx, ny)] = MISS;
      }
    }
  }
}

export function fireAtFleet(fleet: BattleshipFleet, cell: number): BattleshipShotResult {
  if (cell < 0 || cell >= BOARD_CELLS || fleet.shots[cell] !== EMPTY) return 'invalid';
  const ship = fleet.ships[fleet.shipAt[cell] - 1];
  if (!ship) {
    fleet.shots[cell] = MISS;
    return 'miss';
  }
  ship.hits++;
  fleet.shots[cell] = HIT;
  if (ship.hits < ship.size) return 'hit';
  surroundSunkShip(fleet, ship);
  return 'sunk';
}

// ── Противник ────────────────────────────────────────────────────────────────

/** Добивание: раненые клетки одного корабля лежат в линию, поэтому после второго
 *  попадания стреляем только по концам линии. */
function finishTargets(shots: readonly number[], wounded: readonly number[]): number[] {
  const sameRow = wounded.every(c => cellY(c) === cellY(wounded[0]));
  const sameCol = wounded.every(c => cellX(c) === cellX(wounded[0]));
  const dirs = wounded.length > 1 && sameRow
    ? [[-1, 0], [1, 0]]
    : wounded.length > 1 && sameCol
      ? [[0, -1], [0, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const out: number[] = [];
  for (const cell of wounded) {
    for (const [dx, dy] of dirs) {
      const nx = cellX(cell) + dx;
      const ny = cellY(cell) + dy;
      if (!inBoard(nx, ny)) continue;
      const next = cellIndex(nx, ny);
      if (shots[next] === EMPTY && !out.includes(next)) out.push(next);
    }
  }
  return out;
}

/** Поиск: шахматный шаг через клетку. Двухпалубник не может спрятаться между
 *  такими клетками, значит половина поля не тратится впустую. */
function searchTargets(shots: readonly number[]): number[] {
  const parity: number[] = [];
  const rest: number[] = [];
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    if (shots[cell] !== EMPTY) continue;
    if ((cellX(cell) + cellY(cell)) % 2 === 0) parity.push(cell);
    else rest.push(cell);
  }
  return parity.length ? parity : rest;
}

/** На входе только отстрелянное чужое поле: заглянуть в чужой флот отсюда
 *  нечем. Возвращает -1, когда стрелять уже некуда. */
export function chooseBattleshipShot(shots: readonly number[], rand: () => number = rng): number {
  const wounded: number[] = [];
  for (let cell = 0; cell < BOARD_CELLS; cell++) if (shots[cell] === HIT) wounded.push(cell);
  let targets = wounded.length ? finishTargets(shots, wounded) : [];
  if (!targets.length) targets = searchTargets(shots);
  if (!targets.length) return -1;
  return targets[Math.min(targets.length - 1, Math.floor(rand() * targets.length))];
}

// ── Партия ───────────────────────────────────────────────────────────────────

function otherSide(side: BattleshipSide): BattleshipSide {
  return side === 'player' ? 'npc' : 'player';
}

function fleetOf(g: BattleshipGame, side: BattleshipSide): BattleshipFleet {
  return side === 'player' ? g.playerFleet : g.npcFleet;
}

/** Чьего ввода ждет поле. */
function seatToAct(g: BattleshipGame): BattleshipSide | null {
  if (g.phase === 'player_turn') return 'player';
  if (g.phase === 'npc_turn') return 'npc';
  return null;
}

function cursorOf(g: BattleshipGame, seat: BattleshipSide): { x: number; y: number } {
  return seat === 'player' ? { x: g.cursorX, y: g.cursorY } : { x: g.npcCursorX, y: g.npcCursorY };
}

function setCursor(g: BattleshipGame, seat: BattleshipSide, x: number, y: number): void {
  if (seat === 'player') { g.cursorX = x; g.cursorY = y; return; }
  g.npcCursorX = x; g.npcCursorY = y;
}

/** Против NPC журнал говорит с единственным читателем, за кооп-столом его
 *  читают оба, поэтому там все названы по имени. */
function sideName(g: BattleshipGame, side: BattleshipSide): string {
  if (side === 'npc') return g.npcName;
  return g.remote ? g.playerName : 'Вы';
}

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

export function battleshipStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

function appendLog(g: BattleshipGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function clampBoard(v: number): number {
  return Math.max(0, Math.min(BOARD_MAX, v));
}

function publishBattleshipSettlementEvent(
  state: GameState, player: Entity, npc: Entity, winner: BattleshipWinner, amount: number, stake: number,
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
    tags: ['gambling', 'battleship', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function transferBattleshipStake(
  state: GameState, player: Entity, npc: Entity, winner: BattleshipWinner, stake: number,
): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishBattleshipSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function settleBattleshipGame(g: BattleshipGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc')) return;
  g.settled = true;
  g.phase = 'finished';
  const amount = transferBattleshipStake(state, player, npc, g.winner, g.stakeRubles);
  const line = g.remote
    ? `Морской бой: ${sideName(g, g.winner)} забрал ₽${amount}.`
    : g.winner === 'player'
      ? `Морской бой: вы выиграли ₽${amount}.`
      : `Морской бой: вы проиграли ₽${amount}.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

export function startBattleshipGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { stake?: number; remote?: boolean; rng?: () => number } = {},
): boolean {
  const stake = options.stake ?? battleshipStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  const rand = options.rng ?? rng;
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    playerName: ctx.player.name ?? 'Игрок',
    stakeRubles: stake,
    playerFleet: placeBattleshipFleet(rand),
    npcFleet: placeBattleshipFleet(rand),
    phase: 'player_turn',
    winner: '',
    settled: false,
    message: '',
    log: [],
    cursorX: 4,
    cursorY: 4,
    npcCursorX: 4,
    npcCursorY: 4,
    remote: options.remote === true,
    npcReadyAt: 0,
  };
  appendLog(game, game.remote
    ? `Поля расчерчены. Первый залп за ${game.playerName}.`
    : 'Поля расчерчены. Флот расставлен. Первый залп ваш.');
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
    tags: ['gambling', 'battleship', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  return true;
}

export function closeBattleshipGame(): void {
  game = null;
}

/** Стол, который ведет хост: своей партии у нас нет, только присланный вид. */
let remoteView: BattleshipSnapshot | null = null;

export function setBattleshipRemoteView(view: unknown): void {
  remoteView = (view as BattleshipSnapshot | null) ?? null;
}

export function isBattleshipGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getBattleshipSnapshot(): BattleshipSnapshot {
  return remoteView ?? buildBattleshipView('player');
}

/** Инспекция для тестов и отладки: настоящая карта флота, которой в снимке нет. */
export function debugBattleshipFleet(side: BattleshipSide): BattleshipFleet | null {
  return game ? fleetOf(game, side) : null;
}

function ownCells(fleet: BattleshipFleet): number[] {
  const out = new Array<number>(BOARD_CELLS);
  for (let cell = 0; cell < BOARD_CELLS; cell++) {
    out[cell] = fleet.shots[cell] !== EMPTY ? fleet.shots[cell] : (fleet.shipAt[cell] ? SHIP : EMPTY);
  }
  return out;
}

/** Поле глазами одного кресла. Свое — целиком, чужое — ТОЛЬКО отстрелянным:
 *  `shots` и есть весь публичный слой, карта кораблей сюда не попадает. */
export function buildBattleshipView(seat: BattleshipSide): BattleshipSnapshot {
  const g = game;
  if (!g) {
    return {
      open: false, npcId: -1, npcName: '', stakeRubles: 0,
      own: [], enemy: [], ownSunk: 0, enemySunk: 0,
      phase: 'finished', winner: '', message: '', log: [],
      cursorX: 0, cursorY: 0, yourTurn: false,
    };
  }
  const own = fleetOf(g, seat);
  const enemy = fleetOf(g, otherSide(seat));
  const cursor = cursorOf(g, seat);
  const acts = seatToAct(g) === seat;
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: seat === 'npc' ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    own: ownCells(own),
    enemy: [...enemy.shots],
    ownSunk: battleshipFleetSunkCount(own),
    enemySunk: battleshipFleetSunkCount(enemy),
    phase: g.phase === 'finished' ? 'finished' : acts ? 'player_turn' : 'npc_turn',
    winner: seat === 'npc' ? mirrorWinner(g.winner) : g.winner,
    message: g.message,
    log: [...g.log],
    cursorX: cursor.x,
    cursorY: cursor.y,
    yourTurn: acts,
  };
}

function mirrorWinner(winner: BattleshipWinner): BattleshipWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

export function handleBattleshipInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: BattleshipInput; seat?: BattleshipSide;
}): BattleshipInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  if (g.phase === 'finished') {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Уйти из-за стола значит сдаться: ставка достается оставшемуся.
    g.winner = otherSide(seat);
    settleBattleshipGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }

  // Кооп-стол: в обоих креслах люди и ходят через один и тот же код, поэтому
  // блок ИИ ниже там не выполняется вовсе.
  if (g.remote) {
    if (seatToAct(g) !== seat) return { handled: true };
    return playSeatTurn(g, ctx, seat);
  }

  if (g.phase === 'npc_turn') return runNpcTurn(g, ctx);
  return playSeatTurn(g, ctx, 'player');
}

/** Один залп кресла: прицел по чужому полю и выстрел. Оба кресла смотрят на
 *  свое поле слева и чужое справа, поэтому переворачивать доску не нужно. */
function playSeatTurn(
  g: BattleshipGame,
  ctx: { state: GameState; player: Entity; npc: Entity; input: BattleshipInput },
  seat: BattleshipSide,
): BattleshipInputResult {
  const cursor = cursorOf(g, seat);
  let { x: cx, y: cy } = cursor;
  if (ctx.input.leftNav) cx = clampBoard(cx - 1);
  if (ctx.input.rightNav) cx = clampBoard(cx + 1);
  if (ctx.input.upNav) cy = clampBoard(cy - 1);
  if (ctx.input.downNav) cy = clampBoard(cy + 1);
  setCursor(g, seat, cx, cy);

  if (!ctx.input.interactEdge) return { handled: true };
  const cell = cellIndex(cx, cy);
  const result = fireAtFleet(fleetOf(g, otherSide(seat)), cell);
  if (result === 'invalid') {
    appendLog(g, 'Сюда уже стреляли.');
    return { handled: true };
  }
  resolveShot(g, ctx, seat, result, cell);
  return { handled: true };
}

const SHOT_WORD: Record<Exclude<BattleshipShotResult, 'invalid'>, string> = {
  miss: 'Мимо',
  hit: 'Ранил',
  sunk: 'Убил',
};

/** Попадание оставляет ход за стрелявшим, промах передает карандаш. */
function resolveShot(
  g: BattleshipGame,
  ctx: { state: GameState; player: Entity; npc: Entity },
  shooter: BattleshipSide,
  result: BattleshipShotResult,
  cell: number,
): void {
  if (result === 'invalid') return;
  appendLog(g, `${sideName(g, shooter)}: ${battleshipCellLabel(cell)} — ${SHOT_WORD[result]}.`);
  if (fleetIsDead(fleetOf(g, otherSide(shooter)))) {
    g.winner = shooter;
    settleBattleshipGame(g, ctx.state, ctx.player, ctx.npc);
    return;
  }
  if (result === 'miss') g.phase = shooter === 'player' ? 'npc_turn' : 'player_turn';
  if (!g.remote && g.phase === 'npc_turn') g.npcReadyAt = ctx.state.time + NPC_SHOT_DELAY;
}

function runNpcTurn(
  g: BattleshipGame,
  ctx: { state: GameState; player: Entity; npc: Entity },
): BattleshipInputResult {
  if (ctx.state.time < g.npcReadyAt) return { handled: true };
  const target = fleetOf(g, 'player');
  const cell = chooseBattleshipShot(target.shots);
  if (cell < 0) {
    g.phase = 'player_turn';
    return { handled: true };
  }
  const result = fireAtFleet(target, cell);
  setCursor(g, 'npc', cellX(cell), cellY(cell));
  resolveShot(g, ctx, 'npc', result, cell);
  return { handled: true };
}

/** Уйти из-за стола посреди партии значит сдаться. */
function forfeitBattleship(ctx: { state: GameState; player: Entity; npc: Entity; quitter: BattleshipSide }): void {
  const g = game;
  if (!g || g.phase === 'finished') return;
  g.winner = otherSide(ctx.quitter);
  settleBattleshipGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'battleship',
  title: 'МОРСКОЙ БОЙ',
  menuLabel: 'Играть в морской бой',
  itemId: 'battleship_pad',
  order: 38,
  stake: battleshipStakeFromNpc,
  start: (ctx, options) => startBattleshipGame(ctx, options),
  close: closeBattleshipGame,
  isOpen: isBattleshipGameOpen,
  input: ctx => handleBattleshipInput(ctx),
  snapshot: getBattleshipSnapshot,
  view: seat => buildBattleshipView(seat),
  setView: setBattleshipRemoteView,
  forfeit: ctx => forfeitBattleship(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} разгибает тетрадь в клетку и подписывает столбцы.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      'Флот расставлен за обоих. Попал — бьешь еще, промазал — отдал карандаш.',
    ],
    message: `${controlBindingLabel('gameMenu')} залп, стрелки наводят прицел.`,
  }),
});
