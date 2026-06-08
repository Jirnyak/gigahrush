# audit_12.md - Monsters, Ecology, Sprites, Counterplay

## Assignment

You are subagent 12. Audit monster definition packages, ecology entries, procedural sprites, AI hooks, rumors and learnable counterplay. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `monsters.md`
- `ecology.md`
- `ai.md`
- `fight.md`

Then inspect focused code and tests:

- `src/entities/`
- `src/entities/monster.ts`
- `src/data/monster_ecology.ts`
- monster-related generation and AI hooks
- sprite index/render hooks for monsters
- monster tests under `tests/`

## Scope

Find concrete problems and improvements around:

- monster definitions missing registry, sprite, ecology or counterplay links
- ecology data not reflected in generation, AI, rumors or samosbor reactions
- creature-specific AI that could be expressed by generic tactics/data
- hardcoded encounter ids in broad AI/combat/render systems
- duplicate procedural sprite logic or inconsistent silhouettes/readability
- monsters with no learnable counterplay, cues, rumors or meaningful tactical difference
- balance outliers in HP, speed, damage, spawn context or rewards
- dead monster data with no reachable generation or debug path
- missing tests for registry/ecology/AI/render contracts

Prioritize concrete mismatches and reachable gameplay improvements.

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

- `A12-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Monster Contract Matrix

List monster ids with missing or suspicious definition/ecology/sprite/AI/counterplay links.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
