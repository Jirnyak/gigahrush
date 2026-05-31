# rework_10_regression_gates_and_smoke

Target model: GPT-5.5 worker.

Mode: verification/test worker. This task should run after or alongside implementation workers, but must avoid overwriting their changes.

## Goal

Add focused regression coverage and validation paths for the UX rework campaign.

This is not a feature task. It exists so UI/onboarding fixes do not regress back into blank HUD, broken existing map behavior, noisy barks or broken first interaction.

## Feedback This Addresses

- Previous fixes may solve one complaint and create another.
- UI changes need browser validation, not only typecheck.
- Dirty tree contains build artifacts; tests should not require editing generated output.

## Mandatory Intake

Read:

- `README.md`
- `architecture.md`
- `package.json`
- `scripts/smoke-playability.mjs`
- `tests/helpers.ts`
- `tests/ui-orchestrator.test.ts`
- `tests/npc-barks.test.ts`
- relevant tests for touched systems:
  - `tests/interactions.test.ts`
  - `tests/ui-layout.test.ts`
  - `tests/ui-text.test.ts`
  - `tests/map-exploration.test.ts`
  - `tests/samosbor-shelter.test.ts`
  - `tests/samosbor-drama.test.ts`

Run `git status --short`.

## Test Coverage Targets

Add or adjust focused tests for:

1. UI defaults/presets
   - novice/default keeps critical surfaces visible.
   - locked warnings cannot be disabled.
   - reset behavior is deterministic.

2. First objective
   - fresh game or quest helper exposes Olga starter objective.
   - first available plot step remains stable.

3. NPC first interaction
   - Olga before step 0 does not lead only to ambient no-op.
   - quest action/default selection is testable if helper exists.

4. Bark radius/cooldown
   - out-of-radius bark is not logged.
   - out-of-radius bark does not consume heard cooldown.
   - in-radius line includes distance.

5. Text helpers
   - stable fit/truncate does not animate utility text.
   - wrapped text respects line caps.

6. Route/lift helpers
   - active objective marker priority.
   - lift direction label for quest route.
   - existing map helper budgets remain unchanged if map code is touched.

7. Samosbor/hazard critical visibility
   - critical warning remains enabled under minimal UI/preset logic.

## Smoke/Browser Checks

Do not weaken smoke just because a UI element is intentionally hidden. Instead, update smoke assertions to verify:

- canvas is nonblank
- game starts
- player has a visible first objective or prompt in novice/default
- basic movement/input still works
- no fatal console errors

If screenshot checks are added, keep them robust:

- avoid pixel-perfect dependence on procedural content
- check nonblank regions and broad text presence
- run on deterministic seed when possible

## File Ownership

Likely touched:

- `tests/*.test.ts`
- `tests/helpers.ts`
- `scripts/smoke-playability.mjs`

Avoid:

- `dist/`
- `itch/`
- production code unless a test exposes a tiny missing pure helper and the responsible implementation worker agrees.

## Acceptance Criteria

- New tests fail against the bad UX state and pass after intended implementation.
- `npm run check:readonly` passes.
- Browser smoke remains meaningful.
- No generated release artifacts are committed by this task.

## Verification

Minimum:

```bash
npm run check:readonly
```

For browser/smoke changes:

```bash
npm run check:browser
```

Final campaign gate:

```bash
npm run check:full
```
