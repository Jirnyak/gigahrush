/* -- Design z: cantor_pustoty / Кантор пустоты ---------------- */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { CANTOR_PUSTOTY_ROUTE_ID, CANTOR_PUSTOTY_Z, RECURSION_DEPTH, CANTOR_METRICS } from "./meta";
import { buildCantorProxy, paintVoidBase, carveProxyMaskToWorld, stampCantorMidAndMicroLayer, stampRooms, registerCantorRouteCues, tuneCantorZones, reinforceCantorPustotyAuthoredHqTerritory, preserveCantorPustotyAuthoredRooms } from "./geometry";
import { placeContainers, placeEntities } from "./npcs";

export function generateCantorPustotyDesignFloor(): FloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 10000 };

  paintVoidBase(world);
  const cantor = buildCantorProxy();
  carveProxyMaskToWorld(world, cantor.mask);
  const rooms = stampRooms(world);
  const microRooms = stampCantorMidAndMicroLayer(world, cantor.mask);
  const spawnX = rooms.entry.x + (rooms.entry.w >> 1) + 0.5;
  const spawnY = rooms.entry.y + (rooms.entry.h >> 1) + 0.5;

  generateZones(world);
  tuneCantorZones(world);
  preserveCantorPustotyAuthoredRooms(world);
  reinforceCantorPustotyAuthoredHqTerritory(world);
  placeContainers(world, rooms);
  placeEntities(world, entities, nextId, rooms);
  registerCantorRouteCues(world, rooms);
  ensureConnectivity(world, spawnX, spawnY);
  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();

  CANTOR_METRICS.set(world, {
    routeId: CANTOR_PUSTOTY_ROUTE_ID,
    z: CANTOR_PUSTOTY_Z,
    recursionDepth: RECURSION_DEPTH,
    proxyOpenCells: cantor.proxyOpenCells,
    componentCountBeforeBridge: cantor.componentCountBeforeBridge,
    largestComponentBeforeBridge: cantor.largestComponentBeforeBridge,
    bridgedComponents: cantor.bridgedComponents,
    bridgeProxyCells: cantor.bridgeCells,
    stashIslandCount: 3 + Math.floor(microRooms / 160),
  });

  return { isDecentralized: true, world, entities, spawnX, spawnY };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
