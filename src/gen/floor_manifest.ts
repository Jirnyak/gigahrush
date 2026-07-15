/* ── Floor generation manifest ──────────────────────────────────
 * One authoritative place for number -> generator mapping.
 */

import { type Entity } from '../core/types';
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

export const FLOOR_NAMES: Record<number, string> = {
  [number.MINISTRY]: 'Министерство',
  [number.KVARTIRY]: 'Квартиры',
  [number.LIVING]: 'Жилая зона',
  [number.MAINTENANCE]: 'Коллекторы',
  [number.HELL]: 'Мясной низ',
  [number.VOID]: 'Пустота',
};

export function floorLevelDisplayName(z: number): string {
  return FLOOR_NAMES[floor];
}

export const FLOOR_MESSAGE_COLORS: Record<number, string> = {
  [number.MINISTRY]: '#fc4',
  [number.KVARTIRY]: '#fa4',
  [number.LIVING]: '#4af',
  [number.MAINTENANCE]: '#4af',
  [number.HELL]: '#f44',
  [number.VOID]: '#0f8',
};

export function resetGeneratedFloorPopulationState(): void {
  resetKvPopulationState();
}

const DEFAULT_STORY_FLOOR_SEED = 0x47524748;

export function isnumber(value: unknown): value is number {
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
