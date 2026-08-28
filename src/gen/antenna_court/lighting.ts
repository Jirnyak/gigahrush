/* ── Антенный двор: свет мачт и постов ────────────────────────────
 *
 * У двора дефект был двойной. Во-первых, ПОРЯДОК: `world.bakeLights()` стоял до
 * расширения маршрутной геометрии, и всё, что расширение приносило, света уже
 * не получало. Во-вторых, источников и не было — 159 штук на 221 567 проходимых
 * клеток, то есть двор, релейная, глушилка и досмотр стояли в полной темноте.
 *
 * Двор открыт ветру, и свет здесь идёт СВЕРХУ: редкие мачтовые прожекторы над
 * открытой землёй, между ними — настоящая тень. Это служебный объект, а не
 * улица: на нём светят точки, а не линии, и по ним читается, куда идёт кабель.
 * Внутри постов связи свет плотнее — там работают руками, с платами и
 * записями частот, и темнота в релейной означала бы, что пост брошен.
 *
 * Проход детерминированный, шагом по сетке. Занятые клетки не трогаются:
 * авторские экраны, мачты и обстановка постов остаются как объявлены.
 */

import { Cell, Feature, W } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг мачтовых прожекторов над двором. Радиус лампы 8: шаг вдвое шире радиуса
 *  оставляет между пятнами тёмный промежуток — двор освещён точками, а не залит.
 *  Шаг 11 давал бы сплошную заливку, то есть контору под открытым небом. */
const MAST_STEP = 16;

/** Шаг рабочего света внутри постов: тут читают номиналы и паяют, и провал
 *  между пятнами здесь недопустим. */
const POST_STEP = 11;

function mountLamp(world: World, x: number, y: number): boolean {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR || world.features[i] !== Feature.NONE) return false;
  world.features[i] = Feature.LAMP;
  return true;
}

/** Прожектор садится на ближайшую свободную клетку. Без обхода мачта пропадает
 *  везде, где под ней встал стол связиста или растяжка антенны. */
function mountLampNear(world: World, x: number, y: number, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (mountLamp(world, x + dx, y + dy)) return true;
      }
    }
  }
  return false;
}

export function lightAntennaCourt(world: World): void {
  // Посты связи: лампа посреди помещения и разводка по шагу. Радиоклуб, архив,
  // батарейная и досмотр должны быть светлее двора — по свету игрок и отличает
  // занятый пост от пустой площадки.
  for (const room of world.rooms) {
    if (!room) continue;
    mountLampNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 2);
    for (let y = room.y + (POST_STEP >> 1); y < room.y + room.h; y += POST_STEP) {
      for (let x = room.x + (POST_STEP >> 1); x < room.x + room.w; x += POST_STEP) {
        mountLampNear(world, x, y, 1);
      }
    }
  }

  // Открытая земля двора: мачты по редкой сетке. Клетки постов уже прошли выше.
  for (let y = MAST_STEP >> 1; y < W; y += MAST_STEP) {
    for (let x = MAST_STEP >> 1; x < W; x += MAST_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      mountLampNear(world, x, y, 2);
    }
  }
}
