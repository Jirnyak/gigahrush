import { RoomType, ZoneFaction } from '../core/types';
import { activeActorCountAtDefaultSoftLimit, activeActorSoftLimit, DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT, fitActiveActorCounts } from './entity_limits';

export interface NpcPopulationProfile {
  /** Relative share inside this floor's universal population budget. */
  share?: number;
  noiseScale: number;
  noiseStrength: number;
  openWeight: number;
  roomWeights: Partial<Record<RoomType, number>>;
  zoneWeights: Partial<Record<ZoneFaction, number>>;
  preferredTerritory?: ZoneFaction;
  preferredTerritoryShare?: number;
}

export interface MonsterPopulationProfile {
  /** Relative share inside this floor's universal population budget. */
  share?: number;
  noiseScale: number;
  noiseStrength: number;
  openWeight: number;
  roomWeights?: Partial<Record<RoomType, number>>;
  zoneWeights?: Partial<Record<ZoneFaction, number>>;
}

export const KVARTIRY_POPULATION_PROFILE = {
  id: 'kvartiry_lively',
  z: z.KVARTIRY,
  densityMult: 2.2,
  citizens: {
    share: 0.6,
    noiseScale: 96,
    noiseStrength: 0.2,
    openWeight: 0.95,
    roomWeights: {
      [RoomType.LIVING]: 1.75,
      [RoomType.KITCHEN]: 1.65,
      [RoomType.COMMON]: 1.35,
      [RoomType.SMOKING]: 1.2,
      [RoomType.CORRIDOR]: 1.05,
      [RoomType.OFFICE]: 0.95,
      [RoomType.BATHROOM]: 0.85,
      [RoomType.STORAGE]: 0.75,
      [RoomType.HQ]: 0.55,
    },
    zoneWeights: {
      [ZoneFaction.CITIZEN]: 1.45,
      [ZoneFaction.WILD]: 0.62,
      [ZoneFaction.LIQUIDATOR]: 0.58,
      [ZoneFaction.CULTIST]: 0.5,
      [ZoneFaction.SCIENTIST]: 0.72,
    },
    preferredTerritory: ZoneFaction.CITIZEN,
    preferredTerritoryShare: 0.72,
  },
  wild: {
    share: 0.34,
    noiseScale: 72,
    noiseStrength: 0.26,
    openWeight: 1.15,
    roomWeights: {
      [RoomType.CORRIDOR]: 1.65,
      [RoomType.COMMON]: 1.45,
      [RoomType.SMOKING]: 1.4,
      [RoomType.STORAGE]: 1.25,
      [RoomType.KITCHEN]: 1.1,
      [RoomType.LIVING]: 0.95,
      [RoomType.BATHROOM]: 0.8,
      [RoomType.OFFICE]: 0.8,
      [RoomType.HQ]: 0.75,
    },
    zoneWeights: {
      [ZoneFaction.WILD]: 4.6,
      [ZoneFaction.CITIZEN]: 0.58,
      [ZoneFaction.CULTIST]: 1.65,
      [ZoneFaction.LIQUIDATOR]: 0.95,
      [ZoneFaction.SCIENTIST]: 0.82,
    },
    preferredTerritory: ZoneFaction.WILD,
    preferredTerritoryShare: 0.38,
  },
  liquidators: {
    share: 0.06,
    noiseScale: 128,
    noiseStrength: 0.18,
    openWeight: 1.1,
    roomWeights: {
      [RoomType.HQ]: 2.6,
      [RoomType.CORRIDOR]: 1.55,
      [RoomType.COMMON]: 1.35,
      [RoomType.OFFICE]: 1.3,
      [RoomType.STORAGE]: 1.1,
      [RoomType.KITCHEN]: 0.85,
      [RoomType.SMOKING]: 0.75,
      [RoomType.BATHROOM]: 0.65,
      [RoomType.LIVING]: 0.55,
    },
    zoneWeights: {
      [ZoneFaction.LIQUIDATOR]: 5.8,
      [ZoneFaction.WILD]: 1.35,
      [ZoneFaction.CULTIST]: 1.3,
      [ZoneFaction.CITIZEN]: 0.55,
      [ZoneFaction.SCIENTIST]: 0.9,
    },
    preferredTerritory: ZoneFaction.LIQUIDATOR,
    preferredTerritoryShare: 0.45,
  },
  uprising: {
    intervalSec: 24,
    radius: 38,
    responseRadius: 78,
    ambientChance: 0.12,
    minCitizens: 16,
    maxConverted: 12,
    maxResponders: 8,
  },
} as const;

export const HELL_POPULATION_PROFILE = {
  id: 'hell_lively',
  z: z.HELL,
  densityMult: 0.98,
  monsters: {
    share: 0.84,
    noiseScale: 160,
    noiseStrength: 0.05,
    openWeight: 1.0,
    roomWeights: {
      [RoomType.HQ]: 0.9,
      [RoomType.STORAGE]: 0.9,
    },
    zoneWeights: {
      [ZoneFaction.WILD]: 1.06,
      [ZoneFaction.CULTIST]: 1.03,
      [ZoneFaction.LIQUIDATOR]: 0.97,
      [ZoneFaction.CITIZEN]: 1.0,
    },
  },
  cultists: {
    share: 0.14,
    noiseScale: 128,
    noiseStrength: 0.08,
    openWeight: 1.0,
    roomWeights: {
      [RoomType.HQ]: 1.05,
      [RoomType.STORAGE]: 0.95,
    },
    zoneWeights: {
      [ZoneFaction.CULTIST]: 1.24,
      [ZoneFaction.WILD]: 1.04,
      [ZoneFaction.LIQUIDATOR]: 0.86,
      [ZoneFaction.CITIZEN]: 0.95,
    },
  },
  liquidators: {
    share: 0.02,
    noiseScale: 144,
    noiseStrength: 0.06,
    openWeight: 1.0,
    roomWeights: {
      [RoomType.HQ]: 1.08,
      [RoomType.STORAGE]: 0.95,
    },
    zoneWeights: {
      [ZoneFaction.LIQUIDATOR]: 1.28,
      [ZoneFaction.CULTIST]: 1.08,
      [ZoneFaction.WILD]: 0.9,
      [ZoneFaction.CITIZEN]: 0.96,
    },
  },
} as const;

export const VOID_POPULATION_PROFILE = {
  id: 'void_lively',
  z: z.VOID,
  guardians: 1600,
  lootDrops: 160,
} as const;

export type ProceduralPopulationProfileId = 'normal' | 'highDensity';
export type ProceduralPopulationBand = 'shallow' | 'middle' | 'deep' | 'voidRoute';

export interface ProceduralPopulationScale {
  /** Multipliers tune the universal smooth Z curve; raw counts still resolve through the active actor soft cap. */
  baseMult: number;
  dangerMult: number;
  anomalyMult: number;
  cap: number;
}

export interface ProceduralMonsterPopulationScale extends ProceduralPopulationScale {
  industrialMult: number;
}

export interface ProceduralPopulationProfile {
  id: ProceduralPopulationProfileId;
  npcs: ProceduralPopulationScale;
  monsters: ProceduralMonsterPopulationScale;
}

export interface ProceduralPopulationBudgetInput {
  z: number;
  danger: number;
  anomalyPressure: number;
  industrial: boolean;
  npcAllowed: boolean;
  profileId: ProceduralPopulationProfileId;
}

export interface ProceduralPopulationBudget {
  profileId: ProceduralPopulationProfileId;
  band: ProceduralPopulationBand;
  npcs: number;
  monsters: number;
  npcCap: number;
  monsterCap: number;
}

export const PROCEDURAL_HIGH_DENSITY_ANOMALIES = ['zombie_apocalypse'] as const;

export const PROCEDURAL_POPULATION_PROFILES = {
  normal: {
    id: 'normal',
    npcs: {
      baseMult: 0.45,
      dangerMult: 0.04,
      anomalyMult: 0.03,
      cap: DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT,
    },
    monsters: {
      baseMult: 1,
      dangerMult: 0.06,
      anomalyMult: 0.08,
      industrialMult: 0.08,
      cap: DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT,
    },
  },
  highDensity: {
    id: 'highDensity',
    npcs: {
      baseMult: 1.18,
      dangerMult: 0.10,
      anomalyMult: 0.04,
      cap: DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT,
    },
    monsters: {
      baseMult: 1.2,
      dangerMult: 0.08,
      anomalyMult: 0.12,
      industrialMult: 0.06,
      cap: DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT,
    },
  },
} as const satisfies Readonly<Record<ProceduralPopulationProfileId, ProceduralPopulationProfile>>;

export const PROCEDURAL_POPULATION_PROFILE = PROCEDURAL_POPULATION_PROFILES.normal;

export function proceduralPopulationProfileId(anomalyId: string): ProceduralPopulationProfileId {
  for (const id of PROCEDURAL_HIGH_DENSITY_ANOMALIES) {
    if (id === anomalyId) return 'highDensity';
  }
  return 'normal';
}

export function proceduralAnomalyPressure(anomalyId: string): number {
  if (anomalyId === 'samosbor_seed' || anomalyId === 'wall_snake' || anomalyId === 'living_tunnels' || anomalyId === 'section_shift' || anomalyId === 'zombie_apocalypse' || anomalyId === 'sandpile_perekrytie') return 2;
  if (
    anomalyId === 'smog' ||
    anomalyId === 'hladon' ||
    anomalyId === 'cement_memory' ||
    anomalyId === 'conway_life' ||
    anomalyId === 'rail_trains'
  ) return 1;
  return 0;
}

export function proceduralPopulationBand(z: number): ProceduralPopulationBand {
  if (z >= 36) return 'voidRoute';
  const depth = Math.abs(z);
  if (depth >= 25) return 'deep';
  if (depth >= 13) return 'middle';
  return 'shallow';
}

export function populationDepth01(z: number): number {
  return Math.max(0, Math.min(1, Math.abs(z) / 50));
}

export function basePopulationTotalAtDefaultSoftLimit(_z: number): number {
  return DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT;
}

export function baseMonsterPopulationAtDefaultSoftLimit(z: number): number {
  const depth = populationDepth01(z);
  const eased = 1 - Math.exp(-3.1 * Math.pow(depth, 2.35));
  return Math.max(100, Math.round(100 + (DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT - 100) * eased));
}

export function monsterShareForRouteZ(z: number): number {
  return Math.max(0, Math.min(0.96, baseMonsterPopulationAtDefaultSoftLimit(z) / DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT));
}

export function populationLevelForRouteZ(z: number, danger = 1): number {
  const depth = populationDepth01(z);
  return Math.max(1, Math.min(12, Math.round(1 + depth * 8 + (Math.max(1, Math.min(5, danger)) - 1) * 0.55)));
}

function scaledPopulationCount(
  scale: ProceduralPopulationScale,
  baseCount: number,
  danger: number,
  anomalyPressure: number,
  extraMult = 0,
): number {
  const boundedDanger = Math.max(1, Math.min(5, Math.round(danger)));
  const boundedPressure = Math.max(0, Math.min(4, Math.round(anomalyPressure)));
  const mult = Math.max(0, scale.baseMult + (boundedDanger - 1) * scale.dangerMult + boundedPressure * scale.anomalyMult + extraMult);
  return Math.min(effectivePopulationCap(scale), Math.max(0, Math.round(activeActorCountAtDefaultSoftLimit(baseCount * mult))));
}

function effectivePopulationCap(scale: ProceduralPopulationScale): number {
  return Math.min(activeActorSoftLimit(), activeActorCountAtDefaultSoftLimit(scale.cap));
}

export function proceduralPopulationBudget(input: ProceduralPopulationBudgetInput): ProceduralPopulationBudget {
  const profile = PROCEDURAL_POPULATION_PROFILES[input.profileId];
  const band = proceduralPopulationBand(input.z);
  const baseTotal = basePopulationTotalAtDefaultSoftLimit(input.z);
  const monsterShare = input.npcAllowed ? monsterShareForRouteZ(input.z) : 1;
  const npcBase = input.npcAllowed ? baseTotal * (1 - monsterShare) : 0;
  const monsterBase = baseTotal * monsterShare;
  const rawNpcs = input.npcAllowed ? scaledPopulationCount(profile.npcs, npcBase, input.danger, input.anomalyPressure) : 0;
  const rawMonsters = scaledPopulationCount(
    profile.monsters,
    monsterBase,
    input.danger,
    input.anomalyPressure,
    input.industrial ? profile.monsters.industrialMult : 0,
  );
  const fitted = fitActiveActorCounts(rawNpcs, rawMonsters);
  return {
    profileId: profile.id,
    band,
    npcs: fitted.npcs,
    monsters: fitted.monsters,
    npcCap: effectivePopulationCap(profile.npcs),
    monsterCap: effectivePopulationCap(profile.monsters),
  };
}
