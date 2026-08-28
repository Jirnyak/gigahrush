/* ── Морг регистраций: свет над столом, темнота над ящиком ─────────
 *
 * Этаж выходил из генератора с 0.3% освещённости при 436 расставленных лампах —
 * худший показатель среди маршрутных. Лампы стояли, но не светили: `bakeLights()`
 * вызывался ДО `expandRegistryMorgueGeometry`, и запекался авторский костяк из
 * шести комнат, а расширенный корпус — почти все 159 848 проходимых клеток —
 * рождался уже после. Порядок исправлен в `index.ts`; здесь ставится свет.
 *
 * Морг не освещают целиком, и это не экономия. Свет здесь висит там, где ПИШУТ:
 * над окном приёма, над бирочной, над книгой умерших, над моечным столом. Где
 * не пишут — над холодными ящиками, в переходах, между рядами — темно
 * по-настоящему, и это единственная честная подсказка о том, что происходит в
 * этом учреждении с человеком, которого перестали записывать.
 *
 * Поэтому цель этажа — не «светло», а около 60% освещённых клеток: комнаты
 * работы видно, дорога между ними — нет.
 *
 * Проход детерминированный, без жребия. Лампа не путевая преграда, так что
 * сетка не запирает ни холодную камеру, ни зараженную.
 */

import { Cell, Feature, RoomType, W, type Room } from '../../core/types';
import type { World } from '../../core/world';

/* Рабочие комнаты: шаг чуть шире видимого пятна лампы (около 7.6 клетки), так
 * что стол освещён, а углы кабинета — уже нет. Над формой, которую заполняют,
 * тени нет; над тем, кто стоит у стены и ждёт, — есть. */
const DESK_STEP = 12;

/* Хранение: холодные камеры и стеллажи. Шаг заведомо больше диаметра пятна
 * (15.2), пятна НЕ смыкаются: лампа над рядом и полная темнота между рядами.
 * Ящику свет не нужен — он нужен человеку, который к ящику подошёл. */
const COLD_STEP = 22;

/* Переходы и земля корпуса: одинокие лампы, между которыми игрок идёт вслепую.
 * Шаг ещё шире, чем в хранении, и это главный источник темноты этажа: переходов
 * тут больше, чем комнат, и именно они держат общую освещённость около 60%. */
const PASSAGE_STEP = 24;
const PASSAGE_OFFSET = 11;

/** Занятую клетку не переписываем: убранство `decorateRegistryMorgue`, каталки,
 *  секционные столы и картотека объявлены раньше этого прохода. */
function placeLamp(world: World, x: number, y: number): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = Feature.LAMP;
  return true;
}

/** Кольцевой обход вокруг узла: в морге узел сетки постоянно приходится на стол
 *  или на ящик, а лампа над занятой клеткой — как раз то, что здесь нужно. */
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

/** Где пишут, а где хранят. Тип комнаты решает, будет ли в ней темно. */
function roomStep(room: Room): number {
  return room.type === RoomType.STORAGE ? COLD_STEP : DESK_STEP;
}

export function lightRegistryMorgue(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    // Лампа в середине даже у холодной камеры: подойти к ящику надо при свете,
    // иначе комната перестаёт быть проходимой, а не становится страшной.
    placeNear(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 2);
    const step = roomStep(room);
    const half = Math.floor(step / 2);
    for (let dy = half; dy < room.h; dy += step) {
      for (let dx = half; dx < room.w; dx += step) {
        placeNear(world, room.x + dx, room.y + dy, 2);
      }
    }
  }

  // Переходы между комнатами. Клетки комнат уже прошли своим шагом выше.
  for (let y = PASSAGE_OFFSET; y < W; y += PASSAGE_STEP) {
    for (let x = PASSAGE_OFFSET; x < W; x += PASSAGE_STEP) {
      if (world.roomMap[world.idx(x, y)] >= 0) continue;
      // Радиус спасения узкий: узел, попавший в стену, здесь просто пропадает.
      // Широкий обход вытаскивал бы лампу в соседний переход и заливал корпус.
      placeNear(world, x, y, 2);
    }
  }
}
