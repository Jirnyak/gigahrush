# audit_10.md - Items, Inventory, Crafting, Containers, Interactions

## Assignment

You are subagent 10. Audit items, inventory, loot, containers, crafting, disassembly, static interactives and shared `E` action routing. Do not change source code. Write your final audit results in this same file.

Read first:

- `README.md`
- `AGENTS.md`
- `architecture.md`
- `items.md`
- `kraft.md`
- `interactive.md`
- `balance.md`

Then inspect focused code and tests:

- `src/data/items.ts`
- `src/data/weapons.ts`
- `src/data/psi.ts`
- `src/data/interactive.ts`
- `src/data/floor_object_placement.ts`
- inventory, crafting, container and interaction systems under `src/systems/`
- `src/render/craft_ui.ts`
- `src/render/container_ui.ts`
- `src/render/npc_ui.ts`
- relevant item/crafting/interaction tests under `tests/`

## Scope

Find concrete problems and improvements around:

- item definitions missing type, value, spawn, use effect, economy or sprite hooks
- weapon/PSI items mismatching stat registries
- crafting materials, compositions, recipes and recipe sources out of sync
- inventory, containers and pickup behavior edge cases
- interactives that attach behavior to wrong feature/cell or fail after floor memory restore
- `E` dispatcher option priority, prompt clarity and mobile/desktop parity
- hardcoded item ids, duplicated use/craft logic or legacy special cases
- balance outliers that are obvious from current data
- missing tests for high-value item/crafting/interaction contracts

Prioritize actionable fixes with exact ids and file locations.

## Rules

- Do not edit code, generated artifacts or other audit files.
- Do not run write-producing commands such as `npm run build`, `npm run check`, `npm run check:browser`, localization report/seed/apply, Cloudflare scripts, or artifact scripts.
- Use read-only commands such as `rg`, `sed`, `nl`, `git status --short`.
- Every finding must cite file and line evidence.

## Audit Results

### Coverage

- Files and docs reviewed: `README.md`, `AGENTS.md`, `architecture.md`, `items.md`, `kraft.md`, `interactive.md`, `balance.md`; `src/data/items.ts`, `src/data/weapons.ts`, `src/data/psi.ts`, `src/data/catalog.ts`, `src/data/interactive.ts`, `src/data/floor_object_placement.ts`, `src/data/item_composition.ts`, `src/data/craft_recipes.ts`, `src/data/craft_recipe_sources.ts`; `src/systems/interactive.ts`, `src/systems/interactions.ts`, `src/systems/inventory.ts`, `src/systems/crafting.ts`, `src/systems/containers.ts`; `src/render/craft_ui.ts`, `src/render/container_ui.ts`, `src/render/npc_ui.ts`; relevant item/crafting/interaction tests under `tests/`.
- Commands run: `git status --short`; `rg`; `sed`; `nl -ba`; read-only `./node_modules/.bin/tsx -e` registry probes for items, weapon stats, weapon role tiers, compositions, craft recipes and craft recipe sources. The final probe reported `itemCount=434`, `weaponItems=87`, `statEntries=88`, `roleTierEntries=88`, `compositionCount=434`, `recipeCount=434`, `sourceCount=23`, and no missing weapon stats, role tiers, compositions, recipes, recipe output items or recipe-source references.
- Areas not covered and why: no source code changes by assignment; no `npm run build`, `npm run check`, browser smoke, localization, Cloudflare or artifact-producing commands because this audit explicitly forbids write-producing commands. I did not do a visual/mobile pass because the audited issues are data/runtime contracts and test coverage, not a UI rendering patch.

### Findings

#### A10-01

- Severity: major
- Location: `src/systems/crafting.ts:428`, `src/systems/crafting.ts:435`, `src/systems/crafting.ts:442`, `src/systems/inventory.ts:1004`
- Evidence: `disassembleInventorySlot()` reads a concrete `slotIndex` and captures `const slot = inventory[slotIndex]`, then removes inventory with `removeItem(ctx.actor, slot.defId, 1)` instead of removing that selected slot. `removeItem()` walks inventory backwards and removes the first matching `defId`, ignoring slot index and `data`.
- Why this is a real problem: disassembly UI is slot-based, but the mutation is item-id-based. If the actor has two slots with the same `defId` (durable tools/weapons with different `data`, or same item split across slots), selecting one slot can destroy another slot while awarding materials and publishing recipe discovery for the selected slot. This is especially risky for tools/weapons where durability data is meaningful.
- 100% doable improvement: add a small inventory helper that removes from an exact slot index, or make `disassembleInventorySlot()` decrement/splice `inventory[slotIndex]` after revalidating the slot still matches. Keep the result item id/material calculation based on that same slot.
- Validation after fix: add a unit test with two same-`defId` slots carrying different `data`; disassemble the first slot and assert the first slot is removed/decremented, the second slot remains untouched, and material/recipe events still refer to the disassembled `defId`.
- Related systems touched: crafting, inventory, item data/durability, event publishing.

#### A10-02

- Severity: major
- Location: `src/data/items.ts:25`, `src/data/items.ts:39`, `src/data/items.ts:45`, `src/data/items.ts:48`, `src/data/items.ts:485`, `src/data/items.ts:488`, `src/data/items.ts:558`, `src/data/items.ts:559`, `src/data/items.ts:777`, `src/systems/inventory.ts:1957`, `src/systems/inventory.ts:1976`, `src/systems/inventory.ts:1979`
- Evidence: `addStackedUseOutput()` stacks/pushes output only while inventory has capacity, returns `void`, and silently leaves any overflow uncreated. Transforming item uses call it for `black_market_shells`, `stolen_filter_pack`, `homemade_9mm`, `ammo_12g_chemical` and `blue_glow_sample_sealed`. The generic usable-item path calls `def.use(e)` before `consumeInventorySlot(e, slotIdx)`.
- Why this is a real problem: with a full inventory and no compatible partial output stack, using a transforming item can create no output and then consume the source item. The source slot would have freed space if consumed first, but the helper tries to add output before that space exists and has no failure signal.
- 100% doable improvement: make transforming use effects transactional. Either preflight output capacity before use, or consume the source first and roll back if output insertion fails. `addStackedUseOutput()` should return moved count or success/failure so callers cannot silently lose outputs.
- Validation after fix: add unit tests for each transforming-use pattern with a full 25-slot inventory: assert use is refused without source consumption, or source is consumed and the intended output appears. Include a case where an existing output stack has room.
- Related systems touched: inventory, item use effects, ammo/resources, player-facing messages, event publishing.

#### A10-03

- Severity: minor
- Location: `balance.md:61`, `balance.md:62`, `balance.md:63`, `README.md:199`, `README.md:201`, `README.md:202`, `src/data/items.ts:422`, `src/data/items.ts:425`, `src/data/items.ts:465`
- Evidence: `balance.md` says `src/data/items.ts` has `253 item ids`, item price range `0..24000`, and top outliers such as `gravity_beam_emitter=24000`, `bfg=12500`, `gauss=7200`. Current shipped facts in `README.md` list `Item ids | 434`, `Physical weapon stat entries | 70`, and `PSI weapon stat entries | 18`. Current item values include `gauss=60000`, `bfg=180000`, `gravity_beam_emitter=500000`, and `granit4u_belt_shotgun=220000`.
- Why this is a real problem: balance docs are part of the repository contract for item/economy audits. The stale top-end range hides the current high-value economy shape and can lead future agents to "fix" or compare against obsolete numbers.
- 100% doable improvement: update the numeric support section from current source, or explicitly mark it as stale planning material and move active thresholds to a source-backed audit note. If the new prices are unintended, adjust source values instead of the doc.
- Validation after fix: run a read-only item value distribution script and `npm run content:audit` if source or broad content docs are changed.
- Related systems touched: documentation, economy balance, item values.

#### A10-04

- Severity: minor
- Location: `tests/craft-stations.test.ts:154`, `tests/craft-stations.test.ts:162`, `tests/craft-stations.test.ts:171`, `src/systems/interactive.ts:199`, `src/systems/interactive.ts:203`, `src/systems/interactive.ts:436`, `src/systems/interactive.ts:495`
- Evidence: the restored-world station test places `craft_lathe`, clones world primitives, then only asserts `findInteractionTarget(...).defId === 'craft_lathe'`. Runtime rehydration uses `ensureAutoFeatureInstance()` from surface flags/features, while actual activation goes through `useInteractive()` and `runOpenCraftMenu()`.
- Why this is a real problem: the test proves the prompt target rehydrates, but not that pressing `E` after a floor-memory-style restore opens the craft overlay. That is the player-visible contract for stations and one of the explicit audit risks.
- 100% doable improvement: extend the restored-world test to call `activateInteraction()` with `openCraftMenu`, then assert `handled === true`, `openedOverlay === true`, and a request like `craft:lathe:craft_lathe`.
- Validation after fix: `npm run test:unit` or at least the specific `craft-stations` test file through the existing test runner.
- Related systems touched: tests, interactive rehydration, shared `E` action routing, craft UI entry point.

#### A10-05

- Severity: minor
- Location: `src/systems/interactions.ts:342`, `src/systems/interactions.ts:399`, `src/systems/interactions.ts:402`, `src/systems/interactions.ts:411`, `src/systems/interactions.ts:415`, `src/systems/interactions.ts:478`, `src/systems/interactions.ts:547`, `src/systems/interactions.ts:550`, `src/systems/interactions.ts:555`, `src/systems/interactions.ts:560`
- Evidence: `findInteractionTarget()` returns the first matching branch in hardcoded order. It returns content interactions at lines 399-400 before route cues, anomalies, doors and containers, even though those later targets carry higher numeric priorities (`80`, `90`, `100`, `110`). `activateInteraction()` mirrors the same order by trying content at lines 547-548 before route/anomaly/samosbor/door/container handling.
- Why this is a real problem: the `InteractionTarget.priority` number looks like a global priority, but it is only meaningful inside the current early-return order. If content and a container/door/route cue overlap on the same looked cell, the prompt and activation can prefer the lower-priority content branch. Even if existing generation avoids most overlaps, future interactive placement can violate that assumption.
- 100% doable improvement: either document the branch order as the real priority and stop treating numeric `priority` as global, or collect all candidates and choose the highest priority with deterministic tie-breaks. Add an overlap regression test for content-vs-container or content-vs-route-cue if such overlap is valid.
- Validation after fix: unit test `findInteractionTarget()` and `activateInteraction()` on an overlapping cell, plus `npm run test:unit`.
- Related systems touched: shared `E` dispatcher, interactives, containers, doors, route/anomaly prompts, mobile/desktop prompt parity.

### Registry Mismatch Table

| Area | Ids / scope | Evidence | Status |
| --- | --- | --- | --- |
| Item definitions vs weapon stats | all `ItemType.WEAPON` ids | final read-only registry probe: 87 weapon items, 88 merged stat entries including fists `""`, no missing stats | Clean |
| Weapon role tiers | all weapon ids | final registry probe: 88 role-tier entries including fists `""`, no weapon items missing role tiers | Clean |
| Item compositions | all item ids | final registry probe: 434 items and 434 compositions, no missing or orphan composition ids | Clean |
| Craft recipes | all item ids | `src/data/craft_recipes.ts:101-113` generates one `craft_item_*` recipe per item; final probe found 434 recipe output item ids and no missing output items | Clean |
| Craft recipe sources | 23 recipe-source definitions | `src/data/craft_recipe_sources.ts:6-16` defines `recipeIds` and optional source refs; final probe found no missing recipes or source item ids | Clean |
| Disassembly selected slot | duplicate same-`defId` inventory slots | `src/systems/crafting.ts:435-442` selects by slot, then removes by `defId`; `src/systems/inventory.ts:1004-1014` removes last matching id | Mismatch: UI slot selection vs runtime mutation |
| Transforming item use | `black_market_shells`, `stolen_filter_pack`, `homemade_9mm`, `ammo_12g_chemical`, `blue_glow_sample_sealed` | output helper is `void` at `src/data/items.ts:25-43`; generic use consumes after effect at `src/systems/inventory.ts:1975-1980` | Mismatch: use message/effect can consume source without output on full inventory |
| Restored craft station activation test | `craft_lathe` restored from surface flags | `tests/craft-stations.test.ts:154-172` asserts target only, while activation path is `src/systems/interactive.ts:436-452` and `src/systems/interactive.ts:495-502` | Test gap |
| Interaction priority | content interactives vs route/anomaly/door/container | `src/systems/interactions.ts:399-417` returns content before later higher numeric priorities | Priority contract ambiguity |
| Balance support doc | item count/value range/top outliers | `balance.md:61-63` conflicts with `README.md:199-202` and current high-value items at `src/data/items.ts:422-425`, `src/data/items.ts:465` | Documentation mismatch |

### Highest-Impact Fix Order

1. Fix disassembly to remove the exact selected inventory slot, then add a duplicate same-`defId`/different-`data` regression test.
2. Make transforming item uses transactional or capacity-aware so full inventory cannot destroy source items without output.
3. Extend restored craft station tests from prompt detection to actual `activateInteraction()` overlay opening.
4. Decide whether `InteractionTarget.priority` is global or branch-local; encode that decision in dispatcher code/tests.
5. Update `balance.md` item count/value outliers from current source, or explicitly mark the stale section as planning-only.
