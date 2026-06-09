# Test Strategy

> Центральный документ тестовой стратегии.
>
> Роль: описывает правила добавления tests so validation stays deterministic, precise and cheap. The goal is to prevent `npm run test:unit` from becoming a half-hour generation marathon while preserving high-signal generation, browser and release gates.

This repository should keep tests precise, deterministic and cheap enough to run during normal development. The main risk is not assertion count; it is repeated construction of full 1024x1024 worlds. A good test extracts more signal from one generated floor instead of generating the same floor again for every small invariant.

## Test Tiers

Use the existing npm scripts as separate gates:

- `npm run typecheck`: TypeScript preflight. Run it for most source edits.
- `npm run test:unit`: normal development gate. It must stay focused and should not contain broad exhaustive generation matrices.
- `npm run test:generation`: expanded procedural/design generation matrix. Put wide coverage here when the check is valuable but too expensive for every normal unit run.
- `npm run content:audit`: static registry/content consistency. Prefer this for literal id, manifest, registry and source reference coverage instead of adding runtime floor generation.
- `npm run check:readonly`: broad read-only agent gate: typecheck, unit tests and content audit.
- `npm run check`: systems/generation/browser-build gate. It writes `dist/`.
- `npm run check:browser` / `npm run check:full`: browser smoke gates for render, UI, mobile, input and canvas-risk changes when Chrome is available.

Do not weaken a test just to make the fast gate pass. Move broad coverage to the correct gate, shrink duplicated setup, or replace runtime generation with a cheaper direct invariant.

For render-only mesh pass changes, smoke can force the browser-local mesh mode:

```bash
SMOKE_VISUAL_GEOMETRY_MODE=off npm run smoke
SMOKE_VISUAL_GEOMETRY_MODE=high npm run smoke
SMOKE_MOBILE=1 SMOKE_VISUAL_GEOMETRY_MODE=low npm run smoke
```

`npm run test:unit` is selected by `scripts/run-unit-tests.mjs`. The selector skips per-item content files named `items_*.test.ts` and files that import `src/gen/*`; those files are reserved for `npm run test:generation`. The generation runner uses the matching selector in `scripts/run-generation-tests.mjs`, sets `GIGAHRUSH_GENERATION_MATRIX=1`, and runs selected files one by one so the current slow or failing generator file is visible in the log.

Path blocker core/storage and save-policy tests belong in `test:unit` because
they use small handmade `World` fixtures. Future blocker tests that import
`src/gen/path_blockers.ts` or full floor generators belong in
`test:generation`, while movement-collision tests should stay as small system
fixtures unless they need a real generated floor.

## Unit Gate Budget

`test:unit` may include full floor generation only when the generated world is the subject of the test and the coverage is P0 for normal development. Examples:

- One representative story floor generation for spawn, actor and critical route contracts.
- The Living corridor-attractor regression, because it protects a gameplay-breaking AI failure that only appears after time passes on a real Living floor.
- One representative design floor generation for an authored route's local choices.
- A small fixed procedural subset for route lift reachability and anomaly smoke.
- Runtime system tests using small handmade `World` fixtures.

`test:unit` should not include:

- Every design floor only to prove every generator occupies the full footprint.
- Every procedural geometry/anomaly/majority combination.
- Repeated generation of the same floor inside one test file.
- Slow generation used only to test a generic helper that can be tested with a smaller or cheaper floor.

If a test says "all", "matrix", "every route", "every anomaly", "every geometry" or "many seeds", it probably belongs in `test:generation` unless it is static data validation.

## Generation Matrix Gate

Use `test:generation` for broad route and procedural coverage:

- Representative procedural geometries can be forced.
- Representative procedural anomalies can be forced.
- Fixed P0 route lift reachability samples.
- A focused authored design-floor population/readability set.
- Slow regression tests that protect generator diversity without making normal development rerun every historical floor.

In `node:test`, keep these cases behind an environment guard such as `GIGAHRUSH_GENERATION_MATRIX`, following the existing `testGenerationMatrix(...)` pattern in `tests/procedural-floors.test.ts`. The skipped test should name the command needed to run it.

`tests/procedural-floors.test.ts` has two extra opt-in layers because a single file can otherwise build hundreds of 1024x1024 worlds:

```bash
GIGAHRUSH_PROCEDURAL_FLOOR_REGRESSION_MATRIX=1 npm run test:generation
GIGAHRUSH_PROCEDURAL_FLOOR_FULL_MATRIX=1 npm run test:generation
```

The regression flag enables historical `genfix ...` floors. The full flag enables exhaustive "all geometry", "all anomaly", broad sampled reachability and full authored-design footprint checks. Use them when touching procedural floor generators, anomaly selection, design-floor registration or route-wide reachability; keep normal `npm run test:generation` as the cheaper generator smoke gate.

## Reuse Generated Floors

Within one test file, cache a generated floor when all consumers are read-only:

```ts
let cachedGeneration: ReturnType<typeof generateDesignFloor> | undefined;

function routeForRead(): ReturnType<typeof generateDesignFloor> {
  cachedGeneration ??= generateDesignFloor('route_id');
  return cachedGeneration;
}
```

This is encouraged for tests that inspect rooms, containers, route cues, population counts, reachability masks, textures, cells or static state without mutating the generated world.

Do not share a cached generation when a test:

- Mutates `world`, `entities`, `containers`, `doors`, runtime state or game events.
- Runs an interaction that changes inventory, money, flags, quest state or map state.
- Tests samosbor rebuild, save/load capture, runtime anomaly mutation or dirty-version changes.
- Depends on absence of previous observations, messages or side effects.

For mutating tests, generate a fresh world locally and keep the mutation test last only if it uses a file-local shared fixture for a specific measured reason.

## Prefer One Setup, Many Assertions

When a floor is expensive, make one test or one file-local cached setup cover the whole contract:

- Registration and profile tests can be pure data and should not generate the floor.
- Generator tests should assert multiple related facts from the same generated world: route anchors, reachable choices, cue markers, containers, population bands and important room names.
- Avoid adding one new `generateDesignFloor(...)` call per new assertion.
- If two tests need the same read-only world, use a shared helper.

This improves quality because failures explain which part of one coherent generated contract broke instead of hiding the same setup cost behind many tiny tests.

## Use Seeded Entrypoints

Prefer public seeded entrypoints:

- Use `generateFloor(FloorLevel.X, fixedSeed)` for story floors.
- Use `generateDesignFloor(routeId, fixedSeed)` for routed design floors when seed variation matters.
- Use direct local generators only when the test is explicitly about that unexpanded local generator.

Do not call unseeded floor generators directly in tests unless the point is to test non-seeded behavior. A direct `generateKvartiry()`-style call can make tests depend on global `Math.random` order and parallel scheduling.

Generic seed reproducibility tests should use cheap seed-sensitive floors, not the heaviest floor in the game. They prove the seeding contract, not the whole Living or production route.

## Prefer Small Fixtures For Runtime Systems

If the behavior is a system rule, build a small `World` fixture instead of generating a full floor. This applies to:

- Door passability, reachability helpers and dirty-version behavior.
- Inventory, economy, banking, quest and interaction edge cases.
- AI targeting, broadphase, local hazard effects and combat math.
- Save sanitization and serializer caps.

Full generation is justified only when the test needs real generator placement, real route anchors or real authored content.

## Static Data Before Runtime Generation

Use static assertions and `content:audit` before generating a world:

- Registry ids are unique.
- Route definitions point to implemented generators.
- Item, weapon, monster, contract, rumor and quest references resolve.
- Manifest imports cover active content modules.
- Text and localization inventories are coherent.

Do not generate a floor merely to prove that a literal id exists in a registry.

## Reachability And World Scans

World-wide scans are acceptable in tests when they inspect a world that was already generated for that test. They should not cause extra generation.

Prefer bounded or reusable helpers:

- Build one reachability mask per generated world and reuse it inside the test.
- Use `world.idx`, `world.wrap`, `world.delta`, `world.dist` and `world.dist2`.
- Prefer `dist2` for comparisons.
- Keep helper names tied to the invariant: `reachableWithDoorKeys`, `hasReachableLift`, `countRoomFeatures`, etc.

If a reachability check is broad but not P0, put it in `test:generation`.

## Long-Running AI Regressions

Some AI failures are not visible on the first tick. The Living corridor-attractor class is one of them: NPCs can begin normally, then after several simulated minutes accumulate in a corridor pocket and repeatedly reverse over the same corridor cells. Tests for this class must measure the failure directly instead of banning normal corridor movement.

Use fixed seeds and deterministic runtime randomness. Track:

- local corridor pile-up, such as max actors in one corridor cell or small corridor bucket;
- active stuck paths in corridors;
- repeated A-B-A corridor reversals per actor over a multi-minute simulation;
- separation between ordinary residents and intentional traveler traffic when that distinction matters.

`tests/living-npc-corridor-attractors.test.ts` is intentionally kept in `test:unit` through the runner exception even though it imports `src/gen/`. Do not move it out of the normal gate unless an equally strong and cheaper regression guard replaces it.

## Assertions Should Be Stable

Good tests check durable contracts:

- Route is registered at the intended `z` and base floor.
- Spawn is passable.
- Required lifts are reachable.
- Required player decisions exist and are reachable.
- Important population bands and caps hold.
- Critical containers, panels, cues and NPC ids exist.
- Runtime systems publish bounded events and respect caps/cadence.

Avoid brittle snapshots unless the snapshot is the contract. Danger decks and route order can use snapshots when they intentionally protect route rhythm. Ordinary exact counts should usually be ranges or named required facts.

## Performance Hygiene

Before adding a slow test, ask:

- Can this be tested as pure data?
- Can this use a small handmade `World`?
- Can this assertion join an existing generated-floor test?
- Can this share a read-only cached generation inside the file?
- Is this broad enough to belong in `test:generation`?

Do not change global node test concurrency to hide slow tests. The project has generator and global-state tests that can become flaky under different scheduling. Stabilize the test first, then consider runner-level changes only with a full green validation.

## Failure Quality

Every non-trivial assertion should say what broke:

```ts
assert.equal(hasReachableLift(gen, LiftDirection.DOWN), true, 'down lift should be reachable from route spawn');
```

For generated content, include measured values in failure messages when useful:

```ts
assert.equal(monsters.length >= 900, true, `monster count ${monsters.length}`);
```

Prefer one clear domain-specific helper over repeated ad hoc loops. The helper should expose the gameplay invariant, not just implementation mechanics.

## When Adding A Test

Use this checklist:

- Does it protect a shipped behavior or a current integration contract?
- Is the cheapest reliable setup being used?
- Does it avoid generating a full floor more than once for read-only checks?
- Is the seed fixed when generation is involved?
- Should it live in `test:unit`, `test:generation`, `content:audit` or a browser smoke gate?
- Does it avoid mutating cached fixtures?
- Does it fail with an actionable message?
- Did the chosen validation command pass?
