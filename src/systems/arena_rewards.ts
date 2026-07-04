import { type Entity, Faction, EntityType, GameState, msg } from '../core/types';
import { awardXP } from './rpg';
import { publishEvent } from './events';
import { getEntityIndex } from './entity_index';
import { setNpcPlayerRelation, getNpcPlayerRelation } from './npc_relations';
import { MAX_INVENTORY_SLOTS } from '../data/inventory_limits';
import { entitySpawnSlots } from './entity_limits';

export function grantArenaChampionRewards(entities: Entity[], player: Entity, state: GameState, nextId: { v: number }): void {
  const trophyDefId = 'arena_gold_trophy';

  if (!player.inventory) {
    player.inventory = [];
  }

  if (player.inventory.length < MAX_INVENTORY_SLOTS) {
    player.inventory.push({ defId: trophyDefId, count: 1 });
    state.msgs.push(msg('Вы получили Золотой Кубок Арены!', state.time, '#fdd'));
  } else {
    const slots = entitySpawnSlots(entities, EntityType.ITEM_DROP, 1);
    if (slots > 0) {
      entities.push({
        id: nextId.v++, type: EntityType.ITEM_DROP,
        x: player.x, y: player.y,
        angle: 0, pitch: 0, speed: 0, sprite: 0,
        alive: true,
        inventory: [{ defId: trophyDefId, count: 1 }]
      });
      state.msgs.push(msg('Золотой Кубок Арены упал на пол!', state.time, '#fdd'));
    }
  }

  const index = getEntityIndex();
  for (const npc of index.actors) {
    if (npc.faction === Faction.LIQUIDATOR && npc.alive) {
      setNpcPlayerRelation(npc, Math.min(100, getNpcPlayerRelation(npc) + 30));
    }
  }

  awardXP(player, 1500, state.msgs, state.time);

  publishEvent(state, {
    type: 'arena_champion_crowned',
    actorId: player.id,
    severity: 4,
    privacy: 'public',
    tags: ['arena_champion', 'reward']
  });
}
