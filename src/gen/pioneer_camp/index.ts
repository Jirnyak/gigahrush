import { getPlotNpcNumericId } from '../../data/npc_packages';
/* -- Design z: Пионерлагерь ---------------------------------
 * A Soviet summer-camp pocket inside the concrete route. The floor
 * uses generic camp grammar, not copied Everlasting Summer names.
 */

import {
  QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { hashSeed, withSeededRandom, seededRandom } from '../../core/rand';
import { registerFloorSideQuest } from '../../data/plot';
import { scatterAmbientLights, ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import {  applyDesignFloorPopulationField } from '../design_floors/population';
import type { DesignFloorGeneration } from '../floor_manifest';
import { DESIGN_NPC_HOME_FLOOR_KEY, CAMP_SEED, NPC_IDS, NPC_DEFS } from "./meta";
import { expandPioneerCampFullFloor, tunePioneerCampPopulationZones, initCampWorld, buildCampCore, buildCampPaths, decorateCampCore, placeCampLifts, tuneCampZones, placeCampDrops } from "./geometry";
import { spawnCampNpcs, placeCampContainers, spawnCampThreats } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.shift, NPC_DEFS.camp_shift_tamara, [{
  id: 'camp_verify_roster',
  giverId: getPlotNpcNumericId(NPC_IDS.shift)!,
  type: QuestType.FETCH,
  desc: 'Тамара Сменная: «Найди список укрытия у старого корпуса. Решим, кого прятать, а кого уже только числить.»',
  targetItem: 'emergency_roster',
  targetCount: 1,
  rewardItem: 'blank_form',
  rewardCount: 2,
  extraRewards: [{ defId: 'child_map', count: 1 }],
  relationDelta: 12,
  xpReward: 55,
  moneyReward: 35,
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.radio, NPC_DEFS.camp_radio_egor, [{
  id: 'camp_repair_loudspeaker',
  giverId: getPlotNpcNumericId(NPC_IDS.radio)!,
  type: QuestType.FETCH,
  desc: 'Егор Радиокружок: «Два мотка проволоки - и громкоговоритель будет предупреждать лагерь, а не только повторять лес.»',
  targetItem: 'wire_coil',
  targetCount: 2,
  rewardItem: 'radio',
  rewardCount: 1,
  extraRewards: [{ defId: 'ammo_energy', count: 1 }],
  relationDelta: 10,
  xpReward: 60,
  moneyReward: 30,
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.medic, NPC_DEFS.camp_medic_ira, [{
  id: 'camp_medpost_choice',
  giverId: getPlotNpcNumericId(NPC_IDS.medic)!,
  type: QuestType.FETCH,
  desc: 'Ира Медпункт: «Санитарный набор в медпункт. Потом выберем: перевязать беглеца из леса или оставить запас на сирену.»',
  targetItem: 'sanitary_kit',
  targetCount: 1,
  rewardItem: 'bandage',
  rewardCount: 3,
  extraRewards: [{ defId: 'pills', count: 1 }],
  relationDelta: 12,
  xpReward: 50,
  moneyReward: 28,
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.cook, NPC_DEFS.camp_canteen_zoya, [{
  id: 'camp_canteen_compote',
  giverId: getPlotNpcNumericId(NPC_IDS.cook)!,
  type: QuestType.FETCH,
  desc: 'Зоя Столовая: «Принеси прессованный сахар. Сварю компот: можно накормить отряд, можно купить тишину у очереди.»',
  targetItem: 'pressed_sugar',
  targetCount: 2,
  rewardItem: 'kompot',
  rewardCount: 3,
  extraRewards: [{ defId: 'kasha', count: 2 }],
  relationDelta: 8,
  xpReward: 40,
  moneyReward: 24,
}]);

export function generatePioneerCampDesignFloor(seed = CAMP_SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };

    initCampWorld(world);
    const rooms = buildCampCore(world);
    buildCampPaths(world, rooms);
    decorateCampCore(world, rooms);
    placeCampLifts(world, rooms);

    generateZones(world);
    tuneCampZones(world);

    const owners = spawnCampNpcs(entities, nextId, rooms);
    placeCampContainers(world, rooms, owners);
    placeCampDrops(world, entities, nextId, rooms);
    spawnCampThreats(world, entities, nextId, rooms);

    // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:pioneer_camp:38', 38));
    expandPioneerCampFullFloor(world, rngFn);
    
    // Now finalize
    generateZones(world);
    tunePioneerCampPopulationZones(world);
    
    sanitizeDoors(world);
    ensureConnectivity(world, rooms.gate.x + 8.5, rooms.gate.y + 8.5);
    world.rebuildContainerMap();
    scatterAmbientLights(world, rngFn, 260);
    world.bakeLights();

    const generation: DesignFloorGeneration = { isDecentralized: true, world, entities, spawnX: rooms.gate.x + 8.5, spawnY: rooms.gate.y + 8.5 };
      applyDesignFloorPopulationField(generation, { id: 'pioneer_camp', z: 38 });
      return generation;
    });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
