import { withSeededRandom, rng } from '../../core/rand';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { expandFloor69FullFloor } from './districts';
/* -- Design floor 69: adult vice, debt, blackmail and refuge ---- */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';
import { sanitizeDoors, ensureConnectivity } from '../shared';
import { genLog } from '../log';

import { buildLayout, decorateRooms, applyZones, registerFloor69RouteCues } from './geometry';
import { seedContainers, spawnFloor69Npcs, applyFloor69OwnershipVisibilityHeatmap, applyFloor69AmbientSpriteTemplates, seedLooseItems } from './npcs';
import { DESIGN_FLOOR_ID, DESIGN_FLOOR_Z, FLOOR_69_DEFAULT_SEED, createFloor69State, floor69DebugLines, type Floor69Generation } from './meta';

export * from './meta';
export * from './geometry';
export * from './npcs';
export * from './districts';
export * from './routes';

export function generateFloor69DesignFloor(seed = FLOOR_69_DEFAULT_SEED): Floor69Generation {

  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const state = createFloor69State();

    const rooms = buildLayout(world);
    decorateRooms(world, rooms, seed);
    applyZones(world);
    applyFloor69OwnershipVisibilityHeatmap(world);
    seedContainers(world, rooms);
    spawnFloor69Npcs(world, entities, nextId, rooms);
    applyFloor69AmbientSpriteTemplates(entities);
    seedLooseItems(entities, nextId, rooms);
    registerFloor69RouteCues(world, rooms);

    const spawnX = rooms.publicCorridor.x + 8.5;
    const spawnY = rooms.publicCorridor.y + 3.5;
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);
    world.bakeLights();

    const route = { id: DESIGN_FLOOR_ID, z: DESIGN_FLOOR_Z };
    const generation = { world, entities };
    expandFloor69FullFloor(generation as any, rng);
    applyDesignFloorPopulationField(generation as any, route as any);

    genLog(`[F69] design floor seed=${seed} rooms=${world.rooms.length} spawn=(${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);
    return {
      world,
      entities,
      spawnX,
      spawnY,
      routeId: DESIGN_FLOOR_ID,
      z: DESIGN_FLOOR_Z,
      seed,
      state,
      debugLines: floor69DebugLines(state, seed),
      isDecentralized: true,
    };
  });
}

