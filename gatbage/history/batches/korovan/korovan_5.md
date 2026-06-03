# Korovan 5: normalize existing NPC spawn paths

> Parallel Agent 5 plan.
>
> Owns current event/scripted paths that create human NPCs. The goal is to reclassify natural arrivals as migrations or reserved identities and leave only explicit exceptions as true creation.

## Purpose

Current audit found these live creation classes:

- `src/systems/scripted_arrivals.ts`: Hell holdout arrival spawns Major Grom and up to five liquidators near a lift.
- `src/systems/samosbor_director.ts`: `extra_patrol` spawns up to two liquidators during a samosbor beat.
- `src/systems/faction_events.ts`: normal path claims existing NPCs; forced/debug path can create.
- `src/systems/samosbor.ts`: istotit can create an ordinary NPC and assign persistent identity.
- debug/map-editor/terminal tooling can create entities manually.

Target rule:

- Story/authored persistent NPCs are pre-reserved at run start inside the same fixed `100_000` A-Life population.
- Hell arrivals are `reason: 'quest' | 'faction'` migrations/reserved identities.
- Samosbor patrols are `reason: 'samosbor' | 'faction'` migrations.
- Normal faction reinforcements use existing NPCs or migration.
- Istotit remains the named supernatural exception.
- Debug/editor/tooling remain outside population simulation.

## Files

Primary:

- `src/systems/scripted_arrivals.ts`
- `src/systems/samosbor_director.ts`
- `src/systems/faction_events.ts` only if a non-debug forced path leaks into runtime.
- `src/systems/samosbor.ts` only to label/guard istotit creation, not to redesign samosbor.

Tests:

- `tests/scripted-arrivals-migration.test.ts`
- `tests/samosbor-director-migration.test.ts`
- focused additions to `tests/faction-events.test.ts` and samosbor tests if touched.

Avoid editing:

- `src/systems/alife.ts` except using Agent 1 helpers.
- `src/systems/alife_migration.ts` except using Agent 3 enqueue/materialize functions.
- `main.ts`.

## Scripted Hell arrivals

Current behavior:

- `shouldSpawnHellHoldoutArrivals()` gates plot state and alive/present Major Grom.
- `spawnMajor()` directly creates Major Grom.
- `spawnLiquidator()` directly creates guards.
- `updateScriptedArrivals()` finds an anchor and pushes them.

Target behavior:

1. Keep plot gate exactly as shipped.
2. Major Grom:
   - use stable `plotNpcId` if he is authored and death-tracked;
   - reserve his persistent identity in the run-start population plan when possible;
   - if the scene needs a non-plot event body, reserve it at run start as an `event_reserved` identity, not at local spawn time;
   - do not synthesize replacement if dead/present/blocked.
3. Liquidator guards:
   - select existing liquidator A-Life ids from source route groups where possible;
   - if no candidates exist, either reduce guard count or use declared run-start reserved identities;
   - never create anonymous ordinary refill bodies because local slots are free.
4. Materialize at the same believable lift anchor.
5. Publish event tags:
   - `scripted_arrival`
   - `alife_migration`
   - `hell_holdout`
   - `liquidator`
   - `quest` / `faction`.

Implementation choices:

- Best final path: enqueue arrivals through Agent 3 `enqueueAlifeArrival()` and let pending arrival processing materialize them.
- Acceptable transitional path: call Agent 1 `materializeAlifeArrival()` directly after moving/reserving records.

Tests:

- when Grom is dead, no new Grom appears;
- when Grom already present, no duplicate appears;
- guard count cannot exceed available/reserved identities;
- every non-plot guard has `alifeId` or declared event persistent id;
- event payload records `fromFloorKey` and `toFloorKey`.
- reserved Hell arrival identities are present in the same `100_000` population budget before the Hell floor is generated.

## Samosbor director extra patrol

Current behavior:

- `spawnPatrol()` creates up to two liquidator NPCs near player/anchor;
- `active_liquidator_patrol` data beat has `effectId: 'extra_patrol'`.

Target behavior:

1. Treat beat as a faction/samosbor migration.
2. Source candidates:
   - liquidator-controlled source floor keys;
   - Ministry story key;
   - liquidator-heavy design floors;
   - existing A-Life records matching `Faction.LIQUIDATOR`.
   - run-start reserved patrol identities only if the beat declares them in population plan data.
3. On beat:
   - if active samosbor pressure makes arrival unfair, enqueue delayed arrivals;
   - otherwise materialize near lift/route anchor;
   - if no eligible migrants or actor cap fails, return effect failure or publish delayed response event.
4. Do not spawn fresh liquidators just because `entitySpawnSlots()` has capacity.
5. Keep director cadence/cooldown/maxPerCycle behavior.

Tests:

- `extra_patrol` uses migration helper instead of direct anonymous spawn;
- no eligible liquidator records means no spawned patrol and no replacement;
- successful patrol entities have `alifeId`/`persistentNpcId`;
- cooldown/failure behavior remains bounded.

## Faction events

Current behavior appears mostly correct:

- normal `updateFactionEvents(..., force=false)` claims existing NPCs;
- `forceFactionEvent()` uses creation for debug/forced path.

Target:

- preserve claim-first normal runtime;
- ensure creation remains debug-only;
- if future non-debug reinforcement is added, route it through migration/reserved identity.
- any authored faction captain/leader/giver that persists should be reserved in the population plan instead of being born inside a faction event.

Tests:

- normal faction event does not increase ordinary NPC count except by claiming existing actors;
- forced debug path is labeled/isolated and not called by normal update.

## Istotit exception

Current behavior:

- istotit fog-create can create a random NPC and calls `assignPersistentAlifeNpcFromEntity()`.

Target:

- keep as explicit exception: "порождение из небытия";
- ensure it is capped by entity limits and event-backed;
- ensure created human receives persistent identity immediately;
- mark/describe event with reason `samosbor` and intent `istotit_creation` if event payload can carry it without broad changes.

Do not convert istotit into migration. It is the one diegetic non-natural creation path.
Do not include istotit-created future people in the initial prefill plan; they are explicitly post-run anomalies, and the exception must remain visible.

## Tooling/debug boundaries

Document in code comments only where useful:

- map editor / NET terminal creation is tooling, not population simulation;
- debug/stress commands are debug-only;
- they do not need migration.

Do not spend this packet rewriting editor/debug systems.

## Done

This packet is done when:

- all natural human arrivals in touched systems use migration/reserved identity;
- plot/story persistent NPCs touched by these systems are planned as run-start reserved identities inside the fixed population;
- Hell arrivals and samosbor patrols no longer create anonymous ordinary NPCs;
- faction event normal path remains claim-first;
- istotit remains the only gameplay non-natural creation path and immediately persists created humans;
- tests prove no duplicate Grom, no patrol refill and no normal faction-event creation.
