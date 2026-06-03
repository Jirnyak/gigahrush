# Korovan 2: migration data, cold tick and mobility state

> Parallel Agent 2 plan.
>
> Owns declarative destination profiles and the cold off-floor migration scheduler. This packet should not implement active-floor lift walking or caravan member conversion.

## Purpose

Add the universal run-start population plan and a bounded cold A-Life system that slowly moves persistent records between route keys using data profiles, not hidden world simulation.

The population plan is the single source that says which route keys have which people before any concrete floor is generated. The cold system is allowed to change off-floor `AlifeNpcRecord.floorKey` through Agent 1's API. It is not allowed to inspect inactive worlds, rooms, entities or floor memory.

## Files

Primary:

- `src/data/alife_population_plan.ts`
- `src/data/alife_migration.ts`
- `src/systems/alife_migration.ts`

Possible save integration, only if persistent journeys are implemented in this packet:

- `src/systems/save_runtime.ts`
- `src/systems/save_payload.ts`
- `src/core/types.ts` only if a state field must be typed globally; avoid if possible by using host intersection types.

Tests:

- `tests/alife-migration-data.test.ts`
- `tests/alife-migration.test.ts`
- save cap tests if persistent state is added.

Do not edit:

- `src/systems/caravans.ts`
- `src/systems/scripted_arrivals.ts`
- `src/systems/samosbor_director.ts`
- active arrival/departure code owned by Agent 3 except for shared state helpers.

## Data model

Create prefill and route/destination data that is compact and validateable.

### Universal population plan

`src/data/alife_population_plan.ts` should compose existing floor population facts into one declarative run-start plan:

```ts
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
  faction?: Faction;
  occupation?: Occupation;
  tags: readonly string[];
}

export interface AlifePopulationPlanDef {
  version: 1;
  total: 100000;
  buckets: readonly AlifePopulationBucketDef[];
  reserved: readonly AlifeReservedIdentityDef[];
}
```

Sources to compose, not duplicate blindly:

- story floor population profiles;
- `src/data/design_floor_population.ts`;
- `src/data/floor_theme_profiles.ts`;
- `src/data/design_floors.ts`;
- procedural route specs from `FloorRun` / `src/data/procedural_floors.ts`;
- plot/authored NPC registries where stable ids already exist.

Rules:

- The plan does not create or inspect `World`.
- The plan does not import generators.
- Design-floor local taste remains data-driven: floor 69, black market 88, NII/labs, bank and lower route floors get their own bucket weights/counts.
- Procedural route stops use route spec data and majority/anomaly/danger tags.
- Target counts are not "spawn caps"; they are pre-assigned population counts within the global fixed pool.
- A floor may have fewer live placement slots than pre-assigned records; only available slots materialize.
- A floor may have more slots than records; extra slots stay empty.
- NPC-forbidden floors get zero ordinary allocation unless a reserved authored exception explicitly says otherwise.
- Story/authored NPCs that persist are represented as reserved identities inside `reserved`.

Export:

```ts
export function buildAlifePopulationPlan(input: {
  runSeed: number;
  routeKeys: readonly string[];
  proceduralSpecs?: readonly ProceduralFloorSpec[];
}): AlifePopulationPlanDef

export function validateAlifePopulationPlan(plan: AlifePopulationPlanDef): string[]
```

The final implementation may choose a simpler input if `FloorRun` already exposes enough data.

### Migration profiles

Create route/destination data that reuses the same floor tags and route groups:

```ts
export type AlifeMigrationReason =
  | 'routine'
  | 'market'
  | 'work'
  | 'rest'
  | 'research'
  | 'caravan'
  | 'faction'
  | 'samosbor'
  | 'quest'
  | 'refugee';

export interface AlifeDestinationSelector {
  floorKeys?: readonly string[];
  routeTags?: readonly string[];
  baseFloors?: readonly FloorLevel[];
  minAbsZ?: number;
  maxAbsZ?: number;
  allowsNpcOnly?: boolean;
}

export interface AlifeMigrationIntentDef {
  id: string;
  reason: AlifeMigrationReason;
  weight: number;
  destination: AlifeDestinationSelector;
  factionBias?: readonly WeightedValue<Faction>[];
  occupationBias?: readonly WeightedValue<Occupation>[];
  minLevel?: number;
  maxRisk?: 1 | 2 | 3 | 4 | 5;
  wealthBias?: 'poor' | 'stable' | 'rich' | 'any';
  cooldownSeconds?: number;
  eventTags: readonly string[];
}
```

Initial intent ids:

- `admin_papers`
- `research_work`
- `market_trade`
- `rest_hide`
- `repair_shift`
- `lower_expedition`
- `caravan_member`
- `refugee_shift`
- `home_return`

Destination selectors should include:

- `story:ministry`
- `story:living`
- `story:maintenance`
- `design:black_market_88`
- `design:floor_69`
- `design:slime_nii`
- `design:silicon_net_well`
- `design:bank_floor`
- production/service/lab design floors that exist in `src/data/design_floors.ts`
- procedural lower route selectors by z/danger when route data is available.

Do not use Russian display names to identify destinations.

## Static validation

Export:

```ts
export function validateAlifePopulationPlan(plan?: AlifePopulationPlanDef): string[]
export function validateAlifeMigrationProfiles(): string[]
```

Validation:

- population plan has total exactly `100_000`;
- bucket ids are unique by `floorKey`;
- explicit story/design/procedural/floor-instance keys are known where the registry can verify them;
- sum of `targetCount` plus reserved identities is `<= 100_000`;
- every reserved `plotNpcId` is unique and assigned to exactly one bucket;
- NPC-forbidden floors have `targetCount === 0` unless only explicit reserved exceptions are present;
- unique lowercase snake_case ids;
- positive weights;
- known explicit route keys where the registry can verify them;
- no `FloorLevel.VOID` ordinary destinations;
- NPC-forbidden route keys excluded by default when `allowsNpcOnly !== false`;
- event tags capped and lowercase-ish;
- destination selector not empty.

Add static tests. Prefer this over generating floors.

## Runtime state

Use a host-intersection pattern like `caravans.ts` and `samosbor_director.ts`:

```ts
export interface AlifeMobilityState {
  version: 1;
  tickAccum: number;
  cursor: number;
  nextJourneySeq: number;
  journeys: Record<string, AlifeJourney>;
  pendingArrivals: AlifeArrival[];
  lastSummary?: AlifeMigrationSummary;
}
```

Caps:

- `MAX_ALIFE_JOURNEYS = 512`
- `MAX_ALIFE_PENDING_ARRIVALS = 256`
- `ALIFE_MIGRATION_TICK_SECONDS = 30`
- `ALIFE_MIGRATION_RECORDS_PER_TICK = 64`
- hard cap for forced test/debug tick: 256.

Export:

```ts
export function ensureAlifeMobilityState(state: GameState): AlifeMobilityState
export function alifeMobilityForSave(state: GameState): AlifeMobilitySaveState
export function setAlifeMobilityState(state: GameState, input: unknown): AlifeMobilityState
export function summarizeAlifeMigration(state: GameState, limit?: number): string[]
```

If save integration is deferred to the orchestrator, implement `set...` and `...ForSave` in the system file but do not wire them into `save_runtime.ts` yet.

## Cold tick algorithm

Export:

```ts
export function tickAlifeMigration(
  state: GameState,
  dt: number,
  opts?: { force?: boolean; maxRecords?: number; activeFloorKey?: string },
): number
```

Algorithm:

1. Accumulate `dt`; return `0` until cadence is reached unless `force`.
2. Resolve active floor key through `currentAlifeFloorKey(state)`.
3. Process due journeys first.
4. Process a bounded slice of records using `cursor`.
5. Skip:
   - dead snapshots;
   - records already in a journey;
   - records whose `floorKey` equals active floor key. Active departures are Agent 3.
6. Pick an intent using deterministic hash of `alife seed`, `state.time`, `record id`, `cursor`.
7. Resolve a destination using profile data and route context.
8. If destination equals source, skip.
9. Either:
   - create a journey with ETA, or
   - immediately move record for the first proof slice if persistent in-flight state is not wired yet.
10. Publish at most 1-3 aggregate events per tick.

No call may scan `World`, `world.rooms`, `entities`, `floorMemory`, inactive snapshots or generated floor data.

## Destination resolution

Implement route context from existing data:

- story keys by fixed map;
- design route definitions by `src/data/design_floors.ts`;
- procedural route specs from current `FloorRun` when available;
- `floorRunZAllowsNpcs(z)` for procedural/NPC-forbidden checks.

If exact route data is unavailable, skip that selector rather than hardcoding an invented target.

Travel time:

```txt
distance = abs(zA - zB) if both known, otherwise 3
base = 60 + distance * 20
riskFactor = 1 + (risk - 1) * 0.35
jitter = 0.8..1.35 deterministic
etaAt = state.time + base * riskFactor * jitter
```

Risk:

- max of source danger, destination danger, intent risk, recent event risk.
- cold deaths are disabled in first implementation unless explicit tests and event text are added.
- `lost` can exist in type shape but should not be selected until the orchestrator accepts loss tuning.

## Events

Use existing `publishEvent()`.

Suggested tags:

- `alife_migration`
- `migration`
- intent id
- reason
- source/target route tags
- `caravan` when called by Agent 4.

Payload should be compact:

```ts
data: {
  alifeId,
  fromFloorKey,
  toFloorKey,
  intentId,
  reason,
  journeyId,
  laneId,
  risk
}
```

Do not store or query Russian names in logic. Player-facing `targetName` may use the snapshot name.

## Save

Two acceptable lanes:

### Lane A: no persistent journeys

- cold tick performs immediate moves;
- save persists movement through A-Life overrides only;
- no `SAVE_SHAPE_VERSION` bump for this packet;
- active arrivals wait for Agent 3/orchestrator.

### Lane B: persistent mobility

- add `alifeMobility` to runtime save sections;
- cap/sanitize `journeys` and `pendingArrivals`;
- bump `SAVE_SHAPE_VERSION`;
- reject stale saves, no migration scaffold.

Preferred final product is Lane B. If parallel merge risk is high, implement Lane A first and leave Lane B hooks plus tests to `korovan_6.md`.

## Tests

Required:

- population plan validation returns no errors for a normal run route;
- all `100_000` identities can be allocated from bucket counts without calling a floor generator;
- plot/authored reserved ids are unique and included in the fixed population budget;
- NPC-forbidden route keys produce zero ordinary target count;
- floor 69, black market 88, labs/NII, Ministry and lower route groups have explicit bucket tags/count profiles;
- profile validation returns no errors;
- every explicit destination key is known or intentionally skipped with an error in validation;
- cold tick processes no more than configured max records;
- cold tick does not require a `World` or `entities`;
- dead records do not move;
- record already in a journey is skipped;
- immediate or due inactive-floor journey changes `floorKey` through A-Life API;
- due active-floor journey creates `pendingArrivals` and does not materialize entity itself;
- event cap is respected under many moves;
- sanitizer caps malformed `journeys` and `pendingArrivals` if save state is wired.

Use `minimalState()` style fixtures from A-Life tests. Do not generate floors unless route-key validity cannot be tested statically.

## Done

This packet is done when:

- data profiles exist and validate;
- a universal population plan exists and can pre-assign the fixed population to route buckets before first floor generation;
- story/authored reserved identities are represented in the same budget;
- a forced cold tick can move at least one off-floor record to a valid destination;
- the tick is bounded by cursor/limit/cadence;
- events are compact and capped;
- no off-floor world/entity scan exists;
- active-floor arrivals are queued, not spawned here.
