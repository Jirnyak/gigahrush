import { applyDesignFloorPopulationField } from '../design_floors/population';
import { seededRandom, hashSeed } from '../../core/rand';
/* ── Design z: Райсовет и Живой архив ───────────────────────
 * Routed authored-floor package. Route data lives in data/design_floors.ts;
 * generation is mounted through the design-floor manifest.
 */

import {
  W, Tex, RoomType, LiftDirection, ContainerKind, 
  Faction, MonsterKind, ZoneFaction,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { calcZoneLevel } from '../../systems/rpg';
import {
  carveCorridor, ensureConnectivity, generateZones, placeDoor
  ,
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { LIDA_DEF, GRANDFATHER_DEF, FIRE_LIQUIDATOR_DEF, FALSE_HEIR_DEF } from "./meta";
import { ArchiveRooms, createArchiveRoom, paintRoom, reinforceRaionsovetArchiveAuthoredHqTerritory, expandRaionsovetArchiveGeometry, connectRoomToPoint, placeFixedLift, addDrop, decorateArchive, paintNonRoomCells, retuneRaionsovetArchiveZones } from "./geometry";
import { spawnArchiveNpc, spawnArchiveGuard, spawnArchiveMonster, addArchiveContainer } from "./npcs";

export function generateRaionsovetArchiveDesignFloor(): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  const nextContainerId = { v: 1 };

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.MARBLE;
    world.floorTex[i] = Tex.F_MARBLE_TILE;
  }

  let roomId = 0;
  const waiting = createArchiveRoom(world, roomId++, RoomType.COMMON, 500, 500, 24, 14, 'Райсоветская очередь', Tex.MARBLE, Tex.F_RED_CARPET);
  const clerk = createArchiveRoom(world, roomId++, RoomType.OFFICE, 500, 487, 24, 12, 'Окна выдачи маршрутов');
  const catalog = createArchiveRoom(world, roomId++, RoomType.STORAGE, 525, 500, 22, 14, 'Каталожные коридоры', Tex.MARBLE, Tex.F_PARQUET);
  const shelves = createArchiveRoom(world, roomId++, RoomType.STORAGE, 548, 496, 20, 22, 'Закрытые жилые полки', Tex.PANEL, Tex.F_WOOD);
  const stamp = createArchiveRoom(world, roomId++, RoomType.OFFICE, 500, 515, 18, 12, 'Комната печатей');
  const fire = createArchiveRoom(world, roomId++, RoomType.STORAGE, 479, 500, 20, 14, 'Западные зараженные стеллажи', Tex.ROTTEN, Tex.F_CONCRETE);
  const heir = createArchiveRoom(world, roomId++, RoomType.OFFICE, 519, 515, 17, 12, 'Кабинет ложного наследника');
  const market = createArchiveRoom(world, roomId++, RoomType.OFFICE, 537, 515, 10, 12, 'Лицензионная ниша рынка 88');
  const checker = createArchiveRoom(world, roomId++, RoomType.OFFICE, 525, 487, 18, 12, 'Проверяющий пост');
  const rooms: ArchiveRooms = { waiting, clerk, catalog, shelves, stamp, fire, heir, market, checker };

  placeDoor(world, waiting, clerk, '', false);
  placeDoor(world, waiting, catalog, '', false);
  placeDoor(world, waiting, stamp, '', false);
  placeDoor(world, waiting, fire, '', false);
  placeDoor(world, stamp, heir, '', false);
  placeDoor(world, heir, market, '', false);
  placeDoor(world, catalog, checker, '', false);
  placeDoor(world, catalog, shelves, 'archive_access_permit', false);
  placeDoor(world, market, shelves, 'forged_stamp_sheet', false);

  connectRoomToPoint(world, waiting, 512, 464);
  connectRoomToPoint(world, waiting, 512, 552);
  carveCorridor(world, 512, 464, 530, 464);
  carveCorridor(world, 512, 552, 530, 552);
  placeFixedLift(world, 530, 464, LiftDirection.UP);
  placeFixedLift(world, 530, 552, LiftDirection.DOWN);

  for (const room of Object.values(rooms)) paintRoom(world, room);
  decorateArchive(world, rooms);
  paintNonRoomCells(world);
  ensureConnectivity(world, 512, 507);

  generateZones(world);
  for (const zone of world.zones) {
    zone.faction = zone.id % 5 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.level = Math.max(1, calcZoneLevel(zone.cx, zone.cy, 30));
  }

  addArchiveContainer(
    world, nextContainerId, clerk, clerk.x + 3, clerk.y + 3,
    ContainerKind.FILING_CABINET,
    'Журнал законных маршрутов',
    'faction',
    [
      { defId: 'archive_access_permit', count: 1 },
      { defId: 'raionsovet_floor_pass', count: 1 },
      { defId: 'elevator_access_order', count: 1 },
      { defId: 'temp_pass', count: 1 },
    ],
    ['legal', 'route_permit', 'document'],
    Faction.CITIZEN,
  );
  addArchiveContainer(
    world, nextContainerId, catalog, catalog.x + 2, catalog.y + catalog.h - 3,
    ContainerKind.FILING_CABINET,
    'Служебная картотека квартирных прав',
    'faction',
    [
      { defId: 'stolen_archive_card', count: 1 },
      { defId: 'missing_record_file', count: 1 },
      { defId: 'passport_stub', count: 1 },
    ],
    ['apartment_rights', 'theft', 'personal_file'],
    Faction.CITIZEN,
  );
  addArchiveContainer(
    world, nextContainerId, shelves, shelves.x + shelves.w - 3, shelves.y + shelves.h - 3,
    ContainerKind.SAFE,
    'Сейф жилых полок',
    'locked',
    [
      { defId: 'personal_file_copy', count: 1 },
      { defId: 'permanent_pass', count: 1 },
      { defId: 'confiscation_warrant', count: 1 },
      { defId: 'record_exposure_notice', count: 1 },
    ],
    ['visible_consequence', 'locked', 'apartment_rights'],
    Faction.CITIZEN,
  );
  addArchiveContainer(
    world, nextContainerId, stamp, stamp.x + stamp.w - 3, stamp.y + stamp.h - 3,
    ContainerKind.SECRET_STASH,
    'Черный ящик подмененных печатей',
    'secret',
    [
      { defId: 'forged_stamp_sheet', count: 1 },
      { defId: 'forged_raionsovet_pass', count: 1 },
      { defId: 'fake_pass', count: 1 },
      { defId: 'ink_bottle', count: 2 },
    ],
    ['illegal', 'forgery', 'back_route'],
  );
  addArchiveContainer(
    world, nextContainerId, market, market.x + market.w - 3, market.y + market.h - 3,
    ContainerKind.CASHBOX,
    'Лицензионный сейф рынка 88',
    'locked',
    [
      { defId: 'official_permit_slip', count: 1 },
      { defId: 'debt_settlement_receipt', count: 1 },
      { defId: 'ration_registry_extract', count: 1 },
      { defId: 'fake_pass', count: 1 },
    ],
    ['market_88', 'trade_license', 'document'],
    Faction.WILD,
  );

  addDrop(entities, nextId, waiting.x + 3, waiting.y + 2, 'blank_form', 1);
  addDrop(entities, nextId, waiting.x + waiting.w - 4, waiting.y + waiting.h - 3, 'blank_form', 1);
  addDrop(entities, nextId, stamp.x + 2, stamp.y + stamp.h - 3, 'ink_bottle', 1);
  addDrop(entities, nextId, fire.x + 2, fire.y + 2, 'siren_instruction', 1);

  spawnArchiveNpc(entities, nextId, LIDA_DEF, 'archive_lida_index', clerk.x + 5, clerk.y + clerk.h - 4);
  spawnArchiveNpc(entities, nextId, GRANDFATHER_DEF, 'archive_paper_grandfather', catalog.x + catalog.w - 4, catalog.y + 3);
  spawnArchiveNpc(entities, nextId, FIRE_LIQUIDATOR_DEF, 'archive_fire_liquidator', fire.x + fire.w - 4, fire.y + fire.h - 4, 'makarov');
  spawnArchiveNpc(entities, nextId, FALSE_HEIR_DEF, 'archive_false_heir', heir.x + 4, heir.y + 4);
  spawnArchiveGuard(entities, nextId, checker.x + checker.w - 4, checker.y + checker.h - 4);
  spawnArchiveMonster(world, entities, nextId, shelves.x + 7, shelves.y + shelves.h - 5, MonsterKind.PARAGRAPH);
  spawnArchiveMonster(world, entities, nextId, catalog.x + catalog.w - 5, catalog.y + Math.floor(catalog.h / 2), MonsterKind.PROTOKOLNIK);
  spawnArchiveMonster(world, entities, nextId, fire.x + 8, fire.y + 4, MonsterKind.PECHATEED);

  world.bakeLights();
    const generation = { world, entities, spawnX: 512.5, spawnY: 507.5 };

  const rngFn = seededRandom(hashSeed('design-full:raionsovet_archive:22', 22));
  expandRaionsovetArchiveGeometry(world, rngFn);
  retuneRaionsovetArchiveZones(world);
  reinforceRaionsovetArchiveAuthoredHqTerritory(world);

  applyDesignFloorPopulationField(generation as any, { id: 'raionsovet_archive', z: 22 } as any);
  return { ...generation, isDecentralized: true } as any;
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
export * from "./archive_poi";
