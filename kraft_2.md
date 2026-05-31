# kraft_2: runtime crafting, materials игрока и save/load

> Параллельный агент 2. Реализует системную логику: материал-bank игрока, известные рецепты, атомарный крафт, атомарная разборка, save shape. UI и станции делают другие агенты, но они должны вызывать этот API.

## Контекст

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
save.md
items.md
src/core/types.ts
src/systems/inventory.ts
src/systems/save_runtime.ts
src/systems/save_payload.ts
src/systems/events.ts
src/data/craft_materials.ts
src/data/item_composition.ts
src/data/craft_recipes.ts
tests/save-runtime.test.ts
tests/inventory-atomic.test.ts
```

Если craft data files еще не существуют в твоей ветке, создать минимальные type-compatible imports only if necessary, но не брать ownership состава всех items. Это зона `kraft_1`.

## Ownership

Основные файлы:

```txt
src/systems/crafting.ts
tests/crafting-runtime.test.ts
tests/crafting-save.test.ts
```

Разрешенный узкий touch:

```txt
src/core/types.ts
src/systems/save_runtime.ts
src/systems/save_payload.ts
tests/save-runtime.test.ts
```

Не трогать:

```txt
src/render/*
src/gen/*
src/data/items.ts
src/data/interactive.ts
```

## Deliverables

1. Runtime state:

```ts
export interface CraftingState {
  materials: MutableCraftVector;
  knownRecipes: Record<string, true>;
  learnedCount: number;
  lastChangedAt: number;
}
```

Add to `GameState` a persistent section:

```ts
crafting: CraftingState;
```

If UI needs transient fields later, do not own them here unless they are needed for tests.

2. System API in `src/systems/crafting.ts`:

```ts
ensureCraftingState(state: GameState): CraftingState
createCraftingState(): CraftingState
sanitizeCraftingState(input: unknown): CraftingState
craftingForSave(state: GameState): CraftingSavePayload
restoreCraftingState(input: unknown): CraftingState
learnCraftRecipe(state: GameState, recipeId: string, source?: string): boolean
hasCraftRecipe(state: GameState, recipeId: string): boolean
addCraftMaterial(state: GameState, materialId: CraftMaterialId, count: number): void
canCraftRecipe(actor: Entity, state: GameState, recipeId: string, station: CraftStationKind): CraftCheck
craftKnownRecipe(ctx: CraftingActionContext): CraftingActionResult
disassembleInventorySlot(ctx: CraftingActionContext): CraftingActionResult
craftMenuSnapshot(ctx: CraftMenuSnapshotContext): CraftMenuSnapshot
```

3. Disassembly:

- input: player entity, state, inventory slot index, station kind, rng;
- fail without mutation if slot invalid, item unknown, no composition, station invalid;
- remove exactly 1 item from inventory;
- choose exactly 1 material by weighted composition;
- add exactly 1 material;
- 50% recipe learn chance through rng;
- no duplicate known recipe entries;
- publish event and return message.

4. Craft:

- fail without mutation if recipe unknown, recipe not learned, station mismatch, not enough materials, item result missing, inventory full;
- check inventory space before subtracting materials;
- subtract exact vector;
- add output item using existing inventory helpers;
- publish event and return message.

5. Save/load:

- bump `SAVE_SHAPE_VERSION`;
- add `crafting` section to payload;
- save `materials` as 9 numbers and `knownRecipes` as ids;
- sanitize malformed current-shape data;
- reject old saves through normal shape-version policy, no migration.

## Atomicity requirements

Use existing helpers:

```txt
canAddItem()
addItem()
removeItem()
```

Do not manually duplicate inventory stack logic. Do not put composition into `Item.data`.

For atomic crafting, make a preflight:

```txt
1. Resolve recipe.
2. Check known recipe.
3. Check station.
4. Check materials.
5. Check canAddItem result.
6. Only then mutate materials and inventory.
```

For disassembly, if removing the item fails, do not add material or learn recipe.

## Events

Add to `WORLD_EVENT_TYPES` if not already present:

```txt
player_disassemble_item
player_craft_item
craft_recipe_learned
```

Event payload should include compact ids only:

```txt
itemId
recipeId
materialId
stationKind
source
```

Tags should include:

```txt
crafting
disassembly
recipe
material_<id>
```

## Tests

`tests/crafting-runtime.test.ts`:

- empty crafting state starts with 9 zero materials;
- adding materials clamps/sanitizes;
- learning recipe returns true first time and false on duplicate;
- disassembly with deterministic rng picks expected material;
- disassembly removes one item and adds one material;
- disassembly learn chance works at `< 0.5` and fails at `>= 0.5`;
- crafting fails unknown recipe;
- crafting fails unknown learned recipe id after sanitization;
- crafting fails insufficient materials;
- crafting fails if inventory has no space;
- crafting success consumes exact vector and adds output.

`tests/crafting-save.test.ts`:

- save payload includes crafting;
- restore sanitizes bad material vector;
- unknown known recipe ids are dropped;
- known recipe duplicates collapse;
- old save version rejected by existing version logic.

## Acceptance

Run:

```bash
npm run typecheck
npm run test:unit
```

If full unit tests fail because another parallel branch owns missing data/UI contracts, run your new tests and state the integration blocker exactly.

Final notes must include:

- new save shape version;
- added event types;
- API functions implemented;
- atomicity test summary;
- checks run.
