import { type TerritoryOwner } from '../core/types';
import { floorObjectProfileForDesignFloor, floorObjectProfileForProceduralFloor } from './floor_object_placement';
import { designFloorPopulationProfile } from './design_floor_population';
import {
  DESIGN_FLOOR_ROUTES,
  designFloorThemeClass,
  type DesignFloorId,
  type DesignFloorRouteDef,
} from './design_floors';
import {
  anomalyById,
  floorRunZAllowsNpcs,
  majorityById,
  proceduralFloorMonsterBiasTags,
  type ProceduralFloorSpec,
} from './procedural_floors';
import { zForBaseFloor } from './floor_keys';
import {
  proceduralPopulationProfileId,
} from './population_profiles';
import {
  territorySharesForDesignFloor,
  territorySharesForProceduralSpec,
  type FloorTerritoryShare,
} from './floor_territory';

export interface FloorThemeProfile {
  floorKey: string;
  
  /**
   * Content/visual/population class. Equals `baseFloor` for base/procedural
   * floors and for design floors that do not override it, but a design floor
   * can declare a different `themeClass` to own its look and population mix
   * independently of the engine save bucket (`baseFloor`).
   */
  themeTags: readonly string[];
  routeId?: DesignFloorId | string;
  routeZ?: number;
  kind: 'design' | 'procedural' | 'floor_instance';
  danger: 1 | 2 | 3 | 4 | 5;
  npcAllowed: boolean;
  territoryShares: readonly FloorTerritoryShare[];
  populationProfileId?: string;
  majorityOwner?: TerritoryOwner;
  objectProfileTags: readonly string[];
  monsterPressureTags: readonly string[];
  economyTags: readonly string[];
  specialContentTags: readonly string[];
}

function designFloorKey(id: DesignFloorId | string): string {
  return `design:${id}`;
}

function proceduralFloorKey(key: string): string {
  return `procedural:${key}`;
}

function uniqueTags(values: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const value of values) {
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function nonEmptyTags(values: readonly string[] | undefined): readonly string[] {
  return values && values.length > 0 ? values : [];
}

export function themeForDesignFloor(id: DesignFloorId, route = DESIGN_FLOOR_ROUTES.find(def => def.id === id)): FloorThemeProfile {
  if (!route) throw new Error(`Unknown design floor route: ${id}`);
  return themeForDesignRoute(route);
}

export function themeForDesignRoute(route: DesignFloorRouteDef): FloorThemeProfile {
  const population = designFloorPopulationProfile(route);
  const objectProfile = floorObjectProfileForDesignFloor(route);
  const territoryShares = territorySharesForDesignFloor(route.id);
    return {
    floorKey: designFloorKey(route.id),
    
    themeTags: route.themeTags || [],
    routeId: route.id,
    routeZ: route.z,
    kind: 'design',
    danger: route.danger,
    npcAllowed: floorRunZAllowsNpcs(route.z),
    territoryShares,
    populationProfileId: `design:${population.routeId}`,
    majorityOwner: dominantTerritoryShareOwner(territoryShares),
    objectProfileTags: nonEmptyTags(objectProfile?.tags),
    monsterPressureTags: uniqueTags(population.monsterTags),
    economyTags: uniqueTags([route.id, (route.themeTags && route.themeTags[0]) || 'design', ...(objectProfile?.tags ?? [])]),
    specialContentTags: uniqueTags([route.id, `danger_${route.danger}`]),
  };
}

export function themeForProceduralSpec(spec: ProceduralFloorSpec): FloorThemeProfile {
  const majority = majorityById(spec.majorityId);
  const anomaly = anomalyById(spec.anomalyId);
  const objectProfile = floorObjectProfileForProceduralFloor(spec);
  const populationProfile = proceduralPopulationProfileId(spec.anomalyId);
  const territoryShares = territorySharesForProceduralSpec(spec);
  return {
    floorKey: proceduralFloorKey(spec.key),
    
    themeTags: spec.themeTags || [],
    routeId: spec.key,
    routeZ: spec.z,
    kind: 'procedural',
    danger: spec.danger,
    npcAllowed: floorRunZAllowsNpcs(spec.z),
    territoryShares,
    populationProfileId: `procedural:${populationProfile}`,
    majorityOwner: majority.zoneFaction,
    objectProfileTags: nonEmptyTags(objectProfile?.tags),
    monsterPressureTags: uniqueTags([...spec.monsterBiasTags, ...proceduralFloorMonsterBiasTags(spec)]),
    economyTags: uniqueTags([spec.geometryId, spec.majorityId, spec.anomalyId, ...anomaly.tags, ...(objectProfile?.tags ?? [])]),
    specialContentTags: uniqueTags([spec.geometryId, spec.majorityId, spec.anomalyId, ...majority.tags, ...anomaly.tags]),
  };
}

export function dominantTerritoryShareOwner(shares: readonly FloorTerritoryShare[]): TerritoryOwner | undefined {
  let best: FloorTerritoryShare | undefined;
  for (const row of shares) {
    if (!best || row.share > best.share) best = row;
  }
  return best?.owner;
}
