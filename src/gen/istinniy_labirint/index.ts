import { getPlotNpcNumericId } from '../../data/npc_packages';
/* -- Design z: istinniy_labirint / Истинный лабиринт -------- */

import {
  LiftDirection,
  QuestType,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { ensureConnectivity, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { DESIGN_NPC_HOME_FLOOR_KEY, ISTINNIY_LABIRINT_ROUTE_ID, BASE_FLOOR, MAZE_WALL, MAZE_FLOOR, SAFE_WALL_ROOM, NPC_IDS, ARIADNA_DEF, LOST_PAVEL_DEF } from "./meta";
import { centerOf, buildGrowingTreeMaze, carveMaze, carveSafeWallRoute, markMainThread, placeLabyrinthMidMicro, selectLockedChords, carveLockedChord, placeLift, placeActors, placeLandmarks, tuneLabyrinthZones } from "./geometry";
import { paintLabyrinthTerritorySeeds, placeRewardStashes } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.ariadna, ARIADNA_DEF, [{
  id: 'labyrinth_rechalk_safe_wall',
  giverId: getPlotNpcNumericId(NPC_IDS.ariadna)!,
  type: QuestType.FETCH,
  desc: 'Зина Ариадна: «Принеси мелок на белую стену. Обновим нить, пока лабиринт не выучил старые стрелки.»',
  targetItem: 'chalk',
  targetCount: 1,
  targetFloorZ: BASE_FLOOR,
  targetRoute: { designFloorId: ISTINNIY_LABIRINT_ROUTE_ID },
  targetRoomDefId: SAFE_WALL_ROOM,
  targetHint: 'Истинный лабиринт z=+28: держаться белой стены и искать свежие желтые метки.',
  rewardItem: 'key',
  rewardCount: 1,
  extraRewards: [{ defId: 'gasmask_filter', count: 1 }],
  relationDelta: 8,
  xpReward: 45,
  moneyReward: 28,
  eventTags: ['istinniy_labirint', 'chalk_route_mark', 'safe_wall'],
}]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_IDS.lostPavel, LOST_PAVEL_DEF, [{
  id: 'labyrinth_rescue_lost_pavel',
  giverId: getPlotNpcNumericId(NPC_IDS.lostPavel)!,
  type: QuestType.TALK,
  desc: 'Паша Без Нити: «Доведи меня до Зины Ариадны. Только не красной хордой: там коротко, потому что там ждут.»',
  targetNpcId: getPlotNpcNumericId(NPC_IDS.ariadna)!,
  targetFloorZ: BASE_FLOOR,
  targetRoute: { designFloorId: ISTINNIY_LABIRINT_ROUTE_ID },
  targetRoomDefId: SAFE_WALL_ROOM,
  targetHint: 'Истинный лабиринт: вернуться к белой стене и поговорить с Зиной Ариадной.',
  rewardItem: 'lift_scheme',
  rewardCount: 1,
  extraRewards: [{ defId: 'water', count: 1 }],
  relationDelta: 12,
  xpReward: 55,
  moneyReward: 36,
  eventTags: ['istinniy_labirint', 'rescue', 'lost_npc'],
  failOnNpcDeathId: getPlotNpcNumericId(NPC_IDS.lostPavel)!,
}]);

export function generateIstinniyLabirintDesignFloor(): FloorGeneration {
  const world = new World();
  world.wallTex.fill(MAZE_WALL);
  world.floorTex.fill(MAZE_FLOOR);

  const graph = buildGrowingTreeMaze();
  carveMaze(world, graph);
  carveSafeWallRoute(world, graph);
  markMainThread(world, graph);

  const roomsByName = placeLandmarks(world, graph);
  const chordSpecs = selectLockedChords(graph, 8);
  const chords = chordSpecs.map((chord, index) => carveLockedChord(world, chord, index));
  const ownedRooms = placeLabyrinthMidMicro(world, graph, roomsByName);

  const nextContainerId = { v: 1 };
  placeRewardStashes(world, graph, nextContainerId, roomsByName);

  const start = centerOf(graph.start);
  const exit = centerOf(graph.exit);
  placeLift(world, start.x - 3, start.y, LiftDirection.UP);
  placeLift(world, exit.x + 3, exit.y, LiftDirection.DOWN);

  tuneLabyrinthZones(world);
  paintLabyrinthTerritorySeeds(world, ownedRooms);
  ensureConnectivity(world, start.x + 0.5, start.y + 0.5);
  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();

  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  placeActors(world, graph, roomsByName, entities, nextId, chords);

  return {
    isDecentralized: true,
    world,
    entities,
    spawnX: start.x + 0.5,
    spawnY: start.y + 0.5,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
