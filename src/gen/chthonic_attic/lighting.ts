/* ── Хтонический чердак: рабочий свет техслужб ────────────────────
 *
 * У чердака дефект был не в лампах, а в ПОРЯДКЕ. Корневая сеть расставляет
 * 4697 источников, и все они не светили ни одной клетки: `world.bakeLights()`
 * стоял ДО расширения, а второго бейка не было. Этаж на 757 078 проходимых
 * клеток выходил чёрным при почти пяти тысячах ламп. Порядок исправлен в
 * `index.ts`; здесь — только то, чего расширение действительно не даёт.
 *
 * Чердак техслужб не обжитой этаж и заливки не получает. Свет здесь служебный:
 * гирлянда вдоль боевой ости — той единственной линии, по которой техслужбы
 * ходят с инструментом, — и по одной лампе в авторских комнатах ядра, где
 * стоят люди и ведомости. Шахтные тайники и лазы остаются тёмными НАМЕРЕННО:
 * прятать имеет смысл только там, где не видно, и фонарь игрока там — расход,
 * а не удобство.
 *
 * Проход детерминированный, шагом по оси. Занятую клетку не трогает: корни,
 * ведомости и авторская обстановка старше общего прохода.
 */

import { Cell, Feature, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { ATTIC_BASE_X, ATTIC_BASE_Y, MAIN_Y } from './geometry';

/** Шаг рабочей гирлянды вдоль ости. Радиус лампы 8, шаг в полтора диаметра
 *  оставляет между лампами провал — это ход техслужб, а не коридор конторы. */
const SPINE_STEP = 12;

/** Ядро этажа: авторские комнаты стоят внутри этой рамки, всё остальное
 *  наращено корневой сетью и светится своим. Числа — те же, по которым ядро и
 *  штампуется в `index.ts`. */
const CORE_W = 224;
const CORE_H = 128;

function hangWorkLight(world: World, x: number, y: number): boolean {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) return false;
  world.features[i] = Feature.LAMP;
  return true;
}

/** Ость перегорожена корневыми наростами, и без кольцевого обхода гирлянда
 *  рвётся ровно там, где корень встал поперёк хода. */
function hangWorkLightNear(world: World, x: number, y: number, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (hangWorkLight(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

function inCore(room: Room): boolean {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  return cx >= ATTIC_BASE_X && cx < ATTIC_BASE_X + CORE_W
    && cy >= ATTIC_BASE_Y && cy < ATTIC_BASE_Y + CORE_H;
}

export function lightChthonicAttic(world: World): void {
  // Гирлянда вдоль боевой ости: единственная линия, где техслужбы ходят с
  // инструментом и где игрок обязан видеть, что на него идёт.
  for (let x = ATTIC_BASE_X + 18; x < ATTIC_BASE_X + CORE_W; x += SPINE_STEP) {
    hangWorkLightNear(world, x, MAIN_Y, 3);
  }

  // Комнаты ядра: ровно по одной лампе. Пост прожига, ниша ведомостей и тамбур
  // должны читаться как места, где кто-то работает, — но не как контора.
  for (const room of world.rooms) {
    if (!room || !inCore(room)) continue;
    hangWorkLightNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 2);
  }
}
