# audit_8.md - Samosbor, Anomalies, World Mutation

## Assignment

You are subagent 8. Audit samosbor warning/active/aftermath flow, variant hooks, procedural anomalies and runtime world mutation safety. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `samosbor.md`
- `anomalies.md`
- `floors.md`
- `save.md`

Then inspect focused code and tests:

- `src/systems/samosbor.ts`
- `src/systems/samosbor_wave.ts`
- `src/systems/samosbor_hooks.ts`
- `src/data/samosbor_variants.ts`
- `src/data/samosbor_director.ts`
- `src/systems/procedural_anomalies.ts`
- `src/systems/procedural_anomalies/`
- `src/gen/procedural_anomalies/`
- relevant tests under `tests/`

## Scope

Find concrete problems and improvements around:

- samosbor local rebuild not persisting into floor memory
- shelter checks, warnings, active pressure and aftermath state inconsistencies
- variant/modifier hooks that mutate geometry without dirty version updates
- anomalies doing unbounded scans or owning content-specific runtime loops
- mismatches between anomaly data, generator hooks and runtime hooks
- death/persistent NPC state not folded through samosbor consequences
- player-facing warning/log text that is inconsistent, clipped or misleading
- duplicate anomaly/samosbor formulas, hardcoded ids and legacy paths
- missing tests for reachable samosbor/anomaly contracts

Prefer findings that preserve the "not a loading-screen reset" contract.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Every finding must cite file and line evidence.

## Output Template

Replace this section with the finished audit.

### Coverage

- Files and docs reviewed:
- Commands run:
- Areas not covered and why:

### Findings

For each finding use:

- `A8-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Mutation Safety Checklist

List geometry/state mutation paths and whether they update dirty versions, memory and events.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
