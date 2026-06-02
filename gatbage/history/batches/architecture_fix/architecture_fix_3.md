# architecture_fix_3: Agent 3 - floor theme packages and route-level defaults

## Mission

Свести тему этажа к одному декларативному слою, который композирует уже существующие данные: base floor, route id, danger, majority faction, territory shares, population profile, object profile, monster pressure, NPC allowance and authored special content.

Этот агент не меняет cell territory API и не переписывает AI. Он делает floor theme читаемой и системной, чтобы новые этажи не размазывали "кто здесь живет и кто контролирует этаж" по генераторам.

## Intake

Обязательно прочитать:

- `README.md`, разделы `Floors`, `Authored Design Floors`, `Implementation Snapshot`
- `architecture.md`
- `floors.md`
- `factions.md`
- `alife.md`
- `anomalies.md` if procedural floors are touched
- `src/data/design_floors.ts`
- `src/data/procedural_floors.ts`
- `src/data/floor_territory.ts`
- `src/data/population_profiles.ts`
- `src/data/design_floor_population.ts`
- `src/data/floor_object_placement.ts`
- `src/gen/floor_manifest.ts`
- `src/gen/design_floors/manifest.ts`
- `src/gen/procedural_floor.ts`

## Current baseline

Floor theme data exists but is split:

- story/design/procedural route definitions in `data/design_floors.ts` and `data/procedural_floors.ts`;
- territory shares in `data/floor_territory.ts`;
- story population in `data/population_profiles.ts`;
- design population in `data/design_floor_population.ts`;
- object/craft placement in `data/floor_object_placement.ts` and `data/craft_station_placement.ts`;
- route NPC allowance through `floorRunZAllowsNpcs()` and local floor population rules;
- special NPCs/leaders and choices inside authored generators.

This split is not wrong, but generic systems need one way to ask: "what is this floor's theme package?"

## Implementation plan

### Step 1 - create a read-only composition layer

Preferred new file:

```txt
src/data/floor_theme_profiles.ts
```

Target type:

```ts
export interface FloorThemeProfile {
  floorKey: string;
  baseFloor: FloorLevel;
  routeId?: DesignFloorId | string;
  routeZ?: number;
  kind: 'story' | 'design' | 'procedural' | 'floor_instance';
  danger: number;
  npcAllowed: boolean;
  territoryShares: readonly FloorTerritoryShare[];
  populationProfileId?: string;
  majorityOwner?: TerritoryOwner;
  objectProfileTags: readonly string[];
  monsterPressureTags: readonly string[];
  economyTags: readonly string[];
  specialContentTags: readonly string[];
}
```

Start with composition over current registries. Do not duplicate all values manually. The first pass can be helpers:

```ts
themeForStoryFloor(floor)
themeForDesignFloor(id, def)
themeForProceduralSpec(spec)
```

The helper can call existing `territorySharesForStoryFloor()`, `territorySharesForDesignFloor()` and `territorySharesForProceduralSpec()`.

### Step 2 - protect current behavior

Add tests that compare the theme helper to existing registries rather than changing generation immediately:

- every `FloorLevel` returns a theme;
- every `DesignFloorId` returns a theme;
- every procedural majority id returns a theme;
- `z <= -48` route stops keep `npcAllowed = false` where the current route contract requires it;
- theme territory shares normalize to non-empty human/samosbor owners;
- no theme creates a new `FloorLevel`.

Suggested test:

```txt
tests/floor-theme-profiles.test.ts
```

### Step 3 - migrate call sites only after tests

Possible later call sites:

- `src/gen/floor_manifest.ts`: pass `theme.territoryShares` into `initializeCellTerritory()`.
- `src/gen/design_floors/manifest.ts`: same for design floors.
- `src/gen/procedural_floor.ts`: same for procedural floors.
- population placement may read `majorityOwner` / `npcAllowed` from the theme helper instead of reconstructing local logic.

Keep this incremental. Do not edit every design floor generator just to pass through a theme object.

### Step 4 - define special NPC/leader boundaries

The floor theme can list tags for leaders and authored content, but the actual NPC definitions stay in content modules or plot/side-quest registries. Do not add content-specific leader branches to `main.ts` or generic AI.

Good shape:

- floor theme says `specialContentTags: ['leader', 'scientist_control', 'vault']`;
- generator/data module registers concrete NPCs, rooms and quests;
- AI sees ordinary entity fields and plot/persistent ids.

### Step 5 - docs

If the theme helper becomes official, update `architecture.md` or `floors.md` narrowly. README only changes if shipped behavior or active implementation map changes.

## File boundaries

Green:

- new `src/data/floor_theme_profiles.ts`
- new `tests/floor-theme-profiles.test.ts`

Yellow:

- `src/data/floor_territory.ts`
- `src/data/population_profiles.ts`
- `src/data/design_floor_population.ts`
- `src/gen/floor_manifest.ts`
- `src/gen/design_floors/manifest.ts`
- `src/gen/procedural_floor.ts`

Avoid:

- `src/core/types.ts`
- `src/main.ts`
- AI files
- broad edits to every `src/gen/design_floors/*.ts`

## Validation

For helper/test-only work:

```bash
npm run typecheck
npm run test:unit
```

If generation call sites change:

```bash
npm run check
npm run test:generation
```

## Done when

- There is a single composition API for floor theme facts.
- Existing floor territory/population behavior is preserved or intentionally changed with tests.
- Design and procedural floors can be audited through the same helper.
- Special NPC/leader content remains content-owned, not generic-system hardcode.

