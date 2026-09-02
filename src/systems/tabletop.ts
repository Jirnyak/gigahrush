/* ── Tabletop games: one registry, both opponents ────────────────────────────
 *
 * Every board and card game in the building is the same shape: it needs a
 * physical set somebody is carrying, it wagers a slice of the poorer purse, it
 * takes a handful of keystrokes, and it can be played either against an NPC or
 * across a co-op table against another human.
 *
 * That shape used to be spelled out by hand in five places — four dispatch
 * chains in `main.ts` and one in `npc_ui.ts`, plus a near-identical menu-option
 * block per game. Adding a game meant editing all of them, which made two
 * authors working in parallel a merge accident waiting to happen. Now a game is
 * ONE registration, and every dispatch site is a lookup.
 *
 * Layering note: this half holds RULES only. The drawing half lives in
 * `render/tabletop_ui.ts`, because `systems/` sits below `render/` and must not
 * reach up into it. A game therefore registers twice — its rules here from
 * `systems/<game>.ts`, its panel there from `render/<game>_ui.ts` — keyed by the
 * same id.
 */

import type { Entity, GameState } from '../core/types';
import { isCoopSeated, registerCoopActivity, type CoopSeat } from './coop_session';

/** Superset of the keystrokes any table reads. A game ignores what it does not
 *  use; go and checkers are the ones that need the vertical pair. */
export interface TabletopInput {
  leftNav?: boolean;
  rightNav?: boolean;
  upNav?: boolean;
  downNav?: boolean;
  interactEdge?: boolean;
  dropEdge?: boolean;
  escEdge?: boolean;
}

export interface TabletopInputResult {
  handled: boolean;
  closeInterface?: boolean;
}

/** The two things every dispatch site needs to know before drawing or feeding a
 *  table: whether it is live, and who is sitting across it. */
export interface TabletopSnapshot {
  open: boolean;
  npcId: number;
}

export interface TabletopCtx {
  state: GameState;
  player: Entity;
  npc: Entity;
}

export interface TabletopIntro {
  lines: string[];
  message: string;
}

export interface TabletopGameDef {
  id: string;
  /** Panel heading, e.g. `ДУРАК`. */
  title: string;
  /** Menu line without the stake, e.g. `Играть в дурака`. The stake is appended
   *  by the menu, so every game words it the same way. */
  menuLabel: string;
  /** The set someone has to be carrying. Either side counts — one player
   *  bringing the deck is enough for both. */
  itemId: string;
  /** Position in the NPC menu. */
  order: number;
  /** What this actor is willing to risk: ten percent of the purse. Against an
   *  NPC that is the stake; across a co-op table the poorer side sets it. */
  stake(actor: Entity): number;
  /** Lay the table out. `false` when it cannot be dealt. */
  start(ctx: TabletopCtx, options?: { stake?: number; remote?: boolean }): boolean;
  close(): void;
  isOpen(): boolean;
  /** `seat` is absent against an NPC (always the player's chair) and explicit at
   *  a co-op table. */
  input(ctx: TabletopCtx & { input: TabletopInput; seat?: CoopSeat }): TabletopInputResult;
  /** What the local panel draws. */
  snapshot(): TabletopSnapshot;
  /** The table as one seat may see it — own hand, opponent's count. */
  view(seat: CoopSeat): unknown;
  /** Install a view computed by the host. */
  setView(view: unknown): void;
  /** Settle when a seat walks away mid-table. */
  forfeit(ctx: TabletopCtx & { quitter: CoopSeat }): void;
  /** The few lines shown when the table opens. */
  intro(ctx: { opponent: Entity; stake: number }): TabletopIntro;
}

const games = new Map<string, TabletopGameDef>();

/** Register a game for BOTH opponents at once: the NPC menu builds its option
 *  from this, and the co-op layer gets a matching activity for free. */
export function registerTabletopGame(def: TabletopGameDef): void {
  games.set(def.id, def);
  registerCoopActivity({
    id: def.id,
    title: def.title,
    // Both humans must cover the bet, so the table runs at the poorer one's
    // number — the same slice an NPC would have risked.
    stake: (a, b) => Math.min(def.stake(a), def.stake(b)),
    start: ctx => def.start(ctx, {
      remote: true,
      stake: Math.min(def.stake(ctx.player), def.stake(ctx.npc)),
    }),
    close: def.close,
    isOpen: def.isOpen,
    input: ctx => def.input(ctx),
    view: def.view,
    setView: def.setView,
    forfeit: def.forfeit,
  });
}

export function tabletopGame(id: string): TabletopGameDef | undefined {
  return games.get(id);
}

export function tabletopGames(): readonly TabletopGameDef[] {
  return [...games.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The table currently on screen, whichever game it belongs to. Every dispatch
 *  site asks this instead of testing each game in turn. */
export function openTabletopGame(): TabletopGameDef | undefined {
  for (const def of games.values()) {
    if (def.isOpen()) return def;
  }
  return undefined;
}

/** The open table, but only when it is the one this NPC is sitting at — the
 *  panel must not draw somebody else's game over this conversation. */
export function openTabletopGameFor(npcId: number): TabletopGameDef | undefined {
  const def = openTabletopGame();
  if (!def) return undefined;
  const snapshot = def.snapshot();
  if (!snapshot.open) return undefined;
  /* За кооп-столом `snapshot.npcId` — хостовый id кресла 'npc', а меню открыто
   * на ОППОНЕНТЕ. У принявшего приглашение это разные номера (его собственное
   * кресло и есть 'npc'), и сверка прятала доску, оставляя текст-заглушку.
   * Сидящий за столом оппонент — достаточное доказательство, что открытая
   * партия наша; точная сверка номеров остаётся для игр против NPC. */
  if (isCoopSeated(npcId)) return def;
  return snapshot.npcId === npcId ? def : undefined;
}
