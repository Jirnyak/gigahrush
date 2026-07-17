/* -- Design z: critical_leak_archive - wet percolation archive -- */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  DoorState,
  LiftDirection,
  QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { hashSeed } from '../../core/rand';
import { registerFloorSideQuest } from '../../data/plot';
import { sanitizeDoors } from '../shared';
import { DESIGN_NPC_HOME_FLOOR_KEY, CRITICAL_LEAK_ARCHIVE_ROUTE_ID, CRITICAL_LEAK_ARCHIVE_Z, CRITICAL_LEAK_ARCHIVE_BASE_FLOOR, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES, CriticalLeakArchiveState, CriticalLeakArchiveGeneration, NextId, TARGET_ROUTE, ARCHIVIST_DEF, LIQUIDATOR_DEF } from "./meta";
import { addDoor, expandArchiveMidAndMicro, paintCriticalLeakHqTerritory, placeLift, decorateArchiveRooms, carveContaminatedShortcut, connectAnchors, buildRooms, tuneInitialZones } from "./geometry";
import { buildPercolationField, carvePercolationComponent, spawnLeakNpc, populateContainers } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'critical_leak_archivist_varvara', ARCHIVIST_DEF, [
  {
    id: 'critical_leak_carry_dry_packet',
    giverId: getPlotNpcNumericId('critical_leak_archivist_varvara')!,
    type: QuestType.FETCH,
    desc: 'Варвара Сухопись: «Найдете сухую жалобу под сургучом - донесите, не заходя лишний раз в воду. Мокрая причина становится слухом.»',
    targetItem: 'sealed_complaint', targetCount: 1,
    targetFloorZ: CRITICAL_LEAK_ARCHIVE_BASE_FLOOR,
    targetRoute: TARGET_ROUTE,
    targetRoomDefId: CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.dryIndex,
    targetHint: 'сухой пакет лежит на архивном острове; водяной короткий ход быстрее, но заражает маршрут',
    rewardItem: 'filter_receipt', rewardCount: 1,
    extraRewards: [{ defId: 'blank_form', count: 2 }],
    relationDelta: 10, xpReward: 55, moneyReward: 38,
    eventTargetName: 'Сухой архивный пакет вынесен из критической протечки.',
    eventTags: ['critical_leak_archive', 'dry_packet', 'documents', 'trade'],
    eventData: { routeId: CRITICAL_LEAK_ARCHIVE_ROUTE_ID, outcome: 'dry_packet_saved' },
    eventSeverity: 3,
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'critical_leak_liquidator_egor', LIQUIDATOR_DEF, [
  {
    id: 'critical_leak_raise_floodgate',
    giverId: getPlotNpcNumericId('critical_leak_liquidator_egor')!,
    type: QuestType.VISIT,
    desc: 'Егор Отсечка: «Дойдите до пульта водоотсечки. Шлюз не спасет архив, но даст сухой край для отхода.»',
    targetFloorZ: CRITICAL_LEAK_ARCHIVE_BASE_FLOOR,
    targetRoute: TARGET_ROUTE,
    targetRoomDefId: CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.floodgate,
    targetHint: 'пульт стоит за зараженным водяным коротким ходом и сухой обходной перемычкой',
    rewardItem: 'decon_fluid', rewardCount: 1,
    relationDelta: 8, xpReward: 45, moneyReward: 24,
    eventTargetName: 'Пульт архивной водоотсечки проверен; вода получила временный край.',
    eventTags: ['critical_leak_archive', 'floodgate', 'water', 'shortcut'],
    eventData: { routeId: CRITICAL_LEAK_ARCHIVE_ROUTE_ID, floodgateRaised: true },
    eventSeverity: 4,
  },
  {
    id: 'critical_leak_trade_contaminated_proof',
    giverId: getPlotNpcNumericId('critical_leak_liquidator_egor')!,
    type: QuestType.FETCH,
    desc: 'Егор Отсечка: «Если полезете коротким ходом, принесите мазок воды. Без пробы все скажут, что вы просто намочили сапоги.»',
    targetItem: 'contaminated_swab', targetCount: 1,
    targetFloorZ: CRITICAL_LEAK_ARCHIVE_BASE_FLOOR,
    targetRoute: TARGET_ROUTE,
    targetRoomDefId: CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.shortcut,
    rewardItem: 'wet_rag_bundle', rewardCount: 1,
    extraRewards: [{ defId: 'decon_fluid', count: 1 }],
    relationDelta: 6, xpReward: 48, moneyReward: 28,
    eventTargetName: 'Проба зараженной воды из архивного короткого хода сдана ликвидатору.',
    eventTags: ['critical_leak_archive', 'contaminated_shortcut', 'water_sample', 'liquidator'],
    eventData: { routeId: CRITICAL_LEAK_ARCHIVE_ROUTE_ID, shortcutEvidence: true },
    eventSeverity: 3,
  },
]);

export function generateCriticalLeakArchiveDesignFloor(): CriticalLeakArchiveGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId: NextId = { v: 10000 };
  const seed = hashSeed('design-z: critical-leak-archive:percolation', CRITICAL_LEAK_ARCHIVE_Z);
  const state: CriticalLeakArchiveState = {
    routeId: CRITICAL_LEAK_ARCHIVE_ROUTE_ID,
    anchorZ: CRITICAL_LEAK_ARCHIVE_Z,
    largestComponentCells: 0,
    wetCausewayCells: 0,
    dryCausewayCells: 0,
    bridgesAdded: 0,
    contaminatedShortcutCells: 0,
    midArchiveBlocks: 0,
    microArchiveRooms: 0,
    hqAnchorRooms: 0,
    hqSupportRooms: 0,
    dryPacketContainerIds: [],
    floodgateContainerId: -1,
    debugEntry: {
      spawnX: 512.5,
      spawnY: 502.5,
      summary: 'critical leak archive pending',
    },
  };

  const field = buildPercolationField(seed);
  state.largestComponentCells = field.largestCells.length;
  carvePercolationComponent(world, field, seed, state);

  const rooms = buildRooms(world);
  const lobbyNorth = addDoor(world, rooms.lobby, 'north', 25);
  const lobbyWest = addDoor(world, rooms.lobby, 'west', 18);
  const tradeEast = addDoor(world, rooms.trade, 'east', 16);
  const drySouth = addDoor(world, rooms.dryIndex, 'south', 34);
  const disputedSouth = addDoor(world, rooms.disputedStack, 'south', 35, DoorState.HERMETIC_CLOSED);
  const floodgateNorth = addDoor(world, rooms.floodgate, 'north', 33);
  const shortcutWest = addDoor(world, rooms.shortcut, 'west', 17);
  const dryingNorth = addDoor(world, rooms.dryingRoom, 'north', 34);
  const witnessSouth = addDoor(world, rooms.witness, 'south', 40);

  connectAnchors(world, field, [
    { point: lobbyNorth },
    { point: lobbyWest },
    { point: tradeEast },
    { point: drySouth },
    { point: disputedSouth, wet: true },
    { point: floodgateNorth },
    { point: shortcutWest, wet: true },
    { point: dryingNorth },
    { point: witnessSouth },
  ], state);
  carveContaminatedShortcut(world, shortcutWest, floodgateNorth, state);
  const archiveExpansion = expandArchiveMidAndMicro(world, field);
  state.midArchiveBlocks = archiveExpansion.blocks;
  state.microArchiveRooms = archiveExpansion.microRooms;
  state.hqAnchorRooms = archiveExpansion.hqRooms;
  state.hqSupportRooms = archiveExpansion.supportRooms;

  placeLift(world, rooms.lobby.x + 4, rooms.lobby.y + 8, rooms.lobby.x + 7, rooms.lobby.y + 8, LiftDirection.UP);
  placeLift(world, rooms.lobby.x + rooms.lobby.w - 5, rooms.lobby.y + 8, rooms.lobby.x + rooms.lobby.w - 8, rooms.lobby.y + 8, LiftDirection.DOWN);

  tuneInitialZones(world);
  paintCriticalLeakHqTerritory(world, archiveExpansion.hqCompounds);
  decorateArchiveRooms(world, rooms);
  populateContainers(world, rooms, state);

  spawnLeakNpc(entities, nextId, ARCHIVIST_DEF, 'critical_leak_archivist_varvara', rooms.trade.x + 9, rooms.trade.y + 14);
  spawnLeakNpc(entities, nextId, LIQUIDATOR_DEF, 'critical_leak_liquidator_egor', rooms.floodgate.x + 14, rooms.floodgate.y + 16, 'makarov');

  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();

  state.debugEntry.summary = `largest=${state.largestComponentCells} bridges=${state.bridgesAdded} wet=${state.wetCausewayCells} dry=${state.dryCausewayCells} blocks=${state.midArchiveBlocks} micro=${state.microArchiveRooms}`;
  return {
    world,
    entities,
    spawnX: state.debugEntry.spawnX,
    spawnY: state.debugEntry.spawnY,
    criticalLeakState: state,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
