/* ── Podad design z: living hell geometry with anomaly hooks ─ */

import {
  LiftDirection,
  
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { rng, withSeededRandom } from '../../core/rand';
import {
  connectRoomsMST,
  ensureConnectivity,
  generateZones,
  placeLifts,
  sanitizeDoors,
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { PODAD_DEFAULT_SEED, SPAWN_X, SPAWN_Y, CAPILLARY_FIELD_TAG } from "./meta";
import { expandPodadRouteGeometry, reinforcePodadAuthoredHqTerritory, paintPodadTerrain, decoratePodadRooms, forceUpperLift, registerPodadRouteCues } from "./geometry";
import { spawnPodadPlotNpcs, buildPodadField, carvePodadSpines, buildPodadRooms, stampPodadCapillaryField, tunePodadZones, spawnPodadHeralds, seedPodadDrops } from "./npcs";

export function generatePodadDesignFloor(seed = PODAD_DEFAULT_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };

    const field = buildPodadField(seed);
    paintPodadTerrain(world, field);
    carvePodadSpines(world);

    const rooms = buildPodadRooms(world, seed);
    decoratePodadRooms(world, rooms);
    connectRoomsMST(world, Object.values(rooms));
    ensureConnectivity(world, SPAWN_X + 0.5, SPAWN_Y + 0.5);

    generateZones(world);
    tunePodadZones(world);
    placeLifts(world, 4, LiftDirection.UP, { x: rooms.entry.x + 7, y: rooms.entry.y + 7 });
    forceUpperLift(world, rooms.upperLift);
    ensureConnectivity(world, SPAWN_X + 0.5, SPAWN_Y + 0.5);
    sanitizeDoors(world);
    const capillaryCells = stampPodadCapillaryField(world, rooms, seed);
    rooms.entry.name = `${rooms.entry.name} ${CAPILLARY_FIELD_TAG}${capillaryCells}]`;
    
    expandPodadRouteGeometry(world, rng);
    reinforcePodadAuthoredHqTerritory(world);

    world.bakeLights();

    spawnPodadPlotNpcs(world, entities, nextId, rooms);
    spawnPodadHeralds(world, entities, nextId, SPAWN_X + 0.5, SPAWN_Y + 0.5);
    seedPodadDrops(world, entities, nextId, rooms);
    registerPodadRouteCues(world, rooms);

    return {
      isDecentralized: true,
      world,
      entities,
      spawnX: SPAWN_X + 0.5,
      spawnY: SPAWN_Y + 0.5,
    };
  });
}

export function generatePodadDebugFloor(seed = PODAD_DEFAULT_SEED): FloorGeneration {
  return generatePodadDesignFloor(seed);
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
