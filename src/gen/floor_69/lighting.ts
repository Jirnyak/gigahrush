/* ── Этаж 69: витрина и номера ────────────────────────────────────
 *
 * Здесь была не нехватка ламп, а неверный порядок: 766 источников этаж ставил
 * в `expandFloor69FullFloor`, а свет пёк ДО расширения. Лампы стояли и не
 * светили — 0.8% освещённых клеток при 457 тысячах проходимых. Один поздний
 * бейк без единой новой лампы даёт 19.4%; остальное добирает эта сетка.
 *
 * Свет тут работает приманкой. Публичная часть — кулуары, залы, посты охраны,
 * подпольный рынок, монолитная решётка проходов — светится ярко и ровно: сюда
 * зовут, тут показывают товар и заключают сделки, и тут тебя видно. Номера,
 * костюмерные, каморки долгов и тихие убежища живут на свече: там договариваются
 * шёпотом, и лишний свет — свидетель. Граница между витриной и изнанкой видна
 * с порога, до всякой карты.
 *
 * Замерено: 91.4% против 0.8% до прохода.
 */

import { Cell, Feature, RoomType, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг витрины. Кулуары и решётка проходов открыты, лампа радиуса 8 разливается
 *  почти диском, и шаг 10 держит публичную часть освещённой, оставляя провалы
 *  в глухих карманах между кварталами. */
const PUBLIC_STEP = 10;

/** Шаг свечей изнанки: свеча слабее (радиус 5), но и комнаты тут тесные. */
const PRIVATE_STEP = 8;

/** Изнанка этажа: номер, костюмерная, каморка долгов, санузел. Всё, где сделка
 *  идёт один на один. Публичное — всё остальное, включая клетки вне комнат. */
const PRIVATE_ROOMS: readonly RoomType[] = [RoomType.LIVING, RoomType.STORAGE, RoomType.BATHROOM];

function isPrivate(world: World, idx: number): boolean {
  const id = world.roomMap[idx];
  if (id < 0) return false;
  const room = world.rooms[id];
  return !!room && PRIVATE_ROOMS.includes(room.type);
}

/** Кольцевой добор свободной клетки: без него источник теряется всякий раз,
 *  когда точка сетки пришлась на стойку, койку или авторскую свечную нишу. */
function put(world: World, x: number, y: number, feature: Feature, reach: number): void {
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

export function lightFloor69(world: World): void {
  for (let y = PUBLIC_STEP >> 1; y < W; y += PUBLIC_STEP) {
    for (let x = PUBLIC_STEP >> 1; x < W; x += PUBLIC_STEP) {
      if (isPrivate(world, world.idx(x, y))) continue;
      put(world, x, y, Feature.LAMP, 2);
    }
  }

  for (let y = PRIVATE_STEP >> 1; y < W; y += PRIVATE_STEP) {
    for (let x = PRIVATE_STEP >> 1; x < W; x += PRIVATE_STEP) {
      if (!isPrivate(world, world.idx(x, y))) continue;
      put(world, x, y, Feature.CANDLE, 1);
    }
  }
}
