# audit_9.md - Economy, Production, Factions, Caravans, Contracts

## Assignment

You are subagent 9. Audit economy resources, factories, production, banking, caravans, faction events, contracts and market feedback. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `economics.md`
- `balance.md`
- `quests.md`
- `korovan.md`
- `online.md`

Then inspect focused code and tests:

- `src/data/economy*`
- `src/data/factions*`
- `src/data/contracts*`
- `src/data/alife_migration.ts`
- economy, faction, caravan, banking and contract systems under `src/systems/`
- economy/faction UI under `src/render/`
- relevant tests under `tests/`

## Scope

Find concrete problems and improvements around:

- resource/factory/recipe definitions not used by runtime systems
- production loops with weak caps, stale state or save omissions
- prices, rewards, tariffs and wealth bands that violate documented balance
- faction hostility/reputation mismatches with combat, quests or map markers
- caravan member identity, route movement, resource delivery and event publishing gaps
- contract generation/acceptance/completion inconsistencies
- banking/account balance edge cases and Demos/profile display mismatch
- hardcoded economy ids, duplicated market formulas or dead registries
- optional Net Sphere market data affecting local play incorrectly

Focus on defects that have clear data/system/test follow-up.

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

- `A9-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Economy Consistency Matrix

Summarize mismatches between data registries, runtime, UI, events, save and tests.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
