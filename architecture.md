# GIGAHRUSH Modular Architecture

> Центральный документ архитектуры.
>
> Роль: описывает крупные системы игры и то, как они стыкуются: 1024x1024 toroidal `World`, typed arrays, flat entities, rooms, items, monsters, NPC, projectiles, traces, samosbor, path fields, save/runtime state, generation, systems and render. Главные принципы: универсальность, минимализм, модульность, процедурность, комбинаторность, оптимизация, отсутствие hardcoded content paths and honest emergence.
>
> **Парадигма Бритвы Оккама:** Минимум систем, максимум функциональности. Если какая-то логика, слой или сущность дублируется или является излишеством, она должна быть обрезана.

Purpose: turn the current TypeScript/Vite raycaster game into a content factory where many agents can add rooms, NPCs, quests, events, monsters, documents, economy hooks, and floor variants without fighting over the same files.

This document is based on the current code, `manifest.md`, and `desdoc.md` as of 2026-05-24, with later active system contracts split into root domain docs. It is not a rewrite plan. The project is already playable; architecture work must protect that.

## 1. Current Fact Map

The real project shape is:

```txt
src/
  core/       low-level constants, enums, World, shared state shapes, pixel math
  data/       definition registries: items, weapons, plot, economy, permits, terminals, variants
  entities/   monster definitions, procedural sprite generators, sprite id index
  world/      operations over World storage: path blockers, visual slots, ceiling heights
  gen/        floor generators and hand-made content modules
  systems/    runtime logic: AI, quests, samosbor, factions, events, inventory, save/runtime state
  render/     raycaster/WebGL/HUD/map/log/canvas overlay rendering
  input.ts    input state
  main.ts     browser entry point, game loop, floor switching
```

Critical runtime facts:

- `World` is data-oriented: packed `Uint8Array`, `Int16Array`, `Float32Array`, sparse maps only where needed.
- `entities` is a flat array of plain objects with optional component fields. There are no entity subclasses.
- The world is a 1024x1024 torus. All coordinate work must use `world.idx`, `world.wrap`, `world.delta`, or `world.dist`.
- Floor generators return `{ world, entities, spawnX, spawnY }`.
- Normal lift travel uses `systems/procedural_floors.ts` as a per-run vertical route across `z=-50..+50`. The `FloorLevel` enum no longer exists; the 6 former story/base floors are ordinary string-id design floors. Authored design floors are 51 string-id route stops from `src/data/design_floors.ts`, all on even `z`; odd `z` positions are 50 seeded procedural specs with `z`, seed, geometry, main faction, anomaly and danger. Every `z` in `[-50, 50]` resolves to an entry — the last empty even slot (`z=-12`, now `perevalka`) was filled on 2026-08-06, and `tests/route-slot-coverage.test.ts` locks that invariant. Down decreases `z`; `VOID` is the final lowest stop at `z=-50`, `darkness` is the dark endgame route floor at `z=-48`, `podad` is the Herald-gated Hell route floor at `z=-40`, `underhell` is at `z=-38`, and `roof` is the highest stop at `z=+50`.
- `systems/floor_memory.ts` is a single-entry save↔load handoff for the **current active floor only**, keyed by stable floor key. A floor is a pure function of `(runSeed, z)` (`src/gen` has zero `Math.random`), so departing floors are not retained: leaving a floor folds its NPCs into A-Life and discards the `World`, and returning regenerates it deterministically identical. Live RAM is therefore one `World` (the mobile-OOM fix). Player mutations on the active floor — decals, bullet/blood marks, container loot, opened/broken doors, corpses — survive **save→load** because the browser save packs that one floor as a delta against the regenerated base (`worldForSave(world, base)`; see `save.md`), not because floors are parked in memory. Samosbor/rebuild paths update the active `World` in place. UI-only map exploration is transient and can reset on restore.
- Desktop input treats `Esc` as browser/pointer-lock territory by default, not as a gameplay/window key, though the hotkey table can still store `Escape` like any other captured code. `Enter` opens the game menu from normal gameplay and is the keyboard accept/confirm key inside canvas menus, while LMB accepts the selected row only when a canvas menu is open. RMB closes or steps back from open canvas menus including Net Sphere, and mouse wheel is menu up/down navigation except where a focused terminal uses it for history scroll. In Net Sphere, `Enter` selects the chat line when inactive and submits the current line when active, `Space` stays chat text input only while the chat line is active, `Backspace` erases chat only while chat input is active, `N` closes only when chat input is inactive, `Delete` closes the terminal, and mouse wheel / `PageUp` / `PageDown` / arrow keys scroll the loaded chat history. Top-level shortcut menus, including the `F1` HELP poster, open only from normal gameplay; the same shortcut closes its own panel when no text input or key-capture field is active. Handled window keys are consumed so they do not fall through to the game menu. `E` is the default in-world interaction binding for pickups, doors, NPCs, containers and aimed interactables. Keyboard and mouse-button capture is universal: ordinary keys, `Space`, `Backspace`, `Esc`, LMB/RMB/MMB and extra mouse buttons are represented as control codes and can be assigned to any action.
- `main.ts` owns the game loop and calls systems in fixed order.
- `systems/camera.ts` owns transient runtime camera modes and resolves them to `CameraView` for render. Death, free, trailer and `cinematic` are all modes of this one system. The `cinematic` mode is directed: an optional `lookAt` point splits heading from gaze, `orbit` circles that point analytically, `hold` keeps the pose instead of returning control when the route ends, `heightTarget` is clamped against `world.ceilHeight` for the current cell, and `routeCinematicCamera` lays the flight path over **walkable** cells through `bfsPath`. Per-frame movement is cut into substeps no longer than the node-reach tolerance; a longer step overshoots the node and the camera then travels the chord — i.e. through the wall corner.
- `systems/cinematics.ts` owns floor scenes; `systems/cinematic_actors.ts` owns taking an NPC out of the world into a scene and giving them back. See `Floor Scene Contract` below.
- `systems/events.ts` is the current EventBus analogue: fixed-size ring buffers, public event publication, and query filters.
- Shared `E` interaction goes through `systems/interactions.ts`; generated gambling machines, local computers, NPC table-game interfaces, NET-hack terminals, emergency panels, Net Terminal Gen and special floor interactions plug into that dispatcher.
- `systems/interactive.ts` is the generic sparse cell-bound interactive layer. Definitions live in `src/data/interactive.ts`, explicit generation helpers live in `src/gen/interactive_placement.ts`, broken fixture placement lives in `src/gen/interactive_fixtures.ts`, and one `ContentInteractionHook` exposes feature-like objects and container adapters to the shared dispatcher. Current shipped adapters are transient: lazy `Feature.SINK` drinking, lazy `Feature.TOILET` needs relief, repair-pending broken sink/toilet fixtures, explicit `workbench_basic` placement and visible `WorldContainer` delegation. `src/data/floor_object_placement.ts` defines story-floor, design-route and procedural-geometry profiles for static decor features, explicit interactives, broken fixture overlays and craft-station subprofiles; `src/gen/floor_object_placement.ts` applies them once during generation through reachable bounded placement. Complex runtime-owned objects such as moving trains stay in their authored/anomaly systems. The contract is feature-first: floor generators own how many visual primitives exist and where they are, while `InteractiveDef` ids own what `E` does when a matching primitive is targeted. They do not change save shape.
- `systems/alife.ts` owns persistent procedural NPC identity. A run creates a compact NPC pool around `100_000` procedural identities within a `131_072` technical capacity, materializes only the active floor into live `entities`, folds live state back on transitions/rebuilds/saves, and records permanent deaths. Browser saves keep dead procedural A-Life ids with a current cap of `65_536`. Age is stored as a byte column and sex as a byte code column in the cold pool; snapshots expose ordinary `number`/`CharacterSex` values for Demos, quests, AI and UI. `systems/npc_relations.ts` owns compact personal relation-to-player math shared by A-Life, quests and hostility. `alife.md` is the detailed design contract for this feature.
- Save/load uses `systems/save_runtime.ts` and `systems/save_payload.ts`. Current save shape version is `28` (`SAVE_SHAPE_VERSION`, `src/core/save_shape.ts` — a dependency-free leaf; the runtime only imports it); old or unversioned saves are rejected rather than migrated. `save.md` is the detailed persistence contract.
- Existing content extensibility already exists in `registerSideQuest`, `registerZoneContent`, floor content manifests, `SAMOSBOR_VARIANTS`, `getSamosborBeatDefs()`, contract/economy registries, route/design-floor ids and `publishEvent`. `samosbor.md` is the detailed samosbor contract.

## 1.1 Project Bible And Honest Scope

The core premise is one honest current-floor simulation. The loaded 1024x1024 toroidal `World` is the real surface where materialized NPCs, monsters, projectiles, rooms, factions, containers, route cues and samosbor effects coexist. The current AI foundation is the full-pass model: `updateAI()` runs one pass over the indexed live-AI list every simulation frame. Systems may use broadphase indexes, whole-floor navigation fields, dirty versions, cached target scans and actor-local cooldowns for expensive choices, but active-floor simulation must not depend on player proximity tiers, hot/cold actor classes or a player-centered spawn bubble.

Storage order is not simulation truth. `world.rooms`, `entities`, `world.zones`, lift anchors, factories, resources, route arrays and registry definitions are storage surfaces; their current order is not physical law, social priority, route pressure, economic priority or AI preference unless a data contract explicitly says the order is authored priority. "First N" over a live/runtime collection is not an optimization by itself; it is a hidden hardcode unless it is rotated, spatially local, actor-keyed, cursor-based, scored before truncation or explicitly ordered by authored data.

The player is an entity reference, not an `EntityType` and not an entity-side control flag. Runtime `player` points at the live actor currently being played; the native player body is an NPC-shaped entity with `persistentNpcId: 'player'` for save/floor-boundary reconstruction, and PSI possession can temporarily swap `player` to another actor. Input, camera, HUD, inventory, needs and save payload creation read that current player entity, while combat, faction hostility, damage, events, A-Life rank/karma and toroidal spatial math stay entity-oriented whenever possible. Possession is not a hidden player-attribution layer: unless a future PSI effect explicitly adds a psychic signature, consequences remain attached to the acting entity because the world is isotropic. Runtime camera state is a transient systems layer over the current player entity: player-follow, death camera, free camera and cinematic camera resolve to the same view shape without changing the entity model. Isotropy means shared mechanics and world math across the whole active floor: player proximity affects rendering/camera/HUD only, not whether an actor receives AI. New mechanics should treat player-only branches as integration exceptions, not as the default design shape.

High-density floors should treat actors as dynamic particles over a small faction field. Ordinary NPCs and monsters use the same short actor step across the map: keep current intent/target, choose or retain a hostile faction target through cached local scans, move, hit or fire a physical projectile, and write consequences. This is not a synchronized crowd shortcut: materialized NPCs keep their own A-Life identity, faction, relation to the player, role, current intent, loadout, target memory and foldback consequences. The consequence data must be real even when rendering is coarse. The current active-floor soft cap is one shared NPC+monster actor pool whose default is 4096 (`DEFAULT_ACTIVE_ACTOR_SOFT_LIMIT`) but is runtime-configurable in `1024..16384` steps of 1024 through `setActiveActorSoftLimit()`; generation densities are authored at the default cap and rescale through `activeActorSoftLimitScale()`. Item drops, billboards and projectiles use one shared 65536 floor-object pool.

The macro building is persistent route identity, not full hidden realtime simulation. `FloorRun` spans `z=-50..+50`, starts at `LIVING`/`z=0`, and keys every base design, routed design, procedural and numbered-lift floor. Visited-floor geometry is not stored; a floor regenerates deterministically from `(runSeed, z)` on return. Only the current active floor is packed into the save (as a delta against its regenerated base), while persistent per-floor facts — deaths, faction/economy consequences, events — live in A-Life and the route summaries. Each route stop should behave like a small world package: own generator, route role, population field, NPC/faction mix, monster pressure, POIs, local rules and reachable player decisions. Even `z` stops are design packages and odd `z` stops are procedural; both ask one smooth `abs(z)` population/level curve for their baseline, then apply local thematic multipliers, danger, anomaly pressure and authored overrides.

**Modular Decentralization**: It is actively encouraged to build each design floor as a separate "mini-game" with its own rules, starting from custom 2D geometry algorithms to unique dynamics, events, and population profiles.

## 1.2 Room, Territory And Floor Package Hierarchy

The living simulation uses three nested spatial systems. They are not alternatives and should not duplicate each other's authority.

1. Micro room function.

   The smallest meaningful social/gameplay unit is `Room`: `roomMap`, `RoomType`, doors, fixtures, containers and feature/interactable overlays. Room type answers "what can happen here": living rooms support sleep, hiding and household life; kitchens support food/water; bathrooms support toilet/water relief; production rooms and offices support work; medical rooms support healing; storage rooms support loot and supplies; common/smoking/HQ rooms support social, patrol, faction and shelter behavior. The data-only `src/data/room_affordances.ts` registry is the shared API for this micro-room meaning. NPC utility may score these rooms by need, occupation, intent, family room, assigned work room and samosbor emergency state. Player-facing interactables attach to room features through the generic `E` dispatcher. A room does not own political truth by itself: it is an affordance surface, not a faction system.

2. Cell territory and faction zones.

   The authoritative ownership field is `world.factionControl` per cell. `Zone` metadata is a coarser aggregate for UI, danger, event context, HQ anchors and floor-scale summaries, and must be synchronized from the cell field when ownership changes. `territoryRoomOwner()` derives room ownership from the dominant owner of its mapped cells, so room access and NPC routine targeting depend on territory, not on the room name or floor label. Ordinary NPC routine life should prefer or require friendly territory for work, social, patrol and owned-room targets; exceptions must be explicit gameplay states such as travel, raid/capture pressure, quest, caravan, samosbor emergency, monster pressure, hack backlash or authored scene. Faction spread is bounded local pressure over cells through `systems/territory.ts`/`systems/factions.ts`, not a per-frame whole-map ownership rewrite.

3. Floor package.

   The broadest level is the design/procedural floor identity: `DesignFloorId`, `ProceduralFloorSpec`, route `z`, `majorityId`, danger, anomaly and local generator package. This level answers "what kind of floor is this": Ministry can start with liquidator/administrative control, Kvartiry and Living with citizen habitation, wild/88 floors with wild control, meat lower floors with monsters/cult/samosbor pressure, NII floors with scientists, and so on. The floor theme owns initial geometry, population profile, target territory shares, monster pressure, object profiles, special NPCs, leaders, quest content and authored rules. It must not hardcode every room decision in AI. Once the floor exists, current per-cell territory and rooms are the live truth; samosbor, capture events, quests and floor memory may change them.

   `src/data/floor_theme_profiles.ts` is the read-only composition layer for these broad facts: it assembles route key, base floor, danger, NPC allowance, territory shares, population profile id, object tags, monster pressure tags and special-content tags from existing registries without owning generation or runtime decisions.

Generation and runtime order follows that hierarchy:

- Generate route-floor geometry, rooms, doors, fixtures, POIs and authored anchors first.
- Apply the floor's own data: population profile, target territory shares, majority/anomaly pressure and authored special content.
- Initialize/synchronize `world.factionControl` and `world.zones`; room ownership is derived from cells.
- Materialize A-Life/NPC templates into the active floor using room affordances plus territory preference.
- Runtime AI reads room function and territory each decision cycle; faction capture mutates cells on a bounded cadence; render and HUD only display the result.

Do not collapse the hierarchy:

- Do not treat `RoomType` as ownership.
- Do not let the floor package bypass live territory for ordinary NPC routine behavior.
- Do not put floor-specific faction or leader logic in generic AI, `main.ts`, `core/world.ts` or render.

### Этажи не группируются (закон владельца, 2026-08-25)

51 маршрутный этаж — 51 отдельный субмодуль. Общей «темы», «полосы» или «биома»,
объединяющих этажи в группы, в проекте НЕТ: поле `themeTags` вырезано целиком
(303 упоминания → 0). Оно объединяло все этажи в шесть корзин, каждая названная
именем одного своего члена, — и потому читалось как имя этажа и тихо расширяло
правила на четырнадцать соседей.

Правило замены: таблицы (монстры, предметы, клетки, текстуры, меши, обстановка,
уклады населения, варианты самосбора) — общий словарь; **что взять, каждый этаж
называет САМ**, и его выбор не задевает соседей. Где выбор можно не объявлять —
его и не объявляют: спрашивается мир, а не ярлык.

- Свойство места — у комнаты под игроком (`world.roomAt`), а не у этажа:
  бумагу принимают за `RoomType.OFFICE` или в проверочном коридоре, продают в
  `SHOP`/`MARKET`. Шлюз документов и шкаф Л-47 спрашивают свой объект, а не
  координату.
- Свойство воздуха и материала — у мира: `world.baseFogDensity`,
  `world.hasMeatWalls`; объявляет собственный генератор этажа.
- Обстановка и уклад населения — явные карты «этаж → слой»
  (`DESIGN_FLOOR_OBJECT_LAYER`, `PROCEDURAL_GEOMETRY_OBJECT_LAYER`,
  `DESIGN_FLOOR_POPULATION_CLASS`). Слои названы по существу
  (`bureaucratic`, `residential`, `communal`, `industrial`, `meat`, `protocol`),
  а не именем этажа-члена.
- Родной пул монстров — `monsterBiasKinds`/`monsterTags` самого этажа плюс
  авторский якорь вида; разворот якоря через корзину снят.
- Самосбор от этажа не зависит вообще: варианты и их последствия глобальны,
  различия принадлежат варианту.
- Сюжетные развилки целятся в конкретный этаж по `designFloorId` — но проверяй
  ФАКТ, а не имя: Герольд стоит на `podad`, а не на `hell`, и «очевидное»
  сужение до `hell` закрывает главный квест насмерть.

Механический замок на импорты между пакетами этажей — `npm run check:invariants`
(«связи между этажами», допускается ровно 0).
- Do not create off-floor room/need simulation; off-floor changes are compact A-Life/faction/event facts.
- Do not make rooms usable by unrelated factions as routine life space unless the mechanic explicitly describes trespass, occupation, trade, invasion, shelter panic or another visible exception.

## 2. Non-Negotiable Invariants

These are the rules every new module must preserve.

- No new runtime dependency unless there is a measurable reason and an owner for integration.
- No large refactor before content delivery.
- No content-specific logic in `main.ts`, `core/world.ts`, `render/webgl.ts`, or `systems/ai/index.ts`.
- No direct dependency on another agent's unmerged module. Communicate through ids, registries, or `publishEvent`.
- No per-frame content scanning unless bounded by cooldown, radius, cap, or ring buffer.
- No gameplay-visible fixed-prefix scan over runtime collections. A bounded scan over rooms, entities, zones, anchors, resources, factories, quests, candidates or registries must use a fair window/cursor/spatial query or score candidates before truncation. Порядок хранения не должен становиться физикой мира.
- No coordinate math that ignores toroidal wrap.
- **One active floor.** At most `MAX_LIVE_WORLDS` = 2 `World` instances alive at once: the floor being played, plus a second only while a transition is in flight or as the lift's one-floor-back cache (`MAX_FLOOR_MEMORY_ENTRIES = 1`). A `World` is 42 MiB of grids, so a retained dead floor is a mobile OOM. Per-floor state belongs in `createWorldContextStore()` (`src/world/world_contexts.ts`), which holds one world keyed by room and drops it the moment a different world registers. A module keeping its own `let activeWorld` slot must register `registerFloorScopedReset()`; the single unload point is `dropWorldContextsExcept(world)` in `finishLoadedFloorVisuals()`. Never cap such storage by entry COUNT — that was the bug: caps of 4–8 contexts each pinned a whole floor plus its ~9600 entities. Enforced by `tests/world-live-count.test.ts` (worlds after forced GC, and zero entries from departed floors — the world count alone reads clean while entities leak).
- **One floor coordinate space.** Floor `z` is the number in `DESIGN_FLOOR_ROUTES`; a theme's base comes from `designFloorBaseZ()` / `DESIGN_FLOOR_THEME_BASES`, never a retyped literal. The removed 30/60/100/140/180/200 scheme ascended with depth while this one descends, so a legacy key is not a cosmetic wart: it silently addresses a floor that does not exist, and a legacy RANGE (`z < N`) matches the wrong floors instead of none. `scripts/check-invariants.mjs` fails the build on any `z` assigned to or compared against 60/100/140/180/200.
- **One room id space, and it is the index.** `world.rooms` is addressed by room id: `stampRoom` writes `rooms[id]`, `roomAt()` reads `rooms[roomMap[i]]`, and floor-memory restore re-forces `room.id = idx` because a patch must land in the room it was taken from. So a floor counter starts at 0 and never skips: a hole makes `for...of` yield `undefined` (unlike `forEach`/`map`/`filter`, which skip holes and keep floor tests green) and kills every one of the ~110 room walks — that is how `systems/target_guide.ts` crashed the frame loop on Стенка, база ликвидаторов and horrorfloor. Room ids are also NOT entity ids: `roomMap` is `Int16Array` and the entity counter starts at 10000, so borrowing it (outer_district did) puts every id past the end of the array and `roomAt()` returns null for the whole floor — silently, with no crash at all. Locked by `tests/rooms-dense.test.ts`.
- No generator that seals a room without proving it is reachable.
- **Universal systems outrank puzzles.** Two systems are invariants of this world and every
  authored lock must yield to them: **PSI dephasing walks through walls**, and **the world is
  fully destructible** — anyone willing can break their own way in or out. Therefore
  «сюда без ключа физически не попасть» IS NOT AN ACHIEVABLE GOAL and must never be a design
  target: pursuing it breaks a universal system for one floor's benefit. A real lock means the
  bypass COSTS a resource — the key, a PSI charge, or a tool plus time, noise, witnesses and
  consequences. The only unacceptable state is a bypass that is **free and accidental**: the
  player strolls around through open corridors and never learns a lock existed. That is not a
  bypass, it is the absence of a lock. Reference point named by the owner: Caves of Qud — doors
  exist, and nothing stops you from smashing one or phasing past it.
  - Corollary for measurement: the honest defect metric is reachability **by ordinary walking**
    over passable cells with no locked door in the way. PSI and demolition are lawful bypasses
    and must stay OUT of that metric.
  - Corollary for tests: never assert «room is unreachable without X». Unreachability is
    guaranteed by nothing here.
  - Live case (2026-08-23): `cayley_byuro` measured 200/200 floors with all six graph windows
    reachable from spawn without a single locked door — `carveCayleyGraphField` cuts an open
    lattice of through-corridors and the macro graph between campuses is locked on 0.1% of
    edges. Григорий Кэли's key bought convenience, not passage. Owner ruled it a defect; the
    remedy is to route the ORDINARY path through the locked edges, never to seal the floor.
- **A floor never generates another floor's content.** A floor's `content_manifest.ts` may only call
  generators that belong to that floor. Violation found 2026-08-21: the collectors manifest calls
  `generateLiquidatorBaseArena` and stamps the liquidator base's 50×50 arena into the middle of the
  collectors — the single call site of that generator. The damage is not cosmetic: the arena is the
  floor's largest room by four times, it carpets 30% of its own floor with chairs, and furniture
  stamps path blockers, so residents and monsters cannot cross their own floor. Ownership by folder
  name is not ownership; ownership is the manifest that calls you. See `problems.md`.
- No permanent POI on LIVING without `aptMask` protection and a corridor/door connection.
- Feature-like gameplay must use the feature-first overlay contract: generate/map `Feature`, `Cell`, container or billboard primitives first, then attach or lazily resolve `InteractiveDef` behavior. Do not couple the number or placement of decor fixtures to interaction action code.
- `manifest.md` is implementation fact (README.md is the public page, not a source of truth). `desdoc.md` is roadmap and tone. Root domain docs such as `samosbor.md` and `save.md` describe active systems, and `problems.md` tracks problematic non-system mechanics. This file is the engineering contract.
- Save compatibility is not sacred. Breaking save shape changes should bump the save shape version and reject stale saves explicitly instead of carrying legacy migrations.

### Storage-Order Bias Is Forbidden

The project uses flat arrays and typed arrays because they are fast and simple, not because their insertion order should drive emergence. Any system that uses a cap must preserve the same simulation promise as an uncapped version would have at a larger budget.

Forbidden examples:

- routine AI checks only `world.rooms[0..95]`;
- arrivals, shelters or route systems use `anchors[0]` when no preference exists;
- economy, faction or quest code treats the first matching factory, zone, resource or NPC as the natural winner when the order is just registry/storage order;
- monster or NPC scans check the first N `entities` without an actor-local cursor, spatial index or deterministic offset;
- generation creates reachable gameplay only because a later full-map pass accidentally touches the early rooms first.

Allowed bounded patterns:

- actor-local rotating cursor or cached scan offset;
- deterministic start offset keyed by actor id, intent, floor key, seed or route id;
- spatial index/radius query with a cap, then score inside the result;
- reservoir or weighted sample before final scoring;
- full or broad candidate scoring followed by a top-N slice;
- explicit authored priority documented in data, such as plot step order.

Review requirement: when touching AI, A-Life, economy, factions, quests, migrations, shelters, route anchors, generation connectivity or broad runtime scans, search for `.slice(0`, `candidates[0]`, `.find(...)`, `SCAN_CAP`, `ROOM_CAP`, `ANCHOR_CAP`, `for (const room of world.rooms)` and `for (let i = 0; i < entities.length`. If the collection is not fully scanned or fully scored, the code must show why storage order cannot become gameplay behavior.

## 3. Layer Contract

The import order is:

```txt
core  ->  data  ->  entities  ->  world  ->  systems  ->  { gen, render }
```

Read the direction carefully, because it is the opposite of the phase order. Floor
generation happens *before* runtime in time, but in the import graph generators
CONSUME systems: 433 imports of `systems/territory`, `systems/surface_marks`,
`systems/events` and `systems/rpg` come from `gen/`. So `gen/` sits ABOVE `systems/`.
`gen/` and `render/` are peers — neither may import the other.

`scripts/check-invariants.mjs` enforces this mechanically as a ratchet: every known
violation has a baseline count, and the check fails both when the count grows and when
it shrinks without the baseline being lowered, so cleared ground cannot be silently
retaken. Run `npm run check:invariants -- --report` for the current listing.

Backward edges and cycles are separate metrics, and the script measures the largest
runtime-import cycle on its own line. Six backward edges between layers do not move it
at all; one edge did. `systems/samosbor.ts` imported `generateFloor` from
`gen/floor_manifest`, and that single edge held a cycle of 293 files. It is cut: the
floor generator now arrives by injection (`setSamosborGenServices`), the type
`FloorGeneration` is imported as `import type` and erased at build, and the cycle fell
to 106. A lazy floor registry instead of the 63 static imports in
`gen/design_floors/manifest.ts` was measured and gives nothing on top of that — the
same 106 — and it would break content registration, which is an import-time effect.

The rest of the way down was leaves and responsibilities, not keystones: the save-shape
constant moved to `core/save_shape.ts` and `markov_text` took its relation from
`data/relations` instead of `systems/factions` (106 → 36 → 10). The remaining ten were a
real tangle — `factions ↔ noise ↔ online_client ↔ online_protocol ↔ inventory ↔ permits
↔ crafting ↔ containers ↔ faction_events ↔ alife/squad_logic` — where no single edge
dropped it by more than three. Two ownership calls untied it (10 → 4):

- the delta vocabulary of the relation matrix (`applyFactionRelationDeltas`,
  `applyTheftRelationPenalty`, `applyRoomMemoryRelationPenalty`,
  `applyInfrastructureRelationResponse` and the `FactionRelationDelta` type) lives with
  the matrix in `data/relations.ts`. Permits, containers and emergency panels need to
  move a number in that matrix, not the rest of faction logic;
- clearing zone fog after a fog boss dies is `systems/fog_zone.ts`, a leaf. Combat no
  longer imports the whole samosbor module for one function.

What is left is 4: `ai/combat ↔ ai/monster ↔ ai/micro_goals ↔ ai/khorovaya_matka`. That
is mutual logic inside one subsystem — targeting, firing, micro-goals and the matka
reference each other on purpose — not somebody else's leaf, so it stays.

**Runtime `systems → gen` edges are now zero** (2026-08-16). The last three were the same
two classes as before: leaves filed under `gen/` (`pick`/`weightedPick` went to
`core/rand.ts`, `procedural_screens.ts` to `world/`) and one genuine layer inversion
(`regrowMaze`, which joined `generateFloor` in the `setSamosborGenServices` seam). The
ratchet still counts 3 because it is syntactic: all three are `import type FloorGeneration`
from `gen/floor_manifest`, erased at build. Driving that to zero means moving the type into
`core/types.ts` and touching ~70 importing files for a counter, so it stays where it is.
What this unlocks is the point: `systems/` no longer reaches into `gen/`, so the static
`import './content'` in `main.ts` can become a dynamic `import()` and the 63 floor
generators can leave the startup chunk. That is a separate change with its own risk.

**Точка сборки контента: `src/content.ts`.** Контент регистрируется побочным эффектом
импорта: генераторы этажей на верхнем уровне объявляют пакеты NPC, сайд-квесты, зоны и
наблюдателей событий. Пока дорога к ним шла через самосбор, реестр наполнялся у того,
кто случайно затянул самосбор (464 пакета), и пустовал у того, кто не затянул (101).
Теперь дорога одна и названа: `src/content.ts` — корневой слой, точка сборки, ей одной
разрешено видеть и `systems`, и `gen`. Она же ставит генератор в самосбор. `main.ts`
берёт её одной строкой; тест, которому нужен весь реестр, пишет `import '../src/content'`
и остаётся в юнит-гейте (прямой импорт из `src/gen/` уводит файл в негейтованный набор
generation — см. `tests.md`). Очерёдность внутри `content.ts` значима: она задаёт порядок
`NPC_PACKAGES` и `SIDE_QUESTS`, а от него зависит план населения A-Life.

**Слоты сюжетных личностей: `src/data/npc_plot_ids.ts`.** Числовой `plotNpcId` — не
идентификатор, а номер слота: им индексируются плотные массивы A-Life, по нему работает
диапазонный `isPlotNpc`, и он уходит в сейв. Раньше слот выдавался счётчиком в порядке
регистрации, то есть зависел от состава импортов. Порядок заморожен списком; пакет вне
списка получает слот за его концом, а `tests/content-registration-order.test.ts` следит,
чтобы таких не заводилось. Новый NPC дописывается В КОНЕЦ списка.

The recurring mistake this layer order exists to prevent: a leaf file — a registry, a
util, a set of operations over `World` — gets filed under whichever layer called it
first, and then everyone imports it. That single pattern produced 288 of the project's
backward edges across five files (`pixutil`, `sprite_index`, `path_blockers`,
`visual_cell_slots`, `ceiling_heights`); `procedural_screens` was the sixth, found in the
same way — it imports only `core/` and `data/`, and lives in `world/` now. Before adding a file to `gen/` or `render/`,
check whether it actually decides generation or drawing, or whether it is a leaf that
belongs in `core/`, `data/`, `entities/` or `world/`.

`core/`

- Owns primitive shape only: enums, interfaces, `World`, constants.
- Changes here are cross-project changes. They require an integration task.
- Prefer string ids in new definitions before adding enums.
- Render-only typed arrays such as `World.visualSlots` may live here only as primitive storage and dirty versions. They must not own render policy or gameplay semantics.

`data/`

- Owns declarative content: ids, weights, rewards, text, spawn rules, prices, recipes, variants.
- No world mutation here.
- No frame logic here.
- Definitions should be plain objects or readonly arrays.
- Visual mesh definitions live here as data-only registries: visual cell codes, model definitions, geometry profiles and surface profiles.

`world/`

- Owns operations over `World` typed-array storage: stamping and clearing path blockers, filling and resolving visual cell slots, deriving ceiling heights.
- Imports only `core/` and `data/`. Anyone may import it.
- A file belongs here when it reads or mutates `World` but is called equally by generation, runtime systems and render. `ceiling_heights` is the clearest case: it lived in `gen/` and had zero importers inside `gen/`.
- It is not a place for gameplay decisions, and not a second `systems/`. No cadence, no per-frame work, no event publication — just operations the callers invoke.

`gen/`

- Owns construction: rooms, corridors, POIs, initial NPC/item placement, floor-specific content.
- Content modules mutate `World` once during generation or samosbor rebuild.
- Agents should mostly add new files here.
- Floor-wide placement should use the shared placement field in `src/gen/population_placement.ts` instead of choosing ad hoc clusters.
- Routed design floors use `src/data/design_floor_population.ts` and `src/gen/design_floors/population.ts` for their broad NPC/monster fields after route-scale geometry is finalized; local generators still own named NPCs, authored encounters and floor-specific rooms.
- Monster packs are shared, not per-floor-family: `src/gen/monster_packs.ts` owns pack shape/member count and cell growth, and both the design-floor populate and `src/gen/procedural_floor.ts` call it. Biome affinity is keyed by floor theme tags (`MonsterEcologyQuery.floorThemeTags`), so one ecology table serves design floors, procedural floors and samosbor waves — see `ecology.md`.

`systems/`

- Owns generic runtime behavior.
- Systems must consume definitions, not hardcode one module.
- Systems must publish important state changes through `publishEvent`.
- Camera modes belong in systems and resolve to small view data: position, yaw, pitch shear, height and FOV. They are transient unless a future feature explicitly defines persistent camera data and save caps.
- Runtime floor memory is a systems concern. Route stop identity, visited keys and lift anchors are generic route facts; generators provide initial worlds, and route lift normalization may carve a bounded access connector when that is needed to preserve same-coordinate lift continuity between adjacent floors.
- A-Life population is a system concern, not generator state: generators may create ambient NPC templates, but `systems/alife.ts` assigns persistent procedural NPC identity and decides which live NPCs exist on the active floor.
- Cell territory ownership is a systems API: runtime owner reads use `territoryOwnerAtIndex()`, `territoryOwnerAt()`, `territoryFactionAt()` or `territoryRoomOwner()`, while runtime writes use `setTerritoryOwnerAtIndex()`, `setTerritoryOwnerAt()`, `paintRoomTerritory()` or bounded `paintTerritoryDisc()` and then sync affected zone metadata.
- Shared AI navigation should stay field-based at runtime: `systems/ai/pathfinding.ts` bakes the current 1024x1024 world geometry into a reusable BFS navigation tree, then layers cached behavior flow fields over target source sets such as kitchens, toilets, workplaces or shelters. New generic AI behaviors should provide a source set and reuse that field layer instead of queuing per-actor BFS jobs.

`render/`

- Reads state and draws.
- Consumes `CameraView` from systems; it must not decide which camera mode is active.
- Visual feature additions should be data-indexed: texture id, sprite id, mark type, HUD flag.
- Item visuals derive from `defId` through the procedural item sprite renderer; do not store static item sprite ids in save payloads.
- The render-only mesh pass is documented in `mesh.md`. It reads `World`, `CameraView`, `visualSlots`, features, containers, corridor topology and resolved floor/generator profiles, then draws bounded low-poly corridor-covering/voxel detail after the raycaster and before sprites. It must not mutate gameplay, collision, save or floor memory truth.
- Do not put gameplay decisions here.

### Critters And Ambient VFX

Rewritten 2026-08-22. **Живность — чистая функция от полей мира, а не популяция.** Особи не существуют ни в памяти, ни в сейве, ни в `entities`: пул и его CPU-цикл сняты целиком.

- Инстансов ровно `block² × perCell` (`src/render/critters.ts`, 24 клетки на десктопе, 14 на тач-устройстве, 3 слота на клетку). Каждый берёт СВОЮ клетку из блока вокруг игрока и решает сам, кто он и есть ли он вообще.
- Решение принимается в вершинном шейдере (`src/render/critters_pass.ts`) по уже загруженным на GPU полям: `uCells`, `uFeatures`, `uLight` и `uDanger` (`world.dangerField`). Вектор признаков клетки — `[blood, food, filth, dark, glow, cover]`; вид — вектор весов по тем же осям (`src/data/critters.ts`). Совпало — особь родилась, не совпало — вырожденный треугольник.
- Из этого следует контекстность: мухи там, где поле трупного запаха, тараканы там, где плита и темно, мошка у ламп, паук в углу из стен. Никто никого не «расселяет», изотропность невозможна по построению.
- Игрок отталкивает живность полем без состояния (`fleeRadius`): подошёл — прыснула, отошёл — вернулась. Сквозь стену не убегает.
- Свет считается там же теми же слагаемыми, что у спрайтов (запечённый + ambient + фонарь + ближний свет глаза, кривая 1.32). CPU-зеркала освещения нет.
- Набор видов этажа — `DesignFloorRenderProfile.fauna` в `src/data/design_floor_profiles.ts`, рядом с `ambientLight`. Отдельного реестра нет. Пустой список = безжизненный этаж (Пустота), отсутствие поля = `DEFAULT_FAUNA`.
- Раздавить конкретную особь нельзя: её нет. Хруст под ногой (`updateCritterCrunch`) проверяет ОДНУ клетку на шаг игрока по тем же признакам.
- Future ambient life should follow this pattern: поля мира на GPU + веса в данных, а не пул объектов на CPU.

### Target Reachability Contract (2026-08-24)

**Всякий источник цели обязан отдавать ПРОХОДИМУЮ клетку — включая свою запасную ветку.**

Признак нарушения узнаваем: основная ветка проверяет `world.solid`, а фолбэк возвращает
«разумную» точку без проверки — центр комнаты, центр ячейки, точку спавна. Отказ при этом
не наблюдаем: `tryAssignPathToCell` на непроходимой цели возвращает пустой путь, драйв
честно уходит, и актор просто занимается чем-то другим. Ни ошибки, ни лога, ни падения
теста — дефект живёт годами и читается игроком как «они тупят».

Найдено дважды за один заход, оба раза в самых широких ярусах:

- `fields/macro.ts` отдавал геометрический центр ячейки 16×16, проверив лишь «в ячейке есть
  хоть одна не-стена». Центр в бетоне на **61%** ячеек жилого этажа и **99.7%** квартир
  (там шаг сетки квартир совпал с шагом яруса) — стратегический ярус был мёртв целиком, а
  с ним охота, стая, кучкование, «идти на выстрелы» и разбег кочевника. Лечение: ячейка
  хранит ПРЕДСТАВИТЕЛЯ — ближайшую к центру проходимую клетку, запечённую тем же проходом.
- `ai/pathfinding.ts` `roomTargetCell` отдавал центр комнаты вслепую в обеих запасных
  ветках. Этим ярусом пользуются все телесные нужды и весь распорядок.

Следствия для правок:
- фолбэк проверяется той же проверкой, что и основная ветка, — иначе он не фолбэк, а дыра;
- перебирать прямоугольник комнаты или ячейку целиком НЕЛЬЗЯ (это перебор на актора);
  бери ограниченное число проб низкорасходящейся последовательности;
- **`goldenFrac(id, salt)` для нескольких проб подряд НЕ ГОДИТСЯ: у соли период два.**
  Восемь проб посещали две-три клетки. Для набора точек нужна R2 или равносильная ей.

Замки: `tests/target-not-in-concrete.test.ts` (проверяет РАССЕЯНИЕ проб, а не вероятность
удачи), `tests/phantom-doors.test.ts` (родственный класс: клетка-дверь без записи в
`world.doors` сплошна навсегда, при том что навигация считает её проходимой).

### Actor Intent Contract (владелец, 2026-08-24)

**Чем актор занят — это его ДРАЙВ, и другого источника истины нет.** Спрашивать надо
`actorDrive(e)` (`systems/actor/brain.ts`), а не поле состояния.

- `AIGoal` — словарь старого слоя. Он **умирает вместе с `ai/npc_fsm.ts`**; заводить на
  него новых читателей нельзя, существующих — переводить на драйв.
- `npcState` остаётся, но понижен до **ПОЗЫ**: он нужен анимациям (`render/animations/
  resolver.ts`), подбору реплик (`markov_dialogue.ts`, тег `state.${npcState}`) и ответу
  игроку. Ставится драйвом через `arrivedState`. Это НЕ намерение и не решение.
- Дешёвый обход «пусть ядро дублирует намерение в `ai.goal`» отвергнут владельцем
  осознанно: два словаря одного и того же неизбежно расходятся, что и произошло.

Признак нарушения: чтение `ai.goal` в любом файле, кроме самого `npc_fsm.ts`, пока тот
жив. Живой пример класса, ради которого правило и записано: ядро ставит `npcState`, но не
`ai.goal`, а ответ NPC на вопрос игрока «чем занят» читает ОБА — и половина населения,
уже живущая под ядром, отвечала про дело, которого не делает.

### Species Property Contract

Established 2026-08-20. **A species declares its property as data, not as core state.** The contract has three parts and no exceptions by default:

1. **Flag in `aiFlags`.** The behaviour is expressed as a `MonsterAIFlag` against a generic rule that the shared loop already knows how to run. Add a flag only when it is generic enough for more than one content case.
2. **Sprite in its own file.** `src/entities/<id>.ts` owns `DEF` and `generateSprite()`. A generator may take another baked sprite as its base and draw procedural detail over it (`getGeneratedArtSprite`, 128x128, resampled by `createSpriteTexture`), but it must have a fully drawn fallback if the art is missing.
3. **State in a `WeakMap` keyed by `Entity`, next to the species logic — never in `AIState`.**

Forbidden: a field in `AIState` (`src/core/types.ts`) added for one species, and a species-owned `update<Species>()` function inside the shared `src/systems/ai/monster.ts`. `AIState` is carried by **every entity in the world**, including dropped items and projectiles, so a field added for one monster is paid for by all of them. `core/types.ts` is a RED integrator-owned file precisely because of this cost.

Prefer reusing an entity field that already exists before adding one: `monsterStage` already carries two-mode species (Head Slug, Black Liquidator), `AIGoal` carries goals, and shared threat memory (`getRecentCombatThreat`) already answers "was I hit recently" without a per-species flag.

Reference implementations: `weepingAngel` (Sculpture) and `looksLiquidator` (Black Liquidator — one line in `isHostile`, `src/systems/factions.ts`). `WeakMap` state: Sobrannyy, Slime Woman, Green Dog, Fog Shark, Nightmare. A `profile.id === '<species>'` check in a shared layer is tolerated where nothing else works, but it is the first symptom of the same disease and never justifies a new core field.

The 2026-08-20 cleanup that established this contract removed 25 fields from `AIState` and about 800 lines from `ai/monster.ts`. The census of the species clusters still sitting in `AIState` is in `problems.md`, «Механика одного вида, размазанная по ядру».

### Mesh And Fine Blocker Boundary

`mesh.md` is the active contract for the shipped decorative mesh pass.
`block.md` tracks 8x8 subcell gameplay blockers. The shipped first pass uses
core `World.pathBlockers` storage, explicit data definitions, generation-time
feature/container stamping and shared coarse+fine movement occupancy. Projectile
blocking, movable furniture, debug overlays and subcell pathfinding are still
future work.

These systems must stay separate:

- `World.visualSlots` and visual model bounds are render inputs, not physical blockers.
- Path blockers use an explicit gameplay field and must use explicit blocker definitions when object stamping is added.
- A generator may stamp both a visual slot and a blocker for the same table only through explicit mappings.
- Renderer code must never own collision, pathfinding or movement decisions.
- Fine blockers must not turn active-floor pathfinding into a full subcell graph; coarse route/path fields remain cell-level unless a later measured task proves a need for local steering.

### Field Generation Contract

The 1024x1024 floor is a toroidal field. Floor generation should first build the designed structure, rooms, zones, lifts, POIs and authored anchors, then derive one or more smooth placement fields from that completed world state.

Use `src/gen/population_placement.ts` for floor-wide scattering:

- A `PlacementFieldProfile` combines room weights, zone weights, optional anchors and procedural value noise.
- The field is a dense 1024x1024 `Float32Array` over floor cells and is smoothed locally through neighboring floor cells.
- Sampling uses coverage strata over the whole floor so high weights create broad density gradients instead of hard piles.
- This is generation-time field sampling, not runtime buckets, not per-cell spawn caps, and not a content-specific exception.

Special rooms and authored POIs should influence the field with weights or anchors. They should not own broad population placement by directly pushing hundreds of entities into a small room or arena. Local scripted encounters can still spawn bounded local groups when that group is the gameplay object.

### Damage Door Contract

Здоровье актору снимает **одна функция** — `damageActor` (`systems/combat_stimulus.ts`). Она делает
весь ход: тип урона и броня, толчок, сообщение жертве о том, кто ударил, штраф отношениям, смерть.
Прямое вычитание `hp` у чужой сущности вне белого списка валит `npm run check:invariants`.

Почему дверь, а не помощник: до неё общий `applyDamage` только СЧИТАЛ число, а применяли, толкали и
сообщали вызывающие — пять шагов, которые надо было помнить. Не помнили: `notifyActorDamaged` знали
три файла из всех, снимавших здоровье, и жертва просто не узнавала, кто её ударил. Молчание было
поведением по умолчанию, а не исключением.

Что дверь НЕ делает и почему:

- **Не объявляет смерть игрока.** У неё своя дорога — щит, продолжение за другое тело, камера смерти,
  — и флаг `alive` там не поднимают вовсе.
- **Не обрабатывает смерть сама.** Лут, опыт, кровь, квесты и A-Life принадлежат точке сборки;
  обработчик приходит инъекцией `setActorDeathHandler`, как самосбор получает генератор этажа.
- **Не требует автора.** Голод, обвал, газ, поезд и самосбор бьют без виновника: `attacker` не задан,
  и винить некого — это полноправный случай, а не недосмотр. Требуй дверь автора, эти вызывающие
  пошли бы в обход, и молчание вернулось бы.

Белый список инварианта — не поблажка, а перечень мест, где урон безавторский по природе либо где
здоровье не отнимают, а восстанавливают (лечение, загрузка сейва, синхронизация A-Life и сети).

### Region Routing Contract (2026-08-26)

Маршрут между регионами отвечает ОДНА дорога: резидентный граф смежности регионов плюс LRU
колонок следующего шага, считаемых по требованию (`installRegionGraph`, `regionColumnFor`,
`computeRegionNextColumn`). Плотной матрицы всех пар `R×R` больше нет.

Почему снята. Матрица стоила `R²·2` байта и держалась ради O(1) следующего шага, а мобильному
устройству подсовывался «облегчённый» обходной путь. Замер снял ставку «desktop heaps swallow
that»: жилой этаж 1132 МБ, квартиры 1720 МБ при R≈28 тысяч. Вкладка Chrome умирала по OOM без
единой строки в консоли — владелец ловил это регулярно, особенно под профайлером, который
добавляет свои буферы.

Чем доказано, что дороги равноценны. 300 пар старт→цель на двух этажах: исход (достижимость)
совпал 300/300; длины расходятся СИММЕТРИЧНО (жилой 87 длиннее / 87 короче, квартиры 73/67),
средняя длина маршрута +0.0% и −0.0%. Это разный порядок обхода при равной цене, а не худшие
маршруты. Кадр: p50 +2–11%, p95 от −2% до +24% (на жилом это +0.35 мс при бюджете 16.7 мс).
Память: жилой 1210 → 288 МБ, квартиры 1868 → 311 МБ, коллекторы 768 → 234 МБ.

Вместе с матрицей удалён воркерный пул (`nav_worker_pool.ts`, `nav_worker.ts`): он существовал
ТОЛЬКО чтобы строить её на нескольких ядрах. Параллелить стало нечего — граф смежности строится
за миллисекунды, а колонки считаются в игре порциями по кадрам (`LOWMEM_COLUMN_BFS_PER_FRAME`).

Флаг `useLowMemNav()` остался, но означает теперь ОДНО: устройство с малой памятью, которому
нельзя отдавать 64 МБ на поведенческое поле потока. Маршрутизацию он больше не выбирает. Раньше
один флаг решал два независимых вопроса, и это была развилка, из которой вырастает «на мобильном
другая игра».

Бюджет колонок — 128 МБ, рацион холодных BFS — 4096 на кадр. Оба числа замерены на квартирах
против той самой матрицы, а не выбраны:

| | «без маршрута» у NPC | updateAI p50 |
| --- | --- | --- |
| плотная матрица (1866 МБ) | 3.5% | 14.610 |
| колонки, рацион 32 (304 МБ) | **16.8%** | 15.656 |
| колонки, рацион 512 | 9.7% | 15.010 |
| колонки, рацион 4096 (422 МБ) | 3.5% | 15.079 |

Первая редакция ставила 8 МБ и рацион 32 — и это была не экономия, а поломка навигации: каждый
шестой житель в любой момент оставался без маршрута. Виноват был РАЦИОН, не память: отказ не
бесплатен, актор просит снова в следующем кадре, и скупой рацион сам порождает лавину повторов
(24 867 отказов на 38 612 запросов). Кадр он при этом не спасал — между 32 и 4096 разница 0.6 мс.

Бюджет выбран по колену кривой: 64→128 МБ стоит 47 МБ и покупает 11.4 п.п. попаданий, дальше
165 МБ покупают 7 п.п. Потолок попаданий 56.1% и лежит не в кеше — каждая ЦЕЛЬ стоит один BFS в
первый раз, сколько памяти ни дай. Вторая крышка (`SLOTS_MAX`) снята: ограничитель один — байты.

Крышка кеша полей потока — 4. Одно поле это `Int32Array(SW²)`, 64 МБ, поэтому крышка задаёт
потолок памяти напрямую. Замерено на четырёх этажах: пик рабочего набора ДВА (жилой 1, квартиры 2,
министерство 1, коллекторы 1). Было 16, то есть потолок в гигабайт.

### Entity Death Contract (2026-08-25)

Сущность гасит **одна функция** — `killEntity` (`systems/entity_death.ts`). Она ставит `alive = false`
и двигает эпоху смертей. Сырое присваивание `alive = false` вне этого файла валит
`npm run check:invariants`, разрешено ноль.

Это тот же приём, что у створок (`setDoorState` и `world.doorVersion`), и заведён он по той же
причине. Смерть известна тому, кто её делает, и неизвестна тому, кому она нужна, — значит её
приходится ИСКАТЬ. Индекс сущностей и искал: полный обход статики каждый кадр симуляции. На жилом
этаже это 9795 сущностей, из которых с `ai` всего 227, ради события, случающегося раз в несколько
секунд. Замерено: 401 мкс на кадр, 24 мс/с. С эпохой — 227 мкс и 13.6 мс/с; остаток честный, это
динамика, и она двигается каждый кадр.

Чего дверь смерти НЕ делает — ровно то же, что и дверь урона: не раздаёт лут, не начисляет опыт, не
трогает A-Life и квесты. Обработка смерти принадлежит точке сборки, дверь лишь объявляет факт.

Асимметрия, о которой надо знать: динамику (актёров, снаряды) кадр перебирает целиком и сейчас,
поэтому сырое присваивание там сработало бы. Единый путь всё равно один на всех — две породы смерти
это ровно та развилка, из которой потом вырастает призрак в бакете. Пропущенное место не падает и не
шумит: подобранный предмет остаётся в бакете навсегда, и наткнуться на него можно только в игре.
Поэтому проверка механическая, а не дисциплина.

### Entity Id Contract

Номер сущности выдаёт **один владелец** — `gen/entity_ids.ts`. Генератор этажа зовёт
`newEntityIdCursor()` (или `firstRuntimeEntityId()` для голого счётчика) и продвигает счётчик
`syncNextEntityId()`; собственного стартового числа у этажа нет и быть не может. Этаж по-прежнему
заполняет себя сам — своя геометрия, свои люди, свой контент; общими стали только выдача номеров и
проверка.

Два правила, и оба про то, что номер — это адрес:

- **Номер уникален на этаже.** Два тела под одним номером расходятся во мнениях: `EntityIndex.byId`
  отдаёт одно, `Array.find` — другое. Так панель диалога всех авторских жителей квартир и
  коллекторов рисовалась из листовки, пока её же кнопки работали с настоящим человеком.
- **Обычная сущность не садится в `1..getPlotNpcCount()`.** Там номера слотов сюжетных личностей: их
  читают A-Life, сейв и `isPlotNpc`. Самозванец в этом диапазоне вычищается как «переехавший» — так
  с ада каждую загрузку пропадали пять авторских NPC, — а его смерть навсегда пишет в сохранение
  флаг «эта личность мертва».

**Неположительный номер — не адрес, а заготовка.** `id <= 0` — метка шаблона обычного жителя, по
которой `isAmbientNpcCandidate` (`systems/alife.ts`) узнаёт, кого материализовать из пула A-Life;
настоящий номер такой человек получает при материализации. Процедурные этажи ставят так ВСЁ своё
население, дизайн-этажи метят шаблон отсутствием имени. Выдать заготовке номер — значит сделать её
обычным жителем без личности: этаж перестаёт брать людей из пула и начинает усыновлять новых
(замерено: 1954 новых человека за визит вместо 1147 из пула). Поэтому обе проверки ниже заготовки
пропускают.

Замок двойной: `enforceUniqueEntityIds` стоит на выходе `generateDesignFloor` и
`generateProceduralFloor` (вне браузера падает, в браузере молча перенумеровывает — платить за чужую
опечатку игроку не за что), а `npm run check:invariants` запрещает заводить счётчик числом где бы то
ни было в `gen/`. Отдельные пространства номеров — комнат, контейнеров — сюда не относятся.

**Номер сущности не означает личность.** Личность живёт в `alifeId` (слот) и `npcPackageId`; `id` —
просто адрес тела. Раньше доставка выдавала авторскому человеку `id`, равный слоту, и на этом
совпадении держалась вся адресация: сотня мест читала `entity.id` там, где имелась в виду личность.
Правило теперь одно — **личность спрашивают у `alifeId`**, канонический предикат `isPlotNpc`
(`data/plot.ts`), поиск живого человека по слоту — `EntityIndex.byAlifeId`.

Отдельно про сохранение: `Quest.giverId`, `Quest.targetNpcId` и `deadPlotNpcIds` хранят **слоты** —
и хранили всегда. Но поле `giverId` по природе двух видов: авторское задание адресует слотом,
процедурное и контрактное — номером живой сущности, потому что личности за ним нет. Различает их
`questAddressesBySlot()` (`systems/quests.ts`), и спрашивать обязан каждый читатель: перебор
«сначала по номеру, потом по слоту» находит чужого — предмет с тем же номером лежит в массиве раньше
человека.

### Authored NPC Delivery Contract

Authored people arrive on a floor by one rule and one rule only: **the package registry decides the
cast, `placement.homeFloorKey` decides where.** `generateDesignFloor` closes every floor with
`deliverFloorNpcPackages` (`gen/plot_npc_spawn.ts`), which walks the registry and places everyone who
declared this floor and whom the floor module did not place itself. Modules still position their own
people precisely — in their room, in their pose, next to their scene — and almost always do; the
shared step only stops a forgotten spawn line from deleting a character from the game. Before it,
that is exactly what happened: Олевия Кибер with her quest and seven authored residents were
registered and never placed, and nothing said so.

Two consequences follow, and both are contracts:

- `homeFloorKey` is a delivery address, not a caption. Declaring the wrong floor now puts the person
  in the wrong place instead of nowhere. `presence: 'event_only'` opts out — that person arrives with
  an event, not with a floor.
- An NPC-free route floor is exactly that: **nobody**, authored included. The Void carries no people
  at all — `withoutNpcEntities` stays the single strict filter, and there is no second «keep the
  authored ones» path to reason about. Nobody stands there, and no identity is kept for the place
  either: the package that used to live in the Void cell is gone from the registry.

A `PLOT_CHAIN` step may therefore have **no giver at all** (`giverId` is optional). Such a step is
granted by the chain itself the moment the previous one closes — the player kills the heralds,
descends, and the journal updates without a conversation — and it closes on the deed, because there
is nobody to report to (`checkQuests` runs a `giverless` quest down the same branch as a contract;
the quest carries `giverId: -1`, the value the save sanitizer already uses for «no giver», and
`sourceLabel` for the journal's «От:» line). No floor hook, no event_only identity, no second
system: an unmanned step states that it is unmanned, and the chain does the rest.

Both directions are locked by `tests/npc-home-floor.test.ts` over all design floors: declared home
equals actual floor, and everyone who declared a floor is on it.

### Floor Scene Contract

A floor scene is a **declaration, not code**. The floor lists actors and beats; one shared player
(`systems/cinematics.ts`) acts them out. A scene has no combat of its own, no death of its own and no
resettlement of its own — it places people, gives them a line and points the camera. Everything else
is done by the same systems that run without a spectator: AI fights on its own, A-Life remembers the
dead, the relation matrix decides who shoots whom.

The load-bearing rule follows from that: **a beat may not assign an outcome.** `defect` changes a
faction and then it is whatever it is; `awaitDeath` WAITS for a death with a `timeout` ceiling, it
does not cause one. A scene that writes down the result of a fight is a cutscene, not a world event.
`maxSeconds` is a camera fuse, not a plot guarantee — a scene ending early leaves the floor in
whatever state the fight produced, and that is an acceptable outcome.

Ownership and boundaries:

- **The camera arrives by injection.** The runtime camera lives in the entry point, so `main.ts`
  calls `bindSceneCamera(runtimeCamera)`; importing it from `systems/` would create a `systems → main`
  edge. Without a bound camera scenes simply do not play — no fallback path, no second owner.
- **The anchor is a named room, not a coordinate.** `anchorRoomAlias` is matched against `room.defId`,
  the same exact lookup the named-room table uses. It is resolved locally in `systems/` on purpose:
  `gen/` sits ABOVE `systems/`, so importing the named-room helper here would invert the layer.
- **`release` is mandatory, and it is why.** `updateAI` skips every actor whose `role` is
  `NpcRole.CINEMATIC_ACTOR` outright (`systems/ai/index.ts`) — while the role is on them they do not
  scan, walk or shoot; they are scenery. Without a `release` beat "the fight then runs by the normal
  rules" is impossible. `endScene` releases everyone unconditionally, so a scene cannot leak a frozen
  actor into the live floor even if it times out mid-beat.
- **`depart` is leaving, not dying.** State is folded back into A-Life, the record moves to another
  floor key, the entity is spliced out. Setting `alive = false` there would make the corpse sweeper
  record those people as permanently dead.
- **The scene does not create identities behind A-Life's back.** `packageId` calls an authored
  resident who already lives on this floor; `source: 'alife'` materializes existing pool records;
  only anonymous crowd filler is spawned outright, and it is spawned as scenery under the actor role.
- Played scene ids persist (`playedScenes`, capped), so `first_visit` means first visit per run and
  survives save/load. `state.sceneLock` is the single input gate; systems must not add a second one.
- **A scene must be abortable from outside, and every world boundary must abort it.** `abortFloorScene(state, entities)`
  drops the active scene, clears `sceneLock`, releases the actors with their own roles and returns the
  camera to the player. It is called on death continuation, on `switchFloor` and on `loadGame`
  (`main.ts`), and by `resetFloorScenes` — the three ways a scene can lose the world it was playing in.
  Order matters at two of them: on a floor switch the abort runs **before** A-Life fold-back, or actors
  ride into their records wearing a scene role that does not exist on the new floor; on load the abort
  runs before `restoreFloorScenesFromSave`, so the run being discarded cannot leave a lock behind. A
  missing abort does not corrupt data — it locks input forever, which is worse.
- **Scene actors are not bodies.** `randomDeathContinuationNpc` (`main.ts`) skips
  `NpcRole.CINEMATIC_ACTOR` candidates: a `depart` beat may legitimately take that actor off the floor,
  and the player would ride along. `depart` itself skips `isPlayerEntity` for the mirror reason —
  someone who became the player mid-scene must not be spliced out of the world by a beat.
- **The scene role never reaches A-Life.** `depart` calls `releaseNpcFromScene` **before**
  `captureAlifeFloorState`, and `captureEntityToRecord` normalizes the role anyway
  (`alife.md`, `save.md`). Two layers on purpose: the beat can be reordered, the record cannot lie.

Edge cases are locked by `tests/floor-scene-edges.test.ts`.

New scenes are content, not engine work: register a declaration, anchor it to a named room, and add
no branch to `main.ts`.

### Observer-Owned Detection

Detection range is a property of the **observer**, never of the observed and never of the player.
`tryFactionCombat` (`systems/ai/combat.ts`) computes it from how ready for a fight the actor is and
how far their weapon reaches — `max(brave ? NPC_CHASE_RANGE : NPC_COMBAT_RANGE, weapon maxRange)` —
plus a forced-target widening when the actor was just damaged. It takes no `player` parameter.

The previous shape read `hostileToPlayer ? NPC_CHASE_RANGE : ...`, and it broke the world twice over:
sight distance came from an actor's relation to the player rather than to whoever they were looking
at, so in one fight the player-hostile side saw eighteen cells and the friendly side eight; and it
switched on the mere presence of the player on the floor, so the world behaved differently depending
on whether anyone was watching.

The same rule bans the monster-side counterpart. There is no "prefer player" pass: a monster does not
re-measure the distance to the player after target selection, and nothing may bypass the ray check,
the scan cadence or hostility on the player's behalf. Special appetites belong in the target-choice
function that owns them (documents, meat, blood, scent, threshold, mask) and must be written about
**any bearer of the trait**, not about one face. Non-goals of this rule: hostility itself is still
faction matrix plus the directed personal-enmity edge (`isDemosPersonalEnemy`, injected per frame via
`setFactionsSocialContext`), and damage-driven retaliation still overrides passive ranges.

This generalizes: any system asking "how far is the player" as a proxy for "is this happening" is
suspect, and so is any system appending the player to a result set that was already capped. Shipped
consequences of the same rule:

- caravans: samosbor fate read from `world.fog` under the caravan, off-floor runs continue instead of
  being declared raided, spawn anchored on an eligible member rather than the camera;
- faction events: sector weighted by contested territory, population and danger; anchor is the sector
  HQ, not the player's cell; `sawPlayer` is an observation, not a spawn condition;
- emergency shelter: a room is scored by who already sits in it (`isHostile` / faction friendliness),
  and the per-actor shelter jitter no longer mixes in `playerRelation`;
- actor tactics: the player is not re-added to sense facts after the capped index query — he has to
  fit through `scanCap` like everyone else, or a monster in a crowd always sees him and loses his
  neighbours;
- lift-anomaly rumours spread from the lift, and `ContextSnapshot` no longer carries `playerDistance`.

The player-facing exceptions that remain are deliberate and narrow: log lines written in second
person, the HUD, the camera, and debug forcing commands. A message being player-only is fine; a
world fact being player-only is the bug.

### A-Life Integration Contract

Persistent A-Life is a pillar system, not another spawn table. The shipped target is a seed-sized population around `100_000` procedural NPC identities on every supported runtime, with `131_072` as technical capacity. Future work must preserve that as a compact persistent identity pool instead of promising a million fully simulated live actors.

The identity boundary is:

- `systems/alife.ts` owns ordinary human NPC identity, death, changed-record overrides, floor assignment and materialization.
- `systems/plot_trace.ts` owns the dead-plot-NPC diary: item shape, the death-time attach and the world spawn. It knows nothing about the quest chain — `systems/quests.ts` reads the single predicate «его дневник у меня» in three places and repairs itself. The direction is one-way (`quests → plot_trace`); do not import quests from it.
- `systems/npc_relations.ts` owns personal NPC relation constants and helpers; faction systems consume it for hostility and penalties instead of duplicating thresholds.
- `gen/` owns geometry, rooms, POIs, monsters, loot and placement templates.
- `systems/ai/` owns behavior for live actors only.
- `systems/events.ts` owns public facts that other systems can react to: deaths, rank changes, migration, family consequences, missing quest givers and population events.
- `render/` reads A-Life facts for display and must not decide who exists.

Activation lifecycle:

1. Run start builds the route-aware population plan, then creates or restores the deterministic A-Life pool.
2. Floor generation may create ambient ordinary NPC templates.
3. Floor activation removes those templates and materializes existing A-Life records into their slots.
4. Active-floor AI, combat, trade and quests run on the materialized entities.
5. Floor transition, samosbor rebuild and save fold touched live state back into the pool.
6. Death marks the persistent identity dead. The missing person is not replaced by refill logic.

Materialization is slot-based. If a floor has thousands of assigned A-Life records, that does not mean thousands of live `entities` must be pushed into the runtime array. The active floor is bounded by generation templates, placement fields, authored anchors and explicit events. Dead slots stay empty unless a named event migrates or introduces a specific person.

Ordinary background refill is forbidden:

- No timed refill-to-cap for human NPCs.
- No generator-side identity creation after A-Life materialization.
- No silent replacement of a killed persistent person.
- No monster refill just because a count dropped.

Allowed new actors must declare their reason:

- Samosbor, lift, quest, faction, caravan, hack backlash or authored event actors may spawn as bounded encounters.
- If such an actor is an ordinary person who can persist after the event, they should be assigned or reserve a persistent identity.
- If the actor is temporary pressure, the event system owns its lifetime and it must not masquerade as population refill.

Quest and authored NPCs should migrate toward the same identity model. Current `plotNpcId` keys are stable authored identity; future quest logic should prefer `persistentNpcId`/reserved A-Life ids over transient live entity ids. Any suitable persistent NPC can be a quest source; "quest giver" is a current role/affordance, not a separate NPC caste. Killing a quest giver is a world fact and should be resolved through data-defined fallback content, not by respawning the same giver.

Personal relation is separate from faction relation but uses the same hostile threshold. A materialized NPC initializes `playerRelation` from its faction attitude plus deterministic fluctuation; player damage lowers the individual relation, and quest completion raises the giver's personal relation more than the faction's small normal gain. The field must fold back through A-Life overrides so grudges and gratitude survive floor travel.

The player is also an A-Life actor for shared social math: `karma`, kill counters and rank score live on the current player entity, with `playerRelation = 100` for self-relation. The native player body is not counted as an ordinary NPC pool slot, but the top-100 A-Life rating includes the player with a real rank among alive persistent NPCs. Systems that need "the player right now" should use the runtime `player` entity or `isPlayerEntity()` identity check; systems that need the native body/save identity should resolve `persistentNpcId: 'player'`.

Off-floor NPCs are frozen by default. They do not pathfind, fight, tick needs, scan rooms or update per frame. Only bounded aggregate events, migrations or slow batch passes may change off-floor state, and those changes must be recorded as compact facts or overrides.

Cleared floors remain meaningfully changed, but they are not sealed forever. They can receive explicit migrants, overflow residents, caravans, refugees or faction arrivals. If such migration reaches the active floor, new arrivals should enter through believable anchors such as lifts or route entrances.

Current implementation gaps are explicit: generated contract givers can still be transient or synthetic ids instead of stable `persistentNpcId`; some authored plot NPC generators still use `plotNpcId` live actors instead of fully materializing from reserved A-Life records, though the Hell holdout Major Grom arrival now binds to its reserved A-Life record; there is no separate slow off-floor A-Life batch for family/friend/rank consequences yet.

The save model is deterministic pool reconstruction plus sparse state:

- Save seed, population version/count, up to `65_536` dead procedural ids, dead plot ids and bounded changed-record overrides.
- Do not serialize the full live `entities` array.
- Do not serialize every full NPC record when seed reconstruction is enough.
- Any change to population allocation, route floor keys, required identity fields or plot/reserved id mapping must bump save shape or explicitly reject stale saves.

### Floor Memory Contract

Route stop identity is string-keyed and shared by floor memory, A-Life, map-editor patches, route cues, events and debug:

- Story anchors use `story:<id>`.
- Authored design route floors use their `DesignFloorId`.
- Procedural route stops use their `ProceduralFloorSpec.key`.
- Numbered lift anomalies use `floor_instance:<id>`.

Ordinary lift travel regenerates the target route stop deterministically from the run seed — the floor is a pure function of `(runSeed, z)`, so a revisit rebuilds byte-identical geometry rather than restoring a parked copy. On departure, `main.ts` folds the floor's NPCs back into A-Life and drops the `World`; on arrival it runs the generator from the route seed. (Only save/load touches `systems/floor_memory.ts`, and only for the single active floor.) Story and design floor manifests seed-scope their generator calls from the same run seed; new generation code should prefer explicit `RandomSource` inputs or stay inside that manifest seed scope. Regeneration is not a global decal/entity layer: a mark, opened door or monster on `story:living` cannot appear on a design or procedural route stop unless that stop separately produced it.

Samosbor semantics are update-in-place from the memory system's point of view on every floor. The shipped path is floor-wide: `updateSamosbor` launches 6..14 simultaneous fronts (`FRONT_MIN_COUNT`/`FRONT_MAX_COUNT`, `src/systems/samosbor.ts`) from spread-out source cells, mutates geometry in real time, and at the end splices the touched cells against a fresh generation through `applyFrontFieldStitch` and the same two-phase loading gate used by heavy transitions. The bounded local wave in `src/systems/samosbor_wave.ts` exists and is fully implemented, but `startSamosborWave` has exactly one caller — `debugStartSamosborWaveAtPlayer` — so local splice is currently a debug/experimental path, not the live one. The post-samosbor active world simply stays the authoritative state for the current key; there is no separate parked copy, and it is what the browser save delta-encodes if the player saves on this floor. Timing is route-depth based and the constants live in `src/systems/procedural_floors.ts`: active duration ranges from `SAMOSBOR_DURATION_MIN_SEC = 20` seconds to a depth-scaled cap of `SAMOSBOR_DURATION_MAX_SEC = 5` minutes at `abs(z)=50`, while cooldown is the inverse random interval from `SAMOSBOR_COOLDOWN_MAX_SEC = 25` minutes near `z=0` down to `SAMOSBOR_COOLDOWN_MIN_SEC = 45` seconds at `abs(z)=50`, plus a luck branch (~8% rapid double-strike, ~15% longer calm).

Only one floor exists at a time: the active floor is a full live `World`, and no inactive floors are retained (the old byte-budget/`deviceMemory` machinery is left inert, not removed). The browser save persists exactly that one active floor in the floor-memory section — encoded as a delta against the deterministically regenerated base (XOR'd geometry + sparse room/door diffs; entities, containers and zones absolute), guarded by a `baseHash` drift check that falls back to a fresh regenerate on generator drift. If the floor snapshot format changes, bump `SAVE_SHAPE_VERSION` and reject stale saves explicitly.

Normal route transitions also maintain lift topology after generation or memory restoration. Most route floors are normalized to 16 down and 16 up lifts; `roof` has only 16 down, `VOID` has only 16 up, and `podad` lower down lifts are withheld until the Herald gate opens. When a normal lift creates or restores the adjacent floor, the arrival floor mirrors the departure lift group as the opposite return direction at the same coordinates, then fills any other expected direction to sixteen reachable lifts. Content modules must not depend on a specific hardcoded lift coordinate; they should publish route facts through ids and generated marks.

Future fields such as family edges, friends, rank, kills, quest seed, home/work anchors and exact inventory are allowed only with a measured storage plan. Prefer ids, small numeric fields, typed arrays and sparse overrides over large object graphs.

## 3.1 Порядок слоёв активного этажа (с 2026-08-23)

В `updateAI` для человека порядок такой: видовая тактика → **ядро актора** → бой →
распорядок. Ядро идёт перед боем не для красоты: пока бой стоял первым, он забирал всякого
с боевой целью, и решение «драться или бежать» до ядра не доходило — разорвать контакт было
физически нечем. Ядро возвращает `false` там, где вести актора должен слой (ярус `actor`).

Новые модули этого фронта:

- `systems/actor/` — senses, needs, drives, brain (ядро решения);
- `systems/room_visits.ts` — кольцо посещённых комнат: хранится колонкой личности A-Life,
  читается обоими слоями выбора комнаты через кадровый контекст;
- `world/crowd_index.ts`, `world/room_index.ts`, `world/line_of_sight.ts`,
  `systems/fields/` — общие индексы и поля, на которых ядро стоит.

Кадровые контексты (`setPathContext`, `setCombatContext`, `setNpcContext`,
`setActorCoreContext`, `setFactionsSocialContext`, `setRoomVisitContext`) — единственный
разрешённый способ подсунуть горячему пути ссылку на состояние: предикаты зовутся тысячи раз
за кадр и в `GameState` не лазят.

## 4. Parallel Agent Ownership

Use this to avoid file conflicts.

Green files, safe for one agent:

- New `src/gen/<floor>/<module>.ts`
- New `src/data/<domain>_<module>.ts` or a new small domain file
- New `src/entities/<monster>.ts`
- New focused reference docs under external `../gatbage/reference/` only when the task explicitly asks for appendix/reference work

Yellow files, edit only with a narrow reason:

- `src/gen/<floor>/index.ts` for one import/call
- `src/gen/<floor>/side_quests.ts` or equivalent local registry
- `src/data/items.ts`, `src/data/weapons.ts`, `src/data/plot.ts`
- `src/entities/monster.ts`
- `src/systems/debug.ts` — теперь только экран и общие помощники; сама команда пишется в своей системе
- `src/systems/debug_content.ts` — одна строка импорта на новую регистрирующую систему

Red files, integrator-owned:

- `src/core/types.ts`
- `src/core/world.ts`
- `src/main.ts`
- `src/gen/shared.ts`
- `src/render/webgl.ts`
- `src/render/sprites.ts`
- `src/render/textures.ts`
- Broad AI, quest, inventory, or samosbor rewrites

If a task needs a red file, split it into:

1. Small API/hook change by one owner.
2. Additive content modules by everyone else.

## 5. Registry Pattern

Every expandable domain should follow one of these patterns.

Current examples:

- Side quests: module calls `registerSideQuest()` in `src/data/plot.ts`.
- LIVING zone POIs: module calls `registerZoneContent()` in `src/gen/living/zone_content.ts`.
- Samosbor variants/director: definitions live in `src/data/samosbor_variants.ts` and `src/data/samosbor_director.ts`; `systems/samosbor.ts` consumes active variants and bounded beats.
- Events: systems call `publishEvent()`, consumers query ring buffers.
- Interactive surfaces: definitions live in `src/data/interactive.ts`; broad static floor objects use `src/data/floor_object_placement.ts` plus `src/gen/floor_object_placement.ts`; local authored modules can still call `placeInteractive()` / `placeInteractiveAt()` or fixture helpers such as `maybePlaceBrokenFixture()`; `systems/interactive.ts` owns sparse per-`World` instances and action handlers.
- Debug menu: system calls `registerDebugCommand()` / `registerDebugPanel()` from `src/systems/debug_registry.ts` next to its own code. See the contract below.

### Debug Command Contract

`src/systems/debug_registry.ts` is a leaf: it knows `World`, `GameState` and floor data, nothing else. A command is ONE record — `{ id, group, label, sort?, run(ctx) }` — and it lives in the system it exercises, not in `systems/debug.ts`. Output goes through `ctx.say`, which lands in the стеносводка; there is no second debug log.

Menu order is a property of data, never of import order: the group comes from `DEBUG_GROUPS`, and inside a group entries sort by `sort` (route floors use `-z`, so the list runs +50 → −50) and then by label. Route-floor and procedural-anomaly teleports are generated from `DESIGN_FLOOR_ROUTES` and the anomaly table — a new floor appears in the menu by itself.

The index of a command in the flat list is its menu number and the handle smoke uses (`window.__gigahrushDebugCommandIndex`). Because registration is an import side effect, a partial import graph yields a partial menu with shifted numbers. `src/systems/debug_content.ts` is therefore the assembly point — every registering module is listed there, `main.ts` and the debug tests import it, and `tests/debug-commands.test.ts` fails if a module is missing from the list.

This replaced four parallel structures — an id union, a label array, an order array, and `case <number>` in a 570-line switch whose number was the position in the label array. Inserting a command in the middle silently shifted every later branch; that is how `expedition_proof_collectors_arrival` and `expedition_proof_return` ended up in the menu with no branch at all, doing nothing when pressed. Do not reintroduce a positional dispatch.

Standard shape for new registries:

```ts
export interface SomeDef {
  id: string;
  weight: number;
  tags: string[];
}

const registry: SomeDef[] = [];

export function registerSome(def: SomeDef): void {
  registry.push(def);
}

export function getSomeDefs(): readonly SomeDef[] {
  return registry;
}
```

Rules:

- Registry ids are lowercase snake case and globally meaningful: `living_radio_eye`, `maint_pressure_station`, `ministry_stamp_debt`.
- Module files own their local definitions and call register at top level.
- Runtime systems read registries once per tick window or generation phase, not every pixel/ray.
- If duplicate ids matter, the registry rejects them in development with `console.warn` or throws during generation.

## 6. Import Contention Fix

Current content often requires one side-effect import in a floor `index.ts`. That is acceptable for small batches, but it becomes a merge conflict with 20+ agents.

Short-term rule:

- One agent may add one import/call to an existing floor orchestrator.
- If more than three agents touch the same floor in one batch, create a local manifest.

Implemented manifests:

```txt
src/gen/floor_manifest.ts
src/gen/living/content_manifest.ts
src/gen/maintenance/content_manifest.ts
src/gen/ministry/content_manifest.ts
src/gen/kvartiry/content_manifest.ts
src/gen/hell/content_manifest.ts
src/gen/void/content_manifest.ts
```

The floor `index.ts` imports only its manifest or a small runner from it. Agents then append module imports or ordered runner entries to the manifest, not the orchestrator. The manifest remains the single conflict surface.

Current floor matrix:

| Floor | Generator | Additive Hook | Manifest Status | Shared-File Risk |
| --- | --- | --- | --- | --- |
| `MINISTRY` | `src/gen/ministry/index.ts` | `runMinistryContent()` | implemented | low; agents edit `content_manifest.ts` |
| `KVARTIRY` | `src/gen/kvartiry/index.ts` | named NPC and permanent content runners | implemented | medium; uprising pressure update still lives in `index.ts` |
| `LIVING` | `src/gen/living/index.ts` | side-effect zone content + side quest spawners | implemented | medium; `side_quests.ts` remains ordered spawn registry |
| `MAINTENANCE` | `src/gen/maintenance/index.ts` | `runMaintenanceContent()` | implemented | low; mixed generator signatures hidden behind adapters |
| `HELL` | `src/gen/hell/index.ts` | `runHellContent()` | implemented | low; initial population generation remains in `index.ts` |
| `VOID` | `src/gen/void/index.ts` | `runVoidContent()` | implemented | low; agents edit `content_manifest.ts` |

`src/gen/floor_manifest.ts` owns floor names and message colors keyed by theme tag (`FLOOR_NAMES: Record<string, string>` over `ministry|kvartiry|living|maintenance|hell|void`), dispatches generation through `designFloorAtZ()` / `makeProceduralFloorSpec()`, and owns save/load generation. Adding a new story floor now starts there instead of duplicating switch logic in `main.ts` and `systems/samosbor.ts`.

`src/data/design_floors.ts` and `src/gen/design_floors/manifest.ts` own routed authored design floors; there is no floor enum to extend. Each design floor lives in its own `src/gen/<floor_id>/` package and is registered in `src/gen/design_floors/manifest.ts`; the former `src/gen/design_floors/full_floor.ts` integration layer was deleted and its hooks moved into the individual floor generators (see the `// Hooks moved from full_floor.ts` comments). `src/data/procedural_floors.ts`, `src/systems/procedural_floors.ts`, and `src/gen/procedural_floor.ts` own interstitial procedural floors. Add new procedural geometry/anomaly profiles there or through their docs contracts; do not clone named story content into procedural floors.

Generic render hooks are allowed when a floor or item family needs a reusable presentation channel. The roof uses this pattern: `src/gen/design_floors/roof.ts` exposes a 1024x1024 dynamic sky texture provider, and `src/render/webgl.ts` only owns the generic dynamic ceiling texture slot, not roof gameplay. Item drops use the same rule: `render/webgl.ts` only asks for a generic procedural texture by item id, while item-specific visual language lives in `src/render/item_sprites.ts`. Procedural actor/item visuals are allowed, but they must be generated at game/floor load boundaries into the shared renderer cache, not lazily in the hot render path.

The mesh pass follows the same rule at a larger scale: `src/render/webgl.ts` owns only the generic pass seam, `src/render/mesh/` owns collection/buffers/shaders, and content-specific visual language lives in data/profile/generation modules. Physical path blockers for bulky objects are not part of mesh; use the explicit `block.md` field/data/generation contract when implementing collision.

Corridor-volume dressing is part of this render contract. It may derive wall
relief, ledges, thresholds or organic tunnel silhouettes from local
`World.cells`/`roomMap` topology and floor profile tags, but it remains
camera-bounded triangle geometry only. It must not rewrite rooms, carve cells,
own reachability or become a source for path blockers.

Later, if edit contention is still high, use Vite eager globs:

```ts
import.meta.glob('./content/**/*.ts', { eager: true });
```

That requires adding Vite import-meta types first. Do not introduce it casually; it is a build-contract change.

## 6.1 Общие механизмы вместо случаев вида

Date: 2026-08-23. Каждый пункт — обобщённая черта движка; вид приносит флаг или данные, а
общий слой про вид не знает.

| Механизм | Где | Контракт |
| --- | --- | --- |
| Состояние вида | `systems/ai/species_state.ts` | `speciesState(create)` → `of/peek/forget` поверх `WeakMap`. Поле в `AIState` ради одного вида запрещено: эту структуру носит каждая сущность мира, включая предметы на полу. |
| Локальный индекс ящиков | `world/container_index.ts` | `containersInRoom`, `forEachContainerNear`, `nearestContainer`. Полный перебор `world.containers` в горячем пути запрещён — см. `optimization.md`. |
| Прозрачность спрайта | `Entity.spriteAlpha` + `uSpriteAlpha` | 0..1, не задана — рисуется как есть, `<= 0.01` — не уходит в отрисовку вовсе. `render/webgl.ts` не знает, ЧЕЙ это эффект: маскировка, туман, фаза. |
| Беззвучность | `systems/noise.ts`, флаг `silent` | Две двери: `publishActorNoise` (не оставляет следа в слухе мира) и `findNoiseForActor` (сам не слышит). Исключений в видах не заводить. |
| Возврат съеденного | `systems/monster_drops.ts` | `dropMonsterLoot` вываливает `monster.inventory` ПЕРЕД сгенерированным лутом: носимая вещь — чужая, а не добыча вида. |
| След смерти | `systems/danger_field.ts` | `blood_fx` кладёт импульс на ране и на смерти; `findBloodTrailCell` / `clearBloodTrailCell` читают его. На этом поле живут падальщик и споровый ковёр, друг о друге не зная. |

Признак нарушения: `if (e.monsterKind === MonsterKind.X)` или `profile.id === 'x'` в общем
слое. Правильная форма — флаг в `aiFlags` и проверка `monsterHasAIFlag`.

## 7. Data-Oriented Runtime Rules

The engine is already data-oriented. Keep it that way.

Use:

- Plain object definitions.
- Typed arrays on `World` for dense per-cell state.
- Flat entity arrays for NPCs, monsters, items, projectiles.
- Small sparse `Map`s only for rare per-cell data, such as doors or surface marks.
- Fixed-size ring buffers for history.
- Numeric ids and string ids, not object graphs.
- Slow accumulators for simulation: 0.5s, 1s, 5s, 30s depending on gameplay need.

Avoid:

- Per-module `setInterval`.
- Per-frame full-world scans.
- Periodic refill-to-cap population spawners for ordinary NPCs or monsters.
- Per-entity closures allocated during updates.
- Deep class inheritance.
- JSON parse/stringify in the game loop.
- DOM work in systems.
- Renderer-side gameplay state, including camera mode ownership.
- Raw `Math.random()` in generation or runtime. It breaks deterministic simulation and unit tests. Always use `src/core/rand.ts` (`SeedRng`, `xorshift32`, `seededRandom`).
- **Real-time BFS or O(W²) recomputation during active gameplay.** Navigation tree, flow fields, light maps, path blockers and connectivity are baked at floor load and after samosbor stitch — never during active simulation. During samosbor the navigation cache must be frozen; no system may unfreeze or invalidate it until samosbor ends. See `optimization.md` Iron Law section.

Default budgets:

```txt
Content generation: can be expensive, but bounded and done on loading/rebuild.
Per-frame system: suspicious above 0.1 ms.
Slow system tick: target below 0.2 ms per second on i3/MX350.
HUD/render additions: draw from cached state, no world scans in draw calls.
Real-time pathfinding: O(1) lookup only. All BFS is baked at boundaries.
```

## 8. Content Module Contract

Most content should be a self-contained file with four parts:

1. Local constants and ids.
2. Optional data registration: quest, NPC, event, room, document, economy def.
3. One generator/spawn function.
4. Optional debug/test hook.

For a generated POI:

- Pick a stable id.
- Choose a floor and zone.
- Bulldoze only non-protected cells.
- Set `cells`, `roomMap`, `wallTex`, `floorTex`, and `features`.
- Create `Room` records with real `RoomType`.
- Add doors to `world.doors` and `room.doors`.
- Protect permanent content with `aptMask` where required.
- Connect to an existing floor cell.
- Spawn authored/event NPCs and items with `nextId.v++`. Ordinary ambient NPCs should be placement templates that A-Life can replace with persistent identities during floor activation.
- Publish or register enough data for quests/map/debug to find it.

For a data-only module:

- Use a registry.
- Provide at least one path to visibility: loot spawn, trader, guaranteed room, debug command, quest, event, or document pool.
- Do not add dead data.

## 9. System Module Contract

New systems must be generic.

Good:

```txt
data/economy.ts       definitions: resources, recipes, price rules
data/economics.ts     shared long-progression caps, price floors and reward bands
systems/economy.ts    slow tick: production, shortage events, debug stats
systems/quest_rewards.ts runtime reward math from objective, route, danger and giver context
gen/industry/*.ts     rooms that carry factory ids and spawn workers
```

Bad:

```txt
systems/economy.ts hardcodes one named room from one agent.
main.ts calls updateOneSpecificQuestRoom().
render/hud.ts scans every room to discover prices every frame.
```

Every new runtime system needs:

- A data file or registry.
- A bounded update cadence.
- A debug way to inspect it.
- Event publication for important changes.
- A current-shape serializer/sanitizer if it stores persistent state. Cross-version save migration is not required by default; shape breaks should include a stale-version rejection test.
- A low-tier behavior that is cheap and a high-tier path that buys visuals/content, not raw simulation complexity.

## 10. Cross-System Communication

Use ids and events.

Preferred:

- `publishEvent(state, draft)` for things NPCs, rumors, quests, or UI may observe.
- Definition ids such as `factoryId`, `documentId`, `contractId`, `poiId`.
- Room tags or room names only as secondary display text.
- A local registry per domain.

Avoid:

- Importing another agent's module just to check whether it exists.
- Calling a content module from a generic system.
- Looking up content by Russian display name in hot logic.
- Mutating another module's private arrays.

The current `systems/events.ts` is the browser version of an EventBus. It already uses fixed-size buffers and avoids unbounded logs. Use it before inventing another bus.

### Online Co-op Ownership (Protocol v2)

The optional online layer follows one hard invariant: **exactly one writer per piece of state**. The host owns the entire peer actor (inventory, hp, magazine, money, needs, rpg) and the whole shared world; the peer owns only its position/angle plus local prediction. Peer actions travel as numbered intents; the host acks every seq (even rejected ones) and answers with an authoritative actor echo — never re-introduce dual-writer merges (the old actorGen delta-merge deadlocked in combat).

Module ownership:

- `systems/online_protocol.ts` — message types, sanitization, intent seq/ack, echo pack/apply, snapshot interpolation, net cell patches, fx queue, per-slot bookkeeping. Pure helpers; no world simulation.
- `systems/online_client.ts` — WS transport, room lifecycle, send throttles.
- `systems/online_containers.ts` — host-authoritative container copies for peers.
- `main.ts` — wiring only: message dispatch, host intent executor, sync-tick packet assembly.

Rules: all host→peer traffic per tick goes into ONE `host_state` packet (every WS message is a billed Durable Object request); geometry mutations that peers must see call `markNetCellTouched`; cosmetic shot/death fx are pushed centrally (`publishWeaponNoise` hook + `handleKill`) — never per fire-path; in entity sync, `inventory` applies to ITEM_DROP entities only (an NPC keeps its peer-side trade copy). `functions/do/floor_room.ts` stays a dumb relay — no game logic server-side.

## 11. Floor Architecture

**Floor Generation System:**
- **Even-numbered floors** (`Z % 2 === 0`) are separate, independent design modules. Each is authored as a standalone package without inheriting biomes.
- **Odd-numbered floors** (`Z % 2 !== 0`) are procedurally assembled by randomly mixing pieces of other floors and introducing procedural anomalies.

**Порядок фаз и хуки этажа.** `generateDesignFloor` (`src/gen/design_floors/manifest.ts`) выполняет обязательную последовательность: генератор этажа → гарантия маршрутных лифтов → профиль объектов → инициализация поклеточной территории → хук `onAfterTerritory` → централизованное заселение ambient-NPC → хук `onAfterPopulate` → стаи монстров. Оба хука объявлены в `FloorGeneration` (`src/gen/floor_manifest.ts`) и существуют, чтобы этаж не тащил свою специфику в общий манифест.

Ключевое следствие: до `onAfterPopulate` толпы на этаже ещё НЕТ. Всё, что работает поверх ambient-NPC — промоушен локальных ролей, пересчёт по населению, авторские сцены вокруг людей — обязано жить в этом хуке, а не в теле генератора. Этаж 69 промотировал работниц внутри генератора и годами видел только десяток авторских NPC вместо трёхсот с лишним.

Второе следствие: обычные сущности этажа обязаны получать `id` ВЫШЕ сюжетного пула (`getPlotNpcCount()`), иначе предмет или монстр попадает в зарезервированный диапазон `1..N` и опознаётся как сюжетный NPC. Канон для генератора: `nextId.v = getPlotNpcCount() + 1000`.

Each floor should have the same outer structure:

```txt
src/gen/<floor>/
  index.ts              floor orchestrator
  content_manifest.ts   optional imports/registration only
  content_helpers.ts    local stamping helpers if repetition appears
  <module>.ts           one POI, NPC group, encounter, or room family
```

Floor orchestrator responsibilities:

- Create `World`.
- Generate base topology.
- Generate zones and levels.
- Place lifts.
- Run registered content modules.
- Spawn baseline population and loot.
- Bake lights.
- Return `{ world, entities, spawnX, spawnY }`.

Content module responsibilities:

- Never decide global floor topology.
- Never reset `entities`.
- Never change population caps outside its floor owner task.
- Never assume another module ran first unless the manifest explicitly orders them.

## 12. Definition Domains

The project now has several data-first domains that should be extended in place instead of reimplemented locally:

```txt
src/data/contracts.ts          ContractDef[]
src/data/resources.ts          ResourceDef[]
src/data/factories.ts          FactoryDef[] with recipes
src/data/economy_rules.ts      price/scarcity rules
src/data/rumors.ts             RumorDef[]
src/data/alife_generation.ts   persistent NPC faction, level, account wealth and pocket profiles
src/data/floor_catalog.ts      data-only future floor catalog
src/data/permits.ts            access papers and spoilage defs
src/data/computers.ts          generated computer defs
src/data/gambling.ts           generated gambling machine defs
src/data/net_hack.ts           local NET-hack terminal defs
src/data/emergency_panels.ts   panel defs
src/data/samosbor_variants.ts  variants, modifiers and aftermath beats
src/data/samosbor_director.ts  warning/active/aftermath director beats
```

Remaining candidates for future standardization are document pools by faction/theme, a data-only event-type catalog if `systems/events.ts` needs more static validation, and richer cross-expansion director hook definitions. Do not implement all of this in one pass. Each domain gets:

1. Definition file.
2. Minimal generic system.
3. Five to twenty defs.
4. Debug/check path.
5. README update only after it works.

## 13. Scalability Pillar

Every module must scale across four tiers.

Low:

- Static room geometry.
- Existing textures and sprites.
- Small spawn counts.
- Slow ticks.
- Text/audio/HUD feedback instead of simulation.

Middle:

- More variants and denser loot/NPC placement.
- Extra events and rumors.
- More procedural marks and lights during generation.

High:

- Extra visual marks, richer HUD hints, more simultaneous encounters.
- More detailed A-Life facts and economy state.

Ultra:

- Visual overkill through procedural texture variants, dense decals, rare set pieces, and bigger event pools.
- Still no unbounded per-frame world scans.

Rule: saved CPU buys atmosphere. It does not buy a physics toy.

## 14. Cinematic Cheat Policy

Prefer controlled fakes:

- Fog color, density, HUD warnings, and spawn weights instead of volumetric fog simulation.
- Static water/steam/pressure room states instead of fluid simulation.
- Room names, notes, event logs, and NPC barks instead of huge bespoke cutscenes. The shipped floor-scene system is exactly this fake and no more: real people, real barks, a directed camera and beats that may not decide an outcome (`Floor Scene Contract`). A beat that scripts who dies is the bespoke cutscene this rule forbids.
- Procedural texture variants instead of imported assets.
- Spawn tables and behavior flags instead of one-off AI branches.
- Slow economy ticks instead of live market micro-simulation.

If a fake creates the same player decision, use the fake.

## 15. Black Box And Telemetry

Critical systems should expose recent state through bounded buffers.

Current precedent:

- `systems/events.ts` uses fixed-size recent, important, and per-zone event buffers.
- `msgLog` is capped.

For future critical systems:

```txt
System telemetry entry:
  tick
  floor
  zoneId
  hash or state id
  counts
  last action flags
```

Store the last 300 relevant samples, not infinite history. In browser runtime, dumps should go to debug UI, console, downloadable blob, or save data. In Node-side tooling, durable dumps should stay outside active docs unless an explicit orchestration/debug task asks for an external appendix record under `../gatbage/history/agent_logs/`.

Historical `../gatbage/history/agent_logs`, task statuses and prompts were consolidated into `../gatbage/history/root_notes/appendix.md` in the external appendix. Recreate those directories only for an explicit orchestration/debug-dump task; routine patches should keep their durable notes compact and update appendix notes only when the context will be useful later.

## 16. Verification Checklist

Every agent patch must answer:

- What files changed?
- What new gameplay is visible?
- Which floor/zone/room can verify it?
- How does it react to samosbor or why is it exempt?
- How does it touch A-Life, factions, economy, quests, or events?
- What caps prevent frame-time growth?
- Which check passed?
- Was README updated only if implementation facts changed?

Minimum local verification:

```txt
npm run typecheck
```

Use `npm run check:readonly` for most data/content changes. Use `npm run check` for systems, generation, save/load, AI, economy, quests or rendering changes. Use `npm run check:browser` or `npm run check:full` when browser/render/mobile behavior needs smoke coverage and Chrome is available.

For mesh pass changes, also run explicit smoke modes when practical:

```txt
SMOKE_VISUAL_GEOMETRY_MODE=off npm run smoke
SMOKE_VISUAL_GEOMETRY_MODE=high npm run smoke
SMOKE_MOBILE=1 SMOKE_VISUAL_GEOMETRY_MODE=low npm run smoke
```

For content:

- Confirm module is imported/registered.
- Confirm NPC or room can spawn.
- Confirm quest/data id is reachable.
- Confirm no use of nonexistent enum values.
- Confirm no full-world hot scan in render or per-frame update.

## 17. Anti-Patterns

Reject these on sight:

- `src/content.ts` with everything in one file.
- A floor module that edits `main.ts` for one NPC.
- A quest that requires changing AI internals.
- A renderer feature that owns gameplay state.
- A generator that overwrites `aptMask`.
- A module that assumes non-toroidal coordinates.
- A new enum for every tiny content variant.
- A system that scans all 1,048,576 cells every frame.
- A module that only adds text nobody can ever encounter.
- A rewrite of working systems to make a small feature feel "clean".

## 18. Recommended Growth Phases

Phase 0: Documentation and boundaries.

- Keep this file current.
- Add per-floor manifests only when conflicts appear.
- Keep README factual.

Phase 1: Registry hardening.

- Standardize registries for events, contracts, documents, standalone monster packages, economy.
- Add duplicate-id checks.
- Add debug inspection for each registry.

Phase 2: Content lanes.

- Agents add one POI, one NPC/quest, one event pack, one standalone monster package, or one document pack per task.
- Integrator owns central enum/sprite/texture expansion.

Phase 3: Runtime systems.

- Add only generic slow-tick systems.
- Publish events for every important consequence.
- Bump save shape and invalidate stale data when persistent state changes incompatibly.

Phase 4: Visual overkill.

- Spend saved cycles on procedural texture variants, marks, HUD feedback, room identity, and high-tier density.
- Do not add new simulation complexity unless it changes player decisions.

## 19. One-Agent Task Size

Acceptable task sizes:

- One content zone.
- One NPC with quest and room.
- One data file plus one generic system plus 5-20 defs.
- One monster with behavior and sprite registration.
- One small floor prototype.
- One debug screen.

Too large for one pass:

- "Implement whole economy."
- "Rewrite AI."
- "Add all future floors."
- "Make every NPC remember everything."
- "Move project to a new architecture."

## 20. Final Rule

The architecture is successful when adding content means creating a small file, registering a definition, running build, and seeing it in game. If a feature requires touching five shared systems, it is probably the wrong shape or it needs an integrator-owned API first.
