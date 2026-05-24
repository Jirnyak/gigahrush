# rework_03_hud_layout_slots

Target model: GPT-5.5 worker.

Mode: implementation worker. Codebase is actively dirty; preserve unrelated work.

## Goal

Prevent HUD overlap by replacing ad hoc coordinates with a small slot model.

This task is not about adding more UI. It is about making existing and new UI layers obey screen ownership.

## Feedback This Addresses

- UI elements overlap or fight for attention.
- Central menus can be covered by warnings/effects.
- Top-right optional navigation hints, smog and caravan hints can compete when many HUD layers are enabled.
- Text is too small, jittery or clipped.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `src/render/hud.ts`
- `src/render/ui_layout.ts`
- `src/render/ui_text.ts`
- `src/render/log_ui.ts`
- `src/render/map_ui.ts`
- `src/render/ui_settings_ui.ts`
- `src/mobile.ts`
- `src/index.css`

Run `git status --short` and inspect dirty diffs before editing.

## Slot Model

Create or emulate these slots:

- `topLeftEvent`: short action results and non-critical messages.
- `topCenterCritical`: samosbor warning, severe hazard warning, death-adjacent warning.
- `topRightNavigation`: existing minimap position plus optional route cue/caravan/smog stack.
- `centerInteraction`: E prompt, target prompt, pointer-lock prompt, short combat hit text.
- `centerModal`: inventory, NPC, container, quest, log, controls, UI settings, net terminals.
- `bottomVitals`: HP/needs/psi/xp and compact weapon if not in combat slot.
- `screenFx`: purely visual overlays that must not hide modal text.

Use stacking offsets rather than fixed independent `y` constants.

## Modal Quiet Rule

When a fullscreen or central menu is open:

- Hide ordinary HUD.
- Keep only locked critical overlays.
- Do not draw normal route hints, messages or cosmetic glitch lines over the modal. Do not rewrite the map to solve modal overlap.
- Active samosbor warning may remain, but it must reserve top-center space and not cover menu text.

## Text Readability

Utility text should be stable.

Use glitch/jitter for:

- samosbor
- rare anomaly effects
- horror moments
- title/final screens if readable

Avoid glitch/jitter for:

- settings
- log
- quest details
- interaction prompts
- objective text
- keybind menus

Consider adding a stable truncation helper in `ui_text.ts`:

- `fitTextStable(..., mode: 'ellipsis' | 'clip')`
- or a boolean option to existing helpers.

Do not break localization hooks.

## Mobile Safe Area

The slot model should accept safe insets or at minimum avoid:

- bottom-left joystick
- bottom-right look/fire areas
- right-side mobile action rail
- fullscreen/direct-page button

If exact mobile integration belongs to `rework_07`, leave clear hooks and document them.

## Suggested File Ownership

Likely touched:

- `src/render/hud.ts`
- `src/render/ui_layout.ts`
- `src/render/ui_text.ts`
- focused tests for text/layout helpers

Possible:

- Avoid `src/render/map_ui.ts` unless a tiny position parameter is strictly required; do not redesign map/minimap behavior in this task.
- `src/mobile.ts` only for safe inset data if coordinated with `rework_07`.

Avoid:

- Gameplay decisions in render.
- Feature-specific routing in `render/webgl.ts`.
- Rewriting every HUD widget at once.

## Acceptance Criteria

- Enabling the existing minimap plus route hints, smog hint and caravan hint does not overlap in top-right.
- Opening inventory/log/settings hides ordinary compact HUD.
- Critical samosbor text remains visible and readable.
- Text inside compact panels does not animate away from the meaning on normal desktop sizes.
- Mobile landscape does not put vital text under controls.

## Verification

Minimum:

```bash
npm run typecheck
npm run test:unit
```

Required for final integration:

```bash
npm run check:browser
```

The orchestrator should visually inspect desktop and mobile-sized screenshots.
