/* ── Гиперболическая стрелочная: свет по платформам ───────────────
 *
 * Дуги освещают себя сами: `decorateSwitchyard` роняет фонарь на каждую
 * 41-ю клетку дорожки, и нить пути видна. А вот платформы, пульты и
 * служебные блоки выходили из генератора с одной лампой в углу — зал
 * 84×26 читался чёрным провалом между двумя светящимися дугами.
 *
 * Свет здесь — признак НАСТОЯЩЕЙ платформы. Гиперболическая геометрия
 * врёт про расстояния: соседняя по виду дуга уводит на полкарты, и
 * единственное, чему игрок может верить, — горит ли над путями свет.
 * Поэтому сетка ламп кладётся ВНУТРЬ комнат и не кладётся между ними:
 * порода между дугами остаётся чёрной, и дуга читается как светящаяся
 * нить, а не как коридор освещённого зала.
 *
 * Две комнаты выключены из сетки нарочно, и это тоже разметка:
 *   • ложная платформа — на ней одна свеча от `decorateSwitchyard`, и
 *     разница с настоящей платформой видна за сотню клеток;
 *   • геодезическая кишка — короткий ход с монстрами, её цена и есть
 *     темнота.
 */

import { Cell, Feature, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { HYPERBOLIC_SWITCHYARD_ROOM_NAMES } from './meta';

/** Шаг платформенной сетки. Лампа несёт радиус 8, то есть пятно диаметром 16;
 *  шаг чуть шире пятна оставляет между лампами настоящие тени, и зал читается
 *  освещённым, а не залитым. Замерено: шаг 12 давал 74.7% освещённых клеток
 *  этажа — контору под потолочным светом; шаг 17 даёт 59.7% против 33.5% до
 *  прохода. */
const PLATFORM_STEP = 17;
const PLATFORM_HALF = PLATFORM_STEP >> 1;

/** Комнаты, которым свет не положен по замыслу этажа. */
const UNLIT_ROOM_NAMES: readonly string[] = [
  HYPERBOLIC_SWITCHYARD_ROOM_NAMES.shortcut,
  'Ложная платформа с обратной стрелкой',
];

/** Ставит источник, если клетка свободна. Занятую не трогает: авторский
 *  декор, пульты и экраны старше общего прохода. */
function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки вокруг узла сетки: без него лампа
 *  пропадает всякий раз, когда в узел встал аппарат или стол. */
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

function lightPlatform(world: World, room: Room): void {
  for (let y = room.y + PLATFORM_HALF; y < room.y + room.h; y += PLATFORM_STEP) {
    for (let x = room.x + PLATFORM_HALF; x < room.x + room.w; x += PLATFORM_STEP) {
      placeNear(world, x, y, Feature.LAMP, 2);
    }
  }
}

export function lightHyperbolicSwitchyard(world: World): void {
  for (const room of world.rooms) {
    if (!room || UNLIT_ROOM_NAMES.includes(room.name)) continue;
    lightPlatform(world, room);
  }
}
