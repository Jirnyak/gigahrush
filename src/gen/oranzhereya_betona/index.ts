/* -- Design z: Оранжерея бетона ------------------------------
 * A food-and-water route floor where crop beds, spores and valves
 * make scarcity visible without a runtime growth simulation.
 */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { hashSeed, withSeededRandom, seededRandom } from '../../core/rand';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
  scatterAmbientLights
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import {  applyDesignFloorPopulationField } from '../design_floors/population';
import type { DesignFloorGeneration } from '../floor_manifest';
import { SEED } from "./meta";
import { tuneOranzhereyaBetonaRouteZones, expandOranzhereyaBetonaRouteGeometry, reinforceOranzhereyaBetonaAuthoredTerritory, initWorld, buildRooms, connectRooms, decorateRooms, placeLifts, placeDrops } from "./geometry";
import { spawnNpcs, placeContainers, spawnThreats } from "./npcs";

export function generateOranzhereyaBetonaDesignFloor(seed = SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };

    initWorld(world);
    const rooms = buildRooms(world);
    connectRooms(world, rooms);
    decorateRooms(world, rooms);
    placeLifts(world, rooms.entry);
    generateZones(world);
    tuneOranzhereyaBetonaRouteZones(world);

    const owners = spawnNpcs(entities, nextId, rooms);
    placeContainers(world, rooms, owners);
    placeDrops(world, entities, nextId, rooms);
    spawnThreats(world, entities, nextId, rooms);

    // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:oranzhereya_betona:-2', -2));
    expandOranzhereyaBetonaRouteGeometry(world, rngFn);
    
    // Now finalize
    generateZones(world);
    tuneOranzhereyaBetonaRouteZones(world);
    reinforceOranzhereyaBetonaAuthoredTerritory(world);
    
    sanitizeDoors(world);
    ensureConnectivity(world, rooms.entry.x + 10.5, rooms.entry.y + 14.5);
    world.rebuildContainerMap();
    scatterAmbientLights(world, rngFn, 260);
    world.bakeLights();

    const generation: DesignFloorGeneration = { isDecentralized: true, world, entities, spawnX: rooms.entry.x + 10.5, spawnY: rooms.entry.y + 14.5 };
      applyDesignFloorPopulationField(generation, { id: 'oranzhereya_betona', z: -2 });
      return generation;
    });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
