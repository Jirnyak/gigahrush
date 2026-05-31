# Черный рынок 88: integration contract

Статус: boundary document. This file defines how future code should connect black market, scarcity, debt and contracts without colliding with AG10 economy/contracts or future expansion systems.

## Ownership rule

Black Market 88 owns market-specific data, access flags, trader stock lanes, debt templates, raid rules and market text. It does not own base item values, global resource scarcity, generic contract runtime, generic quest completion, container stack rules, world events, rumors or save/load architecture.

If another system already exposes an interface, market code must consume it through an adapter. If the interface is missing, market MVP may use a local fallback with the same shape and a clear removal path.

## Proposed interfaces

```ts
export type Market88AccessKind =
  | 'password'
  | 'maintenance_guide'
  | 'ministry_document'
  | 'metro_route';

export interface Market88State {
  heat: number;
  trust: number;
  raidCooldownUntil: number;
  access: Partial<Record<Market88AccessKind, boolean>>;
  traderLocks: Record<string, number>;
  debts: Market88DebtState[];
  stockVersion: number;
}

export interface Market88DebtState {
  id: string;
  templateId: string;
  ownerId: string;
  createdAt: number;
  dueAt: number;
  severity: 1 | 2 | 3 | 4 | 5;
  settlement: 'rubles' | 'item' | 'contract' | 'document' | 'faction';
  consequenceId: string;
  resolved: boolean;
}

export interface Market88PriceContext {
  itemId: string;
  traderId: string;
  floor: FloorLevel;
  zoneId: number;
  baseValue: number;
  scarcityMultiplier: number;
  trust: number;
  heat: number;
}

export interface Market88ContractDef {
  id: string;
  contractId: string;
  issuerId: string;
  objective: 'deliver' | 'escort' | 'steal' | 'hide' | 'recover' | 'sabotage';
  requiredTrust: number;
  heatDelta: number;
  debtSettlementIds: string[];
  rewardTable: string[];
  failureConsequence: string;
}
```

These types are target shapes, not a demand to create a new global type file. Implementation should place them in market-owned data/system files unless a shared AG10 type already exists.

## Scarcity integration

Market price code asks AG10 economy for scarcity/resource multipliers by item/resource when available. It must not recalculate room production, inspect all containers, or scan all NPC inventories. The accepted flow is:

```ts
base item value -> economy scarcity multiplier -> market heat/trust modifier -> trader stock clamp
```

Fallback for missing economy is a static demand table keyed by broad lanes: survival, weapons, tools, documents, psi, expansion goods. Fallback must be deterministic and bounded.

Conflict rule: AG10 owns global resource names and base economy state. Market88 may map goods to lanes but cannot redefine global scarcity semantics.

## Contract integration

Market contracts are not a second quest journal. They convert into existing AG10 `ContractDef` or existing `Quest` with `contractId`. Market-specific data stays attached as tags or market state references:

```ts
tags: ['market88', 'illegal', 'debt_settlement']
source: 'market88'
```

Conflict rule: if `src/systems/contracts.ts` supports contract generation, use it. If not, generate a normal quest through the same path used by procedural quests and record `contractId` in metadata. Do not bypass active quest cap. Do not touch story `PLOT_CHAIN`.

## Debt integration

Debts are market state, not generic contracts, but they can create contracts as settlement or consequence. A debt lifecycle has four states: created, warned, overdue, resolved. Overdue processing is cooldowned and explicit; no per-frame debt loop is allowed.

Conflict rule: future global debt/social-credit systems can absorb `Market88DebtState` later, but MVP keeps debts local because generic economy/contracts should not be polluted with illegal-market-only assumptions.

## Container and stock integration

Trader stock should use existing item stacks and container helpers where possible. The market can own a cashier container and locked stash, but capacity and transfer semantics remain AG10/container-owned. Stock changes are event-driven: purchase, delivery contract, raid, debug reset.

Conflict rule: market code must never implement separate item stack merge/remove logic if container/inventory helpers exist. That is where duplication bugs appear.

## Event and rumor integration

When event bus/world log exists, market publishes facts:

| Event tag | Privacy | Consumer |
| --- | --- | --- |
| `market88_entered` | secret/local | rumors, access memory |
| `market88_trade` | private/witnessed | debt/trust, audit |
| `market88_debt_created` | private | debt UI/log |
| `market88_debt_overdue` | local/secret | threats, contract spawn |
| `market88_raid_started` | public/local | HUD, market lock |
| `market88_stock_changed` | private/local | price debug, trader lines |

If no event bus is available, market writes concise HUD/log messages and keeps state deterministic. Later integration must replace direct messages with facts, not keep both as separate truth sources.

## Director Integration

Market88 exposes director hooks through local beat definitions and signal providers described in `director_hooks.md`. The director may choose scarcity, debt, raid and contract beats, but it must treat market state as owned by Market88 adapters. Director effects are requests such as demand-lane changes, contract offers, debt warnings, trader locks, raid starts and trace-only diagnostics.

Required director signals are compact scalar flags: market open/access state, heat, trust, raid cooldown, active debt count, overdue debt severity, stock-lane pressure, relevant scarcity tags, last samosbor variant and faction suspicion/pressure. Signal collection must not scan all cells, all containers or all NPC inventories.

Director-selected contracts must still enter the existing Quest/Contract path with `market88` tags and must respect active quest caps. Director-selected raids are timed state changes and optional single encounter hooks, not live patrol simulation or loot sources. If the market adapter, economy adapter or contract adapter is missing, the beat is rejected with `missing_signal_provider` or `contract_cap` and no cooldown is consumed.

Trace is mandatory. Every selected or rejected market beat records beat id, rejection reason, danger/relief budgets, market heat/trust, debt severity when available and effect result. Debug must be able to list market beats, explain current market scoring, force scarcity/debt/raid/contract beats and print Market88 status/price breakdown.

## Save/load and bounds

Market state must normalize missing fields so old saves load. MVP caps:

| State | Cap |
| --- | ---: |
| traders | 16 |
| active debts | 64 |
| market contracts offered | 12 |
| raid history | 16 |
| stock rows per trader | 12 |

If caps are reached, new low-priority offers are refused or overwrite oldest resolved records. Unbounded arrays are a rejection condition.

## Math LOD contract

Low uses static lane scarcity and one pocket. Middle uses AG10 scarcity queries on explicit interactions. High consumes samosbor/faction/production events. Ultra increases presentation density and cross-expansion content, but keeps the same aggregate logic. No tier adds live buyer simulation or global container scans.

## Non-conflict checklist

| Check | Must hold |
| --- | --- |
| Economy | Market never owns base global resources or production tick. |
| Contracts | Market wraps existing contracts/quests and respects active quest cap. |
| Items | Existing item ids are preferred; new ids require separate item ownership. |
| Containers | Existing stack/transfer helpers are used. |
| Events | Facts are published once; HUD/log are consumers or fallback, not parallel truth. |
| Floor 88 | Hidden pocket first; numbered floor only after MVP proof. |
| Performance | Stable frame has 0 us market simulation cost. |
