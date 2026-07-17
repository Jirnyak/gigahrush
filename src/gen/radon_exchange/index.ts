/* -- Design z: radon_exchange - scan-line transfer through concrete -- */

import {
  ContainerKind,
  LiftDirection,
} from '../../core/types';
import { World } from '../../core/world';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { RADON_EXCHANGE_PROJECTION_KEY, CX, CY, SHUTTER_DOORS } from "./meta";
import { addShutterDoorAt, placeLift, stampRadonRooms, buildRadonExchangeGeometry, applyRadonExchangeTerritory } from "./geometry";
import { addContainer, registerRadonRouteCues } from "./npcs";

export function generateRadonExchangeDesignFloor(): FloorGeneration {
  const world = new World();
  buildRadonExchangeGeometry(world);
  const rooms = stampRadonRooms(world);

  for (const shutter of SHUTTER_DOORS) addShutterDoorAt(world, shutter.x, shutter.y, shutter.axis, shutter.state, shutter.keyId);
  placeLift(world, 836, 188, LiftDirection.UP);
  placeLift(world, 188, 836, LiftDirection.DOWN);

  generateZones(world);
  const nextContainerId = { v: 1 };
  addContainer(world, nextContainerId, rooms.projectionKey, rooms.projectionKey.x + 18, rooms.projectionKey.y + 10, ContainerKind.CASHBOX, 'Лоток проекционного ключа', [
    { defId: RADON_EXCHANGE_PROJECTION_KEY, count: 1 },
    { defId: 'container_key_label', count: 1 },
    { defId: 'filter_receipt', count: 1 },
  ], ['projection_key', 'shutter', 'theft', 'documents'], 'owner', 'оператор радоновой проекции');
  addContainer(world, nextContainerId, rooms.blindWedge, rooms.blindWedge.x + 15, rooms.blindWedge.y + 11, ContainerKind.SECRET_STASH, 'Слепой ящик дозиметристов', [
    { defId: 'gasmask_filter', count: 1 },
    { defId: 'overexposed_photo', count: 1 },
    { defId: 'lift_scheme', count: 1 },
  ], ['blind_wedge', 'reward', 'radon'], 'secret');

  registerRadonRouteCues(world, rooms, world.containers[0]);
  ensureConnectivity(world, CX + 0.5, CY + 0.5);
  sanitizeDoors(world);
  world.rebuildContainerMap();
  world.bakeLights();
  world.markFogDirty();
  applyRadonExchangeTerritory(world);

  return {
    isDecentralized: true,
    world,
    entities: [],
    spawnX: CX + 0.5,
    spawnY: CY + 0.5,
  };
}

export * from "./meta";
export * from "./geometry";
export * from "./npcs";
