/* ── Bounded route cues: generated markers -> rare audio/HUD hints ─ */

import {
  EntityType, LiftDirection, msg, QuestType, RoomType,
  type Entity, type FloorLevel, type GameState, type Quest, type Room, type WorldEventSeverity,
} from '../core/types';
import { type World } from '../core/world';
import { playRouteCueTone, playSoundAt } from './audio';
import { publishEvent } from './events';
import { resolveFloorRunRoute } from './procedural_floors';
import { getSamosborShelterRoomIds } from './samosbor';

const MAX_MAP_REVEALS = 8;
const DEFAULT_REVEAL_TTL_SEC = 420;
const CARTOGRAPHER_DEBT_GIVER_ID = -43043;
const CARTOGRAPHER_DEBT_ID = 'cartographer_map_debt';
const emptyMapReveals: readonly RouteCueMapReveal[] = [];

const FLOOR_NAMES: Record<FloorLevel, string> = {
  0: 'Министерство',
  1: 'Квартиры',
  2: 'Жилая зона',
  3: 'Коллекторы',
  4: 'Мясной низ',
  5: 'Пустота',
};

export type RouteCueMapRevealKind = 'zone_danger' | 'route_floor_hint' | 'contract_target' | 'shelter_mark' | 'route_group';

export interface RouteCueGroup {
  id: string;
  lead: string;
  risk: string;
  decision: string;
  reward: string;
  mapLabel?: string;
  mapHint?: string;
  logLine?: string;
}

export interface PaidRouteReveal {
  priceRubles: number;
  debtRubles: number;
  debtLimitRubles?: number;
  ttlSec?: number;
  sellerName?: string;
  debtQuestId?: string;
  debtTargetHint?: string;
  kinds?: readonly RouteCueMapRevealKind[];
}

export interface RouteCueMarker {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  floor: FloorLevel;
  label: string;
  hint: string;
  targetName: string;
  color: string;
  tags: readonly string[];
  toneSeed: number;
  radius?: number;
  targetRadius?: number;
  cooldownSec?: number;
  roomId?: number;
  targetRoomId?: number;
  zoneId?: number;
  heardText?: string;
  followedText?: string;
  ignoredText?: string;
  paidReveal?: PaidRouteReveal;
  routeGroup?: RouteCueGroup;
  routeGroupRevealTtlSec?: number;
}

export interface RouteCueHud {
  id: string;
  floor: FloorLevel;
  label: string;
  hint: string;
  targetName: string;
  color: string;
  targetX: number;
  targetY: number;
  startedAt: number;
  expiresAt: number;
  routeGroup?: RouteCueGroup;
}

export interface RouteCueMapReveal {
  id: string;
  sourceId: string;
  kind: RouteCueMapRevealKind;
  floor: FloorLevel;
  label: string;
  hint: string;
  targetName: string;
  color: string;
  expiresAt: number;
  x?: number;
  y?: number;
  zoneId?: number;
  roomId?: number;
  dangerLevel?: number;
  paidRubles?: number;
  debtRubles?: number;
  routeGroup?: RouteCueGroup;
}

interface RouteCueWorldState {
  markers: RouteCueMarker[];
  mapReveals: RouteCueMapReveal[];
  nextScanAt: number;
  nextRevealCleanupAt: number;
  heardAt: Map<string, number>;
  lastPlayedAt: Map<string, number>;
  followed: Set<string>;
  ignored: Set<string>;
}

const cueByWorld = new WeakMap<World, RouteCueWorldState>();
let activeHud: RouteCueHud | null = null;
const emptyMarkers: readonly RouteCueMarker[] = [];

/* Cue lifetime is tied to one concrete World geometry. New story, design,
 * procedural and floor-instance worlds register their own markers during
 * generation. When samosbor rebuilds a floor in-place, the live World must
 * receive the replacement world's markers and drop all transient state because
 * old room ids, map reveals and heard/followed flags belong to vanished rooms. */
function emptyState(markers: RouteCueMarker[] = []): RouteCueWorldState {
  return {
    markers,
    mapReveals: [],
    nextScanAt: 0,
    nextRevealCleanupAt: 0,
    heardAt: new Map(),
    lastPlayedAt: new Map(),
    followed: new Set(),
    ignored: new Set(),
  };
}

function cueState(world: World): RouteCueWorldState {
  let state = cueByWorld.get(world);
  if (!state) {
    state = emptyState();
    cueByWorld.set(world, state);
  }
  return state;
}

function normalizedMarker(marker: RouteCueMarker): RouteCueMarker {
  return {
    ...marker,
    radius: marker.radius ?? 9,
    targetRadius: marker.targetRadius ?? 2.6,
    cooldownSec: marker.cooldownSec ?? 26,
  };
}

function cleanMapReveals(state: RouteCueWorldState, now: number): void {
  for (let i = state.mapReveals.length - 1; i >= 0; i--) {
    if (state.mapReveals[i].expiresAt <= now) state.mapReveals.splice(i, 1);
  }
  state.nextRevealCleanupAt = now + 2;
}

function hasFreshReveal(state: RouteCueWorldState, sourceId: string, now: number): boolean {
  for (const reveal of state.mapReveals) {
    if (reveal.sourceId === sourceId && reveal.expiresAt > now) return true;
  }
  return false;
}

function upsertMapReveal(state: RouteCueWorldState, reveal: RouteCueMapReveal): void {
  const existing = state.mapReveals.findIndex(r => r.id === reveal.id);
  if (existing >= 0) state.mapReveals[existing] = reveal;
  else state.mapReveals.push(reveal);
  while (state.mapReveals.length > MAX_MAP_REVEALS) state.mapReveals.shift();
}

export function getRouteCueMapReveals(world: World, state?: GameState): readonly RouteCueMapReveal[] {
  const cueWorld = cueByWorld.get(world);
  if (!cueWorld || cueWorld.mapReveals.length === 0) return emptyMapReveals;
  if (state && state.time >= cueWorld.nextRevealCleanupAt) cleanMapReveals(cueWorld, state.time);
  return cueWorld.mapReveals;
}

export function registerRouteCue(world: World, marker: RouteCueMarker): void {
  const state = cueState(world);
  const next = normalizedMarker(marker);
  const existing = state.markers.findIndex(m => m.id === next.id);
  if (existing >= 0) state.markers[existing] = next;
  else state.markers.push(next);
}

export function replaceRouteCueStateForRebuild(target: World, source?: World): void {
  const sourceState = source ? cueByWorld.get(source) : undefined;
  if (sourceState && sourceState.markers.length > 0) {
    cueByWorld.set(target, emptyState(sourceState.markers.map(marker => normalizedMarker(marker))));
  } else {
    cueByWorld.delete(target);
  }
  if (source && source !== target) cueByWorld.delete(source);
  activeHud = null;
}

export function pruneRouteCuesInCells(world: World, cells: readonly number[] | Set<number>): number {
  const state = cueByWorld.get(world);
  if (!state) return 0;
  const touched = cells instanceof Set ? cells : new Set(cells);
  if (touched.size === 0) return 0;
  const markerHitsCell = (marker: RouteCueMarker): boolean => {
    if (touched.has(world.idx(Math.floor(marker.x), Math.floor(marker.y)))) return true;
    if (touched.has(world.idx(Math.floor(marker.targetX), Math.floor(marker.targetY)))) return true;
    if (marker.roomId !== undefined && !world.rooms[marker.roomId]) return true;
    if (marker.targetRoomId !== undefined && !world.rooms[marker.targetRoomId]) return true;
    return false;
  };
  const revealHitsCell = (reveal: RouteCueMapReveal): boolean => {
    if (reveal.x !== undefined && reveal.y !== undefined && touched.has(world.idx(Math.floor(reveal.x), Math.floor(reveal.y)))) return true;
    if (reveal.roomId !== undefined && !world.rooms[reveal.roomId]) return true;
    return false;
  };
  const beforeMarkers = state.markers.length;
  const beforeReveals = state.mapReveals.length;
  state.markers = state.markers.filter(marker => !markerHitsCell(marker));
  state.mapReveals = state.mapReveals.filter(reveal => !revealHitsCell(reveal));
  const removed = beforeMarkers - state.markers.length + beforeReveals - state.mapReveals.length;
  if (removed > 0) {
    if (activeHud && !state.markers.some(marker => marker.id === activeHud?.id)) activeHud = null;
    for (const id of Array.from(state.heardAt.keys())) if (!state.markers.some(marker => marker.id === id)) state.heardAt.delete(id);
    for (const id of Array.from(state.lastPlayedAt.keys())) if (!state.markers.some(marker => marker.id === id)) state.lastPlayedAt.delete(id);
    for (const id of Array.from(state.followed.values())) if (!state.markers.some(marker => marker.id === id)) state.followed.delete(id);
    for (const id of Array.from(state.ignored.values())) if (!state.markers.some(marker => marker.id === id)) state.ignored.delete(id);
  }
  return removed;
}

export function routeCueCount(world: World): number {
  return cueByWorld.get(world)?.markers.length ?? 0;
}

export function getRouteCueMarkers(world: World): readonly RouteCueMarker[] {
  return cueByWorld.get(world)?.markers ?? emptyMarkers;
}

function protectedCellAt(world: World, x: number | undefined, y: number | undefined): boolean {
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  return world.aptMask[world.idx(Math.floor(x), Math.floor(y))] !== 0;
}

function protectedRoom(world: World, roomId: number | undefined): boolean {
  if (roomId === undefined) return true;
  const room = world.rooms[roomId];
  if (!room) return false;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (world.aptMask[world.idx(x, y)]) return true;
    }
  }
  return false;
}

function protectedRouteCueMarker(world: World, marker: RouteCueMarker): boolean {
  return protectedCellAt(world, marker.x, marker.y)
    && protectedCellAt(world, marker.targetX, marker.targetY)
    && protectedRoom(world, marker.roomId)
    && protectedRoom(world, marker.targetRoomId);
}

function protectedMapReveal(world: World, reveal: RouteCueMapReveal, keptMarkerIds: ReadonlySet<string>): boolean {
  if (!keptMarkerIds.has(reveal.sourceId)) return false;
  if (!protectedRoom(world, reveal.roomId)) return false;
  if (reveal.x !== undefined || reveal.y !== undefined) return protectedCellAt(world, reveal.x, reveal.y);
  return true;
}

export function pruneRouteCuesForVolatileRebuild(world: World, floor: FloorLevel): number {
  const state = cueByWorld.get(world);
  if (!state) return 0;

  const keptMarkers: RouteCueMarker[] = [];
  const keptMarkerIds = new Set<string>();
  const removedMarkerIds = new Set<string>();
  for (const marker of state.markers) {
    if (marker.floor !== floor || protectedRouteCueMarker(world, marker)) {
      keptMarkers.push(marker);
      keptMarkerIds.add(marker.id);
    } else {
      removedMarkerIds.add(marker.id);
    }
  }
  const removed = state.markers.length - keptMarkers.length;
  state.markers = keptMarkers;

  for (const id of removedMarkerIds) {
    state.heardAt.delete(id);
    state.lastPlayedAt.delete(id);
    state.followed.delete(id);
    state.ignored.delete(id);
  }
  for (let i = state.mapReveals.length - 1; i >= 0; i--) {
    const reveal = state.mapReveals[i];
    if (reveal.floor === floor && !protectedMapReveal(world, reveal, keptMarkerIds)) {
      state.mapReveals.splice(i, 1);
    }
  }
  if (activeHud?.floor === floor && !keptMarkerIds.has(activeHud.id)) activeHud = null;
  return removed;
}

function nearestMarker(world: World, player: Entity, requiredTag?: string): RouteCueMarker | undefined {
  const state = cueByWorld.get(world);
  if (!state || state.markers.length === 0) return undefined;
  let best: RouteCueMarker | undefined;
  let bestD2 = Infinity;
  for (const marker of state.markers) {
    if (requiredTag && !marker.tags.includes(requiredTag)) continue;
    const d2 = world.dist2(player.x, player.y, marker.x, marker.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = marker;
    }
  }
  return best;
}

function eventSeverity(action: string): WorldEventSeverity {
  return action === 'followed' ? 4 : 3;
}

function formatZ(z: number): string {
  return z > 0 ? `+${z}` : `${z}`;
}

function roomCenter(room: Room): { x: number; y: number } {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

function nearestRoomByType(world: World, player: Entity, type: RoomType): Room | undefined {
  let best: Room | undefined;
  let bestD2 = Infinity;
  let checked = 0;
  for (const room of world.rooms) {
    if (!room || room.type !== type) continue;
    checked++;
    const c = roomCenter(room);
    const d2 = world.dist2(player.x, player.y, c.x, c.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = room;
    }
    if (checked >= 384) break;
  }
  return best;
}

function nearestShelterRoom(world: World, player: Entity, state: GameState): Room | undefined {
  let best: Room | undefined;
  let bestD2 = Infinity;
  for (const id of getSamosborShelterRoomIds(state)) {
    const room = world.rooms[id];
    if (!room) continue;
    const c = roomCenter(room);
    const d2 = world.dist2(player.x, player.y, c.x, c.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = room;
    }
  }
  if (best) return best;

  let checked = 0;
  for (const room of world.rooms) {
    if (!room) continue;
    checked++;
    const name = room.name.toLowerCase();
    if (!name.includes('убежищ') && !name.includes('гермо')) {
      if (checked >= 384) break;
      continue;
    }
    const c = roomCenter(room);
    const d2 = world.dist2(player.x, player.y, c.x, c.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = room;
    }
    if (checked >= 384) break;
  }
  return best;
}

function nearestDangerZoneReveal(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  expiresAt: number,
  paidRubles?: number,
  debtRubles?: number,
): RouteCueMapReveal | undefined {
  let bestZone = -1;
  let bestScore = -Infinity;
  for (const zone of world.zones) {
    const level = zone.level ?? 1;
    const d2 = world.dist2(player.x, player.y, zone.cx, zone.cy);
    const score = level * 100000 - d2;
    if (score > bestScore) {
      bestScore = score;
      bestZone = zone.id;
    }
  }
  const zone = world.zones[bestZone];
  if (!zone) return undefined;
  const level = Math.max(1, Math.min(5, zone.level ?? 1));
  return {
    id: `${marker.id}:zone:${zone.id}`,
    sourceId: marker.id,
    kind: 'zone_danger',
    floor: state.currentFloor,
    x: zone.cx + 0.5,
    y: zone.cy + 0.5,
    zoneId: zone.id,
    dangerLevel: level,
    label: `зона ${zone.id + 1}: опасность ${level}/5`,
    hint: 'живая карта подсветила самый дорогой риск рядом с маршрутом',
    targetName: `зона ${zone.id + 1}`,
    color: level >= 4 ? '#f84' : level >= 3 ? '#fc4' : '#8cf',
    expiresAt,
    paidRubles,
    debtRubles,
  };
}

function activeQuestReveal(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  expiresAt: number,
  paidRubles?: number,
  debtRubles?: number,
): RouteCueMapReveal | undefined {
  let picked: Quest | undefined;
  for (const q of state.quests) {
    if (q.done || q.failed) continue;
    if (q.contractId || q.targetFloor !== undefined || q.targetHint) {
      picked = q;
      break;
    }
  }
  if (!picked) return undefined;

  const targetFloor = picked.targetFloor ?? picked.visitFloor ?? state.currentFloor;
  let room: Room | undefined;
  if (targetFloor === state.currentFloor) {
    if (picked.targetRoom !== undefined) room = world.rooms[picked.targetRoom];
    else if (picked.targetRoomType !== undefined) room = nearestRoomByType(world, player, picked.targetRoomType);
  }
  const c = room ? roomCenter(room) : undefined;
  const title = picked.contractId ? 'цель заказа' : 'цель задания';
  return {
    id: `${marker.id}:quest:${picked.id}`,
    sourceId: marker.id,
    kind: 'contract_target',
    floor: targetFloor,
    x: c?.x,
    y: c?.y,
    roomId: room?.id,
    label: `${title}: ${FLOOR_NAMES[targetFloor]}`,
    hint: picked.targetHint ?? picked.desc,
    targetName: picked.eventTargetName ?? picked.targetNpcName ?? picked.desc,
    color: '#fc4',
    expiresAt,
    paidRubles,
    debtRubles,
  };
}

function shelterReveal(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  expiresAt: number,
  paidRubles?: number,
  debtRubles?: number,
): RouteCueMapReveal | undefined {
  const room = nearestShelterRoom(world, player, state);
  if (!room) return undefined;
  const c = roomCenter(room);
  return {
    id: `${marker.id}:shelter:${room.id}`,
    sourceId: marker.id,
    kind: 'shelter_mark',
    floor: state.currentFloor,
    x: c.x,
    y: c.y,
    roomId: room.id,
    label: 'отметка убежища',
    hint: room.name,
    targetName: room.name,
    color: '#6ec3ff',
    expiresAt,
    paidRubles,
    debtRubles,
  };
}

function routeFloorReveal(
  state: GameState,
  marker: RouteCueMarker,
  expiresAt: number,
  paidRubles?: number,
  debtRubles?: number,
): RouteCueMapReveal | undefined {
  const down = resolveFloorRunRoute(state, LiftDirection.DOWN);
  const up = resolveFloorRunRoute(state, LiftDirection.UP);
  const entry = !up ? down : !down ? up : (down.spec?.danger ?? 0) >= (up.spec?.danger ?? 0) ? down : up;
  if (!entry) return undefined;
  const danger = entry.spec?.danger;
  return {
    id: `${marker.id}:floor:${entry.z}`,
    sourceId: marker.id,
    kind: 'route_floor_hint',
    floor: state.currentFloor,
    label: `лифт Z${formatZ(entry.z)}`,
    hint: danger !== undefined
      ? `${entry.label.replace(/^Этаж [^:]+: /, '')}: опасность ${danger}/5`
      : entry.label,
    targetName: entry.label,
    color: entry.color,
    dangerLevel: danger,
    expiresAt,
    paidRubles,
    debtRubles,
  };
}

function routeGroupReveal(
  marker: RouteCueMarker,
  expiresAt: number,
  paidRubles?: number,
  debtRubles?: number,
): RouteCueMapReveal | undefined {
  const group = marker.routeGroup;
  if (!group) return undefined;
  return {
    id: `${marker.id}:route_group`,
    sourceId: marker.id,
    kind: 'route_group',
    floor: marker.floor,
    x: marker.targetX,
    y: marker.targetY,
    roomId: marker.targetRoomId,
    label: group.mapLabel ?? marker.label,
    hint: group.mapHint ?? `${group.risk} / ${group.decision} / ${group.reward}`,
    targetName: marker.targetName,
    color: marker.color,
    expiresAt,
    paidRubles,
    debtRubles,
    routeGroup: group,
  };
}

function activeDebtQuest(state: GameState, debtQuestId: string): Quest | undefined {
  return state.quests.find(q => !q.done && q.sideQuestId === debtQuestId && q.targetItem === 'money');
}

function activeDebtRubles(state: GameState, debtQuestId: string): number {
  return state.quests.reduce((sum, q) => (
    !q.done && q.sideQuestId === debtQuestId && q.targetItem === 'money'
      ? sum + (q.targetCount ?? 0)
      : sum
  ), 0);
}

function upsertDebtQuest(state: GameState, marker: RouteCueMarker, debtRubles: number): number {
  const def = marker.paidReveal;
  const debtQuestId = def?.debtQuestId ?? CARTOGRAPHER_DEBT_ID;
  const sellerName = def?.sellerName ?? 'Картограф';
  const existing = activeDebtQuest(state, debtQuestId);
  const nextDebt = (existing?.targetCount ?? 0) + debtRubles;
  const desc = `${sellerName}: вернуть ${nextDebt}₽ за открытые отметки живой карты.`;
  if (existing) {
    existing.targetCount = nextDebt;
    existing.desc = desc;
    return nextDebt;
  }

  const quest: Quest = {
    id: state.nextQuestId++,
    type: QuestType.FETCH,
    giverId: CARTOGRAPHER_DEBT_GIVER_ID,
    giverName: sellerName,
    desc,
    targetItem: 'money',
    targetCount: nextDebt,
    targetFloor: marker.floor,
    targetRoomType: RoomType.OFFICE,
    targetZoneTag: 'cartographer_map_debt',
    targetHint: def?.debtTargetHint ?? 'Жилая зона: комната живой карты. Долг закрывается рублями, когда они появятся.',
    relationDelta: 0,
    sideQuestId: debtQuestId,
    eventTags: ['cartographer_map', 'debt', 'route_cue'],
    eventSeverity: 3,
    eventTargetName: 'Долг за живую карту',
    done: false,
  };
  state.quests.push(quest);
  publishEvent(state, {
    type: 'quest_created',
    actorId: quest.giverId,
    actorName: sellerName,
    targetName: quest.eventTargetName,
    severity: 3,
    privacy: 'local',
    tags: ['quest', 'created', 'cartographer_map', 'debt', 'route_cue'],
    data: {
      questId: quest.id,
      cueId: marker.id,
      debtRubles: nextDebt,
      targetItem: 'money',
      targetCount: nextDebt,
    },
  });
  return nextDebt;
}

function buildPaidMapReveals(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  paidRubles?: number,
  debtRubles?: number,
): RouteCueMapReveal[] {
  const def = marker.paidReveal;
  const expiresAt = state.time + (def?.ttlSec ?? DEFAULT_REVEAL_TTL_SEC);
  const kinds = def?.kinds ?? ['contract_target', 'route_floor_hint', 'shelter_mark', 'zone_danger'];
  const out: RouteCueMapReveal[] = [];
  for (const kind of kinds) {
    const reveal =
      kind === 'contract_target' ? activeQuestReveal(world, player, state, marker, expiresAt, paidRubles, debtRubles)
      : kind === 'route_floor_hint' ? routeFloorReveal(state, marker, expiresAt, paidRubles, debtRubles)
      : kind === 'shelter_mark' ? shelterReveal(world, player, state, marker, expiresAt, paidRubles, debtRubles)
      : kind === 'route_group' ? routeGroupReveal(marker, expiresAt, paidRubles, debtRubles)
      : nearestDangerZoneReveal(world, player, state, marker, expiresAt, paidRubles, debtRubles);
    if (reveal) out.push(reveal);
  }
  return out;
}

function publishCueEvent(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  action: 'heard' | 'inspected' | 'followed' | 'ignored' | 'debug',
): void {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const ci = world.idx(px, py);
  publishEvent(state, {
    type: 'rumor_observed',
    floor: marker.floor,
    zoneId: marker.zoneId ?? world.zoneMap[ci],
    roomId: action === 'followed' ? marker.targetRoomId : marker.roomId,
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    targetName: marker.targetName,
    severity: eventSeverity(action),
    privacy: player.type === EntityType.PLAYER ? 'local' : 'private',
    tags: ['route_cue', action, ...marker.tags],
    data: {
      cueId: marker.id,
      action,
      label: marker.label,
      hint: marker.hint,
      targetName: marker.targetName,
      routeGroup: marker.routeGroup,
      logLine: marker.routeGroup?.logLine,
      targetX: Math.round(marker.targetX),
      targetY: Math.round(marker.targetY),
      distanceCells: Math.round(world.dist(player.x, player.y, marker.targetX, marker.targetY)),
    },
  });
}

function triggerPaidReveal(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
): void {
  const def = marker.paidReveal;
  if (!def) return;
  const cueWorld = cueState(world);
  if (state.time >= cueWorld.nextRevealCleanupAt) cleanMapReveals(cueWorld, state.time);

  if (hasFreshReveal(cueWorld, marker.id, state.time)) {
    state.msgs.push(msg('Живая карта уже держит оплаченные отметки. Откройте [M].', state.time, marker.color));
    setCueHud(state, marker);
    return;
  }

  let paidRubles: number | undefined;
  let debtRubles: number | undefined;
  const cash = player.money ?? 0;
  if (cash >= def.priceRubles) {
    paidRubles = def.priceRubles;
    player.money = cash - def.priceRubles;
    publishEvent(state, {
      type: 'player_use_item',
      floor: marker.floor,
      x: marker.x,
      y: marker.y,
      actorId: player.id,
      actorName: player.name ?? 'Вы',
      actorFaction: player.faction,
      targetName: def.sellerName ?? marker.targetName,
      itemName: 'живая карта',
      itemValue: paidRubles,
      severity: 3,
      privacy: 'private',
      tags: ['route_cue', 'cartographer_map', 'paid', 'map_reveal'],
      data: { cueId: marker.id, paidRubles },
    });
  } else {
    const debtQuestId = def.debtQuestId ?? CARTOGRAPHER_DEBT_ID;
    const limit = def.debtLimitRubles ?? def.debtRubles * 3;
    const currentDebt = activeDebtRubles(state, debtQuestId);
    if (currentDebt + def.debtRubles > limit) {
      state.msgs.push(msg('Сева закрывает карту: сначала погасите старый долг.', state.time, '#f84'));
      publishEvent(state, {
        type: 'rumor_observed',
        floor: marker.floor,
        x: marker.x,
        y: marker.y,
        actorId: player.id,
        actorName: player.name ?? 'Вы',
        actorFaction: player.faction,
        targetName: marker.targetName,
        severity: 2,
        privacy: 'private',
        tags: ['route_cue', 'cartographer_map', 'debt_blocked'],
        data: { cueId: marker.id, currentDebt, debtLimitRubles: limit },
      });
      return;
    }
    debtRubles = def.debtRubles;
    const totalDebt = upsertDebtQuest(state, marker, debtRubles);
    state.msgs.push(msg(`Сева записал долг ${debtRubles}₽. Всего по карте: ${totalDebt}₽.`, state.time, '#f8a'));
  }

  const reveals = buildPaidMapReveals(world, player, state, marker, paidRubles, debtRubles);
  for (const reveal of reveals) upsertMapReveal(cueWorld, reveal);
  const last = cueWorld.lastPlayedAt.get(marker.id) ?? -Infinity;
  if (state.time - last >= (marker.cooldownSec ?? 26)) {
    cueWorld.lastPlayedAt.set(marker.id, state.time);
    playSoundAt(() => playRouteCueTone(marker.toneSeed, 1.1), marker.x, marker.y);
  }
  setCueHud(state, marker);
  state.msgs.push(msg(
    paidRubles !== undefined
      ? `Живая карта взяла ${paidRubles}₽ и раскрыла ${reveals.length} отметки.`
      : `Живая карта раскрыла ${reveals.length} отметки под долг.`,
    state.time,
    marker.color,
  ));
  publishEvent(state, {
    type: 'rumor_observed',
    floor: marker.floor,
    zoneId: marker.zoneId,
    roomId: marker.roomId,
    x: marker.x,
    y: marker.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    targetName: marker.targetName,
    severity: 3,
    privacy: 'private',
    tags: ['route_cue', 'cartographer_map', 'map_reveal', paidRubles !== undefined ? 'paid' : 'debt'],
    data: {
      cueId: marker.id,
      paidRubles,
      debtRubles,
      revealCount: reveals.length,
      revealKinds: reveals.map(r => r.kind),
    },
  });
}

function cueMessage(marker: RouteCueMarker, action: string): string {
  const group = marker.routeGroup;
  if (action === 'followed') return marker.followedText ?? (group
    ? `${group.reward} Цель маршрута: ${marker.targetName}.`
    : `Метка вывела к цели: ${marker.targetName}. Проверьте отход перед лутом.`);
  if (action === 'ignored') return marker.ignoredText ?? (group
    ? `Маршрут отложен: ${group.lead} Риск остался: ${group.risk}`
    : `Метка осталась за спиной: ${marker.targetName} не проверена.`);
  if (group) return marker.heardText ?? `${group.lead} Риск: ${group.risk} Решение: ${group.decision} Награда: ${group.reward}`;
  return marker.heardText ?? `Меловая стрелка и шум стены дают маршрут: ${marker.hint}`;
}

function setCueHud(state: GameState, marker: RouteCueMarker): void {
  activeHud = {
    id: marker.id,
    floor: marker.floor,
    label: marker.label,
    hint: marker.hint,
    targetName: marker.targetName,
    color: marker.color,
    targetX: marker.targetX,
    targetY: marker.targetY,
    startedAt: state.time,
    expiresAt: state.time + 7,
    routeGroup: marker.routeGroup,
  };
}

function triggerCue(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  action: 'heard' | 'inspected' | 'followed' | 'ignored' | 'debug',
  forceSound: boolean,
): void {
  const cueWorld = cueState(world);
  const now = state.time;
  if (action === 'heard' || action === 'inspected' || action === 'debug') {
    cueWorld.heardAt.set(marker.id, now);
    const last = cueWorld.lastPlayedAt.get(marker.id) ?? -Infinity;
    if (forceSound || now - last >= (marker.cooldownSec ?? 26)) {
      cueWorld.lastPlayedAt.set(marker.id, now);
      playSoundAt(() => playRouteCueTone(marker.toneSeed, action === 'debug' ? 1.15 : 1), marker.x, marker.y);
    }
    setCueHud(state, marker);
    const reveal = routeGroupReveal(marker, now + (marker.routeGroupRevealTtlSec ?? DEFAULT_REVEAL_TTL_SEC));
    if (reveal) upsertMapReveal(cueWorld, reveal);
  }

  if (action === 'followed') cueWorld.followed.add(marker.id);
  if (action === 'ignored') cueWorld.ignored.add(marker.id);

  state.msgs.push(msg(cueMessage(marker, action), now, action === 'ignored' ? '#888' : marker.color));
  publishCueEvent(world, player, state, marker, action);
}

export function updateRouteCues(world: World, player: Entity, state: GameState): void {
  const cueWorld = cueByWorld.get(world);
  if (!cueWorld || cueWorld.markers.length === 0) return;
  if (state.time < cueWorld.nextScanAt) return;
  cueWorld.nextScanAt = state.time + 0.45;

  for (const marker of cueWorld.markers) {
    const heardAt = cueWorld.heardAt.get(marker.id);
    if (heardAt !== undefined && !cueWorld.followed.has(marker.id)) {
      const targetRadius = marker.targetRadius ?? 2.6;
      if (world.dist2(player.x, player.y, marker.targetX, marker.targetY) <= targetRadius * targetRadius) {
        triggerCue(world, player, state, marker, 'followed', false);
        continue;
      }
      const radius = marker.radius ?? 9;
      if (!cueWorld.ignored.has(marker.id) && state.time - heardAt > 32 &&
          world.dist2(player.x, player.y, marker.x, marker.y) > (radius + 18) * (radius + 18)) {
        triggerCue(world, player, state, marker, 'ignored', false);
        continue;
      }
    }

    const radius = marker.radius ?? 9;
    if (world.dist2(player.x, player.y, marker.x, marker.y) > radius * radius) continue;
    const last = cueWorld.lastPlayedAt.get(marker.id) ?? -Infinity;
    if (state.time - last >= (marker.cooldownSec ?? 26)) {
      triggerCue(world, player, state, marker, 'heard', false);
      break;
    }
  }
}

function markerAtLook(
  world: World,
  player: Entity,
  lookX: number,
  lookY: number,
): RouteCueMarker | undefined {
  const cueWorld = cueByWorld.get(world);
  if (!cueWorld || cueWorld.markers.length === 0) return undefined;
  const lx = Math.floor(lookX) + 0.5;
  const ly = Math.floor(lookY) + 0.5;
  for (const marker of cueWorld.markers) {
    if (world.dist2(lx, ly, marker.x, marker.y) > 2.25) continue;
    if (world.dist2(player.x, player.y, marker.x, marker.y) > 12.25) continue;
    return marker;
  }
  return undefined;
}

export function isRouteCueTarget(world: World, player: Entity, lookX: number, lookY: number): boolean {
  return markerAtLook(world, player, lookX, lookY) !== undefined;
}

export function tryUseRouteCue(
  world: World,
  player: Entity,
  state: GameState,
  lookX: number,
  lookY: number,
): boolean {
  const marker = markerAtLook(world, player, lookX, lookY);
  if (!marker) return false;
  if (marker.paidReveal) {
    triggerPaidReveal(world, player, state, marker);
    return true;
  }
  triggerCue(world, player, state, marker, 'inspected', true);
  return true;
}

export function debugTriggerRouteCue(world: World, player: Entity, state: GameState, requiredTag?: string): string[] {
  const marker = nearestMarker(world, player, requiredTag);
  if (!marker) {
    playSoundAt(() => playRouteCueTone(75075, 1.15), player.x, player.y);
    activeHud = {
      id: 'debug_route_cue',
      floor: state.currentFloor,
      label: 'DEBUG route cue',
      hint: 'local audio/HUD smoke',
      targetName: 'debug marker',
      color: '#9f7',
      targetX: player.x + Math.cos(player.angle) * 8,
      targetY: player.y + Math.sin(player.angle) * 8,
      startedAt: state.time,
      expiresAt: state.time + 5,
    };
    publishEvent(state, {
      type: 'rumor_observed',
      x: player.x,
      y: player.y,
      actorId: player.id,
      actorName: player.name ?? 'Вы',
      actorFaction: player.faction,
      targetName: 'debug route cue',
      severity: 2,
      privacy: 'private',
      tags: ['route_cue', 'debug', 'audio_smoke'],
      data: { cueId: 'debug_route_cue', action: 'debug_no_marker' },
    });
    return [requiredTag
      ? `no registered route cue with tag "${requiredTag}"; played local route-cue smoke`
      : 'no registered route cue; played local route-cue smoke'];
  }

  triggerCue(world, player, state, marker, 'debug', true);
  return [
    `${marker.id}: ${Math.round(world.dist(player.x, player.y, marker.x, marker.y))} cells to cue`,
    `target: ${marker.targetName}, ${Math.round(world.dist(player.x, player.y, marker.targetX, marker.targetY))} cells`,
    marker.routeGroup ? `decision: ${marker.routeGroup.decision}` : '',
    marker.routeGroup ? `reward: ${marker.routeGroup.reward}` : '',
  ].filter(Boolean);
}

export function getActiveRouteCueHud(time: number, floor: FloorLevel): RouteCueHud | null {
  if (!activeHud || activeHud.expiresAt < time || activeHud.floor !== floor) return null;
  return activeHud;
}
