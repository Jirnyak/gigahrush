import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  W, Cell, Tex, Feature, RoomType, LiftDirection, ContainerKind, DoorState,
  EntityType, Faction, ZoneFaction,
  type Entity, type Room, type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';
import {
  carveCorridor, placeDoorAt, protectRoom,
  roomExit, stampRoom,
} from '../shared';
import { RAIONSOVET_ARCHIVE_MICRO_GRIDS, RAIONSOVET_ARCHIVE_HQ_SPECS, ARCHIVE_MACRO_MOTIFS } from "./meta";
import { nextArchiveContainerId, addArchiveContainer } from "./npcs";

export interface RaionsovetArchiveDocument {
  id: string;
  itemId: string;
  title: string;
  routeId: string;
  accessTags: readonly string[];
  suspicion: number;
  legal: boolean;
  flag: string;
}

export interface RaionsovetArchiveAccessCheck {
  id: string;
  targetId: string;
  roomDefId: string;
  legalItemId: string;
  illegalItemId: string;
  legalFlag: string;
  illegalFlag: string;
  visibleEffect: string;
}

export type RaionsovetArchiveEventKind =
  | 'permit_issued'
  | 'card_swapped'
  | 'shelf_burned'
  | 'market_license_changed'
  | 'archive_denied';

export interface ArchiveRooms {
  waiting: Room;
  clerk: Room;
  catalog: Room;
  shelves: Room;
  stamp: Room;
  fire: Room;
  heir: Room;
  market: Room;
  checker: Room;
}

export interface ArchivePoint {
  x: number;
  y: number;
}

export type ArchiveDoorSide = 'north' | 'south' | 'west' | 'east';

export interface ArchiveMicroGridSpec {
  name: string;
  owner: TerritoryOwner;
  x: number;
  y: number;
  cols: number;
  rows: number;
  roomW: number;
  roomH: number;
  gapX: number;
  gapY: number;
  connector: ArchivePoint;
  floorTex: Tex;
  wallTex: Tex;
  roomTypes: readonly RoomType[];
}

export interface ArchiveHqSpec {
  owner: TerritoryOwner;
  name: string;
  x: number;
  y: number;
  linkX: number;
  linkY: number;
  wallTex: Tex;
  floorTex: Tex;
}

export function createArchiveRoom(
  world: World,
  id: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex = Tex.MARBLE,
  floorTex = Tex.F_PARQUET,
): Room {
  const room = stampRoom(world, id, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  return room;
}

export function paintRoom(world: World, room: Room): void {
  protectRoom(world, room.x, room.y, room.w, room.h, room.wallTex, room.floorTex);
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] !== Cell.WALL) world.floorTex[ci] = room.floorTex;
      else world.wallTex[ci] = room.wallTex;
    }
  }
}

export function canStampArchiveOwnedRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.aptMask[ci]) return false;
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) return false;
      if (world.containerMap.has(ci)) return false;
      if (world.roomMap[ci] >= 0) return false;
    }
  }
  return true;
}

export function paintArchiveRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) setTerritoryOwnerAtIndex(world, world.idx(room.x + dx, room.y + dy), owner);
  }
}

export function stampOwnedArchiveRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  owner: TerritoryOwner,
  wallTex: Tex,
  floorTex: Tex,
): Room | null {
  if (!canStampArchiveOwnedRoom(world, x, y, w, h)) return null;
  const room = createArchiveRoom(world, world.rooms.length, type, x, y, w, h, name, wallTex, floorTex);
  paintRoom(world, room);
  paintArchiveRoomTerritory(world, room, owner);
  return room;
}

export function addArchiveRoomDoor(
  world: World,
  room: Room,
  x: number,
  y: number,
  state = DoorState.CLOSED,
  keyId = '',
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.WALL) return;
  world.cells[ci] = Cell.DOOR;
  world.wallTex[ci] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED ? Tex.DOOR_METAL : room.wallTex;
  world.doors.set(ci, { idx: ci, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  if (!room.doors.includes(ci)) room.doors.push(ci);
}

export function archiveDoorPoint(room: Room, side: ArchiveDoorSide): { wx: number; wy: number; ox: number; oy: number } {
  const x = side === 'west' ? room.x - 1 : side === 'east' ? room.x + room.w : room.x + Math.floor(room.w / 2);
  const y = side === 'north' ? room.y - 1 : side === 'south' ? room.y + room.h : room.y + Math.floor(room.h / 2);
  return {
    wx: x,
    wy: y,
    ox: side === 'west' ? x - 1 : side === 'east' ? x + 1 : x,
    oy: side === 'north' ? y - 1 : side === 'south' ? y + 1 : y,
  };
}

export function addArchiveDoorOnSide(
  world: World,
  room: Room,
  side: ArchiveDoorSide,
  state = DoorState.CLOSED,
  keyId = '',
): ArchivePoint {
  const point = archiveDoorPoint(room, side);
  addArchiveRoomDoor(world, room, point.wx, point.wy, state, keyId);
  return { x: point.ox, y: point.oy };
}

export function markArchiveHermeticShell(world: World, room: Room): void {
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) continue;
      if (world.cells[ci] !== Cell.WALL) continue;
      world.hermoWall[ci] = 1;
      world.wallTex[ci] = Tex.HERMO_WALL;
    }
  }
}

export function decorateArchiveMicroRoom(world: World, room: Room, owner: TerritoryOwner, serial: number): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      setFeatureIfFloor(world, room.x + 3, room.y + 3, Feature.STOVE);
      setFeatureIfFloor(world, room.x + room.w - 4, room.y + 3, Feature.SINK);
      setFeatureIfFloor(world, room.x + 4, room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      setFeatureIfFloor(world, room.x + 3, room.y + 3, Feature.SINK);
      setFeatureIfFloor(world, room.x + room.w - 4, room.y + room.h - 3, Feature.TOILET);
      break;
    case RoomType.MEDICAL:
      setFeatureIfFloor(world, room.x + 3, room.y + 3, Feature.APPARATUS);
      setFeatureIfFloor(world, room.x + room.w - 4, room.y + 3, Feature.TABLE);
      break;
    case RoomType.PRODUCTION:
      setFeatureIfFloor(world, room.x + 3, room.y + 3, Feature.MACHINE);
      setFeatureIfFloor(world, room.x + room.w - 4, room.y + 3, Feature.SCREEN);
      break;
    case RoomType.OFFICE:
      setFeatureIfFloor(world, room.x + 3, room.y + 3, Feature.DESK);
      setFeatureIfFloor(world, room.x + room.w - 4, room.y + 3, Feature.SCREEN);
      setFeatureIfFloor(world, room.x + 4, room.y + room.h - 3, Feature.CHAIR);
      break;
    case RoomType.HQ:
      setFeatureIfFloor(world, room.x + 4, room.y + 4, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.DESK);
      setFeatureIfFloor(world, room.x + room.w - 5, room.y + 4, owner === ZoneFaction.SCIENTIST ? Feature.APPARATUS : Feature.SCREEN);
      setFeatureIfFloor(world, room.x + 5, room.y + room.h - 4, Feature.SHELF);
      setFeatureIfFloor(world, room.x + room.w - 6, room.y + room.h - 4, Feature.LAMP);
      break;
    case RoomType.STORAGE:
      for (let y = room.y + 2; y < room.y + room.h - 1; y += 3) {
        setFeatureIfFloor(world, room.x + 3, y, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.SHELF);
        setFeatureIfFloor(world, room.x + room.w - 4, y, Feature.SHELF);
      }
      break;
    default:
      setFeatureIfFloor(world, room.x + 3, room.y + 3, serial % 2 === 0 ? Feature.TABLE : Feature.DESK);
      setFeatureIfFloor(world, room.x + room.w - 4, room.y + room.h - 3, Feature.CHAIR);
      break;
  }
}

export function setFeatureIfFloor(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
}

export function setShelfWall(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.cells[ci] = Cell.WALL;
  world.wallTex[ci] = Tex.PANEL;
  world.features[ci] = Feature.NONE;
}

export function isArchiveReserved(world: World, x: number, y: number): boolean {
  const ci = world.idx(x, y);
  return world.aptMask[ci] !== 0
    || world.cells[ci] === Cell.LIFT
    || world.containerMap.has(ci);
}

export function carveArchiveCell(world: World, x: number, y: number, floorTex = Tex.F_MARBLE_TILE, roomId = -1): void {
  const ci = world.idx(x, y);
  if (isArchiveReserved(world, x, y) || world.cells[ci] === Cell.DOOR) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = roomId;
  world.floorTex[ci] = floorTex;
  world.features[ci] = Feature.NONE;
}

export function carveArchiveBlock(world: World, x: number, y: number, w: number, h: number, floorTex = Tex.F_MARBLE_TILE, roomId = -1): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) carveArchiveCell(world, x + dx, y + dy, floorTex, roomId);
  }
}

export function carveArchiveDisc(world: World, cx: number, cy: number, r: number, floorTex = Tex.F_MARBLE_TILE, roomId = -1): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) carveArchiveCell(world, cx + dx, cy + dy, floorTex, roomId);
    }
  }
}

export function carveArchiveLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width = 1,
  floorTex = Tex.F_MARBLE_TILE,
  roomId = -1,
): void {
  const sx = bx === ax ? 0 : bx > ax ? 1 : -1;
  const sy = by === ay ? 0 : by > ay ? 1 : -1;
  let x = ax;
  let y = ay;
  while (x !== bx) {
    carveArchiveDisc(world, x, y, width, floorTex, roomId);
    x += sx;
  }
  while (y !== by) {
    carveArchiveDisc(world, x, y, width, floorTex, roomId);
    y += sy;
  }
  carveArchiveDisc(world, x, y, width, floorTex, roomId);
}

export function setArchiveWall(world: World, x: number, y: number, wallTex = Tex.PANEL): void {
  const ci = world.idx(x, y);
  if (isArchiveReserved(world, x, y) || world.cells[ci] === Cell.DOOR) return;
  world.cells[ci] = Cell.WALL;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = wallTex;
  world.features[ci] = Feature.NONE;
}

export function frameArchiveArea(world: World, x: number, y: number, w: number, h: number, wallTex = Tex.MARBLE): void {
  for (let dx = -1; dx <= w; dx++) {
    setArchiveWall(world, x + dx, y - 1, wallTex);
    setArchiveWall(world, x + dx, y + h, wallTex);
  }
  for (let dy = 0; dy < h; dy++) {
    setArchiveWall(world, x - 1, y + dy, wallTex);
    setArchiveWall(world, x + w, y + dy, wallTex);
  }
}

export function addArchiveGate(world: World, x: number, y: number, keyId = ''): void {
  const ci = world.idx(x, y);
  if (isArchiveReserved(world, x, y) || world.cells[ci] !== Cell.WALL) return;

  const l = world.cells[world.idx(x - 1, y)];
  const r = world.cells[world.idx(x + 1, y)];
  const u = world.cells[world.idx(x, y - 1)];
  const d = world.cells[world.idx(x, y + 1)];
  const floorH = (l === Cell.FLOOR || l === Cell.DOOR) && (r === Cell.FLOOR || r === Cell.DOOR);
  const floorV = (u === Cell.FLOOR || u === Cell.DOOR) && (d === Cell.FLOOR || d === Cell.DOOR);
  const wallH = l === Cell.WALL && r === Cell.WALL;
  const wallV = u === Cell.WALL && d === Cell.WALL;
  if ((!floorH || !wallV) && (!floorV || !wallH)) return;

  world.cells[ci] = Cell.DOOR;
  world.doors.set(ci, {
    idx: ci,
    state: keyId ? DoorState.LOCKED : DoorState.CLOSED,
    roomA: -1,
    roomB: -1,
    keyId,
    timer: 0,
  });
}

export function connectArchiveRoomToPoint(world: World, room: Room, tx: number, ty: number, floorTex = Tex.F_MARBLE_TILE): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const dx = world.delta(cx, tx);
  const dy = world.delta(cy, ty);
  let wx = cx;
  let wy = cy;
  let ox = cx;
  let oy = cy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    wy = cy;
    if (dx >= 0) {
      wx = room.x + room.w;
      ox = wx + 1;
    } else {
      wx = room.x - 1;
      ox = wx - 1;
    }
    oy = wy;
  } else {
    wx = cx;
    if (dy >= 0) {
      wy = room.y + room.h;
      oy = wy + 1;
    } else {
      wy = room.y - 1;
      oy = wy - 1;
    }
    ox = wx;
  }

  placeDoorAt(world, wx, wy, room.id);
  carveArchiveLine(world, ox, oy, tx, ty, 1, floorTex);
}

export function decorateClerkBridge(world: World, x: number, y: number, len: number, horizontal: boolean): void {
  for (let i = 0; i < len; i += 6) {
    const px = horizontal ? x + i : x;
    const py = horizontal ? y : y + i;
    setFeatureIfFloor(world, px, py, Feature.DESK);
    setFeatureIfFloor(world, horizontal ? px : px + 1, horizontal ? py + 1 : py, Feature.SCREEN);
  }
}

export function buildStackCanyon(
  world: World,
  room: Room,
  vertical: boolean,
  rng: () => number,
): ArchivePoint[] {
  const { x, y, w, h } = room;
  const bridges: ArchivePoint[] = [];
  carveArchiveBlock(world, x, y, w, h, Tex.F_PARQUET, room.id);
  frameArchiveArea(world, x, y, w, h, Tex.MARBLE);

  if (vertical) {
    const bridgeYs = [y + 32, y + Math.floor(h / 2), y + h - 34];
    for (let sx = x + 9; sx < x + w - 8; sx += 13) {
      for (let sy = y + 4; sy < y + h - 4; sy++) {
        const bridge = bridgeYs.some(by => Math.abs(sy - by) <= 2);
        if (!bridge && (sy + sx) % 47 > 2) setArchiveWall(world, sx, sy, Tex.PANEL);
      }
      if (rng() < 0.6) addArchiveGate(world, sx, y + 16 + Math.floor(rng() * Math.max(1, h - 32)), rng() < 0.25 ? 'archive_access_permit' : '');
    }
    for (const by of bridgeYs) {
      carveArchiveLine(world, x + 3, by, x + w - 4, by, 2, Tex.F_MARBLE_TILE, room.id);
      decorateClerkBridge(world, x + 8, by - 1, w - 16, true);
      bridges.push({ x: x + Math.floor(w / 2), y: by });
    }
  } else {
    const bridgeXs = [x + 42, x + Math.floor(w / 2), x + w - 44];
    for (let sy = y + 8; sy < y + h - 8; sy += 12) {
      for (let sx = x + 4; sx < x + w - 4; sx++) {
        const bridge = bridgeXs.some(bx => Math.abs(sx - bx) <= 2);
        if (!bridge && (sx + sy) % 53 > 2) setArchiveWall(world, sx, sy, Tex.PANEL);
      }
      if (rng() < 0.55) addArchiveGate(world, x + 20 + Math.floor(rng() * Math.max(1, w - 40)), sy, rng() < 0.2 ? 'forged_stamp_sheet' : '');
    }
    for (const bx of bridgeXs) {
      carveArchiveLine(world, bx, y + 3, bx, y + h - 4, 2, Tex.F_MARBLE_TILE, room.id);
      decorateClerkBridge(world, bx - 1, y + 8, h - 16, false);
      bridges.push({ x: bx, y: y + Math.floor(h / 2) });
    }
  }

  return bridges;
}

export interface ArchiveMacroMotif {
  id: number;
  weight: number;
  east: readonly number[];
  south: readonly number[];
}

export function chooseArchiveMacroMotif(motifs: Uint8Array, gx: number, gy: number, gw: number, rng: () => number): number {
  let total = 0;
  const weights = new Float32Array(ARCHIVE_MACRO_MOTIFS.length);
  const left = gx > 0 ? motifs[gy * gw + gx - 1] : 255;
  const top = gy > 0 ? motifs[(gy - 1) * gw + gx] : 255;
  for (let i = 0; i < ARCHIVE_MACRO_MOTIFS.length; i++) {
    const motif = ARCHIVE_MACRO_MOTIFS[i];
    if (left !== 255 && !ARCHIVE_MACRO_MOTIFS[left]?.east.includes(motif.id)) continue;
    if (top !== 255 && !ARCHIVE_MACRO_MOTIFS[top]?.south.includes(motif.id)) continue;
    total += motif.weight;
    weights[i] = motif.weight;
  }
  if (total <= 0) return 4;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return ARCHIVE_MACRO_MOTIFS[i].id;
  }
  return 4;
}

export function stampArchiveMacroMotif(world: World, cx: number, cy: number, motif: number): void {
  if (motif === 0) {
    for (let yy = -6; yy <= 6; yy++) {
      if (Math.abs(yy) <= 1) continue;
      setShelfWall(world, cx - 5, cy + yy);
      setShelfWall(world, cx + 5, cy + yy);
    }
    setFeatureIfFloor(world, cx - 2, cy - 4, Feature.SHELF);
    setFeatureIfFloor(world, cx + 2, cy + 4, Feature.SHELF);
  } else if (motif === 1) {
    for (let xx = -6; xx <= 6; xx++) {
      if (Math.abs(xx) <= 1) continue;
      setShelfWall(world, cx + xx, cy - 5);
      setShelfWall(world, cx + xx, cy + 5);
    }
    setFeatureIfFloor(world, cx - 4, cy + 2, Feature.SHELF);
    setFeatureIfFloor(world, cx + 4, cy - 2, Feature.SHELF);
  } else if (motif === 2) {
    for (let d = -5; d <= 5; d++) {
      if (Math.abs(d) <= 1) continue;
      setShelfWall(world, cx - 5, cy + d);
      setShelfWall(world, cx + d, cy + 5);
    }
    setFeatureIfFloor(world, cx + 3, cy - 3, Feature.DESK);
  } else if (motif === 3) {
    for (let d = -4; d <= 4; d++) {
      if (Math.abs(d) <= 1) continue;
      setShelfWall(world, cx + 5, cy + d);
    }
    setFeatureIfFloor(world, cx - 3, cy, Feature.SCREEN);
    setFeatureIfFloor(world, cx - 4, cy + 2, Feature.DESK);
  } else {
    setFeatureIfFloor(world, cx - 3, cy - 2, Feature.CHAIR);
    setFeatureIfFloor(world, cx + 3, cy + 2, Feature.CHAIR);
    setFeatureIfFloor(world, cx, cy - 4, Feature.LAMP);
  }
}

export function archiveMazeNeighbors(idx: number, gw: number, gh: number): number[] {
  const gx = idx % gw;
  const gy = Math.floor(idx / gw);
  const out: number[] = [];
  if (gx > 0) out.push(idx - 1);
  if (gx < gw - 1) out.push(idx + 1);
  if (gy > 0) out.push(idx - gw);
  if (gy < gh - 1) out.push(idx + gw);
  return out;
}

export function connectArchiveMazeCells(edges: Uint8Array, a: number, b: number, gw: number): void {
  if (b === a + 1) {
    edges[a] |= 1;
    edges[b] |= 4;
  } else if (b === a - 1) {
    edges[a] |= 4;
    edges[b] |= 1;
  } else if (b === a + gw) {
    edges[a] |= 2;
    edges[b] |= 8;
  } else if (b === a - gw) {
    edges[a] |= 8;
    edges[b] |= 2;
  }
}

export function archiveMazeDegree(edges: Uint8Array, idx: number): number {
  let degree = 0;
  const bits = edges[idx];
  if (bits & 1) degree++;
  if (bits & 2) degree++;
  if (bits & 4) degree++;
  if (bits & 8) degree++;
  return degree;
}

export function buildWilsonBraidedArchiveGraph(gw: number, gh: number, rng: () => number): Uint8Array {
  const total = gw * gh;
  const inTree = new Uint8Array(total);
  const edges = new Uint8Array(total);
  let treeCount = 1;
  inTree[Math.floor(rng() * total)] = 1;

  while (treeCount < total) {
    let start = Math.floor(rng() * total);
    while (inTree[start]) start = (start + 1) % total;
    const path = [start];
    const pathIndex = new Int16Array(total);
    pathIndex.fill(-1);
    pathIndex[start] = 0;
    let cur = start;

    while (!inTree[cur]) {
      const neighbors = archiveMazeNeighbors(cur, gw, gh);
      const next = neighbors[Math.floor(rng() * neighbors.length)];
      const seen = pathIndex[next];
      if (seen >= 0) {
        for (let i = seen + 1; i < path.length; i++) pathIndex[path[i]] = -1;
        path.length = seen + 1;
      } else {
        pathIndex[next] = path.length;
        path.push(next);
      }
      cur = next;
    }

    for (let i = 1; i < path.length; i++) connectArchiveMazeCells(edges, path[i - 1], path[i], gw);
    for (const idx of path) {
      if (!inTree[idx]) {
        inTree[idx] = 1;
        treeCount++;
      }
    }
  }

  for (let idx = 0; idx < total; idx++) {
    const degree = archiveMazeDegree(edges, idx);
    for (const next of archiveMazeNeighbors(idx, gw, gh)) {
      if (next < idx) continue;
      const already = next === idx + 1 ? (edges[idx] & 1) : next === idx + gw ? (edges[idx] & 2) : false;
      if (already) continue;
      const braidChance = degree <= 1 ? 0.5 : 0.16;
      if (rng() < braidChance) connectArchiveMazeCells(edges, idx, next, gw);
    }
  }

  return edges;
}

export function decorateArchiveLandmark(world: World, x: number, y: number, n: number): void {
  carveArchiveDisc(world, x, y, 4, Tex.F_MARBLE_TILE);
  setFeatureIfFloor(world, x, y - 3, Feature.LAMP);
  setFeatureIfFloor(world, x - 2, y, n % 2 === 0 ? Feature.SCREEN : Feature.DESK);
  setFeatureIfFloor(world, x + 2, y, n % 3 === 0 ? Feature.APPARATUS : Feature.SHELF);
  setFeatureIfFloor(world, x, y + 3, n % 2 === 0 ? Feature.CHAIR : Feature.CANDLE);
}

export function buildBraidedArchiveStack(world: World, room: Room, rng: () => number, step = 18): ArchivePoint[] {
  const pad = 10;
  const gw = Math.max(5, Math.floor((room.w - pad * 2) / step));
  const gh = Math.max(5, Math.floor((room.h - pad * 2) / step));
  const left = room.x + Math.floor((room.w - gw * step) / 2);
  const top = room.y + Math.floor((room.h - gh * step) / 2);
  const motifs = new Uint8Array(gw * gh);
  const edges = buildWilsonBraidedArchiveGraph(gw, gh, rng);
  const landmarks: ArchivePoint[] = [];

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      motifs[idx] = chooseArchiveMacroMotif(motifs, gx, gy, gw, rng);
      const cx = left + gx * step + Math.floor(step / 2);
      const cy = top + gy * step + Math.floor(step / 2);
      stampArchiveMacroMotif(world, cx, cy, motifs[idx]);
    }
  }

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const idx = gy * gw + gx;
      const cx = left + gx * step + Math.floor(step / 2);
      const cy = top + gy * step + Math.floor(step / 2);
      carveArchiveDisc(world, cx, cy, 2, Tex.F_PARQUET, room.id);
      if ((edges[idx] & 1) && gx < gw - 1) carveArchiveLine(world, cx, cy, cx + step, cy, 1, Tex.F_PARQUET, room.id);
      if ((edges[idx] & 2) && gy < gh - 1) carveArchiveLine(world, cx, cy, cx, cy + step, 1, Tex.F_PARQUET, room.id);
    }
  }

  for (let gy = 1; gy < gh - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const idx = gy * gw + gx;
      const degree = archiveMazeDegree(edges, idx);
      if (degree < 3 && rng() > 0.18) continue;
      const cx = left + gx * step + Math.floor(step / 2);
      const cy = top + gy * step + Math.floor(step / 2);
      if (landmarks.some(p => world.dist2(p.x, p.y, cx, cy) < 52 * 52)) continue;
      decorateArchiveLandmark(world, cx, cy, landmarks.length);
      landmarks.push({ x: cx, y: cy });
      if (landmarks.length >= 8) return landmarks;
    }
  }

  const fallback = [
    { x: left + Math.floor(step * 1.5), y: top + Math.floor(step * 1.5) },
    { x: left + Math.floor((gw - 1.5) * step), y: top + Math.floor(step * 1.5) },
    { x: left + Math.floor(step * 1.5), y: top + Math.floor((gh - 1.5) * step) },
    { x: left + Math.floor((gw - 1.5) * step), y: top + Math.floor((gh - 1.5) * step) },
  ];
  for (const point of fallback) {
    if (landmarks.length >= 4) break;
    decorateArchiveLandmark(world, point.x, point.y, landmarks.length);
    landmarks.push(point);
  }
  return landmarks;
}

export function decorateDocumentLane(world: World, ax: number, ay: number, bx: number, by: number): void {
  const horizontal = ay === by;
  const len = horizontal ? Math.abs(bx - ax) : Math.abs(by - ay);
  const sx = bx >= ax ? 1 : -1;
  const sy = by >= ay ? 1 : -1;
  for (let d = 0; d <= len; d += 14) {
    const x = horizontal ? ax + d * sx : ax;
    const y = horizontal ? ay : ay + d * sy;
    setFeatureIfFloor(world, x, y, d % 28 === 0 ? Feature.SCREEN : Feature.DESK);
    setFeatureIfFloor(world, horizontal ? x : x + 2, horizontal ? y + 2 : y, Feature.SHELF);
    setFeatureIfFloor(world, horizontal ? x : x - 2, horizontal ? y - 2 : y, Feature.CHAIR);
  }
}

export function buildArchiveLoop(world: World): ArchivePoint[] {
  const nodes: ArchivePoint[] = [
    { x: 142, y: 154 }, { x: 512, y: 154 }, { x: 884, y: 154 },
    { x: 884, y: 512 }, { x: 884, y: 864 }, { x: 512, y: 864 },
    { x: 142, y: 864 }, { x: 142, y: 512 },
  ];
  for (let i = 1; i < nodes.length; i++) {
    carveArchiveLine(world, nodes[i - 1].x, nodes[i - 1].y, nodes[i].x, nodes[i].y, 2, Tex.F_MARBLE_TILE);
  }
  carveArchiveLine(world, nodes[nodes.length - 1].x, nodes[nodes.length - 1].y, nodes[0].x, nodes[0].y, 2, Tex.F_MARBLE_TILE);

  carveArchiveLine(world, 256, 154, 256, 864, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 512, 154, 512, 864, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 768, 154, 768, 864, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 142, 256, 884, 256, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 142, 512, 884, 512, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 142, 768, 884, 768, 2, Tex.F_MARBLE_TILE);

  carveArchiveLine(world, 530, 464, 530, 154, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 530, 552, 530, 864, 2, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 512, 464, 142, 464, 1, Tex.F_MARBLE_TILE);
  carveArchiveLine(world, 568, 507, 884, 507, 1, Tex.F_MARBLE_TILE);
  return nodes;
}

export function carveReadingPit(world: World, room: Room): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const rx = Math.floor(room.w / 3);
  const ry = Math.floor(room.h / 3);
  for (let y = room.y + 5; y < room.y + room.h - 5; y++) {
    for (let x = room.x + 6; x < room.x + room.w - 6; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const bridge = Math.abs(x - cx) <= 2 || Math.abs(y - cy) <= 2;
      const ci = world.idx(x, y);
      if (world.roomMap[ci] !== room.id || bridge) continue;
      world.cells[ci] = Cell.ABYSS;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.features[ci] = Feature.NONE;
    }
  }
  for (let x = room.x + 8; x < room.x + room.w - 8; x += 12) {
    setFeatureIfFloor(world, x, room.y + 5, Feature.CHAIR);
    setFeatureIfFloor(world, x, room.y + room.h - 6, Feature.SHELF);
  }
  setFeatureIfFloor(world, cx - 3, cy, Feature.DESK);
  setFeatureIfFloor(world, cx + 3, cy, Feature.SCREEN);
  setFeatureIfFloor(world, room.x + 4, room.y + 4, Feature.CANDLE);
  setFeatureIfFloor(world, room.x + room.w - 5, room.y + room.h - 5, Feature.CANDLE);
}

export function decorateVaultRoom(world: World, room: Room): void {
  for (let y = room.y + 4; y < room.y + room.h - 4; y += 5) {
    for (let x = room.x + 5; x < room.x + room.w - 5; x += 7) {
      setShelfWall(world, x, y);
      setFeatureIfFloor(world, x + 1, y, Feature.SHELF);
    }
  }
  setFeatureIfFloor(world, room.x + 3, room.y + 3, Feature.LAMP);
  setFeatureIfFloor(world, room.x + room.w - 4, room.y + room.h - 4, Feature.APPARATUS);
}

export function buildArchiveMicroGrid(world: World, spec: ArchiveMicroGridSpec): number {
  const pitchX = spec.roomW + spec.gapX;
  const pitchY = spec.roomH + spec.gapY;
  const left = spec.x - 4;
  const right = spec.x + (spec.cols - 1) * pitchX + spec.roomW + 4;
  let stamped = 0;

  for (let row = 0; row < spec.rows; row++) {
    const roomY = spec.y + row * pitchY;
    const corridorY = roomY + spec.roomH + 1;
    carveArchiveLine(world, left, corridorY, right, corridorY, 1, spec.floorTex);
    for (let col = 0; col < spec.cols; col++) {
      const roomType = spec.roomTypes[(row * spec.cols + col) % spec.roomTypes.length];
      const room = stampOwnedArchiveRoom(
        world,
        roomType,
        spec.x + col * pitchX,
        roomY,
        spec.roomW,
        spec.roomH,
        `${spec.name} ${row + 1}.${col + 1}`,
        spec.owner,
        spec.wallTex,
        spec.floorTex,
      );
      if (!room) continue;
      decorateArchiveMicroRoom(world, room, spec.owner, stamped);
      addArchiveDoorOnSide(world, room, 'south');
      stamped++;
    }
  }

  const spineX = spec.x + Math.floor(((spec.cols - 1) * pitchX + spec.roomW) / 2);
  carveArchiveLine(
    world,
    spineX,
    spec.y + spec.roomH + 1,
    spineX,
    spec.y + (spec.rows - 1) * pitchY + spec.roomH + 1,
    1,
    spec.floorTex,
  );
  carveArchiveLine(
    world,
    spineX,
    spec.y + Math.floor((spec.rows * pitchY) / 2),
    spec.connector.x,
    spec.connector.y,
    1,
    spec.floorTex,
  );
  for (let row = 0; row < spec.rows; row += 2) {
    setFeatureIfFloor(world, spineX, spec.y + row * pitchY + spec.roomH + 1, Feature.LAMP);
  }
  return stamped;
}

export function archiveHqSupportSpecs(owner: TerritoryOwner): readonly { type: RoomType; name: string; wallTex: Tex; floorTex: Tex }[] {
  switch (owner) {
    case ZoneFaction.LIQUIDATOR:
      return [
        { type: RoomType.OFFICE, name: 'дежурная проверки', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.STORAGE, name: 'шкаф актов прожига', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.MEDICAL, name: 'перевязочная дыма', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.KITCHEN, name: 'кипяток караула', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.BATHROOM, name: 'санузел поста', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      ] as const;
    case ZoneFaction.SCIENTIST:
      return [
        { type: RoomType.PRODUCTION, name: 'стол индексации', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.MEDICAL, name: 'изолятор плесени', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.STORAGE, name: 'шкаф приборов', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.OFFICE, name: 'журнал сверки', wallTex: Tex.MARBLE, floorTex: Tex.F_MARBLE_TILE },
        { type: RoomType.BATHROOM, name: 'санпропускник', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      ] as const;
    case ZoneFaction.WILD:
      return [
        { type: RoomType.STORAGE, name: 'свалка адресов', wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
        { type: RoomType.KITCHEN, name: 'коптилка бланков', wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
        { type: RoomType.SMOKING, name: 'лежанки наследников', wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
        { type: RoomType.OFFICE, name: 'стол подделки', wallTex: Tex.PANEL, floorTex: Tex.F_WOOD },
        { type: RoomType.BATHROOM, name: 'ржавая вода', wallTex: Tex.TILE_W, floorTex: Tex.F_WATER },
      ] as const;
    case ZoneFaction.CULTIST:
      return [
        { type: RoomType.COMMON, name: 'круг пепельной фамилии', wallTex: Tex.ROTTEN, floorTex: Tex.F_MEAT },
        { type: RoomType.STORAGE, name: 'кладовая масок', wallTex: Tex.ROTTEN, floorTex: Tex.F_WOOD },
        { type: RoomType.MEDICAL, name: 'тихая перевязка', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.SMOKING, name: 'дымная ведомость', wallTex: Tex.ROTTEN, floorTex: Tex.F_MEAT },
        { type: RoomType.BATHROOM, name: 'умывальная золы', wallTex: Tex.TILE_W, floorTex: Tex.F_WATER },
      ] as const;
    case ZoneFaction.CITIZEN:
    default:
      return [
        { type: RoomType.COMMON, name: 'общая ожидания', wallTex: Tex.PANEL, floorTex: Tex.F_PARQUET },
        { type: RoomType.KITCHEN, name: 'чайная очередь', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.STORAGE, name: 'шкаф пайков и дел', wallTex: Tex.PANEL, floorTex: Tex.F_CONCRETE },
        { type: RoomType.MEDICAL, name: 'медицинский стол', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
        { type: RoomType.BATHROOM, name: 'санузел ожидания', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      ] as const;
  }
}

export function buildArchiveHqCompound(world: World, spec: ArchiveHqSpec): void {
  const hubX = spec.x + 12;
  const hubY = spec.y + 22;
  carveArchiveLine(world, spec.x - 34, hubY, spec.x + 64, hubY, 2, spec.floorTex);
  carveArchiveLine(world, hubX, hubY, spec.linkX, spec.linkY, 1, spec.floorTex);

  const hq = stampOwnedArchiveRoom(
    world,
    RoomType.HQ,
    spec.x,
    spec.y,
    24,
    16,
    spec.name,
    spec.owner,
    spec.wallTex,
    spec.floorTex,
  );
  if (hq) {
    markArchiveHermeticShell(world, hq);
    decorateArchiveMicroRoom(world, hq, spec.owner, 0);
    const outside = addArchiveDoorOnSide(world, hq, 'south', DoorState.HERMETIC_OPEN);
    carveArchiveLine(world, outside.x, outside.y, hubX, hubY, 1, spec.floorTex);
  }

  const placements = [
    { dx: -30, dy: 2, w: 22, h: 11, side: 'east' as const },
    { dx: 32, dy: 2, w: 22, h: 11, side: 'west' as const },
    { dx: -28, dy: 30, w: 20, h: 10, side: 'north' as const },
    { dx: 7, dy: 31, w: 16, h: 9, side: 'north' as const },
    { dx: 32, dy: 30, w: 22, h: 10, side: 'north' as const },
  ] as const;
  const supports = archiveHqSupportSpecs(spec.owner);
  for (let i = 0; i < supports.length; i++) {
    const support = supports[i];
    const place = placements[i];
    const room = stampOwnedArchiveRoom(
      world,
      support.type,
      spec.x + place.dx,
      spec.y + place.dy,
      place.w,
      place.h,
      `${spec.name}: ${support.name}`,
      spec.owner,
      support.wallTex,
      support.floorTex,
    );
    if (!room) continue;
    decorateArchiveMicroRoom(world, room, spec.owner, i + 1);
    const outside = addArchiveDoorOnSide(world, room, place.side);
    carveArchiveLine(world, outside.x, outside.y, hubX, hubY, 1, spec.floorTex);
  }
}

export function buildRaionsovetArchiveMicroLayer(world: World): void {
  for (const spec of RAIONSOVET_ARCHIVE_HQ_SPECS) buildArchiveHqCompound(world, spec);
  for (const spec of RAIONSOVET_ARCHIVE_MICRO_GRIDS) buildArchiveMicroGrid(world, spec);
}

export function reinforceRaionsovetArchiveAuthoredHqTerritory(world: World): void {
  for (const spec of RAIONSOVET_ARCHIVE_HQ_SPECS) {
    for (const room of world.rooms) {
      if (!room) continue;
      if (room.name !== spec.name && !room.name.startsWith(`${spec.name}:`)) continue;
      paintArchiveRoomTerritory(world, room, spec.owner);
      if (room.type === RoomType.HQ) {
        markArchiveHermeticShell(world, room);
        room.sealed = true;
      }
    }
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(true);
}

export function decorateServiceLiftRoom(world: World, room: Room): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  placeFixedLift(world, cx, cy, LiftDirection.DOWN);
  for (let y = room.y + 5; y < room.y + room.h - 5; y += 7) {
    setFeatureIfFloor(world, room.x + 5, y, Feature.APPARATUS);
    setFeatureIfFloor(world, room.x + room.w - 6, y, Feature.MACHINE);
  }
  setFeatureIfFloor(world, cx - 5, cy, Feature.SCREEN);
  setFeatureIfFloor(world, cx + 5, cy, Feature.DESK);
}

export function expandRaionsovetArchiveGeometry(world: World, rng: () => number): void {
  paintNonRoomCells(world);
  const westStacks = createArchiveRoom(world, world.rooms.length, RoomType.STORAGE, 78, 184, 286, 296, 'Западная картотека квартирных карточек', Tex.PANEL, Tex.F_PARQUET);
  const eastStacks = createArchiveRoom(world, world.rooms.length, RoomType.STORAGE, 660, 176, 286, 318, 'Восточная картотека маршрутных дел', Tex.PANEL, Tex.F_PARQUET);
  const lowerStacks = createArchiveRoom(world, world.rooms.length, RoomType.STORAGE, 158, 690, 410, 198, 'Нижний архив спорных копий', Tex.PANEL, Tex.F_PARQUET);
  const formQueue = createArchiveRoom(world, world.rooms.length, RoomType.COMMON, 182, 62, 658, 104, 'Длинная очередь формуляров', Tex.MARBLE, Tex.F_PARQUET);
  const bridges = [
    ...buildStackCanyon(world, westStacks, true, rng),
    ...buildStackCanyon(world, eastStacks, true, rng),
    ...buildStackCanyon(world, lowerStacks, false, rng),
    ...buildStackCanyon(world, formQueue, false, rng),
  ];
  const landmarks = [
    ...buildBraidedArchiveStack(world, westStacks, rng),
    ...buildBraidedArchiveStack(world, eastStacks, rng),
    ...buildBraidedArchiveStack(world, lowerStacks, rng),
  ];
  const loopNodes = buildArchiveLoop(world);

  for (let i = 1; i < bridges.length; i++) {
    if (i % 2 === 0) carveArchiveLine(world, bridges[i - 1].x, bridges[i - 1].y, bridges[i].x, bridges[i].y, 1, Tex.F_MARBLE_TILE);
  }
  for (const node of loopNodes) setFeatureIfFloor(world, node.x, node.y, Feature.LAMP);
  for (const point of landmarks) carveArchiveLine(world, point.x, point.y, 512, point.y < 512 ? 256 : 768, 1, Tex.F_MARBLE_TILE);
  decorateDocumentLane(world, 142, 256, 884, 256);
  decorateDocumentLane(world, 142, 512, 884, 512);
  decorateDocumentLane(world, 142, 768, 884, 768);
  decorateDocumentLane(world, 256, 154, 256, 864);
  decorateDocumentLane(world, 512, 154, 512, 864);
  decorateDocumentLane(world, 768, 154, 768, 864);

  const counterHall = createArchiveRoom(world, world.rooms.length, RoomType.OFFICE, 392, 418, 242, 36, 'Мост счетных окон', Tex.MARBLE, Tex.F_RED_CARPET);
  const westVault = createArchiveRoom(world, world.rooms.length, RoomType.STORAGE, 174, 288, 76, 56, 'Запечатанный ряд квартирных прав', Tex.METAL, Tex.F_CONCRETE);
  const eastVault = createArchiveRoom(world, world.rooms.length, RoomType.STORAGE, 778, 308, 72, 58, 'Восточный сейф личных дел', Tex.METAL, Tex.F_CONCRETE);
  const readingPit = createArchiveRoom(world, world.rooms.length, RoomType.COMMON, 372, 594, 278, 104, 'Читальный провал личных дел', Tex.MARBLE, Tex.F_PARQUET);
  const serviceLift = createArchiveRoom(world, world.rooms.length, RoomType.PRODUCTION, 706, 548, 88, 62, 'Служебный лифт документов', Tex.METAL, Tex.F_CONCRETE);

  connectArchiveRoomToPoint(world, counterHall, 530, 464, Tex.F_MARBLE_TILE);
  connectArchiveRoomToPoint(world, westVault, 256, 256, Tex.F_MARBLE_TILE);
  connectArchiveRoomToPoint(world, eastVault, 768, 256, Tex.F_MARBLE_TILE);
  connectArchiveRoomToPoint(world, readingPit, 530, 552, Tex.F_MARBLE_TILE);
  connectArchiveRoomToPoint(world, readingPit, 512, 768, Tex.F_MARBLE_TILE);
  connectArchiveRoomToPoint(world, serviceLift, 768, 512, Tex.F_MARBLE_TILE);

  for (const room of [counterHall, westVault, eastVault, readingPit, serviceLift]) paintRoom(world, room);
  for (let x = counterHall.x + 8; x < counterHall.x + counterHall.w - 8; x += 8) {
    setFeatureIfFloor(world, x, counterHall.y + 8, Feature.DESK);
    setFeatureIfFloor(world, x, counterHall.y + counterHall.h - 8, Feature.CHAIR);
  }
  setFeatureIfFloor(world, counterHall.x + 5, counterHall.y + 5, Feature.SCREEN);
  setFeatureIfFloor(world, counterHall.x + counterHall.w - 6, counterHall.y + 5, Feature.LAMP);

  decorateVaultRoom(world, westVault);
  decorateVaultRoom(world, eastVault);
  carveReadingPit(world, readingPit);
  decorateServiceLiftRoom(world, serviceLift);
  buildRaionsovetArchiveMicroLayer(world);

  const nextContainerId = nextArchiveContainerId(world);
  addArchiveContainer(
    world, nextContainerId, westVault, westVault.x + westVault.w - 6, westVault.y + westVault.h - 6,
    ContainerKind.SAFE,
    'Пломбированный шкаф квартирного ряда',
    'locked',
    [
      { defId: 'personal_file_copy', count: 1 },
      { defId: 'stolen_archive_card', count: 1 },
      { defId: 'passport_stub', count: 1 },
    ],
    ['vault', 'apartment_rights', 'force_or_permit'],
    Faction.CITIZEN,
  );
  addArchiveContainer(
    world, nextContainerId, eastVault, eastVault.x + eastVault.w - 6, eastVault.y + 5,
    ContainerKind.FILING_CABINET,
    'Индекс вскрытых наследств',
    'faction',
    [
      { defId: 'missing_record_file', count: 1 },
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'ration_registry_extract', count: 1 },
    ],
    ['vault', 'expose_record', 'personal_file'],
    Faction.CITIZEN,
  );

  stampSurfaceSplat(world, 236, 318, 0.5, 0.5, 5, 0.45, 6021, 0.55, 0.09, 0.04, false);
  stampSurfaceSplat(world, 812, 338, 0.5, 0.5, 5, 0.35, 6022, 0.08, 0.12, 0.18, false);
  stampSurfaceSplat(world, 512, 646, 0.5, 0.5, 8, 0.22, 6023, 0.7, 0.68, 0.55, true);
  world.markCellsDirty();
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(true);
}

export function connectRoomToPoint(world: World, room: Room, tx: number, ty: number): void {
  const exit = roomExit(world, room, tx, ty);
  placeDoorAt(world, exit.wx, exit.wy, room.id);
  carveCorridor(world, exit.ox, exit.oy, tx, ty);
}

export function placeFixedLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
  const bi = world.idx(x, y + (direction === LiftDirection.UP ? 1 : -1));
  if (world.cells[bi] === Cell.FLOOR) {
    world.features[bi] = Feature.LIFT_BUTTON;
    world.liftDir[bi] = direction;
  }
}

export function addDrop(entities: Entity[], nextId: { v: number }, x: number, y: number, defId: string, count = 1): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

export function decorateArchive(world: World, rooms: ArchiveRooms): void {
  const { waiting, clerk, catalog, shelves, stamp, fire, heir, market, checker } = rooms;

  for (let x = waiting.x + 3; x < waiting.x + waiting.w - 3; x += 3) {
    setFeatureIfFloor(world, x, waiting.y + 4, Feature.CHAIR);
    setFeatureIfFloor(world, x, waiting.y + 8, Feature.CHAIR);
  }
  setFeatureIfFloor(world, waiting.x + 2, waiting.y + 2, Feature.SCREEN);
  setFeatureIfFloor(world, waiting.x + waiting.w - 3, waiting.y + 2, Feature.LAMP);

  for (let x = clerk.x + 2; x < clerk.x + clerk.w - 2; x++) setFeatureIfFloor(world, x, clerk.y + clerk.h - 3, Feature.DESK);
  for (let x = clerk.x + 4; x < clerk.x + clerk.w - 4; x += 5) setFeatureIfFloor(world, x, clerk.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, clerk.x + 2, clerk.y + 2, Feature.LAMP);

  for (let x = catalog.x + 4; x < catalog.x + catalog.w - 2; x += 4) {
    for (let y = catalog.y + 2; y < catalog.y + catalog.h - 2; y++) {
      if ((y - catalog.y) % 5 === 0) continue;
      setShelfWall(world, x, y);
    }
  }
  setFeatureIfFloor(world, catalog.x + 2, catalog.y + 2, Feature.LAMP);
  setFeatureIfFloor(world, catalog.x + catalog.w - 3, catalog.y + catalog.h - 3, Feature.SCREEN);

  for (let x = shelves.x + 3; x < shelves.x + shelves.w - 2; x += 5) {
    for (let y = shelves.y + 2; y < shelves.y + shelves.h - 2; y++) {
      if ((y - shelves.y) % 6 === 0) continue;
      setShelfWall(world, x, y);
    }
  }
  setFeatureIfFloor(world, shelves.x + shelves.w - 3, shelves.y + 2, Feature.LAMP);
  stampSurfaceSplat(world, shelves.x + 5, shelves.y + shelves.h - 5, 0.5, 0.5, 3, 0.65, 41, 0.7, 0.12, 0.05, false);

  for (let x = stamp.x + 3; x < stamp.x + stamp.w - 3; x += 4) setFeatureIfFloor(world, x, stamp.y + 3, Feature.DESK);
  setFeatureIfFloor(world, stamp.x + stamp.w - 4, stamp.y + stamp.h - 3, Feature.APPARATUS);
  setFeatureIfFloor(world, stamp.x + 2, stamp.y + stamp.h - 3, Feature.SHELF);

  for (let y = fire.y + 2; y < fire.y + fire.h - 2; y += 3) {
    setShelfWall(world, fire.x + 4, y);
    setShelfWall(world, fire.x + 10, y);
    setFeatureIfFloor(world, fire.x + fire.w - 3, y, Feature.CANDLE);
  }
  stampSurfaceSplat(world, fire.x + 5, fire.y + 5, 0.5, 0.5, 4, 0.9, 17, 0.65, 0.08, 0.04, false);

  setFeatureIfFloor(world, heir.x + 3, heir.y + 3, Feature.DESK);
  setFeatureIfFloor(world, heir.x + heir.w - 3, heir.y + 3, Feature.CHAIR);
  setFeatureIfFloor(world, heir.x + 2, heir.y + heir.h - 3, Feature.SHELF);

  setFeatureIfFloor(world, market.x + 2, market.y + 2, Feature.SCREEN);
  setFeatureIfFloor(world, market.x + market.w - 3, market.y + 2, Feature.DESK);
  setFeatureIfFloor(world, market.x + market.w - 3, market.y + market.h - 3, Feature.SHELF);

  for (let x = checker.x + 2; x < checker.x + checker.w - 2; x++) setFeatureIfFloor(world, x, checker.y + checker.h - 3, Feature.DESK);
  setFeatureIfFloor(world, checker.x + checker.w - 3, checker.y + 2, Feature.LAMP);
}

export function paintNonRoomCells(world: World): void {
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.WALL) {
      if (world.wallTex[i] === Tex.CONCRETE) world.wallTex[i] = Tex.MARBLE;
    } else if (world.roomMap[i] < 0) {
      world.floorTex[i] = Tex.F_MARBLE_TILE;
    }
  }
}

export function retuneRaionsovetArchiveZones(world: any): void {
  const storage = new Int32Array(world.zones.length);
  const office = new Int32Array(world.zones.length);
  const common = new Int32Array(world.zones.length);
  const hq = new Int32Array(world.zones.length);
  const production = new Int32Array(world.zones.length);

  for (let i = 0; i < world.cells.length; i++) {
    if (world.cells[i] !== 2) continue; // Cell.FLOOR
    const zoneId = world.zoneMap[i];
    if (zoneId < 0 || zoneId >= world.zones.length) continue;
    const room = world.rooms[world.roomMap[i]];
    if (!room) continue;
    switch (room.type) {
      case 2: // RoomType.STORAGE
        storage[zoneId]++;
        break;
      case 5: // RoomType.OFFICE
        office[zoneId]++;
        break;
      case 4: // RoomType.COMMON
        common[zoneId]++;
        break;
      case 3: // RoomType.HQ
        hq[zoneId]++;
        break;
      case 14: // RoomType.PRODUCTION
        production[zoneId]++;
        break;
    }
  }

  for (const zone of world.zones) {
    const z = zone.id;
    const archiveScore = storage[z] + production[z] * 0.8;
    const adminScore = office[z] + hq[z] * 1.2;
    const queueScore = common[z];
    if (archiveScore > 220 && archiveScore > adminScore + queueScore) {
      zone.faction = z % 5 === 0 ? 0 : 3; // ZoneFaction.WILD : SAMOSBOR
      zone.level = Math.max(zone.level, archiveScore > 520 ? 5 : 4);
    } else if (adminScore > 150) {
      zone.faction = z % 4 === 0 ? 1 : 2; // ZoneFaction.LIQUIDATOR : CITIZEN
      zone.level = Math.max(zone.level, 3);
    } else if (queueScore > 150) {
      zone.faction = 2; // ZoneFaction.CITIZEN
      zone.level = Math.max(zone.level, 2);
    }
  }
}

