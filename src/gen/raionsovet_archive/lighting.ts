/* ── Райсовет и Живой архив: учреждение и стеллажи ─────────────────
 *
 * Этаж выходил из генератора с 3.3% освещённости на 396 399 проходимых клеток —
 * самый большой из бюрократических и почти полностью чёрный. Причина не в числе
 * ламп, а в порядке: `bakeLights()` стоял ДО `expandRaionsovetArchiveGeometry`,
 * то есть свет запекался по авторскому ядру из девяти комнат, а игрок ходил по
 * расширенному кварталу, которого в тот момент ещё не существовало. Порядок
 * исправлен в `index.ts`; здесь набирается плотность.
 *
 * У этажа две половины, и свет их различает. Райсовет — учреждение: очередь,
 * окна выдачи, комната печатей и кабинеты освещены ровно, потому что там на
 * тебя смотрят и ты смотришь на бумагу. Архив — это стеллажи: полки съедают
 * свет, между рядами шаг сетки шире, и в глубине картотеки остаётся настоящая
 * тень. Разница небольшая и намеренно небольшая: здесь всё ещё контора, а не
 * подвал, и заблудиться в темноте игрок не должен.
 *
 * Проход детерминированный, без жребия. Лампа не путевая преграда, так что
 * сетка не запирает ни каталожные коридоры, ни закрытые жилые полки.
 */

import { Cell, Feature, RoomType, W, type Room } from '../../core/types';
import type { World } from '../../core/world';

/* Учреждение: шаг держит дальний угол клетки сетки (7.07) внутри видимого пятна
 * лампы (около 7.6), поэтому провалов в приёмной половине нет. */
const OFFICE_STEP = 10;

/* Стеллажи: шаг шире диаметра пятна по углам (7.78 против 7.6), и между рядами
 * появляется узкая полоса темноты. Ровно столько, чтобы архив читался архивом. */
const SHELF_STEP = 12;

/* Каталожные коридоры и земля между корпусами: шаг учреждения со сдвигом, чтобы
 * линии коридорной сетки не совпадали с комнатными и лампы не вставали парами
 * по обе стороны порога. */
const CORRIDOR_STEP = 10;
const CORRIDOR_OFFSET = 4;

/** Занятую клетку не переписываем: убранство `decorateArchive`, авторские свечи
 *  заражённых стеллажей и сейфы объявлены раньше этого прохода. */
function placeLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Кольцевой обход вокруг узла: в архиве узел сетки почти всегда приходится на
 *  стеллаж, и без обхода зал остался бы с одной лампой у входа. */
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

/** Хранилище — это полки. Райсовет — это окна и столы. Тип комнаты и решает шаг. */
function roomStep(room: Room): number {
  return room.type === RoomType.STORAGE ? SHELF_STEP : OFFICE_STEP;
}

export function lightRaionsovetArchive(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    // Середина комнаты первой: маленький кабинет между узлами общей сетки иначе
    // остаётся тёмным, свет не проходит сквозь его стены.
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 2);
    const step = roomStep(room);
    const half = Math.floor(step / 2);
    for (let dy = half; dy < room.h; dy += step) {
      for (let dx = half; dx < room.w; dx += step) {
        placeNear(world, room.x + dx, room.y + dy, 2);
      }
    }
  }

  // Каталожные коридоры, дворы райсовета, земля расширенного квартала.
  // Клетки комнат уже прошли своим шагом выше.
  for (let y = CORRIDOR_OFFSET; y < W; y += CORRIDOR_STEP) {
    for (let x = CORRIDOR_OFFSET; x < W; x += CORRIDOR_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, 3);
    }
  }
}
