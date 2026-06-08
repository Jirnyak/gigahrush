# audit_11.md - Quests, Story, Dialogue, Rumors, Scenario Text

## Assignment

You are subagent 11. Audit main plot, side quests, system assignments, contracts-as-quests, dialogue/rumer text paths and scenario tone. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `quests.md`
- `scenarist.md`
- `demos.md`
- `interactive.md`

Then inspect focused code and tests:

- `src/data/plot.ts`
- `src/gen/living/side_quests.ts`
- floor/design content modules registering quests or NPCs
- `src/systems/quests.ts`
- speech, rumors and world log systems
- quest/dialogue UI under `src/render/`
- relevant tests under `tests/`

## Scope

Find concrete problems and improvements around:

- unreachable quest starts, steps, NPCs, targets, rewards or completion paths
- side quest registrations without meaningful player decision
- quest state not saved, sanitized, advanced or displayed correctly
- authored NPC and procedural quest giver conflicts
- Russian player-facing text that is stale, inconsistent, unlocalized accidentally or too mechanical
- rumor/event/dialogue routes that leak implementation details
- hardcoded Russian display-name lookups in hot logic
- duplicated quest condition/action logic that should use shared registries/events
- missing tests for quest chains and important text-routing contracts

Focus on source-backed findings; do not propose pure writing wishlist items unless tied to a concrete broken path.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Do not open scenario-writer archive packets unless a broad text-pass issue needs exact packet context.
- Every finding must cite file and line evidence.

## Output Template

Replace this section with the finished audit.

### Coverage

- Files and docs reviewed:
- Commands run:
- Areas not covered and why:

### Findings

For each finding use:

- `A11-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Reachability Risks

List quest/content paths that may be impossible, unclear or only debug-reachable.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
