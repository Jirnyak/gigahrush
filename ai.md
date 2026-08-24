# Active-Floor AI

> Центральный документ низкоуровневого AI.
>
> Роль: описывает active-floor AI для NPC и монстров: локальность, изотропия, finite/state-machine execution, field/path movement, entity index, cached targets, bounded reactions and full-pass actor simulation. Связан с `fight.md` for combat feel and target pressure, and with `alife.md` for persistent identity and macro consequences.

This document is the shipped contract for live NPC and monster behavior on the loaded floor.

A-Life answers who exists, where that person belongs, whether they are dead, and what persistent facts fold back into the run. That contract lives in [alife.md](alife.md). This document answers how materialized live actors think, move, fight, hide, react and create readable situations on the active 1024x1024 toroidal `World`.

The core direction is simple: ordinary NPCs should not be synchronized by a global schedule. Thousands of materialized people on the current floor behave like independent agents with their own needs, professions, anchors, fear, habits, faction, personal relation and local context. In mass combat they deliberately use a short shared combat-step instead of a large per-actor brain; individuality lives in target memory, role, loadout, current intent and persistent A-Life facts, not in expensive tactical planning for every actor.

## Current Baseline

**Ядро актора и порядок слоёв (обновлено 2026-08-23).** `systems/actor/` (senses → needs →
drives → brain) идёт в `updateAI` ПЕРЕД боевым слоем и перед распорядком, и берёт актора
себе, только если у него есть решение выше порога. Драйвы — данные
(`systems/actor/drives.ts`), четыре яруса исполнения:

- `step` — шаг по склону поля под ногами (страх, укрытие, след);
- `route` — дальняя цель через стратегический ярус полей и маршрут (охота, на выстрелы,
  тяга к людям, стая тварей);
- `room` — комната по НАЗНАЧЕНИЮ (еда, питьё, сон, туалет, лечение, а с 2026-08-24 ещё
  работа, разговор, обход и склад); выбор комнаты читает территорию, забитость,
  вместимость, память комнаты, новизну (кольцо посещений живёт в личности A-Life,
  `systems/room_visits.ts`) и опасность комнаты из того же поля восприятия. Точка ВНУТРИ
  комнаты берётся восемью пробами последовательности R2 и проверяется на бетон каждый
  раз; центр комнаты — последнее прибежище и тоже проверяется. Прежде оба запасных выхода
  отдавали центр вслепую, и комната с колонной давала цель в стене, отчего дело падало
  молча (`tests/target-not-in-concrete.test.ts`);
- `actor` — противник: драйв `fight` объявляет цель и УСТУПАЕТ ход боевому слою, а если
  побеждает не он, ядро снимает цель и боевую память (разрыв контакта).

Драка требует ВИДЕТЬ (линия взгляда считается на такте решения, потолок — восемь соседей
запроса), страх и укрытие — нет. Захват территории — такой же драйв (`capture`): цель даёт
перепись фронта, намерение объявляется каждый такт. Отдельного фракционного отправителя на
фронт больше нет.

**Распорядок в ядре (2026-08-24).** Ядро получило ТРЕТИЙ род входа — время суток
(`systems/actor/clock.ts`): снимок общий на кадр, читается один раз в точке входа. Личное в
распорядке — не время, а СДВИГ смены, и он выводится из личности прямо в формуле. Работа,
разговор, обход, склад и роуминг стали строками данных; час смены входит МНОЖИТЕЛЕМ
КОНТЕКСТА, поэтому ночью работа честно ноль. Опасность гасит работу и разговор и ДОБАВЛЯЕТ
обходу — это единственное рутинное дело, которому угроза повышает тягу. Игровая фактура
смены (складской цикл с покупкой и кражей, уборка поверхностей, рейсы кладовщика) вынесена
в `systems/npc_work.ts`, откуда её зовёт хук `onArrived`, — донор идёт под снос, и вешать
на него ядро нельзя.

**Патруль больше НЕ ходит вне комнат.** Прежний закон (выбор клетки по `roomMap < 0`) был
единственным местом в проекте, где цель выбиралась по признаку «клетка не принадлежит
комнате»; владелец назвал его тупостью, и в ядро он не перенесён. Обход адресуется
аффордансом `patrol` (коридор 24, штаб 20, общий зал 12, рынок 10).

**Голос — свойство дела.** У драйва есть строка `voice`: сигнал корпуса реплик и запасная
строка, плюс отдельная реплика ПРИХОДА. Речь звучит на смене драйва и на прибытии, то есть
по построению всегда про то, чем актор занят; своего такта у неё нет, дозировку держит
`emitMarkovBark`. Занятие уходит в марковское ядро ТЕГОМ (`activity.<драйв>`) вместе с
меткой обычного жителя и нуждами — прежде обстановка барка строилась только из авторского
пакета, которого нет ни у одного обычного NPC. Замок — `tests/actor-voice.test.ts`.

**Стратегический ярус отдаёт ПРЕДСТАВИТЕЛЯ ячейки, а не её геометрический центр.** Центр
ячейки 16×16 лежит в стене на 61% жилого этажа и 99.7% квартир (там шаг сетки квартир
совпал с шагом яруса), а поиск пути на непроходимой цели возвращает пустой путь и роняет
дело молча. Представитель — ближайшая к центру проходимая клетка — запекается тем же
проходом, что и проходимость ячеек. Доля назначенных маршрутов от яруса: жилой 37% → 96%,
квартиры 0% → 97%, министерство 40% → 98%. Бьёт это по пяти делам сразу: охота, стая,
кучкование, «идти на выстрелы» и разбег кочевника.


The current implementation has moved ordinary NPCs off the old global schedule path and removed active-floor proximity tiers. This full-pass isotropic model is the foundation for current-floor AI:

- `src/systems/ai/index.ts` owns the single `updateAI()` entry point. It makes one full pass over the indexed live-AI list every simulation frame, regardless of distance from the player.
- `src/systems/ai/npc_utility.ts` scores safety, combat, flee, toilet, drink, eat, sleep, work, heal, social, patrol and wander from needs, threat, role, soft rhythm, local room context and current-intent stickiness.
- `src/systems/ai/npc_fsm.ts` is now the utility executor: it selects the winning intent on an actor-local rethink timer, maps it to a visible/debug `NpcState`, and reuses bounded path/needs handlers for travel and activity every frame.
- Ministry NPCs use the same executor with a ministry profile; the old separate ministry schedule path is removed.
- `src/systems/ai/combat.ts` gives NPC combat, fleeing, physical ranged fire and relation-aware hostility higher priority than routine behavior. It has no `player` parameter: **detection range is a property of the observer** — `max(brave ? NPC_CHASE_RANGE : NPC_COMBAT_RANGE, own weapon maxRange)`, widened for a forced target after recent damage. There is no brave/armed entry gate either: everyone looks around, and a non-combatant simply flees what they notice. Hostility is the faction matrix plus the directed personal-enmity edge from the Demos social graph (`isDemosPersonalEnemy`), read through a per-frame state reference set by `setFactionsSocialContext(state)` in `updateAI` — `isHostile` sits in the hottest scan and takes no `state`. Symmetrically, `src/systems/ai/monster.ts` has no "prefer player" pass: nothing may re-target the player past the ray check, the scan cadence or hostility. See `architecture.md`, «Observer-Owned Detection».
- `src/systems/ai/pathfinding.ts` provides a toroidal baked navigation tree and cached behavior flow fields for shared targets such as kitchens, bathrooms and work rooms.
- `src/systems/ai/tactics.ts` is the shared actor tactic runner. It is called from `updateAI()` before the ordinary NPC/monster branch only for actors with a registered profile, so unprofiled crowd AI keeps the cheap baseline path.
- `src/systems/ai/monster.ts` contains the monster target loop and the `MonsterKind`/`aiFlags` behavior hooks. It is not the place to park one species: a per-species `update<Species>()` block here, or a field added to `AIState` for one monster, is the failure mode described under «One Property, One Flag» below. Three such blocks were deleted on 2026-08-20 — `updateFalseLiquidatorPatrol`, `updateLozhnyyDukhFalsePhase` and `updateGlubinnayaTenSecondBeat` no longer exist and must not be reintroduced.
- `src/systems/entity_index.ts` is the runtime broadphase for AI target, threat and local actor queries.
- `src/data/entity_limits.ts` defines one shared 4096 active NPC+monster actor soft cap for the current floor; this is a gameplay density ceiling, not an AI scheduling trick.

The old failure mode was that many NPCs could share the same hour, state and room-type target, decide together that it was time to work and follow the same flow field toward production rooms. Current runtime selection lets urgent needs, threat, role and local context beat work or lunch pressure, so the clock no longer forces synchronized factory streams.

## Shipped Mass-Combat Contract

The working high-density rule is:

```txt
actor -> keep current intent/target -> choose hostile faction target -> move -> hit or shoot -> persist consequences
```

This is used for NPC and monster combat across the whole active floor. The short step is allowed to be tactically dumb: NPCs may shoot through a crowd, monsters may pressure by direct movement, and friendly fire may happen. The required honesty is in the data: physical projectiles, HP, deaths, blood/bullet marks, dropped inventory, events and A-Life/floor-memory foldback must be real.

The short combat-step must not erase personal behavior:

- every actor can keep `combatTargetId`, cooldowns, path/frustration, current intent/debug label and recent damage memory;
- NPC role, faction, bravery, weapon, personal relation — to the player and to other people alike, through the directed Demos enmity edge — needs and utility pressure still decide whether they fight, flee, hide, patrol, work or recover;
- routine utility can resume after danger passes. Micro-goals like noise investigation, looting, and friendly bartering can naturally interrupt routine travel without destroying the main intent;
- player distance does not decide AI cadence or whether an actor exists;
- actors do not scan noise or targets every frame; those expensive choices use local cooldowns and cached ids, while movement, cooldowns, attacks and current intents continue every frame.

The result should feel like faction waves and particle pressure, not like hidden turn resolution and not like a frozen far map.

## Actor Tactic Profiles

Special behavior now has one generic runner instead of one-off state machines in the orchestrator. `registerActorTacticProfile()` registers a profile by `MonsterKind` or by a future actor matcher; the live loop checks whether an actor has a profile and otherwise does no local tactic sensing.

A profile contains a small ordered list of tactics, a sense radius, a sense cadence and a result cap. The runner caches facts in transient `AIState` fields such as `tacticId`, `tacticPhase`, `tacticSenseCd`, `tacticTargetId`, `tacticNearbyHostiles`, `tacticThreatX/Y`, `tacticAnchorX/Y` and `tacticFlags`. These fields are not persistent save state.

The shipped first profile is `slime_woman`:

- passive wet/dry cues scale the sprite and publish the existing dry-counterplay fact;
- recent hostile damage can drop a short-lived toxic slime cell hazard without a full scan;
- a local crowd of hostile actors makes the slime woman switch to `FLEE` and move away from the capped hostile centroid;
- dry lit concrete makes her retreat toward a nearby wet anchor sampled from local cells;
- an isolated target lets her stalk/ambush through the same runner and leave residue on close contact.

The runner reads local actors through `entity_index.queryRadiusCapped()`, uses fixed profile radii/caps and staggers expensive fact refreshes with `tacticSenseCd`. Movement reuses the existing pathfinding helpers; slime residue reuses `cell_hazards`, `surface_marks` and compact `WorldEvent`s. This is the extension point for future monster or authored NPC profiles, not a replacement for the cheap mass combat step.

## Routine Target Model

Outside dense combat, use a hybrid:

- A utility selector chooses the current intent from local scores.
- A small finite-state executor performs that intent: select target, travel, perform, recover, retry or abandon.
- GOAP-style planning is allowed only as one or two local steps, such as "hungry, has food, eat" or "hungry, no food, go to kitchen".
- Behavior-tree style special logic is reserved for authored NPCs, floor variants and monsters where a small generic utility rule is not expressive enough.

Global time can remain a soft rhythm input, but it must not force all NPCs into the same state at the same moment. Work, sleep and lunch are pressures, not commands.

### Corridor Attractor Regression Guard

Corridors are valid gameplay space. NPCs may pass through them, patrol them, flee through them, hold them, travel across them and temporarily gather there because the floor is alive. The forbidden failure is a corridor attractor: NPCs gradually accumulating in one corridor pocket and repeatedly walking A-B-A along the same cells because routine AI keeps changing goals, choosing unreachable or over-distant routine targets, or reassigning a new non-emergency path before the current path has had time to finish.

This was a severe gameplay regression on the Living floor: the floor could start normally, then after several simulated minutes visible corridor pockets formed where NPCs looked alive only as back-and-forth noise. Treat this as P0 AI behavior, not as cosmetic traffic.

Rules:

- routine room selection must stay local unless the target is an assigned/preferred anchor, a traveler route or a survival/emergency need;
- the NPC's current active path is sticky for ordinary routine intents; only emergency intents such as combat, flee, safety or healing may interrupt it mid-path;
- active paths should be followed to completion, abandonment or a real stale-path failure, not replaced by another low-pressure work/social/wander target every rethink tick;
- checks must distinguish normal corridor traffic from attractors by measuring local corridor cell/area pile-up, active stuck pathing and repeated corridor A-B-A reversals over time;
- `tests/living-npc-corridor-attractors.test.ts` is the regression guard for this exact failure and must remain in the normal unit/check gate despite generating a Living floor.

## AI And A-Life Boundary

AI may read live fields such as `alifeId`, `persistentNpcId`, `plotNpcId`, `faction`, `occupation`, `age`, `sex`, `needs`, `playerRelation`, `karma`, `rpg`, weapon and inventory. It may change live position, combat target, needs, health, inventory and compact transient AI state.

AI must not:

- create ordinary persistent NPC identities;
- refill a floor to a population cap;
- silently replace a killed persistent person;
- run pathfinding, needs, combat, line of sight or local event reactions for off-floor NPCs;
- mutate the full A-Life pool directly from routine behavior;
- serialize navigation caches, flow fields, actor-local cooldown internals or full behavior histories.

Persistent effects go through A-Life foldback, floor memory, compact events, faction/economy/quest state or an explicit current save section. Required persistent AI fields require a save shape bump, not legacy migration scaffolding.

Age and sex are demographic context, not a new per-frame scheduler. Routine AI and Markov/social adapters may use them for role fit, dialogue tone, family/adult checks, quest plausibility and fear/social context, but they must come from live entity fields or A-Life snapshots and must not trigger full-pool scans.

## Individual NPC State

The next NPC behavior pass should split persistent personality from transient live execution.

Compact persistent or sparse-overridden A-Life fields:

- `needProfileId`: deterministic need decay/restoration profile.
- `routineSeed`: stable personal jitter for cadence, target choice and tie breaks.
- `roleAiId`: civilian, worker, guard, medic, trader, traveler, cultist, scavenger or authored role family.
- `homeRoomId` or home anchor cell when the floor is known.
- `workRoomId`, work anchor cell or work route anchor when the floor is known.
- `socialRoomId` or faction/social anchor when needed.
- `shiftOffsetMinutes`: personal rhythm offset, not a global schedule lock.
- `duty`, `sociability`, `riskTolerance`, `greed`, `panicBias`: compact `0..255` traits.
- `lastSafeRoomId` only if shelter memory must survive floor travel.

Transient `AIState` fields for implementation:

- `intentId`;
- `intentStartedAt`;
- `intentUntil`;
- `nextDecisionAt`;
- `nextTargetResolveAt`;
- `targetRoomId`;
- `targetCell`;
- `reservationRoomId`;
- `reservationUntil`;
- `frustration`;
- `blockedUntil`;
- `lastIntentScore` for debug and hysteresis.

`NpcState` should become a visible/debug label derived from intent. It should not remain the source of truth for ordinary NPC decisions.

## Need Randomization

When A-Life materializes a floor, NPC needs should be deterministic but individualized:

- food, water, sleep, pee and poo start from stable per-NPC rolls, role profile and floor context;
- profession and faction bias the starting state, e.g. guards start more alert, cooks less hungry, travelers more thirsty, wounded scavengers more likely to seek treatment;
- current room can nudge needs, but should not make all actors in one room identical;
- materialization must not use `Math.random()` in a way that makes save/load or floor revisit behavior drift unpredictably.

This makes the first decision after floor activation local: one worker goes to a machine, another looks for water, another visits a bathroom, another keeps smoking, another responds to a monster sound.

## NPC Utility Intents

Each decision tick scores a compact list of intents. The list should stay small and data-driven:

- `safety`: samosbor, monster, gunfire, fire, fog, faction threat.
- `combat`: attack a hostile actor if brave, armed, ordered or cornered.
- `flee`: escape a stronger monster/NPC/player or a dangerous room.
- `toilet`: pee/poo pressure.
- `drink`: water need or dehydration risk.
- `eat`: food need or starvation risk.
- `sleep`: low sleep and safe enough context.
- `work`: role/profession duty.
- `heal`: low HP, medical room, med item or medic.
- `social`: talk, trade, rumor, family/friend proximity, quest affordance.
- `patrol`: guards, liquidators, hunters, cult watchers.
- `loot`: greed, nearby unattended item/container, faction rules.
- `repair`: mechanics/electricians/responders near broken content.
- `escort`: help ally/family/quest actor reach shelter or exit.
- `wander`: low-pressure local movement.

The `toilet` executor uses the same shared actor urination trace path as the player: actual relief paints compact yellow organic surface stains at the projected hit point instead of silently lowering a number. Repeated ticks while turning or moving can draw a line naturally, without laying a long ray in one frame. Ordinary NPCs still prefer bathroom rooms through the routine target model. `Faction.WILD` is the intentional rare faction hardcode and current design experiment: wild residents do not route to a toilet just to pee; when pee pressure wins, they relieve themselves in place and leave the same projected trace. Keep this exception narrow to the Wild faction, and do not use it as a pattern for new routine hardcodes.

Example score shape:

```txt
score = needPressure
      + roleBias
      + softRhythmBias
      + localStimulus
      + personalTraitBias
      + currentIntentStickiness
      - distanceCost
      - crowdPenalty
      - dangerPenalty
      - factionZonePenalty
```

The winning intent must beat the current intent by a hysteresis margin unless the new intent is emergency class. This prevents nervous twitching between kitchen, bathroom and work.

## Work Without Synchronized Streams

Work should not mean "go to nearest production room".

Rules:

- Every worker gets a stable work anchor or route on first materialization when possible.
- Work is split by profession: machine work, repair sweep, kitchen duty, medical duty, storage audit, office paperwork, patrol, delivery, guard post, research, scavenging or cult service.
- `shiftOffsetMinutes` and `routineSeed` only modify utility. They never hard-force a state transition for all NPCs.
- Common room-type flow fields remain useful for kitchens, bathrooms, med rooms and generic shelter. Personal home/work anchors should use direct room/cell targets or small role-specific source sets.
- Rooms have soft capacity. A crowded target gets a crowd penalty rather than accepting every actor.
- Reservation is local and approximate: reserve a room/anchor for a short time, release on arrival, failure, panic or combat.
- If the target is blocked, the NPC increases `frustration`, picks an alternate anchor or switches to a lower-score intent.

This keeps visible floor life dense but breaks the line of identical workers walking toward one factory field.

## Decision Cadence

There is no active-floor hot/warm/cold tiering. Every live AI actor receives the frame, with exactly three exclusions, and none of them is a distance tier: the controlled player, peer-controlled bodies in online co-op, and actors held by a running floor scene (`NpcRole.CINEMATIC_ACTOR`, `src/systems/cinematics.ts`) — those are scenery until the scene's `release` beat gives them back. Cadence belongs only to expensive choices inside that actor:

- NPC utility rescore uses a stable personal timer of `1.5..4.0s` (`UTILITY_RETHINK_BASE_SEC = 1.5` + `UTILITY_RETHINK_SPREAD_SEC = 2.5`, `src/systems/ai/npc_fsm.ts`), plus longer per-intent timers; the selected intent keeps executing every frame.
- Combat target scans use `combatTargetId` / `combatScanCd` and bucket queries; current targets are validated cheaply before a new scan.
- Path assignment uses baked navigation and cached behavior flow fields; current paths are followed every frame.
- Noise, social, crowd and threat reads are bounded by radius, result cap and local cooldown.
- No per-NPC `setInterval`.
- No per-frame full `entities`, full `World` or full A-Life pool scans.

The consequence is honest but minimal: every actor is active, yet expensive questions are not asked 60 times per second.

## Local Events And Memory

NPCs should react by locality and memory, not by omniscience.

Preferred flow:

1. A system publishes a compact `WorldEvent`.
2. Direct witnesses immediately update `NpcMemory`, rumor state or a short-lived intent.
3. Other nearby NPCs sample recent local facts on their staggered AI tick.
4. The fact changes fear, trust, hostility, rumor, target choice or a visible action.

Examples:

- A theft creates witness suspicion, not global knowledge.
- A monster sighting creates fear and a rumor near that zone.
- A faction fight makes nearby civilians flee and armed faction actors respond.
- A player rescue raises individual trust more than broad faction relation.
- A denied shelter can become a grudge on the person who was refused.

No routine AI should scan the whole event ring every frame.

## Samosbor Reaction

`state.samosborActive` and warning state are global pressure, not global orders. The actual reaction is per NPC:

- Citizens and scientists seek home, assigned room or nearest valid shelter.
- Liquidators may hold a corridor, escort civilians, fight monsters or hide if wounded/low on ammo.
- Cultists may move toward ritual pressure, guard a shelter, exclude outsiders or exploit chaos.
- Wild residents may scatter, raid containers, ambush or hide in unclaimed rooms.
- Travelers choose the nearest reachable safe room or route anchor rather than a family room.

Shelter choice is local and capped. Candidate sources:

- current room if sealable;
- family/home/assigned room;
- nearest `getSamosborShelterRoomIds()` candidates;
- nearby suitable rooms;

Shelter score should use distance, path availability, door state, room pressure, faction ownership, fear, trust, player relation and recent player behavior.

During active samosbor:

- high fear can freeze an NPC inside shelter;
- brave/armed actors can defend a door;
- trusted NPCs can follow or accept escort briefly;
- hostile NPCs can avoid the player or deny shared shelter;
- faction actors protect their own first;
- panic can break the plan if fog, monsters or door pressure rises.

If a samosbor effect rewrites, deletes, heals or creates an ordinary person who persists beyond the event, the result must update A-Life through explicit APIs and compact events.

## Monster AI Direction

A monster is a gameplay rule. It must change at least one decision: route, position, noise, light, water, door, item, crowd, ammo, faction/social choice or shelter behavior.

The target shape is:

```txt
ecology role + archetype FSM + stimuli + territory + counterplay reaction
```

Recommended archetypes:

- `chaser`: simple pursuit with one readable weakness.
- `ambusher`: waits in terrain, door, water, fog, corpse or container context.
- `territorial`: controls a room, feature, nest, fog pocket, water patch or door cluster.
- `resource_predator`: responds to food, documents, corpses, blood, light, sound or bait.
- `pack_hunter`: shares target locally with capped neighbors.
- `line_turret`: threatens visible straight lines with windup/cooldown.
- `parasite_controller`: uses hosts, commands or infection with strict caps.
- `trap_tether`: dangerous near an anchor, weaker or retreating away from it.
- `conditional_neutral`: can be traded with, fed, avoided or provoked.
- `hive_spawner`: creates capped children from a visible source.
- `room_puzzle_boss`: bound to a room rule with explicit counterplay.

Generic monster states:

- `Dormant`;
- `PatrolTerritory`;
- `InvestigateStimulus`;
- `WarnTelegraph`;
- `Commit`;
- `Recover`;
- `FleeReset`;
- `FeedClaim`;
- `ReturnHome`.

These do not require a new enum per monster. They can map to existing `AIGoal`, `monsterStage`, `ai.*` scalar fields and `aiFlags`.

### One Property, One Flag

Rule of the project since 2026-08-20. A species declares its property as a flag in `aiFlags` and brings its sprite in its own `src/entities/<id>.ts`.

- **Forbidden:** a field in `AIState` (`src/core/types.ts`) for one species, and a species-owned function in the shared `src/systems/ai/monster.ts`. Every entity in the world carries an `AIState` — including dropped items and projectiles — so a field added for one monster is paid for by all of them.
- **Reference (right):** Sculpture — the whole idea «moves only while unobserved» is the `weepingAngel` flag against a generic freeze-under-gaze rule; zero core fields, zero own functions in the shared AI.
- **Reference (right):** Black Liquidator — the property is appearance, and it lives in `src/entities/black_liquidator.ts`. The `looksLiquidator` flag buys exactly one line in `isHostile` (`src/systems/factions.ts`); the two modes reuse the existing `monsterStage` field, as Head Slug already does.
- **If state is genuinely needed:** put it in a `WeakMap` keyed by `Entity` next to the species logic, never in `AIState`. Sobrannyy, Slime Woman, Green Dog, Fog Shark and Nightmare already work this way, and their behaviour survived the 2026-08-20 cleanup unchanged because of it.
- **Cadence:** a species check that does not need every frame must not run every frame. The Black Liquidator witness scan runs about twice a second, staggered by entity id (`(Math.floor(time * 2) + e.id) % 4`), and reads «I was hit» from the shared threat memory (`getRecentCombatThreat`) instead of storing its own flag.

The cleanup that established this rule removed 25 fields from `AIState` and roughly 800 lines from `ai/monster.ts`. The census of the species clusters still left in `AIState` is in `problems.md`.

## Monster Stimuli

Shared stimuli should be compact and prioritized:

- hostile sight;
- recent damage;
- noise;
- bait or food scent;
- document scent;
- corpse or blood;
- light, dark, fog, water, wet line or fire;
- door/container/room-memory event;
- pack call;
- samosbor pressure.

Each stimulus needs a source, radius, severity, tags and short TTL. Monsters read local capped samples through `entity_index`, noise helpers, room memory, item/bait helpers or ecology-specific small scans. They do not scan the whole floor.

## Monster Territory, Drives And Packs

Territory is a first-class AI input:

- home room;
- door threshold;
- source feature;
- fog/water patch;
- corpse nest;
- office field;
- screen/apparatus;
- vent/abyss source;
- samosbor scar.

Territorial monsters should not chase forever across the whole floor. They pressure the edge, return to the anchor, lose strength outside the area or switch to restoring territory.

Drives are small bounded scalars:

- `fear`;
- `hunger`;
- `anger` or `arousal`;
- `packConfidence`;
- `territoryPressure`.

They decay on AI ticks and only open specific transitions. Hunger can override pursuit until combat lock; fear can trigger flee/reset; pack confidence can enable flank/share behavior.

Pack behavior must not be all-to-all. Use one howl/pulse/leader fact, capped neighbor query, shared target cooldown and deterministic slots around the target.

## Counterplay Contract

Counterplay must change AI state, not only damage numbers.

Good counterplay can:

- interrupt a windup;
- break line of sight;
- scare a pack;
- satisfy hunger with bait;
- expose a mimic;
- deny a territory anchor;
- force a reset;
- cut a wet/light/fog connection;
- make the monster choose a different target.

Every new or reworked monster needs:

- warning cue;
- tactical response;
- route/resource/social decision;
- event, rumor, mark, trace or loot clue;
- bounded query/cadence/cap;
- samosbor reaction or explicit reason for being exempt.

## Pathfinding And Movement

AI movement stays toroidal and field-based:

- use `world.wrap`, `world.delta`, `world.dist` and `world.dist2`;
- routine movement uses the baked navigation tree and behavior flow fields;
- common target classes should add a source provider instead of per-actor BFS;
- personal home/work targets can use direct room/cell paths with target-resolution caps;
- runtime geometry mutation must bump the correct dirty versions so stale paths and flow fields rebuild;
- actors must tolerate samosbor, doors and room changes by clearing or retargeting stale paths.

### Navigation Graph And Runtime Edits

The baked navigation is a 2-level **Region-Portal HPA\*** graph in `src/systems/ai/pathfinding.ts`: regions (rooms + `16×16` clusters) linked by portals, with a region-node next-hop matrix `_regionNext` built one BFS per region (O(R·E), no Floyd-Warshall, no spanning-tree seams, toroidal cycles preserved). Queries are O(1).

Runtime destructibility/construction (wall break, wall/door build, door lock or break) updates the graph **incrementally**, never by a mid-game full rebake:

- A mutator reports its changed cells via `markNavigationCellsDirty(cells)`. On the next `ensureNavigationTree`, `patchNavigationRegions` refloods only the affected `16×16` clusters, rescans their borders and rebuilds `_regionNext` (sub-ms). Cluster ids just grow; >1.5× growth triggers one compacting bake.
- Full `bakeNavigationTree` happens at exactly two planned points — new floor and post-samosbor stitch — matching the Iron Law in [optimization.md](optimization.md).
- **Accept-stale:** unreported mutators (anomaly wall-snakes, Conway life, section_shift, etc.) are intentionally not wired; their edits leave a briefly sub-optimal/missing path for a few cells until the next planned bake. This keeps navigation one universal, geometry/anomaly-agnostic layer. Do not add a `core/world.ts` hook or instrument anomaly mutators to "complete" the dirty set.
- Wired reporting sites: `breach_charge.ts`, `weapon_beams.ts`, `door_state.ts`, `main.ts` (map-editor / block-kit).

## Debug And Telemetry

Future debugging should show behavior pressure without serializing large histories:

- AI stats: live AI, updated actors, skipped controlled-player actors, NPC/monster split, plot/boss/attacker/projectile-owner counts. Actors held by a floor scene are skipped without incrementing `aiStats.skipped`, so during a scene the counters under-report — read `activeFloorSceneId()` before blaming the numbers.
- Pathfinding stats: cache hits, bakes, assigned paths, denied/deferred paths.
- Entity-index stats: query count, bucket checks, max result count.
- NPC intent sample: last intent, last score, next decision time, target room/cell.
- Monster sample: archetype, stimulus, territory, drive scalars, counterplay state.
- Samosbor sample: selected shelter, fear, escort/deny/defend decision.

Any trace buffer should be bounded, for example the last `300` AI-relevant samples.

## Save Boundary

Transient behavior can be lost on reload:

- current intent;
- path;
- flow-field assignment;
- target resolve cooldown;
- local reservations;
- monster short windup/recover timers unless already represented by an existing save section.

Persistent consequences must be compact:

- death;
- HP;
- position;
- inventory;
- player relation;
- karma/counters;
- quest/faction/economy facts;
- compact world events;
- floor-memory changes.

Use `alifeId`, `persistentNpcId`, `plotNpcId`, room id, zone id and route key. Do not persist behavior by transient `entity.id` unless the entity is explicitly live-session-only.

## Future Implementation Order

1. Keep fixed `100_000` A-Life population as the runtime baseline in `src/systems/alife.ts`.
2. Add deterministic A-Life need/personality fields used at materialization.
3. Add home/work/social anchors and soft room capacity.
4. Expand the current per-NPC samosbor shelter hook into full emergency intent selection for escort, defense, denial and panic.
5. Move common monster behavior toward archetype helpers while preserving existing special counterplay.
6. Add broader focused tests for cadence, target selection, path invalidation, shelter reaction and no-refill guarantees.

## Acceptance Checklist

For any AI change, answer:

- Does it operate only on live active-floor actors?
- Does it avoid ordinary population refill?
- Does it use toroidal world math?
- Is every scan bounded by radius, cap and cadence?
- Does it reuse `entity_index` and pathfinding caches?
- Does it avoid synchronized global schedule decisions for ordinary NPCs?
- Does it preserve NPC-vs-NPC, NPC-vs-monster and monster-vs-NPC behavior?
- Does it publish compact events for player-visible consequences?
- Does persistent state fold through A-Life/save/floor memory instead of transient AI caches?
- Does a monster change player tactics and show readable counterplay?

## Anti-Patterns

Reject these:

- global clock bands as the primary ordinary NPC decision source;
- all workers using one broad room-type target at the same time;
- per-frame full `entities`, full room, full event or full A-Life scans;
- per-actor BFS for routine behavior;
- invisible off-floor realtime simulation;
- renderer-owned gameplay state;
- content-specific branches in `main.ts`, `core/world.ts`, `render/webgl.ts` or the generic AI orchestrator;
- monster additions that only change HP, speed or sprite;
- AI code that creates persistent people after A-Life materialization;
- hidden replacement of killed NPCs;
- unbounded barks, logs, events or debug traces.
