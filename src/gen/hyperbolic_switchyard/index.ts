import { getPlotNpcNumericId } from '../../data/npc_packages';
/* ── Design z: hyperbolic_switchyard / Гиперболическая стрелочная ─ */

import {
  QuestType,
  W,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom } from '../../core/rand';
import { registerFloorSideQuest } from '../../data/plot';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import { DESIGN_NPC_HOME_FLOOR_KEY, HYPERBOLIC_SWITCHYARD_DESIGN_FLOOR_ID, HYPERBOLIC_SWITCHYARD_ROUTE_Z, SEED, GUIDE_NPC_ID, HyperbolicSwitchyardGeneration, GUIDE_DEF } from "./meta";
import { carveArcFamilies, carveGeodesicShortcut, buildSwitchyardRooms, connectSwitchyardRooms, buildSwitchyardMidMicro, placeSwitchyardGates, placeSwitchyardLifts, decorateSwitchyard, placeSwitchyardPanels, registerSwitchyardCues, tuneSwitchyardZones, summarizeArcs, summarizePlatforms } from "./geometry";
import { spawnGuide, spawnShortcutMonsters, placeSwitchyardContainers } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, GUIDE_NPC_ID, GUIDE_DEF, [{
  id: 'hyperbolic_switchyard_pay_guide',
  giverId: getPlotNpcNumericId(GUIDE_NPC_ID)!,
  type: QuestType.FETCH,
  desc: 'Зинаида Кривых Стрелок: «Билет метро и я отмечу мелом, какая дуга сегодня не кусается. Без билета тут все платформы одинаково честные.»',
  targetItem: 'metro_ticket',
  targetCount: 1,
  rewardItem: 'relay_diagram',
  rewardCount: 1,
  extraRewards: [{ defId: 'fuse', count: 1 }, { defId: 'chalk', count: 2 }],
  relationDelta: 12,
  xpReward: 45,
  moneyReward: 25,
  eventTags: ['hyperbolic_switchyard', 'pay_guide', 'route_hint'],
  eventTargetName: 'Проводник стрелочной отметил безопасную дугу.',
}]);

export function generateHyperbolicSwitchyardDesignFloor(seed = SEED): HyperbolicSwitchyardGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const containerId = { v: 1 };
    const center = { x: W >> 1, y: W >> 1 };

    const arcCells = carveArcFamilies(world);
    carveGeodesicShortcut(world, arcCells.shortcutCells);
    const rooms = buildSwitchyardRooms(world);
    connectSwitchyardRooms(world, rooms);
    buildSwitchyardMidMicro(world, rooms);
    const gateCells = placeSwitchyardGates(world);
    generateZones(world);
    tuneSwitchyardZones(world);
    placeSwitchyardLifts(world);
    decorateSwitchyard(world, rooms, arcCells.allCells);

    const panelCells = placeSwitchyardPanels(world, rooms);
    spawnGuide(entities, nextId, rooms.guide);
    spawnShortcutMonsters(world, entities, nextId, arcCells.shortcutCells);
    placeSwitchyardContainers(world, containerId, rooms);
    registerSwitchyardCues(world, rooms);

    sanitizeDoors(world);
    ensureConnectivity(world, rooms.guide.x + 4.5, rooms.guide.y + rooms.guide.h - 1.5);
    world.bakeLights();

    return {
      world,
      entities,
      spawnX: rooms.guide.x + 4.5,
      spawnY: rooms.guide.y + rooms.guide.h - 1.5,
      switchyardState: {
        routeId: HYPERBOLIC_SWITCHYARD_DESIGN_FLOOR_ID,
        z: HYPERBOLIC_SWITCHYARD_ROUTE_Z,
        arcs: summarizeArcs(arcCells.arcMap, rooms),
        platforms: summarizePlatforms(rooms),
        decisionIds: ['pay_guide', 'switch_family', 'geodesic_shortcut', 'sabotage_false_platform'],
        panelCells,
        guideNpcId: GUIDE_NPC_ID,
        shortcutMonsterCells: arcCells.shortcutCells.slice(0, 32),
        debugEntry: {
          spawnX: rooms.guide.x + 4.5,
          spawnY: rooms.guide.y + rooms.guide.h - 1.5,
          summary: `center ${center.x}:${center.y}, gates ${gateCells.length}, panels ${panelCells.length}`,
        },
      },
    };
  });
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
