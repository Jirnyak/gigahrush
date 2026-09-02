/* ── Co-op tables: two players share one turn-based sub-game ─────────────────
 *
 * The player-vs-player twin of the NPC minigame menu. One player proposes, the
 * other accepts, and from then on both sit at ONE table that lives on the host.
 * Neither client simulates the game: the host runs the existing minigame module
 * verbatim by seating the initiator in its `'player'` seat and the responder in
 * its `'npc'` seat, then feeds each side's input in turn instead of letting the
 * AI move for the `'npc'` seat.
 *
 * Contract:
 *   - HOST-AUTHORITATIVE. Money moves only where the host owns both actors, so
 *     a fabricated "I won" from a peer buys nothing.
 *   - ONE table per host. Every minigame module holds a single module-level
 *     game; a second proposal is refused with «стол занят» rather than
 *     silently clobbering the first. Lifting the cap is a change in the game
 *     modules, not here.
 *   - Seated actors are frozen and out of play (`isCoopSeated`): they do not
 *     move or shoot, and nothing targets or damages them until the table
 *     closes. The world around them keeps simulating — nobody else is paused
 *     by someone else's card game.
 *   - Either seat leaving ends the table for BOTH, and the leaver forfeits the
 *     stake to the one who stayed.
 *
 * This module is generic: it knows seats, invites and ids, never a specific
 * game. Each game registers itself (`registerCoopActivity`) from its own file.
 */

import { type Entity, type GameState } from '../core/types';

/** The two seats at a table. Named after the sides the minigame modules already
 *  use, so their turn logic feeds through unchanged: `'player'` is the seat that
 *  proposed the game, `'npc'` the seat that accepted. */
export type CoopSeat = 'player' | 'npc';

/** Superset of the four minigames' input shapes (checkers is the widest). */
export interface CoopInput {
  leftNav?: boolean;
  rightNav?: boolean;
  upNav?: boolean;
  downNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface CoopInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

/** The two seated actors, resolved to live entities by the caller. */
export interface CoopTableCtx {
  state: GameState;
  player: Entity;
  npc: Entity;
}

export interface CoopActivityDef {
  id: string;
  /** Overlay title, e.g. `ДУРАК`. */
  title: string;
  /** Rubles at risk. Both seats must be able to cover it, so it is computed
   *  from the poorer of the two. */
  stake(a: Entity, b: Entity): number;
  /** Host: lay the table out. `false` when it cannot be dealt. */
  start(ctx: CoopTableCtx): boolean;
  close(): void;
  isOpen(): boolean;
  /** Host: apply one seat's input to the shared table. `payload` is opaque to
   *  this layer — a turn-based game ignores it, barter carries its offer in it. */
  input(ctx: CoopTableCtx & { seat: CoopSeat; input: CoopInput; payload?: unknown }): CoopInputResult;
  /** Host: the table as `seat` is allowed to see it (own hand, opponent's count). */
  view(seat: CoopSeat): unknown;
  /** Any client: install a view computed by the host. `null` clears it. */
  setView(view: unknown): void;
  /** Host: settle the stake when `quitter` walks away mid-table. */
  forfeit(ctx: CoopTableCtx & { quitter: CoopSeat }): void;
}

/** A networked human's actor. Every online participant carries a slot — the
 *  host 0, peers 1..3 — so anything without one is an NPC or a monster. */
export function isNetworkedPlayerActor(e: Entity): boolean {
  return e.peerSlot !== undefined;
}

const activities = new Map<string, CoopActivityDef>();

export function registerCoopActivity(def: CoopActivityDef): void {
  activities.set(def.id, def);
}

export function coopActivity(id: string): CoopActivityDef | undefined {
  return activities.get(id);
}

/** An invite waiting for its answer. Held by the host for the pair, and
 *  mirrored on the invited client so it can draw the prompt. */
export interface CoopInvite {
  activityId: string;
  fromId: number;
  toId: number;
  fromName: string;
  stake: number;
  /** `state.time` after which the invite is dropped unanswered. */
  expiresAt: number;
}

export interface CoopSession {
  activityId: string;
  /** Entity id in the `'player'` seat — the one who proposed. */
  playerId: number;
  /** Entity id in the `'npc'` seat — the one who accepted. */
  npcId: number;
  stake: number;
}

/** An unanswered proposal has to lapse on its own: the inviter must not be able
 *  to pin someone in a prompt, and a peer that drops mid-prompt must not leave
 *  the table permanently reserved. Game seconds, on `state.time`. */
export const COOP_INVITE_TIMEOUT = 20;

let invite: CoopInvite | null = null;
let session: CoopSession | null = null;

export function pendingCoopInvite(): CoopInvite | null {
  return invite;
}

export function activeCoopSession(): CoopSession | null {
  return session;
}

/** True while `entityId` sits at a table: frozen, untargetable, out of play. */
export function isCoopSeated(entityId: number): boolean {
  return session !== null && (session.playerId === entityId || session.npcId === entityId);
}

/** Which seat `entityId` occupies, or null when it is not at the table. */
export function coopSeatOf(entityId: number): CoopSeat | null {
  if (!session) return null;
  if (session.playerId === entityId) return 'player';
  if (session.npcId === entityId) return 'npc';
  return null;
}

/** The stake both seats can actually cover: an activity prices each actor the
 *  same way it prices an NPC, and the table runs at the poorer one's number. */
export function coopStakeBetween(def: CoopActivityDef, a: Entity, b: Entity): number {
  return Math.max(0, Math.floor(def.stake(a, b)));
}

export type CoopProposeResult =
  | { ok: true; invite: CoopInvite }
  | { ok: false; reason: string };

/** Host: record a proposal from `from` to `to`. One invite and one table at a
 *  time; the caller ships the invite to the invited client. */
export function proposeCoopSession(
  activityId: string,
  from: Entity,
  to: Entity,
  time: number,
): CoopProposeResult {
  const def = activities.get(activityId);
  if (!def) return { ok: false, reason: 'Такой игры нет.' };
  if (session) return { ok: false, reason: 'Стол занят.' };
  if (invite && invite.expiresAt > time) return { ok: false, reason: 'Другое приглашение еще ждет ответа.' };
  if (!from.alive || !to.alive) return { ok: false, reason: 'Играть не с кем.' };
  if (from.id === to.id) return { ok: false, reason: 'Сам с собой не сыграешь.' };
  const stake = coopStakeBetween(def, from, to);
  if (stake <= 0) return { ok: false, reason: 'Ставку не покрыть.' };
  invite = {
    activityId,
    fromId: from.id,
    toId: to.id,
    fromName: from.name || 'Игрок',
    stake,
    expiresAt: time + COOP_INVITE_TIMEOUT,
  };
  return { ok: true, invite };
}

export function clearCoopInvite(): void {
  invite = null;
}

/** Any client: hold an invite the host addressed to us, so the prompt can draw. */
export function setCoopInvite(next: CoopInvite | null): void {
  invite = next;
}

export type CoopOpenResult =
  | { ok: true; session: CoopSession }
  | { ok: false; reason: string };

/** Host: the invite was accepted — deal the table. */
export function openCoopSession(ctx: CoopTableCtx, activityId: string, stake: number): CoopOpenResult {
  const def = activities.get(activityId);
  invite = null;
  if (!def) return { ok: false, reason: 'Такой игры нет.' };
  if (session) return { ok: false, reason: 'Стол занят.' };
  if (!def.start(ctx)) return { ok: false, reason: 'Партию не удалось разложить.' };
  session = { activityId, playerId: ctx.player.id, npcId: ctx.npc.id, stake };
  return { ok: true, session };
}

/** Any client: adopt a table the host opened for us. The view arrives
 *  separately; this only records who sits where. */
export function adoptCoopSession(next: CoopSession | null): void {
  session = next;
  if (!next) invite = null;
}

/** Host: apply one seat's input. Returns null when there is no table to feed. */
export function applyCoopInput(
  ctx: CoopTableCtx,
  seat: CoopSeat,
  input: CoopInput,
  payload?: unknown,
): CoopInputResult | null {
  if (!session) return null;
  const def = activities.get(session.activityId);
  if (!def) return null;
  return def.input({ ...ctx, seat, input, payload });
}

/** Host: current table as each seat may see it. */
export function coopViews(): { player: unknown; npc: unknown } | null {
  if (!session) return null;
  const def = activities.get(session.activityId);
  if (!def) return null;
  return { player: def.view('player'), npc: def.view('npc') };
}

/** Any client: show the table the host sent us. */
export function applyCoopView(activityId: string, view: unknown): void {
  activities.get(activityId)?.setView(view);
}

/** Tear the table down on every side. `quitter` set means somebody walked away
 *  mid-game and forfeits; leave it undefined for a table that simply finished.
 *  Safe to call on a client, where `ctx` is omitted and only the view clears. */
export function endCoopSession(quitter?: CoopSeat, ctx?: CoopTableCtx): void {
  const current = session;
  session = null;
  invite = null;
  if (!current) return;
  const def = activities.get(current.activityId);
  if (!def) return;
  if (quitter !== undefined && ctx) def.forfeit({ ...ctx, quitter });
  def.close();
  def.setView(null);
}

/** Host, per frame: drop a proposal nobody answered. Returns the lapsed invite
 *  so the caller can tell both clients to take the prompt down. */
export function tickCoopInvite(time: number): CoopInvite | null {
  if (!invite || invite.expiresAt > time) return null;
  const lapsed = invite;
  invite = null;
  return lapsed;
}

/** Run start / floor change / disconnect: forget everything without settling. */
export function resetCoopState(): void {
  if (session) {
    const def = activities.get(session.activityId);
    def?.close();
    def?.setView(null);
  }
  session = null;
  invite = null;
}
