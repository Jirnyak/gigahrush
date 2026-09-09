/* ── Раздел плоскости: форма процедурного этажа ───────────────────
 *
 * `postrelease.md` §2.9. Форма нечётного этажа = РАЗДЕЛ × РЕЦЕПТ. Рецептов было
 * десять, раздел ровно один — равномерная сетка, — поэтому все нечётные этажи
 * читались одной вафлей, а различие «геометрий» жило накладками по имени.
 *
 * Замок держит три вещи, и каждая показана красной на своей строке:
 *
 * 1. РАЗДЕЛ ЕСТЬ РАЗДЕЛ. Тор роздан весь и без остатка, и ни одна клетка не
 *    досталась двум областям сразу. Ничья клетка — это пол, который ни один
 *    рецепт даже не попытается построить, и на её месте остаётся бетонный
 *    монолит. Контроль: убрать обёртку тора в `wrapDelta` — на шве появляются
 *    и ничьи клетки, и спорные.
 * 2. РАМКА НЕ НАМНОГО БОЛЬШЕ ОБЛАСТИ. Рамка втрое шире маски значит, что рецепт
 *    сыплет комнаты мимо и этаж выходит ПУСТЕЕ прежнего: замерено на пятидесяти
 *    этажах — 32.54 млн проходимых клеток против 34.10 млн, то есть −4.6% пола.
 *    Контроль: убрать прижатие рамки.
 * 3. ОБЛАСТИ ПОЛУЧАЮТ РАЗНЫЕ РЕЦЕПТЫ. Раздел режет тор на десять кусков, и если
 *    начинка у них одна, половина формы теряется. Контроль: заменить цикл
 *    отбора одним броском.
 *
 * Отдельно записано, потому что стоило замера: я объявил пересчёт `pickIdx`
 * после цикла мёртвым дефектом, «выбрасывающим найденный выбор». Негативный
 * контроль не покраснел, и он прав — поток `st` после выхода из цикла не
 * двигается, и пересчёт давал ТО ЖЕ число. Строка была лишней, а не сломанной.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { W } from '../src/core/types';
import { PARTITION_IDS } from '../src/data/procedural_floors';
import {
  partitionTorus,
  regionContains,
  type RecipeRegion,
} from '../src/gen/procedural_partitions';
import { pickRecipesForSpec } from '../src/gen/procedural_floor';

const SEEDS = [1, 7, 1337, 4242, 61061, 99991];

/** Все шесть семейств обязаны раздать тор без остатка. Ничья клетка — это пол,
 *  который ни один рецепт даже не попытается построить, и на её месте остаётся
 *  бетонный монолит. Порог общий и почти нулевой: замерено по 24 сидам, худший
 *  остаток 0.1% и он берётся округлением пробы, а не построением. */
const MAX_ORPHAN = 0.005;

/** Эффективная область — пересечение РАМКИ и МАСКИ: рецепт ходит по рамке, а
 *  маска решает, приживётся ли клетка. Судить по одной маске нельзя — у
 *  диагональной полосы одну маску делят несколько звеньев. */
function owners(regions: readonly RecipeRegion[], x: number, y: number): number {
  let n = 0;
  for (const region of regions) {
    if (x < region.x0 || x >= region.x0 + region.w) continue;
    if (y < region.y0 || y >= region.y0 + region.h) continue;
    if (!regionContains(region, x, y)) continue;
    n++;
  }
  return n;
}

test('каждое семейство режет тор, и ни одна клетка не достаётся двум областям', () => {
  for (const id of PARTITION_IDS) {
    for (const seed of SEEDS) {
      const regions = partitionTorus(id, seed);
      assert.ok(regions.length > 0, `${id}/${seed}: пустой раздел`);

      let orphan = 0;
      let disputed = 0;
      let probes = 0;
      // Проба идёт и по шву тора: именно там ломается кольцевая арифметика.
      for (let y = 0; y < W; y += 37) {
        for (let x = 0; x < W; x += 37) {
          probes++;
          const n = owners(regions, x, y);
          if (n === 0) orphan++;
          if (n > 1) disputed++;
        }
      }
      assert.equal(disputed, 0, `${id}/${seed}: ${disputed} клеток достались двум областям сразу`);
      const orphanShare = orphan / probes;
      assert.ok(
        orphanShare <= MAX_ORPHAN,
        `${id}/${seed}: ничьих клеток ${(orphanShare * 100).toFixed(1)}% при потолке ${(MAX_ORPHAN * 100).toFixed(1)}%`,
      );
    }
  }
});

test('рамка не намного больше своей области', () => {
  for (const id of PARTITION_IDS) {
    let inside = 0;
    let all = 0;
    let masked = 0;
    for (const seed of SEEDS) {
      for (const region of partitionTorus(id, seed)) {
        if (!region.contains) continue;
        masked++;
        for (let y = region.y0; y < region.y0 + region.h; y += 4) {
          for (let x = region.x0; x < region.x0 + region.w; x += 4) {
            all++;
            if (regionContains(region, x, y)) inside++;
          }
        }
      }
    }
    if (masked === 0) continue;
    /* Судится СРЕДНЕЕ по семейству, а не худшая область: тонкий клин, у
     * которого рамка вдвое больше тела, законен и неизбежен — прямоугольник
     * вокруг дуги иначе не описать. Ненормально, когда так живёт ВСЁ семейство:
     * тогда рецепт сыплет комнаты мимо маски и этаж выходит пустее прежнего.
     * Замерено: Вороной 0.61, полярный 0.61, полосы 0.48. */
    const density = inside / all;
    assert.ok(
      density >= 0.35,
      `${id}: маска занимает в среднем ${(density * 100).toFixed(0)}% рамки — рецепт будет сыпать комнаты мимо`,
    );
  }
});

test('соседние области получают разные рецепты, пока пул это позволяет', () => {
  const pool = ['voronoi_partition', 'manhattan_grid', 'hilbert_fill', 'concentric_rings', 'organic_braid'] as const;
  for (const seed of SEEDS) {
    const picks = pickRecipesForSpec({ recipePool: pool }, pool.length, seed);
    assert.equal(
      new Set(picks).size, pool.length,
      `сид ${seed}: ${pool.length} областей на пул из ${pool.length} обязаны разобрать его целиком, вышло ${new Set(picks).size}`,
    );
  }
});
