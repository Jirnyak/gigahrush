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

// Generate the LUT logic string
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
    // 0 is passable, 1 is blocked.
    // 4x4 grid. bit index = y * 4 + x.
    const passable = (x, y) => (mask & (1 << (y * 4 + x))) === 0;
    
    // Find connected components
    const comp = new Int32Array(16).fill(-1);
    let compId = 0;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (passable(x, y) && comp[y * 4 + x] === -1) {
          // BFS to find component
          const q = [y * 4 + x];
          comp[y * 4 + x] = compId;
          let head = 0;
          while (head < q.length) {
            const curr = q[head++];
            const cx = curr % 4;
            const cy = Math.floor(curr / 4);
            // neighbors
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
    // Check touches
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
    
    // Check connections
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
  if (cellC !== Cell.FLOOR && cellC !== Cell.WATER && cellC !== Cell.DOOR) return 65535; // all blocked
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
`;

// Replace `getMacroDir` to `isMacroCellPassable` with LUT logic
const lutStart = `function getMacroDir(t: number, cell: number): number {`;
const lutEnd = `const _navQueue = new Int32Array(SW2);`;

const newLutCode = `function getMacroDir(t: number, cell: number): number {
  const arrayIdx = t >> 1;
  const isHigh = (t & 1) === 1;
  const val = _macroFlowFields[arrayIdx][cell];
  return isHigh ? (val >> 4) : (val & 0x0F);
}

` + lutLogic + `

`;
replaceBlock(lutStart, lutEnd, newLutCode);

// Now rewrite bakeNavigationTree to use the LUT
const bakeStart = `export function bakeNavigationTree(`;
const bakeEnd = `function getMacroParent(`;

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
    
    const rootMask = getMacroMask(world, root);
    // Even if root is not very passable, we MUST mark it ROOT so the tree exists.
    setMacroDir(t, root, DIR_ROOT);
    _macroQueue[tail++] = root;

    while (head !== tail) {
      const cur = _macroQueue[head++];
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      
      const curMask = getMacroMask(world, cur);
      const curLut = MACRO_LUT[curMask];
      const curDir = getMacroDir(t, cur);

      // Which edges of cur can we exit from?
      // If cur is ROOT, we can exit from ANY edge that touches a 0.
      // If cur was entered from DIR_N (meaning parent is N, so we entered from N edge),
      // we can only exit E if LUT_CONN_NE is set, S if LUT_CONN_NS is set, W if LUT_CONN_NW is set.
      let canExitN = false, canExitE = false, canExitS = false, canExitW = false;
      
      if (curDir === DIR_ROOT) {
         canExitN = (curLut & LUT_TOUCH_N) !== 0;
         canExitE = (curLut & LUT_TOUCH_E) !== 0;
         canExitS = (curLut & LUT_TOUCH_S) !== 0;
         canExitW = (curLut & LUT_TOUCH_W) !== 0;
      } else if (curDir === DIR_N) {
         canExitN = (curLut & LUT_TOUCH_N) !== 0; // U-turn? usually not needed but possible if dead end
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

      // Check North neighbor
      const nN_cx = cx;
      const nN_cy = cy === 0 ? W - 1 : cy - 1;
      const nN = nN_cy * W + nN_cx;
      if (canExitN && getMacroDir(t, nN) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nN);
         const nLut = MACRO_LUT[nMask];
         // To enter nN from S, nN must touch S, AND we need physical alignment!
         // Wait, if cur touches N and nN touches S, they MIGHT NOT ALIGN physically!
         // For example cur has 0 at x=0, nN has 0 at x=3. They don't touch!
         // We can do a quick check:
         let align = false;
         for (let x=0; x<4; x++) {
             if (((curMask & (1 << (3*4+x))) === 0) && ((nMask & (1 << (0*4+x))) === 0)) align = true; // Wait, cur N edge is y=0, nN S edge is y=3
         }
         // Let's fix the physical alignment check!
         let aligned = false;
         for (let x=0; x<4; x++) {
             const cur_pass = (curMask & (1 << (0*4+x))) === 0; // cur's N edge
             const n_pass = (nMask & (1 << (3*4+x))) === 0; // nN's S edge
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_S)) {
             setMacroDir(t, nN, DIR_S);
             _macroQueue[tail++] = nN;
         }
      }

      // Check South neighbor
      const nS_cx = cx;
      const nS_cy = cy === W - 1 ? 0 : cy + 1;
      const nS = nS_cy * W + nS_cx;
      if (canExitS && getMacroDir(t, nS) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nS);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let x=0; x<4; x++) {
             const cur_pass = (curMask & (1 << (3*4+x))) === 0; // cur's S edge
             const n_pass = (nMask & (1 << (0*4+x))) === 0; // nS's N edge
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_N)) {
             setMacroDir(t, nS, DIR_N);
             _macroQueue[tail++] = nS;
         }
      }

      // Check East neighbor
      const nE_cx = cx === W - 1 ? 0 : cx + 1;
      const nE_cy = cy;
      const nE = nE_cy * W + nE_cx;
      if (canExitE && getMacroDir(t, nE) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nE);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let y=0; y<4; y++) {
             const cur_pass = (curMask & (1 << (y*4+3))) === 0; // cur's E edge
             const n_pass = (nMask & (1 << (y*4+0))) === 0; // nE's W edge
             if (cur_pass && n_pass) aligned = true;
         }
         if (aligned && (nLut & LUT_TOUCH_W)) {
             setMacroDir(t, nE, DIR_W);
             _macroQueue[tail++] = nE;
         }
      }

      // Check West neighbor
      const nW_cx = cx === 0 ? W - 1 : cx - 1;
      const nW_cy = cy;
      const nW = nW_cy * W + nW_cx;
      if (canExitW && getMacroDir(t, nW) === DIR_UNREACHED) {
         const nMask = getMacroMask(world, nW);
         const nLut = MACRO_LUT[nMask];
         let aligned = false;
         for (let y=0; y<4; y++) {
             const cur_pass = (curMask & (1 << (y*4+0))) === 0; // cur's W edge
             const n_pass = (nMask & (1 << (y*4+3))) === 0; // nW's E edge
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
replaceBlock(bakeStart, bakeEnd, newBake);

// Now fix constructPathFromTree and buildBakedTreePath to pick a valid passable subcell
const buildStart = `function constructPathFromTree(`;
const buildEnd = `function buildBakedTreePath(`; // Wait, buildBakedTreePath is after constructPathFromTree, so the end marker for replacement is export function getAcousticDistance ?
// Let's just do it cleanly

fs.writeFileSync(path, code);
console.log("LUT applied!");
