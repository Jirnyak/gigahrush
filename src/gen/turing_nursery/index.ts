/* -- Design z: turing_nursery - reaction diffusion nursery routes -- */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { rng, withSeededRandom } from '../../core/rand';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import { type FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import { finalizeExpandedFloor} from '../shared';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { SEED } from "./meta";
import { initWorld, buildNurseryRooms, connectNurseryRooms, decorateNursery, placeEmergencyPanels, placeLifts, tuneNurseryZones, placeDrops, registerStaticHazards } from "./geometry";
import { expandTuringNurseryRouteGeometry, spawnNpcs, spawnAmbientNpcs, placeContainers, spawnThreats, registerNurseryRouteCues, reactionField } from "./npcs";

export function generateTuringNurseryDesignFloor(seed = SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const field = reactionField(seed);

    initWorld(world);
    const rooms = buildNurseryRooms(world, field);
    connectNurseryRooms(world, rooms, field);
    placeLifts(world, rooms);
    decorateNursery(world, rooms, field);
    generateZones(world);
    tuneNurseryZones(world);
    placeEmergencyPanels(world, rooms);

    const owners = spawnNpcs(entities, nextId, rooms);
    spawnAmbientNpcs(entities, nextId, rooms);
    const containers = placeContainers(world, rooms, owners);
    placeDrops(world, entities, nextId, rooms);
    spawnThreats(world, entities, nextId, rooms);
    registerStaticHazards(world, rooms);
    registerNurseryRouteCues(world, rooms, containers);

    sanitizeDoors(world);
    ensureConnectivity(world, rooms.entry.x + 16.5, rooms.entry.y + 12.5);
    world.rebuildContainerMap();
    world.bakeLights();

    const route = designFloorById('turing_nursery')!;
    const rngGen = () => rng();
    expandTuringNurseryRouteGeometry(world, rngGen);

    const generation = {
      world,
      entities,
      spawnX: rooms.entry.x + 16.5,
      spawnY: rooms.entry.y + 12.5,
      isDecentralized: true,
    };

    finalizeExpandedFloor(generation, route, rngGen);
    applyDesignFloorPopulationField(generation, route);

    return generation;
  });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
