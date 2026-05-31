import { Feature, FloorLevel, RoomType } from '../core/types';
import type { DesignFloorRouteDef } from './design_floors';
import type { ProceduralFloorSpec } from './procedural_floors';
import {
  craftStationProfileForDesignFloor,
  craftStationProfileForProceduralFloor,
  craftStationProfileForStoryFloor,
  type CraftStationPlacementProfile,
} from './craft_station_placement';

export interface RoomWeightedPlacementRule {
  id: string;
  min: number;
  max: number;
  roomDivisor: number;
  roomTypeWeights: Partial<Record<RoomType, number>>;
  tags?: readonly string[];
}

export interface FeaturePlacementRule extends RoomWeightedPlacementRule {
  kind: 'feature';
  feature: Feature;
  allowWater?: boolean;
}

export interface InteractivePlacementRule extends RoomWeightedPlacementRule {
  kind: 'interactive';
  defId: string;
  forceFeature?: boolean;
}

export interface BrokenFixturePlacementRule {
  id: string;
  baseChance: number;
  max: number;
  features: readonly Feature[];
  roomTypeWeights?: Partial<Record<RoomType, number>>;
  tags?: readonly string[];
}

export interface FloorObjectPlacementProfile {
  id: string;
  tags: readonly string[];
  featureRules?: readonly FeaturePlacementRule[];
  interactiveRules?: readonly InteractivePlacementRule[];
  brokenFixtures?: readonly BrokenFixturePlacementRule[];
  craftStations?: CraftStationPlacementProfile;
}

function productionWeights(multiplier = 1): Partial<Record<RoomType, number>> {
  return {
    [RoomType.PRODUCTION]: 1.4 * multiplier,
    [RoomType.STORAGE]: 1.0 * multiplier,
    [RoomType.HQ]: 0.75 * multiplier,
  };
}

function scienceWeights(multiplier = 1): Partial<Record<RoomType, number>> {
  return {
    [RoomType.MEDICAL]: 1.5 * multiplier,
    [RoomType.PRODUCTION]: 1.0 * multiplier,
    [RoomType.STORAGE]: 0.8 * multiplier,
    [RoomType.OFFICE]: 0.45 * multiplier,
  };
}

function sanitaryBrokenFixtures(id: string, baseChance: number, max: number): BrokenFixturePlacementRule {
  return {
    id,
    baseChance,
    max,
    features: [Feature.SINK, Feature.TOILET],
    roomTypeWeights: {
      [RoomType.BATHROOM]: 1.45,
      [RoomType.KITCHEN]: 0.85,
      [RoomType.MEDICAL]: 0.7,
      [RoomType.PRODUCTION]: 0.35,
    },
    tags: ['sanitary', 'broken_fixture'],
  };
}

function pumpMachineryRules(prefix: string, min: number, max: number): readonly FeaturePlacementRule[] {
  return [
    {
      id: `${prefix}_pump_machines`,
      kind: 'feature',
      feature: Feature.MACHINE,
      min,
      max,
      roomDivisor: 4,
      roomTypeWeights: productionWeights(1.2),
      tags: [prefix, 'pump', 'machine'],
    },
    {
      id: `${prefix}_pump_apparatus`,
      kind: 'feature',
      feature: Feature.APPARATUS,
      min: Math.max(1, Math.floor(min * 0.75)),
      max: Math.max(1, Math.floor(max * 0.75)),
      roomDivisor: 5,
      roomTypeWeights: productionWeights(),
      tags: [prefix, 'pump', 'apparatus'],
    },
  ];
}

function routeTags(route: DesignFloorRouteDef): readonly string[] {
  return [route.id, `z_${route.z}`, FloorLevel[route.baseFloor]?.toLowerCase() ?? 'route'];
}

const STORY_OBJECT_PROFILE_OVERRIDES: Partial<Record<FloorLevel, Partial<FloorObjectPlacementProfile>>> = {
  [FloorLevel.MINISTRY]: {
    id: 'story_ministry_objects',
    tags: ['story_floor', 'ministry'],
    brokenFixtures: [sanitaryBrokenFixtures('ministry_sanitary_decay', 0.03, 6)],
  },
  [FloorLevel.KVARTIRY]: {
    id: 'story_kvartiry_objects',
    tags: ['story_floor', 'kvartiry'],
    brokenFixtures: [sanitaryBrokenFixtures('kvartiry_sanitary_decay', 0.055, 14)],
  },
  [FloorLevel.MAINTENANCE]: {
    id: 'story_maintenance_objects',
    tags: ['story_floor', 'maintenance', 'collectors'],
    featureRules: pumpMachineryRules('collectors', 5, 16),
    brokenFixtures: [sanitaryBrokenFixtures('collectors_sanitary_decay', 0.045, 5)],
  },
};

const DESIGN_OBJECT_PROFILE_OVERRIDES: Partial<Record<string, Partial<FloorObjectPlacementProfile>>> = {
  bolnichny_korpus: {
    id: 'design_bolnichny_korpus_objects',
    tags: ['design_floor', 'medical'],
    featureRules: [
      {
        id: 'hospital_lab_apparatus',
        kind: 'feature',
        feature: Feature.APPARATUS,
        min: 2,
        max: 7,
        roomDivisor: 5,
        roomTypeWeights: scienceWeights(),
        tags: ['hospital', 'lab', 'apparatus'],
      },
    ],
    brokenFixtures: [sanitaryBrokenFixtures('hospital_sanitary_decay', 0.035, 4)],
  },
  slime_nii: {
    id: 'design_slime_nii_objects',
    tags: ['design_floor', 'slime_nii', 'science'],
    featureRules: [
      {
        id: 'slime_nii_sample_apparatus',
        kind: 'feature',
        feature: Feature.APPARATUS,
        min: 3,
        max: 9,
        roomDivisor: 4,
        roomTypeWeights: scienceWeights(1.15),
        tags: ['slime_nii', 'sample', 'apparatus'],
      },
      {
        id: 'slime_nii_protocol_screens',
        kind: 'feature',
        feature: Feature.SCREEN,
        min: 1,
        max: 4,
        roomDivisor: 9,
        roomTypeWeights: {
          [RoomType.MEDICAL]: 1.2,
          [RoomType.OFFICE]: 1.0,
          [RoomType.HQ]: 0.8,
        },
        tags: ['slime_nii', 'screen', 'protocol'],
      },
    ],
    brokenFixtures: [sanitaryBrokenFixtures('slime_nii_sanitary_decay', 0.035, 5)],
  },
  turing_nursery: {
    id: 'design_turing_nursery_objects',
    tags: ['design_floor', 'turing_nursery', 'slime'],
    featureRules: [
      {
        id: 'turing_basin_apparatus',
        kind: 'feature',
        feature: Feature.APPARATUS,
        min: 2,
        max: 6,
        roomDivisor: 5,
        roomTypeWeights: scienceWeights(),
        tags: ['turing_nursery', 'basin', 'apparatus'],
      },
    ],
  },
  production_belt: {
    id: 'design_production_belt_objects',
    tags: ['design_floor', 'production_belt', 'industrial'],
    featureRules: [
      ...pumpMachineryRules('production_belt', 8, 24),
      {
        id: 'production_status_screens',
        kind: 'feature',
        feature: Feature.SCREEN,
        min: 1,
        max: 5,
        roomDivisor: 8,
        roomTypeWeights: {
          [RoomType.PRODUCTION]: 1.1,
          [RoomType.HQ]: 1.0,
          [RoomType.OFFICE]: 0.9,
        },
        tags: ['production_belt', 'screen', 'status'],
      },
    ],
  },
  service_floor: {
    id: 'design_service_floor_objects',
    tags: ['design_floor', 'service_floor', 'repair'],
    featureRules: pumpMachineryRules('service_floor', 6, 18),
    brokenFixtures: [sanitaryBrokenFixtures('service_floor_sanitary_decay', 0.05, 6)],
  },
  silicon_net_well: {
    id: 'design_silicon_net_well_objects',
    tags: ['design_floor', 'silicon_net_well', 'net'],
    featureRules: [
      {
        id: 'silicon_net_screens',
        kind: 'feature',
        feature: Feature.SCREEN,
        min: 2,
        max: 6,
        roomDivisor: 6,
        roomTypeWeights: {
          [RoomType.PRODUCTION]: 1.0,
          [RoomType.MEDICAL]: 0.9,
          [RoomType.HQ]: 0.8,
        },
        tags: ['silicon_net_well', 'screen', 'net'],
      },
    ],
  },
};

const PROCEDURAL_OBJECT_PROFILE_OVERRIDES: Partial<Record<string, Partial<FloorObjectPlacementProfile>>> = {
  collectors: {
    id: 'procedural_collectors_objects',
    tags: ['procedural_floor', 'collectors'],
    featureRules: pumpMachineryRules('procedural_collectors', 4, 13),
    brokenFixtures: [sanitaryBrokenFixtures('procedural_collectors_sanitary_decay', 0.045, 4)],
  },
  workshops: {
    id: 'procedural_workshops_objects',
    tags: ['procedural_floor', 'workshops'],
    featureRules: pumpMachineryRules('procedural_workshops', 7, 20),
  },
  service_spines: {
    id: 'procedural_service_spines_objects',
    tags: ['procedural_floor', 'service_spines'],
    featureRules: pumpMachineryRules('procedural_service_spines', 5, 15),
    brokenFixtures: [sanitaryBrokenFixtures('procedural_service_spines_sanitary_decay', 0.04, 4)],
  },
  sump_causeways: {
    id: 'procedural_sump_causeways_objects',
    tags: ['procedural_floor', 'sump_causeways'],
    featureRules: pumpMachineryRules('procedural_sump_causeways', 3, 9),
    brokenFixtures: [sanitaryBrokenFixtures('procedural_sump_sanitary_decay', 0.035, 3)],
  },
  apartment_pressure: {
    id: 'procedural_apartment_pressure_objects',
    tags: ['procedural_floor', 'apartment_pressure'],
    brokenFixtures: [sanitaryBrokenFixtures('procedural_apartment_sanitary_decay', 0.055, 9)],
  },
  communal_knots: {
    id: 'procedural_communal_knots_objects',
    tags: ['procedural_floor', 'communal_knots'],
    brokenFixtures: [sanitaryBrokenFixtures('procedural_communal_sanitary_decay', 0.05, 8)],
  },
  living_blocks: {
    id: 'procedural_living_blocks_objects',
    tags: ['procedural_floor', 'living_blocks'],
    brokenFixtures: [sanitaryBrokenFixtures('procedural_living_sanitary_decay', 0.04, 7)],
  },
};

function composeProfile(
  id: string,
  tags: readonly string[],
  craftStations: CraftStationPlacementProfile | undefined,
  override: Partial<FloorObjectPlacementProfile> | undefined,
): FloorObjectPlacementProfile | undefined {
  if (!craftStations && !override) return undefined;
  return {
    id: override?.id ?? id,
    tags: [...tags, ...(override?.tags ?? [])],
    featureRules: override?.featureRules,
    interactiveRules: override?.interactiveRules,
    brokenFixtures: override?.brokenFixtures,
    craftStations,
  };
}

export function floorObjectProfileForStoryFloor(floor: FloorLevel): FloorObjectPlacementProfile | undefined {
  return composeProfile(
    `story_${FloorLevel[floor]?.toLowerCase() ?? floor}_objects`,
    ['story_floor', FloorLevel[floor]?.toLowerCase() ?? 'story'],
    craftStationProfileForStoryFloor(floor),
    STORY_OBJECT_PROFILE_OVERRIDES[floor],
  );
}

export function floorObjectProfileForDesignFloor(route: DesignFloorRouteDef): FloorObjectPlacementProfile | undefined {
  return composeProfile(
    `design_${route.id}_objects`,
    ['design_floor', ...routeTags(route)],
    craftStationProfileForDesignFloor(route),
    DESIGN_OBJECT_PROFILE_OVERRIDES[route.id],
  );
}

export function floorObjectProfileForProceduralFloor(spec: ProceduralFloorSpec): FloorObjectPlacementProfile | undefined {
  return composeProfile(
    `procedural_${spec.geometryId}_objects`,
    ['procedural_floor', spec.geometryId, spec.majorityId, spec.anomalyId],
    craftStationProfileForProceduralFloor(spec),
    PROCEDURAL_OBJECT_PROFILE_OVERRIDES[spec.geometryId],
  );
}
