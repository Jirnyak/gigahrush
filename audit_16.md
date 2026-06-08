# audit_16.md - Performance, Memory, Hot Paths, Build Size

## Assignment

You are subagent 16. Audit performance, memory layout, hot loops, update cadence, allocation pressure, caches, build size and low-cost optimization opportunities. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `optimization.md`
- `tests.md`
- `graphics.md`

Then inspect focused code and tests:

- hot systems under `src/systems/`
- AI/pathfinding/render/update loops
- `src/main.ts`
- `src/render/`
- `src/core/world.ts`
- `scripts/build-size-report.mjs`
- performance-related tests under `tests/`

## Scope

Find concrete problems and improvements around:

- per-frame full scans, per-entity allocations or JSON work in hot paths
- missing cadence/cap/dirty flag/cache on runtime systems
- storage-order truncation used as a performance cap
- repeated computations that should be actor-local cursors, spatial queries or cached facts
- typed-array or compact-storage opportunities that are small and justified
- render/HUD work that can be skipped, batched or cached without losing correctness
- build-size contributors that have clear source-level reductions
- debug code or telemetry that costs runtime when disabled
- missing measurement/debug counters for important hot paths

Every proposed optimization must preserve gameplay truth and isotropy.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Do not run benchmark/build-size commands if they write reports.
- Every finding must cite file and line evidence.

## Output Template

Replace this section with the finished audit.

### Coverage

- Files and docs reviewed:
- Commands run:
- Areas not covered and why:

### Findings

For each finding use:

- `A16-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Hot Path Register

List candidate hot paths with current bound/cadence/cache and proposed fix.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
