import { LiftDirection, RoomType, type Entity } from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom, SeedRng } from '../../core/rand';
import { ensureConnectivity, sanitizeDoors, placeLifts, finalizeExpandedFloor, generateZones } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';

import {
  DESIGN_FLOOR_ID,
  OUTER_DISTRICT_SEED,
  DISTRICT_MIN,
  DISTRICT_MAX,
  ROAD_TEX,
} from './meta';
import {
  generateOuterDistrictCity,
} from './geometry';
import {
  spawnOuterDistrictNpcs,
} from './npcs';
import {
  createOuterDistrictSkyProvider,
} from './sky';

export function generateOuterDistrictDesignFloor(seed = OUTER_DISTRICT_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const rng = new SeedRng(seed);
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };

    // Set base outer ceiling to very high
    const baseRoom = {
      id: world.rooms.length,
      type: RoomType.CORRIDOR,
      x: DISTRICT_MIN,
      y: DISTRICT_MIN,
      w: DISTRICT_MAX - DISTRICT_MIN,
      h: DISTRICT_MAX - DISTRICT_MIN,
      doors: [],
      sealed: false,
      name: 'Улица',
      apartmentId: -1,
      wallTex: ROAD_TEX,
      floorTex: ROAD_TEX,
      ceilingTier: 240,
    };
    world.rooms.push(baseRoom);

    const rooms = generateOuterDistrictCity(world, rng, nextId, baseRoom.id);

    const spawnX = DISTRICT_MIN + Math.floor((DISTRICT_MAX - DISTRICT_MIN) / 2);
    const spawnY = DISTRICT_MIN + Math.floor((DISTRICT_MAX - DISTRICT_MIN) / 2);
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);

    spawnOuterDistrictNpcs(rng, world, entities, nextId, rooms);

    placeLifts(world, 4, LiftDirection.UP);
    placeLifts(world, 4, LiftDirection.DOWN);

    generateZones(world);

    world.bakeLights();

    const route = designFloorById(DESIGN_FLOOR_ID)!;
    const skyProvider = createOuterDistrictSkyProvider();
    const generation: FloorGeneration & { skyProvider: typeof skyProvider } = { 
      world, entities, spawnX, spawnY, isDecentralized: true, skyProvider 
    };

    finalizeExpandedFloor(generation, route, () => rng.random());

    return generation;
  });
}
