/* ── Floor generation manifest ──────────────────────────────────
 * One authoritative place for FloorLevel -> generator mapping.
 */

import { FloorLevel, type Entity } from '../core/types';
import { World } from '../core/world';
import { resetKvPopulationState } from './kvartiry';
import { generateDesignFloor } from './design_floors/manifest';
import { generateProceduralFloor } from './procedural_floor';
import { makeProceduralFloorSpec } from '../data/procedural_floors';
import { designFloorAtZ } from '../data/design_floors';

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

const DEFAULT_STORY_FLOOR_SEED = 0x47524748;

export function isFloorLevel(value: unknown): value is FloorLevel {
  return typeof value === 'number' && (value >= 0 && value <= 5);
}

export function generateFloor(z: number, runSeed = DEFAULT_STORY_FLOOR_SEED, isTutorial = false): FloorGeneration {
  if (z % 2 !== 0) {
    return generateProceduralFloor(makeProceduralFloorSpec(runSeed, z));
  } else {
    const dId = designFloorAtZ(z)?.id ?? 'living';
    return generateDesignFloor(dId, runSeed, isTutorial);
  }
}
