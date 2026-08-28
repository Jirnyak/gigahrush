/* ── Нижний пропускник: чужой свет ────────────────────────────────
 *
 * Этаж выходил из генератора с 40 лампами и 415 свечами на 285 тысяч
 * проходимых клеток — свечи стояли по авторскому ядру ритуала, а весь
 * пояс боковых будок, журналов и кладовых, выросший при расширении
 * маршрута, оставался слепым. Слепой — это не то же, что тёмный: в
 * слепом помещении нечего разглядывать, и оно перестаёт быть местом.
 *
 * Здесь свет никогда не бывает своим. Пропускник — боевой порог мясного
 * низа, ничьё жильё, и всё, что горит, кто-то принёс и оставил. Отсюда
 * два правила:
 *   • Обычное помещение получает редкую свечу. Свеча слабее фонаря
 *     вдвое и не достаёт до стен: видно, что тут сидели, но не видно,
 *     что в углу.
 *   • Пост — гермопост ликвидаторов, культовый гермокор, палата платы —
 *     получает фонарь в середину. Электрический свет на этом этаже
 *     означает, что место кто-то ДЕРЖИТ, и по нему читается граница
 *     чужой власти.
 *
 * Коридоры, мосты через бездну и мясные капилляры не светятся вовсе:
 * четыре пятых проходимых клеток пропускника лежат вне помещений, и
 * спуск обязан идти в темноте от огонька к огоньку.
 *
 * ПОРЯДОК. Девять постов — комнаты типа HQ, и `recarveUnderhellHqInterior`
 * в `onAfterTerritory` перестилает их насухо: `world.features[idx] =
 * Feature.NONE` по всей площади. Проход, отработавший только до бейка,
 * терял в них КАЖДЫЙ источник — замерено, ни одна лампа поста не дожила
 * до конца генерации. Поэтому расстановка поста повторяется вторым
 * шагом, `lightUnderhellPosts`, уже после перестилки, и каждая вновь
 * поставленная клетка досвечивается точечно через `relightAround`.
 */

import { Cell, Feature, RoomType, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг свечной сетки. Свеча несёт радиус 5 и заметно проседает к краю:
 *  выше порога видимости она держит около четырёх с половиной клеток, то
 *  есть пятно диаметром девять. Шаг ровно по пятну — помещение читается,
 *  углы тонут. Замерено: 25.4% освещённых клеток этажа против 10.2% до
 *  прохода. */
const ROOM_STEP = 9;

function placeSource(world: World, x: number, y: number, feature: Feature): number {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return -1;
  if (world.features[idx] !== Feature.NONE) return -1;
  world.features[idx] = feature;
  return idx;
}

/** Кольцевой поиск свободной клетки: узел сетки то и дело приходится на
 *  алтарь, полку или идола, и без обхода источник просто пропадает. */
function placeNear(world: World, x: number, y: number, feature: Feature, reach: number): number {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const idx = placeSource(world, x + dx, y + dy, feature);
        if (idx >= 0) return idx;
      }
    }
  }
  return -1;
}

/** Расстановка одного помещения. Возвращает занятые клетки, чтобы второй
 *  шаг мог досветить их точечно, не пересчитывая весь этаж. */
function lightRoom(world: World, room: Room, post: boolean): number[] {
  const placed: number[] = [];
  if (post) {
    const center = placeNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 3);
    if (center >= 0) placed.push(center);
  }
  const half = ROOM_STEP >> 1;
  for (let y = room.y + half; y < room.y + room.h; y += ROOM_STEP) {
    for (let x = room.x + half; x < room.x + room.w; x += ROOM_STEP) {
      const idx = placeNear(world, x, y, Feature.CANDLE, 2);
      if (idx >= 0) placed.push(idx);
    }
  }
  return placed;
}

export function lightUnderhell(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    lightRoom(world, room, room.type === RoomType.HQ);
  }
}

/** Второй шаг: посты после перестилки территории. Ставит те же источники
 *  на те же клетки и досвечивает каждую — без него пост стоит с чужой
 *  засвеченной картой и без единого фонаря в мире. */
export function lightUnderhellPosts(world: World): void {
  for (const room of world.rooms) {
    if (!room || room.type !== RoomType.HQ) continue;
    for (const idx of lightRoom(world, room, true)) world.relightAround(idx);
  }
}
