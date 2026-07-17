import { getPlotNpcNumericId } from '../../data/npc_packages';
/* -- Design z: penrose_laundry - aperiodic laundry and boiler service -- */

import {
  Cell,
  QuestType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import { DESIGN_NPC_HOME_FLOOR_KEY, PENROSE_LAUNDRY_ROUTE_ID, PENROSE_LAUNDRY_Z, PENROSE_LAUNDRY_ROOM_DEF_IDS, PenroseLaundryTileRecord, PenroseLaundryState, PenroseLaundryGeneration, C, LOCK_KEY_ID, TILE_SPECS, SYMBOL_CHAIN_IDS, DEFLATION_IDS, NPC_IDS, MARFA_DEF, IGOR_DEF, LIDIA_DEF, TONYA_DEF } from "./meta";
import { penroseLaundryStates, buildPenroseFullFloor, stampLaundryRoom, connectTilePath, placeLifts, dressTileRoom, markSymbolCells, tunePenroseZones, dropPenroseSupplies, registerPenroseRouteCues, roomById, countCells, countFogCells } from "./geometry";
import { placePenroseContainers, spawnPenroseThreats, spawnPlotNpc } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.marfa, MARFA_DEF, [{
  id: 'penrose_laundry_follow_matching_symbols',
  giverId: getPlotNpcNumericId(NPC_IDS.marfa)!,
  type: QuestType.VISIT,
  desc: 'Марфа Меточная: «На П-81 прямой путь врет. Идите по одинаковым Солнцам: первое у машин, второе у сушки, третье у скрытой умывальной.»',
  targetRoomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.hiddenCache,
  rewardItem: 'chalk',
  rewardCount: 1,
  extraRewards: [{ defId: 'cloth_roll', count: 2 }],
  relationDelta: 10,
  xpReward: 45,
  moneyReward: 12,
  eventTags: ['penrose_laundry', 'symbol_chain', 'hidden_cache', 'route_choice'],
  eventData: { routeId: PENROSE_LAUNDRY_ROUTE_ID, choice: 'follow_matching_symbols' },
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.igor, IGOR_DEF, [{
  id: 'penrose_laundry_break_lock',
  giverId: getPlotNpcNumericId(NPC_IDS.igor)!,
  type: QuestType.FETCH,
  desc: 'Игорь Прищеп: «Гаечный ключ принесете - дам бирку. Прачечный замок любит, когда его сначала уважают железом.»',
  targetItem: 'wrench',
  targetCount: 1,
  rewardItem: LOCK_KEY_ID,
  rewardCount: 1,
  extraRewards: [{ defId: 'cleaning_kit', count: 1 }],
  relationDelta: 8,
  xpReward: 35,
  moneyReward: 18,
  eventTags: ['penrose_laundry', 'laundry_lock', 'break_lock', 'access'],
  eventData: { routeId: PENROSE_LAUNDRY_ROUTE_ID, choice: 'break_laundry_lock' },
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.lidia, LIDIA_DEF, [{
  id: 'penrose_laundry_divert_steam',
  giverId: getPlotNpcNumericId(NPC_IDS.lidia)!,
  type: QuestType.FETCH,
  desc: 'Лидия Пароотвод: «Бирку вентиля сюда. Пар уйдет в сушильный карман, и П-81 перестанет варить людей у котла.»',
  targetItem: 'valve_tag',
  targetCount: 1,
  rewardItem: 'boiler_water',
  rewardCount: 2,
  extraRewards: [{ defId: 'asbestos_cord', count: 1 }],
  relationDelta: 9,
  xpReward: 40,
  moneyReward: 20,
  eventTags: ['penrose_laundry', 'steam', 'divert_steam', 'repair'],
  eventData: { routeId: PENROSE_LAUNDRY_ROUTE_ID, choice: 'divert_steam' },
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.tonya, TONYA_DEF, [{
  id: 'penrose_laundry_hidden_washroom_cache',
  giverId: getPlotNpcNumericId(NPC_IDS.tonya)!,
  type: QuestType.FETCH,
  desc: 'Тоня Тайник: «Из скрытой умывальной достаньте журнал давления. Кэш любит сухую руку и ненавидит прямые маршруты.»',
  targetItem: 'pressure_logbook',
  targetCount: 1,
  rewardItem: 'filtered_water',
  rewardCount: 2,
  extraRewards: [{ defId: 'water_coupon', count: 1 }],
  relationDelta: 10,
  xpReward: 45,
  moneyReward: 14,
  eventTags: ['penrose_laundry', 'hidden_washroom_cache', 'pressure_logbook', 'cache'],
  eventData: { routeId: PENROSE_LAUNDRY_ROUTE_ID, choice: 'find_hidden_washroom_cache' },
}]);

export function generatePenroseLaundryDesignFloor(): PenroseLaundryGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.PANEL;
    world.floorTex[i] = Tex.F_CONCRETE;
    world.factionControl[i] = ZoneFaction.CITIZEN;
  }

  const roomsById = new Map<string, Room>();
  const tileRecords: PenroseLaundryTileRecord[] = [];
  for (const spec of TILE_SPECS) {
    const room = stampLaundryRoom(world, spec);
    roomsById.set(spec.id, room);
    tileRecords.push({
      id: spec.id,
      roomDefId: room.name,
      roomId: room.id,
      symbol: spec.symbol,
      motif: spec.motif,
      x: room.x,
      y: room.y,
      w: room.w,
      h: room.h,
    });
  }

  buildPenroseFullFloor(world, roomsById);
  const lockedDoorIds: number[] = [];
  connectTilePath(world, roomsById, lockedDoorIds);
  placeLifts(world, roomById(roomsById, 'lift_lobby'));
  for (const spec of TILE_SPECS) dressTileRoom(world, roomById(roomsById, spec.id), spec);
  markSymbolCells(world, roomsById);

  generateZones(world);
  tunePenroseZones(world);

  const marfaId = spawnPlotNpc(entities, nextId, NPC_IDS.marfa, MARFA_DEF, roomById(roomsById, 'first_sun'), 4, 5, 0);
  const igorId = spawnPlotNpc(entities, nextId, NPC_IDS.igor, IGOR_DEF, roomById(roomsById, 'laundry_lock'), 4, 4, Math.PI * 0.25);
  const lidiaId = spawnPlotNpc(entities, nextId, NPC_IDS.lidia, LIDIA_DEF, roomById(roomsById, 'steam_valve'), 6, 6, Math.PI);
  const tonyaId = spawnPlotNpc(entities, nextId, NPC_IDS.tonya, TONYA_DEF, roomById(roomsById, 'second_sun'), 5, 4, Math.PI * 0.5);

  const containerIds = placePenroseContainers(world, roomsById, {
    marfaId,
    igorId,
    lidiaId,
    tonyaId,
  });
  dropPenroseSupplies(world, entities, nextId, roomsById);
  spawnPenroseThreats(world, entities, nextId, roomsById);
  registerPenroseRouteCues(world, roomsById);

  sanitizeDoors(world);
  ensureConnectivity(world, C - 23.5, C - 10.5);
  world.rebuildContainerMap();
  world.bakeLights();

  const state: PenroseLaundryState = {
    routeId: PENROSE_LAUNDRY_ROUTE_ID,
    anchorZ: PENROSE_LAUNDRY_Z,
    tiles: tileRecords,
    symbolChainRoomNames: SYMBOL_CHAIN_IDS.map(id => roomById(roomsById, id).name),
    deflationPocketRoomNames: DEFLATION_IDS.map(id => roomById(roomsById, id).name),
    lockedDoorIds,
    containerIds,
    waterCells: countCells(world, Cell.WATER),
    steamCells: countFogCells(world, 48),
    debugEntry: {
      spawnX: C - 23.5,
      spawnY: C - 10.5,
      summary: 'finite_penrose_like_patch=13 tiles, symbol_chain=sun, decisions=symbol/lock/steam/cache',
    },
  };
  penroseLaundryStates.set(world, state);

  return {
    world,
    entities,
    spawnX: state.debugEntry.spawnX,
    spawnY: state.debugEntry.spawnY,
    penroseLaundryState: state,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
