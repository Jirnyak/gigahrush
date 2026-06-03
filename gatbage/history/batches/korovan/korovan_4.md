# Korovan 4: caravans carry persistent people

> Parallel Agent 4 plan.
>
> Owns caravan integration: resource lanes remain intact, but human caravan members become A-Life identities where possible. Caravans become a first consumer of migration instead of a parallel live `entity.id` list.

## Purpose

Current caravans:

- `tickCaravans()` moves resources/stability/tariffs on a 30-second cadence.
- `SmallCaravanRunState.memberIds` stores live entity ids.
- `claimSmallCaravanMember()` claims existing live NPCs; tests already assert small caravans do not create new people.
- Arrival updates cargo/economy but does not move `alifeId` records to destination `floorKey`.

Target:

- keep resource lane behavior;
- add persistent `memberAlifeIds`;
- when a live member joins, require `alifeId` or assign identity only for eligible ordinary NPCs;
- on arrival, move surviving member records through A-Life API;
- off-floor lane ticks may move a tiny number of matching A-Life records as aggregate caravan migration;
- no caravan path creates ordinary NPCs as refill.
- source and destination candidates come from the universal prefilled population buckets; lane code does not maintain a separate caravan people pool.

## Files

Primary:

- `src/systems/caravans.ts`
- `src/data/caravans.ts` only if route-key selectors are added.

Tests:

- extend `tests/caravans.test.ts`, or add `tests/caravan-alife-members.test.ts`.

Avoid editing:

- `src/systems/alife.ts` except imports from Agent 1.
- `src/systems/alife_migration.ts` except calling public APIs.
- save runtime files unless `CaravanState` serialization currently needs explicit extension. Inspect existing serializer path first.

## State extension

Extend `SmallCaravanRunState`:

```ts
memberIds: number[];
memberAlifeIds?: number[];
fromFloorKey?: string;
toFloorKey?: string;
```

Sanitization:

- cap `memberAlifeIds` to `template.memberCount` or 8;
- dedupe ids;
- keep old `memberIds` behavior for current active encounter;
- missing `memberAlifeIds` means old/incomplete state, not a reason to create members.

If this becomes persistent through current caravan save path, verify sanitizer tests. If it changes accepted current save shape, orchestrator bumps `SAVE_SHAPE_VERSION`.

## Lane route selectors

Existing `CaravanLaneDef` likely uses `fromFloor` and `toFloor` as broad `FloorLevel`. Add optional route selectors only if they remain data-only:

```ts
fromFloorKeys?: readonly string[];
toFloorKeys?: readonly string[];
fromRouteTags?: readonly string[];
toRouteTags?: readonly string[];
```

Rules:

- keep broad `fromFloor`/`toFloor` for economy resource state;
- route keys only steer A-Life identity movement;
- explicit route key examples:
  - `production_black_market_88` -> `design:black_market_88`;
  - maintenance repair lane -> `story:maintenance` or service design floors;
  - food/water queue -> `story:kvartiry` / `story:living`;
- validate explicit keys statically.

If route selectors cause broad conflicts, defer them and use Agent 2 destination profiles by lane id.

## Live member claiming

Modify `claimSmallCaravanMember()`:

- keep current filters: alive NPC, correct faction, no plot NPC, no quest role;
- prefer existing `npc.alifeId`;
- if no `alifeId`, call `assignPersistentAlifeNpcFromEntity(state, npc, entities, currentAlifeFloorKey(state))` only if:
  - NPC is ordinary;
  - not `plotNpcId`;
  - not player;
  - not quest/current menu target;
  - not already persistent through another id.
- push `npc.alifeId` into `run.memberAlifeIds` after success;
- if identity assignment fails, the NPC may still be a visible escort only if the plan explicitly accepts non-persistent temporary member; preferred final behavior is to decline the member and leave `memberIds` unchanged.

This may require threading `state` into `claimSmallCaravanMember()` and `spawnSmallCaravanMembers()`.

## Arrival resolution

Modify `completeSmallCaravanArrival()`:

- keep `applyLaneCargo()`, stability, tariff and event behavior;
- for each `memberAlifeId`:
  - verify member survived if live entity exists;
  - capture live state before moving if the entity is present;
  - call `moveAlifeNpcRecord(state, id, toFloorKey, { preservePosition: false })`;
  - do not mark dead unless corresponding live member is dead or an explicit raid/abandon outcome says so.
- remove or leave terminal live entities according to existing small caravan status UI; do not duplicate actors on the active floor.

If a small caravan arrives on the same active floor for gameplay UI, moving records may be delayed until it exits the local scene. Make that choice explicit in tests.

## Raid and abandonment

`markSmallCaravanLost()`:

- `raided`: do not automatically kill all member records. Increase lane raid count and event severity; only dead live members become A-Life deaths.
- `abandoned`: samosbor abandonment may create refugee/lost journeys later, but first pass should leave records on their source floor or mark a delayed/cancelled journey.
- If future logic kills off-floor caravan members, it must publish compact public facts and be rare. Do not invisibly delete groups.

## Off-floor lane migration

On regular `processLane()` or after lane tick:

- optionally sample 0-2 matching A-Life records from source route group;
- create a `reason: 'caravan'` migration via Agent 2 or direct Agent 1 move if in immediate lane;
- tags include `caravan`, `migration`, `lane:<id>`;
- respect lane open/closed, stability and raids;
- never scan all 100_000 records for one lane. Use `sampleAlifeFloorRecordIds()` over selected source floor keys.
- use route groups/tags from `src/data/alife_population_plan.ts` or `src/data/alife_migration.ts`, not ad hoc FloorLevel-only hardcoding, when a lane needs `design:black_market_88`, labs, Ministry or service floors.

This should be conservative in first pass. Resource movement remains the main caravan macro effect; identity movement is visible flavor and consequence, not a mass conveyor.

## Events and UI

Keep existing caravan HUD/status texts. Add only compact event details:

- count of persistent members moved;
- lane id;
- source/target floor keys when known.

Do not add map overlays in this packet.

## Tests

Required:

- existing "small caravan runs open near service cells without creating new people" still passes;
- caravan member with existing `alifeId` is added to `memberAlifeIds`;
- ordinary live member without `alifeId` receives persistent identity only when eligible;
- plot NPC/quest NPC/player cannot be recruited;
- arrival moves `memberAlifeIds` to destination route key;
- raid does not mark all members dead by default;
- lane data validation catches invalid route keys if route selectors are added;
- off-floor lane migration processes a bounded number of records.
- off-floor lane migration samples from prefilled source buckets and never creates a caravan-only NPC identity.

Use small fixtures and existing `caravans.test.ts` helpers.

## Done

This packet is done when:

- small caravan state can carry persistent member ids;
- caravan arrival changes A-Life record floor keys for survivors;
- resource economy behavior is preserved;
- no caravan path creates new ordinary people;
- caravan people are existing prefilled identities or explicit reserved event actors;
- tests prove member identity and no-refill behavior.
