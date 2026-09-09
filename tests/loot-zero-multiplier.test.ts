/* ── Ноль в профиле лута значит ноль ───────────────────────────────
 *
 * `postrelease.md` §3, `#20/#55`. Множители типов применялись по
 * `if (profile.weaponMult && …)`, и НОЛЬ проваливался в falsy: единственный
 * способ сказать «этого здесь не бывает» не работал ни разу.
 *
 * Карманы жильцов объявляют ровно это (`pocketProfile.weaponMult = 0`, с
 * авторским комментарием про одетых домохозяек) и получали оружие с ПОЛНЫМ
 * весом — 51 ствол в пуле из 351. Оттуда стволы шли и в лут с тела, то есть в
 * экономику.
 *
 * Замок держит ТРИ вещи, потому что починка нуля столкнула лбами три
 * авторских замысла, и каждый из них правильный:
 *   1. ноль обязан обнулять;
 *   2. явный ДОПУСК сильнее общего запрета по типу — пси-сгустки это
 *      `ItemType.WEAPON` и одновременно единственный лицензируемый товар,
 *      и с прилавка культа и НИИ они уходить не должны;
 *   3. у оружейного слота `toolMult` не обнулён намеренно: слот отбирает
 *      «оружие ИЛИ инструмент», и с починенным нулём инструмент исчез бы
 *      целиком — замерено 17 позиций из 70.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ItemType } from '../src/core/types';
import { itemDefHasTag } from '../src/data/items';
import { buildLootPool } from '../src/systems/procedural_loot';
import '../src/content';

const MAX_VALUE = 60;

function countByType(profile: Parameters<typeof buildLootPool>[0], type: ItemType): number {
  return buildLootPool(profile, MAX_VALUE).filter(entry => entry.item.type === type).length;
}

test('нулевой множитель типа выносит тип из пула целиком', () => {
  const allowed = countByType({ weaponMult: 1 }, ItemType.WEAPON);
  assert.ok(allowed > 0, 'контроль: при множителе 1 оружие в пуле есть');
  assert.equal(
    countByType({ weaponMult: 0 }, ItemType.WEAPON), 0,
    'ноль обязан обнулять: до правки он проваливался в falsy и оружие шло с полным весом',
  );
});

test('ноль обнуляет любой тип, а не только оружие', () => {
  const cases: Array<[keyof Parameters<typeof buildLootPool>[0], ItemType]> = [
    ['ammoMult', ItemType.AMMO],
    ['toolMult', ItemType.TOOL],
    ['medicineMult', ItemType.MEDICINE],
    ['foodMult', ItemType.FOOD],
    ['drinkMult', ItemType.DRINK],
    ['miscMult', ItemType.MISC],
  ];
  for (const [key, type] of cases) {
    assert.ok(countByType({ [key]: 1 }, type) > 0, `контроль: ${key}=1 оставляет тип в пуле`);
    assert.equal(countByType({ [key]: 0 }, type), 0, `${key}=0 обязан вынести тип из пула`);
  }
});

test('объявленный допуск переживает нулевой множитель своего типа', () => {
  /* Карман культиста: стволов нет, а сгустки есть — они `WEAPON`, но допуск на
   * них объявлен поимённо через `tagWeights`. */
  const pool = buildLootPool({ weaponMult: 0, tagWeights: { psi_clot: 1 } }, MAX_VALUE);
  const clots = pool.filter(entry => itemDefHasTag(entry.item, 'psi_clot'));
  const plainWeapons = pool.filter(entry => entry.item.type === ItemType.WEAPON && !itemDefHasTag(entry.item, 'psi_clot'));

  assert.ok(clots.length > 0, 'допуск объявлен — товар обязан остаться на прилавке');
  assert.equal(plainWeapons.length, 0, 'обычные стволы в том же кармане обязаны исчезнуть');
});

test('без объявленного допуска лицензируемый товар в пул не попадает вовсе', () => {
  const pool = buildLootPool({ weaponMult: 1 }, MAX_VALUE);
  assert.equal(
    pool.filter(entry => itemDefHasTag(entry.item, 'psi_clot')).length, 0,
    'допуск не объявлен — сгустков нет даже при полном весе оружия',
  );
});
