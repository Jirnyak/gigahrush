import {
  Cell,
  DoorState,
  EntityType,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { placeEmergencyPanel } from '../../systems/emergency_panels';
import { registerRouteCue } from '../../systems/route_cues';
import {
  placeDoorAt,
  stampRoom,
} from '../shared';
import { HARMONIC_BATHHOUSE_ROUTE_ID, HARMONIC_BATHHOUSE_BASE_FLOOR, BathhouseDecisionId, BathhouseRouteNode, BathhouseRooms, Point, NextId, SEED, CX, CY, FIELD_W, SERVICE_GRID_X, SERVICE_GRID_Y, BATHHOUSE_HQ_SPECS, BATHHOUSE_OWNER_SEQUENCE } from "./meta";

export function idxField(x: number, y: number): number {
  return y * FIELD_W + x;
}

export function initWorld(world: World): void {
  world.wallTex.fill(Tex.METAL);
  world.floorTex.fill(Tex.F_CONCRETE);
  world.factionControl.fill(ZoneFaction.LIQUIDATOR);
}

export function buildRooms(world: World): BathhouseRooms {
  const entry = addRoom(world, RoomType.CORRIDOR, CX - 46, CY + 164, 92, 28, 'Верхняя кабина парного этажа', Tex.PIPE, Tex.F_CONCRETE);
  const mixingHall = addRoom(world, RoomType.COMMON, CX - 60, CY + 84, 120, 50, 'Смесительный зал давления', Tex.TILE_W, Tex.F_TILE);
  const centralBath = addRoom(world, RoomType.BATHROOM, CX - 58, CY - 52, 116, 86, 'Гармоническая купель', Tex.TILE_W, Tex.F_TILE);
  const boiler = addRoom(world, RoomType.PRODUCTION, CX - 44, CY - 164, 88, 66, 'Котельная поющего стояка', Tex.PIPE, Tex.F_CONCRETE);
  const hotGallery = addRoom(world, RoomType.PRODUCTION, CX + 86, CY - 78, 72, 192, 'Горячий быстрый ход', Tex.PIPE, Tex.F_TILE);
  const coldBypass = addRoom(world, RoomType.BATHROOM, CX - 162, CY - 78, 76, 192, 'Холодный затопленный обход', Tex.TILE_W, Tex.F_WATER);
  const repairGallery = addRoom(world, RoomType.PRODUCTION, CX - 82, CY + 48, 164, 28, 'Галерея манометров', Tex.METAL, Tex.F_CONCRETE);
  const lowerLift = addRoom(world, RoomType.CORRIDOR, CX + 86, CY + 164, 92, 28, 'Нижняя кабина за сушилками', Tex.PIPE, Tex.F_CONCRETE);
  return { entry, mixingHall, centralBath, boiler, hotGallery, coldBypass, repairGallery, lowerLift };
}

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
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[ci] = floorTex;
      } else {
        world.wallTex[ci] = wallTex;
      }
    }
  }
  return room;
}

export function connectRooms(world: World, rooms: BathhouseRooms): void {
  connectDoorToPoint(world, rooms.entry, 'north', rooms.entry.w >> 1, { x: CX, y: CY + 148 }, 3, Tex.F_CONCRETE);
  connectDoorToPoint(world, rooms.mixingHall, 'south', rooms.mixingHall.w >> 1, { x: CX, y: CY + 148 }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.mixingHall, 'north', rooms.mixingHall.w >> 1, { x: CX, y: CY + 58 }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.repairGallery, 'south', rooms.repairGallery.w >> 1, { x: CX, y: CY + 58 }, 2, Tex.F_CONCRETE);
  connectDoorToPoint(world, rooms.repairGallery, 'north', rooms.repairGallery.w >> 1, { x: CX, y: CY + 36 }, 2, Tex.F_CONCRETE);
  connectDoorToPoint(world, rooms.centralBath, 'south', rooms.centralBath.w >> 1, { x: CX, y: CY + 36 }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.centralBath, 'north', rooms.centralBath.w >> 1, { x: CX, y: CY - 92 }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.boiler, 'south', rooms.boiler.w >> 1, { x: CX, y: CY - 92 }, 3, Tex.F_CONCRETE);
  connectDoorToPoint(world, rooms.centralBath, 'east', rooms.centralBath.h >> 1, { x: CX + 76, y: CY }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.hotGallery, 'west', rooms.hotGallery.h >> 1, { x: CX + 76, y: CY }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.centralBath, 'west', rooms.centralBath.h >> 1, { x: CX - 76, y: CY }, 3, Tex.F_WATER);
  connectDoorToPoint(world, rooms.coldBypass, 'east', rooms.coldBypass.h >> 1, { x: CX - 76, y: CY }, 3, Tex.F_WATER);
  connectDoorToPoint(world, rooms.hotGallery, 'south', rooms.hotGallery.w >> 1, { x: CX + 132, y: CY + 150 }, 3, Tex.F_TILE);
  connectDoorToPoint(world, rooms.lowerLift, 'north', 28, { x: CX + 132, y: CY + 150 }, 3, Tex.F_CONCRETE);
  connectDoorToPoint(world, rooms.coldBypass, 'south', rooms.coldBypass.w >> 1, { x: CX - 124, y: CY + 150 }, 3, Tex.F_WATER);
  carveLine(world, CX - 124, CY + 150, CX + 98, CY + 150, 3, Tex.F_CONCRETE);
  connectDoorToPoint(world, rooms.lowerLift, 'north', 66, { x: CX + 98, y: CY + 150 }, 3, Tex.F_CONCRETE);
}

export function connectDoorToPoint(
  world: World,
  room: Room,
  side: 'north' | 'south' | 'west' | 'east',
  offset: number,
  target: Point,
  width: number,
  floorTex: Tex,
  owner?: TerritoryOwner,
  hermetic = false,
): void {
  const door = doorPoint(room, side, offset);
  placeDoorAt(world, door.wall.x, door.wall.y, room.id);
  const doorInfo = world.doors.get(world.idx(door.wall.x, door.wall.y));
  if (doorInfo && hermetic) doorInfo.state = DoorState.HERMETIC_OPEN;
  if (owner !== undefined) {
    const doorIdx = world.idx(door.wall.x, door.wall.y);
    world.factionControl[doorIdx] = owner;
  }
  carveLine(world, door.outside.x, door.outside.y, target.x, target.y, width, floorTex, owner);
  restoreDoorJambs(world, room, side, door.wall, owner, hermetic);
}

export function doorPoint(room: Room, side: 'north' | 'south' | 'west' | 'east', offset: number): { wall: Point; outside: Point } {
  if (side === 'north') {
    const x = room.x + Math.max(1, Math.min(room.w - 2, offset));
    return { wall: { x, y: room.y - 1 }, outside: { x, y: room.y - 2 } };
  }
  if (side === 'south') {
    const x = room.x + Math.max(1, Math.min(room.w - 2, offset));
    return { wall: { x, y: room.y + room.h }, outside: { x, y: room.y + room.h + 1 } };
  }
  if (side === 'west') {
    const y = room.y + Math.max(1, Math.min(room.h - 2, offset));
    return { wall: { x: room.x - 1, y }, outside: { x: room.x - 2, y } };
  }
  const y = room.y + Math.max(1, Math.min(room.h - 2, offset));
  return { wall: { x: room.x + room.w, y }, outside: { x: room.x + room.w + 1, y } };
}

export function restoreDoorJambs(
  world: World,
  room: Room,
  side: 'north' | 'south' | 'west' | 'east',
  wall: Point,
  owner: TerritoryOwner | undefined,
  hermetic: boolean,
): void {
  const offsets = side === 'north' || side === 'south'
    ? [[-1, 0], [1, 0]] as const
    : [[0, -1], [0, 1]] as const;
  for (const [dx, dy] of offsets) {
    const idx = world.idx(wall.x + dx, wall.y + dy);
    if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) continue;
    if (world.roomMap[idx] >= 0) continue;
    world.cells[idx] = Cell.WALL;
    world.roomMap[idx] = -1;
    world.wallTex[idx] = hermetic ? Tex.HERMO_WALL : room.wallTex;
    world.features[idx] = Feature.NONE;
    if (hermetic) world.hermoWall[idx] = 1;
    if (owner !== undefined) world.factionControl[idx] = owner;
  }
}

export function carveLine(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex, owner?: TerritoryOwner): void {
  let x = Math.round(ax);
  let y = Math.round(ay);
  const mx = Math.round(bx);
  const my = Math.round(by);
  const sx = mx === x ? 0 : mx > x ? 1 : -1;
  const sy = my === y ? 0 : my > y ? 1 : -1;
  while (x !== mx) {
    carveDisc(world, x, y, width, floorTex, owner);
    x += sx;
  }
  while (y !== my) {
    carveDisc(world, x, y, width, floorTex, owner);
    y += sy;
  }
  carveDisc(world, x, y, width, floorTex, owner);
}

export function carveDisc(world: World, cx: number, cy: number, r: number, floorTex: Tex, owner?: TerritoryOwner): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = world.wrap(cx + dx);
      const y = world.wrap(cy + dy);
      const ci = world.idx(x, y);
      if (world.aptMask[ci]) continue;
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR || world.hermoWall[ci]) continue;
      if (owner !== undefined && world.roomMap[ci] >= 0) continue;
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = floorTex;
      world.wallTex[ci] = Tex.PIPE;
      if (owner !== undefined) world.factionControl[ci] = owner;
    }
  }
}

export function placeLifts(world: World, rooms: BathhouseRooms): void {
  placeLift(world, rooms.entry.x + 14, rooms.entry.y + 14, rooms.entry.x + 20, rooms.entry.y + 14, LiftDirection.UP);
  placeLift(world, rooms.lowerLift.x + rooms.lowerLift.w - 14, rooms.lowerLift.y + 14, rooms.lowerLift.x + rooms.lowerLift.w - 20, rooms.lowerLift.y + 14, LiftDirection.DOWN);
}

export function placeLift(world: World, liftX: number, liftY: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const li = world.idx(liftX, liftY);
  world.cells[li] = Cell.LIFT;
  world.wallTex[li] = Tex.LIFT_DOOR;
  world.liftDir[li] = direction;
  const bi = world.idx(buttonX, buttonY);
  if (world.cells[bi] === Cell.FLOOR) {
    world.features[bi] = Feature.LIFT_BUTTON;
    world.liftDir[bi] = direction;
  }
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

export function forRoomCells(world: World, room: Room, fn: (idx: number, x: number, y: number) => void): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const x = world.wrap(room.x + dx);
      const y = world.wrap(room.y + dy);
      const ci = world.idx(x, y);
      if (world.roomMap[ci] === room.id) fn(ci, x, y);
    }
  }
}

export function tuneBathhouseZones(world: World): void {
  for (const zone of world.zones) {
    const hot = zone.cx > CX + 72 && zone.cy >= CY - 110 && zone.cy <= CY + 150;
    const cold = zone.cx < CX - 72 && zone.cy >= CY - 110 && zone.cy <= CY + 150;
    const core = Math.abs(world.delta(zone.cx, CX)) < 96 && zone.cy >= CY - 178 && zone.cy <= CY + 190;
    if (hot) {
      zone.faction = ZoneFaction.SAMOSBOR;
      zone.level = Math.max(zone.level, 4);
    } else if (cold) {
      zone.faction = ZoneFaction.WILD;
      zone.level = Math.max(zone.level, 3);
    } else if (core) {
      zone.faction = ZoneFaction.LIQUIDATOR;
      zone.level = Math.max(zone.level, 4);
      zone.hasLift = true;
    } else if (zone.id % 5 === 0) {
      zone.faction = ZoneFaction.WILD;
      zone.level = Math.max(zone.level, 3);
    } else {
      zone.faction = ZoneFaction.LIQUIDATOR;
      zone.level = Math.max(zone.level, 3);
    }
    zone.fogged = false;
  }
  for (let i = 0; i < W * W; i++) world.factionControl[i] = world.zones[world.zoneMap[i]]?.faction ?? ZoneFaction.LIQUIDATOR;
}

export function expandHarmonicBathhouseRouteGeometry(world: World, rng: () => number): void {
  carveBathhouseSecondaryLoops(world);
  buildBathhouseHqCompounds(world);
  buildBathhouseServiceBlocks(world, rng);
  repairBathhouseDoorFrames(world);
  world.markCellsDirty();
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
  world.markFogDirty();
}

export function carveBathhouseSecondaryLoops(world: World): void {
  const pressureLoop = [
    { x: CX - 352, y: CY - 268 },
    { x: CX + 324, y: CY - 268 },
    { x: CX + 372, y: CY + 238 },
    { x: CX - 348, y: CY + 266 },
    { x: CX - 352, y: CY - 268 },
  ];
  const hotLoop = [
    { x: CX - 98, y: CY - 342 },
    { x: CX + 268, y: CY - 332 },
    { x: CX + 390, y: CY - 104 },
    { x: CX + 330, y: CY + 154 },
    { x: CX + 126, y: CY + 172 },
  ];
  const coldLoop = [
    { x: CX - 148, y: CY + 180 },
    { x: CX - 372, y: CY + 184 },
    { x: CX - 408, y: CY - 48 },
    { x: CX - 278, y: CY - 264 },
    { x: CX - 78, y: CY - 216 },
  ];

  carveOwnedPolyline(world, pressureLoop, 3, Tex.F_CONCRETE, ZoneFaction.LIQUIDATOR);
  carveOwnedPolyline(world, hotLoop, 3, Tex.F_TILE, ZoneFaction.LIQUIDATOR);
  carveOwnedPolyline(world, coldLoop, 3, Tex.F_WATER, ZoneFaction.WILD, Cell.WATER);
  carveLine(world, CX - 278, CY - 264, CX - 162, CY - 78, 2, Tex.F_WATER, ZoneFaction.WILD);
  carveLine(world, CX + 268, CY - 332, CX + 122, CY - 78, 2, Tex.F_TILE, ZoneFaction.LIQUIDATOR);
  carveLine(world, CX - 348, CY + 266, CX - 124, CY + 150, 2, Tex.F_CONCRETE, ZoneFaction.CITIZEN);
  carveLine(world, CX + 372, CY + 238, CX + 132, CY + 150, 2, Tex.F_CONCRETE, ZoneFaction.LIQUIDATOR);
}

export function carveOwnedPolyline(
  world: World,
  points: readonly Point[],
  width: number,
  floorTex: Tex,
  owner: TerritoryOwner,
  cell = Cell.FLOOR,
): void {
  for (let i = 1; i < points.length; i++) {
    carveOwnedLine(world, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, width, floorTex, owner, cell);
  }
}

export function carveOwnedLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  owner: TerritoryOwner,
  cell = Cell.FLOOR,
): void {
  if (ax !== bx && ay !== by) {
    carveOwnedLine(world, ax, ay, bx, ay, width, floorTex, owner, cell);
    carveOwnedLine(world, bx, ay, bx, by, width, floorTex, owner, cell);
    return;
  }
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let o = -width; o <= width; o++) {
      openBathhouseTile(world, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex, owner, cell);
    }
  }
}

export function openBathhouseTile(world: World, x: number, y: number, floorTex: Tex, owner: TerritoryOwner, cell: Cell): void {
  const idx = world.idx(x, y);
  if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR || world.hermoWall[idx]) return;
  if (world.roomMap[idx] >= 0) return;
  world.cells[idx] = cell;
  world.roomMap[idx] = -1;
  world.floorTex[idx] = cell === Cell.WATER ? Tex.F_WATER : floorTex;
  world.wallTex[idx] = Tex.PIPE;
  world.factionControl[idx] = owner;
  if (world.features[idx] !== Feature.LIFT_BUTTON) world.features[idx] = Feature.NONE;
  if (cell === Cell.WATER) world.fog[idx] = Math.max(world.fog[idx], 26);
}

export function buildBathhouseHqCompounds(world: World): void {
  for (const spec of BATHHOUSE_HQ_SPECS) {
    const cx = spec.x + 18;
    const cy = spec.y + 10;
    carveOwnedLine(world, cx - 42, cy + 26, cx + 76, cy + 26, 2, spec.floorTex, spec.owner);
    const hq = tryAddBathhouseRoom(world, RoomType.HQ, spec.x, spec.y, 36, 20, spec.name, Tex.HERMO_WALL, spec.floorTex, spec.owner);
    if (!hq) continue;
    hq.sealed = true;
    markBathhouseHermeticRoom(world, hq);
    connectDoorToPoint(world, hq, 'south', hq.w >> 1, { x: cx, y: cy + 26 }, 2, spec.floorTex, spec.owner, true);
    paintRoomOwner(world, hq, spec.owner);
    decorateBathhouseRoom(world, hq, 0, spec.owner);

    const supports = [
      { type: RoomType.BATHROOM, name: `${spec.name}: саншлюз`, x: spec.x - 30, y: spec.y + 30, w: 24, h: 12, side: 'east' as const },
      { type: RoomType.KITCHEN, name: `${spec.name}: чайная`, x: spec.x + 40, y: spec.y + 30, w: 24, h: 12, side: 'west' as const },
      { type: RoomType.STORAGE, name: `${spec.name}: склад`, x: spec.x + 70, y: spec.y + 4, w: 22, h: 12, side: 'west' as const },
      { type: spec.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.OFFICE, name: `${spec.name}: журнал`, x: spec.x - 28, y: spec.y + 4, w: 22, h: 12, side: 'east' as const },
      { type: RoomType.COMMON, name: `${spec.name}: предбанник`, x: spec.x + 12, y: spec.y + 46, w: 30, h: 12, side: 'north' as const },
    ];
    for (let i = 0; i < supports.length; i++) {
      const support = supports[i];
      const room = tryAddBathhouseRoom(world, support.type, support.x, support.y, support.w, support.h, support.name, spec.wallTex, spec.floorTex, spec.owner);
      if (!room) continue;
      connectDoorToPoint(world, room, support.side, support.side === 'north' ? room.w >> 1 : room.h >> 1, { x: cx, y: cy + 26 }, 2, spec.floorTex, spec.owner);
      decorateBathhouseRoom(world, room, i + 1, spec.owner);
      paintRoomOwner(world, room, spec.owner);
    }
  }
}

export function buildBathhouseServiceBlocks(world: World, rng: () => number): void {
  let serial = 0;
  for (let gy = 0; gy < SERVICE_GRID_Y.length; gy++) {
    for (let gx = 0; gx < SERVICE_GRID_X.length; gx++) {
      const cx = SERVICE_GRID_X[gx];
      const cy = SERVICE_GRID_Y[gy];
      if (cx >= 330 && cx <= 700 && cy >= 305 && cy <= 730) continue;
      const owner = BATHHOUSE_OWNER_SEQUENCE[(gx + gy * 2) % BATHHOUSE_OWNER_SEQUENCE.length];
      const floorTex = bathhouseOwnerFloor(owner, serial);
      const wallTex = bathhouseOwnerWall(owner);
      buildBathhouseServiceBlock(world, cx, cy, owner, floorTex, wallTex, serial++, rng);
    }
  }
}

export function buildBathhouseServiceBlock(
  world: World,
  cx: number,
  cy: number,
  owner: TerritoryOwner,
  floorTex: Tex,
  wallTex: Tex,
  serial: number,
  rng: () => number,
): void {
  const wobble = Math.round((rng() - 0.5) * 10);
  carveOwnedLine(world, cx - 66, cy, cx + 66, cy + wobble, 2, floorTex, owner);
  carveOwnedLine(world, cx, cy - 44, cx + Math.sign(wobble), cy + 44, 1, floorTex, owner);
  const hall = tryAddBathhouseRoom(world, RoomType.COMMON, cx - 22, cy - 8, 44, 16, `Гармоническая баня: смесительный узел ${serial + 1}`, wallTex, floorTex, owner);
  if (hall) {
    connectDoorToPoint(world, hall, 'west', hall.h >> 1, { x: cx - 66, y: cy }, 2, floorTex, owner);
    connectDoorToPoint(world, hall, 'east', hall.h >> 1, { x: cx + 66, y: cy + wobble }, 2, floorTex, owner);
    connectDoorToPoint(world, hall, 'north', hall.w >> 1, { x: cx, y: cy - 44 }, 1, floorTex, owner);
    connectDoorToPoint(world, hall, 'south', hall.w >> 1, { x: cx, y: cy + 44 }, 1, floorTex, owner);
    decorateBathhouseRoom(world, hall, serial, owner);
    paintRoomOwner(world, hall, owner);
  }

  const rooms = bathhouseMicroSpecs(cx, cy, serial, owner);
  for (let i = 0; i < rooms.length; i++) {
    const spec = rooms[i];
    const room = tryAddBathhouseRoom(world, spec.type, spec.x, spec.y, spec.w, spec.h, spec.name, wallTex, spec.floorTex ?? floorTex, owner);
    if (!room) continue;
    connectDoorToPoint(world, room, spec.side, spec.side === 'north' || spec.side === 'south' ? room.w >> 1 : room.h >> 1, { x: cx, y: cy }, 1, floorTex, owner);
    decorateBathhouseRoom(world, room, i + serial, owner);
    paintRoomOwner(world, room, owner);
  }
}

export function bathhouseMicroSpecs(cx: number, cy: number, serial: number, owner: TerritoryOwner): {
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'north' | 'south' | 'west' | 'east';
  name: string;
  floorTex?: Tex;
}[] {
  const prefix = `Гармоническая баня: ${bathhouseOwnerLabel(owner)} блок ${serial + 1}`;
  return [
    { type: RoomType.BATHROOM, x: cx - 62, y: cy - 34, w: 18, h: 11, side: 'south', name: `${prefix}: душевая А`, floorTex: Tex.F_TILE },
    { type: RoomType.STORAGE, x: cx - 40, y: cy - 36, w: 16, h: 12, side: 'south', name: `${prefix}: шкаф пара` },
    { type: RoomType.PRODUCTION, x: cx - 18, y: cy - 38, w: 20, h: 13, side: 'south', name: `${prefix}: насосная` },
    { type: RoomType.MEDICAL, x: cx + 8, y: cy - 34, w: 17, h: 11, side: 'south', name: `${prefix}: ожоговая`, floorTex: Tex.F_TILE },
    { type: RoomType.BATHROOM, x: cx + 32, y: cy - 36, w: 18, h: 12, side: 'south', name: `${prefix}: душевая Б`, floorTex: Tex.F_WATER },
    { type: RoomType.KITCHEN, x: cx + 54, y: cy - 32, w: 18, h: 10, side: 'south', name: `${prefix}: чайник` },
    { type: RoomType.STORAGE, x: cx - 66, y: cy + 23, w: 18, h: 11, side: 'north', name: `${prefix}: сухая кладовая` },
    { type: RoomType.BATHROOM, x: cx - 42, y: cy + 25, w: 18, h: 12, side: 'north', name: `${prefix}: мокрый закуток`, floorTex: Tex.F_WATER },
    { type: RoomType.OFFICE, x: cx - 18, y: cy + 27, w: 18, h: 11, side: 'north', name: `${prefix}: журнал давления` },
    { type: RoomType.PRODUCTION, x: cx + 8, y: cy + 25, w: 20, h: 13, side: 'north', name: `${prefix}: венткамера` },
    { type: RoomType.STORAGE, x: cx + 36, y: cy + 24, w: 18, h: 11, side: 'north', name: `${prefix}: соляной шкаф` },
    { type: RoomType.SMOKING, x: cx + 58, y: cy + 22, w: 18, h: 10, side: 'north', name: `${prefix}: курилка полотенец` },
    { type: RoomType.CORRIDOR, x: cx - 82, y: cy - 8, w: 14, h: 16, side: 'east', name: `${prefix}: боковой шлюз` },
    { type: RoomType.COMMON, x: cx + 70, y: cy - 8, w: 16, h: 16, side: 'west', name: `${prefix}: боковой предбанник` },
  ];
}

export function tryAddBathhouseRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  owner: TerritoryOwner,
): Room | null {
  if (!canStampBathhouseRoom(world, x, y, w, h)) return null;
  const room = addRoom(world, type, x, y, w, h, name, wallTex, floorTex);
  paintRoomOwner(world, room, owner);
  return room;
}

export function canStampBathhouseRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 2 || y < 2 || x + w + 2 >= W || y + h + 2 >= W) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) return false;
      if (world.roomMap[idx] >= 0) return false;
    }
  }
  return true;
}

export function markBathhouseHermeticRoom(world: World, room: Room): void {
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) continue;
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
}

export function repairBathhouseDoorFrames(world: World): void {
  for (const [idx, door] of world.doors) {
    if (world.cells[idx] !== Cell.DOOR) continue;
    const room = world.rooms[door.roomA];
    if (!room) continue;
    const x = idx % W;
    const y = (idx / W) | 0;
    const left = world.idx(x - 1, y);
    const right = world.idx(x + 1, y);
    const up = world.idx(x, y - 1);
    const down = world.idx(x, y + 1);
    const verticalPass = world.roomMap[up] === room.id || world.roomMap[down] === room.id;
    const jambs = verticalPass ? [left, right] : [up, down];
    const hermetic = door.state === DoorState.HERMETIC_OPEN || door.state === DoorState.HERMETIC_CLOSED;
    for (const jamb of jambs) {
      if (world.aptMask[jamb] || world.cells[jamb] === Cell.LIFT || world.cells[jamb] === Cell.DOOR) continue;
      if (world.roomMap[jamb] >= 0) continue;
      world.cells[jamb] = Cell.WALL;
      world.roomMap[jamb] = -1;
      world.wallTex[jamb] = hermetic ? Tex.HERMO_WALL : room.wallTex;
      world.features[jamb] = Feature.NONE;
      if (hermetic) world.hermoWall[jamb] = 1;
      world.factionControl[jamb] = world.factionControl[idx];
    }
  }
}

export function paintRoomOwner(world: World, room: Room, owner: TerritoryOwner): void {
  forRoomCells(world, room, idx => {
    world.factionControl[idx] = owner;
  });
  for (const door of room.doors) world.factionControl[door] = owner;
}

export function decorateBathhouseRoom(world: World, room: Room, serial: number, owner: TerritoryOwner): void {
  switch (room.type) {
    case RoomType.BATHROOM:
      for (let x = room.x + 2; x < room.x + room.w - 1; x += 4) {
        setFeature(world, x, room.y + 2, Feature.SINK);
        if (x + 1 < room.x + room.w - 1) setFeature(world, x + 1, room.y + room.h - 3, Feature.TOILET);
      }
      break;
    case RoomType.KITCHEN:
      setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.SINK);
      setFeature(world, room.x + room.w - 5, room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.STORAGE:
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) setFeature(world, x, room.y + 2, Feature.SHELF);
      break;
    case RoomType.PRODUCTION:
      for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) {
        setFeature(world, x, room.y + 2, Feature.MACHINE);
        setFeature(world, x + 1, room.y + room.h - 3, Feature.APPARATUS);
      }
      break;
    case RoomType.MEDICAL:
      setFeature(world, room.x + 3, room.y + 2, Feature.BED);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.APPARATUS);
      break;
    case RoomType.OFFICE:
    case RoomType.HQ:
      setFeature(world, room.x + 3, room.y + 2, Feature.DESK);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.SCREEN);
      setFeature(world, room.x + room.w - 5, room.y + room.h - 3, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
      break;
    default:
      setFeature(world, room.x + 3, room.y + 2, serial % 2 === 0 ? Feature.TABLE : Feature.CHAIR);
      setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.LAMP);
      break;
  }
  if (room.floorTex === Tex.F_WATER) {
    forRoomCells(world, room, (idx, x, y) => {
      if ((x + y + serial) % 3 === 0 && world.features[idx] === Feature.NONE) {
        world.cells[idx] = Cell.WATER;
        world.fog[idx] = Math.max(world.fog[idx], 24);
      }
    });
  }
}

export function bathhouseOwnerFloor(owner: TerritoryOwner, serial: number): Tex {
  if (owner === ZoneFaction.CITIZEN) return serial % 2 === 0 ? Tex.F_TILE : Tex.F_LINO;
  if (owner === ZoneFaction.SCIENTIST) return Tex.F_TILE;
  if (owner === ZoneFaction.WILD) return serial % 2 === 0 ? Tex.F_WATER : Tex.F_CONCRETE;
  if (owner === ZoneFaction.CULTIST) return Tex.F_CARPET;
  return Tex.F_CONCRETE;
}

export function bathhouseOwnerWall(owner: TerritoryOwner): Tex {
  if (owner === ZoneFaction.CITIZEN) return Tex.TILE_W;
  if (owner === ZoneFaction.SCIENTIST) return Tex.HERMO_WALL;
  if (owner === ZoneFaction.WILD) return Tex.ROTTEN;
  if (owner === ZoneFaction.CULTIST) return Tex.CROSS;
  return Tex.METAL;
}

export function bathhouseOwnerLabel(owner: TerritoryOwner): string {
  if (owner === ZoneFaction.CITIZEN) return 'гражданский';
  if (owner === ZoneFaction.SCIENTIST) return 'лабораторный';
  if (owner === ZoneFaction.WILD) return 'дикий';
  if (owner === ZoneFaction.CULTIST) return 'культовый';
  return 'ликвидаторский';
}

export function placePanels(world: World, rooms: BathhouseRooms): string[] {
  const placed = [
    placeEmergencyPanel(world, rooms.boiler.x + 12, rooms.boiler.y + 10, 'panel_power', SEED ^ 0xba01),
    placeEmergencyPanel(world, rooms.hotGallery.x + 10, rooms.hotGallery.y + 12, 'panel_vent', SEED ^ 0xba02),
    placeEmergencyPanel(world, rooms.repairGallery.x + 14, rooms.repairGallery.y + 14, 'panel_water', SEED ^ 0xba03),
    placeEmergencyPanel(world, rooms.lowerLift.x + 18, rooms.lowerLift.y + 14, 'panel_doors', SEED ^ 0xba04),
  ];
  return placed.filter(panel => !!panel).map(panel => `${panel!.defId}:${panel!.idx}`);
}

export function roomWaterCells(world: World, room: Room): number[] {
  const out: number[] = [];
  forRoomCells(world, room, ci => {
    if (world.cells[ci] === Cell.WATER) out.push(ci);
  });
  return out;
}

export function registerCues(world: World, rooms: BathhouseRooms): string[] {
  const cues = [
    {
      id: 'harmonic_bathhouse_turn_valve',
      room: rooms.mixingHall,
      target: rooms.boiler,
      label: 'поющий вентиль',
      hint: 'Котельная держит давление. Водяной щиток и вентиль меняют соседние комнаты, не весь этаж.',
      color: '#ffd16f',
      tags: ['turn_valve', 'pressure', 'steam'],
      group: {
        id: 'harmonic_bathhouse_valve',
        lead: 'Котёл держит горячий ход под давлением.',
        risk: 'Срыв пара бьёт короткими тактами.',
        decision: 'Повернуть вентиль или оставить быстрый ход опасным.',
        reward: 'Меньше пара рядом с котлом и доступ к ремонтным шкафам.',
      },
    },
    {
      id: 'harmonic_bathhouse_hot_fast_path',
      room: rooms.entry,
      target: rooms.hotGallery,
      label: 'горячий быстрый ход',
      hint: 'Короткий путь к нижней кабине идёт через паровой сброс.',
      color: '#ff8a45',
      tags: ['hot_fast_path', 'steam', 'route_choice'],
      group: {
        id: 'harmonic_bathhouse_hot_fast_path',
        lead: 'Паровая галерея почти прямая.',
        risk: 'Пульсирующий пар режет здоровье и видимость.',
        decision: 'Идти быстро через жар или чинить вытяжку.',
        reward: 'Самый короткий путь к нижней кабине.',
      },
    },
    {
      id: 'harmonic_bathhouse_cold_flooded_bypass',
      room: rooms.entry,
      target: rooms.coldBypass,
      label: 'холодный обход',
      hint: 'Затопленный путь медленный, но обходит основную паровую петлю.',
      color: '#79c8ff',
      tags: ['cold_flooded_bypass', 'water', 'route_choice'],
      group: {
        id: 'harmonic_bathhouse_cold_flooded_bypass',
        lead: 'Слева вода держит обход до сушилок.',
        risk: 'Вода тянет шаг и собирает мокрых тварей.',
        decision: 'Терять время в воде или идти через жар.',
        reward: 'Меньше прямого урона от пара.',
      },
    },
    {
      id: 'harmonic_bathhouse_repair_pressure_route',
      room: rooms.mixingHall,
      target: rooms.repairGallery,
      label: 'галерея манометров',
      hint: 'Ремонтный щиток может осушить или затуманить только соседние комнаты.',
      color: '#b7d0c0',
      tags: ['repair_pressure_route', 'panel', 'route_choice'],
      group: {
        id: 'harmonic_bathhouse_repair_pressure_route',
        lead: 'Манометры показывают, где давление спорит с водой.',
        risk: 'Ошибочная перегрузка зовёт местную аварию.',
        decision: 'Починить контур, сорвать пломбу или уйти без ремонта.',
        reward: 'Локально чище туман, вода и двери.',
      },
    },
  ] as const;

  for (const cue of cues) {
    registerRouteCue(world, {
      id: cue.id,
      x: cue.room.x + cue.room.w / 2,
      y: cue.room.y + cue.room.h / 2,
      targetX: cue.target.x + cue.target.w / 2,
      targetY: cue.target.y + cue.target.h / 2,
      z: HARMONIC_BATHHOUSE_BASE_FLOOR,
      label: cue.label,
      hint: cue.hint,
      targetName: cue.target.name,
      color: cue.color,
      tags: [HARMONIC_BATHHOUSE_ROUTE_ID, ...cue.tags],
      toneSeed: SEED ^ cue.id.length * 131,
      roomId: cue.room.id,
      targetRoomId: cue.target.id,
      radius: 13,
      targetRadius: 4,
      routeGroup: cue.group,
      heardText: cue.hint,
      followedText: `Вы приняли маршрут: ${cue.label}.`,
      ignoredText: `Вы отвернулись от маршрута: ${cue.label}.`,
    });
  }
  return cues.map(cue => cue.id);
}

export function decisionNode(id: BathhouseDecisionId, room: Room, tags: readonly string[]): BathhouseRouteNode {
  return {
    id,
    roomDefId: room.name,
    roomId: room.id,
    x: room.x + room.w / 2,
    y: room.y + room.h / 2,
    tags,
  };
}

export function dropBathhouseDebugItem(world: World, entities: Entity[], nextId: NextId, x: number, y: number, defId: string, count: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
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

