import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { World } from '../src/core/world';
import { markDangerFieldCell, updateDangerField } from '../src/systems/danger_field';

// Regression lock: the incremental scan box collapses to an empty range on the
// first idle tick. Without the writer-side mark hook the field stayed frozen for
// the rest of the session — impulses never decayed and never diffused, so every
// room that ever saw blood stayed permanently "dangerous" for NPC room scoring.
test('danger field keeps decaying after an idle tick collapsed the scan box', () => {
  const world = new World();
  for (let y = 30; y <= 34; y++) {
    for (let x = 30; x <= 34; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }

  // Idle ticks with an empty field: the bounding box collapses here.
  updateDangerField(world, 0.5);
  updateDangerField(world, 0.5);

  const idx = world.idx(32, 32);
  world.dangerField[idx] = 200;
  markDangerFieldCell(world, 32, 32);

  updateDangerField(world, 0.5);

  assert.ok(world.dangerField[idx] < 200, 'impulse cell must decay');
  const spread = world.dangerField[world.idx(33, 32)]
    + world.dangerField[world.idx(31, 32)]
    + world.dangerField[world.idx(32, 33)]
    + world.dangerField[world.idx(32, 31)];
  assert.ok(spread > 0, 'impulse must diffuse into open neighbours');
});
