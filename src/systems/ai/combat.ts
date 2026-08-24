/* ── NPC combat: faction fights + fleeing ─────────────────────── */

import {
  type Entity, type GameState, type Msg,
  EntityType, AIGoal, ProjType,
} from '../../core/types';
import { World } from '../../core/world';
import { WEAPON_STATS, type WeaponStats } from '../../data/catalog';
import {
  playAttack, playHostileEnergyShot, playHostileFlame, playHostileGunshot, playHostileNailgun,
  playHostilePsiCast, playHostileShotgun, playSoundAt,
} from '../audio';
import { applyDamageRelationPenalty } from '../factions';
import { calculateDamage, applyHitStaggerAndKnockback, calculateReloadTime, setCombatClock } from '../combat';
import { hasLineOfSight, lineCoverCells } from '../../world/line_of_sight';
import { clearFogInZone } from '../fog_zone';
import { agiAttackSpeedMult, meleeDamage } from '../rpg';
import { zhelemishIncomingMeleeDamage } from '../status';
import { spawnBloodHit, spawnDeathPool } from '../blood_fx';
import { consumeDurability, getWeaponStats, removeItem, addItem, pickupDrop } from '../inventory';
import { ITEMS } from '../../data/items';
import { isDebugOnePunchManEnabled, keepDebugOnePunchManAlive } from '../debug_cheats';
import { entityDisplayName } from '../../entities/monster';
import { assignActorPath, followPath, tryAssignPathToCell } from './pathfinding';
import { Spr, hostileProjectileSprite } from '../../entities/sprite_index';
import { findCombatTarget, dropNpcInventory, deterministicScanCd } from './monster';
import { recordEntityKill } from '../alife_rating';
import { recordPlayerDamage } from '../damage';
import { ENTITY_MASK_MONSTER, ENTITY_MASK_ACTOR, ENTITY_MASK_ITEM_DROP, getEntityIndex } from '../entity_index';
import { applyMonsterIncomingDamage } from '../monster_traits';
import { publishWeaponNoise } from '../noise';
import { isPlayerEntity } from '../player_actor';
import { getRecentCombatThreat, notifyActorDamaged, npcCombatProfile } from '../combat_stimulus';
import { stepActorBy } from '../movement_collision';
import {
  emitMarkovBark,
  BARK_CHANCE_COMBAT,
  BARK_CHANCE_FLEE,
  BARK_CHANCE_KILL,
  BARK_CHANCE_WOUNDED,
} from './barks';
import { selectMeleeTarget } from '../melee_targeting';
import { publishEvent } from '../events';
import { rng } from '../../core/rand';
import { tryCombatOrbitStep } from './combat_orbit';
import { trySetMicroGoal } from './micro_goals';

/* ── Module-level bark refs (set each frame) ─────────────────── */
let _barkMsgs: Msg[] = [];
let _barkTime = 0;
export function setCombatContext(msgs: Msg[], time: number): void {
  _barkMsgs = msgs;
  _barkTime = time;
  // Пейн-реакции нужен рефрактерный период, а часов у неё своих нет: удар
  // приходит из пяти мест, и ни одно не тянет туда время. Кадр AI — то самое
  // единственное место, где время уже на руках.
  setCombatClock(time);
}

/* ── NPC flee from monsters (non-combatants) ─────────────────── */
const NPC_FLEE_DETECT_SQ = 10 * 10;
const NPC_FLEE_SCAN_CD = 1.5;
const NPC_FLEE_MONSTER_SCAN_CAP = 32;
const fleeMonsterQuery: Entity[] = [];
const npcMeleeHitQuery: Entity[] = [];
const combatLootQuery: Entity[] = [];

/* ── Combat loot grab: NPCs pick up nearby drops mid-fight ────── */
const COMBAT_LOOT_SCAN_CD = 1.0;
const COMBAT_LOOT_RANGE = 1.8;
const COMBAT_LOOT_RANGE_SQ = COMBAT_LOOT_RANGE * COMBAT_LOOT_RANGE;

function tryCombatLootGrab(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  ai.combatLootCd = (ai.combatLootCd ?? 0) - dt;
  if (ai.combatLootCd > 0) return;
  ai.combatLootCd = COMBAT_LOOT_SCAN_CD;

  const index = getEntityIndex();
  const count = index.queryRadiusCapped(e.x, e.y, COMBAT_LOOT_RANGE, combatLootQuery, ENTITY_MASK_ITEM_DROP, 8);
  let grabbed = false;
  for (let i = 0; i < count; i++) {
    const drop = combatLootQuery[i];
    if (!drop.alive || drop.type !== EntityType.ITEM_DROP) continue;
    if (world.dist2(drop.x, drop.y, e.x, e.y) > COMBAT_LOOT_RANGE_SQ) continue;
    pickupDrop(world, drop, e, _barkMsgs, _barkTime);
    grabbed = true;
  }
  if (grabbed) npcAutoEquipBestWeapon(e);
}

export function trySimulateNpcAmmoRestock(e: Entity, dt: number): void {
  if (rng() > 0.1 * dt) return;

  const weaponId = e.weapon;
  if (!weaponId) return;

  const ws = getWeaponStats(e, weaponId);
  if (!ws || !ws.ammoType) return;

  const hasAmmo = e.inventory?.some(s => s.defId === ws.ammoType && s.count > 0);
  if (hasAmmo) return;

  const ammoDef = ITEMS[ws.ammoType];
  if (!ammoDef) return;

  const price = Math.max(1, ammoDef.value || 1);
  const count = Math.max(1, Math.floor(40 / price));
  addItem(e, ws.ammoType, count);
}

export function tryFleeFromMonster(
  world: World, _entities: Entity[], e: Entity, dt: number, time = _barkTime,
): boolean {
  const isCombatant = npcIsBrave(e);
  if (isCombatant) return false;

  const ws = npcCombatItemId(e).ws;
  if (ws && (ws.dmg > 3 || ws.isRanged)) return false;

  const ai = e.ai!;

  if (ai.goal === AIGoal.FLEE && ai.timer > 0) {
    return continueFlee(world, e, dt);
  }
  const damageThreat = getRecentCombatThreat(e, time);
  if (damageThreat?.reaction === 'flee' && damageThreat.attacker.alive) {
    return startFleeFromThreat(world, e, damageThreat.attacker, dt);
  }

  ai.combatScanCd = (ai.combatScanCd ?? 0) - dt;
  if (ai.combatScanCd! > 0 && ai.goal !== AIGoal.FLEE) return false;
  ai.combatScanCd = NPC_FLEE_SCAN_CD;

  let nearestMonster: Entity | null = null;
  let nearestD2 = NPC_FLEE_DETECT_SQ;
  getEntityIndex().queryRadiusCapped(e.x, e.y, 10, fleeMonsterQuery, ENTITY_MASK_MONSTER, NPC_FLEE_MONSTER_SCAN_CAP);
  for (const other of fleeMonsterQuery) {
    if (!other.alive || other.type !== EntityType.MONSTER) continue;
    const d2 = world.dist2(e.x, e.y, other.x, other.y);
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearestMonster = other;
    }
  }

  if (!nearestMonster) {
    if (ai.goal === AIGoal.FLEE) {
      ai.goal = AIGoal.IDLE;
      ai.path = [];
      ai.pi = 0;
      ai.timer = 1;
    }
    return false;
  }

  return startFleeFromThreat(world, e, nearestMonster, dt);
}

/* ── NPC faction combat: attack nearby hostile entities ────────── */
/**
 * Докуда человек смотрит по сторонам, если не рвётся в бой.
 *
 * ЗАМЕРЕНО 2026-08-23, не повторять: подъём до радиуса бегства (`10`, тот же,
 * которым небоец и так высматривает монстра) не сдвинул слепоту на реальном
 * этаже НИ НА ДЕСЯТУЮ (42.9% до и после) и стоил +3.5% кадра на четырёх тысячах
 * акторов. Слепота там держится стенами, а не радиусом: стенд считает дефектом
 * любого врага в 12 клетках, включая тех, кто за бетоном.
 */
const NPC_COMBAT_RANGE = 8;
const NPC_CHASE_RANGE = 18;
const NPC_ATTACK_RANGE = 1.3;
const NPC_COMBAT_CD = 1.2;
/**
 * Сколько живёт выпущенный снаряд. Ровно те числа, что `npcFireProjectile`
 * кладёт в `projLife`: дальность боя обязана считаться по ТОМУ САМОМУ снаряду,
 * который полетит, иначе стрелок целится туда, куда пуля не долетает.
 */
const PROJ_LIFE_FLAME_SEC = 0.7;
const PROJ_LIFE_SEC = 3.0;
const MELEE_KNOCKBACK_CAP = 0.65;
const MELEE_STAGGER_CAP = 0.35;
const KNOCKBACK_BODY_R = 0.16;
const NPC_FLEE_THREAT_RATIO = 0.65;
const NPC_FLEE_ANGLE_OFFSETS = [0, 0.55, -0.55, 1.1, -1.1, 1.75, -1.75, Math.PI] as const;
const NPC_FLEE_DISTANCES = [20, 14, 8] as const;

interface NpcRangedProfile {
  minRange: number;
  maxRange: number;
}

/**
 * Наследие двух режимов боя, которых больше нет.
 *
 * Единственный продовый вызов шёл с `simple: true`, поэтому «полный» режим —
 * телеграф выстрела, орбита на откате, сообщение о потере линии огня — не
 * исполнялся НИКОГДА, а `visualProjectiles: false` открывал скрытый hitscan
 * `npcApplyDistantRangedDamage`: шестой путь урона мимо единой двери. Всё это
 * снесено, ценное (орбита между выстрелами) вложено в оставшийся путь. Поле
 * держится ровно до тех пор, пока `systems/ai/index.ts` не перестанет их
 * передавать; ни одно из них уже ни на что не влияет.
 */

/* Кого боец вообще считает целью — свойство правил, а не конкретного бойца:
 * предикат ничего не захватывает. На верхнем уровне он живёт в единственном
 * экземпляре вместо двух тысяч одинаковых замыканий за кадр. Тождество тоже
 * сохраняется: combatTargetQueryMask сравнивает фильтр с canBeMonsterTarget,
 * и этот — по-прежнему не он, то есть маска запроса та же. */
function npcCombatTargetFilter(o: Entity): boolean {
  return o.type === EntityType.NPC || o.type === EntityType.MONSTER || isPlayerEntity(o);
}

/**
 * Сколько актор идёт по уже назначенному боевому маршруту до пересборки.
 * Ровно тот же порядок, что у погони монстра (0.75..2.3 с): цель за полсекунды
 * не уходит настолько, чтобы маршрут перестал вести в её сторону.
 */
const NPC_COMBAT_REPATH_SEC = 0.5;

/**
 * Подойти к боевой цели.
 *
 * Сторож здесь ОБЯЗАН быть чистым троттлом по `ai.timer`, а не `actorRepathDue`.
 * Причина замерена на стенде: пустой путь означает одновременно «маршрут не
 * найден» и «цель вплотную, маршрут не нужен», а в эту ветку актор попадает и
 * стоя рядом с целью — когда до неё перекрыта линия огня. Тогда «дошёл» истинно
 * КАЖДЫЙ кадр, клетка цели мигает между двумя соседними от собственного шага
 * жертвы, и `tryAssignPathToCell` каждый кадр строит новый полный маршрут:
 * замер давал 58–60 назначений в секунду на актора против 0.1–0.3 у остальных.
 *
 * Неудача поиска отдельного обращения не требует: `assignActorPath` сама пишет
 * в тот же `ai.timer` более длинный отрицательный кэш.
 */
function approachCombatTarget(world: World, e: Entity, target: Entity, dt: number): void {
  const ai = e.ai!;
  ai.timer -= dt;
  if (ai.timer <= 0) assignActorPath(world, e, target.x, target.y, NPC_COMBAT_REPATH_SEC);
  followPath(world, e, dt);
}

function continueFlee(world: World, e: Entity, dt: number): boolean {
  const ai = e.ai!;
  if (ai.path.length === 0 || ai.pi >= ai.path.length) return false;
  ai.timer -= dt;
  const savedSpeed = e.speed;
  e.speed *= 1.3;
  followPath(world, e, dt);
  e.speed = savedSpeed;
  return ai.path.length > 0 && ai.timer > 0;
}

function startFleeFromThreat(world: World, e: Entity, threat: Entity, dt: number): boolean {
  const ai = e.ai!;
  emitMarkovBark(e, _barkMsgs, _barkTime, 'flee', 'Отходим!', BARK_CHANCE_FLEE, '#ff8');
  ai.goal = AIGoal.FLEE;
  const dx = world.delta(threat.x, e.x);
  const dy = world.delta(threat.y, e.y);
  const len = Math.sqrt(dx * dx + dy * dy);
  let nx: number, ny: number;
  if (len > 0.1) {
    nx = dx / len; ny = dy / len;
  } else {
    const a = rng() * Math.PI * 2;
    nx = Math.cos(a); ny = Math.sin(a);
  }
  const baseAngle = Math.atan2(ny, nx);
  for (const dist of NPC_FLEE_DISTANCES) {
    for (const offset of NPC_FLEE_ANGLE_OFFSETS) {
      const a = baseAngle + offset;
      const fleeX = world.wrap(Math.floor(e.x + Math.cos(a) * dist));
      const fleeY = world.wrap(Math.floor(e.y + Math.sin(a) * dist));
      if (world.solid(fleeX, fleeY)) continue;
      if (tryAssignPathToCell(world, e, fleeX, fleeY) !== 'assigned') continue;
      ai.timer = 2.4 + dist * 0.05;
      return continueFlee(world, e, dt);
    }
  }

  const step = Math.max(0.25, Math.min(0.9, e.speed * 1.5 * dt));
  const moved = stepActorBy(world, e, nx * step, ny * step, KNOCKBACK_BODY_R);
  ai.path = [];
  ai.pi = 0;
  ai.timer = 0;
  return moved;
}

function npcIsBrave(e: Entity): boolean {
  return npcCombatProfile(e).brave;
}

function npcCombatItemScore(e: Entity, itemId: string | undefined, precomputedWs?: import('../../data/catalog').WeaponStats): number {
  const id = itemId ?? '';
  if (!id) return 0;
  const ws = precomputedWs ?? getWeaponStats(e, id);
  if (!ws) return 0;
  if (ws.psiCost && (!e.rpg || e.rpg.psi < ws.psiCost)) return 0;
  // NPC infinite ammo — don't gate combat score on inventory ammo
  return ws.isRanged ? ws.dmg * (ws.pellets ?? 1) * 1.6 + (ws.aoeRadius ? 30 : 0) : ws.dmg;
}

function npcCombatItemId(e: Entity): { id: string; ws: import('../../data/catalog').WeaponStats } {
  const weaponId = e.weapon ?? '';
  const toolId = e.tool ?? '';
  
  const toolWs = toolId ? getWeaponStats(e, toolId) : WEAPON_STATS[''];
  const toolScore = toolWs?.psiCost ? npcCombatItemScore(e, toolId, toolWs) : 0;
  
  const weaponWs = weaponId ? getWeaponStats(e, weaponId) : WEAPON_STATS[''];
  const weaponScore = npcCombatItemScore(e, weaponId, weaponWs);
  
  return toolScore > weaponScore ? { id: toolId, ws: toolWs } : { id: weaponId, ws: weaponWs };
}

function npcThreatScore(e: Entity, precomputedWs?: import('../../data/catalog').WeaponStats): number {
  const ws = precomputedWs ?? npcCombatItemId(e).ws;
  const weapon = ws.isRanged ? ws.dmg * (ws.pellets ?? 1) * 1.6 : ws.dmg;
  const hp = Math.max(0, e.hp ?? 20) * 0.22;
  const level = Math.max(1, e.rpg?.level ?? 1) * 3;
  return hp + weapon + level;
}

function npcShouldFleeTarget(e: Entity, target: Entity, eWs?: import('../../data/catalog').WeaponStats, brave = npcIsBrave(e)): boolean {
  if (brave) return false;
  return npcThreatScore(e, eWs) < npcThreatScore(target) * NPC_FLEE_THREAT_RATIO;
}

export function tryFactionCombat(
  world: World, entities: Entity[], e: Entity, dt: number, _time: number, msgs: Msg[], nextId: { v: number }, state?: GameState,
): boolean {
  tryCombatLootGrab(world, e, dt);

  // Два выхода, которым не нужны ни оружие, ни цель, стояли ПОСЛЕ разбора
  // оружия: бегущий и оглушённый честно платили за две справки о снаряжении и
  // профиль дальнобойности, чтобы тут же выйти. Справки чистые, перенос выходов
  // выше них ничего в исходе не меняет.
  const ai = e.ai!;
  if (ai.goal === AIGoal.FLEE && ai.timer > 0) return continueFlee(world, e, dt);
  /* Боль сбивает УДАР, а не всего человека.
   *
   * Здесь стоял `return true`: оглушённый не делал ничего — не выбирал цель, не
   * убегал, не шёл. Монстр с частотой атаки раз в секунду держал так NPC почти
   * половину времени, двое — постоянно, и это читалось как «NPC тупит». Теперь
   * стаггер поднимает только откат атаки: цель ищется, бегство работает, ноги
   * несут. Замер порога и рефрактерного периода — `systems/combat.ts`. */
  if ((ai.staggerTimer ?? 0) > 0) {
    ai.staggerTimer = Math.max(0, (ai.staggerTimer ?? 0) - dt);
    e.attackCd = Math.max(e.attackCd ?? 0, ai.staggerTimer);
  }

  const combatItem = npcCombatItemId(e);
  const weaponId = combatItem.id;
  const ws = combatItem.ws;
  const rangedProfile = ws.isRanged ? npcRangedProfile(ws) : undefined;

  const damageThreat = getRecentCombatThreat(e, _time);
  const forcedTarget = damageThreat?.reaction !== 'startled' ? damageThreat?.attacker : undefined;
  // По сторонам смотрят все. Небоец в этой ветке не дерётся — он замечает
  // опасность и убегает; смелость и оружие решают лишь ДАЛЬНОСТЬ, с которой он
  // её замечает. Раньше сюда пускало «враждебен игроку»: мирный житель реагировал
  // на угрозу, только если этой угрозой был игрок, и спокойно стоял рядом с
  // враждебным ему соседом-NPC.

  // Дальность обнаружения — свойство НАБЛЮДАТЕЛЯ: насколько он готов к бою и
  // как далеко бьёт его оружие. От игрока она не зависит вовсе.
  //
  // Раньше здесь стояло `hostileToPlayer ? NPC_CHASE_RANGE : ...`, и это ломало
  // мир двумя способами сразу. Во-первых, дальность зрения бралась из отношения
  // к игроку, а не к тому, кого высматривают: в одном бою враждебная игроку
  // сторона видела на 18 клеток, дружественная — на 8, и полковник не замечал
  // противника в собственном зале. Во-вторых, она переключалась самим фактом
  // присутствия игрока на этаже — мир вёл себя по-разному в зависимости от того,
  // смотрит на него кто-нибудь или нет. Игрок здесь такой же NPC, как остальные.
  // Смелость — свойство личности, а не момента: одна справка на вызов вместо
  // двух (вторую брал npcShouldFleeTarget сразу следом).
  const brave = npcIsBrave(e);
  const braveRange = brave ? NPC_CHASE_RANGE : NPC_COMBAT_RANGE;
  const detectRange = forcedTarget
    ? Math.max(NPC_CHASE_RANGE, rangedProfile?.maxRange ?? NPC_COMBAT_RANGE)
    : Math.max(braveRange, rangedProfile?.maxRange ?? 0);
  const prevTarget = ai.combatTargetId;
  const target = forcedTarget?.alive
    ? forcedTarget
    : findCombatTarget(
      world, entities, e, dt,
      detectRange * detectRange, deterministicScanCd(e.id, 0.8, 0.4),
      npcCombatTargetFilter,
    );

  if (!target) {
    if (prevTarget !== undefined) {
      /* Потеря цели — повод ПОЙТИ ИСКАТЬ, а не ослепнуть на месте.
       *
       * Здесь стояло `combatScanCd = 5`: пять секунд без единого скана при живом
       * враге в десятке клеток. На реальном этаже это давало 42–45% времени
       * контакта вообще без боевой цели. Скан открывается сразу, а ноги получают
       * микроцель `search_lkp` — она была написана, исполнялась и не ставилась
       * НИ ОДНИМ вызовом во всей игре. */
      ai.combatTargetId = undefined;
      ai.goal = AIGoal.WANDER;
      ai.timer = 1;
      ai.combatScanCd = 0;
      const lost = getEntityIndex().byId.get(prevTarget);
      const threat = getRecentCombatThreat(e, _time);
      const lkpX = lost?.alive ? lost.x : threat?.lastKnownX;
      const lkpY = lost?.alive ? lost.y : threat?.lastKnownY;
      if (lkpX !== undefined && lkpY !== undefined) {
        trySetMicroGoal(e, 'search_lkp', {
          targetX: Math.floor(lkpX), targetY: Math.floor(lkpY), timer: NPC_COMBAT_CD * 4, sourceId: prevTarget,
        });
      }
    }
    return false;
  }
  if (damageThreat?.reaction === 'flee' || (damageThreat?.reaction !== 'fight' && npcShouldFleeTarget(e, target, ws, brave))) {
    ai.combatTargetId = target.id;
    return startFleeFromThreat(world, e, target, dt);
  }
  if (ai.combatTargetId !== target.id || prevTarget === undefined) {
    emitMarkovBark(e, msgs, _time, 'combat', 'В бой!', BARK_CHANCE_COMBAT, '#fa8');
  }
  ai.combatTargetId = target.id;
  ai.goal = AIGoal.HUNT;

  const bestDist = Math.sqrt(world.dist2(e.x, e.y, target.x, target.y));
  const atkSpeedMod = e.rpg ? agiAttackSpeedMult(e.rpg) : 1;

  // Reload logic for NPC — universal attack cadence (melee: swing cooldown, ranged: magazine reload)
  if (e.reloading) {
    e.reloadTimer = Math.max(0, (e.reloadTimer ?? 0) - dt);
    if (e.reloadTimer <= 0) {
      e.currentMag = ws.magazineSize ?? 1;
      e.reloading = false;
    }
    return true; // Block actions while reloading
  }
  /* Полный магазин при первой встрече с оружием.
   *
   * `currentMag` ставила ТОЛЬКО автоэкипировка, а оружие от генератора приходит
   * уже надетым — поэтому весь этаж начинал первый бой с фиктивной перезарядки:
   * с ППШ это 3.2 секунды неподвижности под огнём. Рукопашники попадали туда же,
   * потому что `undefined !== Infinity`. */
  if (e.currentMag === undefined) e.currentMag = ws.magazineSize ?? 1;
  if (!ws.psiCost && (e.currentMag ?? 0) <= 0 && ws.magazineSize !== Infinity) {
    e.reloading = true;
    e.reloadTimer = calculateReloadTime(ws.reloadTime ?? 1, e.rpg?.agi ?? 0);
    return true;
  }
  if (ws.isRanged && rangedProfile && bestDist < rangedProfile.maxRange && bestDist > rangedProfile.minRange) {
    /* Мебель на линии огня — ШТРАФ К ПРИЦЕЛУ, а не запрет.
     *
     * Раньше стеллаж, станок, аппарат, стол и парта работали бетоном: клетка
     * проходима, в ближнем бою через неё бьют, а стрелять нельзя. Стрелок стоял
     * вплотную через стол и не стрелял. Теперь каждое укрытие на пути добавляет
     * разброса примерно на клетку в точке цели — угловой размер помехи, а не
     * новая ручка. Бетон по-прежнему запрещает: `cover < 0`. */
    const cover = lineCoverCells(world, e.x, e.y, target.x, target.y, rangedProfile.maxRange);
    if (cover >= 0) {
      if ((e.attackCd ?? 0) <= 0) {
        const aimError = cover > 0 ? Math.atan2(cover, Math.max(1, bestDist)) : 0;
        if (npcCommitRangedShot(world, e, target, weaponId, ws, entities, nextId, atkSpeedMod, aimError, _time, state)) return true;
        npcAutoEquipBestWeapon(e);
        e.attackCd = Math.max(e.attackCd ?? 0, 0.35);
      } else {
        // Стрелок не столбенеет между выстрелами: держит дистанцию и смещается.
        tryCombatOrbitStep(world, e, target, bestDist, 0.6, dt);
      }
      return true;
    }
  }

  // Move toward target if too far for melee
  const meleeWs = ws;
  const meleeRange = meleeWs.range || NPC_ATTACK_RANGE;
  const effectiveReach = meleeRange + (meleeWs.hitRadius ?? 0.6);
  /* Проверка укрытия отсюда УБРАНА целиком, осталась только стена.
   *
   * Ей тут было нечего делать: за столом в ближнем бою не прячутся, клетка со
   * столом проходима, и монстры бьют через неё свободно. Итог в квартире был
   * такой: NPC стоит вплотную к врагу через стол, не бьёт, строит маршрут
   * нулевой длины и через несколько секунд уходит бродить. */
  if (bestDist > effectiveReach || !hasLineOfSight(world, e.x, e.y, target.x, target.y, effectiveReach + 0.5)) {
    approachCombatTarget(world, e, target, dt);
    return true;
  }

  // Melee attack
  if ((e.attackCd ?? 0) <= 0) {
    const dx = world.delta(e.x, target.x);
    const dy = world.delta(e.y, target.y);
    e.angle = Math.atan2(dy, dx); // ensure we face target before swinging
    
    getEntityIndex().queryRadius(e.x, e.y, effectiveReach + 0.5, npcMeleeHitQuery, ENTITY_MASK_ACTOR);
    const hitTarget = selectMeleeTarget(world, e, npcMeleeHitQuery, meleeRange, weaponId);
    
    if (hitTarget) {
      const baseDmg = meleeWs.dmg > 0 ? meleeWs.dmg : (5 + Math.floor(rng() * 8));
      const rawDmg = meleeDamage(e.rpg, weaponId, baseDmg);
      let dmg = zhelemishIncomingMeleeDamage(hitTarget, _time, rawDmg);
      if (hitTarget.type === EntityType.MONSTER) dmg = applyMonsterIncomingDamage(world, hitTarget, dmg);
      if (hitTarget.hp !== undefined) {
        const debugImmortalPlayerHit = isPlayerEntity(hitTarget) && isDebugOnePunchManEnabled();
        if (debugImmortalPlayerHit) {
          keepDebugOnePunchManAlive(hitTarget);
        } else {
          const actualDmg = calculateDamage(dmg, ws.damageType, hitTarget);
          hitTarget.hp -= actualDmg;
          applyHitStaggerAndKnockback(world, hitTarget, e.x, e.y, actualDmg);
          notifyActorDamaged(world, hitTarget, e, dmg, 'npc_melee', _time, state);
          if (isPlayerEntity(hitTarget)) recordPlayerDamage(state, e, dmg, `${entityDisplayName(e)} задел тебя: -${dmg}`);
          if (hitTarget.type === EntityType.NPC) {
            applyDamageRelationPenalty(e.faction, hitTarget.faction, dmg, hitTarget, e, state);
            if (hitTarget.hp > 0 && hitTarget.hp < (hitTarget.maxHp ?? 100) * 0.5) {
              emitMarkovBark(hitTarget, msgs, _time, 'wounded', 'Задело!', BARK_CHANCE_WOUNDED, '#f88');
            }
          }
          const hitAng = Math.atan2(world.delta(e.y, hitTarget.y), world.delta(e.x, hitTarget.x));
          spawnBloodHit(world, hitTarget.x, hitTarget.y, hitAng, dmg, hitTarget.type === EntityType.MONSTER);
          applyMeleeKnockback(world, e, hitTarget, meleeWs);
          if (hitTarget.hp <= 0) {
            recordEntityKill(e, hitTarget);
            hitTarget.alive = false;
            spawnDeathPool(world, hitTarget.x, hitTarget.y, hitTarget.type === EntityType.MONSTER);
            if (hitTarget.type === EntityType.NPC) dropNpcInventory(hitTarget, entities, nextId);
            emitMarkovBark(e, msgs, _time, 'combat', 'Готов.', BARK_CHANCE_KILL, '#da4');
            if (hitTarget.isFogBoss && hitTarget.fogBossZone !== undefined) {
              clearFogInZone(world, hitTarget.fogBossZone, msgs, _time);
            }
          }
        }
      }
    }
    if (!meleeWs.isRanged && meleeWs.durability > 0) {
      consumeDurability(e, msgs, _time, state, weaponId);
      if (!e.weapon || (weaponId === e.tool && !e.tool)) npcAutoEquipBestWeapon(e);
    }
    playSoundAt(playAttack, e.x, e.y);
    publishWeaponNoise(state, e, weaponId, meleeWs);
    e.attackCd = (meleeWs.speed || NPC_COMBAT_CD) * atkSpeedMod;
  }
  // Orbit around target while in melee range (circle-strafe between attacks)
  tryCombatOrbitStep(world, e, target, effectiveReach * 0.85, 0.4, dt);
  return true;
}

function applyMeleeKnockback(world: World, source: Entity, target: Entity, ws: WeaponStats): void {
  const force = Math.min(MELEE_KNOCKBACK_CAP, Math.max(0, ws.knockback ?? 0));
  if (force <= 0) return;

  let dx = world.delta(source.x, target.x);
  let dy = world.delta(source.y, target.y);
  let len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) {
    dx = Math.cos(source.angle);
    dy = Math.sin(source.angle);
    len = 1;
  }

  stepActorBy(world, target, dx / len * force, dy / len * force, KNOCKBACK_BODY_R);

  const stagger = Math.min(MELEE_STAGGER_CAP, 0.08 + force * 0.35);
  if (target.ai) target.ai.staggerTimer = Math.max(target.ai.staggerTimer ?? 0, stagger);
  if (!isPlayerEntity(target)) target.attackCd = Math.max(target.attackCd ?? 0, stagger);
}

/**
 * Сколько клеток пролетит снаряд этого оружия.
 *
 * Честная баллистика вместо эвристик: скорость снаряда на время его жизни — те
 * самые числа, с которыми снаряд и родится в `npcFireProjectile`. До этого
 * дальность выводилась потолком `NPC_RANGED_MAX = 13` и тремя порогами
 * («быстрый снаряд», «дробовик», «тяжёлое»), и они расходились с физикой в обе
 * стороны: макаров бил на 66 клеток, а стрелял с 13; огнемёт целился с 9, хотя
 * струя гаснет через 4.9. Луч удаления живёт своей длиной, а не полётом.
 */
function npcWeaponReach(ws: WeaponStats): number {
  if (ws.beamRange !== undefined) return ws.beamRange;
  const life = ws.projType === ProjType.FLAME ? PROJ_LIFE_FLAME_SEC : PROJ_LIFE_SEC;
  return (ws.projSpeed ?? 15) * life;
}

function npcRangedProfile(ws: WeaponStats): NpcRangedProfile {
  return {
    // Ближе собственного взрыва не стреляют. Отдельного порога это не требует:
    // радиус поражения у оружия уже записан.
    minRange: ws.aoeRadius ?? 0,
    maxRange: npcWeaponReach(ws),
  };
}

function npcCommitRangedShot(
  world: World,
  e: Entity,
  target: Entity,
  weaponId: string,
  ws: WeaponStats,
  entities: Entity[],
  nextId: { v: number },
  atkSpeedMod: number,
  aimError: number,
  _time: number,
  state?: GameState,
): boolean {
  if (state) {
    publishEvent(state, {
      type: 'faction_event',
      x: e.x, y: e.y,
      severity: 3,
      privacy: 'public',
      tags: ['gunfire'],
      data: { volume: 40 }
    });
  }

  if (ws.psiCost) {
    if (!e.rpg || e.rpg.psi < ws.psiCost) return false;
    e.rpg.psi -= ws.psiCost;
    npcFireProjectile(world, e, target, weaponId, ws, entities, nextId, aimError);
    playSoundAt(playHostilePsiCast, e.x, e.y);
    publishWeaponNoise(state, e, weaponId, ws);
    e.attackCd = ws.speed * atkSpeedMod;
    return true;
  }
  if (ws.ammoType) {
    removeItem(e, ws.ammoType, 1); // Consume if they have it, but don't fail if they don't
  }
  if (ws.magazineSize !== Infinity) {
    e.currentMag = Math.max(0, (e.currentMag ?? 0) - 1);
  }
  npcFireProjectile(world, e, target, weaponId, ws, entities, nextId, aimError);
  playSoundAt(hostileWeaponSound(weaponId), e.x, e.y);
  publishWeaponNoise(state, e, weaponId, ws);
  e.attackCd = ws.speed * atkSpeedMod;
  return true;
}

function hostileWeaponSound(weaponId: string): () => void {
  switch (weaponId) {
    case 'shotgun':
    case 'toz_shotgun':
      return playHostileShotgun;
    case 'nailgun':
    case 'harpoon_gun':
      return playHostileNailgun;
    case 'flamethrower':
      return playHostileFlame;
    case 'gauss':
    case 'plasma':
    case 'bfg':
      return playHostileEnergyShot;
    default:
      return playHostileGunshot;
  }
}

/* ── NPC: fire ranged projectile ──────────────────────────────── */
function npcFireProjectile(
  world: World, e: Entity, target: Entity, weaponId: string, ws: typeof WEAPON_STATS[string],
  entities: Entity[], nextId: { v: number }, aimError = 0,
): void {
  const dx = world.delta(e.x, target.x);
  const dy = world.delta(e.y, target.y);
  const ang = Math.atan2(dy, dx);
  const pellets = ws.pellets ?? 1;
  // Разброс оружия плюс то, что набежало от мебели на линии огня.
  const spread = (ws.spread ?? 0) + aimError;
  const spd = ws.projSpeed ?? 15;
  // Compensate gravity so projectile arrives at target height instead of hitting the floor
  const pt = ws.projType ?? ProjType.NORMAL;
  const gravity = pt === ProjType.FLAME ? 1.8 : pt === ProjType.GRENADE ? 2.5 : pt === ProjType.BFG ? 0.3 : 1.2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const flightTime = dist / Math.max(1, spd);
  const aimVz = 0.5 * gravity * flightTime;
  for (let p = 0; p < pellets; p++) {
    const a = ang + (rng() - 0.5) * spread;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const proj: Entity = {
      id: nextId.v++,
      type: EntityType.PROJECTILE,
      x: world.wrap(e.x + Math.cos(ang) * 0.85),
      y: world.wrap(e.y + Math.sin(ang) * 0.85),
      angle: a,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: hostileProjectileSprite(ws.projSprite ?? Spr.BULLET),
      vx: cos * spd,
      vy: sin * spd,
      vz: aimVz,
      projDmg: ws.dmg,
      projLife: pt === ProjType.FLAME ? PROJ_LIFE_FLAME_SEC : PROJ_LIFE_SEC,
      ownerId: e.id,
      weapon: weaponId,
      spriteScale: pt === ProjType.FLAME ? 0.55 : 0.25,
      spriteZ: 0.5,
      projType: ws.projType,
    };
    if (ws.aoeRadius) {
      proj.aoeRadius = ws.aoeRadius;
      proj.aoeDmg = ws.dmg;
    }
    entities.push(proj);
  }
}

/* ── NPC: auto-equip best weapon from inventory ───────────────── */
export function npcAutoEquipBestWeapon(e: Entity): void {
  if (!e.inventory) {
    e.weapon = '';
    if (getWeaponStats(e, e.tool ?? '')?.psiCost) e.tool = '';
    return;
  }
  let bestWeaponScore = 0;
  let bestWeaponId = '';
  let bestPsiScore = 0;
  let bestPsiId = '';
  for (const slot of e.inventory) {
    const w = getWeaponStats(e, slot.defId);
    if (!w) continue;
    if (w.psiCost && (!e.rpg || e.rpg.psi < w.psiCost)) continue;
    const effectiveDmg = w.isRanged ? w.dmg * (w.pellets ?? 1) * 2 : w.dmg;
    if (w.psiCost) {
      if (effectiveDmg > bestPsiScore) {
        bestPsiScore = effectiveDmg;
        bestPsiId = slot.defId;
      }
    } else if (effectiveDmg > bestWeaponScore) {
      bestWeaponScore = effectiveDmg;
      bestWeaponId = slot.defId;
    }
  }
  const prevWeapon = e.weapon;
  e.weapon = bestWeaponId;
  if (bestPsiId) e.tool = bestPsiId;
  else if (getWeaponStats(e, e.tool ?? '')?.psiCost) e.tool = '';
  // Initialize magazine when equipping a new ranged weapon so NPC fires immediately
  if (bestWeaponId && bestWeaponId !== prevWeapon) {
    const newWs = getWeaponStats(e, bestWeaponId);
    if (newWs?.isRanged && newWs.magazineSize !== Infinity) {
      e.currentMag = newWs.magazineSize ?? 1;
      e.reloading = false;
    }
  }
}
