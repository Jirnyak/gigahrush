/* ── Structured world event store: fixed-size ring buffers ────── */

import {
  WORLD_EVENT_IMPORTANT_CAPACITY,
  WORLD_EVENT_RECENT_CAPACITY,
  WORLD_EVENT_ZONE_CAPACITY,
  WORLD_EVENT_ZONE_COUNT,
  type EventFilter,
  type GameState,
  type WorldEvent,
  type WorldEventBuffer,
  type WorldEventDraft,
  type WorldEventSeverity,
  type WorldEventState,
  type WorldEventType,
  type FloorLevel,
} from '../core/types';
import { getMonsterEcology, monsterEcologyEventData, monsterEcologyTags } from '../data/monster_ecology';
import { recordWorldLogEvent } from './world_log';
import { recordRumorEvent } from './rumor';

const MAX_EVENT_TAGS = 8;
const MAX_EVENT_TAG_LEN = 32;
const MAX_EVENT_DATA_KEYS = 12;
const MAX_EVENT_DATA_KEY_LEN = 32;
const MAX_EVENT_DATA_STRING_LEN = 96;
const MAX_EVENT_DATA_ARRAY = 8;
const MAX_EVENT_DATA_DEPTH = 2;

export interface EventZoneSummary {
  floor: FloorLevel;
  zoneId: number;
  count: number;
  maxSeverity: WorldEventSeverity;
  lastId: number;
  lastType: WorldEventType;
}

export type WorldEventObserver = (state: GameState, event: WorldEvent) => void;

const eventObservers: WorldEventObserver[] = [];

export function registerWorldEventObserver(observer: WorldEventObserver): void {
  if (!eventObservers.includes(observer)) eventObservers.push(observer);
}

function createBuffer(capacity: number): WorldEventBuffer {
  return { capacity, start: 0, count: 0, items: new Array<WorldEvent | null>(capacity).fill(null) };
}

function cloneBuffer(buffer: WorldEventBuffer, capacity: number): WorldEventBuffer {
  const out = createBuffer(capacity);
  for (const event of readBuffer(buffer, capacity)) pushBuffer(out, normalizeEvent(event, out.count + 1));
  return out;
}

function pushBuffer(buffer: WorldEventBuffer, event: WorldEvent): void {
  if (buffer.capacity <= 0) return;
  if (buffer.items.length !== buffer.capacity) buffer.items.length = buffer.capacity;
  if (buffer.count < buffer.capacity) {
    buffer.items[(buffer.start + buffer.count) % buffer.capacity] = event;
    buffer.count++;
  } else {
    buffer.items[buffer.start] = event;
    buffer.start = (buffer.start + 1) % buffer.capacity;
  }
}

function readBuffer(buffer: WorldEventBuffer, limit = buffer.count): WorldEvent[] {
  const out: WorldEvent[] = [];
  const total = Math.min(buffer.count, limit);
  for (let i = 0; i < total; i++) {
    const idx = (buffer.start + buffer.count - 1 - i + buffer.capacity) % buffer.capacity;
    const event = buffer.items[idx];
    if (event) out.push(event);
  }
  return out;
}

function cleanTags(tags: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    if (out.length >= MAX_EVENT_TAGS) break;
    const tag = String(raw).slice(0, MAX_EVENT_TAG_LEN);
    if (tag.length > 0 && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function compactDataValue(value: unknown, depth: number): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, MAX_EVENT_DATA_STRING_LEN);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (depth >= MAX_EVENT_DATA_DEPTH) return `[${Math.min(value.length, MAX_EVENT_DATA_ARRAY)}]`;
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_EVENT_DATA_ARRAY)) {
      const compact = compactDataValue(item, depth + 1);
      if (compact !== undefined) out.push(compact);
    }
    return out;
  }
  if (typeof value === 'object') {
    if (depth >= MAX_EVENT_DATA_DEPTH) return '[object]';
    const out: Record<string, unknown> = {};
    let used = 0;
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
      if (used >= MAX_EVENT_DATA_KEYS) break;
      const key = rawKey.slice(0, MAX_EVENT_DATA_KEY_LEN);
      const compact = compactDataValue(rawValue, depth + 1);
      if (key.length > 0 && compact !== undefined) {
        out[key] = compact;
        used++;
      }
    }
    return out;
  }
  return undefined;
}

function compactEventData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const compact = compactDataValue(data, 0);
  if (!compact || typeof compact !== 'object' || Array.isArray(compact)) return undefined;
  return Object.keys(compact).length > 0 ? compact as Record<string, unknown> : undefined;
}

function clampSeverity(value: unknown): WorldEventSeverity {
  const n = Math.max(0, Math.min(5, Math.floor(Number(value) || 0)));
  return n as WorldEventSeverity;
}

function normalizeEvent(event: WorldEvent, fallbackId: number): WorldEvent {
  return {
    ...event,
    id: Math.max(1, Math.floor(Number(event.id) || fallbackId)),
    time: Number.isFinite(event.time) ? event.time : 0,
    day: Number.isFinite(event.day) ? event.day : 0,
    hour: Number.isFinite(event.hour) ? event.hour : 0,
    minute: Number.isFinite(event.minute) ? event.minute : 0,
    floor: Number.isFinite(event.floor) ? event.floor : 0,
    truth: 'fact',
    severity: clampSeverity(event.severity),
    privacy: event.privacy ?? 'local',
    tags: cleanTags(event.tags),
    data: compactEventData(event.data),
  };
}

export function createWorldEventState(): WorldEventState {
  const zoneEvents: WorldEventBuffer[] = [];
  for (let i = 0; i < WORLD_EVENT_ZONE_COUNT; i++) zoneEvents.push(createBuffer(WORLD_EVENT_ZONE_CAPACITY));
  return {
    nextId: 1,
    recentEvents: createBuffer(WORLD_EVENT_RECENT_CAPACITY),
    importantEvents: createBuffer(WORLD_EVENT_IMPORTANT_CAPACITY),
    zoneEvents,
    facts: [],
    nextFactId: 1,
    lastLogKey: '',
    lastLogTime: -Infinity,
  };
}

export function normalizeWorldEventState(input?: Partial<WorldEventState> | null): WorldEventState {
  if (!input) return createWorldEventState();
  const state = createWorldEventState();
  state.nextId = Math.max(1, input.nextId ?? 1);
  if (input.recentEvents) state.recentEvents = cloneBuffer(input.recentEvents, WORLD_EVENT_RECENT_CAPACITY);
  if (input.importantEvents) state.importantEvents = cloneBuffer(input.importantEvents, WORLD_EVENT_IMPORTANT_CAPACITY);
  if (input.zoneEvents) {
    for (let i = 0; i < WORLD_EVENT_ZONE_COUNT; i++) {
      if (input.zoneEvents[i]) state.zoneEvents[i] = cloneBuffer(input.zoneEvents[i], WORLD_EVENT_ZONE_CAPACITY);
    }
  }
  state.facts = (input.facts ?? []).slice(-WORLD_EVENT_IMPORTANT_CAPACITY);
  state.nextFactId = Math.max(1, input.nextFactId ?? 1);
  state.lastLogKey = input.lastLogKey ?? '';
  state.lastLogTime = input.lastLogTime ?? -Infinity;
  return state;
}

export function ensureWorldEventState(state: GameState): WorldEventState {
  if (!state.worldEvents) state.worldEvents = createWorldEventState();
  return state.worldEvents;
}

function matchesFilter(event: WorldEvent, filter: EventFilter): boolean {
  if (filter.type !== undefined && event.type !== filter.type) return false;
  if (filter.zoneId !== undefined && event.zoneId !== filter.zoneId) return false;
  if (filter.floor !== undefined && event.floor !== filter.floor) return false;
  if (filter.minSeverity !== undefined && event.severity < filter.minSeverity) return false;
  if (filter.privacy !== undefined && event.privacy !== filter.privacy) return false;
  if (filter.actorId !== undefined && event.actorId !== filter.actorId) return false;
  if (filter.targetId !== undefined && event.targetId !== filter.targetId) return false;
  if (filter.sinceId !== undefined && event.id <= filter.sinceId) return false;
  if (filter.tags && !filter.tags.every(t => event.tags.includes(t))) return false;
  return true;
}

function enrichMonsterKillDraft(draft: WorldEventDraft): WorldEventDraft {
  if (draft.monsterKind === undefined) return draft;
  if (draft.type !== 'player_kill_monster' && draft.type !== 'npc_kill_monster') return draft;
  const ecology = getMonsterEcology(draft.monsterKind);
  const data = monsterEcologyEventData(draft.monsterKind);
  if (!ecology || !data) return draft;

  const tags = [...draft.tags];
  for (const tag of monsterEcologyTags(draft.monsterKind)) {
    if (!tags.includes(tag)) tags.push(tag);
  }

  return {
    ...draft,
    severity: ecology.rare ? clampSeverity(Math.max(draft.severity, 4)) : draft.severity,
    tags,
    data: { ...draft.data, ...data },
  };
}

export function publishEvent(state: GameState, draft: WorldEventDraft): WorldEvent {
  const enriched = enrichMonsterKillDraft(draft);
  const store = ensureWorldEventState(state);
  const event: WorldEvent = {
    ...enriched,
    id: store.nextId++,
    time: enriched.time ?? state.time,
    day: enriched.day ?? Math.floor(state.clock.totalMinutes / 1440),
    hour: enriched.hour ?? state.clock.hour,
    minute: enriched.minute ?? state.clock.minute,
    floor: enriched.floor ?? state.currentFloor,
    truth: 'fact',
    severity: clampSeverity(enriched.severity),
    tags: cleanTags(enriched.tags),
    data: compactEventData(enriched.data),
  };

  pushBuffer(store.recentEvents, event);
  if (event.severity >= 4) pushBuffer(store.importantEvents, event);
  if (event.zoneId !== undefined && event.zoneId >= 0 && event.zoneId < store.zoneEvents.length) {
    pushBuffer(store.zoneEvents[event.zoneId], event);
  }
  recordWorldLogEvent(state, event);
  recordRumorEvent(event);
  for (const observer of eventObservers) observer(state, event);
  return event;
}

export function getRecentEvents(state: GameState, filter: EventFilter = {}): WorldEvent[] {
  const store = ensureWorldEventState(state);
  const limit = filter.limit ?? store.recentEvents.count;
  const out: WorldEvent[] = [];
  for (const event of readBuffer(store.recentEvents)) {
    if (!matchesFilter(event, filter)) continue;
    out.push(event);
    if (out.length >= limit) break;
  }
  return out;
}

export function getZoneEvents(state: GameState, zoneId: number, filter: EventFilter = {}): WorldEvent[] {
  const store = ensureWorldEventState(state);
  const buffer = store.zoneEvents[zoneId];
  if (!buffer) return [];
  const limit = filter.limit ?? buffer.count;
  const out: WorldEvent[] = [];
  for (const event of readBuffer(buffer)) {
    if (!matchesFilter(event, { ...filter, zoneId })) continue;
    out.push(event);
    if (out.length >= limit) break;
  }
  return out;
}

export function getImportantEvents(state: GameState, limit = 10): WorldEvent[] {
  const store = ensureWorldEventState(state);
  return readBuffer(store.importantEvents, limit);
}

export function summarizeImportantEventsByFloorZone(state: GameState, limit = 12): EventZoneSummary[] {
  const store = ensureWorldEventState(state);
  const byZone = new Map<string, EventZoneSummary>();
  for (const event of readBuffer(store.importantEvents)) {
    const zoneId = event.zoneId ?? -1;
    const key = `${event.floor}:${zoneId}`;
    let row = byZone.get(key);
    if (!row) {
      row = {
        floor: event.floor,
        zoneId,
        count: 0,
        maxSeverity: 0,
        lastId: event.id,
        lastType: event.type,
      };
      byZone.set(key, row);
    }
    row.count++;
    if (event.severity > row.maxSeverity) row.maxSeverity = event.severity;
    if (event.id >= row.lastId) {
      row.lastId = event.id;
      row.lastType = event.type;
    }
  }
  return [...byZone.values()].sort((a, b) => b.lastId - a.lastId).slice(0, limit);
}

export function trimEventHistoryForSave(state: GameState): WorldEventState {
  return normalizeWorldEventState(ensureWorldEventState(state));
}
