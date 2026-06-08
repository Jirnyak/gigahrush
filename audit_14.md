# audit_14.md - HUD, Menus, Input, Mobile, Accessibility

## Assignment

You are subagent 14. Audit canvas HUD, menu surfaces, UI orchestrator, key bindings, pointer lock, fullscreen, mobile touch controls, map and accessibility/readability. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `mobile.md`
- `graphics.md`
- `interactive.md`
- `taste.md`

Then inspect focused code and tests:

- `src/input.ts`
- `src/fullscreen.ts`
- `src/render/hud.ts`
- `src/render/ui_*`
- `src/render/*_ui.ts`
- `src/render/map_ui.ts`
- `src/systems/ui_orchestrator.ts`
- UI/input/mobile tests under `tests/`

## Scope

Find concrete problems and improvements around:

- HUD text clipping, unreadable density, unstable layout or poor mobile scaling
- pointer-lock, menu focus, right-click close, map open/close and fullscreen edge cases
- desktop/mobile input parity for `E`, attack, tool use, map, menu and settings
- UI settings persistence outside save and default preset consistency
- menu surfaces that duplicate controls, state or drawing helpers
- render UI code leaking gameplay decisions instead of drawing ready state/options
- high-value UX improvements that are clearly implementable from current systems
- accessibility/readability issues: contrast, font sizing, prompt clarity, remapping discoverability
- missing tests for UI orchestrator, input and mobile behaviors

Avoid broad redesign. Report exact broken or weak flows and small robust fixes.

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

- `A14-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### UX Flow Risks

List concrete player flows that may fail or feel unclear, with source evidence.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
