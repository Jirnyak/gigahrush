/* -- Design z: number_registry / Числовой реестр ----------- */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  LiftDirection,
  MonsterKind,
  QuestType,
  RoomType,
  Tex,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { xorshift32 } from '../../core/rand';
import { DESIGN_NPC_HOME_FLOOR_KEY, NUMBER_REGISTRY_ROUTE_ID, NUMBER_REGISTRY_BASE_FLOOR, NextId, ROUTE_TARGET, REGISTRAR_DEF, PRIME_GUARD_DEF, COMPOSITE_DEF } from "./meta";
import { fillDefaultTextures, stampRegistryRoom, placeLiftCell, decorateRegistryRooms, retuneZoneMap, retuneNumberRegistryZones, registerNumberRegistryRouteCues, expandNumberRegistryGeometry, carveNumberRegistryCorridors, addNumberRegistryDoors, populateNumberRegistry } from "./geometry";
import { alignNumberRegistryAmbientNpcTerritory } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'number_registry_vera_modulus', REGISTRAR_DEF, [
  {
    id: 'number_registry_buy_modulus',
    giverId: getPlotNpcNumericId('number_registry_vera_modulus')!,
    type: QuestType.FETCH,
    desc: 'Вера Модульная: «Заплати 97 рублей в кассу модуля. Я дам ордер и скажу, по какому остатку идти.»',
    targetItem: 'money',
    targetCount: 97,
    targetFloorZ: NUMBER_REGISTRY_BASE_FLOOR,
    targetRoute: ROUTE_TARGET,
    targetRoomDefId: 'Касса модуля 7',
    targetHint: 'Числовой реестр z=+32: касса рядом с залом сверки остатков.',
    rewardItem: 'elevator_access_order',
    rewardCount: 1,
    extraRewards: [{ defId: 'blank_form', count: 1 }],
    relationDelta: 7,
    xpReward: 55,
    moneyReward: 0,
    eventTargetName: 'Модуль маршрута куплен через кассу Числового реестра.',
    eventSeverity: 3,
    eventPrivacy: 'local',
    eventTags: ['number_registry', 'modulus_bribe', 'residue_route', 'documents'],
    eventData: { routeId: NUMBER_REGISTRY_ROUTE_ID, decision: 'bribe_modulus_clerk' },
  },
  {
    id: 'number_registry_decode_residue',
    giverId: getPlotNpcNumericId('number_registry_vera_modulus')!,
    type: QuestType.FETCH,
    desc: 'Вера Модульная: «Принеси чистый бланк. По нему сверим остаток и откроем пересечную картотеку без лишней очереди.»',
    targetItem: 'blank_form',
    targetCount: 1,
    targetFloorZ: NUMBER_REGISTRY_BASE_FLOOR,
    targetRoute: ROUTE_TARGET,
    targetRoomDefId: 'Зал сверки остатков',
    targetHint: 'Числовой реестр: искать столы с экранами остатков у центрального зала.',
    rewardItem: 'archive_access_permit',
    rewardCount: 1,
    extraRewards: [{ defId: 'ration_registry_extract', count: 1 }],
    relationDelta: 9,
    xpReward: 65,
    moneyReward: 25,
    eventTargetName: 'Остаток маршрута расшифрован в Числовом реестре.',
    eventSeverity: 3,
    eventPrivacy: 'private',
    eventTags: ['number_registry', 'residue_decode', 'crt_intersection', 'access'],
    eventData: { routeId: NUMBER_REGISTRY_ROUTE_ID, decision: 'decode_residue_route' },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'number_registry_prime_guard', PRIME_GUARD_DEF, [
  {
    id: 'number_registry_clear_prime_corridor',
    giverId: getPlotNpcNumericId('number_registry_prime_guard')!,
    type: QuestType.KILL,
    desc: 'Федор Простой: «Убей параграф в простом коридоре. Потом бери короткий ход, пока бумага не начала шевелиться.»',
    targetMonsterKind: MonsterKind.PARAGRAPH,
    killNeeded: 1,
    targetFloorZ: NUMBER_REGISTRY_BASE_FLOOR,
    targetRoute: ROUTE_TARGET,
    targetRoomDefId: 'Простой рискованный коридор',
    targetHint: 'Числовой реестр: короткий верхний коридор с красными отметками и печатеедами.',
    rewardItem: 'forged_stamp_sheet',
    rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 10,
    xpReward: 90,
    moneyReward: 60,
    eventTargetName: 'Простой коридор Числового реестра временно очищен.',
    eventSeverity: 4,
    eventPrivacy: 'witnessed',
    eventTags: ['number_registry', 'prime_corridor', 'combat', 'documents'],
    eventData: { routeId: NUMBER_REGISTRY_ROUTE_ID, decision: 'prime_risky_corridor' },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'number_registry_composite_witness', COMPOSITE_DEF, [
  {
    id: 'number_registry_file_composite_path',
    giverId: getPlotNpcNumericId('number_registry_composite_witness')!,
    type: QuestType.FETCH,
    desc: 'Семен Составной: «Принеси бланк в публичный обход. Очередь длинная, зато с печатью и без простого коридора.»',
    targetItem: 'blank_form',
    targetCount: 1,
    targetFloorZ: NUMBER_REGISTRY_BASE_FLOOR,
    targetRoute: ROUTE_TARGET,
    targetRoomDefId: 'Составной публичный обход',
    targetHint: 'Числовой реестр: нижний коридор с лавками и свидетелями.',
    rewardItem: 'official_permit_slip',
    rewardCount: 1,
    extraRewards: [{ defId: 'passport_stub', count: 1 }],
    relationDelta: 8,
    xpReward: 60,
    moneyReward: 35,
    eventTargetName: 'Составной обход Числового реестра оформлен через свидетелей.',
    eventSeverity: 3,
    eventPrivacy: 'local',
    eventTags: ['number_registry', 'composite_path', 'public_queue', 'documents'],
    eventData: { routeId: NUMBER_REGISTRY_ROUTE_ID, decision: 'composite_public_path' },
  },
]);

export function generateNumberRegistryDesignFloor(seed: number): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId: NextId = { v: 10000 };
  let nextRoomId = 0;
  const rand = xorshift32(seed);

  fillDefaultTextures(world);

  const rooms = {
    hub: stampRegistryRoom(world, nextRoomId++, RoomType.COMMON, 'Зал сверки остатков', 480, 492, 64, 38, Tex.F_PARQUET),
    mod5: stampRegistryRoom(world, nextRoomId++, RoomType.OFFICE, 'Окно остатка 2 mod 5', 430, 468, 36, 18, Tex.F_MARBLE_TILE),
    mod7: stampRegistryRoom(world, nextRoomId++, RoomType.OFFICE, 'Касса модуля 7', 430, 532, 36, 18, Tex.F_GREEN_CARPET),
    mod11: stampRegistryRoom(world, nextRoomId++, RoomType.OFFICE, 'Окно остатка 4 mod 11', 462, 562, 42, 18, Tex.F_MARBLE_TILE),
    prime: stampRegistryRoom(world, nextRoomId++, RoomType.CORRIDOR, 'Простой рискованный коридор', 556, 456, 94, 18, Tex.F_RED_CARPET),
    composite: stampRegistryRoom(world, nextRoomId++, RoomType.COMMON, 'Составной публичный обход', 556, 536, 102, 24, Tex.F_GREEN_CARPET),
    crt: stampRegistryRoom(world, nextRoomId++, RoomType.STORAGE, 'Китайская пересечная картотека', 674, 494, 42, 30, Tex.F_MARBLE_TILE),
    safe: stampRegistryRoom(world, nextRoomId++, RoomType.HQ, 'Сейф общего остатка', 724, 500, 24, 18, Tex.F_RED_CARPET),
  };

  carveNumberRegistryCorridors(world, rooms);
  addNumberRegistryDoors(world, rooms);

  placeLiftCell(world, 476, 512, 477, 512, LiftDirection.UP);
  placeLiftCell(world, 746, 509, 744, 509, LiftDirection.DOWN);

  decorateRegistryRooms(world, rooms);
  generateZones(world);
  retuneZoneMap(world);

  populateNumberRegistry(world, entities, nextId, rooms);

  registerNumberRegistryRouteCues(world, rooms);

  expandNumberRegistryGeometry(world, rand);
  retuneNumberRegistryZones(world);
  alignNumberRegistryAmbientNpcTerritory(world, entities);

  sanitizeDoors(world);
  ensureConnectivity(world, rooms.hub.x + 8, rooms.hub.y + 20);
  world.rebuildContainerMap();
  world.bakeLights();

  return {
    isDecentralized: true,
    world,
    entities,
    spawnX: rooms.hub.x + 8.5,
    spawnY: rooms.hub.y + 20.5,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
