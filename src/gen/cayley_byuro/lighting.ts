/* ── Бюро Кэли: свет по узлам и рёбрам ─────────────────────────────
 *
 * Этаж выходил из генератора с 21 источником на 213 515 проходимых клеток —
 * 1.2% освещённости. Граф форм был выстроен целиком, но игрок ходил по нему
 * вслепую и порядок R·S от S·R отличал только по табличкам.
 *
 * Здесь свет — часть самого графа, а не отделка. Комната-элемент несёт свою
 * лампу в середине: узел обязан быть виден как узел. Переходы-рёбра освещены
 * ЧАЩЕ комнат, цепочкой: идущий по порядку форм видит следующее окно раньше,
 * чем в него войдёт, и путь читается как ход по графу, а не как блуждание по
 * конторе. Это единственная вольность прохода — в остальном бюро светит ровно
 * и безлико, как ему и положено.
 *
 * Проход детерминированный, без жребия. Лампа не путевая преграда, так что
 * сетка не запирает ни одного хода генератора.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';

/* Узлы: шаг чуть шире пятна лампы (видимый радиус около 7.6), поэтому в углах
 * большого зала остаётся честная тень — кабинет не операционная. */
const NODE_STEP = 13;
const NODE_HALF = Math.floor(NODE_STEP / 2);

/* Рёбра: шаг заведомо уже диаметра пятна, чтобы цепочка вдоль перехода читалась
 * без разрывов. Разрыв в цепочке здесь читался бы как развилка, которой нет. */
const EDGE_STEP = 10;
const EDGE_HALF = Math.floor(EDGE_STEP / 2);

/** Занятую клетку не переписываем: авторские лампы вестибюля, мебель будок
 *  решётки и подсказки развилок объявлены раньше этого прохода. */
function placeLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Кольцевой обход вокруг цели: узел сетки часто приходится на стойку окна или
 *  на стену будки, и без обхода лампа этого узла просто не появилась бы. */
function placeNear(world: World, x: number, y: number, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (placeLamp(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

export function lightCayleyByuro(world: World): void {
  // Узлы графа: комнаты-элементы, кампусы, будки решётки, штабные кластеры.
  for (const room of world.rooms) {
    if (!room) continue;
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 2);
    for (let dy = NODE_HALF; dy < room.h; dy += NODE_STEP) {
      for (let dx = NODE_HALF; dx < room.w; dx += NODE_STEP) {
        placeNear(world, room.x + dx, room.y + dy, 2);
      }
    }
  }

  // Рёбра: всё проходимое вне комнат — вырезанное поле графа и переходы между
  // кампусами. Комнаты сюда не попадают, они уже прошли своим шагом.
  for (let y = EDGE_HALF; y < W; y += EDGE_STEP) {
    for (let x = EDGE_HALF; x < W; x += EDGE_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, 3);
    }
  }
}
