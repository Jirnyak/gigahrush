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
import { hashSeed } from '../../core/rand';
import { clamp } from '../../core/math';
import { placeEmergencyPanel } from '../../systems/emergency_panels';
import { registerRouteCue } from '../../systems/route_cues';
import { stampRoom } from '../shared';
import { HYPERBOLIC_SWITCHYARD_BASE_FLOOR, HYPERBOLIC_SWITCHYARD_ROOM_NAMES, SwitchyardArcSummary, SwitchyardPlatformSummary, ArcSpec, SwitchyardRooms, SwitchyardDoorSide, SwitchyardServiceBlockSpec, SWITCHYARD_SERVICE_BLOCKS, SWITCHYARD_HQ_SPECS, SWITCHYARD_MICRO_TYPES, GUIDE_DEF } from "./meta";

export function carveArcFamilies(world: World): {
  allCells: number[];
  shortcutCells: number[];
  arcMap: Map<string, { spec: ArcSpec; cells: number[] }>;
} {
  const arcMap = new Map<string, { spec: ArcSpec; cells: number[] }>();
  const all = new Set<number>();
  const shortcut = new Set<number>();
  const arcs: readonly ArcSpec[] = [
    { id: 'blue_upper_horocycle', family: 'blue', cx: 512, cy: 742, radius: 286, start: -2.57, end: -0.58, width: 5, tex: Tex.F_CONCRETE, platform: 'north' },
    { id: 'blue_lower_horocycle', family: 'blue', cx: 512, cy: 282, radius: 286, start: 0.58, end: 2.57, width: 5, tex: Tex.F_CONCRETE, platform: 'south' },
    { id: 'blue_west_wall_arc', family: 'blue', cx: 742, cy: 512, radius: 284, start: 2.18, end: 4.08, width: 4, tex: Tex.F_CONCRETE, platform: 'west' },
    { id: 'blue_east_wall_arc', family: 'blue', cx: 282, cy: 512, radius: 284, start: -0.94, end: 0.94, width: 4, tex: Tex.F_CONCRETE, platform: 'east' },
    { id: 'red_northwest_geodesic', family: 'red', cx: 316, cy: 322, radius: 265, start: -0.06, end: 1.52, width: 4, tex: Tex.F_TILE, platform: 'blueSwitch' },
    { id: 'red_northeast_geodesic', family: 'red', cx: 708, cy: 322, radius: 265, start: 1.62, end: 3.20, width: 4, tex: Tex.F_TILE, platform: 'redSwitch' },
    { id: 'red_southeast_false_platform', family: 'red', cx: 704, cy: 702, radius: 250, start: 3.18, end: 4.78, width: 4, tex: Tex.F_TILE, platform: 'falsePlatform', shortcut: true },
    { id: 'red_southwest_monster_shortcut', family: 'red', cx: 320, cy: 702, radius: 250, start: -1.64, end: -0.02, width: 4, tex: Tex.F_TILE, platform: 'shortcut', shortcut: true },
  ];

  for (const spec of arcs) {
    const cells = carvePoincareArc(world, spec);
    arcMap.set(spec.id, { spec, cells });
    for (const cell of cells) {
      all.add(cell);
      if (spec.shortcut) shortcut.add(cell);
    }
  }

  return { allCells: [...all], shortcutCells: [...shortcut], arcMap };
}

export function carvePoincareArc(world: World, spec: ArcSpec): number[] {
  const cells = new Set<number>();
  const span = Math.abs(spec.end - spec.start);
  const steps = Math.max(32, Math.ceil(span * spec.radius * 0.9));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = spec.start + (spec.end - spec.start) * t;
    const x = spec.cx + Math.cos(a) * spec.radius;
    const y = spec.cy + Math.sin(a) * spec.radius;
    carveBrush(world, x, y, spec.width, spec.tex, cells);
  }
  return [...cells];
}

export function carveGeodesicShortcut(world: World, cells: number[]): void {
  carveSegment(world, 356, 648, 668, 376, 3, Tex.F_TILE, cells);
  carveSegment(world, 668, 648, 356, 376, 2, Tex.F_TILE, cells);
}

export function carveSegment(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  tex: Tex,
  out?: number[] | Set<number>,
): void {
  const dx = world.delta(ax, bx);
  const dy = world.delta(ay, by);
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) * 1.2));
  const set = out instanceof Set ? out : undefined;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cells = new Set<number>();
    carveBrush(world, ax + dx * t, ay + dy * t, width, tex, cells);
    if (Array.isArray(out)) out.push(...cells);
    else if (set) for (const cell of cells) set.add(cell);
  }
}

export function carveBrush(world: World, x: number, y: number, radius: number, tex: Tex, out?: Set<number>): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(ix + dx, iy + dy);
      if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) continue;
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = tex;
      world.wallTex[ci] = Tex.METAL;
      world.factionControl[ci] = ZoneFaction.LIQUIDATOR;
      if (out) out.add(ci);
    }
  }
}

export function buildSwitchyardRooms(world: World): SwitchyardRooms {
  return {
    guide: makeRoom(world, RoomType.OFFICE, 468, 462, 44, 26, 'Касса проводника кривых дуг', Tex.PANEL, Tex.F_LINO),
    central: makeRoom(world, RoomType.HQ, 482, 502, 60, 34, 'Хороцикл главной стрелочной', Tex.METAL, Tex.F_CONCRETE),
    north: makeRoom(world, RoomType.COMMON, 470, 366, 84, 26, 'Хороцикл верхней платформы', Tex.METAL, Tex.F_CONCRETE),
    south: makeRoom(world, RoomType.COMMON, 470, 636, 84, 26, 'Хороцикл нижней платформы', Tex.METAL, Tex.F_CONCRETE),
    west: makeRoom(world, RoomType.COMMON, 296, 498, 48, 30, 'Хороцикл западной платформы', Tex.METAL, Tex.F_CONCRETE),
    east: makeRoom(world, RoomType.COMMON, 680, 498, 48, 30, 'Хороцикл восточной платформы', Tex.METAL, Tex.F_CONCRETE),
    blueSwitch: makeRoom(world, RoomType.PRODUCTION, 402, 442, 38, 30, 'Пульт синего семейства дуг', Tex.PIPE, Tex.F_TILE),
    redSwitch: makeRoom(world, RoomType.PRODUCTION, 584, 442, 38, 30, 'Пульт красного семейства дуг', Tex.PIPE, Tex.F_TILE),
    shortcut: makeRoom(world, RoomType.STORAGE, 616, 574, 48, 30, HYPERBOLIC_SWITCHYARD_ROOM_NAMES.shortcut, Tex.PIPE, Tex.F_TILE),
    falsePlatform: makeRoom(world, RoomType.STORAGE, 666, 650, 58, 28, 'Ложная платформа с обратной стрелкой', Tex.DARK, Tex.F_CONCRETE),
  };
}

export function makeRoom(
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
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

export function connectSwitchyardRooms(world: World, rooms: SwitchyardRooms): void {
  connectRoomToPoint(world, rooms.guide, 'south', 512, 502, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.central, 'north', 512, 462, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.central, 'south', 512, 636, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.central, 'west', 344, 512, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.central, 'east', 680, 512, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.north, 'south', 512, 430, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.south, 'north', 512, 594, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.west, 'east', 430, 512, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.east, 'west', 594, 512, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.blueSwitch, 'east', 482, 512, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.redSwitch, 'west', 542, 512, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.shortcut, 'west', 560, 574, DoorState.CLOSED);
  connectRoomToPoint(world, rooms.falsePlatform, 'west', 640, 650, DoorState.LOCKED, 'relay_diagram');
}

export function buildSwitchyardMidMicro(world: World, rooms: SwitchyardRooms): void {
  const hubs: Room[] = [];
  for (const spec of SWITCHYARD_SERVICE_BLOCKS) {
    const hub = tryStampSwitchyardRoom(world, spec.type, spec.x, spec.y, spec.w, spec.h, spec.name, spec.wallTex, spec.floorTex, spec.owner);
    if (!hub) continue;
    decorateSwitchyardOwnedRoom(world, hub, spec.owner, spec.x + spec.y);
    const ports = openSwitchyardRoomPorts(world, hub, spec.owner, DoorState.CLOSED);
    const target = nearestSwitchyardBackbonePoint(world, hub, rooms, hubs);
    connectRoomToPoint(world, hub, sideTowardPoint(hub, target.x, target.y), target.x, target.y, DoorState.CLOSED);
    placeSwitchyardMicroRooms(world, hub, ports, spec);
    hubs.push(hub);
  }

  connectSwitchyardHubRing(world, hubs);
  const hqs = buildSwitchyardHqCompounds(world, rooms, hubs);
  connectSwitchyardHubRing(world, hqs);
  world.markCellsDirty();
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
}

export function stampRequiredSwitchyardRoom(
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
): Room {
  const room = tryStampSwitchyardRoom(world, type, x, y, w, h, name, wallTex, floorTex, owner);
  if (!room) {
    throw new Error(`Cannot place Hyperbolic switchyard room: ${name}`);
  }
  return room;
}

export function tryStampSwitchyardRoom(
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
  const shifts: readonly [number, number][] = [
    [0, 0], [16, 0], [-16, 0], [0, 16], [0, -16],
    [28, 18], [-28, 18], [28, -18], [-28, -18],
    [42, 0], [-42, 0], [0, 42], [0, -42],
  ];
  for (const [sx, sy] of shifts) {
    const px = clamp(Math.round(x + sx), 4, W - w - 5);
    const py = clamp(Math.round(y + sy), 4, W - h - 5);
    if (!canStampSwitchyardRoom(world, px, py, w, h)) continue;
    return stampSwitchyardRoom(world, type, px, py, w, h, name, wallTex, floorTex, owner);
  }
  return null;
}

export function canStampSwitchyardRoom(world: World, x: number, y: number, w: number, h: number): boolean {
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

export function stampSwitchyardRoom(
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
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        world.floorTex[idx] = floorTex;
        world.wallTex[idx] = wallTex;
        world.factionControl[idx] = owner;
      } else {
        world.wallTex[idx] = wallTex;
      }
    }
  }
  return room;
}

export function openSwitchyardRoomPorts(
  world: World,
  room: Room,
  owner: TerritoryOwner,
  state: DoorState,
): Record<SwitchyardDoorSide, { x: number; y: number }> {
  const ports = roomPorts(room, 10);
  for (const side of ['north', 'south', 'west', 'east'] as const) {
    connectRoomToPoint(world, room, side, ports[side].x, ports[side].y, state);
    paintSwitchyardPatch(world, ports[side].x, ports[side].y, 4, owner);
  }
  return ports;
}

export function roomPorts(room: Room, offset: number): Record<SwitchyardDoorSide, { x: number; y: number }> {
  return {
    north: { x: room.x + (room.w >> 1), y: room.y - offset },
    south: { x: room.x + (room.w >> 1), y: room.y + room.h + offset },
    west: { x: room.x - offset, y: room.y + (room.h >> 1) },
    east: { x: room.x + room.w + offset, y: room.y + (room.h >> 1) },
  };
}

export function nearestSwitchyardBackbonePoint(
  world: World,
  room: Room,
  rooms: SwitchyardRooms,
  hubs: readonly Room[],
): { x: number; y: number } {
  const points = [
    { x: 512, y: 430 },
    { x: 512, y: 594 },
    { x: 430, y: 512 },
    { x: 594, y: 512 },
    { x: 356, y: 648 },
    { x: 668, y: 376 },
    { x: rooms.north.x + rooms.north.w / 2, y: rooms.north.y + rooms.north.h + 8 },
    { x: rooms.south.x + rooms.south.w / 2, y: rooms.south.y - 8 },
    { x: rooms.west.x + rooms.west.w + 8, y: rooms.west.y + rooms.west.h / 2 },
    { x: rooms.east.x - 8, y: rooms.east.y + rooms.east.h / 2 },
    ...hubs.map(hub => ({ x: hub.x + hub.w / 2, y: hub.y + hub.h / 2 })),
  ];
  const c = roomCenterPoint(room);
  let best = points[0];
  let bestD = Infinity;
  for (const point of points) {
    const d2 = world.dist2(c.x, c.y, point.x, point.y);
    if (d2 < bestD) {
      best = point;
      bestD = d2;
    }
  }
  return best;
}

export function placeSwitchyardMicroRooms(
  world: World,
  hub: Room,
  ports: Record<SwitchyardDoorSide, { x: number; y: number }>,
  spec: SwitchyardServiceBlockSpec,
): void {
  for (let i = 0; i < spec.micro; i++) {
    const rect = microRoomRect(hub, i, spec.micro);
    const type = SWITCHYARD_MICRO_TYPES[(i + spec.owner) % SWITCHYARD_MICRO_TYPES.length];
    const room = tryStampSwitchyardRoom(
      world,
      type,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      `${spec.name}: ${microRoomSuffix(type)} ${i + 1}`,
      spec.wallTex,
      type === RoomType.BATHROOM ? Tex.F_TILE : spec.floorTex,
      spec.owner,
    );
    if (!room) continue;
    decorateSwitchyardOwnedRoom(world, room, spec.owner, i);
    connectRoomToPoint(world, room, oppositeSide(rect.side), ports[rect.side].x, ports[rect.side].y, DoorState.CLOSED);
  }
}

export function microRoomRect(
  hub: Room,
  serial: number,
  total: number,
): { x: number; y: number; w: number; h: number; side: SwitchyardDoorSide } {
  const side = (['north', 'south', 'west', 'east'] as const)[serial % 4];
  const perSide = Math.max(1, Math.ceil(total / 4));
  const n = Math.floor(serial / 4);
  const offset = n - Math.floor(perSide / 2);
  const w = side === 'west' || side === 'east' ? 12 + (serial % 3) * 2 : 14 + (serial % 4) * 2;
  const h = side === 'west' || side === 'east' ? 14 + (serial % 4) * 2 : 9 + (serial % 3) * 2;
  if (side === 'north') {
    return { x: hub.x + Math.round(hub.w / 2 + offset * 21 - w / 2), y: hub.y - h - 18 - (n % 2) * 10, w, h, side };
  }
  if (side === 'south') {
    return { x: hub.x + Math.round(hub.w / 2 + offset * 21 - w / 2), y: hub.y + hub.h + 18 + (n % 2) * 10, w, h, side };
  }
  if (side === 'west') {
    return { x: hub.x - w - 18 - (n % 2) * 10, y: hub.y + Math.round(hub.h / 2 + offset * 18 - h / 2), w, h, side };
  }
  return { x: hub.x + hub.w + 18 + (n % 2) * 10, y: hub.y + Math.round(hub.h / 2 + offset * 18 - h / 2), w, h, side };
}

export function buildSwitchyardHqCompounds(world: World, rooms: SwitchyardRooms, hubs: readonly Room[]): Room[] {
  const hqs: Room[] = [];
  for (const spec of SWITCHYARD_HQ_SPECS) {
    const coreW = spec.strong ? 42 : 34;
    const coreH = spec.strong ? 25 : 21;
    const core = stampRequiredSwitchyardRoom(
      world,
      RoomType.HQ,
      spec.x,
      spec.y,
      coreW,
      coreH,
      `Гиперболическая стрелочная: штаб ${spec.title}, герметичная стрелка`,
      spec.wallTex,
      spec.floorTex,
      spec.owner,
    );
    makeSwitchyardHermeticCore(world, core, spec.owner);
    decorateSwitchyardOwnedRoom(world, core, spec.owner, spec.owner * 23);
    const ports = openSwitchyardRoomPorts(world, core, spec.owner, DoorState.HERMETIC_OPEN);
    const supports: readonly [RoomType, number, number, number, number, string, Feature][] = [
      [RoomType.BATHROOM, -34, -20, 22, 12, 'санузел', Feature.TOILET],
      [RoomType.KITCHEN, coreW + 12, -18, 24, 13, 'кухня', Feature.STOVE],
      [RoomType.COMMON, -36, coreH + 18, 30, 15, 'общая комната', Feature.TABLE],
      [RoomType.STORAGE, coreW + 12, coreH + 18, 28, 14, 'склад', Feature.SHELF],
      [RoomType.MEDICAL, 0, coreH + 24, 24, 13, 'медпункт', Feature.SINK],
      [RoomType.OFFICE, coreW + 46, 2, 28, 14, 'дежурная', Feature.DESK],
      [RoomType.PRODUCTION, -44, 3, 30, 15, 'мастерская', Feature.MACHINE],
    ];
    const limit = spec.strong ? supports.length : 6;
    for (let i = 0; i < limit; i++) {
      const [type, dx, dy, w, h, suffix, feature] = supports[i];
      const support = tryStampSwitchyardRoom(
        world,
        type,
        spec.x + dx,
        spec.y + dy,
        w,
        h,
        `Гиперболическая стрелочная: штаб ${spec.title}, ${suffix}`,
        spec.supportWallTex,
        type === RoomType.BATHROOM || type === RoomType.MEDICAL ? Tex.F_TILE : spec.supportFloorTex,
        spec.owner,
      );
      if (!support) continue;
      placeFeature(world, support.x + Math.max(2, Math.min(support.w - 3, support.w >> 1)), support.y + Math.max(2, Math.min(support.h - 3, support.h >> 1)), feature);
      decorateSwitchyardOwnedRoom(world, support, spec.owner, i + spec.owner * 41);
      const side = sideTowardPoint(support, core.x + core.w / 2, core.y + core.h / 2);
      connectRoomToPoint(world, support, side, ports[oppositeSide(side)].x, ports[oppositeSide(side)].y, DoorState.CLOSED);
    }
    const target = nearestSwitchyardBackbonePoint(world, core, rooms, hubs);
    connectRoomToPoint(world, core, sideTowardPoint(core, target.x, target.y), target.x, target.y, DoorState.HERMETIC_OPEN);
    hqs.push(core);
  }
  return hqs;
}

export function makeSwitchyardHermeticCore(world: World, room: Room, owner: TerritoryOwner): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        world.factionControl[idx] = owner;
        continue;
      }
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
}

export function paintSwitchyardRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (!world.aptMask[idx]) world.factionControl[idx] = owner;
    }
  }
  for (const doorIdx of room.doors) {
    if (!world.aptMask[doorIdx]) world.factionControl[doorIdx] = owner;
  }
}

export function reinforceHyperbolicSwitchyardAuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    if (!room) continue;
    if (room.name === 'Хороцикл главной стрелочной') {
      makeSwitchyardHermeticCore(world, room, ZoneFaction.LIQUIDATOR);
      paintSwitchyardRoomTerritory(world, room, ZoneFaction.LIQUIDATOR);
      continue;
    }
    for (const spec of SWITCHYARD_HQ_SPECS) {
      const prefix = `Гиперболическая стрелочная: штаб ${spec.title}, `;
      if (!room.name.startsWith(prefix)) continue;
      if (room.type === RoomType.HQ) makeSwitchyardHermeticCore(world, room, spec.owner);
      paintSwitchyardRoomTerritory(world, room, spec.owner);
      break;
    }
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function connectSwitchyardHubRing(world: World, rooms: readonly Room[]): void {
  if (rooms.length < 2) return;
  const sorted = [...rooms].sort((a, b) => roomAngle(a) - roomAngle(b));
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[(i + 1) % sorted.length];
    const target = roomPorts(b, 10)[sideTowardPoint(b, a.x + a.w / 2, a.y + a.h / 2)];
    connectRoomToPoint(world, a, sideTowardPoint(a, target.x, target.y), target.x, target.y, DoorState.CLOSED);
  }
}

export function decorateSwitchyardOwnedRoom(world: World, room: Room, owner: TerritoryOwner, serial: number): void {
  const primary = featureForSwitchyardRoom(room.type, false);
  const secondary = featureForSwitchyardRoom(room.type, true);
  placeFeature(world, room.x + 2, room.y + 2, primary);
  placeFeature(world, room.x + room.w - 3, room.y + 2, secondary);
  if (room.w > 12 && room.h > 9) {
    placeFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), serial % 3 === 0 ? Feature.SCREEN : Feature.LAMP);
  }
  if (owner === ZoneFaction.CULTIST) placeFeature(world, room.x + Math.max(2, room.w - 4), room.y + Math.max(2, room.h - 4), Feature.CANDLE);
}

export function featureForSwitchyardRoom(type: RoomType, secondary: boolean): Feature {
  switch (type) {
    case RoomType.KITCHEN: return secondary ? Feature.SINK : Feature.STOVE;
    case RoomType.BATHROOM: return secondary ? Feature.SINK : Feature.TOILET;
    case RoomType.STORAGE: return secondary ? Feature.SHELF : Feature.MACHINE;
    case RoomType.MEDICAL: return secondary ? Feature.SINK : Feature.APPARATUS;
    case RoomType.PRODUCTION: return secondary ? Feature.APPARATUS : Feature.MACHINE;
    case RoomType.OFFICE: return secondary ? Feature.SCREEN : Feature.DESK;
    case RoomType.SMOKING: return secondary ? Feature.CHAIR : Feature.TABLE;
    case RoomType.HQ: return secondary ? Feature.SCREEN : Feature.DESK;
    case RoomType.COMMON:
    default:
      return secondary ? Feature.CHAIR : Feature.TABLE;
  }
}

export function microRoomSuffix(type: RoomType): string {
  switch (type) {
    case RoomType.KITCHEN: return 'чайная будка';
    case RoomType.BATHROOM: return 'санузел стрелочника';
    case RoomType.OFFICE: return 'кабинет расписаний';
    case RoomType.PRODUCTION: return 'мастерская привода';
    case RoomType.SMOKING: return 'курилка ложной дуги';
    case RoomType.COMMON: return 'дежурная ниша';
    case RoomType.STORAGE:
    default:
      return 'кладовая стрелок';
  }
}

export function paintSwitchyardPatch(world: World, x: number, y: number, radius: number, owner: TerritoryOwner): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx]) continue;
      world.factionControl[idx] = owner;
    }
  }
}

export function roomCenterPoint(room: Room): { x: number; y: number } {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

export function roomAngle(room: Room): number {
  const c = roomCenterPoint(room);
  return Math.atan2(c.y - W / 2, c.x - W / 2);
}

export function sideTowardPoint(room: Room, x: number, y: number): SwitchyardDoorSide {
  const c = roomCenterPoint(room);
  const dx = x - c.x;
  const dy = y - c.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'west' : 'east';
  return dy < 0 ? 'north' : 'south';
}

export function oppositeSide(side: SwitchyardDoorSide): SwitchyardDoorSide {
  if (side === 'north') return 'south';
  if (side === 'south') return 'north';
  if (side === 'west') return 'east';
  return 'west';
}

export function connectRoomToPoint(
  world: World,
  room: Room,
  side: SwitchyardDoorSide,
  targetX: number,
  targetY: number,
  state: DoorState,
  keyId = '',
): void {
  let doorX = room.x + Math.floor(room.w / 2);
  let doorY = room.y + Math.floor(room.h / 2);
  let outX = doorX;
  let outY = doorY;
  if (side === 'north') {
    doorY = room.y - 1;
    outY = doorY - 1;
  } else if (side === 'south') {
    doorY = room.y + room.h;
    outY = doorY + 1;
  } else if (side === 'west') {
    doorX = room.x - 1;
    outX = doorX - 1;
  } else {
    doorX = room.x + room.w;
    outX = doorX + 1;
  }
  if (side === 'north' || side === 'south') {
    doorX = room.x + Math.floor(room.w / 2);
    outX = doorX;
  } else {
    doorY = room.y + Math.floor(room.h / 2);
    outY = doorY;
  }
  const idx = world.idx(doorX, doorY);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  if (!room.doors.includes(idx)) room.doors.push(idx);
  carveSegment(world, outX, outY, targetX, targetY, 1, room.floorTex);
}

export function placeSwitchyardGates(world: World): number[] {
  const gates = [
    { x: 436, y: 512, family: 'blue' },
    { x: 588, y: 512, family: 'blue' },
    { x: 512, y: 430, family: 'red' },
    { x: 512, y: 594, family: 'red' },
  ] as const;
  const out: number[] = [];
  for (const gate of gates) {
    const idx = world.idx(gate.x, gate.y);
    world.cells[idx] = Cell.DOOR;
    world.wallTex[idx] = Tex.DOOR_METAL;
    world.doors.set(idx, {
      idx,
      state: DoorState.CLOSED,
      roomA: -1,
      roomB: -1,
      keyId: '',
      timer: 0,
    });
    world.floorTex[idx] = gate.family === 'blue' ? Tex.F_CONCRETE : Tex.F_TILE;
    out.push(idx);
  }
  return out;
}

export function placeSwitchyardLifts(world: World): void {
  placeLift(world, 454, 496, 456, 496, LiftDirection.UP);
  placeLift(world, 570, 496, 568, 496, LiftDirection.DOWN);
}

export function placeLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const lift = world.idx(x, y);
  world.cells[lift] = Cell.LIFT;
  world.wallTex[lift] = Tex.LIFT_DOOR;
  world.liftDir[lift] = direction;
  const button = world.idx(buttonX, buttonY);
  if (world.cells[button] === Cell.FLOOR) world.features[button] = Feature.LIFT_BUTTON;
  world.liftDir[button] = direction;
}

export function decorateSwitchyard(world: World, rooms: SwitchyardRooms, arcCells: readonly number[]): void {
  for (const room of Object.values(rooms)) {
    placeFeature(world, room.x + 2, room.y + 2, Feature.LAMP);
    placeFeature(world, room.x + room.w - 3, room.y + 2, Feature.SCREEN);
  }
  placeFeature(world, rooms.guide.x + 5, rooms.guide.y + 5, Feature.DESK);
  placeFeature(world, rooms.blueSwitch.x + 8, rooms.blueSwitch.y + 8, Feature.APPARATUS);
  placeFeature(world, rooms.redSwitch.x + rooms.redSwitch.w - 9, rooms.redSwitch.y + 8, Feature.APPARATUS);
  placeFeature(world, rooms.falsePlatform.x + 5, rooms.falsePlatform.y + 6, Feature.CANDLE);

  for (let i = 0; i < arcCells.length; i += 41) {
    const cell = arcCells[i];
    if (world.features[cell] !== Feature.NONE || world.cells[cell] !== Cell.FLOOR) continue;
    world.features[cell] = (i / 41) % 5 === 0 ? Feature.SCREEN : Feature.LAMP;
  }
}

export function placeFeature(world: World, x: number, y: number, feature: Feature): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) world.features[idx] = feature;
}

export function placeSwitchyardPanels(world: World, rooms: SwitchyardRooms): number[] {
  const panels = [
    placeEmergencyPanel(world, rooms.blueSwitch.x + 12, rooms.blueSwitch.y + 14, 'panel_doors', 0x51a0),
    placeEmergencyPanel(world, rooms.redSwitch.x + rooms.redSwitch.w - 13, rooms.redSwitch.y + 14, 'panel_doors', 0x51b0),
    placeEmergencyPanel(world, rooms.shortcut.x + 8, rooms.shortcut.y + 12, 'panel_vent', 0x51c0),
  ];
  return panels.flatMap(panel => panel ? [panel.idx] : []);
}

export function registerSwitchyardCues(world: World, rooms: SwitchyardRooms): void {
  registerSwitchyardCue(world, {
    id: 'hyperbolic_switchyard_pay_guide',
    room: rooms.guide,
    target: rooms.central,
    label: 'Проводник кривых дуг',
    hint: 'Заплатить проводнику за разметку безопасной дуги и устную проверку ближайшей ошибки.',
    tags: ['hyperbolic_switchyard', 'pay_guide', 'paid_route_advice'],
    color: '#7ff0b8',
    paidRouteAdvice: { priceRubles: 45, sellerName: GUIDE_DEF.name },
  });
  registerSwitchyardCue(world, {
    id: 'hyperbolic_switchyard_switch_family',
    room: rooms.blueSwitch,
    target: rooms.redSwitch,
    label: 'Семейства стрелок',
    hint: 'Панели дверей меняют, какая семья дуг открыта: синяя длиннее, красная короче и шумнее.',
    tags: ['hyperbolic_switchyard', 'switch_family', 'panel'],
    color: '#7fdcff',
  });
  registerSwitchyardCue(world, {
    id: 'hyperbolic_switchyard_geodesic_shortcut',
    room: rooms.shortcut,
    target: rooms.south,
    label: 'Геодезический ход',
    hint: 'Короткая диагональ режет стрелочную, но в ней стоят псевдолифты и трубные автоматы.',
    tags: ['hyperbolic_switchyard', 'geodesic_shortcut', 'monster_heavy'],
    color: '#ff7f7f',
  });
  registerSwitchyardCue(world, {
    id: 'hyperbolic_switchyard_false_platform',
    room: rooms.falsePlatform,
    target: rooms.east,
    label: 'Ложная платформа',
    hint: 'Платформа выглядит как пересадка; пломбу можно сорвать, чтобы не привести сюда следующего путника.',
    tags: ['hyperbolic_switchyard', 'false_platform', 'sabotage'],
    color: '#f9d86f',
  });
}

export function registerSwitchyardCue(
  world: World,
  opts: {
    id: string;
    room: Room;
    target: Room;
    label: string;
    hint: string;
    tags: readonly string[];
    color: string;
    paidRouteAdvice?: { priceRubles: number; sellerName: string };
  },
): void {
  const x = opts.room.x + opts.room.w / 2;
  const y = opts.room.y + opts.room.h / 2;
  const targetX = opts.target.x + opts.target.w / 2;
  const targetY = opts.target.y + opts.target.h / 2;
  registerRouteCue(world, {
    id: opts.id,
    x,
    y,
    targetX,
    targetY,
    z: HYPERBOLIC_SWITCHYARD_BASE_FLOOR,
    label: opts.label,
    hint: opts.hint,
    targetName: opts.target.name,
    color: opts.color,
    tags: opts.tags,
    toneSeed: hashSeed(opts.id),
    roomId: opts.room.id,
    targetRoomId: opts.target.id,
    zoneId: world.zoneMap[world.idx(Math.floor(x), Math.floor(y))],
    radius: 12,
    targetRadius: 4,
    heardText: opts.hint,
    followedText: `${opts.label}: цель рядом.`,
    ignoredText: `${opts.label}: дуга уходит в сторону.`,
    paidRouteAdvice: opts.paidRouteAdvice,
    routeGroup: {
      id: opts.id,
      lead: opts.label,
      risk: opts.tags.includes('monster_heavy') ? 'много монстров на коротком ходе' : 'ложная смежность стрелочной',
      decision: opts.tags.includes('paid_route_advice') ? 'заплатить проводнику' : opts.tags.includes('sabotage') ? 'сорвать пломбу' : 'сменить путь',
      reward: opts.tags.includes('sabotage') ? 'снять ложную платформу с маршрута' : 'сократить путь и не потерять ориентир',
      mapLabel: opts.label,
      mapHint: opts.hint,
      logLine: opts.hint,
    },
  });
}

export function tuneSwitchyardZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, W / 2, W / 2);
    zone.level = Math.max(2, Math.min(6, Math.round(3 + d / 260)));
    zone.faction = d < 150 ? ZoneFaction.LIQUIDATOR
      : zone.id % 5 === 0 ? ZoneFaction.SAMOSBOR
        : zone.id % 3 === 0 ? ZoneFaction.WILD
          : ZoneFaction.LIQUIDATOR;
    zone.fogged = d > 300 && zone.id % 4 === 0;
    zone.hasLift = zone.id % 13 === 0;
  }
  for (let i = 0; i < world.factionControl.length; i++) {
    world.factionControl[i] = world.zones[world.zoneMap[i]]?.faction ?? ZoneFaction.LIQUIDATOR;
  }
}

export function summarizeArcs(arcMap: Map<string, { spec: ArcSpec; cells: number[] }>, rooms: SwitchyardRooms): SwitchyardArcSummary[] {
  return [...arcMap.values()].map(({ spec, cells }) => ({
    id: spec.id,
    family: spec.family,
    cellCount: cells.length,
    platformRoomId: rooms[spec.platform].id,
    shortcut: spec.shortcut === true,
  }));
}

export function summarizePlatforms(rooms: SwitchyardRooms): SwitchyardPlatformSummary[] {
  return [
    ['guide', rooms.guide],
    ['central', rooms.central],
    ['north', rooms.north],
    ['south', rooms.south],
    ['west', rooms.west],
    ['east', rooms.east],
    ['blue_switch', rooms.blueSwitch],
    ['red_switch', rooms.redSwitch],
    ['shortcut', rooms.shortcut],
    ['false_platform', rooms.falsePlatform],
  ].map(([id, room]) => ({
    id: id as string,
    roomId: (room as Room).id,
    name: (room as Room).name,
    x: (room as Room).x + (room as Room).w / 2,
    y: (room as Room).y + (room as Room).h / 2,
    falsePlatform: id === 'false_platform' || undefined,
  }));
}

