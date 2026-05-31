# rework_08_samosbor_hazard_teaching

Target model: GPT-5.5 worker.

Mode: implementation worker. Samosbor files may already be dirty; inspect before editing.

## Goal

Make the first samosbor and major hazards teach survival instead of feeling like random punishment.

Samosbor should remain dangerous. The first readable response must be clear: find hermetic safety, leave the zone, or follow the variant-specific instruction.

## Feedback This Addresses

- Players die or panic without understanding what happened.
- Horror atmosphere does not land because warnings are either too much text or hidden.
- UI settings can hide hazard cues.
- Samosbor is a core promise but needs a player-readable first experience.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `src/systems/samosbor.ts`
- `src/systems/samosbor_hooks.ts`
- `src/data/samosbor_variants.ts`
- `src/data/samosbor_director.ts`
- `src/render/hud.ts`
- `src/render/map_ui.ts` only to understand existing shelter/map behavior; avoid map redesign.
- `src/systems/cell_hazards.ts`
- `src/systems/route_cues.ts`
- `src/systems/events.ts`
- `tests/samosbor-wave.test.ts`
- `tests/samosbor-shelter.test.ts`
- `tests/samosbor-drama.test.ts`

Run `git status --short`.

## Design Direction

Separate three phases:

1. Prewarning
   - short countdown
   - floor/zone
   - one action line
   - shelter/exit hint

2. Active
   - clear "do this now" text
   - variant identity
   - intense visuals, but not unreadable

3. Aftermath
   - residue/consequence
   - what changed
   - rumor/log hook

## First Samosbor Teaching

For early Living experience:

- Give enough time to react.
- Point to nearby shelter/herma if known.
- Do not require map-layer literacy or a map redesign.
- Do not hide warning behind optional UI toggles.
- Keep the action line short.

Example action lines:

- `К гермодвери или выйдите из зоны.`
- `Укрытие отмечено. Мест мало.`
- `Не отвечайте голосам. Дверь держите закрытой.`

## UI Classification

Hazard/samosbor warnings should be critical. If the player disables decorative UI, warnings still appear.

Potential split:

- `samosbor_text`: locked.
- `hazard_warning`: default on and only hides non-lethal helper details.
- `screen_fx`: cosmetic intensity, not core survival text.
- `anomaly_hints`: advanced details, not the only lethal hazard cue.

Coordinate with `rework_02`.

## Suggested File Ownership

Likely touched:

- `src/systems/samosbor.ts`
- `src/render/hud.ts`
- `src/systems/route_cues.ts`
- Avoid `src/render/map_ui.ts` unless a tiny existing shelter marker bug is proven.
- tests under `tests/samosbor*.test.ts`

Avoid:

- Making samosbor harmless.
- Adding content-specific render logic.
- Per-frame full-world shelter scans.
- Long tutorial paragraphs during active danger.

## Acceptance Criteria

- First/early samosbor prewarning gives one clear action.
- Critical warning remains visible with minimal UI.
- Active warning does not cover central menu text unless it is truly critical.
- Shelter hint appears when available and bounded; prefer HUD/route cue language over changing the map.
- Aftermath posts one compact consequence, not a log flood.

## Verification

```bash
npm run typecheck
npm run test:unit
npm run check:browser
```

Use debug/smoke path to force samosbor if available. Visually inspect warning readability.
