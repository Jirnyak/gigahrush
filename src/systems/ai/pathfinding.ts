/* ── BFS pathfinding + movement helpers ───────────────────────── */

import {
  W, Cell, DoorState,
  type Entity,
  EntityType, AIGoal, RoomType,
} from '../../core/types';
import { World } from '../../core/world';
import { bark, BARK_ARRIVE, BARK_ARRIVE_F, BARK_CHANCE_ARRIVE } from './barks';

let _barkMsgs: Msg[] = [];
let _barkTime = 0;

import { type Msg } from '../../core/types';

/** Call once per frame from updateAI to set bark context for followPath arrival barks */
export function setPathContext(msgs: Msg[], time: number): void {
  _barkMsgs = msgs;
  _barkTime = time;
}

/* ── BFS pathfinding (toroidal, avoids closed doors) ──────────── */

const BFS_LIMIT = 800;
const _bfsVisitGen = new Uint16Array(W * W);
let _bfsGen = 0;
const _bfsPrev = new Int32Array(W * W);
const _bfsQueue = new Int32Array(BFS_LIMIT);

export function bfsPath(world: World, sx: number, sy: number, ex: number, ey: number): number[] {
  sx = world.wrap(sx); sy = world.wrap(sy);
  ex = world.wrap(ex); ey = world.wrap(ey);

  if (sx === ex && sy === ey) return [];

  _bfsGen = (_bfsGen + 1) & 0xFFFF;
  if (_bfsGen === 0) { _bfsGen = 1; _bfsVisitGen.fill(0); }

  const start = sy * W + sx;
  const end = ey * W + ex;

  _bfsVisitGen[start] = _bfsGen;
  _bfsQueue[0] = start;
  let head = 0, tail = 1;
  let found = false;

  while (head < tail && head < BFS_LIMIT) {
    const cur = _bfsQueue[head++];
    if (cur === end) { found = true; break; }

    const cx = cur % W;
    const cy = (cur - cx) / W;

    for (let d = 0; d < 4; d++) {
      const nx = ((cx + (d === 0 ? -1 : d === 1 ? 1 : 0)) % W + W) % W;
      const ny = ((cy + (d === 2 ? -1 : d === 3 ? 1 : 0)) % W + W) % W;
      const ni = ny * W + nx;
      if (_bfsVisitGen[ni] === _bfsGen) continue;

      const cell = world.cells[ni];
      if (cell === Cell.WALL) continue;
      if (cell === Cell.DOOR) {
        const door = world.doors.get(ni);
        if (door && (door.state === DoorState.LOCKED || door.state === DoorState.HERMETIC_CLOSED)) continue;
      }

      _bfsVisitGen[ni] = _bfsGen;
      _bfsPrev[ni] = cur;
      if (tail < BFS_LIMIT) _bfsQueue[tail++] = ni;
    }
  }

  if (!found) return [];

  const path: number[] = [];
  let c = end;
  while (c !== start) {
    path.push(c);
    c = _bfsPrev[c];
    if (_bfsVisitGen[c] !== _bfsGen && c !== start) return [];
  }
  path.reverse();
  return path;
}

/* ── Follow path ──────────────────────────────────────────────── */
export function followPath(world: World, e: Entity, dt: number): void {
  const ai = e.ai!;
  if (ai.pi >= ai.path.length) {
    // Path finished — clear and roam within room if NPC
    if (ai.path.length > 0) {
      // Bark: arrived at destination (very rare)
      if (e.type === EntityType.NPC && ai.goal === AIGoal.WORK) {
        bark(e, _barkMsgs, _barkTime, BARK_ARRIVE, BARK_ARRIVE_F, BARK_CHANCE_ARRIVE, '#aac');
      }
      ai.path = []; ai.pi = 0; ai.stuck = 0;
    }
    if (e.type === EntityType.NPC) {
      ai.stuck += dt;
      if (ai.stuck > 1.5 + Math.random() * 2) {
        wanderInRoom(world, e);
        ai.stuck = 0;
      }
    }
    return;
  }

  const target = ai.path[ai.pi];
  const tx = (target % W) + 0.5;
  const ty = Math.floor(target / W) + 0.5;

  let dx = world.delta(e.x, tx);
  let dy = world.delta(e.y, ty);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.3) {
    ai.pi++;
    ai.stuck = 0;
    return;
  }

  // Open doors in the way (never open hermetic doors — they protect apartments during samosbor)
  const nextCellI = world.idx(Math.floor(tx), Math.floor(ty));
  if (world.cells[nextCellI] === Cell.DOOR) {
    const door = world.doors.get(nextCellI);
    if (door && door.state === DoorState.CLOSED) {
      door.state = DoorState.OPEN;
      door.timer = 5; // auto-close after 5s
    }
  }

  // Move toward target
  const speed = e.speed * dt;
  const nx = e.x + (dx / dist) * speed;
  const ny = e.y + (dy / dist) * speed;

  if (!world.solid(Math.floor(nx), Math.floor(e.y))) e.x = ((nx % W) + W) % W;
  if (!world.solid(Math.floor(e.x), Math.floor(ny))) e.y = ((ny % W) + W) % W;

  // Stuck detection
  ai.stuck += dt;
  if (ai.stuck > 3) {
    ai.path = [];
    ai.pi = 0;
    ai.stuck = 0;
    ai.goal = AIGoal.IDLE;
    ai.timer = 2;
  }
}

/* ── Find nearest room of type ────────────────────────────────── */
export function findNearest(world: World, e: Entity, type: RoomType): number {
  let best = -1, bestD = Infinity;
  for (const room of world.rooms) {
    if (!room || room.type !== type) continue;
    const d = world.dist(e.x, e.y, room.x + room.w / 2, room.y + room.h / 2);
    if (d < bestD) { bestD = d; best = room.id; }
  }
  return best;
}

/* ── Find family's room of type ───────────────────────────────── */
export function findFamilyRoom(world: World, e: Entity, type: RoomType): number {
  if (e.familyId !== undefined) {
    for (const room of world.rooms) {
      if (!room || room.type !== type || room.apartmentId !== e.familyId) continue;
      return room.id;
    }
  }
  return findNearest(world, e, type);
}

/* ── Helper: set path to room center ──────────────────────────── */
export function gotoRoom(world: World, e: Entity, roomId: number): void {
  const ai = e.ai!;
  const room = world.rooms[roomId];
  if (!room) return;
  const tx = room.x + Math.floor(room.w / 2);
  const ty = room.y + Math.floor(room.h / 2);
  ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), tx, ty);
  ai.pi = 0;
}

/* ── Helper: wander randomly nearby ───────────────────────────── */
export function wanderNearby(world: World, e: Entity): void {
  const ai = e.ai!;
  for (let attempt = 0; attempt < 8; attempt++) {
    const wx = Math.floor(e.x) + Math.floor(Math.random() * 20 - 10);
    const wy = Math.floor(e.y) + Math.floor(Math.random() * 20 - 10);
    const tx = world.wrap(wx);
    const ty = world.wrap(wy);
    if (world.solid(tx, ty)) continue;

    const path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), tx, ty);
    if (path.length > 0) {
      ai.path = path;
      ai.pi = 0;
      return;
    }
  }

  ai.path = [];
  ai.pi = 0;
}

/* ── Helper: roam randomly within the current room ────────────── */
export function wanderInRoom(world: World, e: Entity): void {
  const ai = e.ai!;
  const room = world.roomAt(e.x, e.y);
  if (!room || room.w < 3 || room.h < 3) return;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
    const ry = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
    if (!world.solid(rx, ry)) {
      ai.path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), rx, ry);
      ai.pi = 0;
      return;
    }
  }
}

/* ── Helper: wander far across the maze (for travelers) ───────── */
export function wanderFar(world: World, e: Entity): void {
  const ai = e.ai!;
  if (world.rooms.length > 0) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const room = world.rooms[Math.floor(Math.random() * world.rooms.length)];
      if (!room || room.w < 2 || room.h < 2) continue;
      const tx = room.x + Math.floor(room.w / 2);
      const ty = room.y + Math.floor(room.h / 2);
      const path = bfsPath(world, Math.floor(e.x), Math.floor(e.y), tx, ty);
      if (path.length > 0) {
        ai.path = path;
        ai.pi = 0;
        return;
      }
    }
  }
  // Fallback: wander nearby
  wanderNearby(world, e);
}
