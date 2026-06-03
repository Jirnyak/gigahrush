import { Faction, FloorLevel, Occupation } from '../core/types';
import type { WeightedValue } from './alife_generation';
import { DESIGN_FLOOR_ROUTES, type DesignFloorRouteDef } from './design_floors';
import { designFloorPopulationProfile } from './design_floor_population';
import {
  anomalyById,
  floorRunZAllowsNpcs,
  majorityById,
  PROCEDURAL_FLOOR_ZS,
  proceduralFloorAnomalyRoutePressure,
  type ProceduralFloorSpec,
  makeProceduralFloorSpec,
} from './procedural_floors';
import {
  proceduralPopulationBudget,
  proceduralPopulationProfileId,
} from './population_profiles';
import { PLOT_NPCS, plotNpcHomeFloorKey } from './plot';
import {
  themeForDesignRoute,
  themeForProceduralSpec,
  themeForStoryFloor,
} from './floor_theme_profiles';
import { floorKeyAllowsNpcs, floorKeyForDesign, floorKeyForProcedural, floorKeyForStory, floorKeyKnown } from './floor_keys';

export interface AlifePopulationBucketDef {
  floorKey: string;
  baseFloor: FloorLevel;
  targetCount: number;
  populationProfileId: string;
  factionWeights?: readonly WeightedValue<Faction>[];
  occupationWeights?: readonly WeightedValue<Occupation>[];
  tags: readonly string[];
  npcAllowed: boolean;
}

export interface AlifeReservedIdentityDef {
  id: string;
  kind: 'plot' | 'authored' | 'event_reserved';
  floorKey: string;
  plotNpcId?: string;
  name?: string;
  female?: boolean;
  faction?: Faction;
  occupation?: Occupation;
  sprite?: number;
  npcVisualId?: string;
  level?: number;
  hp?: number;
  maxHp?: number;
  money?: number;
  accountRubles?: number;
  tags: readonly string[];
}

export interface AlifePopulationPlanDef {
  version: 1;
  total: number;
  buckets: readonly AlifePopulationBucketDef[];
  reserved: readonly AlifeReservedIdentityDef[];
}

interface WeightedBucket extends Omit<AlifePopulationBucketDef, 'targetCount'> {
  weight: number;
}

export const ALIFE_POPULATION_CAPACITY = 131_072 as const;
export const ALIFE_POPULATION_BASELINE = 100_000 as const;
export const ALIFE_POPULATION_JITTER = 8_192 as const;
export const ALIFE_POPULATION_MIN_RANDOM = ALIFE_POPULATION_BASELINE - ALIFE_POPULATION_JITTER;
const SNAKE_ID_RE = /^[a-z0-9_]+$/;

const STORY_POPULATION_WEIGHT: Readonly<Record<FloorLevel, number>> = {
  [FloorLevel.MINISTRY]: 4_500,
  [FloorLevel.KVARTIRY]: 10_000,
  [FloorLevel.LIVING]: 7_000,
  [FloorLevel.MAINTENANCE]: 3_500,
  [FloorLevel.HELL]: 1_100,
  [FloorLevel.VOID]: 0,
};

const STORY_POPULATION_PROFILE: Readonly<Record<FloorLevel, string>> = {
  [FloorLevel.MINISTRY]: 'story:ministry_admin',
  [FloorLevel.KVARTIRY]: 'story:kvartiry_lively',
  [FloorLevel.LIVING]: 'story:living_hub',
  [FloorLevel.MAINTENANCE]: 'story:maintenance_service',
  [FloorLevel.HELL]: 'story:hell_lively',
  [FloorLevel.VOID]: 'story:void_lively',
};

function uniqueTags(tags: readonly string[], cap = 16): readonly string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || out.includes(tag)) continue;
    out.push(tag.slice(0, 32));
    if (out.length >= cap) break;
  }
  return out;
}

function storyBucket(floor: FloorLevel): WeightedBucket {
  const theme = themeForStoryFloor(floor);
  return {
    floorKey: floorKeyForStory(floor),
    baseFloor: floor,
    weight: floorRunZAllowsNpcs(theme.routeZ ?? 0) ? STORY_POPULATION_WEIGHT[floor] : 0,
    populationProfileId: theme.populationProfileId ?? STORY_POPULATION_PROFILE[floor],
    tags: uniqueTags([
      'story',
      ...theme.specialContentTags,
      ...theme.economyTags,
      ...theme.objectProfileTags,
      ...theme.monsterPressureTags,
    ]),
    npcAllowed: theme.npcAllowed,
  };
}

function designBucket(route: DesignFloorRouteDef): WeightedBucket {
  const theme = themeForDesignRoute(route);
  const population = designFloorPopulationProfile(route);
  return {
    floorKey: floorKeyForDesign(route.id),
    baseFloor: route.baseFloor,
    weight: theme.npcAllowed ? population.npcTarget : 0,
    populationProfileId: theme.populationProfileId ?? `design:${route.id}`,
    factionWeights: population.npcFactions,
    occupationWeights: population.npcOccupations,
    tags: uniqueTags([
      'design',
      route.id,
      `danger_${route.danger}`,
      ...theme.specialContentTags,
      ...theme.economyTags,
      ...theme.objectProfileTags,
      ...theme.monsterPressureTags,
    ]),
    npcAllowed: theme.npcAllowed,
  };
}

function isIndustrialGeometry(spec: ProceduralFloorSpec): boolean {
  return spec.geometryId === 'collectors' ||
    spec.geometryId === 'workshops' ||
    spec.geometryId === 'service_spines' ||
    spec.geometryId === 'attic_weatherworks' ||
    spec.geometryId === 'sump_causeways';
}

function proceduralBucket(spec: ProceduralFloorSpec): WeightedBucket {
  const theme = themeForProceduralSpec(spec);
  const majority = majorityById(spec.majorityId);
  const anomaly = anomalyById(spec.anomalyId);
  const profileId = proceduralPopulationProfileId(spec.anomalyId);
  const budget = proceduralPopulationBudget({
    z: spec.z,
    danger: spec.danger,
    anomalyPressure: proceduralFloorAnomalyRoutePressure(spec),
    industrial: isIndustrialGeometry(spec),
    npcAllowed: theme.npcAllowed,
    profileId,
  });
  return {
    floorKey: floorKeyForProcedural(spec.key),
    baseFloor: spec.baseFloor,
    weight: theme.npcAllowed ? budget.npcs : 0,
    populationProfileId: `procedural:${budget.profileId}`,
    factionWeights: [{ value: majority.npcFaction, weight: 4 }],
    tags: uniqueTags([
      'procedural',
      spec.key,
      spec.geometryId,
      spec.majorityId,
      spec.anomalyId,
      `danger_${spec.danger}`,
      `z_${spec.z}`,
      ...theme.specialContentTags,
      ...theme.economyTags,
      ...theme.objectProfileTags,
      ...theme.monsterPressureTags,
      ...majority.tags,
      ...anomaly.tags,
    ]),
    npcAllowed: theme.npcAllowed,
  };
}

function plotNpcFloorKey(id: string, def: (typeof PLOT_NPCS)[string]): string {
  return plotNpcHomeFloorKey(id, def) ?? floorKeyForStory(FloorLevel.LIVING);
}

function buildReservedIdentities(): AlifeReservedIdentityDef[] {
  return Object.entries(PLOT_NPCS).map(([plotNpcId, def]) => ({
    id: `plot:${plotNpcId}`,
    kind: 'plot' as const,
    floorKey: plotNpcFloorKey(plotNpcId, def),
    plotNpcId,
    name: def.name,
    female: def.isFemale,
    faction: def.faction,
    occupation: def.occupation,
    sprite: def.sprite,
    npcVisualId: def.npcVisualId,
    level: def.level,
    hp: def.hp,
    maxHp: def.maxHp,
    money: def.money,
    accountRubles: def.accountRubles,
    tags: uniqueTags(['plot', 'authored', plotNpcId]),
  }));
}

function allocateCounts(buckets: readonly WeightedBucket[], ordinaryTotal: number): number[] {
  const counts = buckets.map(() => 0);
  const positive = buckets
    .map((bucket, index) => ({ bucket, index }))
    .filter(row => row.bucket.weight > 0 && row.bucket.npcAllowed);
  const weightSum = positive.reduce((sum, row) => sum + row.bucket.weight, 0);
  if (weightSum <= 0 || ordinaryTotal <= 0) return counts;

  const remainders: Array<{ index: number; remainder: number }> = [];
  let used = 0;
  for (const row of positive) {
    const raw = ordinaryTotal * row.bucket.weight / weightSum;
    const count = Math.floor(raw);
    counts[row.index] = count;
    used += count;
    remainders.push({ index: row.index, remainder: raw - count });
  }
  remainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; used < ordinaryTotal && remainders.length > 0; i++, used++) {
    counts[remainders[i % remainders.length].index]++;
  }
  return counts;
}

function buildProceduralSpecs(runSeed: number, specs: readonly ProceduralFloorSpec[] | undefined): ProceduralFloorSpec[] {
  if (specs && specs.length > 0) return [...specs];
  return PROCEDURAL_FLOOR_ZS.map(z => makeProceduralFloorSpec(runSeed, z));
}

function routeAllowed(floorKey: string, allowed: ReadonlySet<string> | undefined): boolean {
  return !allowed || allowed.size === 0 || allowed.has(floorKey);
}

function populationHash(seed: number): number {
  let x = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

export function alifePopulationTotalForSeed(runSeed: number): number {
  const span = ALIFE_POPULATION_JITTER * 2 + 1;
  const offset = (populationHash(runSeed) % span) - ALIFE_POPULATION_JITTER;
  return Math.max(ALIFE_POPULATION_MIN_RANDOM, Math.min(ALIFE_POPULATION_CAPACITY, ALIFE_POPULATION_BASELINE + offset));
}

export function clampAlifePopulationTotal(total: unknown, fallback: number, min = 1): number {
  const base = typeof fallback === 'number' && Number.isFinite(fallback) ? Math.floor(fallback) : ALIFE_POPULATION_BASELINE;
  const value = typeof total === 'number' && Number.isFinite(total) ? Math.floor(total) : base;
  return Math.max(min, Math.min(ALIFE_POPULATION_CAPACITY, value));
}

export function buildAlifePopulationPlan(input: {
  runSeed: number;
  routeKeys: readonly string[];
  proceduralSpecs?: readonly ProceduralFloorSpec[];
  total?: number;
}): AlifePopulationPlanDef {
  const allowed = input.routeKeys.length > 0 ? new Set(input.routeKeys) : undefined;
  const weighted: WeightedBucket[] = [];
  for (const floor of [FloorLevel.MINISTRY, FloorLevel.KVARTIRY, FloorLevel.LIVING, FloorLevel.MAINTENANCE, FloorLevel.HELL, FloorLevel.VOID]) {
    const bucket = storyBucket(floor);
    if (routeAllowed(bucket.floorKey, allowed)) weighted.push(bucket);
  }
  for (const route of DESIGN_FLOOR_ROUTES) {
    const bucket = designBucket(route);
    if (routeAllowed(bucket.floorKey, allowed)) weighted.push(bucket);
  }
  for (const spec of buildProceduralSpecs(input.runSeed, input.proceduralSpecs)) {
    const bucket = proceduralBucket(spec);
    if (routeAllowed(bucket.floorKey, allowed)) weighted.push(bucket);
  }

  const reserved = buildReservedIdentities().filter(identity => routeAllowed(identity.floorKey, allowed));
  const fallbackTotal = alifePopulationTotalForSeed(input.runSeed);
  const total = clampAlifePopulationTotal(input.total, fallbackTotal, reserved.length);
  const ordinaryTotal = Math.max(0, total - reserved.length);
  const counts = allocateCounts(weighted, ordinaryTotal);
  const buckets = weighted.map((bucket, index) => ({
    floorKey: bucket.floorKey,
    baseFloor: bucket.baseFloor,
    targetCount: counts[index],
    populationProfileId: bucket.populationProfileId,
    factionWeights: bucket.factionWeights,
    occupationWeights: bucket.occupationWeights,
    tags: bucket.tags,
    npcAllowed: bucket.npcAllowed,
  }));
  return { version: 1, total, buckets, reserved };
}

function validateWeights<T>(errors: string[], label: string, weights: readonly WeightedValue<T>[] | undefined): void {
  if (!weights) return;
  for (const row of weights) {
    if (!(row.weight > 0)) errors.push(`${label} has non-positive weight`);
  }
}

function tagsValid(tags: readonly string[]): boolean {
  return tags.length <= 16 && tags.every(tag => /^[a-z0-9:_-]+$/.test(tag));
}

export function validateAlifePopulationPlan(plan?: AlifePopulationPlanDef): string[] {
  const checked = plan ?? buildAlifePopulationPlan({ runSeed: 1, routeKeys: [] });
  const errors: string[] = [];
  if (checked.version !== 1) errors.push('population plan version must be 1');
  if (!Number.isInteger(checked.total) || checked.total <= 0 || checked.total > ALIFE_POPULATION_CAPACITY) {
    errors.push(`population plan total must be 1..${ALIFE_POPULATION_CAPACITY}`);
  }

  const bucketKeys = new Set<string>();
  const knownContext = { extraKnownKeys: checked.buckets.map(item => item.floorKey) };
  let allocated = 0;
  for (const bucket of checked.buckets) {
    if (bucketKeys.has(bucket.floorKey)) errors.push(`duplicate population bucket ${bucket.floorKey}`);
    bucketKeys.add(bucket.floorKey);
    if (!floorKeyKnown(bucket.floorKey, knownContext)) errors.push(`unknown population floor key ${bucket.floorKey}`);
    if (!Number.isInteger(bucket.targetCount) || bucket.targetCount < 0) errors.push(`invalid target count for ${bucket.floorKey}`);
    allocated += Math.max(0, Math.floor(bucket.targetCount));
    const allowed = floorKeyAllowsNpcs(bucket.floorKey);
    if ((allowed === false || bucket.npcAllowed === false) && bucket.targetCount !== 0) {
      errors.push(`NPC-forbidden bucket ${bucket.floorKey} has ordinary target count`);
    }
    if (!bucket.populationProfileId) errors.push(`missing population profile for ${bucket.floorKey}`);
    if (!tagsValid(bucket.tags)) errors.push(`invalid tags for ${bucket.floorKey}`);
    validateWeights(errors, `${bucket.floorKey} faction weights`, bucket.factionWeights);
    validateWeights(errors, `${bucket.floorKey} occupation weights`, bucket.occupationWeights);
  }

  const reservedIds = new Set<string>();
  const plotIds = new Set<string>();
  for (const reserved of checked.reserved) {
    if (reservedIds.has(reserved.id)) errors.push(`duplicate reserved identity ${reserved.id}`);
    reservedIds.add(reserved.id);
    if (!reserved.id.startsWith(`${reserved.kind}:`) && reserved.kind === 'plot') errors.push(`plot reserved identity ${reserved.id} must use plot: prefix`);
    if (!floorKeyKnown(reserved.floorKey, knownContext)) errors.push(`unknown reserved floor key ${reserved.floorKey}`);
    if (reserved.plotNpcId) {
      if (plotIds.has(reserved.plotNpcId)) errors.push(`duplicate reserved plot NPC ${reserved.plotNpcId}`);
      plotIds.add(reserved.plotNpcId);
      if (!SNAKE_ID_RE.test(reserved.plotNpcId)) errors.push(`reserved plot NPC id is not snake_case: ${reserved.plotNpcId}`);
    }
    if (!tagsValid(reserved.tags)) errors.push(`invalid reserved tags for ${reserved.id}`);
  }

  if (allocated + checked.reserved.length !== checked.total) {
    errors.push('population buckets plus reserved identities must equal total');
  }
  return errors;
}
