# Expansion 04: Heatline Zero Integration Contract

Version: 0.1 planning  
Owner: EXP04_HEAT  
Purpose: future code-facing contract for heat nodes, fog interaction, debug, telemetry, and renderer-safe visual cheats.

## Contract Boundary

Heatline Zero owns heat-node data, valve state transitions, steam hazard requests, local fog-burn requests, debug visibility, and heat telemetry. It does not own global samosbor scheduling, permanent fog capture, monster AI, medical conditions, renderer internals, save migrations outside its own bounded state, or room generation outside its maintenance pocket.

Other systems should talk to heat through data-shaped requests or optional adapters. The integration must remain valid even if another agent changes fog internals or renderer effects.

## Static Node Definition

```ts
export type HeatPressure = 0 | 1 | 2 | 3;
export type HeatLevel = 0 | 1 | 2 | 3;
export type HeatValveState = 'open' | 'closed' | 'jammed' | 'venting';
export type HeatVisualHint = 'none' | 'warm_lamp' | 'steam_strip' | 'dense_steam' | 'scorch';

export interface HeatNodeDef {
  id: string;
  roomId: number;
  label: string;
  linkedNodeIds: readonly string[];
  initialPressure: HeatPressure;
  initialHeat: HeatLevel;
  initialValveState: HeatValveState;
  safeWindowSec: number;
  fogBurnRadiusCells: number;
  visualHint: HeatVisualHint;
}
```

Static definitions must be small arrays. No definition may imply scanning every pipe tile. `roomId` is the bridge to generation, renderer hints, and fog adapters.

## Runtime State

```ts
export interface HeatNodeRuntime {
  id: string;
  pressure: HeatPressure;
  heat: HeatLevel;
  valveState: HeatValveState;
  cooldownUntilMs: number;
  safeUntilMs: number;
  lastChangedAtMs: number;
  flags: number;
}
```

Runtime state is bounded by node count. It can live in a `Map<string, HeatNodeRuntime>` for simple implementation or a compact array plus id index if profiling demands it. The contract forbids per-cell temperature fields in MVP.

## Valve Transition Request

```ts
export interface HeatValveRequest {
  nodeId: string;
  requestedState: HeatValveState;
  actorEntityId?: number;
  nowMs: number;
  source: 'player' | 'debug' | 'script';
}

export interface HeatValveResult {
  ok: boolean;
  nodeId: string;
  changedNodeIds: readonly string[];
  messageKey: string;
  steamRequests: readonly HeatSteamRequest[];
  fogRequests: readonly HeatFogRequest[];
  noiseEvents: readonly HeatNoiseEvent[];
}
```

A valve request updates the target and direct links only. Results are declarative. UI, fog, audio, and AI consume their parts without becoming mandatory compile-time dependencies if the implementation keeps adapters thin.

## Steam Hazard Request

```ts
export interface HeatSteamRequest {
  nodeId: string;
  roomId: number;
  startsAtMs: number;
  endsAtMs: number;
  heat: HeatLevel;
  pressure: HeatPressure;
  damagePerTick: number;
  tickIntervalMs: number;
  blocksSight: boolean;
  visualHint: HeatVisualHint;
}
```

Steam is a request to mark a room or small area as dangerous for a fixed time. The hazard system may evaluate player damage through room membership or a short list of cells. It must not allocate every frame, spawn unbounded particles, or require volumetric rendering.

## Fog Interaction

```ts
export interface HeatFogRequest {
  nodeId: string;
  roomId: number;
  centerX: number;
  centerY: number;
  radiusCells: number;
  strength: 0 | 1 | 2 | 3;
  startsAtMs: number;
  endsAtMs: number;
  mode: 'suppress_only';
}
```

`HeatFogRequest` is explicitly temporary. It suppresses or masks local fog danger while active. It does not change zone faction, permanent samosbor ownership, boss state, samosbor variant, or global fog seed. If fog internals are cell-density based, the adapter clamps changes to a short cell list. If fog internals are room-modifier based, the adapter stores a temporary room modifier. In both cases the request expires.

## Renderer-Safe Visual Cheat Contract

```ts
export interface HeatVisualRequest {
  roomId: number;
  intensity: HeatLevel;
  pressure: HeatPressure;
  hint: HeatVisualHint;
  startsAtMs: number;
  endsAtMs: number;
  colorRgb?: readonly [number, number, number];
}
```

The renderer contract is one-way and optional. Heat submits visual requests; renderer may choose the cheapest supported representation. The fallback is always HUD text plus existing room textures.

| Tier | Required renderer behavior | Forbidden dependency |
| --- | --- | --- |
| Low | HUD warning, red lamp tint if already available. | No new particle system. |
| Middle | Alpha steam strips or wall-column noise. | No per-pixel fluid state. |
| High | Heat haze tint, condensation decals, richer minimap hint. | No gameplay logic in renderer. |
| Ultra | Dense cosmetic steam, pulsing lamps, layered audio hooks. | No change to node truth or fog rules. |

Visuals must never be the authoritative source of damage, fog suppression, or path blocking. Logic state drives visuals, not the reverse.

## Noise Event Contract

```ts
export interface HeatNoiseEvent {
  nodeId: string;
  roomId: number;
  x: number;
  y: number;
  radiusCells: number;
  loudness: 0 | 1 | 2 | 3;
  tag: 'steam_hiss' | 'pipe_bang' | 'pressure_alarm';
}
```

AI systems may consume heat noise as attention input. If no consumer exists, the heat system still functions. Heat must not import monster AI just to attract monsters.

## Director Integration

Detailed director hooks live in `director_hooks.md`. The local rule is simple: Heatline Zero may expose compact read-only signals and receive declarative effect requests, but the Samosbor Director must not own pressure simulation, steam damage, fog state, renderer effects, monster behavior, or medical outcomes.

```ts
export interface HeatlineDirectorSignalProvider {
  id: 'heatline_zero';
  collectSignals(state: GameState, out: DirectorSignal[]): void;
}

export type HeatlineDirectorEffect =
  | { type: 'heatline_visible_trace'; messageKey: string; nodeId?: string; roomId?: number }
  | { type: 'heatline_mark_interest'; nodeId: string; roomId: number; priority: 0 | 1 | 2 | 3; expiresHours: number }
  | { type: 'heatline_pressure_hint'; nodeId: string; targetPressure: HeatPressure; expiresHours: number }
  | { type: 'heatline_steam_window_request'; nodeId: string; durationSec: number; riskLevel: 0 | 1 | 2 | 3 }
  | { type: 'heatline_fog_burn_request'; nodeId: string; radiusCells: number; durationSec: number; strength: 0 | 1 | 2 | 3 }
  | { type: 'heatline_noise_marker'; roomId: number; loudness: 0 | 1 | 2 | 3; tag: 'steam_hiss' | 'pipe_bang' | 'pressure_alarm' };
```

Required beat ids are `heat_steam_route_warning`, `heat_pressure_spike_aftereffect`, `heat_fog_burn_window_offer`, `heat_scald_triage_seed`, `heat_dispatcher_valve_hint`, and `heat_old_boiler_pressure_lure`. Each beat must have act gates, family cooldown, max runs, visible trace, concrete rejection reason, and debug summary.

Director chain slots supplied by heatline are `steam_burn_paper_chain:pressure`, `steam_burn_paper_chain:injury`, `heat_permit_access_chain:diagram`, `steam_fog_backlash_chain:burn_window`, and `old_boiler_alarm_chain:boiler_ping`. Missing consumer expansions expire chain slots cleanly and must not fail heatline.

Director traces must include the selected or rejected heatline beat id, reason code, budget state, samosbor variant when relevant, and heatline debug detail: node id, room id, pressure, heat, active steam room count, and chain slot. If no heatline signal provider exists, director records `missing_signal_provider` and does nothing.

## Debug Contract

| Command | Input | Required result |
| --- | --- | --- |
| `heat:list` | none | All node ids, room ids, pressure, heat, valve states. |
| `heat:nearest` | none | Nearest node plus links and active requests. |
| `heat:set-valve` | node id, state | Applies a valve request with source `debug`. |
| `heat:vent` | node id | Emits steam, fog, visual, and noise requests if valid. |
| `heat:cool-all` | none | Resets all node pressure/heat to safe defaults. |
| `heat:dump` | optional path | Writes recent heat telemetry to `Docs/AgentLogs/Dump_EXP04_HEAT.bin` or an agreed runtime dump path. |

Debug output can be text-only. It must be deterministic and must not depend on renderer availability.

## Black-Box Telemetry

```ts
export interface HeatTelemetryEntry {
  frame: number;
  nowMs: number;
  nodeIdHash: number;
  roomId: number;
  pressure: HeatPressure;
  heat: HeatLevel;
  valveStateCode: 0 | 1 | 2 | 3;
  playerRoomId: number;
  fogRequestHash: number;
  flags: number;
}
```

The implementation should maintain exactly 300 recent entries in a fixed ring. Recording can happen once per heat tick, valve transition, or active hazard frame depending on tier. On NaN, impossible state, or explicit debug dump, the buffer is written as binary. The dump is evidence, not a player feature.

Estimated telemetry cost is one fixed assignment per recorded entry. Low tier can record only transitions. Middle and above can record active hazard frames while the player is inside the heat pocket.

## Save And Migration Contract

MVP save state should store only node runtime fields that affect gameplay: node id, pressure, heat, valve state, cooldown, and safe window. Visual requests, fog requests, noise events, and telemetry are derived or transient and should not be saved unless an existing save system requires active hazards to persist.

If save schema risk is high, the first implementation can rebuild heat nodes on world generation and treat active steam windows as non-persistent. That is acceptable for MVP because the heat pocket is local and deterministic.

## Integration DOD

| Area | Pass condition |
| --- | --- |
| Heat nodes | State updates affect only target and direct links. |
| Fog | Suppression is local, temporary, and cannot cleanse zones. |
| Renderer | Visuals are optional one-way requests with text fallback. |
| Debug | Commands can reproduce every MVP state transition. |
| Telemetry | Last 300 heat states are available for dump on failure. |
| Performance | Idle heat cost is 0 or near 0; active transition costs stay below the 0.1 ms suspicion line. |

## Risks And Rejections

| Problem | Rejected alternative | Contract answer |
| --- | --- | --- |
| Pressure system becomes a hidden simulator. | Per-pipe propagation and continuous pressure values. | Discrete nodes and direct links only. |
| Fog integration breaks during parallel work. | Importing and mutating samosbor internals directly. | Data-only `HeatFogRequest` consumed by an adapter. |
| Steam visuals block MVP. | Waiting for renderer particles or volumetric fog. | HUD, tint, and strip fallback are valid. |
| Monster lure creates hard dependency. | Direct calls into monster AI. | Optional `HeatNoiseEvent`. |
| Debug arrives after bugs. | Balancing first, observability later. | Debug and telemetry are part of DOD. |
