/* ── Производственный пояс: свет над линией ───────────────────────
 *
 * Пояс выходил из генератора с двумя с половиной сотнями декоративных ламп на
 * сто шестьдесят тысяч проходимых клеток: светились конторка нормировщика и
 * несколько станков, а девять десятых цеха игрок проходил на ощупь.
 *
 * Здесь свет — это техника безопасности, а не уют. Лампу вешают НАД РАБОТОЙ:
 * над лентой, над станком, над рампой. Поэтому проход идёт не по миру, а по
 * комнатам, и внутри комнаты — цепью вдоль её длинной оси. Пролёт 912×9 и
 * подъёмник тары 5×732 получают гирлянду по своей длине, широкий цех — второй
 * ряд поперёк, каморка — одну лампу и всё.
 *
 * Между линиями остаётся настоящая темнота: цех освещён рабочими местами, а не
 * залит целиком, и смена ходит от пятна к пятну. Это служебный этаж, цель —
 * около шестидесяти процентов, а не контора.
 *
 * Проход детерминированный: шаг цепи — от размера комнаты, жребия нет.
 * Занятую клетку не трогаем, поэтому авторские лампы, станки, конвейерная ось
 * и всё, что расставили `decorateLineRooms` и `registerProductionMachineHazards`,
 * остаются как объявлены.
 */

import { Cell, Feature } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг гирлянды вдоль линии. Пятно лампы читается на 7-8 клеток в каждую
 *  сторону, и шаг шире пятна оставляет между станками тень — ту самую, из-за
 *  которой цех выглядит цехом, а не потолочной панелью. */
const LINE_STEP = 25;

/** Шаг рядов поперёк. Ряд второй нужен только там, где цех шире двух пятен:
 *  в девятиклеточном пролёте поперечного ряда быть не может. */
const CROSS_STEP = 17;

/** Комната короче этого по обеим сторонам освещается одной лампой: гирлянда в
 *  каморке нормировщика — это не свет, это потолок в лампах. */
const SINGLE_LAMP_SIDE = 15;

/** Вешает лампу, если клетка пуста. Занятую не трогает никогда: там уже стоит
 *  станок, стеллаж или авторский источник, и он старше общего прохода. */
function hangLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Точка гирлянды почти всегда занята оборудованием — линия станков стоит
 *  ровно по оси. Смещаемся кольцами наружу, пока не найдём пустую клетку;
 *  без этого цех теряет каждую вторую лампу и снова темнеет. */
function hangNearby(world: World, x: number, y: number, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (hangLamp(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

/** Первая точка ряда: половина шага от кромки, но не дальше середины комнаты —
 *  иначе короткая сторона остаётся без единой лампы. */
function firstOffset(step: number, len: number): number {
  return Math.min(step >> 1, Math.max(0, (len - 1) >> 1));
}

export function lightProductionBelt(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;

    if (room.w <= SINGLE_LAMP_SIDE && room.h <= SINGLE_LAMP_SIDE) {
      hangNearby(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 3);
      continue;
    }

    // Длинная ось комнаты — это ось работы: по ней идёт лента, по ней стоят
    // станки, по ней же вешают лампы. Короткая ось несёт ряды.
    const alongX = room.w >= room.h;
    const lineLen = alongX ? room.w : room.h;
    const crossLen = alongX ? room.h : room.w;

    for (let c = firstOffset(CROSS_STEP, crossLen); c < crossLen; c += CROSS_STEP) {
      for (let l = firstOffset(LINE_STEP, lineLen); l < lineLen; l += LINE_STEP) {
        const x = room.x + (alongX ? l : c);
        const y = room.y + (alongX ? c : l);
        hangNearby(world, x, y, 2);
      }
    }
  }
}
