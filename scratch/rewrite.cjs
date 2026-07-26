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

// 1. Replace constants and memory
const memStart = `const TREES_COUNT = 128;`;
const memEnd = `let _bfsMiss = 0;`;

const newMem = `const MACRO_TREES_COUNT = 64;
const MACRO_W2 = W * W;
const DIR_ROOT = 15;
const DIR_UNREACHED = 0;
const DIR_N = 1;
const DIR_E = 2;
const DIR_S = 3;
const DIR_W = 4;

const _macroFlowFields = Array.from({ length: 32 }, () => new Uint8Array(MACRO_W2));
const _macroQueue = new Int32Array(MACRO_W2);
const _lcaMark = new Uint32Array(MACRO_W2);
let _lcaMarkId = 0;

`;
replaceBlock(memStart, memEnd, newMem + "let _bfsMiss = 0;");

// 2. Add LUT and getMacroDir right before bakeNavigationTree
const bakeStartMarker = `export function bakeNavigationTree(`;

const lutLogic = `
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
    const touchN = new Set<number>();
    const touchS = new Set<number>();
    const touchE = new Set<number>();
    const touchW = new Set<number>();
    
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

function getMacroDir(t: number, cell: number): number {
  const arrayIdx = t >> 1;
  const isHigh = (t & 1) === 1;
  const val = _macroFlowFields[arrayIdx][cell];
  return isHigh ? (val >> 4) : (val & 0x0F);
}

function setMacroDir(t: number, cell: number, dir: number): void {
  const arrayIdx = t >> 1;
  const isHigh = (t & 1) === 1;
  const val = _macroFlowFields[arrayIdx][cell];
  if (isHigh) {
    _macroFlowFields[arrayIdx][cell] = (val & 0x0F) | (dir << 4);
  } else {
    _macroFlowFields[arrayIdx][cell] = (val & 0xF0) | dir;
  }
}

function getMacroParent(m: number, dir: number): number {
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

`;

const startIdx2 = code.indexOf(bakeStartMarker);
code = code.substring(0, startIdx2) + lutLogic + code.substring(startIdx2);

// 3. Replace bakeNavigationTree and ensureNavigationTree
const bakeNavStart = `export function bakeNavigationTree(`;
const bakeNavEnd = `function ensureNavigationTree(`;

const newBakeNav = `export function bakeNavigationTree(
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
      
      const curMask = getMacroMask(world, cur);
      const curLut = MACRO_LUT[curMask];
      const curDir = getMacroDir(t, cur);

      let canExitN = false, canExitE = false, canExitS = false, canExitW = false;
      
      if (curDir === DIR_ROOT) {
         canExitN = (curLut & LUT_TOUCH_N) !== 0;
         canExitE = (curLut & LUT_TOUCH_E) !== 0;
         canExitS = (curLut & LUT_TOUCH_S) !== 0;
         canExitW = (curLut & LUT_TOUCH_W) !== 0;
      } else if (curDir === DIR_N) {
         canExitN = (curLut & LUT_TOUCH_N) !== 0;
         canExitE = (curLut & LUT_CONN_NE) !== 0;
         canExitS = (curLut & LUT_CONN_NS) !== 0;
         canExitW = (curLut & LUT_CONN_NW) !== 0;
      } else if (curDir === DIR_E) {
         canExitN = (curLut & LUT_CONN_NE) !== 0;
         canExitE = (curLut & LUT_TOUCH_E) !== 0;
         canExitS = (curLut & LUT_CONN_ES) !== 0;
         canExitW = (curLut & LUT_CONN_EW) !== 0;
      } else if (curDir === DIR_S) {
         canExitN = (curLut & LUT_CONN_NS) !== 0;
         canExitE = (curLut & LUT_CONN_ES) !== 0;
         canExitS = (curLut & LUT_TOUCH_S) !== 0;
         canExitW = (curLut & LUT_CONN_SW) !== 0;
      } else if (curDir === DIR_W) {
         canExitN = (curLut & LUT_CONN_NW) !== 0;
         canExitE = (curLut & LUT_CONN_EW) !== 0;
         canExitS = (curLut & LUT_CONN_SW) !== 0;
         canExitW = (curLut & LUT_TOUCH_W) !== 0;
      }

      const nN_cx = cx;
      const nN_cy = cy === 0 ? W - 1 : cy - 1;
      const nN = nN_cy * W + nN_cx;
      if (canExitN && getMacroDir(t, nN) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nN);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let x=0; x<4; x++) {
             const cur_pass = (curMask & (1 << (0*4+x))) === 0;
             const n_pass = (nMask & (1 << (3*4+x))) === 0;
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_S)) {
             setMacroDir(t, nN, DIR_S);
             _macroQueue[tail++] = nN;
         }
      }

      const nS_cx = cx;
      const nS_cy = cy === W - 1 ? 0 : cy + 1;
      const nS = nS_cy * W + nS_cx;
      if (canExitS && getMacroDir(t, nS) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nS);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let x=0; x<4; x++) {
             const cur_pass = (curMask & (1 << (3*4+x))) === 0;
             const n_pass = (nMask & (1 << (0*4+x))) === 0;
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_N)) {
             setMacroDir(t, nS, DIR_N);
             _macroQueue[tail++] = nS;
         }
      }

      const nE_cx = cx === W - 1 ? 0 : cx + 1;
      const nE_cy = cy;
      const nE = nE_cy * W + nE_cx;
      if (canExitE && getMacroDir(t, nE) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nE);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let y=0; y<4; y++) {
             const cur_pass = (curMask & (1 << (y*4+3))) === 0;
             const n_pass = (nMask & (1 << (y*4+0))) === 0;
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_W)) {
             setMacroDir(t, nE, DIR_W);
             _macroQueue[tail++] = nE;
         }
      }

      const nW_cx = cx === 0 ? W - 1 : cx - 1;
      const nW_cy = cy;
      const nW = nW_cy * W + nW_cx;
      if (canExitW && getMacroDir(t, nW) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nW);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let y=0; y<4; y++) {
             const cur_pass = (curMask & (1 << (y*4+0))) === 0;
             const n_pass = (nMask & (1 << (y*4+3))) === 0;
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_E)) {
             setMacroDir(t, nW, DIR_E);
             _macroQueue[tail++] = nW;
         }
      }
    }
  }
}

`;
replaceBlock(bakeNavStart, bakeNavEnd, newBakeNav);

// 4. Replace path reconstruction logic
const buildPathStart = `function getLcaPathLength(t: number, start: number, end: number): number {`;
const buildPathEnd = `function buildFlowFieldPath(`;

const newBuildPath = `function getLcaPathLength(t: number, start: number, end: number): number {
  return 0; // Not used
}

export function getAcousticDistance(_world: World, x0: number, y0: number, x1: number, y1: number): number {
  const s0 = subcellIdx(x0, y0);
  const s1 = subcellIdx(x1, y1);
  if (s0 === s1) return 0;

  const mStart = Math.floor((s0 % SW) / 4) + Math.floor((s0 / SW) / 4) * W;
  const mEnd = Math.floor((s1 % SW) / 4) + Math.floor((s1 / SW) / 4) * W;

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

function constructPathFromTree(t: number, mStart: number, mEnd: number, world: World): number[] {
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
    
    if (i < forward.length - 1) {
       const nextM = forward[i+1];
       const ncx = nextM % W;
       const ncy = Math.floor(nextM / W);
       
       let borderSx = cx * 4 + 2;
       let borderSy = cy * 4 + 2;
       let nBorderSx = ncx * 4 + 2;
       let nBorderSy = ncy * 4 + 2;
       
       if (ncy === cy - 1 || (cy === 0 && ncy === W-1)) {
           // N
           for(let x=0; x<4; x++) {
               if(isSubcellNavPassable(world, (cy*4)*SW + cx*4+x) && isSubcellNavPassable(world, (ncy*4+3)*SW + ncx*4+x)) {
                   borderSx = cx*4+x; borderSy = cy*4;
                   nBorderSx = ncx*4+x; nBorderSy = ncy*4+3;
                   break;
               }
           }
       } else if (ncy === cy + 1 || (cy === W-1 && ncy === 0)) {
           // S
           for(let x=0; x<4; x++) {
               if(isSubcellNavPassable(world, (cy*4+3)*SW + cx*4+x) && isSubcellNavPassable(world, (ncy*4)*SW + ncx*4+x)) {
                   borderSx = cx*4+x; borderSy = cy*4+3;
                   nBorderSx = ncx*4+x; nBorderSy = ncy*4;
                   break;
               }
           }
       } else if (ncx === cx + 1 || (cx === W-1 && ncx === 0)) {
           // E
           for(let y=0; y<4; y++) {
               if(isSubcellNavPassable(world, (cy*4+y)*SW + cx*4+3) && isSubcellNavPassable(world, (ncy*4+y)*SW + ncx*4)) {
                   borderSx = cx*4+3; borderSy = cy*4+y;
                   nBorderSx = ncx*4; nBorderSy = ncy*4+y;
                   break;
               }
           }
       } else if (ncx === cx - 1 || (cx === 0 && ncx === W-1)) {
           // W
           for(let y=0; y<4; y++) {
               if(isSubcellNavPassable(world, (cy*4+y)*SW + cx*4) && isSubcellNavPassable(world, (ncy*4+y)*SW + ncx*4+3)) {
                   borderSx = cx*4; borderSy = cy*4+y;
                   nBorderSx = ncx*4+3; nBorderSy = ncy*4+y;
                   break;
               }
           }
       }
       
       subcellPath.push(borderSy * SW + borderSx);
       subcellPath.push(nBorderSy * SW + nBorderSx);
    } else if (forward.length === 1) {
       let bestSx = cx * 4 + 2;
       let bestSy = cy * 4 + 2;
       if (!isSubcellNavPassable(world, bestSy * SW + bestSx)) {
         let found = false;
         for (let dy = 0; dy < 4 && !found; dy++) {
           for (let dx = 0; dx < 4 && !found; dx++) {
             const sx = cx * 4 + dx;
             const sy = cy * 4 + dy;
             if (isSubcellNavPassable(world, sy * SW + sx)) {
               bestSx = sx;
               bestSy = sy;
               found = true;
             }
           }
         }
       }
       subcellPath.push(bestSy * SW + bestSx);
    }
  }

  return subcellPath;
}

function buildBakedTreePath(world: World, start: number, end: number): number[] {
  ensureNavigationTree(world);
  if (start === end) return [];

  const mStart = Math.floor((start % SW) / 4) + Math.floor((start / SW) / 4) * W;
  const mEnd = Math.floor((end % SW) / 4) + Math.floor((end / SW) / 4) * W;

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
  const subcellPath = constructPathFromTree(bestTree, mStart, mEnd, world);
  if (subcellPath.length > 0) {
    subcellPath[subcellPath.length - 1] = end;
  }
  return subcellPath;
}

`;
replaceBlock(buildPathStart, buildPathEnd, newBuildPath);

fs.writeFileSync(path, code);
console.log("Rewritten correctly.");
