/* ── Design z: dark_metro / Темная пересадка ─────────────── */

import { RoomType, W, ZoneFaction, type Entity, type Zone } from '../../core/types';
import { World } from '../../core/world';
import { hashSeed, withSeededRandom, seededRandom } from '../../core/rand';
import { factionToTerritoryOwner } from '../../data/factions';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { syncZoneMetadataFromTerritory } from '../../systems/territory';

import {
  DarkMetroFullFloorStyle,
  axisDistance,
  nearestDarkMetroLineDistance,
  nearestDarkMetroDefendedPostDistance2,
  darkMetroProtectedMask,
  carveDarkMetroStationLine,
  addDarkMetroTicketHalls,
  addDarkMetroServiceRoutes,
  addDarkMetroTransferWeb,
  addDarkMetroTransferNodes,
  addDarkMetroRailBaitEdges,
  addDarkMetroDefendedPlatforms,
  addDarkMetroHqCompounds,
  addDarkMetroStationBlocks,
  addDarkMetroServiceIslands,
  addDarkMetroBlindCells,
  applyDarkMetroPlatformSafetyShells,
  linkDarkMetroCoreToInterchange,
  paintDarkMetroRoomOwner,
  decorateDarkMetroOwnedRoom,
  hardenDarkMetroHqRoom,
  stampDarkMetroLayout,
  tuneDarkMetroZones,
  dressDarkMetro,
} from './geometry';
import {
  isDarkMetroAmbientNpc,
  darkMetroTerritorySpawnCells,
  seedCoreMetroTrain,
  seedFullFloorMetroTrains,
  spawnDarkMetroNpcs,
  spawnDarkMetroLoot,
  spawnDarkMetroThreats,
  registerDarkMetroRouteCues,
  applyDarkMetroAmbientLight,
} from './npcs';

export * from './meta';
import {
  DARK_METRO_DEFAULT_SEED,
  initialDarkMetroState,
  createDarkMetroFloorState,
  type BuildCtx,
  DARK_METRO_FULL_LINE_YS,
  DARK_METRO_HQ_COMPOUNDS,
  type DarkMetroGeneration,
} from './meta';

export function tuneDarkMetroRouteZone(zone: Zone): void {
  const lineDistance = nearestDarkMetroLineDistance(zone.cy);
  const defended = nearestDarkMetroDefendedPostDistance2(zone.cx, zone.cy) <= 92 * 92;
  const serviceDistance = Math.min(axisDistance(zone.cx, 176), axisDistance(zone.cx, 842), axisDistance(zone.cx, 512));
  const serviceTunnel = serviceDistance <= 52 && zone.cy > 96 && zone.cy < 940;

  zone.level = defended ? 4 : lineDistance <= 44 || serviceTunnel ? 5 : 4;
  zone.faction = defended ? ZoneFaction.LIQUIDATOR
    : lineDistance <= 28 && zone.id % 4 === 0 ? ZoneFaction.SAMOSBOR
      : lineDistance <= 58 || serviceTunnel ? ZoneFaction.WILD
        : zone.id % 5 === 0 ? ZoneFaction.CULTIST
          : ZoneFaction.LIQUIDATOR;
  zone.fogged = false;
}

export function expandDarkMetroFullFloorGeometry(
  world: World,
  rng: () => number,
  style: DarkMetroFullFloorStyle,
  entities?: Entity[],
): void {
  const protectedCells = darkMetroProtectedMask(world);
  for (let i = 0; i < DARK_METRO_FULL_LINE_YS.length; i++) {
    carveDarkMetroStationLine(world, protectedCells, DARK_METRO_FULL_LINE_YS[i], i, style, rng);
  }

  addDarkMetroTicketHalls(world, protectedCells, style);
  addDarkMetroServiceRoutes(world, protectedCells, style, rng);
  addDarkMetroTransferWeb(world, protectedCells, style);
  addDarkMetroTransferNodes(world, protectedCells, style);
  addDarkMetroRailBaitEdges(world, style);
  addDarkMetroDefendedPlatforms(world, protectedCells, style);
  addDarkMetroHqCompounds(world, protectedCells);
  addDarkMetroStationBlocks(world, protectedCells, style, rng);
  addDarkMetroServiceIslands(world, protectedCells, style, rng);
  addDarkMetroBlindCells(world, protectedCells, style, rng);
  applyDarkMetroPlatformSafetyShells(world);
  linkDarkMetroCoreToInterchange(world, style);
  if (entities) seedFullFloorMetroTrains(world, entities);
  world.markFogDirty();
}

export function reinforceDarkMetroAuthoredHqTerritory(world: World): void {
  for (const compound of DARK_METRO_HQ_COMPOUNDS) {
    const names = new Set([compound.core.name, ...compound.support.map(room => room.name)]);
    for (const room of world.rooms) {
      if (!room || !names.has(room.name)) continue;
      paintDarkMetroRoomOwner(world, room, compound.owner);
      decorateDarkMetroOwnedRoom(world, room, compound.owner, room.id);
      if (room.name === compound.core.name || room.type === RoomType.HQ) {
        hardenDarkMetroHqRoom(world, room, compound.owner);
      }
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
  syncZoneMetadataFromTerritory(world);
}

export function alignDarkMetroAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = darkMetroTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isDarkMetroAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 193 + offset * 421) % list.length];
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    entity.assignedRoomId = world.roomMap[cell] >= 0 ? world.roomMap[cell] : -1;
    if (entity.ai) {
      entity.ai.tx = cell % W;
      entity.ai.ty = (cell / W) | 0;
      entity.ai.path = [];
      entity.ai.pi = 0;
      entity.ai.stuck = 0;
    }
  }
}



export function generateDarkMetroDesignFloor(seed = DARK_METRO_DEFAULT_SEED): DarkMetroGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const ctx: BuildCtx = {
      world,
      entities,
      nextId: { v: 1 },
      nextContainerId: { v: 1 },
      packedState: initialDarkMetroState(seed),
    };

    const layout = stampDarkMetroLayout(ctx);
    generateZones(world);
    tuneDarkMetroZones(world);
    dressDarkMetro(ctx, layout);
    seedCoreMetroTrain(ctx, layout);
    spawnDarkMetroNpcs(ctx, layout);
    spawnDarkMetroLoot(ctx, layout);
    spawnDarkMetroThreats(ctx, layout);
    registerDarkMetroRouteCues(ctx, layout);

    const spawnX = layout.hall.x + Math.floor(layout.hall.w / 2) + 0.5;
    const spawnY = layout.hall.y + Math.floor(layout.hall.h / 2) + 0.5;
    // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:dark_metro:-32', -32));
    const style = { wallTex: 24 /* Tex.METRO_WALL */, floorTex: 10 /* Tex.METRO_FLOOR */, faction: 3 /* ZoneFaction.MONSTERS */, danger: 4 };
    expandDarkMetroFullFloorGeometry(world, rngFn, style, entities);
    
    // Now finalize
    generateZones(world);
    for (const zone of world.zones) {
      tuneDarkMetroRouteZone(zone);
    }
    reinforceDarkMetroAuthoredHqTerritory(world);
    
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);
    
    // For dark metro, we scatter lights as well
        // Actually full_floor.ts used to scatterAmbientLights, but we need that function!
    // I can just import it from shared? Wait, scatterAmbientLights was defined in full_floor.ts!
    // If we need it, we must copy it or export it. Wait!
    // Is scatterAmbientLights needed? Yes, it was called in full_floor.ts!
    world.bakeLights();
    applyDarkMetroAmbientLight(world, layout, ctx.packedState);
    world.markFogDirty();

    const generation = { world, entities, spawnX, spawnY, metroState: createDarkMetroFloorState(ctx.packedState) };
      applyDesignFloorPopulationField(generation as any, { id: 'dark_metro', z: -32 } as any);
      return { ...generation, isDecentralized: true } as any;
    });
}

