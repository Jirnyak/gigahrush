/* ── Shared hooks for monster-specific counterplay outcomes ──── */

import { DamageType, MonsterKind, type Entity, type GameState } from '../core/types';
import { World } from '../core/world';
import { WEAPON_STATS } from '../data/catalog';
import { projTypeDamageType } from '../data/weapons';
import { monsterDamageFloor } from '../entities/monster';
import {
  isBorshchevikCuttingWeapon,
  recordBorshchevikBurned,
  recordBorshchevikCut,
} from './borshchevik';
import {
  isBloodPlantCuttingWeapon,
  recordBloodPlantBurned,
  recordBloodPlantRootCut,
} from './blood_plant';
import {
  recordFogSharkIgnited,
  type FogSharkCollateralKillHandler,
} from './fog_shark';

/**
 * Чем бьёт этот снаряд. ОДИН ключ на все три уязвимости.
 *
 * Прежде их было три копии одного предиката (`is*FireProjectile`), и каждая
 * читала свою пару спрайтов вместе с видом снаряда. Огонь опознаётся типом
 * урона: оружие в руке старше вида снаряда, ровно как в единой двери.
 */
function projectileDamageType(projectile: Entity): DamageType | undefined {
  return (projectile.weapon !== undefined ? WEAPON_STATS[projectile.weapon]?.damageType : undefined)
    ?? projTypeDamageType(projectile.projType);
}

/** Чем бьёт эта рука в ближнем бою. */
function meleeDamageType(weaponId: string | undefined): DamageType | undefined {
  return weaponId !== undefined ? WEAPON_STATS[weaponId]?.damageType : undefined;
}

/**
 * Порог живучести вида по типу урона снаряда.
 *
 * Тот же порог считает и единая дверь (`applyMonsterArmorHit`), поэтому шаг
 * идемпотентен: `max` от уже поднятого числа ничего не меняет. Здесь он нужен
 * точке сборки — по этому числу она рисует кровь и печатает сообщение.
 */
export function adjustMonsterProjectileDamage(target: Entity, projectile: Entity, baseDamage: number): number {
  return Math.max(baseDamage, monsterDamageFloor(target, projectileDamageType(projectile)));
}

export function recordMonsterProjectileDeath(
  world: World,
  state: GameState,
  target: Entity,
  projectile: Entity,
  actor?: Entity,
  onKill?: FogSharkCollateralKillHandler,
  _entities?: readonly Entity[],
): void {
  if (projectileDamageType(projectile) !== DamageType.FIRE) return;
  recordMonsterFireDeath(world, state, target, actor, onKill);
}

export function recordMonsterMeleeDeath(
  world: World,
  state: GameState,
  target: Entity,
  weaponId: string | undefined,
  actor?: Entity,
  onKill?: FogSharkCollateralKillHandler,
  _entities?: readonly Entity[],
): void {
  if (target.monsterKind === MonsterKind.BORSHCHEVIK && isBorshchevikCuttingWeapon(weaponId)) {
    recordBorshchevikCut(world, state, target, actor);
  }
  if (target.monsterKind === MonsterKind.BLOOD_PLANT && isBloodPlantCuttingWeapon(weaponId)) {
    recordBloodPlantRootCut(world, state, target, actor);
  }
  if (meleeDamageType(weaponId) === DamageType.FIRE) {
    recordMonsterFireDeath(world, state, target, actor, onKill);
  }
}

/** Что оставляет за собой смерть в огне. Рука роли не играет — играет огонь. */
function recordMonsterFireDeath(
  world: World,
  state: GameState,
  target: Entity,
  actor: Entity | undefined,
  onKill: FogSharkCollateralKillHandler | undefined,
): void {
  if (target.monsterKind === MonsterKind.BORSHCHEVIK) recordBorshchevikBurned(world, state, target, actor);
  if (target.monsterKind === MonsterKind.BLOOD_PLANT) recordBloodPlantBurned(world, state, target, actor);
  if (target.monsterKind === MonsterKind.FOG_SHARK) recordFogSharkIgnited(world, state, target, actor, onKill);
}
