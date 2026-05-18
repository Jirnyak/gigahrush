# EXP02 Metro Error Line - Integration Contract

Статус: будущий implementation contract. This document constrains where EXP02 may integrate when code work begins. It does not authorize current code edits.

## Ownership Boundary

EXP02 owns the metro route layer: station definitions, route definitions, train hub state, wrong-exit resolution, metro access items, metro debug commands and metro-specific content. EXP02 does not own global floor enums, archive document law, black market economy, elevator-loop rules, global faction diplomacy or samosbor core behavior. Those systems may expose hooks; EXP02 consumes them through narrow interfaces.

## Planned Future Files

| Future file | Ownership | Purpose | Constraint |
| --- | --- | --- | --- |
| `src/data/metro_routes.ts` | EXP02 | Station, route, token, warning, wrong-exit definitions. | Pure data; no imports from generators/UI. |
| `src/systems/metro.ts` | EXP02 | Transit state machine, risk resolution, route availability. | No per-frame global simulation; active only during route/station events. |
| `src/gen/metro/index.ts` | EXP02 if generator is approved | Builds station pockets, train room, depot pocket. | Optional; MVP may use existing floor generator hooks. |
| `src/gen/metro/station.ts` | EXP02 | Station room templates. | Must preserve room enclosure and door rules. |
| `src/gen/metro/train.ts` | EXP02 | Train hub pocket/room instance. | Hard cap active NPC/container slots. |
| `src/gen/maintenance/metro_hatch.ts` | Shared with maintenance owner | First entrance from collectors. | Additive POI only; no rewrite of maintenance generator. |
| `src/data/notes.ts` or future note registry | Shared | Metro documents and readables. | Add data rows only; no root lore rewrite. |
| `src/systems/debug.ts` | Shared | Metro debug commands. | Commands must call `systems/metro` API; no route logic in debug file. |
| `src/systems/events.ts` / `world_log.ts` | Shared | Publish metro route facts. | Use generic event API; no direct HUD coupling. |
| `src/core/types.ts` | Shared critical | Add minimal serialized metro state if unavoidable. | No large unions or enum bloat without proven pocket MVP. |

## Shared Interface Drafts

Future route data should be serializable and deterministic:

```ts
export interface MetroStationDef {
  id: string;
  name: string;
  floor?: FloorLevel;
  floorInstanceId?: string;
  entryHookId: string;
  debugSpawnId: string;
  tags: readonly string[];
}

export interface MetroRouteDef {
  id: string;
  fromStationId: string;
  toStationId: string;
  requiredTokenId?: string;
  requiredDocumentId?: string;
  travelMinutes: number;
  baseWrongExitChance: number;
  possibleWrongExitIds: readonly string[];
  warningIds: readonly string[];
  samosborModifiers: readonly string[];
}

export interface MetroTransitState {
  phase: 'idle' | 'boarding' | 'in_train' | 'arriving';
  routeId?: string;
  seed: number;
  departureAtMinute?: number;
  arrivalAtMinute?: number;
  finalDestinationId?: string;
  selectedWarningIds: readonly string[];
}
```

The important part is not exact syntax. The contract is: route outcome is deterministic from state seed and route data; warnings are selected before arrival; destination is never an untyped string guessed by UI.

## Floor Instance Hooks

Metro must support destinations that are not permanent floors. A `floorInstance` hook should be opaque to EXP02:

| Hook | Expected provider | EXP02 use |
| --- | --- | --- |
| `floorInstance.metro.depot_no_rails` | EXP02 metro generator | Wrong-exit/depot arena. |
| `floorInstance.metro.red_edge` | EXP02 or HELL owner | Meat-adjacent red station without full HELL dependency. |
| `floorInstance.numbered.404_hint` | Future EXP09 owner | Optional wrong-exit hook, not required for MVP. |
| `floorInstance.archive.document_gate` | Future EXP03 owner | Optional document validation target. |

If a hook is absent, route data must fall back to `depot_no_rails` or disable that route in debug-visible form. Missing optional hooks must not break build or save.

## Route Hooks

EXP02 route runtime needs these narrow hooks:

| Hook | Direction | Contract |
| --- | --- | --- |
| `canEnterMetroStation(stationId, state)` | caller -> metro | Returns availability, visible reason, debug reason. |
| `listMetroRoutes(stationId, state)` | UI/debug -> metro | Returns data-only route summaries and requirements. |
| `beginMetroRoute(routeId, options)` | interaction/debug -> metro | Validates token/document unless debug override is true. |
| `resolveMetroArrival(transitState)` | clock/system -> metro | Returns target hook, warnings, events, consumed items. |
| `applyMetroSamosborModifier(kind, stationId?)` | samosbor -> metro | Blocks routes or raises risk at event cadence only. |
| `publishMetroEvent(event)` | metro -> event/log | Uses generic event system when available; fallback msg only. |

No hook may require simulating an NPC path through all route cells. NPC migration through metro is aggregated: count, role, origin, destination, event id.

## Debug Contract

Debug must be able to construct every route state directly. Debug may bypass token requirements, but it must display that it did so. Debug commands must print route id, station id, final risk, warning ids and destination hook. A wrong exit without warning ids should fail data validation.

## Save/Load Contract

MVP may ship without persistent mid-route save only if route travel is short and save is disabled or normalized while in train. Preferred future state: `metroTransit?: MetroTransitState` in save with normalization for old saves. If route data id is missing after load, player is returned to last station or depot with a log message; never to invalid coordinates.

## Event And World Log Contract

Metro events should use generic event/log patterns. Required event categories: station discovered, token acquired, boarded train, warning seen, arrived, wrong exit, station closed, depot repaired. Severity should be high for wrong exit and station closure, medium for station discovery/arrival, low for repeated token events. Rumors should attach to source event ids when the event system exists; fabricated rumors must be marked as such.

## Director Integration Contract

Director integration for EXP02 is defined in `director_hooks.md`. Future metro code may expose a read-only `DirectorSignalProvider` with id `exp02.metro` and register data-only director beats for route offers, warning stacks, wrong exits, station closures and return-route relief. The director may schedule these beats through route ids, station ids, warning ids and opaque floor-instance hooks only; it must not mutate metro route data directly, create permanent floors, spawn large NPC groups, alter samosbor cadence or bypass metro token/document validation except through explicit debug override.

Required director-facing metro effects are narrow adapter calls: reveal station hint, reveal route, reserve warnings, apply route risk modifier, close station, override destination, seed aftermath document, publish event and prime chain slot. Each effect must return a reason-coded success/failure result for director trace. Wrong-exit effects are invalid unless the route has player-facing warning ids and a valid fallback such as `floorInstance.metro.depot_no_rails`.

EXP02 director beats use chain slots rather than direct imports from Archive, 404, HELL, market or hospital expansions. Missing optional consumers must reject or fall back with trace reason `missing_signal_provider`; they must not break route selection, save/load or debug. Steady-state cost target is 0 us/frame, with all director checks limited to rare ticks, route selection, samosbor start/end, transit arrival or debug commands.

## Constraints For Shared Interfaces

Do not add a permanent `FloorLevel.METRO` for MVP. Do not put route logic into render, HUD or debug. Do not add a global metroworker faction before a station/route loop proves value. Do not make metro routes depend on future expansions being present. Do not make route risk random each frame. Do not expose wrong exits without player-facing warnings. Do not update `README.md` until code exists and build passes.

## Integration Risks

`FloorLevel` churn is the highest shared risk. Use pocket/floorInstance hooks first. Event/log churn is second: publish facts through a generic API and allow fallback messages until all systems migrate. NPC load is third: train hub must cap active NPC and represent crowds as ambience. Save compatibility is fourth: route ids and station ids must be stable once released.

## Acceptance For Integration

Integration is acceptable when a future implementation can be merged without touching other expansion folders, with only additive data/system hooks, passing `npm run build`, and with debug commands proving normal arrival, wrong exit, samosbor closure, token gating and missing optional floor-instance fallback.
