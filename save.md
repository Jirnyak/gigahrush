# Save And Persistence Contract

> Центральный документ сохранений.
>
> Роль: фиксирует current-shape save/load policy, payload ownership, sanitization, caps and rejection rules. Для реализации проверяй `src/systems/save_runtime.ts`, `src/systems/save_payload.ts` and the domain serializers they call.

## Policy

The browser save lives in `localStorage` under `gigahrush_save`.

Current authoritative shape:

- `SAVE_SHAPE_VERSION = 25`;
- old or unversioned saves are rejected;
- newer saves are rejected;
- cross-version migration code is not required by default.

ГИГАХРУЩ is in active development. Breaking persistence changes should bump `SAVE_SHAPE_VERSION`, reject stale data explicitly and keep the current shape sanitized.

## Runtime Entry Points

- `src/systems/save_runtime.ts`: shape version, version status, top-level payload creation and runtime section gathering.
- `src/systems/save_payload.ts`: compact payload construction, payload size accounting, portal compaction and section normalization.
- Domain systems own their own compact serializers/sanitizers where possible.

The save is not a full object graph. Save ids, seeds, compact facts and sparse overrides.

## Current Payload Sections

Current runtime save sections include:

- player state, age, sex, inventory, equipment, money, RPG and needs;
- current floor id/key, position and route context;
- `floorRun`;
- `floorInstances`;
- optional `voidReturnPortal`;
- `alife`;
- `alifeMobility`;
- `computers`;
- `netHack`;
- `liftArachna`;
- `pseudolift`;
- `floorMemory` (снапшот только текущего активного этажа);
- `playedCinematics` (какие синематики ключевых этажей уже проиграны в этом ране, capped);
- `netTerminalGen`;
- `mapEditorPatches`;
- `worldEvents`;
- `crafting`;
- `demosSocial`;
- `economy`;
- `banking`;
- `stockMarket`;
- `production`;
- `factionRelations` (плоский снимок динамической матрицы отношений фракций, FACTION_COUNT² Int8; сохраняется, т.к. отношения теперь персистентны между этажами и загрузками).

If a system stores persistent state, it needs a current-shape serializer/sanitizer, a cap or compact representation, and a rejection/test path when shape compatibility changes.

The crafting section stores only the player material bank and known recipe ids: 9 numeric material counts and deduplicated current recipe ids. Item composition and recipe definitions remain data registries, not item-instance save data.

## Sanitization Rules

Current-shape input can be corrupt. Sanitizers should:

- clamp numbers into valid ranges;
- cap arrays and maps;
- reject invalid ids or replace them with safe current defaults;
- preserve only known section fields;
- avoid loading full live entity arrays;
- avoid trusting Russian display names as identity keys;
- avoid JSON parse/stringify in hot runtime paths.

Sanitization is not legacy migration. It keeps the accepted current shape from crashing runtime.

## Floor Memory

Only the **current active floor** is ever retained or persisted. A floor is a pure function of `(runSeed, z)` and regenerates deterministically on every transition (`src/gen` has zero `Math.random`; the whole chain runs under `withSeededRandom(floorSeed, …)`), so departing floors are **not** kept: leaving a floor folds its NPCs back into A-Life and discards the `World`. This bounds live RAM to a single `World` (the iOS-OOM fix) and keeps the save to one floor.

`floorMemory` is therefore a single-entry save↔load handoff, not a cross-floor cache:

- on **save**, `captureCurrentFloorMemory()` packs the live active floor via `worldForSave(world, base)` as a **delta against the regenerated pristine base** (see below), then `clearFloorMemory()` drops the transient so nothing floor-sized lingers or re-archives during play;
- on **load**, the one packed entry is restored and consumed by `loadFloorForTarget`/`takeFloorMemory` with `fromMemory=true` (skipping map-editor replay, container restore and exploration reset), so player mutations on the active floor — dropped loot, looted containers, corpses, broken doors — survive save→load;
- a lift **revisit** finds an empty map → regenerates the floor fresh with deterministically identical geometry, by design.

### Delta encoding (`baseDelta`)

A full-geometry snapshot of a dense floor exceeds `localStorage`'s ~5 MB ceiling (>90 % of it is deterministically regenerable geometry stored redundantly). Because the floor is a pure function of `(runSeed, z)`, the snapshot stores only what runtime *changed* and regenerates the rest:

- **base** = `generateFloorForTarget(z, entry).world` (post-gen stamps included), resolved **symmetrically** on both sides (`currentFloorTarget()` at save mirrors `loadGame`'s `(floor, generatedRunEntry)` at load). Lazy thunk: no base is generated on ordinary transitions, only at serialize time and on a delta-load hit.
- **geometry is delta'd:** the 12 world arrays are stored **XOR vs base** (`encodeRleArrayXor`/`applyRleArrayXor`; unchanged cells collapse to `0`-runs), rooms as sparse `roomPatches` + `roomsAppended`, doors as `doorsRemoved` + `doorsUpsert`. `defId`/`tags` are generation-deterministic and recovered from the base slot on a patched room.
- **absolute in both modes** (runtime-mutated or trivially small): `zones`, `containers`, `surfaceMap`, `anomaly*`/`rail*` runtime, ceiling scalars. **Entities** stay the absolute snapshot (A-Life re-skins NPCs regardless).
- **drift guard:** a `baseHash` (FNV-1a over `cells`+`roomMap`+room/door counts) fingerprints the base. If the base regenerated at load differs from the one at save (any `src/gen`/`injectFastElevators`/`stampCeilingHeights` change, or a `(z,entry)` asymmetry), the hash mismatches → `worldFromSave` returns `null` → the loader falls back to a **fresh regenerate**, not silent grid corruption. This is automatic and needs no manual bump.
- **save-time base regen** runs under `withPreservedGenerationRuntime` (`src/systems/generation_runtime_guard.ts`) so a throwaway regen cannot clobber live module singletons a generator resets as a side effect (e.g. kvartiry uprising state). Load-time regen is **not** guarded — a real floor load wants fresh module state.
- **network path** (`floor_serialization.ts`) calls `worldForSave(world)` / `worldFromSave(...)` with **no base** → full absolute snapshot automatically; the new fields are optional, so `PackedWorld` is unchanged.

`MAX_FLOOR_MEMORY_ENTRIES` and `MAX_FLOOR_MEMORY_SAVE_ENTRIES` are both `1`; the older byte-budget / `deviceMemory` machinery is left inert (not removed).

Samosbor mutates/stitches the current active world in place — it does not spawn a separate alternate floor; the active world stays authoritative for the current key.

If the floor snapshot format or required route identity changes incompatibly, bump `SAVE_SHAPE_VERSION`.

## A-Life

A-Life saves compact identity state, not live NPC arrays:

- seed/count basis for reconstruction;
- up to `65_536` dead procedural A-Life ids;
- dead plot ids;
- sparse changed-record overrides;
- capped mobility state for cold journeys, pending active-floor arrivals and migration cursor/cadence;
- player social/rank inputs through the current player entity state.

Live materialized NPCs fold back before transitions, samosbor rebuilds and save. Ordinary killed people are not silently replaced by background refill.

## Events, Economy And Production

Events use bounded ring buffers and save only compact public/private facts. Economy, banking, stock market and production save sparse runtime state rather than regenerating every consequence from current frame objects.

Production save state is capped by the production system. Economy rows and resource values must sanitize missing or malformed current-version data.

## Portal Boundary

Portal compaction is an external packaging/runtime concern documented in `PRCampaign/portal.md`. The local `gigahrush_save` payload remains authoritative for the normal browser build.

Portal bridges may upload wrapped current-shape data or compact current-shape profiles, but they must not introduce a second gameplay save format inside core game docs.

## Adding Persistent State

Before adding a persistent field:

1. Decide the owning system.
2. Store ids/seeds/facts, not objects.
3. Add serializer and sanitizer in the existing section pattern.
4. Cap arrays and sparse maps.
5. Define behavior for missing malformed current-shape data.
6. Bump `SAVE_SHAPE_VERSION` when old current saves can no longer be read honestly.
7. Add or update tests for save creation, rejection, cap and sanitize behavior.

Do not add migration scaffolding, legacy aliases or compatibility branches unless the task explicitly asks for them.
