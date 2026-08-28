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
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import type { DesignFloorGeneration } from '../floor_manifest';
import { newEntityIdCursor } from '../entity_ids';
import { SEED } from "./meta";
import { tuneOranzhereyaBetonaRouteZones, expandOranzhereyaBetonaRouteGeometry, reinforceOranzhereyaBetonaAuthoredTerritory, initWorld, buildRooms, connectRooms, decorateRooms, placeDrops } from "./geometry";
import { spawnNpcs, placeContainers, spawnThreats } from "./npcs";
import { lightOranzhereyaBetona } from "./lighting";

export function generateOranzhereyaBetonaDesignFloor(seed = SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = newEntityIdCursor();

    initWorld(world);
    const rooms = buildRooms(world);
    connectRooms(world, rooms);
    decorateRooms(world, rooms);
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
    // Общая россыпь ламп по всей карте заменена собственным проходом: она сеяла
    // свет наугад, одинаково над грядкой и над глухим бетоном.
    lightOranzhereyaBetona(world);
    world.bakeLights();

    const generation: DesignFloorGeneration = { isDecentralized: true, world, entities, spawnX: rooms.entry.x + 10.5, spawnY: rooms.entry.y + 14.5 };
      return generation;
    });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
