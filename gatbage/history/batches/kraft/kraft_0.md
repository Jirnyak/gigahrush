# kraft_0: индекс параллельного КРАФТ апдейта

> Запускать первым. Это индекс и общий контракт для шести параллельных GPT-5.5 кодовых агентов. Последним после них запускается `kraft_7.md` - оркестратор.

## Цель волны

Имплементировать player-facing крафт в стиле Caves of Qud, но по архитектуре ГИГАХРУЩА:

- 9 постоянных крафтовых материалов у игрока, вне обычных слотов инвентаря.
- Каждый item имеет сбалансированный состав из 9 материалов.
- Известные рецепты игрока сохраняются в save.
- Разборка предмета на верстаке дает 1 случайный материал из состава и 50% шанс выучить рецепт.
- Крафт на токарном/ремонтном станке списывает полный состав и создает item.
- Рецепты открываются через разборку, записки, чертежи, квесты, NPC и терминалы.
- Станки и верстаки сначала существуют как декорации/feature в мире, затем на них навешивается interactive behavior.

## Общая обязательная разведка

Каждый агент перед кодом читает:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
items.md
interactive.md
save.md
tests.md
```

Дополнительно по задаче:

- экономика/рецепты: `economics.md`, `balance.md`, `src/data/resources.ts`, `src/data/factories.ts`, `src/data/economics.ts`;
- UI/input: `mobile.md`, `src/render/stats_ui.ts`, `src/render/container_ui.ts`, `src/render/ui_layout.ts`, `src/main.ts`, `src/input.ts`;
- интерактивы/генерация: `interactive.md`, `floors.md`, `src/data/interactive.ts`, `src/systems/interactive.ts`, `src/gen/interactive_placement.ts`;
- save/runtime: `save.md`, `src/systems/save_runtime.ts`, `src/systems/save_payload.ts`.

Перед изменениями каждый агент обязан выполнить:

```bash
git status --short
```

Рабочее дерево уже может быть грязным. Не откатывать чужие изменения.

## Материалы

Единый порядок во всех задачах:

```txt
0 mechanics
1 electronics
2 consumables
3 bio
4 chemical
5 metal
6 cybernetics
7 psimatter
8 metamatter
```

UI labels:

```txt
МЕХ, ЭЛК, РАС, БИО, ХИМ, МЕТ, КИБ, ПСИ, МЕТА
```

## Общий API-контракт

Агенты должны сходиться на этих именах. Если нужен другой shape, изменить его должен только оркестратор в `kraft_7.md`.

```ts
export const CRAFT_MATERIAL_IDS = [
  'mechanics',
  'electronics',
  'consumables',
  'bio',
  'chemical',
  'metal',
  'cybernetics',
  'psimatter',
  'metamatter',
] as const;

export type CraftMaterialId = typeof CRAFT_MATERIAL_IDS[number];
export type CraftVector = readonly [number, number, number, number, number, number, number, number, number];
export type MutableCraftVector = [number, number, number, number, number, number, number, number, number];

export type CraftStationKind = 'any' | 'workbench' | 'lathe' | 'lab' | 'net_terminal';

export interface CraftRecipeDef {
  id: string;
  itemId: string;
  resultCount: number;
  components: CraftVector;
  station: CraftStationKind;
  discoverable: boolean;
  knownByDefault: boolean;
  tier: 0 | 1 | 2 | 3 | 4;
  tags: readonly string[];
}
```

Runtime contract:

```ts
export interface CraftingState {
  materials: MutableCraftVector;
  knownRecipes: Record<string, true>;
  learnedCount: number;
  lastChangedAt: number;
}

export function ensureCraftingState(state: GameState): CraftingState;
export function learnCraftRecipe(state: GameState, recipeId: string, source?: string): boolean;
export function disassembleInventorySlot(ctx: CraftingActionContext): CraftingActionResult;
export function craftKnownRecipe(ctx: CraftingActionContext): CraftingActionResult;
export function craftMenuSnapshot(ctx: CraftMenuSnapshotContext): CraftMenuSnapshot;
```

Event types expected by all tasks:

```txt
player_disassemble_item
player_craft_item
craft_recipe_learned
```

## Parallel launch order

Run these six in parallel:

```txt
kraft_1.md - data/materials/compositions/balanced recipes
kraft_2.md - runtime crafting state, save/load, atomic actions
kraft_3.md - station decor, world generation, interactive station wiring
kraft_4.md - craft/disassembly canvas UI, input, mobile path
kraft_5.md - recipe discovery from items, notes, quests, NPCs, terminals
kraft_6.md - audits, validation tests, economy/docs integration
```

Run this only after the six above have finished:

```txt
kraft_7.md - orchestrator/integrator
```

## Ownership summary

| Task | Primary ownership | Notes |
| --- | --- | --- |
| `kraft_1` | `src/data/craft_*`, `tests/crafting-data.test.ts` | owns all item compositions and recipe definitions |
| `kraft_2` | `src/systems/crafting.ts`, save runtime/payload, save tests | owns persistent state and action atomicity |
| `kraft_3` | interactive station defs, station placement helpers, station tests | owns world reachability of lathe/workbench |
| `kraft_4` | `src/render/craft_ui.ts`, UI layout/input hooks | owns player menu |
| `kraft_5` | recipe source defs and unlock hooks | owns non-disassembly recipe knowledge |
| `kraft_6` | content audit, integration tests, docs after shipped behavior | owns validation coverage |
| `kraft_7` | conflict resolution and final gate | may touch any file after reviewing all branches |

Some red/yellow files are necessarily touched by more than one branch, especially `src/core/types.ts`, `src/main.ts`, `src/render/hud.ts`, `src/data/interactive.ts`, `scripts/content-audit.mjs`. Agents should keep those edits minimal and localized. Orchestrator resolves overlap.

## Global implementation rules

- Do not add dependencies.
- Do not add a new `FloorLevel`.
- Do not use `Item.data` for item composition.
- Do not make crafting a production-system replacement.
- Do not run per-frame scans for crafting.
- Do not refill NPCs or stations at runtime.
- Do not put content-specific item logic in `main.ts`, `core/world.ts`, `render/webgl.ts`, or broad AI.
- Save change must bump `SAVE_SHAPE_VERSION`; no migration code.
- Russian player-facing strings are canonical.

## Expected validation

Minimum final gate for the orchestrator:

```bash
npm run check
```

Because this adds canvas UI and interactive gameplay, final browser gate should also run when Chrome is available:

```bash
npm run check:browser
```

Individual agents should run the narrowest relevant tests they can. If a branch cannot pass full typecheck until the orchestrator merges neighboring contracts, it must say exactly why in its final notes.
