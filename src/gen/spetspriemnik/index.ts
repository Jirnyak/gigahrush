/* -- Design z: spetspriemnik - detention, keys and bounded riot pressure -- */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { xorshift32 } from '../../core/rand';
import { DESIGN_NPC_HOME_FLOOR_KEY, SPETSPRIEMNIK_ROUTE_ID, SPETSPRIEMNIK_Z, SPETSPRIEMNIK_BASE_FLOOR, SPETSPRIEMNIK_CELL_KEY, SPETSPRIEMNIK_PERMIT_KEY, SPETSPRIEMNIK_GUARD_KEY, SPETSPRIEMNIK_ROOM_NAMES, CX, BASE_TAGS, NPC_DEFS } from "./meta";
import { metricsByWorld, expandSpetspriemnikRouteGeometry, reinforceSpetspriemnikRouteGates, tuneSpetspriemnikRouteZones, calculateMetrics } from "./geometry";
import { placeContainers, buildCore, spawnAuthoredActors } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'spetspriemnik_nachalnik_krivda', NPC_DEFS.spetspriemnik_nachalnik_krivda, [
  {
    id: 'spetspriemnik_shelter_cell_check',
    giverId: getPlotNpcNumericId('spetspriemnik_nachalnik_krivda')!,
    type: QuestType.VISIT,
    desc: 'Проверь гермокамеру спецприёмника. Кривда даст корешок, если дверь держит сирену, а люди внутри не шумят.',
    targetFloorZ: SPETSPRIEMNIK_BASE_FLOOR,
    targetRoute: { designFloorId: SPETSPRIEMNIK_ROUTE_ID, z: SPETSPRIEMNIK_Z },
    targetRoomDefId: 'Камера спецприёмника 05: гермоукрытие',
    holdSeconds: 25,
    holdResetOnExit: true,
    rewardItem: SPETSPRIEMNIK_PERMIT_KEY,
    rewardCount: 1,
    relationDelta: 5,
    xpReward: 55,
    moneyReward: 25,
    eventTags: [...BASE_TAGS, 'shelter_cell', 'samosbor_shelter'],
    eventTargetName: 'Гермокамера спецприёмника проверена как укрытие.',
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'spetspriemnik_guard_savva', NPC_DEFS.spetspriemnik_guard_savva, [
  {
    id: 'spetspriemnik_bribe_guard',
    giverId: getPlotNpcNumericId('spetspriemnik_guard_savva')!,
    type: QuestType.FETCH,
    desc: 'Отдай Савве пачку сигарет у решётки. Он не продаст ключ, но бирка может упасть не туда.',
    targetItem: 'cigs',
    targetCount: 1,
    targetFloorZ: SPETSPRIEMNIK_BASE_FLOOR,
    targetRoute: { designFloorId: SPETSPRIEMNIK_ROUTE_ID, z: SPETSPRIEMNIK_Z },
    rewardItem: SPETSPRIEMNIK_CELL_KEY,
    rewardCount: 1,
    extraRewards: [{ defId: SPETSPRIEMNIK_GUARD_KEY, count: 1 }],
    relationDelta: 3,
    xpReward: 35,
    moneyReward: 0,
    eventTags: [...BASE_TAGS, 'bribe_guard', 'key_gate'],
    eventTargetName: 'Савва принял сигареты, а бирка ключа оказалась у игрока.',
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'spetspriemnik_prisoner_mira', NPC_DEFS.spetspriemnik_prisoner_mira, [
  {
    id: 'spetspriemnik_release_cell_row',
    giverId: getPlotNpcNumericId('spetspriemnik_prisoner_mira')!,
    type: QuestType.FETCH,
    desc: 'Принеси Мире бирку от ключа. Она выведет ряд камер тихо, пока караул спорит с журналом обхода.',
    targetItem: SPETSPRIEMNIK_CELL_KEY,
    targetCount: 1,
    targetFloorZ: SPETSPRIEMNIK_BASE_FLOOR,
    targetRoute: { designFloorId: SPETSPRIEMNIK_ROUTE_ID, z: SPETSPRIEMNIK_Z },
    targetRoomDefId: 'Клетка свиданий и обмена фамилий',
    rewardItem: 'personal_file_copy',
    rewardCount: 1,
    extraRewards: [{ defId: 'bread', count: 2 }],
    relationDelta: 12,
    xpReward: 90,
    moneyReward: 18,
    eventTags: [...BASE_TAGS, 'release_prisoners', 'stable_prisoner_identity'],
    eventData: { releasedPlotNpcIds: ['spetspriemnik_prisoner_mira'] },
    eventTargetName: 'Ряд камер спецприёмника вышел по бирке ключа.',
    abandonsSideQuestIds: ['spetspriemnik_trade_names'],
  },
  {
    id: 'spetspriemnik_trigger_riot',
    giverId: getPlotNpcNumericId('spetspriemnik_prisoner_mira')!,
    type: QuestType.VISIT,
    desc: 'Удержи двор переклички, пока Мира срывает список. Шум поднимет охрану, но волна ограничена двором.',
    targetFloorZ: SPETSPRIEMNIK_BASE_FLOOR,
    targetRoute: { designFloorId: SPETSPRIEMNIK_ROUTE_ID, z: SPETSPRIEMNIK_Z },
    targetRoomDefId: SPETSPRIEMNIK_ROOM_NAMES.riotYard,
    holdSeconds: 35,
    holdResetOnExit: true,
    holdSpawnMonsters: 3,
    holdSpawnIntervalSeconds: 12,
    holdSpawnMaxAlive: 9,
    rewardItem: 'forged_permit_slip',
    rewardCount: 1,
    relationDelta: 8,
    xpReward: 95,
    moneyReward: 0,
    eventTags: [...BASE_TAGS, 'riot', 'bounded_event', 'not_refill'],
    eventData: { riotBoundedMaxAlive: 9, spawnIntervalSeconds: 12 },
    eventTargetName: 'Бунт спецприёмника поднят и удержан во дворе переклички.',
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'spetspriemnik_informant_tolya', NPC_DEFS.spetspriemnik_informant_tolya, [
  {
    id: 'spetspriemnik_trade_names',
    giverId: getPlotNpcNumericId('spetspriemnik_informant_tolya')!,
    type: QuestType.FETCH,
    desc: 'Принеси Толе копию личного дела из сейфа начальника. Он обменяет фамилии на пропуск и чужой донос.',
    targetItem: 'personal_file_copy',
    targetCount: 1,
    targetFloorZ: SPETSPRIEMNIK_BASE_FLOOR,
    targetRoute: { designFloorId: SPETSPRIEMNIK_ROUTE_ID, z: SPETSPRIEMNIK_Z },
    targetRoomDefId: SPETSPRIEMNIK_ROOM_NAMES.command,
    rewardItem: SPETSPRIEMNIK_PERMIT_KEY,
    rewardCount: 1,
    extraRewards: [{ defId: 'denunciation', count: 1 }],
    relationDelta: -3,
    xpReward: 75,
    moneyReward: 30,
    eventTags: [...BASE_TAGS, 'trade_names', 'hostage_economy'],
    eventTargetName: 'Фамилии задержанных обменяны на пропуск и донос.',
    blockedBySideQuestIds: ['spetspriemnik_release_cell_row'],
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'spetspriemnik_clerk_alla', NPC_DEFS.spetspriemnik_clerk_alla, [
  {
    id: 'spetspriemnik_stamp_release_form',
    giverId: getPlotNpcNumericId('spetspriemnik_clerk_alla')!,
    type: QuestType.FETCH,
    desc: 'Принеси Алле украденную печать терминала. Она поставит выпускной штамп, если окно приёма ещё целое.',
    targetItem: 'stolen_terminal_stamp',
    targetCount: 1,
    targetFloorZ: SPETSPRIEMNIK_BASE_FLOOR,
    targetRoute: { designFloorId: SPETSPRIEMNIK_ROUTE_ID, z: SPETSPRIEMNIK_Z },
    rewardItem: 'forged_permit_slip',
    rewardCount: 1,
    extraRewards: [{ defId: 'blank_form', count: 1 }],
    relationDelta: 5,
    xpReward: 60,
    moneyReward: 12,
    eventTags: [...BASE_TAGS, 'release_stamp', 'forgery'],
    eventTargetName: 'Выпускной штамп спецприёмника поставлен через окно приёма.',
  },
]);

export function generateSpetspriemnikDesignFloor(seed: number): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  const built = buildCore(world);
  const rand = xorshift32(seed);

  placeContainers(world, built);
  spawnAuthoredActors(world, entities, nextId, built);

  generateZones(world);

  expandSpetspriemnikRouteGeometry(world, rand);
  tuneSpetspriemnikRouteZones(world);
  reinforceSpetspriemnikRouteGates(world);

  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();

  metricsByWorld.set(world, calculateMetrics(world, built));

  return {
    isDecentralized: true,
    world,
    entities,
    spawnX: CX + 0.5,
    spawnY: 270.5,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
