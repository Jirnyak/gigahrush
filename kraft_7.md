# kraft_7: финальный оркестратор КРАФТ апдейта

> Запускать последним, только после завершения `kraft_1.md`..`kraft_6.md`. Это интеграционный агент. Он собирает параллельные ветки, разрешает конфликты, доводит код до playable shipped state и запускает финальные проверки.

## Intake

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
kraft_1.md
kraft_2.md
kraft_3.md
kraft_4.md
kraft_5.md
kraft_6.md
items.md
interactive.md
save.md
economics.md
tests.md
mobile.md
```

Перед работой:

```bash
git status --short
```

Собрать финальные сообщения всех шести агентов:

- changed files;
- checks run;
- known blockers;
- expected conflicts;
- missing contracts.

## Main objective

Интегрировать полный крафт:

- all item compositions valid;
- player material bank works and saves;
- known recipes work and save;
- workbench disassembly reachable;
- lathe crafting reachable;
- craft/disassembly UI usable;
- recipe discovery from at least disassembly and one world source;
- tests/audit/docs current;
- `npm run check` passes.

## Conflict policy

Do not revert unrelated dirty work. For overlapping craft branches:

1. Prefer shared API from `kraft_0.md`.
2. Prefer data contracts from `kraft_1.md`.
3. Prefer runtime atomicity/save behavior from `kraft_2.md`.
4. Prefer station reachability from `kraft_3.md`.
5. Prefer UI ergonomics from `kraft_4.md`.
6. Prefer source registry/content hooks from `kraft_5.md`.
7. Prefer audit/test expectations from `kraft_6.md`.

If two agents touched the same red file, re-read the whole touched section and keep the smallest coherent integration. Do not blindly accept either side.

## Required integration checks

### Data

Verify:

```bash
rg -n "CRAFT_MATERIAL_IDS|ITEM_COMPOSITIONS|CRAFT_RECIPES|CraftRecipeSource" src tests scripts
```

Then inspect:

```txt
src/data/craft_materials.ts
src/data/item_composition.ts
src/data/craft_recipes.ts
src/data/craft_recipe_sources.ts
tests/crafting-data.test.ts
```

Every `ITEMS` id must have composition. No all-zero vectors.

### Runtime/save

Inspect:

```txt
src/systems/crafting.ts
src/core/types.ts
src/systems/save_runtime.ts
src/systems/save_payload.ts
tests/crafting-runtime.test.ts
tests/crafting-save.test.ts
tests/save-runtime.test.ts
```

Verify:

- `SAVE_SHAPE_VERSION` bumped exactly once;
- old saves rejected through existing version logic;
- no migration scaffold;
- malformed current-shape crafting data sanitizes;
- crafting actions are atomic.

### Stations

Inspect:

```txt
src/data/interactive.ts
src/systems/interactive.ts
src/systems/interactions.ts
src/gen/craft_stations.ts
src/gen/living/*
src/gen/maintenance/*
src/gen/procedural_floor.ts
tests/craft-stations.test.ts
tests/interactive.test.ts
```

Verify:

- LIVING has a reachable workbench and lathe;
- generated production/storage rooms can receive stations;
- no runtime refill;
- no `aptMask` overwrite;
- station truth survives floor memory/rebuild by deterministic rehydration or feature-backed placement.

### UI

Inspect:

```txt
src/render/craft_ui.ts
src/render/ui_layout.ts
src/render/hud.ts
src/main.ts
src/systems/mobile_actions.ts
tests/ui-layout.test.ts
tests/craft-ui.test.ts
```

Verify:

- craft menu and disassembly menu both open from interactions;
- 9-material panel visible;
- long Russian names fit;
- cursor remains valid after craft/disassembly;
- `E` action maps correctly;
- mobile path has context/close behavior;
- no DOM UI.

### Recipe discovery

Inspect:

```txt
src/data/craft_recipe_sources.ts
src/systems/inventory.ts
src/systems/quests.ts
src/systems/npc_interaction_options.ts
src/systems/computers.ts
tests/craft-recipe-sources.test.ts
```

Verify:

- disassembly can learn recipes;
- at least one item/document world source can learn recipes;
- duplicate learn does not duplicate;
- missing recipe ids are rejected/sanitized;
- no display-name matching.

### Audit/docs

Inspect:

```txt
scripts/content-audit.mjs
tests/data-ids.test.ts
tests/content-registry.test.ts
tests/crafting-balance.test.ts
README.md
items.md
interactive.md
save.md
economics.md
```

Docs must describe shipped behavior only. If a feature is not actually implemented, do not document it as shipped.

## Final validation order

Run:

```bash
npm run typecheck
npm run test:unit
npm run content:audit
npm run check
```

Because this update touches UI/render/input:

```bash
npm run check:browser
```

If Chrome is unavailable, report the exact reason.

If a check fails:

1. Read the real error.
2. Fix code or tests.
3. Re-run the narrow failing command.
4. Then re-run the broader gate.

## Playability smoke checklist

Before final:

- New run starts.
- Player can reach LIVING craft/disassembly stations.
- `E` on workbench opens disassembly menu.
- Disassembling a simple item gives exactly one material.
- 50% recipe learn path is observable with deterministic test, not necessarily manual RNG.
- `E` on lathe opens craft menu.
- Known recipe with enough materials crafts item.
- Missing materials show readable blocker.
- Save/load preserves materials and known recipes.
- Samosbor/floor transition does not erase crafting state.

## Final response requirements

Report:

- what files changed by category;
- first reachable craft/disassembly path;
- save shape version;
- checks passed;
- browser check result;
- any remaining risks.

Do not claim old save compatibility. Do not claim broad NPC/off-floor crafting unless implemented.
