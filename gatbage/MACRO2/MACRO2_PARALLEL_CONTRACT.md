# MACRO2 Parallel Contract

Date: 2026-05-20

Scope: `MACRO2_1.md` through `MACRO2_100.md`. This is a scheduling and ownership contract for running the MACRO2 plans in parallel. It does not replace `architecture.md`; it applies the existing `Parallel Agent Ownership` rules to this queue.

## Risk Legend

- Green: independent docs, checks, or narrowly scoped files. May run in parallel after reading its prompt.
- Yellow: shared source, tests, data, manifests, or docs. May run in parallel only inside its lane and not against another task touching the same files.
- Red: integrator-owned collision surface. Run serially or by the named lane owner. This includes `main.ts`, `core/world.ts`, `gen/shared.ts`, `render/webgl.ts`, `render/sprites.ts`, `render/textures.ts`, `package.json`, `README.md`, save/load, broad AI, broad samosbor, and final release docs.

If a Yellow task discovers it must edit a Red file, it becomes Red and must stop or hand the hook request to the lane owner.

## Global Rules

- Own only files listed in the MACRO2 prompt, plus one unique test file if the prompt allows it.
- Do not edit `README.md` before the behavior is verified. README is a fact record, not a plan.
- Do not create or recreate `Docs/AgentPrompts`, `Docs/AgentLogs`, `Docs/Tasks`, or other historical prompt/status folders unless explicitly requested.
- Do not widen into `main.ts`, manifests, `core/world.ts`, broad systems, or broad docs because a local task feels adjacent.
- If blocked by a missing hook, record the blocker and the smallest API needed. Do not patch around it through content-specific branches.
- Every source-changing agent runs the exact checks in its MACRO2 prompt. If prompt checks are impossible, report the real blocker and run the closest narrower check.
- Docs-only agents run docs grep/manual review. If they touch source, they inherit the relevant source checks.
- Every final report must list changed files, exact checks run, and skipped checks with reasons.

## Integration Owners

| Owner lane | Owns | MACRO2 |
| --- | --- | --- |
| Contract owner | This file and MACRO2 scheduling rules | 99 |
| Final integrator | Final merge, release gate, factual README/desdoc/architecture updates | 100 |
| README/docs fact owner | README, desdoc, appendix, scaling, active docs map | 5, 45, 77, 78, 95, 100 |
| Script/package owner | `package.json`, build scripts, smoke scripts, artifact/itch commands | 3, 6, 72, 74, 75, 76, 92 |
| Smoke/debug owner | `scripts/smoke-playability.mjs`, `src/systems/debug.ts`, debug command API | 1, 2, 52, 76, 98 |
| Core runtime owner | `main.ts`, save/load, entity index, damage, floor transition state | 7, 11, 15, 33, 37, 39, 91, 97, 98 |
| Generation owner | `gen/shared.ts`, `procedural_floor.ts`, route reachability, design full-floor shell | 17, 26-32, 40-43, 46, 47, 51, 96 |
| Samosbor owner | `systems/samosbor.ts`, variants, shelter tally, rebuild aftermath | 21-25, 33-36, 49, 50, 93 |
| Render/UI owner | `render/webgl.ts`, sprites/textures, HUD, map, quest and UI layout | 10, 12, 14, 20, 53, 54, 56, 62, 63, 65, 89, 94 |
| AI/combat owner | AI cadence, monster telegraphs, projectile/combat cues, bosses | 8, 11, 14, 16-20, 93 |
| Economy/social systems owner | contracts, inventory, containers, production, faction events, rumors | 13, 48, 54-61, 79-87 |
| Net/cloud owner | Cloudflare worker, Net Sphere APIs, D1, net market/event tests | 66-71 |
| Mobile/PWA/itch owner | mobile input/fullscreen, PWA files, itch pack verification | 64, 72, 73, 92 |

Only one owner edits a lane's shared red surface at a time. Other agents in that lane wait or restrict themselves to local files.

## Ordering

1. `99` lands first. It is this contract.
2. Foundation gates before content expansion: `4`, `26`, `46`, `47`, `51`, and `96` establish audit/reachability/test budget. Run them serially where they share `tests/procedural-floors.test.ts`, `scripts/content-audit.mjs`, or manifests.
3. Core movement/runtime before dependent UI/content: `7` before `10`, `11`, `98`; `33` before `34-36`, `49`, `50`; `37-39` before `53`, `90`, `91`, `97`.
4. Generation topology before route content: `27-30` before `31`, `32`, `40-43`; docs sync `44` and `45` after source reality is verified.
5. Samosbor warning/tally before variant polish: `21` before `22`; `22` before `23-25`; `33-36` before `49-50`; `93` after the samosbor/audio API is stable.
6. Combat basics before presentation polish: `13` and `16-17` before `18-20`; `11` before projectile visuals in `14`; boss clarity `19` after monster and late-floor hooks are stable.
7. Quest/target model before map markers and route UX: `48` before `53-55`, `80`, `83`, `85`, `87`, `89`.
8. Shared economy/social systems before route loops: `57-61` before economy-heavy content `80-87` where they depend on theft, production, events, stats, or rumors.
9. Net common before endpoint specifics: `68` before `70` and `71`; `69` before D1-dependent market checks; `66` after offline Net UI behavior can be tested.
10. Release tooling sequence: `6` before `3`; `72` before `73`; `74` before `75`; `92` after mobile smoke `64` if fullscreen/input behavior is touched.
11. `5`, `45`, `77`, `78`, and `95` can update docs only after the relevant source behavior or manual route evidence is verified.
12. `100` runs last, owns conflict resolution, release checks, artifact freshness, and factual docs.

## MACRO2 Classification

| MACRO2 | Risk | Integration owner | Ordering note |
| --- | --- | --- | --- |
| 1 | Red | Smoke/debug owner | After 2; serial with 76 and 98 on smoke/debug files. |
| 2 | Red | Smoke/debug owner | Before 1, 76, and smoke scenarios depending on stable debug ids. |
| 3 | Red | Script/package owner | After 6; README only after artifact behavior is verified. |
| 4 | Yellow | Generation owner | Serial with 46 on `scripts/content-audit.mjs`. |
| 5 | Red | README/docs fact owner | After verified source behavior; serial with all README edits. |
| 6 | Red | Script/package owner | Before 3 and package/release script changes. |
| 7 | Red | Core runtime owner | Before 10, 11, and 98. |
| 8 | Red | AI/combat owner | Broad AI scheduler; do not run beside 18 or 93 AI edits. |
| 9 | Yellow | Economy/social systems owner | Bounded runtime systems; serial with 55 or 59 on rumor/memory files. |
| 10 | Red | Render/UI owner | Owns `render/webgl.ts`; after 7. |
| 11 | Red | Core runtime owner | Owns `main.ts` projectile path; after 7. |
| 12 | Yellow | Render/UI owner | Serial with 13/61/62 on inventory and with 63/65 on UI tests. |
| 13 | Yellow | Economy/social systems owner | Before weapon/combat readability work that depends on roles. |
| 14 | Red | Render/UI owner | Owns `render/sprites.ts`; after 11 and serial with 20. |
| 15 | Red | Core runtime owner | Owns `main.ts` and samosbor/damage attribution. |
| 16 | Yellow | AI/combat owner | Monster data/entity sweep; before 18-20. |
| 17 | Yellow | Generation owner | Procedural spawn ecology; serial with procedural floor tasks. |
| 18 | Red | AI/combat owner | Broad AI/combat files; after 16-17. |
| 19 | Yellow | AI/combat owner | After 18 and stable Hell/Void content hooks. |
| 20 | Red | Render/UI owner | Owns `render/sprites.ts`; after 16 and serial with 14. |
| 21 | Red | Samosbor owner | First samosbor UX hook; before 22-25. |
| 22 | Red | Samosbor owner | After 21; before variant/debt tasks. |
| 23 | Yellow | Samosbor owner | After 22; serial on `samosbor_variants.ts` and `map_ui.ts`. |
| 24 | Yellow | Samosbor owner | After 22; serial with 23/25 on variants and shelter tally. |
| 25 | Yellow | Samosbor owner | After 22; serial with item/rumor data changes. |
| 26 | Yellow | Generation owner | Foundation reachability gate; before broad generation fixes. |
| 27 | Red | Generation owner | Owns `gen/shared.ts`; before 30-43 topology/content. |
| 28 | Red | Generation owner | Owns `gen/shared.ts`; serial with 27, 29, 39. |
| 29 | Red | Generation owner | Owns `gen/shared.ts`; serial with 27, 28, 39. |
| 30 | Yellow | Generation owner | After 27-29; serial with other `procedural_floor.ts` edits. |
| 31 | Yellow | Generation owner | After full-floor/topology hooks are stable. |
| 32 | Yellow | Generation owner | After 31 or in the same design-floor lane owner pass. |
| 33 | Red | Core runtime owner | Owns `core/world.ts`, `main.ts`, and samosbor rebuild contract. |
| 34 | Red | Samosbor owner | After 33; source edits only where tests prove a local bug. |
| 35 | Red | Samosbor owner | After 33; serial with 34/36/50 on rebuild behavior. |
| 36 | Red | Samosbor owner | After 33; serial with route cue and procedural rebuild edits. |
| 37 | Red | Core runtime owner | Owns `main.ts`; before 38, 90, 91, 97. |
| 38 | Yellow | Core runtime owner | After 37; serial with procedural floor instance tests. |
| 39 | Red | Core runtime owner | Owns `main.ts` and `gen/shared.ts`; after 37. |
| 40 | Yellow | Generation owner | Serial with procedural floor budget/profile tasks. |
| 41 | Yellow | Generation owner | Serial with 17, 42, 43 on procedural floor data. |
| 42 | Yellow | Generation owner | After topology foundation; before docs sync 44. |
| 43 | Yellow | Generation owner | After placement/topology helpers; serial with 42. |
| 44 | Green | README/docs fact owner | Docs-only; after 42 if source behavior changed. |
| 45 | Red | README/docs fact owner | README is serial and only after verified design-floor facts. |
| 46 | Yellow | Generation owner | Manifest/audit owner; serial with 4 and 47. |
| 47 | Yellow | Generation owner | After or alongside 46 only by the manifest owner. |
| 48 | Red | Economy/social systems owner | Broad quest/contracts target model; before 53-55, 80, 83, 85, 87, 89. |
| 49 | Red | Samosbor owner | After 33-36; no content branches in `main.ts`. |
| 50 | Red | Samosbor owner | After 33-36; serial with 49 on rebuild cleanup. |
| 51 | Yellow | Generation owner | Test-first; becomes Red only if `core/world.ts` changes. |
| 52 | Yellow | Smoke/debug owner | After 37-38 if it reports instance identity. |
| 53 | Red | Render/UI owner | Owns `main.ts` prompt text; after 39 and 48. |
| 54 | Yellow | Render/UI owner | After 48; serial with map/quest UI changes. |
| 55 | Yellow | Economy/social systems owner | After 48 where route target metadata is needed. |
| 56 | Yellow | Render/UI owner | After route cue contracts; serial with 87 on maintenance manifest/rumors. |
| 57 | Yellow | Economy/social systems owner | Before economy/content loops that depend on theft consequence. |
| 58 | Yellow | Economy/social systems owner | Before production-heavy route goals. |
| 59 | Yellow | Economy/social systems owner | Serial with 9/55 on rumor and memory files. |
| 60 | Yellow | Economy/social systems owner | Serial with 86 on faction event files. |
| 61 | Yellow | Economy/social systems owner | Serial with 12/13/62 on inventory/stat files. |
| 62 | Yellow | Render/UI owner | After 12/61; serial with HUD and UI layout work. |
| 63 | Yellow | Render/UI owner | Serial with 1, 10, 21, 23, 53, 54, 56 on `map_ui.ts`. |
| 64 | Red | Mobile/PWA/itch owner | Owns smoke script; before 92 if fullscreen/input changes affect PWA. |
| 65 | Yellow | Render/UI owner | Serial with 62/63 and any broad `render/*_ui.ts` edits. |
| 66 | Red | Net/cloud owner | Owns smoke script; after API/offline behavior is stable enough for smoke. |
| 67 | Yellow | Net/cloud owner | Serial with 68/70/71 on Net API tests. |
| 68 | Yellow | Net/cloud owner | Before 70/71 because it owns common endpoint helpers. |
| 69 | Yellow | Net/cloud owner | Before 71 when D1 market schema is involved. |
| 70 | Yellow | Net/cloud owner | After 68; serial on `functions/api/net/common.ts`. |
| 71 | Yellow | Net/cloud owner | After 68 and 69; serial on market/common/schema. |
| 72 | Red | Mobile/PWA/itch owner | Package/build script collision; before 73. |
| 73 | Green | Mobile/PWA/itch owner | After 72 if upload manifest shape changes. |
| 74 | Red | Script/package owner | Package/README collision; before 75. |
| 75 | Red | Script/package owner | After 74; README only after commands are run or blocked. |
| 76 | Red | Smoke/debug owner | Package/smoke/debug collision; after 2. |
| 77 | Yellow | README/docs fact owner | Docs/manual route audit; no source unless obvious blocker. |
| 78 | Red | README/docs fact owner | README/desdoc/appendix collision; no historical folder recreation. |
| 79 | Yellow | Economy/social systems owner | Data/text only; serial with 55/80/85 on rumors/contracts. |
| 80 | Yellow | Economy/social systems owner | After 48 if route target metadata is used. |
| 81 | Yellow | Economy/social systems owner | Serial with 24/25/79/80 on shared item/rumor/status data. |
| 82 | Yellow | Economy/social systems owner | Serial with 57/83 on economy/item consequence files. |
| 83 | Yellow | Economy/social systems owner | After 57-58 and 48; economy lane owner only. |
| 84 | Yellow | Generation owner | Serial with 31 on Floor 69 and with 79 on rumors. |
| 85 | Yellow | Economy/social systems owner | After 48; serial with 79/80 on contracts and rumors. |
| 86 | Yellow | Economy/social systems owner | Serial with 60 and map UI owner; no population cap changes. |
| 87 | Yellow | Economy/social systems owner | After 48/56; manifest edit by maintenance lane owner. |
| 88 | Yellow | AI/combat owner | After 19; serial with Hell generator owner. |
| 89 | Yellow | Render/UI owner | After 48; serial with Void protocol and quest UI changes. |
| 90 | Yellow | Core runtime owner | After 37; serial with 97 on map editor state. |
| 91 | Red | Core runtime owner | Owns `main.ts` save/load; after 33, 37, 90 where relevant. |
| 92 | Yellow | Mobile/PWA/itch owner | After 64; serial with 72 on `scripts/build-itch.mjs`. |
| 93 | Red | Samosbor owner | Samosbor/audio/combat collision; after 21-22 and AI cue hooks. |
| 94 | Red | Render/UI owner | Owns `render/textures.ts`; serial with render owner. |
| 95 | Yellow | README/docs fact owner | Docs-only unless a specific shipped gap is chosen. |
| 96 | Yellow | Generation owner | Serial with generation tests and package changes if split scripts are added. |
| 97 | Red | Core runtime owner | Owns `main.ts`; after 90 and 91. |
| 98 | Red | Core runtime owner | Owns `main.ts`, debug, smoke, entity index; after 7. |
| 99 | Green | Contract owner | This contract; no architecture change unless ownership rules change. |
| 100 | Red | Final integrator | Last. Owns integration conflicts, release checks, and factual docs. |

## Shared File Holds

- `README.md`: Red hold. Only `5`, `45`, `78`, and `100` may edit it, and only after verified behavior. `3`, `74`, and `75` may edit command docs only when their commands have been run or blocked with evidence.
- `package.json`: Red hold. Only one of `3`, `6`, `72`, `74`, `75`, `76`, or `96` changes scripts at a time.
- `src/main.ts`: Red hold. Only the core runtime owner edits it. Tasks `7`, `11`, `15`, `33`, `37`, `39`, `53`, `91`, `97`, and `98` must be serialized.
- `src/systems/samosbor.ts`: Red hold. Tasks `15`, `21`, `22`, `33-36`, `49`, `50`, and `93` must be serialized.
- `src/gen/procedural_floor.ts` and `tests/procedural-floors.test.ts`: Yellow hold. Generation owner batches `17`, `26-30`, `38-43`, `51`, and `96`.
- `src/gen/*/content_manifest.ts`: Yellow hold. Manifest owner batches `46`, `47`, `56`, `87`, and any lane-local content manifest change.
- `src/render/map_ui.ts`, `quest_ui.ts`, `hud.ts`, `ui_layout.ts`, `ui_text.ts`: Yellow hold. Render/UI owner batches `1`, `10`, `12`, `21`, `23`, `53`, `54`, `56`, `62`, `63`, and `65`.
- `src/render/webgl.ts`, `sprites.ts`, `textures.ts`: Red hold. Only render integrator tasks `10`, `14`, `20`, and `94` touch these.
- `scripts/smoke-playability.mjs`: Red hold. Smoke/debug owner batches `1`, `2`, `64`, `66`, `76`, and `98`.
- `functions/api/net/common.ts`: Yellow hold. Net owner batches `68`, `70`, and `71`.

## Completion Gate

A MACRO2 is complete only when:

1. Its changed files are inside its ownership lane.
2. Its prompt-specific checks ran, or the final report names the exact blocker.
3. Any manual route, viewport, smoke, or debug requirement has recorded evidence in the final report.
4. README/desdoc claims describe shipped and verified behavior only.
5. No historical prompt/log/task folders were recreated.
