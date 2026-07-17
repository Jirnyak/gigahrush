/* -- Design z: Крыша (Meta) --------------------------------------- */

import {
  W,
  Tex,
  type TerritoryOwner,
  ZoneFaction,
} from '../../core/types';

export const DESIGN_FLOOR_ID = 'roof' as const;
export const ROOF_ROUTE_ID = DESIGN_FLOOR_ID;
export const ROOF_FUTURE_Z = 50 as const;
export const ROOF_BASE_FLOOR = 30;
export const ROOF_SKY_WIDTH = 1024 as const;
export const ROOF_SKY_HEIGHT = 1024 as const;

export const ROOF_DEBUG_ENTRY = {
  routeId: ROOF_ROUTE_ID,
  z: ROOF_FUTURE_Z,
  generator: 'generateRoofDesignFloor',
  skyProvider: 'createRoofSkyTextureProvider',
  smokePath: 'spawn -> vent shelter -> central slab -> antenna field/sniper lane -> lower bridge loop -> hatch/lift exit',
} as const;

export const CX = W >> 1;
export const CY = W >> 1;
export const CONTAINER_ID_BASE = 400_100;
export const SKY_CELL = 16;
export const SKY_GRID_W = ROOF_SKY_WIDTH / SKY_CELL;
export const SKY_GRID_H = Math.ceil(ROOF_SKY_HEIGHT / SKY_CELL);
export const SKY_UPDATE_INTERVAL = 0.75;
export const ROOF_LOS_RAY_MAX = 64;
export const ROOF_LOS_LONG_STEPS = 24;
export const ROOF_LOS_EXPOSURE_THRESHOLD = 110;
export const ROOF_LOS_SHELTER_MIN_SPACING = 24;
export const ROOF_LOS_SHELTER_MAX_SPACING = 64;
export const ROOF_LOS_SHELTER_CAP = 256;
export const ROOF_TERRITORY_TARGETS = [
  { owner: ZoneFaction.CITIZEN, share: 0.28 },
  { owner: ZoneFaction.LIQUIDATOR, share: 0.38 },
  { owner: ZoneFaction.CULTIST, share: 0.08 },
  { owner: ZoneFaction.SCIENTIST, share: 0.14 },
  { owner: ZoneFaction.WILD, share: 0.12 },
] as const satisfies readonly { owner: TerritoryOwner; share: number }[];

export const ROOF_LOS_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

export type RoofWeatherAction =
  | 'repair_signal'
  | 'false_weather_exposed'
  | 'false_weather_forged'
  | 'sniper_lane_darkened'
  | 'cloud_frame_printed'
  | 'clean_water_collected';

export interface RoofWeatherState {
  signalQuality: number;
  antennaRepaired: boolean;
  falseWeatherExposed: boolean;
  falseWeatherForged: boolean;
  sniperLaneDarkened: boolean;
  cloudFramePrinted: boolean;
  cleanWaterCollected: boolean;
  skyTimeOfDay: number;
  skySeed: number;
}

export interface RoofWeatherResult {
  action: RoofWeatherAction;
  label: string;
  logLine: string;
  signalQuality: number;
  tags: string[];
}

export interface RoofLosExposureSummary {
  exposedCells: number;
  deliberateExposedCells: number;
  unshelteredExposedCells: number;
  shelterCells: number;
  maxScore: number;
}

export interface RoofHqSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  name: string;
  wallTex: Tex;
  floorTex: Tex;
  ruined?: boolean;
}
