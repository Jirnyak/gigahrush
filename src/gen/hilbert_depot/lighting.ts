/* ── Склад Гильберта: свет идёт по индексу ────────────────────────
 *
 * Склад выходил из генератора самым тёмным этажом маршрута: 5.6% освещённых
 * клеток на четыреста девяносто тысяч проходимых. Двести пятьдесят ламп на
 * такой объём — это не освещение, это редкие островки в чёрном.
 *
 * Устройство склада диктует, где висит свет. Здесь нет залов: есть индексная
 * кривая, вдоль которой режутся проходы, и секции, пристёгнутые к её точкам.
 * Значит и линия света идёт ПО ПРОХОДУ — по той же кривой Гильберта, по
 * которой ходит кладовщик, считая номера. Игрок читает освещённый проход как
 * маршрут по индексу: пока светло, ты идёшь по номерам.
 *
 * Три трассы склада освещаются одинаково, потому что все три — проходы:
 * мелкая маршрутная сетка (ширина 5), крупная блочная (ширина 9) и безопасная
 * кривая приёмки (ширина 3). Секции получают лампу под потолком, крупные — две.
 *
 * А ХОРДЫ ОСТАЮТСЯ ТЁМНЫМИ, и это главное решение прохода. Хорда — короткий
 * рез между далёкими номерами: выигрыш в сотню шагов ценой запертой двери и
 * неизвестности за ней. Свет не ведёт туда никого; кто режет хорду, режет её в
 * темноте, со своим фонарём. Служебные шестьдесят процентов этажа — это
 * освещённый индекс и чёрные срезки между ним.
 *
 * Проход детерминированный: те же константы кривых, что и у геометрии, шаг
 * ламп постоянный, жребия нет.
 */

import { Cell, Feature } from '../../core/types';
import type { World } from '../../core/world';
import {
  BLOCK_GRAPH_ORDER,
  BLOCK_GRAPH_STEP,
  BLOCK_GRAPH_X,
  BLOCK_GRAPH_Y,
  CURVE_ORDER,
  CURVE_STEP,
  CURVE_X,
  CURVE_Y,
  ROUTE_GRAPH_ORDER,
  ROUTE_GRAPH_STEP,
  ROUTE_GRAPH_X,
  ROUTE_GRAPH_Y,
  type Point,
} from './meta';
import { hilbertTracePoints } from './geometry';

/** Шаг ламп вдоль прохода в клетках пройденного пути. Пятно лампы достаёт на
 *  7-8 клеток, поэтому шаг 18 держит проход читаемым, но оставляет между
 *  лампами провал: склад светится линией, а не залит. */
const AISLE_LAMP_STEP = 18;

/** Секция шире этого получает вторую лампу: одна под потолком двенадцати-
 *  метровой ячейки не добивает до дальнего стеллажа. */
const WIDE_BAY = 22;

function lampAt(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Проход застроен: стеллажи, экраны индекса, аппаратура калибровки стоят
 *  ровно по его оси. Ищем свободное место кольцами вокруг точки — иначе
 *  гирлянда прохода дырявая ровно там, где склад плотнее всего. */
function lampAround(world: World, x: number, y: number, reach: number): boolean {
  for (let ring = 0; ring <= reach; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (lampAt(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

/**
 * Идёт вдоль ломаной кривой и вешает лампу каждые `AISLE_LAMP_STEP` клеток
 * пройденного пути. Счётчик пути сквозной по всей трассе: считай он от каждого
 * отрезка заново, на каждом повороте Гильберта (а их тысяча) лампы вставали бы
 * парами, и углы кривой оказались бы вдвое светлее её прямых.
 */
function lightAisle(world: World, points: readonly Point[]): void {
  let walked = AISLE_LAMP_STEP >> 1;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    const len = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let s = 0; s < len; s++) {
      walked++;
      if (walked < AISLE_LAMP_STEP) continue;
      walked = 0;
      lampAround(world, from.x + dx * s, from.y + dy * s, 2);
    }
  }
}

export function lightHilbertDepot(world: World): void {
  // Трассы объявлены теми же константами, что режут геометрию: свет обязан
  // лечь в проход, а не рядом с ним.
  lightAisle(world, hilbertTracePoints(ROUTE_GRAPH_ORDER, ROUTE_GRAPH_X, ROUTE_GRAPH_Y, ROUTE_GRAPH_STEP));
  lightAisle(world, hilbertTracePoints(BLOCK_GRAPH_ORDER, BLOCK_GRAPH_X, BLOCK_GRAPH_Y, BLOCK_GRAPH_STEP));
  lightAisle(world, hilbertTracePoints(CURVE_ORDER, CURVE_X, CURVE_Y, CURVE_STEP));

  // Секции и гермопосты: свет под потолком ячейки. Хорды в `world.rooms` не
  // попадают и потому остаются тёмными — так и задумано.
  for (const room of world.rooms) {
    if (!room) continue;
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    if (room.w > WIDE_BAY) {
      lampAround(world, room.x + (room.w >> 2), cy, 2);
      lampAround(world, room.x + room.w - (room.w >> 2), cy, 2);
    } else if (room.h > WIDE_BAY) {
      lampAround(world, cx, room.y + (room.h >> 2), 2);
      lampAround(world, cx, room.y + room.h - (room.h >> 2), 2);
    } else {
      lampAround(world, cx, cy, 3);
    }
  }
}
