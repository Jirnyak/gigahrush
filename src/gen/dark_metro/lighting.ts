/* ── Тёмная пересадка: свет только там, где стоят ──────────────────
 *
 * Имя этажа — обещание, и проход обязан его сдержать. Пересадка должна
 * остаться коротким опасным ходом: не «тёмный этаж, который забыли
 * осветить», а этаж, на котором свет кончается ровно там, где кончается
 * обжитое.
 *
 * Поэтому правило одно: светятся ПОМЕЩЕНИЯ — платформы, залы, посты,
 * станционные блоки, будки, кладовые, — и не светится ни один перегон.
 * Две трети проходимых клеток пересадки лежат в тоннелях между линиями,
 * и там остаётся авторская редкая свеча через сотню клеток. Игрок
 * выходит из освещённого зала в чёрный перегон и знает цену тому, что
 * пошёл коротким ходом.
 *
 * Из освещаемых вычтены те помещения, чья темнота названа в собственном
 * имени: слепая подсобка и всё, что принадлежит чёрному перегону. Свет
 * там был бы прямым противоречием подписи на карте.
 *
 * Отдельно — пост белой лампы. Он назван по своему источнику, и потому
 * светит плотнее прочих: белую лампу видно с перегона, и на неё идут.
 *
 * Пометка про порядок: `applyDarkMetroAmbientLight` в `npcs.ts` не ставит
 * фичи, а РИСУЕТ по `world.light[]` напрямую. Она обязана стоять ПОСЛЕ
 * `world.bakeLights()`, иначе бейк сотрёт её работу. Этот проход, наоборот,
 * ставит фичи и потому идёт ДО бейка.
 */

import { Cell, Feature, type Room } from '../../core/types';
import type { World } from '../../core/world';

/** Шаг сетки помещения. Лампа несёт радиус 8 (пятно 16), шаг теснее пятна:
 *  зал станции освещён сплошь, потому что зал — это место, где стоят.
 *  Темнота этажа целиком вынесена в перегоны. Замерено: шаг 11 давал 35.1%
 *  освещённых клеток этажа, шаг 9 даёт 37.3% против 13.0% до прохода. */
const HALL_STEP = 9;

/** Пост белой лампы светит плотнее: он назван по своему свету, и на этот
 *  свет из перегона идут. */
const WHITE_LAMP_STEP = 5;

const WHITE_LAMP_MARK = 'Пост белой лампы';

/** Помещения, чья темнота записана в имени: свет в них противоречил бы
 *  подписи на карте. */
const DARK_ROOM_MARKS: readonly string[] = ['Слепая подсобка', 'черного перегона'];

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: узел сетки часто занят скамьёй,
 *  турникетом или ящиком станции, и без обхода лампа просто пропадает. */
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

function lightHall(world: World, room: Room, step: number): void {
  const half = step >> 1;
  for (let y = room.y + half; y < room.y + room.h; y += step) {
    for (let x = room.x + half; x < room.x + room.w; x += step) {
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}

export function lightDarkMetro(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    if (DARK_ROOM_MARKS.some(mark => room.name.includes(mark))) continue;
    lightHall(world, room, room.name.includes(WHITE_LAMP_MARK) ? WHITE_LAMP_STEP : HALL_STEP);
  }
}
