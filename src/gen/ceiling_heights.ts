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
 * Two generation-time passes, both cell-based so it does not depend on every
 * corridor being a `Room` record:
 *   1. Every open (non-wall) cell gets a tier from its room (type/area) or, if
 *      it is a carved passage with no room record, the corridor tier.
 *   2. Every wall cell rises to the tallest open cell it bounds, so the wall a
 *      ray actually hits carries the volume of the space behind it.
 *
 * Nothing here touches gameplay, collision, AI or save state — it is pure
 * render metadata, regenerated whenever a floor is built or restored.
 *
 * Expandable / tweakable: change the tier constants, the `LARGE_AREA` /
 * `GRAND_AREA` thresholds, or branch on more `RoomType`s. The shader maps tier
 * `t` to height `1 + t*0.5`.
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

const LARGE_AREA = 80;   // w*h at/above which a room reads as a hall
const GRAND_AREA = 150;  // ...and a grand hall

// Open-sky floors only: a ceiling tier at/above this reads as "open air / sky"
// (roof deck = 14, outer-district street = 240); below it is a real enclosed
// volume (house interior ≤ 4). On those floors a wall never inherits a sky tier —
// it takes its enclosed neighbour's height, or, if bounded only by sky, a varied
// skyline strictly below this band so the raycaster shows sky above every tower.
// Enclosed floors ignore this entirely (gated by world.hasOpenSky).
// Keep in sync with SKY_TIER in the raycaster (render/webgl.ts).
export const SKY_TIER_THRESHOLD = 8;

const MASK = W - 1;      // W is a power of two, so wrap == & MASK

function ceilingTierForRoom(room: Room): number {
  if (room.ceilingTier !== undefined) return room.ceilingTier;
  if (room.type === RoomType.CORRIDOR) return TIER_CORRIDOR;
  const area = room.w * room.h;
  if (area >= GRAND_AREA) return TIER_GRAND;
  if (area >= LARGE_AREA) return TIER_LARGE;
  return TIER_ROOM;
}

export function stampCeilingHeights(world: World): void {
  const { cells, roomMap, rooms } = world;
  const ceil = world.ceilHeight;
  const n = W * W;

  // Pass 1: open cells get their volume tier; walls start flat.
  for (let i = 0; i < n; i++) {
    if (cells[i] === Cell.WALL) { ceil[i] = 0; continue; }
    if (world.globalCeilingTier !== undefined) {
      ceil[i] = world.globalCeilingTier;
      continue;
    }
    const rid = roomMap[i];
    const room = rid >= 0 ? rooms[rid] : undefined;
    ceil[i] = room ? ceilingTierForRoom(room) : TIER_CORRIDOR;
  }

  // Pass 2: each wall rises to the tallest open cell it bounds. Only open
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
