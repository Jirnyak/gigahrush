# EXP09 Elevator Loop 404 - Integration Contract

Статус: future implementation contract. This document constrains where EXP09 may integrate when code work begins. It does not authorize current code edits.

## Ownership Boundary

EXP09 owns numbered floor definitions, numbered floor instance state, elevator anomaly resolution, 404 pocket content/generator, numbered-floor debug commands and save/load normalization for active numbered instances. EXP09 does not own global `FloorLevel` expansion, metro route logic, archive document law, black market economy, samosbor variant definitions, global NPC memory architecture or root docs.

Cross-expansion use must be optional. Missing metro/archive/market/rumor hooks disable bonuses or fall back to 404-only behavior; they must not break build, save or debug.

## Planned Future Files

| Future file | Ownership | Purpose | Constraint |
| --- | --- | --- | --- |
| `src/data/numbered_floors.ts` | EXP09 | `NumberedFloorDef` registry for 404/556/777/1337. | Pure data; stable ids; no generator imports. |
| `src/systems/floor_instances.ts` | EXP09 | active instance FSM, seed/state, save/load normalization. | One active numbered instance in MVP. |
| `src/systems/elevator_anomalies.ts` | EXP09 | anomaly chance/entry resolver for lift interactions. | Event/interaction cadence only; no per-frame polling. |
| `src/gen/numbered/floor_404.ts` | EXP09 | playable 404 pocket generator. | Small deterministic pocket; closed geometry. |
| `src/gen/numbered/floor_556.ts` | EXP09 phase-2 | P-46/556 pocket. | Stub-safe until playable. |
| `src/gen/numbered/floor_777.ts` | EXP09 phase-2 | safe-trap pocket. | Stub-safe until playable. |
| `src/gen/numbered/floor_1337.ts` | EXP09 phase-2 | radio/DATA pocket. | Stub-safe until playable. |
| `src/data/rumors.ts` | shared optional | 404/556/777/1337 rumor rows. | Additive rows only; no rumor system rewrite. |
| `src/systems/debug.ts` | shared optional | numbered-floor debug commands. | Debug calls EXP09 APIs; no resolver logic in debug file. |
| `src/core/types.ts` | shared critical | serialized `activeFloorInstance` only if unavoidable. | Minimal optional field; old-save normalization required. |

## Interface Drafts

Exact syntax may change during implementation. The contract is the data shape and dependency direction.

```ts
export interface NumberedFloorDef {
  id: string;
  displayNumber: string;
  title: string;
  entryConditionIds: readonly string[];
  generatorId: string;
  localRuleIds: readonly string[];
  mapPolicy: 'normal' | 'hidden' | 'mislabelled' | 'contradictory';
  maxDurationMinutes?: number;
  exitRuleIds: readonly string[];
  rewardTags: readonly string[];
  samosborBias: readonly SamosborAnomalyBias[];
  memoryEffectId?: string;
  fallbackFloor: FloorLevel;
  playableMvp: boolean;
}

export interface FloorInstanceState {
  kind: 'numbered';
  instanceId: string;
  defId: string;
  seed: number;
  phase: 'entering' | 'active' | 'exiting' | 'closed';
  enteredAtMinute: number;
  lastStableFloor: FloorLevel;
  lastStableX: number;
  lastStableY: number;
  visitedRoomMask: number;
  ruleFlags: Record<string, boolean | number | string>;
  rewardClaimedIds: readonly string[];
  exitState?: FloorInstanceExitState;
}

export interface ElevatorAnomalyRequest {
  sourceFloor: FloorLevel;
  liftX: number;
  liftY: number;
  requestedTarget?: FloorLevel;
  samosborVariantId?: string;
  samosborActive: boolean;
  clueIds: readonly string[];
  debugForceDefId?: string;
  seed: number;
}

export interface ElevatorAnomalyResult {
  kind: 'normal' | 'numbered_instance' | 'blocked';
  targetFloor?: FloorLevel;
  entryRequest?: FloorInstanceEntryRequest;
  warningIds: readonly string[];
  chancePermille: number;
  reasonIds: readonly string[];
}
```

The key rule: UI/debug/render consume summaries and state snapshots. They do not decide anomaly outcomes.

## Required Hooks

| Hook | Direction | Contract |
| --- | --- | --- |
| `listNumberedFloorDefs()` | UI/debug -> EXP09 | Returns immutable summaries, including playable/stub status. |
| `rollElevatorAnomaly(request)` | lift interaction -> EXP09 | Deterministically returns normal transition, block or instance entry. |
| `beginFloorInstance(entryRequest)` | interaction/debug -> EXP09 | Creates active instance after validating def/generator/fallback. |
| `getActiveFloorInstanceSnapshot()` | save/debug/HUD -> EXP09 | Returns serializable state summary with no mutable internals. |
| `resolveFloorInstanceExit(exitId)` | interaction/debug -> EXP09 | Returns stable destination, rewards, events and close reason. |
| `normalizeFloorInstanceOnLoad(saveState)` | save/load -> EXP09 | Restores valid instance or returns player to last stable floor/pos. |
| `applyNumberedMapPolicy(instanceState, mapView)` | map/HUD -> EXP09 | Applies label/marker distortion only, never collision changes. |
| `publishNumberedEvent(event)` | EXP09 -> event/log | Uses generic event/log if available; fallback debug/HUD message. |

## Elevator Anomaly Contract

Elevator anomalies resolve only when the player interacts with an elevator, a scripted event calls a lift transition, or debug explicitly rolls the resolver. The resolver must not run every frame. It must return warning ids and reason ids, even when the result is normal.

Baseline behavior stays normal. If no clue, no active samosbor modifier and no debug override exist, normal elevator travel should dominate. `404` can still appear rarely after a silent/no-siren samosbor or corrupted lift clue, but the chance must be low enough that it remains a legend rather than a commute.

## Save/Load Tolerance

Save data may contain optional active numbered instance state. Old saves without it load as normal. New saves with an active instance load only if def id, generator id and fallback position are valid. If any required piece is missing, normalization returns the player to `lastStableFloor/lastStableX/lastStableY`, closes the instance, records reason `numbered.missing_def` or `numbered.missing_generator`, and continues.

Never serialize raw generated pocket cells as permanent world state for MVP. Store seed and bounded flags. If future implementation requires serialized pocket deltas, it must remain optional and versioned.

## Event And World Log Contract

Required event categories: anomaly warning seen, numbered instance entered, map contradiction observed, reward claimed, memory mark applied, instance exited, instance normalized on load, bad exit fallback. Severity is high for bad exit and load normalization, medium for entry/exit/reward, low for repeated warning observations.

Event ids must be stable:

| Event ID | Trigger | Required payload |
| --- | --- | --- |
| `numbered.anomaly_warning` | resolver returns warning ids | def candidate, warning ids, source floor |
| `numbered.instance_entered` | active instance created | instance id, def id, seed, source floor |
| `numbered.map_contradiction` | player observes wrong map clue | room id, map policy |
| `numbered.reward_claimed` | item/document/info reward | reward id, def id |
| `numbered.memory_mark` | memory flag applied | effect id, def id |
| `numbered.instance_exited` | successful or neutral exit | exit id, destination floor |
| `numbered.bad_exit` | timeout/wrong-loop failure | exit id, fallback destination |
| `numbered.load_normalized` | missing/invalid active instance on load | reason id, fallback destination |

## Optional Cross-Expansion Hooks

| Hook | Expected provider | EXP09 behavior if present | Fallback if absent |
| --- | --- | --- | --- |
| `metro.wrongExit.numbered404` | EXP02 | metro wrong exit can request 404 entry | disabled; elevator entry still works |
| `archive.document.order404` | EXP03 | `doc_order_404_not_found` can unlock archive query | document remains local readable/reward |
| `market.lostItems.bella404` | EXP05 | lost-item trader can price/recover items | one local recovery node only |
| `rumor.source.floor404` | AG09 rumors or generic rumor system | 404 discovery creates rumor source | bounded memory flag/debug line |
| `void.protocol.notFound` | EXP10 | late-game void protocol can react to 404 | no void effect |

Optional means optional. EXP09 must not import future files by assumption.

## Debug Contract

Debug must construct and inspect every critical state directly. Commands must print reason ids, warning ids, def id, seed, map policy, last stable floor/position, exit id and reward dedupe result. Debug may bypass entry conditions, but the output must mark the bypass.

Minimum commands: `numbered.listDefs`, `numbered.forceEnter`, `numbered.rollAnomaly`, `numbered.dumpState`, `numbered.setMapPolicy`, `numbered.claimReward`, `numbered.forceExit`, `numbered.simulateMissingLoad`, `numbered.clearInstance`.

## Constraints For Shared Interfaces

Do not add `FloorLevel.NUMBERED_404` or a general numbered enum for MVP. Do not put anomaly chance logic in render, HUD or debug. Do not make map distortion alter collision or pathfinding truth. Do not make 404 require metro/archive/market availability. Do not create persistent residents or full A-Life schedules inside the MVP pocket. Do not update `README.md` until code exists and build passes.

## Integration Risks

The highest risk is save corruption from temporary floors. The second risk is player mistrust because distorted maps look like bugs. The third risk is enum churn and cross-agent conflicts. The fourth risk is reward exploitation through repeated lost-item recovery. The contract counters these with one active instance, stable fallback, warning ids, optional hooks, no permanent `FloorLevel`, deterministic exits and one-shot rewards.

## Acceptance For Integration

Future implementation is acceptable when it can merge with only additive shared hooks, passes `npm run build`, proves normal elevator travel still works, proves forced 404 entry/exit, proves save/load fallback, proves reward dedupe, shows quiet/electric or quiet/classic samosbor bias, and leaves missing optional metro/archive/market hooks as debug-visible disabled integrations rather than build errors.

## Director Integration

Companion contract: `director_hooks.md` defines the EXP09 director beats, signal provider, effect adapter boundaries, cooldowns, chain slots, trace payload and debug validation for future integration with `00_samosbor_director`. This section is a boundary note only; it does not authorize source edits.

The director may pace 404 as a campaign event through four phases: anomaly prep, wrong marker, pocket entry and exit backlash. Prep beats can reserve blank indicator, wrong chime, paperwork or rumor warnings. Marker beats can request one bounded map-label contradiction. Entry beats can arm or request a 404 window, but only EXP09 elevator anomaly and floor-instance adapters may validate and create the instance. Exit backlash beats can apply one bounded memory or warning aftermath after EXP09 reports a successful or bad exit.

The director must not create permanent `FloorLevel` values, instantiate numbered floors directly, alter collision/pathfinding, serialize pocket cells, mutate inventory directly, scan all lifts/rooms/NPCs/items, or force 556/777/1337 entry while those defs are stub-only. Missing director, metro, archive, market, rumor or void adapters degrade to typed rejection reasons and debug-visible disabled hooks.

Required future EXP09 signal surface is compact: playable 404 def flag, active instance flag/def id, recent entered/exited/bad-exit/map-contradiction events, 404 clue flag, false-floor memory flag, one lost-item availability flag, elevator interaction context and optional metro/archive/samosbor variant signals. Signal collection remains event-bound or rare-tick only with steady `0 us/frame`.

Required future director-facing effects are narrow adapter requests: reserve warning, seed readable clue, arm wrong marker, arm entry window, request instance entry, apply memory mark, publish aftermath, stabilize return lift and trace-only fallback. Effects return success/failure reason codes. Pure adapter failure consumes no cooldown; visible partial success may consume the relevant cooldown.

EXP09 participates in route-error and aftermath chains only through named slots such as `route_error_to_404`, `archive_to_404`, `samosbor_to_404`, `404_exit_backlash`, `404_relief` and `numbered_stub`. Chain payloads store ids, warning ids, fallback hashes, expiry and reason codes only; they do not import partner expansion runtime.
