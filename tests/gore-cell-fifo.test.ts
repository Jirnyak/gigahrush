import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { VISUAL_SLOTS_PER_CELL, World, visualSlotOffset } from '../src/core/world';
import { spawnDeathPool } from '../src/systems/blood_fx';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

function meatChunkCount(world: World, cx: number, cy: number): number {
  const ci = world.idx(cx, cy);
  let count = 0;
  for (let slot = 0; slot < VISUAL_SLOTS_PER_CELL; slot++) {
    if (world.visualSlots[visualSlotOffset(ci, slot)] === 34) count++;
  }
  return count;
}

/* Regression lock for the gore ratchet: meat chunks are permanent visual
 * slots, and repeated deaths on one cell must not stack chunk after chunk —
 * they crowd useful geometry out of the mesh instance cap. */

test('repeated deaths on one cell do not stack extra meat chunks', () => {
  const world = openWorld();
  spawnDeathPool(world, 10.5, 10.5, false, 1);
  const after1 = meatChunkCount(world, 10, 10);
  assert.ok(after1 >= 1 && after1 <= 3, `expected 1-3 chunks, got ${after1}`);
  spawnDeathPool(world, 10.5, 10.5, false, 1);
  spawnDeathPool(world, 10.5, 10.5, false, 2);
  assert.equal(meatChunkCount(world, 10, 10), after1);
});

test('distinct cells keep their own meat chunks', () => {
  const world = openWorld();
  spawnDeathPool(world, 20.5, 20.5, false, 1);
  spawnDeathPool(world, 40.5, 40.5, false, 1);
  assert.ok(meatChunkCount(world, 20, 20) >= 1);
  assert.ok(meatChunkCount(world, 40, 40) >= 1);
});
