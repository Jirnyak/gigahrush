/* -- Design z: Бюро Кэли, paperwork as a Cayley graph -- */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  LiftDirection,
  QuestType,
  Tex,
  W,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { ensureConnectivity, sanitizeDoors } from '../shared';
import { DESIGN_NPC_HOME_FLOOR_KEY, CAYLEY_BYURO_ROUTE_ID, CAYLEY_BYURO_ROOM_NAMES, CayleyByuroGeneration, CAYLEY_TAGS, CLERK_DEF, COSET_DEF, INSPECTOR_DEF } from "./meta";
import { carveCayleyGraphField, placeLift, createCayleyMacroCampuses, connectCayleyMacroGraph, createCayleyHqClusters, createCayleyLatticeBooths, createRooms, connectCayleyGraph, populateAuthoredContent, tuneInitialZones, registerCayleyRouteCue, retainLiveCayleyDoorIds } from "./geometry";
import { createState } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'cayley_byuro_clerk', CLERK_DEF, [
  {
    id: 'cayley_byuro_bribe_generator_r',
    giverId: getPlotNpcNumericId('cayley_byuro_clerk')!,
    type: QuestType.FETCH,
    desc: 'Отдай Григорию Кэли сорок рублей за ключ генератора R. Двери R откроются, но запись о платном обходе останется в журнале.',
    targetItem: 'money',
    targetCount: 40,
    rewardItem: 'key',
    rewardCount: 1,
    extraRewards: [{ defId: 'official_permit_slip', count: 1 }],
    relationDelta: 8,
    xpReward: 45,
    moneyReward: 0,
    eventTargetName: 'Ключ генератора R куплен в бюро Кэли.',
    eventTags: [...CAYLEY_TAGS, 'bribe', 'generator_r'],
    eventData: { cayleyAction: 'bribe_generator_r', routeId: CAYLEY_BYURO_ROUTE_ID },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'cayley_byuro_coset_masha', COSET_DEF, [
  {
    id: 'cayley_byuro_apply_forms_rs',
    giverId: getPlotNpcNumericId('cayley_byuro_coset_masha')!,
    type: QuestType.VISIT,
    desc: 'Пройди порядок R потом S до окна SR2. S потом R ведет в другое окно, поэтому не меняй порядок у двери.',
    targetRoomDefId: CAYLEY_BYURO_ROOM_NAMES.srr,
    rewardItem: 'archive_access_permit',
    rewardCount: 1,
    relationDelta: 7,
    xpReward: 40,
    moneyReward: 15,
    eventTargetName: 'Порядок форм R затем S пройден в бюро Кэли.',
    eventTags: [...CAYLEY_TAGS, 'order_rs', 'visit'],
    eventData: { cayleyAction: 'apply_forms_rs', result: 'srr' },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'cayley_byuro_inspector', INSPECTOR_DEF, [
  {
    id: 'cayley_byuro_expose_forged_identity',
    giverId: getPlotNpcNumericId('cayley_byuro_inspector')!,
    type: QuestType.FETCH,
    desc: 'Принеси Инспектору Смежности поддельный пропуск из факторного хода. Он платит за улику, не за мораль.',
    targetItem: 'forged_permit_slip',
    targetCount: 1,
    rewardItem: 'record_exposure_notice',
    rewardCount: 1,
    extraRewards: [{ defId: 'denunciation', count: 1 }],
    relationDelta: 11,
    xpReward: 70,
    moneyReward: 65,
    eventTargetName: 'Поддельная личность сдана инспектору бюро Кэли.',
    eventTags: [...CAYLEY_TAGS, 'forgery', 'exposed', 'liquidator'],
    eventData: { cayleyAction: 'expose_forged_identity', quotientShortcutFlagged: true },
  },
]);

export function generateCayleyByuroDesignFloor(): CayleyByuroGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const spawnX = 512.5;
  const spawnY = 502.5;
  const state = createState(spawnX, spawnY);

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.MARBLE;
    world.floorTex[i] = Tex.F_PARQUET;
  }

  carveCayleyGraphField(world);
  const rooms = createRooms(world, state);
  placeLift(world, rooms.lobby.x + 8, rooms.lobby.y + 24, rooms.lobby.x + 11, rooms.lobby.y + 24, LiftDirection.UP);
  placeLift(world, rooms.lobby.x + rooms.lobby.w - 9, rooms.lobby.y + 24, rooms.lobby.x + rooms.lobby.w - 12, rooms.lobby.y + 24, LiftDirection.DOWN);
  const macroRooms = createCayleyMacroCampuses(world, rooms, state);
  createCayleyHqClusters(world, macroRooms, state);
  createCayleyLatticeBooths(world);
  connectCayleyGraph(world, rooms, state);
  connectCayleyMacroGraph(world, macroRooms, state);
  tuneInitialZones(world);
  populateAuthoredContent(world, entities, rooms, state);
  registerCayleyRouteCue(world, rooms);
  ensureConnectivity(world, spawnX, spawnY);
  sanitizeDoors(world);
  retainLiveCayleyDoorIds(world, state);
  world.rebuildContainerMap();
  world.bakeLights();

  return {
    isDecentralized: true,
    world,
    entities,
    spawnX,
    spawnY,
    cayleyState: state,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
