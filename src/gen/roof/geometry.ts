/* -- Design z: Крыша ---------------------------------------
 * Route id roof, z=+50. Self-contained authored generator with a
 * dynamic sky provider consumed through the generic WebGL ceiling slot.
 */

import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  W,
  Cell,
  DoorState,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  type TerritoryOwner,
  ZoneFaction,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { registerRouteCue } from '../../systems/route_cues';
import {
  stampRoom,
} from '../shared';

import {
  ROOF_BASE_FLOOR,
  ROOF_SKY_WIDTH,
  ROOF_SKY_HEIGHT,
  CX,
  CY,
  SKY_CELL,
  SKY_GRID_W,
  SKY_GRID_H,
  ROOF_LOS_RAY_MAX,
  ROOF_LOS_SHELTER_MIN_SPACING,
  ROOF_TERRITORY_TARGETS,
  RoofHqSpec} from './index';
import {
  roofRoomPressureFaction,
  paintRoofPressureRoom} from './npcs';

export interface RoofSkyTint {
  r: number;
  g: number;
  b: number;
}

export interface RoofSkyTextureProvider {
  readonly width: typeof ROOF_SKY_WIDTH;
  readonly height: typeof ROOF_SKY_HEIGHT;
  readonly pixels: Uint32Array;
  readonly updateInterval: number;
  dirty: boolean;
  timeOfDay: number;
  ambientTint: RoofSkyTint;
  fogTint: RoofSkyTint;
  update(deltaSeconds: number): boolean;
  cycleTime(hours: number): void;
}

export interface RoofTerritorySeed {
  owner: TerritoryOwner;
  x: number;
  y: number;
  radius: number;
}

export interface RoofIsland {
  room: Room;
  cx: number;
  cy: number;
}

export interface RoofShelterIndex {
  bucketSize: number;
  radius: number;
  side: number;
  shelterCells: number;
  buckets: number[][];
}

export function applyRoofTerritoryField(world: World): void {
  const seeds = roofTerritorySeeds(world);
  const bias = new Float64Array(8);
  const counts = new Uint32Array(8);
  let sampleTotal = 0;

  for (const target of ROOF_TERRITORY_TARGETS) bias[target.owner] = target.share * 1.8;
  for (let iter = 0; iter < 10; iter++) {
    counts.fill(0);
    sampleTotal = 0;
    for (let y = 0; y < W; y += 4) {
      for (let x = 0; x < W; x += 4) {
        counts[roofTerritoryOwnerForCell(world, x, y, seeds, bias)]++;
        sampleTotal++;
      }
    }
    for (const target of ROOF_TERRITORY_TARGETS) {
      const share = sampleTotal > 0 ? counts[target.owner] / sampleTotal : 0;
      bias[target.owner] += (target.share - share) * 2.75;
    }
  }

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const ci = world.idx(x, y);
      world.factionControl[ci] = roofTerritoryOwnerForCell(world, x, y, seeds, bias);
    }
  }

  for (const room of world.rooms) {
    const roomFaction = roofRoomPressureFaction(room);
    const roomLevel = room.type === RoomType.PRODUCTION ? 5 : room.type === RoomType.HQ ? 4 : room.sealed ? 2 : 3;
    paintRoofPressureRoom(world, room, roomFaction, roomLevel);
  }

  for (const seed of seeds) {
    paintRoofOwnerPatch(world, seed.x, seed.y, seed.owner, Math.min(30, Math.max(8, Math.floor(seed.radius / 7))));
  }
}

export function roofTerritorySeeds(world: World): RoofTerritorySeed[] {
  const seeds: RoofTerritorySeed[] = [];
  for (const room of world.rooms) {
    const owner = roofRoomPressureFaction(room);
    if (!ROOF_TERRITORY_TARGETS.some(target => target.owner === owner)) continue;
    if (room.type !== RoomType.HQ && room.type !== RoomType.PRODUCTION && room.type !== RoomType.OFFICE && room.type !== RoomType.MEDICAL) continue;
    seeds.push({
      owner,
      x: world.wrap(room.x + (room.w >> 1)),
      y: world.wrap(room.y + (room.h >> 1)),
      radius: room.type === RoomType.HQ ? 225 : room.type === RoomType.PRODUCTION ? 150 : 118,
    });
  }

  const fallback: readonly RoofTerritorySeed[] = [
    { owner: ZoneFaction.CITIZEN, x: 214, y: 730, radius: 240 },
    { owner: ZoneFaction.LIQUIDATOR, x: 766, y: 234, radius: 275 },
    { owner: ZoneFaction.CULTIST, x: 812, y: 736, radius: 145 },
    { owner: ZoneFaction.SCIENTIST, x: 484, y: 154, radius: 180 },
    { owner: ZoneFaction.WILD, x: 146, y: 270, radius: 170 },
  ];
  for (const target of ROOF_TERRITORY_TARGETS) {
    if (seeds.some(seed => seed.owner === target.owner)) continue;
    const seed = fallback.find(candidate => candidate.owner === target.owner);
    if (seed) seeds.push(seed);
  }
  return seeds;
}

export function roofTerritoryOwnerForCell(
  world: World,
  x: number,
  y: number,
  seeds: readonly RoofTerritorySeed[],
  bias: Float64Array,
): TerritoryOwner {
  let best = ZoneFaction.CITIZEN as TerritoryOwner;
  let bestScore = Infinity;
  for (const target of ROOF_TERRITORY_TARGETS) {
    let d = Infinity;
    for (const seed of seeds) {
      if (seed.owner !== target.owner) continue;
      const score = Math.sqrt(world.dist2(x, y, seed.x, seed.y)) / seed.radius;
      if (score < d) d = score;
    }
    const score = d - bias[target.owner] + roofTerritoryNoise(x, y, target.owner);
    if (score < bestScore) {
      bestScore = score;
      best = target.owner;
    }
  }
  return best;
}

export function roofTerritoryNoise(x: number, y: number, owner: TerritoryOwner): number {
  const coarse = hash01((x / 42) | 0, (y / 42) | 0, owner * 991 + 17);
  const block = hash01((x / 96) | 0, (y / 96) | 0, owner * 577 + 41);
  return (coarse - 0.5) * 0.18 + (block - 0.5) * 0.22;
}

export function paintRoofOwnerPatch(world: World, x: number, y: number, owner: TerritoryOwner, radius: number): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(x + dx, y + dy);
      if (world.aptMask[ci]) continue;
      world.factionControl[ci] = owner;
    }
  }
}

export function clampSignalQuality(value: number): number {
  return Math.max(0, Math.min(5, value | 0));
}

export function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function packRgba(r: number, g: number, b: number, a = 255): number {
  const rr = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const gg = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const bb = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  const aa = a < 0 ? 0 : a > 255 ? 255 : a | 0;
  return ((aa << 24) | (bb << 16) | (gg << 8) | rr) >>> 0;
}

export function hash01(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  n = (n ^ (n >> 13)) * 1103515245;
  n ^= n >> 16;
  return (n & 0x7fff) / 0x7fff;
}

export function isRoofLosOpenCell(world: World, idx: number): boolean {
  const cell = world.cells[idx];
  return cell === Cell.FLOOR || cell === Cell.WATER;
}

export function roofVisibleSteps(world: World, x: number, y: number, dx: number, dy: number): number {
  let steps = 0;
  for (let step = 1; step <= ROOF_LOS_RAY_MAX; step++) {
    if (!isRoofLosOpenCell(world, world.idx(x + dx * step, y + dy * step))) break;
    steps++;
  }
  return steps;
}

export function isDeliberateRoofExposure(world: World, idx: number): boolean {
  const roomId = world.roomMap[idx];
  const room = roomId >= 0 ? world.rooms[roomId] : undefined;
  return room?.type === RoomType.HQ || room?.name.includes('снайпер') === true;
}

export function isRoofExposureShelterCell(world: World, idx: number): boolean {
  return world.cells[idx] === Cell.WALL &&
    world.hermoWall[idx] === 0 &&
    (world.wallTex[idx] === Tex.PIPE ||
      world.wallTex[idx] === Tex.HERMO_WALL ||
      world.wallTex[idx] === Tex.METAL);
}

export function createRoofShelterIndex(world: World, radius: number): RoofShelterIndex {
  const bucketSize = Math.max(1, ROOF_LOS_SHELTER_MIN_SPACING);
  const side = Math.ceil(W / bucketSize);
  const index: RoofShelterIndex = {
    bucketSize,
    radius,
    side,
    shelterCells: 0,
    buckets: Array.from({ length: side * side }, () => []),
  };
  for (let i = 0; i < W * W; i++) {
    if (!isRoofExposureShelterCell(world, i)) continue;
    addRoofShelterCell(index, i % W, (i / W) | 0);
  }
  return index;
}

export function addRoofShelterCell(index: RoofShelterIndex, x: number, y: number): void {
  const wx = x & (W - 1);
  const wy = y & (W - 1);
  const bx = Math.floor(wx / index.bucketSize);
  const by = Math.floor(wy / index.bucketSize);
  index.buckets[by * index.side + bx].push(wy * W + wx);
  index.shelterCells++;
}

export function hasRoofExposureShelterNear(world: World, index: RoofShelterIndex, x: number, y: number): boolean {
  const radius = index.radius;
  const radius2 = radius * radius;
  const bx = Math.floor((x & (W - 1)) / index.bucketSize);
  const by = Math.floor((y & (W - 1)) / index.bucketSize);
  const bucketRange = Math.ceil(radius / index.bucketSize);
  for (let dy = -bucketRange; dy <= bucketRange; dy++) {
    const yy = (by + dy + index.side) % index.side;
    for (let dx = -bucketRange; dx <= bucketRange; dx++) {
      const xx = (bx + dx + index.side) % index.side;
      const bucket = index.buckets[yy * index.side + xx];
      for (let i = 0; i < bucket.length; i++) {
        const cell = bucket[i];
        const sx = cell % W;
        const sy = (cell / W) | 0;
        if (world.dist2(x, y, sx, sy) <= radius2) return true;
      }
    }
  }
  return false;
}

export function placeRoofExposureShelterNear(world: World, x: number, y: number, rng: () => number): number[] | null {
  for (let radius = 0; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cells = placeRoofExposureShelter(world, x + dx, y + dy, rng);
        if (cells) return cells;
      }
    }
  }
  return null;
}

export function placeRoofExposureShelter(world: World, x: number, y: number, rng: () => number): number[] | null {
  const horizontalSight = roofVisibleSteps(world, x, y, 1, 0) + roofVisibleSteps(world, x, y, -1, 0);
  const verticalSight = roofVisibleSteps(world, x, y, 0, 1) + roofVisibleSteps(world, x, y, 0, -1);
  const offsets = horizontalSight >= verticalSight
    ? [[0, -1], [0, 0], [0, 1]] as const
    : [[-1, 0], [0, 0], [1, 0]] as const;
  const useLine = countRoofOpenNeighbors(world, x, y, 2) >= 11;
  const cells = useLine ? offsets : [[0, 0]] as const;
  for (const [dx, dy] of cells) {
    if (!canPlaceRoofExposureShelterCell(world, x + dx, y + dy)) return null;
  }

  const texRoll = rng();
  const tex = texRoll < 0.28 ? Tex.HERMO_WALL : texRoll < 0.64 ? Tex.PIPE : Tex.METAL;
  const placed: number[] = [];
  for (const [dx, dy] of cells) {
    const ci = world.idx(x + dx, y + dy);
    world.cells[ci] = Cell.WALL;
    world.roomMap[ci] = -1;
    world.wallTex[ci] = tex;
    world.features[ci] = Feature.NONE;
    world.hermoWall[ci] = 0;
    placed.push(ci);
  }
  setFeatureIfFloor(world, x + 1, y + 1, rng() < 0.5 ? Feature.MACHINE : Feature.SHELF);
  setFeatureIfFloor(world, x - 1, y - 1, Feature.APPARATUS);
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 3.8, 0.14, Math.floor(rng() * 1_000_000), 60, 66, 72, false);
  return placed;
}

export function canPlaceRoofExposureShelterCell(world: World, x: number, y: number): boolean {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return false;
  if (world.features[ci] !== Feature.NONE) return false;
  if (world.doors.has(ci) || world.containerMap.has(ci)) return false;
  if (world.hermoWall[ci] || world.aptMask[ci]) return false;
  const roomId = world.roomMap[ci];
  const room = roomId >= 0 ? world.rooms[roomId] : undefined;
  if (room?.sealed || room?.type === RoomType.CORRIDOR) return false;
  return true;
}

export function countRoofOpenNeighbors(world: World, x: number, y: number, radius: number): number {
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (isRoofLosOpenCell(world, world.idx(x + dx, y + dy))) count++;
    }
  }
  return count;
}

export function buildRoofKeepMask(world: World): Uint8Array {
  const keep = new Uint8Array(W * W);
  for (const room of world.rooms) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        keep[world.idx(x, y)] = 1;
      }
    }
  }
  for (const idx of world.doors.keys()) keep[idx] = 1;
  for (const container of world.containers) keep[world.idx(container.x, container.y)] = 1;
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT || world.features[i] === Feature.LIFT_BUTTON) keep[i] = 1;
  }
  return keep;
}

export function clearRoofVoid(world: World, keep: Uint8Array): void {
  for (let i = 0; i < W * W; i++) {
    if (keep[i]) continue;
    world.cells[i] = Cell.ABYSS;
    world.roomMap[i] = -1;
    world.wallTex[i] = Tex.DARK;
    world.floorTex[i] = Tex.F_ABYSS;
    world.features[i] = Feature.NONE;
    world.hermoWall[i] = 0;
  }
}

export function placeSolidRoofLine(
  world: World,
  keep: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  tex: Tex,
): void {
  const steps = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay));
  const r2 = width * width;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const cx = Math.round(ax + (bx - ax) * t);
    const cy = Math.round(ay + (by - ay) * t);
    
    for (let dy = -width; dy <= width; dy++) {
      for (let dx = -width; dx <= width; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const ci = world.idx(cx + dx, cy + dy);
        if (keep[ci] || world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) continue;
        world.cells[ci] = Cell.WALL;
        world.roomMap[ci] = -1;
        world.wallTex[ci] = tex;
        world.features[ci] = Feature.NONE;
      }
    }
  }
}

export function placeRoofMegastructureGrid(world: World, keep: Uint8Array, rng: () => number): void {
  // Generate massive cross-map structural beams to fill the abyss with real architectural geometry
  const numBeams = 180;
  for (let i = 0; i < numBeams; i++) {
    const isHorizontal = rng() < 0.5;
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * W);
    const length = 200 + Math.floor(rng() * 400);
    const thickness = 2 + Math.floor(rng() * 8);
    const tex = rng() < 0.4 ? Tex.PIPE : Tex.CONCRETE;
    
    const ax = x;
    const ay = y;
    const bx = isHorizontal ? x + length : x;
    const by = isHorizontal ? y : y + length;
    
    placeSolidRoofLine(world, keep, ax, ay, bx, by, thickness, tex);
  }
  
  // Diagonal support struts
  const numStruts = 120;
  for (let i = 0; i < numStruts; i++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * W);
    const length = 100 + Math.floor(rng() * 300);
    const thickness = 1 + Math.floor(rng() * 4);
    const signX = rng() < 0.5 ? 1 : -1;
    const signY = rng() < 0.5 ? 1 : -1;
    
    placeSolidRoofLine(world, keep, x, y, x + length * signX, y + length * signY, thickness, Tex.METAL);
  }
  
  // Giant cylindrical cooling towers/silos in the deep abyss
  const numTowers = 50;
  for (let i = 0; i < numTowers; i++) {
    const cx = Math.floor(rng() * W);
    const cy = Math.floor(rng() * W);
    if (world.dist(cx, cy, CX, CY) < 150) continue; // Keep center clear
    const r = 8 + Math.floor(rng() * 12);
    const tex = rng() < 0.5 ? Tex.CONCRETE : Tex.METAL;
    
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const ci = world.idx(cx + dx, cy + dy);
        if (keep[ci] || world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) continue;
        world.cells[ci] = Cell.WALL;
        world.roomMap[ci] = -1;
        world.wallTex[ci] = tex;
        world.features[ci] = Feature.NONE;
      }
    }
  }
}

export function placeCrashedProbe(world: World, keep: Uint8Array, rng: () => number, routeRooms: Room[]): void {
  // Find a clear spot
  let cx = 0, cy = 0;
  for (let i = 0; i < 50; i++) {
    cx = 150 + Math.floor(rng() * (W - 300));
    cy = 150 + Math.floor(rng() * (W - 300));
    if (world.dist(cx, cy, CX, CY) < 250) continue;
    
    let overlaps = 0;
    for (let dy = -25; dy <= 25; dy++) {
      for (let dx = -25; dx <= 25; dx++) {
        if (keep[world.idx(cx + dx, cy + dy)]) overlaps++;
      }
    }
    if (overlaps < 50) break;
    cx = 0;
  }
  
  if (cx === 0) return; // Failed to find spot
  
  // Create crater (scorched concrete)
  for (let dy = -20; dy <= 20; dy++) {
    for (let dx = -20; dx <= 20; dx++) {
      if (dx*dx + dy*dy > 400) continue;
      const ci = world.idx(cx + dx, cy + dy);
      if (keep[ci]) continue;
      
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = Tex.F_CONCRETE;
      world.wallTex[ci] = Tex.CONCRETE;
      
      if (rng() < 0.05) world.features[ci] = Feature.MACHINE;
    }
  }
  
  // The Probe hull (solid metal block)
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -7; dx <= 7; dx++) {
      if (dx*dx + dy*dy > 49) continue;
      const ci = world.idx(cx + dx, cy + dy);
      world.cells[ci] = Cell.WALL;
      world.roomMap[ci] = -1;
      world.wallTex[ci] = Tex.METAL;
    }
  }
  
  // The Probe interior (playable room)
  const probeRoom: Room = {
    id: world.rooms.length,
    x: cx - 4,
    y: cy - 4,
    w: 9,
    h: 9,
    type: RoomType.PRODUCTION,
    name: "Рухнувший стратосферный зонд",
    doors: [],
    sealed: false,
    ceilingTier: 3,
    apartmentId: -1,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE
  };
  world.rooms.push(probeRoom);
  routeRooms.push(probeRoom);
  
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx*dx + dy*dy > 16) continue;
      const ci = world.idx(cx + dx, cy + dy);
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = probeRoom.id;
      world.floorTex[ci] = Tex.F_CONCRETE;
    }
  }
  
  // Broken entrance (carve a path out of the hull)
  const angle = rng() * Math.PI * 2;
  const ex = Math.round(Math.cos(angle) * 2);
  const ey = Math.round(Math.sin(angle) * 2);
  for (let step = 4; step <= 8; step++) {
    const pX = cx + Math.round(ex * step * 0.5);
    const pY = cy + Math.round(ey * step * 0.5);
    for (const [ox, oy] of [[0,0], [1,0], [0,1], [-1,0], [0,-1]]) {
      const ci = world.idx(pX + ox, pY + oy);
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = probeRoom.id;
      world.floorTex[ci] = Tex.F_CONCRETE;
    }
  }
  
  // Add rare tech
  world.features[world.idx(cx, cy)] = Feature.APPARATUS;
  world.features[world.idx(cx + 1, cy)] = Feature.SCREEN;
  world.features[world.idx(cx - 1, cy)] = Feature.SCREEN;
  world.features[world.idx(cx, cy + 1)] = Feature.MACHINE;
}

export function addRoofIsland(
  world: World,
  keep: Uint8Array,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): RoofIsland {
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

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (keep[ci]) continue;
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = room.id;
      world.floorTex[ci] = floorTex;
      world.wallTex[ci] = wallTex;
      world.features[ci] = Feature.NONE;
    }
  }

  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue;
      const ci = world.idx(room.x + dx, room.y + dy);
      if (keep[ci] || world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) continue;
      world.cells[ci] = Cell.WALL;
      world.roomMap[ci] = -1;
      world.wallTex[ci] = wallTex;
      world.floorTex[ci] = floorTex;
      world.features[ci] = Feature.NONE;
    }
  }

  return { room, cx: room.x + (room.w >> 1), cy: room.y + (room.h >> 1) };
}

export function connectRoofWalk(
  world: World,
  keep: Uint8Array,
  a: RoofIsland,
  b: RoofIsland,
  width: number,
  horizontalFirst: boolean,
): void {
  carveRoofWalk(world, keep, a.cx, a.cy, b.cx, b.cy, width, horizontalFirst);
}

export function carveRoofWalk(
  world: World,
  keep: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  horizontalFirst: boolean,
): void {
  const ddx = Math.round(world.delta(ax, bx));
  const ddy = Math.round(world.delta(ay, by));
  const tx = ax + ddx;
  const ty = ay + ddy;
  let x = ax;
  let y = ay;
  const stepX = ddx === 0 ? 0 : ddx > 0 ? 1 : -1;
  const stepY = ddy === 0 ? 0 : ddy > 0 ? 1 : -1;

  const carveX = (): void => {
    while (x !== tx) {
      carveRoofWalkDisc(world, keep, x, y, width);
      x += stepX;
    }
    carveRoofWalkDisc(world, keep, x, y, width);
  };
  const carveY = (): void => {
    while (y !== ty) {
      carveRoofWalkDisc(world, keep, x, y, width);
      y += stepY;
    }
    carveRoofWalkDisc(world, keep, x, y, width);
  };

  if (horizontalFirst) {
    carveX();
    carveY();
  } else {
    carveY();
    carveX();
  }
}

export function carveRoofWalkDisc(world: World, keep: Uint8Array, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const ci = world.idx(cx + dx, cy + dy);
      if (keep[ci]) continue;
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = Tex.F_CONCRETE;
      world.wallTex[ci] = Tex.CONCRETE;
      world.features[ci] = Feature.NONE;
      world.hermoWall[ci] = 0;
    }
  }
}

export function placeRoofSniperLane(world: World, keep: Uint8Array, ax: number, ay: number, bx: number, by: number): void {
  carveRoofWalk(world, keep, ax, ay, bx, by, 3, true);
  const ddx = Math.round(world.delta(ax, bx));
  const ddy = Math.round(world.delta(ay, by));
  const steps = Math.max(Math.abs(ddx), Math.abs(ddy), 1);
  for (let step = 10; step < steps; step += 16) {
    const x = ax + Math.round((ddx * step) / steps);
    const y = ay + Math.round((ddy * step) / steps);
    const ci = world.idx(x, y);
    if (keep[ci] || world.cells[ci] !== Cell.FLOOR) continue;
    stampSurfaceSplat(world, x, y, 0.5, 0.5, 3.5, 0.18, x * 97 + y * 131, 30, 34, 38, false);
    if (((step / 16) | 0) % 2 === 0) placeRoofShedBlock(world, keep, x - 1, y - 2, 3, 2, Tex.METAL);
    else setFeatureIfFloor(world, x, y, Feature.APPARATUS);
  }
}

export function placeLargeAntennaCluster(world: World, x: number, y: number): void {
  for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [5, 4], [-5, -4]] as const) {
    placeAntennaMast(world, x + dx, y + dy);
  }
  for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2], [7, 0], [-7, 0]] as const) {
    setFeatureIfFloor(world, x + dx, y + dy, Feature.APPARATUS);
  }
  stampSurfaceSplat(world, x, y, 0.5, 0.5, 8, 0.16, x * 19 + y * 23, 84, 92, 96, false);
}

export function placeRoofShedBlock(world: World, keep: Uint8Array, x: number, y: number, w: number, h: number, tex: Tex): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (keep[ci] || world.cells[ci] !== Cell.FLOOR) continue;
      world.cells[ci] = Cell.WALL;
      world.roomMap[ci] = -1;
      world.wallTex[ci] = tex;
      world.features[ci] = Feature.NONE;
    }
  }
  setRoofFeatureIfFree(world, keep, x - 1, y + (h >> 1), Feature.MACHINE);
  setRoofFeatureIfFree(world, keep, x + w, y + (h >> 1), Feature.SHELF);
}

export function placeRoofSkylightPit(world: World, keep: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (keep[ci] || world.cells[ci] !== Cell.FLOOR) continue;
      world.cells[ci] = Cell.ABYSS;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.wallTex[ci] = Tex.DARK;
      world.features[ci] = Feature.NONE;
    }
  }
  stampSurfaceSplat(world, x + (w >> 1), y + (h >> 1), 0.5, 0.5, Math.max(w, h) + 1, 0.22, x * 53 + y * 61, 118, 126, 132, false);
}

export function placeWaterTankCluster(world: World, keep: Uint8Array, x: number, y: number): void {
  for (let dy = 0; dy < 12; dy += 4) {
    for (let dx = 0; dx < 18; dx += 5) {
      const ci = world.idx(x + dx, y + dy);
      if (keep[ci]) continue;
      setWaterTank(world, x + dx, y + dy);
    }
  }
}

export function scatterRoofMachinery(world: World, keep: Uint8Array, rng: () => number, islands: readonly RoofIsland[]): void {
  for (const island of islands) {
    const room = island.room;
    const count = Math.max(3, Math.floor((room.w * room.h) / 820));
    for (let i = 0; i < count; i++) {
      const x = room.x + 3 + Math.floor(rng() * Math.max(1, room.w - 6));
      const y = room.y + 3 + Math.floor(rng() * Math.max(1, room.h - 6));
      const ci = world.idx(x, y);
      if (keep[ci] || world.cells[ci] !== Cell.FLOOR || world.features[ci] !== Feature.NONE) continue;
      const roll = rng();
      world.features[ci] = roll < 0.42 ? Feature.APPARATUS : roll < 0.72 ? Feature.MACHINE : Feature.SHELF;
      if (rng() < 0.28) stampSurfaceSplat(world, x, y, 0.5, 0.5, 2.2 + rng() * 3.4, 0.14, Math.floor(rng() * 100000), 58, 64, 68, false);
    }
  }
}

export function placeRoofWideDeckNetwork(world: World, keep: Uint8Array, rng: () => number): void {
  const ring = [
    [72, 72],
    [952, 72],
    [952, 952],
    [72, 952],
    [72, 72],
  ] as const;
  for (let i = 1; i < ring.length; i++) {
    carveRoofLineDirect(world, keep, ring[i - 1][0], ring[i - 1][1], ring[i][0], ring[i][1], 6);
  }

  for (const y of [144, 272, 400, 528, 656, 784, 912]) {
    carveRoofLineDirect(world, keep, 72, y + Math.floor(rng() * 9) - 4, 952, y + Math.floor(rng() * 9) - 4, 4);
  }
  for (const x of [112, 240, 368, 512, 640, 768, 896]) {
    carveRoofLineDirect(world, keep, x + Math.floor(rng() * 9) - 4, 72, x + Math.floor(rng() * 9) - 4, 952, 4);
  }

  carveRoofLineDirect(world, keep, CX, 64, CX, 960, 7);
  carveRoofLineDirect(world, keep, 64, CY, 960, CY, 7);
  carveRoofLineDirect(world, keep, 122, 122, 900, 900, 3);
  carveRoofLineDirect(world, keep, 900, 122, 122, 900, 3);

  for (const [x, y, w, h] of [
    [262, 266, 18, 10],
    [726, 248, 20, 12],
    [406, 678, 22, 14],
    [612, 796, 18, 12],
    [852, 534, 16, 10],
    [168, 554, 18, 12],
  ] as const) {
    placeRoofSkylightPit(world, keep, x, y, w, h);
  }
}

export function carveRoofLineDirect(
  world: World,
  keep: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
): void {
  const steps = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    carveRoofWalkDisc(
      world,
      keep,
      Math.round(ax + (bx - ax) * t),
      Math.round(ay + (by - ay) * t),
      width,
    );
  }
}

export function placeRoofFactionHqClusters(world: World, keep: Uint8Array, rng: () => number): Room[] {
  const specs: readonly RoofHqSpec[] = [
    { owner: ZoneFaction.LIQUIDATOR, x: 766, y: 234, name: 'ликвидаторов', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { owner: ZoneFaction.CITIZEN, x: 214, y: 730, name: 'граждан', wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    { owner: ZoneFaction.SCIENTIST, x: 484, y: 154, name: 'учёных НИИ', wallTex: Tex.PANEL, floorTex: Tex.F_TILE },
    { owner: ZoneFaction.CULTIST, x: 812, y: 736, name: 'культистов', wallTex: Tex.CONCRETE, floorTex: Tex.F_CONCRETE, ruined: true },
    { owner: ZoneFaction.WILD, x: 146, y: 270, name: 'диких', wallTex: Tex.CONCRETE, floorTex: Tex.F_CONCRETE, ruined: true },
  ];
  const out: Room[] = [];

  for (const spec of specs) {
    const core = addRoofServiceRoom(world, keep, RoomType.HQ, spec.x, spec.y, spec.ruined ? 15 : 21, spec.ruined ? 11 : 15, `Крыша: миништаб ${spec.name}`, spec.wallTex, spec.floorTex, true);
    const common = addRoofServiceRoom(world, keep, RoomType.COMMON, spec.x - 21, spec.y + 2, 16, 10, `Крыша: общая ${spec.name}`, spec.wallTex, spec.floorTex);
    const storage = addRoofServiceRoom(world, keep, RoomType.STORAGE, spec.x + 23, spec.y + 3, 15, 10, `Крыша: склад ${spec.name}`, spec.wallTex, Tex.F_CONCRETE);
    const office = addRoofServiceRoom(world, keep, spec.owner === ZoneFaction.SCIENTIST ? RoomType.MEDICAL : RoomType.OFFICE, spec.x + 4, spec.y - 16, 17, 10, `Крыша: ${spec.owner === ZoneFaction.SCIENTIST ? 'медпост' : 'контора'} ${spec.name}`, spec.wallTex, spec.floorTex);
    const kitchen = addRoofServiceRoom(world, keep, RoomType.KITCHEN, spec.x - 4, spec.y + 19, 14, 9, `Крыша: кухня ${spec.name}`, spec.wallTex, Tex.F_TILE);
    const bath = addRoofServiceRoom(world, keep, RoomType.BATHROOM, spec.x + 16, spec.y + 19, 10, 8, `Крыша: туалет ${spec.name}`, Tex.TILE_W, Tex.F_TILE);
    for (const room of [core, common, storage, office, kitchen, bath]) {
      if (!room) continue;
      decorateRoofServiceRoom(world, room, rng);
      out.push(room);
    }
  }

  for (const [x, y, label] of [[880, 352, 'верхний'], [664, 386, 'нижний'], [884, 646, 'дальний']] as const) {
    const outpost = addRoofServiceRoom(world, keep, RoomType.HQ, x, y, 16, 10, `Крыша: ${label} пост ликвидаторов`, Tex.METAL, Tex.F_CONCRETE, label !== 'дальний');
    const storage = addRoofServiceRoom(world, keep, RoomType.STORAGE, x + 19, y + 1, 12, 8, `Крыша: ${label} ящик ликвидаторов`, Tex.METAL, Tex.F_CONCRETE);
    for (const room of [outpost, storage]) {
      if (!room) continue;
      decorateRoofServiceRoom(world, room, rng);
      out.push(room);
    }
  }
  return out;
}

export function placeRoofOpenDeckLayer(world: World, keep: Uint8Array, rng: () => number): Room[] {
  const out: Room[] = [];
  let serial = 1;
  for (const y of [176, 320, 464, 608, 752, 896]) {
    for (const x of [176, 320, 464, 608, 752, 896]) {
      const voidCourt = (serial % 9 === 0) || (x === 608 && y === 608) || (x === 320 && y === 464);
      carveRoofLineDirect(world, keep, x - 52, y, x + 52, y, 2);
      carveRoofLineDirect(world, keep, x, y - 42, x, y + 42, 2);
      carveRoofLineDirect(world, keep, x - 38, y - 30, x + 38, y + 30, 1);
      carveRoofLineDirect(world, keep, x - 38, y + 30, x + 38, y - 30, 1);
      carveRoofBayLoop(world, keep, x, y);
      carveRoofBaySpurs(world, keep, x, y, serial);
      if (voidCourt) placeRoofSkylightPit(world, keep, x - 15, y - 10, 30, 20);

      const rooms = [
        { dx: -42, dy: -30, w: 18, h: 12, type: RoomType.STORAGE, name: 'будка', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
        { dx: -16, dy: -34, w: 22, h: 14, type: RoomType.COMMON, name: 'открытая плита', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
        { dx: 22, dy: -28, w: 20, h: 12, type: RoomType.PRODUCTION, name: 'антенный шкаф', wall: Tex.METAL, z: Tex.F_CONCRETE },
        { dx: -38, dy: 18, w: 16, h: 10, type: RoomType.KITCHEN, name: 'чайная будка', wall: Tex.TILE_W, z: Tex.F_TILE },
        { dx: -10, dy: 18, w: 18, h: 10, type: RoomType.BATHROOM, name: 'туалетная будка', wall: Tex.TILE_W, z: Tex.F_TILE },
        { dx: 18, dy: 16, w: 24, h: 14, type: RoomType.OFFICE, name: 'вахта', wall: Tex.PANEL, z: Tex.F_LINO },
        { dx: -58, dy: -5, w: 12, h: 9, type: RoomType.STORAGE, name: 'краевая кладовка', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
        { dx: 48, dy: -7, w: 13, h: 9, type: RoomType.STORAGE, name: 'краевой шкаф', wall: Tex.METAL, z: Tex.F_CONCRETE },
        { dx: -7, dy: -8, w: 13, h: 10, type: RoomType.COMMON, name: 'переходная будка', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
        { dx: 34, dy: 34, w: 14, h: 9, type: RoomType.PRODUCTION, name: 'кабельный пост', wall: Tex.METAL, z: Tex.F_CONCRETE },
        { dx: -54, dy: 33, w: 12, h: 8, type: RoomType.OFFICE, name: 'наблюдательная ниша', wall: Tex.PANEL, z: Tex.F_LINO },
      ] as const;

      for (let i = 0; i < rooms.length; i++) {
        if (voidCourt && i === 1) continue;
        if (i < 6 && (serial + i) % 11 === 0) continue;
        if (i >= 6 && (serial + i) % 17 === 0) continue;
        const spec = rooms[i];
        const room = addRoofServiceRoom(
          world,
          keep,
          spec.type,
          x + spec.dx + Math.floor(rng() * 7) - 3,
          y + spec.dy + Math.floor(rng() * 7) - 3,
          spec.w,
          spec.h,
          `Крыша: ${spec.name} ${serial}.${i + 1}`,
          spec.wall,
          spec.z,
        );
        if (room) {
          decorateRoofOpenDeck(world, room, rng);
          out.push(room);
        }
      }
      placeRoofBayInfillRooms(world, keep, rng, x, y, serial, out);
      carveRoofBayComb(world, keep, x, y);
      carveRoofBayLoop(world, keep, x, y);
      carveRoofBaySpurs(world, keep, x, y, serial + 3);
      serial++;
    }
  }
  return out;
}

export function carveRoofBayLoop(world: World, keep: Uint8Array, x: number, y: number): void {
  carveRoofLineDirect(world, keep, x - 62, y - 42, x + 62, y - 42, 1);
  carveRoofLineDirect(world, keep, x + 62, y - 42, x + 62, y + 42, 1);
  carveRoofLineDirect(world, keep, x + 62, y + 42, x - 62, y + 42, 1);
  carveRoofLineDirect(world, keep, x - 62, y + 42, x - 62, y - 42, 1);
}

export function carveRoofBaySpurs(world: World, keep: Uint8Array, x: number, y: number, serial: number): void {
  const north = y - 70;
  const south = y + 70;
  const west = x - 70;
  const east = x + 70;
  carveRoofLineDirect(world, keep, x - 22, y - 42, x - 22, north, 1);
  carveRoofLineDirect(world, keep, x + 24, y + 42, x + 24, south, 1);
  carveRoofLineDirect(world, keep, x - 62, y + 16, west, y + 16, 1);
  carveRoofLineDirect(world, keep, x + 62, y - 18, east, y - 18, 1);
  if (serial % 2 === 0) carveRoofLineDirect(world, keep, x - 48, y - 24, x + 48, y + 24, 1);
  else carveRoofLineDirect(world, keep, x - 48, y + 24, x + 48, y - 24, 1);
}

export function placeRoofBayInfillRooms(
  world: World,
  keep: Uint8Array,
  rng: () => number,
  x: number,
  y: number,
  serial: number,
  out: Room[],
): void {
  const rooms = [
    { dx: -61, dy: -38, w: 11, h: 7, type: RoomType.STORAGE, name: 'угловая будка', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
    { dx: -36, dy: -48, w: 12, h: 8, type: RoomType.OFFICE, name: 'смотровая щель', wall: Tex.PANEL, z: Tex.F_LINO },
    { dx: 5, dy: -47, w: 11, h: 8, type: RoomType.STORAGE, name: 'верхний шкаф', wall: Tex.METAL, z: Tex.F_CONCRETE },
    { dx: 45, dy: -42, w: 10, h: 8, type: RoomType.PRODUCTION, name: 'верхний пост', wall: Tex.METAL, z: Tex.F_CONCRETE },
    { dx: -56, dy: -22, w: 12, h: 7, type: RoomType.COMMON, name: 'левая келья', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
    { dx: -33, dy: -14, w: 11, h: 8, type: RoomType.STORAGE, name: 'левая кладовая', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
    { dx: 12, dy: -12, w: 11, h: 8, type: RoomType.STORAGE, name: 'средний шкаф', wall: Tex.METAL, z: Tex.F_CONCRETE },
    { dx: 43, dy: 6, w: 12, h: 8, type: RoomType.KITCHEN, name: 'правая чайная', wall: Tex.TILE_W, z: Tex.F_TILE },
    { dx: -60, dy: 8, w: 10, h: 8, type: RoomType.BATHROOM, name: 'левый санузел', wall: Tex.TILE_W, z: Tex.F_TILE },
    { dx: -32, dy: 6, w: 12, h: 8, type: RoomType.OFFICE, name: 'малый пост', wall: Tex.PANEL, z: Tex.F_LINO },
    { dx: 4, dy: 5, w: 10, h: 8, type: RoomType.COMMON, name: 'средняя будка', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
    { dx: 48, dy: 24, w: 10, h: 8, type: RoomType.STORAGE, name: 'правая ниша', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
    { dx: -36, dy: 34, w: 11, h: 8, type: RoomType.PRODUCTION, name: 'нижний кабель', wall: Tex.METAL, z: Tex.F_CONCRETE },
    { dx: -4, dy: 35, w: 10, h: 8, type: RoomType.STORAGE, name: 'нижняя кладовая', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
    { dx: 22, dy: 36, w: 10, h: 8, type: RoomType.COMMON, name: 'нижняя будка', wall: Tex.CONCRETE, z: Tex.F_CONCRETE },
  ] as const;

  for (let i = 0; i < rooms.length; i++) {
    if ((serial + i) % 19 === 0) continue;
    const spec = rooms[i];
    const room = addRoofServiceRoom(
      world,
      keep,
      spec.type,
      x + spec.dx + Math.floor(rng() * 5) - 2,
      y + spec.dy + Math.floor(rng() * 5) - 2,
      spec.w,
      spec.h,
      `Крыша: ${spec.name} ${serial}.${i + 1}`,
      spec.wall,
      spec.z,
    );
    if (!room) continue;
    decorateRoofServiceRoom(world, room, rng);
    out.push(room);
  }
}

export function carveRoofBayComb(world: World, keep: Uint8Array, x: number, y: number): void {
  for (const yy of [y - 24, y - 10, y + 10, y + 26]) {
    carveRoofLineDirect(world, keep, x - 61, yy, x + 61, yy, 0);
  }
  for (const xx of [x - 42, x - 18, x + 16, x + 42]) {
    carveRoofLineDirect(world, keep, xx, y - 41, xx, y + 41, 0);
  }
}

export function decorateRoofOpenDeck(world: World, room: Room, rng: () => number): void {
  for (let x = room.x + 8; x < room.x + room.w - 8; x += 14) {
    setFeatureIfFloor(world, x, room.y + 5, rng() < 0.5 ? Feature.APPARATUS : Feature.SHELF);
    setFeatureIfFloor(world, x + 3, room.y + room.h - 6, Feature.MACHINE);
  }
  if (room.name.includes('открытая плита') && room.w >= 18 && room.h >= 12) {
    placeBrokenSkylight(world, room.x + (room.w >> 1) - 2, room.y + (room.h >> 1) - 1, 4, 3);
  }
}

export function placeRoofMidServiceLayer(world: World, keep: Uint8Array, rng: () => number): Room[] {
  const out: Room[] = [];
  let serial = 1;
  for (const y of [122, 250, 378, 506, 634, 762, 890]) {
    for (const x of [122, 278, 434, 590, 746, 902]) {
      if ((x === 434 || x === 590) && (y === 506 || y === 634)) continue;
      const roll = (serial + Math.floor(rng() * 4)) % 6;
      const type = roll === 0 ? RoomType.PRODUCTION
        : roll === 1 ? RoomType.STORAGE
          : roll === 2 ? RoomType.OFFICE
            : roll === 3 ? RoomType.COMMON
              : roll === 4 ? RoomType.KITCHEN
                : RoomType.CORRIDOR;
      const w = 38 + ((serial * 5) % 21);
      const h = 22 + ((serial * 7) % 15);
      const room = addRoofServiceRoom(
        world,
        keep,
        type,
        x - (w >> 1) + Math.floor(rng() * 9) - 4,
        y - (h >> 1) + Math.floor(rng() * 9) - 4,
        w,
        h,
        `Крыша: сервисная станция ${serial}`,
        type === RoomType.KITCHEN ? Tex.TILE_W : type === RoomType.PRODUCTION ? Tex.METAL : Tex.CONCRETE,
        type === RoomType.KITCHEN ? Tex.F_TILE : Tex.F_CONCRETE,
      );
      if (room) {
        decorateRoofServiceRoom(world, room, rng);
        out.push(room);
      }
      serial++;
    }
  }
  return out;
}

export function placeRoofMicroLayer(world: World, keep: Uint8Array, rng: () => number): Room[] {
  const out: Room[] = [];
  let serial = 1;
  for (const y of [96, 192, 288, 384, 480, 576, 672, 768, 864, 944]) {
    for (const x of [96, 192, 288, 384, 480, 576, 672, 768, 864, 944]) {
      if (world.dist(x, y, CX, CY) < 92) continue;
      if (serial % 7 === 0) {
        serial++;
        continue;
      }
      const typeRoll = serial % 8;
      const type = typeRoll === 0 ? RoomType.BATHROOM
        : typeRoll === 1 ? RoomType.KITCHEN
          : typeRoll === 2 || typeRoll === 3 ? RoomType.STORAGE
            : typeRoll === 4 ? RoomType.OFFICE
              : typeRoll === 5 ? RoomType.PRODUCTION
                : RoomType.COMMON;
      const w = 8 + (serial % 5) * 2;
      const h = 7 + (serial % 4) * 2;
      const room = addRoofServiceRoom(
        world,
        keep,
        type,
        x - (w >> 1) + Math.floor(rng() * 13) - 6,
        y - (h >> 1) + Math.floor(rng() * 13) - 6,
        w,
        h,
        `Крыша: будка ${serial}`,
        type === RoomType.BATHROOM || type === RoomType.KITCHEN ? Tex.TILE_W : type === RoomType.PRODUCTION ? Tex.METAL : Tex.CONCRETE,
        type === RoomType.BATHROOM || type === RoomType.KITCHEN ? Tex.F_TILE : Tex.F_CONCRETE,
      );
      if (room) {
        decorateRoofServiceRoom(world, room, rng);
        out.push(room);
      }
      serial++;
    }
  }
  return out;
}

export function addRoofServiceRoom(
  world: World,
  keep: Uint8Array,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  sealed = false,
): Room | null {
  const rx = Math.max(3, Math.min(W - w - 4, Math.round(x)));
  const ry = Math.max(3, Math.min(W - h - 4, Math.round(y)));
  if (!canStampRoofServiceRoom(world, rx, ry, w, h)) return null;
  const room = stampRoofRoom(world, type, rx, ry, w, h, name, wallTex, floorTex, sealed);
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) keep[world.idx(rx + dx, ry + dy)] = 1;
  }
  return room;
}

export function canStampRoofServiceRoom(world: World, x: number, y: number, w: number, h: number): boolean {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.aptMask[ci] || world.cells[ci] === Cell.LIFT || world.cells[ci] === Cell.DOOR) return false;
      if (world.doors.has(ci) || world.containerMap.has(ci)) return false;
      if (world.roomMap[ci] >= 0) return false;
    }
  }
  return true;
}

export function decorateRoofServiceRoom(world: World, room: Room, rng: () => number): void {
  switch (room.type) {
    case RoomType.HQ:
      setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.SCREEN);
      setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.DESK);
      setFeatureIfFloor(world, room.x + (room.w >> 1), room.y + room.h - 3, Feature.TABLE);
      break;
    case RoomType.KITCHEN:
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 4) setFeatureIfFloor(world, x, room.y + 2, Feature.STOVE);
      setFeatureIfFloor(world, room.x + 2, room.y + room.h - 3, Feature.SINK);
      break;
    case RoomType.BATHROOM:
      setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.SINK);
      setFeatureIfFloor(world, room.x + room.w - 3, room.y + room.h - 3, Feature.TOILET);
      break;
    case RoomType.OFFICE:
    case RoomType.MEDICAL:
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 5) setFeatureIfFloor(world, x, room.y + 2, Feature.DESK);
      setFeatureIfFloor(world, room.x + room.w - 3, room.y + room.h - 3, room.type === RoomType.MEDICAL ? Feature.SINK : Feature.SHELF);
      break;
    case RoomType.PRODUCTION:
      for (let y = room.y + 2; y < room.y + room.h - 2; y += 4) {
        for (let x = room.x + 2; x < room.x + room.w - 2; x += 5) {
          setFeatureIfFloor(world, x, y, rng() < 0.5 ? Feature.MACHINE : Feature.APPARATUS);
        }
      }
      break;
    case RoomType.STORAGE:
      for (let x = room.x + 2; x < room.x + room.w - 2; x += 3) setFeatureIfFloor(world, x, room.y + 2, Feature.SHELF);
      break;
    default:
      setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.TABLE);
      setFeatureIfFloor(world, room.x + room.w - 3, room.y + room.h - 3, Feature.CHAIR);
      break;
  }
}

export function normalizeRoofDoorHardware(world: World): void {
  for (const door of world.doors.values()) {
    world.hermoWall[door.idx] = 0;
    world.wallTex[door.idx] = Tex.DOOR_METAL;
    const a = door.roomA >= 0 ? world.rooms[door.roomA] : undefined;
    const b = door.roomB >= 0 ? world.rooms[door.roomB] : undefined;
    if (a?.sealed || b?.sealed) door.state = DoorState.HERMETIC_CLOSED;
  }
}

export function setRoofFeatureIfFree(world: World, keep: Uint8Array, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (keep[ci]) return;
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

export function skyAmbientTint(timeOfDay: number): RoofSkyTint {
  const day = Math.max(0, Math.sin(Math.PI * wrap01(timeOfDay)));
  const dusk = Math.max(0, Math.sin(Math.PI * 2 * wrap01(timeOfDay) - Math.PI * 0.15));
  return {
    r: Math.round(44 + day * 92 + dusk * 24),
    g: Math.round(52 + day * 98 + dusk * 10),
    b: Math.round(70 + day * 108 - dusk * 18),
  };
}

export function skyFogTint(timeOfDay: number): RoofSkyTint {
  const ambient = skyAmbientTint(timeOfDay);
  return {
    r: Math.round(ambient.r * 0.42),
    g: Math.round(ambient.g * 0.45),
    b: Math.round(ambient.b * 0.58),
  };
}

export function diffuseRoofClouds(cloud: Float32Array, scratch: Float32Array, seed: number): void {
  for (let y = 0; y < SKY_GRID_H; y++) {
    const ym = y > 0 ? y - 1 : SKY_GRID_H - 1;
    const yp = y + 1 < SKY_GRID_H ? y + 1 : 0;
    for (let x = 0; x < SKY_GRID_W; x++) {
      const xm = x > 0 ? x - 1 : SKY_GRID_W - 1;
      const xp = x + 1 < SKY_GRID_W ? x + 1 : 0;
      const i = y * SKY_GRID_W + x;
      const avg = (
        cloud[ym * SKY_GRID_W + x] +
        cloud[yp * SKY_GRID_W + x] +
        cloud[y * SKY_GRID_W + xm] +
        cloud[y * SKY_GRID_W + xp]
      ) * 0.25;
      const wind = cloud[y * SKY_GRID_W + xm] * 0.06;
      const spark = hash01(x, y, seed) > 0.985 ? 0.28 : 0;
      scratch[i] = clamp01(cloud[i] * 0.82 + avg * 0.1 + wind + spark - 0.015);
    }
  }
  cloud.set(scratch);
}

export function rebuildRoofSkyPixels(provider: RoofSkyTextureProvider, cloud: Float32Array, seed: number): void {
  const ambient = skyAmbientTint(provider.timeOfDay);
  provider.ambientTint = ambient;
  provider.fogTint = skyFogTint(provider.timeOfDay);
  const day = Math.max(0.08, Math.sin(Math.PI * provider.timeOfDay));
  const horizon = Math.max(0, 1 - Math.abs(provider.timeOfDay - 0.5) * 3.2);

  for (let y = 0; y < ROOF_SKY_HEIGHT; y++) {
    const gy = Math.min(SKY_GRID_H - 1, (y / SKY_CELL) | 0);
    const vertical = y / Math.max(1, ROOF_SKY_HEIGHT - 1);
    for (let x = 0; x < ROOF_SKY_WIDTH; x++) {
      const gx = (x / SKY_CELL) | 0;
      const c = cloud[gy * SKY_GRID_W + gx];
      const hardEdge = hash01(gx, gy, seed) > 0.58 ? 0.06 : -0.04;
      const density = clamp01((c + hardEdge - 0.42) * 2.35);
      const skyR = ambient.r * (0.62 + vertical * 0.22) + horizon * 18;
      const skyG = ambient.g * (0.64 + vertical * 0.18) + horizon * 10;
      const skyB = ambient.b * (0.72 + vertical * 0.16) + horizon * 5;
      const cloudR = 158 + day * 72;
      const cloudG = 166 + day * 66;
      const cloudB = 178 + day * 52;
      const r = skyR * (1 - density) + cloudR * density;
      const g = skyG * (1 - density) + cloudG * density;
      const b = skyB * (1 - density) + cloudB * density;
      provider.pixels[y * ROOF_SKY_WIDTH + x] = packRgba(r, g, b);
    }
  }
}

export function stampRoofRooms(world: World): Record<string, Room> {
  return {
    entry: stampRoofRoom(world, RoomType.CORRIDOR, CX - 9, CY + 34, 15, 10, 'Лифтовая голова крыши', Tex.CONCRETE, Tex.F_CONCRETE, true),
    mainSlab: stampRoofRoom(world, RoomType.COMMON, CX - 30, CY - 15, 60, 38, 'Главная плита крыши', Tex.CONCRETE, Tex.F_CONCRETE),
    meteorology: stampRoofRoom(world, RoomType.OFFICE, CX - 51, CY - 10, 16, 12, 'Пустая метеобудка', Tex.PANEL, Tex.F_LINO),
    riggerMast: stampRoofRoom(world, RoomType.PRODUCTION, CX + 35, CY - 14, 18, 14, 'Оборванная сигнальная мачта', Tex.METAL, Tex.F_CONCRETE),
    ventShelter: stampRoofRoom(world, RoomType.STORAGE, CX - 9, CY + 26, 20, 13, 'Вентиляционное укрытие', Tex.HERMO_WALL, Tex.F_CONCRETE, true),
    waterTanks: stampRoofRoom(world, RoomType.STORAGE, CX + 16, CY + 25, 17, 13, 'Баковая площадка', Tex.PIPE, Tex.F_WATER),
    sniperNest: stampRoofRoom(world, RoomType.HQ, CX + 39, CY + 7, 14, 11, 'Пустое снайперское гнездо', Tex.METAL, Tex.F_CONCRETE),
    cloudCamp: stampRoofRoom(world, RoomType.STORAGE, CX - 47, CY - 28, 13, 9, 'Угол повторного облака', Tex.PANEL, Tex.F_CARPET),
    maintenanceHatch: stampRoofRoom(world, RoomType.CORRIDOR, CX - 49, CY + 20, 13, 9, 'Сервисный люк вниз', Tex.CONCRETE, Tex.F_CONCRETE, true),
  };
}

export function stampRoofRoom(
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
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  room.sealed = sealed;

  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        world.floorTex[ci] = floorTex;
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
        if (sealed) world.hermoWall[ci] = 1;
      }
    }
  }
  return room;
}

export function closeShelterDoors(world: World, room: Room): void {
  for (const doorIdx of room.doors) {
    const door = world.doors.get(doorIdx);
    if (!door) continue;
    door.state = DoorState.HERMETIC_CLOSED;
    const ci = door.idx;
    world.wallTex[ci] = Tex.DOOR_METAL;
  }
}

export function retuneRoofZones(world: World, rooms: Record<string, Room>): void {
  world.factionControl.fill(ZoneFaction.CITIZEN);
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    zone.level = d < 80 ? 4 : 3;
    zone.faction = ZoneFaction.CITIZEN;
    zone.fogged = false;
  }
  paintRoomFaction(world, rooms.sniperNest, ZoneFaction.LIQUIDATOR);
  paintRoomFaction(world, rooms.riggerMast, ZoneFaction.CITIZEN);
  paintRoomFaction(world, rooms.meteorology, ZoneFaction.CITIZEN);
  paintRoomFaction(world, rooms.cloudCamp, ZoneFaction.WILD);
  paintRoomFaction(world, rooms.waterTanks, ZoneFaction.CITIZEN);
}

export function paintRoomFaction(world: World, room: Room, faction: ZoneFaction): void {
  const zid = world.zoneMap[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))];
  if (world.zones[zid]) world.zones[zid].faction = faction;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      world.factionControl[world.idx(room.x + dx, room.y + dy)] = faction;
    }
  }
}

export function decorateRoof(world: World, rooms: Record<string, Room>): void {
  placeSlabLandmarks(world, rooms.mainSlab);
  decorateMeteorology(world, rooms.meteorology);
  decorateRiggerMast(world, rooms.riggerMast);
  decorateVentShelter(world, rooms.ventShelter);
  decorateWaterTanks(world, rooms.waterTanks);
  decorateSniperNest(world, rooms.sniperNest);
  decorateCloudCamp(world, rooms.cloudCamp);

  setFeatureIfFloor(world, rooms.entry.x + 5, rooms.entry.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, rooms.entry.x + 8, rooms.entry.y + 2, Feature.SCREEN);
  setFeatureIfFloor(world, rooms.maintenanceHatch.x + 3, rooms.maintenanceHatch.y + 2, Feature.APPARATUS);
}

export function placeSlabLandmarks(world: World, room: Room): void {
  for (let dx = 5; dx < room.w - 4; dx += 9) placeAntennaMast(world, room.x + dx, room.y + 5);
  for (let dx = 7; dx < room.w - 4; dx += 11) placeVentBlock(world, room.x + dx, room.y + room.h - 8);
  for (let dx = 4; dx < room.w - 4; dx += 8) setFeatureIfFloor(world, room.x + dx, room.y + 2, Feature.APPARATUS);
  for (let dx = 8; dx < room.w - 7; dx += 13) setFeatureIfFloor(world, room.x + dx, room.y + room.h - 3, Feature.MACHINE);
  placeBrokenSkylight(world, room.x + 18, room.y + 16, 4, 3);
  placeBrokenSkylight(world, room.x + 41, room.y + 20, 3, 3);
  stampSurfaceSplat(world, room.x + 12, room.y + 9, 0.5, 0.5, 5, 0.18, 4099, 55, 62, 66, false);
  stampSurfaceSplat(world, room.x + 43, room.y + 9, 0.5, 0.5, 4, 0.18, 4101, 80, 82, 78, false);
}

export function decorateMeteorology(world: World, room: Room): void {
  for (let dx = 2; dx < room.w - 2; dx += 3) setFeatureIfFloor(world, room.x + dx, room.y + 2, Feature.DESK);
  setFeatureIfFloor(world, room.x + 2, room.y + room.h - 3, Feature.SCREEN);
  setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, room.x + room.w - 4, room.y + room.h - 3, Feature.APPARATUS);
  world.wallTex[world.idx(room.x + 8, room.y - 1)] = Tex.SCREEN_BASE + 7;
  if (!world.screenCells.includes(world.idx(room.x + 8, room.y - 1))) world.screenCells.push(world.idx(room.x + 8, room.y - 1));
}

export function decorateRiggerMast(world: World, room: Room): void {
  for (let dy = 3; dy < room.h - 2; dy += 4) placeAntennaMast(world, room.x + 9, room.y + dy);
  for (let dx = 2; dx < room.w - 2; dx += 4) setFeatureIfFloor(world, room.x + dx, room.y + room.h - 2, Feature.MACHINE);
  setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.APPARATUS);
}

export function decorateVentShelter(world: World, room: Room): void {
  for (let dx = 2; dx < room.w - 2; dx += 4) {
    setFeatureIfFloor(world, room.x + dx, room.y + 2, Feature.MACHINE);
    setFeatureIfFloor(world, room.x + dx, room.y + room.h - 3, Feature.SHELF);
  }
  setFeatureIfFloor(world, room.x + 2, room.y + room.h - 2, Feature.SHELF);
  setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.MACHINE);
}

export function decorateWaterTanks(world: World, room: Room): void {
  for (let dx = 2; dx < room.w - 2; dx += 5) {
    for (let dy = 2; dy < room.h - 2; dy += 4) {
      setWaterTank(world, room.x + dx, room.y + dy);
    }
  }
  setFeatureIfFloor(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SINK);
  setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.SHELF);
}

export function decorateSniperNest(world: World, room: Room): void {
  for (let dx = 2; dx < room.w - 2; dx++) setFeatureIfFloor(world, room.x + dx, room.y + 2, Feature.TABLE);
  setFeatureIfFloor(world, room.x + 2, room.y + room.h - 3, Feature.SHELF);
  setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.APPARATUS);
  setFeatureIfFloor(world, room.x + room.w - 4, room.y + room.h - 3, Feature.CHAIR);
  stampSurfaceSplat(world, room.x + 6, room.y + 4, 0.5, 0.5, 3, 0.24, 4112, 30, 30, 32, false);
}

export function decorateCloudCamp(world: World, room: Room): void {
  setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.BED);
  setFeatureIfFloor(world, room.x + 5, room.y + 3, Feature.TABLE);
  setFeatureIfFloor(world, room.x + 8, room.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, room.x + room.w - 3, room.y + room.h - 3, Feature.SHELF);
}

export function applyUniformSkyLight(world: World): void {
  for (let i = 0; i < W * W; i++) {
    if (world.features[i] === Feature.LAMP || world.features[i] === Feature.CANDLE) {
      world.features[i] = Feature.NONE;
    }
  }
  world.light.fill(0.94);
}

export function registerRoofWindShelterCue(world: World, rooms: Record<string, Room>): void {
  const cueX = rooms.entry.x + 8.5;
  const cueY = rooms.entry.y + 3.5;
  const shelterX = rooms.ventShelter.x + rooms.ventShelter.w / 2;
  const shelterY = rooms.ventShelter.y + rooms.ventShelter.h / 2;
  registerRouteCue(world, {
    id: 'roof_wind_vent_shelter',
    x: cueX,
    y: cueY,
    targetX: shelterX,
    targetY: shelterY,
    z: ROOF_BASE_FLOOR,
    label: 'Ветер крыши',
    hint: 'ветер режет открытую плиту; вентиляционное укрытие ниже по проходу',
    targetName: 'Вентиляционное укрытие',
    color: '#9cf',
    tags: ['roof', 'wind', 'shelter', 'samosbor'],
    toneSeed: 44_044,
    radius: 12,
    targetRadius: 3.8,
    cooldownSec: 22,
    roomId: rooms.entry.id,
    targetRoomId: rooms.ventShelter.id,
    heardText: 'Ветер тянет к гермодвери: вентиляционное укрытие переживет верхний самосбор.',
    followedText: 'Шум ветра стихает в вентиляционном укрытии. Здесь можно переждать верхний самосбор.',
    ignoredText: 'Открытый бетон остался за спиной, но укрытие крыши не проверено.',
  });
}

export function placeAntennaMast(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.cells[ci] = Cell.WALL;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = Tex.METAL;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    setFeatureIfFloor(world, x + dx, y + dy, Feature.APPARATUS);
  }
}

export function placeVentBlock(world: World, x: number, y: number): void {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] !== Cell.FLOOR) continue;
      world.cells[ci] = Cell.WALL;
      world.roomMap[ci] = -1;
      world.wallTex[ci] = Tex.PIPE;
    }
  }
}

export function placeBrokenSkylight(world: World, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (world.cells[ci] !== Cell.FLOOR) continue;
      world.cells[ci] = Cell.ABYSS;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.roomMap[ci] = -1;
      world.features[ci] = Feature.NONE;
    }
  }
  stampSurfaceSplat(world, x + (w >> 1), y + (h >> 1), 0.5, 0.5, Math.max(w, h) + 1, 0.2, x * 17 + y * 31, 120, 128, 134, false);
}

export function setWaterTank(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  world.cells[ci] = Cell.WATER;
  world.floorTex[ci] = Tex.F_WATER;
  world.features[ci] = Feature.SINK;
}

export function setFeatureIfFloor(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

export function placeFixedLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
  const bi = world.idx(x + 1, y);
  if (world.cells[bi] === Cell.FLOOR) {
    world.features[bi] = Feature.LIFT_BUTTON;
    world.liftDir[bi] = direction;
  }
}

