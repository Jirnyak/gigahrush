/* ── Гармоническая баня: свет сквозь пар ───────────────────────────
 *
 * Этаж выходил из генератора с 159 лампами и 7 свечами на 277 тысяч проходимых
 * клеток: 6.3% освещённости. Уровневые галереи, весь холодный обход и половина
 * смесительных узлов не имели ни одного источника — игрок шёл по бане на ощупь.
 *
 * Свет здесь спорит с паром. В горячих залах фонари вешают вдвое чаще: пар не
 * гасит лампу, но съедает дальность, и редкая сетка в парилке читается как
 * темнота с одной точкой посередине. В сухих галереях наоборот — банной линии
 * хватает редких плафонов, между ними должно быть темно, иначе этаж перестаёт
 * быть баней и становится конторой.
 *
 * Холодный затопленный обход освещается с берега: светильник в воду не ставят,
 * зато вода несёт свет дальше бетона, и лампа на сухой кромке заливает половину
 * купели. Хор конденсата линии не имеет и жжёт свечи — их пятно вдвое меньше,
 * поэтому у культа темнее, чем у соседей, и это видно без карты.
 *
 * Проход детерминированный: жадный обход по клеткам с занятым радиусом, шаг
 * задаёт характер клетки. Лампа не путевая преграда, занятую клетку проход не
 * переписывает — авторские плафоны котельной и горячего хода остаются как есть.
 */

import { Cell, Feature, W, ZoneFaction } from '../../core/types';
import type { World } from '../../core/world';

/** Пар: с этой плотности тумана воздух в бане уже белый. Порог взят у самих
 *  тепловых полос — `applyThermalBands` ставит горячим клеткам fog от 48. */
const STEAM_FOG = 48;

/** Шаг в парилке. Пар режет дальность лампы примерно вдвое, поэтому и шаг вдвое
 *  плотнее галерейного. */
const STEP_STEAM = 11;

/** Шаг в сухих помещениях: мойки, насосные, журналы давления. */
const STEP_ROOM = 16;

/** Шаг в уровневых галереях. Реже комнат — коридор бани освещают по нужде. */
const STEP_GALLERY = 18;

/** Шаг свечей хора конденсата. Свеча несёт радиус 5 против ламповых 8, поэтому
 *  ставится чаще, а света всё равно даёт меньше: у культа своя темнота. */
const STEP_CANDLE = 9;

/** Докуда искать сухую клетку под светильник. С воды и из-под мебели уходим
 *  недалеко — иначе лампа купели уедет за стену в соседнюю мойку. */
const DRY_REACH = 4;

/** С воды берег может быть дальше: купель шире мойки. */
const WATER_REACH = 7;

function isCultCell(world: World, idx: number): boolean {
  return world.factionControl[idx] === ZoneFaction.CULTIST;
}

/** Характер клетки решает и шаг, и вид источника. */
function sourceAt(world: World, idx: number): { feature: Feature; step: number } {
  if (isCultCell(world, idx)) return { feature: Feature.CANDLE, step: STEP_CANDLE };
  if (world.fog[idx] >= STEAM_FOG) return { feature: Feature.LAMP, step: STEP_STEAM };
  if (world.roomMap[idx] >= 0) return { feature: Feature.LAMP, step: STEP_ROOM };
  return { feature: Feature.LAMP, step: STEP_GALLERY };
}

/** Сухая свободная клетка вокруг цели. Кольцевой поиск, потому что в середине
 *  мойки обычно стоит скамья, а в купели вообще вода. */
function findDrySpot(world: World, x: number, y: number, reach: number): number {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const idx = world.idx(x + dx, y + dy);
        if (world.cells[idx] !== Cell.FLOOR) continue;
        if (world.features[idx] !== Feature.NONE) continue;
        return idx;
      }
    }
  }
  return -1;
}

/** Метит круг радиуса `r` занятым, чтобы следующий источник встал не ближе. */
function claimAround(claimed: Uint8Array, world: World, x: number, y: number, r: number): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      claimed[world.idx(x + dx, y + dy)] = 1;
    }
  }
}

/** Один жадный проход по клеткам, которые пропускает `accept`. Обход построчный
 *  и детерминированный: ни одна свободная клетка не остаётся дальше своего шага
 *  от источника, поэтому дыр в освещении не бывает, а плотность задаёт характер. */
function sweep(world: World, claimed: Uint8Array, accept: (idx: number) => boolean): number {
  let placed = 0;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (claimed[idx]) continue;
      const cell = world.cells[idx];
      const water = cell === Cell.WATER;
      if (cell !== Cell.FLOOR && !water) continue;
      if (!accept(idx)) continue;
      const spot = findDrySpot(world, x, y, water ? WATER_REACH : DRY_REACH);
      if (spot < 0) {
        // Берега нет — середина купели остаётся тёмной, и это честно.
        claimAround(claimed, world, x, y, 2);
        continue;
      }
      const source = sourceAt(world, spot);
      world.features[spot] = source.feature;
      claimAround(claimed, world, spot % W, (spot / W) | 0, source.step);
      claimed[idx] = 1;
      placed++;
    }
  }
  return placed;
}

export function lightHarmonicBathhouse(world: World): number {
  const claimed = new Uint8Array(W * W);
  let placed = 0;

  // Сначала сердце каждой комнаты: без него мойка светится краем, а середина,
  // куда игрок и заходит, остаётся дырой.
  for (const room of world.rooms) {
    if (!room || room.w < 4 || room.h < 4) continue;
    const cx = world.wrap(room.x + (room.w >> 1));
    const cy = world.wrap(room.y + (room.h >> 1));
    const spot = findDrySpot(world, cx, cy, DRY_REACH);
    if (spot < 0) continue;
    const source = sourceAt(world, spot);
    world.features[spot] = source.feature;
    claimAround(claimed, world, spot % W, (spot / W) | 0, source.step);
    placed++;
  }

  // Затем помещения целиком: смесительные залы и галереи манометров велики, и
  // одной точки в середине им не хватает.
  placed += sweep(world, claimed, idx => world.roomMap[idx] >= 0);

  // И только потом уровневые ходы между ними: свет проходов вторичен, он лишь
  // связывает освещённые узлы.
  placed += sweep(world, claimed, idx => world.roomMap[idx] < 0);

  return placed;
}
