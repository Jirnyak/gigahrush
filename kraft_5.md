# kraft_5: изучение рецептов через мир

> Параллельный агент 5. Делает knowledge sources: записки, чертежи, квесты, NPC, терминалы. Разборочное 50% изучение делает `kraft_2`; этот агент добавляет остальные каналы.

## Контекст

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
items.md
quests.md
scenarist.md
interactive.md
src/data/items.ts
src/data/notes.ts
src/data/plot.ts
src/data/computers.ts
src/systems/inventory.ts
src/systems/quests.ts
src/systems/npc_interaction_options.ts
src/systems/computers.ts
src/systems/interactions.ts
```

## Ownership

Основные файлы:

```txt
src/data/craft_recipe_sources.ts
tests/craft-recipe-sources.test.ts
```

Разрешенный узкий touch:

```txt
src/data/items.ts
src/data/notes.ts
src/data/plot.ts
src/data/computers.ts
src/systems/inventory.ts
src/systems/quests.ts
src/systems/npc_interaction_options.ts
src/systems/computers.ts
```

Не трогать:

```txt
src/render/*
src/systems/save_*.ts
src/data/item_composition.ts
```

## Deliverables

1. Recipe source registry:

```ts
export interface CraftRecipeSourceDef {
  id: string;
  kind: 'item' | 'note' | 'quest' | 'terminal' | 'npc' | 'floor';
  recipeIds: readonly string[];
  itemId?: string;
  questId?: string;
  terminalId?: string;
  npcId?: string;
  floorId?: string;
  text: string;
  tags: readonly string[];
}
```

2. Item/document recipe unlocks:

Use existing inventory handler pattern. Do not add giant `if` chains by Russian display name.

Candidates:

```txt
blueprint_t1_folder
blueprint_t2_folder
blueprint_t3_folder
weapon_blueprint_t2
homemade_ammo_instruction
track_diagram_scrap
frozen_item_shard
junior_tech_case
relay_diagram
```

Behavior:

- using/reading the item calls `learnCraftRecipe()` for one or more recipes;
- known recipes are not duplicated;
- item may be consumed or not depending on source type;
- player gets concise Russian message.

3. Notes:

- add several generic world notes that hint at crafting;
- if a note directly unlocks a recipe, use item data/source ids, not raw text matching;
- keep tone consistent with `scenarist.md`.

4. Quest rewards:

- selected side/plot quest completions may unlock recipes;
- use stable recipe ids in `eventData`;
- do not make quest completion depend on crafting UI.

5. NPC teaching:

- add a generic NPC option for relevant occupations/factions if local patterns allow it;
- likely teachers: mechanic, scientist, liquidator, black market trader;
- if too broad for first pass, add authored NPC/source hooks only and leave generic teaching to future.

6. Terminals/computers:

- add recipe unlock payloads to computer/terminal interactions;
- local-only, no Cloudflare dependency;
- NET/cyber recipes can be terminal-gated.

## Source tiers

Use recipe source tiering:

```txt
tier0 - starter/survival: always known or common notes
tier1 - simple tools/ammo/medicine: disassembly, T1 blueprints
tier2 - weapons/detectors: T2 folder, faction NPC, production room terminal
tier3 - PSI/energy/deep samples: NII/Hell/late route source
tier4 - cybernetics/metamatter: deep terminal, unique quest, VOID/Hell route
```

## Text constraints

Russian strings are canonical. Keep them short in UI:

- unlock message: `Рецепт изучен: <name>`;
- duplicate: `Рецепт уже известен`;
- source failure: `Схема неполная: нужен станок или другой лист`.

Avoid explaining mechanics in long in-game text. Notes can be flavorful, but actionable enough.

## Tests

Add tests:

- all `CraftRecipeSourceDef.recipeIds` resolve;
- all item sources reference existing items;
- all quest sources reference existing quests;
- using an item source learns expected recipe;
- duplicate source does not duplicate known recipe;
- consumed source is consumed atomically only after successful unlock;
- terminal source is local/offline safe.

If broad localization text changes are substantial, run:

```bash
npm run l10n:audit
```

## Acceptance

Run:

```bash
npm run typecheck
npm run test:unit
```

If full checks fail due to missing runtime contracts from `kraft_2`, run source registry tests where possible and report exact blocker.

Final notes must include:

- recipe source count by kind;
- item ids that unlock recipes;
- quest/NPC/terminal sources added;
- player-facing text touched;
- checks run.
