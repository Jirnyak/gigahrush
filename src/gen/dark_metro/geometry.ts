/* ── Design z: dark_metro / Темная пересадка ─────────────── */

import { stampSurfaceSplat } from '../../systems/surface_marks';
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
import { stampRoom } from '../shared';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';

import {
  DESIGN_FLOOR_ID,
  DARK_METRO_ROUTES,
  unpackDarkMetroState,
  BuildCtx,
  DarkMetroRoomSide,
  DarkMetroOwnedRoomSpec,
  DARK_METRO_FULL_LINE_YS,
  DARK_METRO_SAFETY_SHELL_RADIUS,
  DARK_METRO_HQ_COMPOUNDS,
  DARK_METRO_TRANSFER_NODES} from './index';
import {
  addDarkMetroTransitCache} from './npcs';

export interface DarkMetroLayout {
  hall: Room;
  platform: Room;
  underpass: Room;
  kiosk: Room;
  signal: Room;
  blindTunnel: Room;
  exit: Room;
}

export interface DarkMetroFullFloorStyle {
  wallTex: Tex;
  floorTex: Tex;
}

export function axisDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, W - d);
}

export function nearestDarkMetroLineDistance(y: number): number {
  let best = W;
  for (const lineY of DARK_METRO_FULL_LINE_YS) best = Math.min(best, axisDistance(y, lineY));
  return best;
}

export function nearestDarkMetroDefendedPostDistance2(x: number, y: number): number {
  let best = Infinity;
  for (let line = 0; line < DARK_METRO_FULL_LINE_YS.length; line++) {
    const lineY = DARK_METRO_FULL_LINE_YS[line];
    const platformY = darkMetroPlatformY(lineY, line);
    const side = line % 2 === 0 ? 1 : -1;
    const roomY = side > 0 ? platformY + 11 : platformY - 11;
    const slots = line % 2 === 0 ? [1, 3] : [0, 2];
    const stations = darkMetroStationXs(line);
    for (const slot of slots) {
      const dx = axisDistance(x, stations[slot]);
      const dy = axisDistance(y, roomY);
      best = Math.min(best, dx * dx + dy * dy);
    }
  }
  return best;
}

export function darkMetroProtectedMask(world: World): Uint8Array {
  const mask = new Uint8Array(W * W);
  for (const room of world.rooms) {
    if (!room) continue;
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        mask[world.idx(x, y)] = 1;
      }
    }
  }
  for (const idx of world.doors.keys()) mask[idx] = 1;
  for (const container of world.containers) mask[world.idx(container.x, container.y)] = 1;
  return mask;
}

export function clampDarkMetroRoomCoord(v: number, size: number): number {
  return Math.max(8, Math.min(W - size - 8, v));
}

export function canStampDarkMetroRoom(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (mask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.WATER) return false;
      if (world.doors.has(ci) || world.roomMap[ci] >= 0) return false;
    }
  }
  return true;
}

export function findDarkMetroRoomSpot(
  world: World,
  mask: Uint8Array,
  desiredX: number,
  desiredY: number,
  w: number,
  h: number,
  radius: number,
): { x: number; y: number } | null {
  const baseX = clampDarkMetroRoomCoord(desiredX, w);
  const baseY = clampDarkMetroRoomCoord(desiredY, h);
  if (canStampDarkMetroRoom(world, mask, baseX, baseY, w, h)) return { x: baseX, y: baseY };
  for (let r = 4; r <= radius; r += 4) {
    for (let dy = -r; dy <= r; dy += 4) {
      for (let dx = -r; dx <= r; dx += 4) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = clampDarkMetroRoomCoord(baseX + dx, w);
        const y = clampDarkMetroRoomCoord(baseY + dy, h);
        if (canStampDarkMetroRoom(world, mask, x, y, w, h)) return { x, y };
      }
    }
  }
  return null;
}

export function rememberDarkMetroRoomMask(world: World, mask: Uint8Array, room: Room): void {
  markMetroMask(mask, world, room.x - 2, room.y - 2, room.w + 4, room.h + 4);
}

export function paintDarkMetroRoomOwner(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] !== Cell.LIFT && !world.aptMask[ci]) setTerritoryOwnerAtIndex(world, ci, owner);
    }
  }
  for (const doorIdx of room.doors) setTerritoryOwnerAtIndex(world, doorIdx, owner);
}

export function decorateDarkMetroOwnedRoom(world: World, room: Room, owner: TerritoryOwner, seed: number): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const put = (x: number, y: number, feature: Feature): void => {
    const ci = world.idx(x, y);
    if (world.roomMap[ci] === room.id && world.features[ci] === Feature.NONE) world.features[ci] = feature;
  };
  if (room.type === RoomType.KITCHEN) {
    put(room.x + 2, room.y + 2, Feature.STOVE);
    put(room.x + room.w - 3, room.y + 2, Feature.SINK);
    put(cx, cy, Feature.TABLE);
    return;
  }
  if (room.type === RoomType.BATHROOM) {
    put(room.x + 2, room.y + 2, Feature.TOILET);
    put(room.x + room.w - 3, room.y + 2, Feature.SINK);
    return;
  }
  if (room.type === RoomType.STORAGE) {
    put(room.x + 2, room.y + 2, Feature.SHELF);
    put(room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
    return;
  }
  if (room.type === RoomType.PRODUCTION) {
    put(room.x + 3, room.y + 2, Feature.MACHINE);
    put(room.x + room.w - 4, room.y + room.h - 3, Feature.APPARATUS);
    return;
  }
  if (room.type === RoomType.MEDICAL) {
    put(room.x + 2, room.y + 2, Feature.BED);
    put(room.x + room.w - 3, room.y + 2, Feature.SHELF);
    return;
  }
  if (room.type === RoomType.OFFICE) {
    put(cx, cy, Feature.TABLE);
    put(room.x + room.w - 3, room.y + 2, Feature.SCREEN);
    return;
  }
  if (room.type === RoomType.HQ) {
    put(room.x + 3, room.y + 2, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
    put(cx, cy, Feature.TABLE);
    put(room.x + room.w - 4, room.y + room.h - 3, owner === ZoneFaction.SCIENTIST ? Feature.APPARATUS : Feature.SHELF);
    return;
  }
  put(cx, cy, Feature.TABLE);
  put(room.x + 3 + (seed % Math.max(1, room.w - 6)), room.y + Math.max(2, room.h - 3), Feature.CHAIR);
}

export function addDarkMetroDoor(
  world: World,
  x: number,
  y: number,
  room: Room,
  state: DoorState,
  keyId = '',
): number {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT) return ci;
  world.cells[ci] = Cell.DOOR;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = Tex.DOOR_METAL;
  world.floorTex[ci] = room.floorTex;
  world.doors.set(ci, { idx: ci, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  if (!room.doors.includes(ci)) room.doors.push(ci);
  return ci;
}

export function connectDarkMetroRoomToPoint(
  world: World,
  room: Room,
  side: DarkMetroRoomSide,
  targetX: number,
  targetY: number,
  state: DoorState,
): void {
  const midX = room.x + (room.w >> 1);
  const midY = room.y + (room.h >> 1);
  const doorX = side === 'west' ? room.x - 1 : side === 'east' ? room.x + room.w : midX;
  const doorY = side === 'north' ? room.y - 1 : side === 'south' ? room.y + room.h : midY;
  addDarkMetroDoor(world, doorX, doorY, room, state);
  const startX = side === 'west' ? doorX - 1 : side === 'east' ? doorX + 1 : doorX;
  const startY = side === 'north' ? doorY - 1 : side === 'south' ? doorY + 1 : doorY;
  carveMetroLine(world, null, startX, startY, targetX, targetY, 0, room.floorTex);
}

export function hardenDarkMetroHqRoom(world: World, room: Room, owner: TerritoryOwner): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  paintDarkMetroRoomOwner(world, room, owner);
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      const inside = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (inside) continue;
      if (world.cells[ci] !== Cell.WALL || world.aptMask[ci]) continue;
      world.hermoWall[ci] = 1;
      world.wallTex[ci] = Tex.HERMO_WALL;
    }
  }
  for (const doorIdx of room.doors) {
    const door = world.doors.get(doorIdx);
    if (!door) continue;
    door.state = DoorState.HERMETIC_OPEN;
    door.keyId = '';
    world.hermoWall[doorIdx] = 1;
    world.wallTex[doorIdx] = Tex.HERMO_WALL;
    setTerritoryOwnerAtIndex(world, doorIdx, owner);
  }
}

export function addDarkMetroOwnedRoom(
  world: World,
  mask: Uint8Array,
  spec: DarkMetroOwnedRoomSpec,
  owner: TerritoryOwner,
  seed: number,
): Room | null {
  const spot = findDarkMetroRoomSpot(world, mask, spec.x, spec.y, spec.w, spec.h, spec.type === RoomType.HQ ? 18 : 36);
  if (!spot) return null;
  const room = styledRoom(world, spec.type, spot.x, spot.y, spec.w, spec.h, spec.name, spec.wallTex, spec.floorTex);
  paintDarkMetroRoomOwner(world, room, owner);
  decorateDarkMetroOwnedRoom(world, room, owner, seed);
  connectDarkMetroRoomToPoint(world, room, spec.side, spec.targetX, spec.targetY, spec.doorState ?? DoorState.CLOSED);
  if (spec.type === RoomType.HQ || spec.doorState === DoorState.HERMETIC_OPEN) hardenDarkMetroHqRoom(world, room, owner);
  rememberDarkMetroRoomMask(world, mask, room);
  return room;
}

export function addDarkMetroHqCompounds(world: World, mask: Uint8Array): void {
  for (const compound of DARK_METRO_HQ_COMPOUNDS) {
    addDarkMetroOwnedRoom(world, mask, compound.core, compound.owner, compound.owner * 101);
    for (let i = 0; i < compound.support.length; i++) {
      addDarkMetroOwnedRoom(world, mask, compound.support[i], compound.owner, compound.owner * 101 + i + 1);
    }
  }
}

export function darkMetroStationOwner(line: number, slot: number): TerritoryOwner {
  const owners = [
    ZoneFaction.LIQUIDATOR,
    ZoneFaction.WILD,
    ZoneFaction.CULTIST,
    ZoneFaction.SCIENTIST,
    ZoneFaction.WILD,
    ZoneFaction.CITIZEN,
  ] as const;
  return owners[(line * 2 + slot) % owners.length];
}

export function darkMetroMicroSpec(
  prefix: string,
  serial: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  side: DarkMetroRoomSide,
  targetX: number,
  targetY: number,
  wallTex: Tex,
  floorTex: Tex,
): DarkMetroOwnedRoomSpec {
  return { name: `${prefix} ${serial}`, type, x, y, w, h, side, targetX, targetY, wallTex, floorTex, doorState: type === RoomType.STORAGE || type === RoomType.OFFICE ? DoorState.CLOSED : DoorState.OPEN };
}

export function addDarkMetroStationBlocks(
  world: World,
  mask: Uint8Array,
  style: DarkMetroFullFloorStyle,
  rng: () => number,
): void {
  let serial = 1;
  const microTypes = [
    RoomType.STORAGE,
    RoomType.BATHROOM,
    RoomType.OFFICE,
    RoomType.PRODUCTION,
    RoomType.KITCHEN,
    RoomType.SMOKING,
  ] as const;
  for (let line = 0; line < DARK_METRO_FULL_LINE_YS.length; line++) {
    const lineY = DARK_METRO_FULL_LINE_YS[line];
    const platformY = darkMetroPlatformY(lineY, line);
    const blockSide = line % 2 === 0 ? -1 : 1;
    const stations = darkMetroStationXs(line);
    for (let slot = 0; slot < stations.length; slot++) {
      const owner = darkMetroStationOwner(line, slot);
      const hallW = 38;
      const hallH = 12;
      const hallX = stations[slot] - (hallW >> 1);
      const hallY = blockSide < 0 ? platformY - hallH - 20 : platformY + 20;
      const hall = addDarkMetroOwnedRoom(world, mask, {
        name: `Станционный блок темной пересадки ${line + 1}-${slot + 1}`,
        type: RoomType.COMMON,
        x: hallX,
        y: hallY,
        w: hallW,
        h: hallH,
        side: blockSide < 0 ? 'south' : 'north',
        targetX: stations[slot],
        targetY: platformY,
        wallTex: style.wallTex,
        floorTex: Tex.F_TILE,
        doorState: DoorState.OPEN,
      }, owner, line * 97 + slot);
      if (!hall) continue;

      const backY = blockSide < 0 ? hall.y - 17 : hall.y + hall.h + 8;
      const backSide: DarkMetroRoomSide = blockSide < 0 ? 'south' : 'north';
      const sideY = hall.y + 2;
      const specs = [
        darkMetroMicroSpec('Кладовая станции темной пересадки', serial++, microTypes[(line + slot) % microTypes.length], hall.x - 20, sideY, 12, 8, 'east', hall.x, hall.y + 5, Tex.METAL, Tex.F_CONCRETE),
        darkMetroMicroSpec('Будка станции темной пересадки', serial++, microTypes[(line + slot + 1) % microTypes.length], hall.x + hall.w + 8, sideY, 12, 8, 'west', hall.x + hall.w - 1, hall.y + 5, Tex.PIPE, style.floorTex),
        darkMetroMicroSpec('Задняя ячейка темной пересадки', serial++, microTypes[(line + slot + 2) % microTypes.length], hall.x, backY, 12, 8, backSide, hall.x + 6, hall.y + (blockSide < 0 ? 0 : hall.h - 1), Tex.PANEL, Tex.F_LINO),
        darkMetroMicroSpec('Ламповая ячейка темной пересадки', serial++, microTypes[(line + slot + 3) % microTypes.length], hall.x + 13, backY + Math.floor(rng() * 3) - 1, 12, 8, backSide, hall.x + 19, hall.y + (blockSide < 0 ? 0 : hall.h - 1), Tex.DARK, Tex.F_CONCRETE),
        darkMetroMicroSpec('Архивная ячейка темной пересадки', serial++, microTypes[(line + slot + 4) % microTypes.length], hall.x + 26, backY, 12, 8, backSide, hall.x + 31, hall.y + (blockSide < 0 ? 0 : hall.h - 1), Tex.METAL, Tex.F_CONCRETE),
        darkMetroMicroSpec('Боковой карман темной пересадки', serial++, microTypes[(line + slot + 5) % microTypes.length], hall.x + 8, blockSide < 0 ? hall.y + hall.h + 7 : hall.y - 15, 18, 7, blockSide < 0 ? 'north' : 'south', hall.x + 19, hall.y + (blockSide < 0 ? hall.h - 1 : 0), Tex.CONCRETE, style.floorTex),
      ];
      for (let i = 0; i < specs.length; i++) {
        addDarkMetroOwnedRoom(world, mask, specs[i], owner, line * 409 + slot * 31 + i);
      }
    }
  }
}

export function addDarkMetroServiceIslands(
  world: World,
  mask: Uint8Array,
  style: DarkMetroFullFloorStyle,
  rng: () => number,
): void {
  let serial = 1;
  const ys = [158, 214, 324, 468, 560, 706, 852, 902] as const;
  for (const tunnel of [{ x: 176, side: 1 }, { x: 842, side: -1 }] as const) {
    for (let i = 0; i < ys.length; i++) {
      const y = ys[i] + Math.floor(rng() * 5) - 2;
      const owner = i % 3 === 0 ? ZoneFaction.LIQUIDATOR : i % 3 === 1 ? ZoneFaction.WILD : ZoneFaction.SCIENTIST;
      const x = tunnel.x + tunnel.side * (tunnel.side > 0 ? 18 : 42);
      const side: DarkMetroRoomSide = tunnel.side > 0 ? 'west' : 'east';
      addDarkMetroOwnedRoom(world, mask, {
        name: `Сервисный остров темной пересадки ${serial++}`,
        type: i % 4 === 0 ? RoomType.PRODUCTION : i % 4 === 1 ? RoomType.STORAGE : i % 4 === 2 ? RoomType.OFFICE : RoomType.BATHROOM,
        x,
        y,
        w: i % 2 === 0 ? 24 : 18,
        h: i % 2 === 0 ? 10 : 9,
        side,
        targetX: tunnel.x,
        targetY: y + 4,
        wallTex: i % 2 === 0 ? Tex.PIPE : Tex.METAL,
        floorTex: style.floorTex,
        doorState: DoorState.CLOSED,
      }, owner, serial * 13);
    }
  }
}

export function addDarkMetroBlindCells(
  world: World,
  mask: Uint8Array,
  style: DarkMetroFullFloorStyle,
  rng: () => number,
): void {
  let serial = 1;
  const bands = [
    { y: 178, targetY: 130 },
    { y: 326, targetY: 249 },
    { y: 520, targetY: 414 },
    { y: 708, targetY: 654 },
    { y: 850, targetY: 797 },
  ] as const;
  for (const band of bands) {
    for (let x = 250; x <= 754; x += 84) {
      const owner = x % 4 === 0 ? ZoneFaction.CULTIST : x % 3 === 0 ? ZoneFaction.SCIENTIST : ZoneFaction.WILD;
      const side: DarkMetroRoomSide = band.y < band.targetY ? 'south' : 'north';
      const room = addDarkMetroOwnedRoom(world, mask, {
        name: `Слепая подсобка темной пересадки ${serial++}`,
        type: serial % 5 === 0 ? RoomType.KITCHEN : serial % 5 === 1 ? RoomType.STORAGE : serial % 5 === 2 ? RoomType.OFFICE : serial % 5 === 3 ? RoomType.BATHROOM : RoomType.COMMON,
        x: x + Math.floor(rng() * 7) - 3,
        y: band.y + Math.floor(rng() * 7) - 3,
        w: 18 + (serial % 3) * 4,
        h: 8 + (serial % 2) * 3,
        side,
        targetX: x,
        targetY: band.targetY,
        wallTex: serial % 2 === 0 ? Tex.DARK : style.wallTex,
        floorTex: serial % 2 === 0 ? Tex.F_CONCRETE : Tex.F_LINO,
        doorState: serial % 4 === 0 ? DoorState.LOCKED : DoorState.CLOSED,
      }, owner, serial * 29);
      if (room && serial % 6 === 0) setDarkMetroFog(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 28);
    }
  }
}

export function carveDarkMetroStationLine(
  world: World,
  mask: Uint8Array,
  y: number,
  line: number,
  style: DarkMetroFullFloorStyle,
  rng: () => number,
): void {
  const x0 = 44;
  const w = W - 88;
  const lampOffset = Math.floor(rng() * 18);

  carveMetroRect(world, mask, x0, y - 13, w, 5, style.floorTex);
  carveMetroTrack(world, mask, x0, y - 7, w, 5);
  carveMetroRect(world, mask, x0, y - 1, w, 4, style.floorTex);
  carveMetroTrack(world, mask, x0, y + 4, w, 5);
  carveMetroRect(world, mask, x0, y + 10, w, 5, style.floorTex);

  for (let x = 90 + (line % 2) * 46; x < W - 90; x += 174) {
    carveMetroRect(world, mask, x, y - 13, 5, 28, style.floorTex);
    setFeature(world, x + 2, y - 10, line % 3 === 0 ? Feature.SCREEN : Feature.LAMP);
    setFeature(world, x + 2, y + 12, line % 2 === 0 ? Feature.LAMP : Feature.CANDLE);
  }

  for (let x = 72 + lampOffset; x < W - 72; x += 64) {
    setFeature(world, x, y - 11, Feature.LAMP);
    if ((x + line) % 3 === 0) setFeature(world, x + 8, y + 12, Feature.CANDLE);
    if ((x + line) % 5 === 0) setFeature(world, x + 17, y + 1, Feature.SCREEN);
  }

  const trainX = 158 + ((line * 149) % 640);
  const trainY = y + (line % 2 === 0 ? -7 : 4);
  addDeadTrainShell(world, mask, trainX, trainY, line, style);
}

export function addDeadTrainShell(
  world: World,
  mask: Uint8Array,
  x: number,
  y: number,
  line: number,
  style: DarkMetroFullFloorStyle,
): void {
  if (!canPlaceMetroRoom(world, mask, x, y, 92, 5)) return;
  const train = styledRoom(world, RoomType.CORRIDOR, x, y, 92, 5, `Мертвый вагон линии ${line + 1}`, Tex.METAL, Tex.F_CONCRETE);
  carveMetroRect(world, null, train.x - 2, train.y + 2, 4, 1, style.floorTex);
  carveMetroRect(world, null, train.x + train.w - 2, train.y + 2, 4, 1, style.floorTex);
  for (let i = 8; i < train.w - 8; i += 14) {
    setFeature(world, train.x + i, train.y + 1, Feature.CHAIR);
    if (i % 28 === 0) setFeature(world, train.x + i + 5, train.y + 3, Feature.CANDLE);
    stampSurfaceSplat(world, train.x + i, train.y + 2, 0.5, 0.5, 1.7, 0.18, hashSeed(`dark_metro_train.${line}.${i}`), 42, 38, 44, false);
  }
}

export function addDarkMetroTicketHalls(world: World, mask: Uint8Array, style: DarkMetroFullFloorStyle): void {
  const halls = [
    { x: 74, y: 66, w: 86, h: 30, name: 'Северный билетный зал', tx: 118, ty: DARK_METRO_FULL_LINE_YS[0] - 13 },
    { x: 770, y: 210, w: 102, h: 32, name: 'Зал погашенных жетонов', tx: 820, ty: DARK_METRO_FULL_LINE_YS[1] - 13 },
    { x: 116, y: 734, w: 92, h: 34, name: 'Кассовая развязка без касс', tx: 160, ty: DARK_METRO_FULL_LINE_YS[4] - 13 },
    { x: 702, y: 872, w: 112, h: 34, name: 'Южный зал неверных объявлений', tx: 760, ty: DARK_METRO_FULL_LINE_YS[5] - 13 },
  ];

  for (const h of halls) {
    const room = addDarkMetroLandmarkRoom(world, mask, RoomType.COMMON, h.x, h.y, h.w, h.h, h.name, style.wallTex, Tex.F_TILE);
    if (!room) continue;
    carveMetroLine(world, null, room.x + (room.w >> 1), room.y + room.h - 1, h.tx, h.ty, 2, Tex.F_TILE);
    setFeature(world, room.x + 5, room.y + 5, Feature.SCREEN);
    setFeature(world, room.x + room.w - 6, room.y + 5, Feature.LAMP);
    setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.TABLE);
    setFeature(world, room.x + (room.w >> 1) + 4, room.y + (room.h >> 1), Feature.SHELF);
  }
}

export function addDarkMetroServiceRoutes(
  world: World,
  mask: Uint8Array,
  style: DarkMetroFullFloorStyle,
  rng: () => number,
): void {
  const tunnels = [
    { x: 176, side: 1 },
    { x: 842, side: -1 },
  ];

  for (const tunnel of tunnels) {
    carveMetroLine(world, mask, tunnel.x, 82, tunnel.x, 950, 2, Tex.F_CONCRETE);
    for (let y = 98; y < 950; y += 34) {
      setDarkMetroFog(world, tunnel.x, y, 34);
      if (y % 102 === 0) setFeature(world, tunnel.x + tunnel.side, y, Feature.CANDLE);
    }
    for (let i = 0; i < DARK_METRO_FULL_LINE_YS.length; i++) {
      const y = DARK_METRO_FULL_LINE_YS[i];
      setFeature(world, tunnel.x + tunnel.side * 2, y, Feature.APPARATUS);
      if (i % 2 === 0) {
        const rx = tunnel.x + tunnel.side * (10 + Math.floor(rng() * 8));
        const room = addDarkMetroLandmarkRoom(world, mask, RoomType.PRODUCTION, rx, y - 14, 20, 12, `Стрелочная будка ${i + 1}`, Tex.PIPE, style.floorTex);
        if (room) {
          carveMetroLine(world, null, room.x + (tunnel.side > 0 ? 0 : room.w - 1), room.y + (room.h >> 1), tunnel.x, y, 1, style.floorTex);
          setFeature(world, room.x + 4, room.y + 3, Feature.MACHINE);
          setFeature(world, room.x + room.w - 5, room.y + 4, Feature.SCREEN);
        }
      }
    }
  }

  const stair = addDarkMetroLandmarkRoom(world, mask, RoomType.CORRIDOR, 700, 504, 18, 70, 'Служебная лестница между линиями', Tex.DARK, style.floorTex);
  if (stair) {
    carveMetroLine(world, null, stair.x + 9, DARK_METRO_FULL_LINE_YS[2] + 14, stair.x + 9, DARK_METRO_FULL_LINE_YS[3] - 13, 2, style.floorTex);
    for (let y = stair.y + 5; y < stair.y + stair.h - 4; y += 10) {
      setFeature(world, stair.x + 4, y, Feature.CANDLE);
      setDarkMetroFog(world, stair.x + 9, y, 26);
    }
  }
}

export function addDarkMetroTransferWeb(world: World, mask: Uint8Array, style: DarkMetroFullFloorStyle): void {
  for (let i = 1; i < DARK_METRO_FULL_LINE_YS.length; i++) {
    const prevY = DARK_METRO_FULL_LINE_YS[i - 1];
    const y = DARK_METRO_FULL_LINE_YS[i];
    const x0 = i % 2 === 0 ? 304 : 580;
    const x1 = x0 + (i % 2 === 0 ? 86 : -96);
    carveMetroLine(world, mask, x0, prevY + 15, x1, y - 14, 2, style.floorTex);
    setFeature(world, x0, prevY + 18, Feature.LAMP);
    setFeature(world, x1, y - 17, i % 2 === 0 ? Feature.SCREEN : Feature.CANDLE);
  }

  for (const x of [340, 512, 684]) {
    carveMetroLine(world, mask, x, DARK_METRO_FULL_LINE_YS[1] + 14, x, DARK_METRO_FULL_LINE_YS[4] - 13, 1, Tex.F_CONCRETE);
    for (let y = DARK_METRO_FULL_LINE_YS[1] + 34; y < DARK_METRO_FULL_LINE_YS[4] - 20; y += 78) {
      setFeature(world, x, y, x === 512 ? Feature.CANDLE : Feature.LAMP);
      setDarkMetroFog(world, x, y, x === 512 ? 42 : 22);
    }
  }
}

export function addDarkMetroTransferNodes(world: World, mask: Uint8Array, style: DarkMetroFullFloorStyle): void {
  for (const node of DARK_METRO_TRANSFER_NODES) {
    const room = addDarkMetroOpenNodeRoom(world, node.x, node.y, node.w, node.h, node.name, Tex.F_TILE, RoomType.CORRIDOR);
    markMetroMask(mask, world, node.x - 1, node.y - 1, node.w + 2, node.h + 2);
    const cx = room.x + (room.w >> 1);
    const cy = room.y + (room.h >> 1);
    carveMetroLine(world, null, cx, cy, node.a[0], node.a[1], 2, style.floorTex);
    carveMetroLine(world, null, cx, cy, node.b[0], node.b[1], 2, style.floorTex);
    setFeature(world, cx - 5, cy, Feature.LAMP);
    setFeature(world, cx, cy, Feature.SCREEN);
    setFeature(world, cx + 5, cy, Feature.LAMP);
    setFeature(world, cx, cy + 3, Feature.CHAIR);
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const ci = world.idx(x, y);
        if (world.cells[ci] !== Cell.WALL && world.cells[ci] !== Cell.LIFT) world.fog[ci] = Math.min(world.fog[ci], 6);
      }
    }
  }
}

export function addDarkMetroRailBaitEdges(world: World, style: DarkMetroFullFloorStyle): void {
  for (let line = 0; line < DARK_METRO_FULL_LINE_YS.length; line++) {
    const lineY = DARK_METRO_FULL_LINE_YS[line];
    const platformY = darkMetroPlatformY(lineY, line);
    const stations = darkMetroStationXs(line);
    const x = stations[line % 2 === 0 ? 2 : 1];
    const room = addDarkMetroOpenNodeRoom(
      world,
      x - 14,
      platformY - 1,
      28,
      3,
      `Приманочная кромка линии ${line + 1}`,
      style.floorTex,
      RoomType.CORRIDOR,
    );
    setFeature(world, room.x + 6, room.y + 1, Feature.CANDLE);
    setFeature(world, room.x + 14, room.y + 1, Feature.SCREEN);
    setFeature(world, room.x + 22, room.y + 1, Feature.CANDLE);
    stampSurfaceSplat(world, room.x + 14, room.y + 1, 0.5, 0.5, 2.1, 0.2, hashSeed(`dark_metro_bait.${line}`), 72, 54, 38, false);
  }
}

export function addDarkMetroOpenNodeRoom(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  floorTex: Tex,
  type: RoomType,
): Room {
  const room: Room = {
    id: world.rooms.length,
    type,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex: Tex.METAL,
    floorTex,
  };
  world.rooms.push(room);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      openMetroTile(world, null, x + dx, y + dy, floorTex);
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] !== Cell.LIFT) world.roomMap[ci] = room.id;
    }
  }
  return room;
}

export function addDarkMetroDefendedPlatforms(world: World, mask: Uint8Array, style: DarkMetroFullFloorStyle): void {
  for (let line = 0; line < DARK_METRO_FULL_LINE_YS.length; line++) {
    const lineY = DARK_METRO_FULL_LINE_YS[line];
    const platformY = darkMetroPlatformY(lineY, line);
    const side = line % 2 === 0 ? 1 : -1;
    const stations = darkMetroStationXs(line);
    const slots = line % 2 === 0 ? [1, 3] : [0, 2];
    for (let i = 0; i < slots.length; i++) {
      const platformX = stations[slots[i]];
      addDarkMetroOpenPlatformRoom(
        world,
        platformX - 16,
        platformY - 1,
        32,
        3,
        `Обороняемая кромка линии ${line + 1}-${i + 1}`,
        style.floorTex,
      );
      setFeature(world, platformX - 8, platformY, Feature.LAMP);
      setFeature(world, platformX + 8, platformY, Feature.SCREEN);

      const roomW = i === 0 ? 26 : 24;
      const roomH = 8;
      const roomX = Math.max(38, Math.min(W - 38 - roomW, platformX - (roomW >> 1)));
      const roomY = side > 0 ? platformY + 7 : platformY - roomH - 7;
      const room = addDarkMetroLandmarkRoom(
        world,
        mask,
        RoomType.HQ,
        roomX,
        roomY,
        roomW,
        roomH,
        `Пост белой лампы ${line + 1}-${i + 1}`,
        Tex.METAL,
        Tex.F_CONCRETE,
      );
      if (!room) continue;
      markMetroMask(mask, world, room.x - 1, room.y - 1, room.w + 2, room.h + 2);

      const doorX = room.x + (room.w >> 1);
      const doorY = side > 0 ? room.y - 1 : room.y + room.h;
      const outsideY = side > 0 ? doorY - 1 : doorY + 1;
      carveMetroLine(world, null, doorX, outsideY, platformX, platformY, 1, style.floorTex);
      placeDoor(world, doorX, doorY, room.id, -1);

      setFeature(world, room.x + 3, room.y + 2, Feature.LAMP);
      setFeature(world, room.x + room.w - 4, room.y + 2, Feature.SCREEN);
      setFeature(world, room.x + 7, room.y + room.h - 3, Feature.TABLE);
      setFeature(world, room.x + room.w - 5, room.y + room.h - 3, Feature.SHELF);
      addDarkMetroTransitCache(world, room, room.x + room.w - 5, room.y + room.h - 3, line, i);
    }
  }
}

export function applyDarkMetroPlatformSafetyShells(world: World): void {
  const seedCells: number[] = [];
  for (const room of world.rooms) {
    if (!room) continue;
    if (
      !room.name.startsWith('Пост белой лампы') &&
      !room.name.startsWith('Обороняемая кромка') &&
      !room.name.startsWith('Пересадочный узел')
    ) continue;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const ci = world.idx(x, y);
        if (darkMetroSafetyShellPassable(world, ci)) seedCells.push(ci);
      }
    }
  }
  if (seedCells.length === 0) return;

  const dist = new Int16Array(W * W).fill(-1);
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  for (const ci of seedCells) {
    if (dist[ci] >= 0) continue;
    dist[ci] = 0;
    queue[tail++] = ci;
  }

  let lamps = 0;
  const maxLamps = 96;
  while (head < tail) {
    const ci = queue[head++];
    const d = dist[ci];
    const x = ci % W;
    const y = (ci / W) | 0;
    world.fog[ci] = Math.min(world.fog[ci], d <= 9 ? 0 : 10);
    if (
      d >= 5 &&
      lamps < maxLamps &&
      world.cells[ci] === Cell.FLOOR &&
      world.features[ci] === Feature.NONE &&
      (Math.imul(ci ^ 0x51f0_0d31, 1103515245) >>> 0) % 83 === 0
    ) {
      world.features[ci] = Feature.LAMP;
      lamps++;
    }
    if (d >= DARK_METRO_SAFETY_SHELL_RADIUS) continue;
    if (enqueueDarkMetroSafetyNeighbor(world, dist, queue, tail, x + 1, y, d + 1)) tail++;
    if (enqueueDarkMetroSafetyNeighbor(world, dist, queue, tail, x - 1, y, d + 1)) tail++;
    if (enqueueDarkMetroSafetyNeighbor(world, dist, queue, tail, x, y + 1, d + 1)) tail++;
    if (enqueueDarkMetroSafetyNeighbor(world, dist, queue, tail, x, y - 1, d + 1)) tail++;
  }
}

export function enqueueDarkMetroSafetyNeighbor(
  world: World,
  dist: Int16Array,
  queue: Int32Array,
  tail: number,
  x: number,
  y: number,
  d: number,
): boolean {
  const ci = world.idx(x, y);
  if (dist[ci] >= 0 || !darkMetroSafetyShellPassable(world, ci)) return false;
  dist[ci] = d;
  queue[tail] = ci;
  return true;
}

export function darkMetroSafetyShellPassable(world: World, ci: number): boolean {
  const cell = world.cells[ci];
  return cell === Cell.FLOOR || cell === Cell.DOOR;
}

export function addDarkMetroOpenPlatformRoom(world: World, x: number, y: number, w: number, h: number, name: string, floorTex: Tex): Room {
  const room: Room = {
    id: world.rooms.length,
    type: RoomType.HQ,
    x: world.wrap(x),
    y: world.wrap(y),
    w,
    h,
    doors: [],
    sealed: false,
    name,
    apartmentId: -1,
    wallTex: Tex.METAL,
    floorTex,
  };
  world.rooms.push(room);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] !== Cell.FLOOR) continue;
      world.roomMap[ci] = room.id;
      world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

export function darkMetroStationXs(line: number): readonly number[] {
  return [
    132 + line * 11,
    398 + (line % 2) * 54,
    690 - (line % 3) * 23,
    884 - line * 7,
  ].map(x => Math.max(72, Math.min(W - 72, x)));
}

export function darkMetroPlatformY(lineY: number, line: number): number {
  return lineY + (line % 2 === 0 ? 12 : -11);
}

export function markMetroMask(mask: Uint8Array, world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      mask[world.idx(x + dx, y + dy)] = 1;
    }
  }
}

export function linkDarkMetroCoreToInterchange(world: World, style: DarkMetroFullFloorStyle): void {
  const platform = world.rooms.find(r => r?.name === 'Платформа без расписания');
  const exit = world.rooms.find(r => r?.name === 'Служебный выход к лифтам');
  if (platform) {
    carveMetroLine(world, null, platform.x + platform.w - 3, platform.y + platform.h - 1, 700, 540, 2, style.floorTex);
    setFeature(world, platform.x + platform.w - 5, platform.y + 2, Feature.SCREEN);
  }
  if (exit) {
    carveMetroLine(world, null, exit.x + 2, exit.y + 3, 700, 540, 1, Tex.F_CONCRETE);
    setFeature(world, exit.x + 3, exit.y + 5, Feature.LAMP);
  }
}

export function addDarkMetroLandmarkRoom(
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
): Room | null {
  if (!canPlaceMetroRoom(world, mask, x, y, w, h)) return null;
  return styledRoom(world, type, x, y, w, h, name, wallTex, floorTex);
}

export function canPlaceMetroRoom(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (mask[world.idx(x + dx, y + dy)]) return false;
    }
  }
  return true;
}

export function carveMetroLine(
  world: World,
  mask: Uint8Array | null,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
): void {
  let x = world.wrap(ax);
  let y = world.wrap(ay);
  const tx = world.wrap(bx);
  const ty = world.wrap(by);
  const sx = world.delta(x, tx) >= 0 ? 1 : -1;
  const sy = world.delta(y, ty) >= 0 ? 1 : -1;
  while (x !== tx) {
    carveMetroDisc(world, mask, x, y, width, floorTex);
    x = world.wrap(x + sx);
  }
  while (y !== ty) {
    carveMetroDisc(world, mask, x, y, width, floorTex);
    y = world.wrap(y + sy);
  }
  carveMetroDisc(world, mask, x, y, width, floorTex);
}

export function carveMetroDisc(world: World, mask: Uint8Array | null, cx: number, cy: number, r: number, floorTex: Tex): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      openMetroTile(world, mask, cx + dx, cy + dy, floorTex);
    }
  }
}

export function carveMetroRect(
  world: World,
  mask: Uint8Array | null,
  x: number,
  y: number,
  w: number,
  h: number,
  floorTex: Tex,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      openMetroTile(world, mask, x + dx, y + dy, floorTex);
    }
  }
}

export function carveMetroTrack(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (mask[ci] || world.cells[ci] === Cell.LIFT) continue;
      world.cells[ci] = Cell.WATER;
      world.floorTex[ci] = Tex.F_WATER;
      world.features[ci] = Feature.NONE;
      world.roomMap[ci] = -1;
      if ((dx + dy) % 17 === 0) world.fog[ci] = Math.max(world.fog[ci], 20);
    }
  }
}

export function openMetroTile(world: World, mask: Uint8Array | null, x: number, y: number, floorTex: Tex): void {
  const ci = world.idx(x, y);
  if ((mask && mask[ci]) || world.cells[ci] === Cell.LIFT) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
}

export function setDarkMetroFog(world: World, x: number, y: number, fog: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.LIFT) return;
  world.fog[ci] = Math.max(world.fog[ci], fog);
}

export function stampDarkMetroLayout(ctx: BuildCtx): DarkMetroLayout {
  const bx = Math.floor(W / 2) - 32;
  const by = Math.floor(W / 2) - 12;
  const { world } = ctx;

  const hall = styledRoom(world, RoomType.COMMON, bx, by, 30, 18, 'Вестибюль темной пересадки', Tex.DARK, Tex.F_CONCRETE);
  const platform = styledRoom(world, RoomType.CORRIDOR, bx - 4, by + 22, 42, 9, 'Платформа без расписания', Tex.METAL, Tex.F_CONCRETE);
  const underpass = styledRoom(world, RoomType.CORRIDOR, bx + 12, by + 33, 8, 25, 'Подземный переход белых ламп', Tex.CONCRETE, Tex.F_TILE);
  const kiosk = styledRoom(world, RoomType.STORAGE, bx - 16, by + 6, 10, 8, 'Киоск ламп и жетонов', Tex.PANEL, Tex.F_LINO);
  const signal = styledRoom(world, RoomType.PRODUCTION, bx + 42, by + 8, 14, 10, 'Сигнальная будка стрелки', Tex.PIPE, Tex.F_CONCRETE);
  const blindTunnel = styledRoom(world, RoomType.CORRIDOR, bx + 20, by + 61, 34, 5, 'Слепой тоннель чужой станции', Tex.DARK, Tex.F_CONCRETE);
  const exit = styledRoom(world, RoomType.PRODUCTION, bx + 58, by + 57, 12, 9, 'Служебный выход к лифтам', Tex.METAL, Tex.F_CONCRETE);

  connectWithDoors(world, hall, platform, bx + 14, by + 18, bx + 14, by + 21);
  connectWithDoors(world, platform, underpass, bx + 16, by + 31, bx + 16, by + 32);
  connectWithDoors(world, kiosk, hall, bx - 6, by + 10, bx - 1, by + 10);
  connectWithDoors(world, hall, signal, bx + 30, by + 13, bx + 41, by + 13);
  connectWithDoors(world, underpass, blindTunnel, bx + 16, by + 58, bx + 19, by + 64);
  connectWithDoors(world, blindTunnel, exit, bx + 54, by + 64, bx + 57, by + 64);

  return { hall, platform, underpass, kiosk, signal, blindTunnel, exit };
}

export function styledRoom(
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
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      world.floorTex[world.idx(x + dx, y + dy)] = floorTex;
    }
  }
  return room;
}

export function connectWithDoors(world: World, a: Room, b: Room, ax: number, ay: number, bx: number, by: number): void {
  carveLine(world, ax, ay, bx, by);
  placeDoor(world, ax, ay, a.id, -1);
  placeDoor(world, bx, by, b.id, -1);
}

export function carveLine(world: World, ax: number, ay: number, bx: number, by: number): void {
  let x = ax;
  let y = ay;
  const sx = world.delta(ax, bx) >= 0 ? 1 : -1;
  const sy = world.delta(ay, by) >= 0 ? 1 : -1;
  while (x !== bx) {
    openTile(world, x, y);
    x = world.wrap(x + sx);
  }
  while (y !== by) {
    openTile(world, x, y);
    y = world.wrap(y + sy);
  }
  openTile(world, x, y);
}

export function openTile(world: World, x: number, y: number, floorTex = Tex.F_CONCRETE): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
}

export function placeDoor(world: World, x: number, y: number, roomA: number, roomB: number): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.DOOR;
  world.roomMap[ci] = -1;
  world.doors.set(ci, { idx: ci, state: DoorState.CLOSED, roomA, roomB, keyId: '', timer: 0 });
  const a = world.rooms[roomA];
  if (a && !a.doors.includes(ci)) a.doors.push(ci);
  const b = roomB >= 0 ? world.rooms[roomB] : undefined;
  if (b && !b.doors.includes(ci)) b.doors.push(ci);
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.LIFT) return;
  world.features[ci] = feature;
}

export function setWater(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT) return;
  world.cells[ci] = Cell.WATER;
  world.floorTex[ci] = Tex.F_WATER;
}

export function tuneDarkMetroZones(world: World): void {
  for (const zone of world.zones) {
    const roll = hashSeed(`${DESIGN_FLOOR_ID}.${zone.id}`) % 10;
    zone.level = roll >= 7 ? 5 : roll >= 3 ? 4 : 3;
    zone.faction = roll === 0 ? ZoneFaction.CULTIST : roll <= 4 ? ZoneFaction.LIQUIDATOR : ZoneFaction.WILD;
    zone.fogged = false;
    zone.hasLift = zone.id % 11 === 0;
  }
  for (let i = 0; i < W * W; i++) {
    const zone = world.zones[world.zoneMap[i]];
    world.factionControl[i] = zone?.faction ?? ZoneFaction.WILD;
  }
}

export function dressDarkMetro(ctx: BuildCtx, layout: DarkMetroLayout): void {
  const { world } = ctx;
  const state = unpackDarkMetroState(ctx.packedState);

  for (let x = layout.platform.x + 1; x < layout.platform.x + layout.platform.w - 1; x++) {
    setWater(world, x, layout.platform.y + layout.platform.h - 2);
    if ((x - layout.platform.x) % 5 === 0) setFeature(world, x, layout.platform.y + 1, Feature.LAMP);
  }

  for (let i = 0; i < DARK_METRO_ROUTES.length; i++) {
    const route = DARK_METRO_ROUTES[i];
    const x = layout.platform.x + 4 + route.panelSlot * 9;
    setFeature(world, x, layout.platform.y + 2, Feature.SCREEN);
    setFeature(world, x, layout.platform.y + 3, Feature.APPARATUS);
    if (route.id === state.wrongRouteArmed) setFeature(world, x + 1, layout.platform.y + 4, Feature.CANDLE);
  }

  for (let y = layout.underpass.y + 2; y < layout.underpass.y + layout.underpass.h - 1; y += 4) {
    setFeature(world, layout.underpass.x + 1, y, Feature.LAMP);
  }
  for (let x = layout.blindTunnel.x + 2; x < layout.blindTunnel.x + layout.blindTunnel.w - 2; x += 7) {
    setFeature(world, x, layout.blindTunnel.y + 2, Feature.CANDLE);
    world.fog[world.idx(x, layout.blindTunnel.y + 2)] = 32;
  }

  setFeature(world, layout.hall.x + 4, layout.hall.y + 4, Feature.LAMP);
  setFeature(world, layout.hall.x + layout.hall.w - 5, layout.hall.y + 4, Feature.LAMP);
  setFeature(world, layout.hall.x + 8, layout.hall.y + layout.hall.h - 3, Feature.CHAIR);
  setFeature(world, layout.hall.x + 14, layout.hall.y + layout.hall.h - 4, Feature.TABLE);
  setFeature(world, layout.kiosk.x + 3, layout.kiosk.y + 2, Feature.SHELF);
  setFeature(world, layout.kiosk.x + 6, layout.kiosk.y + 4, Feature.TABLE);
  setFeature(world, layout.signal.x + 3, layout.signal.y + 3, Feature.MACHINE);
  setFeature(world, layout.signal.x + 7, layout.signal.y + 4, Feature.APPARATUS);
  setFeature(world, layout.signal.x + 10, layout.signal.y + 2, Feature.SCREEN);
  setFeature(world, layout.exit.x + 8, layout.exit.y + 3, Feature.LIFT_BUTTON);

  const liftUp = world.idx(layout.exit.x + 10, layout.exit.y + 2);
  world.cells[liftUp] = Cell.LIFT;
  world.wallTex[liftUp] = Tex.LIFT_DOOR;
  world.liftDir[liftUp] = LiftDirection.UP;
  const liftDown = world.idx(layout.exit.x + 10, layout.exit.y + 5);
  world.cells[liftDown] = Cell.LIFT;
  world.wallTex[liftDown] = Tex.LIFT_DOOR;
  world.liftDir[liftDown] = LiftDirection.DOWN;

  for (let i = 0; i < 9; i++) {
    const x = layout.blindTunnel.x + 4 + i * 3;
    stampSurfaceSplat(world, x, layout.blindTunnel.y + 2, 0.5, 0.5, 2.5, 0.24, hashSeed(`dark_metro_mark.${i}`), 55, 45, 70, false);
  }
}

