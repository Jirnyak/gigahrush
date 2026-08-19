import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { mathRng as rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';
import { controlBindingLabel } from './controls';

export type DiceSide = 'player' | 'npc';

export type DiceWinner = 'player' | 'npc' | 'draw' | '';
export type DicePhase = 'player_turn' | 'npc_turn' | 'finished';

export interface DiceRoll {
  dieA: number;
  dieB: number;
  total: number;
}

export interface DiceSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  playerScore: number;
  npcScore: number;
  playerRolls: readonly DiceRoll[];
  npcRolls: readonly DiceRoll[];
  phase: DicePhase;
  finished: boolean;
  winner: DiceWinner;
  canRoll: boolean;
  canStop: boolean;
  /** False only at a co-op table while the other human rolls. */
  yourTurn: boolean;
  message: string;
  log: readonly string[];
}

export interface DiceInput {
  leftNav?: boolean;
  rightNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface DiceInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface DiceGame {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  playerScore: number;
  npcScore: number;
  playerRolls: DiceRoll[];
  npcRolls: DiceRoll[];
  phase: DicePhase;
  /** Co-op table: a human sits in the 'npc' seat, so its turn waits for input
   *  instead of being rolled out by `playNpcTurn`. */
  remote: boolean;
  /** Display name of the 'player' seat, for mirroring the table. */
  playerName: string;
  winner: DiceWinner;
  settled: boolean;
  message: string;
  log: string[];
}

const MAX_SCORE = 21;
const NPC_HOLD_FLOOR = 16;
const NPC_ROLL_GUARD = 8;
let game: DiceGame | null = null;

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

function appendLog(g: DiceGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function rollDie(rng: () => number): number {
  return Math.max(1, Math.min(6, Math.floor(rng() * 6) + 1));
}

/** Log voice: against an NPC the log speaks to the one human reading it, at a
 *  co-op table both seats read it, so everyone is named. */
function sideName(g: DiceGame, side: DiceSide): string {
  if (side === 'npc') return g.npcName;
  return g.remote ? g.playerName : 'Вы';
}

function addRoll(g: DiceGame, side: DiceSide, roll: DiceRoll): void {
  if (side === 'player') {
    g.playerRolls.push(roll);
    g.playerScore += roll.total;
    appendLog(g, `${sideName(g, 'player')} ${g.remote ? 'бросает' : 'бросили'} ${roll.dieA}+${roll.dieB}. Сумма ${g.playerScore}.`);
    return;
  }
  g.npcRolls.push(roll);
  g.npcScore += roll.total;
  appendLog(g, `${g.npcName} бросает ${roll.dieA}+${roll.dieB}. Сумма ${g.npcScore}.`);
}

function scoreOf(g: DiceGame, side: DiceSide): number {
  return side === 'player' ? g.playerScore : g.npcScore;
}

/** Whose input the table waits for. */
function seatToAct(g: DiceGame): DiceSide | null {
  if (g.phase === 'player_turn') return 'player';
  if (g.phase === 'npc_turn') return 'npc';
  return null;
}

function otherSide(side: DiceSide): DiceSide {
  return side === 'player' ? 'npc' : 'player';
}

function publishDiceSettlementEvent(state: GameState, player: Entity, npc: Entity, winner: DiceWinner, amount: number, stake: number): void {
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
    tags: ['gambling', 'dice', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function diceStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

export function rollDicePair(rand = rng): DiceRoll {
  const dieA = rollDie(rand);
  const dieB = rollDie(rand);
  return { dieA, dieB, total: dieA + dieB };
}

export function diceWinnerFor(playerScore: number, npcScore: number): DiceWinner {
  const playerOk = playerScore <= MAX_SCORE;
  const npcOk = npcScore <= MAX_SCORE;
  if (playerOk && !npcOk) return 'player';
  if (!playerOk && npcOk) return 'npc';
  if (!playerOk && !npcOk) return 'draw';
  if (playerScore > npcScore) return 'player';
  if (npcScore > playerScore) return 'npc';
  return 'draw';
}

export function transferDiceStake(state: GameState, player: Entity, npc: Entity, winner: DiceWinner, stake: number): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishDiceSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function settleDiceGame(g: DiceGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc' && g.winner !== 'draw')) return;
  g.settled = true;
  g.phase = 'finished';
  if (g.winner === 'draw') {
    appendLog(g, 'Ничья. Деньги остаются в карманах.');
    state.msgs.push(msg('Кости: ничья, ставка не переходит.', state.time, '#8cf'));
    return;
  }
  const amount = transferDiceStake(state, player, npc, g.winner, g.stakeRubles);
  const line = g.remote
    ? `Кости: ${sideName(g, g.winner)} забрал ₽${amount}.`
    : g.winner === 'player'
      ? `Кости: вы выиграли ₽${amount}.`
      : `Кости: вы проиграли ₽${amount}.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

function finishByScore(g: DiceGame, state: GameState, player: Entity, npc: Entity): void {
  g.winner = diceWinnerFor(g.playerScore, g.npcScore);
  settleDiceGame(g, state, player, npc);
}

function playNpcTurn(g: DiceGame, state: GameState, player: Entity, npc: Entity, rng: () => number): void {
  g.phase = 'npc_turn';
  appendLog(g, `${g.npcName} берет кости.`);
  for (let guard = 0; guard < NPC_ROLL_GUARD; guard++) {
    if (g.npcScore > MAX_SCORE) break;
    const needsRoll = g.npcScore <= 0 || g.npcScore < NPC_HOLD_FLOOR || g.npcScore < g.playerScore;
    if (!needsRoll) break;
    addRoll(g, 'npc', rollDicePair(rng));
  }
  finishByScore(g, state, player, npc);
}

export function startDiceGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { stake?: number; remote?: boolean } = {},
): boolean {
  const stake = options.stake ?? diceStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    stakeRubles: stake,
    playerScore: 0,
    npcScore: 0,
    playerRolls: [],
    npcRolls: [],
    phase: 'player_turn',
    remote: options.remote === true,
    playerName: ctx.player.name ?? 'Игрок',
    winner: '',
    settled: false,
    message: '',
    log: [],
  };
  appendLog(game, 'Кости на столе. Бросайте до 21 или остановитесь раньше.');
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
    tags: ['gambling', 'dice', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  return true;
}

export function closeDiceGame(): void {
  game = null;
}

/** A table the host runs for us: we hold no game, only the view it ships. */
let remoteView: DiceSnapshot | null = null;

export function setDiceRemoteView(view: unknown): void {
  remoteView = (view as DiceSnapshot | null) ?? null;
}

export function isDiceGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

export function getDiceSnapshot(): DiceSnapshot {
  return remoteView ?? buildDiceView('player');
}

/** The table as `seat` may see it, always computed from the live game. */
function buildDiceView(seat: DiceSide): DiceSnapshot {
  const g = game;
  if (!g) {
    return {
      open: false,
      npcId: -1,
      npcName: '',
      stakeRubles: 0,
      playerScore: 0,
      npcScore: 0,
      playerRolls: [],
      npcRolls: [],
      phase: 'finished',
      finished: false,
      winner: '',
      canRoll: false,
      canStop: false,
      yourTurn: false,
      message: '',
      log: [],
    };
  }
  // Told from `seat`'s chair: own score first, opponent's second. For 'player'
  // this is the original view verbatim.
  const mirror = seat === 'npc';
  const own = scoreOf(g, seat);
  const acts = seatToAct(g) === seat;
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: mirror ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    playerScore: own,
    npcScore: scoreOf(g, otherSide(seat)),
    playerRolls: [...(seat === 'player' ? g.playerRolls : g.npcRolls)],
    npcRolls: [...(seat === 'player' ? g.npcRolls : g.playerRolls)],
    phase: g.phase === 'finished' ? 'finished' : acts ? 'player_turn' : 'npc_turn',
    finished: g.phase === 'finished',
    winner: mirror ? mirrorWinner(g.winner) : g.winner,
    canRoll: acts && own <= MAX_SCORE,
    canStop: acts && own > 0 && own <= MAX_SCORE,
    yourTurn: acts,
    message: g.message,
    log: [...g.log],
  };
}

function mirrorWinner(winner: DiceWinner): DiceWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

export function handleDiceInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: DiceInput; rng?: () => number; seat?: DiceSide;
}): DiceInputResult {
  const g = game;
  if (!g?.open || g.npcId !== ctx.npc.id) return { handled: false };
  const seat = ctx.seat ?? 'player';
  if (ctx.input.leftNav || ctx.input.rightNav) return { handled: true };
  if (g.phase === 'finished') {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Walking away is conceding: the stake goes to whoever stayed.
    g.winner = otherSide(seat);
    settleDiceGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }
  if (seatToAct(g) !== seat) return { handled: true };
  const rand = ctx.rng ?? rng;
  if (ctx.input.interactEdge) {
    addRoll(g, seat, rollDicePair(rand));
    if (scoreOf(g, seat) > MAX_SCORE) {
      appendLog(g, 'Перебор. Бетон забирает лишний счет.');
      g.winner = otherSide(seat);
      settleDiceGame(g, ctx.state, ctx.player, ctx.npc);
    }
    return { handled: true };
  }
  if (ctx.input.dropEdge) {
    if (scoreOf(g, seat) <= 0) {
      appendLog(g, 'Сначала бросьте хотя бы раз.');
      return { handled: true };
    }
    // Against an NPC the whole opponent turn rolls out here. At a co-op table
    // the second seat is a human: hand the dice over and wait.
    if (g.remote) {
      if (seat === 'npc') { finishByScore(g, ctx.state, ctx.player, ctx.npc); return { handled: true }; }
      g.phase = 'npc_turn';
      appendLog(g, `${g.npcName} берет кости.`);
      return { handled: true };
    }
    playNpcTurn(g, ctx.state, ctx.player, ctx.npc, rand);
    return { handled: true };
  }
  return { handled: true };
}

/** Walking away mid-table is conceding: the stake goes to whoever stayed. */
function forfeitDice(ctx: { state: GameState; player: Entity; npc: Entity; quitter: DiceSide }): void {
  const g = game;
  if (!g || g.phase === 'finished') return;
  g.winner = otherSide(ctx.quitter);
  settleDiceGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'dice',
  title: 'КОСТИ',
  menuLabel: 'Играть в кости',
  itemId: 'dice_bone',
  order: 31,
  stake: diceStakeFromNpc,
  start: (ctx, options) => startDiceGame(ctx, options),
  close: closeDiceGame,
  isOpen: isDiceGameOpen,
  input: ctx => handleDiceInput(ctx),
  snapshot: getDiceSnapshot,
  view: seat => buildDiceView(seat),
  setView: setDiceRemoteView,
  forfeit: ctx => forfeitDice(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} ставит пару костей на бетон.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      'Бросайте до 21. Перебор проигрывает; равный счет оставляет деньги при себе.',
    ],
    message: `${controlBindingLabel('gameMenu')} бросить, ${controlBindingLabel('drop')} стоп: передать ход.`,
  }),
});
