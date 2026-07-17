import { ServiceFloorExpansionStyle, PUMP_RESCUE_ROOM, spawnServicePumpRescue, DRAINAGE_BASIN_NW, DRAINAGE_BASIN_NE, DRAINAGE_BASIN_SW, DRAINAGE_BASIN_SE, seedServiceBasinLoot, registerExpandedServiceUtilityGraph, LIFT_MACHINE_ROOM, BREAKER_ROOM, VENT_JUNCTION, ServiceRoomDoorSpec, SERVICE_HQ_COMPOUNDS, SERVICE_LIQUIDATOR_OUTPOST_NAMES, ServiceDoorSide, SERVICE_BAY_ROWS } from './index';
/* ── Design z: service_floor — lift machines and staff routes ─ */

import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  Cell,
  DoorState,
  Feature,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { placeEmergencyPanel } from '../../systems/emergency_panels';
import { setTerritoryOwnerAtIndex } from '../../systems/territory';
import { stampRoom } from '../shared';


export function expandServiceFloorMachineMaze(
  world: World,
  rng: () => number,
  style: ServiceFloorExpansionStyle,
  entities?: Entity[],
): void {
  const staffTex = style.floorTex;
  const ductTex = Tex.F_ABYSS;
  const staffWall = style.wallTex;

  carveServiceRun(world, 244, 188, 780, 188, 5, staffTex, staffWall);
  carveServiceRun(world, 244, 836, 780, 836, 5, staffTex, staffWall);
  carveServiceRun(world, 244, 188, 244, 836, 5, staffTex, staffWall);
  carveServiceRun(world, 780, 188, 780, 836, 5, staffTex, staffWall);
  carveServiceRun(world, 244, 514, 408, 514, 5, staffTex, staffWall);
  carveServiceRun(world, 641, 514, 780, 514, 5, staffTex, staffWall);
  carveServiceRun(world, 520, 188, 520, 836, 5, staffTex, staffWall);
  carveServiceRun(world, 244, 324, 780, 324, 3, staffTex, staffWall);
  carveServiceRun(world, 244, 700, 780, 700, 3, staffTex, staffWall);

  const westLift = findServiceRoom(world, 'Западный служебный лифт С-15');
  if (westLift) connectRoomLeft(world, westLift, 244, 514, DoorState.CLOSED);
  const eastLift = findServiceRoom(world, 'Восточный служебный лифт С-15');
  if (eastLift) connectRoomRight(world, eastLift, 780, 514, DoorState.CLOSED);

  const cores = [
    stampMachineCore(world, 160, 170, 58, 36, 'Северо-западное лифтовое ядро С-15', 244, 'right'),
    stampMachineCore(world, 806, 170, 58, 36, 'Северо-восточное лифтовое ядро С-15', 780, 'left'),
    stampMachineCore(world, 160, 818, 60, 38, 'Юго-западное лифтовое ядро С-15', 244, 'right'),
    stampMachineCore(world, 804, 818, 60, 38, 'Юго-восточное лифтовое ядро С-15', 780, 'left'),
    stampMachineCore(world, 456, 140, 128, 34, 'Верхняя лебедочная галерея С-15', 188, 'down'),
    stampMachineCore(world, 448, 860, 128, 34, 'Нижняя лебедочная галерея С-15', 836, 'up'),
  ];

  for (let i = 0; i < cores.length; i++) {
    dressMachineCore(world, cores[i], i);
  }

  const booths = [
    stampControlBooth(world, 235, 142, 'Пульт северо-западного обхода С-15', 244, 188, 'down'),
    stampControlBooth(world, 758, 142, 'Пульт северо-восточного обхода С-15', 780, 188, 'down'),
    stampControlBooth(world, 235, 810, 'Пульт нижнего западного обхода С-15', 244, 836, 'down'),
    stampControlBooth(world, 758, 810, 'Пульт нижнего восточного обхода С-15', 780, 836, 'down'),
    stampControlBooth(world, 496, 226, 'Пост наблюдения над шахтами С-15', 520, 226, 'right'),
    stampControlBooth(world, 496, 762, 'Пост учета кабельных потерь С-15', 520, 762, 'right'),
  ];
  for (const booth of booths) dressControlBooth(world, booth);

  const pumps = [
    stampPumpAlcove(world, 304, 666, 46, 28, PUMP_RESCUE_ROOM, 700, 'down'),
    stampPumpAlcove(world, 674, 666, 46, 28, 'Насосная ниша восточного стояка С-15', 700, 'down'),
    stampPumpAlcove(world, 302, 274, 46, 28, 'Компрессорный карман западной шахты С-15', 324, 'down'),
    stampPumpAlcove(world, 676, 274, 46, 28, 'Компрессорный карман восточной шахты С-15', 324, 'down'),
  ];
  for (const pump of pumps) dressPumpAlcove(world, pump);
  if (entities) spawnServicePumpRescue(world, entities, pumps[0]);

  const basins = [
    stampPressureBasin(world, 360, 394, 54, 34, DRAINAGE_BASIN_NW, 438, 'down'),
    stampPressureBasin(world, 610, 394, 54, 34, DRAINAGE_BASIN_NE, 438, 'down'),
    stampPressureBasin(world, 360, 602, 54, 34, DRAINAGE_BASIN_SW, 590, 'up'),
    stampPressureBasin(world, 610, 602, 54, 34, DRAINAGE_BASIN_SE, 590, 'up'),
  ];
  for (let i = 0; i < basins.length; i++) dressPressureBasin(world, basins[i], rng, i);
  if (entities) seedServiceBasinLoot(world, entities, basins);

  carveDuctBypass(world, 244, 188, 430, 486, ductTex);
  carveDuctBypass(world, 780, 188, 560, 486, ductTex);
  carveDuctBypass(world, 244, 836, 430, 538, ductTex);
  carveDuctBypass(world, 780, 836, 562, 538, ductTex);
  carveDuctBypass(world, 244, 324, 520, 514, ductTex);
  carveDuctBypass(world, 780, 700, 520, 514, ductTex);

  carveCableTrench(world, 332, 188, 332, 836, rng);
  carveCableTrench(world, 704, 188, 704, 836, rng);
  carveCableTrench(world, 244, 438, 780, 438, rng);
  carveCableTrench(world, 244, 590, 780, 590, rng);

  dressServiceRoutes(world, rng);
  buildServiceHqCompounds(world);
  buildLiquidatorServiceOutposts(world);
  buildServiceBayRows(world, rng);
  buildServiceBypassWallStations(world);
  registerExpandedServiceUtilityGraph(world, cores, booths, pumps, basins);
}

export function placeServiceFloorEmergencyPanels(world: World): number {
  const placements: readonly {
    roomDefId: string;
    dx: number;
    dy: number;
    panelId: 'panel_power' | 'panel_water' | 'panel_doors' | 'panel_vent';
    seed: number;
  }[] = [
    { roomDefId: LIFT_MACHINE_ROOM, dx: 5, dy: 5, panelId: 'panel_doors', seed: 0x5151 },
    { roomDefId: BREAKER_ROOM, dx: 16, dy: 4, panelId: 'panel_power', seed: 0x5152 },
    { roomDefId: VENT_JUNCTION, dx: 19, dy: 3, panelId: 'panel_vent', seed: 0x5153 },
    { roomDefId: PUMP_RESCUE_ROOM, dx: 5, dy: 4, panelId: 'panel_water', seed: 0x5154 },
    { roomDefId: 'Насосная ниша восточного стояка С-15', dx: 5, dy: 4, panelId: 'panel_water', seed: 0x5155 },
    { roomDefId: 'Пост учета кабельных потерь С-15', dx: 14, dy: 4, panelId: 'panel_power', seed: 0x5156 },
  ];
  let placed = 0;
  for (const item of placements) {
    const room = findServiceRoom(world, item.roomDefId);
    if (!room) continue;
    const x = world.wrap(room.x + Math.min(room.w - 2, Math.max(1, item.dx)));
    const y = world.wrap(room.y + Math.min(room.h - 2, Math.max(1, item.dy)));
    const idx = world.idx(x, y);
    if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) continue;
    if (placeEmergencyPanel(world, x, y, item.panelId, item.seed ^ room.id * 131)) placed++;
  }
  return placed;
}

export function nextServiceEntityId(entities: readonly Entity[]): number {
  let id = 1;
  for (const entity of entities) id = Math.max(id, entity.id + 1);
  return id;
}

export function stampServiceRoom(
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
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) world.floorTex[ci] = floorTex;
    }
  }
  return room;
}

export function findServiceRoom(world: World, name: string): Room | undefined {
  return world.rooms.find(room => room.name === name);
}

export function carveStaffRoute(world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx < 0 || dx >= w || dy < 0 || dy >= h) {
        if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = Tex.METAL;
      } else {
        world.cells[ci] = Cell.FLOOR;
        world.roomMap[ci] = -1;
        world.floorTex[ci] = Tex.F_CONCRETE;
      }
    }
  }
}

export function carveServiceRun(
  world: World,
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
    const x = Math.min(ax, bx);
    carveExpansionRect(world, x, ay - half, Math.abs(bx - ax) + 1, width, floorTex, wallTex);
    return;
  }
  const y = Math.min(ay, by);
  carveExpansionRect(world, ax - half, y, width, Math.abs(by - ay) + 1, floorTex, wallTex);
}

export function carveExpansionRect(
  world: World,
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
      if (dx < 0 || dx >= w || dy < 0 || dy >= h) {
        if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
      } else {
        openExpansionTile(world, x + dx, y + dy, floorTex);
      }
    }
  }
}

export function openExpansionTile(world: World, x: number, y: number, floorTex: Tex): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) return;
  if (world.roomMap[ci] >= 0 && world.cells[ci] !== Cell.WALL) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
  if (world.features[ci] !== Feature.NONE) world.features[ci] = Feature.NONE;
}

export function openRouteTile(world: World, x: number, y: number, floorTex = Tex.F_CONCRETE): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.LIFT) return;
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = -1;
  world.floorTex[ci] = floorTex;
}

export function clampDoorCoord(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

export function serviceOwnerWallTex(owner: ZoneFaction): Tex {
  if (owner === ZoneFaction.SCIENTIST) return Tex.TILE_W;
  if (owner === ZoneFaction.CULTIST) return Tex.DARK;
  if (owner === ZoneFaction.WILD) return Tex.ROTTEN;
  if (owner === ZoneFaction.CITIZEN) return Tex.PANEL;
  return Tex.METAL;
}

export function serviceOwnerFloorTex(owner: ZoneFaction): Tex {
  if (owner === ZoneFaction.SCIENTIST) return Tex.F_TILE;
  if (owner === ZoneFaction.CULTIST) return Tex.F_RED_CARPET;
  if (owner === ZoneFaction.WILD) return Tex.F_CONCRETE;
  if (owner === ZoneFaction.CITIZEN) return Tex.F_LINO;
  return Tex.F_CONCRETE;
}

export function serviceSupportType(owner: ZoneFaction, slot: number): RoomType {
  if (slot === 0) return RoomType.KITCHEN;
  if (slot === 1) return RoomType.BATHROOM;
  if (slot === 2) return owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.STORAGE;
  if (slot === 3) return owner === ZoneFaction.LIQUIDATOR || owner === ZoneFaction.SCIENTIST ? RoomType.OFFICE : RoomType.COMMON;
  return owner === ZoneFaction.WILD ? RoomType.SMOKING : RoomType.STORAGE;
}

export function serviceBayType(seed: number): RoomType {
  const types = [
    RoomType.PRODUCTION,
    RoomType.STORAGE,
    RoomType.OFFICE,
    RoomType.BATHROOM,
    RoomType.COMMON,
    RoomType.KITCHEN,
    RoomType.STORAGE,
    RoomType.PRODUCTION,
  ] as const;
  return types[Math.abs(seed) % types.length];
}

export function canStampOwnedServiceRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  if (x < 2 || y < 2 || x + w >= W - 2 || y + h >= W - 2) return false;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.aptMask[idx]) return false;
      if (world.cells[idx] !== Cell.WALL) return false;
      if (dx >= 0 && dx < w && dy >= 0 && dy < h && world.roomMap[idx] >= 0) return false;
    }
  }
  return true;
}

export function paintServiceRoomOwner(world: World, room: Room, owner: ZoneFaction): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) setTerritoryOwnerAtIndex(world, idx, owner);
    }
  }
  for (const idx of room.doors) setTerritoryOwnerAtIndex(world, idx, owner);
}

export function hardenServiceHqRoom(world: World, room: Room, owner: ZoneFaction): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  room.floorTex = serviceOwnerFloorTex(owner);
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) world.floorTex[idx] = room.floorTex;
        continue;
      }
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
  paintServiceRoomOwner(world, room, owner);
}

export function decorateOwnedServiceRoom(world: World, room: Room, owner: ZoneFaction, salt: number): void {
  if (room.type === RoomType.KITCHEN) {
    setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
    setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
  } else if (room.type === RoomType.BATHROOM) {
    setFeature(world, room.x + 2, room.y + 2, Feature.TOILET);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SINK);
  } else if (room.type === RoomType.MEDICAL) {
    setFeature(world, room.x + 3, room.y + 2, Feature.APPARATUS);
    setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.BED);
  } else if (room.type === RoomType.OFFICE || room.type === RoomType.HQ) {
    setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
    setFeature(world, room.x + 4, room.y + 2, Feature.SCREEN);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
  } else if (room.type === RoomType.PRODUCTION) {
    setFeature(world, room.x + 3, room.y + 2, Feature.MACHINE);
    setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.APPARATUS);
  } else {
    setFeature(world, room.x + 2, room.y + 2, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.TABLE);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
  }
  setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
  if (owner === ZoneFaction.WILD && (salt & 1) === 0) {
    stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 1.9, 0.16, salt * 977, 72, 54, 36);
  }
}

export function stampOwnedServiceRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  owner: ZoneFaction,
  protectedCore = false,
): Room | undefined {
  if (!canStampOwnedServiceRoom(world, x, y, w, h)) return undefined;
  const room = stampServiceRoom(
    world,
    type,
    x,
    y,
    w,
    h,
    name,
    protectedCore ? Tex.HERMO_WALL : serviceOwnerWallTex(owner),
    serviceOwnerFloorTex(owner),
  );
  if (protectedCore) hardenServiceHqRoom(world, room, owner);
  else paintServiceRoomOwner(world, room, owner);
  decorateOwnedServiceRoom(world, room, owner, room.id * 31 + x + y);
  return room;
}

export function connectOwnedServiceRoom(world: World, room: Room, owner: ZoneFaction, spec: ServiceRoomDoorSpec): void {
  const state = spec.state ?? DoorState.CLOSED;
  const keyId = spec.keyId ?? '';
  let doorId = -1;
  if (spec.side === 'north') {
    doorId = connectRoomUp(
      world,
      room,
      clampDoorCoord(spec.targetX, room.x + 1, room.x + room.w - 2),
      spec.targetY,
      state,
      keyId,
    );
  } else if (spec.side === 'south') {
    doorId = connectRoomDown(
      world,
      room,
      clampDoorCoord(spec.targetX, room.x + 1, room.x + room.w - 2),
      spec.targetY,
      state,
      keyId,
    );
  } else if (spec.side === 'west') {
    doorId = connectRoomLeft(
      world,
      room,
      spec.targetX,
      clampDoorCoord(spec.targetY, room.y + 1, room.y + room.h - 2),
      state,
      keyId,
    );
  } else {
    doorId = connectRoomRight(
      world,
      room,
      spec.targetX,
      clampDoorCoord(spec.targetY, room.y + 1, room.y + room.h - 2),
      state,
      keyId,
    );
  }
  if (doorId >= 0) setTerritoryOwnerAtIndex(world, doorId, owner);
  paintServiceRoomOwner(world, room, owner);
}

export function carveOwnedServiceRun(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  owner: ZoneFaction,
  floorTex: Tex,
  wallTex: Tex,
): void {
  carveServiceRun(world, ax, ay, bx, by, width, floorTex, wallTex);
  const half = width >> 1;
  if (ay === by) {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    for (let y = ay - half; y <= ay + half; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = world.idx(x, y);
        if (world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.WATER) {
          setTerritoryOwnerAtIndex(world, idx, owner);
        }
      }
    }
    return;
  }
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  for (let y = minY; y <= maxY; y++) {
    for (let x = ax - half; x <= ax + half; x++) {
      const idx = world.idx(x, y);
      if (world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.WATER) {
        setTerritoryOwnerAtIndex(world, idx, owner);
      }
    }
  }
}

export function serviceSupportName(prefix: string, type: RoomType, slot: number): string {
  switch (type) {
    case RoomType.KITCHEN: return `${prefix}: кухня ${slot}`;
    case RoomType.BATHROOM: return `${prefix}: санузел ${slot}`;
    case RoomType.MEDICAL: return `${prefix}: медпункт ${slot}`;
    case RoomType.OFFICE: return `${prefix}: журнал ${slot}`;
    case RoomType.PRODUCTION: return `${prefix}: мастерская ${slot}`;
    case RoomType.SMOKING: return `${prefix}: курилка ${slot}`;
    case RoomType.COMMON: return `${prefix}: общая ${slot}`;
    case RoomType.STORAGE:
    default: return `${prefix}: кладовая ${slot}`;
  }
}

export function buildServiceHqCompounds(world: World): void {
  for (const spec of SERVICE_HQ_COMPOUNDS) {
    const floorTex = serviceOwnerFloorTex(spec.owner);
    const wallTex = serviceOwnerWallTex(spec.owner);
    carveOwnedServiceRun(world, spec.route[0], spec.route[1], spec.route[2], spec.route[3], 3, spec.owner, floorTex, wallTex);
    carveOwnedServiceRun(world, spec.corridor[0], spec.corridor[1], spec.corridor[2], spec.corridor[3], 3, spec.owner, floorTex, wallTex);

    const [coreX, coreY, coreW, coreH, coreSide, coreName] = spec.core;
    const core = stampOwnedServiceRoom(world, RoomType.HQ, coreX, coreY, coreW, coreH, coreName, spec.owner, true);
    if (core) {
      connectOwnedServiceRoom(world, core, spec.owner, {
        side: coreSide,
        targetX: core.x + (core.w >> 1),
        targetY: spec.corridor[1],
        state: DoorState.HERMETIC_OPEN,
      });
      hardenServiceHqRoom(world, core, spec.owner);
    }

    const x1 = Math.min(spec.corridor[0], spec.corridor[2]);
    const x2 = Math.max(spec.corridor[0], spec.corridor[2]);
    const y = spec.corridor[1];
    const supportTypes = [0, 1, 2, 3, 4].map(slot => serviceSupportType(spec.owner, slot));
    for (let i = 0; i < supportTypes.length; i++) {
      const type = supportTypes[i];
      const w = type === RoomType.KITCHEN || type === RoomType.MEDICAL || type === RoomType.OFFICE ? 18 : 15;
      const h = 10;
      const px = x1 + 6 + i * Math.max(19, Math.floor((x2 - x1 - 12) / Math.max(1, supportTypes.length)));
      const above = (i & 1) === 0;
      const roomY = above ? y - h - 5 : y + 5;
      const room = stampOwnedServiceRoom(
        world,
        type,
        px,
        roomY,
        w,
        h,
        serviceSupportName(spec.supportPrefix, type, i + 1),
        spec.owner,
      );
      if (!room) continue;
      connectOwnedServiceRoom(world, room, spec.owner, {
        side: above ? 'south' : 'north',
        targetX: room.x + (room.w >> 1),
        targetY: y,
      });
    }
  }
}

export function buildLiquidatorServiceOutposts(world: World): void {
  const posts = [
    { name: SERVICE_LIQUIDATOR_OUTPOST_NAMES[0], x: 394, y: 410, w: 22, h: 12, side: 'south' as ServiceDoorSide, tx: 404, ty: 438 },
    { name: SERVICE_LIQUIDATOR_OUTPOST_NAMES[1], x: 608, y: 410, w: 22, h: 12, side: 'south' as ServiceDoorSide, tx: 618, ty: 438 },
    { name: SERVICE_LIQUIDATOR_OUTPOST_NAMES[2], x: 496, y: 716, w: 24, h: 12, side: 'north' as ServiceDoorSide, tx: 508, ty: 700 },
  ] as const;
  for (const post of posts) {
    const room = stampOwnedServiceRoom(world, RoomType.HQ, post.x, post.y, post.w, post.h, post.name, ZoneFaction.LIQUIDATOR, true);
    if (!room) continue;
    connectOwnedServiceRoom(world, room, ZoneFaction.LIQUIDATOR, {
      side: post.side,
      targetX: post.tx,
      targetY: post.ty,
      state: DoorState.HERMETIC_OPEN,
    });
    hardenServiceHqRoom(world, room, ZoneFaction.LIQUIDATOR);
  }
}

export function buildServiceBayRows(world: World, rng: () => number): void {
  let serial = 0;
  for (const row of SERVICE_BAY_ROWS) {
    for (let p = row.start; p <= row.end; p += row.step) {
      const jitter = Math.floor(rng() * 5) - 2;
      const type = serviceBayType(row.typeSeed + serial);
      const span = row.span + ((serial + row.typeSeed) % 3);
      let x: number;
      let y: number;
      let w: number;
      let h: number;
      let door: ServiceRoomDoorSpec;
      if (row.horizontal) {
        w = 12 + ((serial + row.typeSeed) % 4) * 3;
        h = span;
        x = p + jitter;
        y = row.side < 0 ? row.corridor - h - 4 : row.corridor + 4;
        door = {
          side: row.side < 0 ? 'south' : 'north',
          targetX: x + (w >> 1),
          targetY: row.corridor,
          state: type === RoomType.OFFICE && row.owner === ZoneFaction.LIQUIDATOR ? DoorState.LOCKED : DoorState.CLOSED,
          keyId: type === RoomType.OFFICE && row.owner === ZoneFaction.LIQUIDATOR ? 'key' : '',
        };
      } else {
        w = span;
        h = 12 + ((serial + row.typeSeed) % 4) * 3;
        x = row.side < 0 ? row.corridor - w - 4 : row.corridor + 4;
        y = p + jitter;
        door = {
          side: row.side < 0 ? 'east' : 'west',
          targetX: row.corridor,
          targetY: y + (h >> 1),
          state: type === RoomType.STORAGE && row.owner === ZoneFaction.WILD ? DoorState.LOCKED : DoorState.CLOSED,
          keyId: type === RoomType.STORAGE && row.owner === ZoneFaction.WILD ? 'key' : '',
        };
      }
      const room = stampOwnedServiceRoom(
        world,
        type,
        x,
        y,
        w,
        h,
        `${row.label} ${serial + 1}`,
        row.owner,
      );
      if (!room) {
        serial++;
        continue;
      }
      connectOwnedServiceRoom(world, room, row.owner, door);
      serial++;
    }
  }
}

export function carveServiceRoomBypassWall(world: World, room: Room, vertical: boolean, salt: number): void {
  if (vertical) {
    const x = room.x + (room.w >> 1);
    for (let y = room.y + 6; y < room.y + room.h - 6; y++) {
      if (y < room.y + 10 || y > room.y + room.h - 11) continue;
      const idx = world.idx(x, y);
      if (world.roomMap[idx] !== room.id) continue;
      if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) continue;
      world.cells[idx] = Cell.WALL;
      world.roomMap[idx] = -1;
      world.wallTex[idx] = Tex.PIPE;
      world.features[idx] = Feature.NONE;
    }
    setFeature(world, x - 2, room.y + 8 + (salt % 3), Feature.SCREEN);
    setFeature(world, x + 2, room.y + room.h - 9 - (salt % 3), Feature.APPARATUS);
    return;
  }
  const y = room.y + (room.h >> 1);
  for (let x = room.x + 8; x < room.x + room.w - 8; x++) {
    if (x < room.x + 13 || x > room.x + room.w - 14) continue;
    const idx = world.idx(x, y);
    if (world.roomMap[idx] !== room.id) continue;
    if (world.cells[idx] !== Cell.FLOOR && world.cells[idx] !== Cell.WATER) continue;
    world.cells[idx] = Cell.WALL;
    world.roomMap[idx] = -1;
    world.wallTex[idx] = Tex.PIPE;
    world.features[idx] = Feature.NONE;
  }
  setFeature(world, room.x + 8 + (salt % 4), y - 2, Feature.SCREEN);
  setFeature(world, room.x + room.w - 9 - (salt % 4), y + 2, Feature.APPARATUS);
}

export function buildServiceBypassWallStations(world: World): void {
  const rooms = [
    findServiceRoom(world, DRAINAGE_BASIN_NW),
    findServiceRoom(world, DRAINAGE_BASIN_NE),
    findServiceRoom(world, DRAINAGE_BASIN_SW),
    findServiceRoom(world, DRAINAGE_BASIN_SE),
    findServiceRoom(world, 'Северо-западное лифтовое ядро С-15'),
    findServiceRoom(world, 'Северо-восточное лифтовое ядро С-15'),
    findServiceRoom(world, 'Юго-западное лифтовое ядро С-15'),
    findServiceRoom(world, 'Юго-восточное лифтовое ядро С-15'),
  ].filter((room): room is Room => room !== undefined);
  for (let i = 0; i < rooms.length; i++) carveServiceRoomBypassWall(world, rooms[i], i % 2 === 0, i);

  const booths = [
    { x: 300, y: 424, side: 'south' as ServiceDoorSide, tx: 310, ty: 438, name: 'Будка обхода северо-западной стены С-15' },
    { x: 668, y: 424, side: 'south' as ServiceDoorSide, tx: 678, ty: 438, name: 'Будка обхода северо-восточной стены С-15' },
    { x: 342, y: 578, side: 'south' as ServiceDoorSide, tx: 352, ty: 590, name: 'Будка обхода юго-западной стены С-15' },
    { x: 642, y: 578, side: 'south' as ServiceDoorSide, tx: 652, ty: 590, name: 'Будка обхода юго-восточной стены С-15' },
  ] as const;
  for (const booth of booths) {
    const room = stampOwnedServiceRoom(world, RoomType.OFFICE, booth.x, booth.y, 20, 10, booth.name, ZoneFaction.LIQUIDATOR);
    if (!room) continue;
    connectOwnedServiceRoom(world, room, ZoneFaction.LIQUIDATOR, {
      side: booth.side,
      targetX: booth.tx,
      targetY: booth.ty,
      state: DoorState.CLOSED,
    });
  }
}

export function reinforceServiceFloorAuthoredHqTerritory(world: World): void {
  for (const spec of SERVICE_HQ_COMPOUNDS) {
    const coreName = spec.core[5];
    for (const room of world.rooms) {
      if (!room) continue;
      if (room.name === coreName) {
        hardenServiceHqRoom(world, room, spec.owner);
        for (const doorIdx of room.doors) {
          const door = world.doors.get(doorIdx);
          if (!door) continue;
          door.state = DoorState.HERMETIC_OPEN;
          door.keyId = '';
          setTerritoryOwnerAtIndex(world, doorIdx, spec.owner);
        }
      } else if (room.name.startsWith(`${spec.supportPrefix}:`)) {
        paintServiceRoomOwner(world, room, spec.owner);
      }
    }
  }
  for (const name of SERVICE_LIQUIDATOR_OUTPOST_NAMES) {
    const room = findServiceRoom(world, name);
    if (!room) continue;
    hardenServiceHqRoom(world, room, ZoneFaction.LIQUIDATOR);
    for (const doorIdx of room.doors) {
      const door = world.doors.get(doorIdx);
      if (!door) continue;
      door.state = DoorState.HERMETIC_OPEN;
      door.keyId = '';
      setTerritoryOwnerAtIndex(world, doorIdx, ZoneFaction.LIQUIDATOR);
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
}

export function stampMachineCore(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  route: number,
  side: 'left' | 'right' | 'up' | 'down',
): Room {
  const room = stampServiceRoom(world, RoomType.PRODUCTION, x, y, w, h, name, Tex.PIPE, Tex.F_CONCRETE);
  const midX = room.x + (room.w >> 1);
  const midY = room.y + (room.h >> 1);
  if (side === 'left') connectRoomLeft(world, room, route, midY, DoorState.CLOSED);
  else if (side === 'right') connectRoomRight(world, room, route, midY, DoorState.CLOSED);
  else if (side === 'up') connectRoomUp(world, room, midX, route, DoorState.CLOSED);
  else connectRoomDown(world, room, midX, route, DoorState.CLOSED);
  return room;
}

export function stampControlBooth(
  world: World,
  x: number,
  y: number,
  name: string,
  routeX: number,
  routeY: number,
  side: 'left' | 'right' | 'up' | 'down',
): Room {
  const room = stampServiceRoom(world, RoomType.OFFICE, x, y, 18, 12, name, Tex.METAL, Tex.F_TILE);
  if (side === 'left') connectRoomLeft(world, room, routeX, routeY, DoorState.LOCKED, 'key');
  else if (side === 'right') connectRoomRight(world, room, routeX, routeY, DoorState.LOCKED, 'key');
  else if (side === 'up') connectRoomUp(world, room, room.x + (room.w >> 1), routeY, DoorState.LOCKED, 'key');
  else connectRoomDown(world, room, room.x + (room.w >> 1), routeY, DoorState.LOCKED, 'key');
  return room;
}

export function stampPumpAlcove(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  routeY: number,
  side: 'up' | 'down',
): Room {
  const room = stampServiceRoom(world, RoomType.PRODUCTION, x, y, w, h, name, Tex.PIPE, Tex.F_WATER);
  const midX = room.x + (room.w >> 1);
  if (side === 'up') connectRoomUp(world, room, midX, routeY, DoorState.CLOSED);
  else connectRoomDown(world, room, midX, routeY, DoorState.CLOSED);
  return room;
}

export function stampPressureBasin(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  routeY: number,
  side: 'up' | 'down',
): Room {
  const room = stampServiceRoom(world, RoomType.BATHROOM, x, y, w, h, name, Tex.PIPE, Tex.F_WATER);
  const midX = room.x + (room.w >> 1);
  if (side === 'up') connectRoomUp(world, room, midX, routeY, DoorState.CLOSED);
  else connectRoomDown(world, room, midX, routeY, DoorState.CLOSED);
  return room;
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL || world.cells[ci] === Cell.LIFT) return;
  world.features[ci] = feature;
}

export function addDoor(world: World, room: Room, x: number, y: number, state: DoorState, keyId = ''): number {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.DOOR;
  world.wallTex[ci] = room.wallTex;
  world.doors.set(ci, { idx: ci, state, roomA: room.id, roomB: -1, keyId, timer: 0 });
  room.doors.push(ci);
  return ci;
}

export function connectRoomDown(world: World, room: Room, x: number, targetY: number, state: DoorState, keyId = ''): number {
  const doorY = room.y + room.h;
  const doorId = addDoor(world, room, x, doorY, state, keyId);
  for (let y = doorY + 1; y <= targetY; y++) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

export function connectRoomUp(world: World, room: Room, x: number, targetY: number, state: DoorState, keyId = ''): number {
  const doorY = room.y - 1;
  const doorId = addDoor(world, room, x, doorY, state, keyId);
  for (let y = doorY - 1; y >= targetY; y--) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

export function connectRoomLeft(world: World, room: Room, targetX: number, y: number, state: DoorState, keyId = ''): number {
  const doorX = room.x - 1;
  const doorId = addDoor(world, room, doorX, y, state, keyId);
  for (let x = doorX - 1; x >= targetX; x--) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}

export function connectRoomRight(world: World, room: Room, targetX: number, y: number, state: DoorState, keyId = ''): number {
  const doorX = room.x + room.w;
  const doorId = addDoor(world, room, doorX, y, state, keyId);
  for (let x = doorX + 1; x <= targetX; x++) openRouteTile(world, x, y, room.floorTex);
  return doorId;
}


export function dressCorridors(world: World): void {
  for (let x = 438; x < 612; x += 12) {
    setFeature(world, x, 514, x % 24 === 0 ? Feature.SCREEN : Feature.LAMP);
  }
  for (let y = 484; y < 556; y += 10) {
    setFeature(world, 522, y, y % 20 === 0 ? Feature.APPARATUS : Feature.LAMP);
  }
  for (let x = 458; x < 570; x += 16) {
    setFeature(world, x, 505, Feature.APPARATUS);
  }
  for (let x = 480; x < 562; x += 14) {
    setFeature(world, x, 539, Feature.SHELF);
  }
}

export function dressServiceRoutes(world: World, rng: () => number): void {
  for (let x = 268; x <= 756; x += 28) {
    setFeature(world, x, 188, x % 84 === 0 ? Feature.SCREEN : Feature.LAMP);
    setFeature(world, x, 836, x % 84 === 0 ? Feature.APPARATUS : Feature.LAMP);
  }
  for (let y = 224; y <= 804; y += 30) {
    setFeature(world, 244, y, y % 90 === 0 ? Feature.SCREEN : Feature.APPARATUS);
    setFeature(world, 780, y, y % 90 === 0 ? Feature.SCREEN : Feature.APPARATUS);
  }
  for (let x = 280; x <= 748; x += 36) {
    setFeature(world, x, 324, Feature.APPARATUS);
    setFeature(world, x, 700, Feature.SHELF);
  }
  for (let y = 216; y <= 808; y += 44) {
    setFeature(world, 520, y, rng() < 0.55 ? Feature.LAMP : Feature.SCREEN);
  }
}

export function dressLiftMachine(world: World, room: Room): void {
  for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
    setFeature(world, room.x + 2, y, Feature.MACHINE);
    setFeature(world, room.x + room.w - 3, y, Feature.APPARATUS);
  }
  for (let x = room.x + 6; x < room.x + room.w - 4; x += 5) {
    setFeature(world, x, room.y + 2, Feature.SCREEN);
    setFeature(world, x, room.y + room.h - 3, Feature.LAMP);
    stampSurfaceSplat(world, x, room.y + 9, 0.5, 0.5, 0.18, 70, room.id * 53 + x, 30, 30, 35);
  }
  setFeature(world, room.x + 5, room.y + 5, Feature.LIFT_BUTTON);
}

export function dressMachineCore(world: World, room: Room, seedOffset: number): void {
  const shaftX = room.x + (room.w >> 1) - 2;
  for (let y = room.y + 5; y < room.y + room.h - 5; y++) {
    for (let x = shaftX; x < shaftX + 4; x++) {
      const ci = world.idx(x, y);
      if (world.roomMap[ci] !== room.id || world.cells[ci] !== Cell.FLOOR) continue;
      world.cells[ci] = Cell.ABYSS;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.features[ci] = Feature.NONE;
    }
  }
  for (let y = room.y + 3; y < room.y + room.h - 3; y += 4) {
    setFeature(world, room.x + 3, y, Feature.MACHINE);
    setFeature(world, room.x + room.w - 4, y, Feature.APPARATUS);
  }
  for (let x = room.x + 8; x < room.x + room.w - 8; x += 8) {
    setFeature(world, x, room.y + 3, Feature.SCREEN);
    setFeature(world, x, room.y + room.h - 4, Feature.LAMP);
    stampSurfaceSplat(world, x, room.y + (room.h >> 1), 0.5, 0.5, 2.4, 0.18, room.id * 311 + seedOffset * 17 + x, 22, 24, 28);
  }
  setFeature(world, room.x + 5, room.y + 5, Feature.LIFT_BUTTON);
}

export function dressControlBooth(world: World, room: Room): void {
  setFeature(world, room.x + 3, room.y + 3, Feature.DESK);
  setFeature(world, room.x + 4, room.y + 3, Feature.SCREEN);
  setFeature(world, room.x + room.w - 4, room.y + 3, Feature.SCREEN);
  setFeature(world, room.x + 4, room.y + room.h - 4, Feature.SHELF);
  setFeature(world, room.x + room.w - 5, room.y + room.h - 4, Feature.LAMP);
}

export function dressPumpAlcove(world: World, room: Room): void {
  for (let x = room.x + 4; x < room.x + room.w - 4; x++) {
    const ci = world.idx(x, room.y + (room.h >> 1));
    if (world.roomMap[ci] === room.id && world.cells[ci] === Cell.FLOOR) {
      world.cells[ci] = Cell.WATER;
      world.floorTex[ci] = Tex.F_WATER;
    }
  }
  for (let y = room.y + 3; y < room.y + room.h - 3; y += 5) {
    setFeature(world, room.x + 3, y, Feature.MACHINE);
    setFeature(world, room.x + room.w - 4, y, Feature.APPARATUS);
  }
  setFeature(world, room.x + (room.w >> 1), room.y + 3, Feature.SCREEN);
}

export function dressPressureBasin(world: World, room: Room, rng: () => number, basinIndex: number): void {
  const poolTop = room.y + 7;
  const poolBottom = room.y + room.h - 7;
  const poolLeft = room.x + 7;
  const poolRight = room.x + room.w - 8;
  let serial = 0;
  for (let y = poolTop; y <= poolBottom; y++) {
    for (let x = poolLeft; x <= poolRight; x++) {
      const ci = world.idx(x, y);
      if (world.roomMap[ci] !== room.id || world.cells[ci] !== Cell.FLOOR) continue;
      const lip = x === poolLeft || x === poolRight || y === poolTop || y === poolBottom;
      if (lip && ((x + y + basinIndex) & 3) === 0) {
        world.floorTex[ci] = Tex.F_CONCRETE;
        continue;
      }
      world.cells[ci] = Cell.WATER;
      world.floorTex[ci] = Tex.F_WATER;
      if (((serial++ + basinIndex) & 15) === 0) stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.42, 0.2, room.id * 401 + serial, 40, 95, 105);
    }
  }
  for (let x = room.x + 4; x < room.x + room.w - 4; x += 9) {
    setFeature(world, x, room.y + 3, rng() < 0.5 ? Feature.APPARATUS : Feature.SCREEN);
    setFeature(world, x, room.y + room.h - 4, Feature.MACHINE);
  }
  for (let y = room.y + 5; y < room.y + room.h - 5; y += 8) {
    setFeature(world, room.x + 3, y, Feature.SINK);
    setFeature(world, room.x + room.w - 4, y, Feature.APPARATUS);
  }
}

export function dressBreakerRoom(world: World, room: Room): void {
  for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) {
    setFeature(world, x, room.y + 2, Feature.APPARATUS);
    setFeature(world, x, room.y + 5, Feature.SCREEN);
  }
  setFeature(world, room.x + 3, room.y + room.h - 3, Feature.DESK);
  setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.LAMP);
}

export function dressJanitorDepot(world: World, room: Room): void {
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    setFeature(world, room.x + 1, y, Feature.SHELF);
    if (y % 3 === 0) setFeature(world, room.x + room.w - 2, y, Feature.SINK);
  }
  setFeature(world, room.x + 5, room.y + 3, Feature.DESK);
  setFeature(world, room.x + 6, room.y + room.h - 3, Feature.LAMP);
}

export function dressVentJunction(world: World, room: Room): void {
  for (let x = room.x + 3; x < room.x + room.w - 3; x += 4) {
    for (let y = room.y + 3; y < room.y + room.h - 3; y += 4) {
      setFeature(world, x, y, Feature.APPARATUS);
      stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.22, 90, room.id * 97 + x + y, 20, 22, 25);
    }
  }
  setFeature(world, room.x + room.w - 4, room.y + 2, Feature.LAMP);
}

export function dressCanteen(world: World, room: Room): void {
  for (let x = room.x + 4; x < room.x + room.w - 4; x += 7) {
    setFeature(world, x, room.y + 5, Feature.TABLE);
    setFeature(world, x - 1, room.y + 5, Feature.CHAIR);
    setFeature(world, x + 1, room.y + 5, Feature.CHAIR);
  }
  setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
  setFeature(world, room.x + 5, room.y + 2, Feature.SINK);
  setFeature(world, room.x + room.w - 4, room.y + room.h - 4, Feature.LAMP);
}

export function dressClerkOffice(world: World, room: Room): void {
  for (let y = room.y + 2; y < room.y + room.h - 2; y += 3) {
    setFeature(world, room.x + 2, y, Feature.SHELF);
    setFeature(world, room.x + room.w - 3, y, Feature.SCREEN);
  }
  setFeature(world, room.x + 7, room.y + 6, Feature.DESK);
  setFeature(world, room.x + 9, room.y + 6, Feature.CHAIR);
  setFeature(world, room.x + 4, room.y + 2, Feature.LAMP);
}

export function carveDuctBypass(world: World, ax: number, ay: number, bx: number, by: number, floorTex: Tex): void {
  const elbowX = ax;
  const elbowY = by;
  carveServiceRun(world, ax, ay, elbowX, elbowY, 1, floorTex, Tex.DARK);
  carveServiceRun(world, elbowX, elbowY, bx, by, 1, floorTex, Tex.DARK);
  const minX = Math.min(elbowX, bx);
  const maxX = Math.max(elbowX, bx);
  for (let x = minX; x <= maxX; x += 12) setFeature(world, x, by, Feature.APPARATUS);
  const minY = Math.min(ay, elbowY);
  const maxY = Math.max(ay, elbowY);
  for (let y = minY; y <= maxY; y += 14) setFeature(world, ax, y, Feature.SHELF);
}

export function carveCableTrench(world: World, ax: number, ay: number, bx: number, by: number, rng: () => number): void {
  carveServiceRun(world, ax, ay, bx, by, 2, Tex.F_ABYSS, Tex.PIPE);
  if (ax === bx) {
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    for (let y = minY; y <= maxY; y += 22) {
      setFeature(world, ax - 1, y, rng() < 0.5 ? Feature.APPARATUS : Feature.SCREEN);
      stampSurfaceSplat(world, ax, y, 0.5, 0.5, 1.8, 0.14, ax * 997 + y, 18, 20, 24);
    }
  } else {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    for (let x = minX; x <= maxX; x += 24) {
      setFeature(world, x, ay - 1, rng() < 0.5 ? Feature.APPARATUS : Feature.SCREEN);
      stampSurfaceSplat(world, x, ay, 0.5, 0.5, 1.8, 0.14, ay * 991 + x, 18, 20, 24);
    }
  }
}

export function generateServiceZones(world: World, rooms: Room[]): void {
  const zoneSize = W / 8;
  world.zones = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const id = y * 8 + x;
      world.zones.push({
        id,
        cx: Math.floor(x * zoneSize + zoneSize / 2),
        cy: Math.floor(y * zoneSize + zoneSize / 2),
        faction: ZoneFaction.LIQUIDATOR,
        hasLift: false,
        fogged: false,
        level: 3,
        hqRoomId: -1,
      });
    }
  }
  for (let y = 0; y < W; y++) {
    const zy = Math.min(7, Math.floor(y / zoneSize));
    for (let x = 0; x < W; x++) {
      const zx = Math.min(7, Math.floor(x / zoneSize));
      world.zoneMap[y * W + x] = zy * 8 + zx;
      world.factionControl[y * W + x] = ZoneFaction.LIQUIDATOR;
    }
  }
  for (const room of rooms) {
    const zi = world.zoneMap[world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))];
    const zone = world.zones[zi];
    if (!zone) continue;
    zone.hasLift = zone.hasLift || room.name.includes('лифт');
    zone.level = Math.max(zone.level, room.name === VENT_JUNCTION ? 4 : 3);
  }
}

