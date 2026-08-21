/* ── Стенка на стенку: геометрия трёх линий, леса и баз ─────────
 *
 *   Карта нарисована так, чтобы марш крипа не требовал ни одной строчки
 *   кода движения. Проходимо ТОЛЬКО то, что вырезано: три линии от базы
 *   к базе плюс лесные тупики, висящие на линиях. Тупик никогда не
 *   короче линии, поэтому кратчайший путь из гнезда к своей целевой
 *   комнате идёт по своей же линии и никуда не сворачивает.
 *
 *   Целевая комната у каждого гнезда — дальний конец ЕГО линии, а не
 *   чужая база: иначе все шесть гнёзд считали бы кратчайшим один и тот
 *   же центральный проход, и боковые линии остались бы пустыми.
 */

import { Cell, Feature, RoomType, Tex, W, type Room } from '../../core/types';
import { World } from '../../core/world';
import { seededRandom } from '../../core/rand';
import { stampRoom } from '../shared';
import {
  ARENA_MAX,
  ARENA_MIN,
  BASE_A,
  BASE_B,
  BASE_SIZE,
  CAMP_LINK_WIDTH,
  CORNER_BOT,
  CORNER_TOP,
  LANE_IDS,
  LANE_WIDTH,
  TARGET_T,
  type LaneId,
  type StenkaLane,
  type StenkaRooms,
} from './meta';

/** Сплошной бетон: вырезать будем из него, а не достраивать в пустоте. */
export function paintSolidBase(world: World): void {
  world.cells.fill(Cell.WALL);
  world.wallTex.fill(Tex.CONCRETE);
  world.floorTex.fill(Tex.F_CONCRETE);
  world.roomMap.fill(-1);
}

function segmentLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function buildLanes(): StenkaLane[] {
  const shapes: Record<LaneId, { x: number; y: number }[]> = {
    top: [BASE_A, CORNER_TOP, BASE_B],
    mid: [BASE_A, BASE_B],
    bot: [BASE_A, CORNER_BOT, BASE_B],
  };
  return LANE_IDS.map(id => {
    const points = shapes[id];
    let length = 0;
    for (let i = 1; i < points.length; i++) length += segmentLength(points[i - 1], points[i]);
    return { id, points, length };
  });
}

/** Точка на ломаной по доле её длины. Доли — единственная мера позиций на линии. */
export function lanePointAt(lane: StenkaLane, t: number): { x: number; y: number } {
  const want = Math.max(0, Math.min(1, t)) * lane.length;
  let walked = 0;
  for (let i = 1; i < lane.points.length; i++) {
    const a = lane.points[i - 1];
    const b = lane.points[i];
    const len = segmentLength(a, b);
    if (walked + len >= want || i === lane.points.length - 1) {
      const k = len === 0 ? 0 : Math.max(0, Math.min(1, (want - walked) / len));
      return { x: Math.round(a.x + (b.x - a.x) * k), y: Math.round(a.y + (b.y - a.y) * k) };
    }
    walked += len;
  }
  return { ...lane.points[lane.points.length - 1] };
}

function inArena(x: number, y: number): boolean {
  return x >= ARENA_MIN && x <= ARENA_MAX && y >= ARENA_MIN && y <= ARENA_MAX;
}

function carveBrush(world: World, cx: number, cy: number, width: number): number {
  const half = width >> 1;
  let carved = 0;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inArena(x, y)) continue;
      const i = world.idx(x, y);
      if (world.cells[i] === Cell.FLOOR) continue;
      world.cells[i] = Cell.FLOOR;
      carved++;
    }
  }
  return carved;
}

/** Прямой прорез кистью: работает и по осям, и по диагонали центральной линии. */
export function carveStraight(
  world: World,
  ax: number, ay: number, bx: number, by: number,
  width: number,
): number {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  let carved = 0;
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    carved += carveBrush(world, Math.round(ax + (bx - ax) * k), Math.round(ay + (by - ay) * k), width);
  }
  return carved;
}

export function carveLanes(world: World, lanes: readonly StenkaLane[]): number {
  let carved = 0;
  for (const lane of lanes) {
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1];
      const b = lane.points[i];
      carved += carveStraight(world, a.x, a.y, b.x, b.y, LANE_WIDTH);
    }
  }
  return carved;
}

/**
 * Комната как расширение прохода, а не запертое помещение.
 *
 * `stampRoom` безусловно обводит прямоугольник стеной — для квартиры это
 * правильно, но здесь такая обводка рвёт линию надвое ровно там, где стоит
 * рубеж или база. Поэтому перед штампом запоминаем, какие клетки обводки уже
 * были полом, и возвращаем их обратно: комната появляется, проход остаётся.
 */
function stampOpenRoom(world: World, id: number, type: RoomType, cx: number, cy: number, size: number, name: string): Room {
  const x = cx - (size >> 1);
  const y = cy - (size >> 1);
  const reopen: number[] = [];
  for (let dy = -1; dy <= size; dy++) {
    for (let dx = -1; dx <= size; dx++) {
      if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
      const wx = x + dx;
      const wy = y + dy;
      if (!inArena(wx, wy)) continue;
      const i = world.idx(wx, wy);
      if (world.cells[i] === Cell.FLOOR) reopen.push(i);
    }
  }
  const room = stampRoom(world, id, type, x, y, size, size, -1);
  room.name = name;
  for (const i of reopen) world.cells[i] = Cell.FLOOR;
  return room;
}

export function stampArenaRooms(world: World, lanes: readonly StenkaLane[], nextRoomId: { v: number }): StenkaRooms {
  const baseA = stampOpenRoom(world, nextRoomId.v++, RoomType.HQ, BASE_A.x, BASE_A.y, BASE_SIZE, 'Стенка: база ликвидаторов');
  const baseB = stampOpenRoom(world, nextRoomId.v++, RoomType.HQ, BASE_B.x, BASE_B.y, BASE_SIZE, 'Стенка: логово диких');

  const frontA = {} as Record<LaneId, Room>;
  const frontB = {} as Record<LaneId, Room>;
  for (const lane of lanes) {
    // Рубеж — цель марша встречной стороны: боец с базы B идёт СЮДА, а не в
    // саму базу A, и потому не сворачивает с собственной линии.
    const a = lanePointAt(lane, 1 - TARGET_T);
    const b = lanePointAt(lane, TARGET_T);
    frontA[lane.id] = stampOpenRoom(world, nextRoomId.v++, RoomType.CORRIDOR, a.x, a.y, 15, `Стенка: рубеж ликвидаторов (${lane.id})`);
    frontB[lane.id] = stampOpenRoom(world, nextRoomId.v++, RoomType.CORRIDOR, b.x, b.y, 15, `Стенка: рубеж диких (${lane.id})`);
  }

  return { baseA, baseB, frontA, frontB, camps: [], campDens: [] };
}

/**
 * Лес: тупиковые карманы, висящие на линиях. Тупик — не украшение, а условие
 * марша: любой сквозной проход между линиями стал бы для крипа кратчайшим
 * путём, и все три линии схлопнулись бы в одну.
 */
export function stampCamps(
  world: World,
  lanes: readonly StenkaLane[],
  rooms: StenkaRooms,
  nextRoomId: { v: number },
  seed: number,
): void {
  const rnd = seededRandom(seed);
  const mid = lanes.find(lane => lane.id === 'mid')!;
  const sides = lanes.filter(lane => lane.id !== 'mid');

  for (const side of sides) {
    for (let i = 0; i < 5; i++) {
      const t = 0.22 + i * 0.14;
      const anchor = lanePointAt(side, t);
      const inward = lanePointAt(mid, t);
      const dx = inward.x - anchor.x;
      const dy = inward.y - anchor.y;
      const len = Math.hypot(dx, dy) || 1;
      // Карман уводится к центру карты, но не доходит до центральной линии:
      // 0.34 длины до неё гарантирует стену между лесом и серединой.
      const reach = len * (0.26 + rnd() * 0.08);
      const cx = Math.round(anchor.x + (dx / len) * reach);
      const cy = Math.round(anchor.y + (dy / len) * reach);
      if (!inArena(cx - 12, cy - 12) || !inArena(cx + 12, cy + 12)) continue;

      carveStraight(world, anchor.x, anchor.y, cx, cy, CAMP_LINK_WIDTH);
      const size = 19;
      const camp = stampOpenRoom(world, nextRoomId.v++, RoomType.STORAGE, cx, cy, size, `Стенка: лесной лагерь ${side.id}-${i + 1}`);
      rooms.camps.push(camp);
      // Логово — за дальней стенкой кармана, В КАМНЕ. Неубиваемость лагеря
      // держится геометрией: туда нет ни прохода, ни линии выстрела, а
      // приплод выходит на соседний пол самого кармана.
      //
      // Логово прижимается к СЕРЕДИНЕ дальней стены, а не к углу. Диагональ
      // ставит его в угол кармана, где напротив всего три клетки пола, и
      // детерминированный поиск места для выводка их регулярно промахивает —
      // лагерь молча остаётся пустым. Ось выбирается по большей составляющей.
      const depth = (size >> 1) + 2;
      rooms.campDens.push(Math.abs(dx) >= Math.abs(dy)
        ? { x: cx + Math.sign(dx || 1) * depth, y: cy }
        : { x: cx, y: cy + Math.sign(dy || 1) * depth });
    }
  }
}

/** Пол линий — металл, лес и базы остаются бетоном: сторона видна по покрытию. */
export function paintLaneFloors(world: World, lanes: readonly StenkaLane[]): void {
  for (const lane of lanes) {
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1];
      const b = lane.points[i];
      const steps = Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
      for (let s = 0; s <= steps; s++) {
        const k = s / steps;
        const cx = Math.round(a.x + (b.x - a.x) * k);
        const cy = Math.round(a.y + (b.y - a.y) * k);
        const half = LANE_WIDTH >> 1;
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (!inArena(x, y)) continue;
            const idx = world.idx(x, y);
            if (world.cells[idx] !== Cell.FLOOR) continue;
            world.floorTex[idx] = Tex.F_LINO;
          }
        }
      }
    }
  }
}

/**
 * Фонари по линиям. Арена без света читается как чёрный лабиринт: разглядеть,
 * с какой стороны идёт волна, важнее здешней темноты. Ставятся по обочине,
 * чтобы не мешать проходу и очерчивать саму линию.
 */
export function placeLaneLamps(world: World, lanes: readonly StenkaLane[], step = 34): number {
  const half = LANE_WIDTH >> 1;
  let placed = 0;
  for (const lane of lanes) {
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1];
      const b = lane.points[i];
      const len = Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
      for (let s = step; s < len; s += step) {
        const k = s / len;
        const cx = Math.round(a.x + (b.x - a.x) * k);
        const cy = Math.round(a.y + (b.y - a.y) * k);
        // Нормаль к отрезку: фонарь уходит на обочину, а не в середину прохода.
        const nx = Math.sign(b.y - a.y) || 1;
        const ny = -Math.sign(b.x - a.x) || 1;
        for (const side of [-1, 1]) {
          const x = cx + nx * half * side;
          const y = cy + ny * half * side;
          if (!inArena(x, y)) continue;
          const idx = world.idx(x, y);
          if (world.cells[idx] !== Cell.FLOOR) continue;
          if (world.features[idx] !== Feature.NONE) continue;
          world.features[idx] = Feature.LAMP;
          placed++;
        }
      }
    }
  }
  return placed;
}

/** Клетка тумбочки под лут в лесном лагере. */
export function campLootCell(camp: Room): { x: number; y: number } {
  return { x: camp.x + (camp.w >> 1), y: camp.y + (camp.h >> 1) };
}

export function arenaFloorCells(world: World): number {
  let open = 0;
  for (let i = 0; i < W * W; i++) if (world.cells[i] === Cell.FLOOR) open++;
  return open;
}
