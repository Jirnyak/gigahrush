# EXP09 Elevator Loop 404 - Director Hooks

Status: implementation-ready director contract for future integration. This document authorizes no source code edits.

Authority: `expansion.md`, `content_manifest.md`, `implementation_plan.md`, `integration_contract.md`, and `gatbage/reference/expansions/00_samosbor_director/{expansion.md,integration_contract.md,director_hooks.md}`.

## Boundary

EXP09 owns numbered-floor definitions, active floor instance state, elevator anomaly resolution, 404 pocket content, map-label distortion, numbered-floor rewards, exit resolution and numbered-floor debug. The Samosbor Director owns pacing: when to prepare the player, when to arm a wrong marker, when to request an entry opportunity, when to schedule backlash after exit and how to connect EXP09 into route-error chains.

The director must never create a floor instance by itself, add a permanent `FloorLevel`, alter collision, rewrite elevator travel, mutate inventory directly, scan the whole world, or decide pocket geometry. It may select a beat, emit a compact request/effect to EXP09 adapters, and record a trace. If EXP09 runtime adapters are absent, director beats reject with `missing_signal_provider` or `effect_adapter_missing` and consume no cooldown.

Steady cost target is `0 us/frame`. EXP09 director evaluation happens on director rare tick, elevator interaction, samosbor aftermath, recent route-error event, load normalization or explicit debug.

## Signal Provider

Future EXP09 may expose one read-only provider:

```ts
export const numberedFloorDirectorSignals: DirectorSignalProvider = {
  id: 'exp09.numbered_floors',
  expansionId: '09_elevator_loop_404',
  collectSignals(snapshot, out) {
    // Caller-owned output. No allocation-heavy formatting and no world scan.
  },
};
```

Provider output is aggregate state only.

| Signal id | Type | Source owner | Meaning | Required cap |
| --- | --- | --- | --- | --- |
| `numbered.def.404.playable` | flag | EXP09 registry | `numbered.404.not_found` has a valid generator and exit rules. | one boolean |
| `numbered.def.556.stub` | flag | EXP09 registry | 556 exists as stub/debug row only. | one boolean |
| `numbered.active` | flag | floor instance system | A numbered floor instance is currently active. | one boolean |
| `numbered.active.def` | string id | floor instance system | Active def id for rejection/debug. | one id |
| `numbered.recent.entered404` | event flag | EXP09 telemetry/event log | Player recently entered 404. | recent event window |
| `numbered.recent.exited404` | event flag | EXP09 telemetry/event log | Player recently exited 404. | recent event window |
| `numbered.recent.badExit404` | event flag | EXP09 telemetry/event log | Timeout or wrong-loop fallback happened recently. | recent event window |
| `numbered.recent.mapContradiction` | event flag | EXP09 map policy/event log | Player observed a wrong marker or map contradiction. | recent event window |
| `numbered.clue.404` | flag | documents/rumor/debug aggregate | Player has any 404 clue: letter, blank ticket, wrong route paperwork, archive card or debug flag. | bounded bit |
| `numbered.memory.falseFloor` | enum/hash | memory/rumor aggregate | Player or NPC memory contains a false floor number. | one enum/hash |
| `numbered.reward.doc404.missing` | flag | inventory/document aggregate | `doc_order_404_not_found` has not been awarded. | one boolean |
| `numbered.reward.lostItemAvailable` | flag | inventory/lost-item aggregate | One bounded low or mid tier lost item can be recovered. | one boolean |
| `numbered.lift.nearKnown` | flag | elevator interaction cache | Player is at a valid known elevator. | one boolean |
| `numbered.lift.recentNormal` | event flag | elevator transition event | A normal elevator transition happened recently. | recent event window |
| `numbered.lift.recentCorrupt` | event flag | elevator anomaly telemetry | Elevator produced blank number, wrong chime or corrupted target recently. | recent event window |
| `metro.recentWrongExit` | optional event flag | EXP02/provider bridge | Route-error chain can prime 404. | optional |
| `archive.recent404Query` | optional event flag | EXP03/provider bridge | Archive paperwork can prime 404. | optional |
| `samosbor.variant.quiet` | snapshot tag | director/samosbor | Quiet or no-siren aftermath can increase 404 prep. | last variant only |
| `samosbor.variant.classic` | snapshot tag | director/samosbor | Classic aftermath can bias 556 stub warnings. | last variant only |
| `samosbor.variant.electric` | snapshot tag | director/samosbor | Electric aftermath can bias 1337 stub warnings. | last variant only |
| `samosbor.variant.meat` | snapshot tag | director/samosbor | Meat resonance can bias 777 stub warning or backlash. | last variant only |

Signals must come from instance state, event buffers, clue flags, elevator interaction cache or optional provider summaries. A future implementation must not walk every room, every lift, every NPC memory row or every item stack during director collection.

## Beat Catalog

Beat ids use prefix `exp09.numbered`. Cooldowns are campaign hours. Weights are relative starting values and can be tuned by the director owner after implementation.

| Beat id | Act | Budget | Weight | Cooldown | Max runs | Chain slot | Purpose |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| `exp09.numbered.prep.blank_indicator` | 2-4 | neutral | 30 | 10h | 4 | `route_error_to_404[0]` | Show a blank elevator indicator before any forced 404 entry is legal. |
| `exp09.numbered.prep.clerk_denies_floor` | 2-4 | neutral | 22 | 12h | 3 | `archive_to_404[0]` | Add a readable or rumor trace that a numbered floor is missing from paperwork. |
| `exp09.numbered.marker.map_lies_once` | 3-4 | danger | 24 | 8h | 4 | `route_error_to_404[1]` | Arm one wrong marker near a lift so map contradiction is learned as feature. |
| `exp09.numbered.marker.wrong_chime` | 3-4 | danger | 18 | 10h | 3 | `samosbor_to_404[0]` | Reserve a wrong elevator chime or blank display as anomaly warning. |
| `exp09.numbered.entry.offer_404_window` | 3-4 | danger | 16 | 24h | 2 | `route_error_to_404[2]` | Make the next eligible elevator interaction able to roll or request 404 entry. |
| `exp09.numbered.entry.force_after_route_error` | 3-4 | danger | 8 | 48h | 1 | `route_error_to_404[3]` | Convert a prepared metro/archive route error into a controlled 404 pocket entry. |
| `exp09.numbered.entry.debug_404` | 0-5 | neutral | 0 | 0h | 999 | debug | Debug-only forced entry through EXP09 adapter. |
| `exp09.numbered.exit.backlash_false_number` | 3-5 | danger | 18 | 18h | 3 | `404_exit_backlash[0]` | After successful 404 exit, apply bounded false-floor memory or rumor pressure. |
| `exp09.numbered.exit.bad_exit_warning` | 3-5 | danger | 20 | 12h | 3 | `404_exit_backlash[1]` | After timeout/bad exit, tell nearby systems that elevators are unsafe without repeating entry. |
| `exp09.numbered.relief.lift_return_stabilized` | 3-5 | relief | 20 | 16h | 4 | `404_relief[0]` | After 404 pressure, make one return elevator visibly stable at a cost or with a trace. |
| `exp09.numbered.stub.protocol_556_hint` | 3-5 | neutral | 8 | 36h | 1 | `numbered_stub[556]` | Surface 556 as a protocol clue only; no playable 556 entry. |
| `exp09.numbered.stub.safety_777_hint` | 3-5 | neutral | 7 | 36h | 1 | `numbered_stub[777]` | Surface 777 as a safety-trap clue only; no playable 777 entry. |
| `exp09.numbered.stub.radio_1337_hint` | 3-5 | neutral | 7 | 36h | 1 | `numbered_stub[1337]` | Surface 1337 as a radio-code clue only; no playable 1337 entry. |

Director may select at most one EXP09 beat per tick. Entry beats must not bypass EXP09 `rollElevatorAnomaly()` or `beginFloorInstance()` validation. Prep and marker beats exist specifically to prevent "random teleport bug" presentation.

## Beat Contracts

### `exp09.numbered.prep.blank_indicator`

Requires act >= 2, no active numbered instance, `numbered.lift.nearKnown` or recent normal elevator use, no recent `numbered.prep.*` beat, and either quiet samosbor aftermath, route-error chain slot, archive clue, or `numbered.clue.404`.

Blocks active samosbor danger overload, missing elevator warning adapter, and recent 404 entry.

Effects reserve one warning id from `404.warning.blank_indicator`, `404.warning.floor_field_empty` or `404.warning.journal_row_not_found`. The effect is a visible trace only; it does not alter destination.

Visible trace: the elevator number field blanks for one ride and the log can record "floor not found" as an omen.

Debug summary must print lift id or source floor, selected warning id, reason signal and cooldown.

Estimated runtime: `0 us/frame`; 10-30 us on director tick or elevator interaction.

### `exp09.numbered.prep.clerk_denies_floor`

Requires act >= 2, no active numbered instance, archive/document/rumor clue adapter present or local EXP09 readable fallback, and no existing `doc_order_404_not_found` reward.

Blocks missing all document/rumor fallback routes, recent identical prep, or player already carrying the 404 order document.

Effects request a local readable or rumor candidate: `doc_ticket_blank_floor`, `doc_lift_operator_no_shaft`, `doc_room_404_letter` or archive-compatible `doc_order_404_not_found` hint. It may prime `archive_to_404[0]`.

Visible trace: paperwork denies a floor whose elevator behavior already implied it.

Debug summary prints document id, target system accepted/rejected, fallback path and chain slot state.

Estimated runtime: `0 us/frame`; 15-40 us on director tick.

### `exp09.numbered.marker.map_lies_once`

Requires act >= 3, `numbered.def.404.playable`, no active numbered instance, a previous 404 prep warning or `numbered.clue.404`, and dangerBudget >= 1.

Blocks missing map-marker adapter, recent map contradiction for the same floor/zone, current active route transition, or player not having any physical clue channel.

Effects arm one marker distortion with expiry: minimap arrow points one room aside, a lift label shows the source floor, or a "dead end" marker is assigned to a physically usable door. Collision and pathfinding remain true. This beat may also publish `numbered.map_contradiction` after observation.

Visible trace: the map is wrong in a way the environment contradicts.

Debug summary prints map policy, marker id, expiry, clue surfaces and physical truth check.

Estimated runtime: `0 us/frame`; 15-35 us on marker arming or debug.

### `exp09.numbered.marker.wrong_chime`

Requires act >= 3, recent quiet/electric/classic samosbor aftermath or route-error chain signal, valid elevator interaction cache, and no active numbered instance.

Blocks if warning stack for the next elevator interaction is already full, if no audio/text warning surfaces exist, or if player recently had a bad 404 exit.

Effects reserve `404.warning.wrong_chime_count`, `404.warning.button_light_missing` or `404.warning.cabin_returns_twice` for the next lift interaction. This warning can raise 404 anomaly chance later but cannot enter pocket by itself.

Visible trace: the elevator announces the wrong count before anything moves.

Debug summary prints variant, reserved warning ids, chance delta permission and expiry.

Estimated runtime: `0 us/frame`; 10-25 us event-bound.

### `exp09.numbered.entry.offer_404_window`

Requires act >= 3, `numbered.def.404.playable`, no active numbered instance, `numbered.clue.404` or observed map contradiction, at least one warning seen, and dangerBudget >= 2.

Blocks if EXP09 floor-instance adapter is missing, if normal elevator tutorial/use is still unproven, if player is already in a generated pocket, or if 404 entry cooldown is active.

Effects request `elevatorAnomaly.armEntryWindow(defId='numbered.404.not_found', expiryHours, chanceDelta, reasonIds)` through EXP09. On the next eligible elevator interaction, EXP09 still runs deterministic `rollElevatorAnomaly()` and may return normal travel.

Visible trace: the lift can now open into 404, but only after the player has seen the system lie.

Debug summary prints def id, warning ids, chance permille cap, seed source, expiry and rejection reason if adapter refused.

Estimated runtime: `0 us/frame`; 20-60 us on arm or elevator interaction.

### `exp09.numbered.entry.force_after_route_error`

Requires act >= 3, `numbered.def.404.playable`, `metro.recentWrongExit` or `archive.recent404Query`, at least one 404 prep beat in recent window, no active instance, dangerBudget >= 2, and chain step `route_error_to_404[3]` ready.

Blocks missing EXP09 entry adapter, missing fallback stable floor/position, recent bad exit, or lack of warning ids.

Effects request a controlled `FloorInstanceEntryRequest` for `numbered.404.not_found` with source reason `director.route_error_chain`. EXP09 validates fallback and generator before entry. If validation fails, effect returns `effect_failed` and no cooldown is consumed unless a visible warning already happened.

Visible trace: a route error becomes a numbered-floor legend through a prepared elevator, not through random teleport.

Debug summary prints source event id, fallback floor/position hash, seed, entry request result and trace seq.

Estimated runtime: `0 us/frame`; 30-80 us on forced chain effect.

### `exp09.numbered.entry.debug_404`

Requires debug condition only.

Blocks if debug gate is closed or EXP09 entry adapter is missing.

Effects call the same EXP09 force-entry path used by future `numbered.forceEnter`. Trace must mark debug bypass and list skipped conditions.

Visible trace: debug-only.

Debug summary prints all bypassed conditions, def id, seed, fallback and active state after entry.

Estimated runtime: debug-only.

### `exp09.numbered.exit.backlash_false_number`

Requires act >= 3, recent `numbered.recent.exited404`, no active numbered instance, memory/rumor or local flag adapter present, and no recent same backlash.

Blocks if the exit was `exit_404_lift_return` with no rule clue observed, if reliefBudget is forced, or if false-floor memory already has a stronger active mark.

Effects apply one bounded memory mark or rumor fact: false floor number, fear of lifts, NPC denies the ride, or log references a blank floor. It must not run a complex amnesia system.

Visible trace: after escape, somebody remembers the wrong number more clearly than the truth.

Debug summary prints effect id, target memory scope, old/new enum value, expiry or permanence flag.

Estimated runtime: `0 us/frame`; 10-40 us on aftermath tick.

### `exp09.numbered.exit.bad_exit_warning`

Requires act >= 3, recent `numbered.recent.badExit404`, dangerBudget >= 1, no active numbered instance, and warning/log adapter present.

Blocks if the same bad exit warning fired recently, if player is already in another high-danger chain, or if no stable elevator route exists after fallback.

Effects publish `numbered.bad_exit` aftermath fact, raise one local elevator caution flag, and block immediate 404 re-entry by setting a cooldown or chain-block reason. It does not punish with another pocket.

Visible trace: the house warns about the escape that went wrong.

Debug summary prints bad exit id, fallback destination, cooldown applied, and re-entry block reason.

Estimated runtime: `0 us/frame`; 10-35 us on aftermath tick.

### `exp09.numbered.relief.lift_return_stabilized`

Requires act >= 3, recent 404 pressure or bad exit, reliefBudget >= 1, no active numbered instance, and a known elevator route exists.

Blocks active samosbor, missing route/elevator adapter, or a required chain step that explicitly forbids relief.

Effects request a one-ride stability marker: normal elevator travel has explicit confirmation, reduced anomaly chance or a costed stable return. It must not make elevators permanently safe.

Visible trace: a stable return appears as a hard confirmation, not mercy.

Debug summary prints target route/lift, relief budget spend, anomaly chance delta and expiry.

Estimated runtime: `0 us/frame`; 10-30 us on director tick/elevator interaction.

### Stub Beats: `protocol_556_hint`, `safety_777_hint`, `radio_1337_hint`

Requires act >= 3, no active numbered instance, related samosbor variant or route/document clue, and stub def present.

Blocks any attempt to enter non-playable stub pocket. If the implementation lacks safe stub handling, reject with `missing_signal_provider`.

Effects emit only clues: `doc_p46_protocol_stub`, `doc_777_safety_receipt_stub`, or `doc_1337_radio_code_stub`. They may prime future chain slots but must not call `beginFloorInstance()` for these defs until each pocket is playable.

Visible trace: numbered floors exist beyond 404 without becoming a list of random levels.

Debug summary prints stub def id, playable false, clue id and blocked entry reason.

Estimated runtime: `0 us/frame`; 10-25 us on rare tick.

## Conditions

All conditions must be data conditions evaluable by the director against snapshot, signals, cooldowns, run counts and chain state.

| Condition id | Predicate | Fail reason |
| --- | --- | --- |
| `exp09.act.error_ready` | `snapshot.act >= 3` for entry and wrong-marker beats. | `act_too_low` |
| `exp09.no_active_instance` | No active numbered floor instance. | `blocked_by_flag` |
| `exp09.def_playable_404` | `numbered.def.404.playable` signal exists. | `missing_signal` |
| `exp09.has_404_clue` | Any clue, prep warning, archive/metro route-error or debug override exists. | `missing_required_flag` |
| `exp09.warning_seen` | Recent blank indicator, wrong chime, map contradiction or readable clue exists. | `recent_event_missing` |
| `exp09.lift_context_valid` | Player is at or recently used a known elevator. | `missing_signal` |
| `exp09.fallback_valid` | Last stable floor and position are valid before entry. | `effect_failed` |
| `exp09.map_truth_safe` | Marker distortion has a physical clue and does not alter collision. | `effect_failed` |
| `exp09.danger_available` | Danger budget meets beat severity. | `danger_budget_exhausted` |
| `exp09.relief_available` | Relief budget is positive for stable-return beat. | `relief_budget_unavailable` |
| `exp09.cooldown_ready` | Beat and global numbered-entry cooldown are ready. | `cooldown_active` |
| `exp09.run_count_below` | Beat run count below max. | `max_runs_reached` |
| `exp09.chain_slot_ready` | Named chain step is ready or debug override is active. | `chain_not_ready` |
| `exp09.adapter_present` | Required EXP09 effect adapter exists. | `effect_adapter_missing` |
| `exp09.debug_gate` | Debug-only beat was explicitly forced. | `debug_gate_closed` |

Entry beats are illegal until prep or clue conditions are true. This is not flavor. It is the guardrail that keeps 404 from looking like a broken elevator transition.

## Effects

Director effects are adapter requests. They return success/failure with stable reason code and compact detail for trace.

| Effect id | Owner adapter | Allowed result | Forbidden result |
| --- | --- | --- | --- |
| `numbered.effect.reserveWarning` | EXP09 elevator anomaly/content | Store one warning id for next valid lift interaction. | Directly change target floor. |
| `numbered.effect.seedReadableClue` | EXP09 content, rumor or document fallback | Expose one clue/readable/rumor candidate. | Add uncapped documents or rewrite archive system. |
| `numbered.effect.armWrongMarker` | EXP09 map policy | Distort one map label, marker or arrow with expiry. | Change collision, doors, coordinates or pathfinding. |
| `numbered.effect.armEntryWindow` | EXP09 elevator anomaly | Add bounded 404 chance/reason ids for next eligible lift interaction. | Force entry without resolver validation. |
| `numbered.effect.requestInstanceEntry` | EXP09 floor instances | Begin 404 instance after fallback/generator validation. | Create permanent `FloorLevel` or serialize raw generated cells. |
| `numbered.effect.applyMemoryMark` | EXP09 memory/rumor/event adapter | Set one false-floor/fear-lift flag. | Complex amnesia simulation or NPC-wide scan. |
| `numbered.effect.publishAftermath` | EXP09 events/world log fallback | Emit `numbered.*` fact with severity. | Spawn follow-up crises directly. |
| `numbered.effect.stabilizeReturnLift` | EXP09 elevator anomaly | One-ride stability confirmation, reduced chance or explicit cost. | Permanent immunity from anomalies. |
| `numbered.effect.emitTraceOnly` | director | Write trace when gameplay adapter is missing. | Consume cooldown for failed gameplay effect. |

Effects that visibly change the world may consume cooldown after partial success. Pure adapter failure must not consume cooldown.

## Chain Slots

EXP09 participates in director chains through named slots only. The slots do not import metro, archive, market, void or rumor systems.

| Slot id | EXP09 role | Producer | Consumer | Payload |
| --- | --- | --- | --- | --- |
| `route_error_to_404[0]` | Prep | EXP02 metro, EXP03 archive or director | EXP09 warning | source event id, source floor, warning id. |
| `route_error_to_404[1]` | Wrong marker | EXP09 | EXP09/director | map policy id, marker id, physical clue id. |
| `route_error_to_404[2]` | Entry window | EXP09/director | EXP09 elevator anomaly | def id, chance cap, reason ids, expiry. |
| `route_error_to_404[3]` | Pocket entry | EXP02/EXP03 chain state | EXP09 floor instance | def id, source event id, fallback hash, seed. |
| `archive_to_404[0]` | Paper clue | EXP03 or EXP09 local fallback | EXP09 entry prep | document id, query key, reliability tag. |
| `samosbor_to_404[0]` | Variant warning | director/samosbor | EXP09 warning/anomaly | variant id, warning ids, chance delta permission. |
| `404_exit_backlash[0]` | Memory aftermath | EXP09 exit | rumor/memory/director | exit id, memory effect id, false floor enum. |
| `404_exit_backlash[1]` | Bad exit aftermath | EXP09 exit | director/elevator warnings | exit id, fallback destination, re-entry block hours. |
| `404_relief[0]` | Stable return | director relief | EXP09 elevator anomaly | lift id/route id, expiry, cost or confirmation id. |
| `numbered_stub[556]` | Future clue only | director/samosbor/archive | EXP09 content | doc id, playable false reason. |
| `numbered_stub[777]` | Future clue only | director/samosbor/market | EXP09 content | doc id, playable false reason. |
| `numbered_stub[1337]` | Future clue only | director/samosbor/metro | EXP09 content | doc id, playable false reason. |

Missing partner expansions leave slots unavailable. EXP09 must still support elevator-only prep, entry and exit debug.

## Trace Entries

EXP09 detail can be stored as a compact extension on the standard director trace or expanded only in debug.

```ts
export interface NumberedDirectorTraceDetail {
  expansionId: '09_elevator_loop_404';
  beatId: string;
  phase:
    | 'anomaly_prep'
    | 'wrong_marker'
    | 'pocket_entry'
    | 'pocket_exit_backlash'
    | 'relief'
    | 'stub_hint'
    | 'debug';
  defId?: string;
  instanceId?: string;
  sourceFloor?: string;
  liftId?: string;
  sourceEventId?: string;
  warningIds?: readonly string[];
  mapPolicy?: 'normal' | 'hidden' | 'mislabelled' | 'contradictory';
  markerId?: string;
  physicalClueId?: string;
  chancePermilleBefore?: number;
  chancePermilleAfter?: number;
  fallbackFloor?: string;
  fallbackHash?: number;
  exitId?: string;
  memoryEffectId?: string;
  chainSlot?: string;
  effectCode:
    | 'reserveWarning'
    | 'seedReadableClue'
    | 'armWrongMarker'
    | 'armEntryWindow'
    | 'requestInstanceEntry'
    | 'applyMemoryMark'
    | 'publishAftermath'
    | 'stabilizeReturnLift'
    | 'emitTraceOnly';
  effectResult:
    | 'success'
    | 'fallback'
    | 'rejected'
    | 'failed';
  reasonCode:
    | 'chosen'
    | 'cooldown'
    | 'max_runs'
    | 'act_gate'
    | 'missing_signal_provider'
    | 'missing_signal'
    | 'danger_budget'
    | 'relief_budget'
    | 'chain_not_ready'
    | 'effect_adapter_missing'
    | 'effect_failed'
    | 'fallback_invalid'
    | 'nonplayable_stub'
    | 'debug_bypass';
}
```

Required standard trace fields remain `chosenBeatId`, `rejectedTopBeatId`, `reasonCode`, `dangerBudget`, `reliefBudget`, `samosborVariant`, `signalHash`, `flagsHash`, act, tick reason and sequence. The 300-entry director ring is the black box. Runtime may hash ids for storage and expand strings in debug.

## Debug Validation

Future debug support must prove each phase without random pacing.

| Command | Required proof |
| --- | --- |
| `director.listBeats exp09` | Shows all EXP09 beat ids, act range, cooldown, max runs and current legal/rejected state. |
| `director.explain exp09` | Prints EXP09 signals, top candidate, rejection reason, danger/relief budgets and cooldowns. |
| `director.force exp09.numbered.prep.blank_indicator` | Reserves one warning id or reports missing adapter without cooldown consumption. |
| `director.force exp09.numbered.marker.map_lies_once` | Arms one marker distortion and prints physical clue, expiry and collision-truth invariant. |
| `director.force exp09.numbered.entry.offer_404_window` | Arms an entry window, prints chance cap/reason ids, then next `numbered.rollAnomaly` can consume it. |
| `director.force exp09.numbered.entry.force_after_route_error` | Requests 404 entry only if fallback/generator validation passes; otherwise prints reason and keeps player stable. |
| `director.force exp09.numbered.exit.backlash_false_number` | Applies one memory mark after simulated 404 exit and prints old/new flag. |
| `director.force exp09.numbered.exit.bad_exit_warning` | Publishes bad-exit aftermath and blocks immediate repeat entry. |
| `director.force exp09.numbered.relief.lift_return_stabilized` | Applies one stable-return marker only when relief budget is available. |
| `director.force exp09.numbered.stub.protocol_556_hint` | Emits stub clue and confirms `beginFloorInstance(556)` remains blocked. |
| `numbered.rollAnomaly` | Shows warning ids, chance permille, reason ids and normal vs entry result. |
| `numbered.forceEnter numbered.404.not_found` | Enters 404 through EXP09 adapter with debug bypass trace. |
| `numbered.dumpState` | Shows active def, instance id, seed, fallback, rule flags, rewards and exit state. |
| `numbered.forceExit exit_404_wrong_door` | Produces exit event, reward dedupe state and possible director backlash signal. |
| `director.trace exp09 20` | Shows recent chosen/rejected EXP09 trace rows with payload detail. |

Validation fails if an entry beat can fire without any prep/warning, if map distortion changes collision, if a stub pocket becomes enterable, if a failed adapter consumes cooldown without visible partial success, or if debug cannot explain the top rejected EXP09 beat.

## Failure Behavior

No legal EXP09 beat is valid behavior. Director records `no_legal_beat` and does nothing.

If EXP09 runtime is missing, all runtime-dependent beats reject with `missing_signal_provider` or `effect_adapter_missing`. Trace-only stub clue rows may remain legal only if a local readable/rumor fallback exists.

If `numbered.404.not_found` is not playable, entry beats reject with `missing_signal`; stub clue beats may still run as non-entry hints.

If the player is inside any numbered instance, prep, marker and entry beats reject with `blocked_by_flag`. Exit/backlash beats wait for instance closure events.

If fallback floor/position is invalid, entry request rejects with `fallback_invalid`, writes trace and leaves normal elevator travel untouched.

If danger budget is exhausted, entry and bad-exit pressure are illegal. Only relief or trace-only diagnostics can run.

## Performance Contract

Low tier registers prep, marker, entry, exit backlash and relief beats for 404 only. It uses scalar signals, one warning reservation, one map marker, one active instance cap and text debug. Target is `0 us/frame`, below 50 us per director evaluation on weak devices, and below 100 us per elevator interaction resolver.

Middle tier adds stub hint beats for 556, 777 and 1337, samosbor variant bias, map contradiction telemetry and memory flags. Still no frame loop and no permanent floor enum.

High tier connects optional metro, archive, market, rumor and void chain slots through signals and event facts. It may add richer trace payloads and better clue placement, not more simulation.

Ultra tier spends saved CPU on presentation inside already-triggered moments: stronger elevator display failure, layered chimes, procedural paper marks, HUD-map contradiction, and distinctive pocket visuals. Logic scale remains capped; no tier introduces global scanning or live elevator simulation.

## Acceptance

The director-hook pass is complete when this file exists, `integration_contract.md` contains the local Director Integration boundary, status/rationale/log are written, and no source code, root docs, README, expansion index or other expansion folders are modified.
