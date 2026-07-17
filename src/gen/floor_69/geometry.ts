import { rng, withSeededRandom } from '../../core/rand';
import { applyDesignFloorPopulationField } from '../design_floors/population';
/* -- Design floor 69: adult vice, debt, blackmail and refuge ---- */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  AIGoal, Cell, ContainerKind, DoorState, EntityType, Faction, Feature,
  LiftDirection, Occupation, QuestType, RoomType, Tex, ZoneFaction,
  W, type ContainerAccess, type Entity, type Room, type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { designFloorProfile, FLOOR_69_WORKER_ROLE_ID } from '../../data/design_floor_profiles';
import { designNpcFloorKey, type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { NPC_VISUAL_FLOOR69_FEMALE } from '../../entities/npc_visuals';
import { Spr } from '../../render/sprite_index';
import { registerRouteCue } from '../../systems/route_cues';
import { calcZoneLevel } from '../../systems/rpg';
import {
  carveCorridor,
  ensureConnectivity,
  generateZones,
  placeDoor,
  protectRoom,
  sanitizeDoors,
  stampRoom,
} from '../shared';
import { genLog } from '../log';
import type { FloorGeneration } from '../floor_manifest';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';


import { NPC_DEFS, registerFloorSideQuest, addItemDrop, nextContainerId, addContainer, seedContainers, spawnNpc, spawnAmbientAdult, spawnFloor69Npcs, spawnCheckpointCrowd, seedLooseItems, applyFloor69OwnershipVisibilityHeatmap, applyFloor69AmbientSpriteTemplates } from './npcs';
import { expandFloor69FullFloor, buildFloor69NorthShadowDistrict, buildFloor69WestWaitingQuarter, buildFloor69DeepMidWestLabyrinth, buildFloor69EastDebtSector, buildFloor69SouthRefugeSector, buildFloor69FarOuterPockets, buildFloor69GlobalPerimeterRing, buildFloor69NorthDeepSector, buildFloor69SouthDeepSector, buildFloor69WestEastDeepSectors, buildFloor69InnerMonolithGrid, buildFloor69BeyondPerimeterTunnels, buildFloor69ExperimentalHydroponics, buildFloor69UndergroundMarketAndCinema, buildFloor69SubMonolithLotto, buildFloor69TrueInterconnectedGridAndAlleys } from './districts';
import { buildFloor69PublicRoutes, buildFloor69HotelWings, buildFloor69BackstageLoop, buildFloor69DebtBlock, buildFloor69RefugeClosets, buildFloor69SecurityChokes } from './routes';
import { DESIGN_FLOOR_ID, DESIGN_FLOOR_Z, FLOOR_69_DEFAULT_SEED, HOME_FLOOR_KEY, FLOOR_69_RAID_SHUTTER_KEY, FLOOR_69_RAID_SHUTTER_GATES, FLOOR_69_BASE_FLOOR, FLOOR_69_MAX_FLAGS, FLOOR_69_CHECKPOINT_CROWD_CAP, FLOOR_69_FEMALE_SPRITE_COUNT, FLOOR_69_PROFILE, FLOOR_69_WORKER_ROLE, FLOOR_69_WORKER_CANDIDATE_OCCUPATIONS, FLOOR_69_CONTROL_ANCHORS, IRA_WORKER_LINES, IRA_WORKER_POST_LINES, Floor69State, Floor69Generation, createFloor69State, floor69DebugLines, floor69EventTags, floor69RouteEventData, generateFloor69DesignFloor } from './index';
export function bounded(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function hashFloor69Entity(entity: Entity, salt = 0): number {
  let h = (entity.id ^ Math.imul(Math.floor(entity.x * 16), 0x45d9f3b) ^ Math.imul(Math.floor(entity.y * 16), 0x119de1f3) ^ salt) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function floor69FemaleSprite(entity: Entity): number {
  return Spr.F69_FEMALE_NPC_BASE + (hashFloor69Entity(entity, 0x690069) % FLOOR_69_FEMALE_SPRITE_COUNT);
}

export function isFloor69GeneratedVisitor(entity: Entity): boolean {
  if (!FLOOR_69_WORKER_ROLE?.sourceNamePrefix) return false;
  return entity.type === EntityType.NPC &&
    !entity.id &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.occupation !== Occupation.CHILD &&
    FLOOR_69_WORKER_CANDIDATE_OCCUPATIONS.has(entity.occupation ?? Occupation.TRAVELER) &&
    (!FLOOR_69_WORKER_ROLE.requiresFemale || entity.isFemale !== false) &&
    (entity.name?.startsWith(FLOOR_69_WORKER_ROLE.sourceNamePrefix) ?? false);
}

export function shouldPromoteFloor69Worker(entity: Entity): boolean {
  if (!isFloor69GeneratedVisitor(entity)) return false;
  if (FLOOR_69_WORKER_ROLE?.candidateFaction !== undefined &&
    entity.faction !== undefined &&
    entity.faction !== FLOOR_69_WORKER_ROLE.candidateFaction) {
    return false;
  }
  return hashFloor69Entity(entity, 0x169) / 0x100000000 < (FLOOR_69_WORKER_ROLE?.promotionRate ?? 0);
}

export function isFloor69Worker(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    !!FLOOR_69_WORKER_ROLE?.roleNamePrefix &&
    (entity.name?.startsWith(FLOOR_69_WORKER_ROLE.roleNamePrefix) ?? false);
}

export function promoteFloor69Worker(entity: Entity): void {
  const sourcePrefix = FLOOR_69_WORKER_ROLE?.sourceNamePrefix;
  const rolePrefix = FLOOR_69_WORKER_ROLE?.roleNamePrefix;
  if (sourcePrefix && rolePrefix && entity.name?.startsWith(sourcePrefix)) {
    entity.name = entity.name.replace(sourcePrefix, rolePrefix);
  }
  if (!isFloor69Worker(entity)) return;
  entity.occupation = FLOOR_69_WORKER_ROLE?.outputOccupation ?? Occupation.PERFORMER;
  entity.sprite = floor69FemaleSprite(entity);
  entity.npcVisualId = FLOOR_69_WORKER_ROLE?.npcVisualId ?? NPC_VISUAL_FLOOR69_FEMALE;
  entity.isFemale = true;
  entity.spriteScale = 1;
}

export function floor69RoomFaction(room: Room | undefined): ZoneFaction | undefined {
  if (!room) return undefined;
  if (room.name.includes('Граждан') || room.name.includes('общак') || room.name.includes('Тихая комната')) return ZoneFaction.CITIZEN;
  if (room.name.includes('НИИ') || room.name.includes('Лаборатор') || room.name.includes('Санитар') || room.name.includes('стерил')) return ZoneFaction.SCIENTIST;
  if (room.name.includes('Культ') || room.name.includes('Свеч') || room.name.includes('исповед') || room.name.includes('ритуал')) return ZoneFaction.CULTIST;
  if (room.name.includes('Дики') || room.name.includes('диких') || room.name.includes('стихийн') || room.name.includes('развал')) return ZoneFaction.WILD;
  if (room.type === RoomType.HQ || room.name.includes('пост') || room.name.includes('Пост')) return ZoneFaction.LIQUIDATOR;
  if (room.name.includes('Долг') || room.name.includes('долг') || room.name.includes('Картотека') || room.name.includes('распис')) return ZoneFaction.LIQUIDATOR;
  if (room.name.includes('Клиника') || room.name.includes('тих') || room.name.includes('Тих')) return ZoneFaction.CITIZEN;
  if (room.name.includes('Служеб') || room.name.includes('кулис') || room.name.includes('Костюмер')) return ZoneFaction.WILD;
  return undefined;
}

export function floor69ControlAt(world: World, x: number, y: number, room: Room | undefined): { faction: ZoneFaction; visibility: number; danger: number } {
  const roomFaction = floor69RoomFaction(room);
  const scores = new Float32Array(6);
  scores[ZoneFaction.CITIZEN] = 0.55;
  let visibility = 0.2;
  let danger = 0;

  for (const anchor of FLOOR_69_CONTROL_ANCHORS) {
    const d2 = world.dist2(x, y, anchor.x, anchor.y);
    const r2 = anchor.radius * anchor.radius;
    if (d2 > r2) continue;
    const t = 1 - d2 / r2;
    scores[anchor.faction] += anchor.weight * t * t;
    visibility += anchor.visibility * t;
    danger = Math.max(danger, Math.round(anchor.danger * t));
  }

  if (roomFaction !== undefined) {
    scores[roomFaction] += 2.75;
    if (roomFaction === ZoneFaction.LIQUIDATOR) {
      visibility += 0.8;
      danger = Math.max(danger, 2);
    } else if (roomFaction === ZoneFaction.WILD) {
      visibility *= 0.55;
      danger = Math.max(danger, 1);
    }
  }

  let faction = ZoneFaction.CITIZEN;
  let best = scores[faction];
  for (const candidate of [ZoneFaction.LIQUIDATOR, ZoneFaction.CULTIST, ZoneFaction.WILD, ZoneFaction.SCIENTIST, ZoneFaction.SAMOSBOR] as const) {
    if (scores[candidate] > best) {
      best = scores[candidate];
      faction = candidate;
    }
  }
  return { faction, visibility, danger };
}

export interface Floor69Rooms {
  publicLift: Room;
  publicCorridor: Room;
  checkpoint: Room;
  hall: Room;
  clinic: Room;
  debtOffice: Room;
  refuge: Room;
  ledger: Room;
  staffRoute: Room;
  staffLift: Room;
}

export function applyRoomTextures(world: World, room: Room, wallTex: Tex, floorTex: Tex): void {
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = wallTex;
    }
  }
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
    }
  }
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
  protectedRoom = false,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  applyRoomTextures(world, room, wallTex, floorTex);
  if (protectedRoom) protectRoom(world, room.x, room.y, room.w, room.h, wallTex, floorTex);
  return room;
}

export function connect(
  world: World,
  a: Room,
  b: Room,
  keyId = '',
  state: DoorState = DoorState.CLOSED,
): void {
  const before = new Set(a.doors);
  placeDoor(world, a, b, keyId, state === DoorState.HERMETIC_OPEN || state === DoorState.HERMETIC_CLOSED);
  const doorIdx = a.doors.find(idx => !before.has(idx));
  if (doorIdx === undefined) {
    carveCorridor(world, a.x + Math.floor(a.w / 2), a.y + Math.floor(a.h / 2), b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2));
    return;
  }
  const door = world.doors.get(doorIdx);
  if (door) {
    door.state = state;
    door.keyId = keyId;
  }
  world.wallTex[doorIdx] = state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.features[ci] = feature;
  if (feature === Feature.SCREEN && !world.screenCells.includes(ci)) world.screenCells.push(ci);
}

export function addScreenWall(world: World, x: number, y: number, variant: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.WALL) return;
  world.wallTex[ci] = Tex.SCREEN_BASE + (variant % 32);
  world.screenCells.push(ci);
}

export function addPosterWall(world: World, x: number, y: number, variant: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.WALL) world.wallTex[ci] = Tex.POSTER_BASE + (variant % 64);
}

export function addLift(world: World, x: number, y: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const liftIdx = world.idx(x, y);
  world.cells[liftIdx] = Cell.LIFT;
  world.wallTex[liftIdx] = Tex.LIFT_DOOR;
  world.roomMap[liftIdx] = -1;
  world.features[liftIdx] = Feature.NONE;
  world.liftDir[liftIdx] = direction;

  const buttonIdx = world.idx(buttonX, buttonY);
  if (world.cells[buttonIdx] === Cell.FLOOR) {
    world.features[buttonIdx] = Feature.LIFT_BUTTON;
    world.liftDir[buttonIdx] = direction;
  }
}

export interface Floor69MacroCounts {
  hotelRooms: number;
  dressingRooms: number;
  debtRooms: number;
  refugeRooms: number;
  securityGates: number;
  loops: number;
}

export function canCarveFloor69Route(world: World, idx: number): boolean {
  if (world.cells[idx] === Cell.LIFT || world.cells[idx] === Cell.DOOR) return false;
  const roomId = world.roomMap[idx];
  if (roomId >= 0) return world.rooms[roomId]?.type === RoomType.CORRIDOR;
  return world.aptMask[idx] === 0 || world.cells[idx] === Cell.FLOOR;
}

export function carveRouteCell(world: World, x: number, y: number, floorTex: Tex, wallTex: Tex): void {
  const ci = world.idx(x, y);
  if (!canCarveFloor69Route(world, ci)) return;
  const roomId = world.roomMap[ci];
  world.cells[ci] = Cell.FLOOR;
  world.roomMap[ci] = roomId >= 0 ? roomId : -1;
  world.floorTex[ci] = floorTex;
  if (world.features[ci] !== Feature.LIFT_BUTTON) world.features[ci] = Feature.NONE;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = world.idx(x + ox, y + oy);
    if (world.cells[ni] === Cell.WALL && world.aptMask[ni] === 0) world.wallTex[ni] = wallTex;
  }
}

export function carveRouteDisc(world: World, cx: number, cy: number, r: number, floorTex: Tex, wallTex: Tex): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      carveRouteCell(world, cx + dx, cy + dy, floorTex, wallTex);
    }
  }
}

export function carveRouteLine(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  let x = world.wrap(ax);
  let y = world.wrap(ay);
  const dx = world.delta(x, bx);
  const dy = world.delta(y, by);
  const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  for (let i = 0; i <= Math.abs(dx); i++) {
    carveRouteDisc(world, x, y, width, floorTex, wallTex);
    if (i < Math.abs(dx)) x = world.wrap(x + sx);
  }
  for (let i = 0; i <= Math.abs(dy); i++) {
    carveRouteDisc(world, x, y, width, floorTex, wallTex);
    if (i < Math.abs(dy)) y = world.wrap(y + sy);
  }
}

export function doorWalkable(cell: number): boolean {
  return cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER || cell === Cell.LIFT;
}

export function doorHasStableJamb(world: World, wx: number, wy: number, insideDx: number, insideDy: number): boolean {
  const fx = insideDy;
  const fy = insideDx;
  return world.cells[world.idx(wx + fx, wy + fy)] === Cell.WALL
    && world.cells[world.idx(wx - fx, wy - fy)] === Cell.WALL;
}

export function placeRoomDoor(world: World, room: Room, wx: number, wy: number, state: DoorState, keyId = ''): boolean {
  const idx = world.idx(wx, wy);
  if (world.cells[idx] !== Cell.WALL && world.cells[idx] !== Cell.DOOR) return false;
  let roomB = -1;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const otherRoomId = world.roomMap[world.idx(wx + ox, wy + oy)];
    if (otherRoomId >= 0 && otherRoomId !== room.id) {
      roomB = otherRoomId;
      break;
    }
  }
  world.cells[idx] = Cell.DOOR;
  world.aptMask[idx] = 0;
  world.wallTex[idx] = state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
  world.doors.set(idx, { idx, state, roomA: room.id, roomB, keyId, timer: 0 });
  if (!room.doors.includes(idx)) room.doors.push(idx);
  if (roomB >= 0) {
    const other = world.rooms[roomB];
    if (other && !other.doors.includes(idx)) other.doors.push(idx);
  }
  return true;
}

export function openRoomToNearestRoute(world: World, room: Room, tx: number, ty: number, state = DoorState.CLOSED, keyId = ''): void {
  let bestX = 0;
  let bestY = 0;
  let bestDx = 0;
  let bestDy = 0;
  let bestD = Infinity;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const wx = world.wrap(room.x + dx);
      const wy = world.wrap(room.y + dy);
      const ci = world.idx(wx, wy);
      if (world.cells[ci] !== Cell.WALL) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const inside = world.idx(wx + ox, wy + oy);
        const outside = world.idx(wx - ox, wy - oy);
        if (world.roomMap[inside] !== room.id || !doorWalkable(world.cells[outside])) continue;
        if (!doorHasStableJamb(world, wx, wy, ox, oy)) continue;
        const d = world.dist2(wx, wy, tx, ty);
        if (d < bestD) {
          bestD = d;
          bestX = wx;
          bestY = wy;
          bestDx = ox;
          bestDy = oy;
        }
      }
    }
  }
  if (bestD < Infinity && placeRoomDoor(world, room, bestX, bestY, state, keyId)) return;

  bestD = Infinity;
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) continue;
      const wx = world.wrap(room.x + dx);
      const wy = world.wrap(room.y + dy);
      if (world.cells[world.idx(wx, wy)] !== Cell.WALL) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const inside = world.idx(wx + ox, wy + oy);
        const outside = world.idx(wx - ox, wy - oy);
        if (world.roomMap[inside] !== room.id || world.aptMask[outside]) continue;
        if (!doorHasStableJamb(world, wx, wy, ox, oy)) continue;
        const d = world.dist2(wx, wy, tx, ty);
        if (d < bestD) {
          bestD = d;
          bestX = wx;
          bestY = wy;
          bestDx = ox;
          bestDy = oy;
        }
      }
    }
  }

  if (bestD < Infinity) {
    carveRouteLine(world, bestX - bestDx, bestY - bestDy, tx, ty, 1, room.floorTex, room.wallTex);
    placeRoomDoor(world, room, bestX, bestY, state, keyId);
  }
}

export function addRouteGate(
  world: World,
  x: number,
  y1: number,
  y2: number,
  doorY: number,
  state: DoorState,
  keyId = '',
): void {
  for (let y = y1; y <= y2; y++) {
    const ci = world.idx(x, y);
    const roomId = world.roomMap[ci];
    if (roomId >= 0 && world.rooms[roomId]?.type !== RoomType.CORRIDOR) continue;
    if (world.cells[ci] === Cell.LIFT) continue;
    world.cells[ci] = Cell.WALL;
    world.aptMask[ci] = 0;
    world.roomMap[ci] = -1;
    world.wallTex[ci] = Tex.METAL;
    world.features[ci] = Feature.NONE;
  }

  const doorIdx = world.idx(x, doorY);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = state === DoorState.LOCKED ? Tex.DOOR_METAL : Tex.DOOR_WOOD;
  world.doors.set(doorIdx, { idx: doorIdx, state, roomA: -1, roomB: -1, keyId, timer: 0 });
}

export function pickRouteRoomType(rng: () => number, motif: 'hotel' | 'dressing' | 'debt' | 'security' | 'refuge'): RoomType {
  if (motif === 'debt') return rng() < 0.72 ? RoomType.OFFICE : RoomType.STORAGE;
  if (motif === 'dressing') return rng() < 0.55 ? RoomType.COMMON : RoomType.STORAGE;
  if (motif === 'security') return RoomType.HQ;
  if (motif === 'refuge') return rng() < 0.7 ? RoomType.LIVING : RoomType.STORAGE;
  return rng() < 0.65 ? RoomType.LIVING : rng() < 0.82 ? RoomType.SMOKING : RoomType.COMMON;
}

export function decorateRouteRoom(world: World, room: Room, motif: 'hotel' | 'dressing' | 'debt' | 'security' | 'refuge', rng: () => number): void {
  const count = Math.max(2, Math.floor(room.w * room.h / 62));
  const pool = motif === 'debt'
    ? [Feature.SHELF, Feature.DESK, Feature.TABLE, Feature.LAMP]
    : motif === 'security'
      ? [Feature.DESK, Feature.CHAIR, Feature.LAMP, Feature.SHELF]
      : motif === 'dressing'
        ? [Feature.CHAIR, Feature.SHELF, Feature.TABLE, Feature.LAMP]
        : motif === 'refuge'
          ? [Feature.BED, Feature.CHAIR, Feature.LAMP, Feature.SHELF]
          : [Feature.BED, Feature.TABLE, Feature.CHAIR, Feature.LAMP];

  for (let i = 0; i < count; i++) {
    setFeature(
      world,
      room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4)),
      room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4)),
      pool[Math.floor(rng() * pool.length)],
    );
  }

  if (motif === 'debt') {
    addScreenWall(world, room.x + Math.floor(room.w / 2), room.y - 1, room.id + 17);
  } else if (motif === 'hotel' || motif === 'dressing') {
    addPosterWall(world, room.x + Math.floor(room.w / 2), room.y - 1, room.id * 3);
    if (rng() < 0.24) {
      stampSurfaceSplat(world, room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2), 0.5, 0.5, 2.8, 0.16, room.id * 983, 200, 42, 112, true);
    }
  }
}

export function addRouteRoom(
  world: World,
  rng: () => number,
  motif: 'hotel' | 'dressing' | 'debt' | 'security' | 'refuge',
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  doorTargetX: number,
  doorTargetY: number,
  state = DoorState.CLOSED,
  keyId = '',
): Room {
  const wallTex = motif === 'security'
    ? Tex.METAL
    : motif === 'debt'
      ? Tex.MARBLE
      : motif === 'dressing'
        ? Tex.CURTAIN
        : motif === 'refuge'
          ? Tex.PANEL
          : Tex.CURTAIN;
  const floorTex = motif === 'security'
    ? Tex.F_CONCRETE
    : motif === 'debt'
      ? Tex.F_PARQUET
      : motif === 'refuge'
        ? Tex.F_LINO
        : Tex.F_CARPET;
  const room = addRoom(world, pickRouteRoomType(rng, motif), x, y, w, h, name, wallTex, floorTex);
  if (motif === 'refuge') protectRoom(world, room.x, room.y, room.w, room.h, wallTex, floorTex);
  openRoomToNearestRoute(world, room, doorTargetX, doorTargetY, state, keyId);
  decorateRouteRoom(world, room, motif, rng);
  return room;
}

export function canPlaceFloor69Room(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      if (world.cells[idx] !== Cell.WALL || world.aptMask[idx]) return false;
    }
  }
  return true;
}

export function floor69OwnerWallTex(owner: ZoneFaction): Tex {
  if (owner === ZoneFaction.LIQUIDATOR) return Tex.METAL;
  if (owner === ZoneFaction.SCIENTIST) return Tex.TILE_W;
  if (owner === ZoneFaction.CULTIST) return Tex.DARK;
  if (owner === ZoneFaction.WILD) return Tex.ROTTEN;
  return Tex.PANEL;
}

export function floor69OwnerFloorTex(owner: ZoneFaction): Tex {
  if (owner === ZoneFaction.SCIENTIST) return Tex.F_TILE;
  if (owner === ZoneFaction.CULTIST) return Tex.F_RED_CARPET;
  if (owner === ZoneFaction.WILD) return Tex.F_CONCRETE;
  if (owner === ZoneFaction.LIQUIDATOR) return Tex.F_CONCRETE;
  return Tex.F_LINO;
}

export function assignFloor69RoomOwner(world: World, room: Room, owner: ZoneFaction): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id) world.factionControl[idx] = owner;
    }
  }
  for (const idx of room.doors) world.factionControl[idx] = owner;
}

export function decorateOwnedSupportRoom(world: World, room: Room, owner: ZoneFaction, salt: number): void {
  if (room.type === RoomType.KITCHEN) {
    setFeature(world, room.x + 2, room.y + 2, Feature.STOVE);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SINK);
    setFeature(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
  } else if (room.type === RoomType.BATHROOM) {
    setFeature(world, room.x + 2, room.y + 2, Feature.SINK);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.TOILET);
  } else if (room.type === RoomType.MEDICAL) {
    setFeature(world, room.x + 2, room.y + 2, Feature.APPARATUS);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.BED);
  } else if (room.type === RoomType.OFFICE || room.type === RoomType.HQ) {
    setFeature(world, room.x + 2, room.y + 2, Feature.DESK);
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
  } else {
    setFeature(world, room.x + 2, room.y + 2, Feature.TABLE);
    setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
  }
  setFeature(world, room.x + (room.w >> 1), room.y + (room.h >> 1), owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
  if (owner === ZoneFaction.SCIENTIST) addScreenWall(world, room.x + (room.w >> 1), room.y - 1, salt + 7);
  if (owner === ZoneFaction.CULTIST) stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 2.6, 0.18, salt * 701, 120, 32, 180, true);
}

export function tryAddOwnedRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  owner: ZoneFaction,
  protectedRoom = false,
): Room | undefined {
  if (!canPlaceFloor69Room(world, x, y, w, h)) return undefined;
  const room = addRoom(world, type, x, y, w, h, name, floor69OwnerWallTex(owner), floor69OwnerFloorTex(owner), protectedRoom);
  if (protectedRoom) {
    room.sealed = true;
    for (let dy = -1; dy <= room.h; dy++) {
      for (let dx = -1; dx <= room.w; dx++) {
        const border = dx < 0 || dx >= room.w || dy < 0 || dy >= room.h;
        if (!border) continue;
        const idx = world.idx(room.x + dx, room.y + dy);
        if (world.cells[idx] !== Cell.WALL) continue;
        world.hermoWall[idx] = 1;
        world.wallTex[idx] = Tex.HERMO_WALL;
      }
    }
  }
  assignFloor69RoomOwner(world, room, owner);
  return room;
}

export function tryAddRouteRoom(
  world: World,
  rng: () => number,
  counts: Floor69MacroCounts,
  motif: 'hotel' | 'dressing' | 'debt' | 'security' | 'refuge',
  owner: ZoneFaction,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  doorTargetX: number,
  doorTargetY: number,
  state = DoorState.CLOSED,
  keyId = '',
): Room | undefined {
  if (!canPlaceFloor69Room(world, x, y, w, h)) return undefined;
  const room = addRouteRoom(world, rng, motif, x, y, w, h, name, doorTargetX, doorTargetY, state, keyId);
  assignFloor69RoomOwner(world, room, owner);
  if (motif === 'hotel') counts.hotelRooms++;
  else if (motif === 'dressing') counts.dressingRooms++;
  else if (motif === 'debt') counts.debtRooms++;
  else if (motif === 'refuge') counts.refugeRooms++;
  return room;
}

export function addHorizontalRooms(
  world: World,
  rng: () => number,
  counts: Floor69MacroCounts,
  corridorY: number,
  x1: number,
  x2: number,
  side: -1 | 1,
  motif: 'hotel' | 'dressing' | 'debt' | 'refuge',
  label: string,
  step: number,
): void {
  for (let x = x1; x <= x2; x += step) {
    const w = 18 + Math.floor(rng() * (motif === 'debt' ? 18 : 12));
    const h = 10 + Math.floor(rng() * (motif === 'refuge' ? 5 : 8));
    const y = side < 0 ? corridorY - h - 3 : corridorY + 4;
    const locked = motif === 'debt' && rng() < 0.45;
    addRouteRoom(
      world,
      rng,
      motif,
      x,
      y,
      w,
      h,
      `${label} ${Math.floor(x / step)}`,
      x + Math.floor(w / 2),
      corridorY,
      motif === 'refuge' ? DoorState.HERMETIC_OPEN : locked ? DoorState.LOCKED : DoorState.CLOSED,
      locked ? 'key' : '',
    );
    if (motif === 'hotel') counts.hotelRooms++;
    else if (motif === 'dressing') counts.dressingRooms++;
    else if (motif === 'debt') counts.debtRooms++;
    else counts.refugeRooms++;
  }
}

export function addHorizontalOwnedRooms(
  world: World,
  rng: () => number,
  counts: Floor69MacroCounts,
  corridorY: number,
  x1: number,
  x2: number,
  side: -1 | 1,
  motif: 'hotel' | 'dressing' | 'debt' | 'refuge',
  owner: ZoneFaction,
  label: string,
  step: number,
): void {
  for (let x = x1; x <= x2; x += step) {
    const w = 18 + Math.floor(rng() * (motif === 'debt' ? 18 : 14));
    const h = 11 + Math.floor(rng() * (motif === 'refuge' ? 6 : 9));
    const y = side < 0 ? corridorY - h - 4 : corridorY + 5;
    tryAddRouteRoom(
      world,
      rng,
      counts,
      motif,
      owner,
      x,
      y,
      w,
      h,
      `${label} ${Math.floor(x / step)}`,
      x + Math.floor(w / 2),
      corridorY,
      motif === 'refuge' ? DoorState.HERMETIC_OPEN : motif === 'debt' && rng() < 0.32 ? DoorState.LOCKED : DoorState.CLOSED,
      motif === 'debt' ? 'key' : '',
    );
  }
}

export function addVerticalOwnedRooms(
  world: World,
  rng: () => number,
  counts: Floor69MacroCounts,
  corridorX: number,
  y1: number,
  y2: number,
  side: -1 | 1,
  motif: 'hotel' | 'dressing' | 'debt' | 'refuge',
  owner: ZoneFaction,
  label: string,
  step: number,
): void {
  for (let y = y1; y <= y2; y += step) {
    const w = 12 + Math.floor(rng() * (motif === 'debt' ? 14 : 12));
    const h = 18 + Math.floor(rng() * (motif === 'refuge' ? 8 : 12));
    const x = side < 0 ? corridorX - w - 4 : corridorX + 5;
    tryAddRouteRoom(
      world,
      rng,
      counts,
      motif,
      owner,
      x,
      y,
      w,
      h,
      `${label} ${Math.floor(y / step)}`,
      corridorX,
      y + Math.floor(h / 2),
      motif === 'refuge' ? DoorState.HERMETIC_OPEN : motif === 'debt' && rng() < 0.3 ? DoorState.LOCKED : DoorState.CLOSED,
      motif === 'debt' ? 'key' : '',
    );
  }
}

export function supportRoomType(owner: ZoneFaction, slot: number): RoomType {
  if (slot === 0) return RoomType.KITCHEN;
  if (slot === 1) return RoomType.BATHROOM;
  if (slot === 2) return owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : owner === ZoneFaction.LIQUIDATOR ? RoomType.OFFICE : RoomType.STORAGE;
  return owner === ZoneFaction.CULTIST ? RoomType.COMMON : owner === ZoneFaction.WILD ? RoomType.STORAGE : RoomType.COMMON;
}

export function buildFloor69MiniHq(
  world: World,
  rng: () => number,
  owner: ZoneFaction,
  label: string,
  hx: number,
  hy: number,
  routeX: number,
  routeY: number,
): void {
  const floorTex = floor69OwnerFloorTex(owner);
  const wallTex = floor69OwnerWallTex(owner);
  const hub = tryAddOwnedRoom(world, RoomType.CORRIDOR, hx - 18, hy - 5, 36, 10, `${label}: коридор`, owner);
  if (!hub) return;

  carveRouteLine(world, routeX, routeY, hub.x + 1, hy, 2, floorTex, wallTex);
  decorateRouteLine(world, hy, hx - 18, hx + 18, hx + hy);

  const rooms = [
    tryAddOwnedRoom(world, RoomType.HQ, hub.x + 7, hub.y - 11, 22, 10, `${label}: гермокор`, owner, true),
    tryAddOwnedRoom(world, supportRoomType(owner, 0), hub.x + 5, hub.y + hub.h + 1, 14, 10, `${label}: кухня`, owner),
    tryAddOwnedRoom(world, supportRoomType(owner, 1), hub.x + 21, hub.y + hub.h + 1, 12, 10, `${label}: санузел`, owner),
    tryAddOwnedRoom(world, supportRoomType(owner, 2), hub.x - 17, hub.y + 1, 16, 8, `${label}: склад`, owner),
    tryAddOwnedRoom(world, supportRoomType(owner, 3), hub.x + hub.w + 1, hub.y + 1, 18, 8, `${label}: комната`, owner),
  ];

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (!room) continue;
    connect(world, room, hub, '', room.type === RoomType.HQ ? DoorState.HERMETIC_OPEN : DoorState.CLOSED);
    assignFloor69RoomOwner(world, room, owner);
    assignFloor69RoomOwner(world, hub, owner);
    decorateOwnedSupportRoom(world, room, owner, room.id + i * 17);
  }

  if (rng() < 0.5) setFeature(world, hx, hy, owner === ZoneFaction.CULTIST ? Feature.CANDLE : Feature.LAMP);
}

export function buildFloor69DenseBlock(
  world: World,
  rng: () => number,
  counts: Floor69MacroCounts,
  owner: ZoneFaction,
  motif: 'hotel' | 'dressing' | 'debt' | 'refuge',
  label: string,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  routeX: number,
  routeY: number,
): void {
  const floorTex = floor69OwnerFloorTex(owner);
  const wallTex = floor69OwnerWallTex(owner);
  carveRouteLine(world, routeX, routeY, cx, cy, 2, floorTex, wallTex);
  carveRouteLine(world, cx - halfW, cy, cx + halfW, cy, 2, floorTex, wallTex);
  carveRouteLine(world, cx, cy - halfH, cx, cy + halfH, 2, floorTex, wallTex);
  addHorizontalOwnedRooms(world, rng, counts, cy, cx - halfW + 10, cx + halfW - 28, -1, motif, owner, `${label} север`, 34);
  addHorizontalOwnedRooms(world, rng, counts, cy, cx - halfW + 10, cx + halfW - 28, 1, motif, owner, `${label} юг`, 34);
  addVerticalOwnedRooms(world, rng, counts, cx, cy - halfH + 12, cy + halfH - 30, -1, motif, owner, `${label} запад`, 34);
  addVerticalOwnedRooms(world, rng, counts, cx, cy - halfH + 12, cy + halfH - 30, 1, motif, owner, `${label} восток`, 34);
  counts.loops += 2;
}

export function buildFloor69MidMicroLayer(world: World, rng: () => number, counts: Floor69MacroCounts): void {
  buildFloor69MiniHq(world, rng, ZoneFaction.CITIZEN, 'Гражданский общак 69', 304, 512, 304, 512);
  buildFloor69MiniHq(world, rng, ZoneFaction.SCIENTIST, 'Санитарный НИИ 69', 304, 300, 300, 256);
  buildFloor69MiniHq(world, rng, ZoneFaction.CULTIST, 'Свечная исповедальня 69', 304, 744, 300, 812);
  buildFloor69MiniHq(world, rng, ZoneFaction.WILD, 'Дикий развал должников 69', 736, 790, 736, 812);
  buildFloor69MiniHq(world, rng, ZoneFaction.LIQUIDATOR, 'Рейдовый штаб протокола 69', 836, 448, 736, 448);

  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.SCIENTIST, 'debt', 'Лабораторный кабинет 69', 260, 300, 96, 70, 300, 256);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CITIZEN, 'hotel', 'Гражданский двор свидетелей 69', 250, 520, 116, 86, 176, 512);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.CULTIST, 'dressing', 'Свечная ниша процента 69', 260, 760, 96, 74, 300, 812);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.WILD, 'refuge', 'Дикие лежанки должников 69', 766, 790, 112, 82, 736, 812);
  buildFloor69DenseBlock(world, rng, counts, ZoneFaction.LIQUIDATOR, 'debt', 'Рейдовый архив протокола 69', 840, 456, 94, 70, 736, 448);

  addVerticalOwnedRooms(world, rng, counts, 176, 330, 690, -1, 'hotel', ZoneFaction.CITIZEN, 'Боковой номер западной очереди', 34);
  addVerticalOwnedRooms(world, rng, counts, 176, 330, 690, 1, 'hotel', ZoneFaction.CITIZEN, 'Боковой номер восточной очереди', 34);
  addVerticalOwnedRooms(world, rng, counts, 392, 308, 704, -1, 'dressing', ZoneFaction.WILD, 'Гримерная средней петли', 36);
  addVerticalOwnedRooms(world, rng, counts, 392, 308, 704, 1, 'refuge', ZoneFaction.CITIZEN, 'Тихий шкаф средней петли', 38);
  addVerticalOwnedRooms(world, rng, counts, 736, 180, 872, -1, 'debt', ZoneFaction.WILD, 'Долговой развал запад', 36);
  addVerticalOwnedRooms(world, rng, counts, 736, 180, 872, 1, 'debt', ZoneFaction.LIQUIDATOR, 'Протокольная будка восток', 36);
  addHorizontalOwnedRooms(world, rng, counts, 256, 198, 690, -1, 'refuge', ZoneFaction.SCIENTIST, 'Стерильный верхний шкаф', 38);
  addHorizontalOwnedRooms(world, rng, counts, 812, 500, 890, 1, 'refuge', ZoneFaction.WILD, 'Нижняя лежанка развала', 38);
  addHorizontalOwnedRooms(world, rng, counts, 448, 190, 700, -1, 'dressing', ZoneFaction.CITIZEN, 'Смотровая кабинка средней линии', 38);
  addHorizontalOwnedRooms(world, rng, counts, 448, 190, 700, 1, 'dressing', ZoneFaction.WILD, 'Служебная кабинка средней линии', 38);
}

export function decorateRouteLine(world: World, y: number, x1: number, x2: number, seedOffset: number): void {
  for (let x = x1; x <= x2; x += 46) {
    setFeature(world, x, y, Feature.LAMP);
    if ((x + seedOffset) % 3 === 0) addPosterWall(world, x, y - 3, x + seedOffset);
  }
}

export function buildLayout(world: World): Floor69Rooms {
  const publicLift = addRoom(world, RoomType.CORRIDOR, 456, 503, 7, 16, 'Лифт 69: публичная площадка', Tex.METAL, Tex.F_CONCRETE);
  const publicCorridor = addRoom(world, RoomType.CORRIDOR, 464, 508, 88, 6, 'Красный коридор 69', Tex.CURTAIN, Tex.F_CARPET);
  const checkpoint = addRoom(world, RoomType.HQ, 476, 497, 13, 10, 'Пост досмотра 69', Tex.METAL, Tex.F_CONCRETE);
  const hall = addRoom(world, RoomType.COMMON, 496, 488, 27, 19, 'Зал ламп и сцены 69', Tex.CURTAIN, Tex.F_CARPET);
  const clinic = addRoom(world, RoomType.MEDICAL, 530, 496, 17, 11, 'Клиника Сима: тихий прием', Tex.TILE_W, Tex.F_TILE);
  const debtOffice = addRoom(world, RoomType.OFFICE, 530, 515, 17, 12, 'Долговая контора 69', Tex.PANEL, Tex.F_PARQUET);
  const refuge = addRoom(world, RoomType.LIVING, 498, 515, 12, 10, 'Тихая комната 69', Tex.PANEL, Tex.F_LINO, true);
  refuge.type = RoomType.HQ;
  const ledger = addRoom(world, RoomType.OFFICE, 514, 515, 12, 10, 'Картотека долгов 69', Tex.MARBLE, Tex.F_PARQUET);
  const staffRoute = addRoom(world, RoomType.CORRIDOR, 553, 500, 5, 49, 'Служебный ход 69', Tex.DARK, Tex.F_CONCRETE);
  const staffLift = addRoom(world, RoomType.CORRIDOR, 548, 550, 13, 9, 'Черная лестница 69', Tex.METAL, Tex.F_CONCRETE);

  connect(world, publicLift, publicCorridor);
  connect(world, checkpoint, publicCorridor, '', DoorState.CLOSED);
  connect(world, hall, publicCorridor, '', DoorState.CLOSED);
  connect(world, clinic, publicCorridor, '', DoorState.CLOSED);
  connect(world, debtOffice, publicCorridor, 'key', DoorState.LOCKED);
  connect(world, refuge, publicCorridor, '', DoorState.HERMETIC_OPEN);
  connect(world, ledger, publicCorridor, 'key', DoorState.LOCKED);
  connect(world, publicCorridor, staffRoute, 'key', DoorState.LOCKED);
  connect(world, staffRoute, staffLift, '', DoorState.CLOSED);
  carveCorridor(world, 556, 524, 554, 524);

  addLift(world, 459, 511, 460, 511, LiftDirection.DOWN);
  addLift(world, 554, 554, 554, 553, LiftDirection.UP);
  return { publicLift, publicCorridor, checkpoint, hall, clinic, debtOffice, refuge, ledger, staffRoute, staffLift };
}

export function decorateRooms(world: World, rooms: Floor69Rooms, seed: number): void {
  for (let x = rooms.publicCorridor.x + 4; x < rooms.publicCorridor.x + rooms.publicCorridor.w - 4; x += 8) {
    setFeature(world, x, rooms.publicCorridor.y + 2, Feature.LAMP);
    if (x % 16 === 0) addPosterWall(world, x, rooms.publicCorridor.y - 1, x + seed);
  }

  for (let x = rooms.hall.x + 3; x < rooms.hall.x + rooms.hall.w - 3; x += 4) {
    setFeature(world, x, rooms.hall.y + 2, Feature.CHAIR);
    setFeature(world, x, rooms.hall.y + rooms.hall.h - 3, Feature.TABLE);
  }
  setFeature(world, rooms.hall.x + Math.floor(rooms.hall.w / 2), rooms.hall.y + 4, Feature.LAMP);
  setFeature(world, rooms.hall.x + Math.floor(rooms.hall.w / 2), rooms.hall.y + 8, Feature.SCREEN);
  addScreenWall(world, rooms.hall.x + 12, rooms.hall.y - 1, 9);
  addScreenWall(world, rooms.hall.x + 18, rooms.hall.y - 1, 10);
  stampSurfaceSplat(world, rooms.hall.x + 13, rooms.hall.y + 9, 0.5, 0.5, 3.5, 0.22, seed + 11, 210, 45, 130, true);
  stampSurfaceSplat(world, rooms.hall.x + 18, rooms.hall.y + 9, 0.5, 0.5, 3.5, 0.18, seed + 12, 40, 160, 210, true);

  for (let x = rooms.checkpoint.x + 2; x < rooms.checkpoint.x + rooms.checkpoint.w - 2; x += 3) {
    setFeature(world, x, rooms.checkpoint.y + 2, Feature.DESK);
  }
  setFeature(world, rooms.checkpoint.x + rooms.checkpoint.w - 3, rooms.checkpoint.y + rooms.checkpoint.h - 3, Feature.LAMP);
  addPosterWall(world, rooms.checkpoint.x + 5, rooms.checkpoint.y - 1, 31);

  for (let x = rooms.clinic.x + 2; x < rooms.clinic.x + rooms.clinic.w - 2; x += 4) {
    setFeature(world, x, rooms.clinic.y + 2, Feature.APPARATUS);
    setFeature(world, x, rooms.clinic.y + rooms.clinic.h - 3, Feature.BED);
  }
  setFeature(world, rooms.clinic.x + rooms.clinic.w - 3, rooms.clinic.y + 2, Feature.LAMP);

  for (let y = rooms.debtOffice.y + 2; y < rooms.debtOffice.y + rooms.debtOffice.h - 2; y += 2) {
    setFeature(world, rooms.debtOffice.x + 2, y, Feature.SHELF);
    setFeature(world, rooms.debtOffice.x + rooms.debtOffice.w - 3, y, Feature.DESK);
  }
  addScreenWall(world, rooms.debtOffice.x + 7, rooms.debtOffice.y + rooms.debtOffice.h, 18);

  for (let dx = 2; dx < rooms.refuge.w - 2; dx += 4) {
    setFeature(world, rooms.refuge.x + dx, rooms.refuge.y + 2, Feature.BED);
    setFeature(world, rooms.refuge.x + dx, rooms.refuge.y + rooms.refuge.h - 3, Feature.CHAIR);
  }
  setFeature(world, rooms.refuge.x + rooms.refuge.w - 2, rooms.refuge.y + 2, Feature.LAMP);

  for (let y = rooms.ledger.y + 1; y < rooms.ledger.y + rooms.ledger.h - 1; y += 2) {
    setFeature(world, rooms.ledger.x + 2, y, Feature.SHELF);
    setFeature(world, rooms.ledger.x + rooms.ledger.w - 3, y, Feature.SHELF);
  }

  for (let y = rooms.staffRoute.y + 3; y < rooms.staffRoute.y + rooms.staffRoute.h - 3; y += 7) {
    setFeature(world, rooms.staffRoute.x + 2, y, Feature.LAMP);
  }

  placeNonExplicitRouteSignals(world, rooms);
}

export function placeNonExplicitRouteSignals(world: World, rooms: Floor69Rooms): void {
  addScreenWall(world, rooms.publicCorridor.x + 18, rooms.publicCorridor.y - 1, 41);
  addScreenWall(world, rooms.publicCorridor.x + 44, rooms.publicCorridor.y - 1, 42);
  addScreenWall(world, rooms.clinic.x + 8, rooms.clinic.y - 1, 43);
  addScreenWall(world, rooms.refuge.x + 6, rooms.refuge.y + rooms.refuge.h, 44);
  addPosterWall(world, rooms.staffRoute.x - 1, rooms.staffRoute.y + 8, 45);
  addPosterWall(world, rooms.debtOffice.x + 5, rooms.debtOffice.y - 1, 46);
}

export function roomMidX(room: Room): number {
  return room.x + room.w / 2;
}

export function roomMidY(room: Room): number {
  return room.y + room.h / 2;
}

export function registerFloor69RouteCues(world: World, rooms: Floor69Rooms): void {
  const refugeCueX = rooms.checkpoint.x + 9.5;
  const refugeCueY = rooms.checkpoint.y + 5.5;
  registerRouteCue(world, {
    id: 'floor_69_debt_refuge_route',
    x: refugeCueX,
    y: refugeCueY,
    targetX: roomMidX(rooms.refuge),
    targetY: roomMidY(rooms.refuge),
    z: FLOOR_69_BASE_FLOOR,
    label: '69: долг/убежище',
    hint: 'пост, ключ и расписка дают риск рейда; тихая комната дает воду, бинт и жалобу',
    targetName: rooms.refuge.name,
    color: '#f8a',
    tags: floor69EventTags('debt', 'refuge', 'raid', 'map_hint'),
    toneSeed: FLOOR_69_DEFAULT_SEED + 69,
    radius: 12,
    targetRadius: 3.8,
    roomId: rooms.checkpoint.id,
    targetRoomId: rooms.refuge.id,
    zoneId: world.zoneMap[world.idx(Math.floor(refugeCueX), Math.floor(refugeCueY))],
    heardText: 'Карта у поста шепчет маршрут 69: ключ и расписка рискнут рейдом, зато тихая комната даст воду, бинт и жалобу.',
    followedText: 'Метка вывела к тихой комнате 69: проверь воду, жалобу и служебный выход до рейда.',
    ignoredText: 'Тихая комната осталась за спиной: свидетель и долг снова зависят от поста.',
  });

  const blackmailCueX = rooms.debtOffice.x + 2.5;
  const blackmailCueY = rooms.debtOffice.y + 1.5;
  registerRouteCue(world, {
    id: 'floor_69_blackmail_service_route',
    x: blackmailCueX,
    y: blackmailCueY,
    targetX: roomMidX(rooms.staffLift),
    targetY: roomMidY(rooms.staffLift),
    z: FLOOR_69_BASE_FLOOR,
    label: '69: сейф/черный ход',
    hint: 'сейф компромата опасен охраной; награда - пропуск, рычаг или служебный выход',
    targetName: rooms.staffLift.name,
    color: '#f6c34a',
    tags: floor69EventTags('blackmail', 'service_route', 'access', 'map_hint'),
    toneSeed: FLOOR_69_DEFAULT_SEED + 169,
    radius: 10,
    targetRadius: 4,
    roomId: rooms.debtOffice.id,
    targetRoomId: rooms.staffLift.id,
    zoneId: world.zoneMap[world.idx(Math.floor(blackmailCueX), Math.floor(blackmailCueY))],
    heardText: 'У долговой конторы отмечен выбор: сейф дает пропуск или рычаг, но охрана записывает путь к черному ходу.',
    followedText: 'Черный ход найден: теперь решай, чем платить за маршрут - ключом, бумагой или молчанием.',
    ignoredText: 'Сейф и черный ход остались позади: короткий маршрут 69 снова проходит через пост.',
  });
}

export function applyZones(world: World): void {
  generateZones(world);
  for (const zone of world.zones) {
    zone.level = Math.max(2, Math.min(5, calcZoneLevel(zone.cx, zone.cy, FLOOR_69_BASE_FLOOR)));
    zone.faction = zone.id % 7 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.fogged = false;
  }
}

