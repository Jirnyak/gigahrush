import { strict as assert } from 'node:assert';
import test from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';

import '../src/content';
import { generateFloor } from '../src/gen/floor_manifest';
import { MAX_LIVE_WORLDS, liveWorldCount, resetPeakLiveWorldCount } from '../src/core/world';
import {
  clearAllWorldContexts, dropWorldContextsExcept, worldContextStats,
} from '../src/world/world_contexts';

/* The live-floor invariant, as a number rather than a paragraph.
 *
 * Only one floor is played at a time; a second World is legitimate only during a
 * transition and for the lift's one-back cache. Sixteen content modules used to
 * deny this with a module-level `contexts` array capped on entry COUNT while
 * every entry pinned a whole World (42 MiB of grids) plus that floor's entities.
 * Three loads of one floor left three worlds alive through a forced GC.
 *
 * Two assertions, because either alone gives false comfort:
 *   • worlds  — the 42 MiB grids. Needs a forced GC; FinalizationRegistry runs
 *               after collection, so an un-GC'd count is only an upper bound.
 *   • stale   — contexts still pointing at a departed floor. A store keeps that
 *               floor's ~9600 entities whether or not the World itself happens
 *               to be collectable at that instant, so the world count can read
 *               clean while monsters, NPCs and drops from three floors ago live.
 */

// Self-contained GC rather than --expose-gc: this file lands in the generation
// suite (it imports ../src/gen/), and neither runner passes node flags. Turning
// the flag on from inside keeps the invariant enforced under plain `npm run check`.
function resolveGc(): (() => void) | null {
  if (typeof global.gc === 'function') return global.gc;
  try {
    v8.setFlagsFromString('--expose_gc');
    return vm.runInNewContext('gc') as () => void;
  } catch {
    return null;
  }
}

const gc = resolveGc();
const canForceGc = gc !== null;
const forceGc = async (): Promise<void> => {
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 4; i++) gc?.();
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

test('floor generation does not retain worlds past the invariant', async t => {
  if (!canForceGc) {
    t.skip('needs --expose-gc; run via `node --expose-gc` or the unit-test runner');
    return;
  }
  clearAllWorldContexts();
  await forceGc();
  resetPeakLiveWorldCount();

  // Six loads across four floor types, each dropped the way main.ts drops them.
  const zs = [0, 14, 30, -26, 0, -50];
  for (const z of zs) {
    const gen = generateFloor(z, 4242 + z, false);
    dropWorldContextsExcept(gen.world);
  }
  await forceGc();

  assert.ok(
    liveWorldCount() <= MAX_LIVE_WORLDS,
    `after ${zs.length} floor loads and a forced GC, ${liveWorldCount()} worlds are still alive `
    + `(invariant: <= ${MAX_LIVE_WORLDS}). A content module is holding a floor it left.`,
  );
});

test('walking away from a floor type releases it', async t => {
  if (!canForceGc) {
    t.skip('needs --expose-gc');
    return;
  }
  clearAllWorldContexts();
  await forceGc();

  // The case that exposed the single-slot holders: visit a floor type whose
  // modules only run there, then leave and never come back. Nothing re-registers
  // over their slot, so only the unload hook can free the floor.
  const alive = new Set<string>();
  const registry = new FinalizationRegistry((tag: string) => alive.delete(tag));
  const route: readonly (readonly [string, number])[] = [
    ['hell', -36], ['kvartiry', 14], ['living', 0],
    ['ministry', 30], ['collectors', -26], ['void', -50],
  ];
  for (const [tag, z] of route) {
    const gen = generateFloor(z, 31337, false);
    alive.add(tag);
    registry.register(gen.world, tag);
    dropWorldContextsExcept(gen.world);
  }
  await forceGc();

  // The last floor is the one being played and legitimately stays.
  alive.delete('void');
  assert.deepEqual(
    [...alive], [],
    `departed floors still held: ${[...alive].join(', ')}. A module kept its floor `
    + 'after the player left it — register a floor-scoped reset for that slot.',
  );
});

test('no content store holds a floor other than the current one', async t => {
  if (!canForceGc) {
    t.skip('needs --expose-gc');
    return;
  }
  clearAllWorldContexts();

  // Load two different floors; the second is the one being played.
  generateFloor(30, 909, false);
  const current = generateFloor(0, 910, false);
  dropWorldContextsExcept(current.world);

  const stats = worldContextStats(current.world);
  assert.equal(
    stats.stale, 0,
    `${stats.stale} store(s) still point at a departed floor, holding ${stats.staleEntries} `
    + `context(s) and ${stats.staleEntities} entities. dropWorldContextsExcept() missed them.`,
  );
  assert.equal(stats.staleEntities, 0, 'entities from an unloaded floor are still reachable');
});

test('a store re-registered on a new world forgets the old floor by itself', async () => {
  clearAllWorldContexts();
  const { createWorldContextStore } = await import('../src/world/world_contexts');
  const store = createWorldContextStore<{ roomId: number; tag: string }>();

  const first = generateFloor(0, 555, false);
  store.register(first.world, 7, { roomId: 7, tag: 'old' });
  assert.equal(store.all().length, 1);

  // Registering against a different world must drop the previous floor's entries
  // even if the unload hook never runs — the safety net under the hook.
  const second = generateFloor(0, 556, false);
  store.register(second.world, 9, { roomId: 9, tag: 'new' });
  assert.equal(store.all().length, 1, 'previous floor entries survived a world change');
  assert.equal(store.byRoom(7), undefined, 'stale room context survived a world change');
  assert.equal(store.byRoom(9)?.tag, 'new');
  assert.equal(store.world(), second.world);
});
