# kraft_4: окно крафта, окно разбора, input и mobile path

> Параллельный агент 4. Делает canvas UI: меню крафта на токарном станке и меню разбора на верстаке. Не балансирует recipes и не пишет save logic.

## Контекст

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
mobile.md
src/render/stats_ui.ts
src/render/container_ui.ts
src/render/ui_layout.ts
src/render/hud.ts
src/render/ui_text.ts
src/render/item_sprites.ts
src/systems/controls.ts
src/systems/interactions.ts
src/main.ts
tests/ui-layout.test.ts
tests/ui-text.test.ts
```

## Ownership

Основные файлы:

```txt
src/render/craft_ui.ts
tests/craft-ui.test.ts
```

Разрешенный узкий touch:

```txt
src/render/ui_layout.ts
src/render/hud.ts
src/main.ts
src/systems/interactions.ts
src/systems/mobile_actions.ts
tests/ui-layout.test.ts
tests/ui-text.test.ts
```

Не трогать:

```txt
src/data/item_composition.ts
src/data/craft_recipes.ts
src/systems/save_*.ts
```

## UI target

Создать полноэкранное canvas меню:

```txt
left   - список известных рецептов или список предметов для разбора
center - выбранный item/recipe, описание, состав, недостающие компоненты
right  - 9 материалов игрока
bottom - control hints
```

Two modes:

```ts
type CraftMenuMode = 'craft' | 'disassemble';
```

Craft mode:

- opened by `craft_lathe`;
- lists known recipes only;
- craftable entries bright, missing-material entries dim;
- selecting a recipe shows output item, description, full vector, missing vector, station;
- `E` calls `craftKnownRecipe()`.

Disassemble mode:

- opened by `disassembly_workbench`;
- lists current player inventory;
- selecting item shows item composition and weighted possible material output;
- `E` calls `disassembleInventorySlot()`;
- after action, cursor remains valid if item stack disappears.

## State contract

Prefer minimal transient state fields:

```ts
showCraftMenu: boolean;
craftMode: 'craft' | 'disassemble';
craftCursor: number;
craftFilter: string;
craftStationKind: CraftStationKind;
```

If `kraft_2` already added a nested UI state, use it instead. Do not save UI state.

Close rules:

- game menu/back key closes craft menu;
- opening craft menu closes inventory/container/NPC/log/map overlays;
- floor transition, samosbor rebuild and death close craft menu;
- pointer lock behavior should match existing fullscreen menus.

## Rendering details

Use existing style:

- `drawNeuroPanel`, `drawGlitchText` from HUD style where useful;
- `fitText` / `fitTextStable` for all labels;
- `drawItemGridIcon()` for selected output/item;
- `controlHint()` and `controlBindingLabel()` for hints;
- monospace canvas text, no DOM.

Material panel must always show all 9:

```txt
МЕХ 000
ЭЛК 000
РАС 000
БИО 000
ХИМ 000
МЕТ 000
КИБ 000
ПСИ 000
МЕТА 000
```

Use material colors from `craft_materials.ts`. On mobile, text must fit without overlap.

## Input

Desktop:

- menu up/down moves list;
- left/right changes filter or switches columns only if implemented cleanly;
- `E` crafts/disassembles;
- game menu/back closes;
- inventory key may close if current menu was opened from inventory-style flow.

Mobile:

- context action maps to `E`;
- mobile close/back closes;
- do not create DOM controls;
- respect current joystick/menu rail behavior.

## Runtime calls

The UI should not mutate materials directly. It calls system functions:

```ts
craftMenuSnapshot(...)
craftKnownRecipe(...)
disassembleInventorySlot(...)
```

On action result:

- push returned message to `state.msgs`;
- do not separately duplicate material math;
- keep selection bounded.

## Tests

Add layout/unit tests for:

- craft layout fits 320x200 base, desktop widescreen and mobile portrait;
- 9 material labels fit;
- selected recipe missing material line fits;
- empty known recipe list renders fallback text;
- empty inventory in disassembly renders fallback text;
- cursor clamps after inventory shrinks.

If screenshot/browser smoke is available, final orchestrator will visually validate. This agent can run unit layout tests only.

## Acceptance

Run:

```bash
npm run typecheck
npm run test:unit -- tests/ui-layout.test.ts
```

If full typecheck depends on `kraft_2` runtime contract, document the missing symbols and keep the UI implementation aligned with `kraft_0.md`.

Final notes must include:

- menu state fields added;
- render function names;
- input hooks touched;
- mobile path behavior;
- checks run or blocker.
