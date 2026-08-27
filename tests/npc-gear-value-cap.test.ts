/*
 * Замок потолка снаряжения NPC.
 *
 * Что защищает. `calculateMaxLootValue` держала пол `Math.max(1000, …)`, и
 * собственная кривая перебивала его только с 49-го уровня. Потолок был
 * константой 1000 (у ликвидаторов 1800) на любой глубине, любом ранге и любой
 * фракции: вся оружейная лестница выше ~2 000 ₽ была для NPC невидима
 * (замерено на Базе Ликвидаторов: медиана ствола 135–240 ₽, p90 1100, max
 * 1250), а состав носимой брони схлопывался в 100 % лёгкой на всех этажах.
 *
 * Правило целиком выведено из `ECONOMY_MONEY_BANDS` и не содержит собственных
 * чисел: глубина даёт целую ступень лестницы полос, ранг — дробную.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ArmorType, Faction, Occupation, ItemType } from '../src/core/types';
import { ITEMS, itemEquipSlot } from '../src/data/items';
import {
  ECONOMY_MONEY_BANDS,
  ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER,
} from '../src/data/economics';
import { ALIFE_MAX_LEVEL } from '../src/data/alife_generation';
import { calculateMaxLootValue, npcArmorChance, pickNpcArmor } from '../src/systems/procedural_loot';

const DANGERS = [1, 2, 3, 4, 5] as const;

test('потолок снаряжения растёт с глубиной', () => {
  for (const level of [2, 10, 50, ALIFE_MAX_LEVEL]) {
    for (let d = 2; d <= 5; d++) {
      const deeper = calculateMaxLootValue(level, d, Faction.CITIZEN);
      const shallower = calculateMaxLootValue(level, d - 1, Faction.CITIZEN);
      assert.ok(
        deeper > shallower,
        `уровень ${level}: опасность ${d} (${deeper} ₽) не выше опасности ${d - 1} (${shallower} ₽)`,
      );
    }
  }
  // Ровно один вырожденный случай: два новобранца соседних мелких этажей стоят
  // на общем дне лестницы — ниже полосы E0 в экономике ничего нет.
  assert.equal(calculateMaxLootValue(1, 1, Faction.CITIZEN), calculateMaxLootValue(1, 2, Faction.CITIZEN));
  for (let d = 3; d <= 5; d++) {
    assert.ok(calculateMaxLootValue(1, d, Faction.CITIZEN) > calculateMaxLootValue(1, d - 1, Faction.CITIZEN));
  }
});

test('потолок снаряжения растёт с рангом', () => {
  // На полосе старта (опасность 1) лестница упирается в собственное дно E0 —
  // ниже полосы в экономике ничего нет. Всюду, где у лестницы есть ход, ранг
  // обязан двигать потолок.
  for (let d = 2; d <= 5; d++) {
    const rookie = calculateMaxLootValue(1, d, Faction.CITIZEN);
    const veteran = calculateMaxLootValue(ALIFE_MAX_LEVEL, d, Faction.CITIZEN);
    assert.ok(veteran > rookie * 2, `опасность ${d}: ветеран ${veteran} ₽ против новобранца ${rookie} ₽ — ранг не работает`);
    let prev = 0;
    for (const level of [1, 5, 25, 50, 75, ALIFE_MAX_LEVEL]) {
      const cap = calculateMaxLootValue(level, d, Faction.CITIZEN);
      assert.ok(cap >= prev, `опасность ${d}: потолок упал на уровне ${level}`);
      prev = cap;
    }
  }
});

test('лестница потолка — это лестница полос экономики, без своих чисел', () => {
  // Новобранец этажа стоит на полосе этажом ниже, ветеран дотягивается до полосы
  // своего этажа. Обе границы обязаны совпасть с таблицей полос ровно.
  for (const d of DANGERS) {
    const rookieBand = ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER[Math.max(1, d - 1) as 1 | 2 | 3 | 4 | 5];
    assert.equal(calculateMaxLootValue(1, d, Faction.CITIZEN), rookieBand);
    assert.equal(
      calculateMaxLootValue(ALIFE_MAX_LEVEL, d, Faction.CITIZEN),
      ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER[d],
    );
  }
});

test('ветеран на глубине несёт серьёзное оружие, уборщица на жилом — нет', () => {
  // Порог «серьёзного» не выдуман: это потолок лута среднего маршрута (E2),
  // выше которого вещь перестаёт быть обычной находкой.
  const serious = ECONOMY_MONEY_BANDS.E2.lootValueCap;

  const veteran = calculateMaxLootValue(ALIFE_MAX_LEVEL, 4, Faction.LIQUIDATOR);
  assert.ok(veteran > serious, `ветеран-ликвидатор Базы (${veteran} ₽) не дотягивается до ${serious} ₽`);

  const janitor = calculateMaxLootValue(1, 1, Faction.CITIZEN);
  assert.ok(janitor <= ECONOMY_MONEY_BANDS.E0.lootValueCap, `уборщица жилого (${janitor} ₽) вышла за полосу E0`);
  assert.ok(janitor < serious / 10, 'уборщица жилого дотягивается до серьёзного оружия');

  // Ствол дороже порога обязан существовать и обязан быть в пределах ветерана:
  // иначе «серьёзное оружие» — это пустое множество.
  const reachable = Object.values(ITEMS).filter(def =>
    (def.spawnW ?? 0) > 0
    && (def.type === ItemType.WEAPON || itemEquipSlot(def) === 'tool')
    && def.value > serious
    && def.value <= veteran);
  assert.ok(reachable.length >= 5, `в пределах ветерана всего ${reachable.length} стволов дороже ${serious} ₽`);

  // ...и он обязан быть НЕДОСТУПЕН уборщице.
  assert.ok(
    reachable.every(def => def.value > janitor * 10),
    'оружие ветерана попадает в пул уборщицы',
  );
});

test('состав носимой брони не схлопнут в один вид', () => {
  // Отбор носимого идёт из общего пула под тем же потолком. При потолке-константе
  // 1800 вся броня была одинаково недосягаема, и выбор вырождался в самую
  // дешёвую: 100 % лёгкой на любом этаже. Ветеран глубины обязан видеть больше.
  const kinds = new Set<string>();
  for (let roll = 0; roll < 40; roll++) {
    const picked = pickNpcArmor(Faction.LIQUIDATOR, Occupation.HUNTER, ALIFE_MAX_LEVEL, 5, 0, roll / 40);
    assert.ok(picked, `отбор брони пуст при rollPick=${roll / 40}`);
    kinds.add(picked.id);
  }
  assert.ok(kinds.size >= 3, `ветеран глубины видит всего ${kinds.size} вид(ов) брони: ${[...kinds].join(', ')}`);
});

/* ── Потолок гасит СЛОТ, а не только выбор внутри него ──────────────
 *
 * Дефект класса «молчаливый порог»: `pickNpcArmor` фильтровал пул ПОСЛЕ
 * `buildLootPool`, а `pickLootFromPool` нормируется по остатку. Мягкое затухание
 * по цене давило всю броню одинаково, отношение весов не менялось — и потолок
 * решал только «какая броня», никогда «броня вообще». На жилом этаже потолок
 * гражданина 90 ₽ против дешевейшей брони 12 000 ₽ (0.75 % цены) не гасил
 * ничего: замерено 41 % циркачей, 32 % уборщиц и 18 % детей в бронежилете.
 */
const CHEAPEST_ARMOR = Math.min(
  ...Object.values(ITEMS).filter(def => (def.spawnW ?? 0) > 0 && itemEquipSlot(def) === 'armor').map(def => def.value),
);

function wearFraction(faction: Faction, occupation: Occupation, level: number, danger: number): number {
  let worn = 0;
  const rolls = 200;
  for (let i = 0; i < rolls; i++) {
    if (pickNpcArmor(faction, occupation, level, danger, (i + 0.5) / rolls, 0.5)) worn++;
  }
  return worn / rolls;
}

test('броня не по карману не надевается вовсе, а не выбирается подешевле', () => {
  // Потолок жилого этажа и правда ничтожен против цены брони — иначе замок
  // проверяет не тот случай.
  const citizenCap = calculateMaxLootValue(1, 1, Faction.CITIZEN);
  assert.ok(citizenCap * 50 < CHEAPEST_ARMOR, `потолок гражданина ${citizenCap} ₽ сопоставим с бронёй ${CHEAPEST_ARMOR} ₽`);

  for (const occupation of [Occupation.PERFORMER, Occupation.CLEANER, Occupation.CHILD]) {
    const share = wearFraction(Faction.CITIZEN, occupation, 1, 1);
    assert.ok(share < 0.03, `занятие ${occupation} на жилом ходит в броне в ${(share * 100).toFixed(1)} % случаев`);
    // Склонность при этом не обнулена: работа рисковая, денег нет — вот и всё.
    assert.ok(npcArmorChance(Faction.CITIZEN, occupation, ArmorType.CLOTH) > 0.1);
  }
});

test('гарнизон глубины не раздевается: его потолок броню перекрывает', () => {
  // Ветеран Базы (опасность 4) стоит выше цены брони — множитель ровно 1, доля
  // совпадает со склонностью до последней сотой.
  const veteranCap = calculateMaxLootValue(ALIFE_MAX_LEVEL, 4, Faction.LIQUIDATOR);
  assert.ok(veteranCap > CHEAPEST_ARMOR, `ветеран Базы (${veteranCap} ₽) не дотягивается до брони`);
  assert.equal(
    wearFraction(Faction.LIQUIDATOR, Occupation.HUNTER, ALIFE_MAX_LEVEL, 4),
    npcArmorChance(Faction.LIQUIDATOR, Occupation.HUNTER, ArmorType.CLOTH),
  );

  // Новобранец той же Базы (7 200 ₽) дешевейшую броню не тянет — и доля падает
  // ровно в отношении «потолок / цена», без своего порога.
  const rookieCap = calculateMaxLootValue(1, 4, Faction.LIQUIDATOR);
  assert.ok(rookieCap < CHEAPEST_ARMOR);
  const expected = npcArmorChance(Faction.LIQUIDATOR, Occupation.HUNTER, ArmorType.CLOTH) * (rookieCap / CHEAPEST_ARMOR);
  assert.ok(
    Math.abs(wearFraction(Faction.LIQUIDATOR, Occupation.HUNTER, 1, 4) - expected) < 0.01,
    `новобранец Базы носит броню не в долю потолка: ожидалось ${expected.toFixed(3)}`,
  );
  // Но раздетым гарнизон не остаётся ни на одном ранге.
  assert.ok(wearFraction(Faction.LIQUIDATOR, Occupation.HUNTER, 1, 4) > 0.4);
});

test('потолок процедурного лута выводится из полос, а не вписан руками', () => {
  // Находка не может обойти лучший обычный контракт своей полосы.
  const bands = ['E0', 'E1', 'E2', 'E3', 'E4'] as const;
  for (const d of DANGERS) {
    const band = ECONOMY_MONEY_BANDS[bands[d - 1]];
    assert.equal(
      ECONOMY_PROCEDURAL_LOOT_VALUE_CAP_BY_DANGER[d],
      Math.min(band.lootValueCap, band.ordinaryQuestCap),
      `строка опасности ${d} разошлась с полосой ${band.id}`,
    );
  }
});
