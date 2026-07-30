/* Регресс-замок единого конвейера урона: calculateDamage + applyDamage.
   Инварианты: у каждого физического оружия есть damageType; резист надетой
   брони применяется по типу урона на всех путях (нетипизированный = кинетика). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DamageType, EntityType, type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { PHYS_WEAPON_STATS } from '../src/data/weapons';
import { calculateDamage, applyDamage } from '../src/systems/combat';

function actor(armorDefId?: string): Entity {
  return {
    id: 1, type: EntityType.NPC, x: 8.5, y: 8.5, angle: 0, pitch: 0,
    alive: true, speed: 0, sprite: 0, hp: 100, maxHp: 100, armorDefId,
  } as unknown as Entity;
}

const fakeState = { time: 0, msgs: [] } as unknown as GameState;

test('каждое физическое оружие имеет damageType', () => {
  for (const [id, ws] of Object.entries(PHYS_WEAPON_STATS)) {
    assert.notEqual(ws.damageType, undefined, `оружие без damageType: '${id}'`);
  }
});

test('типы урона выведены из ролевых тиров', () => {
  assert.equal(PHYS_WEAPON_STATS.shotgun.damageType, DamageType.BUCKSHOT);
  assert.equal(PHYS_WEAPON_STATS.toz_shotgun.damageType, DamageType.BUCKSHOT);
  assert.equal(PHYS_WEAPON_STATS.gauss.damageType, DamageType.ENERGY);
  assert.equal(PHYS_WEAPON_STATS.bfg.damageType, DamageType.ENERGY);
  assert.equal(PHYS_WEAPON_STATS.flamethrower.damageType, DamageType.FIRE);
  assert.equal(PHYS_WEAPON_STATS.makarov.damageType, DamageType.KINETIC);
  assert.equal(PHYS_WEAPON_STATS.pipe.damageType, DamageType.KINETIC);
});

test('calculateDamage: нетипизированный урон считается кинетикой', () => {
  const target = actor('armor_liquidator'); // КИН 80%
  assert.equal(calculateDamage(100, undefined, target), 20);
  assert.equal(calculateDamage(100, DamageType.KINETIC, target), 20);
});

test('calculateDamage: PSI-резист рясы культиста', () => {
  const target = actor('armor_cultist'); // ПСИ 75%
  assert.equal(calculateDamage(100, DamageType.PSI, target), 25);
});

test('calculateDamage: без брони урон не меняется', () => {
  assert.equal(calculateDamage(37, DamageType.BUCKSHOT, actor()), 37);
});

test('applyDamage: тип урона берётся из реестра оружия по weaponId', () => {
  const world = new World();
  const target = actor('armor_liquidator'); // КИН 80%, ДРБ 85%
  const kin = applyDamage(world, fakeState, target, { damage: 100, weaponId: 'makarov' });
  assert.equal(kin.damage, 20);
  const buck = applyDamage(world, fakeState, target, { damage: 100, weaponId: 'shotgun' });
  assert.equal(buck.damage, 15);
});

test('applyDamage: явный damageType важнее реестра, без брони урон цел', () => {
  const world = new World();
  const armored = actor('armor_cultist'); // ЭНР 40%
  const energy = applyDamage(world, fakeState, armored, {
    damage: 100, weaponId: 'makarov', damageType: DamageType.ENERGY,
  });
  assert.equal(energy.damage, 60);
  const bare = applyDamage(world, fakeState, actor(), { damage: 41, weaponId: 'shotgun' });
  assert.equal(bare.damage, 41);
});
