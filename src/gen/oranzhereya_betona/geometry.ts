import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Item,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { rng } from '../../core/rand';
import { ITEMS } from '../../data/catalog';
import { Spr } from '../../render/sprite_index';
import {
  carveCorridor,
  roomExit,
  stampRoom} from '../shared';
import { ORANZHEREYA_ROOM_NAMES, ORANZHEREYA_HQ_ROOM_NAMES, ORANZHEREYA_MICRO_ROOM_PREFIXES, SEED, CX, CY, BLOCK_ROOM_W, BLOCK_ROOM_H, BLOCK_COLS, BLOCK_ROWS, BLOCK_GAP_X, BLOCK_GAP_Y, GREENHOUSE_BLOCKS, ORANZHEREYA_HQ_SPECS } from "./meta";
import { OranzhereyaBetonaMetrics, carveCultivationField, placeCropRows, addContainer } from "./npcs";

export type NextId = { v: number };

export interface GreenhouseRooms {
  entry: Room;
  gallery: Room;
  pump: Room;
  northRows: Room;
  southRows: Room;
  waterBasin: Room;
  burnTrench: Room;
  mushroomWard: Room;
  seedVault: Room;
  marketStall: Room;
  guardPost: Room;
  compost: Room;
}

export interface GreenhouseBlockSpec {
  name: string;
  x: number;
  y: number;
  owner: TerritoryOwner;
  wallTex: Tex;
  floorTex: Tex;
}

export interface HqSupportSpec {
  type: RoomType;
  dx: number;
  dy: number;
  w: number;
  h: number;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
  feature: Feature;
}

export interface HqSpec {
  owner: TerritoryOwner;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wallTex: Tex;
  floorTex: Tex;
  supports: readonly HqSupportSpec[];
}

export function tuneOranzhereyaBetonaRouteZones(world: World): void {
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    const marketSide = zone.cx > CX + 130 && zone.cy > CY - 40;
    const wetSide = zone.cx > CX + 70 && zone.cy < CY - 40;
    const cropCore = d < 190;
    const sporeEdge = zone.cx < CX - 150 || zone.cy > CY + 160;

    zone.faction = marketSide ? ZoneFaction.WILD
      : wetSide ? ZoneFaction.LIQUIDATOR
        : cropCore ? ZoneFaction.CITIZEN
          : sporeEdge ? ZoneFaction.SAMOSBOR
            : ZoneFaction.CITIZEN;
    zone.level = Math.max(zone.level, sporeEdge ? 4 : marketSide ? 3 : cropCore ? 2 : 3);
    zone.fogged = sporeEdge && (zone.id % 3 === 0);
  }

  for (let i = 0; i < W * W; i++) {
    const zone = world.zones[world.zoneMap[i]];
    world.factionControl[i] = zone?.faction ?? ZoneFaction.CITIZEN;
    if (zone?.fogged) world.fog[i] = Math.max(world.fog[i], 12);
  }
  world.markFogDirty();
}

export function measureOranzhereyaBetonaGeometry(world: World): OranzhereyaBetonaMetrics {
  const cropRoomNames = new Set<string>([
    ORANZHEREYA_ROOM_NAMES.northRows,
    ORANZHEREYA_ROOM_NAMES.southRows,
    ORANZHEREYA_ROOM_NAMES.mushroomWard,
  ]);
  const cropRoomIds = new Set(world.rooms
    .filter(room => cropRoomNames.has(room.name))
    .map(room => room.id));
  let cropCells = 0;
  let waterCells = 0;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.WATER) waterCells++;
    if (cropRoomIds.has(world.roomMap[i]) && world.floorTex[i] === Tex.F_GREEN_CARPET) cropCells++;
  }
  return {
    cropCells,
    waterCells,
    basinContainers: world.containers.filter(c => c.tags.includes('nutrient_basin')).length,
    publicHarvestContainers: world.containers.filter(c => c.tags.includes('harvest') && c.access === 'public').length,
    sabotageContainers: world.containers.filter(c => c.tags.includes('sabotage_drop')).length,
  };
}

export function expandOranzhereyaBetonaRouteGeometry(world: World, rand: () => number = rng): void {
  const anchors: Room[] = [];
  for (const spec of ORANZHEREYA_HQ_SPECS) {
    const hq = addHqCompound(world, spec);
    if (hq) anchors.push(hq);
  }
  anchors.push(...addCitizenOutposts(world));

  const hubs: Room[] = [];
  for (const spec of GREENHOUSE_BLOCKS) {
    const hub = addGreenhouseBlock(world, spec, rand);
    if (hub) hubs.push(hub);
  }

  carveMacroIrrigation(world, rng);
  connectExpansionRooms(world, [...anchors, ...hubs]);
  fillOranzhereyaVoids(world, rng, [...anchors, ...hubs]);
  reinforceOranzhereyaBetonaAuthoredTerritory(world);
  world.markFloorTexDirty();
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function reinforceOranzhereyaBetonaAuthoredTerritory(world: World): void {
  const roomsByName = new Map<string, Room>();
  for (const room of world.rooms) {
    if (room?.name) roomsByName.set(room.name, room);
  }

  for (const spec of ORANZHEREYA_HQ_SPECS) {
    const hq = roomsByName.get(spec.name);
    if (hq) {
      hardenAuthoredHq(world, hq, spec.owner);
      paintRoomTerritory(world, hq, spec.owner);
    }
    for (const support of spec.supports) {
      const room = roomsByName.get(hqSupportName(spec, support));
      if (room) paintRoomTerritory(world, room, spec.owner);
    }
  }

  for (const [name, owner] of [
    [ORANZHEREYA_HQ_ROOM_NAMES.citizenNorth, ZoneFaction.CITIZEN],
    [ORANZHEREYA_HQ_ROOM_NAMES.citizenSouth, ZoneFaction.CITIZEN],
    [ORANZHEREYA_ROOM_NAMES.guardPost, ZoneFaction.LIQUIDATOR],
    [ORANZHEREYA_ROOM_NAMES.seedVault, ZoneFaction.SCIENTIST],
    [ORANZHEREYA_ROOM_NAMES.marketStall, ZoneFaction.WILD],
    [ORANZHEREYA_ROOM_NAMES.compost, ZoneFaction.CULTIST],
  ] as const) {
    const room = roomsByName.get(name);
    if (!room) continue;
    if (
      name === ORANZHEREYA_ROOM_NAMES.guardPost ||
      name === ORANZHEREYA_HQ_ROOM_NAMES.citizenNorth ||
      name === ORANZHEREYA_HQ_ROOM_NAMES.citizenSouth
    ) hardenAuthoredHq(world, room, owner);
    paintRoomTerritory(world, room, owner);
  }

  for (const room of world.rooms) {
    if (!room?.name) continue;
    const block = GREENHOUSE_BLOCKS.find(spec => room.name!.startsWith(spec.name));
    if (block) paintRoomTerritory(world, room, block.owner);
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function addGreenhouseBlock(world: World, spec: GreenhouseBlockSpec, rng: () => number): Room | null {
  const gridW = BLOCK_COLS * BLOCK_ROOM_W + (BLOCK_COLS - 1) * BLOCK_GAP_X;
  const gridH = BLOCK_ROWS * BLOCK_ROOM_H + (BLOCK_ROWS - 1) * BLOCK_GAP_Y;
  const hub = tryMakeRoom(
    world,
    RoomType.COMMON,
    spec.x + ((gridW - 42) >> 1),
    spec.y + gridH + 10,
    42,
    18,
    `${spec.name}: узел переходов`,
    spec.wallTex,
    spec.floorTex,
  );
  if (!hub) return null;
  paintRoomTerritory(world, hub, spec.owner);
  setFeature(world, hub.x + 5, hub.y + 5, Feature.TABLE);
  setFeature(world, hub.x + hub.w - 6, hub.y + 5, Feature.SHELF);

  const rooms: Room[] = [];
  for (let row = 0; row < BLOCK_ROWS; row++) {
    for (let col = 0; col < BLOCK_COLS; col++) {
      const serial = row * BLOCK_COLS + col;
      const x = spec.x + col * (BLOCK_ROOM_W + BLOCK_GAP_X);
      const y = spec.y + row * (BLOCK_ROOM_H + BLOCK_GAP_Y);
      const type = greenhouseMicroRoomType(serial);
      const prefix = ORANZHEREYA_MICRO_ROOM_PREFIXES[serial % ORANZHEREYA_MICRO_ROOM_PREFIXES.length];
      const room = tryMakeRoom(
        world,
        type,
        x,
        y,
        BLOCK_ROOM_W + (serial % 4 === 0 ? 2 : 0),
        BLOCK_ROOM_H + (serial % 5 === 0 ? 2 : 0),
        `${spec.name}: ${prefix} ${serial + 1}`,
        type === RoomType.BATHROOM ? Tex.TILE_W : spec.wallTex,
        type === RoomType.BATHROOM ? Tex.F_WATER : spec.floorTex,
      );
      if (!room) continue;
      decorateGreenhouseMicroRoom(world, room, serial, rng);
      paintRoomTerritory(world, room, spec.owner);
      rooms.push(room);
    }
  }
  for (const room of rooms) connectRoomPair(world, room, hub);
  return hub;
}

export function addHqCompound(world: World, spec: HqSpec): Room | null {
  const hq = tryMakeRoom(world, RoomType.HQ, spec.x, spec.y, spec.w, spec.h, spec.name, spec.wallTex, spec.floorTex);
  if (!hq) return null;
  hardenAuthoredHq(world, hq, spec.owner);
  setFeature(world, hq.x + 5, hq.y + 5, Feature.DESK);
  setFeature(world, hq.x + hq.w - 6, hq.y + 5, Feature.SCREEN);
  setFeature(world, hq.x + (hq.w >> 1), hq.y + hq.h - 5, Feature.SHELF);

  const supports: Room[] = [];
  for (const support of spec.supports) {
    const room = tryMakeRoom(
      world,
      support.type,
      spec.x + support.dx,
      spec.y + support.dy,
      support.w,
      support.h,
      hqSupportName(spec, support),
      support.wallTex,
      support.floorTex,
    );
    if (!room) continue;
    paintRoomTerritory(world, room, spec.owner);
    setFeature(world, room.x + Math.max(2, Math.min(room.w - 3, 4)), room.y + Math.max(2, Math.min(room.h - 3, 4)), support.feature);
    supports.push(room);
  }
  for (const room of supports) connectRoomPair(world, hq, room);
  return hq;
}

export function addCitizenOutposts(world: World): Room[] {
  const out: Room[] = [];
  for (const spec of [
    { name: ORANZHEREYA_HQ_ROOM_NAMES.citizenNorth, x: 250, y: 196, w: 46, h: 22 },
    { name: ORANZHEREYA_HQ_ROOM_NAMES.citizenSouth, x: 552, y: 896, w: 50, h: 24 },
  ] as const) {
    const room = tryMakeRoom(world, RoomType.HQ, spec.x, spec.y, spec.w, spec.h, spec.name, Tex.HERMO_WALL, Tex.F_LINO);
    if (!room) continue;
    hardenAuthoredHq(world, room, ZoneFaction.CITIZEN);
    setFeature(world, room.x + 4, room.y + 4, Feature.DESK);
    setFeature(world, room.x + room.w - 5, room.y + 4, Feature.SHELF);
    out.push(room);
  }
  return out;
}

export function carveMacroIrrigation(world: World, rng: () => number): void {
  const green = Tex.F_GREEN_CARPET;
  const concrete = Tex.F_CONCRETE;
  const tile = Tex.F_TILE;
  for (const line of [
    [CX, CY, 0, CY, 7, concrete],
    [CX, CY, W - 1, CY, 7, concrete],
    [CX, CY, CX, 0, 7, concrete],
    [CX, CY, CX, W - 1, 7, concrete],
    [72, 184, 952, 184, 5, tile],
    [72, 824, 952, 824, 5, tile],
    [184, 72, 184, 952, 5, tile],
    [824, 72, 824, 952, 5, tile],
    [140, 140, 884, 884, 3, concrete],
    [884, 140, 140, 884, 3, concrete],
  ] as const) {
    carveGreenhouseLine(world, line[0], line[1], line[2], line[3], line[4], line[5]);
  }

  for (const field of [
    { x: 48, y: 220, w: 216, h: 86, tex: green, seed: 11 },
    { x: 318, y: 218, w: 174, h: 72, tex: green, seed: 17 },
    { x: 558, y: 210, w: 198, h: 78, tex: green, seed: 23 },
    { x: 760, y: 420, w: 170, h: 110, tex: green, seed: 31 },
    { x: 592, y: 590, w: 244, h: 92, tex: green, seed: 37 },
    { x: 298, y: 688, w: 216, h: 88, tex: green, seed: 41 },
    { x: 64, y: 644, w: 212, h: 84, tex: green, seed: 43 },
    { x: 208, y: 102, w: 86, h: 70, tex: green, seed: 47 },
  ] as const) {
    carveCultivationField(world, field.x, field.y, field.w, field.h, field.tex, field.seed, rng);
  }

  for (const basin of [
    { x: 370, y: 366, w: 124, h: 28 },
    { x: 536, y: 356, w: 112, h: 30 },
    { x: 426, y: 580, w: 188, h: 24 },
    { x: 156, y: 498, w: 92, h: 24 },
    { x: 780, y: 604, w: 96, h: 24 },
  ] as const) {
    carveWaterBasin(world, basin.x, basin.y, basin.w, basin.h);
  }
}

export function connectExpansionRooms(world: World, rooms: readonly Room[]): void {
  const gallery = world.rooms.find(room => room.name === ORANZHEREYA_ROOM_NAMES.gallery)
    ?? world.rooms.find(room => room.type === RoomType.COMMON)
    ?? world.rooms[0];
  if (!gallery) return;
  for (const room of rooms) connectRoomPair(world, gallery, room);
  for (let i = 1; i < rooms.length; i++) {
    if (i % 2 === 0) connectRoomPair(world, rooms[i - 1], rooms[i]);
  }
}

export function tryMakeRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  ceilingTier?: number,
): Room | null {
  if (!canStampGreenhouseRoom(world, x, y, w, h)) return null;
  const room = makeRoom(world, type, x, y, w, h, name, wallTex, floorTex, ceilingTier);
  return room;
}

export function canStampGreenhouseRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 4 || y < 4 || x + w >= W - 4 || y + h >= W - 4) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx] || world.cells[idx] !== Cell.WALL || world.roomMap[idx] >= 0) return false;
    }
  }
  return true;
}

export function greenhouseMicroRoomType(serial: number): RoomType {
  switch (serial % 8) {
    case 0: return RoomType.STORAGE;
    case 1: return RoomType.KITCHEN;
    case 2: return RoomType.PRODUCTION;
    case 3: return RoomType.BATHROOM;
    case 4: return RoomType.STORAGE;
    case 5: return RoomType.COMMON;
    case 6: return RoomType.OFFICE;
    default: return RoomType.KITCHEN;
  }
}

export function decorateGreenhouseMicroRoom(world: World, room: Room, serial: number, rng: () => number): void {
  const primary = room.type === RoomType.BATHROOM ? Feature.SINK
    : room.type === RoomType.PRODUCTION ? Feature.APPARATUS
      : room.type === RoomType.OFFICE ? Feature.DESK
        : room.type === RoomType.COMMON ? Feature.TABLE
          : Feature.SHELF;
  setFeature(world, room.x + 3, room.y + 3, primary);
  if (room.w > 10) setFeature(world, room.x + room.w - 4, room.y + Math.max(3, room.h - 4), serial % 3 === 0 ? Feature.SCREEN : Feature.SHELF);
  if (room.type === RoomType.KITCHEN || room.type === RoomType.PRODUCTION) {
    for (let x = room.x + 2; x < room.x + room.w - 2; x += 5) {
      const idx = world.idx(x, room.y + room.h - 2);
      world.floorTex[idx] = Tex.F_GREEN_CARPET;
      if (rng() < 0.5) world.features[idx] = Feature.TABLE;
    }
  }
}

export function carveGreenhouseLine(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  if (ax !== bx && ay !== by) {
    carveGreenhouseLine(world, ax, ay, bx, ay, width, floorTex);
    carveGreenhouseLine(world, bx, ay, bx, by, width, floorTex);
    return;
  }
  const half = Math.floor(width / 2);
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let o = -half; o <= half; o++) {
      setGreenhouseFloor(world, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex);
    }
  }
}

export function carveWaterBasin(world: World, x: number, y: number, w: number, h: number): void {
  const roomId = world.rooms.length;
  const room: Room = {
    id: roomId,
    type: RoomType.BATHROOM,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name: `Внешний питательный бассейн #${roomId}`,
    apartmentId: -1,
    wallTex: Tex.TILE_W,
    floorTex: Tex.F_WATER,
    ceilingTier: 3,
  };
  world.rooms.push(room);

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (dx <= 1 || dy <= 1 || dx >= w - 2 || dy >= h - 2) setGreenhouseFloor(world, x + dx, y + dy, Tex.F_TILE, false, roomId);
      else setGreenhouseFloor(world, x + dx, y + dy, Tex.F_WATER, true, roomId);

      if (dx > 3 && dy > 3 && dx < w - 3 && dy < h - 3) {
        if (dx % 20 === 0 && dy % 20 === 0) {
          const idx = world.idx(x + dx, y + dy);
          if (!world.aptMask[idx] && !world.hermoWall[idx]) {
            world.cells[idx] = Cell.WALL;
            world.wallTex[idx] = Tex.CONCRETE;
            world.roomMap[idx] = -1;
            world.features[idx] = Feature.NONE;
          }
        } else if (dx % 20 === 2 && dy % 20 === 0) {
          const idx = world.idx(x + dx, y + dy);
          if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) {
            world.features[idx] = Feature.MACHINE;
          }
        }
      }
    }
  }
}

export function setGreenhouseFloor(world: World, x: number, y: number, floorTex: Tex, water = false, roomId = -1): void {
  const idx = world.idx(x, y);
  if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) return;
  if (world.roomMap[idx] >= 0 || world.hermoWall[idx]) return;
  world.cells[idx] = water ? Cell.WATER : Cell.FLOOR;
  world.roomMap[idx] = roomId;
  world.floorTex[idx] = floorTex;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
    const ni = world.idx(x + dx, y + dy);
    if (world.cells[ni] === Cell.WALL) world.wallTex[ni] = Tex.PANEL;
  }
}

export function hardenAuthoredHq(world: World, room: Room, owner: TerritoryOwner): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
        continue;
      }
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
  for (const doorIdx of room.doors) {
    const door = world.doors.get(doorIdx);
    if (door) door.state = DoorState.HERMETIC_OPEN;
    world.factionControl[doorIdx] = owner;
  }
  ensureHermeticHqDoor(world, room, owner);
}

export function paintRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id && !world.aptMask[idx]) world.factionControl[idx] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function ensureHermeticHqDoor(world: World, room: Room, owner: TerritoryOwner): void {
  if (room.doors.some(doorIdx => {
    const door = world.doors.get(doorIdx);
    return door?.state === DoorState.HERMETIC_OPEN || door?.state === DoorState.HERMETIC_CLOSED;
  })) return;

  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const x = room.x + dx;
      const y = room.y + dy;
      const idx = world.idx(x, y);
      if (world.aptMask[idx]) continue;
      let interior = false;
      let exteriorRoom = -1;
      let exteriorPassable = false;
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const ni = world.idx(x + ox, y + oy);
        if (world.roomMap[ni] === room.id) {
          interior = true;
          continue;
        }
        const cell = world.cells[ni];
        if (cell === Cell.FLOOR || cell === Cell.WATER || cell === Cell.DOOR) {
          exteriorPassable = true;
          if (world.roomMap[ni] >= 0) exteriorRoom = world.roomMap[ni];
        }
      }
      if (!interior || !exteriorPassable) continue;
      world.cells[idx] = Cell.DOOR;
      world.hermoWall[idx] = 0;
      world.wallTex[idx] = Tex.HERMO_WALL;
      world.factionControl[idx] = owner;
      world.doors.set(idx, { idx, state: DoorState.HERMETIC_OPEN, roomA: room.id, roomB: exteriorRoom, keyId: '', timer: 0 });
      if (!room.doors.includes(idx)) room.doors.push(idx);
      if (exteriorRoom >= 0) {
        const other = world.rooms[exteriorRoom];
        if (other && !other.doors.includes(idx)) other.doors.push(idx);
      }
      return;
    }
  }
}

export function hqSupportName(spec: HqSpec, support: HqSupportSpec): string {
  return `${spec.name}: ${support.name}`;
}

export function initWorld(world: World): void {
  world.wallTex.fill(Tex.PANEL);
  world.floorTex.fill(Tex.F_CONCRETE);
}

export function buildRooms(world: World): GreenhouseRooms {
  const entry = makeRoom(world, RoomType.CORRIDOR, CX - 66, CY - 16, 132, 32, ORANZHEREYA_ROOM_NAMES.entry, Tex.PANEL, Tex.F_TILE, 3);
  const gallery = makeRoom(world, RoomType.COMMON, CX - 106, CY - 88, 212, 102, ORANZHEREYA_ROOM_NAMES.gallery, Tex.PANEL, Tex.F_GREEN_CARPET, 3);
  const pump = makeRoom(world, RoomType.PRODUCTION, CX - 62, CY - 154, 124, 44, ORANZHEREYA_ROOM_NAMES.pump, Tex.PIPE, Tex.F_CONCRETE, 3);
  const northRows = makeRoom(world, RoomType.KITCHEN, CX - 270, CY - 184, 156, 78, ORANZHEREYA_ROOM_NAMES.northRows, Tex.PANEL, Tex.F_GREEN_CARPET, 3);
  const waterBasin = makeRoom(world, RoomType.BATHROOM, CX + 112, CY - 184, 156, 78, ORANZHEREYA_ROOM_NAMES.waterBasin, Tex.TILE_W, Tex.F_WATER, 3);
  const burnTrench = makeRoom(world, RoomType.PRODUCTION, CX - 270, CY - 74, 116, 86, ORANZHEREYA_ROOM_NAMES.burnTrench, Tex.METAL, Tex.F_CONCRETE, 3);
  const guardPost = makeRoom(world, RoomType.HQ, CX + 134, CY - 68, 114, 76, ORANZHEREYA_ROOM_NAMES.guardPost, Tex.METAL, Tex.F_LINO, 3);
  const mushroomWard = makeRoom(world, RoomType.PRODUCTION, CX - 270, CY + 68, 158, 82, ORANZHEREYA_ROOM_NAMES.mushroomWard, Tex.ROTTEN, Tex.F_GREEN_CARPET, 3);
  const compost = makeRoom(world, RoomType.STORAGE, CX - 92, CY + 32, 76, 58, ORANZHEREYA_ROOM_NAMES.compost, Tex.ROTTEN, Tex.F_CONCRETE, 2);
  const seedVault = makeRoom(world, RoomType.STORAGE, CX - 76, CY + 96, 92, 68, ORANZHEREYA_ROOM_NAMES.seedVault, Tex.METAL, Tex.F_CONCRETE, 2);
  const marketStall = makeRoom(world, RoomType.COMMON, CX + 28, CY + 88, 100, 76, ORANZHEREYA_ROOM_NAMES.marketStall, Tex.BRICK, Tex.F_LINO, 3);
  const southRows = makeRoom(world, RoomType.KITCHEN, CX + 154, CY + 70, 156, 82, ORANZHEREYA_ROOM_NAMES.southRows, Tex.PANEL, Tex.F_GREEN_CARPET, 3);

  return {
    entry,
    gallery,
    pump,
    northRows,
    southRows,
    waterBasin,
    burnTrench,
    mushroomWard,
    seedVault,
    marketStall,
    guardPost,
    compost,
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
  ceilingTier?: number,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  if (ceilingTier !== undefined) room.ceilingTier = ceilingTier;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] === Cell.WALL) world.wallTex[idx] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      world.floorTex[idx] = floorTex;
    }
  }
  return room;
}

export function connectRooms(world: World, rooms: GreenhouseRooms): void {
  for (const room of [
    rooms.pump,
    rooms.northRows,
    rooms.waterBasin,
    rooms.burnTrench,
    rooms.guardPost,
    rooms.mushroomWard,
    rooms.compost,
    rooms.seedVault,
    rooms.marketStall,
    rooms.southRows,
  ]) connectRoomPair(world, rooms.gallery, room);
  connectRoomPair(world, rooms.entry, rooms.gallery);
  connectRoomPair(world, rooms.pump, rooms.waterBasin);
  connectRoomPair(world, rooms.mushroomWard, rooms.compost);
  connectRoomPair(world, rooms.marketStall, rooms.southRows);
}

export function connectRoomPair(world: World, a: Room, b: Room): void {
  const ac = roomCenter(a);
  const bc = roomCenter(b);
  const ae = roomExit(world, a, bc.x, bc.y);
  const be = roomExit(world, b, ac.x, ac.y);
  carveCorridor(world, ae.ox, ae.oy, be.ox, be.oy);
}

export function roomCenter(room: Room): { x: number; y: number } {
  return {
    x: room.x + Math.floor(room.w / 2),
    y: room.y + Math.floor(room.h / 2),
  };
}

export function decorateRooms(world: World, rooms: GreenhouseRooms): void {
  placeCropRows(world, rooms.northRows, 0);
  placeCropRows(world, rooms.southRows, 97);
  placeMushroomRows(world, rooms.mushroomWard);
  placeIrrigationGraph(world, rooms);
  placeRoomFixtures(world, rooms);
  stampGrowthFields(world, rooms);
  decorateLargeRoomColumnsAndMeshes(world, rooms);
}

export function decorateLargeRoomColumnsAndMeshes(world: World, rooms: GreenhouseRooms): void {
  for (let dy = 6; dy < rooms.gallery.h - 6; dy++) {
    for (let dx = 6; dx < rooms.gallery.w - 6; dx++) {
      const x = rooms.gallery.x + dx;
      const y = rooms.gallery.y + dy;
      const idx = world.idx(x, y);
      if (world.cells[idx] !== Cell.FLOOR || world.aptMask[idx]) continue;

      if (dx % 16 === 0 && dy % 16 === 0) {
        world.cells[idx] = Cell.WALL;
        world.wallTex[idx] = Tex.CONCRETE;
        world.roomMap[idx] = -1;
        world.features[idx] = Feature.NONE;
      } else if (dx % 16 === 2 && dy % 16 === 0) {
        if (world.features[idx] === Feature.NONE) world.features[idx] = Feature.MACHINE;
      } else if (dx % 16 === 4 && dy % 16 === 0) {
        if (world.features[idx] === Feature.NONE) world.features[idx] = Feature.TABLE;
      } else if (dx % 16 === 8 && dy % 16 === 0) {
        if (world.features[idx] === Feature.NONE) world.features[idx] = Feature.LAMP;
      }
    }
  }

  for (const room of [rooms.pump, rooms.burnTrench, rooms.waterBasin, rooms.northRows, rooms.southRows, rooms.mushroomWard, rooms.guardPost, rooms.entry]) {
    for (let dy = 5; dy < room.h - 5; dy++) {
      for (let dx = 5; dx < room.w - 5; dx++) {
        const x = room.x + dx;
        const y = room.y + dy;
        const idx = world.idx(x, y);
        if ((world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) || world.aptMask[idx]) continue;

        const step = room === rooms.entry ? 18 : 14;
        if (dx % step === 0 && dy % step === 0) {
          world.cells[idx] = Cell.WALL;
          world.wallTex[idx] = room === rooms.pump || room === rooms.burnTrench ? Tex.PIPE : Tex.CONCRETE;
          world.roomMap[idx] = -1;
          world.features[idx] = Feature.NONE;
        } else if (dx % step === 2 && dy % step === 0) {
          if (world.cells[idx] === Cell.FLOOR && world.features[idx] === Feature.NONE) {
            world.features[idx] = room === rooms.guardPost ? Feature.DESK : Feature.APPARATUS;
          }
        }
      }
    }
  }
}

export function fillOranzhereyaVoids(world: World, rng: () => number, existingHubs: Room[]): void {
  carveGreenhouseLine(world, 24, 24, 996, 24, 4, Tex.F_CONCRETE);
  carveGreenhouseLine(world, 24, 996, 996, 996, 4, Tex.F_CONCRETE);
  carveGreenhouseLine(world, 24, 24, 24, 996, 4, Tex.F_CONCRETE);
  carveGreenhouseLine(world, 996, 24, 996, 996, 4, Tex.F_CONCRETE);

  const newRooms: Room[] = [];
  for (let p = 60; p < 960; p += 80) {
    const boothN = tryMakeRoom(world, RoomType.PRODUCTION, p, 32, 16, 12, 'Периметральная щитовая О-8', Tex.PIPE, Tex.F_CONCRETE, 1);
    if (boothN) {
      setFeature(world, boothN.x + 4, boothN.y + 4, Feature.MACHINE);
      setFeature(world, boothN.x + boothN.w - 5, boothN.y + 4, Feature.APPARATUS);
      newRooms.push(boothN);
    }
    const boothS = tryMakeRoom(world, RoomType.PRODUCTION, p, 976, 16, 12, 'Периметральная щитовая О-8', Tex.PIPE, Tex.F_CONCRETE, 1);
    if (boothS) {
      setFeature(world, boothS.x + 4, boothS.y + 4, Feature.MACHINE);
      setFeature(world, boothS.x + boothS.w - 5, boothS.y + 4, Feature.APPARATUS);
      newRooms.push(boothS);
    }
    const boothW = tryMakeRoom(world, RoomType.PRODUCTION, 32, p, 12, 16, 'Трансформаторная будка О-8', Tex.METAL, Tex.F_CONCRETE, 1);
    if (boothW) {
      setFeature(world, boothW.x + 4, boothW.y + 4, Feature.MACHINE);
      setFeature(world, boothW.x + 4, boothW.y + boothW.h - 5, Feature.APPARATUS);
      newRooms.push(boothW);
    }
    const boothE = tryMakeRoom(world, RoomType.PRODUCTION, 976, p, 12, 16, 'Трансформаторная будка О-8', Tex.METAL, Tex.F_CONCRETE, 1);
    if (boothE) {
      setFeature(world, boothE.x + 4, boothE.y + 4, Feature.MACHINE);
      setFeature(world, boothE.x + 4, boothE.y + boothE.h - 5, Feature.APPARATUS);
      newRooms.push(boothE);
    }
  }

  const storageCoords = [
    { x: 120, y: 120, w: 42, h: 28 },
    { x: 440, y: 120, w: 46, h: 30 },
    { x: 720, y: 120, w: 40, h: 28 },
    { x: 120, y: 860, w: 44, h: 30 },
    { x: 720, y: 860, w: 42, h: 28 },
    { x: 280, y: 440, w: 38, h: 26 },
    { x: 680, y: 440, w: 40, h: 26 },
    { x: 520, y: 740, w: 42, h: 28 },
  ];
  for (const sc of storageCoords) {
    const storage = tryMakeRoom(world, RoomType.STORAGE, sc.x, sc.y, sc.w, sc.h, 'Склад госрезерва Оранжереи', Tex.BRICK, Tex.F_CONCRETE, 2);
    if (storage) {
      for (let dy = 5; dy < storage.h - 5; dy += 5) {
        for (let dx = 6; dx < storage.w - 6; dx += 2) {
          const idx = world.idx(storage.x + dx, storage.y + dy);
          if (world.cells[idx] === Cell.FLOOR) world.features[idx] = Feature.SHELF;
        }
      }
      for (let dx = 12; dx < storage.w - 12; dx += 12) {
        const idx = world.idx(storage.x + dx, storage.y + Math.floor(storage.h / 2));
        if (world.cells[idx] === Cell.FLOOR) {
          world.cells[idx] = Cell.WALL;
          world.wallTex[idx] = Tex.CONCRETE;
          world.roomMap[idx] = -1;
          world.features[idx] = Feature.NONE;
        }
      }
      newRooms.push(storage);
    }
  }

  const industrialCoords = [
    { x: 200, y: 380, w: 34, h: 34, type: 'water' },
    { x: 740, y: 380, w: 32, h: 32, type: 'vent' },
    { x: 220, y: 560, w: 32, h: 32, type: 'vent' },
    { x: 680, y: 560, w: 36, h: 36, type: 'water' },
    { x: 380, y: 780, w: 34, h: 34, type: 'water' },
    { x: 580, y: 140, w: 32, h: 32, type: 'vent' },
  ];
  for (const ic of industrialCoords) {
    if (ic.type === 'water') {
      const waterHall = tryMakeRoom(world, RoomType.PRODUCTION, ic.x, ic.y, ic.w, ic.h, 'Зал водоочистки О-8', Tex.TILE_W, Tex.F_TILE, 3);
      if (waterHall) {
        for (let dy = 8; dy < waterHall.h - 8; dy++) {
          for (let dx = 8; dx < waterHall.w - 8; dx++) {
            const idx = world.idx(waterHall.x + dx, waterHall.y + dy);
            if (world.cells[idx] === Cell.FLOOR) {
              world.cells[idx] = Cell.WATER;
              world.floorTex[idx] = Tex.F_WATER;
            }
          }
        }
        for (let dx = 5; dx < waterHall.w - 5; dx += 6) {
          setFeature(world, waterHall.x + dx, waterHall.y + 4, Feature.MACHINE);
          setFeature(world, waterHall.x + dx, waterHall.y + waterHall.h - 5, Feature.MACHINE);
        }
        newRooms.push(waterHall);
      }
    } else {
      const ventTower = tryMakeRoom(world, RoomType.PRODUCTION, ic.x, ic.y, ic.w, ic.h, 'Вентиляционная градирня О-8', Tex.PIPE, Tex.F_CONCRETE, 3);
      if (ventTower) {
        for (let dy = 6; dy < ventTower.h - 6; dy += 6) {
          for (let dx = 6; dx < ventTower.w - 6; dx += 4) {
            const idx = world.idx(ventTower.x + dx, ventTower.y + dy);
            if (world.cells[idx] === Cell.FLOOR) {
              if (dx % 12 === 0) {
                world.cells[idx] = Cell.WALL;
                world.wallTex[idx] = Tex.METAL;
                world.roomMap[idx] = -1;
                world.features[idx] = Feature.NONE;
              } else {
                world.features[idx] = Feature.MACHINE;
              }
            }
          }
        }
        newRooms.push(ventTower);
      }
    }
  }

  const prefixes = ['Курилка агрономов', 'Зал ожидания пайки', 'Пункт проверки фильтров', 'Бытовка капельников', 'Технический карман О-8'];
  let count = 0;
  for (let y = 50; y < 970; y += 28) {
    for (let x = 50; x < 970; x += 28) {
      const w = 16 + Math.floor(rng() * 6);
      const h = 14 + Math.floor(rng() * 6);
      const name = prefixes[count % prefixes.length];
      const room = tryMakeRoom(world, RoomType.COMMON, x, y, w, h, name, Tex.PANEL, Tex.F_LINO, 1);
      if (room) {
        setFeature(world, room.x + 4, room.y + 4, Feature.TABLE);
        setFeature(world, room.x + room.w - 5, room.y + room.h - 5, Feature.SHELF);
        if (rng() < 0.5) setFeature(world, room.x + Math.floor(room.w / 2), room.y + 4, Feature.APPARATUS);
        newRooms.push(room);
        count++;
      }
    }
  }

  const secretWard = tryMakeRoom(world, RoomType.PRODUCTION, 340, 480, 24, 20, 'Секретный бокс гидропоники НИИ', Tex.TILE_W, Tex.F_TILE, 3);
  if (secretWard) {
    setFeature(world, secretWard.x + 6, secretWard.y + 6, Feature.APPARATUS);
    setFeature(world, secretWard.x + secretWard.w - 7, secretWard.y + 6, Feature.MACHINE);
    addContainer(world, secretWard, 3, ContainerKind.METAL_CABINET, 'Инкубатор мутагенных культур', [
      { defId: 'zhelemish_sample_sealed', count: 1 },
      { defId: 'experimental_concentrate', count: 2 },
      { defId: 'nii_sample_container', count: 1 },
      { defId: 'antidep', count: 1 },
    ], ['nii_bioreactor', 'secret_nii', 'mutagenic'], 'locked', Faction.SCIENTIST);
    newRooms.push(secretWard);
  }

  const smugglePoint = tryMakeRoom(world, RoomType.STORAGE, 620, 310, 22, 18, 'Перевалочный пункт агро-контрабанды', Tex.ROTTEN, Tex.F_LINO, 1);
  if (smugglePoint) {
    setFeature(world, smugglePoint.x + 5, smugglePoint.y + 5, Feature.SHELF);
    setFeature(world, smugglePoint.x + smugglePoint.w - 6, smugglePoint.y + smugglePoint.h - 6, Feature.TABLE);
    addContainer(world, smugglePoint, 4, ContainerKind.SECRET_STASH, 'Замаскированная бочка со спиртом и спорами', [
      { defId: 'contraband_shocker_parts', count: 1 },
      { defId: 'black_market_shells', count: 2 },
      { defId: 'braga_bucket', count: 1 },
      { defId: 'technical_spirit', count: 1 },
      { defId: 'govnyak_brick', count: 1 },
    ], ['black_market_88', 'contraband', 'smuggling'], 'secret', Faction.WILD);
    newRooms.push(smugglePoint);
  }

  const cleansingPost = tryMakeRoom(world, RoomType.HQ, 210, 680, 26, 22, 'Огневой рубеж хим-зачистки', Tex.METAL, Tex.F_CONCRETE, 3);
  if (cleansingPost) {
    setFeature(world, cleansingPost.x + 6, cleansingPost.y + 6, Feature.DESK);
    setFeature(world, cleansingPost.x + cleansingPost.w - 7, cleansingPost.y + 6, Feature.MACHINE);
    addContainer(world, cleansingPost, 5, ContainerKind.TOOL_LOCKER, 'Опечатанный ящик дезинфекции', [
      { defId: 'agnia_a130', count: 1 },
      { defId: 'decon_fluid', count: 2 },
      { defId: 'ammo_12g_incendiary', count: 2 },
      { defId: 'ip4_gasmask', count: 1 },
      { defId: 'liquidator_flashlamp', count: 1 },
    ], ['liquidator', 'burn_infestation', 'cleanup'], 'faction', Faction.LIQUIDATOR);
    newRooms.push(cleansingPost);
  }

  const cultAltar = tryMakeRoom(world, RoomType.COMMON, 780, 520, 28, 24, 'Святилище Спор Чернобога', Tex.ROTTEN, Tex.F_GREEN_CARPET, 3);
  if (cultAltar) {
    setFeature(world, cultAltar.x + 8, cultAltar.y + 8, Feature.TABLE);
    setFeature(world, cultAltar.x + cultAltar.w - 9, cultAltar.y + cultAltar.h - 9, Feature.LAMP);
    addContainer(world, cultAltar, 6, ContainerKind.SECRET_STASH, 'Чаша истотитного подношения', [
      { defId: 'holy_water', count: 1 },
      { defId: 'istotit_candle', count: 2 },
      { defId: 'maronary_shaving', count: 1 },
      { defId: 'green_briquette', count: 2 },
      { defId: 'zhelemish_raw', count: 1 },
    ], ['cultist', 'istotit', 'fungal_altar'], 'public', Faction.CULTIST);
    newRooms.push(cultAltar);
  }

  const hydroNode = tryMakeRoom(world, RoomType.PRODUCTION, 480, 210, 24, 20, 'Узел гидро-распределения О-8', Tex.PIPE, Tex.F_CONCRETE, 3);
  if (hydroNode) {
    setFeature(world, hydroNode.x + 6, hydroNode.y + 6, Feature.MACHINE);
    setFeature(world, hydroNode.x + hydroNode.w - 7, hydroNode.y + 6, Feature.APPARATUS);
    addContainer(world, hydroNode, 7, ContainerKind.TOOL_LOCKER, 'Шкаф резервных талонов и вентилей', [
      { defId: 'manometer', count: 1 },
      { defId: 'water_filter_regulator', count: 1 },
      { defId: 'pump_impeller', count: 1 },
      { defId: 'rubber_tube', count: 2 },
      { defId: 'water_coupon', count: 2 },
      { defId: 'hermodoor_journal', count: 1 },
    ], ['water', 'reroute', 'maintenance'], 'locked', Faction.CITIZEN);
    newRooms.push(hydroNode);
  }

  const allTargets = [...existingHubs, ...world.rooms.filter(r => r.name === ORANZHEREYA_ROOM_NAMES.gallery || r.name === ORANZHEREYA_ROOM_NAMES.entry)];
  if (allTargets.length > 0) {
    for (const room of newRooms) {
      let bestTarget = allTargets[0];
      let bestDist = Infinity;
      const rc = roomCenter(room);
      for (const target of allTargets) {
        const tc = roomCenter(target);
        const d = world.dist2(rc.x, rc.y, tc.x, tc.y);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = target;
        }
      }
      connectRoomPair(world, room, bestTarget);
      allTargets.push(room);
    }
  }
}

export function placeMushroomRows(world: World, room: Room): void {
  for (let y = room.y + 5; y < room.y + room.h - 5; y += 7) {
    for (let x = room.x + 5; x < room.x + room.w - 5; x += 2) {
      const idx = world.idx(x, y);
      if (world.cells[idx] !== Cell.FLOOR) continue;
      world.floorTex[idx] = Tex.F_GREEN_CARPET;
      if ((x + y) % 11 === 0) world.features[idx] = Feature.SHELF;
      if ((x + y) % 19 === 0) stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.9, 0.22, x * 31 + y * 37, 72, 88, 56, true);
    }
  }
}

export function placeIrrigationGraph(world: World, rooms: GreenhouseRooms): void {
  const pump = roomCenter(rooms.pump);
  const basin = roomCenter(rooms.waterBasin);
  const north = roomCenter(rooms.northRows);
  const south = roomCenter(rooms.southRows);
  const mushroom = roomCenter(rooms.mushroomWard);
  carveWaterLine(world, pump.x, pump.y, basin.x, basin.y);
  carveWaterLine(world, pump.x, pump.y, north.x, north.y);
  carveWaterLine(world, basin.x, basin.y, south.x, south.y);
  carveWaterLine(world, pump.x, pump.y, mushroom.x, mushroom.y);

  for (let y = rooms.waterBasin.y + 8; y < rooms.waterBasin.y + rooms.waterBasin.h - 8; y++) {
    for (let x = rooms.waterBasin.x + 10; x < rooms.waterBasin.x + rooms.waterBasin.w - 10; x++) {
      if ((x + y) % 3 !== 0) continue;
      const idx = world.idx(x, y);
      if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) continue;
      world.cells[idx] = Cell.WATER;
      world.floorTex[idx] = Tex.F_WATER;
    }
  }
}

export function carveWaterLine(world: World, ax: number, ay: number, bx: number, by: number): void {
  const dx = world.delta(ax, bx);
  const dy = world.delta(ay, by);
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;
  let x = ax;
  let y = ay;
  for (let i = 0; i <= Math.abs(dx); i++) {
    markWater(world, x, y);
    if (i < Math.abs(dx)) x = world.wrap(x + sx);
  }
  for (let i = 0; i <= Math.abs(dy); i++) {
    markWater(world, x, y);
    if (i < Math.abs(dy)) y = world.wrap(y + sy);
  }
}

export function markWater(world: World, x: number, y: number): void {
  for (const [dx, dy] of [[0,0], [1,0], [-1,0], [0,1], [0,-1]] as const) {
    const idx = world.idx(x + dx, y + dy);
    if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) continue;
    world.cells[idx] = Cell.WATER;
    world.floorTex[idx] = Tex.F_WATER;
  }
}

export function placeRoomFixtures(world: World, rooms: GreenhouseRooms): void {
  setFeature(world, rooms.pump.x + 12, rooms.pump.y + 10, Feature.MACHINE);
  setFeature(world, rooms.pump.x + rooms.pump.w - 14, rooms.pump.y + 12, Feature.APPARATUS);
  setFeature(world, rooms.waterBasin.x + 12, rooms.waterBasin.y + 10, Feature.SINK);
  setFeature(world, rooms.waterBasin.x + rooms.waterBasin.w - 13, rooms.waterBasin.y + 11, Feature.APPARATUS);
  setFeature(world, rooms.guardPost.x + 14, rooms.guardPost.y + 12, Feature.DESK);
  setFeature(world, rooms.marketStall.x + 12, rooms.marketStall.y + 16, Feature.TABLE);
  setFeature(world, rooms.seedVault.x + 10, rooms.seedVault.y + 12, Feature.SHELF);
  setFeature(world, rooms.seedVault.x + rooms.seedVault.w - 11, rooms.seedVault.y + 12, Feature.SHELF);
  setFeature(world, rooms.compost.x + 10, rooms.compost.y + 10, Feature.APPARATUS);
  setFeature(world, rooms.burnTrench.x + 10, rooms.burnTrench.y + 12, Feature.MACHINE);

  for (const room of Object.values(rooms)) {
    const c = roomCenter(room);
    setFeature(world, c.x, c.y, room.type === RoomType.STORAGE ? Feature.SHELF : Feature.LAMP);
  }
}

export function stampGrowthFields(world: World, rooms: GreenhouseRooms): void {
  const splats = [
    { room: rooms.northRows, r: 46, g: 120, b: 52, radius: 24 },
    { room: rooms.southRows, r: 64, g: 132, b: 58, radius: 26 },
    { room: rooms.mushroomWard, r: 86, g: 88, b: 64, radius: 30 },
    { room: rooms.burnTrench, r: 130, g: 72, b: 38, radius: 18 },
    { room: rooms.compost, r: 70, g: 55, b: 38, radius: 16 },
  ] as const;
  for (let i = 0; i < splats.length; i++) {
    const c = roomCenter(splats[i].room);
    stampSurfaceSplat(world, c.x, c.y, 0.5, 0.5, splats[i].radius, 0.2, SEED + i * 901, splats[i].r, splats[i].g, splats[i].b, true);
  }
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const idx = world.idx(x, y);
  if (world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.WATER) world.features[idx] = feature;
}

export function placeLifts(world: World, entry: Room): void {
  placeLift(world, entry.x + 8, entry.y + 15, entry.x + 12, entry.y + 15, LiftDirection.UP);
  placeLift(world, entry.x + entry.w - 9, entry.y + 15, entry.x + entry.w - 13, entry.y + 15, LiftDirection.DOWN);
}

export function placeLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const li = world.idx(x, y);
  world.cells[li] = Cell.LIFT;
  world.wallTex[li] = Tex.LIFT_DOOR;
  world.liftDir[li] = direction;
  const bi = world.idx(buttonX, buttonY);
  if (world.cells[bi] === Cell.FLOOR || world.cells[bi] === Cell.WATER) world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = direction;
}

export function placeDrops(world: World, entities: Entity[], nextId: NextId, rooms: GreenhouseRooms): void {
  dropItems(entities, nextId, rooms.northRows, ['mushroom_mass', 'mushroom_mass', 'water_coupon']);
  dropItems(entities, nextId, rooms.waterBasin, ['filtered_water', 'valve_tag']);
  dropItems(entities, nextId, rooms.mushroomWard, ['infected_mushroom', 'spore_print', 'substrate_sack']);
  dropItems(entities, nextId, rooms.burnTrench, ['rock_salt', 'ammo_fuel']);

  const cleansingPost = world.rooms.find(r => r.name === 'Огневой рубеж хим-зачистки');
  if (cleansingPost) dropItems(entities, nextId, cleansingPost, ['body_bag_roll', 'corpse_number_tag', 'contaminated_gloves']);
}

export function dropItems(entities: Entity[], nextId: NextId, room: Room, itemIds: readonly string[]): void {
  for (let i = 0; i < itemIds.length; i++) {
    const defId = itemIds[i];
    if (!ITEMS[defId]) continue;
    const pos = roomCell(room, i + 9);
    entities.push({
      id: nextId.v++,
      type: EntityType.ITEM_DROP,
      x: pos.x + 0.5,
      y: pos.y + 0.5,
      angle: 0,
      pitch: 0,
      alive: true,
      speed: 0,
      sprite: Spr.ITEM_DROP,
      inventory: [{ defId, count: 1 }],
    });
  }
}

export function roomCell(room: Room, salt: number): { x: number; y: number } {
  const iw = Math.max(1, room.w - 2);
  const ih = Math.max(1, room.h - 2);
  return {
    x: room.x + 1 + ((salt * 7) % iw),
    y: room.y + 1 + ((salt * 11) % ih),
  };
}

export function cloneInventory(items: readonly Item[]): Item[] {
  return items.filter(item => !!ITEMS[item.defId]).map(item => ({ ...item }));
}

export function uniqueTags(tags: readonly string[]): string[] {
  return Array.from(new Set(tags)).slice(0, 12);
}

