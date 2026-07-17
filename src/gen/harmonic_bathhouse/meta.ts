import {
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import type { FloorGeneration } from '../floor_manifest';

export const HARMONIC_BATHHOUSE_ROUTE_ID = 'harmonic_bathhouse' as const;

export const HARMONIC_BATHHOUSE_Z = -28 as const;

export const HARMONIC_BATHHOUSE_BASE_FLOOR = 140;

export type BathhouseDecisionId =
  | 'turn_valve'
  | 'hot_fast_path'
  | 'cold_flooded_bypass'
  | 'repair_pressure_route';

export interface BathhouseThermalBands {
  hotFogCells: number;
  coldWaterCells: number;
  pressureCells: number;
}

export interface BathhouseRouteNode {
  id: BathhouseDecisionId;
  roomDefId: string;
  roomId: number;
  x: number;
  y: number;
  tags: readonly string[];
}

export interface HarmonicBathhouseState {
  routeId: typeof HARMONIC_BATHHOUSE_ROUTE_ID;
  anchorZ: typeof HARMONIC_BATHHOUSE_Z;
  bands: BathhouseThermalBands;
  decisions: BathhouseRouteNode[];
  cueIds: string[];
  hazardIds: string[];
  panelIds: string[];
}

export interface HarmonicBathhouseGeneration extends FloorGeneration {
  bathhouseState: HarmonicBathhouseState;
}

export interface BathhouseRooms {
  entry: Room;
  mixingHall: Room;
  centralBath: Room;
  boiler: Room;
  hotGallery: Room;
  coldBypass: Room;
  repairGallery: Room;
  lowerLift: Room;
}

export interface Point {
  x: number;
  y: number;
}

export interface HarmonicField {
  originX: number;
  originY: number;
  step: number;
  width: number;
  height: number;
  values: Float32Array;
}

export type NextId = { v: number };

export const SEED = hashSeed(HARMONIC_BATHHOUSE_ROUTE_ID);

export const CX = W >> 1;

export const CY = W >> 1;

export const FIELD_W = 171;

export const FIELD_H = 171;

export const FIELD_STEP = 2;

export const FIELD_ORIGIN_X = CX - Math.floor(FIELD_W * FIELD_STEP / 2);

export const FIELD_ORIGIN_Y = CY - 176;

export const SERVICE_GRID_X = [112, 272, 432, 592, 752, 912] as const;

export const SERVICE_GRID_Y = [118, 278, 438, 598, 758, 918] as const;

export interface BathhouseHqSpec {
  owner: TerritoryOwner;
  name: string;
  x: number;
  y: number;
  floorTex: Tex;
  wallTex: Tex;
}

export const BATHHOUSE_HQ_SPECS: readonly BathhouseHqSpec[] = [
  { owner: ZoneFaction.CITIZEN, name: 'Миништаб общей помывочной очереди', x: 122, y: 826, floorTex: Tex.F_TILE, wallTex: Tex.TILE_W },
  { owner: ZoneFaction.LIQUIDATOR, name: 'Миништаб напорной вахты ликвидаторов', x: 828, y: 144, floorTex: Tex.F_CONCRETE, wallTex: Tex.METAL },
  { owner: ZoneFaction.SCIENTIST, name: 'Миништаб НИИ тепловой гармоники', x: 126, y: 138, floorTex: Tex.F_TILE, wallTex: Tex.HERMO_WALL },
  { owner: ZoneFaction.CULTIST, name: 'Скрытый миништаб хора конденсата', x: 338, y: 846, floorTex: Tex.F_CARPET, wallTex: Tex.CROSS },
  { owner: ZoneFaction.WILD, name: 'Разорённый миништаб мокрых диких', x: 806, y: 826, floorTex: Tex.F_CONCRETE, wallTex: Tex.ROTTEN },
];

export const BATHHOUSE_OWNER_SEQUENCE = [
  ZoneFaction.LIQUIDATOR,
  ZoneFaction.CITIZEN,
  ZoneFaction.SCIENTIST,
  ZoneFaction.WILD,
  ZoneFaction.LIQUIDATOR,
  ZoneFaction.CULTIST,
] as const;

