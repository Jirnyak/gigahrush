import { World } from '../../core/world';
import { GameState, Entity } from '../../core/types';
import { getEntityIndex, ENTITY_MASK_NPC } from '../entity_index';
import { isHostile } from '../factions';
import { publishEvent } from '../events';

const queryArray: Entity[] = [];

export function checkAssaultResolution(world: World, state: GameState, _dt: number): void {
  if (!state.factionGoals) return;

  for (const goal of state.factionGoals) {
    if (goal.type === 'attack') {
      const zone = world.zones[goal.targetZone];
      if (!zone) continue;

      const count = getEntityIndex().queryRadiusCapped(
        zone.cx,
        zone.cy,
        40,
        queryArray,
        ENTITY_MASK_NPC,
        100
      );

      let hostilesFound = false;
      for (let i = 0; i < count; i++) {
        const actor = queryArray[i];
        if (actor.alive && isHostile({ faction: goal.factionId } as Entity, actor)) {
          hostilesFound = true;
          break;
        }
      }

      if (!hostilesFound) {
        goal.type = 'defend';
        publishEvent(state, {
          type: 'faction_event',
          zoneId: goal.targetZone,
          severity: 3,
          privacy: 'public',
          tags: ['zone_captured']
        });
      }
    }
  }
}
