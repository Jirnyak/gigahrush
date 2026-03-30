/* ── AI system — orchestrator ─────────────────────────────────── */

export { forceHide, getNpcStateText } from './npc_fsm';

import {
  type Entity, type Msg, type GameClock,
  EntityType,
} from '../../core/types';
import { World } from '../../core/world';
import { setPathContext } from './pathfinding';
import { setEntityMap, updateMonster } from './monster';
import { setCombatContext, tryFactionCombat, tryFleeFromMonster } from './combat';
import { setNpcContext, updateNPC } from './npc_fsm';

export function updateAI(world: World, entities: Entity[], dt: number, time: number, msgs: Msg[], playerId: number, clock: GameClock, samosborActive: boolean, nextId: { v: number }): void {
  // Push per-frame refs into sub-modules
  setPathContext(msgs, time);
  setCombatContext(msgs, time);
  setNpcContext(msgs, time);

  // Build id→entity map once per frame for O(1) cached target lookups
  const entityById = new Map<number, Entity>();
  for (const e of entities) if (e.alive) entityById.set(e.id, e);
  setEntityMap(entityById);

  for (const e of entities) {
    if (!e.alive || !e.ai) continue;
    if (e.type === EntityType.NPC) {
      if (!tryFactionCombat(world, entities, e, dt, time, msgs, nextId)) {
        if (!tryFleeFromMonster(world, entities, e, dt)) {
          updateNPC(world, entities, e, dt, time, clock, samosborActive);
        }
      }
    }
    if (e.type === EntityType.MONSTER) updateMonster(world, entities, e, dt, time, msgs, playerId, nextId);
  }
}
