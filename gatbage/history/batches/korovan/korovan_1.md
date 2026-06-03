# Korovan 1: A-Life movement API and identity boundary

> Parallel Agent 1 plan.
>
> Owns the A-Life identity API needed by every other packet. This agent should not implement broad migration cadence, caravans or event-specific logic.

## Purpose

Make `src/systems/alife.ts` the single owner of run-start population prefill, persistent NPC movement between `floorKey` buckets and the single constructor path for materializing a persistent record as a live NPC.

Current source facts:

- `AlifeNpcRecord.floorKey` and private `floorIndex` already hold persistent location.
- `attachRecordToFloor()` already removes a record index from old buckets and inserts it into the new bucket.
- `captureEntityToRecord()` already folds live entity state into a record and marks `touched`.
- `materializeEntity()` already maps a record plus optional template into a live NPC.
- `assignPersistentAlifeNpcFromEntity()` can assign identity to event-created ordinary NPCs, but it may append records while the fixed pool is still below cap and is not a generic migration API.
- Current A-Life generation already distributes records across route keys; this packet makes that explicit as a prefill consumer: a universal population plan assigns all `100_000` records before the first floor is generated.

## Files

Primary:

- `src/systems/alife.ts`

Tests:

- extend `tests/alife.test.ts`, or add `tests/alife-migration-api.test.ts`.

Do not edit:

- `src/systems/caravans.ts`
- `src/systems/alife_migration.ts`
- `src/systems/scripted_arrivals.ts`
- `src/systems/samosbor_director.ts`
- `main.ts`

## New exported types

Add minimal public snapshots, not public mutable record access:

```ts
export interface AlifeNpcSnapshot {
  id: number;
  floorKey: string;
  floor: FloorLevel;
  faction: Faction;
  occupation: Occupation;
  name: string;
  female: boolean;
  level: number;
  hp: number;
  maxHp: number;
  money: number;
  accountRubles: number;
  familyId: number;
  canGiveQuest: boolean;
  playerRelation?: number;
  karma: number;
  dead: boolean;
  x?: number;
  y?: number;
  angle?: number;
}

export interface MoveAlifeNpcOptions {
  markTouched?: boolean;
  preservePosition?: boolean;
  x?: number;
  y?: number;
  angle?: number;
}

export interface MaterializeAlifeArrivalOptions {
  x: number;
  y: number;
  angle?: number;
  isTraveler?: boolean;
  goalX?: number;
  goalY?: number;
}
```

Keep snapshots small. Do not expose inventory unless a caller has a concrete need; caravans and cold tick should not inspect full inventory.

## Run-start prefill contract

Agent 1 owns the system side of prefilled population. The data source may be delivered by Agent 2 as `src/data/alife_population_plan.ts`; if it is not available yet, keep a tiny local adapter boundary and let the orchestrator connect it.

Expected API shape:

```ts
export interface CreateAlifeStateOptions {
  populationPlan?: AlifePopulationPlan;
}

export function createPrefilledAlifeState(
  state: GameState,
  seed: number,
  total: number,
  plan: AlifePopulationPlan,
): AlifeState
```

Implementation rules:

- `createAlifeState()` / `setAlifeState()` should build `floorIndex` from the plan, not by asking floor generators.
- The plan is consumed after title setup/seed selection and before first floor generation.
- Every record receives a `floorKey` from a plan bucket before any floor is loaded.
- `targetCount` values are caps/weights within fixed `100_000`; if plan totals overrun, fail validation in data/tests rather than silently creating more people.
- Story/authored reserved specs occupy ordinary A-Life records inside the same pool.
- Reserved plot identities should carry stable fields such as `plotNpcId`, `faction`, `occupation`, `name` and `floorKey` if the current type shape supports them. If `AlifeNpcRecord` cannot store `plotNpcId` yet without wider integration, add a reserved mapping helper and leave final field wiring to the orchestrator.
- Floor generation templates remain placement hints only. They can influence live sprite/room placement during materialization, but they do not decide population membership.

Do not add a new pool for plot NPCs. Do not generate geometry during prefill.

## New exported functions

### `buildAlifeStateFromPopulationPlan()`

Suggested private or exported helper:

```ts
export function buildAlifeStateFromPopulationPlan(
  state: GameState,
  seed: number,
  total: number,
  plan: AlifePopulationPlan,
): AlifeState
```

Behavior:

- iterate plan buckets in deterministic order;
- create records with existing `createRecord()` logic, but using bucket floor/profile data;
- attach each record to `floorIndex[bucket.floorKey]`;
- reserve story/authored identities before generic fill for that bucket so they are stable;
- if a bucket has fewer placement slots later, materialization uses only available active slots;
- if a bucket has more slots than records, slots stay empty;
- no generator call and no `World` allocation.

Tests for this helper belong in this packet.

### `moveAlifeNpcRecord()`

Suggested signature:

```ts
export function moveAlifeNpcRecord(
  state: GameState,
  alifeId: number,
  toFloorKey: string,
  opts: MoveAlifeNpcOptions = {},
): boolean
```

Behavior:

- call `ensureAlifeState(state)`;
- reject non-integer ids, `alifeId <= 0`, missing records and `record.dead`;
- normalize `toFloorKey` to a bounded string, max 96 chars;
- reject empty or unknown-hostile key only if there is an existing route-key validator available; otherwise accept string ids and let Agent 2 validate profiles statically;
- derive coarse `record.floor` from target route key when possible:
  - story key -> matching `FloorLevel`;
  - design/procedural route -> route entry/spec base floor when resolvable;
  - otherwise preserve previous `record.floor`;
- call existing `attachRecordToFloor(alife, recordIndex, toFloorKey)`;
- set `record.floorKey = toFloorKey`;
- if `preservePosition !== true`, clear `x`, `y`, `angle` unless explicit coordinates are provided;
- if explicit `x/y/angle` provided, clamp/sanitize and store them;
- if `markTouched !== false`, set `record.touched = true`;
- bump `leaderboardVersion` only if fields affecting rank/social view changed. `floorKey` alone should not force a rank rebuild unless the leaderboard displays floor.

Do not publish events in this helper. The caller owns reason and event payload.

### `getAlifeNpcRecordSnapshot()`

```ts
export function getAlifeNpcRecordSnapshot(state: GameState, alifeId: number): AlifeNpcSnapshot | undefined
```

Return a copy. Never return the mutable internal record.

### `sampleAlifeFloorRecordIds()`

```ts
export function sampleAlifeFloorRecordIds(
  state: GameState,
  floorKey: string,
  cursor: number,
  limit: number,
): { ids: number[]; nextCursor: number }
```

Behavior:

- read `floorIndex[floorKey]`;
- return alive ids only;
- use cursor modulo bucket length;
- cap `limit` to a small constant, for example `256`;
- if bucket is empty, return empty ids and cursor `0`;
- do not allocate huge arrays.

This supports lane/source-floor sampling without letting other systems mutate `floorIndex`.

### `currentAlifeFloorRecordIds()`

```ts
export function currentAlifeFloorRecordIds(state: GameState, floorKey: string): readonly number[]
```

May return a frozen copy or a readonly copy. Do not return the mutable bucket array if callers can cast and mutate it.

### `materializeAlifeArrival()`

Suggested signature:

```ts
export function materializeAlifeArrival(
  state: GameState,
  world: World,
  entities: Entity[],
  nextId: { v: number },
  alifeId: number,
  opts: MaterializeAlifeArrivalOptions,
): Entity | null
```

Behavior:

- reject dead/missing record;
- reject if a live entity with the same `alifeId` already exists;
- verify `passable(world, opts.x, opts.y)`;
- reuse the private `materializeEntity()` path, not a second copy of NPC construction;
- pass a lightweight template only for position, angle, `isTraveler`, and AI goal;
- set `record.floorKey = currentAlifeFloorKey(state)` through `moveAlifeNpcRecord()` before materialization when needed;
- push the created entity into `entities`;
- return the entity for event/log callers.

If `materializeEntity()` is too private to use cleanly, refactor it internally, but do not duplicate the mapping of wealth, relation, karma, RPG, sprite, inventory and `persistentNpcId`.

### `reserveAlifeEventIdentity()`

Optional but useful for Agent 5:

```ts
export function reserveAlifeEventIdentity(
  state: GameState,
  floorKey: string,
  template: Partial<Entity> & { name?: string },
  entities: readonly Entity[],
): number | undefined
```

Use this only for declared event actors. It may reuse the safer parts of `assignPersistentAlifeNpcFromEntity()` but should prefer reserving an unused existing record over appending beyond the fixed pool. If implementation risk is high, skip this helper and let Agent 5 continue using stable `plotNpcId` for named actors.

## Route key resolution

Do not invent a large resolver in `alife.ts`. Add one small private helper only if existing imports are clean:

- use `floorRunEntryFloorKey(currentFloorRunEntry(state))` for current active key;
- story keys can map directly;
- design/procedural route keys can be resolved through existing route data only if that does not create circular imports.

If resolution is uncertain, preserve `record.floor`; `floorKey` remains the authority for migrations.

## Tests

Required tests:

- prefilled state assigns all `100_000` records to known `floorKey` buckets before any floor generation;
- reserved plot/authored specs occupy identities inside the same population and have unique stable ids;
- floor buckets can intentionally have zero ordinary records for NPC-forbidden floors;
- materialization uses existing floor bucket records and does not ask the generator to create identities;
- moving record from `story:living` to `design:black_market_88` removes it from old bucket and adds it to new bucket once;
- moving dead record returns false and does not touch buckets;
- moving missing id returns false;
- repeated move to same key does not duplicate bucket membership;
- saved overrides include moved record's new `floorKey`;
- `sampleAlifeFloorRecordIds()` respects `limit`, cursor wrap and skips dead records;
- `getAlifeNpcRecordSnapshot()` returns a copy that cannot mutate the internal record;
- `materializeAlifeArrival()` creates an entity with `alifeId`, `persistentNpcId`, wealth fields, relation, karma and passable position;
- duplicate materialization of the same `alifeId` on the same active floor returns null or no-ops.

Use small `World` fixtures like `tests/alife.test.ts`. Do not generate full floors for this packet.

## Edge cases

- Killed plot NPCs are separate from procedural A-Life records; do not move plot death state here.
- Player body has `persistentNpcId: 'player'`; do not treat it as movable ordinary A-Life.
- If a record has `x/y` from an old floor and moves to a new floor, clear them unless explicit arrival coordinates are supplied.
- Do not clear `playerRelation`, `karma`, kills, money, accountRubles or inventory on migration.
- Do not add event-specific `reason` fields to `AlifeNpcRecord`; reasons belong to mobility/event state.

## Done

This packet is done when other systems can:

- inspect an A-Life record by id without mutating it;
- construct a deterministic prefilled population from a universal plan;
- move a record between floor keys safely;
- sample source floor ids cheaply;
- materialize a persistent arrival near a provided active-floor coordinate;
- rely on tests proving no bucket duplication or dead-record movement.
