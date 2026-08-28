/* ── Аттракторный двор: свет по потоку и по щиткам ────────────────
 *
 * Двор выходил из генератора с 281 лампой на 254 тысячи проходимых клеток:
 * четыре тензорные спины несли фонарь через каждые 34 клетки, всё
 * остальное — приёмка, насосный центр, посты, ящики, весь пояс служебных
 * помещений — стояло в темноте. Двор, который читается только по
 * потоку, — это не двор, а труба.
 *
 * Свет тут работает как разметка течения. Струи двора — единственная
 * подсказка, куда несёт: по синей быстро, по жёлтой навстречу патрулю.
 * Поэтому фонари идут вдоль струй нитью, а помещения получают свою
 * сетку: щиток, за которым работают, обязан быть виден. Темнота остаётся
 * там, где двор её и просит, — в породе между струями, а это треть
 * проходимых клеток этажа.
 *
 * Мёртвая зона исключена нарочно. Это сухой рез через остановленное
 * течение, его цена и есть темнота: игрок, идущий срезом, платит тем,
 * что не видит, кто там стоит.
 */

import { Cell, Feature, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { ATTRACTOR_DVOR_ROOM_DEF_IDS, FLOW_SPECS } from './meta';

/** Шаг сетки служебного помещения. Лампа несёт радиус 8, то есть пятно
 *  диаметром 16; шаг чуть теснее пятна, так что помещение освещено целиком.
 *  Темнота двора живёт не внутри помещений, а СНАРУЖИ них: треть проходимых
 *  клеток этажа — порода между струями, и туда сетка не заходит.
 *  Замерено: шаг 19 давал 37.4% освещённых клеток этажа, 15 — 48.6%,
 *  шаг 12 даёт 57.9% против 6.6% до прохода. */
const ROOM_STEP = 12;
const ROOM_HALF = ROOM_STEP >> 1;

/** Шаг фонарей вдоль струи. Плотнее сетки помещений: течение — путь, и
 *  разрыв в нём читается как обрыв, а не как тень. */
const FLOW_STEP = 13;

/** Струя, которую не освещаем: сухой рез через остановленное течение. */
const DEAD_FLOW_ID = 'dead_cut';

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: узел сетки часто занят аппаратом
 *  насосной или столом поста, и без обхода лампа просто пропадает. */
function placeNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (placeSource(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

function lightRoom(world: World, room: Room): void {
  for (let y = room.y + ROOM_HALF; y < room.y + room.h; y += ROOM_STEP) {
    for (let x = room.x + ROOM_HALF; x < room.x + room.w; x += ROOM_STEP) {
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}

/** Фонари по ломаной струи: шаг считается по длине отрезка, чтобы длинный
 *  прогон и короткий поворот несли свет одинаково часто. */
function lightFlow(world: World, points: readonly { x: number; y: number }[]): void {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 0; s < len; s += FLOW_STEP) {
      const k = s / Math.max(1, len);
      placeNear(
        world,
        Math.round(a.x + (b.x - a.x) * k),
        Math.round(a.y + (b.y - a.y) * k),
        Feature.LAMP,
        2,
      );
    }
  }
}

export function lightAttractorDvor(world: World): void {
  for (const flow of FLOW_SPECS) {
    if (flow.id === DEAD_FLOW_ID) continue;
    lightFlow(world, flow.points);
  }
  for (const room of world.rooms) {
    if (!room || room.name === ATTRACTOR_DVOR_ROOM_DEF_IDS.deadZone) continue;
    lightRoom(world, room);
  }
}
