/* ── Player-to-player barter ─────────────────────────────────────────────────
 *
 * The co-op table used for goods instead of a game. Trading with an NPC is a
 * priced transaction the seller drives; trading with another human is a swap
 * neither side prices, so this is a plain two-basket exchange:
 *
 *   1. Each seat walks its OWN inventory and stages items into its own basket.
 *   2. Both baskets are visible to both seats the whole time.
 *   3. Nothing moves until BOTH seats confirm. Touching your basket after
 *      confirming withdraws your confirmation, so no one can swap the goods out
 *      from under an agreement.
 *   4. The swap runs once, on the host, clamped to what each side actually
 *      still carries — the host owns both inventories, so a peer cannot
 *      conjure an item by claiming to have offered it.
 *
 * Walking away cancels: unlike a wagered game there is no stake to forfeit, and
 * an abandoned barter must leave both inventories untouched.
 */

import { type Entity, type GameState, type Item, msg } from '../core/types';
import { ITEMS } from '../data/catalog';
import { addItem, removeItem } from './inventory';
import { publishEvent } from './events';
import { registerCoopActivity, type CoopSeat } from './coop_session';

export const COOP_BARTER_ID = 'barter';

/** One staged line: a slot of the offering seat's inventory and how many. */
export interface BarterOfferItem {
  defId: string;
  count: number;
  data?: unknown;
}

export interface BarterSeatView {
  name: string;
  offer: readonly BarterOfferItem[];
  confirmed: boolean;
}

export interface BarterSnapshot {
  open: boolean;
  /** The seat reading this view. */
  you: BarterSeatView;
  them: BarterSeatView;
  /** The reader's own inventory, to pick from. */
  inventory: readonly BarterOfferItem[];
  cursor: number;
  finished: boolean;
  message: string;
  log: readonly string[];
}

interface BarterSeatState {
  offer: BarterOfferItem[];
  confirmed: boolean;
  cursor: number;
}

interface BarterTable {
  open: boolean;
  npcId: number;
  playerName: string;
  npcName: string;
  player: BarterSeatState;
  npc: BarterSeatState;
  finished: boolean;
  message: string;
  log: string[];
}

/** A basket cannot outgrow what the trade UI can show, and bounds the payload
 *  the host has to validate per swap. */
const MAX_OFFER_LINES = 16;

let table: BarterTable | null = null;
let remoteView: BarterSnapshot | null = null;

function emptySeat(): BarterSeatState {
  return { offer: [], confirmed: false, cursor: 0 };
}

function seatState(t: BarterTable, seat: CoopSeat): BarterSeatState {
  return seat === 'player' ? t.player : t.npc;
}

function seatName(t: BarterTable, seat: CoopSeat): string {
  return seat === 'player' ? t.playerName : t.npcName;
}

function otherSeat(seat: CoopSeat): CoopSeat {
  return seat === 'player' ? 'npc' : 'player';
}

function appendLog(t: BarterTable, line: string): void {
  t.log.push(line);
  if (t.log.length > 6) t.log.splice(0, t.log.length - 6);
  t.message = line;
}

function packInventory(actor: Entity): BarterOfferItem[] {
  const out: BarterOfferItem[] = [];
  for (const slot of actor.inventory ?? []) {
    if (!slot || typeof slot.defId !== 'string' || slot.count <= 0) continue;
    out.push({ defId: slot.defId, count: slot.count, data: slot.data });
  }
  return out;
}

function itemName(defId: string): string {
  return ITEMS[defId]?.name ?? defId;
}

/** How many of `defId` the actor still carries. */
function carried(actor: Entity, defId: string): number {
  let n = 0;
  for (const slot of actor.inventory ?? []) {
    if (slot?.defId === defId && slot.count > 0) n += slot.count;
  }
  return n;
}

/** Both sides re-open for edits whenever either basket changes: an agreement is
 *  only ever about the goods that were on the table when it was struck. */
function invalidateConfirmations(t: BarterTable): void {
  t.player.confirmed = false;
  t.npc.confirmed = false;
}

export function startCoopBarter(ctx: { state: GameState; player: Entity; npc: Entity }): boolean {
  if (!ctx.player.alive || !ctx.npc.alive) return false;
  table = {
    open: true,
    npcId: ctx.npc.id,
    playerName: ctx.player.name ?? 'Игрок',
    npcName: ctx.npc.name ?? 'Игрок',
    player: emptySeat(),
    npc: emptySeat(),
    finished: false,
    message: '',
    log: [],
  };
  appendLog(table, 'Обмен открыт. Выложите вещи и подтвердите оба.');
  return true;
}

export function closeCoopBarter(): void {
  table = null;
}

export function setCoopBarterRemoteView(view: unknown): void {
  remoteView = (view as BarterSnapshot | null) ?? null;
}

export function isCoopBarterOpen(): boolean {
  return remoteView !== null || table?.open === true;
}

/** What the local UI draws. */
export function getCoopBarterSnapshot(): BarterSnapshot {
  return remoteView ?? buildBarterView('player');
}

/** The table as `seat` sees it. Needs the live actors for the inventory list,
 *  which the host holds; a client reads the shipped view instead. */
let viewActors: { player: Entity; npc: Entity } | null = null;

function buildBarterView(seat: CoopSeat): BarterSnapshot {
  const t = table;
  if (!t) {
    return {
      open: false,
      you: { name: '', offer: [], confirmed: false },
      them: { name: '', offer: [], confirmed: false },
      inventory: [],
      cursor: 0,
      finished: false,
      message: '',
      log: [],
    };
  }
  const me = seatState(t, seat);
  const them = seatState(t, otherSeat(seat));
  const actor = viewActors ? (seat === 'player' ? viewActors.player : viewActors.npc) : null;
  return {
    open: t.open,
    you: { name: seatName(t, seat), offer: [...me.offer], confirmed: me.confirmed },
    them: { name: seatName(t, otherSeat(seat)), offer: [...them.offer], confirmed: them.confirmed },
    inventory: actor ? packInventory(actor) : [],
    cursor: me.cursor,
    finished: t.finished,
    message: t.message,
    log: [...t.log],
  };
}

/** Host: move every staged line that both sides still actually hold. Each line
 *  is clamped independently, so a stale or forged basket moves only real goods. */
function settleBarter(t: BarterTable, state: GameState, player: Entity, npc: Entity): void {
  if (t.finished) return;
  t.finished = true;
  let moved = 0;
  const handOver = (from: Entity, to: Entity, offer: readonly BarterOfferItem[]): void => {
    for (const line of offer) {
      const n = Math.min(Math.max(0, Math.floor(line.count)), carried(from, line.defId));
      if (n <= 0) continue;
      if (removeItem(from, line.defId, n)) {
        addItem(to, line.defId, n, line.data);
        moved += n;
      }
    }
  };
  handOver(player, npc, t.player.offer);
  handOver(npc, player, t.npc.offer);
  appendLog(t, moved > 0 ? `Обмен состоялся: ${moved} шт. сменили хозяина.` : 'Обмен закрыт: менять было нечего.');
  state.msgs.push(msg(`Обмен с ${t.npcName}: ${moved} шт.`, state.time, moved > 0 ? '#8f8' : '#aa6'));
  publishEvent(state, {
    type: 'player_handoff_item',
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name,
    actorFaction: player.faction,
    targetId: npc.id,
    targetName: npc.name,
    targetFaction: npc.faction,
    itemValue: moved,
    severity: 1,
    privacy: 'local',
    tags: ['trade', 'barter', 'coop'],
    data: { moved },
  });
}

export interface CoopBarterInput {
  leftNav?: boolean;
  rightNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

/** Host: one seat's action.
 *  left/right — walk your inventory · interact — stage one unit ·
 *  drop — take your last staged line back · confirm arrives as a payload flag. */
export function handleCoopBarterInput(ctx: {
  state: GameState;
  player: Entity;
  npc: Entity;
  seat: CoopSeat;
  input: CoopBarterInput;
  payload?: unknown;
}): { handled: boolean; closeInterface?: boolean } {
  const t = table;
  if (!t?.open) return { handled: false };
  viewActors = { player: ctx.player, npc: ctx.npc };
  const seat = ctx.seat;
  const me = seatState(t, seat);
  const actor = seat === 'player' ? ctx.player : ctx.npc;
  const inventory = packInventory(actor);

  if (t.finished) {
    if (ctx.input.interactEdge || ctx.input.dropEdge || ctx.input.escEdge) return { handled: true, closeInterface: true };
    return { handled: true };
  }
  if (ctx.input.escEdge) {
    // Nothing was agreed, so nothing moves: both inventories stay untouched.
    appendLog(t, `${seatName(t, seat)} закрыл обмен.`);
    t.finished = true;
    return { handled: true, closeInterface: true };
  }
  if (ctx.input.leftNav) {
    me.cursor = Math.max(0, me.cursor - 1);
    return { handled: true };
  }
  if (ctx.input.rightNav) {
    me.cursor = Math.min(Math.max(0, inventory.length - 1), me.cursor + 1);
    return { handled: true };
  }
  if (ctx.input.interactEdge) {
    const slot = inventory[Math.min(me.cursor, Math.max(0, inventory.length - 1))];
    if (!slot) return { handled: true };
    if (stagedCount(me.offer, slot.defId) >= carried(actor, slot.defId)) {
      appendLog(t, `Больше ${itemName(slot.defId)} нет.`);
      return { handled: true };
    }
    if (!stage(me.offer, slot)) {
      appendLog(t, 'На столе больше не помещается.');
      return { handled: true };
    }
    invalidateConfirmations(t);
    appendLog(t, `${seatName(t, seat)} выкладывает: ${itemName(slot.defId)}.`);
    return { handled: true };
  }
  if (ctx.input.dropEdge) {
    const line = me.offer[me.offer.length - 1];
    if (!line) return { handled: true };
    line.count--;
    if (line.count <= 0) me.offer.pop();
    invalidateConfirmations(t);
    appendLog(t, `${seatName(t, seat)} забирает со стола: ${itemName(line.defId)}.`);
    return { handled: true };
  }

  const payload = ctx.payload as { confirm?: boolean } | undefined;
  if (payload?.confirm === true) {
    me.confirmed = true;
    appendLog(t, `${seatName(t, seat)} подтверждает обмен.`);
    if (t.player.confirmed && t.npc.confirmed) {
      settleBarter(t, ctx.state, ctx.player, ctx.npc);
      return { handled: true };
    }
    return { handled: true };
  }
  return { handled: true };
}

function stagedCount(offer: readonly BarterOfferItem[], defId: string): number {
  let n = 0;
  for (const line of offer) if (line.defId === defId) n += line.count;
  return n;
}

function stage(offer: BarterOfferItem[], slot: BarterOfferItem): boolean {
  const existing = offer.find(line => line.defId === slot.defId && line.data === undefined && slot.data === undefined);
  if (existing) { existing.count++; return true; }
  if (offer.length >= MAX_OFFER_LINES) return false;
  offer.push({ defId: slot.defId, count: 1, data: slot.data });
  return true;
}

/** Peer: the staged basket to mirror to the host, bounded like the wire type. */
export function coopBarterOfferForWire(seat: CoopSeat): Item[] {
  const t = table;
  if (!t) return [];
  return seatState(t, seat).offer.slice(0, MAX_OFFER_LINES)
    .map(line => ({ defId: line.defId, count: line.count, data: line.data }));
}

registerCoopActivity({
  id: COOP_BARTER_ID,
  title: 'ОБМЕН',
  // Goods for goods: no money is wagered, so nothing has to be covered.
  stake: () => 0,
  start: ctx => {
    viewActors = { player: ctx.player, npc: ctx.npc };
    return startCoopBarter(ctx);
  },
  close: () => { closeCoopBarter(); viewActors = null; },
  isOpen: isCoopBarterOpen,
  input: ctx => handleCoopBarterInput(ctx),
  view: seat => buildBarterView(seat),
  setView: setCoopBarterRemoteView,
  // An abandoned barter is simply cancelled — there is no stake to lose.
  forfeit: () => {},
});
