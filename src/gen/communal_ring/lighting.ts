/* ── Коммунальное кольцо: свет на общем счётчике ──────────────────
 *
 * Этаж выходил с 25 лампами и 5 свечами на 364 тысячи проходимых клеток — 0.6%.
 * Кольцо, ради которого этаж и сделан, было чёрным: игрок обходил соседей на
 * ощупь, и весь социальный обход — очередь, слухи, кто кого видел у чужой
 * двери — терялся вместе с лицами.
 *
 * Свет тут коммунальный, то есть спорный. Кольцевые коридоры и общие точки —
 * кухня, прачечная, душевая, доска объявлений, курилка, дворовые проходы —
 * горят на общем счётчике ровно и всегда: за них платят вскладчину, и гасить
 * их никто не вправе. Самодельные выгородки, кладовки и туалетные микро-блоки
 * своей линии не имеют и живут на свече: в кольце ты на виду, в своей ячейке —
 * нет, и именно поэтому в ячейке прячут.
 *
 * Замерено: 92.0% против 0.6% до прохода.
 */

import { Cell, Feature, RoomType, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг общего счётчика. Кольцевые коридоры широкие, лампа радиуса 8 разливается
 *  вдоль них почти без потерь, поэтому шаг чуть шире её диаметра: кольцо горит,
 *  а глухие простенки между выгородками остаются в тени. */
const RING_STEP = 10;

/** Шаг свечей в ячейках: свеча вдвое слабее и ставится плотнее. */
const CELL_STEP = 8;

/** Ячейка жильца, кладовка, туалетный микро-блок — свой угол, своя свеча.
 *  Всё остальное, включая клетки вне комнат, — общая земля кольца. */
function privateCell(world: World, idx: number): boolean {
  const id = world.roomMap[idx];
  if (id < 0) return false;
  const type = world.rooms[id]?.type;
  return type === RoomType.LIVING || type === RoomType.STORAGE || type === RoomType.BATHROOM;
}

/** Занятую клетку проход не трогает: плиты, столы, авторский свет домкома и
 *  следы самосбора расставлены раньше и переписи не подлежат. */
function wire(world: World, x: number, y: number, feature: Feature, reach: number): void {
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

export function lightCommunalRing(world: World): void {
  // Общий счётчик: кольца, проходы, кухня, прачечная, доска объявлений.
  for (let y = RING_STEP >> 1; y < W; y += RING_STEP) {
    for (let x = RING_STEP >> 1; x < W; x += RING_STEP) {
      if (privateCell(world, world.idx(x, y))) continue;
      wire(world, x, y, Feature.LAMP, 2);
    }
  }

  // Свои углы: выгородки, кладовки, туалетные блоки.
  for (let y = CELL_STEP >> 1; y < W; y += CELL_STEP) {
    for (let x = CELL_STEP >> 1; x < W; x += CELL_STEP) {
      if (!privateCell(world, world.idx(x, y))) continue;
      wire(world, x, y, Feature.CANDLE, 1);
    }
  }
}
