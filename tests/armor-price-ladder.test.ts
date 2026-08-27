/*
 * Замок ценовой лестницы брони.
 *
 * Что защищает. Броня — ПОКУПКА, а не находка. До перецены самая дорогая броня
 * игры (Броня Ликвидатора, 4 500 ₽) стоила дешевле самого дешёвого приличного
 * ствола (пусковая установка, 8 000 ₽), а полный комплект защиты — меньше одной
 * обоймы к серьёзному оружию. Хуже того, ЧЕТЫРЕ комплекта из пяти влезали в
 * `lootValueCap` полосы E2 (4 000 ₽) и валялись в сейфах среднего маршрута как
 * расходник.
 *
 * Правило, которое здесь заперто, целиком выводится из `ECONOMY_MONEY_BANDS`
 * (`economics.md` §5) и не содержит собственных чисел:
 *
 *   1. лестница монотонна по цене;
 *   2. ни один комплект не влезает в `lootValueCap` полосы, в которой его
 *      впервые можно купить, — иначе он находка;
 *   3. каждый комплект по карману своей полосе с торговым спредом покупки,
 *      иначе он недостижим и его в игре нет;
 *   4. броня доходит до людей: отбор носимого не может оказаться пустым.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ITEMS, itemEquipSlot } from '../src/data/items';
import { ECONOMY_MONEY_BANDS, type EconomyProgressBand } from '../src/data/economics';
import { DEFAULT_TRADE_SPREAD } from '../src/data/economy_rules';
import { Faction, Occupation } from '../src/core/types';
import { pickNpcArmor, npcArmorChance } from '../src/systems/procedural_loot';

/* Лестница снизу вверх. Порядок здесь — это и есть заявленная лестница.
 *
 * ПРАВКА 2026-08-27, шаг «три ступени». Добавлены три записи, ни одного своего
 * числа тест при этом не получил — все четыре правила ниже считаются как считались:
 *   - `armor_ozk` 16 000 и `armor_tok200` 18 000 — узкие костюмы средней ступени,
 *     обе в полосе E2 между лёгкой (12 000) и средней (20 000);
 *   - `armor_szk9` 500 000 — универсал полосы E4, вершина лестницы. */
const LADDER = [
  'armor_light',
  'armor_ozk',
  'armor_tok200',
  'armor_medium',
  'armor_cultist',
  'armor_heavy',
  'armor_liquidator',
  'armor_szk9',
] as const;

const BANDS: readonly EconomyProgressBand[] = ['E0', 'E1', 'E2', 'E3', 'E4'];

/** Первая полоса, в которой вещь по карману с торговым спредом покупки. */
function firstAffordableBand(value: number): EconomyProgressBand | undefined {
  return BANDS.find(band => value * DEFAULT_TRADE_SPREAD.buyMultiplier <= ECONOMY_MONEY_BANDS[band].maxLiquidCash);
}

test('вся броня игры перечислена в лестнице', () => {
  const armors = Object.values(ITEMS).filter(def => itemEquipSlot(def) === 'armor').map(def => def.id).sort();
  assert.deepEqual(armors, [...LADDER].sort(), 'новая броня обязана встать в лестницу, а не мимо неё');
});

test('лестница монотонна по цене', () => {
  for (let i = 1; i < LADDER.length; i++) {
    const prev = ITEMS[LADDER[i - 1]];
    const next = ITEMS[LADDER[i]];
    assert.ok(
      next.value > prev.value,
      `${next.id} (${next.value} ₽) не дороже ${prev.id} (${prev.value} ₽)`,
    );
  }
});

test('ни одна броня не влезает в потолок лута своей стартовой полосы', () => {
  for (const id of LADDER) {
    const def = ITEMS[id];
    const band = firstAffordableBand(def.value);
    assert.ok(band, `${id} за ${def.value} ₽ не по карману ни одной полосе — вещи в игре нет`);
    const cap = ECONOMY_MONEY_BANDS[band].lootValueCap;
    assert.ok(
      def.value > cap,
      `${id} за ${def.value} ₽ влезает в lootValueCap полосы ${band} (${cap} ₽) — это находка, а не покупка`,
    );
  }
});

test('броня не начинается раньше среднего маршрута', () => {
  // Полосы старта и раннего маршрута брони не несут вовсе: `100 ₽` обязаны
  // остаться значимыми деньгами (`economics.md` §5), а комплект защиты — целью.
  const cheapest = ITEMS[LADDER[0]];
  assert.ok(
    cheapest.value * DEFAULT_TRADE_SPREAD.buyMultiplier > ECONOMY_MONEY_BANDS.E1.maxLiquidCash,
    `${cheapest.id} по карману уже в E1 — броня перестала быть целью среднего маршрута`,
  );
});

test('броня по-прежнему доходит до людей', () => {
  // Отбор носимого идёт из общего пула лута под ценовым потолком снаряжения
  // NPC. Потолок этот низкий, и перецена обязана оставить пул НЕПУСТЫМ: иначе
  // гарнизон выходит голым, чего цена решать не вправе.
  const chance = npcArmorChance(Faction.LIQUIDATOR, Occupation.HUNTER);
  assert.ok(chance > 0, 'гарнизонный охотник обязан носить броню');
  for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
    const picked = pickNpcArmor(Faction.LIQUIDATOR, Occupation.HUNTER, 6, 4, 0, roll);
    assert.ok(picked, `отбор брони пуст при rollPick=${roll} — броня выпала из игры`);
    assert.equal(itemEquipSlot(picked), 'armor');
  }
});
