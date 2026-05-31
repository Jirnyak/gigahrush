# Director Hooks Contract: Expansion 00 Samosbor Director

Status: director-hook foundation contract  
Owner: `DIRPASS_EXP00`  
Scope: shared contract for future director integration across expansion packages  
Runtime rule: this document authorizes no source edits by itself

## Purpose

The Samosbor Director is the campaign scheduler for expansion content. It must not become a second implementation of mushrooms, metro, documents, heat, market, school, hospital, industry, numbered floors or Void protocols. It owns selection, pacing, budgets, cooldowns, trace and debug visibility. Expansion systems own the facts and effects in their domains.

The contract below defines the data shapes that future implementation should use so expansion agents can register beats, expose bounded signals, attach to chain templates, return typed rejection reasons and write black-box trace without direct dependencies on each other.

Steady-state target is `0 us/frame`. Director work happens only on rare ticks, explicit events, samosbor aftermath, save/load normalization or debug commands. No render-loop polling, no per-frame global scans and no unbounded string formatting are acceptable.

## Registry Contract

The director registry accepts immutable beat definitions and optional signal providers. Registration is additive and order-independent. Missing expansion modules mean missing beats, not broken builds.

```ts
export type DirectorTag = string;

export interface DirectorBeatDef {
  id: string;
  title: string;
  actMin: number;
  actMax?: number;
  expansionIds: readonly string[];
  tags: readonly DirectorTag[];
  priority: number;
  weight: number;
  cooldownHours: number;
  maxRuns: number;
  chainTemplateIds?: readonly string[];
  requires: readonly DirectorConditionDef[];
  blocks?: readonly DirectorConditionDef[];
  effects: readonly DirectorEffectDef[];
  visibleTrace: string;
  debugSummary: string;
}

export interface DirectorRegistry {
  registerBeat(def: DirectorBeatDef): void;
  registerSignalProvider(provider: DirectorSignalProvider): void;
  registerChainTemplate(template: DirectorChainTemplateDef): void;
  listBeatIds(): readonly string[];
}
```

The implementation must reject duplicate ids during registration and write one trace entry with `reasonCode = 'registry_duplicate_id'`. It must not silently overwrite definitions. Beat ids use expansion-prefixed semantic names when a beat belongs to one expansion, for example `mushroom.spoilage_rumor`; cross-expansion beats use director-owned names, for example `director.chain.fungal_shortage.market_step`.

Beat definitions are declarative. They may name effect kinds and target hints, but they may not contain callbacks, closures or arbitrary script strings. Effect execution is a finite switch in the director or an adapter call into the owning system.

## Signal Provider Contract

Signal providers expose read-only campaign facts. They are not effect executors. They must fill caller-provided bounded output and return a status so the director can distinguish "no signal" from "provider missing".

```ts
export type DirectorSignalScope =
  | 'global'
  | 'floor'
  | 'zone'
  | 'room'
  | 'route'
  | 'faction'
  | 'resource'
  | 'document'
  | 'medical'
  | 'protocol';

export interface DirectorSignal {
  id: string;
  providerId: string;
  scope: DirectorSignalScope;
  floor?: string;
  zoneId?: number;
  roomId?: number;
  entityId?: number;
  value01?: number;
  valueInt?: number;
  tag?: string;
  expiresAtHour?: number;
}

export interface DirectorSignalProvider {
  id: string;
  expansionId: string;
  collectSignals(snapshot: CampaignSnapshot, out: DirectorSignal[]): DirectorSignalProviderResult;
}

export interface DirectorSignalProviderResult {
  ok: boolean;
  reason?: DirectorRejectReason;
  emitted: number;
}
```

Providers may read only aggregate state already owned by their expansion or shared event/log state. They must not scan every tile, every NPC, every item stack or every room. If a provider needs an aggregate, that aggregate must be built by its owner at generation time, event time or slow tick time.

The required MVP providers are campaign flags, samosbor state, recent events, scarcity tags and debug override signals. Expansion providers are optional and must degrade to `missing_signal_provider` when absent.

## Condition Contract

Conditions are typed data evaluated against `CampaignSnapshot`, collected signals, cooldown state, run counts and chain state.

```ts
export type DirectorConditionKind =
  | 'act_at_least'
  | 'act_at_most'
  | 'flag_present'
  | 'flag_absent'
  | 'signal_present'
  | 'signal_value_at_least'
  | 'signal_value_below'
  | 'recent_event_present'
  | 'recent_event_absent'
  | 'budget_available'
  | 'cooldown_ready'
  | 'run_count_below'
  | 'chain_step_ready'
  | 'debug_only';

export interface DirectorConditionDef {
  kind: DirectorConditionKind;
  key: string;
  threshold?: number;
  windowHours?: number;
  reasonOnFail: DirectorRejectReason;
}
```

The evaluator returns the first hard failure and may also record a best-score failure for debug. A beat with an absent optional provider is not fatal to the director. It is rejected with `missing_signal_provider` unless the condition has a fallback signal.

## Effect Contract

Effects are small requests into owning systems. The director chooses at most one beat per tick and applies effect requests in listed order until an effect rejects. Partial success must be traceable.

```ts
export type DirectorEffectKind =
  | 'emit_world_fact'
  | 'add_rumor'
  | 'set_campaign_flag'
  | 'adjust_pressure'
  | 'request_access_hint'
  | 'request_price_pressure'
  | 'request_quarantine_hint'
  | 'request_route_warning'
  | 'request_samosbor_aftermath'
  | 'arm_void_backlash'
  | 'debug_marker';

export interface DirectorEffectDef {
  kind: DirectorEffectKind;
  targetExpansionId?: string;
  targetId?: string;
  severity: 0 | 1 | 2 | 3 | 4 | 5;
  payloadId: string;
  tags: readonly string[];
  onReject: 'abort_beat' | 'skip_effect' | 'trace_only';
}
```

Effects must not spawn large NPC groups, create permanent floors, alter pathfinding, directly edit arbitrary item stacks or change samosbor timer frequency. When the target adapter is missing, the effect returns `effect_adapter_missing`; the beat either aborts or continues according to `onReject`.

## Chain Template Contract

Chains connect beats across expansions without becoming quest scripts. A chain is a bounded 2-4 step state machine. It may expire. It may skip a step when a later signal proves the world moved on.

```ts
export interface DirectorChainTemplateDef {
  id: string;
  title: string;
  actMin: number;
  actMax?: number;
  expansionIds: readonly string[];
  stepBeatIds: readonly string[];
  timeoutHours: number;
  maxActiveInstances: number;
  restartPolicy: 'never' | 'after_timeout' | 'after_completion_cooldown';
  completionTrace: string;
}

export interface DirectorChainState {
  templateId: string;
  instanceId: number;
  stepIndex: number;
  startedAtHour: number;
  lastBeatId?: string;
  expiresAtHour: number;
  state: 'active' | 'completed' | 'expired' | 'blocked';
}
```

The foundation templates are `fungal_shortage_chain`, `route_error_chain`, `steam_burn_debt_chain`, `bad_concentrate_school_chain`, `treatment_debt_industry_chain` and `void_backlash_chain`. Future implementation can ship only two playable chains in MVP, but the registry must support all six as data.

Chain state is saved only as compact ids, step indexes, hour stamps and state enum. It must not serialize target system internals. Unknown template ids on load become `expired` with trace reason `chain_template_missing`.

## Rejection Reason Contract

All rejected candidates use stable reason codes. Debug output and trace use the same code. Player-facing text is separate and must not be parsed for logic.

```ts
export type DirectorRejectReason =
  | 'ok'
  | 'registry_duplicate_id'
  | 'act_too_low'
  | 'act_too_high'
  | 'missing_required_flag'
  | 'blocked_by_flag'
  | 'missing_signal_provider'
  | 'missing_signal'
  | 'signal_below_threshold'
  | 'signal_above_threshold'
  | 'recent_event_missing'
  | 'recent_event_blocked'
  | 'danger_budget_exhausted'
  | 'relief_budget_unavailable'
  | 'cooldown_active'
  | 'max_runs_reached'
  | 'chain_not_ready'
  | 'chain_template_missing'
  | 'effect_adapter_missing'
  | 'effect_failed'
  | 'invalid_snapshot'
  | 'invalid_chain_step'
  | 'debug_gate_closed'
  | 'no_legal_beat';
```

`no_legal_beat` is a valid outcome. It means the director spent its rare tick and correctly chose silence.

## Trace Schema

Director trace is a fixed black-box ring of exactly 300 entries. It records selected beats, top rejected candidates, conditions, budgets and anomaly state. Trace writes happen on rare tick, registration error, debug force, chain transition, load normalization and impossible state. There is no per-frame trace write.

```ts
export interface DirectorTraceEntry {
  seq: number;
  timeHours: number;
  tickReason: DirectorTickReason;
  act: number;
  floor?: string;
  zoneId?: number;
  chosenBeatId?: string;
  chosenScore?: number;
  rejectedTopBeatId?: string;
  rejectedTopReason?: DirectorRejectReason;
  reasonCode: DirectorRejectReason;
  chainTemplateId?: string;
  chainStepIndex?: number;
  dangerBudget: number;
  reliefBudget: number;
  samosborActive: boolean;
  samosborVariant?: string;
  signalHash: number;
  flagsHash: number;
}
```

On NaN, impossible act, negative cooldown, invalid chain step, registry duplicate or adapter exception, the runtime must keep the game stable, write a trace entry and expose a dump path. When browser runtime cannot write `gatbage/history/agent_logs/Dump_DIRPASS_EXP00.bin`, debug must expose a copyable hex/base64 dump or structured trace print. "No explanation available" is not an acceptable failure mode for director behavior.

## Debug Contract

Debug commands call public director APIs only. They may bypass conditions only when the result marks `source = 'debug'` in trace.

| Command | Required Output |
| --- | --- |
| `director.snapshot` | act, floor, zone, samosbor state, budgets, flags hash, recent event count, signal count |
| `director.beats` | registered beat ids, acts, cooldowns, max runs, last rejection reason |
| `director.roll` | one legal selection attempt with chosen beat or `no_legal_beat` |
| `director.force <beatId>` | forced application, bypass marker, effect results, trace seq |
| `director.cooldowns` | active cooldown ids and remaining hours |
| `director.chains` | template id, instance id, step index, state, expiration |
| `director.trace [count]` | recent trace entries with chosen/rejected/reason/budget |
| `director.providers` | provider ids, emitted count, last provider reason |

Debug formatting can allocate; gameplay evaluation cannot rely on formatted debug strings. Debug must show missing optional adapters as disabled integrations, not as hidden failures.

## Director Scale

| Tier | Beat Scale | Signal Scale | Chain Scale | Cost Rule |
| --- | ---: | ---: | ---: | --- |
| Low | 20-30 registered beats | campaign flags, samosbor, recent events | one active chain | rare tick every 5-10 game minutes; target below 50 us per tick on weak devices |
| Middle | 60-100 beats | scarcity, documents, market, medical, route summaries | two active chains | rare tick plus event-bound aftermath; no frame cost |
| High | 120-180 beats | faction pressure, production, quarantine, numbered-floor hints | four active chains | richer scoring and aftermath, still one selected beat per tick |
| Ultra | same logic cap as High | same signal cap as High | same chain cap as High | CPU is not expanded; presentation, lines, audio cues and visual foreshadowing get the saved budget |

No tier introduces per-frame director logic. Ultra is not "more simulation"; it is denser presentation fed by the same bounded decisions.

## Definition Of Done

The future director implementation satisfies this contract when the registry rejects duplicate ids with trace, beat selection handles missing optional expansions without throwing, at least two cross-expansion chains can be debug-forced, every rejected top candidate has a typed reason, cooldown and max-run gates prevent spam, the 300-entry trace ring can be inspected through debug, old saves without director state load with defaults, `npm run build` passes after code exists, and runtime idle cost remains `0 us/frame`.

## Risks

The first risk is hidden god-system behavior. The countermeasure is small effect requests, typed rejection reasons, visible trace and strict non-interference rules.

The second risk is random-table irrelevance. The countermeasure is act gates, cooldowns, budgets, signal providers and short chain state.

The third risk is cross-agent compile coupling. The countermeasure is registration, optional providers, disabled debug states and no direct imports from expansion folders that may not exist yet.

The fourth risk is hot-path bloat. The countermeasure is rare ticks, event-bound aftermath, bounded arrays and no formatted trace work during gameplay evaluation.

The fifth risk is player pressure spam. The countermeasure is `dangerBudget`, `reliefBudget`, cooldowns, `maxRuns` and `no_legal_beat` as a valid silence result.
