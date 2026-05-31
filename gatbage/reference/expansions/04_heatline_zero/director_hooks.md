# Expansion 04: Heatline Zero Director Hooks

Version: 0.1 planning  
Owner: DIRPASS_EXP04  
Scope: implementation-ready contract between `04_heatline_zero` and `00_samosbor_director`

## Boundary

Heatline Zero exposes cheap campaign signals and data-only beat definitions to the Samosbor Director. The director may select a heatline beat, start or advance a chain slot, and write trace. It must not own pressure simulation, steam damage, fog suppression, renderer effects, monster AI, route generation, or medical treatment.

All heatline effects are adapter requests. If the heatline runtime is missing, the beat is rejected with `missing_signal_provider` or `missing_effect_adapter`. If the director is missing, Heatline Zero still works as a local maintenance pocket with valves, steam, debug, and telemetry.

## Applied Mandates

| Mandate | Heatline director rule |
| --- | --- |
| Director rare tick | Hooks are evaluated only on director tick, samosbor aftermath, or debug force. No render-loop work. |
| Cinematic cheat protocol | Steam and fog aftermath are pressure flags, room tints, HUD traces, and temporary requests. No fluid simulation. |
| Predictability over realism | Beats use discrete pressure `0..3`, heat `0..3`, valve states, cooldowns, and visible trace text. |
| Frame time dictatorship | Signal collection reads bounded heat aggregates only. Target steady-state cost is 0 us/frame. |
| Math LOD scalability | Low changes only hints and route warnings; higher tiers buy richer traces, sounds, and visuals without changing logic truth. |
| Black-box trace | Every accepted or rejected heatline beat must leave a director trace plus heat telemetry when heat runtime exists. |

## Signal Provider

Heatline implements one optional `DirectorSignalProvider` with id `heatline_zero`. It appends compact facts into the caller-owned output buffer. It must not allocate arrays, scan the whole map, inspect every pipe tile, or query renderer state.

```ts
export interface HeatlineDirectorSignals {
  expansionId: '04_heatline_zero';
  pocketDiscovered: boolean;
  playerInHeatPocket: boolean;
  nearestNodeId?: string;
  nearestRoomId?: number;
  maxPressure: 0 | 1 | 2 | 3;
  maxHeat: 0 | 1 | 2 | 3;
  activeSteamRooms: number;
  blockedRouteCount: number;
  hasSafeRetreat: boolean;
  canVentFog: boolean;
  recentScald: boolean;
  recentPressureSpike: boolean;
  recentFogBurnWindow: boolean;
  oldBoilerVisible: boolean;
  heatlineCooldownHours: number;
}
```

The provider should be backed by heat-node runtime aggregates or by cached pocket flags. Low tier can emit only `pocketDiscovered`, `maxPressure`, `activeSteamRooms`, `hasSafeRetreat`, and `canVentFog`.

## Condition Vocabulary

| Condition id | Meaning | Rejection reason |
| --- | --- | --- |
| `heatline_open` | `openExpansionIds` contains `04_heatline_zero` or the pocket has been discovered. | `heatline_not_open` |
| `in_or_near_maintenance` | Player is in `MAINTENANCE`, collector edge, or a room adjacent to heat pocket entry. | `wrong_floor_or_zone` |
| `pressure_at_least_2` | Heatline signal `maxPressure >= 2`. | `pressure_too_low` |
| `pressure_at_3` | Heatline signal `maxPressure == 3` or `recentPressureSpike`. | `no_pressure_spike` |
| `steam_active` | `activeSteamRooms > 0`. | `no_active_steam` |
| `route_blocked_by_steam` | `blockedRouteCount > 0`. | `no_blocked_route` |
| `safe_retreat_exists` | Heatline signal says player can retreat to entry sluice, shower, or another safe room. | `no_safe_retreat` |
| `fog_present_and_ventable` | `samosborActive` and heatline signal `canVentFog`. | `fog_not_ventable` |
| `recent_scald` | Player recently took heat/steam damage or heatline signal `recentScald`. | `no_recent_scald` |
| `danger_budget_available` | Director `dangerBudget >= 1`. | `danger_budget_empty` |
| `relief_budget_available` | Director `reliefBudget >= 1`. | `relief_budget_empty` |
| `not_recent_heatline` | No heatline beat in `recentBeatIds` and local cooldown is expired. | `heatline_cooldown_active` |

Conditions are intentionally coarse. Exact pressure math remains inside heatline. The director should never predict linked-node propagation itself.

## Effect Vocabulary

| Effect id | Payload | Owner | Runtime behavior |
| --- | --- | --- | --- |
| `heatline_visible_trace` | `messageKey`, optional `roomId`, optional `nodeId` | director/world log | Writes HUD/log/service trace only. Valid fallback for all beats. |
| `heatline_mark_interest` | `nodeId`, `roomId`, `priority`, `expiresHours` | heatline adapter | Marks one heat node as director-relevant for debug, NPC bark, or diagram hint. |
| `heatline_pressure_hint` | `nodeId`, `targetPressure`, `expiresHours` | heatline adapter | Requests warning feedback around a pressure state. Does not force pressure by itself. |
| `heatline_steam_window_request` | `nodeId`, `durationSec`, `riskLevel` | heatline adapter | Requests a legal steam safe-window opportunity if current valve graph allows it. |
| `heatline_fog_burn_request` | `nodeId`, `radiusCells`, `durationSec`, `strength` | heatline adapter | Requests temporary local fog suppression through `HeatFogRequest`. Never changes zone ownership. |
| `heatline_noise_marker` | `roomId`, `loudness`, `tag` | events/AI adapter | Optional noise attention. Missing consumer does not fail heatline. |
| `chain_seed` | `chainId`, `slot`, `ttlHours` | director chain state | Opens or advances a cross-expansion chain slot. |

Effects are declarative. If an effect adapter rejects a request, director records `effect_failed` with the failed effect id. Cooldown is consumed only when at least one visible trace or adapter effect succeeds.

## Beat Definitions

The following beats are the required Heatline Zero director set. They are small campaign decisions, not hidden simulation commands.

| Beat id | Act | Tags | Weight | Cooldown | Max runs |
| --- | ---: | --- | ---: | ---: | ---: |
| `heat_steam_route_warning` | 0-2 | `heatline`, `warning`, `route`, `pressure` | 80 | 6h | 4 |
| `heat_pressure_spike_aftereffect` | 1-3 | `heatline`, `danger`, `samosbor_aftereffect`, `pressure` | 65 | 12h | 3 |
| `heat_fog_burn_window_offer` | 1-3 | `heatline`, `relief`, `fog`, `steam` | 60 | 10h | 3 |
| `heat_scald_triage_seed` | 1-3 | `heatline`, `injury`, `chain_seed`, `hospital`, `raionsovet` | 55 | 18h | 2 |
| `heat_dispatcher_valve_hint` | 1-2 | `heatline`, `npc`, `diagram`, `relief` | 50 | 8h | 3 |
| `heat_old_boiler_pressure_lure` | 2-4 | `heatline`, `optional_branch`, `danger`, `noise` | 35 | 24h | 2 |

### `heat_steam_route_warning`

This is the early pressure/steam beat. It teaches that the heat pocket is alive before the player is trapped by it.

Requires: `heatline_open`, `in_or_near_maintenance`, `route_blocked_by_steam`, `safe_retreat_exists`, `not_recent_heatline`.  
Blocks: no safe retreat, exhausted danger/relief budget for the current director tick, active higher-priority chain crisis.  
Effects: `heatline_visible_trace` with `heatline.trace.steam_route_warning`, `heatline_mark_interest` on `steam_corridor_a`, optional `heatline_pressure_hint` for pressure `2`.  
Visible trace: "Диспетчер тепла отметил паровой коридор: проход есть, но окно короткое."  
Debug summary: warns about steam-blocked route without changing route truth.  
Cooldown: 6 campaign hours; local heatline cooldown 1 director tick.  
Estimated runtime: signal read below 5 us on director tick; 0 us/frame.

### `heat_pressure_spike_aftereffect`

This is the pressure aftereffect beat used after samosbor or bad valve history. It turns existing heat risk into a readable campaign consequence without global pipe simulation.

Requires: `heatline_open`, `pressure_at_3`, `safe_retreat_exists`, `danger_budget_available`, `not_recent_heatline`.  
Blocks: player already in unavoidable damage, no heat adapter, two danger beats in recent history.  
Effects: `heatline_visible_trace` with `heatline.trace.pressure_spike_aftereffect`, `heatline_pressure_hint` on nearest hot node, optional `heatline_noise_marker` tagged `pressure_alarm`, `chain_seed` for `steam_burn_paper_chain` slot `pressure`.  
Visible trace: "После самосбора теплотрасса держит лишнее давление. Манометр не врет: где-то рядом будет сброс."  
Debug summary: escalates pressure readability; does not randomly explode pipes.  
Cooldown: 12 campaign hours; max one accepted pressure aftereffect per samosbor aftermath window.  
Estimated runtime: below 8 us per director selection plus optional event append.

### `heat_fog_burn_window_offer`

This is the fog-aftereffect relief beat. It lets steam buy a temporary crossing when fog is active, but it cannot cleanse a zone.

Requires: `heatline_open`, `fog_present_and_ventable`, `relief_budget_available`, `safe_retreat_exists`, `not_recent_heatline`.  
Blocks: no active samosbor/fog, old boiler jammed without bypass, fog burn window already active, effect adapter missing.  
Effects: `heatline_visible_trace` with `heatline.trace.fog_burn_window_offer`, `heatline_fog_burn_request` using radius `2..4`, duration `45..90` seconds, strength `1..2`, optional `chain_seed` for `steam_fog_backlash_chain` slot `burn_window`.  
Visible trace: "Пар выжег в тумане дырку. Это не чистка, это заем времени."  
Debug summary: requests one bounded `HeatFogRequest` and forces expiry trace validation.  
Cooldown: 10 campaign hours; max one active window at a time.  
Estimated runtime: below 15 us per accepted beat; fog adapter clamps affected cells.

### `heat_scald_triage_seed`

This is the injury-to-paperwork chain seed. A real scald should create later pressure from hospital or raionsovet systems without requiring those systems at heatline compile time.

Requires: `recent_scald`, `heatline_open`, act `>= 1`, `not_recent_heatline`.  
Blocks: no injury signal, hospital and raionsovet expansions both closed, relief budget locked by a stronger chain.  
Effects: `heatline_visible_trace` with `heatline.trace.scald_triage_seed`, `chain_seed` for `steam_burn_paper_chain` slot `injury`, optional `heatline_mark_interest` on `emergency_shower`.  
Visible trace: "Ожог стал не только болью. Теперь это запись, очередь и подпись."  
Debug summary: seeds cross-expansion consequence from a bounded heat damage event.  
Cooldown: 18 campaign hours; max two runs per save.  
Estimated runtime: below 5 us per director tick when recent injury flag is cached.

### `heat_dispatcher_valve_hint`

This is the relief/document beat. It surfaces Valve A or Valve B logic through Захар Манометр, a diagram, or a service trace when the player is stuck near pressure content.

Requires: `heatline_open`, `route_blocked_by_steam`, `relief_budget_available`, `safe_retreat_exists`.  
Blocks: player has just received the same diagram, active combat/danger crisis, no reachable heatline NPC or document placeholder.  
Effects: `heatline_visible_trace` with `heatline.trace.dispatcher_valve_hint`, `heatline_mark_interest` on `pressure_dispatch` or `heat_main_node`, optional `chain_seed` for `heat_permit_access_chain` slot `diagram`.  
Visible trace: "Диспетчер давления оставил схему: один вентиль открывает путь, второй возвращает долг."  
Debug summary: gives explanation, not free valve state.  
Cooldown: 8 campaign hours.  
Estimated runtime: below 5 us per accepted beat.

### `heat_old_boiler_pressure_lure`

This is the late optional danger beat. It points toward the old boiler branch only after the player understands heat pressure and has enough campaign context.

Requires: `heatline_open`, act `>= 2`, `oldBoilerVisible`, `pressure_at_least_2`, `danger_budget_available`, `safe_retreat_exists`.  
Blocks: old boiler connector not generated, no retreat, fog burn window currently active, recent heatline danger beat.  
Effects: `heatline_visible_trace` with `heatline.trace.old_boiler_pressure_lure`, `heatline_pressure_hint` on `old_boiler_branch`, optional `heatline_noise_marker` tagged `pipe_bang`.  
Visible trace: "За красной решеткой котельная стучит в ответ. Это не маршрут, это ставка."  
Debug summary: advertises optional high-risk branch without making it mandatory.  
Cooldown: 24 campaign hours; max two runs.  
Estimated runtime: below 8 us per director selection.

## Cross-Expansion Chain Slots

Heatline contributes slots to director chains. Chain state belongs to director; heatline only supplies accepted beat ids and effect requests.

| Chain id | Slot | Beat source | Next legal consumers | TTL | Purpose |
| --- | --- | --- | --- | ---: | --- |
| `steam_burn_paper_chain` | `pressure` | `heat_pressure_spike_aftereffect` | hospital triage, raionsovet form, market debt | 24h | A pressure event becomes an injury and then paperwork/debt. |
| `steam_burn_paper_chain` | `injury` | `heat_scald_triage_seed` | hospital burn queue, raionsovet incident certificate | 48h | A scald creates a non-combat social consequence. |
| `heat_permit_access_chain` | `diagram` | `heat_dispatcher_valve_hint` | raionsovet access permit, market bribe for asbestos | 36h | A valve diagram becomes controlled access, not free loot. |
| `steam_fog_backlash_chain` | `burn_window` | `heat_fog_burn_window_offer` | samosbor backlash, 404 prep, hospital cough warning | 18h | Temporary fog relief can produce later backlash without cleansing victory. |
| `old_boiler_alarm_chain` | `boiler_ping` | `heat_old_boiler_pressure_lure` | monster attention, maintenance faction demand | 12h | Optional branch pressure becomes a local danger invitation. |

Chains must expire cleanly. A chain step may be skipped if its consumer expansion is unavailable; trace must record `chain_consumer_missing`, not fail the heatline beat.

## Cooldown And Budget Rules

Heatline beats share a local family cooldown keyed as `heatline_family`. It prevents repeated steam warnings from drowning out stronger campaign beats.

| Rule | Value |
| --- | ---: |
| Minimum delay between accepted heatline beats | 1 director tick |
| Maximum heatline danger beats in recent 6 accepted beats | 2 |
| Maximum active fog burn windows | 1 |
| Maximum pressure aftereffects per samosbor aftermath | 1 |
| Minimum relief after two heatline danger beats | 1 relief beat or no-op trace |

Danger beats consume `dangerBudget`. `heat_fog_burn_window_offer` and `heat_dispatcher_valve_hint` consume `reliefBudget`. A visible trace-only fallback consumes no danger budget unless it adds a hazard request.

## Trace Entries

Accepted heatline beats must enrich `DirectorTraceEntry` through reason codes and debug details. If the current director trace type has only fixed fields, these values are encoded in `reasonCode` and `debugSummary`.

| Field | Required heatline value |
| --- | --- |
| `chosenBeatId` | One of the beat ids above. |
| `reasonCode` | `heatline_warning`, `heatline_pressure_aftereffect`, `heatline_fog_relief`, `heatline_chain_seed`, or concrete rejection code. |
| `dangerBudget` / `reliefBudget` | Budget values before effect application. |
| `samosborVariant` | Filled for fog burn and pressure aftereffect when available. |
| Heatline detail | `nodeId`, `roomId`, pressure, heat, active steam rooms, and chain slot in debug summary. |

Rejected top candidates must record one of the condition rejection reasons from this document. `no_legal_beat` is valid when all heatline hooks are blocked.

## Debug Validation

Future debug must let a tester prove each hook without waiting for normal campaign RNG.

| Debug command | Validation target | Pass condition |
| --- | --- | --- |
| `director force heat_steam_route_warning` | warning beat | Trace contains chosen beat, `steam_corridor_a` interest marker, no pressure mutation. |
| `director force heat_pressure_spike_aftereffect` | pressure aftereffect | Requires or fakes `maxPressure == 3`; trace records pressure detail and one optional noise marker. |
| `director force heat_fog_burn_window_offer` | fog relief | Emits one bounded `HeatFogRequest`; debug shows expiry and no zone cleanse. |
| `director force heat_scald_triage_seed` | chain seed | Active chain slot `steam_burn_paper_chain:injury` appears with TTL. |
| `director trace` | black box | Last heatline entry shows chosen/rejected reason and budget state. |
| `director roll` with missing heatline adapter | failure behavior | Heatline beat is rejected as `missing_signal_provider` or `missing_effect_adapter`; no crash. |

Manual route validation remains heatline-owned: enter `heat_entry_sluice`, reach `heat_main_node`, read diagram, use Valve A, cross `steam_corridor_a`, reach `pressure_dispatch`, use Valve B, observe fog return. Director validation only proves campaign selection and trace.

## LOD Behavior

| Tier | Director hooks | Effect fidelity | Cost rule |
| --- | --- | --- | --- |
| Low | 2-3 beats: route warning, valve hint, fog offer. | Text traces and one room marker. | Signal collection from cached fields only. |
| Middle | Full MVP beat set and shared family cooldown. | Temporary fog request, pressure hint, chain seeds. | Bounded adapter requests only. |
| High | Cross-expansion consumers react to burn/paper/fog slots. | NPC barks, noise events, richer world log. | No extra heat logic frequency. |
| Ultra | More unique trace lines and presentation hooks. | Dense steam visuals/audio selected by renderer. | Gameplay truth unchanged; no hot-loop director work. |

## Implementation DOD

The pass is ready for code only when all of the following remain true: the director can register heatline beats without importing heat systems directly, heatline can provide signals without allocation-heavy scans, every beat has act gates and cooldowns, every effect has a fallback visible trace, fog suppression is temporary and local, chain slots expire, and debug can explain both accepted and rejected heatline candidates.
