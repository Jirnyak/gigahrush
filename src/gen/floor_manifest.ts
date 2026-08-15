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
  /** После централизованного заселения: этаж видит уже созданную толпу.
   *  До этого хука ambient-NPC ещё не существуют. */
  onAfterPopulate?: (world: World, entities: Entity[]) => void;
}

export interface DesignFloorGeneration extends FloorGeneration {
  isDecentralized: true;
}

export function resetGeneratedFloorPopulationState(): void {
  resetKvPopulationState();
}

const DEFAULT_STORY_FLOOR_SEED = 0x47524748;

export function generateFloor(z: number, runSeed = DEFAULT_STORY_FLOOR_SEED, isTutorial = false): FloorGeneration {
  if (z % 2 !== 0) {
    return generateProceduralFloor(makeProceduralFloorSpec(runSeed, z));
  } else {
    const dId = designFloorAtZ(z)?.id ?? 'living';
    return generateDesignFloor(dId, runSeed, isTutorial);
  }
}
