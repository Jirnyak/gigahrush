/**
 * Тип урона объявляет ВИД, а не вызов.
 *
 * До 2026-08-27 у `MonsterDef` не было поля типа урона вовсе: кислотная плеть
 * слизневика, споровый выдох ковра и удар тени считались той же кинетикой, что и
 * кувалда, и упирались в те же проценты бронеплиты. Здесь заперты обе половины
 * правила — что объявление есть и что оно ДОХОДИТ до расчёта, — плюс два
 * запрета на мусор в данных.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { DamageType, EntityType, MonsterKind, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS, monsterAttackDamageType, monsterDamageFloor } from '../src/entities/monster';
import { applyDamage } from '../src/systems/combat';
import { makeGameState, makeTestEntity } from './helpers';

const KINDS = Object.keys(MONSTERS).map(Number) as MonsterKind[];

test('объявленный тип урона — настоящий член перечисления', () => {
  const known = new Set(Object.values(DamageType).filter((v): v is DamageType => typeof v === 'number'));
  for (const kind of KINDS) {
    const declared = MONSTERS[kind].damageType;
    if (declared === undefined) continue;
    assert.ok(known.has(declared), `${MONSTERS[kind].name}: неизвестный тип урона`);
  }
});

test('кинетику никто не объявляет вслух: молчание И ЕСТЬ кинетика', () => {
  /* Явный `DamageType.KINETIC` в дефе — мёртвая запись: она ничего не меняет и
   * создаёт вид, будто у вида есть решение там, где его нет. */
  for (const kind of KINDS) {
    assert.notEqual(
      MONSTERS[kind].damageType,
      DamageType.KINETIC,
      `${MONSTERS[kind].name}: кинетика — умолчание, объявлять её нечем`,
    );
  }
});

test('каждый заведённый тип урона несёт хотя бы один вид', () => {
  /* Колонка матрицы без единого источника — тест, охраняющий пустоту. Огонь и
   * дробь сюда не входят намеренно: их несёт оружие, а не тварь, и это записано
   * в самом списке ожидаемых. */
  const counts = new Map<DamageType, number>();
  for (const kind of KINDS) {
    const declared = MONSTERS[kind].damageType;
    if (declared === undefined) continue;
    counts.set(declared, (counts.get(declared) ?? 0) + 1);
  }
  for (const expected of [DamageType.BIO, DamageType.ENERGY, DamageType.PSI]) {
    assert.ok((counts.get(expected) ?? 0) > 0, `${DamageType[expected]}: тип обязан кому-то принадлежать`);
  }
  // Огонь у тварей не объявлен ни у кого: горящих видов в игре нет.
  assert.equal(counts.get(DamageType.FIRE) ?? 0, 0);
  assert.equal(counts.get(DamageType.BUCKSHOT) ?? 0, 0);
});

test('объявление доходит до расчёта: резист рясы читает удар тени как ПСИ', () => {
  const world = new World();
  const state = makeGameState();
  const victim = (armorDefId: string): Entity =>
    makeTestEntity({ id: 3, type: EntityType.NPC, armorDefId, x: 50, y: 50, hp: 9000, maxHp: 9000 });
  const attacker = (kind: MonsterKind): Entity =>
    makeTestEntity({ id: 2, type: EntityType.MONSTER, monsterKind: kind, x: 51, y: 50, hp: 100, maxHp: 100 });

  /* Ряса культиста держит ПСИ на 75% и почти не держит кинетику. Пока у тварей
   * не было типа, тень била её на все сто — как ломом. */
  assert.equal(applyDamage(world, state, victim('armor_cultist'), { damage: 100, attacker: attacker(MonsterKind.SHADOW) }).damage, 25);
  assert.equal(applyDamage(world, state, victim('armor_cultist'), { damage: 100, attacker: attacker(MonsterKind.ZOMBIE) }).damage, 90);
  // Бронеплита ликвидатора — наоборот: держит зубы и почти не держит разум.
  assert.equal(applyDamage(world, state, victim('armor_liquidator'), { damage: 100, attacker: attacker(MonsterKind.ZOMBIE) }).damage, 20);
  assert.equal(applyDamage(world, state, victim('armor_liquidator'), { damage: 100, attacker: attacker(MonsterKind.SHADOW) }).damage, 95);

  assert.equal(monsterAttackDamageType(attacker(MonsterKind.SHADOW)), DamageType.PSI);
  assert.equal(monsterAttackDamageType(attacker(MonsterKind.ZOMBIE)), undefined, 'молчание = кинетика');
  assert.equal(monsterAttackDamageType(victim('armor_cultist')), undefined, 'у человека вида нет');
});

test('порог живучести объявлен видом и считается от максимума, а не от остатка', () => {
  const wounded = makeTestEntity({
    id: 4, type: EntityType.MONSTER, monsterKind: MonsterKind.BORSHCHEVIK,
    x: 5, y: 5, hp: 3, maxHp: MONSTERS[MonsterKind.BORSHCHEVIK].hp,
  });
  const full = { ...wounded, hp: MONSTERS[MonsterKind.BORSHCHEVIK].hp };
  // Добить раненого не должно стоить дешевле, чем целого.
  assert.equal(monsterDamageFloor(wounded, DamageType.FIRE), monsterDamageFloor(full, DamageType.FIRE));
  assert.ok(monsterDamageFloor(full, DamageType.FIRE) > 0);
  // Тип не тот — порога нет; не тварь — тем более.
  assert.equal(monsterDamageFloor(full, DamageType.KINETIC), 0);
  assert.equal(monsterDamageFloor({ maxHp: 100 }, DamageType.FIRE), 0);
});
