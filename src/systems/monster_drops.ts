import { EntityType, type Entity } from '../core/types';
import { chooseMonsterRareDrop } from '../data/monster_ecology';
import { generateMonsterLoot, type GeneratedLoot } from './procedural_loot';
import { Spr } from '../entities/sprite_index';
import { canSpawnEntityType, enforceItemDropFifoCap, entitySpawnSlots } from './entity_limits';
import { rng } from '../core/rand';

export interface MonsterRareLootDrop {
  itemId: string;
  count: number;
  entityId: number;
}

export function dropMonsterRareLoot(
  monster: Entity,
  entities: Entity[],
  nextId: { v: number },
  rand: () => number = rng,
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

  // Съеденное возвращается первым и целиком: то, что монстр носил в себе, — не
  // его лут, а чужая вещь. Общее правило, а не случай одного вида.
  const swallowed = monster.inventory ?? [];
  const lootItems = generateMonsterLoot(monster.monsterKind, rand);
  if (lootItems.length === 0 && swallowed.length === 0) return [];

  const spawned = [];
  // Slots are taken once and decremented locally — the per-item recheck was a
  // full entities scan per loot item on every death.
  let slots = entitySpawnSlots(entities, EntityType.ITEM_DROP, lootItems.length + swallowed.length);
  for (const item of swallowed) {
    if (slots <= 0 || item.count <= 0) break;
    slots--;
    entities.push({
      id: nextId.v++,
      type: EntityType.ITEM_DROP,
      x: monster.x + (rand() - 0.5) * 0.35,
      y: monster.y + (rand() - 0.5) * 0.35,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: Spr.ITEM_DROP,
      inventory: [{ defId: item.defId, count: item.count, data: item.data }],
    });
    spawned.push({ itemDefId: item.defId, amount: item.count });
  }
  monster.inventory = [];
  for (const loot of lootItems) {
    if (slots <= 0) break;
    slots--;

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
  if (spawned.length > 0) enforceItemDropFifoCap(entities);

  return spawned;
}
