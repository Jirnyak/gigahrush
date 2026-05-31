# kraft_6: audits, validation, economy integration and shipped docs

> Параллельный агент 6. Делает защитную сетку: content audit, data-id checks, balance assertions, docs prepared for shipped behavior. Может писать tests that initially fail until other branches are merged; финально их доводит оркестратор.

## Контекст

Прочитать:

```txt
AGENTS.md
README.md
architecture.md
kraft.md
kraft_0.md
items.md
interactive.md
economics.md
balance.md
save.md
tests.md
scripts/content-audit.mjs
tests/data-ids.test.ts
tests/content-registry.test.ts
tests/economics-rework.test.ts
```

## Ownership

Основные файлы:

```txt
tests/crafting-integration.test.ts
tests/crafting-balance.test.ts
```

Разрешенный узкий touch:

```txt
scripts/content-audit.mjs
tests/data-ids.test.ts
tests/content-registry.test.ts
tests/economics-rework.test.ts
README.md
items.md
interactive.md
economics.md
save.md
```

Не трогать:

```txt
src/render/*
src/main.ts
src/systems/crafting.ts
src/data/item_composition.ts
```

## Deliverables

1. Content audit extension:

`scripts/content-audit.mjs` should detect:

- duplicate craft material ids;
- missing item composition ids;
- composition ids not in `ITEMS`;
- malformed material vector literals where statically visible;
- duplicate craft recipe ids;
- recipe item id missing;
- recipe source references missing recipe id;
- interactive station ids missing.

2. Data-id tests:

Extend `tests/data-ids.test.ts` or add `tests/crafting-integration.test.ts`:

- `CRAFT_MATERIAL_IDS.length === 9`;
- every recipe source resolves;
- every station id referenced by recipe/station source exists in interactive defs;
- every event type used by crafting exists in `WORLD_EVENT_TYPES`;
- every known-by-default recipe exists and references item.

3. Balance tests:

Add `tests/crafting-balance.test.ts`:

- trivial items total `<= 6` unless tagged otherwise;
- E4/unique recipes with `metamatter` have tier 4 or deep/unique tags;
- no common starter food/drink/document uses rare materials;
- all PSI weapon items include `psimatter`;
- all high-tech/energy weapon items include `electronics` and/or `cybernetics`;
- all ammo has `chemical` or `metal`;
- all weapons have nonzero `metal`, `mechanics`, `electronics`, `psimatter`, or `metamatter`.

4. Docs after implementation:

Prepare changes, but only mark shipped facts once code is present:

- `README.md`: implementation snapshot and player-facing summary;
- `items.md`: composition/recipe contract;
- `interactive.md`: lathe/workbench definitions and station placement;
- `save.md`: crafting payload and save shape;
- `economics.md`: note craft components are separate from economy resources.

If running in parallel before code exists, add TODO-style comments in branch notes, not in shipped docs. Orchestrator will decide final docs update.

## Validation matrix

Final intended gate:

```bash
npm run check
npm run check:browser
```

Narrow gates while working:

```bash
npm run typecheck
npm run test:unit
npm run content:audit
npm run check:readonly
```

## Economy audit rules

Craft materials are not current `RESOURCES`.

Tests/docs should enforce:

- `mechanics` can relate to `tools/labor/metal`;
- `electronics` can relate to existing `electronics`;
- `chemical` can relate to `fuel/medicine/industrial_slurry`;
- `bio` can relate to `slime_samples/zhelemish/fungal_inputs`;
- `cybernetics`, `psimatter`, `metamatter` are rare craft materials, not automatically broad economy resources.

Do not add new `ResourceDef`s unless implementation genuinely needs scarcity/trade behavior for them. If new resources are added, update economy tests and docs.

## Acceptance

Run at least:

```bash
npm run typecheck
npm run content:audit
```

If tests intentionally fail until data/runtime branches are merged, report exact expected failure and the contract it is waiting for.

Final notes must include:

- audit checks added;
- balance tests added;
- docs touched or explicitly deferred;
- validation run;
- any expected integration failures for orchestrator.
