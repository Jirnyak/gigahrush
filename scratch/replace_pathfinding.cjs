const fs = require('fs');

const path = '/Users/jirnyak/Mirror/gigahrush/src/systems/ai/pathfinding.ts';
let code = fs.readFileSync(path, 'utf8');

function replaceBlock(startMarker, endMarker, newContent) {
    const startIndex = code.indexOf(startMarker);
    if (startIndex === -1) throw new Error("Start marker not found: " + startMarker.substring(0, 50));
    
    const endIndex = code.indexOf(endMarker, startIndex);
    if (endIndex === -1) throw new Error("End marker not found: " + endMarker.substring(0, 50));
    
    const before = code.substring(0, startIndex);
    const after = code.substring(endIndex);
    
    code = before + newContent + after;
}

const arraysStart = `const TREES_COUNT = 4;`;
const arraysEnd = `const _navComponent = new Int32Array(SW2);`;

const newArrays = `const MACRO_TREES_COUNT = 64;
const MACRO_W2 = W * W;
const _macroFlowFields = Array.from({ length: 32 }, () => new Uint8Array(MACRO_W2));
const _macroQueue = new Int32Array(MACRO_W2 * 2);

const DIR_UNREACHED = 0;
const DIR_N = 1;
const DIR_E = 2;
const DIR_S = 3;
const DIR_W = 4;
const DIR_ROOT = 5;

const _lcaMark = new Uint32Array(MACRO_W2);
let _lcaMarkId = 1;

function setMacroDir(t: number, cell: number, dir: number) {
  const arrayIdx = t >> 1;
  const isHigh = (t & 1) === 1;
  const arr = _macroFlowFields[arrayIdx];
  if (isHigh) {
    arr[cell] = (arr[cell] & 0x0F) | (dir << 4);
  } else {
    arr[cell] = (arr[cell] & 0xF0) | dir;
  }
}

function getMacroDir(t: number, cell: number): number {
  const arrayIdx = t >> 1;
  const isHigh = (t & 1) === 1;
  const val = _macroFlowFields[arrayIdx][cell];
  return isHigh ? (val >> 4) : (val & 0x0F);
}

function isMacroCellPassable(world: World, cx: number, cy: number): boolean {
  const ci = cy * W + cx;
  if (world.cells[ci] & Cell.WALL_BIT) return false;
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      const sx = cx * 4 + dx;
      const sy = cy * 4 + dy;
      if (isSubcellNavPassable(world, sy * SW + sx)) return true;
    }
  }
  return false;
}

const _navComponent = new Int32Array(SW2);
`;
replaceBlock(arraysStart, arraysEnd + '\n', newArrays);

const bakeStart = `export function bakeNavigationTree(`;
const bakeEnd = `function ensureNavigationTree(`;

const newBake = `export function bakeNavigationTree(
  world: World,
  cacheCellVersion = world.cellVersion,
  cachePathBlockerVersion = world.pathBlockerVersion,
): void {
  _bfsCalls++;
  for (let i = 0; i < 32; i++) {
    _macroFlowFields[i].fill(0);
  }
  _navWorld = world;
  _navCellVersion = cacheCellVersion;
  _navPathBlockerVersion = cachePathBlockerVersion;

  for (let t = 0; t < MACRO_TREES_COUNT; t++) {
    const ax = (t % 8) * 128 + 64;
    const ay = Math.floor(t / 8) * 128 + 64;
    const root = ay * W + ax;

    let head = 0;
    let tail = 0;
    
    setMacroDir(t, root, DIR_ROOT);
    _macroQueue[tail++] = root;

    while (head !== tail) {
      const cur = _macroQueue[head++];
      const cx = cur % W;
      const cy = Math.floor(cur / W);

      const nW = cy * W + (cx === 0 ? W - 1 : cx - 1);
      const nE = cy * W + (cx === W - 1 ? 0 : cx + 1);
      const nN = (cy === 0 ? W - 1 : cy - 1) * W + cx;
      const nS = (cy === W - 1 ? 0 : cy + 1) * W + cx;

      if (getMacroDir(t, nW) === DIR_UNREACHED && isMacroCellPassable(world, cx === 0 ? W - 1 : cx - 1, cy)) {
        setMacroDir(t, nW, DIR_E);
        _macroQueue[tail++] = nW;
      }
      if (getMacroDir(t, nE) === DIR_UNREACHED && isMacroCellPassable(world, cx === W - 1 ? 0 : cx + 1, cy)) {
        setMacroDir(t, nE, DIR_W);
        _macroQueue[tail++] = nE;
      }
      if (getMacroDir(t, nN) === DIR_UNREACHED && isMacroCellPassable(world, cx, cy === 0 ? W - 1 : cy - 1)) {
        setMacroDir(t, nN, DIR_S);
        _macroQueue[tail++] = nN;
      }
      if (getMacroDir(t, nS) === DIR_UNREACHED && isMacroCellPassable(world, cx, cy === W - 1 ? 0 : cy + 1)) {
        setMacroDir(t, nS, DIR_N);
        _macroQueue[tail++] = nS;
      }
    }
  }
}

`;
replaceBlock(bakeStart, bakeEnd, newBake);

const getLcaStart = `function getLcaPathLength(`;
const getLcaEnd = `function buildFlowFieldPath(`;

const newGetLca = `function getMacroParent(m: number, dir: number): number {
  const cx = m % W;
  const cy = Math.floor(m / W);
  if (dir === DIR_N) return (cy === 0 ? W - 1 : cy - 1) * W + cx;
  if (dir === DIR_S) return (cy === W - 1 ? 0 : cy + 1) * W + cx;
  if (dir === DIR_E) return cy * W + (cx === W - 1 ? 0 : cx + 1);
  if (dir === DIR_W) return cy * W + (cx === 0 ? W - 1 : cx - 1);
  return -1;
}

function getMacroLca(t: number, mStart: number, mEnd: number): number {
  _lcaMarkId++;
  if (_lcaMarkId > 2000000000) {
    _lcaMark.fill(0);
    _lcaMarkId = 1;
  }
  
  let curr = mStart;
  let steps = 0;
  while (curr !== -1 && steps < 2000) {
    _lcaMark[curr] = _lcaMarkId;
    const dir = getMacroDir(t, curr);
    if (dir === DIR_ROOT || dir === DIR_UNREACHED) {
      if (dir === DIR_ROOT) _lcaMark[curr] = _lcaMarkId;
      break;
    }
    curr = getMacroParent(curr, dir);
    steps++;
  }

  curr = mEnd;
  steps = 0;
  while (curr !== -1 && steps < 2000) {
    if (_lcaMark[curr] === _lcaMarkId) return curr;
    const dir = getMacroDir(t, curr);
    if (dir === DIR_ROOT || dir === DIR_UNREACHED) break;
    curr = getMacroParent(curr, dir);
    steps++;
  }
  if (_lcaMark[curr] === _lcaMarkId) return curr;
  return -1;
}

function constructPathFromTree(t: number, mStart: number, mEnd: number): number[] {
  const lca = getMacroLca(t, mStart, mEnd);
  if (lca === -1) return [];

  const forward = [];
  const reverse = [];

  let curr = mStart;
  let steps = 0;
  while (curr !== lca && steps < 2000) {
    forward.push(curr);
    curr = getMacroParent(curr, getMacroDir(t, curr));
    steps++;
  }
  
  curr = mEnd;
  steps = 0;
  while (curr !== lca && steps < 2000) {
    reverse.push(curr);
    curr = getMacroParent(curr, getMacroDir(t, curr));
    steps++;
  }

  forward.push(lca);
  for (let i = reverse.length - 1; i >= 0; i--) {
    forward.push(reverse[i]);
  }

  const subcellPath = [];
  for (let i = 0; i < forward.length; i++) {
    const m = forward[i];
    const cx = m % W;
    const cy = Math.floor(m / W);
    const sx = cx * 4 + 2;
    const sy = cy * 4 + 2;
    subcellPath.push(sy * SW + sx);
  }

  return subcellPath;
}

function buildBakedTreePath(world: World, start: number, end: number): number[] {
  ensureNavigationTree(world);
  if (start === end) return [];

  const mStart = Math.floor((start / SW) / 4) * W + Math.floor((start % SW) / 4);
  const mEnd = Math.floor((end / SW) / 4) * W + Math.floor((end % SW) / 4);

  let bestTree = -1;
  let minPathLen = Infinity;

  for (let t = 0; t < MACRO_TREES_COUNT; t++) {
    if (getMacroDir(t, mStart) === DIR_UNREACHED || getMacroDir(t, mEnd) === DIR_UNREACHED) continue;
    
    const lca = getMacroLca(t, mStart, mEnd);
    if (lca === -1) continue;

    let lenA = 0;
    let curr = mStart;
    while (curr !== lca && lenA < 2000) {
      curr = getMacroParent(curr, getMacroDir(t, curr));
      lenA++;
    }

    let lenB = 0;
    curr = mEnd;
    while (curr !== lca && lenB < 2000) {
      curr = getMacroParent(curr, getMacroDir(t, curr));
      lenB++;
    }

    const len = lenA + lenB;
    if (len < minPathLen) {
      minPathLen = len;
      bestTree = t;
    }
  }

  if (bestTree < 0) {
    _bfsMiss++;
    return [];
  }

  _bfsFound++;
  const subcellPath = constructPathFromTree(bestTree, mStart, mEnd);
  if (subcellPath.length > 0) {
    subcellPath[subcellPath.length - 1] = end;
  }
  return subcellPath;
}

`;

replaceBlock(getLcaStart, getLcaEnd, newGetLca);

const acStart = `export function getAcousticDistance(`;
const acEnd = `function constructPathFromTree(`;
const newAc = `export function getAcousticDistance(_world: World, x0: number, y0: number, x1: number, y1: number): number {
  const s0 = subcellIdx(x0, y0);
  const s1 = subcellIdx(x1, y1);
  if (s0 === s1) return 0;

  const mStart = Math.floor((s0 / SW) / 4) * W + Math.floor((s0 % SW) / 4);
  const mEnd = Math.floor((s1 / SW) / 4) * W + Math.floor((s1 % SW) / 4);

  let minLen = Infinity;
  for (let t = 0; t < 8; t++) {
    if (getMacroDir(t, mStart) === DIR_UNREACHED || getMacroDir(t, mEnd) === DIR_UNREACHED) continue;
    const lca = getMacroLca(t, mStart, mEnd);
    if (lca === -1) continue;

    let lenA = 0;
    let curr = mStart;
    while (curr !== lca && lenA < 2000) {
      curr = getMacroParent(curr, getMacroDir(t, curr));
      lenA++;
    }

    let lenB = 0;
    curr = mEnd;
    while (curr !== lca && lenB < 2000) {
      curr = getMacroParent(curr, getMacroDir(t, curr));
      lenB++;
    }
    
    if (lenA + lenB < minLen) minLen = lenA + lenB;
  }
  
  if (minLen === Infinity) return Infinity;
  return (minLen * 4) / PATH_BLOCKER_SUBDIV;
}

`;
replaceBlock(acStart, acEnd, newAc);

fs.writeFileSync(path, code);
console.log("Replaced successfully!");
