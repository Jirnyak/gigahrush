import {
  Cell,
  DoorState,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { stampRoom } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { SPETSPRIEMNIK_ROUTE_ID, SPETSPRIEMNIK_Z, SPETSPRIEMNIK_CELL_KEY, SPETSPRIEMNIK_PERMIT_KEY, SPETSPRIEMNIK_GUARD_KEY, CX, CY, DoorSide, CellBlockResult, SupportClusterSpec, HqSpec, SpetspriemnikMetrics, HQ_SPECS, SUPPORT_CLUSTERS } from "./meta";
import { buildCore } from "./npcs";

export const metricsByWorld = new WeakMap<World, SpetspriemnikMetrics>();

export function addRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, Math.floor(x), Math.floor(y), w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) world.floorTex[ci] = floorTex;
      else world.wallTex[ci] = wallTex;
    }
  }
  return room;
}

export function makeHermeticRoom(world: World, room: Room): void {
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let y = room.y - 1; y <= room.y + room.h; y++) {
    for (let x = room.x - 1; x <= room.x + room.w; x++) {
      const ci = world.idx(x, y);
      if (world.roomMap[ci] === room.id) continue;
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
      world.wallTex[ci] = Tex.HERMO_WALL;
      world.hermoWall[ci] = 1;
    }
  }
}

export function carveRect(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
  wallTex: Tex,
  out?: Set<number>,
): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
        world.cells[ci] = Cell.FLOOR;
        world.roomMap[ci] = -1;
        world.floorTex[ci] = floorTex;
        out?.add(ci);
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

export function carveLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
  out?: Set<number>,
): void {
  const half = width >> 1;
  if (ay === by) {
    carveRect(world, Math.min(ax, bx), ay - half, Math.abs(bx - ax) + 1, width, floorTex, wallTex, out);
    return;
  }
  carveRect(world, ax - half, Math.min(ay, by), width, Math.abs(by - ay) + 1, floorTex, wallTex, out);
}

export function addDoor(
  world: World,
  room: Room,
  x: number,
  y: number,
  state = DoorState.CLOSED,
  keyId = '',
): number {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.roomMap[idx] = -1;
  world.hermoWall[idx] = 0;
  world.wallTex[idx] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED
    ? Tex.HERMO_WALL
    : state === DoorState.LOCKED
      ? Tex.DOOR_METAL
      : Tex.DOOR_WOOD;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  if (!room.doors.includes(idx)) room.doors.push(idx);
  return idx;
}

export function connectRoomToPoint(
  world: World,
  room: Room,
  side: DoorSide,
  tx: number,
  ty: number,
  state = DoorState.CLOSED,
  keyId = '',
): number {
  const midX = room.x + (room.w >> 1);
  const midY = room.y + (room.h >> 1);
  const door = side === 'north'
    ? { x: midX, y: room.y - 1, sx: midX, sy: room.y - 2 }
    : side === 'south'
      ? { x: midX, y: room.y + room.h, sx: midX, sy: room.y + room.h + 1 }
      : side === 'west'
        ? { x: room.x - 1, y: midY, sx: room.x - 2, sy: midY }
        : { x: room.x + room.w, y: midY, sx: room.x + room.w + 1, sy: midY };
  const idx = addDoor(world, room, door.x, door.y, state, keyId);
  carveLine(world, door.sx, door.sy, tx, door.sy, 3, room.floorTex, room.wallTex);
  carveLine(world, tx, door.sy, tx, ty, 3, room.floorTex, room.wallTex);
  return idx;
}

export function addGateAt(world: World, x: number, y: number, state: DoorState, keyId: string): number {
  for (let dx = -6; dx <= 6; dx++) {
    const wi = world.idx(x + dx, y);
    if (world.cells[wi] === Cell.LIFT) continue;
    world.cells[wi] = Cell.WALL;
    world.roomMap[wi] = -1;
    world.wallTex[wi] = Tex.METAL;
    world.features[wi] = Feature.NONE;
  }
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.roomMap[idx] = -1;
  world.hermoWall[idx] = 0;
  world.wallTex[idx] = Tex.DOOR_METAL;
  world.doors.set(idx, { idx, state, roomA: -1, roomB: -1, keyId, timer: 0 });
  return idx;
}

export function markProtectedRect(mask: Uint8Array, world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) mask[world.idx(x + dx, y + dy)] = 1;
  }
}

export function buildProtectedMask(world: World): Uint8Array {
  const mask = new Uint8Array(W * W);
  for (const room of world.rooms) {
    if (!room) continue;
    markProtectedRect(mask, world, room.x, room.y, room.w, room.h);
  }
  for (const idx of world.doors.keys()) mask[idx] = 1;
  for (const container of world.containers) mask[world.idx(container.x, container.y)] = 1;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT || world.features[i] === Feature.LIFT_BUTTON) mask[i] = 1;
  }
  return mask;
}

export function canStampRouteRoom(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number): boolean {
  if (x < 2 || y < 2 || x + w + 2 >= W || y + h + 2 >= W) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (mask[ci] || world.aptMask[ci]) return false;
      if (world.cells[ci] !== Cell.WALL) return false;
    }
  }
  return true;
}

export function carveSafeRect(
  world: World,
  mask: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        world.cells[ci] = Cell.FLOOR;
        world.roomMap[ci] = -1;
        world.floorTex[ci] = floorTex;
        world.hermoWall[ci] = 0;
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
        world.hermoWall[ci] = 0;
      }
    }
  }
}

export function carveSafeLine(
  world: World,
  mask: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  const half = width >> 1;
  if (ay === by) {
    carveSafeRect(world, mask, Math.min(ax, bx), ay - half, Math.abs(bx - ax) + 1, width, floorTex, wallTex);
    return;
  }
  carveSafeRect(world, mask, ax - half, Math.min(ay, by), width, Math.abs(by - ay) + 1, floorTex, wallTex);
}

export function doorOutside(room: Room, side: DoorSide): { doorX: number; doorY: number; outsideX: number; outsideY: number } {
  const midX = room.x + (room.w >> 1);
  const midY = room.y + (room.h >> 1);
  switch (side) {
    case 'north':
      return { doorX: midX, doorY: room.y - 1, outsideX: midX, outsideY: room.y - 2 };
    case 'south':
      return { doorX: midX, doorY: room.y + room.h, outsideX: midX, outsideY: room.y + room.h + 1 };
    case 'west':
      return { doorX: room.x - 1, doorY: midY, outsideX: room.x - 2, outsideY: midY };
    case 'east':
    default:
      return { doorX: room.x + room.w, doorY: midY, outsideX: room.x + room.w + 1, outsideY: midY };
  }
}

export function addRouteRoomDoor(world: World, room: Room, side: DoorSide, state = DoorState.CLOSED, keyId = ''): void {
  const p = doorOutside(room, side);
  const outside = world.idx(p.outsideX, p.outsideY);
  if (world.cells[outside] === Cell.WALL) {
    world.cells[outside] = Cell.FLOOR;
    world.roomMap[outside] = -1;
    world.floorTex[outside] = room.floorTex;
    world.hermoWall[outside] = 0;
  }
  addDoor(world, room, p.doorX, p.doorY, state, keyId);
  carveDoorStub(world, room, side, p.outsideX, p.outsideY);
}

export function carveDoorStub(world: World, room: Room, side: DoorSide, outsideX: number, outsideY: number): void {
  const dir = side === 'north'
    ? { x: 0, y: -1 }
    : side === 'south'
      ? { x: 0, y: 1 }
      : side === 'west'
        ? { x: -1, y: 0 }
        : { x: 1, y: 0 };
  let length = 0;
  for (let step = 0; step <= 32; step++) {
    const x = outsideX + dir.x * step;
    const y = outsideY + dir.y * step;
    const ci = world.idx(x, y);
    if (step > 0 && (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER)) {
      length = step;
      break;
    }
    if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) break;
  }
  if (length <= 0) length = 3;
  for (let step = 0; step <= length; step++) {
    const x = outsideX + dir.x * step;
    const y = outsideY + dir.y * step;
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
    if (world.roomMap[ci] >= 0) continue;
    world.cells[ci] = Cell.FLOOR;
    world.floorTex[ci] = room.floorTex;
    world.hermoWall[ci] = 0;
  }
}

export function decorateSupportRoom(world: World, room: Room, primary: Feature, secondary: Feature): void {
  setFeature(world, room.x + 2, room.y + 2, primary);
  setFeature(world, room.x + room.w - 3, room.y + 2, secondary);
  if (room.w >= 12) setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.LAMP);
}

export function featureForRoom(type: RoomType, alternate = false): Feature {
  switch (type) {
    case RoomType.KITCHEN: return alternate ? Feature.SINK : Feature.STOVE;
    case RoomType.BATHROOM: return alternate ? Feature.TOILET : Feature.SINK;
    case RoomType.MEDICAL: return alternate ? Feature.SHELF : Feature.APPARATUS;
    case RoomType.PRODUCTION: return alternate ? Feature.SCREEN : Feature.MACHINE;
    case RoomType.OFFICE:
    case RoomType.HQ:
      return alternate ? Feature.SCREEN : Feature.DESK;
    case RoomType.STORAGE: return alternate ? Feature.SHELF : Feature.SHELF;
    case RoomType.SMOKING: return alternate ? Feature.CHAIR : Feature.TABLE;
    case RoomType.LIVING: return alternate ? Feature.CHAIR : Feature.BED;
    case RoomType.COMMON:
    default:
      return alternate ? Feature.CHAIR : Feature.TABLE;
  }
}

export function tryStampOwnedRoom(
  world: World,
  mask: Uint8Array,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  doorSide: DoorSide,
  owner: TerritoryOwner,
  hermetic = false,
): Room | null {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!canStampRouteRoom(world, mask, rx, ry, w, h)) return null;
  const room = addRoom(world, type, rx, ry, w, h, name, wallTex, floorTex);
  if (hermetic) makeHermeticRoom(world, room);
  addRouteRoomDoor(world, room, doorSide, hermetic ? DoorState.HERMETIC_OPEN : DoorState.CLOSED);
  decorateSupportRoom(world, room, featureForRoom(type), featureForRoom(type, true));
  paintRoomTerritory(world, room, owner);
  markProtectedRect(mask, world, room.x, room.y, room.w, room.h);
  return room;
}

export function paintRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) world.factionControl[world.idx(room.x + dx, room.y + dy)] = owner;
  }
}

export function hqName(spec: HqSpec): string {
  return `Штаб спецприёмника: ${spec.title}`;
}

export function buildHqCompound(world: World, mask: Uint8Array, spec: HqSpec): void {
  carveSafeLine(world, mask, spec.x - 36, spec.y + 28, spec.x + 110, spec.y + 28, 5, spec.supportFloorTex, spec.supportWallTex);
  carveSafeLine(world, mask, spec.x + 42, spec.y - 24, spec.x + 42, spec.y + 82, 5, spec.supportFloorTex, spec.supportWallTex);
  const core = tryStampOwnedRoom(
    world,
    mask,
    RoomType.HQ,
    spec.x,
    spec.y,
    32,
    20,
    hqName(spec),
    spec.wallTex,
    spec.floorTex,
    'south',
    spec.owner,
    true,
  );
  if (core) {
    setFeature(world, core.x + 5, core.y + 5, Feature.SCREEN);
    setFeature(world, core.x + core.w - 6, core.y + core.h - 5, Feature.DESK);
  }

  const supports: readonly [RoomType, number, number, number, number, DoorSide, string][] = [
    [RoomType.COMMON, -38, 33, 30, 16, 'north', 'общая'],
    [RoomType.KITCHEN, -38, 56, 30, 14, 'north', 'кухня'],
    [RoomType.STORAGE, 42, 56, 30, 14, 'north', 'склад'],
    [RoomType.MEDICAL, 78, 33, 30, 16, 'north', 'медбокс'],
    [RoomType.OFFICE, 50, -22, 30, 14, 'west', 'дежурная'],
  ] as const;
  for (const [type, dx, dy, w, h, side, suffix] of supports) {
    tryStampOwnedRoom(
      world,
      mask,
      type,
      spec.x + dx,
      spec.y + dy,
      w,
      h,
      `${hqName(spec)}: ${suffix}`,
      spec.supportWallTex,
      spec.supportFloorTex,
      side,
      spec.owner,
    );
  }
}

export function buildSupportCluster(world: World, mask: Uint8Array, spec: SupportClusterSpec, rng: () => number): void {
  if (spec.axis === 'vertical') {
    const corridorX = spec.x + 70;
    const top = spec.y - 10;
    const bottom = spec.y + spec.rooms * spec.step + 12;
    carveSafeLine(world, mask, corridorX, top, corridorX, bottom, 5, spec.floorTex, spec.wallTex);
    for (let row = 0; row < spec.rooms; row++) {
      const jitter = Math.floor(rng() * 3) - 1;
      const y = spec.y + row * spec.step + jitter;
      const typeL = row % 2 === 0 ? spec.typeA : spec.typeB;
      const typeR = row % 3 === 0 ? RoomType.BATHROOM : row % 2 === 0 ? spec.typeB : spec.typeA;
      tryStampOwnedRoom(world, mask, typeL, corridorX - spec.roomW - 3, y, spec.roomW, spec.roomH, `${spec.name}: левая ${row + 1}`, spec.wallTex, spec.floorTex, 'east', spec.owner);
      tryStampOwnedRoom(world, mask, typeR, corridorX + 4, y, spec.roomW, spec.roomH, `${spec.name}: правая ${row + 1}`, spec.wallTex, spec.floorTex, 'west', spec.owner);
      if (row % 3 === 1) carveSafeLine(world, mask, corridorX - 26, y + spec.roomH + 5, corridorX + 26, y + spec.roomH + 5, 3, spec.floorTex, spec.wallTex);
    }
    return;
  }

  const corridorY = spec.y + 32;
  const left = spec.x - 10;
  const right = spec.x + spec.rooms * spec.step + 12;
  carveSafeLine(world, mask, left, corridorY, right, corridorY, 5, spec.floorTex, spec.wallTex);
  for (let col = 0; col < spec.rooms; col++) {
    const jitter = Math.floor(rng() * 3) - 1;
    const x = spec.x + col * spec.step + jitter;
    const typeT = col % 2 === 0 ? spec.typeA : spec.typeB;
    const typeB = col % 3 === 0 ? RoomType.BATHROOM : col % 2 === 0 ? spec.typeB : spec.typeA;
    tryStampOwnedRoom(world, mask, typeT, x, corridorY - spec.roomH - 3, spec.roomW, spec.roomH, `${spec.name}: верхняя ${col + 1}`, spec.wallTex, spec.floorTex, 'south', spec.owner);
    tryStampOwnedRoom(world, mask, typeB, x, corridorY + 4, spec.roomW, spec.roomH, `${spec.name}: нижняя ${col + 1}`, spec.wallTex, spec.floorTex, 'north', spec.owner);
    if (col % 3 === 1) carveSafeLine(world, mask, x + spec.roomW + 5, corridorY - 20, x + spec.roomW + 5, corridorY + 20, 3, spec.floorTex, spec.wallTex);
  }
}

export function buildSpetspriemnikMidSpines(world: World, mask: Uint8Array): void {
  const corridors: readonly [number, number, number, number, number, Tex, Tex][] = [
    [114, 148, 910, 148, 5, Tex.F_CONCRETE, Tex.METAL],
    [104, 512, 920, 512, 6, Tex.F_CONCRETE, Tex.METAL],
    [116, 876, 908, 876, 5, Tex.F_CONCRETE, Tex.METAL],
    [156, 120, 156, 908, 5, Tex.F_CONCRETE, Tex.METAL],
    [370, 104, 370, 924, 4, Tex.F_PARQUET, Tex.MARBLE],
    [654, 104, 654, 924, 4, Tex.F_PARQUET, Tex.MARBLE],
    [868, 120, 868, 908, 5, Tex.F_CONCRETE, Tex.METAL],
    [250, 238, 778, 238, 4, Tex.F_PARQUET, Tex.MARBLE],
    [250, 790, 778, 790, 4, Tex.F_CONCRETE, Tex.METAL],
  ];
  for (const [ax, ay, bx, by, width, floorTex, wallTex] of corridors) {
    carveSafeLine(world, mask, ax, ay, bx, by, width, floorTex, wallTex);
  }
  for (const [x, y] of [[156, 148], [868, 148], [156, 876], [868, 876], [370, 512], [654, 512]] as const) {
    setFeature(world, x, y, Feature.LAMP);
  }
}

export function expandSpetspriemnikRouteGeometry(world: World, rng: () => number): void {
  const mask = buildProtectedMask(world);
  buildSpetspriemnikMidSpines(world, mask);
  for (const spec of HQ_SPECS) buildHqCompound(world, mask, spec);
  for (const spec of SUPPORT_CLUSTERS) buildSupportCluster(world, mask, spec, rng);
  world.markCellsDirty();
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(true);
}

export function reinforceSpetspriemnikRouteGates(world: World): void {
  addGateAt(world, CX, 382, DoorState.LOCKED, SPETSPRIEMNIK_PERMIT_KEY);
  addGateAt(world, CX, 650, DoorState.LOCKED, SPETSPRIEMNIK_GUARD_KEY);
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.features[ci] = feature;
  if (feature === Feature.SCREEN && !world.screenCells.includes(ci)) world.screenCells.push(ci);
}

export function setLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.liftDir[ci] = direction;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.floorTex[ci] = Tex.F_CONCRETE;
  world.roomMap[ci] = -1;
  world.features[ci] = Feature.NONE;
}

export function placeBarredSightline(world: World, x1: number, x2: number, y: number): number {
  let cells = 0;
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    if (x % 3 === 1) continue;
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
    world.cells[ci] = Cell.WALL;
    world.roomMap[ci] = -1;
    world.wallTex[ci] = Tex.METAL;
    world.hermoWall[ci] = 0;
    cells++;
  }
  return cells;
}

export function decorateRoom(world: World, room: Room, feature: Feature, altFeature = Feature.LAMP): void {
  setFeature(world, room.x + 4, room.y + 4, feature);
  setFeature(world, room.x + room.w - 5, room.y + 4, altFeature);
  setFeature(world, room.x + (room.w >> 1), room.y + room.h - 5, Feature.LAMP);
}

export function addCellRoom(
  world: World,
  serial: number,
  x: number,
  y: number,
  w: number,
  h: number,
  doorSide: 'east' | 'west',
  corridorX: number,
  shelter: boolean,
): { room: Room; lockedDoor: boolean; barredCells: number } {
  const name = shelter
    ? `Камера спецприёмника ${String(serial).padStart(2, '0')}: гермоукрытие`
    : `Камера спецприёмника ${String(serial).padStart(2, '0')}`;
  const room = addRoom(world, RoomType.LIVING, x, y, w, h, name, shelter ? Tex.HERMO_WALL : Tex.METAL, Tex.F_CONCRETE);
  if (shelter) makeHermeticRoom(world, room);
  decorateRoom(world, room, Feature.BED, serial % 2 === 0 ? Feature.SHELF : Feature.CHAIR);

  const doorY = room.y + (room.h >> 1);
  const doorX = doorSide === 'east' ? room.x + room.w : room.x - 1;
  const state = shelter ? DoorState.HERMETIC_OPEN : serial % 3 === 0 ? DoorState.CLOSED : DoorState.LOCKED;
  const keyId = state === DoorState.LOCKED ? SPETSPRIEMNIK_CELL_KEY : '';
  addDoor(world, room, doorX, doorY, state, keyId);
  const startX = doorSide === 'east' ? doorX + 1 : doorX - 1;
  carveLine(world, startX, doorY, corridorX, doorY, 3, Tex.F_CONCRETE, Tex.METAL);
  const barredCells = placeBarredSightline(
    world,
    Math.min(room.x + 3, corridorX),
    Math.max(room.x + room.w - 3, corridorX),
    room.y - 2,
  );
  return { room, lockedDoor: state === DoorState.LOCKED, barredCells };
}

export function buildCellblockBsp(
  world: World,
  blockX: number,
  blockY: number,
  serialStart: number,
): CellBlockResult {
  const result: CellBlockResult = { rooms: [], shelterRooms: 0, lockedDoors: 0, barredCells: 0 };
  const corridorX = blockX + 108;
  carveLine(world, corridorX, blockY + 20, corridorX, blockY + 365, 8, Tex.F_CONCRETE, Tex.METAL);
  for (let row = 0; row < 6; row++) {
    const y = blockY + 24 + row * 54;
    for (const side of ['left', 'right'] as const) {
      const serial = serialStart + row * 2 + (side === 'left' ? 0 : 1);
      const shelter = serial % 5 === 0 || serial === 3;
      const roomX = side === 'left' ? blockX + 12 : corridorX + 30;
      const { room, lockedDoor, barredCells } = addCellRoom(
        world,
        serial,
        roomX,
        y,
        68,
        34,
        side === 'left' ? 'east' : 'west',
        corridorX,
        shelter,
      );
      result.rooms.push(room);
      if (shelter) result.shelterRooms++;
      if (lockedDoor) result.lockedDoors++;
      result.barredCells += barredCells;
    }
  }
  return result;
}

export function tuneSpetspriemnikRouteZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    const inCellblock = zone.cx >= 210 && zone.cx <= 825 && zone.cy >= 300 && zone.cy <= 700;
    const inRiotYard = zone.cx >= 360 && zone.cx <= 660 && zone.cy >= 705 && zone.cy <= 845;
    zone.level = Math.max(2, Math.min(5, Math.round(2 + d / 260)));
    zone.fogged = false;
    if (inRiotYard) {
      zone.faction = zone.id % 3 === 0 ? ZoneFaction.SAMOSBOR : ZoneFaction.WILD;
      zone.level = Math.max(zone.level, 4);
    } else if (inCellblock) {
      zone.faction = zone.id % 5 === 0 ? ZoneFaction.WILD : ZoneFaction.LIQUIDATOR;
      zone.level = Math.max(zone.level, 3);
    } else {
      zone.faction = zone.id % 6 === 0 ? ZoneFaction.CITIZEN : ZoneFaction.LIQUIDATOR;
    }
  }
}

export function calculateMetrics(world: World, built: ReturnType<typeof buildCore>): SpetspriemnikMetrics {
  return {
    routeId: SPETSPRIEMNIK_ROUTE_ID,
    z: SPETSPRIEMNIK_Z,
    cellRooms: built.cellRooms.length,
    shelterCellRooms: built.shelterCellRooms,
    lockedCellDoors: built.lockedCellDoors,
    lockedPermitDoors: built.lockedPermitDoors,
    guardLoopCells: built.guardLoopCells,
    barredSightlineCells: built.barredSightlineCells,
    hostageContainers: world.containers.filter(container => container.tags.includes('hostage_economy') || container.tags.includes('hostage_list')).length,
    riotHoldQuestBounded: true,
    stablePrisonerNpcIds: ['spetspriemnik_prisoner_mira', 'spetspriemnik_informant_tolya'],
  };
}

export function measureSpetspriemnikMetrics(generation: FloorGeneration): SpetspriemnikMetrics {
  const cached = metricsByWorld.get(generation.world);
  if (cached) return cached;
  const cellRooms = generation.world.rooms.filter(room => room.name.startsWith('Камера спецприёмника '));
  return {
    routeId: SPETSPRIEMNIK_ROUTE_ID,
    z: SPETSPRIEMNIK_Z,
    cellRooms: cellRooms.length,
    shelterCellRooms: cellRooms.filter(room => room.name.includes('гермоукрытие') || room.sealed).length,
    lockedCellDoors: [...generation.world.doors.values()].filter(door => door.state === DoorState.LOCKED && door.keyId === SPETSPRIEMNIK_CELL_KEY).length,
    lockedPermitDoors: [...generation.world.doors.values()].filter(door => door.state === DoorState.LOCKED && (door.keyId === SPETSPRIEMNIK_PERMIT_KEY || door.keyId === SPETSPRIEMNIK_GUARD_KEY)).length,
    guardLoopCells: 0,
    barredSightlineCells: generation.world.wallTex.reduce((count, tex, idx) => count + (tex === Tex.METAL && generation.world.cells[idx] === Cell.WALL ? 1 : 0), 0),
    hostageContainers: generation.world.containers.filter(container => container.tags.includes('hostage_economy') || container.tags.includes('hostage_list')).length,
    riotHoldQuestBounded: true,
    stablePrisonerNpcIds: ['spetspriemnik_prisoner_mira', 'spetspriemnik_informant_tolya'],
  };
}

