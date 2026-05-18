# Промзона концентрата: integration contract

Статус: planning contract for future implementation. This document defines stable abstract surfaces for Expansion 08. It must not force direct imports from economy, market, contracts or another expansion package. Concrete adapters may live wherever the owning implementation agent chooses.

## Boundary Rule

Expansion 08 owns industry definitions, line state, shift state and production-to-supply events. It does not own global economy pricing, black-market UI, container internals, faction enum growth, or quest journal mechanics. Integration must happen through small adapters or structured events. If a consumer is absent, the industry module writes to fallback snapshot/debug log and keeps the playable loop local.

## Namespaces

All ids use `industry08.*` for definitions and contracts. Event types use `industry_*` or a future common event enum only after the event owner accepts them. Resource buckets use existing economy resource ids when present; otherwise they map through a local compatibility table.

| Domain | Prefix | Examples |
| --- | --- | --- |
| factory line | `industry08.line.` | `industry08.line.briquette_press` |
| shift | `industry08.shift.` | `industry08.shift.day_briquette` |
| contract | `industry08.contract.` | `industry08.contract.repair_briquette_press` |
| room tag | `industry08_room_` | `industry08_room_quality` |
| event source | `industry08` | source field in event payload |

## Factory Definitions

```ts
export type IndustryResourceId =
  | 'water'
  | 'food'
  | 'paper'
  | 'metal'
  | 'tools'
  | 'power'
  | 'labor'
  | 'concentrate_paste'
  | 'packaging';

export type IndustryFailure =
  | 'no_inputs'
  | 'no_workers'
  | 'no_power'
  | 'jammed_press'
  | 'contaminated_paste'
  | 'quality_hold'
  | 'container_full'
  | 'sabotage';

export interface FactoryLineDef {
  id: string;
  name: string;
  roomTags: string[];
  input: { resourceId: IndustryResourceId; amount: number; fallbackItemIds?: string[] }[];
  output: { supplyId: string; itemIdFallback?: string; amount: number }[];
  baseCycleMinutes: number;
  baseBatch: number;
  workerNeed: number;
  powerNeed: number;
  waterNeed: number;
  noise: number;
  failureModes: IndustryFailure[];
  eventTags: string[];
}
```

Definitions are static data. They may reference fallback item ids but must not allocate item stacks by themselves.

## Runtime Line State

```ts
export interface FactoryLineState {
  lineId: string;
  roomId: number;
  zoneId: number;
  ownerFaction?: string;
  progressMinutes: number;
  condition01: number;
  contamination01: number;
  defectRate01: number;
  blockedReason?: IndustryFailure;
  outputBuffer: { supplyId: string; amount: number; quality01: number }[];
  lastTickMinute: number;
  lastEventSeq: number;
}
```

Line state is bounded and serializable. `condition01`, `contamination01` and `defectRate01` are clamped to `[0, 1]`. `outputBuffer` is capped per line. No per-item production queue is allowed for bulk output.

## Work Shift Contract

```ts
export interface WorkShiftState {
  shiftId: string;
  factoryLineId: string;
  morale01: number;
  injury01: number;
  hunger01: number;
  fear01: number;
  pressure01: number;
  workerMinutes: number;
  sabotageRisk01: number;
  lastTouchedMinute: number;
}

export interface WorkShiftContribution {
  outputMul: number;
  defectMul: number;
  sabotageRisk01: number;
  blockedReason?: 'no_workers';
}
```

The expected formula is deterministic and cheap. MVP implementation may compute contribution as a pure function of state:

```ts
export function estimateShiftContribution(shift: WorkShiftState): WorkShiftContribution;
```

The function must allocate nothing and must not scan NPC arrays. If later NPC schedules feed `workerMinutes`, that feed is a separate adapter with its own cadence.

## Supply Adapter

```ts
export interface IndustrySupplyDelta {
  source: 'industry08';
  lineId: string;
  roomId: number;
  zoneId: number;
  gameMinute: number;
  outputs: { supplyId: string; amount: number; quality01: number; defect01: number }[];
  inputsConsumed: { resourceId: IndustryResourceId; amount: number }[];
  reason: 'batch_ready' | 'debug_tick' | 'contract_reward' | 'quality_release' | 'quality_divert';
}

export interface IndustrySupplySink {
  applyIndustrySupply(delta: IndustrySupplyDelta): void;
  inspectIndustrySupply?(lineId?: string): unknown;
}
```

Economy/market compatibility rule: prices respond to aggregate supply deltas, not item spawn volume. The supply sink may update scarcity, market stock, faction reserves or room containers. If no sink is registered, the industry module stores a local `IndustrySupplySnapshot` and debug reports that the global consumer is missing.

## Container Adapter

```ts
export interface IndustryContainerPort {
  hasInput(roomId: number, resourceId: IndustryResourceId, amount: number): boolean;
  consumeInput(roomId: number, resourceId: IndustryResourceId, amount: number): number;
  addOutput(roomId: number, itemId: string, count: number, tags: string[]): number;
  inspectIndustryContainers?(roomId: number): unknown;
}
```

Container compatibility rule: consume and add methods return actual amount moved. Production must treat partial movement as blocked or capped, never as silent success. If containers are absent, a local bounded stock counter can implement the same port.

## Contract Adapter

```ts
export type IndustryContractKind =
  | 'repair_line'
  | 'deliver_inputs'
  | 'guard_shift'
  | 'quality_decision'
  | 'sabotage_line'
  | 'steal_document';

export interface IndustryContractDef {
  id: string;
  kind: IndustryContractKind;
  issuerNpcId?: string;
  lineId?: string;
  requiredRoomTags: string[];
  objective: { type: string; targetId: string; count?: number };
  reward: { rubles?: number; supplyDelta?: IndustrySupplyDelta; itemIds?: string[] };
  failure: { blockedReason?: IndustryFailure; factionPenalty?: number; defectDelta01?: number };
  tags: string[];
}

export interface IndustryContractPort {
  canCreateIndustryContract(def: IndustryContractDef): boolean;
  createIndustryContract(def: IndustryContractDef): { questId: number | string; contractId: string } | undefined;
  completeIndustryContract(contractId: string, outcome: 'success' | 'fail' | 'divert'): void;
}
```

Contract compatibility rule: industry contracts wrap the existing Quest/Contract path and obey active quest cap. They cannot mutate main plot chain, cannot create unbounded repeated quests, and must be idempotent on completion.

## Event Payloads

```ts
export type IndustryEventType =
  | 'industry_line_blocked'
  | 'industry_batch_ready'
  | 'industry_defect_found'
  | 'industry_quality_decision'
  | 'industry_shift_changed'
  | 'industry_control_changed';

export interface IndustryEvent {
  type: IndustryEventType;
  source: 'industry08';
  gameMinute: number;
  lineId: string;
  roomId: number;
  zoneId: number;
  severity: 1 | 2 | 3 | 4 | 5;
  data: Record<string, string | number | boolean | undefined>;
}
```

Events are structured facts. Consumers may turn them into HUD logs, rumors, contracts, price changes or faction reactions. The industry module must not assume which consumers exist.

## Samosbor Variant Hook

```ts
export type IndustrySamosborVariant = 'classic' | 'wet' | 'electric' | 'meat' | 'silent';

export interface IndustrySamosborEffect {
  variant: IndustrySamosborVariant;
  contaminationDelta01: number;
  defectDelta01: number;
  conditionDelta01: number;
  waterProcessMul: number;
  sabotageRiskDelta01: number;
  outputOverrideSupplyId?: string;
}
```

Compatibility rule: samosbor changes line parameters and future output, not every produced item. Classic and meat variants are mandatory for MVP. Wet, electric and silent can be no-op but must have explicit mapping so future hooks do not need type churn.

## Telemetry Contract

```ts
export interface IndustryTelemetryEntry {
  seq: number;
  gameMinute: number;
  lineIdHash: number;
  roomId: number;
  zoneId: number;
  conditionQ: number;
  contaminationQ: number;
  defectQ: number;
  blockedReasonHash: number;
  inputHash: number;
  outputHash: number;
  flags: number;
}
```

Critical runtime implementation must keep a fixed 300-entry circular buffer. On NaN or crash path it writes `Docs/AgentLogs/Dump_EXP08_INDUSTRY.bin`. Quantized fields are intentional: tiny binary state, fast dump, enough to explain production failure.

## Compatibility Rules

1. Production tick is explicit or slow-cadence only. No per-frame factory simulation.
2. Factory output is aggregate supply first, concrete items second.
3. Concrete items go to one bounded container, reward or scripted event.
4. Worker state is aggregate. NPC schedules may feed it, but line math does not scan NPCs.
5. Economy and market receive deltas through `IndustrySupplySink` or events; no direct imports from Expansion 05.
6. Contracts use existing Quest cap and completion semantics.
7. Room differences use tags/subtypes before new enums.
8. All state clamps numeric fields and treats NaN as telemetry dump trigger.
9. Missing consumers degrade to debug-visible local snapshots, not broken compile.
10. Higher visual tiers cannot change deterministic output math.

## Director Integration

Companion file: `director_hooks.md` is the authoritative local contract for Samosbor Director integration. It defines industry beat ids, signal ids, conditions, effects, cooldowns, chain slots, trace expectations and debug validation for work-shift pressure, factory failure, bad concentrate, samosbor aftermath and supply relief.

Expansion 08 may register director beats and one read-only signal provider only after the underlying industry aggregates exist. The provider may read bounded `FactoryLineState`, `WorkShiftState`, local supply snapshot, quality decision state and recent industry event sequence. It must not scan NPC arrays, rooms, containers, item stacks, fog cells or market state.

Director effects are adapter requests, not direct production writes. Allowed requests are repair/input/guard contract offers, samosbor variant application to line aggregates, bad-batch campaign flags, quality release/divert requests, ration scarcity pressure and worker rumors/log facts. Missing adapters must return typed director rejection or effect results and degrade to local snapshot/log behavior where this contract already permits it.

Cross-expansion director chains use named slots only: bad concentrate to school/market, treatment debt to industry labor pressure, fungal shortage to paste/input shortage, steam injury to worker slowdown, factory failure to market shortage and samosbor aftermath to supply defect or relief. Chain state must carry compact ids, quantized values, room/zone ids and event sequence numbers, never internal production, container or quest objects.

## Acceptance Scenarios

| Scenario | Required integration behavior |
| --- | --- |
| No economy consumer | Production still ticks into local snapshot and debug says global sink missing. |
| Economy consumer present | `IndustrySupplyDelta` lowers food scarcity or fills market stock by aggregate amount. |
| Containers absent | Local bounded stock counter implements `IndustryContainerPort`. |
| Containers present | Inputs are consumed and output crate receives capped concrete items. |
| Quest log full | `canCreateIndustryContract` returns false; line state is unchanged. |
| Classic samosbor | contamination/defect rise and line may block on quality. |
| Meat samosbor | suspect output route becomes available with cult/poisoning consequence. |
| Save from old version | Missing industry state initializes empty; no crash, no phantom supply. |
