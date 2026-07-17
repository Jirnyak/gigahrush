import { getPlotNpcNumericId } from '../../data/npc_packages';
/* -- Design z: spectral_chasovnya - sound, cult and hearing geometry -- */

import {
  QuestType,
  Tex,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { registerFloorSideQuest } from '../../data/plot';
import { registerContentInteractionHook } from '../../systems/content_hooks';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import { DESIGN_NPC_HOME_FLOOR_KEY, SPECTRAL_CHASOVNYA_ROUTE_ID, SPECTRAL_CHASOVNYA_BASE_FLOOR, SPECTRAL_CHASOVNYA_ROOM_DEF_IDS, NextId, SpectralChasovnyaGeneration, NPC_ID, MIRON_DEF } from "./meta";
import { spectralStateByWorld, expandSpectralRouteGeometry, buildRooms, dressRooms, tuneZones, buildSpectralState, reinforceSpectralChasovnyaAuthoredHqTerritory, registerSpectralRouteCues, findBellNodeForLook, ringSpectralChasovnyaBell } from "./geometry";
import { placeContent, alignSpectralChasovnyaAmbientNpcTerritory } from "./npcs";

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, NPC_ID, MIRON_DEF, [{
  id: 'spectral_tune_radio_sacristy',
  giverId: getPlotNpcNumericId(NPC_ID)!,
  type: QuestType.FETCH,
  desc: 'Мирон Звонарь: «Принеси звукоизлучатель в радиоризницу. Настроим тишину так, чтобы слепые ушли к колоколу, а не к тебе.»',
  targetItem: 'sound_emitter',
  targetCount: 1,
  targetFloorZ: SPECTRAL_CHASOVNYA_BASE_FLOOR,
  targetRoute: { designFloorId: SPECTRAL_CHASOVNYA_ROUTE_ID },
  targetRoomDefId: SPECTRAL_CHASOVNYA_ROOM_DEF_IDS.radioSacristy,
  targetHint: 'Спектральная часовня z=-42: радиоризница стоит за боковой акустической тенью.',
  rewardItem: 'bottled_voice',
  rewardCount: 1,
  extraRewards: [{ defId: 'istotit_candle', count: 1 }],
  relationDelta: 8,
  xpReward: 70,
  moneyReward: 24,
  eventTags: ['spectral_chasovnya', 'sound_emitter', 'bell_route', 'quiet_path'],
}]);
registerContentInteractionHook({
  id: 'spectral_chasovnya_bell',
  target(ctx) {
    const node = findBellNodeForLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!node) return null;
    return {
      id: 744000 + node.roomId,
      targetId: 'spectral_chasovnya_bell',
      x: node.x,
      y: node.y,
      priority: 74,
      prompt: ' колокол',
    };
  },
  use(ctx) {
    const node = findBellNodeForLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!node) return null;
    return { handled: ringSpectralChasovnyaBell(ctx.world, ctx.state, ctx.player, ctx.entities, node.id), worldChanged: false };
  },
});

export function generateSpectralChasovnyaDesignFloor(): SpectralChasovnyaGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId: NextId = { v: 10000 };

  world.wallTex.fill(Tex.GUT);
  world.floorTex.fill(Tex.F_GUT);
  world.fog.fill(22);

  const rooms = buildRooms(world);
  expandSpectralRouteGeometry(world, rooms);
  const spawnX = rooms.entry.x + 8.5;
  const spawnY = rooms.entry.y + (rooms.entry.h >> 1) + 0.5;
  dressRooms(world, rooms);
  generateZones(world);
  tuneZones(world);
  placeContent(world, entities, nextId, rooms);
  const spectralState = buildSpectralState(world, rooms);
  registerSpectralRouteCues(world, rooms, spectralState);
  ensureConnectivity(world, spawnX, spawnY);
  sanitizeDoors(world);

  reinforceSpectralChasovnyaAuthoredHqTerritory(world);
  alignSpectralChasovnyaAmbientNpcTerritory(world, entities);

  world.bakeLights();
  spectralStateByWorld.set(world, spectralState);
  return { isDecentralized: true, world, entities, spawnX, spawnY, spectralState };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
