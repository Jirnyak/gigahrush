# Optimization Plan

Date: 2026-05-26.

This file is a planning document, not shipped behavior. It records optimization candidates for the current browser build of ГИГАХРУЩ. Do not treat any item here as implemented until source, tests and README say so.

## Constraints

- Keep the game zero-runtime-dependency and browser-first.
- Do not remove playable systems, content density or persistent floor facts to win benchmarks.
- Prefer bounded caches, dirty versions, async storage and existing typed-array/index patterns.
- Keep the active floor honest: the current `World` remains a full 1024x1024 simulation surface.
- Validate performance changes with `npm run check:readonly`; use `npm run check:browser` or `npm run check:full` for render, input, UI and browser-storage changes.

## Review Pass

Six parallel review lanes were requested on 2026-05-26:

| Lane | Result | Notes |
| --- | --- | --- |
| Floor memory / save / storage | completed by subagent | Main cold-storage plan below. |
| Browser UI / input / mobile / frame loop | completed by subagent | DOM cadence, map, overlay and audio items below. |
| Render / WebGL / surface marks | completed by replacement subagent | Surface atlas and sprite hot-path items below. |
| Runtime systems / AI / entity updates | completed by replacement subagent | Entity-index and cadence items below. |
| Generation / world construction | original and retry hit remote compact errors | Local source pass added generation items below. |
| Data / registry / content audit | original and retry hit remote compact errors | Local source pass added registry/audit items below. |

Remote compact failures were service errors, not code findings. No subagent edited files.

## P0: Cold Floor Storage Outside RAM

Current state:

- The active floor is a live `World`.
- Inactive visited floors are stored in RAM either as live `World` entries or packed RLE-like save snapshots in `systems/floor_memory.ts`.
- Browser save embeds a capped floor-memory section in `localStorage`.
- `localStorage` is synchronous, string-only and too small for many floor snapshots.

Planned direction:

1. Add a third floor-memory tier:
   - active floor: live `World`;
   - hot inactive cache: small LRU of live `World` objects in RAM;
   - cold inactive cache: packed snapshots in IndexedDB, not held as full objects in RAM.
2. Store cold snapshots by `{ saveSlot/runId, floorKey, snapshotFormatVersion }`.
3. Keep in RAM only metadata: floor key, byte size, importance, captured time, samosbor count, route/base id and storage key.
4. Keep `localStorage` as a small save manifest plus critical player/run state. Do not use it as bulk floor storage.
5. Use existing floor snapshot logic as the source of truth, but write binary `Uint8Array` / `ArrayBuffer` blocks to IndexedDB instead of base64 JSON strings where practical.
6. Keep `World.light` out of snapshots and recompute it after restore.
7. Because this changes save shape, bump `SAVE_SHAPE_VERSION` and reject stale saves explicitly.

Quota policy:

- Ask `navigator.storage.estimate()` for available origin quota.
- Optional: call `navigator.storage.persist()` where supported, but never rely on it.
- Suggested cold snapshot soft cap: `min(512 MiB, max(64 MiB, 25% of remaining quota))`.
- Low-storage fallback: keep only hot RAM floors plus the current capped inline save behavior.
- If IndexedDB quota fails, prune least-important cold procedural snapshots first.

Eviction priority:

- Never evict the active floor.
- Prefer keeping adjacent route stops, story floors, authored design floors, recently visited floors, high-samosbor floors, edited floors, and floors with heavy containers/entities/surface marks.
- Evict low-importance procedural cold snapshots first.
- If a cold snapshot is missing or corrupt, degrade to route-seed regeneration instead of corrupting the save.

Integration risks:

- IndexedDB is async. Floor travel needs an async load path through the existing transition/loading gate.
- Save should become two-phase: write cold snapshots first, then commit the `localStorage` manifest.
- Samosbor and floor rebuild invalidation must delete stale live, packed and cold copies for the same floor key.
- Private browsing, Safari/WebKit quota behavior and storage clearing must fall back cleanly.

Validation:

- Fake-storage unit tests for put/get/delete/list/prune, quota failure, corrupt snapshot and missing cold ref.
- Floor round-trip test: mutate doors, containers, `surfaceMap`, entities and fog; cold-evict; restore; verify state.
- Browser test: visit many floors, force cold tier, reload, return to old floors.
- Measure heap after N visited floors, save JSON size, IndexedDB usage, cold restore time and floor transition latency.

## P0: Surface Mark Uploads

Current state:

- `World.surfaceMap` stores sparse 16x16 RGBA surfaces for marked cells.
- `render/webgl.ts` packs marked cells into a 512x512 atlas with 1024 slots.
- Any `surfaceVersion` change rebuilds and uploads the full atlas and full 1024x1024 index texture.
- If more than 1024 cells have marks, the renderer sorts all marked cells by camera distance on camera-tile movement.

Planned optimizations:

1. Incremental surface atlas upload:
   - Keep stable atlas slots for visible/near marked cells.
   - Track dirty surface cells when `stampMark`, erasers or samosbor wave mutate `surfaceMap`.
   - Upload changed 16x16 tiles with `texSubImage2D`.
   - Keep a full rebuild path for world replacement, overflow, deletes and corruption.
2. Replace full sort with bounded nearest selection:
   - Avoid `Array.from(world.surfaceMap.entries()).sort(...)` for all marked cells.
   - Use fixed-size nearest-1024 selection, ring/tile buckets or a bounded heap.
   - Preserve toroidal distance and avoid visible mark flicker at the atlas cutoff.
3. Simplify `stampMark()` addressing:
   - Reduce per-pixel `while` wrapping and repeated target-cell work.
   - Group by target cell/local pixel range or compute cell deltas per scanline.
   - Add tests for stamps crossing cell boundaries and torus edges.

Validation:

- Synthetic 5k-10k marked-cell floor.
- Heavy firefight and samosbor residue scenes.
- Compare screenshots before/after while walking across the torus wrap.
- Run browser smoke to catch blank-canvas or stale-decal failures.

## P1: Render And Sprite Hot Paths

Candidates:

1. Cache static object sprite candidates.
   - Current render code scans containers and a nearby feature square every frame.
   - Build render-side bins from `featureVersion` and container dirty events, then query nearby bins.
   - Risk: stale feature/container sprites if dirty versions are missed.
2. Cull sprites before sorting.
   - Conservatively reject actors/objects outside FOV/screen bounds before `visibleOrder.sort()`.
   - Keep generous padding for wide/offset sprites.
   - Validate by rotating in dense rooms and watching edge sprites.
3. Split feature and light texture dirty uploads.
   - Avoid uploading full feature/light textures unless the relevant version changed.
   - Add a light dirty version if needed so non-light feature changes do not upload full light data.
   - Validate lamps, emergency panels, map editor, samosbor rebuilds and dynamic feature writes.
4. Pass tool-beam direction as uniforms.
   - Avoid per-fragment trig for active tool beam direction.
   - Small win, low priority.

## P1: Runtime / AI / Entity Updates

Candidates:

1. Remove full-array fallback from monster target search.
   - `findCombatTarget()` should stay bounded by `EntityIndex` buckets rather than falling back to all entities.
   - Validate target acquisition in dense NPC/monster fights.
2. Add a cold-tier AI classification cadence.
   - Current scheduling still classifies live AI every frame before hot/warm/cold skips.
   - Add delayed reclassification for cold routine actors, with immediate promotion for damage, player targeting, projectile ownership, noise and locks.
   - Validate dense-floor responsiveness and `getAiSchedulerStats()`.
3. Use indexed NPC candidates for faction capture.
   - Replace broad entity scans with `EntityIndex` actor/NPC slices where the logic only needs NPC capturers.
4. Replace noise patrol flat scan with spatial query.
   - Use bounded radius queries near the noise source instead of scanning the first N entities in array order.
5. Use `EntityIndex.byId` for active faction event id counts.
   - Avoid nested `ids x entities` scans in clashes/processions.
6. Bound holdout quest monster counting with the entity index.
   - Early-exit once the local alive-monster cap is reached.
7. Fuse projectile collision passes for non-flame projectiles.
   - Avoid computing candidate hits in one loop and applying the nearest hit in a second loop where behavior allows.
   - Preserve flame piercing, grenade/BFG timing and nearest-hit ordering.

Validation:

- Unit tests around combat, faction events, quests and projectile damage.
- Dense current-floor browser smoke.
- Watch entity-index freshness after spawns/cleanup.

## P1: Browser UI / Mobile / Frame Loop

Candidates:

1. Stop per-frame mobile DOM refresh.
   - Make mobile context updates dirty-state driven.
   - Refresh DOM only when gameplay/menu/interaction/fullscreen/orientation/language state changes.
2. Share one interaction target per frame.
   - Cache a pose/frame-local `findInteractionTarget()` result for HUD and mobile prompt.
   - Revalidate on actual `E` / ACT press.
3. Skip or throttle WebGL behind the full map.
   - Full map nearly covers the screen; consider last-frame background or low-cadence GL while map is open.
   - Validate translucent-map visual intent.
4. Reduce paused overlay render cadence.
   - Menus/inventory/settings can render dirty or capped cadence while input stays responsive.
5. Cache minimap/full-map base raster.
   - Cache explored/fog/faction/surface base image by world versions, map mode, radius and size.
   - Draw entities/player/events as dynamic overlay.
6. Lazy overlay snapshots.
   - Build gambling/computer/hack snapshots only when the overlay will draw.
7. Coalesce resize/mobile refresh.
   - Centralize resize, visualViewport, fullscreen and mobile-control refresh into one debounced scheduler.
8. Tighten audio hot-path allocations.
   - Avoid a new listener-distance closure every frame.
   - Pre-budget positional cues before creating nodes/timers.
   - Cache small frequent procedural buffers only where variation remains acceptable.
9. Rate-limit Net Sphere progress snapshots.
   - Refresh normal progress at 1 Hz or on meaningful change; force fresh snapshot for heartbeat/chat/death/samosbor sends.

Validation:

- Chrome mobile emulation and real device when available.
- Pointer lock, ACT, rotation, fullscreen, menu navigation and map toggle.
- Allocation profile during normal play and dense firefights.

## P1: Generation / World Construction

Local source pass findings:

1. Reuse placement fields per generated floor/profile.
   - `samplePlacementFieldCells()` creates a full `Float32Array(W*W)` field per call.
   - Design floors commonly sample NPC and monster fields separately after geometry is finalized.
   - Cache placement fields by world identity, `cellVersion`, profile id/hash and seed during generation.
   - Risk: stale field after generator mutates geometry/features/containers.
2. Reduce placement smoothing cost.
   - `smoothPlacementField()` scans the whole 1024x1024 field for each smoothing pass.
   - For profiles with few targets or narrow anchors, consider smoothing only candidate-cell buffers or lower pass count by profile.
   - Validate population spread and route-density tests.
3. Avoid repeated full connectivity/light passes inside one generator when possible.
   - Some floor generators call connectivity or `bakeLights()` multiple times after local mutations.
   - Batch feature writes and run one final light bake where behavior permits.
   - Risk: local modules that depend on baked light during generation.
4. Reuse reachability audit buffers for generation checks.
   - `auditReachability()` allocates full `Uint8Array` fields and JS queues.
   - Generation/test matrices call reachability often.
   - Add optional scratch buffers for generator-only repeated audits.
5. Keep generation-time broad placement in `population_placement.ts`.
   - Do not introduce runtime bucket spawners to solve generation cost.
   - Keep expensive sampling at generation/loading time, not per frame.

Validation:

- `npm run test:generation` for field distribution and route reachability.
- Compare generation timing report before/after.
- Spot-check dense authored floors: Living, Kvartiry, Maintenance, Darkness, Roof, Chthonic Attic.

## P2: Data / Registry / Content Audit

Local source pass findings:

1. Keep runtime registries direct, but avoid repeated snapshot allocation in hot UI.
   - `getSideQuestRegistrySnapshot()` maps every side quest into a new object array.
   - Snapshot APIs should be debug/audit/UI-only and cached by registry version where repeated.
2. Add registry version counters where snapshots feed UI/debug.
   - Side quests, zone content, contracts and similar registries can expose a monotonically increasing version.
   - Consumers can cache derived lists until the version changes.
3. Keep content-audit static and offline.
   - `scripts/content-audit.mjs` parses all source files with TypeScript AST. This is fine for CI, not runtime.
   - If audit time grows, split expensive checks into cached AST/source passes rather than reducing audit coverage.
4. Avoid importing content manifests only for detection inside generic runtime.
   - Continue using ids, registries and events.
   - Startup side-effect imports are acceptable for production manifests, but generic systems should not import modules to discover optional content.
5. Consider generated lookup maps for large static data only when profiling shows startup cost.
   - Current data objects are simple and readable; do not precompile registries without measurement.

Validation:

- `npm run content:audit`.
- Unit tests for registry uniqueness and UI/debug snapshots.
- Bundle-size report if static lookup generation is introduced.

## Measurement Checklist

Before and after any optimization patch, record:

- browser, device class and whether mobile/touch mode is active;
- active floor key and density profile;
- entity counts by type and `EntityIndex` stats;
- `world.surfaceMap.size`;
- frame time or Chrome Performance trace around the changed path;
- heap after visiting multiple floors;
- `localStorage` save size and, if implemented, IndexedDB usage;
- validation commands run.

Minimum checks by change type:

- Docs-only: `git diff --check`.
- Data/registry only: `npm run typecheck`; prefer `npm run check:readonly`.
- Runtime/generation/save/render/UI/browser: `npm run check`.
- Render/UI/mobile/storage: also `npm run check:browser` when Chrome is available, plus manual visual/browser validation.
