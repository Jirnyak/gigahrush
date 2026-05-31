# EXP02 Metro Error Line - Director Hooks

Status: director integration contract for future implementation. No code is authorized by this document.

## Mandate Fit

This pass applies the local director rules from `00_samosbor_director` and the EXP02 route contract:

| Mandate | EXP02 application |
| --- | --- |
| Data-driven director beats | Metro exposes route, wrong-exit and station-closure beats as definitions, not runtime special cases. |
| Rare tick only | Director may select metro pressure on rare ticks or explicit events; route logic never runs from render or every frame. |
| Predictability over realism | Wrong exits require warnings, trace reasons and deterministic seeds. |
| Cinematic fake first | Station closure, tunnel danger and moving train pressure are represented by route flags, signs, sound/text cues and pocket targets, not simulated rail networks. |
| No direct dependencies | Hooks use route ids, station ids, event ids and optional floor-instance hooks; no dependency on future numbered-floor code. |
| Black-box trace | Every director-triggered metro beat must leave enough trace to explain why the route shifted, closed or misdelivered the player. |

## Director Ownership Boundary

EXP02 may register metro-specific beat definitions and signal adapters. The director owns beat selection, act gates, cooldowns, danger/relief budgets and global trace format. The metro system owns station availability, route risk resolution, token checks, wrong-exit destination resolution and train-hub state.

Director effects must call future metro adapters by id. They must not mutate route arrays, spawn large NPC groups, change samosbor timers, create permanent floors, alter pathfinding or write inventory stacks directly. If a target adapter is absent, the beat is rejected with `missing_signal_provider` or `missing_effect_adapter`.

## Signal Provider

Future EXP02 implementation should expose one read-only provider:

```ts
export const metroDirectorSignals: DirectorSignalProvider = {
  id: 'exp02.metro',
  collectSignals(state, out) {
    // Caller-owned out array. No allocation, no full-world scan.
  },
};
```

The provider reports compact facts only:

| Signal ID | Value | Source | Meaning |
| --- | --- | --- | --- |
| `metro.station_discovered` | station id | station discovery flag | Player can understand metro consequences. |
| `metro.station_current` | station id | player location/pocket flag | Player is in or adjacent to a metro station. |
| `metro.route_known` | route id | route list/discovery | Route may be scheduled for warnings, closure or bait. |
| `metro.route_recent` | route id | last transit event | Avoid repeat pressure on same route. |
| `metro.route_failed_recent` | route id | last wrong-exit event | Enables aftermath chain; blocks immediate repeat. |
| `metro.token_available` | token id | inventory/access aggregate | Director may offer travel hook without fake access. |
| `metro.warning_seen` | warning id | warning event flag | Wrong-exit escalation is allowed only after player-facing signs. |
| `metro.station_closed` | station id | metro availability state | Prevents duplicate closure beats. |
| `metro.samosbor_variant_affects_route` | variant + route id | metro/samosbor modifier table | Director can choose local aftermath instead of global spam. |
| `metro.depot_escape_open` | boolean | depot objective state | Wrong-exit chain can provide relief after pressure. |

Signals are aggregate booleans/ids. They must not include NPC lists, path nodes or generated room coordinates.

## Beat Catalog

Metro director beats are small, reversible pressure decisions. They do not perform the train ride; they prepare or modify the next metro interaction.

| Beat ID | Act | Weight | Cooldown | Max runs | Chain slot | Purpose |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `exp02.metro.rumor_pipes_hatch` | 1-3 | 40 | 18 h | 1 | route_opening[0] | Point player toward the first maintenance hatch after scarcity or maintenance pressure. |
| `exp02.metro.route_offer_living_local` | 2-4 | 30 | 12 h | 3 | route_opening[1] | Surface a safe-ish `station_pipes` -> `station_living` route when walking distance is under pressure. |
| `exp02.metro.route_red_service_bait` | 3-4 | 18 | 36 h | 2 | route_red[0] | Present the dangerous red service route only after metro literacy exists. |
| `exp02.metro.warning_stack_wrong_exit` | 3-5 | 28 | 20 h | 4 | wrong_exit[0] | Add 2-3 warning ids before any wrong-exit-capable route is allowed to misdeliver. |
| `exp02.metro.force_depot_wrong_exit` | 3-5 | 10 | 72 h | 1 | wrong_exit[1] | Convert a high-risk route into a controlled depot misdelivery with escape objective. |
| `exp02.metro.close_station_wet` | 2-4 | 24 | 24 h | 3 | station_closure[0] | Wet samosbor floods `station_pipes` edge and blocks/red-risks service route. |
| `exp02.metro.close_station_silent` | 2-4 | 22 | 24 h | 3 | station_closure[0] | Silent samosbor suppresses announcements; route remains possible but warning clarity drops. |
| `exp02.metro.red_meat_resonance` | 3-5 | 16 | 48 h | 2 | station_closure[1] | Red station becomes meat-adjacent pressure without requiring full HELL transition. |
| `exp02.metro.relief_return_train` | 2-5 | 20 | 18 h | 4 | relief[0] | After heavy pressure, make a known return route available with visible cost. |
| `exp02.metro.after_wrong_exit_document` | 3-5 | 18 | 30 h | 2 | wrong_exit[2] | After a wrong exit, seed `doc_dispatcher_note` or route evidence for Archive/404 chain prep. |

Cooldowns are campaign hours. Director may apply longer global cooldowns if dangerBudget is exhausted.

## Beat Contracts

### `exp02.metro.rumor_pipes_hatch`

Requires: act >= 1, `MAINTENANCE` or service-pressure context, no `metro.station_discovered:station_pipes`, no recent metro opening beat.

Blocks: active high-danger combat beat, station_pipes already discovered, missing future maintenance hatch provider.

Effects: publish a rumor/log candidate pointing to `station_pipes`; mark route-opening hint seen; optionally place a non-route document such as `wet_line_schema` through the content system when available.

Visible trace: `maintenance rumor points to a locked platform under the pipes`.

Debug summary: reports `station_pipes`, source floor, hint id and whether a placement adapter accepted the effect.

Estimated runtime: 0 us/frame; 10-30 us on director tick/effect application.

### `exp02.metro.route_offer_living_local`

Requires: `metro.station_discovered:station_pipes`, `metro.route_known:route_pipes_living_local` or debug unlock, reliefBudget > 0 or walking route pressure, route not closed.

Blocks: same route used in last director window, player currently in train, missing token and no valid barter/trade hook.

Effects: raise availability/visibility of `route_pipes_living_local`; select one low-risk warning id if risk > base; attach token/trade prompt candidate without granting inventory directly.

Visible trace: `local train is announced as shorter than the corridors, but not free`.

Debug summary: route id, required token/document state, final visible risk, selected warning ids.

Estimated runtime: 0 us/frame; 15-40 us on selection.

### `exp02.metro.route_red_service_bait`

Requires: act >= 3, `metro.station_discovered:station_pipes`, player has seen at least one metro warning, `route_pipes_red_service` exists, dangerBudget >= medium.

Blocks: no warning content for red route, HELL/edge pocket provider absent and depot fallback absent, wrong-exit cooldown active.

Effects: expose the red service route as an option, increase warning density, permit future wrong-exit slot but do not force it in the same beat.

Visible trace: `red timetable appears after the line has already taught route errors`.

Debug summary: route id, fallback destination hook, warning ids, dangerBudget cost.

Estimated runtime: 0 us/frame; 20-50 us on director tick.

### `exp02.metro.warning_stack_wrong_exit`

Requires: act >= 3, player is in train or about to board a wrong-exit-capable route, route has at least two warning ids, no warning stack applied to same transit seed.

Blocks: no route transit state, player did not discover route, selected route has no wrong-exit destinations.

Effects: reserve 2-3 warning ids for the next transit; publish `metro_warning_seen` events as the player encounters them; allow later wrong-exit effect to pass validation.

Visible trace: `announcement, ticket and passenger omen align before route error`.

Debug summary: route id, transit seed, warning ids, warning surfaces.

Estimated runtime: 0 us/frame; 10-25 us at boarding or director event.

### `exp02.metro.force_depot_wrong_exit`

Requires: act >= 3, warning stack already seen for the active route, route wrong-exit chance or samosbor modifier is high, `floorInstance.metro.depot_no_rails` available.

Blocks: no prior warning ids, depot escape objective unavailable, player recently suffered wrong exit, dangerBudget < high.

Effects: set the active route destination override to `depot_no_rails`; open depot escape/recovery objective; write high-severity `metro_wrong_exit` event. This beat must consume its cooldown even if the wrong exit is delayed until arrival.

Visible trace: `train doors open into depot after warnings were ignored or risk accepted`.

Debug summary: original route, expected station, actual destination hook, warnings, seed, dangerBudget cost.

Estimated runtime: 0 us/frame; 20-60 us at destination override/arrival.

### `exp02.metro.close_station_wet`

Requires: wet samosbor active or recent wet aftermath, station_pipes discovered, affected route is known.

Blocks: station already closed by a stronger effect, player currently locked in that station without exit, no fallback/return route.

Effects: close or risk-raise `route_pipes_red_service`; attach flood warning to `station_pipes`; publish `metro_station_closed_samosbor`; optionally schedule `relief_return_train` after closure expires.

Visible trace: `water takes the platform edge; red service route is no longer trustworthy`.

Debug summary: station id, blocked route ids, risk modifiers, expiry time.

Estimated runtime: 0 us/frame; 10-35 us on samosbor start/end.

### `exp02.metro.close_station_silent`

Requires: silent samosbor active or aftermath, any discovered metro station, at least one known route with announcement warnings.

Blocks: route already closed, warning content would drop below validation minimum, player in first metro tutorial route.

Effects: suppress announcement warning surface and replace it with physical clues such as tickets/signage; increase wrong-exit risk modestly if warning count remains valid.

Visible trace: `announcer stops; the route still runs, but signs carry the warning`.

Debug summary: station id, route ids, warning surfaces removed/replaced, risk delta.

Estimated runtime: 0 us/frame; 10-30 us on samosbor event.

### `exp02.metro.red_meat_resonance`

Requires: act >= 3, `station_red` discovered or red route offered, meat/HELL pressure signal present, dangerBudget >= medium.

Blocks: player has not learned metro risk, red station closure already active, no red pocket/depot fallback.

Effects: raise red-route risk, add red lamp/meat-wall warning ids, allow cultist commuter event, and block safe fast-travel interpretation of the red station.

Visible trace: `red lamps behave like a station signal and like tissue at the same time`.

Debug summary: red route ids, risk delta, warning ids, fallback pocket.

Estimated runtime: 0 us/frame; 15-45 us on director tick.

### `exp02.metro.relief_return_train`

Requires: reliefBudget > 0, player recently hit by station closure or wrong exit, at least one known return route is not closed.

Blocks: current danger chain requires no relief, token/access impossible, player is in active combat pocket.

Effects: announce a return train with explicit cost or favor; reduce wrong-exit chance on that return only if a proper token/document is presented; never make the route free by director fiat.

Visible trace: `a return route appears as a hard bargain, not mercy`.

Debug summary: route id, cost source, risk modifiers, reliefBudget spend.

Estimated runtime: 0 us/frame; 15-40 us on director tick.

### `exp02.metro.after_wrong_exit_document`

Requires: recent `metro_wrong_exit`, player escaped or stabilized, document placement adapter available, no duplicate `doc_dispatcher_note`.

Blocks: wrong-exit event did not record warnings, Archive/404 chain cooldown active and no local document fallback.

Effects: seed `doc_dispatcher_note`, `receipt_no_station` or `passenger_lost_ticket`; mark chain slot `route_error_to_archive_404` as primed without requiring EXP03/EXP09 to exist.

Visible trace: `the route error leaves paperwork before it becomes mythology`.

Debug summary: source wrong-exit event id, document id, target container/station, optional chain ids.

Estimated runtime: 0 us/frame; 10-35 us on aftermath tick.

## Conditions

Director conditions for EXP02 should be expressible as small predicates over signals:

| Condition ID | Predicate |
| --- | --- |
| `metro_has_discovered_station(stationId)` | matching `metro.station_discovered`. |
| `metro_has_known_route(routeId)` | matching `metro.route_known`. |
| `metro_route_not_recent(routeId, hours)` | no `metro.route_recent` in the window. |
| `metro_has_warning_seen(routeIdOrWarningId)` | matching `metro.warning_seen`. |
| `metro_station_open(stationId)` | no active `metro.station_closed` for station. |
| `metro_station_can_close_safely(stationId)` | at least one exit/return route remains or the player is not trapped. |
| `metro_wrong_exit_allowed(routeId)` | route has wrong-exit destinations, warning ids and available fallback hook. |
| `metro_depot_available()` | `floorInstance.metro.depot_no_rails` provider exists. |
| `metro_not_in_train()` | no active `MetroTransitState.phase === 'in_train'` unless beat is warning/arrival-specific. |
| `metro_samosbor_variant(kind)` | active or aftermath variant matches route modifier table. |

All route availability checks must be event-bound: route selection, samosbor start/end, director rare tick or debug command. They must not scan all stations per frame.

## Effects

Future director effects should be narrow adapter calls:

| Effect ID | Target adapter | Result |
| --- | --- | --- |
| `metro.revealStationHint` | metro/content | Adds a station hint or rumor marker. |
| `metro.revealRoute` | metro | Makes route visible/announced if requirements are otherwise valid. |
| `metro.reserveWarnings` | metro | Reserves warning ids for active/next route. |
| `metro.applyRouteRiskModifier` | metro | Adds bounded risk delta with expiry and reason id. |
| `metro.closeStation` | metro | Marks station/routes unavailable until expiry, with fallback validation. |
| `metro.overrideDestination` | metro | Sets deterministic wrong-exit destination for active transit. |
| `metro.seedAftermathDocument` | content/notes | Places or unlocks document candidate after route event. |
| `metro.publishEvent` | events/world_log | Emits station/route/wrong-exit facts. |
| `metro.primeChainSlot` | director | Marks cross-expansion slot as ready, without importing target expansion. |

Effects must return success/failure with reason code. Failed effects do not consume cooldown unless the effect already changed route state.

## Chain Slots

EXP02 participates in director chains through named slots, not direct imports:

| Slot | Producer | Consumer | Data payload |
| --- | --- | --- | --- |
| `route_opening[0]` | EXP02 | EXP02/maintenance | `station_pipes`, hint id, source floor. |
| `route_opening[1]` | EXP02 | EXP02/market/hospital | route id, required token/document, risk. |
| `route_red[0]` | EXP02 | HELL/VOID later hooks | red route id, warning ids, fallback pocket. |
| `wrong_exit[0]` | EXP02 | EXP02 | active route id, transit seed, warning ids. |
| `wrong_exit[1]` | EXP02 | EXP02/depot | expected destination, actual hook, escape objective id. |
| `wrong_exit[2]` | EXP02 | Archive/404 optional | wrong-exit event id, document id, station id. |
| `station_closure[0]` | Director/samosbor | EXP02 | station id, route ids, variant, expiry. |
| `station_closure[1]` | HELL/meat pressure | EXP02 | red station risk delta, warning ids. |
| `relief[0]` | Director | EXP02 | route id, cost id, risk reduction reason. |

Missing optional consumers must not fail EXP02. Payload remains in trace/debug only until the target expansion registers support.

## Trace Entries

Each selected or rejected EXP02 beat must be compatible with `DirectorTraceEntry[300]` and add metro detail through a compact metadata field or debug expansion:

```ts
interface MetroDirectorTraceDetail {
  stationId?: string;
  routeId?: string;
  expectedDestinationId?: string;
  actualDestinationHook?: string;
  warningIds?: readonly string[];
  riskBase?: number;
  riskDelta?: number;
  finalRisk?: number;
  tokenOrDocumentId?: string;
  samosborVariant?: string;
  cooldownHours?: number;
  chainSlot?: string;
  effectReasonCode: string;
}
```

Required reason codes:

| Reason code | Meaning |
| --- | --- |
| `metro_route_not_known` | Route beat rejected because player has no route knowledge. |
| `metro_station_missing` | Station hook/provider absent. |
| `metro_warning_missing` | Wrong exit rejected because warnings are not configured or not seen. |
| `metro_fallback_missing` | Destination override rejected because depot/red/optional fallback hook is absent. |
| `metro_station_would_trap_player` | Closure rejected because it would remove all exits. |
| `metro_recent_pressure` | Beat rejected by recent route/wrong-exit cooldown. |
| `metro_budget_blocked` | Beat rejected by danger/relief budget. |
| `metro_effect_failed` | Adapter returned failure after selection. |

Wrong-exit traces must include both expected and actual destinations. Station-closure traces must include expiry. Route-offer traces must include required token/document state.

## Debug Validation

Future debug support must validate these cases:

| Debug command/check | Expected output |
| --- | --- |
| `director.listBeats exp02.metro` | All registered metro beat ids, act gates, cooldowns, max runs. |
| `director.forceBeat exp02.metro.rumor_pipes_hatch` | Hint effect result and `station_pipes` payload. |
| `director.forceBeat exp02.metro.warning_stack_wrong_exit route_pipes_red_service` | Route id, seed, warning ids, surfaces. |
| `director.forceBeat exp02.metro.force_depot_wrong_exit` | Expected station, actual `depot_no_rails`, warnings, cooldown consumption. |
| `director.forceBeat exp02.metro.close_station_wet station_pipes` | Closed routes, expiry, fallback route check. |
| `metro.showRisk route_pipes_red_service` after director beat | Base risk, director modifiers, samosbor modifiers, final risk. |
| `director.traceLast exp02.metro` | Chosen/rejected beat with metro trace detail and reason code. |
| data validation | No wrong-exit beat may register without warning ids and fallback hook. |

Acceptance rule: a forced wrong exit without a prior warning stack must fail validation. A station closure that traps the player must fail validation. A missing optional 404/Archive target must fall back to depot/document-local behavior and record `missing_signal_provider`, not crash.

## Performance Contract

Steady-state cost is 0 us/frame. EXP02 director integration runs only on director rare tick, route selection, samosbor start/end, transit arrival or debug command.

| Tier | Director behavior | Presentation bought with saved cost |
| --- | --- | --- |
| Low | 6-10 metro beats, one active closure/wrong-exit chain, text trace only. | Static signs and log lines. |
| Middle | Full beat catalog, risk modifiers, document aftermath. | Flicker lights, passenger warning lines. |
| High | Cross-expansion chain slots and faction/HELL pressure signals. | Scrolling tunnel texture, richer station announcements. |
| Ultra | Same logic as High; no extra hot-path rules. | More announcement variants, hallucination sprites, parallax tunnel fakes. |

No tier may simulate rails, scan all route cells or run global NPC migration through metro. Aggregated events only.
