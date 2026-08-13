import { EntityType, ItemType, type Entity } from '../core/types';
import { activeActorSoftLimit, ENTITY_SOFT_LIMITS, FLOOR_OBJECT_SOFT_LIMIT, ITEM_DROP_FIFO_CAP } from '../data/entity_limits';
import { ITEMS } from '../data/items';
import { isNativePlayerBodyEntity, isPlayerEntity } from './player_actor';

export function entitySoftLimit(type: EntityType): number | undefined {
  if (type === EntityType.NPC || type === EntityType.MONSTER) return activeActorSoftLimit();
  return ENTITY_SOFT_LIMITS[type];
}

function isSoftCappedActorType(type: EntityType): boolean {
  return type === EntityType.NPC || type === EntityType.MONSTER;
}

function isFloorObjectType(type: EntityType): boolean {
  return type === EntityType.ITEM_DROP || type === EntityType.PROJECTILE || type === EntityType.BILLBOARD;
}

function isSoftCappedActor(entity: Entity): boolean {
  if (!entity.alive) return false;
  if (!isSoftCappedActorType(entity.type)) return false;
  if (isNativePlayerBodyEntity(entity) || isPlayerEntity(entity)) return false;
  return true;
}

export function countLiveEntitiesOfType(entities: readonly Entity[], type: EntityType): number {
  let count = 0;
  for (const entity of entities) {
    if (isSoftCappedActorType(type) && (isNativePlayerBodyEntity(entity) || isPlayerEntity(entity))) continue;
    if (entity.alive && entity.type === type) count++;
  }
  return count;
}

export function countLiveActiveActors(entities: readonly Entity[]): number {
  let count = 0;
  for (const entity of entities) {
    if (isSoftCappedActor(entity)) count++;
  }
  return count;
}

export function countLiveFloorObjects(entities: readonly Entity[]): number {
  let count = 0;
  for (const entity of entities) {
    if (entity.alive && isFloorObjectType(entity.type)) count++;
  }
  return count;
}

export function remainingActiveActorSpawnSlots(entities: readonly Entity[]): number {
  return Math.max(0, activeActorSoftLimit() - countLiveActiveActors(entities));
}

export function remainingFloorObjectSpawnSlots(entities: readonly Entity[]): number {
  return Math.max(0, FLOOR_OBJECT_SOFT_LIMIT - countLiveFloorObjects(entities));
}

export function remainingEntitySpawnSlots(entities: readonly Entity[], type: EntityType): number {
  const limit = entitySoftLimit(type);
  const cappedActor = isSoftCappedActorType(type);
  const floorObject = isFloorObjectType(type);
  if (limit === undefined && !cappedActor && !floorObject) return Number.POSITIVE_INFINITY;
  // Spawn bursts (death loot, waves) call this per item — the type count and
  // the shared-pool count fold into one entities pass instead of two.
  let typeCount = 0;
  let sharedCount = 0;
  for (const entity of entities) {
    if (!entity.alive) continue;
    if (cappedActor) {
      if (isNativePlayerBodyEntity(entity) || isPlayerEntity(entity)) continue;
      if (entity.type === type) typeCount++;
      if (isSoftCappedActorType(entity.type)) sharedCount++;
    } else {
      if (entity.type === type) typeCount++;
      if (floorObject && isFloorObjectType(entity.type)) sharedCount++;
    }
  }
  const typeRemaining = limit === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, limit - typeCount);
  if (floorObject) return Math.min(typeRemaining, Math.max(0, FLOOR_OBJECT_SOFT_LIMIT - sharedCount));
  if (!cappedActor) return typeRemaining;
  return Math.min(typeRemaining, Math.max(0, activeActorSoftLimit() - sharedCount));
}

export function entitySpawnSlots(entities: readonly Entity[], type: EntityType, requested: number): number {
  const wanted = Math.max(0, Math.floor(requested));
  const remaining = remainingEntitySpawnSlots(entities, type);
  return Number.isFinite(remaining) ? Math.min(wanted, remaining) : wanted;
}

export function canSpawnEntityType(entities: readonly Entity[], type: EntityType): boolean {
  return remainingEntitySpawnSlots(entities, type) > 0;
}

// Keys, documents and quest-tagged contents are progression-critical; drops
// the player placed deliberately carry ownerId. Neither is FIFO-evictable.
function isExpendableDrop(e: Entity): boolean {
  if (!e.alive || e.type !== EntityType.ITEM_DROP) return false;
  if (e.ownerId !== undefined) return false;
  for (const item of e.inventory ?? []) {
    const def = ITEMS[item.defId];
    if (!def) continue;
    if (def.type === ItemType.KEY || def.type === ItemType.NOTE) return false;
    if (def.tags?.includes('quest') || def.tags?.includes('document')) return false;
  }
  return true;
}

// Live drops accumulate for a whole floor run (only samosbor sweeps them) and
// each one taxes the per-frame static reindex. Called after death-loot bursts:
// past the cap the oldest expendable drops (entity array order = creation
// order) silently rot away. Returns the number evicted.
export function enforceItemDropFifoCap(entities: Entity[]): number {
  let live = 0;
  for (const e of entities) if (e.alive && e.type === EntityType.ITEM_DROP) live++;
  let toEvict = live - ITEM_DROP_FIFO_CAP;
  if (toEvict <= 0) return 0;
  let evicted = 0;
  for (const e of entities) {
    if (toEvict <= 0) break;
    if (!isExpendableDrop(e)) continue;
    e.alive = false;
    toEvict--;
    evicted++;
  }
  return evicted;
}
