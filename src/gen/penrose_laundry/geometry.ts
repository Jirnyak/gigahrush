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
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import { stampRoom } from '../shared';
import { PENROSE_LAUNDRY_BASE_FLOOR, PENROSE_LAUNDRY_ROOM_DEF_IDS, PenroseLaundrySymbol, PenroseTileSpec, PenroseFullNode, PenroseLaundryState, C, PHI, GOLDEN_TURN, LOCK_KEY_ID, SYMBOL_CHAIN_IDS, FULL_FLOOR_NODE_COUNT, FULL_FLOOR_NODE_RADIUS_MIN, FULL_FLOOR_NODE_RADIUS_SPAN, FULL_FLOOR_NODE_SYMBOLS, PENROSE_HQ_SPECS } from "./meta";
import { carvePenroseEdgeDrains, decoratePenroseSupportRoom } from "./npcs";

export const penroseLaundryStates = new WeakMap<World, PenroseLaundryState>();

export function getPenroseLaundryState(world: World): PenroseLaundryState | undefined {
  const state = penroseLaundryStates.get(world);
  if (!state) return undefined;
  return {
    ...state,
    tiles: state.tiles.map(tile => ({ ...tile })),
    symbolChainRoomNames: [...state.symbolChainRoomNames],
    deflationPocketRoomNames: [...state.deflationPocketRoomNames],
    lockedDoorIds: [...state.lockedDoorIds],
    containerIds: { ...state.containerIds },
    debugEntry: { ...state.debugEntry },
  };
}

export function reinforcePenroseLaundryAuthoredHqTerritory(world: World): void {
  for (const spec of PENROSE_HQ_SPECS) {
    for (const room of world.rooms) {
      if (!room.name.includes(`штаб ${spec.title}`)) continue;
      if (room.type === RoomType.HQ) {
        makePenroseHermeticCore(world, room);
        paintPenroseTerritoryPatch(world, room.x + (room.w >> 1), room.y + (room.h >> 1), spec.strong ? 48 : 36, spec.owner);
      }
      paintPenroseRoomTerritory(world, room, spec.owner);
    }
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function buildPenroseFullFloor(world: World, roomsById: Map<string, Room>): void {
  const hqCores = buildPenroseHqCompounds(world);
  const courts = buildPenroseSteamCourts(world);
  const nodes = buildPenroseAperiodicGraph(world);
  connectPenroseFullGraph(world, roomsById, nodes, courts);
  connectPenroseHqsToGraph(world, hqCores, nodes, courts);
  carvePenroseEdgeDrains(world);
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
  world.markFogDirty();
}

export function buildPenroseAperiodicGraph(world: World): PenroseFullNode[] {
  const nodes: PenroseFullNode[] = [];
  for (let i = 0; i < FULL_FLOOR_NODE_COUNT; i++) {
    const symbol = FULL_FLOOR_NODE_SYMBOLS[(i * 3 + (i / 7 | 0)) % FULL_FLOOR_NODE_SYMBOLS.length] ?? 'sun';
    const dims = penroseNodeDimensions(symbol, i);
    const radius = FULL_FLOOR_NODE_RADIUS_MIN + Math.sqrt((i + 0.5) / FULL_FLOOR_NODE_COUNT) * FULL_FLOOR_NODE_RADIUS_SPAN;
    const angle = i * GOLDEN_TURN + Math.sin(i * PHI) * 0.17;
    const x = clamp(Math.round(C + Math.cos(angle) * radius - dims.w / 2), 38, W - dims.w - 38);
    const y = clamp(Math.round(C + Math.sin(angle) * radius - dims.h / 2), 38, W - dims.h - 38);
    const room = tryStampPenroseRoom(
      world,
      penroseNodeRoomType(symbol, i),
      x,
      y,
      dims.w,
      dims.h,
      `Прачечная Пенроуза: ромб ${String(i + 1).padStart(2, '0')} ${penroseSymbolName(symbol)}`,
      penroseNodeWallTex(symbol),
      penroseNodeFloorTex(symbol),
      penroseNodeOwner(symbol),
    );
    if (!room) continue;
    decoratePenroseNodeRoom(world, room, symbol, i);
    const node: PenroseFullNode = { room, index: i, symbol };
    nodes.push(node);
    buildPenroseStationCluster(world, node);
  }
  return nodes;
}

export function buildPenroseStationCluster(world: World, node: PenroseFullNode): void {
  const n = node.room;
  const layouts: readonly { type: RoomType; label: string; dx: number; dy: number; w: number; h: number; wallTex: Tex; floorTex: Tex }[] = [
    { type: RoomType.STORAGE, label: 'сухой карман', dx: -28, dy: -24, w: 24, h: 14, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    { type: RoomType.BATHROOM, label: 'мокрый бокс', dx: n.w + 8, dy: -20, w: 24, h: 15, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    { type: RoomType.PRODUCTION, label: 'паровая машинка', dx: n.w + 10, dy: n.h + 8, w: 28, h: 16, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
    { type: RoomType.COMMON, label: 'очередь белья', dx: -30, dy: n.h + 8, w: 26, h: 15, wallTex: Tex.PANEL, floorTex: Tex.F_CARPET },
  ];
  for (let i = 0; i < layouts.length; i++) {
    const spec = layouts[(i + node.index) % layouts.length];
    const room = tryStampPenroseRoom(
      world,
      spec.type,
      n.x + spec.dx,
      n.y + spec.dy,
      spec.w,
      spec.h,
      `Прачечная Пенроуза: станция ${String(node.index + 1).padStart(2, '0')}-${i + 1} ${spec.label}`,
      spec.wallTex,
      spec.floorTex,
      penroseNodeOwner(node.symbol),
    );
    if (!room) continue;
    decoratePenroseSupportRoom(world, room, node.index + i);
    connectRooms(world, n, room, DoorState.CLOSED, '');
    buildPenroseMicroRoom(world, node, room, i);
  }
}

export function buildPenroseMicroRoom(world: World, node: PenroseFullNode, parent: Room, index: number): void {
  const ncx = node.room.x + node.room.w / 2;
  const ncy = node.room.y + node.room.h / 2;
  const pcx = parent.x + parent.w / 2;
  const pcy = parent.y + parent.h / 2;
  const horizontal = Math.abs(pcx - ncx) >= Math.abs(pcy - ncy);
  const w = parent.type === RoomType.BATHROOM ? 12 : 14;
  const h = parent.type === RoomType.BATHROOM ? 9 : 10;
  const x = horizontal
    ? (pcx < ncx ? parent.x - w - 7 : parent.x + parent.w + 7)
    : parent.x + 2;
  const y = horizontal
    ? parent.y + 2
    : (pcy < ncy ? parent.y - h - 7 : parent.y + parent.h + 7);
  const room = tryStampPenroseRoom(
    world,
    parent.type === RoomType.BATHROOM ? RoomType.BATHROOM : RoomType.STORAGE,
    Math.round(x),
    Math.round(y),
    w,
    h,
    `Прачечная Пенроуза: шкаф ${String(node.index + 1).padStart(2, '0')}-${index + 1}`,
    parent.wallTex,
    parent.floorTex,
    penroseNodeOwner(node.symbol),
  );
  if (!room) return;
  decoratePenroseSupportRoom(world, room, node.index + index + 11);
  connectRooms(world, parent, room, DoorState.CLOSED, '');
}

export function buildPenroseSteamCourts(world: World): Room[] {
  const rooms: Room[] = [];
  let serial = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 128 + col * 236 + (row % 2) * 38;
      const y = 272 + row * 214 + ((col * 19 + row * 11) % 34);
      const type = (row + col) % 3 === 0 ? RoomType.PRODUCTION : (row + col) % 3 === 1 ? RoomType.BATHROOM : RoomType.STORAGE;
      const room = tryStampPenroseRoom(
        world,
        type,
        x,
        y,
        type === RoomType.STORAGE ? 56 : 68,
        type === RoomType.STORAGE ? 28 : 36,
        `Прачечная Пенроуза: паровой двор ${String(++serial).padStart(2, '0')}`,
        type === RoomType.BATHROOM ? Tex.TILE_W : type === RoomType.PRODUCTION ? Tex.PIPE : Tex.METAL,
        type === RoomType.BATHROOM ? Tex.F_WATER : Tex.F_CONCRETE,
        col < 2 ? ZoneFaction.CITIZEN : row === 0 ? ZoneFaction.LIQUIDATOR : row === 2 ? ZoneFaction.WILD : ZoneFaction.SCIENTIST,
      );
      if (!room) continue;
      decoratePenroseCourt(world, room, serial);
      rooms.push(room);
    }
  }
  return rooms;
}

export function buildPenroseHqCompounds(world: World): Room[] {
  const cores: Room[] = [];
  for (const spec of PENROSE_HQ_SPECS) {
    const coreW = spec.strong ? 42 : 34;
    const coreH = spec.strong ? 25 : 21;
    const core = stampRequiredPenroseRoom(
      world,
      RoomType.HQ,
      spec.x,
      spec.y,
      coreW,
      coreH,
      `Прачечная Пенроуза: штаб ${spec.title}, герметичная бельевая`,
      spec.wallTex,
      spec.floorTex,
      spec.owner,
    );
    makePenroseHermeticCore(world, core);
    decoratePenroseSupportRoom(world, core, spec.owner);
    const supports: readonly [RoomType, number, number, number, number, string][] = [
      [RoomType.COMMON, -34, coreH + 20, 30, 16, 'общая очередь'],
      [RoomType.KITCHEN, 0, coreH + 25, 30, 15, 'чайная'],
      [RoomType.STORAGE, coreW + 10, coreH + 22, 31, 15, 'склад порошка'],
      [RoomType.MEDICAL, coreW + 12, -22, 30, 15, 'санпост'],
      [RoomType.OFFICE, -34, -20, 30, 14, 'дежурная'],
      [RoomType.PRODUCTION, coreW + 48, 2, 32, 16, 'мастерская'],
    ];
    const limit = spec.strong ? supports.length : 5;
    for (let i = 0; i < limit; i++) {
      const [type, dx, dy, w, h, suffix] = supports[i];
      const support = stampRequiredPenroseRoom(
        world,
        type,
        spec.x + dx,
        spec.y + dy,
        w,
        h,
        `Прачечная Пенроуза: штаб ${spec.title}, ${suffix}`,
        spec.supportWallTex,
        spec.supportFloorTex,
        spec.owner,
      );
      decoratePenroseSupportRoom(world, support, i + spec.owner * 17);
      connectRooms(world, core, support, DoorState.HERMETIC_OPEN, '');
    }
    cores.push(core);
  }
  return cores;
}

export function connectPenroseFullGraph(
  world: World,
  roomsById: Map<string, Room>,
  nodes: readonly PenroseFullNode[],
  courts: readonly Room[],
): void {
  const authored = [
    'lift_lobby',
    'first_sun',
    'kite_boiler',
    'steam_valve',
    'second_sun',
    'hidden_cache',
  ].map(id => roomById(roomsById, id));
  const connected: Room[] = [...authored, ...courts];
  for (const court of courts) {
    const target = nearestRoom(world, court, authored);
    if (target) connectRooms(world, court, target, DoorState.CLOSED, '');
  }
  for (const node of nodes) {
    const target = nearestRoom(world, node.room, connected);
    if (target) connectRooms(world, node.room, target, DoorState.CLOSED, '');
    connected.push(node.room);
  }

  const angular = [...nodes].sort((a, b) => roomAngle(a.room) - roomAngle(b.room));
  for (let i = 0; i < angular.length; i += 2) {
    const a = angular[i]?.room;
    const b = angular[(i + 1) % angular.length]?.room;
    if (a && b && world.dist2(a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2) < 190 * 190) {
      connectRooms(world, a, b, DoorState.CLOSED, '');
    }
  }
}

export function connectPenroseHqsToGraph(
  world: World,
  hqs: readonly Room[],
  nodes: readonly PenroseFullNode[],
  courts: readonly Room[],
): void {
  const targets = nodes.map(node => node.room).concat(courts);
  for (const hq of hqs) {
    const target = nearestRoom(world, hq, targets);
    if (target) connectRooms(world, hq, target, DoorState.HERMETIC_OPEN, '');
  }
}

export function carvePenroseLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
  floorTex: Tex,
  wallTex: Tex,
  owner: ZoneFaction,
): void {
  const steps = Math.max(1, Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
  const r2 = radius * radius;
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(ax + (bx - ax) * step / steps);
    const y = Math.round(ay + (by - ay) * step / steps);
    for (let dy = -radius - 1; dy <= radius + 1; dy++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        const d2 = dx * dx + dy * dy;
        const idx = world.idx(x + dx, y + dy);
        if (d2 <= r2) {
          openCorridorTile(world, x + dx, y + dy, floorTex, owner, wallTex);
        } else if (world.cells[idx] === Cell.WALL && !world.aptMask[idx]) {
          world.wallTex[idx] = wallTex;
        }
      }
    }
  }
}

export function tryStampPenroseRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  owner: ZoneFaction,
): Room | null {
  const shifts: readonly [number, number][] = [[0, 0], [18, 0], [-18, 0], [0, 18], [0, -18], [24, 16], [-24, -16], [24, -16], [-24, 16], [36, 0], [-36, 0], [0, 36], [0, -36]];
  for (const [sx, sy] of shifts) {
    const px = clamp(Math.round(x + sx), 4, W - w - 5);
    const py = clamp(Math.round(y + sy), 4, W - h - 5);
    if (!canStampPenroseRoom(world, px, py, w, h)) continue;
    return stampPenroseRoom(world, type, px, py, w, h, name, wallTex, floorTex, owner);
  }
  return null;
}

export function stampRequiredPenroseRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  owner: ZoneFaction,
): Room {
  const room = tryStampPenroseRoom(world, type, x, y, w, h, name, wallTex, floorTex, owner);
  if (!room) throw new Error(`Cannot place Penrose laundry room: ${name}`);
  return room;
}

export function canStampPenroseRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 2 || y < 2 || x + w + 2 >= W || y + h + 2 >= W) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) return false;
    }
  }
  return true;
}

export function stampPenroseRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  owner: ZoneFaction,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[idx] = floorTex;
        world.factionControl[idx] = owner;
      } else {
        world.wallTex[idx] = wallTex;
      }
    }
  }
  return room;
}

export function makePenroseHermeticCore(world: World, room: Room): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
}

export function paintPenroseRoomTerritory(world: World, room: Room, owner: ZoneFaction): void {
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

export function paintPenroseTerritoryPatch(world: World, x: number, y: number, radius: number, owner: ZoneFaction): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const idx = world.idx(x + dx, y + dy);
      if (!world.aptMask[idx]) world.factionControl[idx] = owner;
    }
  }
}

export function decoratePenroseNodeRoom(world: World, room: Room, symbol: PenroseLaundrySymbol, index: number): void {
  decoratePenroseSupportRoom(world, room, index);
  if (symbol === 'drop') {
    for (let y = room.y + 4; y < room.y + room.h - 3; y += 4) {
      for (let x = room.x + 4; x < room.x + room.w - 4; x++) {
        if (((x + y + index) % 4) !== 0) world.cells[world.idx(x, y)] = Cell.WATER;
      }
    }
  } else if (symbol === 'kite') {
    for (let y = room.y + 3; y < room.y + room.h - 3; y += 3) {
      for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) world.fog[world.idx(x, y)] = 72;
    }
  } else if (symbol === 'sun') {
    setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.LAMP);
  } else if (symbol === 'coil') {
    setFeature(world, room.x + (room.w >> 1), room.y + 3, Feature.SCREEN);
  }
}

export function decoratePenroseCourt(world: World, room: Room, serial: number): void {
  decoratePenroseSupportRoom(world, room, serial);
  for (let y = room.y + 5; y < room.y + room.h - 4; y += 6) {
    for (let x = room.x + 5; x < room.x + room.w - 5; x += 7) {
      const idx = world.idx(x, y);
      if (room.type === RoomType.BATHROOM) {
        world.cells[idx] = Cell.WATER;
        world.floorTex[idx] = Tex.F_WATER;
      } else if (room.type === RoomType.PRODUCTION) {
        world.fog[idx] = 86;
        world.features[idx] = Feature.MACHINE;
      } else {
        world.features[idx] = Feature.SHELF;
      }
    }
  }
}

export function featureForPenroseRoom(type: RoomType, secondary: boolean): Feature {
  switch (type) {
    case RoomType.KITCHEN: return secondary ? Feature.TABLE : Feature.STOVE;
    case RoomType.BATHROOM: return secondary ? Feature.TOILET : Feature.SINK;
    case RoomType.STORAGE: return Feature.SHELF;
    case RoomType.MEDICAL: return secondary ? Feature.DESK : Feature.SINK;
    case RoomType.OFFICE: return secondary ? Feature.SCREEN : Feature.DESK;
    case RoomType.PRODUCTION: return secondary ? Feature.APPARATUS : Feature.MACHINE;
    case RoomType.HQ: return secondary ? Feature.DESK : Feature.SCREEN;
    default: return secondary ? Feature.CHAIR : Feature.TABLE;
  }
}

export function penroseNodeDimensions(symbol: PenroseLaundrySymbol, index: number): { w: number; h: number } {
  switch (symbol) {
    case 'sun': return { w: 42 + (index % 3) * 4, h: 24 };
    case 'kite': return { w: 38, h: 26 };
    case 'dart': return { w: 34, h: 20 };
    case 'drop': return { w: 32, h: 22 };
    case 'coil': return { w: 36, h: 22 };
  }
}

export function penroseNodeRoomType(symbol: PenroseLaundrySymbol, index: number): RoomType {
  if (symbol === 'sun' || symbol === 'kite') return RoomType.PRODUCTION;
  if (symbol === 'drop') return RoomType.BATHROOM;
  if (symbol === 'coil') return index % 2 === 0 ? RoomType.COMMON : RoomType.CORRIDOR;
  return RoomType.STORAGE;
}

export function penroseNodeWallTex(symbol: PenroseLaundrySymbol): Tex {
  if (symbol === 'kite') return Tex.PIPE;
  if (symbol === 'drop') return Tex.TILE_W;
  if (symbol === 'dart') return Tex.METAL;
  if (symbol === 'coil') return Tex.PANEL;
  return Tex.TILE_W;
}

export function penroseNodeFloorTex(symbol: PenroseLaundrySymbol): Tex {
  if (symbol === 'drop') return Tex.F_WATER;
  if (symbol === 'kite') return Tex.F_CONCRETE;
  if (symbol === 'dart') return Tex.F_LINO;
  if (symbol === 'coil') return Tex.F_CARPET;
  return Tex.F_TILE;
}

export function penroseNodeOwner(symbol: PenroseLaundrySymbol): ZoneFaction {
  if (symbol === 'kite') return ZoneFaction.LIQUIDATOR;
  if (symbol === 'dart') return ZoneFaction.WILD;
  if (symbol === 'drop') return ZoneFaction.SCIENTIST;
  if (symbol === 'coil') return ZoneFaction.CULTIST;
  return ZoneFaction.CITIZEN;
}

export function penroseSymbolName(symbol: PenroseLaundrySymbol): string {
  switch (symbol) {
    case 'sun': return 'Солнце';
    case 'kite': return 'Кайт';
    case 'dart': return 'Дарт';
    case 'drop': return 'Капля';
    case 'coil': return 'Катушка';
  }
}

export function nearestRoom(world: World, source: Room, candidates: readonly Room[]): Room | null {
  let best: Room | null = null;
  let bestD2 = Infinity;
  const sx = source.x + source.w / 2;
  const sy = source.y + source.h / 2;
  for (const candidate of candidates) {
    if (!candidate || candidate.id === source.id) continue;
    const d2 = world.dist2(sx, sy, candidate.x + candidate.w / 2, candidate.y + candidate.h / 2);
    if (d2 < bestD2) {
      best = candidate;
      bestD2 = d2;
    }
  }
  return best;
}

export function roomAngle(room: Room): number {
  return Math.atan2(room.y + room.h / 2 - C, room.x + room.w / 2 - C);
}

export function stampLaundryRoom(world: World, spec: PenroseTileSpec): Room {
  const room = stampRoom(world, world.rooms.length, spec.type, spec.x, spec.y, spec.w, spec.h, -1);
  room.name = spec.roomDefId;
  room.wallTex = spec.wallTex;
  room.floorTex = spec.floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = spec.wallTex;
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[ci] = spec.floorTex;
        world.factionControl[ci] = spec.motif === 'heat' ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
      }
    }
  }
  return room;
}

export function connectTilePath(world: World, roomsById: Map<string, Room>, lockedDoorIds: number[]): void {
  const path = [
    'west_drop',
    'lift_lobby',
    'deflation_a',
    'first_sun',
    'deflation_b',
    'kite_boiler',
    'rinse_line',
    'drain_tail',
    'steam_valve',
    'second_sun',
    'laundry_lock',
    'dry_cache',
  ];
  for (let i = 1; i < path.length; i++) connectRooms(world, roomById(roomsById, path[i - 1]), roomById(roomsById, path[i]), DoorState.CLOSED, '');

  const hiddenDoors = connectRooms(
    world,
    roomById(roomsById, 'laundry_lock'),
    roomById(roomsById, 'hidden_cache'),
    DoorState.LOCKED,
    LOCK_KEY_ID,
  );
  lockedDoorIds.push(...hiddenDoors);
}

export function connectRooms(world: World, a: Room, b: Room, state: DoorState, keyId: string): number[] {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const horizontal = Math.abs(bcx - acx) >= Math.abs(bcy - acy);
  let ax: number;
  let ay: number;
  let bx: number;
  let by: number;
  let startX: number;
  let startY: number;
  let endX: number;
  let endY: number;

  if (horizontal) {
    ay = clamp(Math.round(acy), a.y, a.y + a.h - 1);
    by = clamp(Math.round(bcy), b.y, b.y + b.h - 1);
    if (bcx >= acx) {
      ax = a.x + a.w;
      bx = b.x - 1;
      startX = ax + 1;
      endX = bx - 1;
    } else {
      ax = a.x - 1;
      bx = b.x + b.w;
      startX = ax - 1;
      endX = bx + 1;
    }
    startY = ay;
    endY = by;
  } else {
    ax = clamp(Math.round(acx), a.x, a.x + a.w - 1);
    bx = clamp(Math.round(bcx), b.x, b.x + b.w - 1);
    if (bcy >= acy) {
      ay = a.y + a.h;
      by = b.y - 1;
      startY = ay + 1;
      endY = by - 1;
    } else {
      ay = a.y - 1;
      by = b.y + b.h;
      startY = ay - 1;
      endY = by + 1;
    }
    startX = ax;
    endX = bx;
  }

  const doors = [
    addDoor(world, a, ax, ay, state, keyId),
    addDoor(world, b, bx, by, state, keyId),
  ];
  carveLaundryCorridor(world, startX, startY, endX, endY, Tex.F_LINO);
  return doors;
}

export function addDoor(world: World, room: Room, x: number, y: number, state: DoorState, keyId: string): number {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.DOOR;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = room.wallTex;
  world.floorTex[ci] = room.floorTex;
  world.doors.set(ci, { idx: ci, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  room.doors.push(ci);
  return ci;
}

export function carveLaundryCorridor(world: World, ax: number, ay: number, bx: number, by: number, floorTex: Tex): void {
  if (ax !== bx && ay !== by) {
    const turnBias = Math.sin((ax + ay * PHI + bx * GOLDEN_TURN) * 0.07) > 0;
    if (turnBias) {
      carveLaundryCorridor(world, ax, ay, bx, ay, floorTex);
      carveLaundryCorridor(world, bx, ay, bx, by, floorTex);
    } else {
      carveLaundryCorridor(world, ax, ay, ax, by, floorTex);
      carveLaundryCorridor(world, ax, by, bx, by, floorTex);
    }
    return;
  }

  const min = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const max = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = min; p <= max; p++) {
    const x = ax === bx ? ax : p;
    const y = ax === bx ? p : ay;
    openCorridorTile(world, x, y, floorTex);
  }
}

export function openCorridorTile(
  world: World,
  x: number,
  y: number,
  floorTex: Tex,
  owner = ZoneFaction.CITIZEN,
  wallTex = Tex.PANEL,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT || world.doors.has(ci) || world.roomMap[ci] >= 0) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = wallTex;
  world.floorTex[ci] = floorTex;
  world.features[ci] = Feature.NONE;
  world.factionControl[ci] = owner;
}

export function placeLifts(world: World, lobby: Room): void {
  placeLift(world, lobby.x + 5, lobby.y + 4, LiftDirection.UP);
  placeLift(world, lobby.x + 5, lobby.y + lobby.h - 5, LiftDirection.DOWN);
  setFeature(world, lobby.x + 8, lobby.y + 4, Feature.LIFT_BUTTON);
  setFeature(world, lobby.x + 8, lobby.y + lobby.h - 5, Feature.LIFT_BUTTON);
  setFeature(world, lobby.x + lobby.w - 4, lobby.y + 4, Feature.SCREEN);
}

export function placeLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.floorTex[ci] = Tex.F_CONCRETE;
  world.liftDir[ci] = direction;
}

export function dressTileRoom(world: World, room: Room, spec: PenroseTileSpec): void {
  setFeature(world, room.x + Math.max(2, Math.floor(room.w / 2)), room.y + 2, Feature.SCREEN);
  if (spec.motif === 'water') dressWaterRoom(world, room);
  else if (spec.motif === 'heat') dressHeatRoom(world, room);
  else if (spec.motif === 'deflation') dressDeflationPocket(world, room);
  else if (spec.motif === 'lock') dressLockRoom(world, room);
  else if (spec.motif === 'cache') dressCacheRoom(world, room);
  else {
    setFeature(world, room.x + room.w - 4, room.y + room.h - 4, Feature.LAMP);
    setFeature(world, room.x + 3, room.y + room.h - 4, Feature.DESK);
  }
}

export function dressWaterRoom(world: World, room: Room): void {
  for (let y = room.y + 3; y < room.y + room.h - 2; y += 3) {
    for (let x = room.x + 3; x < room.x + room.w - 3; x++) {
      if (((x + y + room.id) % 5) === 0) continue;
      const ci = world.idx(x, y);
      if (world.roomMap[ci] !== room.id) continue;
      world.cells[ci] = Cell.WATER;
      world.floorTex[ci] = Tex.F_WATER;
    }
  }
  for (let x = room.x + 3; x < room.x + room.w - 2; x += 7) setFeature(world, x, room.y + room.h - 3, Feature.MACHINE);
  setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.LAMP);
}

export function dressHeatRoom(world: World, room: Room): void {
  for (let y = room.y + 2; y < room.y + room.h - 2; y++) {
    for (let x = room.x + 2; x < room.x + room.w - 2; x++) {
      const ci = world.idx(x, y);
      if (world.roomMap[ci] !== room.id) continue;
      if (((x * 3 + y * 5 + room.id) & 7) === 0) world.fog[ci] = 88;
      if (((x + y) & 5) === 0) world.floorTex[ci] = Tex.F_CONCRETE;
    }
  }
  for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) {
    setFeature(world, x, room.y + 3, Feature.APPARATUS);
    setFeature(world, x, room.y + room.h - 4, Feature.MACHINE);
  }
  setFeature(world, room.x + room.w - 3, room.y + Math.floor(room.h / 2), Feature.LAMP);
}

export function dressDeflationPocket(world: World, room: Room): void {
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      const ci = world.idx(x, y);
      if (world.roomMap[ci] !== room.id) continue;
      world.floorTex[ci] = ((x + y) & 1) === 0 ? Tex.F_LINO : Tex.F_CONCRETE;
    }
  }
  setFeature(world, room.x + 2, room.y + 2, Feature.SHELF);
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
}

export function dressLockRoom(world: World, room: Room): void {
  for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
    setFeature(world, room.x + 2, y, Feature.SHELF);
    setFeature(world, room.x + room.w - 3, y, Feature.MACHINE);
  }
  setFeature(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), Feature.APPARATUS);
}

export function dressCacheRoom(world: World, room: Room): void {
  for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) {
    setFeature(world, x, room.y + 2, Feature.SHELF);
  }
  setFeature(world, room.x + 2, room.y + room.h - 3, Feature.SINK);
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
}

export function markSymbolCells(world: World, roomsById: Map<string, Room>): void {
  let serial = 0;
  for (const id of SYMBOL_CHAIN_IDS) {
    const room = roomById(roomsById, id);
    const x = room.x + Math.floor(room.w / 2);
    const y = room.y + Math.floor(room.h / 2);
    const ci = world.idx(x, y);
    world.features[ci] = serial % 2 === 0 ? Feature.SCREEN : Feature.APPARATUS;
    world.floorTex[ci] = Tex.F_CARPET_EDGE_BASE + ((serial * 5) & 15);
    serial++;
  }
}

export function tunePenroseZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, C, C);
    zone.level = d < 110 ? 3 : d < 230 ? 4 : 2;
    zone.faction = d < 120 ? ZoneFaction.CITIZEN : ZoneFaction.WILD;
    if (zone.cx > C + 24 && Math.abs(zone.cy - C) < 120) zone.faction = ZoneFaction.LIQUIDATOR;
    if (zone.cy > C + 36 && zone.cx < C - 26) zone.faction = ZoneFaction.SAMOSBOR;
  }
}

export function dropPenroseSupplies(world: World, entities: Entity[], nextId: { v: number }, roomsById: Map<string, Room>): void {
  placeDrop(world, entities, nextId, roomById(roomsById, 'west_drop'), 4, 5, 'toiletpaper', 1);
  placeDrop(world, entities, nextId, roomById(roomsById, 'deflation_a'), 3, 3, 'chalk', 1);
  placeDrop(world, entities, nextId, roomById(roomsById, 'kite_boiler'), 4, 7, 'boiler_water', 1);
  placeDrop(world, entities, nextId, roomById(roomsById, 'drain_tail'), 4, 4, 'valve_tag', 1);
  placeDrop(world, entities, nextId, roomById(roomsById, 'second_sun'), 4, 5, 'cloth_roll', 1);
}

export function registerPenroseRouteCues(world: World, roomsById: Map<string, Room>): void {
  const first = roomById(roomsById, 'first_sun');
  const hidden = roomById(roomsById, 'hidden_cache');
  registerRouteCue(world, {
    id: 'penrose_laundry_symbol_chain',
    x: first.x + first.w / 2,
    y: first.y + first.h / 2,
    targetX: hidden.x + hidden.w / 2,
    targetY: hidden.y + hidden.h / 2,
    z: PENROSE_LAUNDRY_BASE_FLOOR,
    roomId: first.id,
    targetRoomId: hidden.id,
    zoneId: world.zoneMap[world.idx(first.x + Math.floor(first.w / 2), first.y + Math.floor(first.h / 2))],
    label: 'одинаковые Солнца',
    hint: 'повторяющийся символ ведет к скрытой умывальной',
    targetName: PENROSE_LAUNDRY_ROOM_DEF_IDS.hiddenCache,
    color: '#9ef',
    tags: ['penrose_laundry', 'symbol_chain', 'hidden_washroom_cache'],
    toneSeed: 81081,
    radius: 8,
    targetRadius: 4,
    cooldownSec: 36,
    heardText: 'Мокрые метки П-81 повторяют Солнце. Одинаковые знаки ведут не по прямой, а к скрытой умывальной.',
    followedText: 'Цепочка Солнц сошлась к скрытой умывальной П-81.',
    ignoredText: 'Солнце на плитке осталось за спиной. Прачечная снова стала просто шумной.',
  });
}

export function placeDrop(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  dx: number,
  dy: number,
  defId: string,
  count: number,
): void {
  const x = room.x + dx;
  const y = room.y + dy;
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

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  world.features[ci] = feature;
}

export function roomById(roomsById: Map<string, Room>, id: string): Room {
  const room = roomsById.get(id);
  if (!room) throw new Error(`Missing penrose laundry room: ${id}`);
  return room;
}

export function countCells(world: World, cell: Cell): number {
  let count = 0;
  for (const value of world.cells) if (value === cell) count++;
  return count;
}

export function countFogCells(world: World, min: number): number {
  let count = 0;
  for (const value of world.fog) if (value >= min) count++;
  return count;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

