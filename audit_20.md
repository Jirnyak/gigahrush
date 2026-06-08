# audit_20.md - Cross-Cutting Hardcode, Duplicates, Legacy, Dead Data

## Assignment

You are subagent 20. Run a cross-cutting audit for hardcoding, duplicated systems, legacy scaffolding, dead data, unreachable modules and high-confidence cleanup/improvement candidates across the whole repository. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `problems.md`
- `optimization.md`
- `tests.md`

Then inspect broadly but efficiently:

- `src/`
- `tests/`
- `scripts/`
- `package.json`
- root docs only when they define an active contract

## Scope

Find concrete problems and improvements around:

- hardcoded ids, display names, route keys, array prefixes, magic numbers and one-off conditions
- duplicate systems that should share a registry, helper, event or data definition
- legacy compatibility, old save behavior, abandoned paths or stale comments that conflict with active policy
- dead data with no import, registration, generator, runtime hook, UI path or test
- source files that violate active docs or README implementation facts
- tests that preserve bad hardcoding instead of contract behavior
- generated/output/artifact churn risks
- broad but 100% actionable refactors that reduce real complexity without architecture speculation

This audit is allowed to overlap other audits, but should focus on cross-repo patterns and consolidation opportunities.

## Suggested Read-Only Searches

Use these only as starting points; verify every hit in context:

- `rg -n "legacy|compat|migration|TODO|FIXME|HACK|hardcod|fallback|old|deprecated" src tests scripts *.md`
- `rg -n "slice\\(0|for \\(let .*< [0-9]|Math\\.min\\([^\\n]*[0-9]" src`
- `rg -n "\"[a-z0-9_:-]+\"" src/data src/systems src/gen | head`
- `rg -n "FloorLevel\\.|plotNpcId|routeId|designFloor|procedural" src`

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Do not search `../gatbage/**`, `dist/**`, `itch/**`, `screenshots/**`, `pikabu/**` by default.
- Every finding must cite file and line evidence.

## Output Template

Replace this section with the finished audit.

### Coverage

- Files and docs reviewed:
- Commands run:
- Areas not covered and why:

### Findings

For each finding use:

- `A20-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Consolidation Index

Group duplicated/hardcoded patterns by future implementation target.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
