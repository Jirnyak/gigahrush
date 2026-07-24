import {  applyDesignFloorPopulationField } from '../design_floors/population';
import {
  LiftDirection,
  Tex,
  ZoneFaction,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
} from '../shared';
import { seededRandom, hashSeed } from '../../core/rand';
import { ProductionBeltGeneration, buildRooms, placeLift, expandProductionBeltGeometry, decorateLineRooms, applyZoneRole, registerProductionMachineHazards, markConveyorSpine } from "./geometry";
import { registerProductionBeltContent, createProductionBeltState, registerProductionBeltRouteCues, populateRooms } from "./npcs";

export function generateProductionBeltDesignFloor(): ProductionBeltGeneration {
  registerProductionBeltContent();

  const world = new World();
  world.wallTex.fill(Tex.METAL);
  world.floorTex.fill(Tex.F_CONCRETE);
  world.factionControl.fill(ZoneFaction.CITIZEN);

  const rooms = buildRooms(world);
  const spawnX = rooms.gate.x + 3.5;
  const spawnY = rooms.gate.y + 3.5;

  placeLift(world, rooms.corridor.x + 4, rooms.corridor.y - 1, rooms.corridor.x + 4, rooms.corridor.y, LiftDirection.UP);
  placeLift(world, rooms.corridor.x + rooms.corridor.w - 4, rooms.corridor.y + rooms.corridor.h, rooms.corridor.x + rooms.corridor.w - 4, rooms.corridor.y + rooms.corridor.h - 1, LiftDirection.DOWN);

  // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:production_belt:-20', -20));
    expandProductionBeltGeometry(world, rngFn);
    
    sanitizeDoors(world);
  ensureConnectivity(world, spawnX, spawnY);
  generateZones(world);

  applyZoneRole(world, rooms.gate, ZoneFaction.CITIZEN, 2);
  applyZoneRole(world, rooms.foreman, ZoneFaction.CITIZEN, 2);
  applyZoneRole(world, rooms.metalLine, ZoneFaction.CITIZEN, 3);
  applyZoneRole(world, rooms.chargeLine, ZoneFaction.LIQUIDATOR, 3);
  applyZoneRole(world, rooms.ammoLine, ZoneFaction.WILD, 4);
  applyZoneRole(world, rooms.quarantine, ZoneFaction.WILD, 4);
  applyZoneRole(world, rooms.auditOffice, ZoneFaction.LIQUIDATOR, 3);

  decorateLineRooms(world, rooms);

  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  const containers = populateRooms(world, entities, nextId, rooms);
  const productionState = createProductionBeltState(rooms, containers);
  registerProductionBeltRouteCues(world, rooms, containers);
  markConveyorSpine(world, rooms.corridor.x + 1, rooms.corridor.y + 3, rooms.corridor.x + rooms.corridor.w - 2, rooms.corridor.y + 3, 91);
  registerProductionMachineHazards(world, [rooms.metalLine, rooms.chargeLine, rooms.ammoLine, rooms.quarantine], 4);

  world.bakeLights();
  const generation = { isDecentralized: true as const, world, entities, spawnX, spawnY, productionState };
    applyDesignFloorPopulationField(generation, { id: 'production_belt', z: -20 });
    return { ...generation, isDecentralized: true as const };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
