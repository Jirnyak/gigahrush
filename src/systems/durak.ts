import { msg, type Entity, type GameState } from '../core/types';
import { publishEvent } from './events';
import { rng } from '../core/rand';
import { registerTabletopGame } from './tabletop';

export type DurakSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type DurakRank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type DurakSide = 'player' | 'npc';
export type DurakWinner = DurakSide | 'draw' | '';
export type DurakPhase = 'player_attack' | 'player_defense' | 'finished';

export interface DurakCard {
  id: number;
  suit: DurakSuit;
  rank: DurakRank;
}

export interface DurakTablePair {
  attack: DurakCard;
  defense?: DurakCard;
}

export interface DurakSnapshot {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  trumpSuit: DurakSuit;
  trumpCard: DurakCard;
  talonCount: number;
  discardCount: number;
  attacker: DurakSide;
  defender: DurakSide;
  phase: DurakPhase;
  defenderTaking: boolean;
  defenderStartCards: number;
  playerHand: readonly DurakCard[];
  npcHandCount: number;
  table: readonly DurakTablePair[];
  selectedIndex: number;
  selectedCard?: DurakCard;
  canPlaySelected: boolean;
  canFinishTurn: boolean;
  canTake: boolean;
  /** False only at a co-op table while the other human is thinking. Always true
   *  against an NPC: its moves resolve inline, so the seat never waits. */
  yourTurn: boolean;
  finished: boolean;
  winner: DurakWinner;
  message: string;
  log: readonly string[];
}

export interface DurakInput {
  leftNav?: boolean;
  rightNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface DurakInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

interface DurakGame {
  open: boolean;
  npcId: number;
  npcName: string;
  stakeRubles: number;
  trumpSuit: DurakSuit;
  trumpCard: DurakCard;
  talon: DurakCard[];
  playerHand: DurakCard[];
  npcHand: DurakCard[];
  table: DurakTablePair[];
  discardCount: number;
  attacker: DurakSide;
  defender: DurakSide;
  phase: DurakPhase;
  defenderStartCards: number;
  defenderTaking: boolean;
  selectedIndex: number;
  /** Cursor of the 'npc' seat. Unused against an NPC — the AI needs no cursor —
   *  and only alive at a co-op table, where a human sits there. */
  npcSelectedIndex: number;
  /** Co-op table: the 'npc' seat is a human, so the AI must not move for it and
   *  play waits for that seat's input instead of resolving inline. */
  remote: boolean;
  /** Display name of the 'player' seat, needed to mirror the table for the
   *  other human. Against an NPC nothing reads it. */
  playerName: string;
  winner: DurakWinner;
  settled: boolean;
  message: string;
  log: string[];
}

const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
const RANK_LABELS: Record<DurakRank, string> = {
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};
const SUIT_LABELS: Record<DurakSuit, string> = {
  clubs: 'C',
  diamonds: 'D',
  hearts: 'H',
  spades: 'S',
};
const SUIT_NAMES: Record<DurakSuit, string> = {
  clubs: 'крести',
  diamonds: 'бубны',
  hearts: 'черви',
  spades: 'пики',
};

const emptyCard: DurakCard = { id: -1, suit: 'clubs', rank: 6 };
let game: DurakGame | null = null;

function cleanMoney(actor: Entity): number {
  const money = actor.money ?? 0;
  return Number.isFinite(money) ? Math.max(0, Math.floor(money)) : 0;
}

function otherSide(side: DurakSide): DurakSide {
  return side === 'player' ? 'npc' : 'player';
}

/** Log voice. Against an NPC the log is written to the one human reading it, so
 *  its own seat is «вы». At a co-op table both seats read the same log, so
 *  everyone is named. */
function sideName(g: DurakGame, side: DurakSide, capitalized = false): string {
  if (side === 'npc') return g.npcName;
  if (g.remote) return g.playerName;
  return capitalized ? 'Вы' : 'вы';
}

function handOf(g: DurakGame, side: DurakSide): DurakCard[] {
  return side === 'player' ? g.playerHand : g.npcHand;
}

function rankIndex(rank: DurakRank): number {
  return RANKS.indexOf(rank);
}

function cardSortValue(card: DurakCard, trumpSuit: DurakSuit, trumpPenalty = 24): number {
  return rankIndex(card.rank) + (card.suit === trumpSuit ? trumpPenalty : 0);
}

function appendLog(g: DurakGame, line: string): void {
  g.log.push(line);
  if (g.log.length > 6) g.log.splice(0, g.log.length - 6);
  g.message = line;
}

function removeCardById(hand: DurakCard[], cardId: number): DurakCard | null {
  const idx = hand.findIndex(card => card.id === cardId);
  if (idx < 0) return null;
  return hand.splice(idx, 1)[0] ?? null;
}

function uncoveredIndex(g: DurakGame): number {
  return g.table.findIndex(pair => !pair.defense);
}

function allCovered(g: DurakGame): boolean {
  return g.table.length > 0 && uncoveredIndex(g) < 0;
}

function drawToSix(g: DurakGame, side: DurakSide): void {
  const hand = handOf(g, side);
  while (hand.length < 6 && g.talon.length > 0) {
    const card = g.talon.shift();
    if (card) hand.push(card);
  }
}

function updateSelection(g: DurakGame): void {
  g.selectedIndex = clampCursor(g.playerHand, g.selectedIndex);
  g.npcSelectedIndex = clampCursor(g.npcHand, g.npcSelectedIndex);
}

function clampCursor(hand: readonly DurakCard[], index: number): number {
  if (hand.length <= 0) return 0;
  return Math.max(0, Math.min(hand.length - 1, index));
}

function cursorOf(g: DurakGame, side: DurakSide): number {
  return side === 'player' ? g.selectedIndex : g.npcSelectedIndex;
}

function setCursor(g: DurakGame, side: DurakSide, index: number): void {
  if (side === 'player') g.selectedIndex = index;
  else g.npcSelectedIndex = index;
}

/** Whose input the table is waiting for. Uncovered attack on the table means the
 *  defender owes an answer; anything else is the attacker's move. Against an NPC
 *  this is always 'player' by the time control returns, because `advanceNpc`
 *  resolves the other seat inline. */
function seatToAct(g: DurakGame): DurakSide {
  if (uncoveredIndex(g) >= 0 && !g.defenderTaking) return g.defender;
  return g.attacker;
}

function playerWon(g: DurakGame): DurakWinner {
  if (g.talon.length > 0) return '';
  const playerEmpty = g.playerHand.length === 0;
  const npcEmpty = g.npcHand.length === 0;
  if (playerEmpty && npcEmpty) return 'draw';
  if (playerEmpty) return 'player';
  if (npcEmpty) return 'npc';
  return '';
}

function publishDurakSettlementEvent(state: GameState, player: Entity, npc: Entity, winner: DurakWinner, amount: number, stake: number): void {
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
    tags: ['gambling', 'durak', playerWin ? 'win' : 'loss'],
    data: { stake, transfer: amount, winner },
  });
}

export function transferDurakStake(state: GameState, player: Entity, npc: Entity, winner: DurakWinner, stake: number): number {
  if (winner !== 'player' && winner !== 'npc') return 0;
  const payer = winner === 'player' ? npc : player;
  const receiver = winner === 'player' ? player : npc;
  const amount = Math.min(Math.max(0, Math.floor(stake)), cleanMoney(payer));
  payer.money = cleanMoney(payer) - amount;
  receiver.money = cleanMoney(receiver) + amount;
  publishDurakSettlementEvent(state, player, npc, winner, amount, Math.max(0, Math.floor(stake)));
  return amount;
}

function settleDurakGame(g: DurakGame, state: GameState, player: Entity, npc: Entity): void {
  if (g.settled || (g.winner !== 'player' && g.winner !== 'npc' && g.winner !== 'draw')) return;
  g.settled = true;
  if (g.winner === 'draw') {
    appendLog(g, 'Ничья. Ставка остается в карманах.');
    state.msgs.push(msg('Дурак: ничья, деньги не переходят.', state.time, '#8cf'));
    return;
  }
  const amount = transferDurakStake(state, player, npc, g.winner, g.stakeRubles);
  const line = g.remote
    ? `Дурак: ${sideName(g, g.winner, true)} забрал ₽${amount}.`
    : g.winner === 'player'
      ? `Дурак: вы выиграли ₽${amount}.`
      : `Дурак: вы проиграли ₽${amount}.`;
  appendLog(g, line);
  state.msgs.push(msg(line, state.time, g.winner === 'player' ? '#8f8' : '#f84'));
}

function finishTurnWithOutcome(g: DurakGame, state: GameState, player: Entity, npc: Entity, defenderTook: boolean): void {
  const attackerBefore = g.attacker;
  const defenderBefore = g.defender;
  g.defenderTaking = defenderTook;
  if (defenderTook) {
    const defenderHand = handOf(g, defenderBefore);
    for (const pair of g.table) {
      defenderHand.push(pair.attack);
      if (pair.defense) defenderHand.push(pair.defense);
    }
    appendLog(g, `${sideName(g, defenderBefore, true)} ${defenderBefore === 'player' && !g.remote ? 'взяли' : 'взял'} карты со стола.`);
  } else {
    let count = 0;
    for (const pair of g.table) count += pair.defense ? 2 : 1;
    g.discardCount += count;
    appendLog(g, 'Отбой ушел в бетон.');
  }
  g.table = [];
  g.defenderTaking = false;
  drawToSix(g, attackerBefore);
  drawToSix(g, defenderBefore);

  const winner = playerWon(g);
  if (winner) {
    g.phase = 'finished';
    g.winner = winner;
    settleDurakGame(g, state, player, npc);
    updateSelection(g);
    return;
  }

  g.attacker = defenderTook ? attackerBefore : defenderBefore;
  g.defender = otherSide(g.attacker);
  g.defenderStartCards = handOf(g, g.defender).length;
  g.phase = g.attacker === 'player' ? 'player_attack' : 'player_defense';
  updateSelection(g);
}

function playAttackCard(g: DurakGame, side: DurakSide, card: DurakCard): boolean {
  if (g.phase === 'finished' || side !== g.attacker || !isDurakAttackLegal(g, side, card)) return false;
  const removed = removeCardById(handOf(g, side), card.id);
  if (!removed) return false;
  g.table.push({ attack: removed });
  appendLog(g, `${sideName(g, side, true)} ${side === 'player' && !g.remote ? 'ходите' : 'ходит'}: ${formatDurakCard(removed)}.`);
  g.phase = g.defender === 'player' ? 'player_defense' : 'player_attack';
  updateSelection(g);
  return true;
}

function playDefenseCard(g: DurakGame, side: DurakSide, card: DurakCard): boolean {
  if (g.phase === 'finished' || side !== g.defender) return false;
  const idx = uncoveredIndex(g);
  if (idx < 0) return false;
  const attack = g.table[idx]?.attack;
  if (!attack || !canDurakCover(attack, card, g.trumpSuit)) return false;
  const removed = removeCardById(handOf(g, side), card.id);
  if (!removed) return false;
  g.table[idx].defense = removed;
  appendLog(g, `${sideName(g, side, true)} ${side === 'player' && !g.remote ? 'кроете' : 'кроет'}: ${formatDurakCard(removed)}.`);
  g.phase = g.attacker === 'player' ? 'player_attack' : 'player_defense';
  updateSelection(g);
  return true;
}

function advanceNpc(g: DurakGame, state: GameState, player: Entity, npc: Entity): void {
  // Co-op table: a human sits in the 'npc' seat, so nothing moves for it — the
  // table simply waits, and `seatToAct` hands the turn over.
  if (g.remote) return;
  for (let guard = 0; guard < 16 && g.phase !== 'finished'; guard++) {
    if (g.attacker === 'npc') {
      const canAdd = g.table.length === 0 || g.defenderTaking || allCovered(g);
      if (!canAdd) return;
      const card = chooseNpcAttackCard(g);
      if (!card) {
        if (g.table.length > 0) {
          finishTurnWithOutcome(g, state, player, npc, g.defenderTaking);
          continue;
        }
        return;
      }
      playAttackCard(g, 'npc', card);
      return;
    }

    if (g.defender === 'npc') {
      if (g.defenderTaking) return;
      const idx = uncoveredIndex(g);
      if (idx < 0) return;
      const attack = g.table[idx]?.attack;
      const defense = attack ? chooseNpcDefenseCard(g.npcHand, attack, g.trumpSuit) : null;
      if (!defense) {
        g.defenderTaking = true;
        g.phase = 'player_attack';
        appendLog(g, `${g.npcName} берет. Можете подкинуть по рангу или закончить.`);
        return;
      }
      playDefenseCard(g, 'npc', defense);
      return;
    }
    return;
  }
}

export function makeDurakCard(suit: DurakSuit, rank: DurakRank): DurakCard {
  return { id: SUITS.indexOf(suit) * RANKS.length + rankIndex(rank), suit, rank };
}

export function createDurakDeck(): DurakCard[] {
  const deck: DurakCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makeDurakCard(suit, rank));
  }
  return deck;
}

export function shuffleDurakDeck(deck: readonly DurakCard[], rand = rng): DurakCard[] {
  const out = deck.map(card => ({ ...card }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(rand() * (i + 1))));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function formatDurakCard(card: DurakCard): string {
  return `${RANK_LABELS[card.rank]}${SUIT_LABELS[card.suit]}`;
}

export function formatDurakSuit(suit: DurakSuit): string {
  return SUIT_NAMES[suit];
}

export function durakStakeFromNpc(npc: Entity): number {
  const money = cleanMoney(npc);
  return money > 0 ? Math.max(1, Math.floor(money * 0.1)) : 0;
}

export function canDurakCover(attack: DurakCard, defense: DurakCard, trumpSuit: DurakSuit): boolean {
  if (attack.suit === defense.suit) return defense.rank > attack.rank;
  return defense.suit === trumpSuit && attack.suit !== trumpSuit;
}

export function isDurakAttackLegal(g: Pick<DurakGame, 'attacker' | 'defenderStartCards' | 'table' | 'trumpSuit'>, side: DurakSide, card: DurakCard): boolean {
  if (side !== g.attacker) return false;
  const limit = Math.min(6, Math.max(0, g.defenderStartCards));
  if (g.table.length >= limit) return false;
  if (g.table.length === 0) return true;
  const ranks = new Set<DurakRank>();
  for (const pair of g.table) {
    ranks.add(pair.attack.rank);
    if (pair.defense) ranks.add(pair.defense.rank);
  }
  return ranks.has(card.rank);
}

export function chooseDurakFirstAttacker(playerHand: readonly DurakCard[], npcHand: readonly DurakCard[], trumpSuit: DurakSuit, rand = rng): DurakSide {
  const lowestTrump = (hand: readonly DurakCard[]) => hand
    .filter(card => card.suit === trumpSuit)
    .sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank))[0];
  const playerTrump = lowestTrump(playerHand);
  const npcTrump = lowestTrump(npcHand);
  if (playerTrump && npcTrump) return playerTrump.rank < npcTrump.rank ? 'player' : 'npc';
  if (playerTrump) return 'player';
  if (npcTrump) return 'npc';

  const lowest = (hand: readonly DurakCard[]) => hand
    .slice()
    .sort((a, b) => rankIndex(a.rank) - rankIndex(b.rank) || a.id - b.id)[0];
  const playerLow = lowest(playerHand);
  const npcLow = lowest(npcHand);
  if (playerLow && npcLow && playerLow.rank !== npcLow.rank) return playerLow.rank < npcLow.rank ? 'player' : 'npc';
  return rand() < 0.5 ? 'player' : 'npc';
}

export function chooseNpcDefenseCard(hand: readonly DurakCard[], attack: DurakCard, trumpSuit: DurakSuit): DurakCard | null {
  const legal = hand.filter(card => canDurakCover(attack, card, trumpSuit));
  legal.sort((a, b) => {
    const aSameSuit = a.suit === attack.suit;
    const bSameSuit = b.suit === attack.suit;
    if (aSameSuit !== bSameSuit) return aSameSuit ? -1 : 1;
    return cardSortValue(a, trumpSuit) - cardSortValue(b, trumpSuit);
  });
  return legal[0] ?? null;
}

export function chooseNpcAttackCard(g: Pick<DurakGame, 'attacker' | 'defenderStartCards' | 'table' | 'trumpSuit' | 'npcHand' | 'playerHand' | 'talon' | 'defenderTaking'>): DurakCard | null {
  const legal = g.npcHand.filter(card => isDurakAttackLegal(g, 'npc', card));
  legal.sort((a, b) => {
    const late = g.talon.length === 0 || g.playerHand.length <= 2;
    const trumpPenalty = late ? 10 : 28;
    return cardSortValue(a, g.trumpSuit, trumpPenalty) - cardSortValue(b, g.trumpSuit, trumpPenalty);
  });
  const card = legal[0];
  if (!card) return null;
  if (g.table.length > 0 && !g.defenderTaking && cardSortValue(card, g.trumpSuit) > 5) return null;
  if (g.table.length > 0 && g.defenderTaking && cardSortValue(card, g.trumpSuit) > 6) return null;
  return card;
}

export function startDurakGame(
  ctx: { state: GameState; player: Entity; npc: Entity },
  options: { rng?: () => number; deck?: readonly DurakCard[]; stake?: number; remote?: boolean } = {},
): boolean {
  const stake = options.stake ?? durakStakeFromNpc(ctx.npc);
  if (stake <= 0 || cleanMoney(ctx.player) < stake || cleanMoney(ctx.npc) < stake) return false;
  const deck = options.deck ? options.deck.map(card => ({ ...card })) : shuffleDurakDeck(createDurakDeck(), options.rng);
  if (deck.length < 13) return false;
  const playerHand: DurakCard[] = [];
  const npcHand: DurakCard[] = [];
  for (let i = 0; i < 6; i++) {
    const playerCard = deck.shift();
    const npcCard = deck.shift();
    if (playerCard) playerHand.push(playerCard);
    if (npcCard) npcHand.push(npcCard);
  }
  const trumpCard = deck.shift() ?? emptyCard;
  const trumpSuit = trumpCard.suit;
  const talon = [...deck, trumpCard];
  const attacker = chooseDurakFirstAttacker(playerHand, npcHand, trumpSuit, options.rng);
  game = {
    open: true,
    npcId: ctx.npc.id,
    npcName: ctx.npc.name ?? 'NPC',
    stakeRubles: stake,
    trumpSuit,
    trumpCard,
    talon,
    playerHand,
    npcHand,
    table: [],
    discardCount: 0,
    attacker,
    defender: otherSide(attacker),
    phase: attacker === 'player' ? 'player_attack' : 'player_defense',
    defenderStartCards: attacker === 'player' ? npcHand.length : playerHand.length,
    defenderTaking: false,
    selectedIndex: 0,
    npcSelectedIndex: 0,
    remote: options.remote === true,
    playerName: ctx.player.name ?? 'Игрок',
    winner: '',
    settled: false,
    message: '',
    log: [],
  };
  appendLog(game, `Козырь: ${formatDurakSuit(trumpSuit)}. Первым ходит ${sideName(game, attacker)}.`);
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
    tags: ['gambling', 'durak', 'bet'],
    data: { stake, npcMoneyAtStart: cleanMoney(ctx.npc) },
  });
  advanceNpc(game, ctx.state, ctx.player, ctx.npc);
  return true;
}

export function closeDurakGame(): void {
  game = null;
}

/** A table the host runs for us: we hold no game, only the view it ships. */
let remoteView: DurakSnapshot | null = null;

export function setDurakRemoteView(view: unknown): void {
  remoteView = (view as DurakSnapshot | null) ?? null;
}

export function isDurakGameOpen(): boolean {
  return remoteView !== null || !!game?.open;
}

/** What the local UI draws: the view the host shipped for our chair, or — when
 *  we are the one running the table — the table itself. */
export function getDurakSnapshot(): DurakSnapshot {
  return remoteView ?? buildDurakView('player');
}

/** The table as `seat` may see it, always computed from the live game. */
function buildDurakView(seat: DurakSide): DurakSnapshot {
  const g = game;
  if (!g) {
    return {
      open: false,
      npcId: -1,
      npcName: '',
      stakeRubles: 0,
      trumpSuit: 'clubs',
      trumpCard: emptyCard,
      talonCount: 0,
      discardCount: 0,
      attacker: 'player',
      defender: 'npc',
      phase: 'finished',
      defenderTaking: false,
      defenderStartCards: 0,
      playerHand: [],
      npcHandCount: 0,
      table: [],
      selectedIndex: 0,
      canPlaySelected: false,
      canFinishTurn: false,
      canTake: false,
      yourTurn: false,
      finished: false,
      winner: '',
      message: '',
      log: [],
    };
  }
  updateSelection(g);
  // Everything below is told from `seat`'s chair: its own cards are the hand,
  // the other seat is only a count. For 'player' this is the original view
  // verbatim; 'npc' is the same table mirrored for the human sitting there.
  const mirror = seat === 'npc';
  const own = handOf(g, seat);
  const selectedIndex = cursorOf(g, seat);
  const selectedCard = own[selectedIndex];
  const attacking = g.attacker === seat;
  const live = g.phase !== 'finished';
  // Against an NPC the opponent moves inline, so the seat is never made to wait
  // — the original view had no turn gate and must keep none.
  const acts = live && (!g.remote || seatToAct(g) === seat);
  const canPlaySelected = acts && !!selectedCard && (
    (attacking && isDurakAttackLegal(g, seat, selectedCard)) ||
    (!attacking && uncoveredIndex(g) >= 0 && canDurakCover(g.table[uncoveredIndex(g)].attack, selectedCard, g.trumpSuit))
  );
  return {
    open: g.open,
    npcId: g.npcId,
    npcName: mirror ? g.playerName : g.npcName,
    stakeRubles: g.stakeRubles,
    trumpSuit: g.trumpSuit,
    trumpCard: g.trumpCard,
    talonCount: g.talon.length,
    discardCount: g.discardCount,
    attacker: mirror ? otherSide(g.attacker) : g.attacker,
    defender: mirror ? otherSide(g.defender) : g.defender,
    phase: g.phase === 'finished' ? 'finished' : attacking ? 'player_attack' : 'player_defense',
    defenderTaking: g.defenderTaking,
    defenderStartCards: g.defenderStartCards,
    playerHand: [...own],
    npcHandCount: handOf(g, otherSide(seat)).length,
    table: g.table.map(pair => ({ attack: pair.attack, defense: pair.defense })),
    selectedIndex,
    selectedCard,
    canPlaySelected,
    canFinishTurn: acts && attacking && g.table.length > 0 && (g.defenderTaking || allCovered(g)),
    canTake: acts && !attacking,
    yourTurn: acts,
    finished: g.phase === 'finished',
    winner: mirror ? mirrorWinner(g.winner) : g.winner,
    message: g.message,
    log: [...g.log],
  };
}

function mirrorWinner(winner: DurakWinner): DurakWinner {
  if (winner === 'player') return 'npc';
  if (winner === 'npc') return 'player';
  return winner;
}

/** `seat` is which chair the input came from. Against an NPC it is always the
 *  'player' chair and every branch below reads exactly as it did before; at a
 *  co-op table the same branches serve whichever human is on the move. */
export function handleDurakInput(ctx: {
  state: GameState; player: Entity; npc: Entity; input: DurakInput; seat?: DurakSide;
}): DurakInputResult {
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
    g.winner = otherSide(seat);
    g.phase = 'finished';
    settleDurakGame(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true, closeInterface: true };
  }
  // A co-op table waits its turn; a table against an NPC never has to.
  if (g.remote && seatToAct(g) !== seat) return { handled: true };
  const attacking = g.attacker === seat;
  if (ctx.input.dropEdge) {
    if (!attacking) {
      g.defenderTaking = true;
      // Against an NPC the attacker piles on and the turn resolves at once. At a
      // co-op table the human attacker gets that choice instead, so the turn
      // stays open until they end it.
      if (g.remote) {
        appendLog(g, `${sideName(g, seat, true)} берет. ${sideName(g, otherSide(seat), true)} может подкинуть по рангу или закончить.`);
        return { handled: true };
      }
      while (true) {
        const card = chooseNpcAttackCard(g);
        if (!card) break;
        playAttackCard(g, 'npc', card);
      }
      finishTurnWithOutcome(g, ctx.state, ctx.player, ctx.npc, true);
      advanceNpc(g, ctx.state, ctx.player, ctx.npc);
      return { handled: true };
    }
    if (g.table.length > 0 && (g.defenderTaking || allCovered(g))) {
      finishTurnWithOutcome(g, ctx.state, ctx.player, ctx.npc, g.defenderTaking);
      advanceNpc(g, ctx.state, ctx.player, ctx.npc);
      return { handled: true };
    }
  }
  if (ctx.input.interactEdge) {
    const card = hand[cursorOf(g, seat)];
    if (!card) return { handled: true };
    if (attacking) {
      if (!playAttackCard(g, seat, card)) {
        appendLog(g, 'Эту карту нельзя подкинуть сейчас.');
        return { handled: true };
      }
      advanceNpc(g, ctx.state, ctx.player, ctx.npc);
      return { handled: true };
    }
    if (!playDefenseCard(g, seat, card)) {
      appendLog(g, 'Этой картой не кроется.');
      return { handled: true };
    }
    advanceNpc(g, ctx.state, ctx.player, ctx.npc);
    return { handled: true };
  }
  return { handled: true };
}

/** Walking away mid-table is conceding: the stake goes to whoever stayed. */
function forfeitDurak(ctx: { state: GameState; player: Entity; npc: Entity; quitter: DurakSide }): void {
  const g = game;
  if (!g || g.phase === 'finished') return;
  g.winner = otherSide(ctx.quitter);
  g.phase = 'finished';
  settleDurakGame(g, ctx.state, ctx.player, ctx.npc);
}

registerTabletopGame({
  id: 'durak',
  title: 'ДУРАК',
  menuLabel: 'Играть в дурака',
  itemId: 'card_deck',
  order: 30,
  stake: durakStakeFromNpc,
  start: (ctx, options) => startDurakGame(ctx, options),
  close: closeDurakGame,
  isOpen: isDurakGameOpen,
  input: ctx => handleDurakInput(ctx),
  snapshot: getDurakSnapshot,
  view: seat => buildDurakView(seat),
  setView: setDurakRemoteView,
  forfeit: ctx => forfeitDurak(ctx),
  intro: ctx => ({
    lines: [
      `${ctx.opponent.name ?? 'NPC'} кладет колоду на край стола. Козырь открыт.`,
      `Ставка зафиксирована: ₽${ctx.stake}.`,
      'Подкидной дурак на двоих, без перевода.',
    ],
    message: 'Деньги переходят только после победы или сдачи.',
  }),
});
