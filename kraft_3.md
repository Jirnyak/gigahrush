# kraft_3: токарные станки, верстаки, декорации и интерактивы

> Параллельный агент 3. Сначала делает станки и верстаки видимыми world features/decor, потом навешивает interactive behavior. Не реализует сам UI и не балансирует все item recipes.

## Контекст

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
interactive.md
floors.md
src/data/interactive.ts
src/systems/interactive.ts
src/systems/interactions.ts
src/gen/interactive_placement.ts
src/gen/interactive_fixtures.ts
src/gen/living/expedition_prep.ts
src/gen/living/yakov_lab.ts
src/gen/maintenance/index.ts
src/gen/procedural_floor.ts
tests/interactive.test.ts
tests/procedural-workshops.test.ts
```

## Ownership

Основные файлы:

```txt
src/gen/craft_stations.ts
tests/craft-stations.test.ts
```

Разрешенный узкий touch:

```txt
src/data/interactive.ts
src/systems/interactive.ts
src/systems/interactions.ts
src/gen/interactive_placement.ts
src/gen/living/expedition_prep.ts
src/gen/living/yakov_lab.ts
src/gen/maintenance/index.ts
src/gen/procedural_floor.ts
tests/interactive.test.ts
```

Не трогать:

```txt
src/render/*
src/systems/save_*.ts
src/data/item_composition.ts
```

## Deliverables

1. New station definitions:

```txt
craft_lathe
disassembly_workbench
craft_lab_bench
recipe_billboard
```

Minimum required for first playable path:

- `craft_lathe`: opens craft mode;
- `disassembly_workbench`: opens disassembly mode.

2. Add generic interactive action kinds:

```ts
| 'open_craft_menu'
| 'open_disassembly_menu'
| 'learn_recipe'
```

If action dispatch requires callbacks, add generic hooks to `ContentInteractionContext` rather than importing UI code into `data/interactive.ts`.

3. Decor/feature-first placement:

- craft stations must exist visually as `Feature.MACHINE`, `Feature.TABLE`, or another existing primitive before the interaction is attached;
- use `placeInteractiveAt()` only after verifying the target cell is valid;
- do not add a new `Feature` enum unless existing `Feature.MACHINE`/`TABLE` cannot represent the object.

4. Safe LIVING placement:

Add one reachable `disassembly_workbench` and one reachable `craft_lathe` near the normal early-game path:

- preferred anchors: expedition prep, Yakov lab, Barni/armory-adjacent workshop;
- must not overwrite protected apartment content;
- must be connected to reachable floor/corridor;
- must not block lifts, hermetic doors or critical quest anchors.

5. Floor/procedural placement:

Weighted placement by room type:

| Room type | Lathe | Workbench | Lab bench | Recipe board |
| --- | ---: | ---: | ---: | ---: |
| `PRODUCTION` | high | high | low | medium |
| `STORAGE` | medium | high | low | low |
| `MEDICAL` | low | low | high | medium |
| `OFFICE` | low | low | low | high |
| `COMMON` | low | medium | none | medium |
| `HQ` | medium | medium | medium | high |

Caps:

```txt
LIVING authored safe pair: 2 total fixed
ordinary story floor: 1..4 stations
maintenance/production-heavy floor: 3..8 stations
procedural floor: 0..4 by danger/room availability
deep route special floor: rare exotic station only if authored/gated
```

No runtime refill. Placement happens at generation/rebuild time only.

6. Station persistence strategy:

Current explicit interactive registry is world-scoped/transient. Ensure station behavior is recoverable:

- either station cells are re-registered from deterministic placement on floor load;
- or station meaning can be lazily resolved from a feature/mark/tag;
- or floor memory keeps enough world primitive truth for rehydration.

Do not rely on WeakMap-only state as the only truth for a critical station.

## Integration contract for UI/runtime

When station interaction fires, it should call a generic hook or set a generic result:

```ts
openCraftMenu?.({ mode: 'craft', station: 'lathe', sourceInteractiveId })
openCraftMenu?.({ mode: 'disassemble', station: 'workbench', sourceInteractiveId })
```

Do not import `src/render/craft_ui.ts` into interactive systems.

## Tests

Add or update tests:

- `craft_lathe` and `disassembly_workbench` interactive ids exist;
- placement refuses blocked cells;
- LIVING generated world has reachable station pair;
- station placement does not write into `aptMask`;
- procedural placement respects caps;
- interaction result opens the expected generic mode/hook;
- station defs are referenced by content audit.

## Acceptance

Run:

```bash
npm run typecheck
npm run test:unit -- tests/interactive.test.ts
```

If the test runner cannot target a file:

```bash
npm run test:unit
```

Final notes must include:

- exact station ids added;
- where the first reachable lathe/workbench appears;
- placement caps;
- how station behavior survives floor memory/rebuild;
- checks run.
