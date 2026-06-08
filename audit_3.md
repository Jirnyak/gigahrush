# audit_3.md - Floor Generation And Placement

## Coverage

- Files and docs reviewed:
  - `README.md`
  - `AGENTS.md`
  - `architecture.md`
  - `floors.md`
  - `optimization.md`
  - `src/gen/shared.ts`
  - `src/gen/population_placement.ts`
  - `src/gen/floor_object_placement.ts`
  - `src/gen/floor_manifest.ts`
  - `src/gen/procedural_floor.ts`
  - `src/gen/design_floors/manifest.ts`
  - `src/gen/design_floors/full_floor.ts`
  - `src/gen/design_floors/population.ts`
  - representative story/base generators: `src/gen/living/npcs.ts`, `src/gen/ministry/index.ts`, `src/gen/maintenance/index.ts`, `src/gen/hell/index.ts`, `src/gen/void/index.ts`
  - representative procedural anomaly generators: `src/gen/procedural_anomalies/index.ts`, `src/gen/procedural_anomalies/conway_life.ts`, `src/gen/procedural_anomalies/fractal_floor.ts`, `src/gen/procedural_anomalies/zombie_apocalypse.ts`, `src/gen/procedural_anomalies/sandpile_perekrytie.ts`
  - generation/reachability tests: `tests/generator_helpers.ts`, `tests/procedural-floors.test.ts`, `tests/floor-object-placement.test.ts`, `tests/geometry-metrics.test.ts`, plus focused reachability test references found by `rg`
- Commands run:
  - `git status --short`
  - `sed -n ... README.md AGENTS.md architecture.md floors.md optimization.md audit_3.md`
  - `rg --files src/gen tests`
  - `rg -n "isConnectivityWalkable|connect|reachable|roomMap|syncNextEntityId|nextId|aptMask|hermo|Cell\\.LIFT|addDoor|doors\\.set|resolveArrivalSpawn|fallback_first_passable|world\\.rooms\\[0\\]|rooms\\[0\\]|\\.slice\\(0|\\.find\\(" src/gen tests`
  - `rg -n "randomFloorCell\\(|Math\\.random\\(\\).*W \\* W|rng\\(0, W \\* W|for \\(let attempt = 0; attempt < .*world\\.cells\\[cell\\]" src/gen`
  - targeted `nl -ba ... | sed -n ...` reads for the files cited below
- Areas not covered and why:
  - Did not run `npm run test:generation`; the assignment is an audit pass and the current repository has broad unrelated dirty work.
  - Did not inspect every small content module under every story floor line-by-line. The audit focused on shared generation paths and representative direct-spawn patterns with concrete line evidence.
  - Did not search `../gatbage/**`; no route/floor authoring appendix was required for these implementation findings.
  - Did not edit source code, generated artifacts or other audit files. Initial `git status --short` showed many pre-existing modified/untracked files; this audit only updates `audit_3.md`.

## Findings

### A3-01

- Severity: major
- Location: `src/gen/population_placement.ts:127`, `src/gen/design_floors/population.ts:132`, `src/gen/design_floors/population.ts:150`, `src/gen/procedural_floor.ts:3622`
- Evidence:
  - `isPopulationPlacementCandidateCell()` accepts any `Cell.FLOOR` with no feature/container and does not require the cell to be reachable from the generated spawn or route-lift component (`src/gen/population_placement.ts:127`).
  - Design-floor ambient NPCs and monsters call `sampleNaturalPopulationCells()` directly (`src/gen/design_floors/population.ts:132`, `src/gen/design_floors/population.ts:150`).
  - Procedural NPCs also call the same reachability-blind sampler (`src/gen/procedural_floor.ts:3622`).
- Why this is a real problem:
  - The floor contract requires reachable rooms, POIs and population paths. A disconnected floor island, quarantined pocket, keyed side shell, or anomaly-carved area can still contain valid `Cell.FLOOR` cells, so ambient actors can be placed where ordinary AI cannot participate in the player-facing floor.
  - Current broad tests heavily assert route lifts and reachable cell counts, e.g. procedural fast/matrix tests check only lift reachability at `tests/procedural-floors.test.ts:1061` and `tests/procedural-floors.test.ts:1071`. They do not provide a general "all ambient NPC/monster spawn cells are route-reachable" invariant.
- 100% doable improvement:
  - Add an optional `reachable?: Uint8Array` mask to `samplePlacementFieldCells()` / `sampleNaturalPopulationCells()` and filter candidate cells through it when provided.
  - For procedural floors, pass the final or post-repair reachability mask into NPC/monster placement, or move population after final connectivity repair.
  - For design floors, compute a route reachability audit after `finalizeExpandedFloor()` and before ambient population, then pass that mask into `applyDesignFloorPopulationField()`.
  - Allow explicit exceptions only by data flag, such as phasing monsters, sealed authored encounters, or unreachable "view-only" pressure.
- Validation after fix:
  - Add a generation test that iterates all generated ambient NPC/monster entities for sampled procedural/design floors and asserts their cell is reachable unless explicitly exempt.
  - Run `npm run test:generation`, then `npm run check`.
- Related systems touched:
  - Generation, population placement, A-Life materialization templates, AI reachability, tests.

### A3-02

- Severity: major
- Location: `src/gen/procedural_floor.ts:15608`, `src/gen/procedural_floor.ts:15627`, `src/gen/procedural_floor.ts:15643`, `src/gen/procedural_floor.ts:15649`
- Evidence:
  - Procedural generation builds a `WalkablePlacementMap` before the late anomaly/profile tail (`src/gen/procedural_floor.ts:15608`).
  - It applies procedural floor object profiles, including features, interactives, craft stations and visual slot decor, before late anomaly modules run (`src/gen/procedural_floor.ts:15627`).
  - Late anomaly profile application happens afterwards (`src/gen/procedural_floor.ts:15643`).
  - Only after that does the generator compute final reachability and repair containers/loose drops (`src/gen/procedural_floor.ts:15649`, `src/gen/procedural_floor.ts:15650`, `src/gen/procedural_floor.ts:15651`).
  - Several anomaly modules mutate cells after the object-profile placement point: Conway Life turns arena cells into walls/floors (`src/gen/procedural_anomalies/conway_life.ts:138`), fractal floor deletes/blocks cells (`src/gen/procedural_anomalies/fractal_floor.ts:104`, `src/gen/procedural_anomalies/fractal_floor.ts:117`), zombie quarantine turns floor into walls (`src/gen/procedural_anomalies/zombie_apocalypse.ts:391`), and sandpile seams turn floor into walls (`src/gen/procedural_anomalies/sandpile_perekrytie.ts:166`).
- Why this is a real problem:
  - Procedural interactives and craft stations can be placed on cells that are later overwritten, blocked, or disconnected by anomaly geometry.
  - The final repair pass only explicitly handles containers and loose item drops. It does not revalidate `surfaceFlags`, craft-station cells, explicit interactive instances, generated feature placements, or visual slots.
  - This can leave player-facing `E` content unreachable or mismatched with the final cell/feature state.
- 100% doable improvement:
  - Prefer moving `applyProceduralFloorObjectProfile()` after `applyProceduralAnomalyProfile()` and final connectivity repair, using a fresh post-repair `WalkablePlacementMap`.
  - If any anomaly depends on object-profile fixtures, keep the current early pass but add a post-anomaly revalidation helper that removes or relocates invalid interactives/craft stations/feature placements with the same rules used for containers.
  - Add an invariant that every procedural craft station and explicit interactive cell is final-reachable and still has the expected feature/surface flag.
- Validation after fix:
  - Add/extend procedural object-profile tests to force cell-mutating anomalies (`conway_life`, `fractal_floor`, `zombie_apocalypse`, `sandpile_perekrytie`) and assert craft stations/interactives are reachable after final repair.
  - Run `npm run test:generation`, then `npm run check`.
- Related systems touched:
  - Procedural generation order, interactive surface layer, craft stations, visual slots, anomaly generation, tests.

### A3-03

- Severity: major
- Location: `src/gen/ministry/index.ts:543`, `src/gen/maintenance/index.ts:437`, `src/gen/living/npcs.ts:164`, `src/gen/hell/index.ts:337`
- Evidence:
  - Ministry drops items at random coordinates inside each room without checking the chosen cell remains floor/reachable/empty (`src/gen/ministry/index.ts:543` to `src/gen/ministry/index.ts:555`).
  - Maintenance does the same for room loot (`src/gen/maintenance/index.ts:437` to `src/gen/maintenance/index.ts:449`).
  - Living travelers collect random `Cell.FLOOR` cells from the whole 1024x1024 world and spawn from that array, without checking reachability or using a placement profile (`src/gen/living/npcs.ts:164` to `src/gen/living/npcs.ts:173`).
  - Hell loot uses `randomFloorCell()` over all floor cells (`src/gen/hell/index.ts:337` to `src/gen/hell/index.ts:355`), and that helper only checks `Cell.FLOOR` (`src/gen/hell/index.ts:591` to `src/gen/hell/index.ts:597`).
- Why this is a real problem:
  - These are floor-wide population/loot scattering paths, but they bypass `buildWalkablePlacementMap()` and `sampleNaturalPopulationCells()`.
  - Any disconnected floor cells, sealed pockets, protected tutorial shells, room interior features, or later geometry changes can receive ordinary loot/actors with no route proof.
  - The architecture explicitly says broad population or loot scattering should use shared placement fields/profiles instead of ad hoc clusters or global random floor picks.
- 100% doable improvement:
  - For story-floor loose loot, use `buildWalkablePlacementMap(world, spawnX, spawnY)` and `pickWalkablePlacement()` with `roomId`, `requireEmptyFeature`, `allowWater: false`, and an `avoidCells` set.
  - For story/base floor travelers and ambient monsters, use `sampleNaturalPopulationCells()` with a reachability mask once A3-01 exists, or add a small story-floor placement profile using the same field sampler.
  - Keep authored local encounters as local code, but make broad ordinary scatter go through shared placement.
- Validation after fix:
  - Add story-floor tests that generate Ministry, Maintenance, Living and Hell and assert ordinary item drops/travelers/ambient monsters spawn on final reachable cells, not protected `aptMask` cells, and not occupied feature/container cells.
  - Run `npm run test:generation`, then `npm run check`.
- Related systems touched:
  - Story/base floor generation, placement helpers, loot, ambient actors, tests.

### A3-04

- Severity: minor
- Location: `src/gen/shared.ts:107`, `src/gen/shared.ts:343`, `src/gen/procedural_floor.ts:15166`
- Evidence:
  - `findFirstPassableCell()` scans `0..W*W` and returns the first passable cell in storage order (`src/gen/shared.ts:107` to `src/gen/shared.ts:111`).
  - `resolveArrivalSpawn()` can use that first passable cell as `fallback_first_passable` when anchors and local fallback searches fail (`src/gen/shared.ts:343` to `src/gen/shared.ts:352`).
  - Procedural spawn repair has the same first-passable fallback (`src/gen/procedural_floor.ts:15166` to `src/gen/procedural_floor.ts:15168`).
- Why this is a real problem:
  - This is emergency fallback code, but it is still player-spawn logic. If it ever triggers, storage order becomes route physics and favors the northwest/top-left passable cell, not the largest reachable component, the nearest route anchor, or a deterministic seed-based location.
  - The project docs explicitly forbid gameplay-visible fixed-prefix scans over runtime collections/fields.
- 100% doable improvement:
  - Replace first-passable fallback with a deterministic rotated scan keyed by floor/run seed and fallback coordinate, or better, compute connected components and choose the largest component nearest the requested fallback/reference point.
  - Include the chosen component size and reason in the existing `ArrivalSpawnResolution.debug` string.
- Validation after fix:
  - Add unit tests with two disconnected passable islands: one at low index and one near fallback/reference. Assert arrival/spawn fallback chooses the intended nearest/largest component instead of index order.
  - Run `npm run test:unit` and `npm run check`.
- Related systems touched:
  - Shared generation helpers, floor transition spawn resolution, procedural spawn repair, tests.

### A3-05

- Severity: minor
- Location: `src/gen/floor_object_placement.ts:383`
- Evidence:
  - `placeBrokenFixtureRule()` iterates `rooms` in storage order and then cells from `room.x+1, room.y+1` to the lower-right until `placed >= max` (`src/gen/floor_object_placement.ts:383` to `src/gen/floor_object_placement.ts:415`).
  - Unlike feature and interactive rules, it does not build hashed/scored candidates; compare `sortedPlacementCandidates()` at `src/gen/floor_object_placement.ts:301`.
- Why this is a real problem:
  - A capped broken-fixture rule will consistently prefer earlier rooms and top-left eligible fixtures. On dense floors this is a visible storage-order bias in repair content distribution.
  - This is small but directly contradicts the "storage order is not gameplay" rule, and it is easy to fix locally.
- 100% doable improvement:
  - Build broken-fixture candidates across all eligible rooms, score them by room weight plus `hash32(seed, idx, room.id, rule.id.length)`, sort by score, then place up to `max`.
  - Keep the existing reachability, feature and hermowall/door checks.
- Validation after fix:
  - Add a unit test with two eligible bathroom/utility rooms where the earlier room has many fixtures; assert deterministic placement is seed-driven and not always the first room/cell.
  - Run `npm run test:unit` and `npm run check:readonly`.
- Related systems touched:
  - Floor object placement, broken fixture interactives, tests.

## Generation Risk Map

- Highest risk:
  - `src/gen/procedural_floor.ts`: large ordered pipeline; early placement map, later anomaly mutations, final repair for containers/drops only.
  - `src/gen/population_placement.ts`: shared population sampler is powerful but reachability-blind.
  - Story/base floor broad scatter in `src/gen/ministry/index.ts`, `src/gen/maintenance/index.ts`, `src/gen/living/npcs.ts`, `src/gen/hell/index.ts`.
- Medium risk:
  - `src/gen/design_floors/full_floor.ts` and `src/gen/design_floors/population.ts`: full-floor expansions are broad and ambient population currently depends on the generic sampler without a reachability mask.
  - Procedural anomaly modules that rewrite cells after earlier placement: `conway_life`, `fractal_floor`, `zombie_apocalypse`, `sandpile_perekrytie`, plus any future anomaly that mutates `cells`.
- Lower risk but worth cleaning:
  - `src/gen/shared.ts` and `src/gen/procedural_floor.ts` first-passable fallback paths.
  - `src/gen/floor_object_placement.ts` broken fixture capped placement.

## Highest-Impact Fix Order

1. Add reachability-mask support to population placement and use it for procedural/design ambient NPC and monster placement.
2. Reorder or revalidate procedural object profile placement around late anomaly geometry mutations.
3. Convert story/base floor broad loot and ambient actor scatter to shared reachable placement helpers/profiles.
4. Replace first-passable spawn fallbacks with nearest/largest-component deterministic fallbacks.
5. Make broken fixture capped placement use hashed/scored candidates instead of room/cell order.
