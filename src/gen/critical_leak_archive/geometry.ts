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
import { generateZones, stampRoom } from '../shared';
import { CRITICAL_LEAK_ARCHIVE_ROOM_NAMES, CriticalLeakArchiveState, Point, PercolationField, ArchiveBlockSpec, FactionHqSpec, FactionHqCompound, ArchiveExpansionStats, GRID_W, GRID_H, GRID_STEP, GRID_ORIGIN, ARCHIVE_ROOM_W, ARCHIVE_ROOM_H, ARCHIVE_ROOM_GAP, ARCHIVE_AISLE_W, ARCHIVE_LANE_GAP, ARCHIVE_BLOCKS, ARCHIVE_HQ_SPECS } from "./meta";

export function gridIndex(gx: number, gy: number): number {
  return gy * GRID_W + gx;
}

export function gridCenter(gx: number, gy: number): Point {
  return {
    x: GRID_ORIGIN + gx * GRID_STEP + (GRID_STEP >> 1),
    y: GRID_ORIGIN + gy * GRID_STEP + (GRID_STEP >> 1),
  };
}

export function largestBondComponent(open: Uint8Array, east: Uint8Array, south: Uint8Array): number[] {
  const seen = new Uint8Array(GRID_W * GRID_H);
  const queue = new Int32Array(GRID_W * GRID_H);
  let best: number[] = [];

  for (let start = 0; start < open.length; start++) {
    if (!open[start] || seen[start]) continue;
    const current: number[] = [];
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      current.push(i);
      const gx = i % GRID_W;
      const gy = Math.floor(i / GRID_W);
      const candidates: number[] = [];
      if (gx + 1 < GRID_W && east[i]) candidates.push(gridIndex(gx + 1, gy));
      if (gx > 0 && east[gridIndex(gx - 1, gy)]) candidates.push(gridIndex(gx - 1, gy));
      if (gy + 1 < GRID_H && south[i]) candidates.push(gridIndex(gx, gy + 1));
      if (gy > 0 && south[gridIndex(gx, gy - 1)]) candidates.push(gridIndex(gx, gy - 1));
      for (const next of candidates) {
        if (!open[next] || seen[next]) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (current.length > best.length) best = current;
  }

  return best;
}

export function carveDisc(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  cell: Cell.FLOOR | Cell.WATER,
  state: CriticalLeakArchiveState,
): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = world.wrap(cx + dx);
      const y = world.wrap(cy + dy);
      const idx = world.idx(x, y);
      if (world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) continue;
      world.cells[idx] = cell;
      world.roomMap[idx] = -1;
      world.floorTex[idx] = cell === Cell.WATER ? Tex.F_WATER : Tex.F_MARBLE_TILE;
      world.wallTex[idx] = Tex.MARBLE;
      world.features[idx] = Feature.NONE;
      if (cell === Cell.WATER) state.wetCausewayCells++;
      else state.dryCausewayCells++;
    }
  }
}

export function carveLine(
  world: World,
  a: Point,
  b: Point,
  radius: number,
  cell: Cell.FLOOR | Cell.WATER,
  state: CriticalLeakArchiveState,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    carveDisc(
      world,
      Math.round(a.x + dx * t),
      Math.round(a.y + dy * t),
      radius,
      cell,
      state,
    );
  }
}

export function carveBentBridge(
  world: World,
  a: Point,
  b: Point,
  cell: Cell.FLOOR | Cell.WATER,
  state: CriticalLeakArchiveState,
): void {
  const mid: Point = Math.abs(a.x - b.x) > Math.abs(a.y - b.y)
    ? { x: b.x, y: a.y }
    : { x: a.x, y: b.y };
  carveLine(world, a, mid, cell === Cell.WATER ? 2 : 1, cell, state);
  carveLine(world, mid, b, cell === Cell.WATER ? 2 : 1, cell, state);
  state.bridgesAdded++;
}

export function nearestComponentCenter(world: World, from: Point, centers: readonly Point[]): Point {
  let best = centers[0] ?? { x: W >> 1, y: W >> 1 };
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const center of centers) {
    const d2 = world.dist2(from.x, from.y, center.x, center.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = center;
    }
  }
  return best;
}

export function stampNamedRoom(
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
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let yy = y - 1; yy <= y + h; yy++) {
    for (let xx = x - 1; xx <= x + w; xx++) {
      const idx = world.idx(xx, yy);
      if (world.roomMap[idx] === room.id) {
        world.floorTex[idx] = floorTex;
      } else if (world.cells[idx] === Cell.WALL) {
        world.wallTex[idx] = wallTex;
      }
    }
  }
  return room;
}

export function addDoor(world: World, room: Room, side: 'north' | 'south' | 'west' | 'east', offset: number, state = DoorState.CLOSED): Point {
  const wx = side === 'west' ? room.x - 1 : side === 'east' ? room.x + room.w : room.x + offset;
  const wy = side === 'north' ? room.y - 1 : side === 'south' ? room.y + room.h : room.y + offset;
  const idx = world.idx(wx, wy);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = Tex.DOOR_METAL;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
  room.doors.push(idx);
  if (side === 'north') return { x: world.wrap(wx), y: world.wrap(wy - 1) };
  if (side === 'south') return { x: world.wrap(wx), y: world.wrap(wy + 1) };
  if (side === 'west') return { x: world.wrap(wx - 1), y: world.wrap(wy) };
  return { x: world.wrap(wx + 1), y: world.wrap(wy) };
}

export function canStampArchiveRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 2 || y < 2 || x + w + 2 >= W || y + h + 2 >= W) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) return false;
    }
  }
  return true;
}

export function stampArchiveRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room | null {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!canStampArchiveRoom(world, rx, ry, w, h)) return null;
  return stampNamedRoom(world, type, rx, ry, w, h, name, wallTex, floorTex);
}

export function carveArchiveCell(
  world: World,
  x: number,
  y: number,
  cell: Cell.FLOOR | Cell.WATER,
  floorTex: Tex,
  wallTex = Tex.MARBLE,
): void {
  const idx = world.idx(x, y);
  if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) return;
  if (world.roomMap[idx] >= 0) return;
  world.cells[idx] = cell;
  world.roomMap[idx] = -1;
  world.floorTex[idx] = cell === Cell.WATER ? Tex.F_WATER : floorTex;
  world.wallTex[idx] = wallTex;
  world.hermoWall[idx] = 0;
  if (world.features[idx] !== Feature.LIFT_BUTTON) world.features[idx] = Feature.NONE;
}

export function carveArchiveRect(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  cell: Cell.FLOOR | Cell.WATER,
  floorTex: Tex,
  wallTex = Tex.MARBLE,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) carveArchiveCell(world, xx, yy, cell, floorTex, wallTex);
  }
}

export function carveArchiveLine(
  world: World,
  a: Point,
  b: Point,
  radius: number,
  cell: Cell.FLOOR | Cell.WATER,
  floorTex: Tex,
  wallTex = Tex.MARBLE,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.abs(dx), Math.abs(dy));
  const r2 = radius * radius;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(a.x + dx * t);
    const y = Math.round(a.y + dy * t);
    for (let yy = -radius; yy <= radius; yy++) {
      for (let xx = -radius; xx <= radius; xx++) {
        if (xx * xx + yy * yy > r2) continue;
        carveArchiveCell(world, x + xx, y + yy, cell, floorTex, wallTex);
      }
    }
  }
}

export function carveArchiveBentRoute(
  world: World,
  a: Point,
  b: Point,
  radius: number,
  cell: Cell.FLOOR | Cell.WATER,
  floorTex: Tex,
  wallTex = Tex.MARBLE,
): void {
  const mid: Point = Math.abs(world.delta(a.x, b.x)) > Math.abs(world.delta(a.y, b.y))
    ? { x: b.x, y: a.y }
    : { x: a.x, y: b.y };
  carveArchiveLine(world, a, mid, radius, cell, floorTex, wallTex);
  carveArchiveLine(world, mid, b, radius, cell, floorTex, wallTex);
}

export function archiveMicroRoomType(serial: number): RoomType {
  switch (serial % 12) {
    case 0: return RoomType.OFFICE;
    case 1: return RoomType.BATHROOM;
    case 2: return RoomType.KITCHEN;
    case 3: return RoomType.COMMON;
    case 4: return RoomType.MEDICAL;
    default: return RoomType.STORAGE;
  }
}

export function decorateMicroArchiveRoom(world: World, room: Room, serial: number): void {
  if (room.type === RoomType.BATHROOM) {
    setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.TOILET);
    return;
  }
  if (room.type === RoomType.KITCHEN) {
    setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
    setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
    return;
  }
  if (room.type === RoomType.OFFICE || room.type === RoomType.MEDICAL) {
    setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
    setFeature(world, room.x + room.w - 3, room.y + 2, serial % 2 === 0 ? Feature.SCREEN : Feature.APPARATUS);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
    return;
  }
  for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) {
    setFeature(world, x, room.y + 2, Feature.SHELF);
    if (room.h > 6) setFeature(world, x, room.y + room.h - 3, serial % 5 === 0 ? Feature.TABLE : Feature.SHELF);
  }
  if (serial % 7 === 0) setFeature(world, room.x + room.w - 3, room.y + 2, Feature.LAMP);
}

export function paintRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.factionControl[world.idx(room.x + dx, room.y + dy)] = owner;
    }
  }
}

export function markHermeticRoomShell(world: World, room: Room): void {
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const border = dx < 0 || dx >= room.w || dy < 0 || dy >= room.h;
      if (!border) continue;
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
}

export function connectPointToField(world: World, field: PercolationField, point: Point, wet: boolean, floorTex: Tex): void {
  const target = nearestComponentCenter(world, point, field.centers);
  carveArchiveBentRoute(world, point, target, wet ? 1 : 0, wet ? Cell.WATER : Cell.FLOOR, floorTex);
}

export function stampArchiveBlock(world: World, field: PercolationField, spec: ArchiveBlockSpec, serialBase: number): { rooms: Room[]; placed: boolean } {
  const rooms: Room[] = [];
  const stride = ARCHIVE_ROOM_W + ARCHIVE_ROOM_GAP;
  const width = spec.cols * ARCHIVE_ROOM_W + (spec.cols - 1) * ARCHIVE_ROOM_GAP;
  const laneSpan = ARCHIVE_ROOM_H * 2 + ARCHIVE_AISLE_W;
  const height = spec.lanes * laneSpan + (spec.lanes - 1) * ARCHIVE_LANE_GAP;
  const left = Math.round(spec.cx - width / 2);
  const top = Math.round(spec.cy - height / 2);
  const aisleCell = spec.wet ? Cell.WATER : Cell.FLOOR;
  const aisleTex = spec.wet ? Tex.F_WATER : Tex.F_MARBLE_TILE;
  let firstAisle: Point | null = null;
  let previousAisleY = -1;

  for (let lane = 0; lane < spec.lanes; lane++) {
    const laneTop = top + lane * (laneSpan + ARCHIVE_LANE_GAP);
    const aisleY = laneTop + ARCHIVE_ROOM_H + 1;
    firstAisle ??= { x: spec.cx, y: aisleY };
    carveArchiveRect(world, left - 4, aisleY, width + 8, 1, aisleCell, aisleTex);
    if (previousAisleY >= 0) {
      carveArchiveLine(world, { x: left - 2, y: previousAisleY }, { x: left - 2, y: aisleY }, 0, aisleCell, aisleTex);
      carveArchiveLine(world, { x: left + width + 1, y: previousAisleY }, { x: left + width + 1, y: aisleY }, 0, aisleCell, aisleTex);
    }
    previousAisleY = aisleY;

    for (let col = 0; col < spec.cols; col++) {
      const roomX = left + col * stride;
      const topRoomY = aisleY - 1 - ARCHIVE_ROOM_H;
      const bottomRoomY = aisleY + ARCHIVE_AISLE_W - 1;
      for (const [roomY, side, rowTag] of [
        [topRoomY, 'south', 'верхняя'],
        [bottomRoomY, 'north', 'нижняя'],
      ] as const) {
        const serial = serialBase + rooms.length + lane * 31 + col * 7 + (rowTag === 'нижняя' ? 3 : 0);
        const room = stampArchiveRoom(
          world,
          archiveMicroRoomType(serial),
          roomX,
          roomY,
          ARCHIVE_ROOM_W,
          ARCHIVE_ROOM_H,
          `${spec.prefix}: ${rowTag} ячейка ${lane + 1}.${col + 1}`,
          spec.wet ? Tex.TILE_W : Tex.MARBLE,
          spec.wet && serial % 4 === 0 ? Tex.F_WATER : Tex.F_PARQUET,
        );
        if (!room) continue;
        addDoor(world, room, side, Math.floor(room.w / 2));
        decorateMicroArchiveRoom(world, room, serial);
        rooms.push(room);
      }
    }
  }

  if (firstAisle) {
    const target = nearestComponentCenter(world, firstAisle, field.centers);
    const exitX = world.delta(firstAisle.x, target.x) < 0 ? left - 6 : left + width + 6;
    carveArchiveLine(world, firstAisle, { x: exitX, y: firstAisle.y }, 1, aisleCell, aisleTex);
    connectPointToField(world, field, { x: exitX, y: firstAisle.y }, !!spec.wet, aisleTex);
  }

  return { rooms, placed: rooms.length > 0 };
}

export function hqOwnerName(owner: TerritoryOwner): string {
  switch (owner) {
    case ZoneFaction.LIQUIDATOR: return 'ликвидаторов';
    case ZoneFaction.CULTIST: return 'культистов';
    case ZoneFaction.SCIENTIST: return 'ученых';
    case ZoneFaction.WILD: return 'диких';
    case ZoneFaction.CITIZEN:
    default: return 'граждан';
  }
}

export function decorateHqSupportRoom(world: World, room: Room): void {
  if (room.type === RoomType.KITCHEN) {
    setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
    setFeature(world, room.x + 4, room.y + room.h - 3, Feature.TABLE);
  } else if (room.type === RoomType.BATHROOM) {
    setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.TOILET);
  } else if (room.type === RoomType.MEDICAL) {
    setFeature(world, room.x + 2, room.y + 2, Feature.APPARATUS);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.DESK);
  } else if (room.type === RoomType.OFFICE) {
    setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SCREEN);
  } else {
    for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) setFeature(world, x, room.y + 2, Feature.SHELF);
  }
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
}

export function stampFactionHqCompound(world: World, field: PercolationField, spec: FactionHqSpec): FactionHqCompound | null {
  const attempts: readonly Point[] = [
    { x: spec.x, y: spec.y },
    { x: spec.x + 18, y: spec.y },
    { x: spec.x - 18, y: spec.y + 18 },
    { x: spec.x, y: spec.y - 18 },
  ];
  for (const attempt of attempts) {
    const core = stampArchiveRoom(
      world,
      RoomType.HQ,
      attempt.x,
      attempt.y,
      24,
      16,
      `Штаб ${spec.label}`,
      spec.wallTex,
      spec.floorTex,
    );
    if (!core) continue;
    markHermeticRoomShell(world, core);
    setFeature(world, core.x + 4, core.y + 3, Feature.DESK);
    setFeature(world, core.x + core.w - 5, core.y + 3, Feature.SCREEN);
    setFeature(world, core.x + core.w - 5, core.y + core.h - 4, Feature.LAMP);

    const supportRooms: Room[] = [];
    const supportSpecs = [
      { type: RoomType.KITCHEN, x: core.x - 20, y: core.y + 1, w: 14, h: 9, side: 'east' as const, name: 'кухня' },
      { type: RoomType.BATHROOM, x: core.x - 18, y: core.y + 14, w: 12, h: 8, side: 'east' as const, name: 'санузел' },
      { type: RoomType.STORAGE, x: core.x + core.w + 6, y: core.y + 1, w: 15, h: 9, side: 'west' as const, name: 'кладовая' },
      { type: spec.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.OFFICE, x: core.x + core.w + 6, y: core.y + 14, w: 16, h: 9, side: 'west' as const, name: spec.owner === ZoneFaction.SCIENTIST ? 'медпункт' : 'кабинет' },
    ];
    for (const support of supportSpecs) {
      const room = stampArchiveRoom(
        world,
        support.type,
        support.x,
        support.y,
        support.w,
        support.h,
        `Опора ${hqOwnerName(spec.owner)}: ${support.name}`,
        spec.wallTex,
        support.type === RoomType.BATHROOM ? Tex.F_TILE : spec.floorTex,
      );
      if (!room) continue;
      const exit = addDoor(world, room, support.side, Math.floor(room.h / 2));
      carveArchiveLine(world, exit, { x: core.x + (core.w >> 1), y: exit.y }, 0, Cell.FLOOR, spec.floorTex, spec.wallTex);
      decorateHqSupportRoom(world, room);
      supportRooms.push(room);
    }

    const coreExit = addDoor(world, core, 'south', Math.floor(core.w / 2), DoorState.HERMETIC_CLOSED);
    carveArchiveLine(world, coreExit, { x: coreExit.x, y: coreExit.y + 5 }, 1, Cell.FLOOR, spec.floorTex, spec.wallTex);
    connectPointToField(world, field, { x: coreExit.x, y: coreExit.y + 5 }, spec.floorTex === Tex.F_WATER, spec.floorTex);
    return { owner: spec.owner, core, supportRooms };
  }
  return null;
}

export function expandArchiveMidAndMicro(world: World, field: PercolationField): ArchiveExpansionStats {
  const hqCompounds: FactionHqCompound[] = [];
  for (const spec of ARCHIVE_HQ_SPECS) {
    const hq = stampFactionHqCompound(world, field, spec);
    if (hq) hqCompounds.push(hq);
  }

  let blocks = 0;
  let microRooms = 0;
  for (let i = 0; i < ARCHIVE_BLOCKS.length; i++) {
    const result = stampArchiveBlock(world, field, ARCHIVE_BLOCKS[i], i * 101);
    if (result.placed) blocks++;
    microRooms += result.rooms.length;
  }

  return {
    blocks,
    microRooms,
    hqRooms: hqCompounds.length,
    supportRooms: hqCompounds.reduce((sum, hq) => sum + hq.supportRooms.length, 0),
    hqCompounds,
  };
}

export function paintCriticalLeakHqTerritory(world: World, compounds: readonly FactionHqCompound[]): void {
  for (const compound of compounds) {
    paintRoomTerritory(world, compound.core, compound.owner);
    for (const room of compound.supportRooms) paintRoomTerritory(world, room, compound.owner);
  }
}

export function placeLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const liftIdx = world.idx(x, y);
  world.cells[liftIdx] = Cell.LIFT;
  world.wallTex[liftIdx] = Tex.LIFT_DOOR;
  world.roomMap[liftIdx] = -1;
  world.liftDir[liftIdx] = direction;
  const buttonIdx = world.idx(buttonX, buttonY);
  if (world.cells[buttonIdx] === Cell.FLOOR) world.features[buttonIdx] = Feature.LIFT_BUTTON;
  world.liftDir[buttonIdx] = direction;
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.WATER) world.features[idx] = feature;
}

export function decorateArchiveRooms(world: World, rooms: Record<keyof typeof CRITICAL_LEAK_ARCHIVE_ROOM_NAMES, Room>): void {
  for (const room of [rooms.dryIndex, rooms.disputedStack]) {
    for (let y = room.y + 3; y < room.y + room.h - 2; y += 4) {
      for (let x = room.x + 3; x < room.x + room.w - 3; x++) {
        if ((x - room.x) % 9 === 0) continue;
        setFeature(world, x, y, Feature.SHELF);
      }
    }
  }
  for (let x = rooms.trade.x + 3; x < rooms.trade.x + rooms.trade.w - 3; x += 6) {
    setFeature(world, x, rooms.trade.y + 4, Feature.DESK);
  }
  for (const room of Object.values(rooms)) {
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.LAMP);
  }
  setFeature(world, rooms.floodgate.x + 6, rooms.floodgate.y + 5, Feature.APPARATUS);
  setFeature(world, rooms.floodgate.x + 12, rooms.floodgate.y + 5, Feature.SCREEN);
  setFeature(world, rooms.shortcut.x + 5, rooms.shortcut.y + 4, Feature.SINK);
  setFeature(world, rooms.dryingRoom.x + 5, rooms.dryingRoom.y + 5, Feature.MACHINE);
}

export function carveContaminatedShortcut(world: World, from: Point, to: Point, state: CriticalLeakArchiveState): void {
  const before = state.wetCausewayCells;
  carveBentBridge(world, from, { x: 750, y: 524 }, Cell.WATER, state);
  carveBentBridge(world, { x: 750, y: 524 }, to, Cell.WATER, state);
  state.contaminatedShortcutCells += state.wetCausewayCells - before;
}

export function connectAnchors(
  world: World,
  field: PercolationField,
  anchors: readonly { point: Point; wet?: boolean }[],
  state: CriticalLeakArchiveState,
): void {
  for (const anchor of anchors) {
    carveBentBridge(
      world,
      anchor.point,
      nearestComponentCenter(world, anchor.point, field.centers),
      anchor.wet ? Cell.WATER : Cell.FLOOR,
      state,
    );
  }

  carveBentBridge(world, { x: 512, y: 512 }, { x: 0, y: 512 }, Cell.FLOOR, state);
  carveBentBridge(world, { x: 512, y: 512 }, { x: W - 1, y: 512 }, Cell.WATER, state);
  carveBentBridge(world, { x: 512, y: 512 }, { x: 512, y: 0 }, Cell.FLOOR, state);
  carveBentBridge(world, { x: 512, y: 512 }, { x: 512, y: W - 1 }, Cell.WATER, state);
}

export function buildRooms(world: World): Record<keyof typeof CRITICAL_LEAK_ARCHIVE_ROOM_NAMES, Room> {
  return {
    lobby: stampNamedRoom(world, RoomType.COMMON, 488, 486, 50, 34, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.lobby, Tex.MARBLE, Tex.F_MARBLE_TILE),
    trade: stampNamedRoom(world, RoomType.OFFICE, 374, 486, 72, 30, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.trade, Tex.MARBLE, Tex.F_PARQUET),
    dryIndex: stampNamedRoom(world, RoomType.STORAGE, 230, 196, 76, 44, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.dryIndex, Tex.MARBLE, Tex.F_PARQUET),
    disputedStack: stampNamedRoom(world, RoomType.STORAGE, 706, 212, 70, 48, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.disputedStack, Tex.MARBLE, Tex.F_WATER),
    floodgate: stampNamedRoom(world, RoomType.PRODUCTION, 594, 698, 66, 34, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.floodgate, Tex.METAL, Tex.F_CONCRETE),
    shortcut: stampNamedRoom(world, RoomType.BATHROOM, 752, 494, 72, 34, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.shortcut, Tex.TILE_W, Tex.F_WATER),
    dryingRoom: stampNamedRoom(world, RoomType.PRODUCTION, 292, 698, 70, 38, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.dryingRoom, Tex.METAL, Tex.F_CONCRETE),
    witness: stampNamedRoom(world, RoomType.COMMON, 454, 318, 84, 30, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES.witness, Tex.MARBLE, Tex.F_GREEN_CARPET),
  };
}

export function tuneInitialZones(world: World): void {
  generateZones(world);
  for (const zone of world.zones) {
    const wetEast = zone.cx > 600 || zone.cy > 620;
    zone.faction = wetEast ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.level = wetEast ? 4 : 3;
    zone.fogged = false;
  }
  for (let i = 0; i < W * W; i++) {
    const zone = world.zones[world.zoneMap[i]];
    world.factionControl[i] = zone?.faction ?? ZoneFaction.CITIZEN;
  }
}

