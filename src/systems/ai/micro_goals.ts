/* ── Universal AI Micro-Goal System ───────────────────────────── */

import { AIGoal, Entity, EntityType, Msg, ItemType } from '../../core/types';
import { World } from '../../core/world';
import { emitMarkovBark } from './barks';
import { steerEntityTowardCell, clearEntitySteeringPath } from './pathfinding';
import { actorUnderOrder } from './goto_order';
import { aiPathMoveSpeed } from '../rpg';
import { stepActorBy } from '../movement_collision';

import { pickupDrop } from '../inventory';
import { getEntityIndex, ENTITY_MASK_NPC, ENTITY_MASK_ITEM_DROP } from '../entity_index';
import { npcAutoEquipBestWeapon } from './combat';
import { rng } from '../../core/rand';
import { getFactionRel } from '../../data/relations';
import { ITEMS } from '../../data/catalog';

const _microQueryOut: Entity[] = new Array(32);

export interface MicroGoalOpts {
  targetX?: number;
  targetY?: number;
  timer: number;
  sourceId?: number;
}

const MICRO_GOAL_PRIORITIES: Record<string, number> = {
  'pack_pulse': 50,
  'search_lkp': 40,
  'investigate_noise': 30,
  'greet': 20,
  'reposition': 10,
  'loot_nearby': 5,
};

export function hasMicroGoal(e: Entity): boolean {
  return e.ai?.microGoalId !== undefined;
}

export function clearMicroGoal(e: Entity): void {
  const ai = e.ai;
  if (!ai) return;
  ai.microGoalId = undefined;
  ai.microTargetX = undefined;
  ai.microTargetY = undefined;
  ai.microTimer = undefined;
  ai.microSourceId = undefined;
  clearEntitySteeringPath(e);
}

export function trySetMicroGoal(e: Entity, id: string, opts: MicroGoalOpts): boolean {
  const ai = e.ai;
  if (!ai) return false;
  
  // Combat supersedes all micro-goals
  if (ai.combatTargetId !== undefined && ai.combatTargetId !== e.id) return false;
  if (ai.goal === AIGoal.FLEE || ai.goal === AIGoal.HIDE) return false;
  
  // Check priority if a micro-goal is already active
  if (ai.microGoalId) {
    const currentPri = MICRO_GOAL_PRIORITIES[ai.microGoalId] ?? 0;
    const newPri = MICRO_GOAL_PRIORITIES[id] ?? 0;
    if (newPri <= currentPri) return false;
  }
  
  ai.microGoalId = id;
  ai.microTargetX = opts.targetX;
  ai.microTargetY = opts.targetY;
  ai.microTimer = opts.timer;
  ai.microSourceId = opts.sourceId;
  clearEntitySteeringPath(e);
  return true;
}

export function tickMicroGoal(world: World, e: Entity, dt: number, _time: number, _msgs: Msg[]): boolean {
  const ai = e.ai;
  if (!ai) return false;
  /* На акторе стоит ПРИКАЗ — микроцель отказывается, ровно как ядро актора
   * (`ai/index.ts`, `tryActorCore`) и тактика (`ai/tactics.ts`,
   * `runActorTactic`), и по той же причине: волю задали снаружи, и своего хода
   * микроцель взамен неё не берёт. Отказ полный, до тиков кулдаунов: начатая
   * микроцель замирает и доигрывается, когда приказ погаснет.
   *
   * Это не новый закон, а починка асимметрии. У человека такт микроцелей стоит
   * НИЖЕ приказа (`updateNPC`) и под приказом не выполнялся никогда; у твари он
   * стоит ВЫШЕ (`updateMonster`), потому что бой у неё живёт внутри того же
   * такта, — и молча отнимал у неё кадр. Ставить второй закон для твари нельзя,
   * поэтому отказ общий и живёт здесь, у самой микроцели.
   *
   * Единственный, кто ставит микроцель твари, — потеря цели в бою
   * (`search_lkp`, `ai/combat.ts`), а он и так отказывает при живой боевой цели.
   * Замирает поэтому не поиск врага, а его остывший след. */
  if (actorUnderOrder(e)) return false;


  if (ai.microCooldowns) {
    let hasDeletes = false;
    const keys = Object.keys(ai.microCooldowns);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = ai.microCooldowns[key] - dt;
      ai.microCooldowns[key] = val;
      if (val <= 0) {
        hasDeletes = true;
      }
    }

    if (hasDeletes) {
      const newObj: Record<string, number> = {};
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = ai.microCooldowns[key];
        if (val > 0) newObj[key] = val;
      }
      ai.microCooldowns = newObj;
    }
  }

  if (!ai.microGoalId || ai.microTimer === undefined) return false;
  
  ai.microTimer -= dt;
  if (ai.microTimer <= 0) {
    clearMicroGoal(e);
    return false;
  }
  
  // Execution logic based on the specific micro-goal
  switch (ai.microGoalId) {

    case 'search_lkp':
    case 'reposition':
    case 'loot_nearby':
    case 'pack_pulse': {
      if (ai.microTargetX !== undefined && ai.microTargetY !== undefined) {
        const steer = steerEntityTowardCell(world, e, ai.microTargetX, ai.microTargetY);
        if (steer) {
          // Общий шаг вместо своего пооосевого: он пробует полный 2D-шаг раньше
          // скольжения и начинает скольжение с доминирующей оси, а не всегда с
          // X, поэтому в симметричных углах ведёт себя симметрично.
          const speed = aiPathMoveSpeed(e) * dt;
          stepActorBy(world, e, steer.x * speed, steer.y * speed);
          e.angle = Math.atan2(steer.y, steer.x);
        } else {
          if (ai.microGoalId === 'loot_nearby' && ai.microSourceId !== undefined) {
            const item = getEntityIndex().byId.get(ai.microSourceId);
            if (item && item.type === EntityType.ITEM_DROP && item.alive) {
              pickupDrop(world, item, e, _msgs, _time, undefined);
              if (e.type === EntityType.NPC) npcAutoEquipBestWeapon(e);
            }
          }
          // Reached target early, clear goal
          clearMicroGoal(e);
          return false;
        }
      }
      return true;
    }
  }
  
  return true;
}

export function evaluateMicroStimuli(_world: World, e: Entity, time: number, msgs: Msg[]): void {
  const ai = e.ai;
  if (!ai || hasMicroGoal(e) || ai.combatTargetId !== undefined || ai.goal === AIGoal.FLEE || ai.goal === AIGoal.HIDE) {
    return;
  }
  
  if ((ai.microScanCd ?? 0) > time) return;
  ai.microScanCd = time + 0.3 + rng() * 0.3;
  
  // Bounded scan for greet (can happen while walking)
  if (e.type === EntityType.NPC) {
    const index = getEntityIndex();
    const count = index.queryRadiusCapped(e.x, e.y, 4, _microQueryOut, ENTITY_MASK_NPC, 16);
    for (let i = 0; i < count; i++) {
      const near = _microQueryOut[i];
      if (!near.alive) continue;
      
      const dist2 = _world.dist2(near.x, near.y, e.x, e.y);

      if (dist2 < 9 && dist2 > 0) { // 3 cells squared
        if ((ai.microCooldowns?.['greet'] ?? 0) <= 0) {
          ai.microCooldowns = ai.microCooldowns || {};
          ai.microCooldowns['greet'] = 120; // 2 minutes before greeting anyone again
          emitMarkovBark(e, msgs, time, 'ambient', 'Привет.', 1.0, '#aac');

          // Simple barter exchange between friendly NPCs
          if (e.faction !== undefined && near.faction !== undefined && getFactionRel(e.faction, near.faction) >= 0 && rng() < 0.2) {
            const eInv = e.inventory;
            const nInv = near.inventory;
            if (eInv && nInv && eInv.length > 0) {
              const eItemIndex = Math.floor(rng() * eInv.length);
              const eItem = eInv[eItemIndex];
              const def = ITEMS[eItem.defId];
              // only barter basic things to avoid giving away weapons they need
              if (def && (def.type === ItemType.FOOD || def.type === ItemType.DRINK || def.type === ItemType.MEDICINE || def.type === ItemType.AMMO || def.type === ItemType.MISC)) {
                const price = def.value || 5;
                if ((near.money || 0) >= price) {
                  near.money = (near.money || 0) - price;
                  e.money = (e.money || 0) + price;
                  eInv.splice(eItemIndex, 1);
                  nInv.push(eItem);
                }
              }
            }
          }
        }
      }
    }
  }



  // 2. Loot items
  if (e.type === EntityType.NPC) {
    const index = getEntityIndex();
    const count = index.queryRadiusCapped(e.x, e.y, 4, _microQueryOut, ENTITY_MASK_ITEM_DROP, 16);
    for (let i = 0; i < count; i++) {
      const near = _microQueryOut[i];
      if (!near.alive) continue;
      
      const dist2 = _world.dist2(near.x, near.y, e.x, e.y);

      if (dist2 < 4) {
        if ((ai.microCooldowns?.['loot_nearby'] ?? 0) <= 0) {
          if (trySetMicroGoal(e, 'loot_nearby', { targetX: near.x, targetY: near.y, timer: 10, sourceId: near.id })) {
            ai.microCooldowns = ai.microCooldowns || {};
            ai.microCooldowns['loot_nearby'] = 1; // 1 sec cooldown
            return;
          }
        }
      }
    }
  }
}
