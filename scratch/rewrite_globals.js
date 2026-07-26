const fs = require('fs');

let content = fs.readFileSync('src/systems/ai/pathfinding.ts', 'utf8');

const regexGlobals = /\/\* ── Baked navigation tree[\s\S]*?const _roomTypeSourceProviders = new Map<string, BehaviorFlowFieldSourceProvider>\(\);/m;

const newGlobals = `/* ── Baked Packed Macro Flow Fields ── */

const PATH_CHUNK_LIMIT = 1048576;
const PATH_WAYPOINT_REACH = 0.18;
const PATH_WAYPOINT_REACH_SQ = PATH_WAYPOINT_REACH * PATH_WAYPOINT_REACH;
const ROUTINE_WANDER_ATTEMPTS = 4;
const ROUTINE_FAR_ATTEMPTS = 5;

// Subcell definitions
const SW = W * PATH_BLOCKER_SUBDIV;
const SW2 = SW * SW;

// Macro definitions
const MACRO_W2 = W * W;
const DIR_UNREACHED = 0;
const DIR_N = 1;
const DIR_S = 2;
const DIR_W = 3;
const DIR_E = 4;
const DIR_ROOT = 5;

// Shared queue for dynamic short-range BFS
const _dynamicNavQueue = new Int32Array(MACRO_W2);
const _dynamicNavParent = new Int32Array(MACRO_W2);
const _dynamicNavMark = new Uint32Array(MACRO_W2);
let _dynamicNavMarkId = 1;

// Maps for baked fields
const _roomTypeFlowFields = new Map<RoomType, Uint8Array>();
const _roomFlowFields = new Map<number, Uint8Array>();
const _navComponent = new Int32Array(MACRO_W2);

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
`;

content = content.replace(regexGlobals, newGlobals);
fs.writeFileSync('src/systems/ai/pathfinding.ts', content);
console.log("Globals replaced.");
