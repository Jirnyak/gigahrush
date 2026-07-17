import {
  Cell,
  DoorState,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  ZoneFaction,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { stampRoom } from '../shared';
import { DORM_RINGS, DormLayout, DormRooms, DormHq, DormHqSpec } from "./meta";

export function carveDormSlabs(world: World): DormLayout {
  const leftX = 356;
  const rightX = 668;
  const northY = 458;
  const southY = 560;
  carveLineWidth(world, leftX, northY, rightX, northY, 3, Tex.F_LINO);
  carveLineWidth(world, leftX, southY, rightX, southY, 3, Tex.F_LINO);
  for (const x of [378, 512, 646]) carveLineWidth(world, x, northY, x, southY + 2, 3, Tex.F_LINO);
  carveLineWidth(world, leftX, 510, rightX, 510, 2, Tex.F_CONCRETE);
  carveLineWidth(world, 512, northY - 20, 512, southY + 22, 2, Tex.F_CONCRETE);
  placeCorridorNoiseBreak(world, 446, northY, 1);
  placeCorridorNoiseBreak(world, 574, southY, 1);
  return { leftX, rightX, northY, southY, spawnX: leftX + 5.5, spawnY: northY + 1.5 };
}

export function carveDormRings(world: World, layout: DormLayout): void {
  for (const ring of DORM_RINGS) carveDormRing(world, ring.left, ring.top, ring.right, ring.bottom, ring.width);

  for (const x of [layout.leftX, 378, 512, 646, layout.rightX]) {
    carveLineWidth(world, x, DORM_RINGS[0].top, x, DORM_RINGS[0].bottom, 2, Tex.F_LINO);
  }
  for (const x of [184, 332, 512, 692, 840]) {
    carveLineWidth(world, x, DORM_RINGS[1].top, x, DORM_RINGS[3].bottom, 2, Tex.F_LINO);
  }
  for (const y of [layout.northY, 510, layout.southY, 646]) {
    carveLineWidth(world, DORM_RINGS[0].left, y, DORM_RINGS[2].right, y, 2, Tex.F_LINO);
  }
  carveLineWidth(world, DORM_RINGS[3].left, 512, DORM_RINGS[3].right, 512, 2, Tex.F_LINO);
  carveLineWidth(world, 512, DORM_RINGS[3].top, 512, DORM_RINGS[3].bottom, 2, Tex.F_LINO);
}

export function carveDormRing(world: World, left: number, top: number, right: number, bottom: number, width: number): void {
  carveLineWidth(world, left, top, right, top, width, Tex.F_LINO);
  carveLineWidth(world, left, bottom, right, bottom, width, Tex.F_LINO);
  carveLineWidth(world, left, top, left, bottom, width, Tex.F_LINO);
  carveLineWidth(world, right, top, right, bottom, width, Tex.F_LINO);
}

export function buildDormRooms(world: World, layout: DormLayout): DormRooms {
  const bunks: Room[] = [];
  const support: Room[] = [];
  const hqs: DormHq[] = [];
  for (let i = 0; i < 8; i++) {
    const x = 368 + i * 36;
    const north = createRoom(world, RoomType.LIVING, x, layout.northY - 18, 22, 12, `Северная спальная секция ${i + 1}`, Tex.PANEL, Tex.F_CARPET);
    connectRoomToPoint(world, north, north.x + 11, north.y + north.h, north.x + 11, layout.northY + 1, DoorState.CLOSED);
    bunks.push(north);

    const south = createRoom(world, RoomType.LIVING, x, layout.southY + 6, 22, 12, `Южная спальная секция ${i + 1}`, Tex.PANEL, Tex.F_CARPET);
    connectRoomToPoint(world, south, south.x + 11, south.y - 1, south.x + 11, layout.southY + 1, DoorState.CLOSED);
    bunks.push(south);
  }

  const watch = createRoom(world, RoomType.OFFICE, 493, 480, 38, 18, 'Пост ночного обхода', Tex.PANEL, Tex.F_LINO);
  connectRoomToPoint(world, watch, watch.x + 19, watch.y - 1, watch.x + 19, layout.northY + 1, DoorState.CLOSED);

  const kitchen = createRoom(world, RoomType.KITCHEN, 318, 490, 30, 24, 'Чайная сменного общежития', Tex.TILE_W, Tex.F_TILE);
  connectRoomToPoint(world, kitchen, kitchen.x + kitchen.w, kitchen.y + 12, layout.leftX, kitchen.y + 12, DoorState.CLOSED);

  const lockers = createRoom(world, RoomType.STORAGE, 684, 448, 30, 28, 'Сушилка и сменные шкафы', Tex.PANEL, Tex.F_CONCRETE);
  connectRoomToPoint(world, lockers, lockers.x - 1, lockers.y + 14, layout.rightX, lockers.y + 14, DoorState.LOCKED, 'container_key_label');

  const wash = createRoom(world, RoomType.BATHROOM, 684, 540, 30, 24, 'Умывальная тихой смены', Tex.TILE_W, Tex.F_WATER);
  connectRoomToPoint(world, wash, wash.x - 1, wash.y + 12, layout.rightX, wash.y + 12, DoorState.CLOSED);

  const shelter = createRoom(world, RoomType.COMMON, 456, 596, 112, 22, 'Гермоубежище под спальными секциями', Tex.HERMO_WALL, Tex.F_CONCRETE);
  shelter.sealed = true;
  connectRoomToPoint(world, shelter, shelter.x + 56, shelter.y - 1, shelter.x + 56, layout.southY + 1, DoorState.HERMETIC_OPEN);

  const smoking = createRoom(world, RoomType.SMOKING, 406, 486, 32, 18, 'Курилка шепотом у батареи', Tex.PANEL, Tex.F_LINO);
  connectRoomToPoint(world, smoking, smoking.x + 16, smoking.y - 1, smoking.x + 16, layout.northY + 1, DoorState.CLOSED);

  return { bunks, support, hqs, watch, kitchen, lockers, wash, shelter, smoking };
}

export function buildDormRoomStacks(world: World, rooms: DormRooms): void {
  let serial = 0;
  for (let ringIndex = 0; ringIndex < DORM_RINGS.length; ringIndex++) {
    const ring = DORM_RINGS[ringIndex];
    for (let x = ring.left + 34; x <= ring.right - 34; x += 42) {
      const north = createDormStackRoom(world, x - 9, ring.top - 15, 18, 11, 'north', ring.top, ringIndex, serial++);
      registerDormStackRoom(rooms, north);
      const south = createDormStackRoom(world, x - 9, ring.bottom + 4, 18, 11, 'south', ring.bottom, ringIndex, serial++);
      registerDormStackRoom(rooms, south);
    }
    for (let y = ring.top + 34; y <= ring.bottom - 34; y += 42) {
      const west = createDormStackRoom(world, ring.left - 16, y - 8, 12, 16, 'west', ring.left, ringIndex, serial++);
      registerDormStackRoom(rooms, west);
      const east = createDormStackRoom(world, ring.right + 4, y - 8, 12, 16, 'east', ring.right, ringIndex, serial++);
      registerDormStackRoom(rooms, east);
    }
  }
}

export function createDormStackRoom(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  side: 'north' | 'south' | 'west' | 'east',
  ringCoord: number,
  ringIndex: number,
  serial: number,
): Room {
  const type = dormStackRoomType(serial, ringIndex);
  const tile = type === RoomType.KITCHEN || type === RoomType.BATHROOM;
  const wallTex = tile ? Tex.TILE_W : type === RoomType.STORAGE ? Tex.METAL : Tex.PANEL;
  const floorTex = tile ? (type === RoomType.BATHROOM ? Tex.F_WATER : Tex.F_TILE) : type === RoomType.STORAGE ? Tex.F_CONCRETE : Tex.F_CARPET;
  const room = createRoom(world, type, x, y, w, h, dormStackRoomName(type, ringIndex, serial), wallTex, floorTex);
  if (side === 'north') connectRoomToPoint(world, room, room.x + (room.w >> 1), room.y + room.h, room.x + (room.w >> 1), ringCoord, DoorState.CLOSED);
  else if (side === 'south') connectRoomToPoint(world, room, room.x + (room.w >> 1), room.y - 1, room.x + (room.w >> 1), ringCoord, DoorState.CLOSED);
  else if (side === 'west') connectRoomToPoint(world, room, room.x + room.w, room.y + (room.h >> 1), ringCoord, room.y + (room.h >> 1), DoorState.CLOSED);
  else connectRoomToPoint(world, room, room.x - 1, room.y + (room.h >> 1), ringCoord, room.y + (room.h >> 1), DoorState.CLOSED);
  return room;
}

export function dormStackRoomType(serial: number, ringIndex: number): RoomType {
  const roll = (serial * 7 + ringIndex * 11) % 17;
  if (roll === 0) return RoomType.KITCHEN;
  if (roll === 4) return RoomType.BATHROOM;
  if (roll === 8 || roll === 13) return RoomType.STORAGE;
  if (roll === 11) return RoomType.SMOKING;
  if (roll === 15) return RoomType.COMMON;
  return RoomType.LIVING;
}

export function dormStackRoomName(type: RoomType, ringIndex: number, serial: number): string {
  const ring = ringIndex + 1;
  switch (type) {
    case RoomType.KITCHEN: return `Кольцо ${ring}: сменная чайная ${serial + 1}`;
    case RoomType.BATHROOM: return `Кольцо ${ring}: умывальная очередь ${serial + 1}`;
    case RoomType.STORAGE: return `Кольцо ${ring}: шкафовой стек ${serial + 1}`;
    case RoomType.SMOKING: return `Кольцо ${ring}: тихая курилка ${serial + 1}`;
    case RoomType.COMMON: return `Кольцо ${ring}: комната свидетелей ${serial + 1}`;
    default: return `Кольцо ${ring}: койко-ячейка ${serial + 1}`;
  }
}

export function registerDormStackRoom(rooms: DormRooms, room: Room): void {
  if (room.type === RoomType.LIVING) rooms.bunks.push(room);
  else rooms.support.push(room);
}

export function buildDormHqComplexes(world: World, rooms: DormRooms): void {
  addDormHqComplex(world, rooms, {
    owner: ZoneFaction.CITIZEN,
    name: 'Гражданский штаб старшей смены',
    hq: [430, 646, 42, 18],
    door: 'north',
    target: { x: 451, y: 622 },
    support: [
      [RoomType.KITCHEN, 382, 646, 28, 15, 'Кухня штаба старшей смены'],
      [RoomType.MEDICAL, 490, 646, 26, 15, 'Медпункт недосыпа'],
      [RoomType.STORAGE, 430, 672, 38, 14, 'Склад ведомостей укрытых'],
    ],
  });
  addDormHqComplex(world, rooms, {
    owner: ZoneFaction.LIQUIDATOR,
    name: 'Герма ночного обхода',
    hq: [780, 386, 34, 18],
    door: 'west',
    target: { x: 724, y: 395 },
    support: [
      [RoomType.OFFICE, 820, 384, 26, 14, 'Стол протоколов обхода'],
      [RoomType.STORAGE, 780, 412, 34, 14, 'Шкаф дубинок и фонарей'],
      [RoomType.BATHROOM, 820, 410, 24, 14, 'Умывальная поста обхода'],
    ],
  });
  addDormHqComplex(world, rooms, {
    owner: ZoneFaction.SCIENTIST,
    name: 'Пункт сомнологов НИИ',
    hq: [204, 692, 36, 18],
    door: 'east',
    target: { x: 300, y: 701 },
    support: [
      [RoomType.MEDICAL, 164, 692, 28, 16, 'Кабинет измерения сна'],
      [RoomType.OFFICE, 204, 720, 32, 14, 'Стол протоколов храпа'],
      [RoomType.STORAGE, 164, 718, 28, 14, 'Кладовая датчиков койки'],
    ],
  });
  addDormHqComplex(world, rooms, {
    owner: ZoneFaction.WILD,
    name: 'Дикий шкафовой схрон',
    hq: [118, 536, 34, 18],
    door: 'east',
    target: { x: 224, y: 545 },
    support: [
      [RoomType.STORAGE, 76, 536, 30, 16, 'Разобранные тумбы диких'],
      [RoomType.SMOKING, 118, 562, 32, 14, 'Курилка без свидетелей'],
      [RoomType.KITCHEN, 76, 560, 28, 14, 'Чайник на украденной плитке'],
    ],
  });
  addDormHqComplex(world, rooms, {
    owner: ZoneFaction.CULTIST,
    name: 'Сонная келья свидетелей',
    hq: [842, 786, 34, 18],
    door: 'west',
    target: { x: 800, y: 795 },
    support: [
      [RoomType.COMMON, 882, 786, 34, 16, 'Комната тихой молитвы'],
      [RoomType.STORAGE, 842, 812, 32, 14, 'Полка чужих биркокроватей'],
      [RoomType.BATHROOM, 882, 810, 26, 14, 'Мокрая ниша омовения'],
    ],
  });
}

export function addDormHqComplex(world: World, rooms: DormRooms, spec: DormHqSpec): void {
  const [x, y, w, h] = spec.hq;
  const hq = createRoom(world, RoomType.HQ, x, y, w, h, spec.name, Tex.HERMO_WALL, Tex.F_CONCRETE);
  hq.sealed = true;
  connectRoomToNearestDormCorridor(world, hq, DoorState.HERMETIC_OPEN, spec.target, spec.door);
  const support: Room[] = [];
  for (const [type, sx, sy, sw, sh, name] of spec.support) {
    const tile = type === RoomType.KITCHEN || type === RoomType.BATHROOM || type === RoomType.MEDICAL;
    const room = createRoom(world, type, sx, sy, sw, sh, name, tile ? Tex.TILE_W : Tex.PANEL, tile ? Tex.F_TILE : Tex.F_LINO);
    connectRoomToNearestDormCorridor(world, room, DoorState.CLOSED, spec.target);
    support.push(room);
    rooms.support.push(room);
  }
  rooms.hqs.push({ owner: spec.owner, hq, support });
}

export function connectRoomToNearestDormCorridor(
  world: World,
  room: Room,
  state: DoorState,
  fallback: { x: number; y: number },
  preferredSide?: 'north' | 'south' | 'west' | 'east',
): void {
  const target = nearestDormCorridorCell(world, room, 96) ?? fallback;
  const rx = room.x + (room.w >> 1);
  const ry = room.y + (room.h >> 1);
  const side = preferredSide ?? dormDoorSideToward(world, rx, ry, target.x, target.y);
  if (side === 'north') connectRoomToPoint(world, room, rx, room.y - 1, target.x, target.y, state);
  else if (side === 'south') connectRoomToPoint(world, room, rx, room.y + room.h, target.x, target.y, state);
  else if (side === 'west') connectRoomToPoint(world, room, room.x - 1, ry, target.x, target.y, state);
  else connectRoomToPoint(world, room, room.x + room.w, ry, target.x, target.y, state);
}

export function dormDoorSideToward(world: World, x: number, y: number, targetX: number, targetY: number): 'north' | 'south' | 'west' | 'east' {
  const dx = world.delta(x, targetX);
  const dy = world.delta(y, targetY);
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'west' : 'east';
  return dy < 0 ? 'north' : 'south';
}

export function nearestDormCorridorCell(world: World, room: Room, radius: number): { x: number; y: number } | null {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  let bestX = -1;
  let bestY = -1;
  let bestD2 = Infinity;
  for (let r = 2; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = world.wrap(cx + dx);
        const y = world.wrap(cy + dy);
        const idx = world.idx(x, y);
        if (world.roomMap[idx] >= 0) continue;
        const cell = world.cells[idx];
        if (cell !== Cell.FLOOR && cell !== Cell.WATER && cell !== Cell.DOOR && cell !== Cell.LIFT) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestX = x;
          bestY = y;
          bestD2 = d2;
        }
      }
    }
    if (bestX >= 0) return { x: bestX, y: bestY };
  }
  return null;
}

export function createRoom(
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
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

export function carveFloorCell(world: World, x: number, y: number, floorTex: Tex): void {
  const i = world.idx(x, y);
  world.cells[i] = Cell.FLOOR;
  world.roomMap[i] = -1;
  world.floorTex[i] = floorTex;
  world.factionControl[i] = ZoneFaction.CITIZEN;
}

export function carveLineWidth(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  if (ax !== bx && ay !== by) {
    carveLineWidth(world, ax, ay, bx, ay, width, floorTex);
    carveLineWidth(world, bx, ay, bx, by, width, floorTex);
    return;
  }
  const half = Math.floor(width / 2);
  const from = ax === bx ? Math.min(ay, by) : Math.min(ax, bx);
  const to = ax === bx ? Math.max(ay, by) : Math.max(ax, bx);
  for (let p = from; p <= to; p++) {
    for (let n = 0; n < width; n++) {
      const o = n - half;
      carveFloorCell(world, ax === bx ? ax + o : p, ax === bx ? p : ay + o, floorTex);
    }
  }
}

export function placeCorridorNoiseBreak(world: World, x: number, y: number, gapOffset: number): void {
  for (let dy = 0; dy < 3; dy++) {
    if (dy === gapOffset) continue;
    const i = world.idx(x, y + dy);
    if (world.cells[i] !== Cell.FLOOR) continue;
    world.cells[i] = Cell.WALL;
    world.roomMap[i] = -1;
    world.wallTex[i] = Tex.PANEL;
    world.features[i] = Feature.NONE;
  }
}

export function connectRoomToCorridor(world: World, room: Room, x: number, y: number, state: DoorState, keyId = ''): void {
  const idx = world.idx(x, y);
  world.cells[idx] = Cell.DOOR;
  world.wallTex[idx] = state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED ? Tex.HERMO_WALL : Tex.DOOR_WOOD;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  room.doors.push(idx);
}

export function connectRoomToPoint(
  world: World,
  room: Room,
  doorX: number,
  doorY: number,
  targetX: number,
  targetY: number,
  state: DoorState,
  keyId = '',
): void {
  connectRoomToCorridor(world, room, doorX, doorY, state, keyId);
  const outX = doorX < room.x ? doorX - 1 : doorX >= room.x + room.w ? doorX + 1 : doorX;
  const outY = doorY < room.y ? doorY - 1 : doorY >= room.y + room.h ? doorY + 1 : doorY;
  carveLineWidth(world, outX, outY, targetX, targetY, 1, Tex.F_LINO);
}

export function applyDormZones(world: World): void {
  for (const zone of world.zones) {
    zone.level = zone.cx > 650 || zone.cy > 575 ? 3 : 2;
    zone.faction = ZoneFaction.CITIZEN;
    if (zone.cx > 650) zone.faction = ZoneFaction.LIQUIDATOR;
    if (zone.cx < 430 && zone.cy > 470 && zone.cy < 535) zone.faction = ZoneFaction.WILD;
    if (zone.cy > 590 && zone.cx > 450 && zone.cx < 575) zone.faction = ZoneFaction.SAMOSBOR;
    zone.fogged = false;
  }
  for (let i = 0; i < world.factionControl.length; i++) {
    world.factionControl[i] = world.zones[world.zoneMap[i]]?.faction ?? ZoneFaction.CITIZEN;
  }
}

export function reinforceDormAuthoredTerritory(world: World, rooms: DormRooms): void {
  for (const anchor of rooms.hqs) {
    paintDormRoomOwner(world, anchor.hq, anchor.owner);
    for (const room of anchor.support) paintDormRoomOwner(world, room, anchor.owner);
  }
}

export function paintDormRoomOwner(world: World, room: Room, owner: ZoneFaction): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
    }
  }
  for (const doorIdx of room.doors) world.factionControl[doorIdx] = owner;
}

export function placeDormLifts(world: World, layout: DormLayout): void {
  placeLift(world, layout.leftX + 3, layout.northY + 1, layout.leftX + 7, layout.northY + 1, LiftDirection.UP);
  placeLift(world, layout.rightX - 3, layout.southY + 1, layout.rightX - 7, layout.southY + 1, LiftDirection.DOWN);
}

export function placeLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const li = world.idx(x, y);
  world.cells[li] = Cell.LIFT;
  world.wallTex[li] = Tex.LIFT_DOOR;
  world.liftDir[li] = direction;
  const bi = world.idx(buttonX, buttonY);
  if (world.cells[bi] === Cell.FLOOR) world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = direction;
}

export function decorateDorm(world: World, layout: DormLayout, rooms: DormRooms): void {
  for (const room of rooms.bunks) decorateBunkRoom(world, room);
  for (const room of rooms.support) decorateDormSupportRoom(world, room);
  for (const anchor of rooms.hqs) decorateDormHq(world, anchor.hq, anchor.owner);
  for (let x = layout.leftX + 16; x <= layout.rightX - 16; x += 42) {
    placeFeature(world, x, layout.northY + 1, Feature.LAMP);
    placeFeature(world, x + 10, layout.southY + 1, Feature.TABLE);
  }

  placeFeature(world, rooms.watch.x + 5, rooms.watch.y + 4, Feature.DESK);
  placeFeature(world, rooms.watch.x + 14, rooms.watch.y + 4, Feature.SCREEN);
  placeFeature(world, rooms.watch.x + 28, rooms.watch.y + 11, Feature.SHELF);
  placeFeature(world, rooms.watch.x + 20, rooms.watch.y + 12, Feature.CHAIR);

  for (let x = rooms.kitchen.x + 4; x < rooms.kitchen.x + rooms.kitchen.w - 3; x += 6) placeFeature(world, x, rooms.kitchen.y + 4, Feature.STOVE);
  placeFeature(world, rooms.kitchen.x + 5, rooms.kitchen.y + 16, Feature.SINK);
  placeFeature(world, rooms.kitchen.x + 17, rooms.kitchen.y + 14, Feature.TABLE);

  for (let y = rooms.lockers.y + 4; y < rooms.lockers.y + rooms.lockers.h - 3; y += 5) {
    placeFeature(world, rooms.lockers.x + 5, y, Feature.SHELF);
    placeFeature(world, rooms.lockers.x + 21, y, Feature.SHELF);
  }

  for (let x = rooms.wash.x + 4; x < rooms.wash.x + rooms.wash.w - 3; x += 6) placeFeature(world, x, rooms.wash.y + 4, Feature.SINK);
  for (let x = rooms.wash.x + 5; x < rooms.wash.x + rooms.wash.w - 3; x += 7) placeFeature(world, x, rooms.wash.y + 17, Feature.TOILET);

  for (let x = rooms.shelter.x + 8; x < rooms.shelter.x + rooms.shelter.w - 8; x += 16) {
    placeFeature(world, x, rooms.shelter.y + 7, Feature.CANDLE);
    placeFeature(world, x + 5, rooms.shelter.y + 14, Feature.BED);
  }

  placeFeature(world, rooms.smoking.x + 5, rooms.smoking.y + 5, Feature.TABLE);
  placeFeature(world, rooms.smoking.x + 13, rooms.smoking.y + 8, Feature.CHAIR);
  placeFeature(world, rooms.smoking.x + 24, rooms.smoking.y + 11, Feature.SHELF);
}

export function decorateDormSupportRoom(world: World, room: Room): void {
  switch (room.type) {
    case RoomType.KITCHEN:
      for (let x = room.x + 3; x < room.x + room.w - 3; x += 6) placeFeature(world, x, room.y + 3, Feature.STOVE);
      placeFeature(world, room.x + 3, room.y + room.h - 4, Feature.SINK);
      placeFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.TABLE);
      return;
    case RoomType.BATHROOM:
      for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) {
        placeFeature(world, x, room.y + 3, Feature.SINK);
        placeFeature(world, x + 1, room.y + room.h - 4, Feature.TOILET);
      }
      return;
    case RoomType.MEDICAL:
      placeFeature(world, room.x + 4, room.y + 3, Feature.APPARATUS);
      placeFeature(world, room.x + 10, room.y + 3, Feature.DESK);
      placeFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.SHELF);
      return;
    case RoomType.STORAGE:
      for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) {
        placeFeature(world, x, room.y + 3, Feature.SHELF);
        placeFeature(world, x, room.y + room.h - 4, Feature.SHELF);
      }
      return;
    case RoomType.SMOKING:
      placeFeature(world, room.x + 4, room.y + 4, Feature.TABLE);
      placeFeature(world, room.x + 8, room.y + 4, Feature.CHAIR);
      placeFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.CANDLE);
      return;
    case RoomType.OFFICE:
      placeFeature(world, room.x + 4, room.y + 3, Feature.DESK);
      placeFeature(world, room.x + 10, room.y + 3, Feature.SCREEN);
      placeFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.SHELF);
      return;
    case RoomType.COMMON:
      placeFeature(world, room.x + 4, room.y + 4, Feature.TABLE);
      placeFeature(world, room.x + 9, room.y + 4, Feature.CHAIR);
      placeFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.LAMP);
      return;
    default:
      return;
  }
}

export function decorateDormHq(world: World, room: Room, owner: ZoneFaction): void {
  placeFeature(world, room.x + 4, room.y + 4, owner === ZoneFaction.SCIENTIST ? Feature.APPARATUS : Feature.DESK);
  placeFeature(world, room.x + 11, room.y + 4, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.SCREEN);
  placeFeature(world, room.x + room.w - 6, room.y + 5, Feature.SHELF);
  placeFeature(world, room.x + 5, room.y + room.h - 5, Feature.TABLE);
  placeFeature(world, room.x + 11, room.y + room.h - 5, Feature.CHAIR);
  if (owner === ZoneFaction.CITIZEN || owner === ZoneFaction.WILD) placeFeature(world, room.x + room.w - 12, room.y + room.h - 5, Feature.BED);
}

export function decorateBunkRoom(world: World, room: Room): void {
  for (let x = room.x + 3; x < room.x + room.w - 3; x += 8) {
    placeFeature(world, x, room.y + 3, Feature.BED);
    placeFeature(world, x, room.y + 8, Feature.BED);
  }
  placeFeature(world, room.x + room.w - 4, room.y + 5, Feature.SHELF);
  placeFeature(world, room.x + 4, room.y + 5, Feature.TABLE);
}

export function placeFeature(world: World, x: number, y: number, feature: Feature): void {
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.WATER) world.features[i] = feature;
}

