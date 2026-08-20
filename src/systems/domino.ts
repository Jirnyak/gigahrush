import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';
import { controlBindingLabel } from './controls';

export type DominoSide = 'player' | 'npc';
export type DominoWinner = DominoSide | 'draw' | '';
export type DominoPhase = 'player_turn' | 'npc_turn' | 'finished';
export type DominoEnd = 'left' | 'right';

export interface DominoTile {
  id: number;
  a: number;
  b: number;
}

export interface DominoBoardTile {
  tile: DominoTile;
  left: number;
  right: number;
  side: DominoSide;
}

export interface DominoOpening {
  side: DominoSide;
  tile: DominoTile;
}

export interface DominoSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  playerHand: readonly DominoTile[];
  npcHandCount: number;
  boneyardCount: number;
  board: readonly DominoBoardTile[];
  leftPip: number;
  rightPip: number;
  selectedIndex: number;
  selectedEnd: DominoEnd;
  selectedTile?: DominoTile;
  phase: DominoPhase;
  finished: boolean;
  winner: DominoWinner;
  canPlaySelected: boolean;
  canDrawOrPass: boolean;
  /** False only at a co-op table while the other human moves. */
  yourTurn: boolean;
  message: string;
  log: readonly string[];
}

export interface DominoInput {
  leftNav?: boolean;
  rightNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface DominoInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface DominoGame {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  playerHand: DominoTile[];
  npcHand: DominoTile[];
  boneyard: DominoTile[];
  board: DominoBoardTile[];
  selectedIndex: number;
  selectedEnd: DominoEnd;
  /** Cursor and chosen board end of the 'npc' seat. Unused against an NPC — the
   *  AI needs neither — and only alive at a co-op table. */
  npcSelectedIndex: number;
  npcSelectedEnd: DominoEnd;
  phase: DominoPhase;
  /** Co-op table: a human sits in the 'npc' seat, so `advanceNpc` stands down
   *  and the turn waits for that seat's input. */
  remote: boolean;
  /** Display name of the 'player' seat, for mirroring the table. */
  playerName: string;
  winner: DominoWinner;
  settled: boolean;
  passStreak: number;
  openingTileId: number;
  message: string;
  log: string[];
}

const MAX_PIP = 6;
const HAND_SIZE = 7;
const MAX_NPC_STEPS = 32;
const emptyTile: DominoTile = { id: -1, a: 0, b: 0 };
let game: DominoGame | null = null;

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

function appendLog(g: DominoGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function tileSum(tile: DominoTile): number {
  return tile.a + tile.b;
}

function isDouble(tile: DominoTile): boolean {
  return tile.a === tile.b;
}

function formatDominoTile(tile: DominoTile): string {
  return `${tile.a}:${tile.b}`;
}

function handPipSum(hand: readonly DominoTile[]): number {
  let sum = 0;
  for (const tile of hand) sum += tileSum(tile);
  return sum;
}

function boardLeftPip(board: readonly DominoBoardTile[]): number {
  return board[0]?.left ?? -1;
}

function boardRightPip(board: readonly DominoBoardTile[]): number {
  return board[board.length - 1]?.right ?? -1;
}

function updateSelection(g: DominoGame): void {
  g.selectedIndex = clampCursor(g.playerHand, g.selectedIndex);
  g.npcSelectedIndex = clampCursor(g.npcHand, g.npcSelectedIndex);
}

function clampCursor(hand: readonly DominoTile[], index: number): number {
  if (hand.length <= 0) return 0;
  return Math.max(0, Math.min(hand.length - 1, index));
}

function cursorOf(g: DominoGame, side: DominoSide): number {
  return side === 'player' ? g.selectedIndex : g.npcSelectedIndex;
}

function setCursor(g: DominoGame, side: DominoSide, index: number): void {
  if (side === 'player') g.selectedIndex = index;
  else g.npcSelectedIndex = index;
}

function endOf(g: DominoGame, side: DominoSide): DominoEnd {
  return side === 'player' ? g.selectedEnd : g.npcSelectedEnd;
}

function setEnd(g: DominoGame, side: DominoSide, end: DominoEnd): void {
  if (side === 'player') g.selectedEnd = end;
  else g.npcSelectedEnd = end;
}

/** Whose input the table waits for. */
function seatToAct(g: DominoGame): DominoSide | null {
  if (g.phase === 'player_turn') return 'player';
  if (g.phase === 'npc_turn') return 'npc';
  return null;
}

/** Log voice: against an NPC the log speaks to the one human reading it, at a
 *  co-op table both seats read it, so everyone is named. */
function sideName(g: DominoGame, side: DominoSide): string {
  if (side === 'npc') return g.npcName;
  return g.remote ? g.playerName : 'Вы';
}

function sortOpeningCandidate(a: DominoTile, b: DominoTile): number {
  const aDouble = isDouble(a);
  const bDouble = isDouble(b);
  if (aDouble !== bDouble) return aDouble ? -1 : 1;
  if (aDouble && bDouble) return b.a - a.a;
  return tileSum(b) - tileSum(a) || Math.max(b.a, b.b) - Math.max(a.a, a.b) || b.id - a.id;
}

function bestOpeningTile(hand: readonly DominoTile[]): DominoTile | null {
  return hand.slice().sort(sortOpeningCandidate)[0] ?? null;
}

function removeTileById(hand: DominoTile[], tileId: number): DominoTile | null {
  const idx = hand.findIndex(tile => tile.id === tileId);
  if (idx < 0) return null;
  return hand.splice(idx, 1)[0] ?? null;
}

function handOf(g: DominoGame, side: DominoSide): DominoTile[] {
  return side === 'player' ? g.playerHand : g.npcHand;
}

function otherSide(side: DominoSide): DominoSide {
  return side === 'player' ? 'npc' : 'player';
}

function legalEndsForTile(g: DominoGame, tile: DominoTile): DominoEnd[] {
  if (g.board.length === 0) return tile.id === g.openingTileId ? ['right'] : [];
  const ends: DominoEnd[] = [];
  const left = boardLeftPip(g.board);
  const right = boardRightPip(g.board);
  if (tile.a === left || tile.b === left) ends.push('left');
  if (tile.a === right || tile.b === right) ends.push('right');
  return ends;
}

function hasAnyLegalMove(g: DominoGame, side: DominoSide): boolean {
  for (const tile of handOf(g, side)) if (legalEndsForTile(g, tile).length > 0) return true;
  return false;
}

function canPlaceSelected(g: DominoGame, side: DominoSide = 'player'): boolean {
  const tile = handOf(g, side)[cursorOf(g, side)];
  if (!tile || seatToAct(g) !== side) return false;
  return legalEndsForTile(g, tile).length > 0;
}

function orientForEnd(tile: DominoTile, end: DominoEnd, board: readonly DominoBoardTile[]): { left: number; right: number } | null {
  if (board.length === 0) return { left: tile.a, right: tile.b };
  if (end === 'left') {
    const left = boardLeftPip(board);
    if (tile.a === left) return { left: tile.b, right: tile.a };
    if (tile.b === left) return { left: tile.a, right: tile.b };
    return null;
  }
  const right = boardRightPip(board);
  if (tile.a === right) return { left: tile.a, right: tile.b };
  if (tile.b === right) return { left: tile.b, right: tile.a };
  return null;
}

function placeTile(g: DominoGame, side: DominoSide, tile: DominoTile, end: DominoEnd): boolean {
  const legal = legalEndsForTile(g, tile);
  if (legal.length <= 0) return false;
  const actualEnd = g.board.length === 0 ? 'right' : legal.includes(end) ? end : legal[0];
  if (!actualEnd) return false;
  const oriented = orientForEnd(tile, actualEnd, g.board);
  if (!oriented) return false;
  const removed = removeTileById(handOf(g, side), tile.id);
  if (!removed) return false;
  const boardTile: DominoBoardTile = { tile: removed, left: oriented.left, right: oriented.right, side };
  if (g.board.length === 0 || actualEnd === 'right') g.board.push(boardTile);
  else g.board.unshift(boardTile);
  g.openingTileId = -1;
  g.passStreak = 0;
  appendLog(g, `${side === 'player' ? 'Вы кладете' : g.npcName + ' кладет'} ${formatDominoTile(removed)}.`);
  updateSelection(g);
  return true;
}

function winnerAfterMove(g: DominoGame): DominoWinner {
  const playerEmpty = g.playerHand.length === 0;
  const npcEmpty = g.npcHand.length === 0;
  if (playerEmpty && npcEmpty) return 'draw';
  if (playerEmpty) return 'player';
  if (npcEmpty) return 'npc';
  return '';
}

export function dominoWinnerForBlocked(playerHand: readonly DominoTile[], npcHand: readonly DominoTile[]): DominoWinner {
  const playerSum = handPipSum(playerHand);
  const npcSum = handPipSum(npcHand);
  if (playerSum < npcSum) return 'player';
  if (npcSum < playerSum) return 'npc';
  return 'draw';
}

function publishDominoSettlementEvent(state: GameState, player: Entity, npc: Entity, winner: DominoWinner, amount: number, stake: number): void {
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
    tags: ['gambling', 'domino', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function transferDominoStake(state: GameState, player: Entity, npc: Entity, winner: DominoWinner, stake: number): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishDominoSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function settleDominoGame(g: DominoGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc' && g.winner !== 'draw')) return;
  g.settled = true;
  g.phase = 'finished';
  if (g.winner === 'draw') {
    appendLog(g, 'Домино встало. По очкам ничья, деньги остаются при себе.');
    state.msgs.push(msg('Домино: ничья, ставка не переходит.', state.time, '#8cf'));
    return;
  }
  const amount = transferDominoStake(state, player, npc, g.winner, g.stakeRubles);
  const line = g.winner === 'player'
    ? `Домино: вы выиграли ₽${amount}.`
    : `Домино: вы проиграли ₽${amount}.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

function finishBlocked(g: DominoGame, state: GameState, player: Entity, npc: Entity): void {
  g.winner = dominoWinnerForBlocked(g.playerHand, g.npcHand);
  appendLog(g, `Рыба. Очки: вы ${handPipSum(g.playerHand)}, ${g.npcName} ${handPipSum(g.npcHand)}.`);
  settleDominoGame(g, state, player, npc);
}

function finishMoveOrPassTurn(g: DominoGame, state: GameState, player: Entity, npc: Entity, next: DominoSide): void {
  const winner = winnerAfterMove(g);
  if (winner) {
    g.winner = winner;
    settleDominoGame(g, state, player, npc);
    return;
  }
  g.phase = next === 'player' ? 'player_turn' : 'npc_turn';
}

function chooseNpcMove(g: DominoGame): { tile: DominoTile; end: DominoEnd } | null {
  let best: { tile: DominoTile; end: DominoEnd; score: number } | null = null;
  for (const tile of g.npcHand) {
    for (const end of legalEndsForTile(g, tile)) {
      const doubleBonus = isDouble(tile) ? 8 : 0;
      const edgeBonus = end === g.selectedEnd ? 1 : 0;
      const score = tileSum(tile) * 4 + doubleBonus + edgeBonus;
      if (!best || score > best.score || (score === best.score && tile.id > best.tile.id)) best = { tile, end, score };
    }
  }
  return best ? { tile: best.tile, end: best.end } : null;
}

function drawUntilPlayable(g: DominoGame, side: DominoSide): boolean {
  const hand = handOf(g, side);
  while (!hasAnyLegalMove(g, side) && g.boneyard.length > 0) {
    const tile = g.boneyard.shift();
    if (tile) hand.push(tile);
  }
  updateSelection(g);
  return hasAnyLegalMove(g, side);
}

function passTurn(g: DominoGame, state: GameState, player: Entity, npc: Entity, side: DominoSide): void {
  g.passStreak++;
  appendLog(g, `${sideName(g, side)} ${side === 'player' && !g.remote ? 'пропускаете' : 'пропускает'} ход.`);
  if (g.passStreak >= 2 && g.boneyard.length === 0) {
    finishBlocked(g, state, player, npc);
    return;
  }
  finishMoveOrPassTurn(g, state, player, npc, otherSide(side));
}

function advanceNpc(g: DominoGame, state: GameState, player: Entity, npc: Entity): void {
  // Co-op table: a human sits in the 'npc' seat, so nothing moves for it.
  if (g.remote) return;
  for (let guard = 0; guard < MAX_NPC_STEPS && g.phase === 'npc_turn'; guard++) {
    let move = chooseNpcMove(g);
    if (!move) {
      if (drawUntilPlayable(g, 'npc')) {
        appendLog(g, `${g.npcName} добирает из коробки.`);
        move = chooseNpcMove(g);
      } else {
        passTurn(g, state, player, npc, 'npc');
        return;
      }
    }
    if (move && placeTile(g, 'npc', move.tile, move.end)) {
      finishMoveOrPassTurn(g, state, player, npc, 'player');
      return;
    }
  }
}

export function makeDominoTile(a: number, b: number): DominoTile {
  const aa = Math.max(0, Math.min(MAX_PIP, Math.floor(a)));
  const bb = Math.max(0, Math.min(MAX_PIP, Math.floor(b)));
  const lo = Math.min(aa, bb);
  const hi = Math.max(aa, bb);
  let id = 0;
  for (let x = 0; x <= MAX_PIP; x++) {
    for (let y = x; y <= MAX_PIP; y++) {
      if (x === lo && y === hi) return { id, a: lo, b: hi };
      id++;
    }
  }
  return emptyTile;
}

export function createDominoSet(): DominoTile[] {
  const set: DominoTile[] = [];
  let id = 0;
  for (let a = 0; a <= MAX_PIP; a++) {
    for (let b = a; b <= MAX_PIP; b++) set.push({ id: id++, a, b });
  }
  return set;
}

export function shuffleDominoSet(set: readonly DominoTile[], rand = rng): DominoTile[] {
  const out = set.map(tile => ({ ...tile }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(rand() * (i + 1))));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function chooseDominoOpening(playerHand: readonly DominoTile[], npcHand: readonly DominoTile[]): DominoOpening | null {
  const playerBest = bestOpeningTile(playerHand);
  const npcBest = bestOpeningTile(npcHand);
  if (!playerBest && !npcBest) return null;
  if (playerBest && !npcBest) return { side: 'player', tile: playerBest };
  if (npcBest && !playerBest) return { side: 'npc', tile: npcBest };
  if (!playerBest || !npcBest) return null;
  return sortOpeningCandidate(playerBest, npcBest) <= 0
    ? { side: 'player', tile: playerBest }
    : { side: 'npc', tile: npcBest };
}

export function dominoTileFits(tile: DominoTile, leftPip: number, rightPip: number, end: DominoEnd): boolean {
  const pip = end === 'left' ? leftPip : rightPip;
  return pip < 0 || tile.a === pip || tile.b === pip;
}

export function dominoStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

export function startDominoGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { rng?: () => number; deck?: readonly DominoTile[]; stake?: number; remote?: boolean } = {},
): boolean {
  const stake = options.stake ?? dominoStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  const deck = options.deck ? options.deck.map(tile => ({ ...tile })) : shuffleDominoSet(createDominoSet(), options.rng);
  if (deck.length < HAND_SIZE * 2) return false;
  const playerHand: DominoTile[] = [];
  const npcHand: DominoTile[] = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    const playerTile = deck.shift();
    const npcTile = deck.shift();
    if (playerTile) playerHand.push(playerTile);
    if (npcTile) npcHand.push(npcTile);
  }
  const opening = chooseDominoOpening(playerHand, npcHand);
  if (!opening) return false;
  const selectedIndex = Math.max(0, playerHand.findIndex(tile => tile.id === opening.tile.id));
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    stakeRubles: stake,
    playerHand,
    npcHand,
    boneyard: deck,
    board: [],
    selectedIndex,
    selectedEnd: 'right',
    npcSelectedIndex: Math.max(0, npcHand.findIndex(tile => tile.id === opening.tile.id)),
    npcSelectedEnd: 'right',
    phase: opening.side === 'player' ? 'player_turn' : 'npc_turn',
    remote: options.remote === true,
    playerName: ctx.player.name ?? 'Игрок',
    winner: '',
    settled: false,
    passStreak: 0,
    openingTileId: opening.tile.id,
    message: '',
    log: [],
  };
  appendLog(game, `Домино роздано. Первым ходит ${opening.side === 'player' && !game.remote ? 'вы' : sideName(game, opening.side)}: ${formatDominoTile(opening.tile)}.`);
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
    tags: ['gambling', 'domino', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  advanceNpc(game, ctx.state, ctx.player, ctx.npc);
  return true;
}

export function closeDominoGame(): void {
  game = null;
}

/** A table the host runs for us: we hold no game, only the view it ships. */
let remoteView: DominoSnapshot | null = null;

export function setDominoRemoteView(view: unknown): void {
  remoteView = (view as DominoSnapshot | null) ?? null;
}

export function isDominoGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getDominoSnapshot(): DominoSnapshot {
  return remoteView ?? buildDominoView('player');
}

/** The table as `seat` may see it, always computed from the live game. */
function buildDominoView(seat: DominoSide): DominoSnapshot {
  const g = game;
  if (!g) {
    return {
      open: false,
      npcId: -1,
      npcName: '',
      stakeRubles: 0,
      playerHand: [],
      npcHandCount: 0,
      boneyardCount: 0,
      board: [],
      leftPip: -1,
      rightPip: -1,
      selectedIndex: 0,
      selectedEnd: 'right',
      phase: 'finished',
      finished: false,
      winner: '',
      canPlaySelected: false,
      canDrawOrPass: false,
      yourTurn: false,
      message: '',
      log: [],
    };
  }
  updateSelection(g);
  // Told from `seat`'s chair: own hand, opponent's count. For 'player' this is
  // the original view verbatim.
  const mirror = seat === 'npc';
  const own = handOf(g, seat);
  const acts = seatToAct(g) === seat;
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: mirror ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    playerHand: [...own],
    npcHandCount: handOf(g, mirror ? 'player' : 'npc').length,
    boneyardCount: g.boneyard.length,
    board: g.board.map(tile => ({ tile: tile.tile, left: tile.left, right: tile.right, side: tile.side })),
    leftPip: boardLeftPip(g.board),
    rightPip: boardRightPip(g.board),
    selectedIndex: cursorOf(g, seat),
    selectedEnd: endOf(g, seat),
    selectedTile: own[cursorOf(g, seat)],
    phase: g.phase === 'finished' ? 'finished' : acts ? 'player_turn' : 'npc_turn',
    finished: g.phase === 'finished',
    winner: mirror ? mirrorWinner(g.winner) : g.winner,
    canPlaySelected: canPlaceSelected(g, seat),
    canDrawOrPass: acts && !hasAnyLegalMove(g, seat),
    yourTurn: acts,
    message: g.message,
    log: [...g.log],
  };
}

function mirrorWinner(winner: DominoWinner): DominoWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

export function handleDominoInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: DominoInput; seat?: DominoSide;
}): DominoInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  const hand = handOf(g, seat);
  if (ctx.input.leftNav) {
    setCursor(g, seat, Math.max(0, cursorOf(g, seat) - 1));
    return { handled: true };
  }
  if (ctx.input.rightNav) {
    setCursor(g, seat, Math.min(Math.max(0, hand.length - 1), cursorOf(g, seat) + 1));
    return { handled: true };
  }
  if (g.phase === 'finished') {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Walking away is conceding: the stake goes to whoever stayed.
    g.winner = seat === 'player' ? 'npc' : 'player';
    settleDominoGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }
  if (ctx.input.dropEdge) {
    setEnd(g, seat, endOf(g, seat) === 'left' ? 'right' : 'left');
    appendLog(g, `Сторона выкладки: ${endOf(g, seat) === 'left' ? 'левая' : 'правая'}.`);
    return { handled: true };
  }
  if (seatToAct(g) !== seat) return { handled: true };
  if (ctx.input.interactEdge) {
    const tile = hand[cursorOf(g, seat)];
    const legal = tile ? legalEndsForTile(g, tile) : [];
    if (tile && legal.length > 0) {
      const chosen = endOf(g, seat);
      const end = legal.includes(chosen) ? chosen : legal[0];
      if (placeTile(g, seat, tile, end)) {
        finishMoveOrPassTurn(g, ctx.state, ctx.player, ctx.npc, seat === 'player' ? 'npc' : 'player');
        advanceNpc(g, ctx.state, ctx.player, ctx.npc);
      }
      return { handled: true };
    }
    if (hasAnyLegalMove(g, seat)) {
      appendLog(g, 'Эта костяшка не подходит к краям.');
      return { handled: true };
    }
    if (drawUntilPlayable(g, seat)) {
      appendLog(g, `${sideName(g, seat)} ${seat === 'player' && !g.remote ? 'добираете' : 'добирает'} из коробки. Подходящая костяшка уже в руке.`);
      return { handled: true };
    }
    passTurn(g, ctx.state, ctx.player, ctx.npc, seat);
    advanceNpc(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true };
  }
  return { handled: true };
}

/** Walking away mid-table is conceding: the stake goes to whoever stayed. */
function forfeitDomino(ctx: { state: GameState; player: Entity; npc: Entity; quitter: DominoSide }): void {
  const g = game;
  if (!g || g.phase === 'finished') return;
  g.winner = otherSide(ctx.quitter);
  settleDominoGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'domino',
  title: 'ДОМИНО',
  menuLabel: 'Играть в домино',
  itemId: 'domino_box',
  order: 32,
  stake: dominoStakeFromNpc,
  start: (ctx, options) => startDominoGame(ctx, options),
  close: closeDominoGame,
  isOpen: isDominoGameOpen,
  input: ctx => handleDominoInput(ctx),
  snapshot: getDominoSnapshot,
  view: seat => buildDominoView(seat),
  setView: setDominoRemoteView,
  forfeit: ctx => forfeitDomino(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} высыпает костяшки из коробки.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      'По 7 костяшек. Кладите к совпадающему краю; если хода нет, добирайте из коробки.',
    ],
    message: `${controlBindingLabel('gameMenu')} сыграть/добрать, ${controlBindingLabel('drop')} меняет левый/правый край.`,
  }),
});
