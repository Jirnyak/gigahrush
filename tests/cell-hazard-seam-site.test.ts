import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { World } from '../src/core/world';
import { getCellHazardMoveMultiplier, registerCellHazardSite, tickCellHazards } from '../src/systems/cell_hazards';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

// Regression lock: hazard cells are stamped from generator rooms, which may
// straddle the world seam. A plain coordinate mean put the site centre near the
// middle of the map and pushed the query radius to its 96 ceiling, so the actor
// broadphase scanned the wrong region — NPCs and monsters standing in the goo
// were never ticked.
test('hazard site across the world seam keeps a local centre and radius', () => {
  const world = new World();
  const state = makeGameState({ currentZ: 0, time: 10 });

  const cells: number[] = [];
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const x = world.wrap(dx);
      const y = world.wrap(500 + dy);
      world.cells[world.idx(x, y)] = Cell.FLOOR;
      cells.push(world.idx(x, y));
    }
  }

  registerCellHazardSite(world, {
    id: 'seam_test_site',
    kind: 'adhesive',
    displayName: 'Шов',
    cells,
    stickAfter: 0.1,
  });

  // The NPC stands inside the goo, one cell past the seam.
  const npc = makeTestNpc({ id: 2, x: world.wrap(1023) + 0.5, y: 500.5 });
  const player = makeTestPlayer({ id: 1, x: 400.5, y: 400.5 });
  const entities = [player, npc];
  rebuildEntityIndexForSimulation(entities, 10_000);

  // Sticking is driven by the actor broadphase around the site centre; the
  // direct-cell slow multiplier alone would pass even with a broken centre.
  tickCellHazards(world, entities, state, 0.3, player, false);
  tickCellHazards(world, entities, state, 0.3, player, false);

  assert.ok(
    getCellHazardMoveMultiplier(world, npc) <= 0.2,
    `an NPC in a seam-straddling hazard must get stuck, multiplier=${getCellHazardMoveMultiplier(world, npc)}`,
  );
});
