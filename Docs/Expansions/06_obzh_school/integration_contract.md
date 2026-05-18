# Expansion 06 Integration Contract: Grouped NPC Evacuation

Статус: planning contract for future TypeScript implementation. This file defines boundaries so other agents can integrate without owning school content.

## Ownership

Expansion 06 owns school evacuation data, school lessons, school micro-perks and school-local event state. It does not own global A-Life, samosbor timer, faction relations, quest core, world generation orchestrator, debug panel architecture or generic pathfinding. Integration must happen through narrow interfaces, data registration, event publication and optional adapters.

If a required global system does not exist, Expansion 06 must degrade to local state and debug-triggered events. It must not invent direct dependencies on another agent's pending branch.

## Director Integration

Director-facing integration is defined in `director_hooks.md`. Expansion 06 may register school beat definitions, a bounded signal provider and an optional effect adapter when the Samosbor Director registry exists. The director may request lesson offers, local evacuation drills, bad-food canteen pressure, quiet-alarm setup and aftermath documents; the school system remains the sole owner of evacuation execution, panic math, lesson completion and outcome records.

Missing director provider or effect adapter is not a compile failure. Beats must reject with typed director reasons such as `missing_signal_provider`, `missing_signal`, `effect_adapter_missing` or `effect_failed`. No director hook may spawn child NPC groups, mutate school routes directly, alter global samosbor timing, or run school scans from the render loop.

## State Model

Evacuation is group-based. Children are counted, not simulated individually. Key named NPC can exist as normal `Entity` records, but the group itself is a bounded aggregate.

```ts
export type SchoolEvacRouteState =
  | 'inactive'
  | 'waiting'
  | 'moving'
  | 'blocked'
  | 'sealed'
  | 'lost'
  | 'failed';

export type SchoolAlarmVariant =
  | 'classic'
  | 'silent'
  | 'false_alarm'
  | 'wet'
  | 'electric'
  | 'meat_resonance';

export interface SchoolEvacGroupState {
  id: string;
  count: number;
  panic: number;
  currentRoomId: number;
  targetRoomId: number;
  routeState: SchoolEvacRouteState;
  routeId: string;
  routeNodeIndex: number;
  leaderEntityId: number;
  lastTick: number;
  flags: number;
}

export interface SchoolEvacRouteNode {
  roomId: number;
  doorCell: number;
  risk: number;
  blockedFlag: number;
}

export interface SchoolEvacEventState {
  active: boolean;
  schoolId: string;
  variant: SchoolAlarmVariant;
  startedAt: number;
  lastTick: number;
  outcome: 'none' | 'clean' | 'partial' | 'failed';
  groups: SchoolEvacGroupState[];
}
```

Future implementation should store active state in a bounded module-level system or a compact `GameState` extension with migration. The route list should be immutable data generated when the school POI is stamped.

## Public API

```ts
export interface SchoolEvacStartOptions {
  schoolId: string;
  variant: SchoolAlarmVariant;
  source: 'quest' | 'debug' | 'samosbor_hook' | 'dialogue' | 'director';
  forceDoorBlock?: boolean;
}

export interface SchoolEvacTickResult {
  active: boolean;
  outcome: 'none' | 'clean' | 'partial' | 'failed';
  changedGroupIds: string[];
  publishedEventCount: number;
}

export function startSchoolEvacuation(
  state: GameState,
  world: World,
  options: SchoolEvacStartOptions,
): boolean;

export function tickSchoolEvacuation(
  state: GameState,
  world: World,
  now: number,
): SchoolEvacTickResult;

export function getSchoolEvacDebugSnapshot(
  state: GameState,
): readonly SchoolEvacGroupState[];

export function resetSchoolEvacuation(
  state: GameState,
  reason: 'debug' | 'completed' | 'load_migration',
): void;
```

API rule: calls must be idempotent where practical. Starting an already active event returns false or updates debug message, but must not duplicate groups.

## Event Contract

If the world event bus is available, Expansion 06 publishes these event types. If not, it writes equivalent HUD/log messages through existing message APIs and keeps local outcome state.

| Event type | Required payload | Consumers |
| --- | --- | --- |
| `school_lesson_completed` | `schoolId`, `lessonId`, `perkId`, `npcId?` | Log, quest, dialogue, memory. |
| `school_evac_started` | `schoolId`, `variant`, `source`, `groupCount` | HUD, debug, NPC barks. |
| `school_group_blocked` | `schoolId`, `groupId`, `roomId`, `doorCell`, `panic` | HUD, debug, possible quest prompt. |
| `school_group_sealed` | `schoolId`, `groupId`, `count`, `panic` | Memory, relations, outcome. |
| `school_evac_completed` | `schoolId`, `variant`, `outcome`, `savedCount`, `lostCount` | Journal, documents, dialogue. |
| `school_emergency_box_used` | `schoolId`, `roomId`, `countBefore`, `countAfter` | Economy/container future hook. |

Privacy defaults: evacuation outcomes are local/public inside school zone, not global gossip unless a named NPC witnesses or the player reports it. Severe failure may become important world event, but the school module does not force global rumor spread.

## AI And Pathfinding Constraints

The group system must not call the generic NPC BFS per child. It may use one of three cheap route methods, in order of preference:

| Method | Use case | Constraint |
| --- | --- | --- |
| Precomputed room route | MVP and normal school | Route is a small array of room/door nodes generated with POI. |
| One BFS per group start | Fallback if POI route missing | Max once per group per event, never per frame. |
| Direct room adjacency | Low-tier fallback | Ignores exact tile path; uses room connectivity and door states. |

Individual named NPC can pathfind normally only when they are already existing characters and not representing the crowd. Pasha can move as NPC; `class_5b` cannot spawn 12 child entities for pathing in MVP.

Tick cadence:

| Tier | Cadence | Group cap |
| --- | ---: | ---: |
| Low | 250 ms | 1 |
| Middle | 250 ms | 3 |
| High | 125 ms | 4 |
| Ultra | 125 ms | 4 logic, more cosmetic only |

No school logic runs while `active === false`, except cheap debug snapshot access and event start checks.

## Door And Room Contract

School routes refer to doors by cell index and room ids. Door state is read from existing world cells/features. The school module may request an interaction or mark a school-local blocked flag; it must not redefine global door semantics.

Required door outcomes:

| Door condition | Group result |
| --- | --- |
| Open/passable | group advances to next route node on tick. |
| Closed but usable | group waits; player/leader can open; panic increases slowly. |
| Hermetic closed after target reached | group becomes `sealed`. |
| Blocked/jammed | group becomes `blocked`; route may switch once if alternate exists. |
| Fog/high risk beyond door | panic increases; `perk_fog_discipline` can reduce delta. |

Room ids must be validated. Invalid room id, negative group count or route index outside array is a fatal school-state error and must trigger black-box dump in future code.

## Panic Model

Panic is integer 0-100. It changes on event ticks, not render frames.

```ts
panicDelta =
  baseVariantPressure
  + blockedDoorPressure
  + fogRoutePressure
  - teacherDiscipline
  - activePerkRelief
  - stockedEmergencyBoxRelief;
```

The exact math can be tuned, but it must stay deterministic for the same event state and seed. Panic crossing thresholds changes behavior:

| Panic | Effect |
| ---: | --- |
| 0-39 | Group follows leader; no penalty. |
| 40-69 | Movement delay increases; barks/log messages appear. |
| 70-89 | Chance of partial count loss if blocked too long. |
| 90-100 | Group may become `lost` unless sealed soon or assisted. |

No random per-child panic rolls. If randomness is needed, roll once per group per threshold crossing.

## Black Box Telemetry Contract

Future code must keep a fixed circular buffer of 300 entries for active school evacuation.

```ts
export interface SchoolEvacTelemetryEntry {
  frame: number;
  time: number;
  variant: SchoolAlarmVariant;
  groupHash: number;
  savedCount: number;
  lostCount: number;
  maxPanic: number;
  playerRoomId: number;
  routeFlags: number;
}
```

On impossible state or NaN, dump buffer to `Docs/AgentLogs/Dump_EXP06_SCHOOL.bin`. The dump must be binary or compact JSON written once per fault, not spammed every tick.

## Save And Load

MVP may choose one of two strategies:

| Strategy | Rule |
| --- | --- |
| Conservative | Active school events do not persist; on load they reset with a log entry. |
| Persistent | Store compact active state: school id, variant, startedAt, groups, outcome. |

Conservative is acceptable for first MVP because it avoids save corruption. Persistent requires migration for old saves and validation of room ids after world regeneration.

## Debug Contract

Debug commands must call public API only. They may not mutate private group arrays directly.

Required debug snapshot fields: `schoolId`, `variant`, `active`, `outcome`, `groupId`, `count`, `panic`, `roomId`, `targetRoomId`, `routeState`, `routeNodeIndex`, `lastTick`.

Verification debug flow:

1. Start classic drill.
2. Dump groups and confirm one group in `waiting`.
3. Block next door.
4. Tick until group becomes `blocked`.
5. Clear/open route through normal interaction or debug reset.
6. Confirm `sealed` or documented `failed` outcome.

## Rejected Integration Patterns

Per-child `Entity` spawning for class groups is rejected for MVP because it scales pathfinding, collision and render work with crowd size. A new global `AIGoal.EVACUATE_CHILDREN` is rejected unless the existing AI owner asks for it; school can use local route state. A new `FloorLevel.SCHOOL` is rejected until the POI proves the loop. New physics for panic, water or crowd pressure is rejected; use room flags, route risk and visual fakes.
