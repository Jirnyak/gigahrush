/* ── Семья замаха: таблица вместо десяти тел ──────────────────────
 *
 * Замок под сведение семьи «замах и телеграфируемый удар» (`problems.md`,
 * «Полная карта семей в ai/monster.ts», строка 1).
 *
 * До сведения одна мысль была написана трижды: таблица `bladeEliteTuning` на
 * два ближних вида, семь `switch (kind)` по видам дальнобойных и третья копия
 * в `MonsterBossReadability` на трёх боссов. Числа и тексты уехали в
 * `MonsterDef.windup`, ворота стали флагом `meleeWindup`.
 *
 * Числа ниже сняты ПРОГОНОМ старого кода (дамп всех видов из дерева до правки),
 * а не переписаны из головы: любое расхождение здесь — потерянный паритет.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { MONSTERS, monsterWindup, type MonsterDef } from '../src/entities/monster';
import { getMonsterEcology } from '../src/data/monster_ecology';

/** kind → [windupSec, minRange, range, color]. Снято с дерева до сведения. */
const FROZEN: ReadonlyArray<readonly [MonsterKind, number, number, number, string]> = [
  [MonsterKind.PAUPSINA, 0.48, 3.4, 11.5, '#ddd'],
  [MonsterKind.EYE, 0.85, 1.5, 15, '#cf6'],
  [MonsterKind.CHERNOSLIZ, 0.55, 0.75, 15, '#7f9'],
  [MonsterKind.PARAGRAPH, 0.8, 1.5, 15, '#f6c'],
  [MonsterKind.IDOL, 1.05, 1.25, 15, '#c8f'],
  [MonsterKind.KANTSELYARSKIY_IDOL, 1.12, 2.35, 15, '#fd6'],
  [MonsterKind.ROBOT, 0.62, 1.5, 15, '#6cf'],
  [MonsterKind.MANCOBUS, 1.05, 2.2, 14, '#fa4'],
  [MonsterKind.HERALD, 0.9, 1.8, 16, '#c8f'],
  [MonsterKind.CREATOR, 1.25, 2.4, 18, '#9f8'],
  // Свои такты, но та же строка таблицы.
  [MonsterKind.LAMPOGLAZ, 0.95, 0.9, 17, '#fd6'],
  [MonsterKind.TRUBNYY_AVTOMAT, 1.05, 2.25, 18, '#6cf'],
  [MonsterKind.KOSTOREZ, 1.35, 0, 2.25, '#fa4'],
  [MonsterKind.SAFEGUARD, 0.85, 0, 2.1, '#fa4'],
];

test('строка замаха каждого вида совпадает с числами до сведения', () => {
  for (const [kind, sec, minRange, range, color] of FROZEN) {
    const w = monsterWindup(kind);
    assert.ok(w, `${MonsterKind[kind]} обязан объявить строку замаха`);
    assert.equal(w!.windupSec, sec, `${MonsterKind[kind]}: длина замаха`);
    assert.equal(w!.minRange, minRange, `${MonsterKind[kind]}: мёртвая зона`);
    assert.equal(w!.range, range, `${MonsterKind[kind]}: дальность взвода`);
    assert.equal(w!.color, color, `${MonsterKind[kind]}: цвет строк`);
  }
});

test('боссы обслуживаются той же строкой: второй копии у них нет', () => {
  for (const kind of [MonsterKind.MANCOBUS, MonsterKind.HERALD, MonsterKind.CREATOR]) {
    const def = MONSTERS[kind];
    assert.equal(def.windup, undefined, `${MonsterKind[kind]}: второй строки замаха быть не должно`);
    assert.equal(monsterWindup(kind), def.boss, `${MonsterKind[kind]}: строкой замаха служит его же boss`);
  }
});

test('ворота замаха ближнего боя — флаг, а не имя вида', () => {
  const flagged = (Object.values(MONSTERS) as MonsterDef[])
    .filter(d => d.aiFlags?.includes('meleeWindup'))
    .map(d => d.kind)
    .sort((a, b) => a - b);
  assert.deepEqual(flagged, [MonsterKind.KOSTOREZ, MonsterKind.SAFEGUARD].sort((a, b) => a - b));
  for (const kind of flagged) {
    assert.ok(monsterWindup(kind), `${MonsterKind[kind]}: флаг без строки замаха бессмыслен`);
    assert.ok(monsterWindup(kind)!.staggerSec, `${MonsterKind[kind]}: дробь обязана сбивать этот замах`);
  }
});

test('единственное осознанное различие таблицы: мебель рвёт линию Сейфгарду и не рвёт Косторезу', () => {
  assert.equal(monsterWindup(MonsterKind.KOSTOREZ)!.coverBlocks, false, 'пилы режут сквозь стол');
  assert.equal(monsterWindup(MonsterKind.SAFEGUARD)!.coverBlocks, true, 'шкаф и аппарат ломают белый замах');
});

test('слухи замаха живут только в экологии: своей копии у вида больше нет', () => {
  // Копия у Кострореза и Сейфгарда совпадала с экологией слово в слово —
  // именно так «две реализации одного пути» и расходятся со временем.
  for (const kind of [MonsterKind.KOSTOREZ, MonsterKind.SAFEGUARD]) {
    assert.ok((getMonsterEcology(kind)?.rumorIds.length ?? 0) > 0, `${MonsterKind[kind]}: слухи обязаны быть в экологии`);
    assert.equal('rumorIds' in (monsterWindup(kind) as object), false, `${MonsterKind[kind]}: второй список слухов запрещён`);
  }
});
