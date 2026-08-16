import type { World } from '../core/world';

/* Per-floor content state, in one place instead of sixteen.
 *
 * Sixteen content modules had each grown the same storage by hand: a module-level
 * `contexts` array, a `registerX` that deduplicated on `(world, roomId)`, and a
 * cap of 4..8. The cap counted CONTEXTS, but every entry pinned a whole `World`
 * (42 MiB of grids) plus that floor's `entities`, so eight "safely capped"
 * entries were eight retained dead floors. Measured: three loads of the same
 * floor left three worlds alive through a forced GC.
 *
 * The fix is the game's own rule, which the array shape quietly denied: only one
 * floor is active. A store therefore holds contexts for ONE world, keyed by room,
 * and drops everything the moment a different world registers or the floor
 * unloads. There is no cap because there is nothing to cap — the size is however
 * many rooms of the current floor the module built.
 *
 * `world` stays on the context objects: it points at the live floor, and it dies
 * with the store. What was removed is the ability to hold a floor after leaving it.
 */

export interface WorldContextStore<T> {
  /** Register or refresh the context for `roomId` on `world`.
   *
   * A `world` different from the stored one means the floor changed, so the
   * previous floor's contexts are dropped first — no module can outlive its
   * floor even if the unload hook never runs. Returns the live context, which is
   * the existing object when one is present so callers keep their references. */
  register(world: World, roomId: number, ctx: T, refresh?: (existing: T, incoming: T) => void): T;
  /** Context for a room of the current floor, or undefined. */
  byRoom(roomId: number): T | undefined;
  /** Current floor's contexts, newest last. Empty between floors. */
  all(): readonly T[];
  /** First context matching `pred`, scanning newest first — the ordering the
   *  hand-written `for (i = contexts.length - 1; i >= 0; i--)` loops relied on. */
  find(pred: (ctx: T) => boolean): T | undefined;
  drop(roomId: number): void;
  /** Forget the floor and its contexts. */
  clear(): void;
  /** The world these contexts belong to, or null between floors. */
  world(): World | null;
}

interface ClearableStore {
  clear(): void;
  world(): World | null;
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

const stores: ClearableStore[] = [];

/** Modules that keep a single `let activeWorld: World | null` slot rather than a
 *  context list. The slot shape is already right — one floor, one reference —
 *  it just never learned that the floor it points at can be left behind. One
 *  registration each puts them under the same unload point as the stores. */
type FloorScopedReset = (current: World | null) => void;
const resets: FloorScopedReset[] = [];

export function registerFloorScopedReset(reset: FloorScopedReset): void {
  resets.push(reset);
}

export function createWorldContextStore<T>(): WorldContextStore<T> {
  let owner: World | null = null;
  let byRoom = new Map<number, T>();

  const store: WorldContextStore<T> & ClearableStore = {
    register(world, roomId, ctx, refresh) {
      if (owner !== world) {
        owner = world;
        byRoom = new Map();
      }
      const existing = byRoom.get(roomId);
      if (existing !== undefined) {
        refresh?.(existing, ctx);
        return existing;
      }
      byRoom.set(roomId, ctx);
      return ctx;
    },
    byRoom(roomId) {
      return byRoom.get(roomId);
    },
    all() {
      return [...byRoom.values()];
    },
    find(pred) {
      // Newest first: Map preserves insertion order, so walk the values backwards.
      const values = [...byRoom.values()];
      for (let i = values.length - 1; i >= 0; i--) if (pred(values[i])) return values[i];
      return undefined;
    },
    drop(roomId) {
      byRoom.delete(roomId);
    },
    clear() {
      owner = null;
      byRoom = new Map();
    },
    world() {
      return owner;
    },
    // A throwaway regen (the save-time delta base) must not clobber the live
    // floor's contexts, mirroring registerGenerationRuntimeGuard's contract.
    snapshot() {
      return { owner, byRoom };
    },
    restore(snapshot) {
      const saved = snapshot as { owner: World | null; byRoom: Map<number, T> };
      owner = saved.owner;
      byRoom = saved.byRoom;
    },
  };

  stores.push(store);
  return store;
}

/** The floor-unload point: forget every floor except the one now being played.
 *
 * Called after generation, so it must NOT be a blanket clear — the incoming
 * floor's modules have already registered against `current` and would be wiped.
 * Stores that ran keep their entries (their owner is `current`); stores whose
 * module does not exist on this floor still point at the departed one and are
 * the whole reason this function exists. */
export function dropWorldContextsExcept(current: World): void {
  for (const store of stores) if (store.world() !== current) store.clear();
  for (const reset of resets) reset(current);
}

/** Hard reset: no floor is current (new run, save load). */
export function clearAllWorldContexts(): void {
  for (const store of stores) store.clear();
  for (const reset of resets) reset(null);
}

/** Snapshot/restore every store around a throwaway regen. */
export function snapshotAllWorldContexts(): unknown {
  return stores.map(store => store.snapshot());
}

export function restoreAllWorldContexts(snapshot: unknown): void {
  const saved = snapshot as unknown[];
  if (!Array.isArray(saved)) return;
  for (let i = 0; i < stores.length && i < saved.length; i++) stores[i].restore(saved[i]);
}

/** Diagnostics for the live-floor invariant.
 *
 * The world counter alone gives false comfort: a context also holds that floor's
 * `entities` (~9600 on a busy floor), so a store still pointing at a departed
 * floor keeps the monsters, NPCs and drops alive even in the moment the World
 * object itself happens to be collectable. `stale` is therefore the figure that
 * matters — stores pinning something other than the floor being played.
 *
 * Pass the current world to get `stale`; omit it to just count what is pinned. */
export function worldContextStats(current?: World | null): {
  /** Stores holding any floor. */
  pinning: number;
  /** Stores holding a floor that is not `current` — must be 0 after a load. */
  stale: number;
  /** Contexts in stale stores. */
  staleEntries: number;
  /** Entities kept alive by stale stores — the number the world count hides. */
  staleEntities: number;
} {
  let pinning = 0;
  let stale = 0;
  let staleEntries = 0;
  let staleEntities = 0;
  for (const store of stores) {
    const owner = store.world();
    if (owner === null) continue;
    pinning++;
    if (current === undefined || owner === current) continue;
    stale++;
    for (const ctx of (store as unknown as WorldContextStore<{ entities?: unknown[] }>).all()) {
      staleEntries++;
      staleEntities += ctx.entities?.length ?? 0;
    }
  }
  return { pinning, stale, staleEntries, staleEntities };
}
