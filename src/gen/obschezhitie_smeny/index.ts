import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom } from '../../core/rand';
import { registerFloorSideQuest } from '../../data/plot';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { DESIGN_NPC_HOME_FLOOR_KEY, DORM_SEED, NPC_IDS, NPC_DEFS } from "./meta";
import { carveDormSlabs, carveDormRings, buildDormRooms, buildDormRoomStacks, buildDormHqComplexes, applyDormZones, reinforceDormAuthoredTerritory, placeDormLifts, decorateDorm } from "./geometry";
import { spawnAuthoredDormNpcs, spawnSleeperTemplates, spawnNightPatrolTemplates, placeDormContainers } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.rita, NPC_DEFS.obschezhitie_rita_starshaya, [{
  id: 'obschezhitie_shelter_rollcall',
  giverId: getPlotNpcNumericId(NPC_IDS.rita)!,
  type: QuestType.FETCH,
  desc: 'Рита Старшая Смены: «Принеси ведомость укрытых. Во сне смена не досчитается сама, а сирена любит пустые строки.»',
  targetItem: 'shelter_tally',
  targetCount: 1,
  rewardItem: 'water_coupon',
  rewardCount: 3,
  extraRewards: [{ defId: 'bread', count: 2 }, { defId: 'bandage', count: 1 }],
  relationDelta: 12,
  xpReward: 45,
  moneyReward: 20,
  eventTags: ['obschezhitie_smeny', 'shelter', 'samosbor', 'resident_relief'],
  eventData: { routeChoice: 'protect_sleeping_shift', rumorIds: ['samosbor_istotit_shelter_tally'] },
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.gleb, NPC_DEFS.obschezhitie_gleb_obhod, [{
  id: 'obschezhitie_patrol_silence',
  giverId: getPlotNpcNumericId(NPC_IDS.gleb)!,
  type: QuestType.FETCH,
  desc: 'Глеб Ночной Обход: «Пачку сигарет на пост. Обход пройдёт тише, и никто не будет сверять каждый чужой шкаф до отбоя.»',
  targetItem: 'cigs',
  targetCount: 2,
  rewardItem: 'samosbor_tally',
  rewardCount: 1,
  extraRewards: [{ defId: 'flashlight', count: 1 }],
  relationDelta: 8,
  xpReward: 35,
  moneyReward: 18,
  eventTags: ['obschezhitie_smeny', 'patrol', 'witness', 'quiet_passage'],
  eventData: { routeChoice: 'buy_patrol_silence', rumorIds: ['smoking_second_round_truth'] },
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.senya, NPC_DEFS.obschezhitie_senya_tikhiy, [{
  id: 'obschezhitie_quiet_lockers',
  giverId: getPlotNpcNumericId(NPC_IDS.senya)!,
  type: QuestType.FETCH,
  desc: 'Сеня Тихий: «Один блистер снотворного - и скажу, какой шкаф не скрипит. Робко берёшь или честно уходишь - это уже твой шум.»',
  targetItem: 'sleeping_pills',
  targetCount: 1,
  rewardItem: 'container_key_label',
  rewardCount: 1,
  extraRewards: [{ defId: 'cigs', count: 2 }],
  relationDelta: 6,
  xpReward: 40,
  moneyReward: 10,
  eventTags: ['obschezhitie_smeny', 'theft', 'quiet_loot', 'witness'],
  eventData: { routeChoice: 'enable_quiet_locker_theft', rumorIds: ['hunter_wet_container_dry'] },
}]);

export function generateObschezhitieSmenyDesignFloor(seed = DORM_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const containerId = { v: 1 };

    const layout = carveDormSlabs(world);
    carveDormRings(world, layout);
    const rooms = buildDormRooms(world, layout);
    buildDormRoomStacks(world, rooms);
    buildDormHqComplexes(world, rooms);
    generateZones(world);
    applyDormZones(world);
    reinforceDormAuthoredTerritory(world, rooms);
    placeDormLifts(world, layout);
    decorateDorm(world, layout, rooms);
    const owners = spawnAuthoredDormNpcs(entities, nextId, rooms);
    spawnSleeperTemplates(entities, nextId, rooms.bunks);
    spawnNightPatrolTemplates(entities, nextId, layout);
    placeDormContainers(world, containerId, rooms, owners);

    sanitizeDoors(world);
    ensureConnectivity(world, layout.spawnX, layout.spawnY);
    world.rebuildContainerMap();
    world.bakeLights();

    return { world, entities, spawnX: layout.spawnX, spawnY: layout.spawnY };
  });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
