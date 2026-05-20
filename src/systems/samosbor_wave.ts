/* ── Runtime малый/средний самосбор: bounded geometry wave ───── */

import {
  W,
  Cell,
  DoorState,
  EntityType,
  Feature,
  FloorLevel,
  RoomType,
  Tex,
  msg,
  type Entity,
  type GameState,
  type Room,
} from '../core/types';
import type { World } from '../core/world';
import { publishEvent } from './events';
import { currentFloorRunEntry, floorRunEntryKind } from './procedural_floors';
import { pruneRouteCuesInCells } from './route_cues';

export type SamosborWaveScale = 'small' | 'medium' | 'full';

export interface SamosborWaveScaleDef {
  scale: SamosborWaveScale;
  weight: number;
  radius: number;
  budgetCellsPerTick: number;
}

export const SAMOSBOR_WAVE_SCALE_DEFS: Record<SamosborWaveScale, SamosborWaveScaleDef> = {
  small: { scale: 'small', weight: 5, radius: 14, budgetCellsPerTick: 96 },
  medium: { scale: 'medium', weight: 3, radius: 28, budgetCellsPerTick: 192 },
  full: { scale: 'full', weight: 4, radius: 0, budgetCellsPerTick: 0 },
};

export interface StartSamosborWaveOptions {
  protectedRoomIds?: readonly number[];
  seed?: number;
  radius?: number;
  budgetCellsPerTick?: number;
  debug?: boolean;
}

export interface SamosborWaveTickResult {
  active: boolean;
  processed: number;
  changed: number;
  finished: boolean;
}

export interface SamosborWaveDebugSnapshot {
  active: boolean;
  scale: SamosborWaveScale;
  seed: number;
  originIdx: number;
  radius: number;
  budgetCellsPerTick: number;
  frontierLength: number;
  head: number;
  queuedCount: number;
  touchedCount: number;
  dirtyRooms: readonly number[];
  changedCells: number;
  deletedContainers: number;
  deletedItems: number;
  deletedProjectiles: number;
  relocatedEntities: number;
  prunedRouteCues: number;
  lastProcessed: number;
  lastChanged: number;
  finished: boolean;
  debug: boolean;
  queuedSample: readonly number[];
  touchedSample: readonly number[];
}

interface DirtyFlags {
  cells: boolean;
  wallTex: boolean;
  floorTex: boolean;
  fog: boolean;
  surface: boolean;
}

interface SamosborWave {
  active: boolean;
  scale: 'small' | 'medium';
  seed: number;
  originIdx: number;
  radius: number;
  budgetCellsPerTick: number;
  frontier: number[];
  head: number;
  queued: Uint8Array;
  queuedCount: number;
  touched: number[];
  dirtyRooms: number[];
  finished: boolean;
  patchRoomId: number;
  protectedRooms: Set<number>;
  floor: FloorLevel;
  startedAt: number;
  changedCells: number;
  deletedContainers: number;
  deletedItems: number;
  deletedProjectiles: number;
  relocatedEntities: number;
  prunedRouteCues: number;
  lastProcessed: number;
  lastChanged: number;
  debug: boolean;
}

type WaveRole = 'floor' | 'wall' | 'abyss' | 'door' | 'residue';

const DIR_X = [1, -1, 0, 0] as const;
const DIR_Y = [0, 0, 1, -1] as const;
const EMPTY_WAVE_RESULT: SamosborWaveTickResult = { active: false, processed: 0, changed: 0, finished: false };
const QUEUED_SAMPLE_CAP = 48;
const TICK_ENTITY_BATCH_CAP = 256;

let activeWave: SamosborWave | null = null;
let lastWaveSnapshot: SamosborWaveDebugSnapshot | null = null;

function hash32(v: number): number {
  let x = v | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function seedForWave(state: GameState, scale: 'small' | 'medium', originIdx: number): number {
  const base = ((state.samosborCount + 1) * 1_000_003 + Math.floor(state.time * 60)) | 0;
  return hash32(base ^ Math.imul(originIdx + 1, scale === 'small' ? 0x45d9f3b : 0x119de1f3));
}

function waveRole(seed: number, originIdx: number, idx: number, ring: number): WaveRole {
  if (ring <= 1) return 'floor';
  const roll = hash32(seed ^ Math.imul(idx + 17, 0x9e3779b1) ^ Math.imul(originIdx + ring + 31, 0x85ebca6b)) % 100;
  if (roll < 42) return 'floor';
  if (roll < 66) return 'residue';
  if (roll < 84) return 'wall';
  if (roll < 96) return 'abyss';
  return 'door';
}

function textureRoll(seed: number, idx: number): number {
  return hash32(seed ^ Math.imul(idx + 911, 0x27d4eb2d)) % 4;
}

function floorTexFor(seed: number, idx: number): Tex {
  switch (textureRoll(seed, idx)) {
    case 0: return Tex.F_CONCRETE;
    case 1: return Tex.F_LINO;
    case 2: return Tex.F_TILE;
    default: return Tex.F_WOOD;
  }
}

function wallTexFor(seed: number, idx: number): Tex {
  switch (textureRoll(seed, idx)) {
    case 0: return Tex.CONCRETE;
    case 1: return Tex.PANEL;
    case 2: return Tex.BRICK;
    default: return Tex.ROTTEN;
  }
}

function isStoryLivingFloor(state: GameState): boolean {
  if (state.currentFloor !== FloorLevel.LIVING) return false;
  return floorRunEntryKind(currentFloorRunEntry(state)) === 'story';
}

export function canRunSamosborWave(state: GameState): boolean {
  return isStoryLivingFloor(state);
}

export function chooseSamosborScale(state: GameState): SamosborWaveScale {
  if (!canRunSamosborWave(state)) return 'full';
  const defs = Object.values(SAMOSBOR_WAVE_SCALE_DEFS);
  let total = 0;
  for (const def of defs) total += def.weight;
  let roll = Math.random() * total;
  for (const def of defs) {
    roll -= def.weight;
    if (roll <= 0) return def.scale;
  }
  return 'full';
}

function waveOriginXY(wave: SamosborWave): { x: number; y: number } {
  return { x: wave.originIdx % W, y: (wave.originIdx / W) | 0 };
}

function toroidalRingDistance(world: World, originIdx: number, idx: number): number {
  const ox = originIdx % W;
  const oy = (originIdx / W) | 0;
  const x = idx % W;
  const y = (idx / W) | 0;
  return Math.max(Math.abs(world.delta(ox, x)), Math.abs(world.delta(oy, y)));
}

function withinWaveRadius(world: World, wave: SamosborWave, idx: number): boolean {
  const o = waveOriginXY(wave);
  const x = idx % W;
  const y = (idx / W) | 0;
  return world.dist2(o.x + 0.5, o.y + 0.5, x + 0.5, y + 0.5) <= wave.radius * wave.radius;
}

function walkableCell(cell: number): boolean {
  return cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.WATER;
}

function entityWalkableCell(cell: number): boolean {
  return cell === Cell.FLOOR || cell === Cell.WATER;
}

function doorTouchesProtectedRoom(world: World, idx: number, protectedRooms: Set<number>): boolean {
  const door = world.doors.get(idx);
  if (!door) return false;
  return protectedRooms.has(door.roomA) || protectedRooms.has(door.roomB);
}

function adjacentLiftOrProtected(world: World, idx: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let i = 0; i < DIR_X.length; i++) {
    const ni = world.idx(x + DIR_X[i], y + DIR_Y[i]);
    if (world.cells[ni] === Cell.LIFT || world.aptMask[ni] || world.hermoWall[ni]) return true;
  }
  return false;
}

function mutableCell(world: World, wave: SamosborWave, idx: number): boolean {
  if (world.aptMask[idx] || world.hermoWall[idx]) return false;
  if (world.cells[idx] === Cell.LIFT || world.features[idx] === Feature.LIFT_BUTTON) return false;
  const roomId = world.roomMap[idx];
  if (roomId >= 0 && wave.protectedRooms.has(roomId)) return false;
  if (world.cells[idx] === Cell.DOOR && doorTouchesProtectedRoom(world, idx, wave.protectedRooms)) return false;
  if (adjacentLiftOrProtected(world, idx)) return false;
  return true;
}

function anchorCell(world: World, wave: SamosborWave, idx: number): boolean {
  return mutableCell(world, wave, idx) && (world.cells[idx] === Cell.FLOOR || world.cells[idx] === Cell.WATER);
}

function findWaveOrigin(world: World, wave: SamosborWave, originX: number, originY: number): number {
  const start = world.idx(originX, originY);
  if (anchorCell(world, wave, start)) return start;
  const radius = Math.min(Math.max(8, wave.radius), 34);
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const idx = world.idx(originX + dx, originY + dy);
        if (anchorCell(world, wave, idx)) return idx;
      }
    }
  }
  return -1;
}

function pushUnique(list: number[], value: number): void {
  if (value < 0 || list.includes(value)) return;
  list.push(value);
}

function makePatchRoom(world: World, wave: Pick<SamosborWave, 'scale' | 'radius' | 'originIdx'>): number {
  const id = world.rooms.length;
  const ox = wave.originIdx % W;
  const oy = (wave.originIdx / W) | 0;
  const room: Room = {
    id,
    type: RoomType.CORRIDOR,
    x: world.wrap(ox - wave.radius),
    y: world.wrap(oy - wave.radius),
    w: wave.radius * 2 + 1,
    h: wave.radius * 2 + 1,
    doors: [],
    sealed: false,
    name: wave.scale === 'small' ? 'Малая складка самосбора' : 'Средняя складка самосбора',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  };
  world.rooms[id] = room;
  return id;
}

function enqueueCell(world: World, wave: SamosborWave, idx: number): void {
  if (wave.queued[idx]) return;
  if (!withinWaveRadius(world, wave, idx)) return;
  if (!mutableCell(world, wave, idx)) return;
  wave.queued[idx] = 1;
  wave.queuedCount++;
  wave.frontier.push(idx);
}

function enqueueNeighbors(world: World, wave: SamosborWave, idx: number): void {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let i = 0; i < DIR_X.length; i++) enqueueCell(world, wave, world.idx(x + DIR_X[i], y + DIR_Y[i]));
}

function markDirty(world: World, flags: DirtyFlags): void {
  if (flags.cells) world.markCellsDirty();
  if (flags.wallTex) world.markWallTexDirty();
  if (flags.floorTex) world.markFloorTexDirty();
  if (flags.fog) world.markFogDirty();
  if (flags.surface) world.surfaceVersion = (world.surfaceVersion + 1) | 0;
}

function noteTouched(wave: SamosborWave, idx: number): void {
  wave.touched.push(idx);
  wave.changedCells++;
}

function removeDoorFromRoom(world: World, roomId: number, idx: number): void {
  const room = roomId >= 0 ? world.rooms[roomId] : undefined;
  if (!room) return;
  const at = room.doors.indexOf(idx);
  if (at >= 0) room.doors.splice(at, 1);
}

function removeDoor(world: World, idx: number): boolean {
  const door = world.doors.get(idx);
  if (!door) return false;
  removeDoorFromRoom(world, door.roomA, idx);
  removeDoorFromRoom(world, door.roomB, idx);
  world.doors.delete(idx);
  return true;
}

function addDoorToRoom(world: World, roomId: number, idx: number): void {
  const room = roomId >= 0 ? world.rooms[roomId] : undefined;
  if (room && !room.doors.includes(idx)) room.doors.push(idx);
}

function walkableNeighborCount(world: World, idx: number): number {
  const x = idx % W;
  const y = (idx / W) | 0;
  let count = 0;
  for (let i = 0; i < DIR_X.length; i++) {
    if (walkableCell(world.cells[world.idx(x + DIR_X[i], y + DIR_Y[i])])) count++;
  }
  return count;
}

function hasFloorAnchor(world: World, idx: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  for (let i = 0; i < DIR_X.length; i++) {
    const ni = world.idx(x + DIR_X[i], y + DIR_Y[i]);
    if (world.cells[ni] === Cell.FLOOR || world.cells[ni] === Cell.WATER || world.cells[ni] === Cell.DOOR) return true;
  }
  return false;
}

function preserveExistingWalkable(world: World, idx: number): boolean {
  const cell = world.cells[idx];
  if (cell === Cell.DOOR || cell === Cell.WATER) return true;
  if (cell !== Cell.FLOOR) return false;
  if (walkableNeighborCount(world, idx) <= 2) return true;
  if (adjacentLiftOrProtected(world, idx)) return true;
  return false;
}

function cleanSolidCell(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  let changed = false;
  const roomId = world.roomMap[idx];
  pushUnique(wave.dirtyRooms, roomId);
  if (world.cells[idx] === Cell.DOOR) changed = removeDoor(world, idx) || changed;
  if (world.roomMap[idx] !== -1) {
    world.roomMap[idx] = -1;
    flags.cells = true;
    changed = true;
  }
  if (world.features[idx] !== Feature.NONE) {
    world.features[idx] = Feature.NONE;
    flags.cells = true;
    changed = true;
  }
  if (world.fog[idx] !== 0) {
    world.fog[idx] = 0;
    flags.fog = true;
    changed = true;
  }
  if (world.surfaceMap.delete(idx)) {
    flags.surface = true;
    changed = true;
  }
  return changed;
}

function applyFloor(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  if (!hasFloorAnchor(world, idx)) return applyResidue(world, wave, idx, flags);
  let changed = false;
  const oldRoom = world.roomMap[idx];
  if (world.cells[idx] === Cell.DOOR) changed = removeDoor(world, idx) || changed;
  if (world.cells[idx] !== Cell.FLOOR) {
    world.cells[idx] = Cell.FLOOR;
    flags.cells = true;
    changed = true;
  }
  const nextRoom = oldRoom >= 0 ? oldRoom : wave.patchRoomId;
  if (world.roomMap[idx] !== nextRoom) {
    pushUnique(wave.dirtyRooms, world.roomMap[idx]);
    pushUnique(wave.dirtyRooms, nextRoom);
    world.roomMap[idx] = nextRoom;
    flags.cells = true;
    changed = true;
  }
  const tex = floorTexFor(wave.seed, idx);
  if (world.floorTex[idx] !== tex) {
    world.floorTex[idx] = tex;
    flags.floorTex = true;
    changed = true;
  }
  if (world.wallTex[idx] !== Tex.CONCRETE && oldRoom < 0) {
    world.wallTex[idx] = Tex.CONCRETE;
    flags.wallTex = true;
    changed = true;
  }
  if (world.features[idx] !== Feature.NONE && oldRoom < 0) {
    world.features[idx] = Feature.NONE;
    flags.cells = true;
    changed = true;
  }
  if (changed) noteTouched(wave, idx);
  return changed;
}

function applyResidue(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  let changed = false;
  if (walkableCell(world.cells[idx])) {
    const fog = 72 + (hash32(wave.seed ^ idx) % 76);
    if (world.fog[idx] < fog) {
      world.fog[idx] = fog;
      flags.fog = true;
      changed = true;
    }
    const tex = textureRoll(wave.seed, idx) === 0 ? Tex.F_TILE : Tex.F_CONCRETE;
    if (world.floorTex[idx] !== tex) {
      world.floorTex[idx] = tex;
      flags.floorTex = true;
      changed = true;
    }
  } else if (world.cells[idx] === Cell.WALL) {
    const tex = wallTexFor(wave.seed, idx);
    if (world.wallTex[idx] !== tex) {
      world.wallTex[idx] = tex;
      flags.wallTex = true;
      changed = true;
    }
  }
  if (changed) noteTouched(wave, idx);
  return changed;
}

function applyWall(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  if (preserveExistingWalkable(world, idx)) return applyResidue(world, wave, idx, flags);
  let changed = false;
  if (world.cells[idx] !== Cell.WALL) {
    changed = cleanSolidCell(world, wave, idx, flags) || changed;
    world.cells[idx] = Cell.WALL;
    flags.cells = true;
    changed = true;
  } else {
    changed = cleanSolidCell(world, wave, idx, flags) || changed;
  }
  const tex = wallTexFor(wave.seed, idx);
  if (world.wallTex[idx] !== tex) {
    world.wallTex[idx] = tex;
    flags.wallTex = true;
    changed = true;
  }
  if (changed) noteTouched(wave, idx);
  return changed;
}

function applyAbyss(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  if (preserveExistingWalkable(world, idx)) return applyResidue(world, wave, idx, flags);
  let changed = false;
  if (world.cells[idx] !== Cell.ABYSS) {
    changed = cleanSolidCell(world, wave, idx, flags) || changed;
    world.cells[idx] = Cell.ABYSS;
    flags.cells = true;
    changed = true;
  } else {
    changed = cleanSolidCell(world, wave, idx, flags) || changed;
  }
  if (world.floorTex[idx] !== Tex.F_ABYSS) {
    world.floorTex[idx] = Tex.F_ABYSS;
    flags.floorTex = true;
    changed = true;
  }
  if (changed) noteTouched(wave, idx);
  return changed;
}

function neighborRoom(world: World, idx: number, dx: number, dy: number): number {
  const x = idx % W;
  const y = (idx / W) | 0;
  return world.roomMap[world.idx(x + dx, y + dy)];
}

function tryPatchDoorAxis(world: World, wave: SamosborWave, idx: number, ax: number, ay: number): boolean {
  const x = idx % W;
  const y = (idx / W) | 0;
  const a = world.idx(x + ax, y + ay);
  const b = world.idx(x - ax, y - ay);
  const aPatch = world.roomMap[a] === wave.patchRoomId && world.cells[a] === Cell.FLOOR;
  const bPatch = world.roomMap[b] === wave.patchRoomId && world.cells[b] === Cell.FLOOR;
  if (aPatch === bPatch) return false;
  const other = aPatch ? b : a;
  if (!walkableCell(world.cells[other]) || world.roomMap[other] === wave.patchRoomId) return false;
  const roomA = wave.patchRoomId;
  const roomB = aPatch ? neighborRoom(world, idx, -ax, -ay) : neighborRoom(world, idx, ax, ay);
  if (roomB >= 0 && wave.protectedRooms.has(roomB)) return false;
  world.doors.set(idx, { idx, state: DoorState.CLOSED, roomA, roomB, keyId: '', timer: 0 });
  addDoorToRoom(world, roomA, idx);
  addDoorToRoom(world, roomB, idx);
  return true;
}

function applyDoor(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  if (world.cells[idx] !== Cell.WALL && world.cells[idx] !== Cell.ABYSS) return applyFloor(world, wave, idx, flags);
  const madeDoor = tryPatchDoorAxis(world, wave, idx, 1, 0) || tryPatchDoorAxis(world, wave, idx, 0, 1);
  if (!madeDoor) return applyFloor(world, wave, idx, flags);
  cleanSolidCell(world, wave, idx, flags);
  world.cells[idx] = Cell.DOOR;
  world.roomMap[idx] = wave.patchRoomId;
  world.wallTex[idx] = Tex.DOOR_METAL;
  world.floorTex[idx] = Tex.F_CONCRETE;
  flags.cells = true;
  flags.wallTex = true;
  flags.floorTex = true;
  pushUnique(wave.dirtyRooms, wave.patchRoomId);
  noteTouched(wave, idx);
  return true;
}

function applyWaveCell(world: World, wave: SamosborWave, idx: number, flags: DirtyFlags): boolean {
  if (!mutableCell(world, wave, idx)) return false;
  const ring = toroidalRingDistance(world, wave.originIdx, idx);
  switch (waveRole(wave.seed, wave.originIdx, idx, ring)) {
    case 'floor':
      return applyFloor(world, wave, idx, flags);
    case 'wall':
      return applyWall(world, wave, idx, flags);
    case 'abyss':
      return applyAbyss(world, wave, idx, flags);
    case 'door':
      return applyDoor(world, wave, idx, flags);
    case 'residue':
      return applyResidue(world, wave, idx, flags);
  }
}

function nearestEntityFloor(world: World, x: number, y: number, maxRadius: number): { x: number; y: number } | null {
  const sx = world.wrap(Math.floor(x));
  const sy = world.wrap(Math.floor(y));
  const start = world.idx(sx, sy);
  if (entityWalkableCell(world.cells[start])) return { x: sx, y: sy };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = world.wrap(sx + dx);
        const ty = world.wrap(sy + dy);
        if (entityWalkableCell(world.cells[world.idx(tx, ty)])) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

function relocateEntity(world: World, entity: Entity, maxRadius: number): boolean {
  const pos = nearestEntityFloor(world, entity.x, entity.y, maxRadius);
  if (!pos) return false;
  entity.x = pos.x + 0.5;
  entity.y = pos.y + 0.5;
  return true;
}

function cleanupBatchEntities(world: World, wave: SamosborWave, entities: Entity[], touched: readonly number[]): void {
  if (touched.length === 0 && entities.length > TICK_ENTITY_BATCH_CAP) {
    const player = entities.find(e => e.type === EntityType.PLAYER && e.alive);
    if (player && !entityWalkableCell(world.cells[world.idx(Math.floor(player.x), Math.floor(player.y))]) && relocateEntity(world, player, 30)) {
      wave.relocatedEntities++;
    }
    return;
  }
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (!entity.alive) continue;
    const idx = world.idx(Math.floor(entity.x), Math.floor(entity.y));
    const inBatch = touched.includes(idx);
    if (entity.type === EntityType.PROJECTILE && inBatch) {
      entities.splice(i, 1);
      wave.deletedProjectiles++;
      continue;
    }
    if (entity.type === EntityType.PLAYER) {
      if (!entityWalkableCell(world.cells[idx]) && relocateEntity(world, entity, 30)) wave.relocatedEntities++;
      continue;
    }
    if (entity.type === EntityType.ITEM_DROP && inBatch && !entityWalkableCell(world.cells[idx])) {
      if (relocateEntity(world, entity, 14)) wave.relocatedEntities++;
      else {
        entities.splice(i, 1);
        wave.deletedItems++;
      }
    }
  }
}

function pruneScreenAndSlideCells(world: World, touchedSet: Set<number>): void {
  const oldScreens = world.screenCells.length;
  const oldSlides = world.slideCells.length;
  if (oldScreens > 0) world.screenCells = world.screenCells.filter(idx => !touchedSet.has(idx) || world.features[idx] === Feature.SCREEN);
  if (oldSlides > 0) world.slideCells = world.slideCells.filter(idx => !touchedSet.has(idx) || world.features[idx] === Feature.SLIDE);
}

function cleanupContainers(world: World, wave: SamosborWave, touchedSet: Set<number>, floor: FloorLevel): void {
  let changed = false;
  for (let i = world.containers.length - 1; i >= 0; i--) {
    const container = world.containers[i];
    if (container.floor !== floor) continue;
    const idx = world.idx(container.x, container.y);
    if (!touchedSet.has(idx)) continue;
    if (!walkableCell(world.cells[idx])) {
      world.containers.splice(i, 1);
      wave.deletedContainers++;
      changed = true;
      continue;
    }
    container.roomId = world.roomMap[idx];
    container.zoneId = world.zoneMap[idx];
    changed = true;
  }
  if (changed) world.rebuildContainerMap();
}

function cleanupFinalEntities(world: World, wave: SamosborWave, entities: Entity[], touchedSet: Set<number>): void {
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (!entity.alive) continue;
    const idx = world.idx(Math.floor(entity.x), Math.floor(entity.y));
    const inTouched = touchedSet.has(idx);
    if (entity.type === EntityType.PROJECTILE && inTouched) {
      entities.splice(i, 1);
      wave.deletedProjectiles++;
      continue;
    }
    if (entity.type === EntityType.ITEM_DROP && inTouched && !entityWalkableCell(world.cells[idx])) {
      if (relocateEntity(world, entity, 18)) wave.relocatedEntities++;
      else {
        entities.splice(i, 1);
        wave.deletedItems++;
      }
      continue;
    }
    if ((entity.type === EntityType.PLAYER || entity.type === EntityType.NPC || entity.type === EntityType.MONSTER) && !entityWalkableCell(world.cells[idx])) {
      if (relocateEntity(world, entity, 30)) wave.relocatedEntities++;
    }
  }
}

function buildSnapshot(wave: SamosborWave, active: boolean): SamosborWaveDebugSnapshot {
  return {
    active,
    scale: wave.scale,
    seed: wave.seed,
    originIdx: wave.originIdx,
    radius: wave.radius,
    budgetCellsPerTick: wave.budgetCellsPerTick,
    frontierLength: wave.frontier.length,
    head: wave.head,
    queuedCount: wave.queuedCount,
    touchedCount: wave.touched.length,
    dirtyRooms: wave.dirtyRooms.slice(0, 24),
    changedCells: wave.changedCells,
    deletedContainers: wave.deletedContainers,
    deletedItems: wave.deletedItems,
    deletedProjectiles: wave.deletedProjectiles,
    relocatedEntities: wave.relocatedEntities,
    prunedRouteCues: wave.prunedRouteCues,
    lastProcessed: wave.lastProcessed,
    lastChanged: wave.lastChanged,
    finished: wave.finished,
    debug: wave.debug,
    queuedSample: wave.frontier.slice(0, QUEUED_SAMPLE_CAP),
    touchedSample: wave.touched.slice(0, QUEUED_SAMPLE_CAP),
  };
}

export function getSamosborWaveDebugSnapshot(): SamosborWaveDebugSnapshot | null {
  if (activeWave) return buildSnapshot(activeWave, true);
  return lastWaveSnapshot;
}

export function getSamosborWaveDebugLines(): string[] {
  const snapshot = getSamosborWaveDebugSnapshot();
  if (!snapshot) return ['Волна самосбора: -'];
  const status = snapshot.active ? 'active' : snapshot.finished ? 'done' : 'idle';
  const ox = snapshot.originIdx % W;
  const oy = (snapshot.originIdx / W) | 0;
  return [
    `Волна самосбора: ${status} ${snapshot.scale} ${ox},${oy} r${snapshot.radius}`,
    `Волна frontier: ${snapshot.head}/${snapshot.frontierLength} queued=${snapshot.queuedCount} touched=${snapshot.touchedCount} budget=${snapshot.budgetCellsPerTick}`,
    `Волна cleanup: containers-${snapshot.deletedContainers} items-${snapshot.deletedItems} proj-${snapshot.deletedProjectiles} cues-${snapshot.prunedRouteCues} reloc=${snapshot.relocatedEntities}`,
  ];
}

export function isSamosborWaveActive(): boolean {
  return activeWave?.active === true;
}

export function isSamosborWaveDebugActive(): boolean {
  return activeWave?.debug === true;
}

export function cancelSamosborWave(): void {
  if (activeWave) {
    activeWave.active = false;
    activeWave.finished = true;
    lastWaveSnapshot = buildSnapshot(activeWave, false);
  }
  activeWave = null;
}

export function startSamosborWave(
  world: World,
  entities: readonly Entity[],
  state: GameState,
  scale: SamosborWaveScale,
  originX: number,
  originY: number,
  options: StartSamosborWaveOptions = {},
): boolean {
  if (scale === 'full' || !canRunSamosborWave(state)) return false;
  cancelSamosborWave();
  const def = SAMOSBOR_WAVE_SCALE_DEFS[scale];
  const protectedRooms = new Set<number>();
  for (const roomId of options.protectedRoomIds ?? []) if (roomId >= 0) protectedRooms.add(roomId);
  const player = entities.find(e => e.type === EntityType.PLAYER && e.alive);
  const playerRoomId = player ? world.roomMap[world.idx(Math.floor(player.x), Math.floor(player.y))] : -1;
  if (playerRoomId >= 0) protectedRooms.add(playerRoomId);

  const originIdx = world.idx(originX, originY);
  const wave: SamosborWave = {
    active: true,
    scale,
    seed: options.seed ?? seedForWave(state, scale, originIdx),
    originIdx,
    radius: Math.max(3, options.radius ?? def.radius),
    budgetCellsPerTick: Math.max(1, options.budgetCellsPerTick ?? def.budgetCellsPerTick),
    frontier: [],
    head: 0,
    queued: new Uint8Array(W * W),
    queuedCount: 0,
    touched: [],
    dirtyRooms: [],
    finished: false,
    patchRoomId: -1,
    protectedRooms,
    floor: state.currentFloor,
    startedAt: state.time,
    changedCells: 0,
    deletedContainers: 0,
    deletedItems: 0,
    deletedProjectiles: 0,
    relocatedEntities: 0,
    prunedRouteCues: 0,
    lastProcessed: 0,
    lastChanged: 0,
    debug: options.debug === true,
  };

  const anchorIdx = findWaveOrigin(world, wave, originX, originY);
  if (anchorIdx < 0) return false;
  wave.originIdx = anchorIdx;
  wave.seed = options.seed ?? seedForWave(state, scale, anchorIdx);
  wave.patchRoomId = makePatchRoom(world, wave);
  activeWave = wave;
  enqueueCell(world, wave, anchorIdx);
  enqueueNeighbors(world, wave, anchorIdx);

  const ax = anchorIdx % W;
  const ay = (anchorIdx / W) | 0;
  state.msgs.push(msg(
    scale === 'small'
      ? `Малый самосбор пошёл волной от ${ax},${ay}.`
      : `Средний самосбор пошёл волной от ${ax},${ay}.`,
    state.time,
    '#c8f',
  ));
  publishEvent(state, {
    type: 'room_regrown',
    x: ax,
    y: ay,
    severity: scale === 'small' ? 3 : 4,
    privacy: 'public',
    tags: ['samosbor', 'wave', 'start', scale],
    data: { scale, radius: wave.radius, budgetCellsPerTick: wave.budgetCellsPerTick, seed: wave.seed },
  });
  lastWaveSnapshot = buildSnapshot(wave, true);
  return true;
}

export function tickSamosborWave(world: World, entities: Entity[], state: GameState): SamosborWaveTickResult {
  const wave = activeWave;
  if (!wave?.active) return EMPTY_WAVE_RESULT;
  if (wave.floor !== state.currentFloor) {
    cancelSamosborWave();
    return { active: false, processed: 0, changed: 0, finished: true };
  }

  const flags: DirtyFlags = { cells: false, wallTex: false, floorTex: false, fog: false, surface: false };
  const batchTouched: number[] = [];
  let processed = 0;
  let changed = 0;
  while (processed < wave.budgetCellsPerTick && wave.head < wave.frontier.length) {
    const idx = wave.frontier[wave.head++];
    processed++;
    if (!withinWaveRadius(world, wave, idx)) continue;
    if (applyWaveCell(world, wave, idx, flags)) {
      changed++;
      batchTouched.push(idx);
    }
    enqueueNeighbors(world, wave, idx);
  }
  markDirty(world, flags);
  cleanupBatchEntities(world, wave, entities, batchTouched);
  wave.lastProcessed = processed;
  wave.lastChanged = changed;
  lastWaveSnapshot = buildSnapshot(wave, true);

  if (wave.head >= wave.frontier.length) {
    finishSamosborWave(world, entities, state);
    return { active: false, processed, changed, finished: true };
  }
  return { active: true, processed, changed, finished: false };
}

export function finishSamosborWave(world: World, entities: Entity[], state: GameState): SamosborWaveDebugSnapshot | null {
  const wave = activeWave;
  if (!wave) return lastWaveSnapshot;
  const touchedSet = new Set(wave.touched);
  cleanupContainers(world, wave, touchedSet, state.currentFloor);
  cleanupFinalEntities(world, wave, entities, touchedSet);
  pruneScreenAndSlideCells(world, touchedSet);
  wave.prunedRouteCues += pruneRouteCuesInCells(world, touchedSet);
  wave.active = false;
  wave.finished = true;
  lastWaveSnapshot = buildSnapshot(wave, false);
  activeWave = null;

  const ox = wave.originIdx % W;
  const oy = (wave.originIdx / W) | 0;
  publishEvent(state, {
    type: 'room_regrown',
    x: ox,
    y: oy,
    severity: wave.scale === 'small' ? 3 : 4,
    privacy: 'public',
    tags: ['samosbor', 'wave', 'finish', wave.scale],
    data: {
      scale: wave.scale,
      touchedCells: wave.touched.length,
      changedCells: wave.changedCells,
      dirtyRooms: wave.dirtyRooms.slice(0, 16),
      deletedContainers: wave.deletedContainers,
      deletedItems: wave.deletedItems,
      deletedProjectiles: wave.deletedProjectiles,
      prunedRouteCues: wave.prunedRouteCues,
      relocatedEntities: wave.relocatedEntities,
    },
  });
  return lastWaveSnapshot;
}

export function debugStartSamosborWaveAtPlayer(
  world: World,
  player: Entity,
  entities: Entity[],
  state: GameState,
  scale: 'small' | 'medium' = 'small',
): string[] {
  const started = startSamosborWave(world, entities, state, scale, Math.floor(player.x), Math.floor(player.y), {
    debug: true,
    seed: 0x51a0b0,
  });
  if (!started) return ['wave start failed: story LIVING floor or mutable floor anchor required'];
  const tick = tickSamosborWave(world, entities, state);
  const snapshot = getSamosborWaveDebugSnapshot();
  return [
    `wave ${scale} origin=${snapshot ? `${snapshot.originIdx % W},${(snapshot.originIdx / W) | 0}` : '-'}`,
    `frontier=${snapshot?.head ?? 0}/${snapshot?.frontierLength ?? 0} touched=${snapshot?.touchedCount ?? 0}`,
    `budget=${snapshot?.budgetCellsPerTick ?? 0} processed=${tick.processed} changed=${tick.changed}`,
  ];
}

export function classifySamosborWaveCellForTests(seed: number, originIdx: number, idx: number, ring: number): WaveRole {
  return waveRole(seed, originIdx, idx, ring);
}
