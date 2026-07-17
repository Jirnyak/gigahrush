import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  Cell,
  EntityType,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type GameState,
  type Room,
  type TerritoryOwner,
  type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS } from '../../data/catalog';
import { Spr } from '../../render/sprite_index';
import { registerCellHazardSite } from '../../systems/cell_hazards';
import { publishEvent } from '../../systems/events';
import {
  placeDoor,
  stampRoom,
} from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { DESIGN_FLOOR_ID, PRODUCTION_BELT_ROUTE_Z, PRODUCTION_BELT_BASE_FLOOR, PRODUCTION_BELT_FACTORY_LINES } from "./meta";
import { ProductionBeltLineState, seedExpandedProductionCaches, stampMachineHazardCues } from "./npcs";

export interface ProductionBeltLineDef {
  id: string;
  factoryId: string;
  roomDefId: string;
  outputTags: readonly string[];
  state: 'repairable' | 'audited' | 'bad_batch';
}

export type ProductionBeltDecisionId =
  | 'repair_metal_line'
  | 'transfer_charge_cells'
  | 'expose_bad_batch'
  | 'steal_bad_batch';

export interface ProductionBeltPipelineDependency {
  id: string;
  fromRouteId: typeof DESIGN_FLOOR_ID;
  toRouteId: 'service_floor' | 'black_market_88' | 'floor_69' | 'living';
  factoryId: string;
  outputTag: string;
  decisionId: ProductionBeltDecisionId;
  clue: string;
}

export interface ProductionBeltRouteState {
  routeId: typeof DESIGN_FLOOR_ID;
  anchorZ: typeof PRODUCTION_BELT_ROUTE_Z;
  lines: ProductionBeltLineState[];
  dependencies: ProductionBeltPipelineDependency[];
  cueIds: string[];
}

export interface ProductionBeltGeneration extends FloorGeneration {
  productionState: ProductionBeltRouteState;
}

export interface ProductionBeltRooms {
  gate: Room;
  corridor: Room;
  foreman: Room;
  lockers: Room;
  metalLine: Room;
  loadingDock: Room;
  shelter: Room;
  chargeLine: Room;
  ammoLine: Room;
  quarantine: Room;
  auditOffice: Room;
  exitDock: Room;
}

export function paintRoom(world: World, room: Room, wallTex: Tex, floorTex: Tex): void {
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
    }
  }
}

export function namedRoom(
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
  paintRoom(world, room, wallTex, floorTex);
  return room;
}

export function buildRooms(world: World): ProductionBeltRooms {
  const corridor = namedRoom(world, RoomType.CORRIDOR, 430, 508, 138, 7, 'Транспортный коридор ленты 14', Tex.METAL, Tex.F_CONCRETE);
  const gate = namedRoom(world, RoomType.COMMON, 414, 508, 15, 7, 'Проходная смены 14', Tex.PANEL, Tex.F_LINO);
  const foreman = namedRoom(world, RoomType.OFFICE, 442, 496, 17, 11, 'Контора нормировщика', Tex.PANEL, Tex.F_LINO);
  const lockers = namedRoom(world, RoomType.STORAGE, 462, 496, 15, 11, 'Шкафчики ремонтной смены', Tex.METAL, Tex.F_CONCRETE);
  const metalLine = namedRoom(world, RoomType.PRODUCTION, 480, 490, 30, 17, PRODUCTION_BELT_FACTORY_LINES[0].roomDefId, Tex.PIPE, Tex.F_CONCRETE);
  const loadingDock = namedRoom(world, RoomType.STORAGE, 514, 496, 22, 11, 'Погрузочная рампа выхода', Tex.METAL, Tex.F_CONCRETE);
  const shelter = namedRoom(world, RoomType.COMMON, 540, 496, 19, 11, 'Комната ожидания смены', Tex.CONCRETE, Tex.F_LINO);
  const chargeLine = namedRoom(world, RoomType.PRODUCTION, 442, 516, 28, 14, PRODUCTION_BELT_FACTORY_LINES[1].roomDefId, Tex.PIPE, Tex.F_CONCRETE);
  const ammoLine = namedRoom(world, RoomType.PRODUCTION, 474, 516, 26, 14, PRODUCTION_BELT_FACTORY_LINES[2].roomDefId, Tex.METAL, Tex.F_CONCRETE);
  const quarantine = namedRoom(world, RoomType.STORAGE, 504, 516, 23, 12, 'Карантин брака: зеленая партия', Tex.ROTTEN, Tex.F_WATER);
  const auditOffice = namedRoom(world, RoomType.OFFICE, 531, 516, 18, 12, 'Пост аудита БОТ-14', Tex.MARBLE, Tex.F_TILE);
  const exitDock = namedRoom(world, RoomType.STORAGE, 569, 508, 17, 7, 'Выходной док подъемников', Tex.METAL, Tex.F_CONCRETE);

  for (const room of [gate, foreman, lockers, metalLine, loadingDock, shelter, chargeLine, ammoLine, quarantine, auditOffice, exitDock]) {
    placeDoor(world, room, corridor, '', false);
  }
  return {
    gate,
    corridor,
    foreman,
    lockers,
    metalLine,
    loadingDock,
    shelter,
    chargeLine,
    ammoLine,
    quarantine,
    auditOffice,
    exitDock,
  };
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
  const i = world.idx(x, y);
  if (world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.WATER) world.features[i] = feature;
}

export function setHazardWater(world: World, x: number, y: number, fog = 120): void {
  const i = world.idx(x, y);
  if (world.cells[i] !== Cell.FLOOR) return;
  world.cells[i] = Cell.WATER;
  world.floorTex[i] = Tex.F_WATER;
  world.fog[i] = fog;
}

export function productionProtectedMask(world: World): Uint8Array {
  const mask = new Uint8Array(W * W);
  for (const room of world.rooms) {
    for (let dy = 0; dy < room.h; dy++) {
      for (let dx = 0; dx < room.w; dx++) {
        mask[world.idx(room.x + dx, room.y + dy)] = 1;
      }
    }
  }
  for (const container of world.containers) mask[world.idx(container.x, container.y)] = 1;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT || world.features[i] === Feature.LIFT_BUTTON) mask[i] = 1;
  }
  return mask;
}

export function rectTouchesMask(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number, margin: number): boolean {
  for (let dy = -margin; dy < h + margin; dy++) {
    for (let dx = -margin; dx < w + margin; dx++) {
      if (mask[world.idx(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

export function carveRectMasked(
  world: World,
  mask: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  roomId: number,
  floorTex: Tex,
): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const i = world.idx(x + dx, y + dy);
      if (mask[i]) continue;
      world.cells[i] = Cell.FLOOR;
      world.roomMap[i] = roomId;
      world.floorTex[i] = floorTex;
    }
  }
}

export function wallRingMasked(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number, wallTex: Tex): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
      const i = world.idx(x + dx, y + dy);
      if (mask[i]) continue;
      if (world.cells[i] === Cell.WALL || world.cells[i] === Cell.ABYSS) {
        world.cells[i] = Cell.WALL;
        world.wallTex[i] = wallTex;
        world.features[i] = Feature.NONE;
      }
    }
  }
}

export function macroRoom(
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
  margin = 2,
): Room | null {
  if (rectTouchesMask(world, mask, x, y, w, h, margin)) return null;
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
    wallTex,
    floorTex,
  };
  world.rooms.push(room);
  carveRectMasked(world, mask, room.x, room.y, w, h, room.id, floorTex);
  wallRingMasked(world, mask, room.x, room.y, w, h, wallTex);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      mask[world.idx(room.x + dx, room.y + dy)] = 1;
    }
  }
  return room;
}

export function macroCorridor(
  world: World,
  mask: Uint8Array,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  floorTex: Tex,
): Room {
  const room: Room = {
    id: world.rooms.length,
    type: RoomType.CORRIDOR,
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
  carveRectMasked(world, mask, room.x, room.y, w, h, room.id, floorTex);
  wallRingMasked(world, mask, room.x, room.y, w, h, Tex.METAL);
  return room;
}

export function connectRoomToLane(world: World, mask: Uint8Array, room: Room, laneY: number, floorTex: Tex): void {
  const cx = room.x + (room.w >> 1);
  if (room.y > laneY) {
    const y = laneY + 5;
    carveRectMasked(world, mask, cx - 1, y, 3, Math.max(1, room.y - y), -1, floorTex);
  } else {
    const y = room.y + room.h;
    carveRectMasked(world, mask, cx - 1, y, 3, Math.max(1, laneY - 4 - y), -1, floorTex);
  }
}

export function placeWallBlock(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number, wallTex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const i = world.idx(x + dx, y + dy);
      if (mask[i] || world.cells[i] !== Cell.FLOOR) continue;
      world.cells[i] = Cell.WALL;
      world.roomMap[i] = -1;
      world.wallTex[i] = wallTex;
      world.features[i] = Feature.NONE;
    }
  }
}

export function dressMachineIsland(world: World, room: Room, rng: () => number): void {
  for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) {
    setFeature(world, x, room.y + 4, Feature.MACHINE);
    setFeature(world, x + 1, room.y + room.h - 5, Feature.APPARATUS);
  }
  setFeature(world, room.x + 3, room.y + room.h - 3, Feature.LAMP);
  setFeature(world, room.x + room.w - 4, room.y + 3, Feature.LAMP);
  if (rng() < 0.55) {
    stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 4 + rng() * 4, 0.16, room.id * 8191, 42, 46, 42, false);
  }
}

export function dressStorageBay(world: World, room: Room, rng: () => number): void {
  for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) setFeature(world, x, room.y + 2, Feature.SHELF);
  for (let y = room.y + 5; y < room.y + room.h - 2; y += 4) setFeature(world, room.x + room.w - 3, y, Feature.SHELF);
  setFeature(world, room.x + 3, room.y + room.h - 3, Feature.LAMP);
  if (rng() < 0.35) setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), Feature.TABLE);
}

export function dressLoadingDock(world: World, room: Room): void {
  for (let x = room.x + 3; x < room.x + room.w - 3; x += 5) setFeature(world, x, room.y + room.h - 4, Feature.SHELF);
  setFeature(world, room.x + 4, room.y + 4, Feature.DESK);
  setFeature(world, room.x + room.w - 5, room.y + 4, Feature.LAMP);
}

export function dressShiftGate(world: World, room: Room): void {
  setFeature(world, room.x + 2, room.y + 2, Feature.SCREEN);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.DESK);
  setFeature(world, room.x + 2, room.y + room.h - 3, Feature.LAMP);
}

export function dressScrapPocket(world: World, room: Room, rng: () => number): void {
  setFeature(world, room.x + 3, room.y + 3, Feature.SHELF);
  setFeature(world, room.x + room.w - 4, room.y + 3, Feature.MACHINE);
  for (let i = 0; i < 3; i++) {
    setHazardWater(world, room.x + 4 + Math.floor(rng() * Math.max(1, room.w - 8)), room.y + 5 + Math.floor(rng() * Math.max(1, room.h - 8)), 135);
  }
}

export function addDockLoop(world: World, mask: Uint8Array, x: number, y: number, w: number, h: number, name: string): void {
  macroCorridor(world, mask, x, y, w, 5, `${name}: верхняя рампа`, Tex.F_CONCRETE);
  macroCorridor(world, mask, x, y + h - 5, w, 5, `${name}: нижняя рампа`, Tex.F_CONCRETE);
  macroCorridor(world, mask, x, y, 5, h, `${name}: левый разворот`, Tex.F_CONCRETE);
  macroCorridor(world, mask, x + w - 5, y, 5, h, `${name}: правый разворот`, Tex.F_CONCRETE);
}

export function addLaneBlockages(world: World, mask: Uint8Array, laneY: number, xStart: number, xEnd: number, rng: () => number): void {
  for (let x = xStart + 46; x < xEnd - 24; x += 82) {
    if (x > 368 && x < 642 && laneY > 470 && laneY < 552) continue;
    if (rng() < 0.55) placeWallBlock(world, mask, x, laneY - 1, 4, 3, Tex.METAL);
    setFeature(world, x + 7, laneY - 3, Feature.MACHINE);
    setFeature(world, x + 9, laneY + 3, Feature.APPARATUS);
  }
}

export function addSideRoomsForLane(world: World, mask: Uint8Array, laneY: number, row: number, rng: () => number): void {
  const xs = [108, 210, 312, 608, 710, 812];
  for (let n = 0; n < xs.length; n++) {
    const top = (row + n) % 2 === 0;
    const w = 22 + Math.floor(rng() * 12);
    const h = 13 + Math.floor(rng() * 8);
    const x = xs[n] + Math.floor(rng() * 18);
    const y = top ? laneY - h - 15 : laneY + 14;
    const motif = (row + n) % 4;
    const room = macroRoom(
      world,
      mask,
      motif === 0 ? RoomType.PRODUCTION : motif === 1 ? RoomType.STORAGE : motif === 2 ? RoomType.HQ : RoomType.STORAGE,
      x,
      y,
      w,
      h,
      motif === 0 ? 'Безопасный машинный остров ленты 14' : motif === 1 ? 'Складская ячейка ленты 14' : motif === 2 ? 'Пост охраны смены 14' : 'Карман лома у ленты',
      motif === 2 ? Tex.PANEL : Tex.METAL,
      motif === 2 ? Tex.F_LINO : Tex.F_CONCRETE,
    );
    if (!room) continue;
    connectRoomToLane(world, mask, room, laneY, Tex.F_CONCRETE);
    if (motif === 0) dressMachineIsland(world, room, rng);
    else if (motif === 1) dressStorageBay(world, room, rng);
    else if (motif === 2) dressShiftGate(world, room);
    else dressScrapPocket(world, room, rng);
  }
}

export function addShiftGate(world: World, mask: Uint8Array, x: number, y: number): void {
  const room = macroRoom(world, mask, RoomType.COMMON, x - 7, y - 5, 14, 10, 'Сменный турникет ленты 14', Tex.PANEL, Tex.F_LINO, 1);
  if (room) dressShiftGate(world, room);
}

export function addCatwalkBypass(world: World, mask: Uint8Array, x: number, y0: number, y1: number, name: string): void {
  macroCorridor(world, mask, x - 1, y0, 3, y1 - y0, name, Tex.F_TILE);
  macroCorridor(world, mask, x - 58, y0 + 124, 58, 3, `${name}: перемычка`, Tex.F_TILE);
  macroCorridor(world, mask, x, y0 + 352, 58, 3, `${name}: дальняя перемычка`, Tex.F_TILE);
  for (let y = y0 + 42; y < y1 - 28; y += 96) {
    setFeature(world, x, y, Feature.LAMP);
    if (y % 192 === 0) setFeature(world, x, y + 3, Feature.APPARATUS);
  }
}

export function dressSupportRoom(world: World, room: Room, rng: () => number): void {
  switch (room.type) {
    case RoomType.PRODUCTION:
      dressMachineIsland(world, room, rng);
      break;
    case RoomType.STORAGE:
      dressStorageBay(world, room, rng);
      break;
    case RoomType.KITCHEN:
      setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
      setFeature(world, room.x + 4, room.y + 2, Feature.SINK);
      setFeature(world, room.x + Math.max(5, room.w - 4), room.y + Math.max(4, room.h - 3), Feature.TABLE);
      break;
    case RoomType.BATHROOM:
      setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
      setFeature(world, room.x + Math.max(4, room.w - 3), room.y + Math.max(3, room.h - 3), Feature.TOILET);
      break;
    case RoomType.MEDICAL:
      setFeature(world, room.x + 2, room.y + 2, Feature.APPARATUS);
      setFeature(world, room.x + Math.max(5, room.w - 4), room.y + 2, Feature.DESK);
      setFeature(world, room.x + 3, room.y + Math.max(4, room.h - 3), Feature.LAMP);
      break;
    case RoomType.OFFICE:
      setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
      setFeature(world, room.x + Math.max(5, room.w - 4), room.y + 2, Feature.SCREEN);
      setFeature(world, room.x + 3, room.y + Math.max(4, room.h - 3), Feature.SHELF);
      break;
    case RoomType.COMMON:
      setFeature(world, room.x + 2, room.y + 2, Feature.TABLE);
      setFeature(world, room.x + 4, room.y + 2, Feature.CHAIR);
      setFeature(world, room.x + Math.max(5, room.w - 4), room.y + Math.max(4, room.h - 3), Feature.LAMP);
      break;
    case RoomType.HQ:
      dressShiftGate(world, room);
      break;
  }
}

export function connectSupportRoom(world: World, room: Room | null, corridor: Room | null): Room | null {
  if (!room || !corridor) return room;
  placeDoor(world, room, corridor, '', false);
  return room;
}

export function paintOwnedRoom(world: World, room: Room | null, owner: TerritoryOwner, level: number): void {
  if (!room) return;
  applyZoneRole(world, room, owner, level);
}

export interface ProductionBeltHqSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  title: string;
  floorTex: Tex;
  wallTex: Tex;
  laneY: number;
  strong?: boolean;
}

export function addFactionHqCluster(world: World, mask: Uint8Array, spec: ProductionBeltHqSpec, rng: () => number): void {
  const corridor = macroCorridor(world, mask, spec.x + 8, spec.y + 18, spec.strong ? 118 : 96, 5, `${spec.title}: внутренний коридор`, spec.floorTex);
  const hq = macroRoom(world, mask, RoomType.HQ, spec.x + 38, spec.y + 4, spec.strong ? 28 : 22, 13, `${spec.title}: гермоядро`, Tex.HERMO_WALL, Tex.F_LINO, 0);
  const storage = macroRoom(world, mask, RoomType.STORAGE, spec.x + 8, spec.y + 5, 20, 12, `${spec.title}: склад и пломбы`, spec.wallTex, Tex.F_CONCRETE, 0);
  const office = macroRoom(world, mask, spec.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.OFFICE, spec.x + 72, spec.y + 5, spec.strong ? 24 : 20, 12, `${spec.title}: учетный пост`, spec.wallTex, spec.floorTex, 0);
  const kitchen = macroRoom(world, mask, spec.owner === ZoneFaction.WILD ? RoomType.COMMON : RoomType.KITCHEN, spec.x + 8, spec.y + 24, 22, 12, `${spec.title}: бытовка`, spec.wallTex, Tex.F_LINO, 0);
  const bathroom = macroRoom(world, mask, RoomType.BATHROOM, spec.x + 35, spec.y + 24, 13, 10, `${spec.title}: санузел`, Tex.CONCRETE, Tex.F_TILE, 0);
  const workshop = macroRoom(world, mask, spec.owner === ZoneFaction.CITIZEN ? RoomType.PRODUCTION : RoomType.STORAGE, spec.x + 58, spec.y + 24, spec.strong ? 38 : 30, 12, `${spec.title}: мастерская поддержки`, spec.wallTex, Tex.F_CONCRETE, 0);
  const extraPost = spec.strong
    ? macroRoom(world, mask, RoomType.HQ, spec.x + 100, spec.y + 5, 20, 12, `${spec.title}: внешний кордон`, Tex.HERMO_WALL, Tex.F_LINO, 0)
    : null;
  const laneFrom = Math.min(spec.laneY, spec.y + 16);
  const laneTo = Math.max(spec.laneY, spec.y + 24);
  const spur = macroCorridor(world, mask, spec.x + 54, laneFrom, 5, Math.max(5, laneTo - laneFrom), `${spec.title}: связь с лентой`, Tex.F_TILE);
  markConveyorSpine(world, spec.x + 56, laneFrom, spec.x + 56, laneTo, spec.x + spec.y + spec.owner * 23);

  for (const room of [hq, storage, office, kitchen, bathroom, workshop, extraPost]) {
    connectSupportRoom(world, room, corridor);
    if (room) dressSupportRoom(world, room, rng);
    paintOwnedRoom(world, room, spec.owner, spec.strong ? 4 : 3);
  }
  connectSupportRoom(world, corridor, spur);
  paintOwnedRoom(world, corridor, spec.owner, spec.strong ? 4 : 3);
  paintOwnedRoom(world, spur, spec.owner, spec.strong ? 4 : 3);
}

export interface ProductionBeltBaySpec {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  serial: number;
}

export function bayRoomType(serial: number): RoomType {
  switch (serial % 9) {
    case 0: return RoomType.PRODUCTION;
    case 1: return RoomType.STORAGE;
    case 2: return RoomType.OFFICE;
    case 3: return RoomType.BATHROOM;
    case 4: return RoomType.KITCHEN;
    case 5: return RoomType.COMMON;
    case 6: return RoomType.MEDICAL;
    default: return RoomType.STORAGE;
  }
}

export function bayRoomName(type: RoomType, name: string, serial: number, micro: boolean): string {
  const prefix = micro ? 'микроузел' : 'ячейка';
  switch (type) {
    case RoomType.PRODUCTION: return `${name}: ${prefix} станка ${serial}`;
    case RoomType.STORAGE: return `${name}: ${prefix} тары ${serial}`;
    case RoomType.OFFICE: return `${name}: ${prefix} учета ${serial}`;
    case RoomType.BATHROOM: return `${name}: ${prefix} санобработки ${serial}`;
    case RoomType.KITCHEN: return `${name}: ${prefix} пайка ${serial}`;
    case RoomType.COMMON: return `${name}: ${prefix} ожидания ${serial}`;
    case RoomType.MEDICAL: return `${name}: ${prefix} травмпункта ${serial}`;
    default: return `${name}: ${prefix} ${serial}`;
  }
}

export function addProductionBayCell(world: World, mask: Uint8Array, spec: ProductionBeltBaySpec, rng: () => number): void {
  const axisY = spec.y + Math.floor(spec.h / 2) - 2;
  const axis = macroCorridor(world, mask, spec.x + 8, axisY, Math.max(24, spec.w - 16), 5, `${spec.name}: осевой проход`, Tex.F_CONCRETE);
  const spurX = spec.x + Math.floor(spec.w / 2) - 2;
  const spur = macroCorridor(world, mask, spurX, spec.y, 5, spec.h, `${spec.name}: вертикальная подача`, Tex.F_TILE);
  markConveyorSpine(world, spec.x + 8, axisY + 2, spec.x + spec.w - 8, axisY + 2, spec.serial * 11 + 3);
  markConveyorSpine(world, spurX + 2, spec.y + 2, spurX + 2, spec.y + spec.h - 2, spec.serial * 13 + 7);

  const columns = Math.max(4, Math.floor((spec.w - 34) / 32));
  const step = (spec.w - 34) / columns;
  for (let c = 0; c < columns; c++) {
    const baseX = Math.floor(spec.x + 14 + c * step);
    for (let side = 0; side < 2; side++) {
      const serial = spec.serial * 100 + c * 2 + side;
      const type = bayRoomType(serial);
      const rw = Math.min(24, Math.max(11, Math.floor(step) - 4 + Math.floor(rng() * 5)));
      const rh = 8 + Math.floor(rng() * 6);
      const rx = baseX + Math.floor(rng() * 3);
      const ry = side === 0 ? axisY - rh - 1 : axisY + 6;
      const room = macroRoom(world, mask, type, rx, ry, rw, rh, bayRoomName(type, spec.name, serial, false), type === RoomType.PRODUCTION ? Tex.PIPE : Tex.METAL, type === RoomType.BATHROOM ? Tex.F_TILE : Tex.F_CONCRETE, 0);
      connectSupportRoom(world, room, axis);
      if (room) dressSupportRoom(world, room, rng);
    }
  }

  const microRows = Math.max(4, Math.floor((spec.h - 20) / 22));
  for (let r = 0; r < microRows; r++) {
    const serial = spec.serial * 1000 + r;
    const type = bayRoomType(serial + 5);
    const rw = 7 + (serial % 4);
    const rh = 6 + ((serial >> 2) % 3);
    const ry = spec.y + 10 + r * 22;
    const leftRoom = macroRoom(world, mask, type, spurX - rw - 1, ry, rw, rh, bayRoomName(type, spec.name, serial, true), Tex.PANEL, type === RoomType.BATHROOM ? Tex.F_TILE : Tex.F_LINO, 0);
    const rightRoom = macroRoom(world, mask, bayRoomType(serial + 2), spurX + 6, ry + 8, rw + 2, rh, bayRoomName(bayRoomType(serial + 2), spec.name, serial + 1, true), Tex.PANEL, Tex.F_LINO, 0);
    connectSupportRoom(world, leftRoom, spur);
    connectSupportRoom(world, rightRoom, spur);
    if (leftRoom) dressSupportRoom(world, leftRoom, rng);
    if (rightRoom) dressSupportRoom(world, rightRoom, rng);
  }
}

export function productionBeltAuthoredOwner(roomDefId: string): TerritoryOwner | undefined {
  if (roomDefId.startsWith('Гражданский миништаб смены 14:')) return ZoneFaction.CITIZEN;
  if (roomDefId.startsWith('Ликвидаторский штаб ленты 14:')) return ZoneFaction.LIQUIDATOR;
  if (roomDefId.startsWith('Скрытый культовый миништаб:')) return ZoneFaction.CULTIST;
  if (roomDefId.startsWith('Научный миништаб контроля брака:')) return ZoneFaction.SCIENTIST;
  if (roomDefId.startsWith('Дикий миништаб ночной тары:')) return ZoneFaction.WILD;
  return undefined;
}

export function hardenProductionBeltHqRoom(world: World, room: Room, owner: TerritoryOwner): void {
  room.type = RoomType.HQ;
  room.sealed = true;
  room.wallTex = Tex.HERMO_WALL;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      const interior = dx >= 0 && dx < room.w && dy >= 0 && dy < room.h;
      if (interior) {
        if (world.roomMap[idx] === room.id) {
          world.factionControl[idx] = owner;
          if (world.features[idx] === Feature.NONE && ((dx * 13 + dy * 29 + owner) % 17) === 0) {
            world.features[idx] = Feature.DESK;
          }
        }
        continue;
      }
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) continue;
      world.hermoWall[idx] = 1;
      world.wallTex[idx] = Tex.HERMO_WALL;
    }
  }
}

export function reinforceProductionBeltAuthoredHqTerritory(world: World): void {
  for (const room of world.rooms) {
    const owner = productionBeltAuthoredOwner(room.name);
    if (owner === undefined) continue;
    paintOwnedRoom(world, room, owner, owner === ZoneFaction.LIQUIDATOR ? 4 : 3);
    if (room.type === RoomType.HQ) hardenProductionBeltHqRoom(world, room, owner);
  }
  world.markWallTexDirty();
  world.markFeaturesDirty(false);
}

export function isRoom(room: Room | null): room is Room {
  return room !== null;
}

export function expandProductionBeltGeometry(world: World, rng: () => number): void {
  const mask = productionProtectedMask(world);
  const laneYs = [150, 274, 398, 626, 750, 874];

  macroCorridor(world, mask, 72, 508, 342, 7, 'Левая подача проходной 14', Tex.F_CONCRETE);
  macroCorridor(world, mask, 586, 508, 366, 7, 'Правая выдача проходной 14', Tex.F_CONCRETE);
  markConveyorSpine(world, 72, 511, 414, 511, 1);
  markConveyorSpine(world, 586, 511, 952, 511, 2);

  for (let i = 0; i < laneYs.length; i++) {
    const y = laneYs[i];
    macroCorridor(world, mask, 56, y - 4, 912, 9, i % 2 === 0 ? 'Главный конвейерный пролет' : 'Обратная линия погрузки', Tex.F_CONCRETE);
    markConveyorSpine(world, 56, y, 968, y, 10 + i);
  }

  for (const x of [128, 320, 704, 896]) {
    macroCorridor(world, mask, x - 2, 146, 5, 732, 'Вертикальный подъемник тары', Tex.F_CONCRETE);
    markConveyorSpine(world, x, 146, x, 878, 40 + x);
  }

  addDockLoop(world, mask, 82, 204, 204, 214, 'Западная погрузочная петля');
  addDockLoop(world, mask, 738, 204, 204, 214, 'Восточная погрузочная петля');
  addDockLoop(world, mask, 82, 584, 204, 214, 'Нижняя петля грязной тары');
  addDockLoop(world, mask, 738, 584, 204, 214, 'Нижняя петля выдачи');

  addCatwalkBypass(world, mask, 382, 150, 876, 'Левый ремонтный мостик');
  addCatwalkBypass(world, mask, 642, 150, 876, 'Правый ремонтный мостик');

  for (const spec of [
    { owner: ZoneFaction.CITIZEN, x: 182, y: 82, title: 'Гражданский миништаб смены 14', floorTex: Tex.F_LINO, wallTex: Tex.PANEL, laneY: 150 },
    { owner: ZoneFaction.LIQUIDATOR, x: 442, y: 562, title: 'Ликвидаторский штаб ленты 14', floorTex: Tex.F_LINO, wallTex: Tex.METAL, laneY: 626, strong: true },
    { owner: ZoneFaction.CULTIST, x: 162, y: 910, title: 'Скрытый культовый миништаб', floorTex: Tex.F_LINO, wallTex: Tex.ROTTEN, laneY: 874 },
    { owner: ZoneFaction.SCIENTIST, x: 724, y: 82, title: 'Научный миништаб контроля брака', floorTex: Tex.F_TILE, wallTex: Tex.PANEL, laneY: 150 },
    { owner: ZoneFaction.WILD, x: 728, y: 910, title: 'Дикий миништаб ночной тары', floorTex: Tex.F_CONCRETE, wallTex: Tex.ROTTEN, laneY: 874 },
  ] as const) {
    addFactionHqCluster(world, mask, spec, rng);
  }

  for (const spec of [
    { x: 372, y: 176, w: 226, h: 86, name: 'Верхний сортировочный бай', serial: 1 },
    { x: 372, y: 300, w: 226, h: 86, name: 'Бай холодной приемки', serial: 2 },
    { x: 150, y: 430, w: 248, h: 168, name: 'Западный ремонтный остров', serial: 3 },
    { x: 626, y: 430, w: 248, h: 168, name: 'Восточный ревизионный остров', serial: 4 },
    { x: 372, y: 654, w: 226, h: 86, name: 'Бай обратной выдачи', serial: 5 },
    { x: 372, y: 778, w: 226, h: 86, name: 'Нижний бай грязной тары', serial: 6 },
  ] as const) {
    addProductionBayCell(world, mask, spec, rng);
  }

  for (let i = 0; i < laneYs.length; i++) {
    addLaneBlockages(world, mask, laneYs[i], 56, 968, rng);
    addSideRoomsForLane(world, mask, laneYs[i], i, rng);
  }
  for (const x of [128, 320, 704, 896]) {
    for (const y of [274, 398, 626, 750]) addShiftGate(world, mask, x, y);
  }

  const loadingRooms = [
    macroRoom(world, mask, RoomType.STORAGE, 116, 226, 58, 28, 'Док ручной приемки', Tex.METAL, Tex.F_CONCRETE),
    macroRoom(world, mask, RoomType.STORAGE, 850, 226, 58, 28, 'Док опломбированной выдачи', Tex.METAL, Tex.F_CONCRETE),
    macroRoom(world, mask, RoomType.STORAGE, 116, 698, 58, 28, 'Док возврата брака', Tex.METAL, Tex.F_CONCRETE),
    macroRoom(world, mask, RoomType.STORAGE, 850, 698, 58, 28, 'Док ночной погрузки', Tex.METAL, Tex.F_CONCRETE),
  ];
  for (const room of loadingRooms) if (room) dressLoadingDock(world, room);

  for (const spec of [
    { x: 104, y: 226, w: 170, h: 166, name: 'Западный двор ручной приемки', serial: 21 },
    { x: 760, y: 226, w: 170, h: 166, name: 'Восточный двор пломбированной выдачи', serial: 22 },
    { x: 104, y: 606, w: 170, h: 166, name: 'Двор возврата брака', serial: 23 },
    { x: 760, y: 606, w: 170, h: 166, name: 'Двор ночной погрузки', serial: 24 },
  ] as const) {
    addProductionBayCell(world, mask, spec, rng);
  }

  const hazardRooms: Room[] = [];
  for (const spec of [
    { x: 344, y: 206 }, { x: 654, y: 326 }, { x: 344, y: 682 }, { x: 654, y: 806 },
  ]) {
    const room = macroRoom(world, mask, RoomType.STORAGE, spec.x, spec.y, 24, 16, 'Опасный карман ремонта', Tex.ROTTEN, Tex.F_CONCRETE);
    if (room) {
      dressScrapPocket(world, room, rng);
      hazardRooms.push(room);
    }
  }

  seedExpandedProductionCaches(world, loadingRooms.filter(isRoom), hazardRooms);
  const machineRooms = world.rooms.filter(room =>
    room.type === RoomType.PRODUCTION ||
    room.name.includes('Опасный карман') ||
    room.name.includes('Безопасный машинный остров')
  );
  registerProductionMachineHazards(world, machineRooms, 14);
  world.markFogDirty();
}

export function decorateLineRooms(world: World, rooms: ProductionBeltRooms): void {
  for (let dx = 2; dx < rooms.metalLine.w - 3; dx += 4) {
    setFeature(world, rooms.metalLine.x + dx, rooms.metalLine.y + 4, Feature.MACHINE);
    setFeature(world, rooms.metalLine.x + dx + 1, rooms.metalLine.y + 8, Feature.APPARATUS);
  }
  setFeature(world, rooms.metalLine.x + 4, rooms.metalLine.y + 12, Feature.LAMP);
  setFeature(world, rooms.metalLine.x + 17, rooms.metalLine.y + 12, Feature.LAMP);
  setFeature(world, rooms.metalLine.x + 25, rooms.metalLine.y + 4, Feature.SHELF);

  for (let dx = 2; dx < rooms.chargeLine.w - 3; dx += 3) {
    setFeature(world, rooms.chargeLine.x + dx, rooms.chargeLine.y + 3, Feature.APPARATUS);
    setFeature(world, rooms.chargeLine.x + dx, rooms.chargeLine.y + 8, Feature.MACHINE);
  }
  setFeature(world, rooms.chargeLine.x + 6, rooms.chargeLine.y + 6, Feature.LAMP);
  setFeature(world, rooms.chargeLine.x + 19, rooms.chargeLine.y + 6, Feature.LAMP);
  setHazardWater(world, rooms.chargeLine.x + 2, rooms.chargeLine.y + rooms.chargeLine.h - 2, 90);
  setHazardWater(world, rooms.chargeLine.x + 3, rooms.chargeLine.y + rooms.chargeLine.h - 2, 90);

  for (let dx = 2; dx < rooms.ammoLine.w - 2; dx += 4) {
    setFeature(world, rooms.ammoLine.x + dx, rooms.ammoLine.y + 3, Feature.MACHINE);
    setFeature(world, rooms.ammoLine.x + dx, rooms.ammoLine.y + 9, Feature.APPARATUS);
  }
  setFeature(world, rooms.ammoLine.x + 4, rooms.ammoLine.y + 6, Feature.LAMP);
  setFeature(world, rooms.ammoLine.x + 18, rooms.ammoLine.y + 6, Feature.LAMP);

  for (let dx = 2; dx < rooms.quarantine.w - 2; dx += 3) {
    setHazardWater(world, rooms.quarantine.x + dx, rooms.quarantine.y + 4, 160);
    setHazardWater(world, rooms.quarantine.x + dx, rooms.quarantine.y + 5, 180);
  }
  setFeature(world, rooms.quarantine.x + 3, rooms.quarantine.y + 2, Feature.APPARATUS);
  setFeature(world, rooms.quarantine.x + 17, rooms.quarantine.y + 2, Feature.SHELF);
  setFeature(world, rooms.quarantine.x + 10, rooms.quarantine.y + 9, Feature.LAMP);
  world.markFogDirty();

  for (let dx = 2; dx < rooms.loadingDock.w - 2; dx += 4) setFeature(world, rooms.loadingDock.x + dx, rooms.loadingDock.y + 5, Feature.SHELF);
  for (let dx = 2; dx < rooms.lockers.w - 2; dx += 3) setFeature(world, rooms.lockers.x + dx, rooms.lockers.y + 5, Feature.SHELF);
  setFeature(world, rooms.foreman.x + 3, rooms.foreman.y + 4, Feature.DESK);
  setFeature(world, rooms.foreman.x + 10, rooms.foreman.y + 4, Feature.SHELF);
  setFeature(world, rooms.foreman.x + 8, rooms.foreman.y + 8, Feature.LAMP);
  setFeature(world, rooms.auditOffice.x + 3, rooms.auditOffice.y + 4, Feature.DESK);
  setFeature(world, rooms.auditOffice.x + 9, rooms.auditOffice.y + 4, Feature.APPARATUS);
  setFeature(world, rooms.auditOffice.x + 12, rooms.auditOffice.y + 8, Feature.LAMP);
  setFeature(world, rooms.gate.x + 4, rooms.gate.y + 3, Feature.TABLE);
  setFeature(world, rooms.gate.x + 8, rooms.gate.y + 3, Feature.CHAIR);
  setFeature(world, rooms.gate.x + 11, rooms.gate.y + 3, Feature.LAMP);
  setFeature(world, rooms.shelter.x + 4, rooms.shelter.y + 4, Feature.TABLE);
  setFeature(world, rooms.shelter.x + 8, rooms.shelter.y + 4, Feature.CHAIR);
  setFeature(world, rooms.shelter.x + 13, rooms.shelter.y + 4, Feature.LAMP);
}

export function roomCell(world: World, room: Room, salt: number): { x: number; y: number } {
  const iw = Math.max(1, room.w - 2);
  const ih = Math.max(1, room.h - 2);
  for (let a = 0; a < Math.max(8, room.w * room.h); a++) {
    const x = world.wrap(room.x + 1 + ((salt * 5 + a * 3) % iw));
    const y = world.wrap(room.y + 1 + ((salt * 7 + a * 5) % ih));
    const i = world.idx(x, y);
    if (world.roomMap[i] === room.id && (world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.WATER)) return { x, y };
  }
  return { x: world.wrap(room.x + Math.floor(room.w / 2)), y: world.wrap(room.y + Math.floor(room.h / 2)) };
}

export function cloneInventory(items: readonly { defId: string; count: number }[]): { defId: string; count: number }[] {
  return items.filter(i => !!ITEMS[i.defId]).map(i => ({ defId: i.defId, count: i.count }));
}

export function roomCellForActor(room: Room, salt: number): { x: number; y: number } {
  const iw = Math.max(1, room.w - 2);
  const ih = Math.max(1, room.h - 2);
  return {
    x: room.x + 1 + ((salt * 5) % iw) + 0.5,
    y: room.y + 1 + ((salt * 7) % ih) + 0.5,
  };
}

export function dropItems(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  itemIds: readonly string[],
): void {
  for (let n = 0; n < itemIds.length; n++) {
    const defId = itemIds[n];
    if (!ITEMS[defId]) continue;
    const pos = roomCell(world, room, n + 3);
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

export function uniqueTags(tags: readonly string[]): string[] {
  return tags.filter((tag, idx, all) => all.indexOf(tag) === idx);
}

export function applyZoneRole(world: World, room: Room, faction: ZoneFaction, level: number): void {
  const zi = world.zoneMap[world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2))];
  const zone = world.zones[zi];
  if (zone) {
    zone.faction = faction;
    zone.level = Math.max(zone.level, level);
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.factionControl[world.idx(room.x + dx, room.y + dy)] = faction;
    }
  }
}

export function isPassableHazardCell(world: World, cell: number, roomId: number): boolean {
  return world.roomMap[cell] === roomId &&
    (world.cells[cell] === Cell.FLOOR || world.cells[cell] === Cell.WATER) &&
    world.features[cell] !== Feature.LIFT_BUTTON &&
    !world.containerMap.has(cell);
}

export function collectMachineFieldCells(world: World, room: Room, radius: number): number[] {
  const cells: number[] = [];
  const seen = new Set<number>();
  const r2 = radius * radius;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const x = room.x + dx;
      const y = room.y + dy;
      const feature = world.features[world.idx(x, y)];
      if (feature !== Feature.MACHINE && feature !== Feature.APPARATUS) continue;
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          const d2 = ox * ox + oy * oy;
          if (d2 > r2) continue;
          const cell = world.idx(x + ox, y + oy);
          if (seen.has(cell) || !isPassableHazardCell(world, cell, room.id)) continue;
          seen.add(cell);
          cells.push(cell);
        }
      }
    }
  }
  return cells;
}

export function registerMachineHazardSite(world: World, room: Room, serial: number): boolean {
  const cells = collectMachineFieldCells(world, room, room.type === RoomType.PRODUCTION ? 2 : 1);
  if (cells.length < 6) return false;
  stampMachineHazardCues(world, cells, room.id * 9109 + serial * 131);
  const center = cells[Math.floor(cells.length / 2)];
  const cx = center % W;
  const cy = (center / W) | 0;
  const zoneId = world.zoneMap[center];
  registerCellHazardSite(world, {
    id: `production_belt_machine_field_${room.id}`,
    kind: 'production_machine_field',
    displayName: 'Опасная зона станка',
    cells,
    tags: ['production_belt', 'machine_hazard', 'industrial', 'static_field'],
    sticky: false,
    cleanable: false,
    slowMult: 0.72,
    activeFog: 54,
    playerDamagePerSecond: room.type === RoomType.PRODUCTION ? 0.08 : 0,
    monsterDamagePerSecond: 0.35,
    messageCooldownSeconds: 3.2,
    roomId: room.id,
    zoneId: zoneId >= 0 ? zoneId : undefined,
    centerX: cx + 0.5,
    centerY: cy + 0.5,
    warning: 'Станочная зона тянет одежду и сбивает шаг. Идите по освещенной кромке или через ремонтный мостик.',
    warningColor: '#fd6',
  });
  return true;
}

export function registerProductionMachineHazards(world: World, rooms: readonly Room[], limit: number): number {
  let registered = 0;
  for (const room of rooms) {
    if (registered >= limit) break;
    if (registerMachineHazardSite(world, room, registered)) registered++;
  }
  return registered;
}

export function markConveyorSpine(world: World, x0: number, y0: number, x1: number, y1: number, serial: number): void {
  const horizontal = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  if (horizontal) {
    const y = world.wrap(y0);
    const from = Math.min(x0, x1);
    const to = Math.max(x0, x1);
    for (let x = from; x <= to; x++) {
      const i = world.idx(x, y);
      if (world.cells[i] !== Cell.FLOOR) continue;
      world.floorTex[i] = Tex.F_TILE;
      if ((x + serial) % 37 === 0) stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.18, 0.44, serial * 7919 + x, 180, 150, 70, false);
    }
    return;
  }
  const x = world.wrap(x0);
  const from = Math.min(y0, y1);
  const to = Math.max(y0, y1);
  for (let y = from; y <= to; y++) {
    const i = world.idx(x, y);
    if (world.cells[i] !== Cell.FLOOR) continue;
    world.floorTex[i] = Tex.F_TILE;
    if ((y + serial) % 37 === 0) stampSurfaceSplat(world, x, y, 0.5, 0.5, 0.18, 0.44, serial * 7919 + y, 180, 150, 70, false);
  }
}

export function publishProductionBeltDecision(
  game: GameState,
  world: World,
  actor: Entity,
  routeState: ProductionBeltRouteState,
  decisionId: ProductionBeltDecisionId,
): WorldEvent {
  const dependencies = routeState.dependencies.filter(dep => dep.decisionId === decisionId);
  const line = routeState.lines.find(l => dependencies.some(dep => dep.factoryId === l.factoryId)) ?? routeState.lines[0];
  const px = Math.floor(actor.x);
  const py = Math.floor(actor.y);
  const zoneId = world.zoneMap[world.idx(px, py)];
  const badBatch = decisionId === 'expose_bad_batch' || decisionId === 'steal_bad_batch';
  return publishEvent(game, {
    type: badBatch ? 'room_blocked_production' : 'room_produced_items',
    z: PRODUCTION_BELT_BASE_FLOOR,
    zoneId: zoneId >= 0 ? zoneId : undefined,
    roomId: line?.roomId,
    containerId: line?.outputContainerId,
    actorId: actor.id,
    actorName: actor.name,
    actorFaction: actor.faction,
    severity: badBatch ? 4 : 3,
    privacy: decisionId === 'steal_bad_batch' ? 'secret' : 'local',
    tags: ['production_belt', 'pipeline', decisionId, ...dependencies.map(dep => dep.toRouteId)],
    data: {
      routeId: routeState.routeId,
      z: routeState.anchorZ,
      decisionId,
      dependencyIds: dependencies.map(dep => dep.id),
      factoryIds: dependencies.map(dep => dep.factoryId),
      outputContainerId: line?.outputContainerId,
    },
  });
}

