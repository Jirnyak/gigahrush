/* ── Design z −44: stenka / Стенка на стенку ─────────────────────
 *
 *   Арена двух сторон. Ликвидаторы против диких: три линии от базы к
 *   базе, лес тупиковыми карманами между ними, башни на линиях, гнёзда
 *   у своих концов. Игрок приходит третьим — по матрице отношений
 *   ликвидаторы ему свои, дикие враждебны всем, так что сторона
 *   выбирается сама собой, а не переключателем.
 *
 *   Своих систем этаж не заводит ни одной: марш крипов — территориальный
 *   поводок, вражда — общая матрица, волны — общий шаг источника.
 */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';
import { seededRandom } from '../../core/rand';
import {} from '../shared';
import { finalizeExpandedFloor } from '../shared';
import { designFloorById } from '../../data/design_floors';
import type { FloorGeneration } from '../floor_manifest';
import {
  arenaFloorCells,
  buildLanes,
  carveLanes,
  paintLaneFloors,
  paintSolidBase,
  placeLaneLamps,
  stampArenaRooms,
  stampCamps,
} from './geometry';
import { placeCampDens, placeCampLoot, placeLaneActors } from './actors';
import { BASE_A, STENKA_METRICS, STENKA_ROUTE_ID, STENKA_Z } from './meta';
import { newEntityIdCursor } from '../entity_ids';

export function generateStenkaDesignFloor(seed = 4404): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = newEntityIdCursor();
  const nextRoomId = { v: 0 };
  const rng = seededRandom(seed);

  paintSolidBase(world);
  const lanes = buildLanes();
  const laneCells = carveLanes(world, lanes);
  const rooms = stampArenaRooms(world, lanes, nextRoomId);
  stampCamps(world, lanes, rooms, nextRoomId, seed);
  paintLaneFloors(world, lanes);
  placeLaneLamps(world, lanes);

  const spawnX = BASE_A.x + 0.5;
  const spawnY = BASE_A.y + 0.5;

  const placed = placeLaneActors(entities, nextId, lanes, rooms);

  const generation: FloorGeneration = { world, entities, spawnX, spawnY, isDecentralized: true };
  // Порядок обязателен: зоны, санация дверей и связность идут после того, как
  // вырезан весь объём — иначе рубежи и лагеря остаются отдельными компонентами.
  finalizeExpandedFloor(generation, designFloorById(STENKA_ROUTE_ID)!, rng);

  placeCampLoot(world, rooms.camps);
  const dens = placeCampDens(world, entities, nextId, rooms);
  world.rebuildContainerMap();
  world.bakeLights();

  STENKA_METRICS.set(world, {
    routeId: STENKA_ROUTE_ID,
    z: STENKA_Z,
    laneCells,
    campCount: rooms.camps.length,
    denCount: dens,
    towerCount: placed.towers,
    nestCount: placed.nests,
  });
  void arenaFloorCells;

  return generation;
}

export * from './meta';
export * from './geometry';
export * from './actors';
