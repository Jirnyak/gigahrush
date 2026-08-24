import { Entity, DamageType, type GameState } from '../core/types';
import type { World } from '../core/world';
import { ITEMS, WEAPON_STATS } from '../data/catalog';
import { applyMonsterArmorHit, type MonsterArmorHitInput, type MonsterArmorHitResult } from './monster_armor';

export function calculateDamage(baseDamage: number, damageType: DamageType | undefined, target: Entity): number {
  let resist = 0;
  if (target.armorDefId) {
    const armorDef = ITEMS[target.armorDefId];
    if (armorDef && armorDef.resistances) {
      // Нетипизированный источник урона считается кинетикой — иначе резисты брони молча не работают.
      resist = armorDef.resistances[damageType ?? DamageType.KINETIC] ?? 0;
    }
  }
  return Math.max(0, baseDamage * (100 - resist) / 100);
}

/* Единый конвейер урона: резист надетой брони цели (по типу урона оружия),
   затем врождённая броня монстров. Тип берётся из input.damageType, иначе
   из реестра оружия по weaponId, иначе кинетика. */
export function applyDamage(
  world: World,
  state: GameState,
  target: Entity,
  input: MonsterArmorHitInput & { damageType?: DamageType },
): MonsterArmorHitResult {
  const damageType = input.damageType
    ?? (input.weaponId !== undefined ? WEAPON_STATS[input.weaponId]?.damageType : undefined);
  const typed = Math.round(calculateDamage(input.damage, damageType, target));
  if (typed === input.damage) return applyMonsterArmorHit(world, state, target, input);
  return applyMonsterArmorHit(world, state, target, { ...input, damage: typed });
}

/**
 * Ниже какой доли максимального здоровья удар пейн-реакции НЕ даёт.
 *
 * Здесь стоял `0.01`: пейн-стан вешала любая царапина, и очередь из ППШ (8 урона
 * при сотне здоровья, выстрел раз в 0.07 с) держала цель в непрерывном стан-локе.
 * Порог читается как «заметный удар»: десятая часть здоровья за раз.
 */
const STAGGER_MIN_HP_RATIO = 0.1;

/**
 * Толчок остаётся на прежнем, низком пороге. Отскок — это физика попадания, а не
 * боль: дробь по крупной твари каждой дробиной толкает и должна толкать дальше.
 */
const KNOCKBACK_MIN_HP_RATIO = 0.01;

/**
 * Часы боя для рефрактерного периода пейн-реакции.
 *
 * Вычесть время здесь не из чего: функция не получает ни мира, ни времени, а
 * зовут её все пути урона, включая единую дверь `damageActor`. Отсчёт ставит
 * кадр AI, у которого время и так на руках (`setCombatContext` → сюда).
 */
let combatClock = 0;
export function setCombatClock(time: number): void {
  combatClock = time;
}

/**
 * Докуда цель уже «отболела» и новой пейн-реакции не берёт.
 *
 * Транзиентно и снаружи ядра: свойство схватки, а не сущности, в сейв не идёт и
 * умирает вместе с актором. Длина периода не отдельная ручка — она РАВНА самому
 * стаггеру, то есть больше половины времени боль занять не может даже под
 * непрерывным огнём: `fight.md` требует ровно этого («шанс/кулдаун, чтобы не
 * было stunlock»).
 */
const staggerRefractory = new WeakMap<Entity, number>();

export function applyHitStaggerAndKnockback(world: World, target: Entity, sourceX: number, sourceY: number, damage: number): void {
  if (damage <= 0 || !target.alive) return;
  const maxHp = target.maxHp || 100;
  const ratio = damage / maxHp;
  if (ratio <= KNOCKBACK_MIN_HP_RATIO) return;

  // Asymptotic stagger up to 1 second
  const staggerTime = Math.min(1.0, (ratio * 1.5) / (ratio * 1.5 + 0.2));

  if (ratio > STAGGER_MIN_HP_RATIO && combatClock >= (staggerRefractory.get(target) ?? -Infinity)) {
    staggerRefractory.set(target, combatClock + staggerTime * 2);
    target.staggerTimer = Math.max(target.staggerTimer ?? 0, staggerTime);
    if (target.ai) target.ai.staggerTimer = Math.max(target.ai.staggerTimer ?? 0, staggerTime);
  }

  // Knockback. Направление считается через тор: сырое вычитание на шве
  // (стрелок у x=1023, цель у x=0) даёт нормаль в минус и толкает жертву
  // ОБРАТНО в атакующего — единственное место отдачи, где это не учитывалось.
  let dx = world.delta(sourceX, target.x);
  let dy = world.delta(sourceY, target.y);
  const dist = Math.hypot(dx, dy);
  if (dist > 0.01) {
    dx /= dist;
    dy /= dist;
    // push force scales with stagger intensity (cells/sec)
    const pushForce = staggerTime * 12.0;
    target.vx = (target.vx ?? 0) + dx * pushForce;
    target.vy = (target.vy ?? 0) + dy * pushForce;
  }
}



export function calculateReloadTime(baseReload: number, agility: number): number {
  const MIN_RELOAD_RATIO = 0.25; // 25% is the maximum possible speedup
  const k = 0.05; // Scaling factor

  // Asymptotic formula
  const multiplier = MIN_RELOAD_RATIO + (1 - MIN_RELOAD_RATIO) * Math.exp(-k * agility);
  return baseReload * multiplier;
}
