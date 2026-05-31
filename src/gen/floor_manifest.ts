/* ── Floor generation manifest ──────────────────────────────────
 * One authoritative place for FloorLevel -> generator mapping.
 */

import { FloorLevel, type Entity } from '../core/types';
import { World } from '../core/world';
import { hashSeed, withSeededRandom } from '../core/rand';
import { generateMinistry } from './ministry';
import { generateKvartiry, resetKvPopulationState } from './kvartiry';
import { generateWorld } from './living';
import { generateMaintenance } from './maintenance';
import { generateHell } from './hell';
import { generateVoid } from './void';
import { withoutNpcEntities } from './entity_filters';
import { applyStoryFloorObjectProfile } from './floor_object_placement';

export interface FloorGeneration {
  world: World;
  entities: Entity[];
  spawnX: number;
  spawnY: number;
}

export const FLOOR_NAMES: Record<FloorLevel, string> = {
  [FloorLevel.MINISTRY]: 'Министерство',
  [FloorLevel.KVARTIRY]: 'Квартиры',
  [FloorLevel.LIVING]: 'Жилая зона',
  [FloorLevel.MAINTENANCE]: 'Коллекторы',
  [FloorLevel.HELL]: 'Мясной низ',
  [FloorLevel.VOID]: 'Пустота',
};

export function floorLevelDisplayName(floor: FloorLevel): string {
  return FLOOR_NAMES[floor];
}

export const FLOOR_MESSAGE_COLORS: Record<FloorLevel, string> = {
  [FloorLevel.MINISTRY]: '#fc4',
  [FloorLevel.KVARTIRY]: '#fa4',
  [FloorLevel.LIVING]: '#4af',
  [FloorLevel.MAINTENANCE]: '#4af',
  [FloorLevel.HELL]: '#f44',
  [FloorLevel.VOID]: '#0f8',
};

export function resetGeneratedFloorPopulationState(): void {
  resetKvPopulationState();
}

const FLOOR_GENERATORS: Record<FloorLevel, () => FloorGeneration> = {
  [FloorLevel.MINISTRY]: generateMinistry,
  [FloorLevel.KVARTIRY]: generateKvartiry,
  [FloorLevel.LIVING]: generateWorld,
  [FloorLevel.MAINTENANCE]: generateMaintenance,
  [FloorLevel.HELL]: generateHell,
  [FloorLevel.VOID]: generateVoid,
};

const DEFAULT_STORY_FLOOR_SEED = 0x47524748;

export function storyFloorGenerationSeed(floor: FloorLevel, runSeed = DEFAULT_STORY_FLOOR_SEED): number {
  return hashSeed(`story-floor:${floor}`, runSeed);
}

export function isFloorLevel(value: unknown): value is FloorLevel {
  return typeof value === 'number' && value in FLOOR_GENERATORS;
}

function applyStoryFloorObjects(floor: FloorLevel, generation: FloorGeneration): void {
  applyStoryFloorObjectProfile(generation.world, generation.spawnX, generation.spawnY, floor);
}

export function generateFloor(floor: FloorLevel, runSeed = DEFAULT_STORY_FLOOR_SEED): FloorGeneration {
  const generation = withSeededRandom(storyFloorGenerationSeed(floor, runSeed), () => FLOOR_GENERATORS[floor]());
  applyStoryFloorObjects(floor, generation);
  return floor === FloorLevel.VOID ? withoutNpcEntities(generation) : generation;
}
