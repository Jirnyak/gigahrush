/* ── База Ликвидаторов: геометрия форта и диких земель ────────────
 *
 * Этаж был заглушкой: четыре зала на 4992 проходимых клетки, из них арена
 * занимала половину этажа. Мерка взята с жилого — медиана комнаты около 20
 * клеток, ни одна комната не тянет заметной доли этажа. Арена единственное
 * исключение, и даже она доли процента.
 *
 * Форт занимает четверть этажа в центре: кварталы, разрезанные улицами, плац,
 * бараки, оружейные, стрельбища, штаб гарнизона и арена в сердце. Остальные три
 * четверти — земли диких и мутантов: развалины кварталов, между которыми
 * открытая земля. Форт читается как остров порядка среди чужой земли.
 */

import { Cell, Feature, RoomType, Tex, W, type Room } from '../../core/types';
import type { World } from '../../core/world';
import { SeedRng } from '../../core/rand';
import { stampRoom } from '../shared';
import { applyNamedRoom } from '../named_rooms';
import { LIQUIDATOR_BASE_ARENA_ANCHOR, LIQUIDATOR_BASE_NAMED_ROOMS } from './rooms';

/** Сторона форта: четверть этажа по площади. */
export const FORT_SIDE = 512;
export const FORT_X0 = Math.floor((W - FORT_SIDE) / 2);
export const FORT_Y0 = FORT_X0;

/** Арена в сердце форта. Доли процента этажа, а не половина, как было. */
export const ARENA_SIDE = 56;
/** Насколько ринг (столы по периметру песка) отступает от стены арены. */
export const ARENA_RING_INSET = 16;
/**
 * Половина ПЕСКА в клетках: от середины арены до внутренней кромки столов.
 *
 * Считается, а не пишется: столы — путевая преграда (`table_slab_blocker`), то
 * есть песок это настоящая клетка с четырьмя воротами, и всякий, кто мерит бой
 * или кадр от середины арены, обязан мерить от ТОЙ ЖЕ границы, что её строит.
 */
export const ARENA_SAND_HALF = ARENA_SIDE / 2 - ARENA_RING_INSET - 1;
/**
 * Рабочий ряд трибуны: столько клеток от середины арены до места, где стоят
 * распорядитель и зрители.
 *
 * Он глубоко в креслах, а не у первого стола, и это не вкус: боец берёт боевую
 * цель в восьми клетках (`NPC_COMBAT_RANGE`, `ai/combat.ts`), а на песке
 * дерутся в пределах его половины. Двадцать минус одиннадцать даёт зазор,
 * которого не хватает бойцу, чтобы позвать трибуну в свою драку.
 */
export const ARENA_STAND_ROW = 20;

/* Квартал форта и улица между кварталами. Из этих двух чисел выводится всё
 * остальное: сколько кварталов влезло, где улицы, куда встают комнаты. */
const BLOCK = 32;
const STREET = 6;
const CELL_PITCH = BLOCK + STREET;

/* Комната форта по мерке жилого: 4..6 клеток стороной, медиана около двадцати. */
const ROOM_MIN = 4;
const ROOM_MAX = 6;

/* Стена форта — не глухая линия, а ПРОМЕНАД: внешняя стена, ход по стене на три
 * клетки и внутренняя стена. По нему обходят периметр и стоят на постах, а не
 * упираются в бетон. Ворота четверо, по одному на сторону, и от каждых в дикие
 * земли уходит дорога. */
const WALL_BAND = 5;
const WALL_WALK = 3;
const GATE_HALF = 4;
const ROAD_HALF = 2;
const TOWER = 11;

/**
 * Прямоугольник фортовой земли, занятый чем-то авторским.
 *
 * `Room` подходит под него структурно, поэтому одна и та же проверка накрытия
 * работает и для арены со штабом, и для КВАРТАЛОВ, которые кладут слои поверх
 * форта (`order.ts`, `arena_quarter.ts`, `frontline.ts`, `supply.ts`). Слой
 * объявляет своё пятно константой, а не роет по факту: кварталы обязаны
 * появиться на чистой земле, иначе процедурные комнаты квартала окажутся
 * наполовину перештампованы и в `world.rooms` останутся записи, чьи клетки уже
 * принадлежат соседу.
 */
export interface FortRect {
  x: number; y: number; w: number; h: number;
}

export interface FortLayout {
  arena: Room;
  parade: Room;
  hq: Room;
  rooms: Room[];
  spawnX: number;
  spawnY: number;
}

interface District {
  name: string;
  type: RoomType;
  floorTex: Tex;
  wallTex: Tex;
  /** Комнаты квартала вытянуты: стрельбищу нужна длина, бараку — нет. */
  long?: boolean;
}

/* Кварталы форта. Порядок значим: он раздаётся по кольцам вокруг арены, поэтому
 * ближние к песку кварталы стоят первыми. */
const DISTRICTS: readonly District[] = [
  { name: 'Барак', type: RoomType.LIVING, floorTex: Tex.F_CONCRETE, wallTex: Tex.CONCRETE },
  { name: 'Оружейная', type: RoomType.STORAGE, floorTex: Tex.F_CONCRETE, wallTex: Tex.METAL },
  { name: 'Стрельбище', type: RoomType.CORRIDOR, floorTex: Tex.F_CONCRETE, wallTex: Tex.METAL, long: true },
  { name: 'Каптёрка', type: RoomType.STORAGE, floorTex: Tex.F_CONCRETE, wallTex: Tex.CONCRETE },
  /* Караулка — ПОСТ, а не контора, и потому коридор.
   *
   * Обход (`patrol`) стоит у коридора, штаба, общего зала и рынка; у OFFICE его нет
   * намеренно — там `work` и `sleep` дежурного за столом (`ai.md`, `room_affordances.ts`,
   * замок `tests/room-affordances.test.ts`). Замер: обход 11.5% → 12.3%, присутствие в
   * коридорах 28.9 → 37.1, ни один драйв не оголился. Дать обход самому OFFICE нельзя —
   * это переселит часовых в чужие канцелярии на всех 51 этаже ради одного, а объём обхода
   * не вырастет: его задаёт тяга драйва, а не запас годных комнат. */
  { name: 'Караулка', type: RoomType.CORRIDOR, floorTex: Tex.F_CONCRETE, wallTex: Tex.CONCRETE },
  { name: 'Умывальня', type: RoomType.BATHROOM, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W },
  { name: 'Столовая смены', type: RoomType.KITCHEN, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W },
  { name: 'Санчасть', type: RoomType.MEDICAL, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W },
];

/**
 * Слот комнаты у этажа один, и владелец у него один — сам `world.rooms`.
 *
 * `room.id` — это ИНДЕКС в массиве, плотный, без дыр (замок
 * `tests/rooms-dense.test.ts`), а `stampRoom` кладёт комнату по индексу
 * (`world.rooms[id] = room`), то есть ЗАТИРАЕТ чужую запись молча. Форт вёл
 * собственный счётчик с нуля и совпадал с длиной массива только потому, что
 * работает первым по пустому миру; слои (`order.ts`, `arena_quarter.ts`,
 * `frontline.ts`, `supply.ts`) уже спрашивают длину. Два счётчика на один массив
 * держатся на порядке вызовов — стоит слою поработать до форта, и форт сотрёт
 * его комнаты. Спрашиваем длину везде: она и есть счётчик.
 */
function nextRoomSlot(world: World): number {
  return world.rooms.length;
}

export function buildLiquidatorFort(world: World, seed: number, reserved: readonly FortRect[] = []): FortLayout {
  const rand = new SeedRng(seed);
  const rooms: Room[] = [];

  fillSolid(world);
  carveWilds(world, rand);
  carveFortGround(world);

  const cx = FORT_X0 + Math.floor(FORT_SIDE / 2);
  const cy = FORT_Y0 + Math.floor(FORT_SIDE / 2);

  const arena = stampRoom(world, nextRoomSlot(world), RoomType.COMMON,
    cx - Math.floor(ARENA_SIDE / 2), cy - Math.floor(ARENA_SIDE / 2), ARENA_SIDE, ARENA_SIDE, -1);
  /* Два адреса у одной комнаты, и оба нужны.
   *
   * Тег `arena` ищет дуэльная система (`findArenaRoom` в `arena_ladder.ts`) —
   * по нему на песок приходят бойцы лестницы и сам игрок. Псевдоним `defId`
   * ищет проигрыватель сцен ТОЧНЫМ сравнением, тега ему мало.
   *
   * `applyNamedRoom` списки СЛИВАЕТ, а не затирает, поэтому порядок здесь
   * значим ровно в одну сторону: тег ставится до вызова. */
  arena.tags = ['arena'];
  applyNamedRoom(arena, LIQUIDATOR_BASE_ARENA_ANCHOR,
    LIQUIDATOR_BASE_NAMED_ROOMS[LIQUIDATOR_BASE_ARENA_ANCHOR]);
  arena.wallTex = Tex.METAL;
  arena.floorTex = Tex.F_CONCRETE;
  rooms.push(arena);
  buildArenaRing(world, arena);

  /* Плац примыкает к арене с юга: строй выходит на песок, не пересекая форт. */
  const parade = stampRoom(world, nextRoomSlot(world), RoomType.COMMON,
    cx - 40, arena.y + arena.h + STREET, 80, 40, -1);
  parade.name = 'Плац';
  parade.wallTex = Tex.CONCRETE;
  parade.floorTex = Tex.F_CONCRETE;
  rooms.push(parade);

  const hq = stampRoom(world, nextRoomSlot(world), RoomType.HQ,
    cx - 22, arena.y - STREET - 30, 44, 30, -1);
  hq.name = 'Штаб гарнизона';
  hq.wallTex = Tex.HERMO_WALL;
  hq.floorTex = Tex.F_CONCRETE;
  rooms.push(hq);

  fillFortBlocks(world, rand, rooms, [arena, parade, hq, ...reserved]);
  buildFortWall(world, rooms);

  return { arena, parade, hq, rooms, spawnX: parade.x + parade.w / 2, spawnY: parade.y + parade.h / 2 };
}

function fillSolid(world: World): void {
  world.cells.fill(Cell.WALL);
  world.wallTex.fill(Tex.CONCRETE);
  world.floorTex.fill(Tex.F_CONCRETE);
  world.roomMap.fill(-1);
  world.features.fill(Feature.NONE);
}

/** Открытая земля форта: по ней режутся кварталы и улицы. */
function carveFortGround(world: World): void {
  for (let y = FORT_Y0; y < FORT_Y0 + FORT_SIDE; y++) {
    for (let x = FORT_X0; x < FORT_X0 + FORT_SIDE; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.floorTex[idx] = Tex.F_CONCRETE;
    }
  }
}

/* Земли диких: развалины кварталов и открытая земля между ними. Плотность
 * заметно ниже фортовой — это чужая территория, а не город. */
function carveWilds(world: World, rand: SeedRng): void {
  const step = 48;
  for (let by = 0; by < W; by += step) {
    for (let bx = 0; bx < W; bx += step) {
      if (insideFort(bx + step / 2, by + step / 2)) continue;
      if (rand.float(0, 1) > 0.62) continue;
      const w = rand.int(18, 37);
      const h = rand.int(18, 37);
      const x = bx + rand.int(0, Math.max(0, step - w));
      const y = by + rand.int(0, Math.max(0, step - h));
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (insideFort(xx, yy)) continue;
          const idx = world.idx(xx, yy);
          world.cells[idx] = Cell.FLOOR;
          world.floorTex[idx] = Tex.F_CONCRETE;
        }
      }
    }
  }
}

function insideFort(x: number, y: number): boolean {
  return x >= FORT_X0 - 1 && x < FORT_X0 + FORT_SIDE + 1
    && y >= FORT_Y0 - 1 && y < FORT_Y0 + FORT_SIDE + 1;
}

/* Ринг арены: столы по периметру с проходом на четыре стороны. Трибуны ставятся
 * рядами через один — стул путь не блокирует, но сплошной ковёр стульев читается
 * как мусор, а не как трибуна. */
function buildArenaRing(world: World, arena: Room): void {
  const ring = {
    x: arena.x + ARENA_RING_INSET,
    y: arena.y + ARENA_RING_INSET,
    w: ARENA_SIDE - ARENA_RING_INSET * 2,
    h: ARENA_SIDE - ARENA_RING_INSET * 2,
  };
  const gate = (v: number, from: number, len: number) => Math.abs(v - (from + len / 2)) < 2;
  for (let x = ring.x; x < ring.x + ring.w; x++) {
    if (!gate(x, ring.x, ring.w)) {
      world.features[world.idx(x, ring.y)] = Feature.TABLE;
      world.features[world.idx(x, ring.y + ring.h - 1)] = Feature.TABLE;
    }
  }
  for (let y = ring.y; y < ring.y + ring.h; y++) {
    if (!gate(y, ring.y, ring.h)) {
      world.features[world.idx(ring.x, y)] = Feature.TABLE;
      world.features[world.idx(ring.x + ring.w - 1, y)] = Feature.TABLE;
    }
  }
  for (let y = arena.y + 2; y < arena.y + arena.h - 2; y += 2) {
    for (let x = arena.x + 2; x < arena.x + arena.w - 2; x++) {
      if ((x - arena.x) % 8 === 0) continue;
      if (x >= ring.x - 2 && x <= ring.x + ring.w + 1 && y >= ring.y - 2 && y <= ring.y + ring.h + 1) continue;
      world.features[world.idx(x, y)] = Feature.CHAIR;
    }
  }
}

/** Кварталы форта: сетка блоков, разрезанная улицами, внутри блока — комнаты. */
function fillFortBlocks(
  world: World, rand: SeedRng, rooms: Room[], keepOut: readonly FortRect[],
): void {
  for (let by = FORT_Y0 + STREET; by + BLOCK <= FORT_Y0 + FORT_SIDE; by += CELL_PITCH) {
    for (let bx = FORT_X0 + STREET; bx + BLOCK <= FORT_X0 + FORT_SIDE; bx += CELL_PITCH) {
      if (overlapsAny(bx, by, BLOCK, BLOCK, keepOut)) continue;
      const district = DISTRICTS[rand.int(0, DISTRICTS.length - 1)];
      fillBlock(world, rand, rooms, bx, by, district);
    }
  }
}

function fillBlock(
  world: World, rand: SeedRng, rooms: Room[], bx: number, by: number, district: District,
): void {
  let y = by;
  while (y + ROOM_MIN <= by + BLOCK) {
    const h = district.long
      ? ROOM_MIN
      : rand.int(ROOM_MIN, ROOM_MAX);
    if (y + h > by + BLOCK) break;
    let x = bx;
    while (x + ROOM_MIN <= bx + BLOCK) {
      const w = district.long
        ? Math.min(BLOCK - (x - bx), ROOM_MAX * 3)
        : rand.int(ROOM_MIN, ROOM_MAX);
      if (x + w > bx + BLOCK) break;
      const room = stampRoom(world, nextRoomSlot(world), district.type, x, y, w, h, -1);
      room.name = district.name;
      room.wallTex = district.wallTex;
      room.floorTex = district.floorTex;
      rooms.push(room);
      x += w + 1;
    }
    y += h + 1;
  }
}

function overlapsAny(x: number, y: number, w: number, h: number, others: readonly FortRect[]): boolean {
  for (const other of others) {
    if (x < other.x + other.w + STREET && x + w + STREET > other.x
      && y < other.y + other.h + STREET && y + h + STREET > other.y) return true;
  }
  return false;
}

/**
 * Периметр форта: стена-променад, четыре башни по углам и четверо ворот.
 *
 * Стена сделана коридором намеренно: гарнизон обходит периметр поверху и держит
 * посты, а не смотрит в глухой бетон. Ворота прорезают обе стены насквозь, и от
 * каждых в дикие земли уходит дорога — иначе форт стоит островом без подходов,
 * а дикие земли не читаются как то, откуда приходят.
 */
function buildFortWall(world: World, rooms: Room[]): void {
  const x1 = FORT_X0 + FORT_SIDE - 1;
  const y1 = FORT_Y0 + FORT_SIDE - 1;
  const midX = FORT_X0 + Math.floor(FORT_SIDE / 2);
  const midY = FORT_Y0 + Math.floor(FORT_SIDE / 2);

  const isGateX = (x: number) => Math.abs(x - midX) <= GATE_HALF;
  const isGateY = (y: number) => Math.abs(y - midY) <= GATE_HALF;

  for (let band = 0; band < WALL_BAND; band++) {
    const walkable = band >= 1 && band <= WALL_WALK;
    for (let x = FORT_X0; x <= x1; x++) {
      paintWallCell(world, x, FORT_Y0 + band, walkable || isGateX(x));
      paintWallCell(world, x, y1 - band, walkable || isGateX(x));
    }
    for (let y = FORT_Y0; y <= y1; y++) {
      paintWallCell(world, FORT_X0 + band, y, walkable || isGateY(y));
      paintWallCell(world, x1 - band, y, walkable || isGateY(y));
    }
  }

  carveRoad(world, midX, FORT_Y0 - 1, 0, -1);
  carveRoad(world, midX, y1 + 1, 0, 1);
  carveRoad(world, FORT_X0 - 1, midY, -1, 0);
  carveRoad(world, x1 + 1, midY, 1, 0);

  for (const [tx, ty] of [
    [FORT_X0, FORT_Y0], [x1 - TOWER + 1, FORT_Y0],
    [FORT_X0, y1 - TOWER + 1], [x1 - TOWER + 1, y1 - TOWER + 1],
  ] as const) {
    // Тот же класс, что и караулка: башня периметра — пост обхода, не кабинет.
    const tower = stampRoom(world, nextRoomSlot(world), RoomType.CORRIDOR, tx, ty, TOWER, TOWER, -1);
    tower.name = 'Башня периметра';
    tower.wallTex = Tex.METAL;
    tower.floorTex = Tex.F_CONCRETE;
    rooms.push(tower);
  }
}

function paintWallCell(world: World, x: number, y: number, walkable: boolean): void {
  const idx = world.idx(x, y);
  world.roomMap[idx] = -1;
  world.features[idx] = Feature.NONE;
  if (walkable) {
    world.cells[idx] = Cell.FLOOR;
    world.floorTex[idx] = Tex.F_CONCRETE;
  } else {
    world.cells[idx] = Cell.WALL;
    world.wallTex[idx] = Tex.METAL;
  }
}

/** Дорога от ворот в дикие земли: без неё форт стоит островом без подходов. */
function carveRoad(world: World, fromX: number, fromY: number, dx: number, dy: number): void {
  let x = fromX;
  let y = fromY;
  for (let step = 0; step < W / 2; step++) {
    for (let off = -ROAD_HALF; off <= ROAD_HALF; off++) {
      const rx = world.wrap(dx === 0 ? x + off : x);
      const ry = world.wrap(dy === 0 ? y + off : y);
      const idx = world.idx(rx, ry);
      if (world.cells[idx] === Cell.WALL) {
        world.cells[idx] = Cell.FLOOR;
        world.floorTex[idx] = Tex.F_CONCRETE;
        world.roomMap[idx] = -1;
      }
    }
    x = world.wrap(x + dx);
    y = world.wrap(y + dy);
    if (insideFort(x, y)) break;
  }
}
