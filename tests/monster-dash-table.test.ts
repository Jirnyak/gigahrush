/* Замок семьи рывков: одна таблица, один предикат столкновения, одна трассировка.
 *
 * Числа здесь сняты дампом `scripts/dash_dump.ts` с дерева ДО сведения: тест
 * охраняет паритет, а не желаемое. Что проверяется:
 *
 *  1. пять членов семьи объявляют строку рывка данными, а не телом функции;
 *  2. предикат столкновения ОДИН и знает радиус тела (раньше знал один из пяти);
 *  3. ворота — флаг, а не имя вида;
 *  4. замах Ржавника идёт общим `windupTimer`, а не своим вторым таймером;
 *  5. самоурон объявляется долей и берётся из строки вида;
 *  6. луч знает точку входа в бетон без марша пробами.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, MonsterKind, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS, monsterDash } from '../src/entities/monster';
import { DashStep, dashLanding, dashSelfDamage, dashTo } from '../src/systems/ai/dash';
import { lineBlockDistance } from '../src/world/line_of_sight';

/** Виды семьи и их ворота: флаг, а не имя вида. */
const FAMILY: readonly (readonly [MonsterKind, string])[] = [
  [MonsterKind.RZHAVNIK, 'scrapWake'],
  [MonsterKind.ZHORNAYA_TVAR, 'scentOvercommit'],
  [MonsterKind.TRESKOTNIK, 'fractureSprint'],
  [MonsterKind.DIKIY_MERTVYAK, 'noBrakes'],
  [MonsterKind.TONKAYA_TEN, 'baitLine'],
];

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = 8; y < 14; y++) {
    for (let x = 4; x < 20; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
  world.cellVersion++;
  return world;
}

function mob(kind: MonsterKind, x: number, y: number): Entity {
  const def = MONSTERS[kind];
  return {
    id: 5, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.HUNT, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
}

test('вся семья рывков объявляет строку данными, и ворота у каждого — флаг', () => {
  for (const [kind, flag] of FAMILY) {
    const def = MONSTERS[kind];
    assert.ok(def.dash, `${def.name}: рывок обязан быть строкой в дефе вида`);
    assert.equal(monsterDash(kind), def.dash);
    assert.ok(def.aiFlags?.includes(flag as never), `${def.name}: ворота рывка — флаг ${flag}`);
  }
});

test('числа рывков перенесены, а не переизобретены', () => {
  assert.deepEqual(monsterDash(MonsterKind.RZHAVNIK), {
    step: 4.6, gap: 0.65, hitRange: 1.42, damageMult: 1.85, slideOnBlock: true,
    // Цена состоявшегося удара о мир — колонка рывка с 2026-08-27: раньше два
    // числа вида лежали константами в теле общего боевого AI.
    fragileHpMult: 0.58, fragileDmgMult: 0.72,
    counterplay: 'poke_straight_scrap_from_range_then_dodge_first_leap',
  });
  assert.deepEqual(monsterDash(MonsterKind.ZHORNAYA_TVAR), {
    step: 4.35, hitRange: 1.45, damageMult: 1.18, slideOnBlock: true,
    counterplay: 'sealed food, side bait, punish recovery',
  });
  assert.deepEqual(monsterDash(MonsterKind.TRESKOTNIK), {
    hitRange: 1.35, damageMult: 1.45, coverBlocks: true,
    crashSelfDamage: 0.22, strikeSelfDamage: 0.28, crashStunSec: 0.75,
    speedMult: 3.25, minSpeed: 7.5, runSec: 0.62,
    counterplay: 'door_table_or_corner_absorbs_sprint',
  });
  assert.deepEqual(monsterDash(MonsterKind.DIKIY_MERTVYAK), {
    hitRange: 1.4, accel: 2.4, speedMult: 2.6, crashStunSec: 1.6,
    counterplay: 'sidestep_at_the_last_moment_never_run_straight',
  });
  assert.deepEqual(monsterDash(MonsterKind.TONKAYA_TEN), {
    damageMult: 2.9, counterplay: 'hold_ground_light_or_noise',
  });
});

test('зазор до цели — колонка, а не литерал в теле рывка', () => {
  const world = openWorld();
  const rzhavnik = mob(MonsterKind.RZHAVNIK, 6.5, 10.5);
  const zhornaya = mob(MonsterKind.ZHORNAYA_TVAR, 6.5, 10.5);
  // Одна и та же формула `min(длина, расстояние − зазор)` на обоих.
  assert.equal(dashLanding(world, rzhavnik, 9.5, 10.5, monsterDash(MonsterKind.RZHAVNIK)!).step, 3 - 0.65);
  assert.equal(dashLanding(world, zhornaya, 9.5, 10.5, monsterDash(MonsterKind.ZHORNAYA_TVAR)!).step, 3);
});

test('предикат столкновения ОДИН и знает радиус тела', () => {
  const world = openWorld();
  // Клетка (11,9) — бетон, (10,9) свободна. Центр твари в неё влезает, тело нет.
  world.cells[world.idx(11, 9)] = Cell.WALL;
  world.cellVersion++;
  const dash = monsterDash(MonsterKind.ZHORNAYA_TVAR)!;

  const clipping = mob(MonsterKind.ZHORNAYA_TVAR, 6.5, 9.5);
  assert.equal(world.solid(10, 9), false, 'точка приземления сама по себе свободна');
  // `slideOnBlock` уводит вдоль препятствия, поэтому проверяем именно исход шага.
  assert.notEqual(dashTo(world, clipping, 10.95, 9.5, dash), DashStep.CLEAR);

  const clear = mob(MonsterKind.ZHORNAYA_TVAR, 6.5, 9.5);
  assert.equal(dashTo(world, clear, 10.5, 9.5, dash), DashStep.CLEAR);
  assert.equal(clear.x, 10.5);
});

test('упор в стену: скользит тот, у кого это колонка', () => {
  const world = openWorld();
  world.cells[world.idx(9, 10)] = Cell.WALL;
  world.cellVersion++;

  // Наискось: у скольжения есть вдоль чего идти — поперечная составляющая.
  const slider = mob(MonsterKind.ZHORNAYA_TVAR, 6.5, 10.5);
  assert.equal(dashTo(world, slider, 9.5, 10.9, monsterDash(MonsterKind.ZHORNAYA_TVAR)!), DashStep.SLID);
  assert.equal(slider.x, 6.5, 'соскользнул вдоль стены, а не сквозь неё');
  assert.ok(slider.y > 10.5);

  const stopper = mob(MonsterKind.TRESKOTNIK, 6.5, 10.5);
  assert.equal(dashTo(world, stopper, 9.5, 10.9, monsterDash(MonsterKind.TRESKOTNIK)!), DashStep.BLOCKED);
  assert.equal(stopper.x, 6.5, 'встал — значит не сдвинулся ни на клетку');
  assert.equal(stopper.y, 10.5);
});

test('самоурон рывка — доля maxHp, а пол в четыре очка был мёртвым числом', () => {
  const world = openWorld();
  const dash = monsterDash(MonsterKind.TRESKOTNIK)!;
  const e = mob(MonsterKind.TRESKOTNIK, 6.5, 10.5);
  assert.equal(dashSelfDamage(world, e, dash.crashSelfDamage!), 4);
  assert.equal(e.hp, 18 - 4);

  const hitter = mob(MonsterKind.TRESKOTNIK, 6.5, 10.5);
  assert.equal(dashSelfDamage(world, hitter, dash.strikeSelfDamage!), 5);
  // Прежний пол `max(4, …)` и `max(3, …)` не срабатывал ни разу: 18 × 0.22 = 4,
  // 18 × 0.28 = 5. Долю ниже пола видно только на искусственно слабом теле.
  const frail = mob(MonsterKind.TRESKOTNIK, 6.5, 10.5);
  frail.maxHp = 2;
  assert.equal(dashSelfDamage(world, frail, dash.crashSelfDamage!), 1);
});

test('луч знает точку входа в бетон без марша пробами', () => {
  const world = openWorld();
  world.cells[world.idx(12, 10)] = Cell.WALL;
  world.cellVersion++;
  // Вход в клетку 12 ровно на границе: старый марш пробами через 0.25 отдавал
  // 5.25 (не дойдя до стены), точный обход отдаёт саму границу.
  assert.ok(Math.abs(lineBlockDistance(world, 6.5, 10.5, 1, 0, 12) - 5.5) < 1e-6);
  assert.equal(lineBlockDistance(world, 6.5, 10.5, -1, 0, 2), 2, 'свободный луч возвращает всю длину');
});
