# audit_19.md - Player Experience, Onboarding, Game Feel, Atmosphere

## Assignment

You are subagent 19. Audit the playable user experience: first session, expedition loop, feedback, atmosphere, readability, game feel, text surfaces, audio cues and interface flow. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `desdoc.md`
- `taste.md`
- `mobile.md`
- `scenarist.md`
- `graphics.md`

Then inspect focused code and tests:

- `src/main.ts`
- `src/input.ts`
- title/HUD/menu/log/help/map/NPC UI under `src/render/`
- player feedback systems: damage, sleep, needs, samosbor, events, audio/sound
- starting area generation and Living-zone content under `src/gen/`
- relevant tests under `tests/`

## Scope

Find concrete problems and improvements around:

- first-run discoverability: controls, pointer capture, starter stash, first quests and safe expedition prep
- unclear player feedback for damage, thirst, hunger, sleep, samosbor, faction hostility and quest progress
- UI/menu flows that interrupt play, hide information or require unnecessary steps
- text/log surfaces that are noisy, clipped, stale or too implementation-like
- audio/visual cues that could better communicate danger, affordance or consequence using existing systems
- mobile first-session and direct-page/fullscreen edge cases
- game-feel issues in movement, aiming, attack/tool use, pickup and interaction
- places where a small deterministic content/system improvement would make the game richer or more readable
- missing tests for high-risk player flows

Keep findings grounded in current source. Avoid pure taste notes without a concrete implementation path.

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

- `A19-01`
- Severity: `critical` / `major` / `minor`
- Location: `file:line`
- Evidence:
- Why this is a real problem:
- 100% doable improvement:
- Validation after fix:
- Related systems touched:

### Player Flow Map

List fragile or high-value player flows and the smallest improvement for each.

### Highest-Impact Fix Order

Rank the top fixes in implementation order.
