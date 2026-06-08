# audit_4.md - Route Floors, Design Floors, Procedural Floors

## Assignment

You are subagent 4. Audit the vertical route, authored design floors, procedural route stops, numbered lift anomalies and floor memory integration. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `floors.md`
- `anomalies.md`
- `save.md`

Then inspect focused code and tests:

- `src/data/design_floors.ts`
- `src/data/procedural_floors.ts`
- `src/data/floor_catalog.ts`
- `src/gen/design_floors/`
- `src/gen/procedural_floor.ts`
- `src/systems/procedural_floors.ts`
- `src/systems/floor_memory.ts`
- route/floor tests under `tests/`

## Scope

Find concrete problems and improvements around:

- route data pointing to missing or incomplete generators
- generators not registered in manifests
- accidental new enum pressure instead of string route keys
- mismatch between floor metadata, route role, population, NPC allowance and generated content
- procedural floor profile hardcoding, duplicated formulas or weak extension points
- floor memory packing/unpacking omissions and stale runtime state
- samosbor rebuild interactions with route/design/procedural floors
- numbered lift anomaly consistency and player reachability
- dead catalog data with no implemented generator or transition hook

Focus on real defects or 100% doable integration improvements.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Archive route/floor packets are optional; do not open them unless current source directly needs historical comparison.
- Every finding must cite file and line evidence.

## Output Template

Replace this section with the finished audit.

### Coverage

- Files and docs reviewed:
- Commands run:
- Areas not covered and why:

### Findings

For each finding use:

- `A4-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Route Integration Matrix

Summarize mismatches between data, generator, population, memory and tests.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
