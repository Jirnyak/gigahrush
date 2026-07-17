/* -- Design z: hilbert_depot - indexed cargo curve and locked chords -- */

import {
  DoorState,
  LiftDirection,
  RoomType,
  Tex,
  W,
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
} from '../shared';
import { xorshift32 } from '../../core/rand';
import { DESIGN_FLOOR_ID, HILBERT_DEPOT_ROUTE_Z, CURVE_ORDER, CURVE_STEP, CURVE_X, CURVE_Y, BAY_FIRST_INDEX, BAY_INDEX_STEP, HilbertDepotState, HilbertDepotGeneration } from "./meta";
import { expandHilbertDepotRouteGeometry, carveSafeCurve, decorateSafeCurve, addCargoBay, addDepotChords, registerHilbertDepotRouteCues, addItemDrop, addNamedRoom, connectRoomToPoint, placeLift, hilbertTracePoints } from "./geometry";
import { applyHilbertDepotTerritorySeeds, alignHilbertDepotAmbientNpcTerritory, addDepotPressure, refreshContainerZones } from "./npcs";

export function generateHilbertDepotDesignFloor(seed: number): HilbertDepotGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };
  const rand = xorshift32(seed);
  const points = hilbertTracePoints(CURVE_ORDER, CURVE_X, CURVE_Y, CURVE_STEP);
  const state: HilbertDepotState = {
    routeId: DESIGN_FLOOR_ID,
    anchorZ: HILBERT_DEPOT_ROUTE_Z,
    curveOrder: CURVE_ORDER,
    curvePointCount: points.length,
    cargoContainerIds: [],
    cargoOrders: [],
    lockedChordDoorCells: [],
    chords: [],
    debugEntry: {
      spawnX: CURVE_X - 10.5,
      spawnY: CURVE_Y - 1.5,
      summary: 'hilbert_depot z=-30: safe aisle follows Hilbert index; locked chords cut distant cargo order.',
    },
  };

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.METAL;
    world.floorTex[i] = Tex.F_CONCRETE;
  }

  carveSafeCurve(world, points);
  const entry = addNamedRoom(world, RoomType.CORRIDOR, CURVE_X - 30, CURVE_Y - 10, 16, 14, 'Лифтовая приемка склада Гильберта', Tex.LIFT_DOOR, Tex.F_CONCRETE);
  const exitPoint = points[points.length - 1];
  const exit = addNamedRoom(world, RoomType.CORRIDOR, exitPoint.x + 12, exitPoint.y - 10, 16, 14, 'Дальняя приемка склада Гильберта', Tex.LIFT_DOOR, Tex.F_CONCRETE);
  state.debugEntry.spawnX = entry.x + entry.w - 3 + 0.5;
  state.debugEntry.spawnY = entry.y + 7 + 0.5;
  connectRoomToPoint(world, entry, CURVE_X, CURVE_Y, DoorState.CLOSED);
  connectRoomToPoint(world, exit, exitPoint.x, exitPoint.y, DoorState.CLOSED);
  placeLift(world, entry.x + 3, entry.y + 7, LiftDirection.UP);
  placeLift(world, exit.x + exit.w - 4, exit.y + 7, LiftDirection.DOWN);

  for (let d = BAY_FIRST_INDEX; d < points.length - BAY_FIRST_INDEX; d += BAY_INDEX_STEP) {
    addCargoBay(world, state, points, d);
  }

  addDepotChords(world, state, points);
  decorateSafeCurve(world, points);
  addDepotPressure(entities, nextId, points);
  addItemDrop(world, entities, nextId, CURVE_X + 2, CURVE_Y + 2, 'track_diagram_scrap', 1, 'Индексная памятка склада Гильберта: видимый сосед может быть чужим номером. Идите по Г-000, Г-008, Г-016, пока не решите резать хорду.');

  generateZones(world);
  
  expandHilbertDepotRouteGeometry(world, rand);
  applyHilbertDepotTerritorySeeds(world);
  alignHilbertDepotAmbientNpcTerritory(world, entities);

  refreshContainerZones(world);
  ensureConnectivity(world, state.debugEntry.spawnX, state.debugEntry.spawnY);
  sanitizeDoors(world);
  world.rebuildContainerMap();
  registerHilbertDepotRouteCues(world, state, points, entry, exit);
  world.bakeLights();

  return {
    isDecentralized: true,
    world,
    entities,
    spawnX: state.debugEntry.spawnX,
    spawnY: state.debugEntry.spawnY,
    hilbertState: state,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
