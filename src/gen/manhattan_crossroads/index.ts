/* -- Design z: Manhattan-like indoor crossroads ------------- */

import { RoomType, type Entity } from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom, SeedRng } from '../../core/rand';
import { ensureConnectivity, sanitizeDoors, finalizeExpandedFloor } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';

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
import { lightManhattanCrossroads } from './lighting';
import { newEntityIdCursor } from '../entity_ids';

export function generateManhattanCrossroadsDesignFloor(seed = MANHATTAN_CROSSROADS_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const rng = new SeedRng(seed);
    const world = new World();
    const entities: Entity[] = [];
    const nextId = newEntityIdCursor();
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

    const route = designFloorById(DESIGN_FLOOR_ID)!;
    const generation = { world, entities, spawnX, spawnY, isDecentralized: true as const };

    expandManhattanCrossroadsRouteShell(world, () => rng.random());
    finalizeExpandedFloor(generation, route, () => rng.random());

    // Свет ставится ПОСЛЕ расширения и санации дверей: до них половины магистралей
    // ещё нет, а бордюр, на который садится фонарь, может уехать. Бейк в
    // `finalizeExpandedFloor` при этом остаётся холостым, поэтому пересчёт идёт
    // здесь — прежний бейк до расширения света вообще не видел.
    lightManhattanCrossroads(world);
    world.bakeLights();

    // Небо объявляют ТОЛЬКО три уличные комнаты (выше по функции), и расширение
    // маршрутной оболочки переиспользует их же. Бланкетного прохода по всем
    // комнатам здесь больше нет: он красил небом и интерьеры зданий, из-за чего
    // в комнате внутри дома не было потолка вовсе. Внутри — обычный потолок,
    // выведенный из формы комнаты; снаружи — каньон.

    return { ...generation, isDecentralized: true as const };
  });
}
