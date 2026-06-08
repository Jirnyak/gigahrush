# audit_17.md - Tests, Tooling, Content Audit, Validation Gates

## Assignment

You are subagent 17. Audit test coverage, content audit scripts, generation matrix, smoke test, TypeScript preflight and validation discipline. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `tests.md`
- `optimization.md`

Then inspect focused code and tests:

- `package.json`
- `scripts/run-unit-tests.mjs`
- `scripts/run-generation-tests.mjs`
- `scripts/content-audit.mjs`
- `scripts/smoke-playability.mjs`
- `scripts/build-size-report.mjs`
- `tests/`
- source patterns that tests are supposed to cover

## Scope

Find concrete problems and improvements around:

- important shipped contracts lacking focused deterministic tests
- tests that are too broad, flaky, stale or not asserting the important behavior
- content audit blind spots around manifest imports, dead data, duplicate ids and reachability
- generation matrix gaps for story/design/procedural floors and anomalies
- smoke test blind spots for render, input, mobile, pointer lock or playability
- validation scripts that write unexpectedly or depend on generated artifacts incorrectly
- duplicated helper setup across tests
- line/fixture hardcoding that makes tests brittle
- missing checks for hardcode, storage-order bias, legacy paths or forbidden generated edits

Do not run full gates unless absolutely necessary; this is an audit prompt, not a validation pass.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Read-only commands are allowed. `npm run typecheck`, `npm run test:unit` and `npm run content:audit` are read-only by contract, but avoid running heavy checks unless the finding needs confirmation.
- Every finding must cite file and line evidence.

## Final Audit

### Coverage

- Files and docs reviewed: `README.md`, `AGENTS.md`, `architecture.md`, `tests.md`, `optimization.md`, `package.json`, `scripts/run-unit-tests.mjs`, `scripts/run-generation-tests.mjs`, `scripts/content-audit.mjs`, `scripts/smoke-playability.mjs`, `scripts/build-size-report.mjs`, representative tests under `tests/`, and focused source around procedural anomaly registration.
- Commands run: `git status --short`; read-only `sed`, `nl -ba`, `rg`, and `find` inspections. No `npm` gates were run because this assignment is source audit only and explicitly says to avoid heavy checks unless needed for confirmation.
- Areas not covered and why: I did not run browser smoke, generation matrix, unit tests, or content audit, so this audit is about coverage/gate design rather than current pass/fail status. I did not inspect every single item test or every generated floor assertion line-by-line; the highest-risk selectors, scripts, registry tests and representative generation tests were inspected.

### Findings

- `A17-01`
- Severity: `major`
- Location: `package.json:26`
- Evidence: `tests.md:57` to `tests.md:67` defines `npm run test:generation` as the gate for all procedural geometries, all procedural anomalies, broad seed matrices and full design-floor footprint checks. `tests/procedural-floors.test.ts:1071`, `tests/procedural-floors.test.ts:1086`, `tests/procedural-floors.test.ts:1554` and `tests/procedural-floors.test.ts:6170` show those checks are actually behind the generation matrix guard. But `package.json:26` to `package.json:34` wires `check:readonly`, `check`, `check:browser`, `check:release` and `check:full` without ever invoking `npm run test:generation`. `AGENTS.md:140` says systems and generation changes should run `npm run check`, which also skips this matrix.
- Why this is a real problem: A generator or route change can satisfy the documented default and release gates while never forcing every geometry/anomaly or every design-floor footprint. That leaves the highest-signal generation coverage dependent on an agent remembering an extra command outside the normal gate names.
- 100% doable improvement: Add an explicit `check:generation` script, and either include it in `check:release` or update validation docs so generation/floor/anomaly changes require `npm run test:generation` or `npm run check:generation`, not only `npm run check`.
- Validation after fix: Run `npm run test:generation`; for release wiring, run the updated release/check script that now includes or explicitly delegates to the generation gate.
- Related systems touched: package scripts, test strategy docs, procedural floor tests, design floor tests, release validation discipline.

- `A17-02`
- Severity: `major`
- Location: `package.json:27`
- Evidence: `package.json:27` defines `check:browser` as `npm run build && npm run smoke`. `scripts/smoke-playability.mjs:18` to `scripts/smoke-playability.mjs:20` enables mobile only through `SMOKE_MOBILE` or `SMOKE_SCENARIO=mobile|touch`, not by default. The mobile layout and control assertions exist at `scripts/smoke-playability.mjs:1192` to `scripts/smoke-playability.mjs:1246`, and mobile panel/direct-launch checks are guarded by `if (runMobile)` at `scripts/smoke-playability.mjs:1545` to `scripts/smoke-playability.mjs:1553`. `tests.md:18` to `tests.md:19` describes browser gates as covering render, UI, mobile, input and canvas-risk changes.
- Why this is a real problem: The named browser gate is desktop-only unless the caller knows the environment flag. Mobile HUD, touch controls, direct-launch/fullscreen behavior and mobile panel regressions can pass `npm run check:browser` and `npm run check:full`.
- 100% doable improvement: Add `smoke:mobile` and `check:mobile` scripts, or make `check:browser` run both desktop and mobile smoke. Keep the desktop fast path available as a separate script if needed.
- Validation after fix: Run the updated browser gate and confirm logs include both desktop smoke and mobile smoke, including mobile layout/panel/direct-launch steps.
- Related systems touched: package scripts, smoke runner, mobile UI/input validation, browser validation docs.

- `A17-03`
- Severity: `major`
- Location: `scripts/smoke-playability.mjs:700`
- Evidence: The smoke script embeds a content audit lane that reads hardcoded content files at `scripts/smoke-playability.mjs:700` to `scripts/smoke-playability.mjs:727`. It then checks hardcoded AG ids and route needles such as `ag62_nii_sample_post`, `ag68_blue_glow_sample`, `ag64_green_acid_room`, `ag63_brown_cleanup`, `ag71_slime_deactivation_furnace` and `ag65_white_compulsion_room` at `scripts/smoke-playability.mjs:778` to `scripts/smoke-playability.mjs:821`. Missing source or missing manifest wiring is recorded as `skips` at `scripts/smoke-playability.mjs:760` to `scripts/smoke-playability.mjs:768`, and the report prints `required rails: ok` whenever failures are empty at `scripts/smoke-playability.mjs:859` to `scripts/smoke-playability.mjs:865`.
- Why this is a real problem: This is brittle, historical content-specific validation inside a browser smoke test. More importantly, a present source file that is not wired into the manifest becomes a skip, so the smoke can claim required rails are ok while content reachability is not actually enforced.
- 100% doable improvement: Move these checks into `content:audit` as generic manifest/reachability assertions, or convert the third-wave lane so existing source with missing production wiring is a failure. Keep smoke focused on browser behavior and debug-hook execution.
- Validation after fix: Run `npm run content:audit` for generic wiring errors, then run `SMOKE_THIRD_WAVE=1 npm run smoke` only for actual browser/debug-hook coverage.
- Related systems touched: smoke tooling, content audit, maintenance/living manifest validation, debug smoke hooks.

- `A17-04`
- Severity: `major`
- Location: `scripts/content-audit.mjs:1731`
- Evidence: Procedural anomaly modules are registered through `src/gen/procedural_anomalies/index.ts:3` to `src/gen/procedural_anomalies/index.ts:14` and `src/gen/procedural_anomalies/index.ts:24` to `src/gen/procedural_anomalies/index.ts:45`. `validateProceduralAnomalyGenerationRegistry()` checks anomaly ids against that registry at `src/gen/procedural_anomalies/index.ts:52` to `src/gen/procedural_anomalies/index.ts:63`. The content audit's unimported content scan, however, only considers `src/gen/(living|ministry|maintenance|kvartiry|hell|void|design_floors)/` at `scripts/content-audit.mjs:1731` to `scripts/content-audit.mjs:1738`.
- Why this is a real problem: A new file under `src/gen/procedural_anomalies/` can export an `apply...` generator and remain completely dead if it is never imported by the anomaly index. Typecheck will not see it, and the current dead-content scan will not flag it. This is exactly the sort of route/anomaly reachability blind spot the audit is supposed to catch.
- 100% doable improvement: Extend the dead-content/import audit to `src/gen/procedural_anomalies/`, with a small allowlist for `common.ts` and `index.ts`, and require every content-looking anomaly module to be imported by `index.ts` or deliberately marked helper-only.
- Validation after fix: Run `npm run content:audit`; add a focused test or audit fixture by temporarily adding an unimported anomaly-like module and confirming the audit fails, then remove the fixture.
- Related systems touched: content audit, procedural anomaly generation registry, procedural floor generation.

- `A17-05`
- Severity: `minor`
- Location: `tests/procedural-floors.test.ts:371`
- Evidence: `tests/generator_helpers.ts:14` to `tests/generator_helpers.ts:39` already defines the matrix guard and `testGenerationMatrix()`, while `tests/procedural-floors.test.ts:371` to `tests/procedural-floors.test.ts:385` defines the same guard locally. `tests/generator_helpers.ts:66` to `tests/generator_helpers.ts:111` defines reachability/lift helpers, while `tests/procedural-floors.test.ts:251` to `tests/procedural-floors.test.ts:271` carries a separate reachability/lift implementation for generated procedural floors.
- Why this is a real problem: The duplicate helpers are not breaking tests today, but they make skip semantics and reachability assumptions drift-prone. Procedural generation tests are already the slowest and most important matrix; duplicate helper code makes future fixes more likely to update one path and miss the other.
- 100% doable improvement: Import the shared generation matrix helper and shared lift reachability helper from `tests/generator_helpers.ts`. Keep only the door-key and dry-reachability variants local, with names that make the difference explicit.
- Validation after fix: Run `npm run test:generation`.
- Related systems touched: generation tests, test helper organization.

- `A17-06`
- Severity: `minor`
- Location: `scripts/build-size-report.mjs:282`
- Evidence: `README.md:159` documents `npm run build:size` as writing `dist/build-size-report.json`; `README.md:170` says current thresholds are warning-only. The script implements that by printing warning text at `scripts/build-size-report.mjs:282` to `scripts/build-size-report.mjs:285` and always writing the report at `scripts/build-size-report.mjs:291`. None of `check`, `check:browser`, `check:full` or `check:release` in `package.json:26` to `package.json:34` runs `build:size`.
- Why this is a real problem: Single-file HTML/gzip and generated-frame growth can cross the documented warning lines without any default or release gate surfacing it. Because the script writes to `dist/`, agents also need a non-writing or explicitly writing gate choice to avoid accidental artifact churn during audit-style work.
- 100% doable improvement: Add a read-only `build:size:check` or `--fail-on-warning --no-write` mode, and include it in release validation after `build` or `itch:build`. Keep the existing report-writing command for explicit size reports.
- Validation after fix: Run `npm run build` followed by the new size check; verify over-budget values fail the check and normal in-budget values do not write extra report artifacts unless requested.
- Related systems touched: package scripts, build-size report, release validation.

### Coverage Gap Table

| Untested or under-gated contract | Smallest useful test or gate |
| --- | --- |
| Full generation matrix is not part of any named broad/release gate. | Add `check:generation` and wire it into release or generation-change docs; run `npm run test:generation`. |
| Browser gate name does not run mobile smoke by default. | Add `check:mobile` or make `check:browser` run desktop plus `SMOKE_MOBILE=1 npm run smoke`. |
| Hardcoded third-wave smoke content can skip missing manifest wiring. | Move those checks into `content:audit` and fail when an existing source module is not production-wired. |
| Dead procedural anomaly modules are outside content audit's unimported-content scan. | Extend the scan to `src/gen/procedural_anomalies/` and require import from the anomaly index. |
| Size budget warnings are not enforceable in CI/release. | Add non-writing/failing size-budget mode and include it after build in release validation. |
| Generation matrix helpers are duplicated between test files. | Consolidate `testGenerationMatrix` and basic reachability helpers in `tests/generator_helpers.ts`. |

### Highest-Impact Fix Order

1. Wire or explicitly require `npm run test:generation` for generation/release validation (`A17-01`).
2. Add a named mobile browser gate and make mobile coverage visible in ordinary browser validation (`A17-02`).
3. Move hardcoded third-wave source/wiring checks out of smoke or make missing production wiring fail (`A17-03`).
4. Extend `content:audit` dead-content detection to procedural anomaly modules (`A17-04`).
5. Add a non-writing, failing size-budget check for release validation (`A17-06`).
6. Consolidate duplicated generation test helpers (`A17-05`).
