const fs = require('fs');

const code = `/* ── BFS pathfinding + movement helpers ───────────────────────── */

import {
  W, Cell, DoorState,
  type Entity, type Msg,
  EntityType,  AIGoal, RoomType,
} from '../../core/types';
import { World } from '../../core/world';
import { PATH_BLOCKER_SUBDIV, PATH_BLOCKER_BYTES_PER_CELL } from '../../core/path_blockers';
import { getCellHazardMoveMultiplier } from '../cell_hazards';
import { setDoorState } from '../door_state';
import { canActorOccupy, entityIgnoresFineBlockers } from '../movement_collision';
import { aiPathMoveSpeed } from '../rpg';
import { emitMarkovBark, BARK_CHANCE_ARRIVE } from './barks';
import { rng } from '../../core/rand';

let _barkMsgs: Msg[] = [];
let _barkTime = 0;

export function setPathContext(msgs: Msg[], time: number, _samosborActive = false): void {
  _barkMsgs = msgs;
  _barkTime = time;
  beginPathFrame(time);
}

/* ── Baked Packed Macro Flow Fields ── */

const PATH_CHUNK_LIMIT = 1048576;
const PATH_WAYPOINT_REACH = 0.18;
const PATH_WAYPOINT_REACH_SQ = PATH_WAYPOINT_REACH * PATH_WAYPOINT_REACH;
const ROUTINE_WANDER_ATTEMPTS = 4;
const ROUTINE_FAR_ATTEMPTS = 5;

const SW = W * PATH_BLOCKER_SUBDIV;
const SW2 = SW * SW;
const MACRO_W2 = W * W;

const DIR_UNREACHED = 0;
const DIR_N = 1;
const DIR_S = 2;
const DIR_W = 3;
const DIR_E = 4;
const DIR_ROOT = 5;

const _dynamicNavQueue = new Int32Array(MACRO_W2);
const _dynamicNavParent = new Int32Array(MACRO_W2);
const _dynamicNavMark = new Uint32Array(MACRO_W2);
let _dynamicNavMarkId = 1;

const _roomTypeFlowFields = new Map<RoomType, Uint8Array>();
const _roomFlowFields = new Map<number, Uint8Array>();

const _navQueue = new Int32Array(MACRO_W2);
const _macroPassable = new Uint8Array(MACRO_W2);

let _navWorld: World | null = null;
let _navCellVersion = -1;
let _navPathBlockerVersion = -1;
let _frozenNavWorld: World | null = null;
let _frozenNavCellVersion = -1;
let _frozenNavPathBlockerVersion = -1;
let _frozenNavRoomCount = -1;
let _frozenNavRefCount = 0;

let _routinePathUsed = 0;
let _routinePathDenied = 0;
let _routinePathDeferred = 0;
let _pathCacheHits = 0;
let _bfsCalls = 0;
let _bfsFound = 0;
let _bfsMiss = 0;
let _bfsLimitHits = 0;
let _bfsVisited = 0;

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

const _steeringPathAssignments = new WeakMap<Entity, SteeringPathAssignment>();

function beginPathFrame(time: number): void {
  void time;
  _routinePathUsed = 0;
  _routinePathDenied = 0;
  _routinePathDeferred = 0;
  _bfsCalls = 0;
  _bfsFound = 0;
  _bfsMiss = 0;
  _bfsLimitHits = 0;
  _bfsVisited = 0;
}

export function getPathfindingStats(): PathfindingStats {
  return {
    routineUsed: _routinePathUsed,
    routineDenied: _routinePathDenied,
    routineDeferred: _routinePathDeferred,
    cacheHits: _pathCacheHits,
    cacheSize: _roomTypeFlowFields.size + _roomFlowFields.size,
    bfsCalls: _bfsCalls,
    bfsFound: _bfsFound,
    bfsMiss: _bfsMiss,
    bfsLimitHits: _bfsLimitHits,
    bfsVisited: _bfsVisited,
  };
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

const _macroPassableMasks = new Uint8Array(65536);

function _initMacroPassableMasks() {
  for (let m = 0; m < 65536; m++) {
    const grid: number[][] = [
      [(m & 0x0001) !== 0 ? 1 : 0, (m & 0x0002) !== 0 ? 1 : 0, (m & 0x0004) !== 0 ? 1 : 0, (m & 0x0008) !== 0 ? 1 : 0],
      [(m & 0x0010) !== 0 ? 1 : 0, (m & 0x0020) !== 0 ? 1 : 0, (m & 0x0040) !== 0 ? 1 : 0, (m & 0x0080) !== 0 ? 1 : 0],
      [(m & 0x0100) !== 0 ? 1 : 0, (m & 0x0200) !== 0 ? 1 : 0, (m & 0x0400) !== 0 ? 1 : 0, (m & 0x0800) !== 0 ? 1 : 0],
      [(m & 0x1000) !== 0 ? 1 : 0, (m & 0x2000) !== 0 ? 1 : 0, (m & 0x4000) !== 0 ? 1 : 0, (m & 0x8000) !== 0 ? 1 : 0]
    ];
    let blocked = false;
    const visited = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      const x = i % 4;
      const y = Math.floor(i / 4);
      if (grid[y][x] === 1 && visited[i] === 0) {
        let touchesTop = false;
        let touchesBottom = false;
        let touchesLeft = false;
        let touchesRight = false;
        const q = [i];
        visited[i] = 1;
        let head = 0;
        while (head < q.length) {
          const cur = q[head++];
          const cx = cur % 4;
          const cy = Math.floor(cur / 4);
          if (cy === 0) touchesTop = true;
          if (cy === 3) touchesBottom = true;
          if (cx === 0) touchesLeft = true;
          if (cx === 3) touchesRight = true;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < 4 && ny >= 0 && ny < 4) {
                const ni = ny * 4 + nx;
                if (grid[ny][nx] === 1 && visited[ni] === 0) {
                  visited[ni] = 1;
                  q.push(ni);
                }
              }
            }
          }
        }
        if ((touchesTop && touchesBottom) || (touchesLeft && touchesRight)) {
          blocked = true;
          break;
        }
      }
    }
    _macroPassableMasks[m] = blocked ? 0 : 1;
  }
}
_initMacroPassableMasks();

function getPathBlockerMask16(world: World, ci: number): number {
  const offset = ci * PATH_BLOCKER_BYTES_PER_CELL;
  const r0 = world.pathBlockers[offset] || 0;
  const r1 = world.pathBlockers[offset + 1] || 0;
  const r2 = world.pathBlockers[offset + 2] || 0;
  const r3 = world.pathBlockers[offset + 3] || 0;
  return (r0) | (r1 << 4) | (r2 << 8) | (r3 << 12);
}

function isMacroCellPassable(world: World, ci: number, c: number): boolean {
  if (c !== Cell.FLOOR && c !== Cell.WATER && c !== Cell.DOOR) return false;
  if (c === Cell.DOOR) {
    const door = world.doors.get(ci);
    if (door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED)) return false;
  }
  const mask = getPathBlockerMask16(world, ci);
  if (mask !== 0 && _macroPassableMasks[mask] === 0) return false;
  return true;
}

function getMacroDir(out: Uint8Array, cell: number): number {
  const byte = out[cell >> 1];
  return (cell & 1) ? (byte >> 4) : (byte & 0x0F);
}

function setMacroDir(out: Uint8Array, cell: number, dir: number): void {
  const idx = cell >> 1;
  const byte = out[idx];
  if (cell & 1) {
    out[idx] = (byte & 0x0F) | (dir << 4);
  } else {
    out[idx] = (byte & 0xF0) | dir;
  }
}

function bakeMacroFlowField(world: World, sources: number[], out: Uint8Array): void {
  out.fill(0); // 0 is DIR_UNREACHED
  let head = 0;
  let tail = 0;
  
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (_macroPassable[s]) {
      setMacroDir(out, s, DIR_ROOT);
      _navQueue[tail++] = s;
    }
  }

  while (head < tail) {
    const cur = _navQueue[head++];
    const cx = cur % W;
    const cy = (cur / W) | 0;

    const nW = cy * W + (cx === 0 ? W - 1 : cx - 1);
    const nE = cy * W + (cx === W - 1 ? 0 : cx + 1);
    const nN = (cy === 0 ? W - 1 : cy - 1) * W + cx;
    const nS = (cy === W - 1 ? 0 : cy + 1) * W + cx;

    if (_macroPassable[nW] && getMacroDir(out, nW) === DIR_UNREACHED) {
      setMacroDir(out, nW, DIR_E);
      _navQueue[tail++] = nW;
    }
    if (_macroPassable[nE] && getMacroDir(out, nE) === DIR_UNREACHED) {
      setMacroDir(out, nE, DIR_W);
      _navQueue[tail++] = nE;
    }
    if (_macroPassable[nN] && getMacroDir(out, nN) === DIR_UNREACHED) {
      setMacroDir(out, nN, DIR_S);
      _navQueue[tail++] = nN;
    }
    if (_macroPassable[nS] && getMacroDir(out, nS) === DIR_UNREACHED) {
      setMacroDir(out, nS, DIR_N);
      _navQueue[tail++] = nS;
    }
  }
  _bfsVisited += tail;
  _bfsCalls++;
}

export function bakeNavigationTree(
  world: World,
  cacheCellVersion = world.cellVersion,
  cachePathBlockerVersion = world.pathBlockerVersion,
): void {
  _navWorld = world;
  _navCellVersion = cacheCellVersion;
  _navPathBlockerVersion = cachePathBlockerVersion;

  for (let i = 0; i < MACRO_W2; i++) {
    _macroPassable[i] = isMacroCellPassable(world, i, world.cells[i]) ? 1 : 0;
  }

  _roomTypeFlowFields.clear();
  _roomFlowFields.clear();

  const roomTypeSources = new Map<RoomType, number[]>();
  for (const r of world.rooms) {
    if (!roomTypeSources.has(r.type)) roomTypeSources.set(r.type, []);
    roomTypeSources.get(r.type)!.push(...r.cells);
  }

  for (const [type, sources] of roomTypeSources.entries()) {
    const typeField = new Uint8Array(MACRO_W2 / 2);
    bakeMacroFlowField(world, sources, typeField);
    _roomTypeFlowFields.set(type, typeField);
  }
}

function ensureNavigationTree(world: World): void {
  if (
    _navWorld !== world ||
    _navCellVersion !== world.cellVersion ||
    _navPathBlockerVersion !== world.pathBlockerVersion
  ) {
    bakeNavigationTree(world);
  }
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
    _roomTypeFlowFields.clear();
    _roomFlowFields.clear();
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
  _roomTypeFlowFields.clear();
  _roomFlowFields.clear();
}

function dynamicMacroBfs(mStart: number, mEnd: number): number[] {
  _dynamicNavMarkId++;
  _bfsCalls++;
  let head = 0;
  let tail = 0;
  
  _dynamicNavQueue[tail++] = mEnd;
  _dynamicNavMark[mEnd] = _dynamicNavMarkId;
  _dynamicNavParent[mEnd] = -1;

  let found = false;
  while (head < tail) {
    const cur = _dynamicNavQueue[head++];
    if (cur === mStart) {
      found = true;
      break;
    }

    const cx = cur % W;
    const cy = (cur / W) | 0;

    const nW = cy * W + (cx === 0 ? W - 1 : cx - 1);
    const nE = cy * W + (cx === W - 1 ? 0 : cx + 1);
    const nN = (cy === 0 ? W - 1 : cy - 1) * W + cx;
    const nS = (cy === W - 1 ? 0 : cy + 1) * W + cx;

    if (_macroPassable[nW] && _dynamicNavMark[nW] !== _dynamicNavMarkId) {
      _dynamicNavMark[nW] = _dynamicNavMarkId;
      _dynamicNavParent[nW] = cur;
      _dynamicNavQueue[tail++] = nW;
    }
    if (_macroPassable[nE] && _dynamicNavMark[nE] !== _dynamicNavMarkId) {
      _dynamicNavMark[nE] = _dynamicNavMarkId;
      _dynamicNavParent[nE] = cur;
      _dynamicNavQueue[tail++] = nE;
    }
    if (_macroPassable[nN] && _dynamicNavMark[nN] !== _dynamicNavMarkId) {
      _dynamicNavMark[nN] = _dynamicNavMarkId;
      _dynamicNavParent[nN] = cur;
      _dynamicNavQueue[tail++] = nN;
    }
    if (_macroPassable[nS] && _dynamicNavMark[nS] !== _dynamicNavMarkId) {
      _dynamicNavMark[nS] = _dynamicNavMarkId;
      _dynamicNavParent[nS] = cur;
      _dynamicNavQueue[tail++] = nS;
    }
  }

  _bfsVisited += tail;

  if (!found) return [];

  const path: number[] = [];
  let curr = mStart;
  while (curr !== -1) {
    curr = _dynamicNavParent[curr];
    if (curr === -1) break;
    const cx = curr % W;
    const cy = (curr / W) | 0;
    const subX = cx * PATH_BLOCKER_SUBDIV + Math.floor(PATH_BLOCKER_SUBDIV / 2);
    const subY = cy * PATH_BLOCKER_SUBDIV + Math.floor(PATH_BLOCKER_SUBDIV / 2);
    path.push(subY * SW + subX);
  }
  return path;
}

export function bfsPath(world: World, sx: number, sy: number, ex: number, ey: number): number[] {
  sx = world.wrap(sx); sy = world.wrap(sy);
  ex = world.wrap(ex); ey = world.wrap(ey);
  if (sx === ex && sy === ey) return [];

  ensureNavigationTree(world);
  const startSubcell = subcellIdx(sx, sy);
  const mStart = subcellToCell(startSubcell);
  const targetSubcell = subcellIdx(ex, ey);
  const mEnd = subcellToCell(targetSubcell);
  
  if (mStart === mEnd) return [targetSubcell];
  
  const path = dynamicMacroBfs(mStart, mEnd);
  if (path.length > 0) {
    path[path.length - 1] = targetSubcell;
  }
  return path;
}

function buildPathFromPackedMacroField(startSubcell: number, targetSubcell: number, field: Uint8Array): number[] {
  let cell = subcellToCell(startSubcell);
  const path: number[] = [];
  
  while (path.length < PATH_CHUNK_LIMIT) {
    const dir = getMacroDir(field, cell);
    if (dir === DIR_UNREACHED) return []; 
    if (dir === DIR_ROOT) {
      if (targetSubcell >= 0) {
        path.push(targetSubcell);
      } else {
        const cx = cell % W;
        const cy = (cell / W) | 0;
        const subX = cx * PATH_BLOCKER_SUBDIV + Math.floor(PATH_BLOCKER_SUBDIV / 2);
        const subY = cy * PATH_BLOCKER_SUBDIV + Math.floor(PATH_BLOCKER_SUBDIV / 2);
        path.push(subY * SW + subX);
      }
      break;
    }

    const cx = cell % W;
    const cy = (cell / W) | 0;
    
    if (dir === DIR_E) cell = cy * W + (cx === W - 1 ? 0 : cx + 1);
    else if (dir === DIR_W) cell = cy * W + (cx === 0 ? W - 1 : cx - 1);
    else if (dir === DIR_S) cell = (cy === W - 1 ? 0 : cy + 1) * W + cx;
    else if (dir === DIR_N) cell = (cy === 0 ? W - 1 : cy - 1) * W + cx;

    const nCx = cell % W;
    const nCy = (cell / W) | 0;
    const subX = nCx * PATH_BLOCKER_SUBDIV + Math.floor(PATH_BLOCKER_SUBDIV / 2);
    const subY = nCy * PATH_BLOCKER_SUBDIV + Math.floor(PATH_BLOCKER_SUBDIV / 2);
    path.push(subY * SW + subX);
  }
  return path;
}

function tryAssignPathToCell(world: World, e: Entity, targetX: number, targetY: number): AssignPathStatus {
  ensureNavigationTree(world);
  const startSubcell = subcellIdx(e.x, e.y);
  const mStart = subcellToCell(startSubcell);
  const targetSubcell = subcellIdx(targetX, targetY);
  const mEnd = subcellToCell(targetSubcell);
  
  if (mStart === mEnd) {
    _steeringPathAssignments.set(e, {
      world,
      cellVersion: world.cellVersion,
      pathBlockerVersion: world.pathBlockerVersion,
      target: targetSubcell,
      path: [targetSubcell],
      pi: 0
    });
    return 'assigned';
  }

  const existing = _steeringPathAssignments.get(e);
  if (
    existing &&
    existing.world === world &&
    existing.cellVersion === world.cellVersion &&
    existing.pathBlockerVersion === world.pathBlockerVersion &&
    existing.target === targetSubcell
  ) {
    if (existing.pi < existing.path.length) return 'same';
  }

  const path = dynamicMacroBfs(mStart, mEnd);
  if (path.length === 0) return 'not_found';
  
  path[path.length - 1] = targetSubcell;

  _steeringPathAssignments.set(e, {
    world,
    cellVersion: world.cellVersion,
    pathBlockerVersion: world.pathBlockerVersion,
    target: targetSubcell,
    path: path,
    pi: 0
  });
  return 'assigned';
}

function ensureRoomFlowField(world: World, roomId: number): Uint8Array {
  if (_roomFlowFields.has(roomId)) {
    const field = _roomFlowFields.get(roomId)!;
    // LRU logic: re-insert to move to end
    _roomFlowFields.delete(roomId);
    _roomFlowFields.set(roomId, field);
    return field;
  }
  
  const room = world.rooms[roomId];
  if (!room) {
    const empty = new Uint8Array(MACRO_W2 / 2);
    _roomFlowFields.set(roomId, empty);
    return empty;
  }
  
  const field = new Uint8Array(MACRO_W2 / 2);
  bakeMacroFlowField(world, room.cells, field);
  _roomFlowFields.set(roomId, field);
  
  if (_roomFlowFields.size > 50) {
    const firstKey = _roomFlowFields.keys().next().value;
    _roomFlowFields.delete(firstKey);
  }
  
  return field;
}

export function gotoNearestRoomType(world: World, e: Entity, type: RoomType): boolean {
  return gotoNearestRoomOfTypes(world, e, [type]);
}

export function gotoNearestRoomOfTypes(world: World, e: Entity, types: readonly RoomType[]): boolean {
  ensureNavigationTree(world);
  _routinePathUsed++;

  // Collect cells from all specified types
  const combinedSources: number[] = [];
  for (const type of types) {
    const typeField = _roomTypeFlowFields.get(type);
    if (!typeField) continue;
    // Actually we can't easily merge already baked fields.
    // If it's a single type, use the baked field directly!
    if (types.length === 1) {
      return assignPathFromField(world, e, typeField, \`type_\${type}\`);
    }
  }

  // If multiple types requested, we can either:
  // 1. Bake a combined field on the fly.
  // 2. OR just dynamically BFS for them.
  // Since \`gotoNearestRoomOfTypes\` is sometimes called with [OFFICE, LIVING],
  // let's just do a dynamic macro BFS to the closest room of these types.
  
  // Collect all cells of these types
  for (const r of world.rooms) {
    if (types.includes(r.type)) combinedSources.push(...r.cells);
  }
  
  if (combinedSources.length === 0) {
    _routinePathDenied++;
    return false;
  }
  
  // Just bake a temporary field and use it
  const tempField = new Uint8Array(MACRO_W2 / 2);
  bakeMacroFlowField(world, combinedSources, tempField);
  return assignPathFromField(world, e, tempField, 'temp_types');
}

export function gotoRoom(world: World, e: Entity, targetRoomId: number): AssignPathStatus {
  ensureNavigationTree(world);
  if (targetRoomId < 0) return 'not_found';
  
  const field = ensureRoomFlowField(world, targetRoomId);
  if (assignPathFromField(world, e, field, \`room_\${targetRoomId}\`)) {
    return 'assigned';
  }
  return 'not_found';
}

function assignPathFromField(world: World, e: Entity, field: Uint8Array, key: string): boolean {
  const startSubcell = subcellIdx(e.x, e.y);
  const mStart = subcellToCell(startSubcell);
  
  const dir = getMacroDir(field, mStart);
  if (dir === DIR_UNREACHED) return false;
  
  const existing = _steeringPathAssignments.get(e);
  // We can't easily verify if target is the same, so just check key.
  // We will store key in SteeringPathAssignment.
  if (
    existing &&
    existing.world === world &&
    existing.cellVersion === world.cellVersion &&
    existing.pathBlockerVersion === world.pathBlockerVersion &&
    (existing as any).key === key
  ) {
    if (existing.pi < existing.path.length) return true;
  }

  const path = buildPathFromPackedMacroField(startSubcell, -1, field);
  if (path.length === 0 && dir !== DIR_ROOT) return false;
  
  const assignment: any = {
    world,
    cellVersion: world.cellVersion,
    pathBlockerVersion: world.pathBlockerVersion,
    target: path.length > 0 ? path[path.length - 1] : startSubcell,
    path,
    pi: 0,
    key
  };
  
  _steeringPathAssignments.set(e, assignment);
  return true;
}

`;

fs.writeFileSync('scratch/ai_pathfinding_part1.ts', code);
console.log("Part 1 written.");
