/* ── Slimevik runtime: он глотает брошенное и носит это в себе ── */

import {
  AIGoal,
  EntityType,
  MonsterKind,
  msg,
  type Entity,
  type GameState,
  type Item,
  type Msg,
} from '../core/types';
import { World } from '../core/world';
import { MONSTERS, entityDisplayName } from '../entities/monster';
import { recordPlayerDamage } from './damage';
import { ENTITY_MASK_ACTOR, ENTITY_MASK_ITEM_DROP, ensureEntityIndex, getEntityIndex, markEntityIndexDirty } from './entity_index';
import { publishEvent, registerWorldEventObserver } from './events';
import { isDebugOnePunchManEnabled, keepDebugOnePunchManAlive } from './debug_cheats';
import { scaleMonsterDmg, strMeleeDmgMult } from './rpg';
import { followPath, tryAssignPathToCell, wanderNearby } from './ai/pathfinding';
import { isPlayerEntity } from './player_actor';
import { rng } from '../core/rand';
import { speciesState } from './ai/species_state';
import { damageActor } from './combat_stimulus';

const INTERACTION_QUERY_CAP = 24;
const FLEE_SECONDS = 2.2;
const FLEE_DISTANCE = 8;
const LASH_RANGE = 1.35;
const slimevikActorQuery: Entity[] = [];

registerWorldEventObserver((state, event) => {
  if (
    (event.type !== 'player_kill_monster' && event.type !== 'npc_kill_monster') ||
    event.monsterKind !== MonsterKind.SLIMEVIK
  ) return;
  publishEvent(state, {
    type: 'slimevik_killed',
    zoneId: event.zoneId,
    roomId: event.roomId,
    x: event.x,
    y: event.y,
    actorId: event.actorId,
    actorName: event.actorName,
    actorFaction: event.actorFaction,
    targetId: event.targetId,
    targetName: event.targetName,
    monsterKind: MonsterKind.SLIMEVIK,
    severity: 3,
    privacy: 'local',
    tags: ['monster', 'slimevik', 'slime', 'kill'],
    data: { sourceEventId: event.id, counterplay: 'trade_or_keep_distance' },
  });
});






function wallNeighborCount(world: World, e: Entity): number {
  const x = Math.floor(e.x);
  const y = Math.floor(e.y);
  let n = 0;
  if (world.solid(x - 1, y)) n++;
  if (world.solid(x + 1, y)) n++;
  if (world.solid(x, y - 1)) n++;
  if (world.solid(x, y + 1)) n++;
  return n;
}

function nearestActor(world: World, entities: readonly Entity[], e: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD2 = FLEE_DISTANCE * FLEE_DISTANCE;
  ensureEntityIndex(entities).queryRadiusCapped(e.x, e.y, FLEE_DISTANCE, slimevikActorQuery, ENTITY_MASK_ACTOR, INTERACTION_QUERY_CAP);
  for (const other of slimevikActorQuery) {
    if (!other.alive || other.id === e.id || (!isPlayerEntity(other) && other.type !== EntityType.NPC)) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 < bestD2) {
      best = other;
      bestD2 = d2;
    }
  }
  return best;
}

function fleeFrom(world: World, e: Entity, threat: Entity, dt: number): void {
  const ai = e.ai!;
  ai.goal = AIGoal.FLEE;
  ai.combatTargetId = threat.id;
  ai.timer -= dt;
  if (ai.path.length === 0 || ai.pi >= ai.path.length || ai.timer <= 0) {
    const dx = world.delta(threat.x, e.x);
    const dy = world.delta(threat.y, e.y);
    const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const tx = Math.floor(e.x + (dx / len) * FLEE_DISTANCE);
    const ty = Math.floor(e.y + (dy / len) * FLEE_DISTANCE);
    if (tryAssignPathToCell(world, e, tx, ty) === 'not_found') wanderNearby(world, e);
    ai.timer = FLEE_SECONDS;
  }
  followPath(world, e, dt);
}

function lashIfCornered(
  world: World,
  e: Entity,
  target: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): void {
  if (world.dist2(e.x, e.y, target.x, target.y) > LASH_RANGE * LASH_RANGE) return;
  if (wallNeighborCount(world, e) < 2 && (e.ai?.stuck ?? 0) < 0.8) return;
  e.attackCd = (e.attackCd ?? 0) - dt;
  if ((e.attackCd ?? 0) > 0) return;

  const def = MONSTERS[MonsterKind.SLIMEVIK];
  const level = e.rpg?.level ?? 1;
  const strMult = e.rpg ? strMeleeDmgMult(e.rpg) : 1;
  const dmg = Math.max(1, Math.round(scaleMonsterDmg(def.dmg, level) * strMult));
  if (target.hp !== undefined) {
    /* Через единую дверь урона: жертва узнаёт, кто её ударил, и вправе
     * ответить. Раньше здесь вычиталось здоровье напрямую, и NPC, которого рвут
     * когтями, стоял и не отвечал — удар до его AI попросту не доходил.
     * Отладочное бессмертие и обработка смерти живут внутри двери.
     *
     * Запасной путь без состояния оставлен намеренно: зовут и оттуда, где
     * `GameState` не протянут, и молча ронять урон там нельзя. */
    if (state) {
      damageActor(world, state, target, { damage: dmg, source: 'monster_melee', attacker: e });
    } else if (isPlayerEntity(target) && isDebugOnePunchManEnabled()) {
      keepDebugOnePunchManAlive(target);
    } else {
      target.hp = Math.max(0, target.hp - dmg);
      if (target.hp <= 0) {
        target.alive = false;
        target.hp = 0;
      }
    }
    if (isPlayerEntity(target)) recordPlayerDamage(state, e, dmg, 'Слизневик хлестнул кислотной слизью в углу');
  }
  msgs.push(msg(`Слизневик хлестнул ${isPlayerEntity(target) ? 'тебя' : entityDisplayName(target)} кислотной слизью: -${dmg}`, time, '#9d7'));
  e.attackCd = def.attackRate;
}



/* ── Слизневик: жрёт то, что лежит на полу ────────────────────────
 *
 * Одно правило: всё брошенное на пол он глотает и носит в себе. Убил — забрал
 * обратно (съеденное вываливается общей дверью дропа). Упустил — потерял.
 *
 * Отсюда и решение: выбил из монстра лут, но не подобрал сразу — считай, что
 * поставил на кон. Гнаться за студнем или взять что дают — каждый раз заново.
 *
 * Раньше он бродил по «слизевым» комнатам, травил стоящего рядом ИГРОКА
 * (отдельная механика, привязанная к нему одному) и умел ручной обмен по E:
 * три механики, пять полей в ядре.
 */

/** Как далеко он чует брошенное и как часто смотрит. */
const FORAGE_RADIUS = 9;
const FORAGE_SCAN_SEC = 1.6;
const FORAGE_SCAN_CAP = 12;
const SWALLOW_RANGE_SQ = 1.1 * 1.1;
/** Сколько предметов помещается в студне. Больше — просто не влезает. */
const SLIMEVIK_BELLY_CAP = 4;

interface ForageState {
  scanCd: number;
  preyId?: number;
}
const forageState = speciesState<ForageState>(() => ({ scanCd: 0 }));

/** Что он сейчас несёт: путь для отладки и тестов. */
export function peekSlimevikBelly(e: Entity): readonly Item[] {
  return e.inventory ?? [];
}

function findPreyById(entities: readonly Entity[], id: number): Entity | undefined {
  const prey = getEntityIndex().byId.get(id) ?? entities.find(other => other.id === id);
  return prey?.alive && prey.type === EntityType.ITEM_DROP ? prey : undefined;
}

function findLooseItemNear(world: World, entities: readonly Entity[], e: Entity): Entity | undefined {
  if ((e.inventory?.length ?? 0) >= SLIMEVIK_BELLY_CAP) return undefined;
  let best: Entity | undefined;
  let bestD2 = FORAGE_RADIUS * FORAGE_RADIUS;
  ensureEntityIndex(entities).queryRadiusCapped(e.x, e.y, FORAGE_RADIUS, slimevikActorQuery, ENTITY_MASK_ITEM_DROP, FORAGE_SCAN_CAP);
  for (const drop of slimevikActorQuery) {
    if (!drop.alive || !drop.inventory?.length) continue;
    const d2 = world.dist2(e.x, e.y, drop.x, drop.y);
    if (d2 >= bestD2) continue;
    bestD2 = d2;
    best = drop;
  }
  return best;
}

/** Проглотить лежащее. Вещь не исчезает — она переезжает в студень. */
function swallowItem(e: Entity, drop: Entity, time: number, msgs: Msg[]): void {
  const belly = e.inventory ?? (e.inventory = []);
  let taken = 0;
  for (const item of drop.inventory ?? []) {
    if (belly.length >= SLIMEVIK_BELLY_CAP) break;
    if (item.count <= 0) continue;
    belly.push({ defId: item.defId, count: item.count, data: item.data });
    taken++;
  }
  if (taken <= 0) return;
  drop.alive = false;
  drop.inventory = [];
  markEntityIndexDirty();
  msgs.push(msg('Слизневик втянул в себя брошенное. Теперь это в нём.', time, '#8d8'));
}

export function updateSlimevikMonster(
  world: World,
  entities: Entity[],
  e: Entity,
  dt: number,
  time: number,
  msgs: Msg[],
  state?: GameState,
): boolean {
  if (e.monsterKind !== MonsterKind.SLIMEVIK || !e.ai) return false;

  const hurt = (e.hp ?? 1) < (e.maxHp ?? e.hp ?? 1);
  if (hurt) {
    const threat = nearestActor(world, entities, e);
    if (threat) {
      lashIfCornered(world, e, threat, dt, time, msgs, state);
      fleeFrom(world, e, threat, dt);
      return true;
    }
  }

  const ai = e.ai;
  ai.goal = AIGoal.WANDER;
  ai.combatTargetId = undefined;

  const forage = forageState.of(e);
  forage.scanCd -= dt;
  if (forage.scanCd <= 0) {
    forage.scanCd = FORAGE_SCAN_SEC + ((e.id * 37) % 17) * 0.07;
    forage.preyId = findLooseItemNear(world, entities, e)?.id;
  }

  const prey = forage.preyId !== undefined ? findPreyById(entities, forage.preyId) : undefined;
  if (prey) {
    if (world.dist2(e.x, e.y, prey.x, prey.y) <= SWALLOW_RANGE_SQ) {
      swallowItem(e, prey, time, msgs);
      forage.preyId = undefined;
      ai.path.length = 0;
      ai.pi = 0;
      return true;
    }
    ai.timer -= dt;
    if (ai.path.length === 0 || ai.pi >= ai.path.length || ai.timer <= 0) {
      tryAssignPathToCell(world, e, Math.floor(prey.x), Math.floor(prey.y));
      ai.timer = 2.0;
    }
    followPath(world, e, dt);
    return true;
  }

  ai.timer -= dt;
  if (ai.path.length === 0 || ai.pi >= ai.path.length || ai.timer <= 0) {
    wanderNearby(world, e);
    ai.timer = 2.5 + rng() * 2;
  }
  followPath(world, e, dt);
  return true;
}



