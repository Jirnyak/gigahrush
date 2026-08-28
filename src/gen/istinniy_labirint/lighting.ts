/* ── Истинный лабиринт: свет как метка пути ───────────────────────
 *
 * Этаж выходил из генератора с двумя лампами и одной свечой на 260 тысяч
 * проходимых клеток. Это не «атмосферно тёмный» лабиринт, а слепой:
 * различить перекрёсток от тупика и белую стену от красной хорды нельзя
 * вообще, и вся игра лабиринта — считать повороты и держаться нити —
 * умирает, не начавшись.
 *
 * Свет здесь не освещение, а РАЗМЕТКА. Никто не проводил на этот этаж
 * линию; всё, что горит, оставил тот, кто уже проходил и хотел вернуться.
 * Поэтому источники стоят там, где идущему нужно принять решение, и
 * нигде больше:
 *   • белая стена обратного пути — сплошная цепочка фонарей. Это
 *     единственный маршрут, который на этаже гарантированно выводит, и
 *     его обязано быть видно издалека;
 *   • главная нить от входа к выходу — фонарь на каждом третьем узле:
 *     реже, чем на белой стене, потому что нить надо ЧИТАТЬ, а не идти
 *     по освещённому коридору;
 *   • развилка на три хода — свеча. Отмечена ровно настолько, чтобы
 *     игрок увидел: тут кто-то останавливался выбирать;
 *   • перекрёсток на все четыре — фонарь. Их на этаже вдвое меньше, чем
 *     развилок, и ошибка на них дороже всего;
 *   • ориентиры — фонарь в середину комнаты.
 *
 * Тупики, боковые ветви и красные хорды не получают ничего. Три четверти
 * узлов сетки остаются чёрными, и это условие задачи: если светится всё,
 * лабиринта нет. Замерено: 23.1% освещённых клеток этажа против 0.1% до
 * прохода, то есть три четверти лабиринта по-прежнему темнота.
 */

import { Cell, Feature, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { GRID_N, LANDMARK_ROOM_NAMES, type MazeGraph } from './meta';
import { centerOf, degree } from './geometry';

/** Шаг фонарей по белой стене. Лампа несёт радиус 8 (пятно 16), шаг
 *  чуть теснее пятна: обратный путь читается непрерывной светящейся
 *  полосой, и спутать его с обычным коридором нельзя. */
const SAFE_WALL_STEP = 13;

/** Шаг фонарей по главной нити, в узлах сетки. Каждый третий узел — нить
 *  подсвечена пунктиром, а не залита: игрок идёт от огня к огню и всё
 *  ещё может сбиться. */
const THREAD_NODE_STEP = 3;

/** Развилка — узел, из которого выходят три хода. Отмечается свечой. */
const JUNCTION_DEGREE = 3;

/** Перекрёсток на все четыре стороны. В растущем дереве с вплетёнными
 *  тупиками он редок, и стоит фонаря: место, где ошибиться дороже всего,
 *  видно с соседнего узла. */
const CROSSROAD_DEGREE = 4;

function placeSource(world: World, x: number, y: number, feature: Feature): boolean {
  const idx = world.idx(x, y);
  if (world.cells[idx] !== Cell.FLOOR) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  world.features[idx] = feature;
  return true;
}

/** Кольцевой поиск свободной клетки: узел сетки бывает занят меткой,
 *  ящиком или лифтом, и без обхода источник просто пропадает. */
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

function lightSafeWall(world: World, route: readonly number[]): void {
  for (let i = 0; i < route.length; i += SAFE_WALL_STEP) {
    const cell = route[i];
    placeNear(world, cell % W, (cell / W) | 0, Feature.LAMP, 2);
  }
}

function lightMainThread(world: World, graph: MazeGraph): void {
  for (let i = 0; i < graph.mainPath.length; i += THREAD_NODE_STEP) {
    const p = centerOf(graph.mainPath[i]);
    placeNear(world, p.x, p.y, Feature.LAMP, 2);
  }
}

function lightJunctions(world: World, graph: MazeGraph): void {
  for (let idx = 0; idx < GRID_N; idx++) {
    const links = degree(graph.links, idx);
    if (links < JUNCTION_DEGREE) continue;
    const p = centerOf(idx);
    placeNear(world, p.x, p.y, links >= CROSSROAD_DEGREE ? Feature.LAMP : Feature.CANDLE, 2);
  }
}

function lightLandmark(world: World, room: Room): void {
  placeNear(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP, 3);
}

export function lightIstinniyLabirint(world: World, graph: MazeGraph, safeRoute: readonly number[]): void {
  lightSafeWall(world, safeRoute);
  lightMainThread(world, graph);
  lightJunctions(world, graph);
  for (const room of world.rooms) {
    if (room && LANDMARK_ROOM_NAMES.has(room.name)) lightLandmark(world, room);
  }
}
