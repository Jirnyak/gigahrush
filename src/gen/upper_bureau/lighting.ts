/* ── Верхнее бюро: свет как допуск ─────────────────────────────────
 *
 * Этаж выходил из генератора с 1.5% освещённых клеток при 644 расставленных
 * лампах. Лампы были не виноваты: `finalizeUpperBureauFloor` звал `bakeLights()`
 * ДО `expandUpperBureauGeometry`, и весь расширенный квартал — двести тысяч
 * клеток, ярусы, районы, всё, что игрок реально обходит — рождался уже после
 * запечённого света. Порядок исправлен в `index.ts`; здесь добирается плотность.
 *
 * Бюро освещено ровно и скучно. Это контора, где читают бумаги: тень в кабинете
 * означала бы, что кому-то есть что прятать от проверяющего, а в Верхнем бюро
 * прятать нельзя даже темнотой. Поэтому кабинет, коридор и приёмная светятся
 * одинаково, и по свету игрок не отличит их друг от друга — отличит по мебели.
 *
 * Проход детерминированный, без жребия: одна сетка на комнаты, вторая на землю
 * между ними. Лампа не путевая преграда, так что сетка ничего не запирает.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';

/* Шаг сетки. Лампа светит на 8, порог видимости срезает пятно примерно на 7.6,
 * и шаг 10 держит дальний угол клетки сетки (7.07) внутри пятна. Получается
 * ровная контора без провалов — ровно то, чего от бюро и ждут. */
const BUREAU_STEP = 10;
const BUREAU_HALF = Math.floor(BUREAU_STEP / 2);

/** Ставит лампу, если клетка свободна. Занятую не трогает никогда: авторская
 *  мебель кабинетов и лампы `finalizeUpperBureauFloor` старше этого прохода. */
function placeLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Кольцевой поиск свободной клетки вокруг цели: без него лампа пропадает
 *  всякий раз, когда узел сетки пришёлся на стол, стеллаж или стену. */
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

export function lightUpperBureau(world: World): void {
  // Комнаты первыми: маленький кабинет между узлами общей сетки иначе остаётся
  // тёмным, потому что свет не проходит сквозь его стены.
  for (const room of world.rooms) {
    if (!room) continue;
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 2);
    for (let dy = BUREAU_HALF; dy < room.h; dy += BUREAU_STEP) {
      for (let dx = BUREAU_HALF; dx < room.w; dx += BUREAU_STEP) {
        placeNear(world, room.x + dx, room.y + dy, 2);
      }
    }
  }

  // Земля между комнатами: коридоры бюро, лестничные карманы, дворы ярусов.
  // Клетки комнат уже прошли своей сеткой выше.
  for (let y = BUREAU_HALF; y < W; y += BUREAU_STEP) {
    for (let x = BUREAU_HALF; x < W; x += BUREAU_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      placeNear(world, x, y, 3);
    }
  }
}
