# genfix_orchestrator

Дата: 2026-06-02
Роль: контрольный план для агента, который запускается после параллельной работы над `genfix_001.md` ... `genfix_101.md`.

Этот агент не должен заново чинить все этажи вслепую. Его задача - собрать результаты всех параллельных правок, проверить, что каждый `genfix_N` реально закрыт, найти конфликты между агентами, прогнать генерацию/метрики/территории/тесты и выдать список этажей: принято, требует короткого follow-up, сломано.

## Inputs

- `genfix_INDEX.md`
- `genfix_001.md` ... `genfix_101.md`
- baseline maps and metrics: `tmp/floor-maps/all_route_seed_61061/`
- current source tree after parallel agents
- current dirty git worktree
- root docs: `README.md`, `architecture.md`, `floors.md`, `factions.md`
- source contracts: `src/gen/`, `src/data/factions.ts`, `src/systems/territory.ts`, `src/systems/factions.ts`

## Non-goals

- Do not add a new `FloorLevel`.
- Do not restore zone-first faction ownership.
- Do not add ordinary NPC refill.
- Do not put floor-specific logic into `main.ts`, `core/world.ts`, `render/webgl.ts`, broad AI, or save/load unless there is a small generic hook already justified by the source.
- Do not rewrite good reference floors just to make all floors look alike.
- Do not overwrite unrelated dirty work. If another agent touched the same file, inspect the diff and preserve their intent.

## Success Criteria

The orchestration pass is complete only when:

- all 101 floor plans have either a verified implementation or an explicit failure note;
- every changed generator can render its target route entry through `scripts/render-procedural-floor-map.ts`;
- P0/P1 floors visibly gained macro/mid/micro playable structure, not just more empty corridors;
- P3 reference floors still read as their original successful floors;
- every floor has cell-first faction control with HQ anchors and approximate target shares;
- route lifts and spawn are reachable;
- no protected apartments, hermetic anchors, required route lifts or critical shelters were bulldozed;
- all required checks either pass or have a concrete blocker with command output.

## Phase 0 - Intake

Run:

```bash
git status --short
sed -n '1,180p' genfix_INDEX.md
find . -maxdepth 1 -name 'genfix_[0-9][0-9][0-9].md' | sort | wc -l
```

Expected:

- exactly 101 `genfix_###.md` files;
- `genfix_INDEX.md` contains the territory control contract;
- dirty files are understood before editing or validating.

If there are fewer than 101 files, stop and rebuild the plan set before reviewing implementation.

## Phase 1 - Map Work To Plans

Create a temporary local inventory of which `genfix` plans appear to have source changes. Do not commit this inventory unless explicitly asked.

Useful commands:

```bash
git diff --name-only
git status --short
rg "genfix_|territoryHqAnchors|countTerritoryCells|generateDesignFloor|generateProceduralFloor" src tests
```

For each changed source file, assign it to one or more plans:

- `src/gen/design_floors/<id>.ts` maps to the design floor with key `<id>`.
- `src/gen/procedural_floor.ts` maps to multiple procedural floors and must be checked across families.
- `src/gen/procedural_anomalies/<id>.ts` maps to all floors using that anomaly.
- story floor files under `src/gen/living`, `src/gen/ministry`, `src/gen/maintenance`, `src/gen/kvartiry`, `src/gen/hell`, `src/gen/void` map to their story floor plans.
- `src/data/factions.ts`, `src/systems/territory.ts`, `src/systems/factions.ts`, `src/core/types.ts`, save/runtime files are shared integration changes and require broad checks.

If two parallel agents changed the same generator in incompatible ways, resolve by preserving the more general algorithm and dropping one-off hardcoded fixes.

## Phase 2 - Required Per-floor Evidence

Every implemented floor needs evidence:

- before plan: `genfix_###.md`;
- after map: `tmp/floor-maps/genfix_###_after/` or a shared all-route after directory;
- test or assertion touching that generator/profile;
- metrics that do not regress reachability/lifts;
- territory checks for HQ anchors and target shares.

Minimum per-floor rerender command:

```bash
./node_modules/.bin/tsx scripts/render-procedural-floor-map.ts --seed 61061 --all --entry 001 --out-dir tmp/floor-maps/genfix_001_after
```

Use the matching index for each plan. For broad procedural changes, also render several affected entries, not only the floor reported by one agent.

## Phase 3 - Full Route Rerender

After all parallel patches are present and obvious TypeScript errors are fixed, render the whole route:

```bash
./node_modules/.bin/tsx scripts/render-procedural-floor-map.ts --seed 61061 --all --out-dir tmp/floor-maps/genfix_all_after
```

Expected:

- 101 PNG files;
- 101 per-entry JSON files;
- one `manifest.json`;
- no generator crash;
- route story/design/procedural ordering still matches `genfix_INDEX.md`.

Count artifacts:

```bash
find tmp/floor-maps/genfix_all_after -maxdepth 1 -name '*.png' | wc -l
find tmp/floor-maps/genfix_all_after -maxdepth 1 -name '*.json' | wc -l
```

Expected PNG count is 101. JSON count is 102 because it includes `manifest.json`.

## Phase 4 - Metrics Comparison

Compare baseline and after manifests. Use this as a first-pass filter, not as a replacement for visual review.

```bash
node - <<'NODE'
const fs = require('node:fs');
const before = JSON.parse(fs.readFileSync('tmp/floor-maps/all_route_seed_61061/manifest.json', 'utf8')).entries;
const after = JSON.parse(fs.readFileSync('tmp/floor-maps/genfix_all_after/manifest.json', 'utf8')).entries;
const byIndex = new Map(after.map(e => [e.index, e]));
for (const b of before) {
  const a = byIndex.get(b.index);
  if (!a) {
    console.log(`${String(b.index).padStart(3, '0')} missing after entry`);
    continue;
  }
  const roomDelta = a.rooms - b.rooms;
  const doorDelta = a.doors - b.doors;
  const reachDelta = a.reachableCells - b.reachableCells;
  const floorDelta = a.floors - b.floors;
  const flags = [];
  if (a.reachableCells <= 0) flags.push('NO_REACH');
  if (a.rooms <= 0) flags.push('NO_ROOMS');
  if (a.doors <= 0 && a.kind !== 'story') flags.push('NO_DOORS');
  if (Math.abs(reachDelta) > 260000) flags.push('BIG_REACH_SHIFT');
  console.log(`${String(b.index).padStart(3, '0')} ${a.title}: rooms ${b.rooms}->${a.rooms} (${roomDelta}), doors ${b.doors}->${a.doors} (${doorDelta}), reachable ${b.reachableCells}->${a.reachableCells} (${reachDelta}), floors ${b.floors}->${a.floors} (${floorDelta}) ${flags.join(' ')}`);
}
NODE
```

Interpretation:

- P0 floors should usually gain room/door structure or gain deliberate dense porous geometry.
- A floor can improve without huge room count growth if it gains clear mid/micro corridors, HQ complexes, yards or hazard pockets.
- P3 floors should not swing wildly in identity or metrics.
- Huge reachability loss is suspicious unless the user asked for a void/hazard floor and lifts are still reachable.

## Phase 5 - Territory Control Audit

The new faction model is cell-first:

- `world.factionControl` / future `territoryOwner` is the authority per cell;
- `zoneMap` is not faction truth;
- every floor has mini HQ anchors for human factions;
- target shares are approximate, not exact pixel-perfect quotas;
- borders are chunky, not checkerboard.

For every changed generator/profile, add or verify focused tests using:

- `territoryHqAnchors(world)`
- `countTerritoryCells(world)`
- `territoryRoomOwner(world, roomId)` when checking HQ and local rooms
- route generation entry point for the actual floor, not a mocked empty world

Minimum assertions:

- all human factions have nonzero territory cells;
- all human factions have an HQ anchor or explicit tiny ruined outpost room;
- dominant owner from `genfix_###.md` is the largest owner on the floor;
- target shares are close enough for gameplay, usually within 10-15 percentage points unless the floor brief says otherwise;
- samosbor share, when present, is hazard/scar territory and not a human HQ.

Run focused territory tests:

```bash
./node_modules/.bin/tsx --test tests/territory.test.ts
```

If a generator-specific test exists, run it too:

```bash
./node_modules/.bin/tsx --test tests/black-market-88.test.ts
./node_modules/.bin/tsx --test tests/floor-69.test.ts
./node_modules/.bin/tsx --test tests/procedural-floors.test.ts
```

## Phase 6 - Visual Geometry Review

Open or inspect the after PNGs. The reviewer should classify each floor:

- `PASS`: macro/mid/micro are visible, route is readable, target territory concept is plausible.
- `FOLLOW_UP`: playable improvement exists, but one local issue remains.
- `FAIL`: still mostly empty corridors, massive blank rooms, broken scale, missing HQs, broken route, or visual identity lost.

Visual checks:

- Are there small rooms or local structures inside/beside large macro shapes?
- Are long corridors broken by side rooms, clusters, loops, stations, doors or hazards?
- Are huge blank areas intentionally playable voids/courts, or just unfinished space?
- Does the floor still match its name and user feedback?
- Does faction control imply believable safe zones and frontiers?
- Are route cues/lifts still reachable and not buried?

Reference floors must remain distinct:

- `037` Kvartiry: original and self-contained, do not copy it everywhere.
- `051` Living: key reference for filling empty space with dense human-scale structure.
- `077` Maintenance/Collectors: reference for strong industrial route identity.
- `021` Ministry: reference for bureaucratic structure and corridor/room balance.

## Phase 7 - Global Checks

Run checks in this order:

```bash
npm run typecheck
npm run test:unit
npm run test:generation
npm run content:audit
```

If these pass and source changes affect systems/generation/save/render, run:

```bash
npm run check
```

If `dist/index.html` or other build artifacts are already dirty from unrelated work, state that clearly before running `npm run check`, because it writes `dist/`.

If render/UI/browser behavior changed, also run:

```bash
npm run check:browser
```

Always run:

```bash
git diff --check
```

## Phase 8 - Failure Handling

Do not mark a plan complete if any of these are true:

- floor generation crashes;
- route lifts or spawn are unreachable;
- P0 floor is still dominated by empty corridors/blank rooms;
- HQ anchors are missing;
- dominant territory owner does not match the plan without a justified design reason;
- old zone ownership is used as the source of truth;
- ordinary NPC refill was added;
- save shape changed without a version bump and stale-save rejection;
- tests fail and the failure is not unrelated.

For each failure, write a short actionable follow-up:

```text
genfix_### FAIL
- Problem:
- Evidence:
- Source files likely involved:
- Minimal next fix:
- Required check:
```

## Phase 9 - Orchestrator Report

At the end, create `genfix_orchestrator_report.md` unless the user asks for chat-only output.

Report format:

```text
# genfix_orchestrator_report

## Summary

- PASS:
- FOLLOW_UP:
- FAIL:
- Checks passed:
- Checks skipped:

## Accepted floors

- genfix_###:

## Follow-up floors

- genfix_###:
  - issue:
  - command/evidence:

## Failed floors

- genfix_###:
  - issue:
  - command/evidence:
  - next agent brief:

## Shared integration risks

- factions/territory:
- procedural geometry:
- design floor manifest:
- save/load:
- render/UI:

## Commands run

- command:
  - result:
```

The report should be concrete enough that the next agent can continue without rereading every parallel transcript.

## Final Acceptance

Only tell the user the whole batch is controlled when:

- `genfix_orchestrator_report.md` exists;
- all 101 floors are classified;
- rerendered all-route manifest exists;
- territory/HQ tests exist or are explicitly listed as missing blockers;
- required checks passed or blockers are exact;
- no unrelated dirty work was reverted.
