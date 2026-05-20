import { EntityType } from '../core/types';

export const ENTITY_SOFT_LIMITS: Partial<Record<EntityType, number>> = {
  [EntityType.NPC]: 5_000,
  [EntityType.MONSTER]: 10_000,
  [EntityType.ITEM_DROP]: 100_000,
} as const;
