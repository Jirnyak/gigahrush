import { Cell, Feature, FloorLevel, RoomType, W, type Room } from '../core/types';
import { World } from '../core/world';
import type { DesignFloorRouteDef } from '../data/design_floors';
import {
  floorObjectProfileForDesignFloor,
  floorObjectProfileForProceduralFloor,
  floorObjectProfileForStoryFloor,
  type BrokenFixturePlacementRule,
  type FeaturePlacementRule,
  type FloorObjectPlacementProfile,
  type InteractivePlacementRule,
  type RoomWeightedPlacementRule,
} from '../data/floor_object_placement';
import type { ProceduralFloorSpec } from '../data/procedural_floors';
import type { CraftStationPlacementSummary } from './craft_stations';
import { placeCraftStationsWithProfile } from './craft_stations';
import { maybePlaceBrokenFixture } from './interactive_fixtures';
import { placeInteractiveAt } from './interactive_placement';
import { isConnectivityWalkable } from './shared';

interface ObjectCandidate {
  room: Room;
  idx: number;
  x: number;
  y: number;
  score: number;
}

export interface FloorObjectPlacementSummary {
  profileId: string;
  features: Record<string, number>;
  interactives: Record<string, number>;
  brokenFixtures: Record<string, number>;
  craftStations?: CraftStationPlacementSummary;
}

function hash32(seed: number, a: number, b = 0, c = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (a + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (b + 0x27d4eb2d), 0x165667b1) >>> 0;
  h = Math.imul(h ^ (c + 0xd3a2646c), 0x9e3779b1) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function reachableFrom(world: World, spawnX: number, spawnY: number): Uint8Array {
  const reachable = new Uint8Array(W * W);
  const start = world.idx(Math.floor(spawnX), Math.floor(spawnY));
  if (!isConnectivityWalkable(world, start)) return reachable;
  const queue = new Int32Array(W * W);
  let head = 0;
  let tail = 0;
  reachable[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const ci = queue[head++];
    const x = ci % W;
    const y = (ci / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (reachable[ni] || !isConnectivityWalkable(world, ni)) continue;
      reachable[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return reachable;
}

function placementTarget(rule: RoomWeightedPlacementRule, roomCount: number): number {
  const cap = Math.max(0, Math.floor(rule.max));
  if (cap <= 0 || roomCount <= 0) return 0;
  const divisor = Math.max(1, Math.floor(rule.roomDivisor));
  const byRooms = Math.floor(roomCount / divisor);
  return Math.min(cap, Math.max(0, Math.floor(rule.min), byRooms));
}

function ruleRoomWeight(rule: RoomWeightedPlacementRule, room: Room): number {
  return Math.max(0, rule.roomTypeWeights[room.type] ?? 0);
}

function eligibleRooms(rooms: readonly Room[], rule: RoomWeightedPlacementRule): Room[] {
  return rooms.filter(room =>
    room &&
    !room.sealed &&
    room.apartmentId < 0 &&
    room.type !== RoomType.CORRIDOR &&
    room.w >= 4 &&
    room.h >= 4 &&
    ruleRoomWeight(rule, room) > 0,
  );
}

function featureCellValid(
  world: World,
  room: Room,
  idx: number,
  reachable: Uint8Array,
  rule: FeaturePlacementRule | InteractivePlacementRule,
): boolean {
  if (world.roomMap[idx] !== room.id) return false;
  if (world.hermoWall[idx] || world.aptMask[idx] || world.doors.has(idx) || world.containerMap.has(idx)) return false;
  if (world.surfaceFlags[idx] !== 0 || !reachable[idx]) return false;
  if (world.features[idx] !== Feature.NONE) return false;
  if (world.cells[idx] === Cell.FLOOR) return true;
  return rule.kind === 'feature' && !!rule.allowWater && world.cells[idx] === Cell.WATER;
}

function candidateForRoom(
  world: World,
  room: Room,
  rule: FeaturePlacementRule | InteractivePlacementRule,
  seed: number,
  reachable: Uint8Array,
  usedCells: Set<number>,
): ObjectCandidate | null {
  const weight = ruleRoomWeight(rule, room);
  if (weight <= 0) return null;
  const innerW = Math.max(1, room.w - 2);
  const innerH = Math.max(1, room.h - 2);
  const attempts = Math.min(48, Math.max(8, Math.ceil((innerW * innerH) / 4)));
  let best: ObjectCandidate | null = null;
  const seen = new Set<number>();
  for (let n = 0; n < attempts; n++) {
    const h = hash32(seed, room.id, n, rule.id.length);
    const x = world.wrap(room.x + 1 + (h % innerW));
    const y = world.wrap(room.y + 1 + (((h >>> 8) + n * 7) % innerH));
    const idx = world.idx(x, y);
    if (seen.has(idx) || usedCells.has(idx)) continue;
    seen.add(idx);
    if (!featureCellValid(world, room, idx, reachable, rule)) continue;
    const edgePenalty = Math.min(
      (x - room.x + W) % W,
      (room.x + room.w - 1 - x + W) % W,
      (y - room.y + W) % W,
      (room.y + room.h - 1 - y + W) % W,
    ) <= 0 ? 20_000 : 0;
    const score = weight * 1_000_000 - edgePenalty + (h & 0xffff);
    if (!best || score > best.score) best = { room, idx, x, y, score };
  }
  return best;
}

function chooseCandidate(
  world: World,
  rooms: readonly Room[],
  rule: FeaturePlacementRule | InteractivePlacementRule,
  seed: number,
  reachable: Uint8Array,
  usedCells: Set<number>,
): ObjectCandidate | null {
  let best: ObjectCandidate | null = null;
  for (const room of rooms) {
    const candidate = candidateForRoom(world, room, rule, seed, reachable, usedCells);
    if (!candidate) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

function placeFeatureRule(world: World, rooms: readonly Room[], rule: FeaturePlacementRule, seed: number, reachable: Uint8Array): number {
  const eligible = eligibleRooms(rooms, rule);
  const target = placementTarget(rule, eligible.length);
  const usedCells = new Set<number>();
  let placed = 0;
  while (placed < target) {
    const candidate = chooseCandidate(world, eligible, rule, seed + placed * 131, reachable, usedCells);
    if (!candidate) break;
    usedCells.add(candidate.idx);
    if (!world.setFeatureAt(candidate.idx, rule.feature)) continue;
    placed++;
  }
  return placed;
}

function placeInteractiveRule(world: World, rooms: readonly Room[], rule: InteractivePlacementRule, seed: number, reachable: Uint8Array): number {
  const eligible = eligibleRooms(rooms, rule);
  const target = placementTarget(rule, eligible.length);
  const usedCells = new Set<number>();
  let placed = 0;
  while (placed < target) {
    const candidate = chooseCandidate(world, eligible, rule, seed + placed * 151, reachable, usedCells);
    if (!candidate) break;
    usedCells.add(candidate.idx);
    const instance = placeInteractiveAt(world, candidate.x, candidate.y, rule.defId, {
      forceFeature: rule.forceFeature,
      seed: hash32(seed, candidate.idx, candidate.room.id),
      tags: ['floor_object_profile', rule.id, ...(rule.tags ?? [])],
    });
    if (!instance) continue;
    placed++;
  }
  return placed;
}

function fixtureCellAllowed(world: World, room: Room, idx: number, rule: BrokenFixturePlacementRule, reachable: Uint8Array): boolean {
  if (!reachable[idx] || world.roomMap[idx] !== room.id) return false;
  if (world.hermoWall[idx] || world.doors.has(idx)) return false;
  if (!rule.features.includes(world.features[idx] as Feature)) return false;
  const roomWeight = rule.roomTypeWeights?.[room.type] ?? 1;
  return roomWeight > 0;
}

function brokenFixtureDefId(feature: Feature): string | undefined {
  if (feature === Feature.SINK) return 'sink_broken';
  if (feature === Feature.TOILET) return 'toilet_broken';
  return undefined;
}

function placeBrokenFixtureRule(
  world: World,
  rooms: readonly Room[],
  rule: BrokenFixturePlacementRule,
  seed: number,
  reachable: Uint8Array,
): number {
  let placed = 0;
  const max = Math.max(0, Math.floor(rule.max));
  if (max <= 0) return 0;
  for (const room of rooms) {
    if (!room || room.sealed || room.w < 3 || room.h < 3) continue;
    const roomWeight = rule.roomTypeWeights?.[room.type] ?? 1;
    if (roomWeight <= 0) continue;
    for (let y = room.y + 1; y < room.y + room.h - 1 && placed < max; y++) {
      for (let x = room.x + 1; x < room.x + room.w - 1 && placed < max; x++) {
        const idx = world.idx(x, y);
        if (!fixtureCellAllowed(world, room, idx, rule, reachable)) continue;
        const baseChance = Math.max(0, Math.min(1, rule.baseChance * roomWeight));
        const guaranteedDefId = baseChance >= 1 ? brokenFixtureDefId(world.features[idx] as Feature) : undefined;
        const fixturePlaced = baseChance >= 1
          ? !!guaranteedDefId && !!placeInteractiveAt(world, x, y, guaranteedDefId, {
            seed: hash32(seed, idx, room.id),
            tags: ['floor_object_profile', rule.id, ...(rule.tags ?? [])],
          })
          : maybePlaceBrokenFixture(world, x, y, { baseChance, salt: hash32(seed, idx, room.id) });
        if (!fixturePlaced) continue;
        placed++;
      }
    }
    if (placed >= max) break;
  }
  return placed;
}

export function applyFloorObjectPlacementProfile(
  world: World,
  rooms: readonly Room[],
  spawnX: number,
  spawnY: number,
  profile: FloorObjectPlacementProfile | undefined,
  options: { seed?: number; reachable?: Uint8Array } = {},
): FloorObjectPlacementSummary | undefined {
  if (!profile) return undefined;
  const reachable = options.reachable ?? reachableFrom(world, spawnX, spawnY);
  const seed = options.seed ?? hash32(rooms.length, Math.floor(spawnX), Math.floor(spawnY));
  const summary: FloorObjectPlacementSummary = {
    profileId: profile.id,
    features: {},
    interactives: {},
    brokenFixtures: {},
  };

  for (const rule of profile.featureRules ?? []) {
    summary.features[rule.id] = placeFeatureRule(world, rooms, rule, hash32(seed, rule.id.length, 1), reachable);
  }
  for (const rule of profile.interactiveRules ?? []) {
    summary.interactives[rule.id] = placeInteractiveRule(world, rooms, rule, hash32(seed, rule.id.length, 2), reachable);
  }
  if (profile.craftStations) {
    summary.craftStations = placeCraftStationsWithProfile(world, rooms, spawnX, spawnY, profile.craftStations, {
      reachable,
      seed: hash32(seed, profile.craftStations.id.length, 3),
      tags: ['floor_object_profile', ...profile.tags],
    });
  }
  for (const rule of profile.brokenFixtures ?? []) {
    summary.brokenFixtures[rule.id] = placeBrokenFixtureRule(world, rooms, rule, hash32(seed, rule.id.length, 4), reachable);
  }

  return summary;
}

export function applyStoryFloorObjectProfile(world: World, spawnX: number, spawnY: number, floor: FloorLevel): FloorObjectPlacementSummary | undefined {
  return applyFloorObjectPlacementProfile(world, world.rooms, spawnX, spawnY, floorObjectProfileForStoryFloor(floor), {
    seed: hash32(floor, world.rooms.length),
  });
}

export function applyDesignFloorObjectProfile(
  world: World,
  spawnX: number,
  spawnY: number,
  route: DesignFloorRouteDef,
): FloorObjectPlacementSummary | undefined {
  return applyFloorObjectPlacementProfile(world, world.rooms, spawnX, spawnY, floorObjectProfileForDesignFloor(route), {
    seed: hash32(route.z, world.rooms.length, route.danger),
  });
}

export function applyProceduralFloorObjectProfile(
  world: World,
  rooms: readonly Room[],
  spec: ProceduralFloorSpec,
  reachable: Uint8Array,
): FloorObjectPlacementSummary | undefined {
  return applyFloorObjectPlacementProfile(world, rooms, 0, 0, floorObjectProfileForProceduralFloor(spec), {
    reachable,
    seed: hash32(spec.seed, spec.z, spec.danger, rooms.length),
  });
}
