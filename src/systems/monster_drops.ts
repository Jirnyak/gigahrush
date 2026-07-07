import { EntityType, type Entity } from '../core/types';
import { chooseMonsterRareDrop } from '../data/monster_ecology';
import { generateMonsterLoot, type GeneratedLoot } from './procedural_loot';
import { Spr } from '../render/sprite_index';
import { canSpawnEntityType } from './entity_limits';

export interface MonsterRareLootDrop {
  itemId: string;
  count: number;
  entityId: number;
}

export function dropMonsterRareLoot(
  monster: Entity,
  entities: Entity[],
  nextId: { v: number },
  rand: () => number = Math.random,
): MonsterRareLootDrop | undefined {
  if (monster.type !== EntityType.MONSTER || monster.monsterKind === undefined) return undefined;
  if (!canSpawnEntityType(entities, EntityType.ITEM_DROP)) return undefined;
  const drop = chooseMonsterRareDrop(monster.monsterKind, rand);
  if (!drop) return undefined;
  const count = Math.max(1, Math.floor(drop.count ?? 1));
  const entityId = nextId.v++;
  entities.push({
    id: entityId,
    type: EntityType.ITEM_DROP,
    x: monster.x + (rand() - 0.5) * 0.35,
    y: monster.y + (rand() - 0.5) * 0.35,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId: drop.itemId, count }],
  });
  return { itemId: drop.itemId, count, entityId };
}


export function dropMonsterLoot(
  monster: Entity,
  entities: Entity[],
  nextId: { v: number },
  rand: () => number,
): GeneratedLoot[] {
  if (monster.type !== EntityType.MONSTER || monster.monsterKind === undefined) return [];

  const lootItems = generateMonsterLoot(monster.monsterKind, rand);
  if (lootItems.length === 0) return [];

  const spawned = [];
  for (const loot of lootItems) {
    if (!canSpawnEntityType(entities, EntityType.ITEM_DROP)) break;

    const entityId = nextId.v++;
    entities.push({
      id: entityId,
      type: EntityType.ITEM_DROP,
      x: monster.x + (rand() - 0.5) * 0.35,
      y: monster.y + (rand() - 0.5) * 0.35,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: Spr.ITEM_DROP,
      inventory: [{ defId: loot.itemDefId, count: loot.amount }],
    });
    spawned.push(loot);
  }

  return spawned;
}
