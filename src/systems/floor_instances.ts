/* ── Elevator floor instances: rare numbered route anomalies ─── */

import {
  EntityType,
  FloorLevel,
  LiftDirection,
  type Entity,
  type GameState,
  type WorldEventDraft,
} from '../core/types';
import { World } from '../core/world';
import {
  FLOOR_INSTANCES,
  floorInstanceById,
  type FloorInstanceDef,
} from '../data/floor_instances';
import { publishEvent } from './events';
import { rememberRumor } from './npc_memory';

export interface ActiveFloorInstance {
  id: string;
  displayNumber: string;
  title: string;
  baseFloor: FloorLevel;
  seed: number;
  seedTag: string;
  risk: number;
  enteredAt: number;
  fromFloor: FloorLevel;
  intendedFloor: FloorLevel;
  direction: LiftDirection;
  returnFloor: FloorLevel;
}

export interface FloorInstanceState {
  current: ActiveFloorInstance | null;
  discovered: Record<string, boolean>;
  anomalyCount: number;
  lastStableFloor: FloorLevel;
  lastAnomalyAt: number;
  lastRoll: number;
}

export interface ElevatorRouteResolution {
  targetFloor: FloorLevel;
  activeInstance: ActiveFloorInstance | null;
  anomaly: boolean;
  leavingInstance: boolean;
  exitedInstance: ActiveFloorInstance | null;
}

type FloorInstanceHost = GameState & { floorInstances?: FloorInstanceState };

const BASE_FLOORS = [
  FloorLevel.MINISTRY,
  FloorLevel.KVARTIRY,
  FloorLevel.LIVING,
  FloorLevel.MAINTENANCE,
  FloorLevel.HELL,
  FloorLevel.VOID,
] as const;

function normalizeFloor(value: unknown, fallback: FloorLevel): FloorLevel {
  return typeof value === 'number' && BASE_FLOORS.includes(value as FloorLevel)
    ? value as FloorLevel
    : fallback;
}

function normalizeDirection(value: unknown): LiftDirection {
  return value === LiftDirection.UP ? LiftDirection.UP : LiftDirection.DOWN;
}

function createDiscovered(): Record<string, boolean> {
  const discovered: Record<string, boolean> = {};
  for (const def of FLOOR_INSTANCES) if (def.discovered) discovered[def.id] = true;
  return discovered;
}

export function createFloorInstanceState(stableFloor = FloorLevel.LIVING): FloorInstanceState {
  return {
    current: null,
    discovered: createDiscovered(),
    anomalyCount: 0,
    lastStableFloor: stableFloor,
    lastAnomalyAt: -Infinity,
    lastRoll: 1,
  };
}

function normalizeActive(input: Partial<ActiveFloorInstance> | null | undefined): ActiveFloorInstance | null {
  if (!input || typeof input.id !== 'string') return null;
  const def = floorInstanceById(input.id);
  if (!def) return null;
  const intendedFloor = normalizeFloor(input.intendedFloor, def.baseFloor);
  return {
    id: def.id,
    displayNumber: def.displayNumber,
    title: def.title,
    baseFloor: def.baseFloor,
    seed: typeof input.seed === 'number' ? input.seed : Math.floor(Math.random() * 0x7fffffff),
    seedTag: typeof input.seedTag === 'string' ? input.seedTag : def.seedTag,
    risk: typeof input.risk === 'number' ? input.risk : def.risk,
    enteredAt: typeof input.enteredAt === 'number' ? input.enteredAt : 0,
    fromFloor: normalizeFloor(input.fromFloor, intendedFloor),
    intendedFloor,
    direction: normalizeDirection(input.direction),
    returnFloor: normalizeFloor(input.returnFloor, intendedFloor),
  };
}

export function normalizeFloorInstanceState(
  input: Partial<FloorInstanceState> | null | undefined,
  stableFloor = FloorLevel.LIVING,
): FloorInstanceState {
  const out = createFloorInstanceState(stableFloor);
  if (!input) return out;
  out.current = normalizeActive(input.current);
  out.anomalyCount = Math.max(0, Math.floor(input.anomalyCount ?? 0));
  out.lastStableFloor = normalizeFloor(input.lastStableFloor, stableFloor);
  out.lastAnomalyAt = typeof input.lastAnomalyAt === 'number' ? input.lastAnomalyAt : -Infinity;
  out.lastRoll = typeof input.lastRoll === 'number' ? input.lastRoll : 1;
  const discovered = input.discovered ?? {};
  for (const def of FLOOR_INSTANCES) {
    if (def.discovered || discovered[def.id] === true || out.current?.id === def.id) out.discovered[def.id] = true;
  }
  return out;
}

export function ensureFloorInstanceState(state: GameState, stableFloor = state.currentFloor): FloorInstanceState {
  const host = state as FloorInstanceHost;
  host.floorInstances = normalizeFloorInstanceState(host.floorInstances, stableFloor);
  return host.floorInstances;
}

export function setFloorInstanceState(
  state: GameState,
  input: Partial<FloorInstanceState> | null | undefined,
  stableFloor = state.currentFloor,
): FloorInstanceState {
  const normalized = normalizeFloorInstanceState(input, stableFloor);
  (state as FloorInstanceHost).floorInstances = normalized;
  return normalized;
}

export function floorInstanceStateForSave(state: GameState): FloorInstanceState {
  return normalizeFloorInstanceState((state as FloorInstanceHost).floorInstances, state.currentFloor);
}

export function getActiveFloorInstance(state: GameState): ActiveFloorInstance | null {
  return normalizeFloorInstanceState((state as FloorInstanceHost).floorInstances, state.currentFloor).current;
}

export function floorInstanceLabel(instance: ActiveFloorInstance): string {
  return `№${instance.displayNumber} «${instance.title}»`;
}

export function currentFloorInstanceLabel(state: GameState): string | undefined {
  const active = getActiveFloorInstance(state);
  return active ? floorInstanceLabel(active) : undefined;
}

function anomalyChance(state: GameState): number {
  const store = ensureFloorInstanceState(state);
  const cooldown = state.time - store.lastAnomalyAt < 90;
  if (cooldown) return 0;
  let chance = 0.025;
  if (state.samosborActive) chance += 0.055;
  chance += Math.min(0.015, state.samosborCount * 0.002);
  return Math.min(0.095, chance);
}

function pickInstance(fromFloor: FloorLevel, intendedFloor: FloorLevel): FloorInstanceDef | undefined {
  let total = 0;
  const candidates: FloorInstanceDef[] = [];
  for (const def of FLOOR_INSTANCES) {
    if (def.weight <= 0) continue;
    if (def.baseFloor === FloorLevel.VOID) continue;
    const nearRoute = def.baseFloor === fromFloor || def.baseFloor === intendedFloor;
    const weight = nearRoute ? def.weight * 2 : def.weight;
    total += weight;
    for (let i = 0; i < weight; i++) candidates.push(def);
  }
  if (total <= 0 || candidates.length === 0) return undefined;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function makeActiveInstance(
  def: FloorInstanceDef,
  state: GameState,
  fromFloor: FloorLevel,
  intendedFloor: FloorLevel,
  direction: LiftDirection,
): ActiveFloorInstance {
  return {
    id: def.id,
    displayNumber: def.displayNumber,
    title: def.title,
    baseFloor: def.baseFloor,
    seed: Math.floor(Math.random() * 0x7fffffff),
    seedTag: def.seedTag,
    risk: def.risk,
    enteredAt: state.time,
    fromFloor,
    intendedFloor,
    direction,
    returnFloor: intendedFloor,
  };
}

function publishElevatorInstanceEvent(
  state: GameState,
  eventType: 'elevator_anomaly' | 'elevator_loop_exit',
  instance: ActiveFloorInstance,
  zoneId: number | undefined,
): void {
  publishEvent(state, {
    type: eventType,
    floor: instance.baseFloor,
    zoneId,
    severity: eventType === 'elevator_anomaly' ? 4 : 3,
    privacy: 'local',
    tags: ['elevator', 'floor_instance', instance.id, eventType === 'elevator_anomaly' ? 'wrong_route' : 'loop_exit'],
    data: {
      displayNumber: instance.displayNumber,
      title: instance.title,
      seed: instance.seed,
      seedTag: instance.seedTag,
      risk: instance.risk,
      fromFloor: instance.fromFloor,
      intendedFloor: instance.intendedFloor,
      returnFloor: instance.returnFloor,
    },
  } as WorldEventDraft);
}

export function resolveElevatorRoute(
  state: GameState,
  fromFloor: FloorLevel,
  intendedFloor: FloorLevel,
  direction: LiftDirection,
  zoneId?: number,
): ElevatorRouteResolution {
  const store = ensureFloorInstanceState(state, fromFloor);
  const active = store.current ? normalizeActive(store.current) : null;
  if (active) {
    store.current = null;
    store.lastStableFloor = intendedFloor;
    publishElevatorInstanceEvent(state, 'elevator_loop_exit', active, zoneId);
    return {
      targetFloor: intendedFloor,
      activeInstance: null,
      anomaly: false,
      leavingInstance: true,
      exitedInstance: active,
    };
  }

  store.lastStableFloor = fromFloor;
  store.lastRoll = Math.random();
  if (store.lastRoll >= anomalyChance(state)) {
    return {
      targetFloor: intendedFloor,
      activeInstance: null,
      anomaly: false,
      leavingInstance: false,
      exitedInstance: null,
    };
  }

  const def = pickInstance(fromFloor, intendedFloor);
  if (!def) {
    return {
      targetFloor: intendedFloor,
      activeInstance: null,
      anomaly: false,
      leavingInstance: false,
      exitedInstance: null,
    };
  }

  const instance = makeActiveInstance(def, state, fromFloor, intendedFloor, direction);
  store.current = instance;
  store.discovered[def.id] = true;
  store.anomalyCount++;
  store.lastAnomalyAt = state.time;
  publishElevatorInstanceEvent(state, 'elevator_anomaly', instance, zoneId);
  return {
    targetFloor: def.baseFloor,
    activeInstance: instance,
    anomaly: true,
    leavingInstance: false,
    exitedInstance: null,
  };
}

export function spreadElevatorInstanceRumor(
  world: World,
  entities: Entity[],
  player: Entity,
  state: GameState,
  instance: ActiveFloorInstance,
): number {
  const def = floorInstanceById(instance.id);
  const rumorId = def?.rumorId ?? 'floor_lift_smell';
  let remembered = 0;
  for (const e of entities) {
    if (remembered >= 8) break;
    if (!e.alive || e.type !== EntityType.NPC) continue;
    if (world.dist2(player.x, player.y, e.x, e.y) > 144) continue;
    if (rememberRumor(e, rumorId, state.time)) remembered++;
    rememberRumor(e, 'floor_lift_smell', state.time);
  }
  return remembered;
}

export function summarizeFloorInstances(state: GameState): string[] {
  const store = ensureFloorInstanceState(state);
  const active = store.current;
  const out = [
    active
      ? `active ${floorInstanceLabel(active)} base=${FloorLevel[active.baseFloor]} risk=${active.risk} seed=${active.seed}`
      : 'active none',
    `anomalies=${store.anomalyCount} lastRoll=${store.lastRoll.toFixed(3)} lastStable=${FloorLevel[store.lastStableFloor]}`,
  ];
  const discovered = FLOOR_INSTANCES.filter(def => store.discovered[def.id]).map(def => `№${def.displayNumber}`);
  out.push(`discovered=${discovered.length ? discovered.join(', ') : 'none'}`);
  return out;
}
