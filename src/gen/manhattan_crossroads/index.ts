/* -- Design z: Manhattan-like indoor crossroads ------------- */

import { LiftDirection, RoomType, W, ZoneFaction, type Entity, type Zone } from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom, SeedRng } from '../../core/rand';
import { ensureConnectivity, sanitizeDoors, placeLifts, finalizeExpandedFloor } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import {  applyDesignFloorPopulationField } from '../design_floors/population';

export * from './meta';
import {
  DESIGN_FLOOR_ID,
  MANHATTAN_CROSSROADS_SEED,
  DISTRICT_MIN,
  DISTRICT_MAX,
  ROAD_TEX,
  SIDEWALK_TEX,
  MARK_TEX,
  CROSSWALK_ROOM_DEF_ID,
} from './meta';
import {
  addLogicalRoom,
  carveStreetGrid,
  stampDistrictRooms,
  placeDistrictLifts,
  applyZones,
  expandManhattanCrossroadsRouteShell,
} from './geometry';
import {
  spawnCrossroadsNpcs,
  seedContainersAndDrops,
  spawnRoadHazards,
} from './npcs';

export function generateManhattanCrossroadsDesignFloor(seed = MANHATTAN_CROSSROADS_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const rng = new SeedRng(seed);
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const roadRoom = addLogicalRoom(world, 'Асфальтовая сетка авеню', RoomType.CORRIDOR, DISTRICT_MIN, DISTRICT_MIN, DISTRICT_MAX - DISTRICT_MIN, DISTRICT_MAX - DISTRICT_MIN, ROAD_TEX);
    const sidewalkRoom = addLogicalRoom(world, 'Бордюры и служебные края', RoomType.COMMON, DISTRICT_MIN, DISTRICT_MIN, DISTRICT_MAX - DISTRICT_MIN, DISTRICT_MAX - DISTRICT_MIN, SIDEWALK_TEX);
    const markRoom = addLogicalRoom(world, CROSSWALK_ROOM_DEF_ID, RoomType.MEDICAL, DISTRICT_MIN, DISTRICT_MIN, DISTRICT_MAX - DISTRICT_MIN, DISTRICT_MAX - DISTRICT_MIN, MARK_TEX);

    roadRoom.ceilingTier = 198;
    sidewalkRoom.ceilingTier = 198;
    markRoom.ceilingTier = 198;

    carveStreetGrid(world, roadRoom.id, sidewalkRoom.id, markRoom.id);
    const rooms = stampDistrictRooms(world, sidewalkRoom.id);
    placeDistrictLifts(world);

    const spawnX = 512.5;
    const spawnY = 772.5;
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);
    applyZones(world);

    const npcIds = spawnCrossroadsNpcs(rng, world, entities, nextId, rooms);
    seedContainersAndDrops(world, entities, nextId, rooms, npcIds);
    spawnRoadHazards(rng, world, entities, nextId, rooms);

    placeLifts(world, 16, LiftDirection.UP);
    placeLifts(world, 16, LiftDirection.DOWN);

    world.bakeLights();

    const route = designFloorById(DESIGN_FLOOR_ID)!;
    const generation = { world, entities, spawnX, spawnY, isDecentralized: true as const };

    expandManhattanCrossroadsRouteShell(world, () => rng.random());
    finalizeExpandedFloor(generation, route, () => rng.random());
    applyDesignFloorPopulationField(generation, route);

    for (const room of world.rooms) {
      if (room) room.ceilingTier = 198;
    }
    
    return { ...generation, isDecentralized: true as const };
  });
}

export function tuneManhattanCrossroadsZone(world: World, zone: Zone, baseDanger: number): void {
  const d = world.dist(zone.cx, zone.cy, W / 2, W / 2);
  const centralControl = d < 158 || (zone.cx >= 448 && zone.cx <= 608 && zone.cy >= 432 && zone.cy <= 592);
  const wrongExit = zone.cx >= 640 && zone.cy >= 512 && zone.cy <= 760;
  const falseRoad = zone.cx <= 176 || zone.cx >= 848 || zone.cy <= 176 || zone.cy >= 848;
  const gangRoad = wrongExit || falseRoad || (zone.cx >= 610 && zone.cy >= 610) || (zone.cx <= 304 && zone.cy >= 610);
  const marketQueue = zone.cx >= 320 && zone.cx <= 560 && zone.cy >= 480 && zone.cy <= 620;

  if (gangRoad) {
    zone.faction = ZoneFaction.WILD;
    zone.level = Math.max(zone.level, wrongExit ? 4 : 3);
  } else if (centralControl) {
    zone.faction = ZoneFaction.LIQUIDATOR;
    zone.level = Math.max(zone.level, baseDanger);
  } else if (marketQueue) {
    zone.faction = zone.cx > 500 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.level = Math.max(zone.level, baseDanger);
  } else {
    zone.faction = ZoneFaction.CITIZEN;
    zone.level = Math.max(2, Math.min(5, zone.level));
  }

  if (falseRoad && (zone.cx <= 176 || zone.cx >= 848) && (zone.cy <= 176 || zone.cy >= 848)) {
    zone.level = Math.max(zone.level, 5);
  }
  zone.hasLift = zone.hasLift || d < 330 || wrongExit;
}
