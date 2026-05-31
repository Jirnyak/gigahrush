# kraft_1: материалы, составы и сбалансированные рецепты

> Параллельный агент 1. Делать первым вместе с другими агентами. Не ждать runtime/UI. Главная цель - дать всем item ids полноценный 9-компонентный состав и recipe definitions, на которые остальные агенты смогут опереться.

## Контекст

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
items.md
economics.md
balance.md
src/data/items.ts
src/data/weapons.ts
src/data/psi.ts
src/data/resources.ts
src/data/economics.ts
src/data/catalog.ts
tests/data-ids.test.ts
tests/content-registry.test.ts
```

## Ownership

Основные файлы:

```txt
src/data/craft_materials.ts
src/data/item_composition.ts
src/data/craft_recipes.ts
tests/crafting-data.test.ts
```

Разрешенный узкий touch:

```txt
src/data/catalog.ts
tests/data-ids.test.ts
```

Не трогать:

```txt
src/systems/crafting.ts
src/main.ts
src/render/*
src/systems/save_*.ts
```

## Deliverables

1. `src/data/craft_materials.ts`
   - export `CRAFT_MATERIAL_IDS`;
   - export material metadata: Russian name, short label, color, rarity, economy hints;
   - export helpers for empty vector, vector sum, validation, material index lookup.

2. `src/data/item_composition.ts`
   - export `ITEM_COMPOSITIONS: Record<string, CraftVector>`;
   - every `ITEMS` id must have exactly one composition;
   - no composition may have all zeroes;
   - no runtime formula from price during gameplay;
   - helper builders are allowed to keep the file maintainable.

3. `src/data/craft_recipes.ts`
   - export `CRAFT_RECIPES: Record<string, CraftRecipeDef>`;
   - recipe id format: `craft_item_<item_id>`;
   - every item should have a recipe unless there is a documented, tested exception;
   - default hidden until discovered, except starter/survival recipes if desired;
   - station choice derived from item role, not from display name.

4. `tests/crafting-data.test.ts`
   - all item ids have composition;
   - all composition vectors length 9;
   - all counts finite integer `>= 0`;
   - composition sum `>= 1`;
   - all recipes reference existing items;
   - all recipe ids are unique and stable;
   - recipe component vector equals item composition unless explicitly documented;
   - rare material usage is bounded and intentional.

5. `src/data/catalog.ts`
   - re-export craft registries if needed by other systems.

## Balance rules

Use this banding:

| Item band | Typical total |
| --- | ---: |
| trivial scrap / paper / bread | `1..2` |
| basic survival | `2..6` |
| early useful gear | `5..12` |
| mid weapons/tools | `12..35` |
| late energy/PSI/route tools | `35..90` |
| E4/unique/endgame | `90..180+` |

Material tendencies:

| Item kind | Materials |
| --- | --- |
| food, meat, zhelemish | `bio`, sometimes `consumables`, `chemical` |
| drink | `consumables`, sometimes `chemical` |
| medicine | `chemical + consumables`, sometimes `bio`, `psimatter` |
| documents/books/notes | `consumables`, sometimes `electronics` |
| keys/tags/small metal items | `metal`, `mechanics`, `consumables` |
| tools | `mechanics + metal`, powered tools add `electronics` |
| lamps/radios/detectors | `electronics + mechanics + consumables` |
| melee weapons | `metal + mechanics` |
| firearms | `metal + mechanics`, rare/smart adds `electronics` |
| ammo | `metal + chemical`, special ammo adds `electronics` or `bio` |
| explosives/charges | `chemical + metal + mechanics`, advanced adds `electronics` |
| samples/slime/body parts | `bio + chemical`, rare adds `psimatter` or `metamatter` |
| PSI items | `psimatter`, sometimes `bio`, `chemical`, `metamatter` |
| NET/cyber/robotic | `electronics + cybernetics + mechanics` |
| VOID/endgame | normal base plus `metamatter`, `psimatter`, `cybernetics` |

Do not let cheap common items contain `cybernetics`, `psimatter`, or `metamatter`. These rare materials should come from genuinely rare, dangerous, expensive, route-gated or quest-gated items.

## Recipe station rules

Suggested station:

```txt
workbench    - repair, ordinary tools, simple weapons, documents, survival utility
lathe        - metal/mechanics weapons, ammo, machine parts, serious tools
lab          - medicine, bio, chemical, slime, PSI, samples
net_terminal - cybernetics, NET, exotic electronics, some metamatter
any          - only trivial starter items
```

`CraftRecipeDef.tier`:

```txt
0 trivial/survival
1 early route
2 mid route
3 late route
4 endgame/rare
```

Use tags such as:

```txt
survival
weapon
tool
ammo
medicine
document
psi
cybernetics
metamatter
deep_route
unique
```

## Practical implementation hints

Prefer compact helpers:

```ts
const cv = (
  mechanics = 0,
  electronics = 0,
  consumables = 0,
  bio = 0,
  chemical = 0,
  metal = 0,
  cybernetics = 0,
  psimatter = 0,
  metamatter = 0,
): CraftVector => [mechanics, electronics, consumables, bio, chemical, metal, cybernetics, psimatter, metamatter];
```

It is acceptable to create local category helpers, but the final registry must be explicit and testable by item id. Do not compute the live composition from current price every time the game runs.

## Acceptance

Run:

```bash
npm run typecheck
npm run test:unit -- tests/crafting-data.test.ts
```

If the project test runner does not accept a single test path, run:

```bash
npm run test:unit
```

Final notes must include:

- total item ids covered;
- recipes generated;
- any documented recipe exceptions;
- top 10 highest component totals;
- every item that uses `metamatter`;
- checks run.
