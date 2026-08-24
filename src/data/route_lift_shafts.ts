/* ── Шахты маршрутных лифтов: единая вертикальная инфраструктура ──
 *
 * Лифты — ЕДИНСТВЕННАЯ механика, которой соседние этажи связаны, и потому они
 * живут вне модулей этажей. Закон владельца: на каждом этаже одинаковое число
 * лифтов вверх и вниз, а лифты вниз верхнего этажа — это те же самые клетки, что
 * лифты вверх нижнего. Этаж не вправе решать, где стоят его маршрутные лифты.
 *
 * Зеркальность здесь не договорённость, которую надо соблюдать, а следствие
 * арифметики: оба этажа пары спрашивают ОДНУ функцию с ОДНИМ ключом ребра.
 * Согласовывать между этажами нечего, и разойтись они не могут.
 *
 * Форма сетки та же, что у фаст-тревела, — 4×4 ячейки шагом 256 клеток, — но это
 * РАЗНЫЕ системы, и клетки у них разные. Кабина фаст-тревела везёт на любой уже
 * открытый этаж; маршрутный лифт — только на соседний. Пересечься они не могут:
 * кабина стоит на защищённой клетке (`aptMask`), а шахта на защищённую клетку не
 * садится по общему правилу постановки.
 *
 * В каждой ячейке ровно одна шахта, поэтому «до ближайшей шахты не дальше
 * половины ячейки» верно всегда. Точка внутри ячейки гуляет по сиду ПАРЫ этажей:
 * соседние этажи связаны, но два разных перегона не похожи друг на друга.
 */

import { W } from '../core/types';
import { hash32 } from '../core/rand';
import { FLOOR_RUN_MAX_Z, FLOOR_RUN_MIN_Z } from './procedural_floors';

/** Сторона сетки шахт: столько же ячеек, сколько у фаст-тревела, но клетки свои. */
export const ROUTE_LIFT_GRID = 4;
export const ROUTE_LIFT_GRID_STEP = Math.floor(W / ROUTE_LIFT_GRID);
/** Лифтов на направление на этаже. Не отдельная ручка: это размер сетки. */
export const ROUTE_LIFTS_PER_DIRECTION = ROUTE_LIFT_GRID * ROUTE_LIFT_GRID;

/* Шахта не подходит вплотную к границе ячейки: иначе две соседние шахты могут
 * оказаться в двух клетках друг от друга, и обещание «одна шахта на ячейку»
 * перестаёт что-либо значить для игрока. */
const SHAFT_CELL_MARGIN = 24;
const SHAFT_JITTER_SPAN = ROUTE_LIFT_GRID_STEP - SHAFT_CELL_MARGIN * 2;

/** Этаж под данным. Маршрут замкнут по вертикали: под самым низом лежит верх. */
export function floorBelowZ(z: number): number {
  return z <= FLOOR_RUN_MIN_Z ? FLOOR_RUN_MAX_Z : z - 1;
}

/** Этаж над данным. Над самым верхом лежит низ — тот же шов кольца. */
export function floorAboveZ(z: number): number {
  return z >= FLOOR_RUN_MAX_Z ? FLOOR_RUN_MIN_Z : z + 1;
}

/** Шов кольца: единственное ребро, где «ниже» означает «на другом конце мира».
 *  Поездка через него стоит ресурса — иначе с крыши попадали бы прямо в финал. */
export function isRouteSeamEdge(edgeZ: number): boolean {
  return edgeZ === FLOOR_RUN_MIN_Z;
}

/**
 * Ключ ребра между этажом и тем, что под ним.
 *
 * Ребро именуется этажом, который по нему СПУСКАЕТСЯ. Тогда «лифты вниз этажа z»
 * и «лифты вверх этажа под ним» получают один ключ автоматически:
 * `floorAboveZ(floorBelowZ(z)) === z` на всём кольце.
 */
export function routeLiftEdgeZ(downFromZ: number): number {
  return downFromZ;
}

/**
 * Шестнадцать клеток шахт этого ребра, по одной на ячейку сетки 4×4.
 *
 * Чистая функция: ни мира, ни состояния. Один и тот же ответ на обоих этажах
 * пары и в генерации, и в рантайме — это и есть единственный источник истины о
 * том, где стоят маршрутные лифты.
 */
export function routeLiftShaftCells(runSeed: number, edgeZ: number): number[] {
  const cells: number[] = [];
  for (let gy = 0; gy < ROUTE_LIFT_GRID; gy++) {
    for (let gx = 0; gx < ROUTE_LIFT_GRID; gx++) {
      const slot = gy * ROUTE_LIFT_GRID + gx;
      const roll = hash32(runSeed, edgeZ * 0x1f1f + slot);
      const jx = SHAFT_CELL_MARGIN + (roll % SHAFT_JITTER_SPAN);
      const jy = SHAFT_CELL_MARGIN + ((roll >>> 16) % SHAFT_JITTER_SPAN);
      const x = gx * ROUTE_LIFT_GRID_STEP + jx;
      const y = gy * ROUTE_LIFT_GRID_STEP + jy;
      cells.push(y * W + x);
    }
  }
  return cells;
}

/** Шахты, по которым этаж уезжает ВНИЗ. */
export function routeLiftShaftsDown(runSeed: number, z: number): number[] {
  return routeLiftShaftCells(runSeed, routeLiftEdgeZ(z));
}

/** Шахты, по которым этаж уезжает ВВЕРХ: ребро принадлежит этажу СВЕРХУ. */
export function routeLiftShaftsUp(runSeed: number, z: number): number[] {
  return routeLiftShaftCells(runSeed, routeLiftEdgeZ(floorAboveZ(z)));
}
