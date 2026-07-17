import {
  W,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  ZoneFaction,
  type Entity,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { World } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';
import {
  placeDoor,
  placeDoorAt,
  stampRoom,
} from '../shared';
import { REGISTRY_MORGUE_ROUTE_ID, REGISTRY_MORGUE_BASE_FLOOR, NextId, MorgueDoorSide, MorgueRecordDomain, MorgueDrawerSlot, MorgueArchiveBlockSpec, MORGUE_RECORD_DOMAIN_ORDER, REGISTRY_MORGUE_HQ_SPECS, MORGUE_RECORD_DOMAINS } from "./meta";
import { dressMorgueSupportRoom, dressDrawerRoom, nextMorgueContainerId, drawerInventory } from "./npcs";

export function setCellFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
}

export function createDesignRoom(
  world: World,
  id: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  sealed = false,
): Room {
  const room = stampRoom(world, id, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  room.sealed = sealed;

  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
        if (sealed) world.hermoWall[ci] = 1;
      }
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

export function linkRooms(world: World, a: Room, b: Room, state: DoorState): void {
  const before = a.doors.length;
  const hermetic = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED;
  placeDoor(world, a, b, '', hermetic);
  if (a.doors.length <= before) return;
  const doorIdx = a.doors[a.doors.length - 1];
  const door = world.doors.get(doorIdx);
  if (!door) return;
  door.state = state;
}

export function carveMorgueCell(world: World, x: number, y: number, floorTex: Tex, wallTex: Tex, roomId = -1): void {
  const ci = world.idx(x, y);
  const prev = world.cells[ci];
  if (prev !== Cell.LIFT && prev !== Cell.DOOR) world.cells[ci] = Cell.FLOOR;
  if (roomId >= 0 || world.roomMap[ci] < 0) world.roomMap[ci] = roomId;
  world.floorTex[ci] = floorTex;
  if (prev === Cell.WALL || prev === Cell.ABYSS) world.features[ci] = Feature.NONE;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const wi = world.idx(x + dx, y + dy);
      if (world.cells[wi] === Cell.WALL) world.wallTex[wi] = wallTex;
    }
  }
}

export function carveMorgueLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  let x = ax;
  let y = ay;
  const sx = bx === ax ? 0 : bx > ax ? 1 : -1;
  const sy = by === ay ? 0 : by > ay ? 1 : -1;
  while (x !== bx) {
    carveMorgueBand(world, x, y, width, floorTex, wallTex);
    x += sx;
  }
  while (y !== by) {
    carveMorgueBand(world, x, y, width, floorTex, wallTex);
    y += sy;
  }
  carveMorgueBand(world, x, y, width, floorTex, wallTex);
}

export function carveMorgueBand(world: World, x: number, y: number, width: number, floorTex: Tex, wallTex: Tex): void {
  for (let dy = -width; dy <= width; dy++) {
    for (let dx = -width; dx <= width; dx++) carveMorgueCell(world, x + dx, y + dy, floorTex, wallTex);
  }
}

export function carveMorgueFrame(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  carveMorgueLine(world, x, y, x + w, y, width, floorTex, wallTex);
  carveMorgueLine(world, x, y + h, x + w, y + h, width, floorTex, wallTex);
  carveMorgueLine(world, x, y, x, y + h, width, floorTex, wallTex);
  carveMorgueLine(world, x + w, y, x + w, y + h, width, floorTex, wallTex);
}

export function addMorgueGeometryRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  sealed = false,
): Room {
  return createDesignRoom(world, world.rooms.length, type, x, y, w, h, name, wallTex, floorTex, sealed);
}

export function canStampMorgueRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 8 || y < 8 || x + w >= W - 8 || y + h >= W - 8) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      const interior = dx >= 0 && dx < w && dy >= 0 && dy < h;
      if (world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) return false;
      if (interior && world.roomMap[idx] >= 0) return false;
    }
  }
  return true;
}

export function paintMorgueRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      setTerritoryOwnerAtIndex(world, world.idx(room.x + dx, room.y + dy), owner);
    }
  }
}

export function supportRoomSuffix(type: RoomType): string {
  switch (type) {
    case RoomType.KITCHEN: return 'кухня';
    case RoomType.BATHROOM: return 'санузел';
    case RoomType.STORAGE: return 'кладовая';
    case RoomType.MEDICAL: return 'медкабинет';
    case RoomType.OFFICE: return 'канцелярия';
    case RoomType.PRODUCTION: return 'мастерская';
    case RoomType.COMMON: return 'общая';
    default: return 'комната';
  }
}

export function addMorgueOwnedRoom(
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
  doorSide: MorgueDoorSide,
  doorTargetX: number,
  doorTargetY: number,
  sealed = false,
): Room | null {
  if (!canStampMorgueRoom(world, x, y, w, h)) return null;
  const room = addMorgueGeometryRoom(world, type, x, y, w, h, name, wallTex, floorTex, sealed);
  paintMorgueRoomTerritory(world, room, owner);
  dressMorgueSupportRoom(world, room, room.id);
  openMorgueDoor(
    world,
    room,
    doorSide,
    doorSide === 'north' || doorSide === 'south' ? Math.floor(room.w / 2) : Math.floor(room.h / 2),
    sealed ? DoorState.HERMETIC_CLOSED : DoorState.CLOSED,
    doorTargetX,
    doorTargetY,
  );
  return room;
}

export function openMorgueDoor(
  world: World,
  room: Room,
  side: MorgueDoorSide,
  offset: number,
  state: DoorState,
  targetX?: number,
  targetY?: number,
): void {
  const ox = Math.max(1, Math.min(room.w - 2, offset));
  const oy = Math.max(1, Math.min(room.h - 2, offset));
  let wx = room.x;
  let wy = room.y;
  let cx = room.x;
  let cy = room.y;

  switch (side) {
    case 'north':
      wx = room.x + ox;
      wy = room.y - 1;
      cx = wx;
      cy = wy - 1;
      break;
    case 'south':
      wx = room.x + ox;
      wy = room.y + room.h;
      cx = wx;
      cy = wy + 1;
      break;
    case 'west':
      wx = room.x - 1;
      wy = room.y + oy;
      cx = wx - 1;
      cy = wy;
      break;
    case 'east':
      wx = room.x + room.w;
      wy = room.y + oy;
      cx = wx + 1;
      cy = wy;
      break;
  }

  carveMorgueCell(world, cx, cy, Tex.F_TILE, room.wallTex);
  placeDoorAt(world, wx, wy, room.id);
  const door = world.doors.get(world.idx(wx, wy));
  if (door) door.state = state;
  if (targetX !== undefined && targetY !== undefined) {
    carveMorgueLine(world, cx, cy, targetX, targetY, 0, Tex.F_TILE, room.wallTex);
  }
}

export function buildMorgueFactionHqs(world: World): void {
  for (const spec of REGISTRY_MORGUE_HQ_SPECS) {
    if (!canStampMorgueRoom(world, spec.x, spec.y, spec.w, spec.h)) continue;
    const core = addMorgueGeometryRoom(
      world,
      RoomType.HQ,
      spec.x,
      spec.y,
      spec.w,
      spec.h,
      spec.name,
      spec.wallTex,
      spec.floorTex,
      true,
    );
    paintMorgueRoomTerritory(world, core, spec.owner);
    dressMorgueSupportRoom(world, core, core.id);

    const centerX = core.x + Math.floor(core.w / 2);
    const corridorY = spec.exitSide === 'south' ? core.y + core.h + 8 : core.y - 8;
    carveMorgueLine(world, core.x - 18, corridorY, core.x + core.w + 18, corridorY, 1, spec.floorTex, spec.wallTex);
    openMorgueDoor(world, core, spec.exitSide, Math.floor(core.w / 2), DoorState.HERMETIC_CLOSED, centerX, corridorY);
    carveMorgueLine(world, centerX, corridorY, spec.connectX, spec.connectY, 1, spec.floorTex, spec.wallTex);

    const supportDoor = spec.exitSide === 'south' ? 'north' : 'south';
    const roomY = spec.exitSide === 'south' ? corridorY + 4 : corridorY - 15;
    const startX = core.x - 12;
    for (let i = 0; i < spec.support.length; i++) {
      const type = spec.support[i];
      const w = type === RoomType.MEDICAL || type === RoomType.PRODUCTION ? 20 : 17;
      const x = startX + i * 23;
      const room = addMorgueOwnedRoom(
        world,
        type,
        x,
        roomY,
        w,
        11,
        `${spec.supportPrefix}: ${supportRoomSuffix(type)}`,
        spec.wallTex,
        type === RoomType.KITCHEN || type === RoomType.BATHROOM || type === RoomType.MEDICAL ? Tex.F_TILE : spec.floorTex,
        spec.owner,
        supportDoor,
        x + Math.floor(w / 2),
        corridorY,
      );
      if (room) paintMorgueRoomTerritory(world, room, spec.owner);
    }
  }
}

export function reinforceRegistryMorgueAuthoredTerritory(world: World): void {
  for (const spec of REGISTRY_MORGUE_HQ_SPECS) {
    for (const room of world.rooms) {
      if (room.name !== spec.name && !room.name.startsWith(`${spec.supportPrefix}:`)) continue;
      paintMorgueRoomTerritory(world, room, spec.owner);
      if (room.name === spec.name) room.type = RoomType.HQ;
    }
  }
}

export function buildMorgueArchiveBlock(world: World, spec: MorgueArchiveBlockSpec, rng: () => number): void {
  const corridorY = spec.y + Math.floor(spec.h / 2);
  const left = spec.x + 8;
  const right = spec.x + spec.w - 8;
  carveMorgueLine(world, left, corridorY, right, corridorY, 1, Tex.F_TILE, Tex.TILE_W);
  carveMorgueLine(world, spec.x + Math.floor(spec.w / 2), corridorY, spec.connectX, spec.connectY, 1, Tex.F_TILE, Tex.TILE_W);

  for (let x = spec.x + 12; x <= spec.x + spec.w - 28; x += 26) {
    for (const row of [
      { y: spec.y + 8, side: 'south' as MorgueDoorSide },
      { y: spec.y + 30, side: 'south' as MorgueDoorSide },
      { y: spec.y + spec.h - 42, side: 'north' as MorgueDoorSide },
      { y: spec.y + spec.h - 20, side: 'north' as MorgueDoorSide },
    ]) {
      const roomW = 16 + Math.floor(rng() * 4);
      const roomH = 9 + Math.floor(rng() * 3);
      const type = ((x + row.y) % 5 === 0) ? RoomType.OFFICE : RoomType.STORAGE;
      const room = addMorgueOwnedRoom(
        world,
        type,
        x,
        row.y,
        roomW,
        roomH,
        `${spec.name}: копийная ячейка`,
        Tex.TILE_W,
        Tex.F_TILE,
        spec.ownerHint,
        row.side,
        x + Math.floor(roomW / 2),
        corridorY,
      );
      if (!room) continue;
      if (type === RoomType.STORAGE) {
        setCellFeature(world, room.x + 2, room.y + Math.floor(room.h / 2), Feature.SHELF);
        setCellFeature(world, room.x + room.w - 3, room.y + Math.floor(room.h / 2), Feature.SHELF);
      }
    }
  }
}

export function buildMorgueArchiveSideBlocks(world: World, rng: () => number): void {
  const blocks: readonly MorgueArchiveBlockSpec[] = [
    { x: 88, y: 118, w: 340, h: 118, name: 'Северо-западный зал копий живых', connectX: 240, connectY: 260, ownerHint: ZoneFaction.CITIZEN },
    { x: 582, y: 118, w: 350, h: 118, name: 'Северо-восточный зал карантинных копий', connectX: 784, connectY: 260, ownerHint: ZoneFaction.LIQUIDATOR },
    { x: 88, y: 804, w: 342, h: 118, name: 'Юго-западный зал последних подписей', connectX: 240, connectY: 782, ownerHint: ZoneFaction.CULTIST },
    { x: 584, y: 804, w: 348, h: 118, name: 'Юго-восточный зал выбитых бирок', connectX: 784, connectY: 782, ownerHint: ZoneFaction.WILD },
  ];
  for (const block of blocks) buildMorgueArchiveBlock(world, block, rng);
}

export function buildMorgueMicroDrawerRows(world: World, rng: () => number): void {
  const rows = [
    { corridorY: 298, roomY: 306, side: 'north' as MorgueDoorSide, owner: ZoneFaction.SCIENTIST, prefix: 'Микрокартотека живых' },
    { corridorY: 350, roomY: 360, side: 'north' as MorgueDoorSide, owner: ZoneFaction.CITIZEN, prefix: 'Микрокабинет сверки фамилий' },
    { corridorY: 402, roomY: 416, side: 'north' as MorgueDoorSide, owner: ZoneFaction.LIQUIDATOR, prefix: 'Микроотсек карантинной бирки' },
    { corridorY: 616, roomY: 600, side: 'south' as MorgueDoorSide, owner: ZoneFaction.SCIENTIST, prefix: 'Микрокартотека умерших' },
    { corridorY: 668, roomY: 646, side: 'south' as MorgueDoorSide, owner: ZoneFaction.CITIZEN, prefix: 'Микроокно выдачи копий' },
    { corridorY: 720, roomY: 696, side: 'south' as MorgueDoorSide, owner: ZoneFaction.WILD, prefix: 'Микрокладовая сорванных бирок' },
  ];
  for (const row of rows) {
    for (let x = 82; x <= 930; x += 28) {
      const roomW = 12 + Math.floor(rng() * 5);
      const roomH = 7 + Math.floor(rng() * 3);
      const room = addMorgueOwnedRoom(
        world,
        (x + row.corridorY) % 7 === 0 ? RoomType.OFFICE : RoomType.STORAGE,
        x,
        row.roomY,
        roomW,
        roomH,
        `${row.prefix} ${x}`,
        Tex.TILE_W,
        Tex.F_TILE,
        row.owner,
        row.side,
        x + Math.floor(roomW / 2),
        row.corridorY,
      );
      if (!room) continue;
      if (rng() < 0.25) setCellFeature(world, room.x + room.w - 2, room.y + Math.floor(room.h / 2), Feature.SCREEN);
    }
  }
}

export function dressDrawerCorridor(world: World, y: number, fromX: number, toX: number): void {
  for (let x = fromX; x <= toX; x += 6) {
    setCellFeature(world, x, y - 1, Feature.SHELF);
    setCellFeature(world, x + 3, y + 1, Feature.SHELF);
    if (x % 24 === 0) setCellFeature(world, x, y, Feature.LAMP);
  }
}

export function dressConveyorSpine(world: World): void {
  for (let x = 92; x <= 932; x += 12) {
    setCellFeature(world, x, 516, Feature.MACHINE);
    if (x % 48 === 8) setCellFeature(world, x + 4, 514, Feature.DESK);
  }
  for (let y = 304; y <= 720; y += 32) {
    setCellFeature(world, 512, y, Feature.SCREEN);
  }
}

export function dressAutopsyBay(world: World, room: Room): void {
  for (let dx = 5; dx < room.w - 4; dx += 12) {
    setCellFeature(world, room.x + dx, room.y + Math.floor(room.h / 2), Feature.BED);
    setCellFeature(world, room.x + dx + 3, room.y + Math.floor(room.h / 2), Feature.APPARATUS);
  }
  for (let dx = 3; dx < room.w - 2; dx += 10) setCellFeature(world, room.x + dx, room.y + 2, Feature.SINK);
  setCellFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.LAMP);
}

export function dressRegistryCounter(world: World, room: Room): void {
  for (let dx = 2; dx < room.w - 2; dx++) setCellFeature(world, room.x + dx, room.y + 3, Feature.DESK);
  for (let dx = 3; dx < room.w - 3; dx += 4) setCellFeature(world, room.x + dx, room.y + 5, Feature.CHAIR);
  for (let dy = 2; dy < room.h - 2; dy += 3) setCellFeature(world, room.x + room.w - 2, room.y + dy, Feature.SHELF);
  setCellFeature(world, room.x + 2, room.y + room.h - 3, Feature.SCREEN);
}

export function dressFrostVault(world: World, room: Room): void {
  for (let dy = 2; dy < room.h - 2; dy += 3) {
    setCellFeature(world, room.x + 2, room.y + dy, Feature.SHELF);
    setCellFeature(world, room.x + room.w - 3, room.y + dy, Feature.SHELF);
  }
  for (let dx = 7; dx < room.w - 5; dx += 10) setCellFeature(world, room.x + dx, room.y + Math.floor(room.h / 2), Feature.BED);
  setCellFeature(world, room.x + Math.floor(room.w / 2), room.y + 2, Feature.LAMP);
}

export function rotateHilbertQuadrant(n: number, x: number, y: number, rx: number, ry: number): [number, number] {
  if (ry !== 0) return [x, y];
  if (rx !== 0) {
    x = n - 1 - x;
    y = n - 1 - y;
  }
  return [y, x];
}

export function hilbertIndex1024(x: number, y: number): number {
  let hx = Math.max(0, Math.min(W - 1, x | 0));
  let hy = Math.max(0, Math.min(W - 1, y | 0));
  let d = 0;
  for (let s = W >> 1; s > 0; s >>= 1) {
    const rx = (hx & s) > 0 ? 1 : 0;
    const ry = (hy & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    [hx, hy] = rotateHilbertQuadrant(s, hx, hy, rx, ry);
  }
  return d;
}

export function buildDrawerCanyon(world: World, rng: () => number): MorgueDrawerSlot[] {
  const drawerSlots: MorgueDrawerSlot[] = [];
  const rows = [
    { roomY: 282, corridorY: 298, door: 'south' as MorgueDoorSide },
    { roomY: 334, corridorY: 350, door: 'south' as MorgueDoorSide },
    { roomY: 386, corridorY: 402, door: 'south' as MorgueDoorSide },
    { roomY: 620, corridorY: 616, door: 'north' as MorgueDoorSide },
    { roomY: 672, corridorY: 668, door: 'north' as MorgueDoorSide },
    { roomY: 724, corridorY: 720, door: 'north' as MorgueDoorSide },
  ];

  for (const row of rows) {
    carveMorgueLine(world, 76, row.corridorY, 948, row.corridorY, 1, Tex.F_TILE, Tex.HERMO_WALL);
    dressDrawerCorridor(world, row.corridorY, 84, 940);
    for (let x = 96; x <= 872; x += 112) {
      const room = addMorgueGeometryRoom(
        world,
        RoomType.STORAGE,
        x + Math.floor(rng() * 5),
        row.roomY,
        30 + Math.floor(rng() * 5),
        12,
        row.roomY < 512 ? 'Северная стена ящиков' : 'Южная стена ящиков',
        Tex.HERMO_WALL,
        Tex.F_TILE,
        true,
      );
      dressDrawerRoom(world, room, room.id);
      openMorgueDoor(world, room, row.door, Math.floor(room.w / 2), DoorState.CLOSED, room.x + Math.floor(room.w / 2), row.corridorY);
      const slotX = room.x + 2 + ((room.id * 7) % Math.max(4, room.w - 5));
      const slotY = row.door === 'south' ? room.y + 1 : room.y + room.h - 2;
      drawerSlots.push({ x: slotX, y: slotY, roomId: room.id, hilbert: hilbertIndex1024(slotX, slotY) });
    }
  }
  return drawerSlots;
}

export function initialMorgueRecordDomain(slot: MorgueDrawerSlot): MorgueRecordDomain {
  const living = (slot.x - 500) * (slot.x - 500) + (slot.y - 516) * (slot.y - 516) - 16000;
  const dead = Math.min(
    (slot.x - 240) * (slot.x - 240) + (slot.y - 350) * (slot.y - 350),
    (slot.x - 784) * (slot.x - 784) + (slot.y - 668) * (slot.y - 668),
  );
  const contaminated = (slot.x - 835) * (slot.x - 835) + (slot.y - 516) * (slot.y - 516) - 9000;
  if (contaminated <= living && contaminated <= dead) return 'contaminated_record';
  if (living <= dead) return 'living_record';
  return 'dead_record';
}

export function smoothMorgueRecordDomains(slots: readonly MorgueDrawerSlot[]): MorgueRecordDomain[] {
  const domains = slots.map(initialMorgueRecordDomain);
  const influenceRadius2 = 150 * 150;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < slots.length; i++) {
      const scores: Record<MorgueRecordDomain, number> = {
        living_record: domains[i] === 'living_record' ? 1.2 : 0,
        dead_record: domains[i] === 'dead_record' ? 1.2 : 0,
        contaminated_record: domains[i] === 'contaminated_record' ? 1.2 : 0,
      };
      for (let j = 0; j < slots.length; j++) {
        if (i === j) continue;
        const dx = slots[i].x - slots[j].x;
        const dy = slots[i].y - slots[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 > influenceRadius2) continue;
        scores[domains[j]] += 1.0 - d2 / influenceRadius2;
      }
      let best = domains[i];
      for (const domain of MORGUE_RECORD_DOMAIN_ORDER) {
        if (scores[domain] > scores[best]) best = domain;
      }
      domains[i] = best;
    }
  }
  for (const domain of MORGUE_RECORD_DOMAIN_ORDER) {
    if (domains.includes(domain)) continue;
    let bestIdx = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < slots.length; i++) {
      const candidate = initialMorgueRecordDomain(slots[i]);
      const penalty = candidate === domain ? -1_000_000 : 0;
      const score = slots[i].hilbert + penalty;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    domains[bestIdx] = domain;
  }
  return domains;
}

export function addHilbertDrawerRegistry(world: World, drawerSlots: readonly MorgueDrawerSlot[]): void {
  const ordered = [...drawerSlots].sort((a, b) => a.hilbert - b.hilbert);
  const domains = smoothMorgueRecordDomains(ordered);
  for (let i = 0; i < ordered.length; i++) {
    const slot = ordered[i];
    if (world.containersAt(slot.x, slot.y).length > 0) continue;
    const domain = MORGUE_RECORD_DOMAINS[domains[i]];
    const order = i + 1;
    const orderLabel = order.toString().padStart(2, '0');
    world.addContainer({
      id: nextMorgueContainerId(world),
      x: slot.x,
      y: slot.y,
      z: REGISTRY_MORGUE_BASE_FLOOR,
      roomId: slot.roomId,
      zoneId: world.zoneMap[world.idx(slot.x, slot.y)],
      kind: ContainerKind.FILING_CABINET,
      name: `Ящик H-${orderLabel}: ${domain.label}`,
      inventory: drawerInventory(domains[i], order),
      capacitySlots: 6,
      faction: domain.faction,
      access: domain.access,
      lockDifficulty: 4,
      discovered: true,
      tags: [
        REGISTRY_MORGUE_ROUTE_ID,
        'morgue',
        'drawer_canyon',
        'hilbert_tag_order',
        `hilbert_order_${orderLabel}`,
        'potts_record_domain',
        domain.tag,
        'morgue_theft',
      ],
    });
  }
}

export function buildAutopsyBays(world: World): void {
  const specs = [
    { x: 128, y: 454, side: 'south' as MorgueDoorSide },
    { x: 256, y: 454, side: 'south' as MorgueDoorSide },
    { x: 704, y: 454, side: 'south' as MorgueDoorSide },
    { x: 832, y: 454, side: 'south' as MorgueDoorSide },
    { x: 128, y: 548, side: 'north' as MorgueDoorSide },
    { x: 256, y: 548, side: 'north' as MorgueDoorSide },
    { x: 704, y: 548, side: 'north' as MorgueDoorSide },
    { x: 832, y: 548, side: 'north' as MorgueDoorSide },
  ];
  for (const spec of specs) {
    const room = addMorgueGeometryRoom(world, RoomType.MEDICAL, spec.x, spec.y, 48, 22, 'Аутопсийная бухта', Tex.TILE_W, Tex.F_TILE);
    dressAutopsyBay(world, room);
    openMorgueDoor(world, room, spec.side, Math.floor(room.w / 2), DoorState.CLOSED, room.x + Math.floor(room.w / 2), 516);
  }
}

export function buildRegistryCounters(world: World): void {
  const upper = addMorgueGeometryRoom(world, RoomType.OFFICE, 610, 486, 68, 22, 'Стойка юридической смерти', Tex.MARBLE, Tex.F_PARQUET);
  const lower = addMorgueGeometryRoom(world, RoomType.OFFICE, 346, 526, 66, 22, 'Стол сверки живых фамилий', Tex.MARBLE, Tex.F_PARQUET);
  dressRegistryCounter(world, upper);
  dressRegistryCounter(world, lower);
  openMorgueDoor(world, upper, 'south', Math.floor(upper.w / 2), DoorState.CLOSED, upper.x + Math.floor(upper.w / 2), 516);
  openMorgueDoor(world, lower, 'north', Math.floor(lower.w / 2), DoorState.CLOSED, lower.x + Math.floor(lower.w / 2), 516);
}

export function buildFrostVaults(world: World): void {
  const west = addMorgueGeometryRoom(world, RoomType.STORAGE, 184, 506, 44, 30, 'Фрост-капсула повторной смерти', Tex.HERMO_WALL, Tex.F_TILE, true);
  const east = addMorgueGeometryRoom(world, RoomType.STORAGE, 796, 506, 46, 30, 'Фрост-архив безымянных', Tex.HERMO_WALL, Tex.F_TILE, true);
  dressFrostVault(world, west);
  dressFrostVault(world, east);
  openMorgueDoor(world, west, 'east', Math.floor(west.h / 2), DoorState.HERMETIC_CLOSED, 240, 516);
  openMorgueDoor(world, east, 'west', Math.floor(east.h / 2), DoorState.HERMETIC_CLOSED, 784, 516);
}

export function carveTagSwitchbacks(world: World): void {
  const north = [
    [564, 516], [564, 460], [612, 460], [612, 424], [564, 424], [564, 388], [612, 388], [612, 350], [564, 350], [564, 298],
  ];
  const south = [
    [460, 516], [460, 574], [412, 574], [412, 616], [460, 616], [460, 668], [412, 668], [412, 720],
  ];
  for (let i = 1; i < north.length; i++) carveMorgueLine(world, north[i - 1][0], north[i - 1][1], north[i][0], north[i][1], 1, Tex.F_TILE, Tex.HERMO_WALL);
  for (let i = 1; i < south.length; i++) carveMorgueLine(world, south[i - 1][0], south[i - 1][1], south[i][0], south[i][1], 1, Tex.F_TILE, Tex.HERMO_WALL);
}

export function expandRegistryMorgueGeometry(world: World, rng: () => number): void {
  const drawerSlots = buildDrawerCanyon(world, rng);
  buildAutopsyBays(world);
  buildRegistryCounters(world);
  buildFrostVaults(world);

  carveMorgueLine(world, 72, 516, 952, 516, 2, Tex.F_TILE, Tex.METAL);
  carveMorgueLine(world, 116, 476, 908, 476, 1, Tex.F_TILE, Tex.TILE_W);
  carveMorgueLine(world, 116, 556, 908, 556, 1, Tex.F_TILE, Tex.TILE_W);
  carveMorgueLine(world, 116, 476, 116, 556, 1, Tex.F_TILE, Tex.TILE_W);
  carveMorgueLine(world, 908, 476, 908, 556, 1, Tex.F_TILE, Tex.TILE_W);
  carveMorgueLine(world, 512, 260, 512, 780, 1, Tex.F_TILE, Tex.HERMO_WALL);
  carveMorgueFrame(world, 64, 260, 896, 194, 2, Tex.F_TILE, Tex.HERMO_WALL);
  carveMorgueFrame(world, 64, 588, 896, 194, 2, Tex.F_TILE, Tex.HERMO_WALL);
  carveMorgueLine(world, 64, 358, 960, 358, 1, Tex.F_TILE, Tex.HERMO_WALL);
  carveMorgueLine(world, 64, 674, 960, 674, 1, Tex.F_TILE, Tex.HERMO_WALL);
  carveMorgueLine(world, 240, 260, 240, 782, 1, Tex.F_TILE, Tex.TILE_W);
  carveMorgueLine(world, 784, 260, 784, 782, 1, Tex.F_TILE, Tex.TILE_W);
  carveTagSwitchbacks(world);
  dressConveyorSpine(world);
  buildMorgueFactionHqs(world);
  buildMorgueArchiveSideBlocks(world, rng);
  buildMorgueMicroDrawerRows(world, rng);
  addHilbertDrawerRegistry(world, drawerSlots);
}

export function placeDesignLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
  const bi = world.idx(x + 1, y);
  if (world.cells[bi] === Cell.FLOOR) {
    world.features[bi] = Feature.LIFT_BUTTON;
    world.liftDir[bi] = direction;
  }
}

export function addDrop(
  entities: Entity[],
  nextId: NextId,
  x: number,
  y: number,
  defId: string,
  count = 1,
  data?: unknown,
): void {
  entities.push({
    id: nextId.v++, type: EntityType.ITEM_DROP,
    x: x + 0.5, y: y + 0.5,
    angle: 0, pitch: 0,
    alive: true, speed: 0, sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count, data }],
  });
}

export function decorateRegistryMorgue(
  world: World,
  rooms: {
    reception: Room;
    washing: Room;
    tagRoom: Room;
    cold: Room;
    ledger: Room;
    contaminated: Room;
  },
): void {
  const { reception, washing, tagRoom, cold, ledger, contaminated } = rooms;

  for (let dx = 2; dx < reception.w - 2; dx++) setCellFeature(world, reception.x + dx, reception.y + 3, Feature.DESK);
  for (let dx = 2; dx < reception.w - 2; dx += 3) setCellFeature(world, reception.x + dx, reception.y + 4, Feature.CHAIR);
  setCellFeature(world, reception.x + reception.w - 2, reception.y + 1, Feature.LAMP);
  setCellFeature(world, reception.x + 2, reception.y + reception.h - 2, Feature.SCREEN);

  for (let dx = 2; dx < washing.w - 2; dx += 4) {
    setCellFeature(world, washing.x + dx, washing.y + 2, Feature.SINK);
    setCellFeature(world, washing.x + dx, washing.y + washing.h - 3, Feature.APPARATUS);
  }
  setCellFeature(world, washing.x + washing.w - 2, washing.y + 1, Feature.LAMP);

  for (let dy = 1; dy < tagRoom.h - 1; dy++) setCellFeature(world, tagRoom.x + 1, tagRoom.y + dy, Feature.SHELF);
  for (let dx = 3; dx < tagRoom.w - 2; dx += 3) setCellFeature(world, tagRoom.x + dx, tagRoom.y + 2, Feature.DESK);
  setCellFeature(world, tagRoom.x + tagRoom.w - 2, tagRoom.y + tagRoom.h - 2, Feature.LAMP);

  for (let dx = 2; dx < cold.w - 2; dx += 4) {
    setCellFeature(world, cold.x + dx, cold.y + 2, Feature.SHELF);
    setCellFeature(world, cold.x + dx, cold.y + cold.h - 3, Feature.SHELF);
  }
  for (let dx = 4; dx < cold.w - 3; dx += 5) setCellFeature(world, cold.x + dx, cold.y + Math.floor(cold.h / 2), Feature.BED);
  setCellFeature(world, cold.x + cold.w - 3, cold.y + 1, Feature.LAMP);

  for (let dy = 1; dy < ledger.h - 1; dy++) {
    setCellFeature(world, ledger.x + 1, ledger.y + dy, Feature.SHELF);
    setCellFeature(world, ledger.x + ledger.w - 2, ledger.y + dy, Feature.SHELF);
  }
  for (let dx = 4; dx < ledger.w - 3; dx += 4) setCellFeature(world, ledger.x + dx, ledger.y + 3, Feature.DESK);
  setCellFeature(world, ledger.x + Math.floor(ledger.w / 2), ledger.y + 1, Feature.LAMP);

  setCellFeature(world, contaminated.x + 2, contaminated.y + 2, Feature.APPARATUS);
  setCellFeature(world, contaminated.x + contaminated.w - 3, contaminated.y + 2, Feature.SINK);
  setCellFeature(world, contaminated.x + 3, contaminated.y + contaminated.h - 3, Feature.SHELF);
  setCellFeature(world, contaminated.x + contaminated.w - 3, contaminated.y + contaminated.h - 3, Feature.LAMP);

  world.wallTex[world.idx(reception.x + reception.w - 1, reception.y - 1)] = Tex.SCREEN_BASE + 3;
  world.wallTex[world.idx(ledger.x + Math.floor(ledger.w / 2), ledger.y - 1)] = Tex.POSTER_BASE + 9;
}

export function retuneRegistryMorgueZones(world: World): void {
  for (let i = 0; i < world.zones.length; i++) {
    const zone = world.zones[i];
    if (!zone) continue;
    const coldRows = zone.cy >= 250 && zone.cy <= 790 && (zone.cy < 455 || zone.cy > 585) && zone.cx >= 60 && zone.cx <= 965;
    const registryCore = zone.cx >= 300 && zone.cx <= 725 && zone.cy >= 455 && zone.cy <= 585;
    if (coldRows) {
      zone.faction = ZoneFaction.SAMOSBOR;
      zone.level = Math.max(zone.level, 4);
    } else if (registryCore) {
      zone.faction = zone.id % 3 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
      zone.level = Math.max(zone.level, 3);
    }
  }
}

