/* ── Future design z: Хтонический чердак — meta ─────────────────── */

import { type Entity } from '../../core/types';
import { World } from '../../core/world';
import { designNpcFloorKey } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('chthonic_attic');

export const DESIGN_FLOOR_ID = 'chthonic_attic' as const;
export const DESIGN_FLOOR_Z = 46;

export type ChthonicAtticRootChoice = 'cut' | 'feed' | 'burn';

export interface ChthonicAtticShelterCost {
  kind: 'item' | 'hp' | 'reputation' | 'delay';
  itemId?: string;
  count?: number;
  amount?: number;
  seconds?: number;
}

export interface ChthonicAtticRootState {
  choice: ChthonicAtticRootChoice;
  shelterCost: ChthonicAtticShelterCost;
  shelterRoomIds: number[];
  sealedRoomIds: number[];
  burntRoomIds: number[];
  blockedDoorIdxs: number[];
  oneWayDoorIdxs: number[];
  crossFloorFlag: string;
}

export interface ChthonicAtticExit {
  id: 'ministry_return' | 'roof_service' | 'crawl_hatch';
  idx: number;
}

export interface ChthonicAtticRouteCheck {
  choice: ChthonicAtticRootChoice;
  exitId: ChthonicAtticExit['id'];
  reachable: boolean;
  distance: number;
}

export interface ChthonicAtticLayout {
  routeId: typeof DESIGN_FLOOR_ID;
  z: typeof DESIGN_FLOOR_Z;
  spawnRoomId: number;
  combatLaneCells: number[];
  crawlRouteCells: number[];
  exitCells: ChthonicAtticExit[];
  npcRoomIds: Record<'rootkeeper' | 'deacon' | 'yura' | 'masha', number>;
  rootRoomId: number;
  shrineRoomId: number;
  shelterRoomId: number;
  evidenceRoomId: number;
  rootDoorIdx: number;
  shrineDoorIdx: number;
  shelterDoorIdx: number;
  crawlDoorIdxs: number[];
}

import type { DesignFloorGeneration } from "../floor_manifest";

export interface ChthonicAtticGeneration extends DesignFloorGeneration {
  world: World;
  entities: Entity[];
  spawnX: number;
  spawnY: number;
  layout: ChthonicAtticLayout;
  rootState: ChthonicAtticRootState;
  routeChecks: ChthonicAtticRouteCheck[];
  debug: {
    routeId: typeof DESIGN_FLOOR_ID;
    z: typeof DESIGN_FLOOR_Z;
    entry: string;
  };
}
