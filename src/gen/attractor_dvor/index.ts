/* -- Design z: attractor_dvor / flow-driven service yard -------- */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { ensureConnectivity, generateZones, sanitizeDoors, scatterAmbientLights } from '../shared';
import { seededRandom, hashSeed } from '../../core/rand';
import type { FloorGeneration } from '../floor_manifest';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { ATTRACTOR_DVOR_ROUTE_ID, ATTRACTOR_DVOR_Z, ATTRACTOR_DVOR_ROOM_DEF_IDS, AttractorDvorState } from "./meta";
import { attractorStates, expandAttractorDvorRouteGeometry, tuneAttractorDvorRouteZones, placeAttractorDvorEmergencyPanels, initWorld, buildRooms, carveAttractorStreamlines, connectRoomsGraph, decorateRooms, placeLifts, registerAttractorRouteCues } from "./geometry";
import { placeContainers, spawnActors } from "./npcs";

export function generateAttractorDvorDesignFloor(): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  initWorld(world);
  const rooms = buildRooms(world);
  const streamlines = carveAttractorStreamlines(world);
  connectRoomsGraph(world, rooms);
  decorateRooms(world, rooms);
  placeLifts(world, rooms);
  generateZones(world);
  tuneAttractorDvorRouteZones(world);
  const switchPanels = placeAttractorDvorEmergencyPanels(world);
  registerAttractorRouteCues(world, rooms);
  placeContainers(world, rooms);
  spawnActors(world, entities, nextId, rooms);

  sanitizeDoors(world);
  ensureConnectivity(world, rooms.entry.x + 82.5, rooms.entry.y + 17.5);
  world.rebuildContainerMap();
  world.bakeLights();

  const state: AttractorDvorState = {
    routeId: ATTRACTOR_DVOR_ROUTE_ID,
    z: ATTRACTOR_DVOR_Z,
    streamlines,
    switchPanels,
    patrolLoops: [
      {
        id: 'limit_cycle_guard_ring',
        roomDefIds: [
          ATTRACTOR_DVOR_ROOM_DEF_IDS.southSpine,
          ATTRACTOR_DVOR_ROOM_DEF_IDS.westSpine,
          ATTRACTOR_DVOR_ROOM_DEF_IDS.northSpine,
          ATTRACTOR_DVOR_ROOM_DEF_IDS.eastSpine,
        ],
        guardCount: 4,
        predictionHint: 'Патруль держится внешней петли; срез через мертвую зону короче, но шумнее.',
      },
    ],
    deadZoneRoomName: ATTRACTOR_DVOR_ROOM_DEF_IDS.deadZone,
    debugEntry: {
      spawnX: rooms.entry.x + 82.5,
      spawnY: rooms.entry.y + 17.5,
      summary: 'flow corridors, three local parameter panels, dead-zone cut and limit-cycle patrol ring',
    },
  };
  attractorStates.set(world, state);

  // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:attractor_dvor:-34', -34));
    expandAttractorDvorRouteGeometry(world, rngFn);
    
    // Now finalize
    generateZones(world);
    tuneAttractorDvorRouteZones(world);
    
    sanitizeDoors(world);
    // ensureConnectivity was NOT called here previously, actually wait!
    // generateAttractorDvorDesignFloor previously just returned the layout, but let's check!
    
    const generation = { world, entities, spawnX: state.debugEntry.spawnX, spawnY: state.debugEntry.spawnY };
    ensureConnectivity(world, generation.spawnX, generation.spawnY);
    
    placeAttractorDvorEmergencyPanels(world);
    scatterAmbientLights(world, rngFn, 260);
    world.rebuildContainerMap();
    world.bakeLights();
    applyDesignFloorPopulationField(generation as any, { id: 'attractor_dvor', z: -34 } as any);
    return { ...generation, isDecentralized: true } as any;
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
