# rework_07_mobile_safe_first_session

Target model: GPT-5.5 worker.

Mode: implementation worker. Mobile and HUD files are dirty in current work; coordinate carefully.

## Goal

Make the first session usable on mobile and compact touch screens without HUD/control overlap.

Mobile should not become a separate game. It needs safe layout zones and clear first-session controls.

## Feedback This Addresses

- UI overlaps and becomes unreadable.
- Controls and HUD fight for the same bottom/right space.
- Fullscreen/direct-page behavior is not obvious.
- First interaction and map/menu controls are hard to discover on touch.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `mobile.md` if relevant/current
- `src/mobile.ts`
- `src/index.css`
- `src/render/hud.ts`
- `src/render/ui_layout.ts`
- `src/render/title_ui.ts`
- `src/systems/controls.ts`
- `src/fullscreen.ts`
- `src/pwa.ts`

Run `git status --short`.

## Design Contract

Mobile controls reserve visual space:

- movement pad: bottom-left
- look/fire area: bottom-right/right-center
- action rail: right side
- fullscreen/direct-page button: top/right depending platform
- landscape/rotate prompt: modal overlay

Canvas HUD must not draw critical text under those controls.

## Implementation Direction

1. Define safe insets.
   - Either in `mobile.ts` exposed as a runtime context, or in a render helper.
   - Keep it simple: left, right, top, bottom pixel reserves.

2. Route HUD slots through safe insets.
   - Coordinate with `rework_03`.
   - Bottom vitals should not sit under touch pads.
   - Interaction prompt should stay near center but above rail/fire zones.

3. Mobile first-session labels.
   - `ACT`/`ДЕЙСТ` should be visibly tied to interaction prompt.
   - `MAP`, `QUEST`, `UI` should be discoverable but not huge.
   - Avoid long Russian labels inside tiny buttons.

4. Fullscreen/direct-page clarity.
   - Do not force fullscreen on iOS.
   - Embedded hosts should show direct-page launcher.
   - Button text should fit.

5. Test title screen on mobile size.
   - Name/seed/language/start hit zones must not overlap controls.

## Suggested File Ownership

Likely touched:

- `src/mobile.ts`
- `src/index.css`
- `src/render/hud.ts` only for safe inset consumption
- `src/render/ui_layout.ts`
- focused browser/smoke support if needed

Avoid:

- Forking gameplay rules for mobile.
- DOM-heavy game UI beyond controls.
- Auto-fullscreen on load.

## Acceptance Criteria

- Mobile controls do not cover HP/needs, interaction prompt, current objective or critical warnings.
- UI settings can be opened and used on touch.
- Fullscreen/direct-page button labels fit.
- Portrait warning does not hide title controls permanently.
- Desktop layout is unchanged except through shared safe-slot improvements.

## Verification

```bash
npm run typecheck
npm run check:browser
```

Manual viewport checks:

- 390x844 portrait
- 844x390 landscape
- 430x932 portrait
- desktop wide viewport

The orchestrator should visually inspect screenshots.
