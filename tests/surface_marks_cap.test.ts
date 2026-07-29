import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { SURFACE_FLAG_CHALK_MAP, World } from '../src/core/world';
import {
  MarkType,
  SURFACE_MAP_MAX_CELLS,
  stampMark,
  stampLocalMark,
} from '../src/systems/surface_marks';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

/* Regression lock for the surfaceMap eviction cap (gradual-FPS-decay fix).
 * The render surface atlas has exactly SURF_MAX_SLOTS tiles; letting
 * world.surfaceMap grow past that flips the renderer from cheap
 * incremental uploads to a full O(N log N) re-sort + atlas re-upload on
 * every camera move. The systems-layer cap must hold the live cell count
 * at/under the atlas capacity so the renderer stays on its cheap path. */

test('ambient surface marks never grow the map past the render atlas cap', () => {
  const world = openWorld();
  // Stamp far more distinct single-cell marks than the cap allows.
  for (let i = 0; i < SURFACE_MAP_MAX_CELLS * 3; i++) {
    const x = 2 + (i % 500);
    const y = 2 + Math.floor(i / 500) * 2;
    // stampLocalMark writes into exactly one cell — a clean distinct-cell driver.
    stampLocalMark(world, x, y, 0.5, 0.5, 0.2, MarkType.DRIP, i * 131 + 7, 200, 180, 30, 200);
  }
  assert.ok(
    world.surfaceMap.size <= SURFACE_MAP_MAX_CELLS,
    `surfaceMap grew to ${world.surfaceMap.size}, expected <= ${SURFACE_MAP_MAX_CELLS}`,
  );
});

test('eviction preserves functional (flagged) cells and drops oldest ambient residue', () => {
  const world = openWorld();
  // Mark a functional cell first (a chalk-map clue) so it is the OLDEST entry.
  const chalkCi = world.idx(1, 1);
  world.surfaceFlags[chalkCi] = SURFACE_FLAG_CHALK_MAP;
  stampLocalMark(world, 1, 1, 0.5, 0.5, 0.2, MarkType.MARONARY, 999, 60, 200, 60, 220);
  assert.equal(world.surfaceMap.has(chalkCi), true);

  // Flood the map with ambient residue well past the cap.
  for (let i = 0; i < SURFACE_MAP_MAX_CELLS * 2; i++) {
    const x = 3 + (i % 500);
    const y = 3 + Math.floor(i / 500) * 2;
    stampLocalMark(world, x, y, 0.5, 0.5, 0.2, MarkType.DRIP, i * 131 + 7, 200, 180, 30, 200);
  }

  assert.ok(world.surfaceMap.size <= SURFACE_MAP_MAX_CELLS);
  // The flagged clue survives despite being the oldest insertion.
  assert.equal(
    world.surfaceMap.has(chalkCi),
    true,
    'functional flagged surface cell must not be evicted',
  );
});

test('multi-cell splats still stay within the cap under heavy accumulation', () => {
  const world = openWorld();
  for (let i = 0; i < SURFACE_MAP_MAX_CELLS * 2; i++) {
    const x = 5 + (i % 480);
    const y = 5 + Math.floor(i / 480) * 3;
    // Larger radius touches a 3x3-ish neighborhood per stamp.
    stampMark(world, x, y, 0.5, 0.5, 0.6, MarkType.SPLAT, i * 173 + 3, 180, 20, 20, 200);
  }
  assert.ok(
    world.surfaceMap.size <= SURFACE_MAP_MAX_CELLS,
    `surfaceMap grew to ${world.surfaceMap.size}, expected <= ${SURFACE_MAP_MAX_CELLS}`,
  );
});
