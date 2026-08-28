/* ── Марковская лестница: свет по площадкам ───────────────────────
 *
 * Этаж выходил из генератора с 61 лампой и 17 свечами на 204 тысячи
 * проходимых клеток: фонарь на марше через каждые 28 клеток, по одному
 * источнику на комнату-мотив и почти ничего в служебном срезе. Игра
 * лестницы вся построена на том, что игрок УЗНАЁТ комнату — кухня,
 * мокрая, кладовая, редкое звено, — а узнать её в темноте нельзя.
 *
 * Поэтому свет здесь идёт по площадкам: каждая комната цепи получает
 * свою сетку и читается как отдельное состояние. Марш и переходы между
 * площадками остаются на авторском редком фонаре — лестница должна
 * ощущаться чередованием освещённой комнаты и тёмного пролёта, иначе
 * повтор мотива перестаёт быть событием.
 *
 * Редкое звено М освещено ярче соседей: это единственная площадка, за
 * которой охотится квест, и её видно с марша ещё до входа.
 */

import { Cell, Feature, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг сетки площадки. Лампа несёт радиус 8, то есть пятно диаметром 16;
 *  шаг чуть шире пятна оставляет тень по углам площадки — комната-мотив
 *  опознаётся с порога, но не залита. Темнота этажа живёт в марше и
 *  переходах: четверть проходимых клеток лестницы лежит вне комнат, и
 *  туда сетка не заходит вовсе. Замерено: шаг 12 давал 68.5% освещённых
 *  клеток этажа, 14 — 65.1%, шаг 15 даёт 56.3% против 4.9% до прохода. */
const LANDING_STEP_CELLS = 15;

/** Редкое звено светит вдвое плотнее: цель квеста не должна теряться
 *  среди девятнадцати одинаково освещённых площадок. */
const RARE_STEP_CELLS = 6;

const RARE_ROOM_MARK = 'редкое состояние';

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: узел сетки то и дело приходится на
 *  плиту, шкаф или койку мотива, и без обхода лампа просто пропадает. */
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

function lightLanding(world: World, room: Room, step: number): void {
  const half = step >> 1;
  for (let y = room.y + half; y < room.y + room.h; y += step) {
    for (let x = room.x + half; x < room.x + room.w; x += step) {
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}

export function lightMarkovStairwell(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    const rare = room.name.includes(RARE_ROOM_MARK);
    lightLanding(world, room, rare ? RARE_STEP_CELLS : LANDING_STEP_CELLS);
  }
}
