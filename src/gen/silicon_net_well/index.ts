/* ── Design z: Кремниевый НЕТ-колодец ─────────────────────── */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { seededRandom, hashSeed, withSeededRandom } from '../../core/rand';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { SEED } from "./meta";
import { initWorld, buildRooms, connectCore, decorateRooms, placeLifts, tuneZones, placeDrops, expandSiliconNetWellRouteGeometry, tuneSiliconNetWellRouteZones } from "./geometry";
import { registerSiliconNetWellContent, spawnNpcs, spawnAmbientNpcs, placeContainers, spawnThreats } from "./npcs";

export function generateSiliconNetWellDesignFloor(seed = SEED): FloorGeneration {
  registerSiliconNetWellContent();
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };

    initWorld(world);
    const rooms = buildRooms(world);
    connectCore(world, rooms);
    decorateRooms(world, rooms);
    placeLifts(world, rooms);
    generateZones(world);
    tuneZones(world);

    const owners = spawnNpcs(entities, nextId, rooms);
    spawnAmbientNpcs(entities, nextId, rooms);
    placeContainers(world, rooms, owners);
    placeDrops(world, entities, nextId, rooms);
    spawnThreats(world, entities, nextId, rooms);

    // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:silicon_net_well:-25', -25));
    expandSiliconNetWellRouteGeometry(world, rngFn);
    tuneSiliconNetWellRouteZones(world);
    
    sanitizeDoors(world);
    ensureConnectivity(world, rooms.entry.x + 14.5, rooms.entry.y + 11.5);
    world.rebuildContainerMap();
    world.bakeLights();

    return {
      isDecentralized: true,
      world,
      entities,
      spawnX: rooms.entry.x + 14.5,
      spawnY: rooms.entry.y + 11.5,
    };
  });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
