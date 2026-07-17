import { getPlotNpcNumericId } from '../../data/npc_packages';
/* -- Design z: markov_stairwell / Марковская лестница -------- */

import {
  QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { DESIGN_NPC_HOME_FLOOR_KEY, MARKOV_STAIRWELL_ROUTE_ID, BASE_FLOOR, SPINE_X, SPINE_Y, SPINE_W, SPINE_H, NPC_IDS, WATCHER_DEF } from "./meta";
import { markovMetrics, dropItem, tuneZones, buildGeometry, calculateMetrics } from "./geometry";
import { spawnPlotNpc, spawnThreats, placeContainers } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.watcher, WATCHER_DEF, [{
  id: 'markov_stairwell_pattern_stash',
  giverId: getPlotNpcNumericId(NPC_IDS.watcher)!,
  type: QuestType.FETCH,
  desc: 'Павел Марков: «Найди шкаф после связки кухня-мокрая-кладовая и принеси схему лифтов. Если последовательность сорвалась, режь через служебную дверь по бирке.»',
  targetItem: 'lift_scheme',
  targetCount: 1,
  targetFloorZ: BASE_FLOOR,
  targetRoute: { designFloorId: MARKOV_STAIRWELL_ROUTE_ID },
  targetRoomDefId: 'Марковская лестница: редкое состояние М',
  targetHint: 'Марковская лестница z=+20: считать повторы комнат, открыть служебный срез биркой и проверить редкое звено.',
  rewardItem: 'elevator_access_order',
  rewardCount: 1,
  extraRewards: [{ defId: 'chalk', count: 1 }],
  relationDelta: 10,
  xpReward: 50,
  moneyReward: 30,
  eventTags: ['markov_stairwell', 'pattern_stash', 'service_bypass'],
}]);

export function generateMarkovStairwellDesignFloor(): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  const { chain, watcherRoom, patternRoom, rareRoom, tellCells, serviceCells, lockedDoors } = buildGeometry(world);

  spawnPlotNpc(entities, nextId, NPC_IDS.watcher, WATCHER_DEF, watcherRoom.x + 18, watcherRoom.y + 13, 0);
  spawnThreats(world, entities, nextId, chain);
  placeContainers(world, patternRoom, rareRoom, watcherRoom);
  dropItem(entities, nextId, SPINE_X + (SPINE_W >> 1) - 6, SPINE_Y + SPINE_H - 44, 'chalk', 1);

  generateZones(world);
  tuneZones(world);
  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();

  const metrics = calculateMetrics(world, chain, tellCells, serviceCells, lockedDoors);
  markovMetrics.set(world, metrics);

  return {
    world,
    entities,
    spawnX: SPINE_X + SPINE_W / 2 + 0.5,
    spawnY: SPINE_Y + 28.5,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
