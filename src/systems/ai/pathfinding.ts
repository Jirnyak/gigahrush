/* ── BFS pathfinding + movement helpers ───────────────────────── */

import {
  W, Cell, DoorState,
  type Entity, type Msg, type Room,
  EntityType,  AIGoal, RoomType,
} from '../../core/types';
import { World } from '../../core/world';
import { PATH_BLOCKER_SUBDIV, PATH_BLOCKER_BYTES_PER_CELL } from '../../core/path_blockers';
import { getCellHazardMoveMultiplier } from '../cell_hazards';

import { actorContactDoor } from '../door_state';
import {
  actorOccupyRadius, canActorOccupy, entityIgnoresFineBlockers, sidestepActor, stepActorBy,
  type ActorOccupyOptions,
} from '../movement_collision';
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
/* Какую долю задуманного шага надо реально отыграть по направлению к вейпойнту,
 * чтобы кадр считался продвижением. Скольжение вдоль стены и расталкивание
 * соседями оставляют крохи — они не должны обнулять счётчик залипания. */
const PATH_PROGRESS_MIN_FRAC = 0.25;
/* Лестница спасения от залипания, по возрастанию цены: боковой обход (локальный,
 * маршрут цел) → перешагнуть вейпойнт (маршрут теряет хвост) → бросить маршрут
 * (терять всё). Рунги выводятся один из другого — своей ручки ни у одного нет. */
const PATH_STUCK_SKIP_SEC = 2;
const PATH_STUCK_SIDESTEP_SEC = PATH_STUCK_SKIP_SEC / 2;
const PATH_STUCK_DROP_SEC = PATH_STUCK_SKIP_SEC * 2;
/* Окно сглаживания пути, в подклетках, и радиус дальней пробы, в клетках.
 * Трассировка стоит ровно столько, сколько луч пробегает по ОТКРЫТОМУ месту:
 * в квартирах он умирает о стену через пару подклеток, а в министерских залах
 * проба до конца маршрута пробегала полсотни клеток на каждого идущего каждый
 * кадр. Дальше двух окон хвост не схлопываем — окно и так ведёт почти прямо. */
const PATH_SMOOTH_LOOKAHEAD = 20;
const PATH_SMOOTH_FAR_PROBE_SQ = (2 * PATH_SMOOTH_LOOKAHEAD / PATH_BLOCKER_SUBDIV) ** 2;
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
 *  value = Uint16Array(R) where [cur] is the next hop cur→rT.
 *
 * Two knobs keep this both cheap AND playable with hundreds of pathing actors:
 *  - Slot count is sized to the FLOOR at install (`_lowMemColSlots`), not a
 *    fixed handful, so the whole working set of actively-targeted regions stays
 *    resident and repeat queries are O(1) map hits instead of re-running the
 *    O(R+E) BFS every time a goal repeats. Bounded by a byte budget, it is still
 *    a tiny fraction of the dense R²·2 matrix (tens of MB vs 256 MB–1 GB).
 *  - Cold columns (a genuine cache miss) are rationed per AI frame
 *    (`_lowMemColBudget`). A retarget burst — floor load, samosbor, a room full
 *    of NPCs re-goaling the same tick — can ask for hundreds of never-seen
 *    columns at once; without a cap that is hundreds of BFS in one frame = the
 *    freeze the user saw. Throttled callers get null (no path THIS frame) and
 *    retry next frame; cache hits are never throttled. Accept-stale, bounded. */
const LOWMEM_COLUMN_BUDGET_BYTES = 8 * 1024 * 1024; // ≈8 MB cap for the LRU.
const LOWMEM_COLUMN_SLOTS_MIN = 64;
const LOWMEM_COLUMN_SLOTS_MAX = 1024;
const LOWMEM_COLUMN_BFS_PER_FRAME = 32; // fresh BFS budget per AI frame.
const _regionColumns = new Map<number, Uint16Array>();
let _lowMemColSlots = LOWMEM_COLUMN_SLOTS_MIN; // sized to R in installLowMemNav.
let _lowMemColBudget = LOWMEM_COLUMN_BFS_PER_FRAME; // refilled per AI frame.
let _regionColScratch = new Int32Array(1024); // BFS queue, grown to R at bake.
// Immutable region graph kept resident in low-mem mode (replaces the matrix).
let _lowMemGraph: RegionGraph | null = null;

/** Fetch (or lazily BFS-build + cache) the next-hop column toward target rT.
 *  Returns null if there is no low-mem graph, or if this frame's cold-column
 *  BFS budget is spent (caller retries next frame). LRU: re-insertion refreshes
 *  recency; the coldest column is evicted past `_lowMemColSlots`. */
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
  // Cache miss → one O(R+E) BFS. Ration these so a burst can't stall the tick.
  if (_lowMemColBudget <= 0) return null;
  _lowMemColBudget--;
  const R = g.R;
  const col = new Uint16Array(R);
  col.fill(REGION_UNREACHABLE);
  computeRegionNextColumn(
    R, g.portalRegionA, g.portalRegionB, g.regOffsets, g.regFlat,
    rT, col, _regionColScratch,
  );
  _regionColumns.set(rT, col);
  if (_regionColumns.size > _lowMemColSlots) {
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

/* Обход внутри региона идёт по узлам «клетка + компонента связности внутри
 * неё», поэтому очередь — не множество клеток, а список ПОСЕЩЕНИЙ: одна клетка
 * стоит в ней столько раз, сколькими своими половинами в неё вошли. Всё, что
 * относится к посещению, лежит по индексу слота очереди:
 *   `_rBfsQueue`  — клетка;
 *   `_rBfsParent` — слот, из которого пришли (−1 у старта);
 *   `_rBfsEnter`  — локальный номер подклетки входа В ЭТУ клетку;
 *   `_rBfsExit`   — локальный номер подклетки выхода ИЗ РОДИТЕЛЬСКОЙ.
 * Две последние пары и есть готовые вейпойнты, поэтому маршрут собирается
 * прямо из очереди и второй раз границы не ищутся.
 * `_rBfsSeen` — по КЛЕТКЕ: маска уже посещённых компонент (до восьми в 4×4). */
const _rBfsQueue = new Int32Array(MACRO_W2);
const _rBfsParent = new Int32Array(MACRO_W2);
const _rBfsEpoch = new Int32Array(MACRO_W2);
const _rBfsEnter = new Uint8Array(MACRO_W2);
const _rBfsExit = new Uint8Array(MACRO_W2);
const _rBfsSeen = new Uint8Array(MACRO_W2);
let _rBfsEpochId = 0;
/** Локальный номер подклетки, которой последнее колено вошло в свою цель;
 *  `MACRO_COMP_ANY` (−1), пока колено не пройдено. Константа объявлена ниже —
 *  здесь литерал, иначе временная мёртвая зона на загрузке модуля. */
let _legArrivalSub = -1;

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

export type AssignPathStatus = 'assigned' | 'same' | 'not_found';

const _behaviorFlowFields = new Map<string, BehaviorFlowField>();
const _flowPathAssignments = new WeakMap<Entity, FlowPathAssignment>();
const _steeringPathAssignments = new WeakMap<Entity, SteeringPathAssignment>();
const _roomTypeSourceProviders = new Map<string, BehaviorFlowFieldSourceProvider>();

/** Diagnostic: live count of resident behavior flow fields. Each is a full
 *  Int32Array(SW²) (~64 MiB), so this × 64 MiB is the cache's mobile RAM. The
 *  call graph only ever requests 3 keys (OFFICE / LIVING / {LIVING,HQ,COMMON}),
 *  so this should read ≤3 — surface it on-device to confirm the working set. */
export function behaviorFlowFieldCount(): number {
  return _behaviorFlowFields.size;
}

function beginPathFrame(time: number): void {
  void time;
  _lowMemColBudget = LOWMEM_COLUMN_BFS_PER_FRAME; // refill cold-column BFS ration (low-mem only).
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
  return [subcellWorldX(si), subcellWorldY(si)];
}

/* Скалярные близнецы subcellToWorld: в followPath центр подклетки берут до
 * двадцати раз за кадр на актёра, и пара в кортеже там — чистый мусор для GC.
 * Арифметика та же, до бита. */
function subcellWorldX(si: number): number {
  return (si % SW) / PATH_BLOCKER_SUBDIV + 0.5 / PATH_BLOCKER_SUBDIV;
}

function subcellWorldY(si: number): number {
  return ((si / SW) | 0) / PATH_BLOCKER_SUBDIV + 0.5 / PATH_BLOCKER_SUBDIV;
}

export function subcellToCell(si: number): number {
  const sx = si % SW;
  const sy = (si / SW) | 0;
  return ((sy / PATH_BLOCKER_SUBDIV) | 0) * W + ((sx / PATH_BLOCKER_SUBDIV) | 0);
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


/* ── Связность ВНУТРИ клетки ──────────────────────────────────────
 *
 * Клетка проходима как макроузел, если её тип — пол/вода/открытая дверь. Но
 * мебель живёт на сетке подклеток, и клетка бывает разрезана ею НАПОПОЛАМ:
 * маска `0000111111110000` — это два свободных ряда сверху и снизу и глухая
 * перемычка между ними. Макрограф такую клетку считал сквозной, маршрут
 * входил снизу и выходил сверху, а тело пройти не могло. Замерено на жилом
 * этаже: внутренне несвязных клеток всего 1.0% (4006 из 393236), но маршрут
 * длиной в сотни клеток задевает хотя бы одну почти наверняка — **21.2%
 * построенных маршрутов содержали такой разрыв**. Актор вставал на первом же
 * и стоял до конца этажа.
 *
 * Таблица отвечает на единственный вопрос: в одной ли компоненте связности
 * две подклетки одной клетки. Индекс `маска * 16 + подклетка`, значение —
 * номер компоненты либо `MACRO_COMP_BLOCKED`. 1 МиБ на весь мир, считается
 * один раз при загрузке модуля — ровно тот же обход, который здесь уже шёл. */
const MACRO_COMP_BLOCKED = 255;
const MACRO_SUBCELLS = PATH_BLOCKER_SUBDIV * PATH_BLOCKER_SUBDIV;
const MACRO_COMP = new Uint8Array(65536 * MACRO_SUBCELLS);
/** Сколько компонент у клетки с такой маской. Ноль — клетка глухая, единица —
 *  обычный случай (99% мира), и на нём весь покомпонентный учёт бесплатен. */
const MACRO_COMP_COUNT = new Uint8Array(65536);

function initMacroComponents() {
  const q = new Int32Array(MACRO_SUBCELLS);
  for (let mask = 0; mask < 65536; mask++) {
    const base = mask * MACRO_SUBCELLS;
    MACRO_COMP.fill(MACRO_COMP_BLOCKED, base, base + MACRO_SUBCELLS);
    const passable = (x: number, y: number) => (mask & (1 << (y * 4 + x))) === 0;
    let compId = 0;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (!passable(x, y) || MACRO_COMP[base + y * 4 + x] !== MACRO_COMP_BLOCKED) continue;
        let head = 0, tail = 0;
        q[tail++] = y * 4 + x;
        MACRO_COMP[base + y * 4 + x] = compId;
        while (head < tail) {
          const curr = q[head++];
          const cx = curr % 4;
          const cy = (curr / 4) | 0;
          if (cx > 0 && passable(cx - 1, cy) && MACRO_COMP[base + cy * 4 + cx - 1] === MACRO_COMP_BLOCKED) { MACRO_COMP[base + cy * 4 + cx - 1] = compId; q[tail++] = cy * 4 + cx - 1; }
          if (cx < 3 && passable(cx + 1, cy) && MACRO_COMP[base + cy * 4 + cx + 1] === MACRO_COMP_BLOCKED) { MACRO_COMP[base + cy * 4 + cx + 1] = compId; q[tail++] = cy * 4 + cx + 1; }
          if (cy > 0 && passable(cx, cy - 1) && MACRO_COMP[base + (cy - 1) * 4 + cx] === MACRO_COMP_BLOCKED) { MACRO_COMP[base + (cy - 1) * 4 + cx] = compId; q[tail++] = (cy - 1) * 4 + cx; }
          if (cy < 3 && passable(cx, cy + 1) && MACRO_COMP[base + (cy + 1) * 4 + cx] === MACRO_COMP_BLOCKED) { MACRO_COMP[base + (cy + 1) * 4 + cx] = compId; q[tail++] = (cy + 1) * 4 + cx; }
        }
        compId++;
      }
    }
    MACRO_COMP_COUNT[mask] = compId;
  }
}
initMacroComponents();

/** Локальный номер подклетки (0..15) внутри её клетки. */
function subLocalIndex(si: number): number {
  return (((si / SW) | 0) % PATH_BLOCKER_SUBDIV) * PATH_BLOCKER_SUBDIV + ((si % SW) % PATH_BLOCKER_SUBDIV);
}

/** Компонента связности подклетки внутри клетки `ci`, или MACRO_COMP_BLOCKED. */
function subComponentOf(world: World, ci: number, localSub: number): number {
  return MACRO_COMP[getMacroMask(world, ci) * MACRO_SUBCELLS + localSub];
}

/** «Откуда угодно»: старт первого колена и подклетка, на которой актор стоит
 *  внутри мебели, компонентой не ограничены — иначе застрявший в шкафу вообще
 *  перестанет получать маршруты. */
const MACRO_COMP_ANY = -1;
/** Маска «годится любая компонента» для цели колена (восемь бит на 4×4). */
const MACRO_COMP_MASK_ANY = 255;

/* ── Границы клеток: сторона, локальные номера, абсолютный индекс ──
 * Сторона нумеруется как порядок соседей в обходе: 0 север, 1 восток, 2 юг,
 * 3 запад. `t` — порядковый номер подклетки вдоль границы (0..3). Пара
 * (сторона, t) однозначно задаёт подклетку выхода в своей клетке и подклетку
 * входа в соседней, поэтому и поиск пары, и маска компонент, и сам обход
 * считают одни и те же четыре пары в одном и том же порядке. */
function borderSide(cx: number, cy: number, ncx: number, ncy: number): number {
  if (ncx === cx) {
    if (ncy === ((cy - 1 + W) % W)) return 0;
    if (ncy === ((cy + 1) % W)) return 2;
  } else if (ncy === cy) {
    if (ncx === ((cx + 1) % W)) return 1;
    if (ncx === ((cx - 1 + W) % W)) return 3;
  }
  return -1;
}

function borderLocalA(side: number, t: number): number {
  return side === 0 ? t : side === 2 ? 12 + t : side === 1 ? t * 4 + 3 : t * 4;
}

function borderLocalB(side: number, t: number): number {
  return side === 0 ? 12 + t : side === 2 ? t : side === 1 ? t * 4 : t * 4 + 3;
}

/** Абсолютный индекс подклетки по клетке и локальному номеру 0..15. */
function subAbs(ci: number, local: number): number {
  return (((ci / W) | 0) * PATH_BLOCKER_SUBDIV + ((local / PATH_BLOCKER_SUBDIV) | 0)) * SW
    + (ci % W) * PATH_BLOCKER_SUBDIV + (local % PATH_BLOCKER_SUBDIV);
}

/* ── Регион по УЗЛУ «клетка + компонента» ────────────────────────
 *
 * Регион обязан быть внутренне связным, иначе региональный граф обещает
 * проход там, где его нет, а честное колено внутри региона упирается в
 * перемычку и возвращает «дороги нет» — ложный отказ ровно там, где обход
 * физически есть. Замерено на жилом этаже: рваных регионов 93 из 22919 (0.4%),
 * худший на пять кусков, и через них шло 3.6% всех запросов.
 *
 * Хранение выведено из той же переписи: у 99% клеток компонента одна, и её
 * регион лежит прямо в `_regionMap` — ни байта сверху. Разрезанные мебелью
 * клетки держатся отдельным словарём: их единицы тысяч на этаж, и заводить
 * под них вторую таблицу на весь мир значило бы платить мегабайты за процент. */
const _regionSplit = new Map<number, number>();

function regionAtComp(mask: number, ci: number, comp: number): number {
  if (MACRO_COMP_COUNT[mask] <= 1) return _regionMap[ci];
  const r = _regionSplit.get(ci * MACRO_SUBCELLS + comp);
  return r === undefined ? REGION_NONE : r;
}

function setRegionAtComp(mask: number, ci: number, comp: number, rid: number): void {
  if (MACRO_COMP_COUNT[mask] <= 1) { _regionMap[ci] = rid; return; }
  _regionSplit.set(ci * MACRO_SUBCELLS + comp, rid);
  // По клетке целиком остаётся регион ПЕРВОЙ компоненты: им отвечают на вопрос
  // «где стоит тот, кто стоит внутри мебели», у кого компоненты нет вовсе.
  if (_regionMap[ci] === REGION_NONE) _regionMap[ci] = rid;
}

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

/**
 * Пары регионов, которые сшивает граница двух клеток, стороной `side` от `ci`.
 *
 * Раньше вопрос был «связаны ли клетки», и ответом было «да» уже от одной
 * проходимой пары подклеток. Но регион теперь принадлежит ПОЛОВИНЕ клетки, и
 * разные подклетки одной границы уводят в разные половины соседа — то есть в
 * разные регионы. Первая пара по порядку считается основной: по ней порталы
 * группируются в отрезки ровно как прежде, поэтому на неразрезанных клетках
 * (99% мира) состав порталов не меняется вовсе. Остальные различные пары
 * выдаются `extras` и выпускаются отдельными порталами на одной клетке.
 */
const _borderRegions = { a: 0, b: 0, extras: [] as number[] };

function collectBorderRegions(world: World, ci: number, ni: number, side: number): boolean {
  const curMask = getMacroMask(world, ci);
  if (curMask === 65535) return false;
  const nMask = getMacroMask(world, ni);
  if (nMask === 65535) return false;
  _borderRegions.extras.length = 0;
  let found = false;
  for (let t = 0; t < PATH_BLOCKER_SUBDIV; t++) {
    const la = borderLocalA(side, t);
    if ((curMask & (1 << la)) !== 0) continue;
    const lb = borderLocalB(side, t);
    if ((nMask & (1 << lb)) !== 0) continue;
    const rA = regionAtComp(curMask, ci, MACRO_COMP[curMask * MACRO_SUBCELLS + la]);
    const rB = regionAtComp(nMask, ni, MACRO_COMP[nMask * MACRO_SUBCELLS + lb]);
    if (!found) { _borderRegions.a = rA; _borderRegions.b = rB; found = true; continue; }
    if (rA === _borderRegions.a && rB === _borderRegions.b) continue;
    let dup = false;
    for (let k = 0; k < _borderRegions.extras.length; k += 2) {
      if (_borderRegions.extras[k] === rA && _borderRegions.extras[k + 1] === rB) { dup = true; break; }
    }
    if (!dup) _borderRegions.extras.push(rA, rB);
  }
  return found;
}

/** Годна ли пара регионов на портал. */
function portalPairUsable(rA: number, rB: number): boolean {
  return rA !== REGION_NONE && rB !== REGION_NONE && rA !== rB;
}

/* Результат findBorderSubcells: пара подклеток по обе стороны границы.
 * Общий объект, а не кортеж: пробу зовут на каждом раскрытии BFS, и пара в
 * массиве там была бы мусором для GC на каждом узле. Живёт до следующего
 * вызова — читать сразу. */
const _borderPair = { a: 0, b: 0 };

/**
 * Найти пару подклеток, которой маршрут переходит из клетки (cx,cy) в соседнюю.
 *
 * `fromComp` — компонента связности ВНУТРИ исходной клетки, из которой мы
 * пришли: годится только та граничная подклетка, до которой из неё физически
 * можно дойти. `MACRO_COMP_ANY` снимает ограничение. Раньше бралась первая
 * проходимая пара по порядку, и мебель, разрезающая клетку, молча пропускалась.
 */
function findBorderSubcells(
  world: World, cx: number, cy: number, ncx: number, ncy: number, fromComp: number,
): boolean {
  const side = borderSide(cx, cy, ncx, ncy);
  if (side < 0) return false;
  const ci = cy * W + cx, ni = ncy * W + ncx;
  const curMask = getMacroMask(world, ci);
  const nMask = getMacroMask(world, ni);
  for (let t = 0; t < PATH_BLOCKER_SUBDIV; t++) {
    const la = borderLocalA(side, t);
    if ((curMask & (1 << la)) !== 0) continue;
    const lb = borderLocalB(side, t);
    if ((nMask & (1 << lb)) !== 0) continue;
    if (fromComp !== MACRO_COMP_ANY && MACRO_COMP[curMask * MACRO_SUBCELLS + la] !== fromComp) continue;
    _borderPair.a = subAbs(ci, la); _borderPair.b = subAbs(ni, lb); return true;
  }
  return false;
}

/**
 * Маска компонент клетки (cx,cy), из которых переход в соседнюю (ncx,ncy)
 * физически возможен. Нужна коленом до портала: прийти в клетку портала мало,
 * надо прийти в ту её ПОЛОВИНУ, из которой портал переходится, иначе честная
 * проверка компонент отказывает там, где надо было лишь обогнуть перемычку.
 */
function borderComponentMask(
  world: World, cx: number, cy: number, ncx: number, ncy: number,
): number {
  const side = borderSide(cx, cy, ncx, ncy);
  if (side < 0) return 0;
  const curMask = getMacroMask(world, cy * W + cx);
  const nMask = getMacroMask(world, ncy * W + ncx);
  let out = 0;
  for (let t = 0; t < PATH_BLOCKER_SUBDIV; t++) {
    const la = borderLocalA(side, t);
    if ((curMask & (1 << la)) !== 0) continue;
    if ((nMask & (1 << borderLocalB(side, t))) !== 0) continue;
    const c = MACRO_COMP[curMask * MACRO_SUBCELLS + la];
    if (c !== MACRO_COMP_BLOCKED) out |= 1 << c;
  }
  return out;
}

/**
 * Подклетка, которой маршрут КОНЧАЕТСЯ в клетке `ci`, придя в неё компонентой
 * `arrivalComp`.
 *
 * Цель сплошь и рядом стоит В МЕБЕЛИ: раковина, кровать, верстак, плита — это
 * и есть блокер, а точка интереса указывает на его клетку. Требовать, чтобы
 * последний вейпойнт был проходим, значит отказать всем таким целям разом;
 * требовать компоненту у заблокированной подклетки — значит отказать всегда,
 * потому что у неё компоненты нет. Дойти надо ДО клетки, а встать — на ближайшей
 * свободной подклетке той половины, в которую пришли.
 *
 * Возвращает −1, когда цель свободна, но лежит в ДРУГОЙ половине: это честное
 * «дороги нет», а не повод соврать.
 */
function resolveEndSubcell(
  world: World, ci: number, endLocal: number, arrivalComp: number,
): number {
  const mask = getMacroMask(world, ci);
  const endComp = MACRO_COMP[mask * MACRO_SUBCELLS + endLocal];
  if (endComp !== MACRO_COMP_BLOCKED) {
    return arrivalComp === MACRO_COMP_ANY || arrivalComp === endComp ? subAbs(ci, endLocal) : -1;
  }
  const ex = endLocal % PATH_BLOCKER_SUBDIV, ey = (endLocal / PATH_BLOCKER_SUBDIV) | 0;
  let best = -1, bestD = Infinity;
  for (let local = 0; local < MACRO_SUBCELLS; local++) {
    const c = MACRO_COMP[mask * MACRO_SUBCELLS + local];
    if (c === MACRO_COMP_BLOCKED) continue;
    if (arrivalComp !== MACRO_COMP_ANY && c !== arrivalComp) continue;
    const d = Math.abs(local % PATH_BLOCKER_SUBDIV - ex) + Math.abs(((local / PATH_BLOCKER_SUBDIV) | 0) - ey);
    if (d < bestD) { bestD = d; best = local; }
  }
  return best < 0 ? -1 : subAbs(ci, best);
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
    if (!collectBorderRegions(world, ci, ni, 0)) {
      if (runStart >= 0) { emitPortalFromRun(((runStart + cx - 1) / 2) | 0, true, cy, ncy, 0, 0, runRA, runRB); runStart = -1; }
      continue;
    }
    const rA = _borderRegions.a, rB = _borderRegions.b;
    for (let k = 0; k < _borderRegions.extras.length; k += 2) {
      if (portalPairUsable(_borderRegions.extras[k], _borderRegions.extras[k + 1])) {
        _portals.push({ cx, cy, ncx: cx, ncy, regionA: _borderRegions.extras[k], regionB: _borderRegions.extras[k + 1] });
      }
    }
    const ok = portalPairUsable(rA, rB);
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
    if (!collectBorderRegions(world, ci, ni, 3)) {
      if (runStart >= 0) { emitPortalFromRun(((runStart + cy - 1) / 2) | 0, false, 0, 0, cx, ncx, runRA, runRB); runStart = -1; }
      continue;
    }
    const rA = _borderRegions.a, rB = _borderRegions.b;
    for (let k = 0; k < _borderRegions.extras.length; k += 2) {
      if (portalPairUsable(_borderRegions.extras[k], _borderRegions.extras[k + 1])) {
        _portals.push({ cx, cy, ncx, ncy: cy, regionA: _borderRegions.extras[k], regionB: _borderRegions.extras[k + 1] });
      }
    }
    const ok = portalPairUsable(rA, rB);
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

/**
 * Обход внутри одного региона по узлам «клетка + компонента связности».
 *
 * Клетка, разрезанная мебелью пополам, — это ДВА разных узла: вошедший снизу
 * наверх не выйдет. Поэтому посещение метится не клеткой, а парой: `_rBfsSeen`
 * держит маску уже пройденных компонент клетки, и одна клетка честно стоит в
 * очереди столько раз, сколькими половинами в неё вошли. Это и есть разница с
 * прежним «осторожно в безопасную сторону»: тот отбрасывал второй приход и мог
 * НЕ найти существующий обход, этот находит любой существующий и по-прежнему
 * не возвращает того, которым не пройти.
 *
 * Раскрытие идёт сразу по ЧЕТЫРЁМ пограничным подклеткам стороны, а не по
 * первой годной: разные подклетки одной границы приводят в разные половины
 * соседа, и брать только первую значило терять вторую.
 *
 * Вейпойнты пишутся прямо в `out` парами «выход из клетки, вход в следующую» —
 * их же обход и выбирал, поэтому границы второй раз не ищутся и разойтись с
 * найденным маршрутом не с чем. `startSub` — локальный номер подклетки старта
 * либо `MACRO_COMP_ANY`; `endCompMask` — маска компонент цели, в любую из
 * которых прийти годится. Компонента прибытия остаётся в `_legArrivalSub`.
 */
function localRegionMacroBfs(
  world: World, mStart: number, mEnd: number, regionId: number,
  startSub: number, endCompMask: number, out: number[],
): boolean {
  const startComp = startSub === MACRO_COMP_ANY
    ? MACRO_COMP_ANY : subComponentOf(world, mStart, startSub);
  const startAny = startComp === MACRO_COMP_ANY || startComp === MACRO_COMP_BLOCKED;
  _legArrivalSub = startAny ? MACRO_COMP_ANY : startSub;
  if (mStart === mEnd) return startAny || (endCompMask & (1 << startComp)) !== 0;

  _rBfsEpochId++;
  if (_rBfsEpochId > 2000000000) { _rBfsEpoch.fill(0); _rBfsEpochId = 1; }
  _rBfsEpoch[mStart] = _rBfsEpochId;
  _rBfsSeen[mStart] = startAny ? MACRO_COMP_MASK_ANY : (1 << startComp);
  _rBfsQueue[0] = mStart;
  _rBfsParent[0] = -1;
  _rBfsEnter[0] = startAny ? MACRO_COMP_BLOCKED : startSub;
  let head = 0, tail = 1, foundSlot = -1;
  while (head < tail && foundSlot < 0) {
    const slot = head++;
    const cur = _rBfsQueue[slot];
    const curCx = cur % W, curCy = (cur / W) | 0;
    const enter = _rBfsEnter[slot];
    const curMask = getMacroMask(world, cur);
    const comp = enter === MACRO_COMP_BLOCKED
      ? MACRO_COMP_ANY : MACRO_COMP[curMask * MACRO_SUBCELLS + enter];
    for (let side = 0; side < 4 && foundSlot < 0; side++) {
      const ni = side === 0 ? ((curCy - 1 + W) % W) * W + curCx
        : side === 1 ? curCy * W + ((curCx + 1) % W)
          : side === 2 ? ((curCy + 1) % W) * W + curCx
            : curCy * W + ((curCx - 1 + W) % W);
      const nMask = getMacroMask(world, ni);
      // Клетка с одной компонентой (99% мира) отсеивается одним чтением, как и
      // раньше; разрезанная спрашивается покомпонентно, ниже по подклеткам.
      const nSingle = MACRO_COMP_COUNT[nMask] <= 1;
      if (nSingle && _regionMap[ni] !== regionId) continue;
      if (_rBfsEpoch[ni] !== _rBfsEpochId) { _rBfsEpoch[ni] = _rBfsEpochId; _rBfsSeen[ni] = 0; }
      for (let t = 0; t < PATH_BLOCKER_SUBDIV; t++) {
        const la = borderLocalA(side, t);
        if ((curMask & (1 << la)) !== 0) continue;
        if (comp !== MACRO_COMP_ANY && MACRO_COMP[curMask * MACRO_SUBCELLS + la] !== comp) continue;
        const lb = borderLocalB(side, t);
        if ((nMask & (1 << lb)) !== 0) continue;
        const nComp = MACRO_COMP[nMask * MACRO_SUBCELLS + lb];
        if (!nSingle && regionAtComp(nMask, ni, nComp) !== regionId) continue;
        if ((_rBfsSeen[ni] & (1 << nComp)) !== 0) continue;
        _rBfsSeen[ni] |= 1 << nComp;
        if (tail >= MACRO_W2) { foundSlot = -1; head = tail; break; }
        _rBfsQueue[tail] = ni;
        _rBfsParent[tail] = slot;
        _rBfsEnter[tail] = lb;
        _rBfsExit[tail] = la;
        if (ni === mEnd && (endCompMask & (1 << nComp)) !== 0) { foundSlot = tail; }
        tail++;
        if (foundSlot >= 0) break;
      }
    }
  }
  if (foundSlot < 0) return false;

  let hops = 0;
  for (let s = foundSlot; _rBfsParent[s] >= 0; s = _rBfsParent[s]) hops++;
  let w = out.length + 2 * hops;
  out.length = w;
  for (let s = foundSlot; _rBfsParent[s] >= 0; s = _rBfsParent[s]) {
    out[--w] = subAbs(_rBfsQueue[s], _rBfsEnter[s]);
    out[--w] = subAbs(_rBfsQueue[_rBfsParent[s]], _rBfsExit[s]);
  }
  _legArrivalSub = _rBfsEnter[foundSlot];
  return true;
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
  // Size the column LRU to this floor: hold as many R·2-byte columns as fit the
  // byte budget so the active target working set stays resident (few re-BFS),
  // clamped to a sane range. Big floor → fewer slots, small floor → more.
  _lowMemColSlots = Math.max(
    LOWMEM_COLUMN_SLOTS_MIN,
    Math.min(LOWMEM_COLUMN_SLOTS_MAX, Math.floor(LOWMEM_COLUMN_BUDGET_BYTES / (R * 2))),
  );
}

/**
 * Залить один регион от узла «клетка + компонента». Членство задаётся либо
 * комнатой (`roomId >= 0`), либо коробкой кластера 16×16: ровно те же две
 * границы, что и раньше, — новое здесь только то, что узлом стала половина
 * клетки, а переход между узлами требует общей ПОГРАНИЧНОЙ подклетки, а не
 * просто соседства клеток.
 *
 * Очередь общая с обходом запросов (`_rBfsQueue` / `_rBfsEnter`): запекание и
 * запрос никогда не идут одновременно, а лишний массив на миллион клеток —
 * четыре мегабайта на ровном месте.
 */
function floodRegionFrom(
  world: World, ci0: number, comp0: number, rid: number,
  roomId: number, baseX: number, baseY: number,
): void {
  setRegionAtComp(getMacroMask(world, ci0), ci0, comp0, rid);
  let qH = 0, qT = 0;
  _rBfsQueue[qT] = ci0; _rBfsEnter[qT] = comp0; qT++;
  while (qH < qT) {
    const cur = _rBfsQueue[qH]; const comp = _rBfsEnter[qH]; qH++;
    const curMask = getMacroMask(world, cur);
    const curCx = cur % W, curCy = (cur / W) | 0;
    for (let side = 0; side < 4; side++) {
      const ni = side === 0 ? ((curCy - 1 + W) % W) * W + curCx
        : side === 1 ? curCy * W + ((curCx + 1) % W)
          : side === 2 ? ((curCy + 1) % W) * W + curCx
            : curCy * W + ((curCx - 1 + W) % W);
      if (roomId >= 0) {
        if (world.roomMap[ni] !== roomId) continue;
      } else {
        if (((ni % W) - baseX + W) % W >= CLUSTER_SIZE) continue;
        if ((((ni / W) | 0) - baseY + W) % W >= CLUSTER_SIZE) continue;
      }
      const nMask = getMacroMask(world, ni);
      if (nMask === 65535) continue;
      for (let t = 0; t < PATH_BLOCKER_SUBDIV; t++) {
        const la = borderLocalA(side, t);
        if ((curMask & (1 << la)) !== 0) continue;
        if (MACRO_COMP[curMask * MACRO_SUBCELLS + la] !== comp) continue;
        const lb = borderLocalB(side, t);
        if ((nMask & (1 << lb)) !== 0) continue;
        const nComp = MACRO_COMP[nMask * MACRO_SUBCELLS + lb];
        if (regionAtComp(nMask, ni, nComp) !== REGION_NONE) continue;
        setRegionAtComp(nMask, ni, nComp, rid);
        _rBfsQueue[qT] = ni; _rBfsEnter[qT] = nComp; qT++;
      }
    }
  }
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

  /* ── Step 1: Region assignment ──────────────────────────────────
   * Заливка идёт по УЗЛАМ «клетка + компонента связности внутри неё», а не по
   * клеткам: иначе комната или кластер, разрезанные перемычкой мебели, носят
   * один номер на два не сообщающихся места, и региональный граф обещает
   * проход, которого нет. Комната больше НЕ красится прямоугольником по той же
   * причине — прямоугольник вообще ни разу не спрашивал о связности. */
  _regionMap.fill(REGION_NONE);
  _regionSplit.clear();
  let nextRegionId = 1;

  // 1a: Room regions
  for (const room of world.rooms) {
    if (!room) continue;
    for (let ry = room.y; ry < room.y + room.h; ry++) {
      for (let rx = room.x; rx < room.x + room.w; rx++) {
        const ci = ((ry % W + W) % W) * W + ((rx % W + W) % W);
        if (world.roomMap[ci] !== room.id) continue;
        const mask = getMacroMask(world, ci);
        for (let comp = 0; comp < MACRO_COMP_COUNT[mask]; comp++) {
          if (regionAtComp(mask, ci, comp) !== REGION_NONE) continue;
          floodRegionFrom(world, ci, comp, nextRegionId++, room.id, -1, -1);
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
          const ci = ((baseY + dy) % W) * W + ((baseX + dx) % W);
          const mask = getMacroMask(world, ci);
          for (let comp = 0; comp < MACRO_COMP_COUNT[mask]; comp++) {
            if (regionAtComp(mask, ci, comp) !== REGION_NONE) continue;
            floodRegionFrom(world, ci, comp, nextRegionId++, -1, baseX, baseY);
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
  /* Регион берётся по УЗЛУ «клетка + компонента»: у разрезанной клетки половины
   * лежат в разных регионах. Стоящий внутри мебели компоненты не имеет — за ним
   * остаётся регион клетки целиком (первой её компоненты). */
  const startMask = getMacroMask(world, mStart);
  const endMaskBits = getMacroMask(world, mEnd);
  const startCompRaw = MACRO_COMP[startMask * MACRO_SUBCELLS + subLocalIndex(start)];
  const endCompRaw = MACRO_COMP[endMaskBits * MACRO_SUBCELLS + subLocalIndex(end)];
  const rS = startCompRaw === MACRO_COMP_BLOCKED
    ? _regionMap[mStart] : regionAtComp(startMask, mStart, startCompRaw);
  const rT = endCompRaw === MACRO_COMP_BLOCKED
    ? _regionMap[mEnd] : regionAtComp(endMaskBits, mEnd, endCompRaw);
  if (rS === REGION_NONE || rT === REGION_NONE) { _bfsMiss++; return []; }

  /* Подклетка, на которой актор стоит, и подклетка цели. Через них ведётся
   * компонента связности внутри клеток: без них маршрут проходит сквозь
   * мебель, разрезающую клетку пополам. Стоящий ВНУТРИ мебели стартует без
   * ограничения — иначе он вообще перестал бы получать маршруты. */
  const startLocal = subLocalIndex(start);
  const startSub = subComponentOf(world, mStart, startLocal) === MACRO_COMP_BLOCKED
    ? MACRO_COMP_ANY : startLocal;
  const endLocal = subLocalIndex(end);
  const endComp = subComponentOf(world, mEnd, endLocal);
  /* Цель в мебели (раковина, кровать, верстак) компоненты не имеет: годится
   * любая половина клетки, вставать актор будет на свободной подклетке той, в
   * которую пришёл. См. resolveEndSubcell. */
  const endMask = endComp === MACRO_COMP_BLOCKED ? MACRO_COMP_MASK_ANY : (1 << endComp);

  const path: number[] = [];

  // Same region: local BFS
  if (rS === rT) {
    if (mStart === mEnd) {
      const startComp = startSub === MACRO_COMP_ANY
        ? MACRO_COMP_ANY : subComponentOf(world, mStart, startSub);
      const only = resolveEndSubcell(world, mEnd, endLocal, startComp);
      if (only < 0) { _bfsMiss++; return []; }
      _bfsFound++; return [only];
    }
    if (!localRegionMacroBfs(world, mStart, mEnd, rS, startSub, endMask, path)
      || !finishEndSubcell(world, path, mEnd, endLocal)) { _bfsMiss++; return []; }
    _bfsFound++;
    return path;
  }

  // Cross-region: region-node graph query. Walk the region chain, greedily
  // picking the nearest portal between consecutive regions, and stitch the
  // legs with intra-region BFS. No portal cap, no seams.
  const regions = regionPath(rS, rT);
  if (!regions) { _bfsMiss++; return []; }

  let cur = mStart;
  /* Компонента связности ведётся сквозь ВСЕ колена: чем актор вошёл в клетку
   * портала, тем он из неё и выходит. */
  let legStartSub = startSub;
  for (let i = 0; i < regions.length - 1; i++) {
    const pi = portalBetween(regions[i], regions[i + 1], cur);
    if (pi < 0) { _bfsMiss++; return []; }
    const entry = portalCellInRegion(pi, regions[i]);
    const exit = portalCellInRegion(pi, regions[i + 1]);
    /* Колено обязано привести не просто в клетку портала, а в ту её половину,
     * из которой портал переходится: иначе честная проверка компонент
     * отказывает там, где надо было лишь обогнуть перемычку внутри клетки. */
    const crossMask = borderComponentMask(
      world, entry % W, (entry / W) | 0, exit % W, (exit / W) | 0);
    if (crossMask === 0) { _bfsMiss++; return []; }
    let arrivalSub = legStartSub;
    if (cur !== entry) {
      if (!localRegionMacroBfs(world, cur, entry, regions[i], legStartSub, crossMask, path)) {
        _bfsMiss++; return [];
      }
      arrivalSub = _legArrivalSub;
    }
    const arrivalComp = arrivalSub === MACRO_COMP_ANY
      ? MACRO_COMP_ANY : subComponentOf(world, entry, arrivalSub);
    if (!findBorderSubcells(world, entry % W, (entry / W) | 0, exit % W, (exit / W) | 0,
      arrivalComp === MACRO_COMP_BLOCKED ? MACRO_COMP_ANY : arrivalComp)) { _bfsMiss++; return []; }
    path.push(_borderPair.a);
    path.push(_borderPair.b);
    legStartSub = subLocalIndex(_borderPair.b);
    cur = exit;
  }
  // Final leg: last portal exit → end cell within the target region.
  if (cur !== mEnd && !localRegionMacroBfs(world, cur, mEnd, rT, legStartSub, endMask, path)) {
    _bfsMiss++; return [];
  }
  if (cur === mEnd) _legArrivalSub = legStartSub;
  if (path.length === 0 || !finishEndSubcell(world, path, mEnd, endLocal)) { _bfsMiss++; return []; }
  _bfsFound++;
  return path;
}

/**
 * Заменить последний вейпойнт настоящей целью. Компонента прибытия известна из
 * `_legArrivalSub`; если цель свободна и лежит в другой половине клетки — это
 * честный отказ, а не повод оставить маршрут, который никуда не приводит.
 */
function finishEndSubcell(world: World, path: number[], mEnd: number, endLocal: number): boolean {
  const arrivalComp = _legArrivalSub === MACRO_COMP_ANY
    ? MACRO_COMP_ANY : subComponentOf(world, mEnd, _legArrivalSub);
  const resolved = resolveEndSubcell(world, mEnd, endLocal,
    arrivalComp === MACRO_COMP_BLOCKED ? MACRO_COMP_ANY : arrivalComp);
  if (resolved < 0 || path.length === 0) return false;
  path[path.length - 1] = resolved;
  return true;
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
  // Low-mem (mobile): behavior flow fields are disabled to avoid the 64 MiB
  // Int32Array(SW2) alloc + 16.7M-subcell BFS. Callers route through the region
  // tree instead (see gotoNearestRoomOfTypes); this guard makes the alloc
  // impossible regardless of caller. Unreachable today on mobile, but future-proof.
  if (useLowMemNav()) return 'not_found';
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
  /* Поле привело туда, где актор уже стоит. Маршрут из одного вейпойнта
   * followPath считает пройденным в тот же кадр, не сдвинув актора, потом
   * подхватывает назначение поля и собирает его заново — и так до конца этажа.
   * Замер: 2622 пересборки за 90 секунд у жителя, который всё это время не
   * сдвинулся ни на клетку. Это прибытие, а не маршрут. */
  if (world.dist2(e.x, e.y, tx, ty) <= PATH_WAYPOINT_REACH_SQ) {
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    ai.tx = e.x;
    ai.ty = e.y;
    _flowPathAssignments.delete(e);
    return 'same';
  }
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

/* Один шаг DDA попадает в ту же макроклетку, что и предыдущий, в среднем три
 * раза из четырёх: PATH_BLOCKER_SUBDIV подклеток на клетку. Маска клетки за
 * время одной трассировки измениться не может — hasLineOfSight ничего не
 * мутирует, — поэтому память на одну клетку даёт тот же ответ, что и
 * isSubcellNavPassable, но без повторного computeMacroMask. Сбрасывается на
 * входе в трассировку: между вызовами геометрия уже может быть другой. */
let _losMemoCell = -1;
let _losMemoMask = 0;
function losSubcellPassable(world: World, si: number): boolean {
  const sx = si % SW;
  const sy = (si / SW) | 0;
  const cellI = ((sy / PATH_BLOCKER_SUBDIV) | 0) * W + ((sx / PATH_BLOCKER_SUBDIV) | 0);
  if (cellI !== _losMemoCell) {
    _losMemoCell = cellI;
    _losMemoMask = getMacroMask(world, cellI);
  }
  return (_losMemoMask & (1 << ((sy % PATH_BLOCKER_SUBDIV) * PATH_BLOCKER_SUBDIV + (sx % PATH_BLOCKER_SUBDIV)))) === 0;
}

function hasLineOfSightToSubcell(world: World, e: Entity, si: number): boolean {
  return hasLineOfSight(world, e.x, e.y, subcellWorldX(si), subcellWorldY(si));
}

/* Луч сглаживания имеет нулевую толщину, а тело — нет. Клиренс тела равен
 * половине подклетки, поэтому в полушаге от ребра клетки тело стоит сразу в
 * ДВУХ клетках, и та, вторая, бывает стеной: луч по своей подклетке проходит,
 * тело — нет. Замерено: монстр срезал двадцать вейпойнтов и упирался в стену,
 * до которой по сырому маршруту не дошёл бы вовсе (он там сворачивал), после
 * чего девяносто секунд полз вдоль свободной оси. Проба стоит одно занятие
 * клетки и делается ПЕРЕД трассировкой — она на порядок дешевле луча. */
const _smoothOccupyOpt: ActorOccupyOptions = { ignoreFineBlockers: false };

function smoothedStepFitsBody(world: World, e: Entity, si: number, radius: number): boolean {
  const dx = world.delta(e.x, subcellWorldX(si));
  const dy = world.delta(e.y, subcellWorldY(si));
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-8) return true;
  const k = radius / Math.sqrt(d2);
  return canActorOccupy(world, world.wrap(e.x + dx * k), world.wrap(e.y + dy * k), radius, _smoothOccupyOpt);
}

function hasLineOfSight(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  _losMemoCell = -1;
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
  // cx/cy остаются развёрнутыми — по ним сравнивают с концом луча. Рядом идут
  // их обёрнутые копии: шаг всегда ±1, поэтому шов проходится одной проверкой
  // вместо двух остатков на ось на каждом шаге.
  let wrapCX = ((cx % SW) + SW) % SW;
  let wrapCY = ((cy % SW) + SW) % SW;

  while (steps++ < maxSteps) {
    const cellI = ((wrapCY / PATH_BLOCKER_SUBDIV) | 0) * W + ((wrapCX / PATH_BLOCKER_SUBDIV) | 0);
    if (cellI !== _losMemoCell) {
      _losMemoCell = cellI;
      _losMemoMask = getMacroMask(world, cellI);
    }
    if ((_losMemoMask & (1 << ((wrapCY % PATH_BLOCKER_SUBDIV) * PATH_BLOCKER_SUBDIV + (wrapCX % PATH_BLOCKER_SUBDIV)))) !== 0) return false;

    if (cx === ex && cy === ey) break;

    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      cx += stepX;
      wrapCX += stepX;
      if (wrapCX < 0) wrapCX = SW - 1; else if (wrapCX >= SW) wrapCX = 0;
    } else if (tMaxY < tMaxX) {
      tMaxY += tDeltaY;
      cy += stepY;
      wrapCY += stepY;
      if (wrapCY < 0) wrapCY = SW - 1; else if (wrapCY >= SW) wrapCY = 0;
    } else {
      let w1x = wrapCX + stepX;
      if (w1x < 0) w1x = SW - 1; else if (w1x >= SW) w1x = 0;
      if (!losSubcellPassable(world, wrapCY * SW + w1x)) return false;
      let w2y = wrapCY + stepY;
      if (w2y < 0) w2y = SW - 1; else if (w2y >= SW) w2y = 0;
      if (!losSubcellPassable(world, w2y * SW + wrapCX)) return false;

      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      cx += stepX;
      cy += stepY;
      wrapCX = w1x;
      wrapCY = w2y;
    }
  }
  return true;
}


/**
 * Цель пути нормализуется одинаково при назначении и при сравнении: обёртка по
 * тору плюс сдвиг целой координаты в центр клетки.
 *
 * Сторожа пересборки пути сравнивали `ai.tx` с сырым `Math.floor(...)`, а сюда
 * ложилось `floor + 0.5` — условие «цель сменилась» было истинным ВСЕГДА, и
 * полноценный поиск шёл каждый кадр на каждого идущего к приманке или на шум.
 */
export function pathTargetCoord(world: World, v: number): number {
  const w = world.wrap(v);
  return Number.isInteger(w) ? w + 0.5 : w;
}

/** Совпадает ли уже назначенная цель актёра с (tx, ty) в тех же координатах. */
export function pathTargetIs(world: World, e: Entity, tx: number, ty: number): boolean {
  const ai = e.ai;
  return ai !== undefined && ai.tx === pathTargetCoord(world, tx) && ai.ty === pathTargetCoord(world, ty);
}

/* ── Пересборка пути ──────────────────────────────────────────── */

/** Срок отрицательного кэша неудачного поиска, в секундах. */
export const REPATH_FAIL_SEC = 1;
/** Насколько близко к назначенной клетке считается «дошёл». */
const REPATH_ARRIVED_SQ = 1;

/**
 * Пора ли актёру пересобирать путь.
 *
 * Старый сторож `ai.path.length === 0 || ai.timer <= 0` выбрасывал статус
 * поиска, а при 'not_found' путь остаётся пустым — значит условие снова
 * истинно СЛЕДУЮЩИМ ЖЕ кадром. Актёр с недостижимой целью гонял полный поиск
 * (с BFS по макроклеткам региона на каждый хоп цепочки) каждый кадр до конца
 * этажа и при этом стоял. Пустой путь сам по себе поиска больше не открывает:
 * «дошёл» отличается от «не нашёл» расстоянием до назначенной клетки.
 *
 * Внимание: «дошёл» намеренно НЕ ждёт таймера — цель погони уже ушла с этого
 * места, и стоять до его истечения незачем. Поэтому для цели, которая движется
 * каждый кадр (ближний бой), этот предикат не годится: там нужен чистый
 * троттл по `ai.timer`, иначе «дошёл» истинно постоянно.
 */
export function actorRepathDue(world: World, e: Entity): boolean {
  const ai = e.ai!;
  if (ai.timer <= 0) return true;
  return ai.path.length === 0 && world.dist2(e.x, e.y, ai.tx, ai.ty) <= REPATH_ARRIVED_SQ;
}

/**
 * Назначить путь и записать срок следующей попытки в тот же `ai.timer`.
 * Провал — это и есть короткий отрицательный кэш; новых полей в `AIState` нет.
 */
export function assignActorPath(
  world: World, e: Entity, tx: number, ty: number, okSec: number,
): AssignPathStatus {
  const status = tryAssignPathToCell(world, e, tx, ty);
  e.ai!.timer = status === 'not_found' ? REPATH_FAIL_SEC : okSec;
  return status;
}

/* Золотой угол: соседние id разводятся максимально далеко по кольцу, а не
 * садятся в горстку слотов. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/* Сопряжённая золотому сечению дробь — второй независимый разброс из того же id. */
const GOLDEN_FRAC = 0.618033988749895;

function goldenFrac(id: number, salt: number): number {
  const v = (id + 1) * GOLDEN_FRAC + salt * 0.7548776662466927;
  return v - Math.floor(v);
}

/**
 * Детерминированное смещение общей цели от `e.id`.
 *
 * Все, кто шёл «туда же», целились в одну и ту же клетку и складывались в одну
 * подклетку: погоня возвращала голое `floor(target)`, рутина — центр комнаты.
 * Кольцо здесь непрерывное (золотой угол по id, радиус — из того же id), а не
 * набор из четырёх-восьми слотов, поэтому оно не насыщается на толпе.
 *
 * Ноль памяти, ноль полей в `AIState`, ноль бейка. Возвращает координаты
 * КЛЕТКИ; если смещённая клетка непроходима, пробует ту же прямую в обратную
 * сторону и только потом сдаётся к самой цели.
 */
export function spreadTargetCell(
  world: World,
  e: Entity,
  tx: number,
  ty: number,
  radius: number,
): { x: number; y: number } {
  const fallbackX = Math.floor(world.wrap(tx));
  const fallbackY = Math.floor(world.wrap(ty));
  if (!(radius > 0)) return { x: fallbackX, y: fallbackY };
  const angle = e.id * GOLDEN_ANGLE;
  // sqrt даёт равномерность по площади круга, а не сгущение к центру.
  const r = radius * Math.sqrt(goldenFrac(e.id, 1));
  const ax = Math.cos(angle) * r;
  const ay = Math.sin(angle) * r;
  for (const sign of SPREAD_SIGNS) {
    const cx = Math.floor(world.wrap(tx + ax * sign));
    const cy = Math.floor(world.wrap(ty + ay * sign));
    if (!world.solid(cx, cy)) return { x: cx, y: cy };
  }
  return { x: fallbackX, y: fallbackY };
}

const SPREAD_SIGNS = [1, -1] as const;

/**
 * Точка внутри прямоугольника комнаты, своя у каждого актёра. Раньше вся рутина
 * целилась в `room.x + floor(w/2)` — одну клетку на всю комнату, из-за чего
 * жильцы стекались в её центр и стояли друг в друге.
 */
/* Сколько точек комнаты пробуем, прежде чем сдаться. Перебирать прямоугольник
 * целиком нельзя — комнаты бывают полсотни на полсотни, а это перебор на актора;
 * восьми проб золотого угла хватает, чтобы найти пол в любой комнате, где он
 * есть хоть где-то, и они детерминированы от `id`. */
const ROOM_TARGET_PROBES = 8;
/* Множители последовательности R2 (обратные степени пластического числа). Они
 * не «ещё две ручки»: это математические константы конкретной последовательности,
 * подбирать их нельзя, как нельзя подбирать число «пи». */
const R2_ALPHA_X = 0.7548776662466927;
const R2_ALPHA_Y = 0.5698402909980532;

export function roomTargetCell(world: World, e: Entity, room: Room): { x: number; y: number } {
  const innerW = room.w - 2;
  const innerH = room.h - 2;
  const cx = world.wrap(room.x + (room.w >> 1));
  const cy = world.wrap(room.y + (room.h >> 1));
  /* Центр комнаты — ПОСЛЕДНЕЕ прибежище, и он тоже проверяется на бетон.
   * Раньше оба запасных выхода отдавали его вслепую, тогда как основная ветка
   * проверяла: комната с колонной или перегородкой в центре давала цель в стене,
   * а поиск пути на непроходимой цели возвращает пустой путь и молча роняет дело.
   * Это тот же класс, что и центр ячейки стратегического яруса, только в ярусе,
   * которым пользуются ВСЕ телесные нужды и весь распорядок. */
  if (innerW < 1 || innerH < 1) return { x: cx, y: cy };
  /* Пробы идут ПОСЛЕДОВАТЕЛЬНОСТЬЮ R2, а не двумя вызовами `goldenFrac` с
   * разными солями. Так было в первой версии этой правки, и тест поймал её: у
   * соли период ДВА, поэтому восемь проб посещали две-три клетки вместо восьми,
   * и комната, забитая почти целиком, не находила единственный свободный пол ни
   * у одного из двухсот акторов. R2 — двумерная последовательность с низким
   * расхождением: соседние индексы ложатся далеко друг от друга по обеим осям. */
  for (let probe = 0; probe < ROOM_TARGET_PROBES; probe++) {
    const n = e.id * ROOM_TARGET_PROBES + probe + 1;
    const fx = n * R2_ALPHA_X;
    const fy = n * R2_ALPHA_Y;
    const x = world.wrap(room.x + 1 + Math.floor((fx - Math.floor(fx)) * innerW));
    const y = world.wrap(room.y + 1 + Math.floor((fy - Math.floor(fy)) * innerH));
    if (!world.solid(x, y)) return { x, y };
  }
  return { x: cx, y: cy };
}

export function tryAssignPathToCell(world: World, e: Entity, tx: number, ty: number): AssignPathStatus {
  const ai = e.ai!;
  _flowPathAssignments.delete(e);
  tx = pathTargetCoord(world, tx);
  ty = pathTargetCoord(world, ty);

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
  tx = pathTargetCoord(world, tx);
  ty = pathTargetCoord(world, ty);

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
    /* Выход из залипания работает для ЛЮБОГО актёра. Раньше страховка была
     * обусловлена EntityType.NPC, и монстр с недостижимой целью просто стоял
     * на месте до конца этажа: путь ему не строился, а поблуждать было
     * некому. Ветка едина — видовых развилок здесь нет. */
    if (ai.goal !== AIGoal.HIDE && ai.goal !== AIGoal.FLEE) {
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
    const si = ai.path[ai.pi];
    if (world.dist2(e.x, e.y, subcellWorldX(si), subcellWorldY(si)) >= PATH_WAYPOINT_REACH_SQ) break;
    ai.pi++;
    ai.stuck = 0;
  }
  if (ai.pi >= ai.path.length) return;

  // Lookahead Path Smoothing (String Pulling)
  const lastIdx = ai.path.length - 1;
  const lookaheadLimit = lastIdx < ai.pi + PATH_SMOOTH_LOOKAHEAD ? lastIdx : ai.pi + PATH_SMOOTH_LOOKAHEAD;
  let lookaheadIndex = ai.pi;

  const bodyRadius = actorOccupyRadius(e);
  _smoothOccupyOpt.ignoreFineBlockers = entityIgnoresFineBlockers(e);

  // Дальний конец пробуется первым: одна удачная линия схлопывает весь хвост.
  // Но когда окно и так достаёт до конца, эта проба — ровно первая итерация
  // цикла ниже, и раньше она стоила вторую трассировку на каждый вызов.
  // Дальний конец за радиусом пробы не трогаем: там луч почти всегда упрётся,
  // а заплатим мы за всё открытое место, которое он до этого пробежал.
  if (lookaheadLimit < lastIdx
    && world.dist2(e.x, e.y, subcellWorldX(ai.path[lastIdx]), subcellWorldY(ai.path[lastIdx])) <= PATH_SMOOTH_FAR_PROBE_SQ
    && hasLineOfSightToSubcell(world, e, ai.path[lastIdx])) {
    lookaheadIndex = lastIdx;
  } else {
    for (let i = lookaheadLimit; i > ai.pi; i--) {
      if (hasLineOfSightToSubcell(world, e, ai.path[i])) {
        lookaheadIndex = i;
        break;
      }
    }
  }

  // Срезка принимается, только если по срезанной прямой пролезает ТЕЛО. Иначе
  // остаётся сырой вейпойнт: он заведомо проходим, потому что маршрут печётся
  // по подклеткам. Проба одна на кадр, а не на кандидата — на этаже квартир
  // проба на каждого кандидата стоила +13% кадра при том же результате.
  if (lookaheadIndex !== ai.pi && smoothedStepFitsBody(world, e, ai.path[lookaheadIndex], bodyRadius)) {
    ai.pi = lookaheadIndex;
  }

  // Open doors: current position, next subcell on path, and one ahead
  openPathDoorAtWorld(world, e, e.x, e.y);
  openPathDoor(world, e, ai.path[ai.pi]);
  if (ai.pi + 1 < ai.path.length) openPathDoor(world, e, ai.path[ai.pi + 1]);

  // Target: center of the next subcell on the smoothed BFS path.
  // Because of lookahead, this might be a diagonal or arbitrary angle step!
  const targetSi = ai.path[ai.pi];
  const dx = world.delta(e.x, subcellWorldX(targetSi));
  const dy = world.delta(e.y, subcellWorldY(targetSi));
  const distSq = dx * dx + dy * dy;
  if (distSq < 0.0001) { ai.pi++; ai.stuck = 0; return; }

  const speed = aiPathMoveSpeed(e) * getCellHazardMoveMultiplier(world, e) * dt;

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
  const prevX = e.x;
  const prevY = e.y;
  // Шаг единый и изотропный: полный 2D-вектор, осевое скольжение только когда
  // он упёрся. Радиус тела наконец реальный — actorOccupyRadius вместо нуля.
  stepActorBy(world, e, nx * step, ny * step, bodyRadius);

  /* Залипание меряется ПРОДВИЖЕНИЕМ ПО МАРШРУТУ, а не фактом смещения.
   * Раньше здесь стояло `e.x !== prevX || e.y !== prevY`, и упёршийся под углом
   * в стену актёр всегда полз вдоль свободной оси: счётчик обнулялся каждый
   * кадр, а вся лестница спасения ниже была недостижима. */
  const advanced = step > 0
    && dist - world.dist(e.x, e.y, subcellWorldX(targetSi), subcellWorldY(targetSi))
      >= step * PATH_PROGRESS_MIN_FRAC;
  /* НИЖНИЙ РУНГ ЛЕСТНИЦЫ: упёрлись в лоб — шагнуть вбок. Осевое скольжение даёт
   * ровно ТАНГЕНЦИАЛЬНУЮ составляющую, и это верная физика, но у лобового упора
   * её нет: актёр ползёт вдоль свободной оси со скоростью, стремящейся к нулю.
   * Ни одна ступень выше из угла не выводит — они перемалывают вейпойнты и
   * бросают маршрут, а угол остаётся тем же.
   *
   * Условие — «ноги не идут», а НЕ «нет продвижения к вейпойнту»: второе верно и
   * для честного скольжения вдоль стены поперёк курса, и обход там воюет со
   * скольжением. Замерено: на триггере `!advanced` застревание монстров РАСТЁТ
   * 20.4% → 31.1%, а на честном упоре без выдержки — до 25.3%. Выдержка и
   * верхняя граница держат обход НИЖНИМ рунгом: он получает свою секунду и
   * молча уступает ход перешагиванию, а не спорит с ним. */
  const minMove = step * PATH_PROGRESS_MIN_FRAC;
  if (!advanced
    && ai.stuck > PATH_STUCK_SIDESTEP_SEC && ai.stuck <= PATH_STUCK_SKIP_SEC
    && step > 0
    && world.dist2(e.x, e.y, prevX, prevY) < minMove * minMove) {
    sidestepActor(world, e, nx, ny, step, bodyRadius);
  }
  /* Продвижение СЛИВАЕТ счётчик с той же скоростью, с какой упор его наливает, а
   * не обнуляет разом. Разом было нельзя: удавшийся обход даёт следующему кадру
   * кроху продвижения, она обнуляла счёт, и ступени «перешагнуть» и «бросить»
   * становились недостижимы — актёр со лживым маршрутом ходил вокруг угла до
   * конца этажа. Жёсткий запрет обнуления это чинит, но роняет и здоровых:
   * актёр, отстоявший секунду и дальше идущий нормально, доходил до «бросить» и
   * терял годный маршрут — доля акторов без маршрута 11.8% → 18.7%. Слив
   * различает их сам: идёшь больше, чем стоишь, — лестница пустеет. */
  ai.stuck = advanced ? Math.max(0, ai.stuck - dt) : ai.stuck + dt;
  /* Две верхние ступени: перешагнуть застрявший вейпойнт, а если и это не
   * помогло — бросить маршрут. Порядок и обнуление здесь принципиальны.
   *
   * Раньше ступени стояли наоборот и перешагивание обнуляло счётчик, поэтому
   * на маршруте длиннее двух вейпойнтов ветка «бросить» была НЕДОСТИЖИМА: счёт
   * шёл 0→2, вейпойнт++, снова 0→2. Актор со лживым маршрутом (а его строит
   * клетка, разрезанная мебелью пополам) молол указатель со скоростью один
   * вейпойнт в две секунды и стоял на месте до конца этажа — замерено: 2070
   * вейпойнтов, 29 пройдено за 59 секунд, смещение 4.9 клетки за 90.
   *
   * Обнулять счётчик на перешагивании нельзя: тогда ступень «бросить» снова
   * станет недостижимой. Само перешагивание от этого не страдает — как только
   * шаг снова отыгрывается, `advanced` обнуляет счётчик сверху, и подряд
   * перешагиваются ровно те вейпойнты, до которых актор физически не достаёт. */
  if (ai.stuck > PATH_STUCK_DROP_SEC) {
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    ai.goal = AIGoal.IDLE;
    ai.timer = 2;
  } else if (ai.stuck > PATH_STUCK_SKIP_SEC && ai.pi < ai.path.length - 1) {
    /* Перешагивание идёт БЕЗ проверки достижимости, и это проверено замером, а
     * не забыто. Разумная на вид проверка «перешагивай только на вейпойнт, до
     * которого дотянешься по прямой» ухудшает застревание монстров в полтора
     * раза (20.6% → 30.5% окон без продвижения на жилом этаже): указатель,
     * бегущий вперёд по списку, — это и есть их способ выбраться, а не дефект.
     * Он перемалывает хвост недостижимых вейпойнтов и находит первый, к
     * которому ноги идут; запрет оставляет актора стоять до ступени «бросить». */
    ai.pi++;
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

/** Room-type sets that NPC routine routing requests via gotoNearestRoom*(). Kept
 *  in sync with the literal calls in npc_fsm.ts; a set missing here just bakes
 *  lazily once (a one-time desktop hitch), never a correctness bug. */
const PREWARM_ROOM_TYPE_SETS: readonly RoomType[][] = [
  [RoomType.OFFICE],
  [RoomType.LIVING],
  [RoomType.LIVING, RoomType.HQ, RoomType.COMMON],
];

/** Desktop: bake the common behavior flow fields behind the loading screen so
 *  the first NPC to route on a fresh (or post-samosbor) floor doesn't pay the
 *  64 MiB alloc + 16.7M-subcell BFS on a gameplay frame. Mobile skips flow fields
 *  entirely (gotoNearestRoomOfTypes falls back to the region tree), so this is a
 *  no-op there; also a no-op while frozen (mid-samosbor). */
export function prewarmBehaviorFlowFields(world: World): void {
  if (_frozenNavWorld) return;
  if (useLowMemNav()) return;
  for (const types of PREWARM_ROOM_TYPE_SETS) {
    ensureBehaviorFlowField(world, roomTypeFieldKey(types), roomTypeSourceProvider(types));
  }
}

export function gotoNearestRoomType(world: World, e: Entity, type: RoomType): boolean {
  return gotoNearestRoomOfTypes(world, e, [type]);
}

export function gotoNearestRoomOfTypes(world: World, e: Entity, types: readonly RoomType[]): boolean {
  if (types.length === 0) return false;
  // Low-mem (mobile): skip behavior flow fields (64 MiB Int32Array + 16.7M-cell
  // BFS per key). Pick the nearest room across the requested types by straight-line
  // distance and route to it through the region tree (~1 MB on-demand column) — an
  // approximation of the flow field's nearest-reachable pick, but memory-flat.
  if (useLowMemNav()) {
    let best = -1, bestD = Infinity;
    for (const type of types) {
      const id = findNearest(world, e, type);
      const room = id >= 0 ? world.rooms[id] : undefined;
      if (!room) continue;
      const d = world.dist2(e.x, e.y, room.x + room.w / 2, room.y + room.h / 2);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (best < 0) return false;
    const room = world.rooms[best]!;
    const spot = roomTargetCell(world, e, room);
    return tryAssignPathToCell(world, e, spot.x, spot.y) !== 'not_found';
  }
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
  const spot = roomTargetCell(world, e, room);
  return tryAssignPathToCell(world, e, spot.x, spot.y);
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
      const spot = roomTargetCell(world, e, room);
      const status = tryAssignPathToCell(world, e, spot.x, spot.y);
      if (status !== 'not_found') return;
    }
  }
  // Fallback: wander nearby
  wanderNearby(world, e);
}
