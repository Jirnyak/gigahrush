/* -- Design z: bank_floor - cash desks, debt and vault risk -- */

import { BANK_ROOM_NAMES, BANK_HQ_ROOM_NAMES, BANK_VAULT_RISK_RADIUS, BANK_VAULT_RISK_INNER_RADIUS, BankVaultRiskSource, bankVaultRiskSources, bankVaultRiskSignedDistance, bankVaultRiskTierAt, BankMicroBlockSpec, expandBankFloorRouteGeometry, decorateExpandedBankDecisionRooms, buildDebtCircuitLoop, buildBankMicroLayer, carveBankWingCorridors, stampOptionalBankRoom, decorateBankMicroRoom, applyBankVaultRiskSdf, addBankTag, createBankRooms, stampBankRoom, placeBankDoor, dressBankRooms, generateBankZones, setFeature, carveRun, carveRect, openRoomToNearestCorridor, scatterRoomFurniture } from './geometry';
import { BankHqClusterSpec, BANK_HQ_CLUSTERS, DIRECTOR_DEF, CASHIER_DEF, CREDIT_DEF, GUARD_DEF, DEBTOR_DEF, addExpandedBankContainers, applyBankFloorTerritorySeeds, paintBankRoomTerritory, paintBankOwnerPatch, spawnBankNpc, addBankContainers, addBankContainer, nextContainerId } from './npcs';

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  Cell,
  ContainerKind,
  DoorState,
  Faction,
  Feature,
  LiftDirection,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type TerritoryOwner,
  type Entity,
  type GameState,
  type Item,
  type Room,
  type WorldContainer,
  type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { designNpcFloorKey, type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { publishEvent } from '../../systems/events';
import { setTerritoryOwnerAtIndex, syncZoneMetadataFromTerritory } from '../../systems/territory';
import { canPlaceRoom, stampRoom, placeLifts } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { finalizeExpandedFloor} from '../shared';
import { designFloorById } from '../../data/design_floors';
import { hashSeed, seededRandom } from '../../core/rand';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('bank_floor');

export const BANK_FLOOR_ROUTE_ID = 'bank_floor' as const;
export const BANK_FLOOR_Z = 26;
export const BANK_FLOOR_BASE_FLOOR = 30;

export const BANK_FLOOR_META = {
  routeId: BANK_FLOOR_ROUTE_ID,
  displayName: 'Банковский этаж',
  z: BANK_FLOOR_Z,
  // Bank B-22 lives in the Ministry band because money here is paperwork first:
  // accounts, stamped debt, audits and liquidator-backed vault rules.
  baseReason: 'ministry_bureaucratic_finance',
  debugEntry: 'generateBankFloorDesignFloor()',
} as const;

export interface BankFloorState {
  routeId: typeof BANK_FLOOR_ROUTE_ID;
  anchorZ: typeof BANK_FLOOR_Z;
  legalRooms: string[];
  riskRooms: string[];
  debtCircuitRooms: string[];
  vaultContainerIds: number[];
  depositContainerIds: number[];
  vaultRiskRadius: number;
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface BankFloorGeneration extends FloorGeneration {
  bankState: BankFloorState;
}

export type BankActionKind = 'deposit' | 'loan' | 'repay' | 'forgery' | 'vault_theft';

export const BANK_TAGS = ['banking', BANK_FLOOR_ROUTE_ID];

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

export function summarizeBankFloorState(bank: BankFloorState): string[] {
  return [
    `route=${bank.routeId} z=${bank.anchorZ}`,
    `legalRooms=${bank.legalRooms.length} riskRooms=${bank.riskRooms.length}`,
    `debtCircuit=${bank.debtCircuitRooms.join(' -> ')}`,
    `vaultRiskRadius=${bank.vaultRiskRadius}`,
    `vaultContainers=${bank.vaultContainerIds.join(',') || 'none'}`,
    `depositContainers=${bank.depositContainerIds.join(',') || 'none'}`,
    bank.debugEntry.summary,
  ];
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
    z: BANK_FLOOR_BASE_FLOOR,
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
  const nextId = { v: 10000 };
  const bankState = createBankFloorState();

  for (let i = 0; i < W * W; i++) {
    world.wallTex[i] = Tex.MARBLE;
    world.floorTex[i] = Tex.F_MARBLE_TILE;
  }

  const rooms = createBankRooms(world);
  dressBankRooms(world, rooms);
  placeLifts(world, 16, LiftDirection.UP);
  placeLifts(world, 16, LiftDirection.DOWN);
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
  
  world.bakeLights();

  return generation;
}

