/* ── Подъезд Мёбиуса: свет лестничных площадок ────────────────────
 *
 * Этаж отдавал 4.1% освещённых клеток на 348 тысяч проходимых: 92 лампы и 33
 * свечи на весь подъезд. Тёмный подъезд отнимает у этажа его же приём — шов
 * Мёбиуса читается только тогда, когда игрок узнаёт площадку, на которой уже
 * стоял, и видит, что зеркальная квартира открывается не в ту сторону.
 *
 * Светит подъезд, а не квартиры. Магистраль, площадки, залы ожидания, щитовые,
 * градирни и технические карманы держат ровный свет лестничной клетки: по нему
 * ориентируются, по нему же ловят повтор. Жилые ячейки уплотнения, санузлы и
 * заброшенные склады госрезерва горят свечой — тускло и вразнобой, так что
 * зеркальная пара узнаётся по площадке, а не по комнате. Оттого шов и работает.
 *
 * Замерено: 93.3% против 4.1% до прохода.
 */

import { Cell, Feature, RoomType, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг света лестничной клетки. Магистраль и площадки открыты, лампа радиуса 8
 *  ложится на них диском, и шаг чуть шире диаметра оставляет полутень между
 *  площадками — то, по чему подъезд и опознаётся как подъезд. */
const LANDING_STEP = 10;

/** Шаг свечей за дверями квартир: свеча слабее (радиус 5), ставится плотнее. */
const FLAT_STEP = 8;

/** За дверью квартиры — ячейка, санузел, склад. Всё остальное, включая клетки
 *  вне комнат, — подъезд: магистраль, площадки, карманы. */
function behindFlatDoor(world: World, idx: number): boolean {
  const id = world.roomMap[idx];
  if (id < 0) return false;
  const type = world.rooms[id]?.type;
  return type === RoomType.LIVING || type === RoomType.STORAGE || type === RoomType.BATHROOM;
}

/** Свободная клетка рядом с точкой сетки; занятую не переписываем — мебель и
 *  авторский свет решающих контейнеров старше сетки. */
function light(world: World, x: number, y: number, feature: Feature, reach: number): void {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const i = world.idx(x + dx, y + dy);
        if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) continue;
        world.features[i] = feature;
        return;
      }
    }
  }
}

export function lightMoebiusPodezd(world: World): void {
  // Подъезд: магистраль, площадки, залы ожидания, щитовые, карманы.
  for (let y = LANDING_STEP >> 1; y < W; y += LANDING_STEP) {
    for (let x = LANDING_STEP >> 1; x < W; x += LANDING_STEP) {
      if (behindFlatDoor(world, world.idx(x, y))) continue;
      light(world, x, y, Feature.LAMP, 2);
    }
  }

  // За дверями: ячейки уплотнения, санузлы, склады госрезерва.
  for (let y = FLAT_STEP >> 1; y < W; y += FLAT_STEP) {
    for (let x = FLAT_STEP >> 1; x < W; x += FLAT_STEP) {
      if (!behindFlatDoor(world, world.idx(x, y))) continue;
      light(world, x, y, Feature.CANDLE, 1);
    }
  }
}
