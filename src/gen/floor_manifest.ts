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
  isDecentralized?: boolean;
  onAfterTerritory?: (world: World, entities: Entity[]) => void;
}

export interface DesignFloorGeneration extends FloorGeneration {
  isDecentralized: true;
}

export const FLOOR_NAMES: Record<string, string> = {
  'ministry': 'Министерство',
  'kvartiry': 'Квартиры',
  'living': 'Жилая зона',
  'maintenance': 'Коллекторы',
  'hell': 'Мясной низ',
  'void': 'Пустота',
};

export function floorLevelDisplayName(themeTags?: readonly string[]): string {
  if (!themeTags || themeTags.length === 0) return 'Неизвестно';
  for (const tag of themeTags) {
    if (FLOOR_NAMES[tag]) return FLOOR_NAMES[tag];
  }
  return themeTags[0];
}

export const FLOOR_MESSAGE_COLORS: Record<string, string> = {
  'ministry': '#fc4',
  'kvartiry': '#fa4',
  'living': '#4af',
  'maintenance': '#4af',
  'hell': '#f44',
  'void': '#0f8',
};

export function resetGeneratedFloorPopulationState(): void {
  resetKvPopulationState();
}

const DEFAULT_STORY_FLOOR_SEED = 0x47524748;

export function isValidZ(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function generateFloor(z: number, runSeed = DEFAULT_STORY_FLOOR_SEED, isTutorial = false): FloorGeneration {
  if (z % 2 !== 0) {
    return generateProceduralFloor(makeProceduralFloorSpec(runSeed, z));
  } else {
    const dId = designFloorAtZ(z)?.id ?? 'living';
    return generateDesignFloor(dId, runSeed, isTutorial);
  }
}
