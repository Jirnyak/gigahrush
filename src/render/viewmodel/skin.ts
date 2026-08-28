/**
 * Чем один ствол отличается от другого внутри одного силуэта.
 *
 * Архетип решает, что это пистолет; облик решает, что это ржавая самоделка с
 * коротким стволом, а не вороненый ПМ. Числа опять берутся из уже канонических
 * боевых характеристик, а не выдумываются заново: длина ствола идёт от вылета и
 * скорости снаряда, толщина корпуса — от урона, магазин — от ёмкости, износ — от
 * цены вещи. Дешёвое в этом мире ржавое, и это правда об экономике, а не вкус.
 */

import { WEAPON_ROLE_TIERS, WEAPON_STATS } from '../../data/catalog';
import { ITEMS } from '../../data/items';
import { hashSeed, seededRandom } from '../../core/rand';
import type { ViewmodelArchetype } from './archetype';
import type { ViewmodelSkin } from './types';

/** Палитры материалов. Приглушённые: бетон вокруг и так съедает контраст. */
const STEEL: readonly [number, number, number] = [104, 108, 116];
const BLUED: readonly [number, number, number] = [66, 68, 76];
const BRASS: readonly [number, number, number] = [158, 126, 62];
const WOOD: readonly [number, number, number] = [104, 72, 44];
const BAKELITE: readonly [number, number, number] = [92, 54, 36];
const RUBBER: readonly [number, number, number] = [46, 46, 50];
const ENERGY: readonly [number, number, number] = [96, 188, 176];
const FLAME: readonly [number, number, number] = [178, 92, 44];

/** Каркас облика по силуэту: дальше его правят числа конкретной вещи. */
function archetypeBase(archetype: ViewmodelArchetype): ViewmodelSkin {
  switch (archetype) {
    case 'energy':
      return { body: STEEL, grip: RUBBER, accent: ENERGY, barrel: 46, bulk: 20, magazine: 12, stock: true, wear: 0.05, glow: 0.9 };
    case 'flamer':
      return { body: FLAME, grip: RUBBER, accent: BRASS, barrel: 40, bulk: 18, magazine: 22, stock: true, wear: 0.35, glow: 0.35 };
    case 'launcher':
      return { body: BLUED, grip: WOOD, accent: BRASS, barrel: 44, bulk: 22, magazine: 10, stock: true, wear: 0.3, glow: 0 };
    case 'machinegun':
      return { body: BLUED, grip: WOOD, accent: STEEL, barrel: 52, bulk: 20, magazine: 26, stock: true, wear: 0.28, glow: 0 };
    case 'shotgun':
      return { body: BLUED, grip: WOOD, accent: BRASS, barrel: 50, bulk: 16, magazine: 8, stock: true, wear: 0.3, glow: 0 };
    case 'rifle':
      return { body: BLUED, grip: WOOD, accent: STEEL, barrel: 54, bulk: 14, magazine: 14, stock: true, wear: 0.25, glow: 0 };
    case 'smg':
      return { body: BLUED, grip: BAKELITE, accent: STEEL, barrel: 34, bulk: 14, magazine: 20, stock: true, wear: 0.3, glow: 0 };
    case 'pistol':
      return { body: BLUED, grip: BAKELITE, accent: STEEL, barrel: 22, bulk: 12, magazine: 12, stock: false, wear: 0.25, glow: 0 };
    case 'thrown':
      return { body: BLUED, grip: STEEL, accent: BRASS, barrel: 0, bulk: 16, magazine: 0, stock: false, wear: 0.2, glow: 0 };
    case 'chainsaw':
      return { body: FLAME, grip: RUBBER, accent: STEEL, barrel: 56, bulk: 22, magazine: 14, stock: false, wear: 0.45, glow: 0 };
    case 'polearm':
      // Каркас ниже соседей намеренно: вылет древковых лежит в узкой полосе
      // 1.8..2.35, множитель её растягивает, и с прежним каркасом весь результат
      // упирался в общий потолок длины — семь вещей выходили одним древком.
      return { body: STEEL, grip: WOOD, accent: STEEL, barrel: 44, bulk: 8, magazine: 0, stock: false, wear: 0.5, glow: 0 };
    case 'blade':
      return { body: STEEL, grip: BAKELITE, accent: STEEL, barrel: 34, bulk: 8, magazine: 0, stock: false, wear: 0.35, glow: 0 };
    case 'blunt':
      return { body: STEEL, grip: RUBBER, accent: STEEL, barrel: 40, bulk: 12, magazine: 0, stock: false, wear: 0.5, glow: 0 };
    case 'psi_hand':
      return { body: ENERGY, grip: ENERGY, accent: ENERGY, barrel: 0, bulk: 10, magazine: 0, stock: false, wear: 0, glow: 1 };
    case 'flashlight':
      return { body: STEEL, grip: RUBBER, accent: BRASS, barrel: 18, bulk: 12, magazine: 0, stock: false, wear: 0.3, glow: 0.8 };
    case 'lighter':
      return { body: BRASS, grip: BRASS, accent: FLAME, barrel: 6, bulk: 7, magazine: 0, stock: false, wear: 0.4, glow: 0.7 };
    case 'uv_spotlight':
      return { body: STEEL, grip: RUBBER, accent: [128, 108, 208], barrel: 16, bulk: 13, magazine: 0, stock: false, wear: 0.2, glow: 0.85 };
    case 'tool_generic':
      return { body: STEEL, grip: BAKELITE, accent: BRASS, barrel: 12, bulk: 10, magazine: 0, stock: false, wear: 0.35, glow: 0 };
    case 'bare_hands':
    default:
      return { body: STEEL, grip: RUBBER, accent: STEEL, barrel: 0, bulk: 0, magazine: 0, stock: false, wear: 0, glow: 0 };
  }
}

/** Немного развести соседей по палитре, не сломав материал. */
function jitter(c: readonly [number, number, number], rand: () => number, amount: number): readonly [number, number, number] {
  const d = (rand() - 0.5) * amount;
  return [
    Math.max(0, Math.min(255, c[0] + d)),
    Math.max(0, Math.min(255, c[1] + d * 0.9)),
    Math.max(0, Math.min(255, c[2] + d * 0.8)),
  ] as const;
}

/**
 * Облик конкретной вещи.
 *
 * Детерминирован по идентификатору: один и тот же ствол выглядит одинаково в
 * любом запуске, в сейве и в тесте. Глобальный `rng()` здесь нельзя — он
 * зависит от хода партии, и оружие меняло бы вид на ровном месте.
 */
export function viewmodelSkin(archetype: ViewmodelArchetype, itemId: string): ViewmodelSkin {
  const base = archetypeBase(archetype);
  const rand = seededRandom(hashSeed(itemId, 0x5eed));
  const ws = WEAPON_STATS[itemId];
  const item = ITEMS[itemId];
  if (!ws) {
    return { ...base, body: jitter(base.body, rand, 22), grip: jitter(base.grip, rand, 26) };
  }

  const role = WEAPON_ROLE_TIERS[itemId];
  /* Длина: у ближнего боя её несёт вылет, у дальнего — настильность.
   *
   * Делитель выбран по НИЖНЕЙ границе реального разброса, а не по середине.
   * Здесь стоял потолок `min(1.7, range / 0.75)`, и он насыщался уже на 1.28 —
   * при том что вылет ближнего боя весь лежит в 1.25..2.35. Из-за этого багор,
   * цепь, арматура и штык получали ОДНУ длину древка: правило упиралось в
   * потолок раньше, чем начинались отличия, которые оно должно было выражать. */
  const reach = ws.isRanged
    ? Math.min(1.9, (ws.projSpeed ?? 18) / 20) * (ws.spread ? Math.max(0.7, 1 - ws.spread * 4) : 1)
    : Math.cbrt(Math.max(0.25, ws.range) / 0.55);
  const barrel = Math.round(base.barrel * (0.72 + reach * 0.34));
  /* Тяжесть от урона — сжимающей кривой, а не отсечением.
   *
   * Линейное `min(1.5, dmg / 34)` насыщалось на 51 единице урона, а выше неё
   * лежит вся тяжёлая половина списка: гранатомёт на 125 и подствольник на 70
   * выходили ОДНОЙ толщины. Корень растягивает те же числа без потолка. */
  const heft = Math.cbrt(Math.max(1, ws.dmg) / 24);
  const bulk = Math.round(base.bulk * (0.62 + heft * 0.62));
  const magazine = ws.magazineSize && Number.isFinite(ws.magazineSize)
    ? Math.round(base.magazine * (0.6 + Math.min(1.6, ws.magazineSize / 24)))
    : base.magazine;
  // Цена — честный показатель состояния: самоделье и труба стоят гроши.
  const value = item?.value ?? 0;
  const wear = Math.max(0, Math.min(1, base.wear + (value > 0 ? Math.max(-0.28, 0.34 - value / 90) : 0.18)));

  return {
    body: jitter(base.body, rand, 22),
    grip: jitter(base.grip, rand, 26),
    accent: jitter(base.accent, rand, 18),
    barrel: Math.max(0, Math.min(74, barrel)),
    bulk: Math.max(0, Math.min(38, bulk)),
    magazine: Math.max(0, Math.min(32, magazine)),
    stock: base.stock && role !== 'pistol_sidegrade' && role !== 'makarov_precise',
    wear,
    glow: base.glow,
  };
}
