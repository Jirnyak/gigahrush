import { EntityType, type Entity } from '../core/types';
import { activeActorSoftLimit, ENTITY_SOFT_LIMITS, FLOOR_OBJECT_SOFT_LIMIT } from '../data/entity_limits';
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
