# architecture_fix_0: индексатор перехода к единой room/territory/floor-theme архитектуре

Статус: план для пяти параллельных GPT-5 агентов и финального оркестратора. Это не кодовая реализация и не обещание shipped behavior. Каждый агент перед работой обязан заново прочитать актуальные `README.md`, `architecture.md`, свой доменный документ и релевантные `src/` файлы.

## Цель

Привести текущую реализацию к единой иерархии:

1. `Room` / `RoomType` - микро-функция места: есть, пить, туалет, спать, работать, лечиться, хранить, общаться, прятаться.
2. `world.factionControl` / `TerritoryOwner` - право и привычная территория: кому принадлежит клетка, комната и локальный участок.
3. `FloorLevel` / `DesignFloorId` / `ProceduralFloorSpec` - тема этажа: геометрия, стартовые доли контроля, фракционная доминанта, население, монстры, объекты, спец-NPC, лидеры и квестовый пакет.

Текущий код уже содержит значительную часть этого фундамента: `RoomType`, `systems/territory.ts`, `data/floor_territory.ts`, `data/factions.ts`, NPC utility, A-Life, floor route packages and feature-first interactives. Задача не в большом переписывании, а в выравнивании источников правды и удалении неоднородностей.

## Документы, на которых основан пакет

- `README.md`: текущая shipped-карта проекта, Project Shape, floor route, A-Life, territory and UI facts.
- `architecture.md`: five-layer contract, A-Life, floor memory, добавленный раздел `Room, Territory And Floor Theme Hierarchy`.
- `factions.md`: cell-first territory contract. Важный факт: `world.factionControl` является authority, `zone.faction` является derived metadata.
- `ai.md`: full-pass active-floor AI, utility intents, room targets, decision cadence, A-Life boundary.
- `alife.md`: fixed `100_000` identity pool, no refill, materialization/foldback, persistent deaths.
- `floors.md`: route stop as micro-world package, one active 1024x1024 floor, route keys, floor memory.
- `samosbor.md`: samosbor mutates the same floor key, shelters and local rebuild must preserve anchors.
- `interactive.md`: feature-first overlay for sinks, toilets, craft stations, containers and ordinary cell-bound objects.
- `economics.md` and `quests.md`: owners, rewards, production, containers, quests and events must use ids, route targets and compact facts.
- `optimization.md` and `tests.md`: bounded runtime cadence, no full-frame scans, cheap deterministic tests.
- `problems.md`: warns against map-only/debug-only private channels and content-specific hooks in broad systems.

Known doc skew to resolve during orchestration: `save.md` still says `SAVE_SHAPE_VERSION = 14`, while current source `src/systems/save_runtime.ts` and `factions.md` say `15`.

## Current implementation seams to inspect

Primary code:

```txt
src/core/types.ts                RoomType, ZoneFaction, TerritoryOwner, Room, Zone
src/core/world.ts                World arrays, zoneMap, factionControl
src/data/rooms.ts                room definitions
src/data/factions.ts             territory owner registry
src/data/floor_territory.ts      story/design/procedural territory shares
src/data/population_profiles.ts  story population room/zone weights
src/data/design_floor_population.ts design-route population profiles
src/gen/population_placement.ts  placement field with room, zone and preferred territory inputs
src/systems/territory.ts         cell owner API, room owner aggregation, capture
src/systems/factions.ts          faction UI/events/territory strength
src/systems/ai/npc_utility.ts    utility scoring
src/systems/ai/npc_fsm.ts        routine executor and room targeting
src/systems/ai/npc_emergency.ts  samosbor/shelter decisions
src/systems/alife.ts             identity materialization/foldback
src/systems/containers.ts        owner/access/theft via room territory
src/systems/production.ts        production owner via room territory
src/systems/samosbor.ts          territory owner and samosbor takeover
```

Useful grep probes:

```bash
rg -n "zone\\.faction|world\\.factionControl|factionControl\\[" src tests
rg -n "RoomType\\.|territoryRoomOwner|territoryOwnerAt|assignedRoomId" src/systems src/gen src/data tests
rg -n "SAVE_SHAPE_VERSION" README.md architecture.md save.md factions.md src/systems/save_runtime.ts
```

## Parallel agent lanes

These five plans are intended for parallel work. They deliberately minimize file overlap.

| File | Agent | Primary owner | Main outcome |
| --- | --- | --- | --- |
| `architecture_fix_1.md` | Agent 1 | Room micro-system | Unified room affordance contract and tests. |
| `architecture_fix_2.md` | Agent 2 | Territory/factions | Cell-first territory API cleanup and zone-first audit. |
| `architecture_fix_3.md` | Agent 3 | Floor theme packages | Declarative floor-theme profile composition across story/design/procedural route stops. |
| `architecture_fix_4.md` | Agent 4 | AI/A-Life routine | NPC routine uses room affordance plus territory consistently, with bounded cadence. |
| `architecture_fix_5.md` | Agent 5 | Cross-system consumers | Economy, quests, interactions, samosbor, UI/debug and static audit consume the unified hierarchy. |
| `architecture_fix_6.md` | Orchestrator | Integration | Merge, resolve conflicts, run checks, update docs, decide final acceptance. |

## Shared rules for all agents

- Run `git status --short` first and do not overwrite unrelated dirty work.
- Do not edit `dist/`, `itch/`, archived `gatbage/**`, PR campaign docs, or generated reports.
- Do not add dependencies or frameworks.
- Do not add a new `FloorLevel` for any route stop, faction theme or numbered lift.
- Do not create ordinary population refill.
- Do not add legacy save migrations. If shape changes, bump `SAVE_SHAPE_VERSION` and reject stale saves.
- Do not put floor-specific or faction-leader content in `main.ts`, `core/world.ts`, `render/webgl.ts` or broad AI.
- Prefer new focused modules/tests over wide rewrites.
- For source changes, run at least `npm run typecheck`; for systems/generation/AI/save/render changes, run `npm run check` unless blocked.

## Success criteria for the full package

- There is one explicit room affordance API or data registry used by AI and generation-facing tests.
- There is one territory owner API for "who owns this place"; `zone.faction` is documented and used only as derived metadata/UI compatibility.
- Floor theme data can answer initial geometry/population/territory/object intent without hardcoding every design floor in generic systems.
- Ordinary NPC routine chooses rooms from micro-function plus friendly territory; exceptions are explicit and visible.
- A-Life remains the identity owner; no agent adds off-floor need ticks or refill.
- Save/docs agree on the current shape version after implementation.
- Tests cover room affordances, cell territory, floor themes and AI target selection with cheap fixtures first, generation matrix only where needed.

