# audit_5.md - A-Life, Migration, Factions, Demos Social

## Assignment

You are subagent 5. Audit persistent NPC identity, materialization, cold migration, faction social math and the `Инфосеть Демос` surface. Do not change source code. Write your final audit results in this same file.

## Coverage

- Files and docs reviewed: `README.md`, `AGENTS.md`, `architecture.md`, `alife.md`, `npc.md`, `korovan.md`, `demos.md`, `quests.md`; focused code in `src/systems/alife.ts`, `src/systems/alife_migration.ts`, `src/systems/factions.ts`, `src/systems/npc_relations.ts`, `src/systems/demos*.ts`, `src/data/alife_population_plan.ts`, `src/data/demos_posts.ts`, `src/data/demos_social.ts`, `src/render/demos_*.ts`; focused tests in `tests/alife*.test.ts`, `tests/demos*.test.ts`, `tests/npc_relations.test.ts`.
- Commands run: `git status --short`; read-only `sed -n`, `nl -ba`, and `rg -n` over the docs, focused source files and tests above.
- Areas not covered and why: no browser/manual UI pass and no npm validation commands were run because this assignment explicitly forbids source edits and write-producing commands. I also did not inspect unrelated economy/quest/floor generators except where A-Life/Demos calls pointed to them.

## Findings

### A5-01

- Severity: major
- Location: `src/systems/alife.ts:73`, `src/systems/alife.ts:1891`, `src/systems/alife.ts:1893`, `src/systems/alife.ts:1895`
- Evidence: `ALIFE_POPULATION` is the technical capacity, not the run baseline (`const ALIFE_POPULATION = ALIFE_POPULATION_CAPACITY`). `assignPersistentAlifeNpcFromEntity()` sets `recordIndex = alife.npcs.length`; when `recordIndex < ALIFE_POPULATION`, it creates a new `AlifeNpcRecord`, pushes it into `alife.npcs`, and updates `alife.total`. A normal new run is explicitly below capacity in `tests/alife-fixed-population.test.ts:87`-`tests/alife-fixed-population.test.ts:95`, while the "without growing the pool" regression only covers the already-at-capacity save path in `tests/alife-fixed-population.test.ts:120`-`tests/alife-fixed-population.test.ts:147`.
- Why this is a real problem: the A-Life/Korovan contract says event-created ordinary people should receive or reuse persistent records inside the fixed run population, not grow the ordinary pool until the technical capacity. Current scripted escorts, samosbor patrols and caravan member claiming all use this helper (`src/systems/scripted_arrivals.ts:215`, `src/systems/samosbor_director.ts:466`, `src/systems/caravans.ts:598`), so authored/event pressure can silently increase `alife.total` on ordinary 100k-ish runs.
- 100% doable improvement: make `assignPersistentAlifeNpcFromEntity()` prefer `reserveArrivalRecordIndex()` over append for current-shape runs, and only fail if no reusable untouched record exists. If a future feature truly needs new identity allocation above the run total, expose a separate explicit helper with an event reason and test.
- Validation after fix: add a test with `setAlifeState(... total: 100_000)`, call `assignPersistentAlifeNpcFromEntity()`, assert `alife.total` and `alife.npcs.length` stay unchanged, the claimed id belongs to an untouched non-dead record, and the touched record appears in `alifeForSave().overrides`.
- Related systems touched: A-Life identity, scripted arrivals, samosbor director, caravans, save/load.

### A5-02

- Severity: major
- Location: `src/systems/alife.ts:2173`, `src/systems/alife.ts:2188`, `src/systems/alife.ts:2189`, `src/systems/alife.ts:2190`, `src/systems/alife.ts:2193`
- Evidence: `materializeAlifeFloorPopulation()` extracts ambient templates, then walks `floorIds` from the start and stops as soon as template slots are exhausted. The code assigns templates in fixed `floorIndex` order (`for (const recordIndex of floorIds)`) with no seed shuffle, cursor, scored window or stable slot table independent from insertion order.
- Why this is a real problem: this makes the first records in a floor bucket the only ordinary residents who can ever become active when templates are fewer than assigned identities. It preserves no-refill, but it also turns floor-index storage order into gameplay visibility: later residents are persistent records, yet effectively unreachable by active-floor simulation unless another system migrates them.
- 100% doable improvement: derive a deterministic per-floor materialization order from run seed + floor key, or store a stable per-floor slot permutation during population-plan creation. Keep the existing killed-slot-empty behavior by mapping template slots to stable shuffled slots, not by backfilling dead records with later people.
- Validation after fix: add a test with a floor bucket larger than template count and assert the materialized ids are not simply the first `N` bucket records. Add a second test that killing a materialized id leaves its slot empty and does not backfill from a later id.
- Related systems touched: A-Life materialization, active-floor population, save/floor memory indirectly.

### A5-03

- Severity: major
- Location: `src/systems/alife_migration.ts:650`, `src/systems/alife_migration.ts:659`, `src/systems/alife_migration.ts:660`, `src/systems/alife_migration.ts:668`, `src/systems/alife_migration.ts:669`, `src/systems/alife_migration.ts:670`
- Evidence: `processDueJourneys()` iterates `Object.values(mobility.journeys)` in object insertion order. It increments `processed` for a due journey, then if the journey targets the active floor and `pendingArrivals` is full, it `continue`s without deleting, rescheduling, rotating or moving that journey. Since the loop breaks once `processed >= maxRecords`, a prefix of blocked active-floor arrivals can consume the whole due-journey budget every tick.
- Why this is a real problem: this is a stale journey/starvation path. `tests/alife-migration.test.ts:141`-`tests/alife-migration.test.ts:170` verifies a single blocked journey waits and then resumes, but it does not cover multiple blocked prefix journeys starving later inactive-floor due journeys that could have completed.
- 100% doable improvement: when pending arrivals are full, do not count the blocked active-floor journey against the whole due-journey processing budget, or rotate/requeue it behind other due journeys for this tick. Keep a bounded retry/backpressure event so the queue remains inspectable.
- Validation after fix: build a mobility state with `MAX_ALIFE_PENDING_ARRIVALS` full, `maxRecords = 1`, one blocked active-floor due journey inserted first and one inactive-floor due journey inserted second. After one forced tick, the inactive-floor record should still move or the blocked item should be rotated so it cannot starve the rest.
- Related systems touched: cold A-Life migration, pending arrivals, events/debug summary.

### A5-04

- Severity: major
- Location: `src/systems/alife_migration.ts:54`, `src/systems/alife_migration.ts:55`, `src/systems/alife_migration.ts:1144`, `src/systems/alife_migration.ts:1145`, `src/systems/alife_migration.ts:1146`
- Evidence: active departures are capped at 32 total and only 8 updates per tick. `updateActiveAlifeDepartures()` iterates the array from the start; once `processed >= MAX_ACTIVE_DEPARTURE_UPDATES`, it pushes all remaining departures into `kept` without checking them.
- Why this is a real problem: if the first eight departures are blocked, pathfail repeatedly, or are just far from anchors, later departures are never examined even if those NPCs are already standing on a lift anchor. This is storage-order dependence inside a gameplay-visible migration queue.
- 100% doable improvement: add a mobility cursor for active departures, or rotate processed entries to the tail each tick while preserving completion/removal semantics. Optionally store per-departure retry/lastAttempt to avoid hammering impossible paths.
- Validation after fix: add a test with 9 active departures where the first 8 cannot complete and the 9th starts at the anchor. It should complete within a bounded number of ticks instead of waiting forever behind the fixed prefix.
- Related systems touched: active departures, A-Life foldback, migration events.

### A5-05

- Severity: minor
- Location: `src/systems/demos_runtime.ts:68`, `src/systems/demos_runtime.ts:70`, `src/systems/demos_runtime.ts:134`, `src/systems/demos_runtime.ts:143`, `src/data/demos_posts.ts:9`, `src/systems/demos_posts.ts:334`, `src/systems/demos_posts.ts:337`
- Evidence: Demos runtime samples 64 current-floor A-Life snapshots per tick and passes their ids as `fallbackAuthorAlifeIds`. `chooseAuthorAlifeId()` then normalizes that list and immediately `.slice(0, DEMOS_AUTHOR_FALLBACK_CAP)`, where the cap is 8. Records 9..64 in every runtime sample can contribute to notices/social journey checks, but cannot become fallback authors for posts from events lacking explicit actor ids.
- Why this is a real problem: Demos is supposed to make the fixed population visible as society. This fixed prefix cut makes only one eighth of each sampled window eligible for fallback authorship and silently biases the feed toward sample ordering.
- 100% doable improvement: choose the fallback author through a deterministic reservoir/window over the full sampled list, or hash-start over all fallback ids before applying the 8-author cap.
- Validation after fix: add a unit test that passes 64 fallback ids, marks the first 8 dead/unusable or seeds selection beyond index 8, and asserts a valid author beyond the first 8 can be selected without scanning the full A-Life pool.
- Related systems touched: Demos runtime, Demos post generation, A-Life social visibility.

### A5-06

- Severity: minor
- Location: `src/systems/demos.ts:247`, `src/systems/demos.ts:250`, `src/systems/demos.ts:276`, `src/systems/demos.ts:281`, `src/systems/demos.ts:290`, `src/systems/demos.ts:360`, `src/render/demos_ui.ts:410`, `src/render/demos_profile_ui.ts:103`, `src/render/demos_profile_ui.ts:210`, `src/systems/demos_quest_notices.ts:227`
- Evidence: Demos profile data exposes raw labels such as `alife:<id>`, `plot:<id>`, `npc:<packageId>`, raw route keys such as `story:living` / `design:*`, map coordinates (`x:y`) and `post:<id>` in player-facing UI. Quest notices also fall back to `${baseLabel} / ${floorKey}`.
- Why this is a real problem: the Demos surface is player-facing diegetic UI. Raw A-Life ids, route keys and coordinates are implementation/debug facts that make profiles look stale or mechanical and can leak route topology naming that should stay internal.
- 100% doable improvement: route Demos profile, notice and feed labels through one player-facing identity/location formatter. Keep raw ids in debug-only views or hidden tool/debug commands, not default profile rows. Prefer floor number + human floor label + coarse status like "на этом этаже", "в пути", "ожидает у лифта".
- Validation after fix: add focused string tests for Demos profile/quest notice view models asserting default labels do not contain `alife:`, `plot:`, `npc:`, `story:`, `design:`, `procedural:`, `post:` or raw `x:y` coordinates unless a debug flag is explicitly enabled.
- Related systems touched: Demos profile view model, Demos UI, quest notices.

## Population Contract Risks

- Event/scripted ordinary NPCs can grow the A-Life pool from the run-sized total toward the technical capacity through `assignPersistentAlifeNpcFromEntity()`. This is the clearest possible breach of the fixed-population/no-refill promise.
- Active-floor materialization is no-refill safe, but currently makes the first `floorIndex` records more real than later residents. It should be made seed/floor stable without depending on insertion order.
- Death persistence is mostly covered: `recordAlifeNpcDeath()` captures A-Life state, marks dead ids and tracks `plotNpcId`, while save stores dead A-Life ids up to `65_536`. The cap is documented as a current gap, not a fresh bug.
- Save, ordinary floor transition and cleanup paths do call foldback/death capture (`main.ts:3591`, `main.ts:4504`, `main.ts:7139`). I did not find a direct transition/save path that bypasses A-Life capture.
- Demos relation-to-player deltas use the same A-Life player relation path via `setAlifeNpcPlayerRelation()` after Demos graph mutation, which is the right integration boundary.
- Migration queues are bounded, but two fixed-prefix paths can cause stale cold journeys or active departures when earlier entries are blocked.
- Demos social graph storage is compact and capped, but default feed authorship and UI labels still leak storage/order/debug details.

## Highest-Impact Fix Order

1. Fix `assignPersistentAlifeNpcFromEntity()` so event/scripted actors claim existing untouched fixed-pool identities before any append, then add the 100k no-growth regression.
2. Remove fixed-prefix active departure starvation and cold due-journey starvation from `alife_migration.ts`; these are bounded queue fixes with focused tests.
3. Make active-floor materialization use a deterministic non-storage-order slot permutation while preserving dead slots as empty.
4. Make Demos fallback author selection fair over the whole sampled window.
5. Replace raw Demos ids/route keys/coordinates with player-facing labels in profile, feed and notice view models.
