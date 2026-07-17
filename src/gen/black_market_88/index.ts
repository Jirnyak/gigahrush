/* -- Design z: Черный рынок 88 --------------------------------
 * Standalone future-floor slice. It deliberately does not add a new
 * number; route integration belongs to the floor manifest owner.
 */

export * from './meta';
import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { generateZones, sanitizeDoors } from '../shared';
import { type FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import { finalizeExpandedFloor} from '../shared';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { rng } from '../../core/rand';
import './living_zone';

import { expandBlackMarket88Bazaar, buildMarketRooms, linkMarketRooms, decorateMarketRooms, addAccessLifts, tuneMarketZones } from './geometry';
import { registerBlackMarket88DesignFloorContent, spawnMarketNpcs, spawnMarketQueueCrowd, seedMarketContainers } from './npcs';

export function generateBlackMarket88DesignFloor(): FloorGeneration {
  registerBlackMarket88DesignFloorContent();

  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  generateZones(world);
  tuneMarketZones(world);

  const rooms = buildMarketRooms(world);
  linkMarketRooms(world, rooms);
  decorateMarketRooms(world, rooms);
  addAccessLifts(world, rooms);

  const npcs = spawnMarketNpcs(world, entities, nextId, rooms);
  spawnMarketQueueCrowd(world, entities, nextId, rooms);
  seedMarketContainers(world, rooms, npcs);

  sanitizeDoors(world);

  const route = designFloorById('black_market_88')!;
  const rngGen = () => rng();
  expandBlackMarket88Bazaar(world, rngGen);

  const generation = {
    world,
    entities,
    spawnX: rooms.publicGate.x + 3.5,
    spawnY: rooms.publicGate.y + Math.floor(rooms.publicGate.h / 2) + 0.5,
    isDecentralized: true,
  };

  finalizeExpandedFloor(generation, route, rngGen);
  applyDesignFloorPopulationField(generation, route);

  return generation;
}

export function generateBlackMarket88DebugFloor(): FloorGeneration {
  return generateBlackMarket88DesignFloor();
}

export * from './geometry';
export * from './npcs';

