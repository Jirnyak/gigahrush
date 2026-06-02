# architecture_fix_2: Agent 2 - cell-first territory and faction ownership cleanup

## Mission

Закрепить `world.factionControl` / `TerritoryOwner` как единственный источник правды для владения местом и убрать/изолировать zone-first неоднородности. Комнаты остаются агрегатами, этажи задают стартовую тему, но runtime owner берется из клетки или dominant room owner.

Этот агент не переписывает AI routine и не проектирует floor themes. Он чистит API владения и делает аудитные правила.

## Intake

Обязательно прочитать:

- `README.md`
- `architecture.md`
- `factions.md`
- `samosbor.md`
- `save.md`
- `src/core/types.ts`
- `src/core/world.ts`
- `src/data/factions.ts`
- `src/data/floor_territory.ts`
- `src/systems/territory.ts`
- `src/systems/factions.ts`
- `tests/territory.test.ts`

## Current baseline

Текущий shipped baseline:

- `world.factionControl: Uint8Array` хранит владельца каждой клетки.
- `ZoneFaction` сейчас является `TerritoryOwner`.
- `zone.faction` является derived metadata, полезной для UI/debug/event grouping, но не truth.
- `territoryRoomOwner()` вычисляет владельца комнаты через доминирующего владельца ее mapped cells.
- `updateTerritoryCapture()` меняет клетки bounded cadence: 2s, radius 3, max 384 cells/tick, local actor cap 24, max 4 events/tick.
- `SAVE_SHAPE_VERSION` в source сейчас `15`.

## Implementation plan

### Step 1 - classify direct access

Run:

```bash
rg -n "zone\\.faction|world\\.factionControl|factionControl\\[" src tests
```

Classify every hit:

- allowed internal implementation in `systems/territory.ts`;
- generator initialization/authoring that should call helper or be documented as generation-only;
- runtime system that must use `territoryOwnerAt*()` or `territoryRoomOwner()`;
- render/UI/debug display that can read synchronized aggregate metadata;
- tests that intentionally inspect arrays.

Write this classification in the final agent response or in a temporary note inside the agent's branch. Do not create archive/task-status folders.

### Step 2 - improve territory write helpers if needed

Existing helpers:

```ts
territoryOwnerAtIndex(world, idx)
territoryOwnerAt(world, x, y)
territoryFactionAt(world, x, y)
setTerritoryOwnerAtIndex(world, idx, owner)
dominantTerritoryOwnerInRoom(world, roomId)
territoryRoomOwner(world, roomId)
currentTerritoryZoneId(world, x, y)
initializeCellTerritory(world, options)
syncZoneMetadataFromTerritory(world, zoneIds?)
```

If many generators directly write `world.factionControl`, add small generic helpers rather than broad rewrites:

```ts
setTerritoryOwnerAt(world, x, y, owner)
paintRoomTerritory(world, roomId, owner)
paintTerritoryDisc(world, x, y, radius, owner, options)
```

Keep helpers bounded and generation/runtime explicit. Do not add a new zone system.

### Step 3 - replace runtime zone-first reads

Runtime logic that asks "who owns this place" must use:

- `territoryOwnerAtIndex()` for cell-indexed logic;
- `territoryOwnerAt()` for actor/player/location logic;
- `territoryFactionAt()` when social `Faction` is needed;
- `territoryRoomOwner()` for room/container/production ownership;
- `currentTerritoryZoneId()` only as an event/UI bucket.

Direct `zone.faction` is allowed only for:

- UI display of already synchronized sector metadata;
- backward-compatible tests that explicitly assert synchronization;
- generation fallback before `initializeCellTerritory()` creates the cell field.

### Step 4 - add audit coverage

Preferred cheap tests:

- `tests/territory.test.ts`: extend current fixture tests for room ownership aggregation, `syncZoneMetadataFromTerritory()` and `ZoneFaction.SAMOSBOR` protection.
- Add a static test or content-audit rule only if it can maintain a clear allowlist. Good allowlist categories: `src/systems/territory.ts`, low-level world copy/save code, tests, and generation initialization helpers.

Do not make content audit brittle by banning all `factionControl` in tests and generators without allowlist.

### Step 5 - doc sync

If this agent touches docs, fix only factual skew:

- `save.md` must match `src/systems/save_runtime.ts` if edited.
- `architecture.md` can mention helper names if they become official.
- Do not update README unless shipped behavior changes.

## File boundaries

Green:

- new focused territory tests

Yellow:

- `src/systems/territory.ts`
- `src/systems/factions.ts`
- `src/data/factions.ts`
- `tests/territory.test.ts`
- `scripts/content-audit.mjs` if adding a clear allowlist rule
- `save.md` for version skew

Avoid:

- AI routine changes, except preserving imports
- floor theme registry work
- broad edits in all design floor generators in one pass
- `src/main.ts`
- `src/render/webgl.ts`

## Validation

For territory runtime changes:

```bash
npm run check
```

If only docs and pure tests were added, at least:

```bash
npm run typecheck
npm run test:unit
```

## Done when

- Every runtime owner decision has a clear `territory.ts` API path.
- Any direct `factionControl` writes are either inside territory helpers, generation initialization, or explicitly justified.
- `zone.faction` is not used as ownership truth in new logic.
- Territory tests cover authored cell preservation, fallback from zone metadata, room owner aggregation, capture pressure and samosbor owner protection.

