# Korovan 6: final orchestrator after five agents

> Run this after `korovan_1.md` through `korovan_5.md` are implemented.
>
> Role: merge, reconcile and ship the complete cold A-Life / caravan migration system. The orchestrator should not invent a new design; it should enforce the contracts, resolve branch seams and run the final validation.

## Intake

Before editing:

1. `git status --short`
2. Read every changed file from the five agents.
3. Re-read:
   - `README.md`
   - `architecture.md`
   - `alife.md`
   - `floors.md`
   - `economics.md`
   - `save.md`
   - `tests.md`
   - `samosbor.md`
   - `korovan.md`
   - `korovan_0.md` through `korovan_5.md`
4. Run targeted read-only searches:
   - `rg -n "EntityType.NPC|entities.push|nextId\\.v\\+\\+|assignPersistentAlifeNpcFromEntity|materializeAlife|moveAlife|extra_patrol|scripted_arrivals" src/systems src/gen src/main.ts`
   - verify no new natural ordinary NPC creation slipped in.
   - verify no floor generator still owns ordinary identity creation after A-Life prefill.

## Merge priorities

Keep this order:

1. Universal population plan data from Agent 2 is source of truth for run-start floor buckets and reserved story/authored identities.
2. A-Life prefill/API from Agent 1 is source of truth for consuming that plan and owning `floorIndex`.
3. Data profiles from Agent 2 are source of truth for destination/intent ids.
4. Active arrival/departure logic from Agent 3 is source of truth for current-floor materialization.
5. Caravan member identity from Agent 4 is source of truth for caravan people.
6. Spawn normalization from Agent 5 is source of truth for existing scripted/samosbor/faction paths.

If names conflict, prefer clarity over cleverness:

- `moveAlifeNpcRecord`
- `getAlifeNpcRecordSnapshot`
- `sampleAlifeFloorRecordIds`
- `materializeAlifeArrival`
- `buildAlifePopulationPlan`
- `ensureAlifeMobilityState`
- `tickAlifeMigration`
- `processAlifePendingArrivals`
- `updateActiveAlifeDepartures`
- `enqueueAlifeArrival`

## Integration tasks

### 1. Compile the public API

- ensure no two modules define incompatible `AlifeMigrationReason`;
- ensure no two modules define incompatible `AlifePopulationPlan` / reserved identity shapes;
- move shared reason/type exports to `src/data/alife_migration.ts` if both data and system need them;
- keep population-plan data in `src/data/alife_population_plan.ts`; it must not import systems or generators;
- avoid importing system code from data files;
- avoid circular imports between `alife.ts`, `alife_migration.ts`, `caravans.ts` and event systems.

### 1a. Wire run-start prefill

- ensure title/new-run setup builds the route/floor run first, then builds the universal population plan, then creates A-Life state, then generates the first active floor;
- `createAlifeState()` / `setAlifeState()` should assign every one of the fixed `100_000` records to a bucket before any floor generation;
- floor generation may still create ambient NPC templates, but those are placement slots only and are removed/replaced by A-Life materialization;
- plot/story/authored reserved identities must be allocated inside the same fixed pool before first floor generation;
- if reserved plot identity fields require save-shape changes, decide that here and bump `SAVE_SHAPE_VERSION`;
- add tests that no route-floor generator is required for population prefill.

### 2. Save shape decision

Decide whether final merged state persists in-flight journeys.

If no persistent mobility state:

- `tickAlifeMigration()` can move records directly;
- active pending arrivals do not survive reload;
- README must not claim persistent in-flight travel.

If persistent mobility state:

- add `alifeMobility` to `save_runtime.ts` sections;
- add payload section to `save_payload.ts`;
- add sanitizer cap tests;
- bump `SAVE_SHAPE_VERSION`;
- update save tests for old/new/current version;
- reject stale saves, no migration code.

Full target should use persistent mobility state unless implementation risk blocks it.

### 3. Main loop hook

Add only generic calls to `main.ts`, likely near existing caravan/faction/samosbor cadence:

- `tickAlifeMigration(state, dt, { activeFloorKey })`;
- `processAlifePendingArrivals(state, world, entities, nextId)`;
- `updateActiveAlifeDepartures(state, world, entities, dt)`.

Rules:

- no route-specific branches;
- no direct destination ids in `main.ts`;
- no rendering/UI work;
- keep cadence bounded.

### 4. Event schema

Use existing `publishEvent()` with compact payloads. Add a dedicated event type only if existing types cannot describe migration. Tags are enough for first pass:

- `alife_migration`
- `arrival`
- `departure`
- `caravan`
- `samosbor`
- `scripted_arrival`
- intent id
- route/floor tags.

Ensure saved event payloads remain small.

### 5. Debug and inspection

Add one cheap summary path:

- `summarizeAlifeMigration(state, 8)`.

Optional integration:

- Faction/A-Life panel line: `миграции: N в пути, M ждут лифта`.
- Debug command: force one cold tick or list profiles.

Do not add map overlays in final pass unless already implemented and tested by another task.

## Final no-refill audit

Run a source audit after merge:

- Natural arrivals should call migration/reservation/materialization helpers.
- New-run population must be prefilled from one universal plan before any concrete floor generation.
- Story/authored persistent NPCs must be reserved inside the same `100_000` population or explicitly documented as temporary event actors.
- Istotit remains allowed and visibly named.
- Debug/editor/tooling paths remain isolated.
- `caravans.ts` still does not create ordinary NPCs for caravan members.
- `faction_events.ts` normal path still claims existing NPCs.
- Dead A-Life records cannot be moved/materialized.
- Plot NPC death checks still prevent duplicate named NPCs.

Suggested manual grep targets:

```txt
entities.push({
type: EntityType.NPC
nextId.v++
spawnMajor
spawnLiquidator
spawnPatrol
createFactionEventNpcAt
assignPersistentAlifeNpcFromEntity
```

Every natural match must have one of:

- existing persistent record migration;
- stable plot identity;
- declared event reserved identity;
- istotit exception;
- debug/editor/tooling exception.

## Final tests

Minimum new/updated tests after merge:

- A-Life move API: bucket removal/inclusion, dead record rejection, save override.
- Population prefill: every record has a `floorKey` before first floor generation; total is exactly `100_000`; reserved plot/story ids are unique and inside the same budget.
- Population prefill: design floor buckets for 69, 88, labs/NII, Ministry and lower route groups resolve from data without generating their worlds.
- Migration data: profile validation, no NPC-forbidden ordinary destination.
- Cold tick: bounded processing, inactive destination record move, active destination pending arrival.
- Active arrival: materializes near lift with same identity.
- Active departure: live NPC walks to lift and then record moves.
- Caravan: `memberAlifeIds` stored and moved on arrival; no new caravan people.
- Scripted arrival: Grom not duplicated; liquidator guards are migrated/reserved.
- Samosbor director: `extra_patrol` does not anonymous-spawn liquidators.
- Faction events: normal path claim-first; forced creation debug-only.
- Save: mobility state caps/sanitizes if persisted; shape version old/new/current tests updated.

Prefer small fixtures. Use generation tests only if route/floor validity cannot be checked statically.

## Validation commands

Run in this order:

```bash
npm run typecheck
npm run test:unit
npm run content:audit
npm run check
```

If `main.ts`, save/load, samosbor or browser behavior changed, `npm run check` is required. If render/input/HUD changed unexpectedly, also run:

```bash
npm run check:browser
```

If a command fails, inspect the real error and fix it. Do not report partial green as complete.

## Documentation updates

Only after implementation passes:

- Update `README.md` with shipped facts:
  - run-start A-Life prefill assigns the fixed population to floor buckets before first floor generation;
  - story/authored persistent NPCs use reserved identities inside the fixed population if shipped;
  - cold A-Life migrations exist;
  - ordinary refill remains disabled;
  - caravans can carry persistent members if shipped;
  - event arrivals are migrations/reserved identities if shipped.
- Update `alife.md` if the persistent identity contract changed.
- Update `economics.md` if caravan identity movement affects economy semantics.
- Update `save.md` if `SAVE_SHAPE_VERSION` or payload sections changed.
- Leave `korovan.md` and `korovan_N.md` as planning docs.

Do not describe unfinished intent in README.

## Final acceptance checklist

- The game still has fixed `100_000` ordinary A-Life identities.
- Those identities are pre-assigned to floor buckets by a universal run-start population plan before the first active floor is generated.
- Story/authored persistent NPCs live in that same prefilled population through reserved identities.
- Killing a persistent NPC lowers the alive population and no refill hides it.
- Off-floor cold tick is bounded, cursor-based and data-driven.
- No inactive floor world/entity/room scan occurs.
- Active arrivals appear at lifts or route anchors.
- Active departures are visible and do not teleport people away.
- Caravans carry persistent ids or explicitly decline non-persistent members.
- Hell scripted arrivals and samosbor patrols are migrations/reserved identities.
- Istotit is the only gameplay creation-from-nothing exception.
- Save state is compact and sanitized.
- Events explain migration without unbounded logs.
- `main.ts` contains only generic hooks.
- `render/` contains no gameplay decisions.
- Required validation commands pass.
