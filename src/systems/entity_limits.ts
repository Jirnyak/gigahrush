import { EntityType, type Entity } from '../core/types';
import { ENTITY_SOFT_LIMITS } from '../data/entity_limits';

export function entitySoftLimit(type: EntityType): number | undefined {
  return ENTITY_SOFT_LIMITS[type];
}

export function countLiveEntitiesOfType(entities: readonly Entity[], type: EntityType): number {
  let count = 0;
  for (const entity of entities) {
    if (entity.alive && entity.type === type) count++;
  }
  return count;
}

export function remainingEntitySpawnSlots(entities: readonly Entity[], type: EntityType): number {
  const limit = entitySoftLimit(type);
  if (limit === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, limit - countLiveEntitiesOfType(entities, type));
}

export function entitySpawnSlots(entities: readonly Entity[], type: EntityType, requested: number): number {
  const wanted = Math.max(0, Math.floor(requested));
  const remaining = remainingEntitySpawnSlots(entities, type);
  return Number.isFinite(remaining) ? Math.min(wanted, remaining) : wanted;
}

export function canSpawnEntityType(entities: readonly Entity[], type: EntityType): boolean {
  return remainingEntitySpawnSlots(entities, type) > 0;
}
