/* ── Shared maze generation utilities ─────────────────────────── */

import {
  W, Cell, Tex, RoomType, DoorState, Feature,
  ZoneFaction,
  type Room, type Zone,
} from '../core/types';
import { World } from '../core/world';
import { ROOM_DEFS } from '../data/catalog';

/* ── RNG helpers ─────────────────────────────────────────────── */
export const rng  = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
export const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ── 1-wide L-corridor with auto-doors at room walls ─────────── */
export function carveCorridor(world: World, ax: number, ay: number, bx: number, by: number): void {
  const ddx = world.delta(ax, bx);
  const ddy = world.delta(ay, by);
  const stepX = ddx > 0 ? 1 : -1;
  const stepY = ddy > 0 ? 1 : -1;
  const horizFirst = Math.random() < 0.5;
  let cx = ax, cy = ay;

  function step(x: number, y: number): void {
    const i = world.idx(x, y);
    if (world.aptMask[i]) return;  // never carve through apartment cells
    if (world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.DOOR) return;
    if (world.cells[i] !== Cell.WALL) return;

    let adjRoom = -1;
    for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ni = world.idx(world.wrap(x + ox), world.wrap(y + oy));
      if (world.roomMap[ni] >= 0) { adjRoom = world.roomMap[ni]; break; }
    }

    if (adjRoom >= 0) {
      let nearbyDoor = false;
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = world.idx(world.wrap(x + ox), world.wrap(y + oy));
        if (world.cells[ni] === Cell.DOOR) {
          const d = world.doors.get(ni);
          if (d && (d.roomA === adjRoom || d.roomB === adjRoom)) { nearbyDoor = true; break; }
        }
      }
      if (nearbyDoor) {
        return;
      } else {
        world.cells[i] = Cell.DOOR;
        if (!world.doors.has(i)) {
          world.doors.set(i, {
            idx: i, state: DoorState.CLOSED,
            roomA: adjRoom, roomB: -1, keyId: '', timer: 0,
          });
          const room = world.rooms[adjRoom];
          if (room) room.doors.push(i);
        }
      }
    } else {
      world.cells[i] = Cell.FLOOR;
    }
  }

  if (horizFirst) {
    for (let i = 0; i <= Math.abs(ddx); i++) {
      step(cx, cy);
      if (i < Math.abs(ddx)) cx = world.wrap(cx + stepX);
    }
    for (let i = 0; i <= Math.abs(ddy); i++) {
      step(cx, cy);
      if (i < Math.abs(ddy)) cy = world.wrap(cy + stepY);
    }
  } else {
    for (let i = 0; i <= Math.abs(ddy); i++) {
      step(cx, cy);
      if (i < Math.abs(ddy)) cy = world.wrap(cy + stepY);
    }
    for (let i = 0; i <= Math.abs(ddx); i++) {
      step(cx, cy);
      if (i < Math.abs(ddx)) cx = world.wrap(cx + stepX);
    }
  }
}

/* ── Find exit point from room wall toward a target ──────────── */
export function roomExit(world: World, room: Room, tx: number, ty: number):
    { wx: number; wy: number; ox: number; oy: number } {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const dx = world.delta(cx, tx);
  const dy = world.delta(cy, ty);

  if (Math.abs(dx) >= Math.abs(dy)) {
    const ey = world.wrap(room.y + rng(0, room.h - 1));
    if (dx >= 0) {
      const wx = world.wrap(room.x + room.w);
      return { wx, wy: ey, ox: world.wrap(wx + 1), oy: ey };
    } else {
      const wx = world.wrap(room.x - 1);
      return { wx, wy: ey, ox: world.wrap(wx - 1), oy: ey };
    }
  } else {
    const ex = world.wrap(room.x + rng(0, room.w - 1));
    if (dy >= 0) {
      const wy = world.wrap(room.y + room.h);
      return { wx: ex, wy, ox: ex, oy: world.wrap(wy + 1) };
    } else {
      const wy = world.wrap(room.y - 1);
      return { wx: ex, wy, ox: ex, oy: world.wrap(wy - 1) };
    }
  }
}

/* ── Place door at a specific wall cell ──────────────────────── */
export function placeDoorAt(world: World, wx: number, wy: number, roomId: number): void {
  const i = world.idx(wx, wy);
  if (world.aptMask[i]) return;  // never punch doors through apartment walls
  if (world.cells[i] === Cell.DOOR) return;
  if (world.cells[i] !== Cell.WALL) return;
  world.cells[i] = Cell.DOOR;
  if (!world.doors.has(i)) {
    world.doors.set(i, {
      idx: i, state: DoorState.CLOSED,
      roomA: roomId, roomB: -1, keyId: '', timer: 0,
    });
    const room = world.rooms[roomId];
    if (room) room.doors.push(i);
  }
}

/* ── Connect rooms via Prim's MST ────────────────────────────── */
export function connectRoomsMST(world: World, rooms: Room[]): void {
  const n = rooms.length;
  if (n < 2) return;

  const inMST = new Uint8Array(n);
  const minDist = new Float64Array(n).fill(Infinity);
  const minFrom = new Int32Array(n).fill(-1);

  inMST[0] = 1;
  const cx0 = rooms[0].x + rooms[0].w / 2;
  const cy0 = rooms[0].y + rooms[0].h / 2;
  for (let j = 1; j < n; j++) {
    minDist[j] = world.dist(cx0, cy0, rooms[j].x + rooms[j].w / 2, rooms[j].y + rooms[j].h / 2);
    minFrom[j] = 0;
  }

  const mstEdges: [number, number][] = [];
  for (let iter = 0; iter < n - 1; iter++) {
    let best = Infinity;
    let bestIdx = -1;
    for (let j = 0; j < n; j++) {
      if (!inMST[j] && minDist[j] < best) {
        best = minDist[j];
        bestIdx = j;
      }
    }
    if (bestIdx < 0) break;

    inMST[bestIdx] = 1;
    mstEdges.push([minFrom[bestIdx], bestIdx]);

    const cxB = rooms[bestIdx].x + rooms[bestIdx].w / 2;
    const cyB = rooms[bestIdx].y + rooms[bestIdx].h / 2;
    for (let j = 0; j < n; j++) {
      if (inMST[j]) continue;
      const d = world.dist(cxB, cyB, rooms[j].x + rooms[j].w / 2, rooms[j].y + rooms[j].h / 2);
      if (d < minDist[j]) {
        minDist[j] = d;
        minFrom[j] = bestIdx;
      }
    }
  }

  for (const [i, j] of mstEdges) {
    const a = rooms[i], b = rooms[j];
    const exitA = roomExit(world, a, b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2));
    const exitB = roomExit(world, b, a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2));
    placeDoorAt(world, exitA.wx, exitA.wy, a.id);
    placeDoorAt(world, exitB.wx, exitB.wy, b.id);
    carveCorridor(world, exitA.ox, exitA.oy, exitB.ox, exitB.oy);
  }

  const extra = Math.floor(n * 0.12);
  for (let k = 0; k < extra; k++) {
    const ai = rng(0, n - 1), bi = rng(0, n - 1);
    if (ai !== bi) {
      const a = rooms[ai], b = rooms[bi];
      const exitA = roomExit(world, a, b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2));
      const exitB = roomExit(world, b, a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2));
      placeDoorAt(world, exitA.wx, exitA.wy, a.id);
      placeDoorAt(world, exitB.wx, exitB.wy, b.id);
      carveCorridor(world, exitA.ox, exitA.oy, exitB.ox, exitB.oy);
    }
  }
}

/* ── Room overlap check ──────────────────────────────────────── */
export function canPlaceRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(world.wrap(x + dx), world.wrap(y + dy));
      if (world.cells[i] !== Cell.WALL || world.aptMask[i]) return false;
    }
  }
  return true;
}

/* ── Stamp a wall-enclosed room ──────────────────────────────── */
export function stampRoom(world: World, id: number, type: RoomType, x: number, y: number, w: number, h: number, aptId: number): Room {
  const def = ROOM_DEFS[type];
  const room: Room = {
    id, type, x: world.wrap(x), y: world.wrap(y), w, h,
    doors: [], sealed: false,
    name: `${def.name} #${id}`,
    apartmentId: aptId,
    wallTex: def.wallTex,
    floorTex: def.floorTex,
  };
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      world.cells[i] = Cell.WALL;
      world.wallTex[i] = room.wallTex;
      world.roomMap[i] = -1;
    }
  }
  world.carveRect(room.x, room.y, w, h, id);
  world.rooms[id] = room;
  return room;
}

/* ── Place a door between two adjacent rooms (shared wall) ───── */
export function placeDoor(world: World, a: Room, b: Room, keyId: string, hermetic: boolean): void {
  const candidates: number[] = [];
  for (let dy = -1; dy <= a.h; dy++) {
    for (let dx = -1; dx <= a.w; dx++) {
      if (dx >= 0 && dx < a.w && dy >= 0 && dy < a.h) continue;
      const wx = world.wrap(a.x + dx);
      const wy = world.wrap(a.y + dy);
      const ci = world.idx(wx, wy);
      if (world.cells[ci] !== Cell.WALL) continue;
      for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = world.idx(wx + ddx, wy + ddy);
        if (world.roomMap[ni] !== b.id) continue;
        const oi = world.idx(wx - ddx, wy - ddy);
        if (world.roomMap[oi] !== a.id) continue;
        candidates.push(ci);
        break;
      }
    }
  }
  if (candidates.length === 0) return;

  const doorIdx = pick(candidates);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: hermetic ? DoorState.HERMETIC_OPEN : (keyId ? DoorState.LOCKED : DoorState.CLOSED),
    roomA: a.id, roomB: b.id, keyId, timer: 0,
  });
  a.doors.push(doorIdx);
  b.doors.push(doorIdx);
}

/* ── Room decorations ────────────────────────────────────────── */
export function decorateRoom(world: World, room: Room): void {
  const { w, h, type } = room;
  function placeWall(dx: number, dy: number): void {
    const ci = world.idx(world.wrap(room.x + dx), world.wrap(room.y + dy));
    if (world.cells[ci] === Cell.FLOOR) {
      world.cells[ci] = Cell.WALL;
      world.wallTex[ci] = room.wallTex;
    }
  }

  if (type === RoomType.COMMON) {
    const decor = rng(0, 4);
    if (decor === 0 && w >= 8 && h >= 8) {
      const ox = Math.floor(w / 4), oy = Math.floor(h / 4);
      placeWall(ox, oy); placeWall(w - 1 - ox, oy);
      placeWall(ox, h - 1 - oy); placeWall(w - 1 - ox, h - 1 - oy);
    } else if (decor === 1 && w >= 6 && h >= 6) {
      const c1 = Math.floor(w / 3), c2 = w - 1 - c1;
      for (let dy = 2; dy < h - 1; dy += 2) { placeWall(c1, dy); placeWall(c2, dy); }
    } else if (decor === 2 && w >= 10 && h >= 10) {
      if (Math.random() < 0.5) {
        const wy = Math.floor(h / 2), gap = Math.floor(w / 2);
        for (let dx = 2; dx < w - 2; dx++) { if (Math.abs(dx - gap) > 1) placeWall(dx, wy); }
      } else {
        const wx = Math.floor(w / 2), gap = Math.floor(h / 2);
        for (let dy = 2; dy < h - 2; dy++) { if (Math.abs(dy - gap) > 1) placeWall(wx, dy); }
      }
    } else if (decor === 3 && w >= 6 && h >= 6) {
      placeColumns(world, room);
    } else {
      const np = rng(2, Math.min(6, Math.floor(w * h / 20)));
      for (let i = 0; i < np; i++) placeWall(rng(2, Math.max(2, w - 3)), rng(2, Math.max(2, h - 3)));
    }
  } else if (type === RoomType.CORRIDOR && Math.max(w, h) >= 8) {
    if (w > h) {
      const my = Math.floor(h / 2);
      for (let dx = 3; dx < w - 2; dx += 3) placeWall(dx, my);
    } else {
      const mx = Math.floor(w / 2);
      for (let dy = 3; dy < h - 2; dy += 3) placeWall(mx, dy);
    }
  } else if (type === RoomType.PRODUCTION && w >= 6 && h >= 6) {
    for (let dy = 2; dy < h - 2; dy += 4)
      for (let dx = 2; dx < w - 2; dx += 4) placeWall(dx, dy);
  }
}

export function placeColumns(world: World, room: Room): void {
  const spacing = rng(3, 4);
  for (let dy = spacing; dy < room.h - 1; dy += spacing) {
    for (let dx = spacing; dx < room.w - 1; dx += spacing) {
      const ci = world.idx(world.wrap(room.x + dx), world.wrap(room.y + dy));
      if (world.cells[ci] === Cell.FLOOR) {
        world.cells[ci] = Cell.WALL;
        world.wallTex[ci] = room.wallTex;
      }
    }
  }
}

/* ═════════════════════════════════════════════════════════════════
   shapeRoom — reshape a rectangular room's interior into an
   interesting symmetric shape. The bounding-box walls stay; FLOOR
   cells outside the shape become WALL. Applied to volatile rooms
   only (apartments keep their rectangles).

   Shape types (all symmetric on at least one axis):
   0 = rectangle (no change)
   1 = ellipse (symmetric on both axes)
   2 = diamond (symmetric on both axes)
   3 = cross/plus (symmetric on both axes)
   4 = semicircle (symmetric on one axis)
   5 = hexagon (symmetric on both axes)
   6 = capsule (symmetric on both axes)
   7 = chevron (symmetric on one axis)
   ═════════════════════════════════════════════════════════════════ */
const NUM_SHAPES = 8;
export function shapeRoom(world: World, room: Room): void {
  const { w, h } = room;
  if (w < 4 || h < 4) return; // too small to reshape

  const shape = rng(0, NUM_SHAPES - 1);
  if (shape === 0) return; // rectangle — keep as is

  const rx = (w - 1) / 2;
  const ry = (h - 1) / 2;
  const cx = rx; // local center
  const cy = ry;

  function inside(dx: number, dy: number): boolean {
    const nx = dx - cx; // offset from center
    const ny = dy - cy;
    switch (shape) {
      case 1: { // ellipse
        return (nx * nx) / (rx * rx) + (ny * ny) / (ry * ry) <= 1.0;
      }
      case 2: { // diamond
        return Math.abs(nx) / rx + Math.abs(ny) / ry <= 1.0;
      }
      case 3: { // cross
        const armW = rx * 0.38;
        const armH = ry * 0.38;
        return Math.abs(ny) <= armH || Math.abs(nx) <= armW;
      }
      case 4: { // semicircle (flat on one side)
        if (w >= h) { // horizontal: flat left
          return (nx >= 0)
            ? (nx * nx) / (rx * rx) + (ny * ny) / (ry * ry) <= 1.0
            : Math.abs(ny) <= ry;
        } else { // vertical: flat top
          return (ny >= 0)
            ? (nx * nx) / (rx * rx) + (ny * ny) / (ry * ry) <= 1.0
            : Math.abs(nx) <= rx;
        }
      }
      case 5: { // hexagon
        const t = 1.0 - Math.abs(ny) / ry * 0.5;
        return Math.abs(nx) <= rx * t;
      }
      case 6: { // capsule (rect + semicircle ends)
        if (w >= h) {
          const half = Math.max(0, rx - ry);
          const ex = Math.max(0, Math.abs(nx) - half);
          return ex * ex + ny * ny <= ry * ry;
        } else {
          const half = Math.max(0, ry - rx);
          const ey = Math.max(0, Math.abs(ny) - half);
          return nx * nx + ey * ey <= rx * rx;
        }
      }
      case 7: { // chevron/arrow pointing right or down
        const t = 1.0 - Math.abs(ny) / ry;
        return Math.abs(nx) <= Math.max(1, rx * t);
      }
      default: return true;
    }
  }

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      // Keep 1-cell border so door connections stay valid
      if (dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1) continue;
      if (inside(dx, dy)) continue;
      const i = world.idx(world.wrap(room.x + dx), world.wrap(room.y + dy));
      if (world.cells[i] !== Cell.FLOOR || world.aptMask[i]) continue;
      world.cells[i] = Cell.WALL;
      world.wallTex[i] = room.wallTex;
      world.roomMap[i] = -1;
    }
  }
}

export function placeAbyssPits(world: World): void {
  for (let i = 0; i < 200; i++) {
    const px = rng(0, W - 1), py = rng(0, W - 1);
    const pw = rng(2, 6), ph = rng(2, 6);
    let ok = true;
    for (let dy = -1; dy <= ph && ok; dy++)
      for (let dx = -1; dx <= pw && ok; dx++) {
        const ai = world.idx(px + dx, py + dy);
        if (world.cells[ai] !== Cell.WALL || world.aptMask[ai]) ok = false;
      }
    if (!ok) continue;
    for (let dy = 0; dy < ph; dy++)
      for (let dx = 0; dx < pw; dx++)
        world.cells[world.idx(px + dx, py + dy)] = Cell.ABYSS;
  }
}

/* ── Connect a room to nearest existing walkable space ───────── */
export function connectToNetwork(world: World, room: Room): void {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const wx = world.wrap(room.x + dx);
      const wy = world.wrap(room.y + dy);
      const ci = world.idx(wx, wy);
      if (world.cells[ci] !== Cell.WALL || world.aptMask[ci]) continue;

      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = world.wrap(wx + ox), ny = world.wrap(wy + oy);
        const ni = world.idx(nx, ny);
        if (world.cells[ni] !== Cell.FLOOR && world.cells[ni] !== Cell.DOOR) continue;
        if (world.roomMap[ni] === room.id) continue;
        if (world.aptMask[ni]) continue;
        const ix = world.wrap(wx - ox), iy = world.wrap(wy - oy);
        if (world.roomMap[world.idx(ix, iy)] !== room.id) continue;
        placeDoorAt(world, wx, wy, room.id);
        return;
      }
    }
  }

  const sides = shuffle([0, 1, 2, 3]);
  for (const side of sides) {
    let sx: number, sy: number, sdx: number, sdy: number;
    if (side === 0) {
      sx = world.wrap(room.x + rng(0, room.w - 1));
      sy = world.wrap(room.y - 1); sdx = 0; sdy = -1;
    } else if (side === 1) {
      sx = world.wrap(room.x + rng(0, room.w - 1));
      sy = world.wrap(room.y + room.h); sdx = 0; sdy = 1;
    } else if (side === 2) {
      sx = world.wrap(room.x - 1);
      sy = world.wrap(room.y + rng(0, room.h - 1)); sdx = -1; sdy = 0;
    } else {
      sx = world.wrap(room.x + room.w);
      sy = world.wrap(room.y + rng(0, room.h - 1)); sdx = 1; sdy = 0;
    }
    let ex = world.wrap(sx + sdx), ey = world.wrap(sy + sdy);
    const carved: number[] = [];
    let connected = false;
    for (let d = 0; d < 40; d++) {
      const fi = world.idx(ex, ey);
      if (world.aptMask[fi]) break;
      if (world.cells[fi] === Cell.FLOOR || world.cells[fi] === Cell.DOOR) { connected = true; break; }
      if (world.cells[fi] === Cell.WALL) {
        let adj = -1;
        for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const ni = world.idx(world.wrap(ex + ox), world.wrap(ey + oy));
          if (world.roomMap[ni] >= 0 && world.roomMap[ni] !== room.id) { adj = world.roomMap[ni]; break; }
        }
        if (adj >= 0) {
          placeDoorAt(world, ex, ey, adj);
          connected = true;
          break;
        }
        carved.push(fi);
      }
      ex = world.wrap(ex + sdx);
      ey = world.wrap(ey + sdy);
    }
    if (connected) {
      placeDoorAt(world, sx, sy, room.id);
      for (const ci of carved) world.cells[ci] = Cell.FLOOR;
      return;
    }
  }
}

/* ── Percolation: ensure entire world is one connected graph ── */
export function ensureConnectivity(world: World, spawnX: number, spawnY: number): void {
  const N = W * W;
  const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let pass = 0; pass < 4; pass++) {
    const label = new Int32Array(N).fill(-1);

    const si = world.idx(Math.floor(spawnX), Math.floor(spawnY));
    label[si] = 0;
    const bfsQ: number[] = [si];
    let bh = 0;
    while (bh < bfsQ.length) {
      const ci = bfsQ[bh++];
      const cx = ci % W, cy = (ci / W) | 0;
      for (const [dx, dy] of dirs) {
        const ni = world.idx(cx + dx, cy + dy);
        if (label[ni] < 0 && (world.cells[ni] === Cell.FLOOR || world.cells[ni] === Cell.DOOR)) {
          label[ni] = 0;
          bfsQ.push(ni);
        }
      }
    }

    const mainCells: [number, number][] = [];
    const mstep = Math.max(1, bfsQ.length >> 10);
    for (let i = 0; i < bfsQ.length; i += mstep) {
      mainCells.push([bfsQ[i] % W, (bfsQ[i] / W) | 0]);
    }

    let compId = 1;
    for (let i = 0; i < N; i++) {
      if (label[i] >= 0) continue;
      if (world.cells[i] !== Cell.FLOOR && world.cells[i] !== Cell.DOOR) continue;

      const comp: number[] = [i];
      label[i] = compId;
      let ch = 0;
      while (ch < comp.length) {
        const ci = comp[ch++];
        const cx = ci % W, cy = (ci / W) | 0;
        for (const [dx, dy] of dirs) {
          const ni = world.idx(cx + dx, cy + dy);
          if (label[ni] < 0 && (world.cells[ni] === Cell.FLOOR || world.cells[ni] === Cell.DOOR)) {
            label[ni] = compId;
            comp.push(ni);
          }
        }
      }
      compId++;

      let bestD = Infinity, srcX = 0, srcY = 0, dstX = 0, dstY = 0;
      const step = Math.max(1, comp.length >> 2);
      for (let c = 0; c < comp.length; c += step) {
        const cx = comp[c] % W, cy = (comp[c] / W) | 0;
        for (const [mx, my] of mainCells) {
          const d = Math.abs(world.delta(cx, mx)) + Math.abs(world.delta(cy, my));
          if (d < bestD) { bestD = d; srcX = cx; srcY = cy; dstX = mx; dstY = my; }
        }
      }

      carveCorridor(world, srcX, srcY, dstX, dstY);

      for (const ci of comp) label[ci] = 0;
      const re: number[] = [world.idx(srcX, srcY), world.idx(dstX, dstY)];
      for (const seed of re) {
        if (label[seed] === 0) continue;
        label[seed] = 0;
        const rq = [seed];
        let rh = 0;
        while (rh < rq.length) {
          const ci = rq[rh++];
          const cx = ci % W, cy = (ci / W) | 0;
          for (const [dx, dy] of dirs) {
            const ni = world.idx(cx + dx, cy + dy);
            if (label[ni] !== 0 && (world.cells[ni] === Cell.FLOOR || world.cells[ni] === Cell.DOOR)) {
              label[ni] = 0;
              rq.push(ni);
            }
          }
        }
      }
      mainCells.push([srcX, srcY]);
    }

    if (compId === 1) break; // fully connected — done
  }
}

/* ── Repair room walls: seal breaches in APARTMENT perimeters only ── */
export function repairRoomWalls(world: World): void {
  const aptCount = world.apartmentRoomCount;
  for (let i = 0; i < aptCount; i++) {
    const room = world.rooms[i];
    if (!room) continue;
    // Scan the 1-cell wall ring around the room
    for (let dy = -1; dy <= room.h; dy++) {
      for (let dx = -1; dx <= room.w; dx++) {
        // Skip interior cells
        if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
        const wx = world.wrap(room.x + dx);
        const wy = world.wrap(room.y + dy);
        const ci = world.idx(wx, wy);
        // If a perimeter cell became FLOOR, restore it to WALL
        // Skip cells intentionally assigned to a room (hand-crafted passages)
        if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0) {
          world.cells[ci] = Cell.WALL;
          world.wallTex[ci] = room.wallTex;
        }
      }
    }
  }
}



/* ── Sanitize doors: validate APARTMENT doors only ───────────── */
export function sanitizeDoors(world: World): void {
  const walkable = (c: number) => c === Cell.FLOOR || c === Cell.DOOR;

  for (let pass = 0; pass < 3; pass++) {
    const toRemove: number[] = [];
    for (const [idx, door] of world.doors) {
      const x = idx % W, y = (idx / W) | 0;
      if (world.cells[idx] !== Cell.DOOR) { toRemove.push(idx); continue; }

      const l = world.cells[world.idx(x - 1, y)];
      const r = world.cells[world.idx(x + 1, y)];
      const u = world.cells[world.idx(x, y - 1)];
      const d = world.cells[world.idx(x, y + 1)];

      const wallH = (l === Cell.WALL ? 1 : 0) + (r === Cell.WALL ? 1 : 0);
      const wallV = (u === Cell.WALL ? 1 : 0) + (d === Cell.WALL ? 1 : 0);
      if (wallH < 2 && wallV < 2) { toRemove.push(idx); continue; }

      // Pass-through must have walkable on both sides
      if (wallH >= 2) {
        if (!walkable(u) || !walkable(d)) { toRemove.push(idx); continue; }
      } else {
        if (!walkable(l) || !walkable(r)) { toRemove.push(idx); continue; }
      }

      void door; // used
    }
    if (toRemove.length === 0) break;
    for (const i of toRemove) {
      // Apartment doors become WALL, non-apartment become FLOOR
      world.cells[i] = world.aptMask[i] ? Cell.WALL : Cell.FLOOR;
      const door = world.doors.get(i);
      if (door) {
        const rA = world.rooms[door.roomA];
        if (rA) rA.doors = rA.doors.filter(d => d !== i);
        if (door.roomB >= 0) {
          const rB = world.rooms[door.roomB];
          if (rB) rB.doors = rB.doors.filter(d => d !== i);
        }
        world.doors.delete(i);
      }
    }
  }
}



/* ── Remove 1-cell dead-end floor pockets ────────────────────── */
export function pruneDeadEnds(world: World): void {
  const dirs: [number, number][] = [[1,0],[-1,0],[0,1],[0,-1]];
  const walk = (ni: number) =>
    world.cells[ni] === Cell.FLOOR || world.cells[ni] === Cell.DOOR;

  for (let pass = 0; pass < 6; pass++) {
    let changed = 0;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (world.cells[i] !== Cell.FLOOR) continue;
        if (world.roomMap[i] >= 0) continue;

        let solidN = 0;
        for (const [dx, dy] of dirs) {
          if (!walk(world.idx(x + dx, y + dy))) solidN++;
        }
        if (solidN >= 3) {
          world.cells[i] = Cell.WALL;
          world.features[i] = 0;
          changed++;
        }
      }
    }
    if (changed === 0) break;
  }
}

/* ── Open volatile doors: convert non-apartment doors to FLOOR ── */
export function openVolatileDoors(world: World): void {
  const toOpen: number[] = [];
  for (const [idx, door] of world.doors) {
    if (world.aptMask[idx]) continue;
    const rA = door.roomA >= 0 ? world.rooms[door.roomA] : null;
    const rB = door.roomB >= 0 ? world.rooms[door.roomB] : null;
    if (rA && rA.apartmentId >= 0) continue;
    if (rB && rB.apartmentId >= 0) continue;
    toOpen.push(idx);
  }
  for (const idx of toOpen) {
    world.cells[idx] = Cell.FLOOR;
    const door = world.doors.get(idx);
    if (door) {
      if (door.roomA >= 0) {
        const rA = world.rooms[door.roomA];
        if (rA) rA.doors = rA.doors.filter(d => d !== idx);
      }
      if (door.roomB >= 0) {
        const rB = world.rooms[door.roomB];
        if (rB) rB.doors = rB.doors.filter(d => d !== idx);
      }
    }
    world.doors.delete(idx);
  }
}

/* ── Weighted random pick ────────────────────────────────────── */
export function weightedPick<T extends { spawnW: number }>(defs: T[]): T | null {
  const total = defs.reduce((s, d) => s + d.spawnW, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const d of defs) { r -= d.spawnW; if (r <= 0) return d; }
  return defs[defs.length - 1];
}

/* ── Place lift cells in corridors ───────────────────────────── */
export function placeLifts(world: World, count: number): void {
  let placed = 0;
  for (let attempt = 0; attempt < 2000 && placed < count; attempt++) {
    const x = rng(20, W - 20);
    const y = rng(20, W - 20);
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR || world.roomMap[ci] >= 0) continue;
    let adjFloor = 0;
    let btnX = x, btnY = y;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (world.cells[ni] === Cell.FLOOR && world.roomMap[ni] < 0) {
        adjFloor++;
        btnX = world.wrap(x + dx);
        btnY = world.wrap(y + dy);
      }
    }
    if (adjFloor < 2) continue;
    world.cells[ci] = Cell.LIFT;
    world.wallTex[ci] = Tex.LIFT_DOOR;
    const bi = world.idx(btnX, btnY);
    world.features[bi] = Feature.LIFT_BUTTON;
    placed++;
  }
}

/* ── Zone generation: 64 organic macro-regions ~128×128 ──────── */
const ZONE_GRID = 8;  // 8×8 = 64 zones
const ZONE_CELL = Math.floor(W / ZONE_GRID); // ~128

export function generateZones(world: World): void {
  const zones: Zone[] = [];

  // Create 64 zones with organic jittered centers
  for (let zy = 0; zy < ZONE_GRID; zy++) {
    for (let zx = 0; zx < ZONE_GRID; zx++) {
      const id = zy * ZONE_GRID + zx;
      const cx = world.wrap(zx * ZONE_CELL + Math.floor(ZONE_CELL / 2) + rng(-20, 20));
      const cy = world.wrap(zy * ZONE_CELL + Math.floor(ZONE_CELL / 2) + rng(-20, 20));

      // Faction distribution: 40% citizen, 25% liquidator, 25% cultist, 10% scientist->citizen
      const roll = Math.random();
      let faction: ZoneFaction;
      if (roll < 0.40) faction = ZoneFaction.CITIZEN;
      else if (roll < 0.65) faction = ZoneFaction.LIQUIDATOR;
      else faction = ZoneFaction.CULTIST;
      // No SAMOSBOR zones initially

      zones.push({
        id, cx, cy,
        faction,
        hasLift: Math.random() < 0.10,
        fogged: false,
      });
    }
  }

  // Voronoi assignment: each cell → nearest zone center
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let bestD = Infinity;
      let bestZ = 0;
      for (let z = 0; z < zones.length; z++) {
        const dx = world.delta(x, zones[z].cx);
        const dy = world.delta(y, zones[z].cy);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestZ = z; }
      }
      world.zoneMap[y * W + x] = bestZ;
    }
  }

  world.zones = zones;
}

/* ── Place шлюзы (airlocks) at zone boundaries ────────────── */
// Pattern: DOOR — FLOOR — DOOR (3 cells in a corridor across zone boundary)
export function placeAirlocks(world: World): void {
  const used = new Set<number>(); // avoid duplicate / too-close airlocks

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const mi = y * W + x; // middle cell
      if (world.cells[mi] !== Cell.FLOOR) continue;
      if (world.aptMask[mi]) continue;

      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        // prev and next along direction
        const px = world.wrap(x - dx), py = world.wrap(y - dy);
        const nx = world.wrap(x + dx), ny = world.wrap(y + dy);
        const pi = world.idx(px, py);
        const ni = world.idx(nx, ny);

        if (world.cells[pi] !== Cell.FLOOR || world.aptMask[pi]) continue;
        if (world.cells[ni] !== Cell.FLOOR || world.aptMask[ni]) continue;

        // Zone boundary: prev and next must be different zones
        if (world.zoneMap[pi] === world.zoneMap[ni]) continue;

        // Corridor check: perpendicular walls on all 3 cells
        let corridor = true;
        for (const [cx, cy] of [[px, py], [x, y], [nx, ny]]) {
          const wp = world.idx(world.wrap(cx + dy), world.wrap(cy + dx));
          const wn = world.idx(world.wrap(cx - dy), world.wrap(cy - dx));
          if (world.cells[wp] !== Cell.WALL || world.cells[wn] !== Cell.WALL) {
            corridor = false; break;
          }
        }
        if (!corridor) continue;

        // Anti-clustering
        if (used.has(pi) || used.has(mi) || used.has(ni)) continue;

        // No existing doors nearby
        let tooClose = false;
        for (const [ox, oy] of [[2,0],[-2,0],[0,2],[0,-2]]) {
          const ci = world.idx(world.wrap(x + ox), world.wrap(y + oy));
          if (world.cells[ci] === Cell.DOOR) { tooClose = true; break; }
        }
        if (tooClose) continue;

        // Place: prev=DOOR, middle stays FLOOR, next=DOOR
        world.cells[pi] = Cell.DOOR;
        world.doors.set(pi, {
          idx: pi, state: DoorState.CLOSED,
          roomA: -1, roomB: -1, keyId: '', timer: 0,
        });
        world.cells[ni] = Cell.DOOR;
        world.doors.set(ni, {
          idx: ni, state: DoorState.CLOSED,
          roomA: -1, roomB: -1, keyId: '', timer: 0,
        });

        // Mark area as used
        for (let r = -4; r <= 4; r++) {
          used.add(world.idx(world.wrap(x + r * dx), world.wrap(y + r * dy)));
        }
      }
    }
  }
}
