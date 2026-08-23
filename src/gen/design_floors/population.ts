import {
  AIGoal,
  EntityType,
  Faction,
  MonsterKind,
  Occupation,
  RoomType,
  W,
  type Entity,
} from '../../core/types';
import type { World } from '../../core/world';
import { hashSeed } from '../../core/rand';
import { territoryOwnerToFaction } from '../../data/factions';
import { territoryOwnerAtIndex } from '../../systems/territory';
import type { DesignFloorRouteDef } from '../../data/design_floors';
import {
  designFloorPopulationProfile,
  type WeightedDesignValue,
} from '../../data/design_floor_population';
import { chooseFloorMonsterKind } from '../../data/monster_ecology';
import { growPackCells, packPlanFor } from '../monster_packs';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../entities/sprite_index';
import { randomRPG } from '../../systems/rpg';
import { entitySpawnSlots } from '../../systems/entity_limits';
import type { FloorGeneration } from '../floor_manifest';
import {
  sampleNaturalPopulationCells,
  samplePlacementFieldCells,
} from '../population_placement';
import { syncNextEntityId } from '../content_manifest_utils';

function rand32(seed: number, serial: number, salt: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(serial ^ 0xc2b2ae35, 0x27d4eb2d) + salt;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 0x100000000;
}

function pickWeighted<T>(items: readonly WeightedDesignValue<T>[], seed: number, serial: number, salt: number): T {
  let total = 0;
  for (const item of items) total += Math.max(0, item.weight);
  if (total <= 0) return items[0].value;
  let roll = rand32(seed, serial, salt) * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function isAmbientNpcTemplate(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    (entity as Entity & { npcPackageId?: string }).npcPackageId === undefined &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1;
}

/* Своей копии счётчика тут больше нет. Она начинала с единицы, и на этаже, чей
 * генератор почти никого не поставил, общее население садилось прямо в диапазон
 * сюжетных слотов — у наружного микрорайона так уезжали все четыреста семьдесят
 * шесть тварей. Порог живёт в `syncNextEntityId`, один на всю генерацию. */

function makeAmbientNpcTemplate(
  id: number,
  cell: number,
  route: DesignFloorPopulationRoute,
  npcLevel: number,
  serial: number,
  seed: number,
  faction: Faction,
  occupation: Occupation,
): Entity {
  const x = cell % W;
  const y = (cell / W) | 0;
  const child = occupation === Occupation.CHILD;
  const hp = child ? 55 : Math.round(70 + Math.min(95, Math.abs(route.z) * 1.3 + npcLevel * 7));
  return {
    id,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: rand32(seed, serial, 77) * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: child ? 0.78 : 0.95 + rand32(seed, serial, 79) * 0.42,
    sprite: occupation,
    spriteScale: child ? 0.6 : undefined,
    hp,
    maxHp: hp,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    faction,
    occupation,
    isTraveler: occupation === Occupation.TRAVELER || occupation === Occupation.HUNTER || occupation === Occupation.PILGRIM,
    assignedRoomId: -1,
    questId: -1,
    canGiveQuest: false,
    rpg: randomRPG(child ? 1 : npcLevel),
  };
}

function spawnAmbientNpcTemplates(generation: Omit<FloorGeneration, 'spawnX' | 'spawnY'>, route: DesignFloorPopulationRoute, firstId: number): number {
  const profile = designFloorPopulationProfile(route as DesignFloorRouteDef);
  if (profile.npcTarget <= 0) {
    let write = 0;
    for (let read = 0; read < generation.entities.length; read++) {
      const entity = generation.entities[read];
      if (isAmbientNpcTemplate(entity)) continue;
      generation.entities[write++] = entity;
    }
    generation.entities.length = write;
    return firstId;
  }
  const existing = generation.entities.filter(isAmbientNpcTemplate).length;
  const requested = Math.max(0, profile.npcTarget - existing);
  const count = entitySpawnSlots(generation.entities, EntityType.NPC, requested);
  if (count <= 0) return firstId;
  const seed = hashSeed(`design-pop:npc:${route.id}:${route.z}`, route.z);
  const cells = sampleNaturalPopulationCells(generation.world, count, profile.npcPlacement, seed);
  let nextId = firstId;
  for (let i = 0; i < cells.length; i++) {
    const ownerFaction = territoryOwnerToFaction(territoryOwnerAtIndex(generation.world, cells[i]));
    const faction = ownerFaction !== null && rand32(seed, i, 909) < 0.96
      ? ownerFaction
      : pickWeighted(profile.npcFactions, seed, i, 101);
    const occupation = pickWeighted(profile.npcOccupations, seed, i, 301);
    generation.entities.push(makeAmbientNpcTemplate(nextId++, cells[i], route, profile.npcLevel, i, seed, faction, occupation));
  }
  return nextId;
}

export type DesignFloorPopulationRoute = { id: string; z: number; danger?: number; themeTags?: readonly string[] };

/**
 * Central NPCs-only ambient populate for design floors. Called once per floor
 * from the design-floor manifest, AFTER territory init, with the REAL route
 * (`designFloorById(id)`) so theme/z/danger drive the profile correctly.
 * This fills only the ambient crowd to the profile's `npcTarget`; monster packs
 * are populated separately by `populateDesignFloorMonsters` (both share the same
 * active-actor budget). Idempotent: counts existing ambient templates and prunes
 * them when `npcTarget` is 0.
 */
export function populateDesignFloorAmbientNpcs(generation: Omit<FloorGeneration, 'spawnX' | 'spawnY'>, route: DesignFloorPopulationRoute): void {
  const nextId = syncNextEntityId(generation.entities, 0);
  spawnAmbientNpcTemplates(generation, route, nextId);
}

// ── Monster packs ───────────────────────────────────────────────────────────
// Anisotropic monster population: instead of an even scatter, place the profile's
// monsterTarget as discrete homogeneous packs whose shape (crowd/loner/territorial/
// roamer) comes from each lead kind's ecology. Peaceful gaps fall out for free —
// pack centers use the field-weighted sampler, so per-kind zoneWeights already keep
// CITIZEN zones sparse. Shares the active-actor pool with NPCs via entitySpawnSlots.

const PHASING_MONSTER_KINDS: ReadonlySet<MonsterKind> = new Set([
  MonsterKind.SPIRIT,
  MonsterKind.SHADOW,
  MonsterKind.TONKAYA_TEN,
  MonsterKind.GLUBINNAYA_TEN,
]);

function roomTypeAt(world: World, cell: number): RoomType {
  const rid = world.roomMap[cell];
  return rid >= 0 ? (world.rooms[rid]?.type ?? RoomType.CORRIDOR) : RoomType.CORRIDOR;
}

function isAmbientMonster(entity: Entity): boolean {
  return entity.type === EntityType.MONSTER;
}

/**
 * Grow a homogeneous pack cluster of up to `memberCount` placeable cells around
 * `center`, staying inside a disk whose radius derives from `spread`. Cells already
 * claimed by an earlier pack (in `used`) are skipped so packs never overlap; nearest
 * cells win (tight cluster) with a rand32 tiebreak. Returns [] only if nothing is free.
 */
function makeMonster(
  id: number,
  cell: number,
  kind: MonsterKind,
  route: DesignFloorPopulationRoute,
  monsterLevel: number,
  world: World,
  seed: number,
  homeRoomId: number | undefined,
  centerX: number,
  centerY: number,
): Entity {
  const def = MONSTERS[kind];
  const x = cell % W;
  const y = (cell / W) | 0;
  const zoneLevel = world.zones[world.zoneMap[cell]]?.level ?? (route.danger ?? 1);
  const level = Math.max(1, Math.min(12, monsterLevel + Math.floor(zoneLevel / 2)));
  const hp = Math.round(def.hp * (0.75 + level * 0.13));
  return {
    id,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rand32(seed, cell, 709) * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (0.95 + Math.min(0.35, Math.abs(route.z) * 0.006)),
    sprite: monsterSpr(kind),
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    // tx/ty seed the pack toward its center for first-frame cohesion; homeRoomId is set
    // only for territorial packs so the AI leash (monster.ts WANDER branch) engages.
    ai: { goal: AIGoal.WANDER, tx: centerX, ty: centerY, path: [], pi: 0, stuck: 0, timer: 0, homeRoomId },
    rpg: randomRPG(level),
    phasing: PHASING_MONSTER_KINDS.has(kind),
  };
}

function spawnDesignMonsterPacks(generation: Omit<FloorGeneration, 'spawnX' | 'spawnY'>, route: DesignFloorPopulationRoute, firstId: number): number {
  const profile = designFloorPopulationProfile(route as DesignFloorRouteDef);
  if (profile.monsterTarget <= 0) return firstId;
  const world = generation.world;
  const existing = generation.entities.filter(isAmbientMonster).length;
  const requested = Math.max(0, profile.monsterTarget - existing);
  let budget = entitySpawnSlots(generation.entities, EntityType.MONSTER, requested);
  if (budget <= 0) return firstId;

  const seed = hashSeed(`design-pop:monster:${route.id}:${route.z}`, route.z);
  const floorTags = [
    route.id,
    ...profile.monsterTags,
    (route.themeTags ?? []).includes('ministry') ? 'documents' : '',
    (route.themeTags ?? []).includes('maintenance') ? 'industrial' : '',
  ].filter(Boolean);
  const routePressure = Math.min(4, Math.floor(Math.abs(route.z) / 12));
  const samosborCount = Math.max(1, route.danger ?? 1);

  // One center per pack; ceil(budget/2)+8 gives headroom for small packs without exceeding budget.
  const centerCount = Math.min(budget, Math.ceil(budget / 2) + 8);
  const centers = samplePlacementFieldCells(world, centerCount, profile.monsterPlacement, seed);
  const used = new Set<number>();
  let nextId = firstId;

  for (let p = 0; p < centers.length && budget > 0; p++) {
    const center = centers[p];
    let roll = 0;
    const leadKind = chooseFloorMonsterKind({
      z: route.z,
      floorThemeTags: route.themeTags,
      roomType: roomTypeAt(world, center),
      floorTags,
      samosborCount,
      allowRare: false,
      allowOffFloor: true,
      biasKinds: profile.monsterBiasKinds,
      routePressure,
      rng: () => rand32(seed, center, 503 + roll++),
    });
    const { shape, memberCount } = packPlanFor(leadKind, budget, rand32(seed, p, 211));
    const cells = growPackCells(world, center, memberCount, shape.spread, used, seed, p);
    if (cells.length === 0) continue;
    const homeRoomId = shape.mode === 'territorial' && world.roomMap[center] >= 0 ? world.roomMap[center] : undefined;
    const centerX = center % W;
    const centerY = (center / W) | 0;
    for (const cell of cells) {
      generation.entities.push(makeMonster(nextId++, cell, leadKind, route, profile.monsterLevel, world, seed, homeRoomId, centerX, centerY));
      budget--;
    }
  }
  return nextId;
}

/**
 * Central monster populate for design floors. Called once per floor from the manifest,
 * AFTER the ambient-NPC populate (both share the same active-actor budget). Skips floors
 * whose profile has `monsterTarget <= 0`.
 */
export function populateDesignFloorMonsters(generation: Omit<FloorGeneration, 'spawnX' | 'spawnY'>, route: DesignFloorPopulationRoute): void {
  const nextId = syncNextEntityId(generation.entities, 0);
  spawnDesignMonsterPacks(generation, route, nextId);
}
