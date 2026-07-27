/* ── BFS pathfinding + movement helpers ───────────────────────── */

import {
  W, Cell, DoorState,
  type Entity, type Msg,
  EntityType,  AIGoal, RoomType,
} from '../../core/types';
import { World } from '../../core/world';
import { PATH_BLOCKER_SUBDIV, PATH_BLOCKER_BYTES_PER_CELL } from '../../core/path_blockers';
import { getCellHazardMoveMultiplier } from '../cell_hazards';

import { actorContactDoor } from '../door_state';
import { canActorOccupy, entityIgnoresFineBlockers } from '../movement_collision';
import { aiPathMoveSpeed } from '../rpg';
import { emitMarkovBark, BARK_CHANCE_ARRIVE } from './barks';
import { rng } from '../../core/rand';
import {
  computeRegionNextRows,
  computeRegionNextColumn,
  MIN_REGIONS_FOR_WORKERS,
  type RegionGraph,
  type RegionNextSolver,
} from './region_next';

let _barkMsgs: Msg[] = [];
let _barkTime = 0;

/** Call once per frame from updateAI to set bark context for followPath arrival barks */
export function setPathContext(msgs: Msg[], time: number, _samosborActive = false): void {
  _barkMsgs = msgs;
  _barkTime = time;
  beginPathFrame(time);
}

/* ── Baked navigation tree (toroidal, ordinary doors are openable) */

const FLOW_UNREACHED = -1;
const FLOW_BLOCKED = -2;
const PATH_CHUNK_LIMIT = 1048576;

const PATH_WAYPOINT_REACH = 0.18;
const PATH_WAYPOINT_REACH_SQ = PATH_WAYPOINT_REACH * PATH_WAYPOINT_REACH;
const BEHAVIOR_FLOW_FIELD_CACHE_MAX = 16;
const ROUTINE_WANDER_ATTEMPTS = 4;
const ROUTINE_FAR_ATTEMPTS = 5;
const SW = W * PATH_BLOCKER_SUBDIV;
const SW2 = SW * SW;
const MACRO_W2 = W * W;


/* ── Region-Portal HPA* constants ─────────────────────────────── */
const CLUSTER_SIZE = 16;
const CLUSTERS_PER_SIDE = (W / CLUSTER_SIZE) | 0;
const REGION_NONE = 0;
const REGION_UNREACHABLE = 65535;

const _navQueue = new Int32Array(SW2);
const NAV_QUEUE_HALF = Math.floor(SW2 / 2);
let _navHead1 = 0;
let _navTail1 = 0;
let _navHead2 = 0;
let _navTail2 = 0;
let _navBase1 = 0;
let _navBase2 = NAV_QUEUE_HALF;
const _flowSourceScratch: number[] = [];
let _navWorld: World | null = null;
let _navCellVersion = -1;
let _navPathBlockerVersion = -1;
let _navComponents = 0;
let _frozenNavWorld: World | null = null;
let _frozenNavCellVersion = -1;
let _frozenNavPathBlockerVersion = -1;
let _frozenNavRoomCount = -1;
let _frozenNavRefCount = 0;
// Macro-mask snapshot taken when the cache is frozen. Query-time path
// reconstruction (localRegionMacroBfs / findBorderSubcells) reads this instead
// of live geometry, so a wall placed mid-samosbor cannot break an already-baked
// path — matching the frozen-cache contract. Null when not frozen. 2 MB.
let _frozenMacroMask: Uint16Array | null = null;
let _flowFieldTouch = 0;
let _routinePathUsed = 0;
let _routinePathDenied = 0;
let _routinePathDeferred = 0;
let _pathCacheHits = 0;
let _bfsCalls = 0;
let _bfsFound = 0;
let _bfsMiss = 0;
let _bfsLimitHits = 0;
let _bfsVisited = 0;

/* ── Region-Portal HPA* data structures ───────────────────────── */
const _regionMap = new Int32Array(MACRO_W2);
let _numRegions = 0;

interface Portal {
  cx: number; cy: number;
  ncx: number; ncy: number;
  regionA: number;
  regionB: number;
}
let _portals: Portal[] = [];
let _numPortals = 0;
let _regionPortalIndices: number[][] = [];

/**
 * Region-node next-hop matrix. Nodes are REGIONS (rooms + 16×16 clusters),
 * NOT portals — there are far fewer regions than portals, so the R×R matrix
 * stays small and bake stays O(R·E) instead of Floyd-Warshall's O(P³).
 * `_regionNext[rS * R + rT]` = the next region to step into on a shortest
 * (fewest region hops) route rS→rT, or REGION_UNREACHABLE if disconnected.
 * This is a real graph with cycles (every adjacent-region edge kept), so
 * toroidal loops are preserved and there are no spanning-tree seams.
 */
let _regionNext: Uint16Array | null = null;
let _regionN = 0;

/* ── Low-memory (mobile) navigation mode ──────────────────────────
 * The dense R×R `_regionNext` matrix costs R²·2 bytes — a mid floor (R≈11.5k)
 * is 256 MB, a large one (R≈23k) over 1 GB. Desktop heaps swallow that; the
 * iOS/WebKit per-tab ceiling (a few hundred MB, hard and invisible — no
 * `performance.memory`) does not, so the single giant allocation Jetsam-kills
 * the tab. On such devices we skip the matrix entirely and instead keep the
 * (tiny) region-adjacency graph resident and answer `regionPath` from a small
 * LRU of on-demand next-hop COLUMNS (one BFS per unique target region). Peak
 * cost is ~cache-slots · R · 2 bytes (~1 MB) instead of R²·2.
 *
 * Detection is HARDWARE-biased and PC-favouring: lazy mode turns on ONLY when
 * the device advertises no hover AND no fine pointer (a real phone/tablet). Any
 * mouse, trackpad or stylus (hover or fine pointer present) is treated as
 * desktop and keeps the exact dense-matrix path — better to misjudge a phone as
 * a PC than a PC as a phone. Resolved once, lazily, and cached. */
let _lowMemNav: boolean | null = null;

function useLowMemNav(): boolean {
  if (_lowMemNav !== null) return _lowMemNav;
  // Node / no-DOM (tests, generation) → false: keep the deterministic dense
  // path the parity tests trust.
  const mm = typeof window !== 'undefined' ? window.matchMedia : undefined;
  if (!mm) { _lowMemNav = false; return false; }
  // `any-hover: none` → no pointing device on the whole system can hover;
  // `any-pointer: fine` present → a mouse/trackpad/stylus exists → desktop.
  const noHover = mm('(any-hover: none)').matches === true;
  const noFine = mm('(any-pointer: fine)').matches !== true;
  const hasTouch = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
    || 'ontouchstart' in globalThis;
  _lowMemNav = noHover && noFine && hasTouch;
  return _lowMemNav;
}

/** LRU of next-hop columns for the low-mem path. Key = target region rT;
 *  value = Uint16Array(R) where [cur] is the next hop cur→rT. Sized small: a
 *  handful of active goals cover most NPC traffic, and each column is R·2 B. */
const LOWMEM_COLUMN_SLOTS = 16;
const _regionColumns = new Map<number, Uint16Array>();
let _regionColScratch = new Int32Array(1024); // BFS queue, grown to R at bake.
// Immutable region graph kept resident in low-mem mode (replaces the matrix).
let _lowMemGraph: RegionGraph | null = null;

/** Fetch (or lazily BFS-build + cache) the next-hop column toward target rT.
 *  Returns null if there is no low-mem graph. LRU: re-insertion refreshes
 *  recency; the coldest column is evicted past LOWMEM_COLUMN_SLOTS. */
function regionColumnFor(rT: number): Uint16Array | null {
  const g = _lowMemGraph;
  if (!g) return null;
  const cached = _regionColumns.get(rT);
  if (cached) {
    // Refresh recency (Map preserves insertion order → delete+set = MRU).
    _regionColumns.delete(rT);
    _regionColumns.set(rT, cached);
    return cached;
  }
  const R = g.R;
  const col = new Uint16Array(R);
  col.fill(REGION_UNREACHABLE);
  computeRegionNextColumn(
    R, g.portalRegionA, g.portalRegionB, g.regOffsets, g.regFlat,
    rT, col, _regionColScratch,
  );
  _regionColumns.set(rT, col);
  if (_regionColumns.size > LOWMEM_COLUMN_SLOTS) {
    const oldest = _regionColumns.keys().next().value;
    if (oldest !== undefined) _regionColumns.delete(oldest);
  }
  return col;
}

/* ── Runtime-edit state (local door toggle / wall break / build) ──
 * Same-world geometry edits are ACCEPT-STALE: the baked region/portal/next-hop
 * graph is NEVER rebuilt mid-game (that O(R²) rebuild froze large floors for
 * 10 s+ on a single hermetic-door toggle — the banned mid-game rebake). The
 * graph is authoritative only at the two PLANNED bakes (floor load, post-
 * samosbor). Live walkability is still exact: the subcell query layer reads
 * live cell + door state, so a closed/opened door is honored by real paths
 * immediately; only the coarse cross-region hint goes briefly stale. See
 * patchNavigationRegions() and optimization.md (Iron Law). */
const NAV_PATCH_MAX_CELLS = 4096;

// Cells whose passability changed since the last bake/patch, fed by
// markNavigationCellsDirty() from the runtime edit sites (wall break, build,
// door lock). `_navDirtyFull` forces a full rebake (too many cells, or an
// unaccounted invalidation). The set is the authoritative work-list for the
// incremental patch; it is cleared on every bake and every patch.
const _navDirtyCells = new Set<number>();
let _navDirtyFull = false;

const _rBfsQueue = new Int32Array(MACRO_W2);
const _rBfsDist = new Int32Array(MACRO_W2);
const _rBfsEpoch = new Int32Array(MACRO_W2);
let _rBfsEpochId = 0;

// Region-graph BFS scratch (grown to fit region count at bake time). The
// visited-epoch counter lives inside computeRegionNextRows, not here.
let _regQueue = new Int32Array(1024);
let _regFirstStep = new Int32Array(1024);
let _regEpoch = new Int32Array(1024);

export type BehaviorFlowFieldSourceProvider = (world: World, out: number[]) => void;

interface BehaviorFlowField {
  key: string;
  world: World;
  cellVersion: number;
  pathBlockerVersion: number;
  roomCount: number;
  next: Int32Array;
  sourceCount: number;
  reachable: number;
  lastUsed: number;
}

interface FlowPathAssignment {
  key: string;
  sourceProvider: BehaviorFlowFieldSourceProvider;
}

export interface PathSteering {
  x: number;
  y: number;
  distance: number;
  nextCell: number;
  targetCell: number;
}

interface SteeringPathAssignment {
  world: World;
  cellVersion: number;
  pathBlockerVersion: number;
  target: number;
  path: number[];
  pi: number;
}



export interface PathfindingStats {
  routineUsed: number;
  routineDenied: number;
  routineDeferred: number;
  cacheHits: number;
  cacheSize: number;
  bfsCalls: number;
  bfsFound: number;
  bfsMiss: number;
  bfsLimitHits: number;
  bfsVisited: number;
}

type AssignPathStatus = 'assigned' | 'same' | 'not_found';

const _behaviorFlowFields = new Map<string, BehaviorFlowField>();
const _flowPathAssignments = new WeakMap<Entity, FlowPathAssignment>();
const _steeringPathAssignments = new WeakMap<Entity, SteeringPathAssignment>();
const _roomTypeSourceProviders = new Map<string, BehaviorFlowFieldSourceProvider>();

function beginPathFrame(time: number): void {
  void time;
  _routinePathUsed = 0;
  _routinePathDenied = 0;
  _routinePathDeferred = 0;
  _pathCacheHits = 0;
  _bfsCalls = 0;
  _bfsFound = 0;
  _bfsMiss = 0;
  _bfsLimitHits = 0;
  _bfsVisited = 0;
}

export function getPathfindingStats(out?: PathfindingStats): PathfindingStats {
  const stats = out ?? {
    routineUsed: 0,
    routineDenied: 0,
    routineDeferred: 0,
    cacheHits: 0,
    cacheSize: 0,
    bfsCalls: 0,
    bfsFound: 0,
    bfsMiss: 0,
    bfsLimitHits: 0,
    bfsVisited: 0,
  };
  stats.routineUsed = _routinePathUsed;
  stats.routineDenied = _routinePathDenied;
  stats.routineDeferred = _routinePathDeferred;
  stats.cacheHits = _pathCacheHits;
  stats.cacheSize = _navComponents;
  stats.bfsCalls = _bfsCalls;
  stats.bfsFound = _bfsFound;
  stats.bfsMiss = _bfsMiss;
  stats.bfsLimitHits = _bfsLimitHits;
  stats.bfsVisited = _bfsVisited;
  return stats;
}

export function bfsPath(world: World, sx: number, sy: number, ex: number, ey: number): number[] {
  sx = world.wrap(sx); sy = world.wrap(sy);
  ex = world.wrap(ex); ey = world.wrap(ey);

  if (sx === ex && sy === ey) return [];

  const start = subcellIdx(sx, sy);
  const end = subcellIdx(ex, ey);
  return buildBakedTreePath(world, start, end);
}

function navigationCacheCellVersion(world: World): number {
  return _frozenNavWorld === world ? _frozenNavCellVersion : world.cellVersion;
}

function navigationCachePathBlockerVersion(world: World): number {
  return _frozenNavWorld === world ? _frozenNavPathBlockerVersion : world.pathBlockerVersion;
}

function navigationCacheRoomCount(world: World): number {
  return _frozenNavWorld === world ? _frozenNavRoomCount : world.rooms.length;
}

export function freezeNavigationCacheForWorld(world: World): void {
  if (_frozenNavWorld === world) {
    _frozenNavRefCount++;
    return;
  }
  const frozenCellVersion = world.cellVersion;
  const frozenPathBlockerVersion = world.pathBlockerVersion;
  if (_navWorld !== world || _navCellVersion !== frozenCellVersion || _navPathBlockerVersion !== frozenPathBlockerVersion) {
    bakeNavigationTree(world, frozenCellVersion, frozenPathBlockerVersion);
  }
  _frozenNavWorld = world;
  _frozenNavCellVersion = frozenCellVersion;
  _frozenNavPathBlockerVersion = frozenPathBlockerVersion;
  _frozenNavRoomCount = world.rooms.length;
  _frozenNavRefCount = 1;
  // Snapshot macro geometry so path reconstruction stays navigable even if
  // cells/blockers mutate during the wave. Computed from the just-baked
  // (== current) live geometry, so it matches the frozen region graph.
  if (!_frozenMacroMask) _frozenMacroMask = new Uint16Array(MACRO_W2);
  for (let ci = 0; ci < MACRO_W2; ci++) _frozenMacroMask[ci] = computeMacroMask(world, ci);
}

export function unfreezeNavigationCacheForWorld(world?: World): void {
  if (!world) {
    _frozenNavWorld = null;
    _frozenNavCellVersion = -1;
    _frozenNavPathBlockerVersion = -1;
    _frozenNavRoomCount = -1;
    _frozenNavRefCount = 0;
    _frozenMacroMask = null;
    _navWorld = null;
    _behaviorFlowFields.clear();
    return;
  }
  if (_frozenNavWorld && _frozenNavWorld !== world) return;
  if (_frozenNavRefCount > 1) {
    _frozenNavRefCount--;
    return;
  }
  _frozenNavWorld = null;
  _frozenNavCellVersion = -1;
  _frozenNavPathBlockerVersion = -1;
  _frozenNavRoomCount = -1;
  _frozenNavRefCount = 0;
  _frozenMacroMask = null;
  _navWorld = null;
  _behaviorFlowFields.clear();
}

export function subcellIdx(worldX: number, worldY: number): number {
  const cellX = Math.floor(worldX);
  const cellY = Math.floor(worldY);
  const subX = Math.floor((worldX - cellX) * PATH_BLOCKER_SUBDIV);
  const subY = Math.floor((worldY - cellY) * PATH_BLOCKER_SUBDIV);
  const sx = ((cellX % W + W) % W) * PATH_BLOCKER_SUBDIV + Math.max(0, Math.min(PATH_BLOCKER_SUBDIV - 1, subX));
  const sy = ((cellY % W + W) % W) * PATH_BLOCKER_SUBDIV + Math.max(0, Math.min(PATH_BLOCKER_SUBDIV - 1, subY));
  return sy * SW + sx;
}

export function subcellToWorld(si: number): [number, number] {
  const sx = si % SW;
  const sy = (si / SW) | 0;
  return [sx / PATH_BLOCKER_SUBDIV + 0.5 / PATH_BLOCKER_SUBDIV, sy / PATH_BLOCKER_SUBDIV + 0.5 / PATH_BLOCKER_SUBDIV];
}

export function subcellToCell(si: number): number {
  const sx = si % SW;
  const sy = (si / SW) | 0;
  return ((sy / PATH_BLOCKER_SUBDIV) | 0) * W + ((sx / PATH_BLOCKER_SUBDIV) | 0);
}

function isMacroCellPassable(world: World, ci: number, c: number): boolean {
  if (c !== Cell.FLOOR && c !== Cell.WATER && c !== Cell.DOOR) return false;
  if (c === Cell.DOOR) {
    const door = world.doors.get(ci);
    if (door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED)) return false;
  }
  return true;
}

/**
 * A subcell is nav-passable if and only if:
 *   1. Its parent macro cell is passable (FLOOR, WATER, or openable DOOR).
 *   2. Its path blocker bit is clear.
 * The BFS diagonal guard (cardinal neighbors must be passable) already
 * prevents corner-cutting.  No clearance margins needed.
 */
function isSubcellNavPassable(world: World, si: number): boolean {
  const sx = si % SW;
  const sy = (si / SW) | 0;
  const cellX = (sx / PATH_BLOCKER_SUBDIV) | 0;
  const cellY = (sy / PATH_BLOCKER_SUBDIV) | 0;
  const cellI = cellY * W + cellX;
  const rx = sx % PATH_BLOCKER_SUBDIV;
  const ry = sy % PATH_BLOCKER_SUBDIV;
  // getMacroMask losslessly encodes cell/door state + per-subcell blockers
  // (65535 when the macro cell is impassable), and is frozen-cache aware.
  return (getMacroMask(world, cellI) & (1 << (ry * PATH_BLOCKER_SUBDIV + rx))) === 0;
}

function getSubcellNavCost(world: World, cx: number, cy: number): number {
  const nW = cy * SW + (cx === 0 ? SW - 1 : cx - 1);
  const nE = cy * SW + (cx === SW - 1 ? 0 : cx + 1);
  const nN = (cy === 0 ? SW - 1 : cy - 1) * SW + cx;
  const nS = (cy === SW - 1 ? 0 : cy + 1) * SW + cx;
  if (!isSubcellNavPassable(world, nW)) return 2;
  if (!isSubcellNavPassable(world, nE)) return 2;
  if (!isSubcellNavPassable(world, nN)) return 2;
  if (!isSubcellNavPassable(world, nS)) return 2;
  
  const nNW = (cy === 0 ? SW - 1 : cy - 1) * SW + (cx === 0 ? SW - 1 : cx - 1);
  const nNE = (cy === 0 ? SW - 1 : cy - 1) * SW + (cx === SW - 1 ? 0 : cx + 1);
  const nSW = (cy === SW - 1 ? 0 : cy + 1) * SW + (cx === 0 ? SW - 1 : cx - 1);
  const nSE = (cy === SW - 1 ? 0 : cy + 1) * SW + (cx === SW - 1 ? 0 : cx + 1);
  if (!isSubcellNavPassable(world, nNW)) return 2;
  if (!isSubcellNavPassable(world, nNE)) return 2;
  if (!isSubcellNavPassable(world, nSW)) return 2;
  if (!isSubcellNavPassable(world, nSE)) return 2;
  
  return 1;
}


function checkFlowPassable(world: World, next: Int32Array, cell: number): boolean {
  const n = next[cell];
  if (n !== FLOW_UNREACHED) return n !== FLOW_BLOCKED;
  const pass = isSubcellNavPassable(world, cell);
  if (!pass) next[cell] = FLOW_BLOCKED;
  return pass;
}


const MACRO_LUT = new Uint16Array(65536);
const LUT_CONN_NE = 1;
const LUT_CONN_NS = 2;
const LUT_CONN_NW = 4;
const LUT_CONN_ES = 8;
const LUT_CONN_EW = 16;
const LUT_CONN_SW = 32;
const LUT_TOUCH_N = 64;
const LUT_TOUCH_E = 128;
const LUT_TOUCH_S = 256;
const LUT_TOUCH_W = 512;

function initMacroLut() {
  for (let mask = 0; mask < 65536; mask++) {
    const passable = (x: number, y: number) => (mask & (1 << (y * 4 + x))) === 0;
    const comp = new Int32Array(16).fill(-1);
    let compId = 0;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (passable(x, y) && comp[y * 4 + x] === -1) {
          const q = [y * 4 + x];
          comp[y * 4 + x] = compId;
          let head = 0;
          while (head < q.length) {
            const curr = q[head++];
            const cx = curr % 4;
            const cy = Math.floor(curr / 4);
            if (cx > 0 && passable(cx - 1, cy) && comp[cy * 4 + (cx - 1)] === -1) { comp[cy * 4 + (cx - 1)] = compId; q.push(cy * 4 + (cx - 1)); }
            if (cx < 3 && passable(cx + 1, cy) && comp[cy * 4 + (cx + 1)] === -1) { comp[cy * 4 + (cx + 1)] = compId; q.push(cy * 4 + (cx + 1)); }
            if (cy > 0 && passable(cx, cy - 1) && comp[(cy - 1) * 4 + cx] === -1) { comp[(cy - 1) * 4 + cx] = compId; q.push((cy - 1) * 4 + cx); }
            if (cy < 3 && passable(cx, cy + 1) && comp[(cy + 1) * 4 + cx] === -1) { comp[(cy + 1) * 4 + cx] = compId; q.push((cy + 1) * 4 + cx); }
          }
          compId++;
        }
      }
    }
    
    let lutVal = 0;
    const touchN = new Set();
    const touchS = new Set();
    const touchE = new Set();
    const touchW = new Set();
    
    for (let x = 0; x < 4; x++) {
      if (comp[0 * 4 + x] !== -1) touchN.add(comp[0 * 4 + x]);
      if (comp[3 * 4 + x] !== -1) touchS.add(comp[3 * 4 + x]);
    }
    for (let y = 0; y < 4; y++) {
      if (comp[y * 4 + 0] !== -1) touchW.add(comp[y * 4 + 0]);
      if (comp[y * 4 + 3] !== -1) touchE.add(comp[y * 4 + 3]);
    }
    
    if (touchN.size > 0) lutVal |= LUT_TOUCH_N;
    if (touchE.size > 0) lutVal |= LUT_TOUCH_E;
    if (touchS.size > 0) lutVal |= LUT_TOUCH_S;
    if (touchW.size > 0) lutVal |= LUT_TOUCH_W;
    
    for (const c of touchN) {
      if (touchE.has(c)) lutVal |= LUT_CONN_NE;
      if (touchS.has(c)) lutVal |= LUT_CONN_NS;
      if (touchW.has(c)) lutVal |= LUT_CONN_NW;
    }
    for (const c of touchE) {
      if (touchS.has(c)) lutVal |= LUT_CONN_ES;
      if (touchW.has(c)) lutVal |= LUT_CONN_EW;
    }
    for (const c of touchS) {
      if (touchW.has(c)) lutVal |= LUT_CONN_SW;
    }
    MACRO_LUT[mask] = lutVal;
  }
}
initMacroLut();

function getMacroMask(world: World, ci: number): number {
  // While frozen, read the baked snapshot so query-time path reconstruction
  // ignores geometry mutated mid-samosbor (frozen-cache contract).
  if (_frozenMacroMask && _frozenNavWorld === world) return _frozenMacroMask[ci];
  return computeMacroMask(world, ci);
}

function computeMacroMask(world: World, ci: number): number {
  const cellC = world.cells[ci];
  if (cellC !== Cell.FLOOR && cellC !== Cell.WATER && cellC !== Cell.DOOR) return 65535;
  if (cellC === Cell.DOOR) {
    const door = world.doors.get(ci);
    if (door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED)) return 65535;
  }
  const base = ci * PATH_BLOCKER_BYTES_PER_CELL;
  const pb = world.pathBlockers;
  const b0 = pb[base + 0] & 15;
  const b1 = pb[base + 1] & 15;
  const b2 = pb[base + 2] & 15;
  const b3 = pb[base + 3] & 15;
  return b0 | (b1 << 4) | (b2 << 8) | (b3 << 12);
}

/* ── Region-Portal HPA* helpers ───────────────────────────────── */

function macroCellsConnected(world: World, ci: number, ni: number): boolean {
  const curMask = getMacroMask(world, ci);
  if (curMask === 65535) return false;
  const nMask = getMacroMask(world, ni);
  if (nMask === 65535) return false;
  const cx = ci % W, cy = (ci / W) | 0;
  const nx = ni % W, ny = (ni / W) | 0;
  if (ny === ((cy - 1 + W) % W) && nx === cx) {
    for (let x = 0; x < 4; x++) if ((curMask & (1 << x)) === 0 && (nMask & (1 << (12 + x))) === 0) return true;
  } else if (ny === ((cy + 1) % W) && nx === cx) {
    for (let x = 0; x < 4; x++) if ((curMask & (1 << (12 + x))) === 0 && (nMask & (1 << x)) === 0) return true;
  } else if (nx === ((cx + 1) % W) && ny === cy) {
    for (let y = 0; y < 4; y++) if ((curMask & (1 << (y * 4 + 3))) === 0 && (nMask & (1 << (y * 4))) === 0) return true;
  } else if (nx === ((cx - 1 + W) % W) && ny === cy) {
    for (let y = 0; y < 4; y++) if ((curMask & (1 << (y * 4))) === 0 && (nMask & (1 << (y * 4 + 3))) === 0) return true;
  }
  return false;
}

function findBorderSubcells(world: World, cx: number, cy: number, ncx: number, ncy: number): [number, number] | null {
  if (ncy === ((cy - 1 + W) % W) && ncx === cx) {
    for (let x = 0; x < 4; x++) {
      if (isSubcellNavPassable(world, (cy * 4) * SW + cx * 4 + x) && isSubcellNavPassable(world, (ncy * 4 + 3) * SW + ncx * 4 + x))
        return [(cy * 4) * SW + cx * 4 + x, (ncy * 4 + 3) * SW + ncx * 4 + x];
    }
  } else if (ncy === ((cy + 1) % W) && ncx === cx) {
    for (let x = 0; x < 4; x++) {
      if (isSubcellNavPassable(world, (cy * 4 + 3) * SW + cx * 4 + x) && isSubcellNavPassable(world, (ncy * 4) * SW + ncx * 4 + x))
        return [(cy * 4 + 3) * SW + cx * 4 + x, (ncy * 4) * SW + ncx * 4 + x];
    }
  } else if (ncx === ((cx + 1) % W) && ncy === cy) {
    for (let y = 0; y < 4; y++) {
      if (isSubcellNavPassable(world, (cy * 4 + y) * SW + cx * 4 + 3) && isSubcellNavPassable(world, (ncy * 4 + y) * SW + ncx * 4))
        return [(cy * 4 + y) * SW + cx * 4 + 3, (ncy * 4 + y) * SW + ncx * 4];
    }
  } else if (ncx === ((cx - 1 + W) % W) && ncy === cy) {
    for (let y = 0; y < 4; y++) {
      if (isSubcellNavPassable(world, (cy * 4 + y) * SW + cx * 4) && isSubcellNavPassable(world, (ncy * 4 + y) * SW + ncx * 4 + 3))
        return [(cy * 4 + y) * SW + cx * 4, (ncy * 4 + y) * SW + ncx * 4 + 3];
    }
  }
  return null;
}

function portalCellInRegion(portalIdx: number, regionId: number): number {
  const p = _portals[portalIdx];
  if (p.regionA === regionId) return p.cy * W + p.cx;
  return p.ncy * W + p.ncx;
}

function toroidalManhattan(ci: number, cj: number): number {
  const ax = ci % W, ay = (ci / W) | 0;
  const bx = cj % W, by = (cj / W) | 0;
  let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx;
  let dy = Math.abs(ay - by); if (dy > W / 2) dy = W - dy;
  return dx + dy;
}

/* Scan one horizontal border row (between cy and (cy-1+W)%W) for portal runs.
 * Extracted verbatim from bake Step 2 so a local patch re-scans a single row
 * with bit-identical run-grouping. Appends to `_portals`. */
function scanHorizontalBorderRow(world: World, cy: number): void {
  const ncy = (cy - 1 + W) % W;
  let runStart = -1, runRA = 0, runRB = 0;
  for (let cx = 0; cx < W; cx++) {
    const ci = cy * W + cx, ni = ncy * W + cx;
    const rA = _regionMap[ci], rB = _regionMap[ni];
    const ok = rA !== REGION_NONE && rB !== REGION_NONE && rA !== rB && macroCellsConnected(world, ci, ni);
    if (ok && (runStart < 0 || rA !== runRA || rB !== runRB)) {
      if (runStart >= 0) emitPortalFromRun(((runStart + cx - 1) / 2) | 0, true, cy, ncy, 0, 0, runRA, runRB);
      runStart = cx; runRA = rA; runRB = rB;
    } else if (!ok && runStart >= 0) {
      emitPortalFromRun(((runStart + cx - 1) / 2) | 0, true, cy, ncy, 0, 0, runRA, runRB);
      runStart = -1;
    }
  }
  if (runStart >= 0) emitPortalFromRun(((runStart + W - 1) / 2) | 0, true, cy, ncy, 0, 0, runRA, runRB);
}

/* Scan one vertical border column (between cx and (cx-1+W)%W) for portal runs. */
function scanVerticalBorderCol(world: World, cx: number): void {
  const ncx = (cx - 1 + W) % W;
  let runStart = -1, runRA = 0, runRB = 0;
  for (let cy = 0; cy < W; cy++) {
    const ci = cy * W + cx, ni = cy * W + ncx;
    const rA = _regionMap[ci], rB = _regionMap[ni];
    const ok = rA !== REGION_NONE && rB !== REGION_NONE && rA !== rB && macroCellsConnected(world, ci, ni);
    if (ok && (runStart < 0 || rA !== runRA || rB !== runRB)) {
      if (runStart >= 0) emitPortalFromRun(((runStart + cy - 1) / 2) | 0, false, 0, 0, cx, ncx, runRA, runRB);
      runStart = cy; runRA = rA; runRB = rB;
    } else if (!ok && runStart >= 0) {
      emitPortalFromRun(((runStart + cy - 1) / 2) | 0, false, 0, 0, cx, ncx, runRA, runRB);
      runStart = -1;
    }
  }
  if (runStart >= 0) emitPortalFromRun(((runStart + W - 1) / 2) | 0, false, 0, 0, cx, ncx, runRA, runRB);
}

function emitPortalFromRun(xOrYmid: number, isHorizontal: boolean, cy: number, ncy: number, cx: number, ncx: number, rA: number, rB: number): void {
  if (isHorizontal) {
    _portals.push({ cx: xOrYmid, cy, ncx: xOrYmid, ncy, regionA: rA, regionB: rB });
  } else {
    _portals.push({ cx, cy: xOrYmid, ncx, ncy: xOrYmid, regionA: rA, regionB: rB });
  }
}

function localRegionMacroBfs(world: World, mStart: number, mEnd: number, regionId: number): number[] {
  if (mStart === mEnd) return [mEnd];
  _rBfsEpochId++;
  if (_rBfsEpochId > 2000000000) { _rBfsEpoch.fill(0); _rBfsEpochId = 1; }
  _rBfsEpoch[mStart] = _rBfsEpochId;
  _rBfsDist[mStart] = 0;
  let head = 0, tail = 0;
  _rBfsQueue[tail++] = mStart;
  let found = false;
  while (head < tail && !found) {
    const cur = _rBfsQueue[head++];
    const curCx = cur % W, curCy = (cur / W) | 0;
    const d = _rBfsDist[cur];
    const nb = [
      ((curCy - 1 + W) % W) * W + curCx,
      curCy * W + ((curCx + 1) % W),
      ((curCy + 1) % W) * W + curCx,
      curCy * W + ((curCx - 1 + W) % W),
    ];
    for (let k = 0; k < 4; k++) {
      const ni = nb[k];
      if (_rBfsEpoch[ni] === _rBfsEpochId) continue;
      if (_regionMap[ni] !== regionId) continue;
      if (!macroCellsConnected(world, cur, ni)) continue;
      _rBfsEpoch[ni] = _rBfsEpochId;
      _rBfsDist[ni] = d + 1;
      _rBfsQueue[tail++] = ni;
      if (ni === mEnd) { found = true; break; }
    }
  }
  if (!found && _rBfsEpoch[mEnd] !== _rBfsEpochId) return [];
  const path: number[] = [];
  let cur = mEnd;
  let safety = 0;
  while (cur !== mStart && safety < MACRO_W2) {
    path.push(cur);
    const curCx = cur % W, curCy = (cur / W) | 0;
    const d = _rBfsDist[cur];
    const nb = [
      ((curCy - 1 + W) % W) * W + curCx,
      curCy * W + ((curCx + 1) % W),
      ((curCy + 1) % W) * W + curCx,
      curCy * W + ((curCx - 1 + W) % W),
    ];
    let moved = false;
    for (let k = 0; k < 4; k++) {
      const ni = nb[k];
      if (_rBfsEpoch[ni] === _rBfsEpochId && _rBfsDist[ni] === d - 1 && _regionMap[ni] === regionId) {
        cur = ni; moved = true; break;
      }
    }
    if (!moved) break;
    safety++;
  }
  path.push(mStart);
  path.reverse();
  return path;
}

function macroCellPathToSubcells(world: World, macroPath: number[], endSubcell: number): number[] {
  if (macroPath.length <= 1) return macroPath.length === 1 ? [endSubcell] : [];
  const subcellPath: number[] = [];
  for (let i = 0; i < macroPath.length - 1; i++) {
    const m = macroPath[i], nextM = macroPath[i + 1];
    const border = findBorderSubcells(world, m % W, (m / W) | 0, nextM % W, (nextM / W) | 0);
    if (border) { subcellPath.push(border[0]); subcellPath.push(border[1]); }
  }
  if (subcellPath.length > 0) subcellPath[subcellPath.length - 1] = endSubcell;
  return subcellPath;
}

export function bakeNavigationTree(
  world: World,
  cacheCellVersion = world.cellVersion,
  cachePathBlockerVersion = world.pathBlockerVersion,
): void {
  bakeNavigationRegionsAndPortals(world, cacheCellVersion, cachePathBlockerVersion);

  /* ── Step 4: next-hop routing ────────────────────────────────
   * Low-mem (mobile): install the resident region graph for on-demand column
   * BFS — no R²·2 allocation. Desktop: build the dense matrix synchronously. */
  if (useLowMemNav()) installLowMemNav();
  else buildRegionNext();

  finishNavigationBake();
}

/**
 * Low-mem step 4: keep the immutable region-adjacency graph resident (kilobytes
 * to a couple hundred KB) and drop the dense matrix. `regionPath` then answers
 * from an LRU of on-demand next-hop columns (see regionColumnFor). Reads the
 * same steps-1–3 state as buildRegionNext; writes `_lowMemGraph`, `_regionN`,
 * clears `_regionNext` and the column cache, grows the BFS scratch to R.
 */
function installLowMemNav(): void {
  const R = _numRegions;
  _regionN = R;
  _regionNext = null;
  _regionColumns.clear();
  if (R <= 1 || _numPortals === 0) { _lowMemGraph = null; return; }
  _lowMemGraph = extractRegionGraph();
  if (_regionColScratch.length < R) _regionColScratch = new Int32Array(R);
}

/**
 * Steps 1–3 of the bake: region assignment, portal detection, region→portal
 * index. Cheap (~1% of bake time) and touches live world geometry, so it always
 * runs on the main thread. Leaves `_regionMap`, `_portals`, `_numRegions`,
 * `_numPortals`, `_regionPortalIndices` ready for step 4 (sync or worker).
 */
function bakeNavigationRegionsAndPortals(
  world: World,
  cacheCellVersion: number,
  cachePathBlockerVersion: number,
): void {
  _bfsCalls++;
  _navWorld = world;
  _navCellVersion = cacheCellVersion;
  _navPathBlockerVersion = cachePathBlockerVersion;

  /* ── Step 1: Region assignment ──────────────────────────────── */
  _regionMap.fill(REGION_NONE);
  let nextRegionId = 1;

  // 1a: Room regions
  for (const room of world.rooms) {
    if (!room) continue;
    const rid = nextRegionId++;
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        const ci = ((ry % W + W) % W) * W + ((rx % W + W) % W);
        if (world.roomMap[ci] === room.id && isMacroCellPassable(world, ci, world.cells[ci])) {
          _regionMap[ci] = rid;
        }
      }
    }
  }

  // 1b: Cluster flood-fill for non-room passable cells
  for (let clusterRow = 0; clusterRow < CLUSTERS_PER_SIDE; clusterRow++) {
    for (let clusterCol = 0; clusterCol < CLUSTERS_PER_SIDE; clusterCol++) {
      const baseX = clusterCol * CLUSTER_SIZE;
      const baseY = clusterRow * CLUSTER_SIZE;
      for (let dy = 0; dy < CLUSTER_SIZE; dy++) {
        for (let dx = 0; dx < CLUSTER_SIZE; dx++) {
          const cxl = (baseX + dx) % W;
          const cyl = (baseY + dy) % W;
          const ci = cyl * W + cxl;
          if (_regionMap[ci] !== REGION_NONE) continue;
          if (!isMacroCellPassable(world, ci, world.cells[ci])) continue;
          const rid = nextRegionId++;
          let qH = 0, qT = 0;
          _rBfsQueue[qT++] = ci;
          _regionMap[ci] = rid;
          while (qH < qT) {
            const cur = _rBfsQueue[qH++];
            const curX = cur % W, curY = (cur / W) | 0;
            const nb = [
              ((curY - 1 + W) % W) * W + curX,
              curY * W + ((curX + 1) % W),
              ((curY + 1) % W) * W + curX,
              curY * W + ((curX - 1 + W) % W),
            ];
            for (let k = 0; k < 4; k++) {
              const ni = nb[k];
              if (_regionMap[ni] !== REGION_NONE) continue;
              const nx = ni % W, ny = (ni / W) | 0;
              if (((nx - baseX + W) % W) >= CLUSTER_SIZE) continue;
              if (((ny - baseY + W) % W) >= CLUSTER_SIZE) continue;
              if (!isMacroCellPassable(world, ni, world.cells[ni])) continue;
              if (!macroCellsConnected(world, cur, ni)) continue;
              _regionMap[ni] = rid;
              _rBfsQueue[qT++] = ni;
            }
          }
        }
      }
    }
  }
  _numRegions = nextRegionId;
  _navComponents = _numRegions;

  /* ── Step 2: Portal detection (grouped contiguous segments) ─── */
  _portals = [];
  for (let cy = 0; cy < W; cy++) scanHorizontalBorderRow(world, cy);
  for (let cx = 0; cx < W; cx++) scanVerticalBorderCol(world, cx);
  _numPortals = _portals.length;

  /* ── Step 3: Region → portal index + region adjacency ───────── */
  _regionPortalIndices = [];
  for (let i = 0; i < _numRegions; i++) _regionPortalIndices.push([]);
  for (let pi = 0; pi < _numPortals; pi++) {
    const p = _portals[pi];
    _regionPortalIndices[p.regionA].push(pi);
    _regionPortalIndices[p.regionB].push(pi);
  }
}

/** Common tail: a full bake supersedes any pending incremental patch work. */
function finishNavigationBake(): void {
  _navDirtyCells.clear();
  _navDirtyFull = false;
}

/**
 * Parallel bake used behind the loading screen. Runs the exact same steps 1–3
 * on the main thread, then offloads step 4 (`buildRegionNext`, ~98% of bake
 * cost) to a Web Worker pool via the injected `solver`. Falls back to the
 * synchronous kernel when there is no solver (Node/no-Worker), when the floor
 * is too small to be worth the fan-out, or when a worker errors — so the result
 * is always bit-identical to `bakeNavigationTree`. This is a bake-location
 * change only: the graph, matrix and accept-stale runtime contract are
 * unchanged. Callers must keep the loading screen up until the returned promise
 * resolves (the region graph is not ready before then).
 */
export async function bakeNavigationTreeAsync(
  world: World,
  solver: RegionNextSolver | null,
  cacheCellVersion = world.cellVersion,
  cachePathBlockerVersion = world.pathBlockerVersion,
): Promise<void> {
  bakeNavigationRegionsAndPortals(world, cacheCellVersion, cachePathBlockerVersion);

  const R = _numRegions;
  _regionN = R;

  // Low-mem (mobile): never allocate the R²·2 matrix — it is the OOM cause on
  // phones. Install the resident graph + on-demand columns and return; no
  // worker fan-out needed (there is no dense matrix to parallelize).
  if (useLowMemNav()) {
    _regionNext = null;
    installLowMemNav();
    finishNavigationBake();
    return;
  }
  _lowMemGraph = null; // Desktop path: ensure no stale low-mem graph lingers.

  // Steps 1–3 already re-pointed _navWorld/_regionMap/_portals at the new floor;
  // null the stale previous-floor matrix now so a defensive query during the
  // await can't index a mismatched-size _regionNext. (The loop is dormant behind
  // the loading screen, so this is belt-and-braces.)
  _regionNext = null;
  if (R <= 1 || _numPortals === 0) {
    _regionNext = null;
  } else if (!solver || R < MIN_REGIONS_FOR_WORKERS) {
    buildRegionNext();
  } else {
    try {
      _regionNext = await solver(extractRegionGraph());
    } catch {
      // Any worker failure (spawn blocked, message error) → identical sync bake.
      buildRegionNext();
    }
  }

  finishNavigationBake();
}

/**
 * Rebuild the dense R×R region next-hop matrix from `_regionPortalIndices`.
 * Nodes are regions; portals are edges. One BFS per region over the
 * region-adjacency graph — a real graph (all adjacent-region edges kept,
 * cycles preserved), no spanning-tree seams, no O(P³) Floyd-Warshall, no
 * portal cap. Cost is O(R·E). Reads `_numRegions`, `_numPortals`,
 * `_regionPortalIndices`, `_portals`; writes `_regionNext`, `_regionN`.
 *
 * The inner BFS lives in the pure `computeRegionNextRows` kernel so the
 * synchronous path here and the parallel Web Workers (see bakeNavigationTree's
 * async solver) run BIT-IDENTICAL code — same output regardless of core count.
 */
function buildRegionNext(): void {
  const R = _numRegions;
  _regionN = R;
  _lowMemGraph = null; // Dense-matrix path owns routing; no low-mem graph.
  if (R <= 1 || _numPortals === 0) { _regionNext = null; return; }

  const graph = extractRegionGraph();
  if (_regQueue.length < R) {
    _regQueue = new Int32Array(R);
    _regFirstStep = new Int32Array(R);
    _regEpoch = new Int32Array(R);
  }
  const regionNext = new Uint16Array(R * R);
  regionNext.fill(REGION_UNREACHABLE);
  computeRegionNextRows(
    R, graph.portalRegionA, graph.portalRegionB, graph.regOffsets, graph.regFlat,
    1, R, 0, regionNext, _regQueue, _regFirstStep, _regEpoch,
  );
  _regionNext = regionNext;
}

/**
 * Flatten the current region-adjacency graph into transferable typed arrays
 * (portal region-pairs + CSR region→portal lists). This is the ONLY payload a
 * bake worker needs — kilobytes, not the multi-MB world geometry — so cloning
 * it per worker is cheap. Reads `_numRegions`, `_numPortals`, `_portals`,
 * `_regionPortalIndices`; allocates fresh arrays (safe to transfer/clone).
 */
function extractRegionGraph(): RegionGraph {
  const R = _numRegions;
  const P = _numPortals;
  const portalRegionA = new Int32Array(P);
  const portalRegionB = new Int32Array(P);
  for (let pi = 0; pi < P; pi++) {
    const p = _portals[pi];
    portalRegionA[pi] = p.regionA;
    portalRegionB[pi] = p.regionB;
  }
  // CSR: regOffsets[r]..regOffsets[r+1] slices regFlat into region r's portals.
  const regOffsets = new Int32Array(R + 1);
  for (let r = 0; r < R; r++) {
    const list = _regionPortalIndices[r];
    regOffsets[r + 1] = regOffsets[r] + (list ? list.length : 0);
  }
  const regFlat = new Int32Array(regOffsets[R]);
  for (let r = 0; r < R; r++) {
    const list = _regionPortalIndices[r];
    if (!list) continue;
    let o = regOffsets[r];
    for (let a = 0; a < list.length; a++) regFlat[o++] = list[a];
  }
  return { R, portalRegionA, portalRegionB, regOffsets, regFlat };
}

/**
 * Mark macro cells whose passability changed, for the incremental nav patch.
 * Runtime edit sites (wall break, block-kit build, door lock/break) call this
 * with the affected cell indices right before/after bumping `world.cellVersion`
 * or `world.pathBlockerVersion`. The next `ensureNavigationTree` refreshes just
 * those cells locally (no full O(W²) rebake). Reporting is optional: unreported
 * mutators are simply absorbed as stale-until-the-next-planned-bake. Overflowing
 * the bounded set drops to that same stale behaviour for this batch.
 */
export function markNavigationCellsDirty(cells: Iterable<number>): void {
  if (_navDirtyFull) return;
  for (const ci of cells) {
    _navDirtyCells.add(ci);
    if (_navDirtyCells.size > NAV_PATCH_MAX_CELLS) { _navDirtyFull = true; _navDirtyCells.clear(); return; }
  }
}

/**
 * Same-world runtime geometry edits (hermetic/locked door toggle, wall break,
 * block build, beam cell loss) are absorbed as ACCEPT-STALE. We re-sync the
 * cache version so the query path stops re-entering every frame, but we do NOT
 * touch the baked region/portal/next-hop graph. The authoritative graph is
 * rebuilt ONLY at the two PLANNED points — floor generation/load (a new World
 * object) and the post-samosbor stitch (unfreeze nulls `_navWorld`). Never
 * mid-game. This is the Iron Law (optimization.md): no O(W²)/O(R²) recompute
 * during active simulation.
 *
 * Why accept-stale is safe AND sufficient here: actual walkability is enforced
 * LIVE at query time by the subcell layer — `getMacroMask`,
 * `isSubcellNavPassable` and `isMacroCellPassable` all read live cell + door
 * state, independent of the baked region graph. So a closed door / broken wall
 * is honored by the real path immediately. The only thing that goes stale is the
 * coarse cross-region ROUTING HINT (`_regionNext`): for the few edited cells it
 * may suggest a route through a now-closed door (the intra-region/subcell BFS
 * then fails that leg and the caller falls back) or miss a freshly-opened
 * shortcut (same-cluster local BFS may still find it). A briefly sub-optimal or
 * missing path for a few cells is acceptable; a multi-second frame freeze is not.
 *
 * This is why unreported mutators (anomaly wall-snakes, Conway life, section
 * shifts) never needed wiring — and equally why the REPORTED sites don't force a
 * rebuild either: rebuilding the all-pairs region matrix (`buildRegionNext`,
 * O(R²) alloc + one BFS per region) on a single door toggle froze large floors
 * for 10 s+. markNavigationCellsDirty() reports are now advisory: we clear the
 * bounded set so it can't overflow, and keep the hook so a future genuinely-local
 * incremental updater could consume it without re-wiring the edit sites.
 */
function patchNavigationRegions(_world: World, cellV: number, pbV: number): void {
  // Accept stale: re-sync versions + clear the report. No region-graph rebuild.
  _navCellVersion = cellV;
  _navPathBlockerVersion = pbV;
  _navDirtyCells.clear();
  _navDirtyFull = false;
}

function ensureNavigationTree(world: World): void {
  const cellV = navigationCacheCellVersion(world);
  const pbV = navigationCachePathBlockerVersion(world);
  if (_navWorld === world && _navCellVersion === cellV && _navPathBlockerVersion === pbV) {
    _pathCacheHits++;
    return;
  }
  // Same world, versions moved → a runtime geometry edit. Never full-bake here
  // (that would be the banned mid-game O(W²)); patch locally / accept stale.
  // Full bakes happen only on a NEW world (floor gen/load) or post-samosbor
  // unfreeze (which nulls _navWorld), both of which fall through to the bake.
  if (_navWorld === world) {
    patchNavigationRegions(world, cellV, pbV);
    return;
  }
  bakeNavigationTree(world, cellV, pbV);
}

function flowFieldValid(field: BehaviorFlowField, world: World): boolean {
  return field.world === world && field.roomCount === navigationCacheRoomCount(world);
}

/**
 * Warm the navigation cache for a freshly loaded floor. Safe to call from the loading
 * path: it bakes the O(W²) region tree once (the same work `ensureNavigationTree` would
 * do lazily on the first query of frame 1), so the bake happens behind the animated
 * loading screen instead of freezing the first gameplay frame. A no-op when the cache is
 * already valid for this world, and never runs while the cache is frozen (samosbor).
 */
export function prewarmNavigationTree(world: World): void {
  if (_frozenNavWorld) return;
  ensureNavigationTree(world);
}

/**
 * Async twin of `prewarmNavigationTree` for the loading path: same guards and
 * same cache/version decision as `ensureNavigationTree`, but when a full bake is
 * needed it routes step 4 through the Web Worker pool (`solver`) so the ~10 s
 * next-hop bake runs across cores behind the loading screen instead of freezing
 * the main thread (which trips the mobile watchdog). Identical result to the
 * sync prewarm; used by every scheduleLoading path. Callers MUST keep the
 * loading screen up until this resolves.
 */
export async function prewarmNavigationTreeAsync(
  world: World,
  solver: RegionNextSolver | null,
): Promise<void> {
  if (_frozenNavWorld) return;
  const cellV = navigationCacheCellVersion(world);
  const pbV = navigationCachePathBlockerVersion(world);
  if (_navWorld === world && _navCellVersion === cellV && _navPathBlockerVersion === pbV) {
    _pathCacheHits++;
    return; // Cache already valid for this world — nothing to bake.
  }
  if (_navWorld === world) {
    patchNavigationRegions(world, cellV, pbV); // Same world, runtime edit → accept-stale.
    return;
  }
  await bakeNavigationTreeAsync(world, solver, cellV, pbV); // New world → full parallel bake.
}

function ensureBehaviorFlowField(
  world: World,
  key: string,
  sourceProvider: BehaviorFlowFieldSourceProvider,
): BehaviorFlowField | null {
  const cached = _behaviorFlowFields.get(key);
  if (cached && flowFieldValid(cached, world)) {
    cached.lastUsed = ++_flowFieldTouch;
    _pathCacheHits++;
    return cached;
  }

  _flowSourceScratch.length = 0;
  sourceProvider(world, _flowSourceScratch);
  if (_flowSourceScratch.length === 0) {
    _behaviorFlowFields.delete(key);
    return null;
  }

  const next = cached?.next ?? new Int32Array(SW2);
  next.fill(FLOW_UNREACHED);
  _navHead1 = 0;
  _navTail1 = 0;
  _navHead2 = 0;
  _navTail2 = 0;

  for (const source of _flowSourceScratch) {
    if (source < 0 || source >= SW2) continue;
    if (next[source] === source) continue;
      if (!isSubcellNavPassable(world, source)) continue;
    next[source] = source;
    _navQueue[_navBase1 + _navTail1] = source;
    _navTail1 = (_navTail1 + 1) % NAV_QUEUE_HALF;
  }

  let totalReachable = _navTail1;

  while (_navHead1 !== _navTail1 || _navHead2 !== _navTail2) {
    if (_navHead1 === _navTail1) {
      let tmpBase = _navBase1; _navBase1 = _navBase2; _navBase2 = tmpBase;
      let tmpHead = _navHead1; _navHead1 = _navHead2; _navHead2 = tmpHead;
      let tmpTail = _navTail1; _navTail1 = _navTail2; _navTail2 = tmpTail;
    }
    const cur = _navQueue[_navBase1 + _navHead1];
    _navHead1 = (_navHead1 + 1) % NAV_QUEUE_HALF;
    const cx = cur % SW;
    const cy = (cur / SW) | 0;

    const nW = cy * SW + (cx === 0 ? SW - 1 : cx - 1);
    const nE = cy * SW + (cx === SW - 1 ? 0 : cx + 1);
    const nN = (cy === 0 ? SW - 1 : cy - 1) * SW + cx;
    const nS = (cy === SW - 1 ? 0 : cy + 1) * SW + cx;

    if (checkFlowPassable(world, next, nW)) visitFlowNeighbor(world, next, nW, cur);
    if (checkFlowPassable(world, next, nE)) visitFlowNeighbor(world, next, nE, cur);
    if (checkFlowPassable(world, next, nN)) visitFlowNeighbor(world, next, nN, cur);
    if (checkFlowPassable(world, next, nS)) visitFlowNeighbor(world, next, nS, cur);
  }

  _bfsCalls++;
  // Total reachable is computed inside visitFlowNeighbor incrementing totalReachable would need a variable.
  // Actually, we don't return tail anymore. We can just count reachable by iterating next array?
  // No, we can just use a module-level variable for flow Reached if needed, or recalculate.
  // Wait, _bfsVisited is just a stat. 
  // Let's just estimate it or remove the exact count, or keep it.
  _bfsVisited += totalReachable; // Not accurate but it's just a stat.
  const field: BehaviorFlowField = {
    key,
    world,
    cellVersion: navigationCacheCellVersion(world),
    pathBlockerVersion: navigationCachePathBlockerVersion(world),
    roomCount: navigationCacheRoomCount(world),
    next,
    sourceCount: _flowSourceScratch.length,
    reachable: totalReachable, // This is not exact anymore. Let's fix this in visitFlowNeighbor.
    lastUsed: ++_flowFieldTouch,
  };
  _behaviorFlowFields.set(key, field);
  trimBehaviorFlowFieldCache();
  return field;
}

function visitFlowNeighbor(world: World, next: Int32Array, cell: number, parent: number): void {
  if (next[cell] !== FLOW_UNREACHED) return;
  if (!checkFlowPassable(world, next, cell)) return;
  next[cell] = parent;
  
  const cx = cell % SW;
  const cy = (cell / SW) | 0;
  const cost = getSubcellNavCost(world, cx, cy);

  if (cost === 1) {
    _navQueue[_navBase1 + _navTail1] = cell;
    _navTail1 = (_navTail1 + 1) % NAV_QUEUE_HALF;
  } else {
    _navQueue[_navBase2 + _navTail2] = cell;
    _navTail2 = (_navTail2 + 1) % NAV_QUEUE_HALF;
  }
}

function trimBehaviorFlowFieldCache(): void {
  while (_behaviorFlowFields.size > BEHAVIOR_FLOW_FIELD_CACHE_MAX) {
    let oldestKey = '';
    let oldestUsed = Infinity;
    for (const field of _behaviorFlowFields.values()) {
      if (field.lastUsed >= oldestUsed) continue;
      oldestUsed = field.lastUsed;
      oldestKey = field.key;
    }
    if (!oldestKey) return;
    _behaviorFlowFields.delete(oldestKey);
  }
}


/** Walk the region-node next-hop matrix from rS to rT. Returns the region
 *  chain [rS, …, rT] or null if unreachable. O(hops), no allocation beyond
 *  the result. Cycles are preserved in the graph so there are no seams. */
function regionPath(rS: number, rT: number): number[] | null {
  const R = _regionN;
  if (R === 0) return null;
  // Low-mem (mobile): read the on-demand column for rT instead of the dense
  // matrix. col[cur] = next hop cur→rT; identical walk, ~1 MB instead of R²·2.
  if (_lowMemGraph) {
    const col = regionColumnFor(rT);
    if (!col || col[rS] === REGION_UNREACHABLE) return null;
    const regions: number[] = [rS];
    let cur = rS, safety = 0;
    while (cur !== rT && safety <= R) {
      const nxt = col[cur];
      if (nxt === REGION_UNREACHABLE || nxt === cur) return null;
      regions.push(nxt);
      cur = nxt;
      safety++;
    }
    return cur === rT ? regions : null;
  }
  if (!_regionNext) return null;
  if (_regionNext[rS * R + rT] === REGION_UNREACHABLE) return null;
  const regions: number[] = [rS];
  let cur = rS, safety = 0;
  while (cur !== rT && safety <= R) {
    const nxt = _regionNext[cur * R + rT];
    if (nxt === REGION_UNREACHABLE || nxt === cur) return null;
    regions.push(nxt);
    cur = nxt;
    safety++;
  }
  return cur === rT ? regions : null;
}

/** Pick the portal joining rA→rB whose rA-side cell is nearest to nearCell. */
function portalBetween(rA: number, rB: number, nearCell: number): number {
  const portals = _regionPortalIndices[rA];
  if (!portals) return -1;
  let best = -1, bestD = Infinity;
  for (let a = 0; a < portals.length; a++) {
    const pi = portals[a];
    const p = _portals[pi];
    const other = p.regionA === rA ? p.regionB : p.regionA;
    if (other !== rB) continue;
    const d = toroidalManhattan(nearCell, portalCellInRegion(pi, rA));
    if (d < bestD) { bestD = d; best = pi; }
  }
  return best;
}

export function getAcousticDistance(world: World, x0: number, y0: number, x1: number, y1: number): number {
  const s0 = subcellIdx(x0, y0);
  const s1 = subcellIdx(x1, y1);
  if (s0 === s1) return 0;
  const mStart = Math.floor((s0 % SW) / 4) + Math.floor((s0 / SW) / 4) * W;
  const mEnd = Math.floor((s1 % SW) / 4) + Math.floor((s1 / SW) / 4) * W;
  const rS = _regionMap[mStart];
  const rT = _regionMap[mEnd];
  if (rS === REGION_NONE || rT === REGION_NONE) return Infinity;
  if (rS === rT) return world.dist(x0, y0, x1, y1);
  ensureNavigationTree(world);
  const regions = regionPath(rS, rT);
  if (!regions) return Infinity;
  // Sum toroidal-manhattan legs through the chosen portal chain.
  let total = 0;
  let cur = mStart;
  for (let i = 0; i < regions.length - 1; i++) {
    const pi = portalBetween(regions[i], regions[i + 1], cur);
    if (pi < 0) return Infinity;
    const entry = portalCellInRegion(pi, regions[i]);
    const exit = portalCellInRegion(pi, regions[i + 1]);
    total += toroidalManhattan(cur, entry);
    cur = exit;
  }
  total += toroidalManhattan(cur, mEnd);
  return total;
}

function buildBakedTreePath(world: World, start: number, end: number): number[] {
  ensureNavigationTree(world);
  if (start === end) return [];
  const mStart = Math.floor((start % SW) / 4) + Math.floor((start / SW) / 4) * W;
  const mEnd = Math.floor((end % SW) / 4) + Math.floor((end / SW) / 4) * W;
  const rS = _regionMap[mStart];
  const rT = _regionMap[mEnd];
  if (rS === REGION_NONE || rT === REGION_NONE) { _bfsMiss++; return []; }

  // Same region: local BFS
  if (rS === rT) {
    if (mStart === mEnd) { _bfsFound++; return [end]; }
    const macroPath = localRegionMacroBfs(world, mStart, mEnd, rS);
    if (macroPath.length === 0) { _bfsMiss++; return []; }
    const sp = macroCellPathToSubcells(world, macroPath, end);
    if (sp.length > 0) { _bfsFound++; } else { _bfsMiss++; }
    return sp;
  }

  // Cross-region: region-node graph query. Walk the region chain, greedily
  // picking the nearest portal between consecutive regions, and stitch the
  // macro-cell path with intra-region BFS. No portal cap, no seams.
  const regions = regionPath(rS, rT);
  if (!regions) { _bfsMiss++; return []; }

  const macroCells: number[] = [mStart];
  let cur = mStart;
  for (let i = 0; i < regions.length - 1; i++) {
    const pi = portalBetween(regions[i], regions[i + 1], cur);
    if (pi < 0) { _bfsMiss++; return []; }
    const entry = portalCellInRegion(pi, regions[i]);
    const exit = portalCellInRegion(pi, regions[i + 1]);
    // Route from current cell to the portal entry within regions[i].
    if (cur !== entry) {
      const seg = localRegionMacroBfs(world, cur, entry, regions[i]);
      if (seg.length === 0) { _bfsMiss++; return []; }
      for (let k = 1; k < seg.length; k++) macroCells.push(seg[k]);
    }
    // Step across the portal.
    if (macroCells[macroCells.length - 1] !== exit) macroCells.push(exit);
    cur = exit;
  }
  // Final leg: last portal exit → end cell within the target region.
  if (cur !== mEnd) {
    const seg = localRegionMacroBfs(world, cur, mEnd, rT);
    if (seg.length === 0) { _bfsMiss++; return []; }
    for (let k = 1; k < seg.length; k++) macroCells.push(seg[k]);
  }

  // Convert macro cell path to subcell waypoints
  const subcellPath = macroCellPathToSubcells(world, macroCells, end);
  if (subcellPath.length > 0) { _bfsFound++; }
  else { _bfsMiss++; }
  return subcellPath;

}

function buildFlowFieldPath(field: BehaviorFlowField, start: number): number[] {
  let cell = start;
  const path: number[] = [];
  while (path.length < PATH_CHUNK_LIMIT) {
    const next = field.next[cell];
    if (next < 0) break;
    if (next === cell) break;
    path.push(next);
    cell = next;
  }
  if (path.length > 0) _bfsFound++;
  else _bfsMiss++;
  if (path.length >= PATH_CHUNK_LIMIT) _bfsLimitHits++;
  return path;
}

export function tryAssignBehaviorFlowPath(
  world: World,
  e: Entity,
  key: string,
  sourceProvider: BehaviorFlowFieldSourceProvider,
): AssignPathStatus {
  const ai = e.ai!;
  const start = subcellIdx(e.x, e.y);
  const field = ensureBehaviorFlowField(world, key, sourceProvider);
  if (!field || field.next[start] < 0) {
    ai.path = [];
    ai.pi = 0;
    _flowPathAssignments.delete(e);
    return 'not_found';
  }

  const cellPath = buildFlowFieldPath(field, start);
  if (cellPath.length === 0) {
    e.ai!.path = [];
    e.ai!.pi = 0;
    e.ai!.stuck = 0;
    e.ai!.tx = e.x;
    e.ai!.ty = e.y;
    _flowPathAssignments.delete(e);
    return 'same';
  }

  const targetCell = cellPath[cellPath.length - 1];
  const [tx, ty] = subcellToWorld(targetCell);
  const status = tryAssignPathToCell(world, e, tx, ty);
  if (status !== 'not_found') {
    _flowPathAssignments.set(e, { key, sourceProvider });
  } else {
    _flowPathAssignments.delete(e);
  }
  return status;
}

function continueBehaviorFlowPath(world: World, e: Entity): AssignPathStatus {
  const assignment = _flowPathAssignments.get(e);
  if (!assignment) return 'not_found';
  return tryAssignBehaviorFlowPath(world, e, assignment.key, assignment.sourceProvider);
}

function hasLineOfSight(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  let dx = x1 - x0;
  let dy = y1 - y0;
  
  if (dx > W / 2) dx -= W;
  else if (dx < -W / 2) dx += W;
  if (dy > W / 2) dy -= W;
  else if (dy < -W / 2) dy += W;

  let cx = Math.floor(x0 * PATH_BLOCKER_SUBDIV);
  let cy = Math.floor(y0 * PATH_BLOCKER_SUBDIV);
  const ex = Math.floor((x0 + dx) * PATH_BLOCKER_SUBDIV);
  const ey = Math.floor((y0 + dy) * PATH_BLOCKER_SUBDIV);

  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);

  let tMaxX = stepX !== 0 ? ((cx + (stepX > 0 ? 1 : 0)) / PATH_BLOCKER_SUBDIV - x0) / dx : Infinity;
  let tMaxY = stepY !== 0 ? ((cy + (stepY > 0 ? 1 : 0)) / PATH_BLOCKER_SUBDIV - y0) / dy : Infinity;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / (dx * PATH_BLOCKER_SUBDIV)) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / (dy * PATH_BLOCKER_SUBDIV)) : Infinity;

  const maxSteps = Math.abs(ex - cx) + Math.abs(ey - cy) + 2;
  let steps = 0;

  while (steps++ < maxSteps) {
    const wrapCX = ((cx % SW) + SW) % SW;
    const wrapCY = ((cy % SW) + SW) % SW;
    if (!isSubcellNavPassable(world, wrapCY * SW + wrapCX)) return false;

    if (cx === ex && cy === ey) break;

    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      cx += stepX;
    } else if (tMaxY < tMaxX) {
      tMaxY += tDeltaY;
      cy += stepY;
    } else {
      const w1x = ((cx + stepX) % SW + SW) % SW;
      if (!isSubcellNavPassable(world, wrapCY * SW + w1x)) return false;
      const w2y = ((cy + stepY) % SW + SW) % SW;
      if (!isSubcellNavPassable(world, w2y * SW + wrapCX)) return false;

      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      cx += stepX;
      cy += stepY;
    }
  }
  return true;
}


export function tryAssignPathToCell(world: World, e: Entity, tx: number, ty: number): AssignPathStatus {
  const ai = e.ai!;
  _flowPathAssignments.delete(e);
  tx = world.wrap(tx);
  ty = world.wrap(ty);
  if (Number.isInteger(tx)) tx += 0.5;
  if (Number.isInteger(ty)) ty += 0.5;

  const start = subcellIdx(e.x, e.y);
  const target = subcellIdx(tx, ty);

  if (start === target) {
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    ai.tx = tx;
    ai.ty = ty;
    return 'same';
  }

  const currentTarget = subcellIdx(ai.tx, ai.ty);
  if (target === currentTarget && ai.path.length > 0 && ai.pi < ai.path.length) {
    return 'same';
  }

  const path = buildBakedTreePath(world, start, target);

  if (path.length === 0) {
    ai.path = [];
    ai.pi = 0;
    ai.tx = tx;
    ai.ty = ty;
    return 'not_found';
  }

  ai.path = path;
  ai.pi = 0;
  ai.stuck = 0;
  ai.tx = tx;
  ai.ty = ty;
  return 'assigned';
}

// Universal door contact for a pathing actor at a subcell on its route.
// People open, monsters bash — the policy lives in actorContactDoor().
function openPathDoor(world: World, e: Entity, subcell: number): void {
  const ci = subcellToCell(subcell);
  if (world.cells[ci] !== Cell.DOOR) return;
  actorContactDoor(world, e, ci);
}

/** Same, addressed by world coordinates (the cell the actor is stepping into). */
function openPathDoorAtWorld(world: World, e: Entity, wx: number, wy: number): void {
  const ci = world.idx(Math.floor(wx), Math.floor(wy));
  if (world.cells[ci] !== Cell.DOOR) return;
  actorContactDoor(world, e, ci);
}

function validSteeringAssignment(assignment: SteeringPathAssignment, world: World, target: number): boolean {
  return assignment.world === world && assignment.target === target;
}

export function clearEntitySteeringPath(e: Entity): void {
  _steeringPathAssignments.delete(e);
}

export function steerEntityTowardCell(world: World, e: Entity, tx: number, ty: number): { x: number; y: number; nextCell: number } | null {
  tx = world.wrap(tx);
  ty = world.wrap(ty);
  if (Number.isInteger(tx)) tx += 0.5;
  if (Number.isInteger(ty)) ty += 0.5;

  const start = subcellIdx(e.x, e.y);
  const target = subcellIdx(tx, ty);
  const targetDistance = world.dist(e.x, e.y, tx, ty);
  if (start === target || targetDistance < 0.35) {
    _steeringPathAssignments.delete(e);
    return null;
  }

  let assignment = _steeringPathAssignments.get(e);
  if (!assignment || !validSteeringAssignment(assignment, world, target) || assignment.pi >= assignment.path.length) {
    const path = buildBakedTreePath(world, start, target);
    if (path.length === 0) {
      _steeringPathAssignments.delete(e);
      return null;
    }
    assignment = {
      world,
      cellVersion: world.cellVersion,
      pathBlockerVersion: world.pathBlockerVersion,
      target,
      path,
      pi: 0,
    };
    _steeringPathAssignments.set(e, assignment);
  }

  while (assignment.pi < assignment.path.length) {
    const cell = assignment.path[assignment.pi];
    const [cx, cy] = subcellToWorld(cell);
    if (world.dist(e.x, e.y, cx, cy) >= 0.3) break;
    assignment.pi++;
  }

  if (assignment.pi >= assignment.path.length) {
    const path = buildBakedTreePath(world, start, target);
    if (path.length === 0) {
      _steeringPathAssignments.delete(e);
      return null;
    }
    assignment.path = path;
    assignment.pi = 0;
    assignment.cellVersion = world.cellVersion;
    assignment.pathBlockerVersion = world.pathBlockerVersion;
  }

  const nextCell = assignment.path[assignment.pi];
  openPathDoor(world, e, nextCell);
  const [nextX, nextY] = subcellToWorld(nextCell);
  const dx = world.delta(e.x, nextX);
  const dy = world.delta(e.y, nextY);
  const stepDistance = Math.sqrt(dx * dx + dy * dy);
  if (stepDistance < 0.01) return null;
  return {
    x: dx / stepDistance,
    y: dy / stepDistance,
    nextCell,
  };
}

function wrapFloat(v: number): number {
  return ((v % W) + W) % W;
}

/* ── Follow path ──────────────────────────────────────────────── */
// Pure grid-based follower: entities traverse the BFS path subcell by subcell.
// Float coordinates are interpolated for visual smoothness only.
// No radius checks, no line-of-sight sampling, no collision tests.
// The BFS path guarantees every step is a passable adjacent subcell.
export function followPath(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.pi >= ai.path.length) {
    if (ai.path.length > 0) {
      const current = world.idx(Math.floor(e.x), Math.floor(e.y));
      const destination = world.idx(Math.floor(ai.tx), Math.floor(ai.ty));
      ai.path = []; ai.pi = 0; ai.stuck = 0;
      if (_flowPathAssignments.has(e)) {
        const status = continueBehaviorFlowPath(world, e);
        if (status === 'assigned') return;
      }
      if (current !== destination) {
        const status = tryAssignPathToCell(world, e, ai.tx, ai.ty);
        if (status === 'assigned') return;
      }
      // Bark: arrived at destination (very rare)
      if (e.type === EntityType.NPC && ai.goal === AIGoal.WORK) {
        emitMarkovBark(e, _barkMsgs, _barkTime, 'ambient', 'Пришли.', BARK_CHANCE_ARRIVE, '#aac');
      }
    }
    if (e.type === EntityType.NPC && ai.goal !== AIGoal.HIDE && ai.goal !== AIGoal.FLEE) {
      ai.stuck += dt;
      // Higher threshold reduces corridor ping-pong: NPCs linger longer before re-wandering
      if (ai.stuck > 3 + rng() * 2) {
        wanderInRoom(world, e);
        // Fallback: if wanderInRoom found nothing (no room or tiny room), try wanderNearby
        if (ai.path.length === 0) wanderNearby(world, e);
        ai.stuck = 0;
      }
    }
    return;
  }

  // Advance past already-reached subcells
  while (ai.pi < ai.path.length) {
    const [cx, cy] = subcellToWorld(ai.path[ai.pi]);
    if (world.dist2(e.x, e.y, cx, cy) >= PATH_WAYPOINT_REACH_SQ) break;
    ai.pi++;
    ai.stuck = 0;
  }
  if (ai.pi >= ai.path.length) return;

  // Lookahead Path Smoothing (String Pulling)
  let lookaheadIndex = ai.pi;
  
  if (ai.path.length > 0) {
    const [lastX, lastY] = subcellToWorld(ai.path[ai.path.length - 1]);
    if (hasLineOfSight(world, e.x, e.y, lastX, lastY)) {
      lookaheadIndex = ai.path.length - 1;
    } else {
      const lookaheadLimit = Math.min(ai.path.length - 1, ai.pi + 20);
      for (let i = lookaheadLimit; i > ai.pi; i--) {
        const [tx, ty] = subcellToWorld(ai.path[i]);
        if (hasLineOfSight(world, e.x, e.y, tx, ty)) {
          lookaheadIndex = i;
          break;
        }
      }
    }
  }
  
  ai.pi = lookaheadIndex;

  // Open doors: current position, next subcell on path, and one ahead
  openPathDoorAtWorld(world, e, e.x, e.y);
  openPathDoor(world, e, ai.path[ai.pi]);
  if (ai.pi + 1 < ai.path.length) openPathDoor(world, e, ai.path[ai.pi + 1]);

  // Target: center of the next subcell on the smoothed BFS path.
  // Because of lookahead, this might be a diagonal or arbitrary angle step!
  const [tx, ty] = subcellToWorld(ai.path[ai.pi]);
  const dx = world.delta(e.x, tx);
  const dy = world.delta(e.y, ty);
  const distSq = dx * dx + dy * dy;
  if (distSq < 0.0001) { ai.pi++; ai.stuck = 0; return; }

  const speed = aiPathMoveSpeed(e) * getCellHazardMoveMultiplier(world, e) * dt;
  const prevX = e.x;
  const prevY = e.y;

  // With string pulling, movement is a direct Euclidean step towards the target.
  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;

  // Resolve the door we are physically walking into. String pulling lets ai.pi
  // skip past the door cell (LOS sees through a CLOSED door, but world.solid
  // treats it as solid), so the path-waypoint contacts miss it and the actor
  // jams against the leaf. Probe one cell ahead along the motion vector: people
  // open it, monsters bash it (actorContactDoor policy).
  openPathDoorAtWorld(world, e, e.x + nx * 0.7, e.y + ny * 0.7);

  const step = Math.min(speed, dist);
  const opt = { ignoreFineBlockers: entityIgnoresFineBlockers(e) };
  
  const testX = wrapFloat(e.x + nx * step);
  if (canActorOccupy(world, testX, e.y, 0, opt)) {
    e.x = testX;
  }
  
  const testY = wrapFloat(e.y + ny * step);
  if (canActorOccupy(world, e.x, testY, 0, opt)) {
    e.y = testY;
  }

  // Stuck: did the entity actually move?
  const moved = (e.x !== prevX || e.y !== prevY);
  ai.stuck = moved ? 0 : ai.stuck + dt;
  if (ai.stuck > 2 && ai.pi < ai.path.length - 1) {
    ai.pi++;
    ai.stuck = 0;
  } else if (ai.stuck > 4) {
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    ai.goal = AIGoal.IDLE;
    ai.timer = 2;
  }
}

/* ── Find nearest room of type ────────────────────────────────── */
interface RoomTypeCache {
  cellVersion: number;
  roomCount: number;
  roomsByType: Map<RoomType, number[]>;
}

const roomTypeCaches = new WeakMap<World, RoomTypeCache>();

function roomsOfType(world: World, type: RoomType): number[] {
  let cache = roomTypeCaches.get(world);
  if (!cache || cache.cellVersion !== world.cellVersion || cache.roomCount !== world.rooms.length) {
    const roomsByType = new Map<RoomType, number[]>();
    for (const room of world.rooms) {
      if (!room) continue;
      let ids = roomsByType.get(room.type);
      if (!ids) {
        ids = [];
        roomsByType.set(room.type, ids);
      }
      ids.push(room.id);
    }
    cache = { cellVersion: world.cellVersion, roomCount: world.rooms.length, roomsByType };
    roomTypeCaches.set(world, cache);
  }
  return cache.roomsByType.get(type) ?? [];
}

export function findNearest(world: World, e: Entity, type: RoomType): number {
  let best = -1, bestD = Infinity;
  for (const roomId of roomsOfType(world, type)) {
    const room = world.rooms[roomId];
    if (!room) continue;
    const d = world.dist2(e.x, e.y, room.x + room.w / 2, room.y + room.h / 2);
    if (d < bestD) { bestD = d; best = room.id; }
  }
  return best;
}

function roomTypeFieldKey(types: readonly RoomType[]): string {
  const unique = [...new Set(types)].sort((a, b) => a - b);
  return `room:${unique.join(',')}`;
}

function roomTypeSourceProvider(types: readonly RoomType[]): BehaviorFlowFieldSourceProvider {
  const unique = [...new Set(types)].sort((a, b) => a - b);
  const key = roomTypeFieldKey(unique);
  const cached = _roomTypeSourceProviders.get(key);
  if (cached) return cached;
  const provider = (world: World, out: number[]): void => {
    for (const type of unique) {
      for (const roomId of roomsOfType(world, type)) {
        const room = world.rooms[roomId];
        if (!room) continue;
        const cx = room.x + Math.floor(room.w / 2);
        const cy = room.y + Math.floor(room.h / 2);
        const cell = subcellIdx(cx + 0.5, cy + 0.5);
        if (isSubcellNavPassable(world, cell)) out.push(cell);
      }
    }
  };
  _roomTypeSourceProviders.set(key, provider);
  return provider;
}

export function gotoNearestRoomType(world: World, e: Entity, type: RoomType): boolean {
  return gotoNearestRoomOfTypes(world, e, [type]);
}

export function gotoNearestRoomOfTypes(world: World, e: Entity, types: readonly RoomType[]): boolean {
  if (types.length === 0) return false;
  const key = roomTypeFieldKey(types);
  const status = tryAssignBehaviorFlowPath(world, e, key, roomTypeSourceProvider(types));
  return status !== 'not_found';
}

/* ── Find family's room of type ───────────────────────────────── */
export function findFamilyRoom(world: World, e: Entity, type: RoomType): number {
  if (e.familyId !== undefined) {
    for (const roomId of roomsOfType(world, type)) {
      const room = world.rooms[roomId];
      if (!room || room.apartmentId !== e.familyId) continue;
      return room.id;
    }
  }
  return findNearest(world, e, type);
}

/* ── Helper: set path to room center ──────────────────────────── */
export function gotoRoom(world: World, e: Entity, targetRoomType: RoomType): AssignPathStatus {
  if (e.y < 0 || e.y >= 1024) return 'not_found';
  
  const ids = roomsOfType(world, targetRoomType);
  if (ids.length === 0) return 'not_found';
  
  const room = world.rooms[ids[0]];
  const tx = room.x + Math.floor(room.w / 2) + 0.5;
  const ty = room.y + Math.floor(room.h / 2) + 0.5;
  return tryAssignPathToCell(world, e, tx, ty);
}

/* ── Helper: wander randomly nearby ───────────────────────────── */

export function wanderNearby(world: World, e: Entity): void {
  const ai = e.ai!;
  for (let attempt = 0; attempt < ROUTINE_WANDER_ATTEMPTS; attempt++) {
    const wx = Math.floor(e.x) + Math.floor(rng() * 20 - 10);
    const wy = Math.floor(e.y) + Math.floor(rng() * 20 - 10);
    const tx = world.wrap(wx);
    const ty = world.wrap(wy);
    if (world.solid(tx, ty)) continue;

    const status = tryAssignPathToCell(world, e, tx, ty);
    if (status !== 'not_found') return;
  }

  ai.path = [];
  ai.pi = 0;
}

/* ── Helper: roam randomly within the current room ────────────── */
export function wanderInRoom(world: World, e: Entity): void {
  const room = world.roomAt(e.x, e.y);
  if (!room || room.w < 3 || room.h < 3) return;
  for (let attempt = 0; attempt < ROUTINE_WANDER_ATTEMPTS; attempt++) {
    const rx = room.x + 1 + Math.floor(rng() * (room.w - 2));
    const ry = room.y + 1 + Math.floor(rng() * (room.h - 2));
    if (!world.solid(rx, ry)) {
      const status = tryAssignPathToCell(world, e, rx, ry);
      if (status !== 'not_found') return;
    }
  }
}

/* ── Helper: wander far across the maze (for travelers) ───────── */
export function wanderFar(world: World, e: Entity): void {
  if (world.rooms.length > 0) {
    for (let attempt = 0; attempt < ROUTINE_FAR_ATTEMPTS; attempt++) {
      const room = world.rooms[Math.floor(rng() * world.rooms.length)];
      if (!room || room.w < 2 || room.h < 2) continue;
      const tx = room.x + Math.floor(room.w / 2);
      const ty = room.y + Math.floor(room.h / 2);
      const status = tryAssignPathToCell(world, e, tx, ty);
      if (status !== 'not_found') return;
    }
  }
  // Fallback: wander nearby
  wanderNearby(world, e);
}
