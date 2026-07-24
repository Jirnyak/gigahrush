import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { hashSeed, seededRandom, withSeededRandom } from '../../core/rand';
import {  applyDesignFloorPopulationField } from '../design_floors/population';
import { designFloorById } from '../../data/design_floors';
import { finalizeExpandedFloor} from '../shared';
import { MOEBIUS_PODEZD_SEED } from "./meta";
import { expandMoebiusPodezdRouteGeometry, reinforceMoebiusPodezdAuthoredTerritory, buildMoebiusRooms, placeLifts, decorateRooms } from "./geometry";
import { placeDecisionContainers, spawnReversedPatrols, spawnSeamThreats } from "./npcs";

export function generateMoebiusPodezdDesignFloor(seed = MOEBIUS_PODEZD_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextEntityId = { v: 1 };
    const rooms = buildMoebiusRooms(world);

    placeLifts(world);
    decorateRooms(world, rooms);
    generateZones(world);
    placeDecisionContainers(world, rooms);
    spawnReversedPatrols(entities, nextEntityId);
    spawnSeamThreats(world, entities, nextEntityId);

    sanitizeDoors(world);
    ensureConnectivity(world, 184.5, 405.5);
    world.bakeLights();

    const generation: FloorGeneration = {
      world,
      entities,
      spawnX: 184.5,
      spawnY: 405.5,
      isDecentralized: true as const,
      onAfterTerritory: (w) => {
        reinforceMoebiusPodezdAuthoredTerritory(w);
      }
    };

    const route = designFloorById('moebius_podezd')!;
    const rngFn = seededRandom(hashSeed(`design-full:${route.id}:${route.z}`, route.z));

    expandMoebiusPodezdRouteGeometry(world, rngFn);
    finalizeExpandedFloor(generation, route, rngFn);
    applyDesignFloorPopulationField({ ...generation, isDecentralized: true as const }, route);

    return { ...generation, isDecentralized: true as const };
  });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
