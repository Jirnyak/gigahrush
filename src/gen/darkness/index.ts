import { applyDesignFloorPopulationField } from "../design_floors/population";
/* ── Design z: Darkness — post-Void light-resource pocket ─── */

import {
  Tex, 
  
  
  type Entity
  ,
} from '../../core/types';
import { World } from '../../core/world';
import {
  ensureConnectivity,
} from '../shared';

import {
  DarknessDesignGeneration,
  darknessStateByWorld,
  blackoutDarknessLights,
  buildDarknessTopologyPlan,
  buildRooms,
  placeContent,
  applyDarknessZones,
  initialState} from './geometry';
import {
  registerDarknessRouteCues
} from './npcs';

export const DARKNESS_DESIGN_FLOOR_ID = 'darkness' as const;
export const DARKNESS_FUTURE_Z = -48;
export const DARKNESS_DEBUG_ENTRY = {
  routeId: DARKNESS_DESIGN_FLOOR_ID,
  z: DARKNESS_FUTURE_Z,
  generator: 'generateDarknessDesignFloor',
} as const;



export function generateDarknessDesignFloor(): DarknessDesignGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  world.wallTex.fill(Tex.DARK);
  world.floorTex.fill(Tex.F_CONCRETE);

  const { roomsByKey, labels } = buildRooms(world);
  const entry = roomsByKey.get('entry')!;
  const spawnX = entry.x + 2.5;
  const spawnY = entry.y + (entry.h >> 1) + 0.5;

  applyDarknessZones(world);
  placeContent(world, entities, nextId, roomsByKey);
  registerDarknessRouteCues(world, roomsByKey);
  ensureConnectivity(world, spawnX, spawnY);
  const topology = buildDarknessTopologyPlan(world, roomsByKey, labels);
  blackoutDarknessLights(world);

  const darknessState = initialState(labels, topology);
  darknessStateByWorld.set(world, darknessState);

  const generation = { world, entities, spawnX, spawnY, darknessState };
    applyDesignFloorPopulationField(generation as any, { id: 'darkness', z: -52 } as any);
    return { ...generation, isDecentralized: true } as any;
}

