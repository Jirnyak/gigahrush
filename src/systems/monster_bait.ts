/* ── Bounded food/govnyak bait markers for small monsters ─────── */

import {
  EntityType,
  ItemType,
  type Entity,
  type FloorLevel,
  type GameState,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS } from '../data/items';
import { isBaitAttractedMonster } from '../data/monster_ecology';
import { publishEvent } from './events';

export type MonsterBaitKind = 'food' | 'govnyak';
export type MonsterBaitSource = 'drop' | 'use';

export interface MonsterBaitMarker {
  id: number;
  x: number;
  y: number;
  floor: FloorLevel;
  itemId: string;
  itemName: string;
  itemCount: number;
  kind: MonsterBaitKind;
  source: MonsterBaitSource;
  placedById?: number;
  entityId?: number;
  zoneId?: number;
  roomId?: number;
  radius: number;
  expiresAt: number;
  attractedCount: number;
  maxAttractions: number;
}

export const MONSTER_BAIT_MAX_ACTIVE = 8;
export const MONSTER_BAIT_MAX_CANDIDATES = 8;
export const MONSTER_BAIT_CONSUME_RADIUS = 1.15;
export const MONSTER_BAIT_CONSUME_RADIUS_SQ = MONSTER_BAIT_CONSUME_RADIUS * MONSTER_BAIT_CONSUME_RADIUS;
export const MONSTER_BAIT_COMBAT_LOCK_RADIUS = 5;
export const MONSTER_BAIT_COMBAT_LOCK_SQ = MONSTER_BAIT_COMBAT_LOCK_RADIUS * MONSTER_BAIT_COMBAT_LOCK_RADIUS;

const GOVNYAK_BAIT_ITEM_IDS = new Set(['govnyak_roll', 'govnyak_brick', 'govnyak_sample', 'govnyak_bad_batch']);
const activeBaits: MonsterBaitMarker[] = [];
let nextBaitId = 1;

export function resetMonsterBaits(): void {
  activeBaits.length = 0;
  nextBaitId = 1;
}

export function getActiveMonsterBaits(): readonly MonsterBaitMarker[] {
  return activeBaits;
}

export function baitKindForItem(defId: string, source: MonsterBaitSource): MonsterBaitKind | null {
  const def = ITEMS[defId];
  if (!def) return null;
  if (GOVNYAK_BAIT_ITEM_IDS.has(defId) || def.tags?.includes('govnyak')) return 'govnyak';
  if (source === 'drop' && def.type === ItemType.FOOD) return 'food';
  return null;
}

export function isMonsterBaitItem(defId: string): boolean {
  return baitKindForItem(defId, 'drop') !== null;
}

export function isMonsterBaitUseItem(defId: string): boolean {
  return baitKindForItem(defId, 'use') !== null;
}

function baitRadius(kind: MonsterBaitKind): number {
  return kind === 'govnyak' ? 18 : 14;
}

function baitTtl(kind: MonsterBaitKind): number {
  return kind === 'govnyak' ? 30 : 24;
}

function baitMaxAttractions(kind: MonsterBaitKind, count: number): number {
  if (kind === 'govnyak') return 5;
  return Math.max(2, Math.min(4, count));
}

function baitScanCooldown(entityId: number): number {
  const h = Math.imul(entityId ^ 0x27D4EB2D, 0x85EBCA6B) >>> 0;
  return 1.1 + ((h & 255) / 255) * 0.45;
}

function markerZone(world: World | undefined, x: number, y: number): { zoneId?: number; roomId?: number } {
  if (!world) return {};
  const ci = world.idx(Math.floor(x), Math.floor(y));
  const roomId = world.roomMap[ci];
  return {
    zoneId: world.zoneMap[ci],
    roomId: roomId >= 0 ? roomId : undefined,
  };
}

function publishBaitEnd(
  state: GameState | undefined,
  marker: MonsterBaitMarker,
  type: 'monster_bait_consumed' | 'monster_bait_expired',
  time: number,
  reason: string,
  monster?: Entity,
): void {
  if (!state) return;
  publishEvent(state, {
    type,
    time,
    floor: marker.floor,
    zoneId: marker.zoneId,
    roomId: marker.roomId,
    x: marker.x,
    y: marker.y,
    actorId: monster?.id,
    actorName: monster?.name,
    actorFaction: monster?.faction,
    itemId: marker.itemId,
    itemName: marker.itemName,
    itemCount: marker.itemCount,
    monsterKind: monster?.monsterKind,
    severity: type === 'monster_bait_consumed' ? 2 : 1,
    privacy: 'local',
    tags: ['monster', 'bait', marker.kind, reason],
    data: {
      baitId: marker.id,
      source: marker.source,
      attractedCount: marker.attractedCount,
      maxAttractions: marker.maxAttractions,
    },
  });
}

function removeBaitAt(index: number, state: GameState | undefined, time: number, reason: string): MonsterBaitMarker {
  const marker = activeBaits.splice(index, 1)[0];
  publishBaitEnd(state, marker, 'monster_bait_expired', time, reason);
  return marker;
}

export function expireMonsterBaits(state: GameState | undefined, time: number): void {
  for (let i = activeBaits.length - 1; i >= 0; i--) {
    if (activeBaits[i].expiresAt <= time) removeBaitAt(i, state, time, 'timeout');
  }
}

export function placeMonsterBait(
  state: GameState | undefined,
  world: World | undefined,
  actor: Entity,
  x: number,
  y: number,
  defId: string,
  count: number,
  source: MonsterBaitSource,
  entityId?: number,
): boolean {
  const def = ITEMS[defId];
  const kind = baitKindForItem(defId, source);
  if (!state || !def || !kind || count <= 0) return false;

  if (activeBaits.length >= MONSTER_BAIT_MAX_ACTIVE) {
    let oldest = 0;
    for (let i = 1; i < activeBaits.length; i++) {
      if (activeBaits[i].expiresAt < activeBaits[oldest].expiresAt) oldest = i;
    }
    removeBaitAt(oldest, state, state.time, 'cap');
  }

  const bx = world ? world.wrap(x) : x;
  const by = world ? world.wrap(y) : y;
  const marker: MonsterBaitMarker = {
    id: nextBaitId++,
    x: bx,
    y: by,
    floor: state.currentFloor,
    itemId: defId,
    itemName: def.name,
    itemCount: count,
    kind,
    source,
    placedById: actor.id,
    entityId,
    ...markerZone(world, bx, by),
    radius: baitRadius(kind),
    expiresAt: state.time + baitTtl(kind),
    attractedCount: 0,
    maxAttractions: baitMaxAttractions(kind, count),
  };
  activeBaits.push(marker);

  publishEvent(state, {
    type: 'monster_bait_placed',
    x: marker.x,
    y: marker.y,
    zoneId: marker.zoneId,
    roomId: marker.roomId,
    actorId: actor.id,
    actorName: actor.name,
    actorFaction: actor.faction,
    itemId: marker.itemId,
    itemName: marker.itemName,
    itemCount: marker.itemCount,
    severity: kind === 'govnyak' ? 3 : 2,
    privacy: 'local',
    tags: ['monster', 'bait', kind, source],
    data: {
      baitId: marker.id,
      radius: marker.radius,
      expiresAt: marker.expiresAt,
      maxAttractions: marker.maxAttractions,
    },
  });
  return true;
}

function activeBaitById(id: number, floor: FloorLevel, time: number): MonsterBaitMarker | null {
  for (const marker of activeBaits) {
    if (marker.id === id && marker.floor === floor && marker.expiresAt > time) return marker;
  }
  return null;
}

export function findMonsterBaitTarget(
  world: World,
  monster: Entity,
  dt: number,
  time: number,
  state?: GameState,
  currentFloor?: FloorLevel,
): MonsterBaitMarker | null {
  const ai = monster.ai;
  const floor = currentFloor ?? state?.currentFloor;
  if (!ai || floor === undefined || !isBaitAttractedMonster(monster.monsterKind)) return null;

  if (ai.baitMarkerId !== undefined) {
    const cached = activeBaitById(ai.baitMarkerId, floor, time);
    if (cached && world.dist2(monster.x, monster.y, cached.x, cached.y) <= cached.radius * cached.radius) {
      return cached;
    }
    ai.baitMarkerId = undefined;
  }

  ai.baitScanCd = (ai.baitScanCd ?? 0) - dt;
  if (ai.baitScanCd > 0) return null;
  ai.baitScanCd = baitScanCooldown(monster.id);

  let best: MonsterBaitMarker | null = null;
  let bestD2 = Infinity;
  let checked = 0;
  for (const marker of activeBaits) {
    if (checked++ >= MONSTER_BAIT_MAX_CANDIDATES) break;
    if (marker.floor !== floor || marker.expiresAt <= time) continue;
    if (marker.attractedCount >= marker.maxAttractions) continue;
    const d2 = world.dist2(monster.x, monster.y, marker.x, marker.y);
    if (d2 > marker.radius * marker.radius || d2 >= bestD2) continue;
    best = marker;
    bestD2 = d2;
  }
  if (!best) return null;

  best.attractedCount++;
  ai.baitMarkerId = best.id;
  if (state) {
    publishEvent(state, {
      type: 'monster_bait_attracted',
      time,
      floor,
      zoneId: best.zoneId,
      roomId: best.roomId,
      x: best.x,
      y: best.y,
      actorId: monster.id,
      actorName: monster.name,
      actorFaction: monster.faction,
      itemId: best.itemId,
      itemName: best.itemName,
      itemCount: best.itemCount,
      monsterKind: monster.monsterKind,
      severity: 2,
      privacy: 'local',
      tags: ['monster', 'bait', best.kind, 'attracted'],
      data: {
        baitId: best.id,
        attractedCount: best.attractedCount,
        maxAttractions: best.maxAttractions,
      },
    });
  }
  return best;
}

export function consumeMonsterBait(state: GameState | undefined, marker: MonsterBaitMarker, monster: Entity, time: number): number | undefined {
  const index = activeBaits.findIndex(b => b.id === marker.id);
  if (index < 0) return undefined;
  const [removed] = activeBaits.splice(index, 1);
  if (monster.ai?.baitMarkerId === removed.id) monster.ai.baitMarkerId = undefined;
  publishBaitEnd(state, removed, 'monster_bait_consumed', time, 'consumed', monster);
  return removed.entityId;
}

export function removeMonsterBaitForEntity(entityId: number, state: GameState | undefined, time: number, reason: string): void {
  const index = activeBaits.findIndex(b => b.entityId === entityId);
  if (index >= 0) removeBaitAt(index, state, time, reason);
}

export function clearDeadBaitDrop(entity: Entity): void {
  if (entity.type === EntityType.ITEM_DROP) entity.alive = false;
}
