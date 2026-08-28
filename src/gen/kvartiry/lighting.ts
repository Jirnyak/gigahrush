/* ── Квартиры: свет общего стояка ─────────────────────────────────
 *
 * Этаж выходил из генератора с 32.9% освещённых клеток при 7470 лампах: свет
 * тут шёл только мебелью по типу комнаты — одна лампа на «Комнату с матрасом»,
 * одна на «Общую кухню». Комнаты у квартир сросшиеся, средняя под полсотни
 * клеток, и одна точка в углу такую кишку не вытягивает. Сто тысяч клеток вне
 * комнат — проходы между секциями — не получали света вовсе.
 *
 * Двери здесь закрыты почти все (17202 из 17204), а закрытая дверь свет не
 * пропускает. Значит соседняя лампа не поможет никогда: каждый закуток надо
 * запитывать своим источником. Отсюда сетка по всему этажу, а не по комнатам.
 *
 * Лицо этажа — уплотнёнка: один стояк на секцию, лампочка в патроне на каждом
 * повороте, и никакой ровной заливки. В мокрый санузел и кладовку лампочку не
 * вешают — туда носят свечу, и она тусклее и ближе. Так игрок по одному взгляду
 * отличает жилой ход от хозяйственного кармана.
 *
 * Замерено: 88.2% против 32.9% до прохода.
 */

import { Cell, Feature, RoomType, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг лампочек жилого хода. Лампа несёт радиус 8, но в квартирах он почти
 *  везде упирается в стену через две-три клетки, поэтому шаг мелкий: 7 даёт
 *  жилой ход целиком и оставляет тень в тупиках. Кратные четырём шаги брать
 *  нельзя — стены этажа стоят ровно по сетке WALL_L=4, и такая сетка ламп
 *  ложится в стены. */
const LAMP_STEP = 7;

/** Шаг свечей в санузлах и кладовках: свеча слабее (радиус 5), поэтому чаще. */
const CANDLE_STEP = 5;

/** Санузел и кладовка живут на свече. Это не забывчивость автора мебели —
 *  лампочку в мокрое и в чулан жильцы уплотнёнки не ставят. */
function candleRoom(world: World, idx: number): boolean {
  const id = world.roomMap[idx];
  if (id < 0) return false;
  const room = world.rooms[id];
  return !!room && (room.type === RoomType.BATHROOM || room.type === RoomType.STORAGE);
}

/** Ставит источник рядом с точкой сетки. Занятую клетку не трогает никогда:
 *  мебель комнат, авторские лампы Красного уголка и типографии старше сетки. */
function hang(world: World, x: number, y: number, feature: Feature): boolean {
  for (let r = 0; r <= 2; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const i = world.idx(x + dx, y + dy);
        if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) continue;
        world.features[i] = feature;
        return true;
      }
    }
  }
  return false;
}

export function lightKvartiry(world: World): void {
  // Жилой и общий ход: лампочка в патроне.
  for (let y = LAMP_STEP >> 1; y < W; y += LAMP_STEP) {
    for (let x = LAMP_STEP >> 1; x < W; x += LAMP_STEP) {
      if (candleRoom(world, world.idx(x, y))) continue;
      hang(world, x, y, Feature.LAMP);
    }
  }

  // Мокрое и чуланы: свеча, чаще и тусклее.
  for (let y = CANDLE_STEP >> 1; y < W; y += CANDLE_STEP) {
    for (let x = CANDLE_STEP >> 1; x < W; x += CANDLE_STEP) {
      if (!candleRoom(world, world.idx(x, y))) continue;
      hang(world, x, y, Feature.CANDLE);
    }
  }
}
