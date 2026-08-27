/*
 * Замок петли крафта: собранное не должно окупаться скупкой хлама.
 *
 * Что защищает. Девять крафтовых материалов — это ресурс сборки по образцу
 * битов Caves of Qud, а не товар. Редкий бит (`cybernetics`, `psimatter`,
 * `metamatter`) обязан быть редким ЦЕНОЙ: вещь платит за него собственной
 * стоимостью. Здесь заперты обе стороны этого правила.
 *
 * Чем обошлась ошибка. Кривая состава логарифмическая: цена вещи растёт быстрее,
 * чем число единиц в ней. Пока цена не гейтила редкий бит, было две дыры:
 *   1. Ордер архива Пустоты за 120 ₽ нёс 34 единицы метаматерии — 4 ₽ за
 *      единицу самого глубокого материала игры, дешевле обычного металла.
 *      Дешёвая бумажка отдавала больше метаматерии, чем самое дорогое оружие.
 *   2. Ленточный дробобот «Гранит-4У» за 220 000 ₽ собирался из 128 ОБЫЧНЫХ
 *      единиц, которые стоили на рынке 847 ₽. Выгода — 260×, и таких вещей
 *      дороже 5000 ₽ без единой редкой единицы было 22 штуки.
 * Петля замыкалась целиком: скупить хлама на пятьсот рублей, разобрать,
 * собрать винтовку за 45 000 ₽, продать. Печатный станок.
 *
 * Метрика теста — «во сколько раз выгодно»: цена вещи, делённая на стоимость её
 * состава, купленного по САМОМУ ДЕШЁВОМУ рыночному источнику каждого материала.
 * Источник считается через разбор, который возвращает половину состава.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ITEMS } from '../src/data/items';
import { CRAFT_MATERIAL_IDS, CRAFT_MATERIALS, type CraftMaterialId } from '../src/data/craft_materials';
import { ITEM_COMPOSITIONS } from '../src/data/item_composition';

/* Цена вещи за одну единицу редкого бита: правило `RARE_UNIT_VALUE`
   в `src/data/item_composition.ts`. Тест держит число сам — в этом смысл замка. */
const RARE_UNIT_VALUE = 400;
/* Порог дорогой снаряги: выше него вещь не бывает целиком из общедоступного бита. */
const RARE_GEAR_VALUE = 5_000;
/* Потолки выгоды. Снаряга меряется отдельно: у неё состав материальный, и она
   обязана быть близка к единице. Хвост в шестьдесят держат бумаги и трофеи,
   чья цена — это осведомлённость и редкость, а не вещество; их разбор упирается
   в страховку `disassemblyRefund` «не в ноль», из-за которой однорублёвый хлам
   остаётся источником обычного бита по рублю за единицу. */
const MAX_GEAR_RATIO = 6;
const MAX_ANY_RATIO = 60;
/* Рыночная цена самой дешёвой единицы редкого бита после половинного возврата. */
const MIN_RARE_MARKET_PRICE = 800;

const RARE_MATERIALS = CRAFT_MATERIAL_IDS.filter(id => CRAFT_MATERIALS[id].rarity === 'rare');

/* Копия `disassemblyRefund` из `src/systems/crafting.ts`: половина состава вниз,
   но не в ноль — вещь беднее двух единиц отдаёт одну, самого крупного материала. */
function disassemblyRefund(components: readonly number[]): number[] {
  const refund = components.map(value => Math.floor(value / 2));
  if (refund.reduce((sum, value) => sum + value, 0) > 0) return refund;
  let richest = -1;
  for (let i = 0; i < components.length; i++) {
    if (components[i] > 0 && (richest < 0 || components[i] > components[richest])) richest = i;
  }
  if (richest >= 0) refund[richest] = 1;
  return refund;
}

/* Самый дешёвый рыночный источник каждого материала: цена вещи, делённая на то,
   сколько этого материала она отдаёт при разборе. Остальное из неё — бесплатно,
   и это намеренно щедрый к игроку счёт. */
function cheapestMarketPrices(): Map<CraftMaterialId, { itemId: string; pricePerUnit: number }> {
  const cheapest = new Map<CraftMaterialId, { itemId: string; pricePerUnit: number }>();
  for (const def of Object.values(ITEMS)) {
    if (def.value <= 0) continue;
    const refund = disassemblyRefund(ITEM_COMPOSITIONS[def.id]);
    for (let i = 0; i < CRAFT_MATERIAL_IDS.length; i++) {
      if (refund[i] <= 0) continue;
      const material = CRAFT_MATERIAL_IDS[i];
      const pricePerUnit = def.value / refund[i];
      const known = cheapest.get(material);
      if (!known || pricePerUnit < known.pricePerUnit) cheapest.set(material, { itemId: def.id, pricePerUnit });
    }
  }
  return cheapest;
}

const MARKET = cheapestMarketPrices();

function inputCost(itemId: string): number {
  const components = ITEM_COMPOSITIONS[itemId];
  let cost = 0;
  for (let i = 0; i < CRAFT_MATERIAL_IDS.length; i++) {
    if (components[i] <= 0) continue;
    cost += components[i] * (MARKET.get(CRAFT_MATERIAL_IDS[i])?.pricePerUnit ?? 0);
  }
  return cost;
}

function rareUnits(itemId: string): number {
  const components = ITEM_COMPOSITIONS[itemId];
  return RARE_MATERIALS.reduce((sum, material) => sum + components[CRAFT_MATERIAL_IDS.indexOf(material)], 0);
}

test('дорогая вещь не собирается целиком из общедоступного бита', () => {
  const commonOnly = Object.values(ITEMS)
    .filter(def => def.value > RARE_GEAR_VALUE && rareUnits(def.id) === 0)
    .map(def => `${def.id}:${def.value}₽`);

  assert.deepEqual(commonOnly, [], 'вещь дороже порога снаряги обязана требовать редкий бит');
});

test('редкий бит нельзя добыть из дешёвой вещи', () => {
  const tooCheap: string[] = [];
  for (const def of Object.values(ITEMS)) {
    const units = rareUnits(def.id);
    if (units <= 0) continue;
    const pricePerUnit = def.value / units;
    if (pricePerUnit < RARE_UNIT_VALUE) tooCheap.push(`${def.id}:${pricePerUnit.toFixed(0)}₽/ед`);
  }

  assert.deepEqual(tooCheap, [], 'носитель редкого бита обязан оплачивать каждую его единицу своей ценой');

  for (const material of RARE_MATERIALS) {
    const source = MARKET.get(material);
    assert.ok(source, `у редкого материала ${material} должен быть источник`);
    assert.ok(
      source.pricePerUnit >= MIN_RARE_MARKET_PRICE,
      `${material} добывается слишком дёшево: ${source.pricePerUnit.toFixed(0)} ₽/ед из ${source.itemId}`,
    );
  }
});

test('обычный бит остаётся дешевле редкого', () => {
  const commonMax = CRAFT_MATERIAL_IDS
    .filter(id => CRAFT_MATERIALS[id].rarity !== 'rare')
    .map(id => MARKET.get(id)?.pricePerUnit ?? 0);
  const rareMin = RARE_MATERIALS.map(id => MARKET.get(id)?.pricePerUnit ?? 0);

  assert.ok(Math.max(...commonMax) < Math.min(...rareMin), 'тиры материалов не должны пересекаться по цене');
});

test('крафт не окупается скупкой хлама', () => {
  let worstGear = { id: '', ratio: 0 };
  let worstAny = { id: '', ratio: 0 };
  for (const def of Object.values(ITEMS)) {
    const cost = inputCost(def.id);
    if (cost <= 0) continue;
    const ratio = def.value / cost;
    if (ratio > worstAny.ratio) worstAny = { id: def.id, ratio };
    if (def.value > RARE_GEAR_VALUE && ratio > worstGear.ratio) worstGear = { id: def.id, ratio };
  }

  assert.ok(
    worstGear.ratio <= MAX_GEAR_RATIO,
    `снаряга снова печатный станок: ${worstGear.id} окупается в ${worstGear.ratio.toFixed(1)} раз`,
  );
  assert.ok(
    worstAny.ratio <= MAX_ANY_RATIO,
    `сборка окупается слишком выгодно: ${worstAny.id} окупается в ${worstAny.ratio.toFixed(1)} раз`,
  );
});
