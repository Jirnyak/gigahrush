import type { World } from '../core/world';
import { Cell, type Room, RoomType, W } from '../core/types';

/**
 * Render-only per-cell ceiling-height tiers.
 *
 * The walk level never changes — only the rendered wall top / ceiling plane is
 * raised so different spaces read with a different vertical volume:
 *   tier 0 → plain rooms (default 1.0 wall height)
 *   tier 1 → corridors / open passages sit taller than plain rooms
 *   tier 2 → large rooms
 *   tier 3 → grand halls
 *
 * Ярус ВЫВОДИТСЯ из формы пространства, а не назначается таблицей. Табличка
 * «площадь >= 80 → ярус 2» давала четыре ступеньки на всю игру: все склады мира
 * одинаковы, а каморка вплотную к цеху читалась как обрыв потолка. Вместо неё
 * сумма контекстных членов, все считаются на бэйке:
 *
 *   ярус = clamp(round(log2(1 + свободный_радиус)) + сдвиг_роли + джиттер, 0, 7)
 *
 * Логарифм здесь не украшение: он даёт непрерывную шкалу без магических порогов
 * (радиус 1 → 1, 3 → 2, 7 → 3, 15 → 4, 31 → 5), поэтому `LARGE_AREA` и
 * `GRAND_AREA` исчезли вовсе.
 *
 * Четыре прохода, все клеточные, так что ни один не зависит от того, есть ли у
 * коридора запись `Room`:
 *   0. Свободный радиус: distance transform по открытым клеткам с заворотом по
 *      тору. У комнаты радиус берётся ОДИН на всю комнату (вписанный), иначе
 *      потолок провиснет куполом к стенам; клетки без комнаты считают свой
 *      локальный радиус — от этого коридоры и дышат.
 *   1. Ярус каждой открытой клетки по формуле выше; стены пока плоские.
 *   2. Один проход диффузии: соседи не отличаются больше чем на ярус, поэтому
 *      выход из коридора в зал читается как раскрытие, а не как ступенька.
 *   3. Каждая стена поднимается до самой высокой открытой клетки, которую она
 *      ограничивает, — луч бьёт в стену, а она несёт объём пространства за ней.
 *
 * Авторская воля выше формулы: `room.ceilingTier` и `world.globalCeilingTier`
 * ставятся как есть и диффузией не размываются. Так этаж вправе объявить
 * геометрию потолка локально (перекрёстки, крыша, улица), не заводя таблицу
 * «тип комнаты → высота» — те две таблички, что были у министерства и
 * коллекторов, формула съела.
 *
 * Шахта — не новый тип, а предел этой же формулы: узкая комната с высоким
 * ярусом по роли. Вверх она работает бесплатно через порог неба.
 *
 * Nothing here touches gameplay, collision, AI or save state — it is pure
 * render metadata, regenerated whenever a floor is built or restored.
 * Шейдер отображает ярус `t` в высоту `1 + t*0.5`.
 */


/**
 * The one truth for the rendered ceiling plane. The raycaster mirrors this
 * exactly in GLSL (`ceilH = 1.0 + rawTier * 0.5`, render/webgl.ts); every
 * consumer on the TS side — feature sprites, lights, meshes — must go through
 * `cellCeilingHeight()` rather than re-deriving it.
 */
export function getCeilingHeightForTier(tier: number): number {
  return 1.0 + tier * 0.5;
}

/** Rendered ceiling height above the floor for one cell. Wraps on the torus. */
export function cellCeilingHeight(world: World, x: number, y: number): number {
  return getCeilingHeightForTier(cellCeilingTier(world, x, y));
}

/** Raw ceiling tier of one cell. Wraps on the torus. */
export function cellCeilingTier(world: World, x: number, y: number): number {
  return world.ceilHeight[world.idx(world.wrap(x), world.wrap(y))];
}

/**
 * True when the cell is an enclosed volume — something can hang from its
 * ceiling and a full-height column can reach it. At/above the sky band the
 * "ceiling" is open air (roof lid, street canyon), so there is no plane to
 * attach to at any height.
 */
export function cellHasCeiling(world: World, x: number, y: number): boolean {
  return cellCeilingTier(world, x, y) < SKY_TIER_THRESHOLD;
}

const TIER_ROOM = 0;
const TIER_CORRIDOR = 1;
const TIER_LARGE = 2;
const TIER_GRAND = 3;

// Open-sky floors only: a ceiling tier at/above this reads as "open air / sky"
// (roof deck = 14, outer-district street = 240); below it is a real enclosed
// volume (house interior ≤ 4). On those floors a wall never inherits a sky tier —
// it takes its enclosed neighbour's height, or, if bounded only by sky, a varied
// skyline strictly below this band so the raycaster shows sky above every tower.
// Enclosed floors ignore this entirely (gated by world.hasOpenSky).
// Keep in sync with SKY_TIER in the raycaster (render/webgl.ts).
export const SKY_TIER_THRESHOLD = 8;

// Дальше этого радиуса шкала всё равно упирается в потолок выведенного яруса,
// так что заливать больше нечем. Держит инициализацию distance transform.
const RADIUS_CAP = 127;

const MASK = W - 1;      // W is a power of two, so wrap == & MASK

/**
 * Роль комнаты — сдвиг на ярус, а не высота. Маленькая таблица смещений в одном
 * месте вместо высоты, назначенной на каждом этаже: кладовая и санузел жмутся,
 * цех, штаб и зал раскрываются, коридор живёт своим радиусом.
 */
function roleShift(type: RoomType): number {
  switch (type) {
    case RoomType.STORAGE:
    case RoomType.BATHROOM:
      return -1;
    case RoomType.PRODUCTION:
    case RoomType.HQ:
    case RoomType.COMMON:
      return 1;
    default:
      return 0;
  }
}

/**
 * Свободный радиус каждой открытой клетки: сколько шагов до ближайшей стены.
 * Обычный distance transform, но по тору — поэтому вперёд-назад прогоняется
 * дважды: за один круг волна не пересекает шов.
 */
function stampFreeRadius(world: World, out: Uint8Array): void {
  const { cells } = world;
  const n = W * W;
  for (let i = 0; i < n; i++) out[i] = cells[i] === Cell.WALL ? 0 : RADIUS_CAP;
  for (let round = 0; round < 2; round++) {
    for (let y = 0; y < W; y++) {
      const rowMid = y * W;
      const rowUp = ((y - 1) & MASK) * W;
      for (let x = 0; x < W; x++) {
        const i = rowMid + x;
        if (out[i] === 0) continue;
        const up = out[rowUp + x] + 1;
        const left = out[rowMid + ((x - 1) & MASK)] + 1;
        let v = out[i];
        if (up < v) v = up;
        if (left < v) v = left;
        out[i] = v;
      }
    }
    for (let y = W - 1; y >= 0; y--) {
      const rowMid = y * W;
      const rowDn = ((y + 1) & MASK) * W;
      for (let x = W - 1; x >= 0; x--) {
        const i = rowMid + x;
        if (out[i] === 0) continue;
        const dn = out[rowDn + x] + 1;
        const right = out[rowMid + ((x + 1) & MASK)] + 1;
        let v = out[i];
        if (dn < v) v = dn;
        if (right < v) v = right;
        out[i] = v;
      }
    }
  }
}

/**
 * Ярус из радиуса. Шкала СЖАТА намеренно, и это цена первой попытки: `round`
 * плюс джиттер ±1 давали на жилом 27% соседних пар с разной высотой — рванину
 * по коридорам и слоистые обрывы стен, потому что 99% открытых клеток этажа не
 * принадлежат ни одной комнате и получали шум поклеточно. `floor` переносит
 * ступеньку на удвоение радиуса: 1..2 → 1, 3..6 → 2, 7..14 → 3. На жилом это
 * 80% клеток на прежнем коридорном ярусе 1, 20% на 2 — перепадов 14%, и все
 * амплитудой ровно в один ярус.
 */
function tierFromRadius(radius: number): number {
  return Math.floor(Math.log2(1 + radius));
}

/** Авторская воля выше формулы: такую клетку не выводят и не размывают. */
function authoredTier(rooms: readonly (Room | undefined)[], rid: number): number | undefined {
  return rid >= 0 ? rooms[rid]?.ceilingTier : undefined;
}

export function stampCeilingHeights(world: World): void {
  const { cells, roomMap, rooms } = world;
  const ceil = world.ceilHeight;
  const n = W * W;

  // Этаж под общей крышкой (крыша, улица) выведения не знает: у него одна
  // объявленная высота на всё, и радиус считать незачем.
  const derived = world.globalCeilingTier === undefined;

  // Pass 0: свободный радиус, и вписанный радиус на комнату — один на всю,
  // иначе потолок провиснет куполом к стенам.
  const radius = derived ? new Uint8Array(n) : undefined;
  const roomRadius = derived ? new Uint8Array(rooms.length) : undefined;
  if (radius && roomRadius) {
    stampFreeRadius(world, radius);
    for (let i = 0; i < n; i++) {
      if (cells[i] === Cell.WALL) continue;
      const rid = roomMap[i];
      if (rid >= 0 && rid < roomRadius.length && radius[i] > roomRadius[rid]) roomRadius[rid] = radius[i];
    }
  }

  // Pass 1: open cells get their volume tier; walls start flat.
  for (let i = 0; i < n; i++) {
    if (cells[i] === Cell.WALL) { ceil[i] = 0; continue; }
    if (world.globalCeilingTier !== undefined) {
      ceil[i] = world.globalCeilingTier;
      continue;
    }
    const rid = roomMap[i];
    const authored = authoredTier(rooms, rid);
    if (authored !== undefined) { ceil[i] = authored; continue; }
    const room = rid >= 0 ? rooms[rid] : undefined;
    const r = room && roomRadius ? roomRadius[rid] : radius![i];
    // Потолок ВЫВЕДЕННОГО яруса — прежний парадный: выше начинается то, что
    // освещение уже не несёт (лампы печены под низкий потолок, и зал на ярусе 5
    // уходил в черноту). Всё, что выше, объявляется автором явно.
    const tier = tierFromRadius(r) + (room ? roleShift(room.type) : 0);
    ceil[i] = tier < 0 ? 0 : tier > TIER_GRAND ? TIER_GRAND : tier;
  }

  // Pass 2: один проход диффузии — сосед не ниже соседа больше чем на ярус,
  // поэтому выход из коридора в зал читается как раскрытие, а не как ступенька.
  // Небесные ярусы (198/240 у перекрёстков) в расчёт не идут: иначе один
  // авторский двор поднял бы весь этаж до потолка шкалы.
  if (derived) {
    const src = ceil.slice();
    for (let y = 0; y < W; y++) {
      const rowMid = y * W;
      const rowUp = ((y - 1) & MASK) * W;
      const rowDn = ((y + 1) & MASK) * W;
      for (let x = 0; x < W; x++) {
        const i = rowMid + x;
        if (cells[i] === Cell.WALL) continue;
        if (authoredTier(rooms, roomMap[i]) !== undefined) continue;
        let m = src[i];
        const j0 = rowUp + x;
        const j1 = rowDn + x;
        const j2 = rowMid + ((x - 1) & MASK);
        const j3 = rowMid + ((x + 1) & MASK);
        if (cells[j0] !== Cell.WALL && src[j0] < SKY_TIER_THRESHOLD && src[j0] - 1 > m) m = src[j0] - 1;
        if (cells[j1] !== Cell.WALL && src[j1] < SKY_TIER_THRESHOLD && src[j1] - 1 > m) m = src[j1] - 1;
        if (cells[j2] !== Cell.WALL && src[j2] < SKY_TIER_THRESHOLD && src[j2] - 1 > m) m = src[j2] - 1;
        if (cells[j3] !== Cell.WALL && src[j3] < SKY_TIER_THRESHOLD && src[j3] - 1 > m) m = src[j3] - 1;
        ceil[i] = m;
      }
    }
  }

  // Pass 3: each wall rises to the tallest open cell it bounds. Only open
  // neighbours contribute (their stable pass-1 tier), so writing walls in this
  // same pass never propagates height along a wall line.
  for (let y = 0; y < W; y++) {
    const rowUp = ((y - 1) & MASK) * W;
    const rowMid = y * W;
    const rowDn = ((y + 1) & MASK) * W;
    for (let x = 0; x < W; x++) {
      const i = rowMid + x;
      const c = cells[i];
      // Closed floors rebuild only WALL cells (byte-identical to before). Open-sky
      // floors ALSO rebuild DOOR / LIFT / ABYSS: the primary DDA draws those as
      // solid columns too, so if they keep their sky-magnitude pass-1 tier (14/240)
      // they shoot up as столбы (the reported door bug). Give them a finite height.
      if (c !== Cell.WALL && !(world.hasOpenSky && (c === Cell.DOOR || c === Cell.LIFT || c === Cell.ABYSS))) continue;
      const xL = (x - 1) & MASK;
      const xR = (x + 1) & MASK;
      let m = 0;
      let j = rowUp + xL; if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowUp + x;      if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowUp + xR;     if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowMid + xL;    if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowMid + xR;    if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowDn + xL;     if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowDn + x;      if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      j = rowDn + xR;     if (cells[j] !== Cell.WALL && ceil[j] > m) m = ceil[j];
      
      // Open-sky floors: a wall must never inherit a sky-magnitude tier — that
      // is exactly what produced a solid столб rising to the sky lid. Rebuild
      // its height from enclosed neighbours only; a wall bounded solely by sky
      // becomes a free-standing silhouette. Gated on hasOpenSky, so every
      // enclosed floor (and the n_crossroads canyons) keeps the legacy skyline
      // branch below byte-for-byte.
      if (world.hasOpenSky) {
        let mf = 0; // tallest FINITE (enclosed, below the sky band) open neighbour
        j = rowUp + xL;  if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowUp + x;   if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowUp + xR;  if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowMid + xL; if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowMid + xR; if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowDn + xL;  if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowDn + x;   if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        j = rowDn + xR;  if (cells[j] !== Cell.WALL && ceil[j] < SKY_TIER_THRESHOLD && ceil[j] > mf) mf = ceil[j];
        if (c !== Cell.WALL) {
          // DOOR / LIFT / ABYSS: a passage or fixture set into a structure. Finite —
          // match the enclosing interior, or, bounded only by open sky, a doorframe
          // height (tier 3 → h 2.5). Never a sky column and never a skyline tower.
          m = mf > 0 ? mf : 3;
        } else if (mf > 0) {
          // Wall of an enclosed structure (house, partition, ledge): match its
          // interior volume → finite wall. The raycaster shows sky above its top.
          m = mf;
        } else if (m >= SKY_TIER_THRESHOLD) {
          // Free-standing wall bounded only by sky (roof towers/parapets, street
          // megastructures): deterministic varied skyline, every tier strictly
          // below the sky band so sky always shows above the tallest silhouette.
          const rid = roomMap[i];
          const hash = rid >= 0 ? (rid * 113) % 100 : ((x >> 3) * 73 + (y >> 3) * 13) % 100;
          if (hash < 12) m = 12;
          else if (hash < 30) m = 9;
          else if (hash < 55) m = 7;
          else if (hash < 80) m = 5;
          else m = 3;
        }
        // else (mf === 0 && m < SKY_TIER_THRESHOLD): interior-only or wall-locked
        // stub — keep the finite max already computed above.
      } else if (world.globalCeilingTier !== undefined && m === world.globalCeilingTier) {
        // Legacy non-open-sky flatten branch, preserved verbatim: a wall touching
        // a global-ceiling cell gets a varied parapet skyline instead of rising to
        // the lid. Currently dead (globalCeilingTier is only set by hasOpenSky
        // floors), but a future enclosed floor could set it and must match this.
        const rid = roomMap[i];
        if (rid >= 0) {
          // If the wall belongs to a room, use a consistent height for the whole room
          const hash = (rid * 113) % 100;
          if (hash < 15) m = TIER_GRAND;
          else if (hash < 40) m = TIER_LARGE;
          else if (hash < 75) m = TIER_CORRIDOR;
          else m = TIER_ROOM;
        } else {
          // For abyss walls with no room, use a chunked spatial hash
          const hash = ((x >> 3) * 73 + (y >> 3) * 13) % 100;
          if (hash < 10) m = TIER_GRAND;
          else if (hash < 30) m = TIER_LARGE;
          else if (hash < 65) m = TIER_CORRIDOR;
          else m = TIER_ROOM;
        }
      }

      ceil[i] = m;
    }
  }

  world.markCeilHeightDirty();
}
