# audit_1.md - Core Architecture And Layer Boundaries

## Coverage

- Files and docs reviewed: `README.md`, `AGENTS.md`, `architecture.md`, `save.md`, `src/core/types.ts`, `src/core/world.ts`, `src/main.ts`, `src/gen/shared.ts`, `src/render/textures.ts`, `src/render/hud.ts`, `src/render/sprite_index.ts`, `src/gen/living/index.ts`, `src/gen/procedural_screens.ts`, `src/data/weapons.ts`, `src/data/psi.ts`, `src/data/plot_events.ts`, `src/data/entity_limits.ts`, `src/systems/events.ts`, `src/systems/save_runtime.ts`, `src/systems/save_payload.ts`, `src/systems/content_hooks.ts`, `src/systems/entity_limits.ts`, `src/entities/monster.ts`, focused tests under `tests/` that touch event types, entity limits, crafting, document gates and monster behavior.
- Commands run: `git status --short`; `wc -l audit_1.md`; `sed -n` / `nl -ba ... | sed -n` for the files above; `rg -n "^import" src/core src/data src/gen src/systems src/render src/main.ts src/input.ts`; focused `rg` searches for cross-layer imports, `WorldEventType`, `as WorldEventType`, `voidReturnPortal`, `MonsterKind`, `AIState`, storage-order patterns such as `.slice(0`, `.find(...)`, `rooms[0]`, `candidates[0]`, `anchors[0]`.
- Areas not covered and why: no generated artifacts, browser smoke, build output, `dist/**`, `itch/**`, screenshots or `../gatbage/**` were inspected because this audit is source/read-only and the assignment forbids generated/write-producing commands. I did not inspect every content module in detail; broad searches were used to identify layer-boundary risks, then focused files were read around the evidence.

## Findings

### A1-01

- Severity: major
- Location: `src/core/types.ts:407`
- Evidence: `AIState` starts as shared state at `src/core/types.ts:407`, but it contains named/content-specific monster state such as `baitLine` for Tonkaya Ten at `src/core/types.ts:429`, `choirCountdown` / `choirChildIds` for Khorovaya Matka at `src/core/types.ts:451`, `waterPressure` / wet-line fields for Vodyanoy Koshmar at `src/core/types.ts:465`, `falsePatrol*` for Black Liquidator at `src/core/types.ts:531`, and `parasiteFood*` for Mukhozhuk at `src/core/types.ts:535`. The same interface later contains generic tactic fields at `src/core/types.ts:540`, which shows there is already a less content-specific direction available. Tests and systems directly depend on these fields, e.g. `tests/monster_37_khorovaya_matka.test.ts:89`, `tests/monster_36_vodyanoy_koshmar.test.ts:105`, and `src/systems/ai/monster.ts:7057`.
- Why this is a real problem: `core/` is supposed to own primitive shapes only. With named-monster transient fields in `AIState`, every new monster behavior can become a red-file edit, and stale fields remain globally visible even when only one creature uses them. This also makes save/floor-memory/entity snapshots harder to reason about because generic entity shape now implies many optional content states.
- 100% doable improvement: keep `AIState` to generic navigation/combat/tactic fields, then move named monster state into either generic tactic slots, bounded per-system runtime maps keyed by entity id where persistence is not needed, or a single compact extensible `ai.local`/`monsterState` object sanitized by the owning monster/AI system. Start with one cluster such as `falsePatrol*` or `waterLine*` and add regression tests before broad cleanup.
- Validation after fix: `npm run typecheck`; focused monster tests for the migrated behavior; `npm run test:unit` if more than one behavior moves.
- Related systems touched: core types, monster AI, monster tests, possible floor-memory/save sanitization depending on whether migrated state must persist across packed floors.

### A1-02

- Severity: major
- Location: `src/core/types.ts:832`
- Evidence: `WORLD_EVENT_TYPES` is a closed core array beginning at `src/core/types.ts:832`, including many content-specific events through `src/core/types.ts:1011`, and `WorldEventType` is derived from that array at `src/core/types.ts:1014`. Content modules already bypass the closed union with casts: `document_gate_access_${outcome} as WorldEventType` at `src/gen/ministry/document_gate.ts:579`, `black_slime_${phase} as WorldEventType` at `src/gen/maintenance/black_slime_eyes.ts:142`, and `${PROTOCOL_ID}_${phase} as WorldEventType` at `src/gen/void/pristav_pustoty.ts:157`. Tests assert those dynamic event names exist or are queryable even when they are not listed in `WORLD_EVENT_TYPES`, e.g. `document_gate_access_success` at `tests/items_108_rail_depot_pass.test.ts:76`, `black_slime_disturbed` at `tests/monster_29_chernosliz.test.ts:177`, and `pristav_pustoty_paid` via `String(e.type)` at `tests/monster_24_pristav_pustoty.test.ts:73`. Runtime normalization also trusts arbitrary saved strings with `raw.type as WorldEventType` at `src/systems/events.ts:259`.
- Why this is a real problem: the current contract is both too closed and not actually enforced. Core is forced to carry content event names, but content still needs casts for dynamic local events. This produces false type safety, makes `WORLD_EVENT_TYPES` stale by construction, and makes every exact event addition look like a red-file change even though events are meant to be id/tag based cross-system facts.
- 100% doable improvement: change `WorldEventType` to an open branded/string type or add a data/system event registry outside `core`, then reserve the core list for generic categories only if it is still useful. Convert dynamic content events to either registered ids or generic event types plus stable tags/data. Remove `as WorldEventType` casts from content modules and add an audit test that fails on casts or on closed-list drift.
- Validation after fix: `npm run typecheck`; event-focused tests that query document gate, black slime, Pristav Pustoty and crafting events; `npm run test:unit`.
- Related systems touched: core event types, event store, content event publishers, tests, save sanitization for current event history.

### A1-03

- Severity: major
- Location: `src/render/textures.ts:4`
- Evidence: the render texture generator imports `generateSlideTextures`, `generateHintTextures` and `generatePosterTextures` from `../gen/living` at `src/render/textures.ts:4`. That import resolves through the living floor orchestrator, which imports runtime systems at `src/gen/living/index.ts:27`, procedural screen generation at `src/gen/living/index.ts:30`, and the side-effect `./content_manifest` at `src/gen/living/index.ts:36`, while re-exporting texture helpers at `src/gen/living/index.ts:42`. Render also imports `generateProceduralScreenTextures` from `../gen/procedural_screens` at `src/render/textures.ts:5`, while `src/gen/procedural_screens.ts` imports `World` at `src/gen/procedural_screens.ts:13` and render pixel/text helpers at `src/gen/procedural_screens.ts:21`.
- Why this is a real problem: render depends on generation assembly and generation depends back on render utilities. Loading the texture module can pull in floor generation, systems and manifest side effects even though it only needs pure raster routines. That violates the layer direction, increases accidental initialization coupling, and makes texture-only changes risk content registration behavior.
- 100% doable improvement: move pure texture raster helpers into `src/render/` or a neutral `src/data`/`src/render` texture-content module, and have generation import only the placement/screen metadata it needs. At minimum, import the exact pure submodules instead of `../gen/living` so `content_manifest` and floor orchestration are not loaded from render.
- Validation after fix: `npm run typecheck`; sprite/texture tests such as `tests/sprites-floors.test.ts` and any procedural screen tests; `npm run check:readonly` if the import split touches several modules.
- Related systems touched: render texture generation, living generator exports, procedural screen placement, content manifest side effects.

### A1-04

- Severity: major
- Location: `src/main.ts:2916`
- Evidence: `main.ts` hardcodes Herald and Creator death consequences at `src/main.ts:2916` and `src/main.ts:2923`, calls data-layer handlers from `src/data/plot_events.ts`, then runs the generic death-hook extension only afterward at `src/main.ts:2934`. The called data module is not data-only: `onHeraldKilled` reads quests, world zone data and pushes messages at `src/data/plot_events.ts:16`, while `onCreatorKilled` mutates `world.floorTex` and pushes messages at `src/data/plot_events.ts:40`. A generic content death hook mechanism already exists in `src/systems/content_hooks.ts:45` and is dispatched by `runContentEntityDeathHooks()` at `src/systems/content_hooks.ts:130`.
- Why this is a real problem: red/integrator `main.ts` still owns content-specific boss consequences, and `data/plot_events.ts` owns runtime mutation despite the data-layer rule. Future story boss or route-unlock consequences are likely to copy this path instead of registering a hook, which keeps expanding `main.ts` and makes story behavior harder to test in isolation.
- 100% doable improvement: move these handlers to a system/content hook module, e.g. `systems/story_boss_hooks.ts` or a registered route/plot hook, and register the Herald/Creator consequences through `registerContentEntityDeathHook()` or a more specific story-event registry. Keep `data/plot.ts` as definitions only; the runtime hook can consume plot ids and route gate ids.
- Validation after fix: `npm run typecheck`; focused quest/Creator/Herald route tests; `npm run test:unit`. If portal/floor travel changes are touched, use `npm run check` later in an implementation pass.
- Related systems touched: main loop death handling, plot events, route gates, content hooks, world texture dirtying, quests.

### A1-05

- Severity: major
- Location: `src/main.ts:1310`
- Evidence: `VoidReturnPortalState` and `VoidReturnPortalHost` are local to `main.ts`, then stored on `GameState` via casts at `src/main.ts:1310`, normalized in `main.ts` at `src/main.ts:1319`, saved through ad hoc extras at `src/main.ts:4506`, and restored at `src/main.ts:4692`. `GameState` itself has no `voidReturnPortal` or `voidEntryFromFloor` fields; it ends at `worldEvents?: WorldEventState` in `src/core/types.ts:1203`. Render duplicates a smaller local portal interface and reads the hidden state with another cast at `src/render/hud.ts:198` and `src/render/hud.ts:207`. Save runtime accepts the section as `unknown` extras at `src/systems/save_runtime.ts:24`, while `save.md` documents only an optional `voidReturnPortal` section at `save.md:36`.
- Why this is a real problem: a persistent gameplay state is owned partly by `main.ts`, partly by render casts and partly by unknown save extras. This bypasses the normal "system owns serializer/sanitizer" pattern, makes the actual `GameState` shape lie to TypeScript, and risks render/runtime drift because HUD and main define different portal shapes.
- 100% doable improvement: create a small `systems/void_return_portal.ts` that owns the state type, `ensure`/`normalize`, save serializer/sanitizer, HUD snapshot and use/open/clear operations. Add typed optional state to `GameState` only if this state is truly runtime-global, or keep it in a system-owned WeakMap with explicit save section. Render should consume a snapshot function rather than casting `GameState`.
- Validation after fix: `npm run typecheck`; focused save/load test covering active, used and malformed portal state; route/floor transition tests around Void return; `npm run test:unit`.
- Related systems touched: main loop, render HUD, save runtime/payload, Void route flow, game state typing.

### A1-06

- Severity: minor
- Location: `src/data/weapons.ts:3`
- Evidence: physical weapon stats import `Spr` from the render sprite registry at `src/data/weapons.ts:3`, and `WeaponStats.projSprite?: number` stores the render sprite index at `src/data/weapons.ts:16`. Many weapon rows then embed render indices, e.g. `makarov` uses `Spr.BULLET` at `src/data/weapons.ts:71`. PSI stats repeat the same render dependency at `src/data/psi.ts:5` and `src/data/psi.ts:8`. `Spr` itself is not a stable data enum; it is computed from NPC, monster, feature and container sprite ordering in `src/render/sprite_index.ts:14` through `src/render/sprite_index.ts:73`.
- Why this is a real problem: data definitions depend on render implementation order. A sprite-layout change can affect gameplay data modules, and adding a projectile visual requires a render import in data instead of a stable projectile visual id resolved by render. This is exactly the kind of storage-order/render coupling the architecture tries to avoid.
- 100% doable improvement: replace `projSprite?: number` in weapon stats with a stable id such as `projVisualId?: 'bullet' | 'pellet' | ...` or reuse `ProjType` plus a projectile-visual registry. Resolve that id to `Spr` only in render/projectile creation code.
- Validation after fix: `npm run typecheck`; projectile/weapon tests; browser smoke later if projectile visuals are changed.
- Related systems touched: weapon/PSI data, projectile creation, render sprite lookup, combat feedback.

## Hardcode / Legacy / Duplication Index

- `src/core/types.ts:407` - core `AIState` contains named monster fields; adding behaviors can require red-file edits.
- `src/core/types.ts:832` - closed `WORLD_EVENT_TYPES` mixes generic and content-specific event ids.
- `src/gen/ministry/document_gate.ts:579`, `src/gen/maintenance/black_slime_eyes.ts:142`, `src/gen/void/pristav_pustoty.ts:157` - dynamic event names bypass the core union with `as WorldEventType`.
- `src/systems/events.ts:259` - save normalization casts arbitrary saved event strings to `WorldEventType`.
- `src/render/textures.ts:4` and `src/gen/living/index.ts:36` - render imports the living generator index and therefore can load content-manifest side effects for texture generation.
- `src/gen/procedural_screens.ts:21` - generation imports render text/pixel helpers while render imports the same generation module for screen textures.
- `src/data/weapons.ts:3` and `src/data/psi.ts:5` - data depends on render `Spr`.
- `src/data/plot_events.ts:16` and `src/data/plot_events.ts:40` - data module owns runtime story effects and world mutation.
- `src/main.ts:2916` and `src/main.ts:2923` - main loop hardcodes Herald/Creator consequences before the generic content death hook at `src/main.ts:2934`.
- `src/main.ts:1310`, `src/render/hud.ts:207`, `src/systems/save_runtime.ts:24` - Void return portal state is duplicated as casts/unknown extras rather than one system-owned typed state.
- `src/data/entity_limits.ts:7` and `src/data/entity_limits.ts:26` - mutable run configuration and setter live in `data/`; `main.ts` imports the setter from data at `src/main.ts:506`.
- `src/gen/shared.ts:107` and `src/gen/shared.ts:430` - last-resort "first passable cell" scans still exist. They are fallback paths, not primary route logic, but should be watched because they can make cell storage order visible if a generator loses normal anchors.
- `src/gen/shared.ts:801` - `connectRoomsMST()` seeds Prim's algorithm from `rooms[0]`; this is probably deterministic construction rather than a current bug, but tie behavior still follows room storage order.

## Highest-Impact Fix Order

1. Move Void return portal and Herald/Creator consequences into system/content hooks with typed save/HUD snapshots. This removes the most direct red-file content logic and hidden persistent state.
2. Replace the closed core event-type list with an open or registered event id model, then remove `as WorldEventType` casts and add a drift test.
3. Untangle render/generation imports for texture generation, especially the `render/textures.ts` -> `gen/living` index path and the procedural screen render/gen cycle.
4. Replace render `Spr` numbers in weapon/PSI data with stable projectile visual ids resolved outside `data/`.
5. Migrate named monster `AIState` fields out of `core/types.ts` incrementally, starting with one behavior cluster that already has focused tests.
6. Move mutable actor soft-limit state out of `src/data/entity_limits.ts` into `systems/entity_limits.ts` or a settings/runtime module, leaving `data` with constants only.
