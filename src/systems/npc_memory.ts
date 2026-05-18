/* ── Bounded module-level NPC memory store ────────────────────── */

import { type Entity, type FloorLevel, type MonsterKind } from '../core/types';

export interface NpcMemory {
  entityId: number;
  lastSeenPlayerAt: number;
  helpedByPlayer: number;
  hurtByPlayer: number;
  knownRumorIds: string[];
  fear: number;
  trustPlayer: number;
  lastSpokeAt: number;
  lastRumorAt: number;
  lastContextAt: number;
  lastBarkAt: number;
  lastMemoryTickMinute: number;
  lastRumorEventId: number;
  lastEventRumorId: string;
  lastEventRumorAt: number;
  lastTouchedAt: number;
}

export interface RecentRumorLead {
  rumorId: string;
  text: string;
  heardAt: number;
  expiresAt: number;
  floor?: FloorLevel;
  roomName?: string;
  itemId?: string;
  monsterKind?: MonsterKind;
}

const MAX_NPC_MEMORIES = 1536;
const MAX_RUMORS_PER_NPC = 12;
const MEMORY_TICK_MINUTES = 4;
const RECENT_RUMOR_LEAD_TTL_S = 360;

const memories = new Map<number, NpcMemory>();
let recentRumorLead: RecentRumorLead | undefined;

export function rememberRecentRumorLead(input: Omit<RecentRumorLead, 'expiresAt'>): void {
  recentRumorLead = {
    ...input,
    expiresAt: input.heardAt + RECENT_RUMOR_LEAD_TTL_S,
  };
}

export function getRecentRumorLead(now: number): RecentRumorLead | undefined {
  if (!recentRumorLead) return undefined;
  if (now > recentRumorLead.expiresAt) {
    recentRumorLead = undefined;
    return undefined;
  }
  return recentRumorLead;
}

export function getNpcMemory(npc: Entity, now = 0): NpcMemory {
  let memory = memories.get(npc.id);
  if (!memory) {
    memory = {
      entityId: npc.id,
      lastSeenPlayerAt: -Infinity,
      helpedByPlayer: 0,
      hurtByPlayer: 0,
      knownRumorIds: [],
      fear: 0,
      trustPlayer: 0,
      lastSpokeAt: -Infinity,
      lastRumorAt: -Infinity,
      lastContextAt: -Infinity,
      lastBarkAt: -Infinity,
      lastMemoryTickMinute: -999999,
      lastRumorEventId: -1,
      lastEventRumorId: '',
      lastEventRumorAt: -Infinity,
      lastTouchedAt: now,
    };
    memories.set(npc.id, memory);
    pruneMemoryStore();
  }
  memory.lastTouchedAt = now;
  return memory;
}

export function markNpcSpokenTo(npc: Entity, now: number): NpcMemory {
  const memory = getNpcMemory(npc, now);
  memory.lastSpokeAt = now;
  memory.lastSeenPlayerAt = now;
  return memory;
}

export function notePlayerHelped(npc: Entity, now: number, amount = 1): void {
  const memory = getNpcMemory(npc, now);
  memory.helpedByPlayer = Math.min(999, memory.helpedByPlayer + amount);
  memory.trustPlayer = clamp(memory.trustPlayer + 8 * amount, -100, 100);
  memory.fear = Math.max(0, memory.fear - 3 * amount);
}

export function notePlayerHurt(npc: Entity, now: number, amount = 1): void {
  const memory = getNpcMemory(npc, now);
  memory.hurtByPlayer = Math.min(999, memory.hurtByPlayer + amount);
  memory.trustPlayer = clamp(memory.trustPlayer - 18 * amount, -100, 100);
  memory.fear = clamp(memory.fear + 15 * amount, 0, 100);
}

export function notePlayerTheftWitnessed(npc: Entity, now: number, amount = 1): void {
  const memory = getNpcMemory(npc, now);
  memory.hurtByPlayer = Math.min(999, memory.hurtByPlayer + amount);
  memory.trustPlayer = clamp(memory.trustPlayer - 14 * amount, -100, 100);
  memory.fear = clamp(memory.fear + 10 * amount, 0, 100);
  memory.lastSeenPlayerAt = now;
}

export function rememberRumor(npc: Entity, rumorId: string, now: number): boolean {
  return storeRumor(npc, rumorId, now, true);
}

export function learnRumor(npc: Entity, rumorId: string, now: number): boolean {
  return storeRumor(npc, rumorId, now, false);
}

export function flagEventRumor(npc: Entity, rumorId: string, eventId: number, now: number): boolean {
  const memory = getNpcMemory(npc, now);
  if (eventId <= memory.lastRumorEventId) return false;
  memory.lastRumorEventId = eventId;
  memory.lastEventRumorId = rumorId;
  memory.lastEventRumorAt = now;
  return learnRumor(npc, rumorId, now);
}

function storeRumor(npc: Entity, rumorId: string, now: number, markSpoken: boolean): boolean {
  const memory = getNpcMemory(npc, now);
  if (memory.knownRumorIds.includes(rumorId)) return false;
  memory.knownRumorIds.push(rumorId);
  if (memory.knownRumorIds.length > MAX_RUMORS_PER_NPC) {
    memory.knownRumorIds.splice(0, memory.knownRumorIds.length - MAX_RUMORS_PER_NPC);
  }
  if (markSpoken) memory.lastRumorAt = now;
  return true;
}

export function trimNpcMemory(npc: Entity, now: number): void {
  const memory = getNpcMemory(npc, now);
  if (memory.knownRumorIds.length > MAX_RUMORS_PER_NPC) {
    memory.knownRumorIds.splice(0, memory.knownRumorIds.length - MAX_RUMORS_PER_NPC);
  }
  memory.fear = clamp(memory.fear - 1, 0, 100);
  if (memory.trustPlayer > 0) memory.trustPlayer--;
  else if (memory.trustPlayer < 0) memory.trustPlayer++;
}

export function tickNpcMemoryLowFrequency(npc: Entity, now: number, totalMinutes: number, samosborActive: boolean): boolean {
  const memory = getNpcMemory(npc, now);
  const stagger = npc.id % MEMORY_TICK_MINUTES;
  if (totalMinutes - memory.lastMemoryTickMinute < MEMORY_TICK_MINUTES) return false;
  if ((totalMinutes | 0) % MEMORY_TICK_MINUTES !== stagger) return false;

  memory.lastMemoryTickMinute = totalMinutes;
  if (samosborActive) memory.fear = clamp(memory.fear + 4, 0, 100);
  if (npc.hp !== undefined && npc.maxHp !== undefined && npc.hp < npc.maxHp * 0.5) {
    memory.fear = clamp(memory.fear + 3, 0, 100);
  }
  trimNpcMemory(npc, now);
  return true;
}

export function getNpcMemoryCount(): number {
  return memories.size;
}

function pruneMemoryStore(): void {
  if (memories.size <= MAX_NPC_MEMORIES) return;
  let oldestId = -1;
  let oldestTouch = Infinity;
  for (const [id, memory] of memories) {
    if (memory.lastTouchedAt < oldestTouch) {
      oldestTouch = memory.lastTouchedAt;
      oldestId = id;
    }
  }
  if (oldestId >= 0) memories.delete(oldestId);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
