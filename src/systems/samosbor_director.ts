/* ── Bounded samosbor beat scheduler ──────────────────────────── */

import {
  Cell, DoorState, EntityType, Faction, FloorLevel, Occupation, AIGoal, MonsterKind, W,
  type Entity, type GameState, type WorldEventType,
  msg,
} from '../core/types';
import { World } from '../core/world';
import {
  getSamosborBeatDefs,
  type SamosborBeatDef,
  type SamosborBeatPhase,
} from '../data/samosbor_director';
import { type SamosborVariantId, type ActiveSamosborVariant } from '../data/samosbor_variants';
import { freshNeeds, ITEMS, randomName } from '../data/catalog';
import { MONSTERS, applyMonsterVariant } from '../entities/monster';
import { getMaxHp, randomRPG, scaleMonsterHp, scaleMonsterSpeed } from './rpg';
import { changeResourceStock } from './economy';
import { publishEvent, getRecentEvents } from './events';
import { observeRumorEvent } from './rumor';

const TRACE_CAP = 300;
const MONSTER_SOFT_CAP = 10_000;

export type SamosborDirectorTickReason =
  | 'pre_samosbor'
  | 'active_cadence'
  | 'post_samosbor'
  | 'debug_force';

export interface SamosborDirectorSnapshot {
  time: number;
  cycle: number;
  phase: SamosborBeatPhase;
  floor: FloorLevel;
  zoneId: number;
  zoneLevel: number;
  playerX: number;
  playerY: number;
  playerHp: number;
  playerMaxHp: number;
  samosborActive: boolean;
  variantId: SamosborVariantId;
  dangerBudget: number;
  reliefBudget: number;
}

export interface SamosborDirectorTraceEntry {
  time: number;
  cycle: number;
  phase: SamosborBeatPhase;
  reason: SamosborDirectorTickReason;
  chosenBeatId?: string;
  rejectedTopBeatId?: string;
  reasonCode: string;
  dangerBudget: number;
  reliefBudget: number;
  samosborVariant: SamosborVariantId;
}

export interface SamosborDirectorState {
  cycle: number;
  lastTickAt: number;
  forceCursor: number;
  cooldowns: Record<string, number>;
  runCounts: Record<string, number>;
  traceStart: number;
  traceCount: number;
  traces: (SamosborDirectorTraceEntry | null)[];
  lastBeatId: string;
}

export interface SamosborDirectorTickResult {
  fired: boolean;
  beatId?: string;
  reasonCode: string;
}

type DirectorGameState = GameState & { samosborDirector?: Partial<SamosborDirectorState> };

function cleanNumberMap(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export function ensureSamosborDirectorState(state: GameState): SamosborDirectorState {
  const host = state as DirectorGameState;
  const src = host.samosborDirector ?? {};
  let traces = Array.isArray(src.traces) ? src.traces.slice(0, TRACE_CAP) : [];
  while (traces.length < TRACE_CAP) traces.push(null);
  host.samosborDirector = {
    cycle: Number.isFinite(src.cycle) ? src.cycle as number : state.samosborCount,
    lastTickAt: Number.isFinite(src.lastTickAt) ? src.lastTickAt as number : -Infinity,
    forceCursor: Number.isFinite(src.forceCursor) ? src.forceCursor as number : 0,
    cooldowns: cleanNumberMap(src.cooldowns),
    runCounts: cleanNumberMap(src.runCounts),
    traceStart: Number.isFinite(src.traceStart) ? Math.max(0, Math.min(TRACE_CAP - 1, src.traceStart as number)) : 0,
    traceCount: Number.isFinite(src.traceCount) ? Math.max(0, Math.min(TRACE_CAP, src.traceCount as number)) : 0,
    traces,
    lastBeatId: typeof src.lastBeatId === 'string' ? src.lastBeatId : '',
  };
  return host.samosborDirector as SamosborDirectorState;
}

function resetCycleIfNeeded(director: SamosborDirectorState, cycle: number): void {
  if (director.cycle === cycle) return;
  director.cycle = cycle;
  director.runCounts = {};
}

function phaseForReason(reason: SamosborDirectorTickReason): SamosborBeatPhase {
  if (reason === 'post_samosbor') return 'aftermath';
  if (reason === 'active_cadence') return 'active';
  return 'warning';
}

function findPlayer(entities: Entity[]): Entity | null {
  for (const e of entities) if (e.type === EntityType.PLAYER && e.alive) return e;
  return null;
}

function buildSnapshot(
  world: World,
  entities: Entity[],
  state: GameState,
  variant: ActiveSamosborVariant | null,
  reason: SamosborDirectorTickReason,
): SamosborDirectorSnapshot {
  const player = findPlayer(entities);
  const px = player ? Math.floor(player.x) : (world.zones[0]?.cx ?? (W >> 1));
  const py = player ? Math.floor(player.y) : (world.zones[0]?.cy ?? (W >> 1));
  const zoneId = world.zoneMap[world.idx(px, py)] ?? 0;
  const zoneLevel = world.zones[zoneId]?.level ?? 1;
  let dangerBudget = state.samosborActive ? 2 : 3;
  const playerHp = player?.hp ?? 100;
  const playerMaxHp = Math.max(1, player?.maxHp ?? 100);
  if (playerHp < playerMaxHp * 0.35) dangerBudget--;
  const recentDanger = getRecentEvents(state, { minSeverity: 4, limit: 8 }).filter(e =>
    e.tags.includes('danger') || e.tags.includes('monster') || e.tags.includes('samosbor'),
  ).length;
  if (recentDanger >= 4) dangerBudget--;
  const reliefBudget = dangerBudget <= 1 || playerHp < playerMaxHp * 0.5 ? 2 : 1;

  return {
    time: state.time,
    cycle: state.samosborCount,
    phase: phaseForReason(reason),
    floor: state.currentFloor,
    zoneId,
    zoneLevel,
    playerX: player?.x ?? px + 0.5,
    playerY: player?.y ?? py + 0.5,
    playerHp,
    playerMaxHp,
    samosborActive: state.samosborActive,
    variantId: variant?.def.id ?? 'classic',
    dangerBudget: Math.max(0, dangerBudget),
    reliefBudget,
  };
}

function rejectBeat(
  beat: SamosborBeatDef,
  snapshot: SamosborDirectorSnapshot,
  director: SamosborDirectorState,
): string | null {
  if (beat.phase !== snapshot.phase) return 'phase_mismatch';
  if (!beat.floors.includes(snapshot.floor)) return 'floor_mismatch';
  if (!beat.variants.includes(snapshot.variantId)) return 'variant_mismatch';
  if ((director.cooldowns[beat.id] ?? 0) > snapshot.time) return 'cooldown';
  if ((director.runCounts[beat.id] ?? 0) >= beat.maxPerCycle) return 'max_per_cycle';
  if (beat.tags.includes('danger') && snapshot.dangerBudget <= 0) return 'danger_budget';
  return null;
}

function pickBeat(
  snapshot: SamosborDirectorSnapshot,
  director: SamosborDirectorState,
): { beat: SamosborBeatDef | null; rejectedTop?: SamosborBeatDef; rejectedReason?: string } {
  let total = 0;
  const legal: SamosborBeatDef[] = [];
  let rejectedTop: SamosborBeatDef | undefined;
  let rejectedReason: string | undefined;

  for (const beat of getSamosborBeatDefs()) {
    const reason = rejectBeat(beat, snapshot, director);
    if (reason) {
      if (!rejectedTop || beat.weight > rejectedTop.weight) {
        rejectedTop = beat;
        rejectedReason = reason;
      }
      continue;
    }
    total += Math.max(0, beat.weight);
    legal.push(beat);
  }

  if (legal.length === 0 || total <= 0) return { beat: null, rejectedTop, rejectedReason };

  let roll = Math.random() * total;
  for (const beat of legal) {
    roll -= Math.max(0, beat.weight);
    if (roll <= 0) return { beat, rejectedTop, rejectedReason };
  }
  return { beat: legal[legal.length - 1], rejectedTop, rejectedReason };
}

function recordTrace(
  director: SamosborDirectorState,
  snapshot: SamosborDirectorSnapshot,
  reason: SamosborDirectorTickReason,
  reasonCode: string,
  chosenBeatId?: string,
  rejectedTopBeatId?: string,
): void {
  const entry: SamosborDirectorTraceEntry = {
    time: snapshot.time,
    cycle: snapshot.cycle,
    phase: snapshot.phase,
    reason,
    chosenBeatId,
    rejectedTopBeatId,
    reasonCode,
    dangerBudget: snapshot.dangerBudget,
    reliefBudget: snapshot.reliefBudget,
    samosborVariant: snapshot.variantId,
  };
  if (director.traceCount < TRACE_CAP) {
    const i = (director.traceStart + director.traceCount) % TRACE_CAP;
    director.traces[i] = entry;
    director.traceCount++;
  } else {
    director.traces[director.traceStart] = entry;
    director.traceStart = (director.traceStart + 1) % TRACE_CAP;
  }
}

export function getSamosborDirectorTrace(state: GameState, limit = 12): SamosborDirectorTraceEntry[] {
  const director = ensureSamosborDirectorState(state);
  const out: SamosborDirectorTraceEntry[] = [];
  const n = Math.min(limit, director.traceCount);
  for (let i = 0; i < n; i++) {
    const ti = (director.traceStart + director.traceCount - 1 - i + TRACE_CAP) % TRACE_CAP;
    const entry = director.traces[ti];
    if (entry) out.push(entry);
  }
  return out;
}

function pushDirectorLine(state: GameState, beat: SamosborBeatDef): void {
  state.msgs.push(msg(beat.line, state.time, beat.color));
}

function eventTypeForBeat(beat: SamosborBeatDef): WorldEventType {
  switch (beat.effectId) {
    case 'resource_shortage': return 'room_lacked_resources';
    case 'door_malfunction': return 'door_sealed';
    case 'container_theft': return 'item_stolen';
    case 'monster_aftershock': return 'samosbor_warning';
    default: return 'samosbor_warning';
  }
}

function publishDirectorBeatEvent(
  state: GameState,
  beat: SamosborBeatDef,
  snapshot: SamosborDirectorSnapshot,
  extra: Record<string, unknown> = {},
): void {
  const itemId = typeof extra.itemId === 'string' ? extra.itemId : undefined;
  const itemName = typeof extra.itemName === 'string' ? extra.itemName : undefined;
  const containerId = typeof extra.containerId === 'number' ? extra.containerId : undefined;
  publishEvent(state, {
    type: eventTypeForBeat(beat),
    zoneId: snapshot.zoneId,
    x: snapshot.playerX,
    y: snapshot.playerY,
    itemId,
    itemName,
    containerId,
    severity: beat.severity,
    privacy: 'public',
    tags: ['samosbor', 'director', `variant_${snapshot.variantId}`, ...beat.tags].slice(0, 8),
    data: {
      beatId: beat.id,
      effectId: beat.effectId,
      variantId: snapshot.variantId,
      ...extra,
    },
  });
}

function findWalkableNear(world: World, x: number, y: number, minR: number, maxR: number): { x: number; y: number } | null {
  const bx = Math.floor(x);
  const by = Math.floor(y);
  for (let attempt = 0; attempt < 80; attempt++) {
    const r = minR + Math.floor(Math.random() * Math.max(1, maxR - minR + 1));
    const a = Math.random() * Math.PI * 2;
    const sx = world.wrap(bx + Math.round(Math.cos(a) * r));
    const sy = world.wrap(by + Math.round(Math.sin(a) * r));
    if (world.cells[world.idx(sx, sy)] === Cell.FLOOR && !world.solid(sx, sy)) return { x: sx, y: sy };
  }
  return null;
}

function applyFogResidue(world: World, snapshot: SamosborDirectorSnapshot): boolean {
  let dirty = false;
  const cx = Math.floor(snapshot.playerX);
  const cy = Math.floor(snapshot.playerY);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 6) continue;
      const x = world.wrap(cx + dx);
      const y = world.wrap(cy + dy);
      const i = world.idx(x, y);
      if (world.cells[i] !== Cell.FLOOR) continue;
      const next = Math.max(world.fog[i], 74);
      if (next !== world.fog[i]) {
        world.fog[i] = next;
        dirty = true;
      }
    }
  }
  if (dirty) world.markFogDirty();
  return dirty;
}

function countAliveByType(entities: Entity[], type: EntityType): number {
  let n = 0;
  for (const e of entities) if (e.type === type && e.alive) n++;
  return n;
}

function spawnPatrol(world: World, entities: Entity[], nextId: { v: number }, snapshot: SamosborDirectorSnapshot): number {
  if (countAliveByType(entities, EntityType.NPC) >= 1100) return 0;
  let spawned = 0;
  for (let i = 0; i < 2; i++) {
    const pos = findWalkableNear(world, snapshot.playerX, snapshot.playerY, 5, 12);
    if (!pos) continue;
    const rpg = randomRPG(Math.max(1, snapshot.zoneLevel));
    const maxHp = Math.round(getMaxHp(rpg) * 1.2);
    const nm = randomName(Faction.LIQUIDATOR);
    entities.push({
      id: nextId.v++,
      type: EntityType.NPC,
      x: pos.x + 0.5,
      y: pos.y + 0.5,
      angle: Math.random() * Math.PI * 2,
      pitch: 0,
      alive: true,
      speed: 1.25,
      sprite: Occupation.HUNTER,
      name: nm.name,
      isFemale: nm.female,
      needs: freshNeeds(),
      hp: maxHp,
      maxHp,
      money: 10 + Math.floor(Math.random() * 30),
      ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
      inventory: [{ defId: 'ammo_9mm', count: 3 + Math.floor(Math.random() * 5) }],
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      isTraveler: true,
      questId: -1,
      rpg,
    });
    spawned++;
  }
  return spawned;
}

function applyResourceShortage(state: GameState, beat: SamosborBeatDef): boolean {
  if (!beat.resourceId) return false;
  const amount = beat.resourceId === 'food' ? -22 : -18;
  return changeResourceStock(state, beat.resourceId, amount);
}

function seedRumor(world: World, entities: Entity[], state: GameState, snapshot: SamosborDirectorSnapshot): number {
  let seen = 0;
  let checked = 0;
  for (const e of entities) {
    if (seen >= 4) break;
    if (checked++ >= 512) break;
    if (!e.alive || e.type !== EntityType.NPC) continue;
    if (e.faction === Faction.PLAYER) continue;
    if (world.dist2(snapshot.playerX, snapshot.playerY, e.x, e.y) > 32 * 32) continue;
    observeRumorEvent(e, {
      type: 'samosbor_warning',
      severity: 3,
      floor: state.currentFloor,
      zoneId: snapshot.zoneId,
      tags: ['samosbor', 'director'],
    }, state.time);
    seen++;
  }
  return seen;
}

function applyDoorMalfunction(world: World, snapshot: SamosborDirectorSnapshot): number {
  let bestIdx = -1;
  let bestD2 = 12 * 12;
  let checked = 0;
  for (const [idx, door] of world.doors) {
    if (checked++ > 256) break;
    if (door.state !== DoorState.OPEN && door.state !== DoorState.HERMETIC_OPEN) continue;
    const x = idx % W;
    const y = (idx / W) | 0;
    const d2 = world.dist2(snapshot.playerX, snapshot.playerY, x + 0.5, y + 0.5);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = idx;
    }
  }
  if (bestIdx < 0) return 0;
  const door = world.doors.get(bestIdx);
  if (!door) return 0;
  door.state = door.state === DoorState.HERMETIC_OPEN ? DoorState.HERMETIC_CLOSED : DoorState.CLOSED;
  door.timer = Math.max(door.timer, 4);
  return 1;
}

function applyContainerTheft(world: World): { ok: boolean; itemId?: string; itemName?: string; containerId?: number } {
  for (const c of world.containers) {
    if (!c.inventory || c.inventory.length === 0) continue;
    const slot = c.inventory[c.inventory.length - 1];
    if (!slot || slot.count <= 0) continue;
    slot.count--;
    if (slot.count <= 0) c.inventory.pop();
    if (!c.stolenItemIds) c.stolenItemIds = [];
    if (!c.stolenItemIds.includes(slot.defId)) c.stolenItemIds.push(slot.defId);
    return {
      ok: true,
      itemId: slot.defId,
      itemName: ITEMS[slot.defId]?.name ?? slot.defId,
      containerId: c.id,
    };
  }
  return { ok: false };
}

function spawnAftershockMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  snapshot: SamosborDirectorSnapshot,
): number {
  if (countAliveByType(entities, EntityType.MONSTER) >= MONSTER_SOFT_CAP) return 0;
  const pos = findWalkableNear(world, snapshot.playerX, snapshot.playerY, 7, 14);
  if (!pos) return 0;
  const kinds = [MonsterKind.SBORKA, MonsterKind.POLZUN, MonsterKind.SHADOW];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const def = MONSTERS[kind];
  const rpg = randomRPG(Math.max(1, snapshot.zoneLevel));
  const hpBase = scaleMonsterHp(def.hp, Math.max(1, snapshot.zoneLevel));
  const hp = Math.round(hpBase * (1 + 0.08 * rpg.str));
  const monster: Entity = {
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: pos.x + 0.5,
    y: pos.y + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, Math.max(1, snapshot.zoneLevel)),
    sprite: def.sprite,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: def.attackRate,
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    rpg,
    phasing: kind === MonsterKind.SPIRIT,
  };
  applyMonsterVariant(monster, snapshot.floor, true);
  entities.push(monster);
  return 1;
}

function applyBeat(
  beat: SamosborBeatDef,
  world: World,
  entities: Entity[],
  state: GameState,
  nextId: { v: number },
  snapshot: SamosborDirectorSnapshot,
): { ok: boolean; extra?: Record<string, unknown> } {
  switch (beat.effectId) {
    case 'warning_line':
      pushDirectorLine(state, beat);
      return { ok: true };
    case 'local_fog_residue': {
      const ok = applyFogResidue(world, snapshot);
      if (ok) pushDirectorLine(state, beat);
      return { ok };
    }
    case 'extra_patrol': {
      const spawned = spawnPatrol(world, entities, nextId, snapshot);
      if (spawned > 0) pushDirectorLine(state, beat);
      return { ok: spawned > 0, extra: { spawned } };
    }
    case 'resource_shortage': {
      const ok = applyResourceShortage(state, beat);
      if (ok) pushDirectorLine(state, beat);
      return { ok, extra: { resourceId: beat.resourceId } };
    }
    case 'rumor_seed': {
      const seeded = seedRumor(world, entities, state, snapshot);
      pushDirectorLine(state, beat);
      return { ok: true, extra: { seededNpcCount: seeded } };
    }
    case 'door_malfunction': {
      const doors = applyDoorMalfunction(world, snapshot);
      pushDirectorLine(state, beat);
      return { ok: true, extra: { doors } };
    }
    case 'container_theft': {
      const theft = applyContainerTheft(world);
      if (theft.ok) pushDirectorLine(state, beat);
      return { ok: theft.ok, extra: theft };
    }
    case 'monster_aftershock': {
      const spawned = spawnAftershockMonster(world, entities, nextId, snapshot);
      if (spawned > 0) pushDirectorLine(state, beat);
      return { ok: spawned > 0, extra: { spawned } };
    }
  }
}

export function tickSamosborDirector(
  world: World,
  entities: Entity[],
  state: GameState,
  nextId: { v: number },
  variant: ActiveSamosborVariant | null,
  reason: SamosborDirectorTickReason,
): SamosborDirectorTickResult {
  const director = ensureSamosborDirectorState(state);
  resetCycleIfNeeded(director, state.samosborCount);
  const snapshot = buildSnapshot(world, entities, state, variant, reason);
  const { beat, rejectedTop, rejectedReason } = pickBeat(snapshot, director);
  if (!beat) {
    recordTrace(director, snapshot, reason, rejectedReason ? `no_legal_beat:${rejectedReason}` : 'no_legal_beat', undefined, rejectedTop?.id);
    return { fired: false, reasonCode: 'no_legal_beat' };
  }

  const effect = applyBeat(beat, world, entities, state, nextId, snapshot);
  if (!effect.ok) {
    recordTrace(director, snapshot, reason, 'effect_failed', beat.id, rejectedTop?.id);
    return { fired: false, beatId: beat.id, reasonCode: 'effect_failed' };
  }

  director.lastTickAt = state.time;
  director.lastBeatId = beat.id;
  director.runCounts[beat.id] = (director.runCounts[beat.id] ?? 0) + 1;
  director.cooldowns[beat.id] = state.time + Math.max(0, beat.cooldown);
  publishDirectorBeatEvent(state, beat, snapshot, effect.extra);
  recordTrace(director, snapshot, reason, 'selected', beat.id, rejectedTop?.id);
  return { fired: true, beatId: beat.id, reasonCode: 'selected' };
}

export function forceNextSamosborDirectorBeat(
  world: World,
  entities: Entity[],
  state: GameState,
  nextId: { v: number },
  variant: ActiveSamosborVariant | null,
): SamosborDirectorTickResult {
  const director = ensureSamosborDirectorState(state);
  resetCycleIfNeeded(director, state.samosborCount);
  const snapshot = buildSnapshot(world, entities, state, variant, 'debug_force');
  const beats = getSamosborBeatDefs();
  for (let i = 0; i < beats.length; i++) {
    const idx = (director.forceCursor + i) % beats.length;
    const beat = beats[idx];
    if (beat.phase !== snapshot.phase || !beat.floors.includes(snapshot.floor) || !beat.variants.includes(snapshot.variantId)) continue;
    const effect = applyBeat(beat, world, entities, state, nextId, snapshot);
    director.forceCursor = (idx + 1) % beats.length;
    if (!effect.ok) {
      recordTrace(director, snapshot, 'debug_force', 'effect_failed', beat.id);
      continue;
    }
    director.lastBeatId = beat.id;
    director.runCounts[beat.id] = (director.runCounts[beat.id] ?? 0) + 1;
    director.cooldowns[beat.id] = state.time + Math.max(0, beat.cooldown);
    publishDirectorBeatEvent(state, beat, snapshot, effect.extra);
    recordTrace(director, snapshot, 'debug_force', 'forced', beat.id);
    return { fired: true, beatId: beat.id, reasonCode: 'forced' };
  }
  recordTrace(director, snapshot, 'debug_force', 'no_matching_force_beat');
  return { fired: false, reasonCode: 'no_matching_force_beat' };
}

export function clearSamosborDirectorCooldowns(state: GameState): void {
  const director = ensureSamosborDirectorState(state);
  director.cooldowns = {};
  director.runCounts = {};
}

export function summarizeSamosborDirector(state: GameState): string[] {
  const director = ensureSamosborDirectorState(state);
  const activeCooldowns = Object.entries(director.cooldowns)
    .filter(([, until]) => until > state.time)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([id, until]) => `${id}:${Math.ceil(until - state.time)}s`);
  const lines = [
    `cycle=${director.cycle} last=${director.lastBeatId || 'none'} trace=${director.traceCount}/${TRACE_CAP}`,
    `cooldowns=${activeCooldowns.length > 0 ? activeCooldowns.join(', ') : 'none'}`,
  ];
  for (const t of getSamosborDirectorTrace(state, 5)) {
    lines.push(`${t.phase}/${t.reason}: ${t.chosenBeatId ?? '-'} ${t.reasonCode}`);
  }
  return lines;
}
