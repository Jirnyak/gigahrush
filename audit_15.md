# audit_15.md - Save, Load, Sanitizers, Floor Memory

## Assignment

You are subagent 15. Audit save/load shape, runtime payloads, sanitizers, localStorage behavior, floor memory packing and rejection of stale saves. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `save.md`
- `floors.md`
- `alife.md`
- `demos.md`

Then inspect focused code and tests:

- `src/systems/save_runtime.ts`
- save/load systems under `src/systems/`
- `src/systems/floor_memory.ts`
- Demos/social save code
- A-Life save/foldback code
- UI settings persistence code
- save/floor-memory tests under `tests/`

## Scope

Find concrete problems and improvements around:

- persistent state omitted from save or not restored after load
- stale save version handling, legacy compatibility code or accidental migrations
- malformed current-version payloads that can crash or grow unbounded
- arrays/maps lacking caps, numeric clamping or id validation
- floor memory not preserving required generated/interactable/samosbor state
- A-Life, quests, economy, Demos, factions, inventory or UI state mismatch after save/load
- save payloads storing full object graphs instead of compact ids/facts
- hardcoded localStorage keys or duplicated persistence helpers
- missing tests for shape rejection, sanitizer caps and restored gameplay facts

Focus on current shape only. Do not propose backward compatibility scaffolding unless a current-version sanitizer needs it.

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

- `A15-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Save Section Matrix

List save sections and suspicious restore/sanitize/foldback gaps.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
