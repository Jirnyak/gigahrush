/* ── Design z: Верхнее бюро ──────────────────────────────── */

import {
  MonsterKind,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { genLog } from '../log';
import {
  type NextId, spawnAdminMonster,
} from '../admin_common';
import type { FloorGeneration } from '../floor_manifest';
import { xorshift32 } from '../../core/rand';
import {
  fillDefaultTextures,
  expandUpperBureauGeometry,
  setAdministrativeZones,
  retuneUpperBureauZones,
  reinforceUpperBureauAuthoredHqTerritory,
  stampUpperBureauRooms,
  carveUpperBureauCorridors,
  addUpperBureauDoorsAndLifts,
  decorateUpperBureauRooms,
  addUpperBureauItems,
  addUpperBureauContainers,
  finalizeUpperBureauFloor
} from './geometry';
import {
  spawnUpperBureauNpcs
} from './npcs';

export * from './meta';
import {
  UPPER_BUREAU_ANCHOR_Z,
  UPPER_BUREAU_DISPLAY_NAME,
  UPPER_BUREAU_ROUTE_ID,
} from './meta';

export function generateUpperBureauDesignFloor(seed: number): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId: NextId = { v: 10000 };
  const rand = xorshift32(seed);

  fillDefaultTextures(world);

  const rooms = stampUpperBureauRooms(world);
  carveUpperBureauCorridors(world);
  addUpperBureauDoorsAndLifts(world, rooms);
  decorateUpperBureauRooms(world, rooms);
  setAdministrativeZones(world);

  const npcIds = spawnUpperBureauNpcs(entities, nextId, rooms);
  addUpperBureauItems(entities, nextId, rooms);
  addUpperBureauContainers(world, rooms, npcIds);
  spawnAdminMonster(world, entities, nextId, rooms.files.x + rooms.files.w - 4, rooms.files.y + rooms.files.h - 3, MonsterKind.PARAGRAPH);

  finalizeUpperBureauFloor(world, rooms.salon);

  const spawnX = rooms.salon.x + 8.5;
  const spawnY = rooms.salon.y + 10.5;

  expandUpperBureauGeometry(world, rand);
  retuneUpperBureauZones(world);
  reinforceUpperBureauAuthoredHqTerritory(world);

  genLog(`[UPPER_BUREAU] ${UPPER_BUREAU_DISPLAY_NAME} ${UPPER_BUREAU_ROUTE_ID} z=${UPPER_BUREAU_ANCHOR_Z} spawn=(${spawnX}, ${spawnY})`);
  return { isDecentralized: true, world, entities, spawnX, spawnY };
}



export * from './geometry';
export * from './npcs';
