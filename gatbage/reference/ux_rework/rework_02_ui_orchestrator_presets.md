# rework_02_ui_orchestrator_presets

Target model: GPT-5.5 worker.

Mode: implementation worker. The working tree is dirty by design. Do not revert unrelated changes or generated artifacts.

## Goal

Turn the new UI orchestrator from "hide almost everything" into a player-safe preset system.

The current dirty work correctly adds configurable UI, but the default risks making the first run silent. The player needs a novice HUD, not a blank HUD.

## Feedback This Addresses

- UI is overwhelming when everything is on.
- UI is confusing when important surfaces are off.
- Players need visible interaction, combat and danger feedback before they learn `U`.
- The first run needs a stable readable default.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `src/systems/ui_orchestrator.ts`
- `src/render/ui_settings_ui.ts`
- `src/render/hud.ts`
- `src/render/log_ui.ts`
- `src/render/map_ui.ts`
- `src/systems/controls.ts`
- `src/main.ts`
- `src/mobile.ts`
- `tests/ui-orchestrator.test.ts`

Run `git status --short` and inspect dirty diffs for these files.

## Design Principle

UI settings may hide information density. They must not hide survival-critical feedback without replacement.

Use this classification:

- `critical locked`: samosbor active text, death/final screens, immediate death/hazard feedback that has no other telegraph.
- `critical default on`: interaction prompt, current objective, damage feedback, basic warnings, combat/crosshair feedback in novice preset.
- `informational default on for novice`: messages and a basic objective/route cue.
- `advanced default off`: faction matrix, full chatter, route lore hints and anomaly deep telemetry.
- `cosmetic default off/minimal`: extra glitch lines, non-critical screen effects.

## Required Presets

Implement or specify data structures for at least:

1. `Новичок`
   - interaction prompt on
   - current objective on
   - critical messages on
   - hazard warnings on
   - crosshair and weapon panel on
   - compact objective/route cue on
   - bottom tabs on

2. `Минимум`
   - bottom vitals
   - interaction prompt
   - current objective
   - locked critical warnings only

3. `Бой`
   - weapon panel
   - crosshair
   - combat signals
   - damage feedback
   - nearby threat cues

4. `Маршрут`
   - compact objective/route cue
   - objective
   - lift prompts
   - route hints

5. `Полный`
   - all non-debug player UI surfaces

Do not store UI settings in the game save. Keep browser-local behavior unless the task explicitly changes save shape.

## Implementation Direction

Recommended:

- Keep `UI_ELEMENT_DEFS` small and stable.
- Add a `UI_PRESETS` data structure in `src/systems/ui_orchestrator.ts`.
- Add `applyUiPreset(id)` and tests.
- Add preset rows or a preset tab to `src/render/ui_settings_ui.ts`.
- Update `tests/ui-orchestrator.test.ts`.
- Update `README.md` only after behavior is real and verified.

Avoid:

- Making every HUD detail its own toggle before groups are stable.
- Letting `screen_fx` control damage/sleep feedback silently.
- Letting `anomaly_hints` hide a hazard that can kill the player without another cue.

## Acceptance Criteria

- Fresh local settings default to a novice-safe UI, not only bottom tabs.
- A user can still choose a minimal UI.
- Locked critical system text cannot be disabled.
- Reset behavior is deterministic and covered by tests.
- Mobile UI can open the settings/presets without overlapping unreadably.

## Verification

```bash
npm run typecheck
npm run test:unit
```

For render/menu changes:

```bash
npm run check:browser
```

## Notes For Orchestrator

Coordinate with `rework_01` and `rework_03`. If another worker adds a current-objective HUD element, this preset work must include that element in novice/default behavior.
