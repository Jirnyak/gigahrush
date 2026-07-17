/* -- Design z: shahta_atrium / Шахта-атриум ---------------- */

import {
  ContainerKind,
  LiftDirection,
  MonsterKind,
  Tex,
  ZoneFaction,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { placeEmergencyPanel } from '../../systems/emergency_panels';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
} from '../shared';
import { CX, CY, OUTER_R, ShahtaAtriumGeneration } from "./meta";
import { carveAbyss, placeLift, buildServiceRim, buildRingsAndSpokes, buildBridges, buildServiceRooms, dressRooms, buildMidMicroServiceFabric, buildShahtaFactionHqs, paintShahtaHqTerritory, dropItem, placeCoverIslandsOnRings, registerCues, tuneShahtaZones, buildState } from "./geometry";
import { addContainer, spawnMonster } from "./npcs";

export function generateShahtaAtriumDesignFloor(): ShahtaAtriumGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  world.wallTex.fill(Tex.METAL);
  world.floorTex.fill(Tex.F_CONCRETE);
  world.factionControl.fill(ZoneFaction.LIQUIDATOR);

  const rim = buildServiceRim(world);
  const voidCells = carveAbyss(world);
  const { ringCells } = buildRingsAndSpokes(world);
  const { bridges, coverIslands: bridgeCover } = buildBridges(world);
  const ringCover = placeCoverIslandsOnRings(world);
  const rooms = buildServiceRooms(world, rim.rooms);
  const midMicro = buildMidMicroServiceFabric(world);
  const hqCompounds = buildShahtaFactionHqs(world);
  dressRooms(world, rooms);

  placeLift(world, CX, 82, CX, 84, LiftDirection.UP);
  placeLift(world, CX, 941, CX, 940, LiftDirection.DOWN);
  placeLift(world, 82, CY, 84, CY, LiftDirection.UP);
  placeLift(world, 941, CY, 940, CY, LiftDirection.DOWN);

  sanitizeDoors(world);
  ensureConnectivity(world, CX + OUTER_R + 8.5, CY + 0.5);
  generateZones(world);
  tuneShahtaZones(world);
  paintShahtaHqTerritory(world, hqCompounds);

  placeEmergencyPanel(world, rooms.repair.x + 7, rooms.repair.y + 6, 'panel_doors', 7103);
  addContainer(world, rooms.repair, rooms.repair.x + 6, rooms.repair.y + 30, ContainerKind.TOOL_LOCKER, 'Шкаф ремонта перемычки', [
    { defId: 'metal_sheet', count: 2 },
    { defId: 'wire_coil', count: 1 },
    { defId: 'door_kit', count: 1 },
    { defId: 'fuse', count: 1 },
  ], ['repair', 'repairable_bridge', 'bridge_chord'], 'locked');
  addContainer(world, rooms.cache, rooms.cache.x + 7, rooms.cache.y + 28, ContainerKind.METAL_CABINET, 'Кладовая мостовых листов', [
    { defId: 'metal_sheet', count: 3 },
    { defId: 'gear', count: 1 },
    { defId: 'sealant_tube', count: 1 },
  ], ['service_rim', 'cover', 'repair'], 'room');
  addContainer(world, rooms.shelter, rooms.shelter.x + 35, rooms.shelter.y + 5, ContainerKind.EMERGENCY_BOX, 'Ящик сервисного обода', [
    { defId: 'bandage', count: 2 },
    { defId: 'water', count: 1 },
    { defId: 'bread', count: 1 },
  ], ['shelter', 'service_rim', 'public'], 'public');

  spawnMonster(entities, nextId, MonsterKind.REBAR, CX - 12, CY - 72, 4);
  spawnMonster(entities, nextId, MonsterKind.TRUBNYY_AVTOMAT, CX + 92, CY + 4, 4);
  spawnMonster(entities, nextId, MonsterKind.TUBE_EEL, CX - 82, CY + 12, 3);
  dropItem(entities, nextId, rooms.control.x + 18, rooms.control.y + 7, 'relay_diagram');
  dropItem(entities, nextId, rooms.cache.x + 9, rooms.cache.y + 9, 'wire_coil');

  const state = buildState(
    voidCells,
    ringCells,
    rim.cells,
    midMicro.serviceCells,
    midMicro.microRooms,
    hqCompounds.length,
    bridgeCover + ringCover,
    bridges,
  );
  registerCues(world, rooms, state);

  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(true);
  world.markFogDirty();
  world.bakeLights();

  return {
    world,
    entities,
    spawnX: CX + OUTER_R + 8.5,
    spawnY: CY + 0.5,
    shahtaAtriumState: state,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
