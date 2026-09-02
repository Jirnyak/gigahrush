/* -- Design z: bank_floor - cash desks, debt and vault risk -- */

export * from './meta';
export * from './geometry';
export * from './npcs';
export * from './lighting';

import { BANK_ROOM_NAMES, BANK_FLOOR_ROUTE_ID, BANK_FLOOR_Z, BANK_TAGS, type BankFloorState, type BankFloorGeneration, type BankActionKind } from './meta';
import { BANK_VAULT_RISK_RADIUS, createBankRooms, dressBankRooms, generateBankZones, expandBankFloorRouteGeometry } from './geometry';
import { DIRECTOR_DEF, CASHIER_DEF, CREDIT_DEF, GUARD_DEF, DEBTOR_DEF, spawnBankNpc, addBankContainers, applyBankFloorTerritorySeeds } from './npcs';
import { W, Tex, type Entity, type GameState, type WorldEvent } from '../../core/types';
import { World } from '../../core/world';
import { publishEvent } from '../../systems/events';
import { finalizeExpandedFloor } from '../shared';
import { designFloorById } from '../../data/design_floors';
import { hashSeed, seededRandom } from '../../core/rand';
import { newEntityIdCursor } from '../entity_ids';
import { lightBankFloor } from './lighting';

export function createBankFloorState(): BankFloorState {
  return {
    routeId: BANK_FLOOR_ROUTE_ID,
    anchorZ: BANK_FLOOR_Z,
    legalRooms: [
      BANK_ROOM_NAMES.hall,
      BANK_ROOM_NAMES.teller,
      BANK_ROOM_NAMES.deposit,
      BANK_ROOM_NAMES.credit,
      BANK_ROOM_NAMES.tellerLane,
      BANK_ROOM_NAMES.bribeQueue,
    ],
    riskRooms: [
      BANK_ROOM_NAMES.vault,
      BANK_ROOM_NAMES.queue,
      BANK_ROOM_NAMES.bypass,
      BANK_ROOM_NAMES.debtorCircuit,
      BANK_ROOM_NAMES.vaultShell,
      BANK_ROOM_NAMES.bypassGate,
    ],
    debtCircuitRooms: [
      BANK_ROOM_NAMES.tellerLane,
      BANK_ROOM_NAMES.queue,
      BANK_ROOM_NAMES.debtorCircuit,
      BANK_ROOM_NAMES.bribeQueue,
      BANK_ROOM_NAMES.bypassGate,
      BANK_ROOM_NAMES.vaultShell,
    ],
    vaultContainerIds: [],
    depositContainerIds: [],
    vaultRiskRadius: BANK_VAULT_RISK_RADIUS,
    debugEntry: {
      spawnX: 454.5,
      spawnY: 514.5,
      summary: 'bank_floor z=+26 spawn at west lift; cash desks, credit window, debt loop, service bypass and vault risk shell are connected.',
    },
  };
}

export function publishBankFloorEvent(
  state: GameState,
  kind: BankActionKind,
  targetName: string,
  roomId?: number,
  zoneId?: number,
): WorldEvent {
  return publishEvent(state, {
    type: 'rumor_observed',
    z: BANK_FLOOR_Z,
    roomId,
    zoneId,
    targetName,
    severity: kind === 'vault_theft' || kind === 'forgery' ? 5 : 3,
    privacy: kind === 'vault_theft' || kind === 'forgery' ? 'witnessed' : 'local',
    tags: [...BANK_TAGS, kind],
    data: { bankingAction: kind, routeId: BANK_FLOOR_ROUTE_ID },
  });
}

export function generateBankFloorDesignFloor(): BankFloorGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = newEntityIdCursor();
  const bankState = createBankFloorState();

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.MARBLE;
    world.floorTex[i] = Tex.F_MARBLE_TILE;
  }

  const rooms = createBankRooms(world);
  dressBankRooms(world, rooms);
  generateBankZones(world);

  const directorId = spawnBankNpc(entities, nextId, 'bank_director_zinaida', DIRECTOR_DEF, rooms.deposit, 7, 7, Math.PI / 2);
  const cashierId = spawnBankNpc(entities, nextId, 'bank_cashier_lyuba', CASHIER_DEF, rooms.teller, 6, 9, Math.PI / 2);
  const creditId = spawnBankNpc(entities, nextId, 'bank_credit_prokhor', CREDIT_DEF, rooms.credit, 6, 8, Math.PI);
  const guardId = spawnBankNpc(entities, nextId, 'bank_guard_semyon', GUARD_DEF, rooms.vault, 5, 6, Math.PI);
  spawnBankNpc(entities, nextId, 'bank_debtor_mitya', DEBTOR_DEF, rooms.queue, 7, 5, 0);

  addBankContainers(world, bankState, rooms, directorId, cashierId, creditId, guardId);

  const route = designFloorById(BANK_FLOOR_ROUTE_ID)!;
  const rng = seededRandom(hashSeed(`design-full:${route.id}:${route.z}`, route.z));

  expandBankFloorRouteGeometry(world, rng);
  
  const generation = {
    world,
    entities,
    spawnX: bankState.debugEntry.spawnX,
    spawnY: bankState.debugEntry.spawnY,
    bankState,
    isDecentralized: true,
  };
  finalizeExpandedFloor(generation, route, rng);
  applyBankFloorTerritorySeeds(world);

  /* Свет ставится после `finalizeExpandedFloor` (там прошли зоны, санация
     дверей и связность) и перед последним бейком. Бейк внутри финализации
     этого света ещё не знает — потому он тут и повторён. */
  lightBankFloor(world);
  world.bakeLights();

  return generation;
}

