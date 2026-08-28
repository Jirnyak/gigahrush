/* ── Стенка на стенку: свет двух сторон ───────────────────────────
 *
 * Линии этаж освещал сам (`placeLaneLamps` ставит фонари по обочине
 * через каждые 34 клетки), а вот базы, рубежи и лесные лагеря стояли
 * тёмными — то есть тёмными были ровно те места, где решается бой.
 * База 96×96 без света читается как пещера, и понять, откуда вышла
 * волна, можно только на дистанции удара.
 *
 * Свет здесь принадлежит стороне и говорит, чья это земля.
 *   • База ликвидаторов и логово диких горят по всей площади: свой тыл
 *     видно, и заходя на чужой ты видишь, что зашёл.
 *   • Рубеж — цель марша встречной стороны — светит как маяк: марш идёт
 *     на огонь, и промахнуться мимо цели нельзя.
 *   • Лесной лагерь получает костёр, а не фонарь. Костёр слабее и не
 *     достаёт до края кармана: лагерь виден, но тупик за ним — нет,
 *     и лес остаётся местом, где прячутся.
 *
 * Сами линии не трогаются. Их редкий фонарь через 34 клетки — это ритм
 * этажа: между освещёнными участками остаётся чёрный прогон, и волна
 * выходит из темноты, а не из ровно освещённого коридора.
 */

import { Cell, Feature, type Room } from '../../core/types';
import type { World } from '../../core/world';
import type { StenkaRooms } from './meta';

/** Шаг сетки базы. Лампа несёт радиус 8, то есть пятно диаметром 16;
 *  шаг теснее пятна — тыл стороны освещён сплошь. Темнота этажа живёт
 *  снаружи: почти две трети проходимых клеток арены — линии и лес, и
 *  туда сетка не заходит. Замерено: 54.0% освещённых клеток этажа
 *  против 28.8% до прохода. */
const BASE_STEP = 13;

/** Рубеж 15×15 берёт одну лампу в середину: маяк, а не освещённый зал. */
const FRONT_CENTER = 7;

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: узел сетки то и дело приходится на
 *  тумбочку лута или логово, и без обхода источник просто пропадает. */
function placeNear(world: World, x: number, y: number, feature: Feature, reach: number): boolean {
  for (let r = 0; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (placeSource(world, x + dx, y + dy, feature)) return true;
      }
    }
  }
  return false;
}

function lightBase(world: World, base: Room): void {
  const half = BASE_STEP >> 1;
  for (let y = base.y + half; y < base.y + base.h; y += BASE_STEP) {
    for (let x = base.x + half; x < base.x + base.w; x += BASE_STEP) {
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}

export function lightStenka(world: World, rooms: StenkaRooms): void {
  lightBase(world, rooms.baseA);
  lightBase(world, rooms.baseB);

  for (const front of [...Object.values(rooms.frontA), ...Object.values(rooms.frontB)]) {
    placeNear(world, front.x + FRONT_CENTER, front.y + FRONT_CENTER, Feature.LAMP, 3);
  }

  // Костёр лагеря: свеча вдвое слабее фонаря и не достаёт до стен кармана.
  for (const camp of rooms.camps) {
    placeNear(world, camp.x + (camp.w >> 1), camp.y + (camp.h >> 1), Feature.CANDLE, 3);
  }
}
