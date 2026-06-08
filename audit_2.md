# audit_2.md - World Model, Typed Arrays, Toroidal Math

## Assignment

You are subagent 2. Audit the `World` data model, typed-array storage, toroidal coordinate helpers and primitive runtime shapes. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `optimization.md`
- `floors.md`

Then inspect focused code and tests:

- `src/core/world.ts`
- `src/core/types.ts`
- `src/core/rand.ts`
- `src/core/path_blockers.ts`
- systems and generators using `world.idx`, `world.wrap`, `world.delta`, `world.dist`, `world.dist2`
- tests around world, blockers, generation and movement

## Scope

Find concrete problems and improvements around:

- incorrect or inconsistent toroidal distance/wrap use
- direct array indexing that should go through `world.idx`
- expensive distance calculations that could use `dist2`
- typed-array initialization, reset, cloning, bounds and dirty-version handling
- world mutation paths that forget `cellVersion`, `surfaceVersion`, texture or fog dirty state
- storage-order bias in gameplay-visible loops
- duplicated occupancy, passability or coordinate helpers
- data model fields that are redundant, stale, over-broad or under-sanitized

Prefer small fixes that preserve the current zero-runtime-dependency, data-oriented style.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Do not search archive/media/output folders unless a concrete source reference requires it.
- Every finding must cite file and line evidence.

## Audit Results

### Coverage

- Files and docs reviewed:
  - `README.md`
  - `AGENTS.md`
  - `architecture.md`
  - `optimization.md`
  - `floors.md`
  - `mesh.md`
  - `block.md`
  - `src/core/world.ts`
  - `src/core/types.ts`
  - `src/core/rand.ts`
  - `src/core/path_blockers.ts`
  - `src/systems/floor_memory.ts`
  - `src/systems/movement_collision.ts`
  - `src/systems/borshchevik.ts`
  - `src/systems/blood_plant.ts`
  - `src/systems/door_state.ts`
  - `src/systems/weapon_beams.ts`
  - `src/systems/breach_charge.ts`
  - `src/systems/samosbor_wave.ts`
  - `src/systems/procedural_anomalies/conway_life.ts`
  - `src/systems/procedural_anomalies/section_shift.ts`
  - `src/systems/procedural_anomalies/sandpile_perekrytie.ts`
  - `src/systems/procedural_anomalies/living_tunnels.ts`
  - `src/systems/ai/pathfinding.ts`
  - `src/systems/ai/npc_fsm.ts`
  - `src/systems/ai/combat.ts`
  - `src/systems/ai/monster.ts`
  - `src/gen/path_blockers.ts`
  - `src/gen/floor_manifest.ts`
  - `src/gen/design_floors/manifest.ts`
  - `src/gen/visual_cell_slots.ts`
  - `src/render/webgl.ts`
  - `src/render/mesh/*` by targeted search
  - `tests/core-world.test.ts`
  - `tests/floor-memory.test.ts`
  - `tests/path-blockers-core.test.ts`
  - `tests/path-blockers-generation.test.ts`
  - `tests/path-blockers-movement.test.ts`
  - `tests/path-blockers-storage-policy.test.ts`
  - `tests/visual-cell-slots.test.ts`
- Commands run:
  - `git status --short`
  - `sed -n ... README.md audit_2.md AGENTS.md architecture.md optimization.md floors.md`
  - `nl -ba ... | sed -n ...` on focused source, docs and tests
  - `rg -n "world\\.(idx|wrap|delta|dist|dist2)\\(|\\.dist2\\(|\\.dist\\(" src tests`
  - `rg -n "\\* W \\+|world\\.(cells|roomMap|wallTex|floorTex|features|fog|visualSlots|pathBlockers)\\[.*\\]\\s*=" src/core src/systems src/gen tests`
  - `rg -n "mark(Cells|WallTex|FloorTex|Features|Fog|VisualSlots|Surface|PathBlockers)|cellVersion|surfaceVersion|featureVersion|fogVersion|pathBlockerVersion" src/systems src/main.ts`
  - `rg -n "\\.slice\\(0|\\[0\\]|\\.find\\(|SCAN_CAP|ROOM_CAP|ANCHOR_CAP|for \\(const room of world\\.rooms\\)|for \\(let i = 0; i < entities\\.length" src/systems src/gen src/main.ts`
  - `rg -n "replaceWorldFromGeneration|surfaceMap|visualSlots|pathBlockers|rebuildPathBlockersFromWorldObjects|collectFloorLiftAnchors" src tests`
- Areas not covered and why:
  - Did not run tests/build/checks because this assignment explicitly limits the pass to read-only commands and says not to run write-producing artifact commands.
  - Did not search `../gatbage/**`, `dist/**`, `itch/**`, media or screenshots because the audit scope did not require archive/output context.
  - Did not line-review every authored design floor; the pass used targeted repository-wide searches, then inspected representative mutation/restore/render paths with line evidence.

### Findings

- `A2-01`
- Severity: `major`
- Location: `src/systems/floor_memory.ts:759`
- Evidence:
  - Packed floor-memory world snapshots serialize only `WORLD_ARRAY_FIELDS`, which include `cells`, `roomMap`, textures, features, masks, territory, fog, lift direction and `surfaceFlags`, but not `pathBlockers` (`src/systems/floor_memory.ts:148`).
  - The active RAM estimate counts `world.pathBlockers.byteLength`, proving this field exists only on the live `World` object and is intentionally expensive (`src/systems/floor_memory.ts:226`).
  - `worldFromSave()` restores arrays, rooms, doors, containers and surface data, then marks dirty versions, but never calls `rebuildPathBlockersFromWorldObjects()` (`src/systems/floor_memory.ts:759`).
  - New story/design generation does rebuild blockers after object/profile placement (`src/gen/floor_manifest.ts:85`, `src/gen/design_floors/manifest.ts:163`).
  - Movement collision uses the active `pathBlockers` field through `pathBlockedAt()` (`src/systems/movement_collision.ts:16`).
  - Tests currently assert that save payloads exclude full blocker arrays (`tests/path-blockers-storage-policy.test.ts:25`, `tests/path-blockers-storage-policy.test.ts:41`) but do not assert blocker recovery after restore.
- Why this is a real problem:
  - A visited floor restored from browser save can keep features and containers but lose their fine 8x8 collision masks. Tables, beds, shelves, apparatus and bulky containers become visually present but physically passable until some later unrelated mutation rebuilds blockers.
- 100% doable improvement:
  - After `world.containers` and `containerMap` are restored in `worldFromSave()`, call `rebuildPathBlockersFromWorldObjects(world)` and keep `pathBlockers` out of the save payload.
  - If importing `gen/path_blockers` into `systems/floor_memory.ts` is considered an ownership smell, create a tiny systems-facing rebuild hook near the floor activation path and call it immediately after packed restore.
- Validation after fix:
  - Add a unit test that captures a floor with `Feature.TABLE` or a bulky container, serializes via `floorMemoryStateForSave()`, restores via `restoreFloorMemoryFromSave()`, loads it with `takeFloorMemory()`, and asserts `canActorOccupy()` rejects the blocked subcell.
  - Run `npm run test:unit` or at least the focused path-blocker/floor-memory tests.
- Related systems touched:
  - Floor memory, save restore, movement collision, path blockers, container/features, AI path-follow occupancy.

- `A2-02`
- Severity: `major`
- Location: `src/systems/floor_memory.ts:883`
- Evidence:
  - `collectFloorLiftAnchors()` scans `world.cells` from index `0` upward and stops when `out.length >= limit` (`src/systems/floor_memory.ts:883`).
  - Floor transitions capture departure anchors with `ROUTE_LIFTS_PER_DIRECTION` as that limit (`src/main.ts:3630`); the default target is `16` (`src/systems/floor_memory.ts:140`).
  - Mirrored lifts then consume `mirror.anchors.slice(0, targetCount)` (`src/systems/floor_memory.ts:1333`).
  - When a floor has too many anchors, layout cleanup pops from the end of the row-major anchor list, preserving low-index anchors (`src/systems/floor_memory.ts:1381`).
- Why this is a real problem:
  - Route continuity and same-coordinate lift mirroring become biased toward low `idx` cells, effectively north/west storage order. The architecture contract explicitly forbids capped gameplay-visible scans where a flat array prefix becomes physical truth.
- 100% doable improvement:
  - Make anchor capping score-based or deterministic-fair: collect all anchors, score by distance to player/departure lift, spacing coverage and route seed, then choose the top distributed `targetCount`.
  - For demotion, remove the least useful anchors by the same score instead of `pop()` from row-major order.
- Validation after fix:
  - Add a unit test with more than 16 up/down lifts distributed across quadrants, then assert the mirrored/preserved set is not simply the lowest indices and keeps spacing around the departure/player context.
  - Run focused floor-memory route-lift tests and `npm run test:unit`.
- Related systems touched:
  - Floor memory, route lifts, floor transitions, procedural route continuity, storage-order fairness.

- `A2-03`
- Severity: `major`
- Location: `src/systems/borshchevik.ts:283`
- Evidence:
  - Borshchevik root damage changes a `Cell.DOOR` or `Cell.WALL` to `Cell.FLOOR`, then only opens the old door state if a door object exists (`src/systems/borshchevik.ts:283`).
  - Blood plant root opening has the same pattern (`src/systems/blood_plant.ts:127`).
  - `World.removeDoorAt()` is the existing primitive that removes the door from `world.doors`, removes it from room door arrays, converts a door cell to floor and fixes door wall texture (`src/core/world.ts:459`).
  - Door state maps are rebuilt by iterating every `world.doors` entry, not by checking `world.cells[ci] === Cell.DOOR` (`src/render/webgl.ts:1966`).
  - Visual decor placement rejects cells just because `world.doors.has(idx)`, even if the cell is no longer a door (`src/gen/visual_cell_slots.ts:275`, `src/gen/visual_cell_slots.ts:317`).
- Why this is a real problem:
  - The primitive world shape becomes inconsistent: a floor cell can still have a door record and can remain in `room.doors`. That can leave phantom door state in renderer upload data, block future decor/object placement, and serialize stale door metadata through floor memory.
- 100% doable improvement:
  - In both root-opening paths, call `world.removeDoorAt(cell)` before or instead of setting `world.cells[cell] = Cell.FLOOR` when `old === Cell.DOOR`.
  - Consider a shared `openCellToFloor(world, idx, options)` helper only if a third runtime path needs the same door/room/texture cleanup.
- Validation after fix:
  - Add tests that put a root site on a door cell, trigger the opening, then assert `world.cells[idx] === Cell.FLOOR`, `world.doors.has(idx) === false`, and the owning rooms no longer list that door index.
  - Run focused monster/root tests plus `npm run test:unit`.
- Related systems touched:
  - Monster ecology runtime, doors, room topology, renderer door state map, visual slots, floor memory.

- `A2-04`
- Severity: `minor`
- Location: `src/systems/floor_memory.ts:786`
- Evidence:
  - `worldFromSave()` calls `world.bakeLights()` after restoring arrays and feature data (`src/systems/floor_memory.ts:786`).
  - Five lines later it calls `world.markFeaturesDirty(true)` (`src/systems/floor_memory.ts:791`).
  - `markFeaturesDirty(true)` itself calls `this.bakeLights()` and bumps `lightVersion` (`src/core/world.ts:430`).
- Why this is a real problem:
  - Packed floor restore performs two full `W * W` lightmap passes. It is not a correctness bug, but it is a avoidable restore/load hitch on the full 1024x1024 typed-array field.
- 100% doable improvement:
  - Remove the explicit `world.bakeLights()` and let `markFeaturesDirty(true)` do the single bake and version bump.
  - Alternatively, keep the explicit bake and add a `markFeaturesDirty(false)` plus a direct `lightVersion` bump helper, but that is more API surface for no benefit.
- Validation after fix:
  - Add or update a restore test with a lamp/candle and assert restored `world.light[...]` is populated and `lightVersion`/`featureVersion` are dirty.
  - Run focused floor-memory/core-world tests.
- Related systems touched:
  - Floor memory restore, lightmap typed array, dirty versions, renderer light upload.

- `A2-05`
- Severity: `minor`
- Location: `src/systems/floor_memory.ts:759`
- Evidence:
  - `mesh.md` says full `visualSlots` are not saved, but generated/static visual details are recoverable from generation, features, containers, themes and seeds (`mesh.md:665`).
  - Save fields exclude `visualSlots` (`src/systems/floor_memory.ts:148`), and tests only check that exclusion (`tests/visual-cell-slots.test.ts:279`).
  - New generation fills visual slots (`src/gen/floor_manifest.ts:86`, `src/gen/design_floors/manifest.ts:164`).
  - `worldFromSave()` restores saved arrays into a fresh `World`, whose constructor-created `visualSlots` remain empty, and never calls a visual-slot recovery function or marks `visualSlotVersion` dirty (`src/systems/floor_memory.ts:759`).
- Why this is a real problem:
  - After browser reload, a packed visited floor can restore gameplay geometry but lose render-only micro-decoration/mesh slots. This violates the current mesh policy's recoverability claim and creates a visible regression on restored floors.
- 100% doable improvement:
  - Recover visual slots during packed restore after features/containers are restored. If the restore needs the floor key/seed, move this step out of `worldFromSave(input)` into the caller that knows the entry key, or pass a deterministic seed such as `hashSeed(entry.key)`.
  - Mark `world.markVisualSlotsDirty()` after recovery.
- Validation after fix:
  - Extend `tests/visual-cell-slots.test.ts` or `tests/floor-memory.test.ts`: create a saved floor with a feature that produces a visual slot, restore it from floor-memory save, and assert at least the expected deterministic feature slot is present and `visualSlotVersion` changes.
  - Run focused visual-slot/floor-memory tests.
- Related systems touched:
  - Floor memory restore, mesh pass, visual slots, generated static decor.

- `A2-06`
- Severity: `minor`
- Location: `src/systems/ai/pathfinding.ts:602`
- Evidence:
  - `steerEntityTowardCell()` computes `world.dist()` only to compare with `0.35` (`src/systems/ai/pathfinding.ts:602`).
  - The same function computes another `world.dist()` only to compare with `0.3` while advancing a cached path cursor (`src/systems/ai/pathfinding.ts:625`).
  - `World.dist()` performs `Math.sqrt(dx * dx + dy * dy)` while `World.dist2()` already exists for threshold comparisons (`src/core/world.ts:520`, `src/core/world.ts:526`).
- Why this is a real problem:
  - This is active actor path-follow code. It pays unnecessary square roots in a function that can run for many materialized actors, while the comparisons can be expressed exactly as squared thresholds.
- 100% doable improvement:
  - Replace the two threshold checks with `world.dist2(...) < 0.35 * 0.35` and `world.dist2(...) >= 0.3 * 0.3`.
  - Keep `world.dist()` in scoring/reporting paths where linear distance is actually used.
- Validation after fix:
  - Run `tests/ai-pathfinding.test.ts` and broader `npm run test:unit`.
  - Add a small torus-edge steering regression if existing tests do not cover threshold advancement across wrap.
- Related systems touched:
  - AI pathfinding, toroidal distance helpers, active actor update cost.

### Hotspot Notes

- `World.set()`, `World.carve()` and `World.carveRect()` mutate cells/roomMap without dirty markers (`src/core/world.ts:326`, `src/core/world.ts:537`, `src/core/world.ts:543`). Current source use is generation/tests, but these public helpers are a future footgun for runtime geometry work.
- `replaceWorldFromGeneration()` shallow-copies `surfaceMap` with `new Map(source.surfaceMap)` (`src/core/world.ts:755`). Current call sites appear to discard or only read the source after replacement, but any future retained source world would share mutable `Uint8Array` surface cells.
- `nearestReachableRouteCell()` samples every `reachable.count >> 11` entry from BFS order (`src/systems/floor_memory.ts:1151`). It is bounded and probably intentional, but if route-lift connector quality matters, this should be reviewed for directional/BFS-order bias.
- Runtime geometry/anomaly files generally remember dirty markers, but direct typed-array writes remain widespread. New runtime mutation code should use existing helpers or end with explicit dirty calls plus blocker/visual-slot rebuild where applicable.
- Several AI scoring paths use `Math.sqrt(world.dist2(...))` because they need linear distance in scores (`src/systems/ai/npc_fsm.ts:492`, `src/systems/ai/monster.ts:4457`). Do not mechanically replace those unless the scoring formula is intentionally changed.

### Highest-Impact Fix Order

1. Rebuild `pathBlockers` after packed floor-memory restore (`A2-01`).
2. Remove stale door records when root systems open door cells (`A2-03`).
3. Remove row-major route-lift capping/mirroring bias (`A2-02`).
4. Recover `visualSlots` after packed restore or adjust the documented policy if recovery is intentionally out of scope (`A2-05`).
5. Drop the duplicate light bake in `worldFromSave()` (`A2-04`).
6. Replace path steering threshold square roots with `dist2` checks (`A2-06`).
