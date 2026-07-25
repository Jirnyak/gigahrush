/* ── BFS pathfinding + movement helpers ───────────────────────── */

import {
  W, Cell, DoorState,
  type Entity, type Msg,
  EntityType,  AIGoal, RoomType,
} from '../../core/types';
import { World } from '../../core/world';
import { PATH_BLOCKER_SUBDIV, PATH_BLOCKER_BYTES_PER_CELL } from '../../core/path_blockers';
import { getCellHazardMoveMultiplier } from '../cell_hazards';

import { setDoorState } from '../door_state';
import { hearingRadiusMetersForActor } from '../hearing';
import { canActorOccupy, entityIgnoresFineBlockers } from '../movement_collision';
import { aiPathMoveSpeed } from '../rpg';
import { emitMarkovBark, BARK_CHANCE_ARRIVE } from './barks';
import { rng } from '../../core/rand';

let _barkMsgs: Msg[] = [];
let _barkTime = 0;

/** Call once per frame from updateAI to set bark context for followPath arrival barks */
export function setPathContext(msgs: Msg[], time: number, _samosborActive = false): void {
  _barkMsgs = msgs;
  _barkTime = time;
  beginPathFrame(time);
}

/* ── Baked navigation tree (toroidal, ordinary doors are openable) */

const NAV_UNKNOWN = -3;
const NAV_BLOCKED = -2;
const FLOW_UNREACHED = -1;
const FLOW_BLOCKED = -2;
const PATH_CHUNK_LIMIT = 1048576;
const PATH_DESCEND_SEARCH_LIMIT = 1048576;

const PATH_WAYPOINT_REACH = 0.18;
const PATH_WAYPOINT_REACH_SQ = PATH_WAYPOINT_REACH * PATH_WAYPOINT_REACH;
const BEHAVIOR_FLOW_FIELD_CACHE_MAX = 16;
const ROUTINE_WANDER_ATTEMPTS = 4;
const ROUTINE_FAR_ATTEMPTS = 5;
const SW = W * PATH_BLOCKER_SUBDIV;
const SW2 = SW * SW;
const TREES_COUNT = 4;
const _navParents = [new Int32Array(SW2), new Int32Array(SW2), new Int32Array(SW2), new Int32Array(SW2)];
const _navDepths = [new Int32Array(SW2), new Int32Array(SW2), new Int32Array(SW2), new Int32Array(SW2)];
const _navComponent = new Int32Array(SW2);
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
let _navReachable = 0;
let _frozenNavWorld: World | null = null;
let _frozenNavCellVersion = -1;
let _frozenNavPathBlockerVersion = -1;
let _frozenNavRoomCount = -1;
let _frozenNavRefCount = 0;
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
}

export function unfreezeNavigationCacheForWorld(world?: World): void {
  if (!world) {
    _frozenNavWorld = null;
    _frozenNavCellVersion = -1;
    _frozenNavPathBlockerVersion = -1;
    _frozenNavRoomCount = -1;
    _frozenNavRefCount = 0;
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

  if (!isMacroCellPassable(world, cellI, world.cells[cellI])) return false;

  const rx = sx % PATH_BLOCKER_SUBDIV;
  const ry = sy % PATH_BLOCKER_SUBDIV;
  const mask = world.pathBlockers[cellI * PATH_BLOCKER_BYTES_PER_CELL + ry] ?? 0;
  return (mask & (1 << rx)) === 0;
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

function checkNavPassable(world: World, cell: number, parentArr: Int32Array): boolean {
  const p = parentArr[cell];
  if (p !== NAV_UNKNOWN) return p !== NAV_BLOCKED;
  const pass = isSubcellNavPassable(world, cell);
  if (!pass) parentArr[cell] = NAV_BLOCKED;
  return pass;
}

function checkFlowPassable(world: World, next: Int32Array, cell: number): boolean {
  const n = next[cell];
  if (n !== FLOW_UNREACHED) return n !== FLOW_BLOCKED;
  const pass = isSubcellNavPassable(world, cell);
  if (!pass) next[cell] = FLOW_BLOCKED;
  return pass;
}

export function bakeNavigationTree(
  world: World,
  cacheCellVersion = world.cellVersion,
  cachePathBlockerVersion = world.pathBlockerVersion,
): void {
  _bfsCalls++;
  for (let t = 0; t < TREES_COUNT; t++) {
    _navParents[t].fill(NAV_UNKNOWN);
    _navDepths[t].fill(0);
  }
  _navComponent.fill(-1);
  _navWorld = world;
  _navCellVersion = cacheCellVersion;
  _navPathBlockerVersion = cachePathBlockerVersion;
  _navComponents = 0;
  _navReachable = 0;

  const rootOffsets = [
    0,
    Math.floor(SW / 2),
    Math.floor(SW / 2) * SW,
    Math.floor(SW / 2) * SW + Math.floor(SW / 2),
  ];

  for (let t = 0; t < TREES_COUNT; t++) {
    const parentArr = _navParents[t];
    const depthArr = _navDepths[t];
    const offset = rootOffsets[t];

    for (let i = 0; i < SW2; i++) {
      const root = (i + offset) % SW2;
      if (parentArr[root] !== NAV_UNKNOWN) continue;
      if (!isSubcellNavPassable(world, root)) {
        parentArr[root] = NAV_BLOCKED;
        if (t === 0) _navComponent[root] = -1;
        continue;
      }

      let componentId = -1;
      if (t === 0) {
        componentId = _navComponents++;
      } else {
        componentId = _navComponent[root];
      }

      parentArr[root] = root;
      if (t === 0) _navComponent[root] = componentId;
      depthArr[root] = 0;
      if (t === 0) _navReachable++;
      _navQueue[_navBase1] = root;
      _navHead1 = 0;
      _navTail1 = 1;
      _navHead2 = 0;
      _navTail2 = 0;

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

        if (checkNavPassable(world, nW, parentArr)) visitNavNeighbor(world, nW, cur, componentId, t, parentArr, depthArr);
        if (checkNavPassable(world, nE, parentArr)) visitNavNeighbor(world, nE, cur, componentId, t, parentArr, depthArr);
        if (checkNavPassable(world, nN, parentArr)) visitNavNeighbor(world, nN, cur, componentId, t, parentArr, depthArr);
        if (checkNavPassable(world, nS, parentArr)) visitNavNeighbor(world, nS, cur, componentId, t, parentArr, depthArr);
      }
    }
  }

  _bfsVisited += _navReachable * TREES_COUNT;
}

function visitNavNeighbor(
  world: World,
  cell: number,
  parent: number,
  componentId: number,
  t: number,
  parentArr: Int32Array,
  depthArr: Int32Array,
): void {
  if (parentArr[cell] !== NAV_UNKNOWN) return;
  if (!checkNavPassable(world, cell, parentArr)) return;
  parentArr[cell] = parent;
  
  const cx = cell % SW;
  const cy = (cell / SW) | 0;
  const cost = getSubcellNavCost(world, cx, cy);

  depthArr[cell] = depthArr[parent] + cost;
  if (t === 0) {
    _navComponent[cell] = componentId;
    _navReachable++;
  }
  
  if (cost === 1) {
    _navQueue[_navBase1 + _navTail1] = cell;
    _navTail1 = (_navTail1 + 1) % NAV_QUEUE_HALF;
  } else {
    _navQueue[_navBase2 + _navTail2] = cell;
    _navTail2 = (_navTail2 + 1) % NAV_QUEUE_HALF;
  }
}

function ensureNavigationTree(world: World): void {
  if (_navWorld === world) {
    _pathCacheHits++;
    return;
  }
  bakeNavigationTree(world, world.cellVersion, world.pathBlockerVersion);
}

function flowFieldValid(field: BehaviorFlowField, world: World): boolean {
  return field.world === world && field.roomCount === navigationCacheRoomCount(world);
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

function getLcaPathLength(t: number, start: number, end: number): number {
  const parent = _navParents[t];
  const depth = _navDepths[t];
  let a = start;
  let b = end;
  let lenA = 0;
  let lenB = 0;

  let descendSearch = 0;
  while (depth[b] > depth[a] && descendSearch < PATH_DESCEND_SEARCH_LIMIT) {
    b = parent[b];
    lenB++;
    descendSearch++;
  }
  if (depth[b] > depth[a]) return Infinity;

  while (depth[a] > depth[b] && lenA < PATH_CHUNK_LIMIT) {
    a = parent[a];
    lenA++;
  }

  while (a !== b && lenA + lenB < PATH_CHUNK_LIMIT * 2) {
    a = parent[a];
    b = parent[b];
    lenA++;
    lenB++;
  }

  if (a !== b) return Infinity;
  return lenA + lenB;
}

export function getAcousticDistance(_world: World, x0: number, y0: number, x1: number, y1: number): number {
  const s0 = subcellIdx(x0, y0);
  const s1 = subcellIdx(x1, y1);
  if (s0 === s1) return 0;
  if (_navComponent[s0] !== _navComponent[s1] || _navComponent[s0] < 0 || _navComponent[s1] < 0) return Infinity;

  let minLen = Infinity;
  for (let t = 0; t < 4; t++) {
    const len = getLcaPathLength(t, s0, s1);
    if (len < minLen) minLen = len;
  }
  
  if (minLen === Infinity) return Infinity;
  return minLen / PATH_BLOCKER_SUBDIV;
}


function constructPathFromTree(t: number, start: number, end: number): number[] {
  const parent = _navParents[t];
  const depth = _navDepths[t];
  let a = start;
  let b = end;
  const forward: number[] = [];
  const reverse: number[] = [];

  let descendSearch = 0;
  while (depth[b] > depth[a] && descendSearch < PATH_DESCEND_SEARCH_LIMIT) {
    reverse.push(b);
    b = parent[b];
    descendSearch++;
  }

  if (depth[b] > depth[a]) {
    const path = climbFromStart(t, start);
    if (path.length > 0) _bfsFound++;
    else _bfsMiss++;
    _bfsLimitHits++;
    return path;
  }

  if (a === b) {
    for (let i = reverse.length - 1; i >= 0 && forward.length < PATH_CHUNK_LIMIT; i--) {
      forward.push(reverse[i]);
    }
    if (forward.length > 0) _bfsFound++;
    else _bfsMiss++;
    if (reverse.length > PATH_CHUNK_LIMIT) _bfsLimitHits++;
    return forward;
  }

  while (depth[a] > depth[b] && forward.length < PATH_CHUNK_LIMIT) {
    a = parent[a];
    forward.push(a);
  }
  while (a !== b && forward.length < PATH_CHUNK_LIMIT) {
    a = parent[a];
    forward.push(a);
    reverse.push(b);
    b = parent[b];
  }

  let chunked = false;
  if (a === b) {
    chunked = forward.length + reverse.length > PATH_CHUNK_LIMIT;
    for (let i = reverse.length - 1; i >= 0 && forward.length < PATH_CHUNK_LIMIT; i--) {
      forward.push(reverse[i]);
    }
  } else {
    chunked = true;
  }
  if (forward.length > 0) _bfsFound++;
  else _bfsMiss++;
  if (chunked) _bfsLimitHits++;
  return forward;
}

function buildBakedTreePath(world: World, start: number, end: number): number[] {
  ensureNavigationTree(world);
  if (start === end) return [];
  if (_navComponent[start] < 0 || _navComponent[end] < 0 || _navComponent[start] !== _navComponent[end]) {
    _bfsMiss++;
    return [];
  }

  let bestTree = -1;
  let minPathLen = Infinity;

  for (let t = 0; t < TREES_COUNT; t++) {
    if (_navParents[t][start] < 0 || _navParents[t][end] < 0) continue;
    const len = getLcaPathLength(t, start, end);
    if (len < minPathLen) {
      minPathLen = len;
      bestTree = t;
    }
  }

  if (bestTree < 0 || minPathLen === Infinity) {
    return constructPathFromTree(0, start, end);
  }

  return constructPathFromTree(bestTree, start, end);
}

function climbFromStart(t: number, start: number): number[] {
  const parent = _navParents[t];
  const path: number[] = [];
  let cell = start;
  while (path.length < PATH_CHUNK_LIMIT) {
    const p = parent[cell];
    if (p < 0 || p === cell) break;
    path.push(p);
    cell = p;
  }
  return path;
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

function openPathDoor(world: World, subcell: number): void {
  const ci = subcellToCell(subcell);
  if (world.cells[ci] !== Cell.DOOR) return;
  const door = world.doors.get(ci);
  if (door && door.state === DoorState.CLOSED) {
    setDoorState(world, door, DoorState.OPEN);
    door.timer = 5;
  }
}

/** Open a door at world coordinates (not subcell). Used proactively during movement. */
function openPathDoorAtWorld(world: World, wx: number, wy: number): void {
  const ci = world.idx(Math.floor(wx), Math.floor(wy));
  if (world.cells[ci] !== Cell.DOOR) return;
  const door = world.doors.get(ci);
  if (door && door.state === DoorState.CLOSED) {
    setDoorState(world, door, DoorState.OPEN);
    door.timer = 5;
  }
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
  openPathDoor(world, nextCell);
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
  openPathDoorAtWorld(world, e.x, e.y);
  openPathDoor(world, ai.path[ai.pi]);
  if (ai.pi + 1 < ai.path.length) openPathDoor(world, ai.path[ai.pi + 1]);

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
