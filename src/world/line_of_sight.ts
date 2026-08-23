/* ── Линия взгляда: одна растеризация на весь бой ──────────────── */

import { Feature } from '../core/types';
import type { World } from '../core/world';

/**
 * Мебель, за которой можно укрыться от выстрела.
 *
 * Бетоном она НЕ работает: клетка со стеллажом или столом проходима, через неё
 * ходят и бьют в ближнем бою, поэтому запрещать по ней линию огня нельзя —
 * это давало «стою вплотную через стол и не стреляю». Она стоит ровно столько,
 * сколько стоит на самом деле: сбивает прицел (`lineCoverCells`).
 */
function isLineOfFireCover(feature: Feature): boolean {
  return feature === Feature.SHELF ||
    feature === Feature.MACHINE ||
    feature === Feature.APPARATUS ||
    feature === Feature.DESK ||
    feature === Feature.TABLE;
}

/**
 * Видит ли точка `(x1,y1)` точку `(x2,y2)`.
 *
 * Обход Amanatides–Woo: проходятся РОВНО те клетки, которые пересекает отрезок.
 * До этого бой растеризовал луч пробами через полклетки, и у той схемы было три
 * врождённых промаха, каждый из которых стоил боя вплотную:
 *
 * 1. **Конечные клетки не проверялись вовсе.** Цикл шёл `i = 1..steps-1`, то
 *    есть ни клетка наблюдателя, ни клетка цели в выборку не попадали: цель,
 *    стоящая в стене, считалась видимой.
 * 2. **Первая проба ложилась в полклетки от наблюдателя** — почти всегда внутри
 *    его собственной клетки, то есть тратилась впустую.
 * 3. **Диагональ через угол.** На коротком диагональном отрезке единственная
 *    проба падала в угловую клетку, и двое стоящих вплотную врагов друг друга
 *    не видели.
 *
 * Правила здесь явные:
 *
 * - клетка наблюдателя преградой не считается — в ней он и стоит, иначе
 *   выбитый в косяк актор ослеп бы навсегда;
 * - клетка цели считается: сквозь стену не видно даже вплотную;
 * - на точной диагонали шаг идёт сразу по ОБЕИМ осям, поэтому угол между двумя
 *   стенами взгляд не запирает — соседи по диагонали видят друг друга.
 *
 * Мир — тор: смещение берётся через `world.delta`, а обход идёт в развёрнутых
 * координатах; `world.solid` сам сворачивает индекс по маске.
 */
export function hasLineOfSight(
  world: World, x1: number, y1: number, x2: number, y2: number, maxDist: number,
): boolean {
  return traceLine(world, x1, y1, x2, y2, maxDist, false) >= 0;
}

/**
 * Сколько укрытий пересекает линия огня, или `-1`, если её перекрывает бетон.
 *
 * Одна растеризация отвечает сразу на оба вопроса, потому что вопрос физически
 * один: что стоит на пути. Стена запрещает выстрел, мебель — портит прицел
 * (см. `hasLineOfSight` про правила концов отрезка).
 */
export function lineCoverCells(
  world: World, x1: number, y1: number, x2: number, y2: number, maxDist: number,
): number {
  return traceLine(world, x1, y1, x2, y2, maxDist, true);
}

/** Возвращает число укрытий на пути (или 0 без подсчёта), `-1` — перекрыто. */
function traceLine(
  world: World, x1: number, y1: number, x2: number, y2: number, maxDist: number, countCover: boolean,
): number {
  const dx = world.delta(x1, x2);
  const dy = world.delta(y1, y2);
  if (dx * dx + dy * dy > maxDist * maxDist) return -1;

  let cx = Math.floor(x1);
  let cy = Math.floor(y1);
  const endX = Math.floor(x1 + dx);
  const endY = Math.floor(y1 + dy);
  if (cx === endX && cy === endY) return world.solid(endX, endY) ? -1 : 0;

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const invX = stepX === 0 ? Infinity : 1 / Math.abs(dx);
  const invY = stepY === 0 ? Infinity : 1 / Math.abs(dy);
  // Доля отрезка до первой границы клетки по каждой оси.
  let tMaxX = stepX === 0 ? Infinity : (stepX > 0 ? cx + 1 - x1 : x1 - cx) * invX;
  let tMaxY = stepY === 0 ? Infinity : (stepY > 0 ? cy + 1 - y1 : y1 - cy) * invY;

  // Потолок шагов — манхэттенская длина пути: столько границ клеток отрезок и
  // пересекает. Страховка от зацикливания на вырожденных числах, не тюнинг.
  const guard = Math.abs(endX - cx) + Math.abs(endY - cy) + 2;
  let cover = 0;
  for (let i = 0; i < guard; i++) {
    if (tMaxX < tMaxY) {
      cx += stepX;
      tMaxX += invX;
    } else if (tMaxY < tMaxX) {
      cy += stepY;
      tMaxY += invY;
    } else {
      // Точная диагональ: отрезок проходит через сам угол и ни одной из боковых
      // клеток не задевает. Шагаем по обеим осям сразу.
      cx += stepX;
      cy += stepY;
      tMaxX += invX;
      tMaxY += invY;
    }
    if (world.solid(cx, cy)) return -1;
    const atEnd = cx === endX && cy === endY;
    // Клетка самой цели укрытием не считается: за собственным столом не спрячешься.
    if (countCover && !atEnd && isLineOfFireCover(world.features[world.idx(cx, cy)] as Feature)) cover++;
    if (atEnd) return cover;
  }
  return cover;
}
