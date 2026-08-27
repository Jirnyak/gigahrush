/* ── Перевалка, слой 1: штабеля и эстакады ────────────────────────
 *
 * ИДЕЯ. Грузовой ярус обязан читаться вверх, а не только вширь. Ходить по
 * второму уровню движок не даёт — актёр живёт в одной плоскости, — но ОБЪЁМ он
 * рисует поклеточно: `world.ceilHeight`, ярус потолка, и авторский
 * `room.ceilingTier` формула не размывает (`vertical.md`). Значит вертикаль
 * этажа собирается не мостками, а перепадом высоты и силуэтом:
 *
 *   — вскрытый контейнер   ярус 0  → 1.0 м, в него влезаешь пригнувшись;
 *   — двор кармана         выводится → 1.5–2.5 м, обычная улица;
 *   — разгрузочная эстакада ярус 6  → 4.0 м, зал под кран;
 *   — крановый створ       ярус 7  → 4.5 м, щель света на всю длину кармана.
 *
 * Третий проход бэйка поднимает СТЕНУ до самой высокой открытой клетки, которую
 * она ограничивает. Поэтому глухой штабель, приткнутый к эстакаде, вырастает
 * башней в 4 метра, а тот же штабель посреди двора остаётся ящиком по пояс.
 * Ничего дописывать для этого не нужно — силуэт выводится из соседства.
 *
 * ЧТО ЭТО ДАЁТ БОЮ. Штабель — это стена: укрытие, из-за которого стреляют и
 * которое обходят. Решётка штабелей с проулками в три-пять клеток превращает
 * открытый двор в лабиринт с прострелами по линиям и слепыми углами на
 * пересечениях. Вскрытый контейнер — карман на одного, с одной дверью: туда
 * загоняют и оттуда не выходят.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. Стрельбы «сверху вниз» между двумя ярусами
 * ходьбы нет: у актёров одна плоскость, и заводить вторую — это не слой этажа,
 * а новая ось движения во всём движке. Галерея НАД авеню поэтому не строится;
 * строится галерея ВДОЛЬ авеню, и высота у неё настоящая.
 *
 * СТАДИЯ. Зовётся из `generatePerevalkaDesignFloor` сразу после дворов баз и
 * ДО `generateZones`/`ensureConnectivity`: слой режет геометрию, а связность
 * считается один раз и по готовому. Карман открыт на авеню всей своей кромкой —
 * прошивать его связностью не приходится вовсе.
 */

import { Cell, DoorState, Feature, RoomType, Tex, W, type Room } from '../../core/types';
import { World } from '../../core/world';
import { irand, rng } from '../../core/rand';
import { stampRoom } from '../shared';
import { applyNamedRoom, type NamedRoomTable } from '../named_rooms';
import { perevalkaBlock } from './yard';

/* ── Размеры кармана ─────────────────────────────────────────────
 * Ширина взята от квартала: 122 клетки стороны минус по 24 на бетонные поля,
 * чтобы штабель никогда не подпирал стену квартала вплотную и обход по кругу
 * оставался возможен. Глубина — треть кармана под эстакаду, две трети под двор. */
const POCKET_W = 74;
const POCKET_H = 42;
/** Полоса у дороги без штабелей: заезд фуры, и с неё же карман читается целиком. */
const APRON = 4;

/** Шаг решётки штабелей и разброс их стороны. Проулок = шаг минус сторона. */
const STACK_STEP = 9;
const STACK_MIN = 4;
const STACK_MAX = 6;

const RAMP_W = 34;
const RAMP_H = 10;
const CRANE_W = 5;
const CRANE_H = 24;
const CONTAINER_W = 7;
const CONTAINER_H = 5;
const CONTAINERS_PER_POCKET = 4;

/* ── Ярусы потолка ───────────────────────────────────────────────
 * Объявляются ровно у трёх видов комнат и больше нигде: бланкетный проход по
 * `world.rooms` запрещён (`vertical.md`), потолок называет тот, кому он нужен. */
const TIER_CRANE = 7;
const TIER_RAMP = 6;
const TIER_CONTAINER = 0;

export type PocketEdge = 'north' | 'south';

interface PocketSpec {
  bx: number;
  by: number;
  edge: PocketEdge;
  /** Человеческий номер кармана: он же уходит в имя эстакады. */
  ordinal: number;
}

/**
 * Двенадцать карманов по свободным кварталам решётки. Список авторский и
 * плоский: карман — это адрес на карте, а не результат жребия, иначе трасса
 * между базами меняет облик от прогона к прогону и запомнить ярус нельзя.
 * Заняты только те кварталы, где не стоят ни старые комнаты яруса, ни дворы
 * баз, ни три остальных слоя застройки.
 */
const POCKETS: readonly PocketSpec[] = [
  { bx: 0, by: 1, edge: 'north', ordinal: 1 },
  { bx: 0, by: 2, edge: 'north', ordinal: 2 },
  { bx: 0, by: 3, edge: 'south', ordinal: 3 },
  { bx: 2, by: 0, edge: 'south', ordinal: 4 },
  { bx: 4, by: 0, edge: 'south', ordinal: 5 },
  { bx: 5, by: 2, edge: 'north', ordinal: 6 },
  { bx: 5, by: 3, edge: 'south', ordinal: 7 },
  { bx: 6, by: 1, edge: 'north', ordinal: 8 },
  { bx: 6, by: 2, edge: 'south', ordinal: 9 },
  { bx: 2, by: 5, edge: 'north', ordinal: 10 },
  { bx: 3, by: 5, edge: 'north', ordinal: 11 },
  { bx: 4, by: 5, edge: 'north', ordinal: 12 },
];

export const PEREVALKA_STACK_ROOMS: NamedRoomTable = {
  perevalka_ramp: { type: RoomType.PRODUCTION, name: 'Разгрузочная эстакада', tags: ['perevalka', 'freight', 'ramp'] },
  perevalka_crane_run: { type: RoomType.CORRIDOR, name: 'Крановый створ', tags: ['perevalka', 'freight', 'crane'] },
  perevalka_container: { type: RoomType.STORAGE, name: 'Вскрытый контейнер', tags: ['perevalka', 'freight', 'container'] },
};

export interface PerevalkaStackYard {
  ordinal: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ramp: Room;
  crane: Room;
  containers: Room[];
  /** Сколько глухих штабелей встало во дворе: замер укрытий кармана. */
  stacks: number;
}

function carveYardFloor(world: World, x: number, y: number): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.LIFT || world.cells[i] === Cell.DOOR) return;
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = Tex.F_CONCRETE;
  world.wallTex[i] = Tex.METAL;
  world.features[i] = Feature.NONE;
}

/** Комната кармана: стены металлические, имя и метки — из объявления слоя. */
function stampPocketRoom(
  world: World, alias: string, x: number, y: number, w: number, h: number,
  wallTex: Tex, floorTex: Tex, tier: number, suffix: string,
): Room {
  const def = PEREVALKA_STACK_ROOMS[alias];
  const room = stampRoom(world, world.rooms.length, def.type, x, y, w, h, -1);
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  room.ceilingTier = tier;
  applyNamedRoom(room, `${alias}_${suffix}`, def);
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

/**
 * Ворота: полоса стены комнаты вырубается в пол и записывается за комнатой.
 * Створки здесь нет и не нужно — в эстакаду заезжают, а не заходят, и дверь в
 * три клетки шириной `sanitizeDoors` всё равно сняла бы как вырожденный проём.
 */
function openGate(world: World, room: Room, x: number, y: number, len: number, horizontal: boolean): void {
  for (let n = 0; n < len; n++) {
    const gx = horizontal ? x + n : x;
    const gy = horizontal ? y : y + n;
    const i = world.idx(gx, gy);
    world.cells[i] = Cell.FLOOR;
    world.roomMap[i] = room.id;
    world.floorTex[i] = room.floorTex;
    world.features[i] = Feature.NONE;
  }
}

/** Дверь контейнера. Обе записи обязательны: без `room.doors` комната запечатана. */
function hangDoor(world: World, room: Room, x: number, y: number): void {
  const i = world.idx(x, y);
  world.cells[i] = Cell.DOOR;
  world.wallTex[i] = Tex.DOOR_METAL;
  world.features[i] = Feature.NONE;
  world.roomMap[i] = -1;
  world.doors.set(i, { idx: i, state: DoorState.CLOSED, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
  room.doors.push(i);
}

/** Клетка свободна под штабель: пол двора, ничей, и рядом нет ни одной двери. */
function stackCellFree(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const i = world.idx(x + dx, y + dy);
      if (world.cells[i] === Cell.DOOR || world.doors.has(i)) return false;
    }
  }
  const i = world.idx(x, y);
  return world.cells[i] === Cell.FLOOR && world.roomMap[i] < 0 && world.features[i] === Feature.NONE;
}

/** Глухой штабель: обычный бетонно-железный блок стен. Укрытие и слепой угол. */
function raiseStack(world: World, x: number, y: number, w: number, h: number, raised: Set<number>): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) if (!stackCellFree(world, x + dx, y + dy)) return false;
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const i = world.idx(x + dx, y + dy);
      world.cells[i] = Cell.WALL;
      world.wallTex[i] = Tex.METAL;
      world.roomMap[i] = -1;
      raised.add(i);
    }
  }
  return true;
}

/**
 * Растащить штабеля, запершие кусок двора.
 *
 * Решётка со стороной меньше шага оставляет проулки сама, но по кромке кармана
 * и вокруг комнат жребий иногда сводит два штабеля в замок: замерено — по
 * пятачку в 20 и 4 клетки на прогон, и оба глухие. Разбор локальный и
 * ограничен карманом: волна идёт от заезда, а разгребается ТОЛЬКО поднятый
 * этим же слоем штабель — стены эстакады, створа и контейнеров неприкосновенны.
 */
function unlockTrappedYard(world: World, x: number, y: number, entryY: number, raised: Set<number>): void {
  const inside = (cx: number, cy: number) => {
    const dx = world.delta(x, cx);
    const dy = world.delta(y, cy);
    return dx >= 0 && dx < POCKET_W && dy >= 0 && dy < POCKET_H;
  };
  const walk = (i: number) => world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.DOOR;
  const seen = new Set<number>();
  const queue: number[] = [];
  for (let dx = 0; dx < POCKET_W; dx++) {
    const i = world.idx(x + dx, entryY);
    if (walk(i) && !seen.has(i)) { seen.add(i); queue.push(i); }
  }
  for (let head = 0; head < queue.length; head++) {
    const cx = queue[head] % W;
    const cy = (queue[head] / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = world.wrap(cx + dx);
      const ny = world.wrap(cy + dy);
      const ni = world.idx(nx, ny);
      if (!inside(nx, ny) || seen.has(ni) || !walk(ni)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  for (let dy = 0; dy < POCKET_H; dy++) {
    for (let dx = 0; dx < POCKET_W; dx++) {
      const start = world.idx(x + dx, y + dy);
      if (!walk(start) || seen.has(start)) continue;
      /* Волна от запертого пятачка идёт по свободному И по своим штабелям, но
       * прорубается только штабель. Прямой пробой сюда не годился: между двумя
       * контейнерами вертикаль упирается в их стены, а их ломать нельзя. */
      const parent = new Map<number, number>([[start, -1]]);
      const wave = [start];
      for (let head = 0; head < wave.length; head++) {
        const ci = wave[head];
        if (seen.has(ci)) {
          for (let step = ci; step !== -1 && step !== start; step = parent.get(step) ?? -1) {
            if (raised.has(step)) carveYardFloor(world, step % W, (step / W) | 0);
            seen.add(step);
          }
          break;
        }
        const cx = ci % W;
        const cy = (ci / W) | 0;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = world.wrap(cx + ddx);
          const ny = world.wrap(cy + ddy);
          const ni = world.idx(nx, ny);
          if (!inside(nx, ny) || parent.has(ni)) continue;
          if (!walk(ni) && !raised.has(ni)) continue;
          parent.set(ni, ci);
          wave.push(ni);
        }
      }
      for (const ci of parent.keys()) if (walk(ci)) seen.add(ci);
    }
  }
}

function buildPocket(world: World, spec: PocketSpec): PerevalkaStackYard {
  const block = perevalkaBlock(spec.bx, spec.by);
  const x = block.x + ((block.w - POCKET_W) >> 1);
  const y = spec.edge === 'north' ? block.y : block.y + block.h - POCKET_H;

  for (let dy = 0; dy < POCKET_H; dy++) {
    for (let dx = 0; dx < POCKET_W; dx++) carveYardFloor(world, x + dx, y + dy);
  }

  // Эстакада стоит у ДАЛЬНЕЙ от дороги кромки: заезжаешь с авеню, разгружаешься
  // в глубине. Створ идёт от неё к дороге, и потому виден с трассы насквозь.
  const deep = spec.edge === 'north' ? y + POCKET_H - RAMP_H - 1 : y + 1;
  const rampX = x + ((POCKET_W - RAMP_W) >> 1);
  const ramp = stampPocketRoom(
    world, 'perevalka_ramp', rampX, deep, RAMP_W, RAMP_H,
    Tex.METAL, Tex.F_CONCRETE, TIER_RAMP, String(spec.ordinal),
  );
  ramp.name = `Разгрузочная эстакада ${spec.ordinal}`;
  const gateY = spec.edge === 'north' ? ramp.y - 1 : ramp.y + RAMP_H;
  openGate(world, ramp, ramp.x + 6, gateY, 3, true);
  openGate(world, ramp, ramp.x + RAMP_W - 9, gateY, 3, true);
  // Крановый путь: машины по осевой, лампы между ними. Ярус 6 держит их высоко.
  for (let dx = 3; dx < RAMP_W - 3; dx += 5) {
    const i = world.idx(ramp.x + dx, ramp.y + (RAMP_H >> 1));
    world.features[i] = dx % 10 === 3 ? Feature.MACHINE : Feature.LAMP;
  }

  // Крановый створ: щель в 4.5 метра от эстакады к дороге. Проход сквозной,
  // поэтому у него ворота с обеих сторон, а не дверь.
  const craneX = x + ((POCKET_W - CRANE_W) >> 1);
  const craneY = spec.edge === 'north' ? y + APRON + 2 : y + POCKET_H - APRON - 2 - CRANE_H;
  const crane = stampPocketRoom(
    world, 'perevalka_crane_run', craneX, craneY, CRANE_W, CRANE_H,
    Tex.METAL, Tex.F_CONCRETE, TIER_CRANE, String(spec.ordinal),
  );
  crane.name = `Крановый створ ${spec.ordinal}`;
  openGate(world, crane, crane.x + 1, crane.y - 1, 3, true);
  openGate(world, crane, crane.x + 1, crane.y + CRANE_H, 3, true);
  for (let dy = 2; dy < CRANE_H - 2; dy += 6) {
    world.features[world.idx(crane.x + (CRANE_W >> 1), crane.y + dy)] = Feature.LAMP;
  }

  // Вскрытые контейнеры: карманы на одного вдоль боковых полей кармана, по два
  // на сторону. Дверь смотрит внутрь двора — загнанному отступать некуда.
  const containers: Room[] = [];
  for (let n = 0; n < CONTAINERS_PER_POCKET; n++) {
    const west = n % 2 === 0;
    const cx = west ? x + 1 : x + POCKET_W - CONTAINER_W - 1;
    const cy = y + APRON + 4 + (n >> 1) * (CONTAINER_H + 6);
    const box = stampPocketRoom(
      world, 'perevalka_container', cx, cy, CONTAINER_W, CONTAINER_H,
      Tex.METAL, Tex.F_CONCRETE, TIER_CONTAINER, `${spec.ordinal}_${n + 1}`,
    );
    box.name = `Вскрытый контейнер ${spec.ordinal}-${n + 1}`;
    hangDoor(world, box, west ? box.x + CONTAINER_W : box.x - 1, box.y + (CONTAINER_H >> 1));
    world.features[world.idx(box.x + 1, box.y + 1)] = Feature.SHELF;
    containers.push(box);
  }

  // Решётка глухих штабелей поверх остатка двора. Шаг постоянный, сторона
  // жребийная: проулки в три-пять клеток, и ни один не тупиковый.
  let stacks = 0;
  const raised = new Set<number>();
  const from = y + (spec.edge === 'north' ? APRON : 0);
  const to = y + POCKET_H - (spec.edge === 'north' ? 0 : APRON);
  for (let gy = from + 1; gy + STACK_MIN < to; gy += STACK_STEP) {
    for (let gx = x + 1; gx + STACK_MIN < x + POCKET_W; gx += STACK_STEP) {
      const w = irand(STACK_MIN, STACK_MAX);
      const h = irand(STACK_MIN, STACK_MAX);
      if (rng() < 0.18) continue; // прореха в решётке: двор не должен быть сеткой
      if (raiseStack(world, gx, gy, w, h, raised)) stacks++;
    }
  }
  unlockTrappedYard(world, x, y, spec.edge === 'north' ? y : y + POCKET_H - 1, raised);

  return { ordinal: spec.ordinal, x, y, w: POCKET_W, h: POCKET_H, ramp, crane, containers, stacks };
}

/** Точка входа слоя. */
export function buildPerevalkaStackYards(world: World): PerevalkaStackYard[] {
  return POCKETS.map(spec => buildPocket(world, spec));
}
