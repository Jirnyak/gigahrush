# КРАФТ апдейт

> План технической реализации. Код пока не менять.
>
> Цель документа: подготовить большой крафт-апдейт так, чтобы он лег на текущую архитектуру ГИГАХРУЩА без частных веток в `main.ts`, без runtime-зависимостей, без сохранения старых save-shape и без мертвых item-составов.

## 0. Статус

Это planning-документ, не shipped facts. После реализации факты нужно перенести в `README.md`, `items.md`, `interactive.md`, `save.md` и, если появятся новые экономические ресурсы, в `economics.md`.

Текущая задача: не менять код, а подготовить реализационный план для будущего патча, где каждый item получает состав из 9 крафтовых компонентов, игрок разбирает предметы на станциях, учит рецепты и собирает известные предметы через отдельное меню.

Референс: Caves of Qud tinkering, но не копия. Берем принципы:

- компактные weightless материалы вне обычных слотов инвентаря;
- каждый предмет имеет схему/состав;
- разборка превращает предмет в craft bits;
- рецепты открываются через разборку, диски/записки, NPC, квесты и терминалы;
- меню показывает список известных рецептов и доступные материалы.

Ссылки для референса:

- https://wiki.cavesofqud.com/wiki/Bits
- https://wiki.cavesofqud.com/wiki/Tinkering
- https://wiki.cavesofqud.com/wiki/Data_disk

## 1. Главная модель

В игре появляется отдельный крафтовый слой:

1. У каждого `ItemDef` есть состав из 9 компонентов.
2. У игрока есть отдельный банк этих 9 компонентов, не занимающий слоты инвентаря.
3. Разборка предмета:
   - удаляет 1 штуку выбранного item из инвентаря;
   - выбирает 1 компонент случайно из состава предмета, с весом по количествам в составе;
   - добавляет этот компонент в банк игрока;
   - с вероятностью 50% изучает рецепт этого item, если рецепт еще не известен и он разрешен к изучению.
4. Крафт предмета:
   - доступен только по известному рецепту;
   - требует полный состав предмета;
   - атомарно списывает компоненты и добавляет item в инвентарь;
   - не списывает компоненты, если в инвентаре нет места.
5. Рецепты открываются:
   - при разборке;
   - через записки, чертежи, инструкции, квесты, NPC-диалоги, терминалы;
   - через authored route/floor content.
6. Мировые объекты для крафта и разборки создаются как feature-first interactive surfaces:
   - токарные/ремонтные станки для крафта;
   - верстаки для разборки;
   - доски/билборды/терминалы для подсказок и recipe unlock.

Крафт не заменяет текущую production system. Production остается floor/room/factory экономикой с cadence, ресурсами, контейнерами и работниками. Crafting - player-facing быстрый слой на 9 компонентах.

## 2. Девять компонентов

Порядок должен быть фиксирован во всех data, save, UI и тестах:

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

Игровые русские названия:

| Id | UI имя | Область | Примеры |
| --- | --- | --- | --- |
| `mechanics` | Механика | универсальное | пружины, шестерни, шурупы, подшипники, затворы |
| `electronics` | Электроника | универсальное | проводка, платы, конденсаторы, батареи, лампы |
| `consumables` | Расходники | универсальное | клей, скотч, краска, бумага, ткань, упаковка |
| `bio` | Био | предметная специфика | ткани, кости, шкуры, мясо, плесень, пробы |
| `chemical` | Хим | предметная специфика | кислоты, щелочи, реагенты, взрывчатка, топливо |
| `metal` | Металл | предметная специфика | сталь, арматура, корпус, кристаллы, рельсы |
| `cybernetics` | Кибернетика | редкое | хайтек, ИИ-ядра, чипы, роботные узлы |
| `psimatter` | Псиматерия | редкое | сгустки, артефакты, идолы, ПСИ-пыль |
| `metamatter` | Метаматерия | редкое | экзотические материалы, структуры, ДАННЫЕ УДАЛЕНЫ |

`metamatter` должен быть настоящим E4/endgame материалом, а не еще одним дорогим металлом. Источники: глубокие route floors, аномалии, VOID/Hell, уникальные разборки, поздние квесты, опасные терминалы.

## 3. Data ownership

Не расширять `ItemType`. Текущий `ItemType` грубый и правильный для проекта. Состав предметов должен жить в data-registry, не в runtime `Item.data`.

Причина: `Item` сейчас является compact stack:

```ts
interface Item {
  defId: string;
  count: number;
  data?: unknown;
}
```

`data` уже используется для durability, note text and special state. Состав у всех предметов должен быть definition-level data, иначе ломается stacking, save size and audit.

Новые data-модули:

```txt
src/data/craft_materials.ts
src/data/item_composition.ts
src/data/craft_recipes.ts
src/data/craft_recipe_sources.ts
```

Предлагаемая форма:

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

export interface CraftMaterialDef {
  id: CraftMaterialId;
  name: string;
  shortName: string;
  rarity: 'common' | 'specific' | 'rare';
  color: string;
  economyHints: readonly string[];
}

export interface ItemCompositionDef {
  itemId: string;
  components: CraftVector;
  craftable?: boolean;
  discoverable?: boolean;
  station?: 'any' | 'workbench' | 'lathe' | 'lab' | 'net_terminal';
  recipeTier?: 0 | 1 | 2 | 3 | 4;
  tags?: readonly string[];
}
```

Главный registry:

```ts
export const ITEM_COMPOSITIONS: Record<string, CraftVector>;
```

Вторичный recipe registry можно делать derivation layer поверх `ITEM_COMPOSITIONS`, чтобы не дублировать состав:

```ts
export interface CraftRecipeDef {
  id: string;
  itemId: string;
  resultCount: number;
  components: CraftVector;
  station: CraftStationKind;
  discoverable: boolean;
  knownByDefault: boolean;
  tags: readonly string[];
}
```

Recipe id должен быть стабильным string id:

```txt
craft_item_<item_id>
```

Не использовать голые числовые ids вроде `11` или `139`. Если нужны legacy/design номера рецептов, кодировать их как tags or aliases, например `craft_num_011`, но authoritative id должен быть item-based.

## 4. Состав всех предметов

Текущий registry содержит 434 item id. Все они должны получить состав. Нельзя оставлять "потом дополним" без audit failure.

Правило:

- каждый `ITEMS[id]` имеет ровно 9 чисел;
- все числа целые, finite, `>= 0`;
- сумма состава `>= 1`;
- сумма состава обычно растет вместе с ценностью, сложностью и route tier, но не выводится только из `value`;
- дорогой предмет может иметь сумму 11, 39, 139 или больше, если это понятно по gameplay;
- простейший предмет может иметь сумму 1.

Примеры направляющих правил:

| Тип item | Типичный состав |
| --- | --- |
| хлеб, еда, желемыш | `bio`, иногда `consumables`, иногда `chemical` для зараженного/экспериментального |
| вода, чай, компот | `consumables` или `chemical`, иногда `bio` |
| медицина | `chemical + consumables`, для органики `bio`, для ПСИ `psimatter` |
| бумага, записки, документы | `consumables`, иногда `electronics` for terminal/stamp papers |
| ключи, бирки, мелочь | `metal` or `consumables`, sometimes `mechanics` |
| инструменты | `mechanics + metal`, with `electronics` for powered tools |
| лампы, радио, детекторы | `electronics + mechanics + consumables` |
| melee weapon | `metal + mechanics`, sometimes `bio`/`chemical` for special |
| firearms | `metal + mechanics`, ammo tools; `electronics` for energy/smart |
| ammo | `metal + chemical`, sometimes `consumables` |
| grenades/charges | `chemical + metal + mechanics`, rare devices add `electronics` |
| samples/slime/body parts | `bio + chemical`, rare samples add `psimatter` or `metamatter` |
| PSI items | `psimatter`, sometimes `bio`, `chemical`, `metamatter` |
| high-tech/NET/robots | `electronics + cybernetics + mechanics`, sometimes `metamatter` |
| unique endgame items | normal base plus `psimatter`, `cybernetics`, `metamatter` as gate |

Composition is not resource mapping. Existing `src/data/resources.ts` remains scarcity/trade/economy language. Craft composition is a separate 9-component player-facing language.

## 5. Начальная баланс-линейка

Use item value, tags, weapon tier and route source as hints, not as a runtime formula.

Suggested total component count:

| Band | Item value / role | Total composition |
| --- | --- | ---: |
| trash/simple | paper, bread, bottle, scrap | `1..2` |
| survival | water, bandage, simple ammo, basic tools | `2..6` |
| early gear | pistol, useful tool, simple quest item | `5..12` |
| mid gear | rifle, shotgun, detector, production part | `12..35` |
| late gear | energy weapon, rare PSI, route device | `35..90` |
| E4/unique | GBE/BFG/VOID/Creator-tier artifacts | `90..180+` |

Important: disassembly returns only 1 component. Therefore high-cost item crafting is intentionally lossy when used as salvage. This creates a sink and prevents infinite item-to-components-to-item loops.

Recipe cost examples:

```txt
toiletpaper:              consumables 1
pipe:                     metal 2, mechanics 1
duct_tape:                consumables 2, chemical 1
circuit_board:            electronics 4, consumables 1
flashlight:               electronics 3, mechanics 1, consumables 1, metal 1
ammo_9mm:                 metal 1, chemical 1
breach_charge:            chemical 6, mechanics 2, metal 2, electronics 1
psi_dust:                 psimatter 3, bio 1
gravity_beam_emitter:     electronics 35, cybernetics 22, mechanics 14, metal 20, psimatter 18, metamatter 30
```

Numbers above are examples, not exact implementation data.

## 6. Runtime system

New system:

```txt
src/systems/crafting.ts
```

Responsibilities:

- initialize player craft state;
- serialize/sanitize craft state;
- add/remove materials;
- learn recipes;
- disassemble one inventory item;
- craft one recipe atomically;
- provide UI snapshots;
- publish compact events.

No per-frame updates. Crafting runs only on direct user action or when building a menu snapshot.

Suggested runtime shape:

```ts
export interface CraftingState {
  materials: CraftVectorMutable;
  knownRecipes: Record<string, true>;
  learnedCount: number;
  lastChangedAt: number;
}
```

Use a 9-slot numeric array internally for speed and compact save. UI can map ids through `CRAFT_MATERIAL_IDS`.

Core functions:

```ts
createCraftingState(): CraftingState
craftingForSave(state: GameState): CraftingSavePayload
restoreCraftingState(input: unknown): CraftingState
craftMaterialCount(state, materialId): number
addCraftMaterial(state, materialId, count): void
learnCraftRecipe(state, recipeId, source): boolean
knownCraftRecipes(state): CraftRecipeDef[]
canCraftRecipe(actor, state, recipeId): CraftCheck
craftRecipe(actor, state, recipeId, ctx): CraftResult
disassembleInventorySlot(actor, state, slotIdx, ctx): DisassemblyResult
craftMenuSnapshot(actor, state, mode, cursor): CraftMenuSnapshot
```

Disassembly algorithm:

```txt
1. Resolve inventory slot.
2. Resolve item composition.
3. If item missing or composition missing, fail with message and no mutation.
4. Choose one material using weighted random over component counts.
5. Remove exactly one item from inventory.
6. Add one selected material.
7. Roll recipe learn chance: 50%.
8. If learned, add recipe id to knownRecipes.
9. Publish event and message.
```

Craft algorithm:

```txt
1. Resolve recipe and known state.
2. Check station kind.
3. Check material counts.
4. Check inventory capacity with existing canAddItem().
5. If any check fails, do not mutate.
6. Subtract component counts.
7. Add result item/result count.
8. Publish event and message.
```

Use existing inventory helpers:

- `addItem()`
- `removeItem()`
- `canAddItem()`

Do not manually splice inventory in the crafting system except through shared helper behavior.

## 7. Save/load

Crafting needs persistent state:

- material counts;
- known recipes;
- maybe recipe source facts later.

This is a save shape change. Implementation should bump `SAVE_SHAPE_VERSION` from current value to the next value and reject stale saves. No migration scaffolding by default.

Save location:

```txt
src/systems/save_runtime.ts
src/systems/save_payload.ts
src/systems/crafting.ts
save.md
tests/save-runtime.test.ts
```

Recommended save payload:

```ts
interface CraftingSavePayload {
  materials: CraftVector;
  knownRecipes: string[];
}
```

Sanitization:

- `materials.length` must become exactly 9;
- missing values become `0`;
- values clamp to `0..999_999`;
- fractional values floor;
- unknown recipe ids are dropped;
- known recipe array capped to current item/recipe count;
- duplicate recipe ids collapse to one;
- malformed section restores empty crafting state, not crash.

The save payload must not include all recipe definitions. Save ids and compact counts only.

## 8. Interactive stations

Use the existing interactive layer. Current system already has:

- `src/data/interactive.ts`
- `src/systems/interactive.ts`
- `src/gen/interactive_placement.ts`
- `src/gen/interactive_fixtures.ts`
- `workbench_basic`
- lazy sink/toilet/container adapters

Add station definitions:

```txt
craft_lathe
disassembly_workbench
recipe_billboard
recipe_terminal_adapter
```

Suggested definitions:

| Id | Visual | Purpose |
| --- | --- | --- |
| `craft_lathe` | `Feature.MACHINE` | opens craft menu in craft mode |
| `disassembly_workbench` | `Feature.MACHINE` or `Feature.TABLE` | opens craft menu in disassembly mode |
| `recipe_billboard` | billboard | reads local recipe hint or unlocks one recipe |
| `recipe_terminal_adapter` | computer/terminal adapter | unlocks recipe set through terminal content |

`InteractiveActionKind` likely needs new generic actions:

```ts
| 'open_craft_menu'
| 'open_disassembly_menu'
| 'learn_recipe'
```

Keep the action generic. Do not hardcode one floor or one station in `systems/interactions.ts`.

Important persistence detail:

The current explicit interactive registry is world-scoped and transient. Craft stations that must survive packed floor memory should be recoverable from actual world primitives. Do not rely on a WeakMap-only instance as the sole truth for an important station.

Implementation options:

1. Prefer feature-backed lazy station resolution for `Feature.MACHINE` when the room/generator marks it as a craft station.
2. If explicit placement is used, rehydrate station overlays on floor activation from deterministic generator metadata.
3. If a new primitive is truly needed, add the smallest generic marker, not a new feature enum for every station variant.

## 9. Station placement

First pass must provide a reachable path from the starting game.

Minimum authored placement:

- LIVING: one safe disassembly workbench and one craft lathe near Yakov/expedition prep/armory path.
- Maintenance: higher density in `RoomType.PRODUCTION` and storage rooms.
- Kvartiry: rare household workbench, mostly disassembly.
- Ministry: recipe boards, document/blueprint unlocks, little direct crafting.
- Hell/Void/deep design floors: rare exotic stations for `psimatter` and `metamatter`.

Procedural placement:

- use room type weights;
- production/storage rooms are primary station targets;
- office/common rooms can host recipe boards;
- do not place many stations in one room;
- do not overwrite `aptMask`, hermetic walls, lifts, protected rooms;
- use existing placement helpers and feature-first rules;
- cap per floor, for example `0..4` stations depending on floor role/danger.

No periodic runtime spawner. Stations are generation-time world content or authored route content.

## 10. Craft menu

New render file:

```txt
src/render/craft_ui.ts
```

Potential layout helper:

```txt
src/render/ui_layout.ts
```

State fields in `GameState` can be transient UI fields, similar to inventory/container:

```ts
showCraftMenu: boolean;
craftMode: 'craft' | 'disassemble';
craftCursor: number;
craftFilter: CraftRecipeFilter;
craftStationKind?: CraftStationKind;
```

These UI fields should not be saved.

Menu shape:

```txt
left: known recipe list or disassembly inventory list
center: selected item details, result, missing components, station notes
right: 9 material counters
bottom: control hints
```

Craft mode:

- list known recipes;
- unavailable recipes stay visible but dimmed if missing components;
- hidden unknown recipes are not listed by default;
- optional category filters: all, survival, weapon, tool, medicine, ammo, documents, rare;
- selected recipe shows full composition and missing counts;
- `E` crafts one result if possible.

Disassembly mode:

- list player inventory;
- selected item shows composition;
- selected item shows possible output pool: one random component from its composition;
- `E` disassembles one item;
- message reports gained material and recipe learn result.

Right material panel:

```txt
МЕХ 12
ЭЛК 4
РАС 33
БИО 7
ХИМ 5
МЕТ 28
КИБ 0
ПСИ 2
МЕТА 0
```

Use colors and short names. Text must fit mobile and desktop. Follow existing canvas UI, `fitText`, `controlHint`, `controlBindingLabel`, and no DOM UI.

Input:

- existing menu navigation: up/down/left/right;
- `E`: craft/disassemble/confirm;
- game menu key: close;
- inventory key can close if menu opened from inventory-style flow;
- mobile context button maps to `E`.

## 11. Recipe discovery

Recipes can be discovered through several bounded systems.

Disassembly:

- 50% chance on each disassembly;
- no duplicate entries;
- if recipe already known, only material is gained;
- recipe learn should be evented and messaged.

Documents and notes:

- use existing document/item language, not Russian display-name matching;
- recipe documents should be item ids or compact item data with recipe id;
- tags: `recipe`, `blueprint`, `instruction`, `crafting`, tier tags;
- using a recipe document should call `learnCraftRecipe()`.

Existing candidates:

- `blueprint_t1_folder`
- `blueprint_t2_folder`
- `blueprint_t3_folder`
- `weapon_blueprint_t2`
- `homemade_ammo_instruction`
- `frozen_item_shard`
- production/factory recipe unlock tags

Future scalable source:

```ts
interface CraftRecipeSourceDef {
  id: string;
  kind: 'item' | 'note' | 'quest' | 'terminal' | 'npc' | 'floor';
  recipeIds: readonly string[];
  itemId?: string;
  questId?: string;
  terminalId?: string;
  floorId?: string;
  text: string;
}
```

Quests:

- quest completion can unlock recipes as extra reward;
- quest event data should store recipe ids, not display names;
- recipe unlock should publish an event so rumors/log/context can reference it.

Terminals/computers:

- recipe terminal can unlock a filtered set: local floor, station type, faction, tier;
- use existing computer/NET overlay patterns;
- no network dependency for local crafting.

NPCs:

- NPC options can teach recipes by occupation/faction: mechanic, scientist, liquidator, market trader;
- no ordinary refill or hardcoded quest NPC branch;
- persistent NPC death should matter if that NPC was the source.

## 12. Events and public facts

Add compact event types only if needed:

```txt
player_disassemble_item
player_craft_item
craft_recipe_learned
```

Event payload should be small:

```ts
{
  itemId,
  recipeId,
  materialId,
  materialCount,
  stationId,
  stationKind,
  source
}
```

Tags:

```txt
crafting
disassembly
recipe
workbench
lathe
material_<id>
item_type_<type>
tier_<n>
```

Event kind can map to `production` or `quest_hook` in `systems/events.ts`, depending on event type.

Do not log every UI cursor movement. Only actual craft, disassembly and recipe unlock.

## 13. Economy connection

Do not replace current `RESOURCES` immediately.

Current economy resources are still useful:

- prices and scarcity;
- production;
- trade;
- contracts;
- factory inputs.

Craft components are a new player-facing abstraction. Mapping can be one-way for the first implementation:

```txt
item -> craft composition
item -> existing economy resource, unchanged
```

Later optional bridge:

- `mechanics` can influence `tools`;
- `electronics` maps to current `electronics`;
- `chemical` may justify a new economy resource only if enough systems need independent scarcity;
- `cybernetics` and `metamatter` should not become broad normal resources until there are real sources, sinks, quests and tests.

For expensive recipes:

- E3/E4 recipes need rare components plus access, not price alone;
- `cybernetics`, `psimatter`, `metamatter` should be gated by route depth, faction access, dangerous teardown, quest source or terminal risk;
- unique outputs should use `maxOutputItemCount`-like semantics in craft recipe data;
- no public container should casually output `metamatter`.

## 14. Samosbor behavior

Player craft state survives samosbor because it is player/run state:

- materials persist;
- known recipes persist;
- current open craft menu closes during samosbor rebuild/floor transition;
- stations may be destroyed, blocked or regenerated as part of world mutation;
- post-samosbor loot can include recipe documents or rare teardown items.

Samosbor must not refill materials or replace destroyed stations by runtime timer. If a floor regrows station geometry, it comes from generator/rebuild content.

## 15. A-Life and NPC boundaries

First pass is player-facing. Do not give every A-Life NPC a material bank.

Allowed NPC interactions:

- authored NPC teaches recipe;
- trader sells recipe document;
- quest giver rewards recipe;
- dead NPC can drop a recipe item;
- mechanic/scientist occupation can influence recipe source.

Not allowed in first pass:

- off-floor NPC crafting simulation;
- per-frame NPC scanning for craft materials;
- population refill because "crafters need stock";
- full NPC inventories converted to material banks in save.

If NPC crafting is added later, it needs its own bounded design and save/storage cap.

## 16. Tests and audits

Data tests:

```txt
tests/crafting-data.test.ts
```

Must assert:

- all `ITEMS` ids have composition;
- all composition vectors have length 9;
- all values are finite integers `>= 0`;
- each composition sum is `>= 1`;
- no composition references missing material ids;
- every craft recipe references existing item id;
- all known-by-default recipe ids exist;
- every recipe source references existing recipes and source ids.

Runtime tests:

```txt
tests/crafting-runtime.test.ts
```

Must assert:

- disassembly removes one item and adds exactly one weighted material;
- 50% recipe learn works with deterministic RNG stub;
- known recipe is not duplicated;
- crafting fails without components;
- crafting fails without inventory space;
- crafting success is atomic and consumes exact components;
- result stack behavior matches existing inventory helpers.

Save tests:

```txt
tests/crafting-save.test.ts
tests/save-runtime.test.ts
```

Must assert:

- save shape version bump rejects old shape;
- material counts sanitize and clamp;
- unknown recipe ids drop;
- known recipe cap works;
- malformed crafting section restores safe empty state.

UI/layout tests:

```txt
tests/ui-layout.test.ts
tests/ui-text.test.ts
```

Add coverage for craft menu layout if new helper is added.

Content audit:

`scripts/content-audit.mjs` should learn the new registries:

- duplicate material ids;
- duplicate recipe ids;
- missing item composition entries;
- recipe source references;
- interactive station ids.

Validation by patch phase:

- data-only composition pass: `npm run typecheck`, prefer `npm run check:readonly`;
- runtime/save/interactions/UI: `npm run check`;
- browser/UI/menu changes: `npm run check:browser` or `npm run check:full` when Chrome is available.

## 17. Implementation phases

### Phase 0 - Planning only

Create `kraft.md`. No source changes.

### Phase 1 - Data foundation

Files:

```txt
src/data/craft_materials.ts
src/data/item_composition.ts
src/data/craft_recipes.ts
src/data/catalog.ts
tests/crafting-data.test.ts
scripts/content-audit.mjs
```

Work:

- define 9 material ids and UI metadata;
- add composition for all current item ids;
- derive basic craft recipes from item composition;
- add audit/test coverage;
- no gameplay mutation yet;
- no save shape change unless runtime state is introduced in the same patch.

Reachability:

- none needed yet because data-only;
- audit proves all items are ready for future disassembly/craft.

### Phase 2 - Crafting runtime state

Files:

```txt
src/systems/crafting.ts
src/core/types.ts
src/systems/save_runtime.ts
src/systems/save_payload.ts
save.md
tests/crafting-runtime.test.ts
tests/crafting-save.test.ts
```

Work:

- add player/run crafting state;
- add material bank;
- add known recipe set;
- add serializers/sanitizers;
- bump save shape;
- add deterministic tests.

No UI yet. Debug helper can expose a snapshot if needed.

### Phase 3 - Disassembly path

Files:

```txt
src/data/interactive.ts
src/systems/interactive.ts
src/systems/crafting.ts
src/systems/interactions.ts
src/gen/interactive_placement.ts
tests/interactive.test.ts
tests/crafting-runtime.test.ts
```

Work:

- add `disassembly_workbench`;
- open disassembly menu or simple first UI action;
- disassemble selected inventory item;
- gain one random material;
- 50% learn recipe;
- publish events.

Reachability:

- place one safe workbench in LIVING;
- add at least one production/storage placement path.

### Phase 4 - Craft menu and craft path

Files:

```txt
src/render/craft_ui.ts
src/render/ui_layout.ts
src/render/hud.ts
src/main.ts
src/systems/crafting.ts
src/data/interactive.ts
tests/ui-layout.test.ts
```

Work:

- canvas craft menu;
- list known recipes;
- right panel with 9 materials;
- station filter;
- craft action;
- input and mobile context integration.

Keep `main.ts` edits minimal: only transient UI state and dispatch, not item-specific logic.

### Phase 5 - Recipe sources

Files:

```txt
src/data/craft_recipe_sources.ts
src/systems/crafting.ts
src/systems/inventory.ts
src/systems/quests.ts
src/systems/computers.ts
src/data/items.ts
src/data/notes.ts
src/data/plot.ts
```

Work:

- recipe documents and instructions;
- quest rewards that unlock recipes;
- terminal unlocks;
- NPC teaching hooks;
- player-facing Russian text;
- recipe source events.

Run localization audit/report if broad text is added.

### Phase 6 - Balance and integration pass

Files:

```txt
README.md
items.md
interactive.md
economics.md
save.md
tests/economics-rework.test.ts
tests/content-registry.test.ts
tests/data-ids.test.ts
```

Work:

- tune component totals against item values and route depth;
- prevent early high-tech printing;
- ensure rare materials have real sources;
- update docs only for shipped behavior;
- browser validate UI.

## 18. Six-subagent work split

For the actual implementation, split into six non-overlapping workstreams:

### Agent 1 - Item composition data

Ownership:

```txt
src/data/craft_materials.ts
src/data/item_composition.ts
tests/crafting-data.test.ts
```

Task:

- define material order;
- assign composition to all current item ids;
- add data validation.

### Agent 2 - Runtime and save

Ownership:

```txt
src/systems/crafting.ts
src/systems/save_runtime.ts
src/systems/save_payload.ts
tests/crafting-runtime.test.ts
tests/crafting-save.test.ts
save.md
```

Task:

- player material bank;
- known recipes;
- atomic craft/disassembly helpers;
- save shape bump and sanitization.

### Agent 3 - Interactive stations and generation

Ownership:

```txt
src/data/interactive.ts
src/systems/interactive.ts
src/gen/interactive_placement.ts
src/gen/living/*
tests/interactive.test.ts
```

Task:

- station definitions;
- safe LIVING reachability;
- sparse production/storage placement;
- station rehydration strategy.

### Agent 4 - Craft UI and input

Ownership:

```txt
src/render/craft_ui.ts
src/render/ui_layout.ts
src/render/hud.ts
src/main.ts
tests/ui-layout.test.ts
```

Task:

- menu layout;
- known recipe list;
- material side panel;
- disassembly inventory mode;
- controls and mobile path.

### Agent 5 - Recipe discovery content

Ownership:

```txt
src/data/craft_recipe_sources.ts
src/data/items.ts
src/data/notes.ts
src/data/plot.ts
src/systems/inventory.ts
src/systems/quests.ts
```

Task:

- recipe documents;
- quest/terminal/NPC unlocks;
- Russian text and event hooks.

### Agent 6 - Economy, audits, docs

Ownership:

```txt
src/data/resources.ts
src/data/economics.ts
scripts/content-audit.mjs
tests/data-ids.test.ts
tests/content-registry.test.ts
README.md
items.md
interactive.md
economics.md
```

Task:

- balance bands;
- rare material source/sink audit;
- content audit extension;
- shipped documentation after implementation.

Rules for all agents:

- no edits to unrelated dirty files;
- no code-specific gameplay in `main.ts`;
- no new runtime dependencies;
- no new `FloorLevel`;
- no per-frame scans;
- no save migration;
- every source change gets tests or an explicit reason.

## 19. Risks and decisions

### Risk: composition as runtime item data

Do not do this. It bloats saves, breaks stacking, and duplicates definitions.

Decision: composition is data registry keyed by `defId`.

### Risk: current production system overlap

Factories already have recipes, resources, cadence and containers. Player craft should not rewrite them.

Decision: keep production and crafting separate. Bridge later only where useful.

### Risk: weak interactive station persistence

Current explicit interactive surfaces are transient. Craft stations must remain recoverable after floor memory packing/restoration.

Decision: station truth must be in generated world primitive or deterministic rehydration path, not WeakMap-only state.

### Risk: early rare material exploit

If cheap items can produce rare components, player can farm top recipes.

Decision: rare components appear only in item compositions where the item itself is rare, dangerous, expensive or route-gated.

### Risk: recipe list explosion

434 item ids can become a huge menu.

Decision: show only known recipes, sort by category/tier/craftable, add filters, keep unknown recipes hidden until discovered.

### Risk: expensive recipe economy broken by disassembly

Disassembly gives only 1 component from any item. This is intentionally lossy.

Decision: no multi-component refund in first pass. Better tools can be future upgrades only after balance.

## 20. Definition of done for the future update

The craft update is complete when:

- every item has a valid 9-component composition;
- player has saved material bank and known recipe set;
- at least one disassembly station is reachable from normal play;
- at least one craft station is reachable from normal play;
- disassembly gives exactly one weighted component and 50% recipe learn chance;
- craft menu lists known recipes and 9 material counts;
- recipe unlock works from at least disassembly and one world source;
- expensive recipes require rare components with real sources;
- samosbor/floor transition does not lose materials or recipes;
- tests cover data, runtime, save and UI layout;
- `npm run check` passes;
- browser validation passes for canvas UI changes when Chrome is available;
- shipped docs are updated only after implementation.
