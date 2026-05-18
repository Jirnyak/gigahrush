# Integration Contract: Диспетчер Самосбора

Companion contract: `director_hooks.md` is the authoritative hook contract for beat registry, signal providers, chain templates, rejection reasons, trace schema and debug commands. This file remains the implementation boundary summary.

## Ownership

Future implementation owner:

- `src/data/director_beats.ts`
- `src/data/director_chains.ts`
- `src/systems/director.ts`
- `src/systems/director_registry.ts`
- `src/systems/director_trace.ts`

Shared files require surgical edits only:

- `src/systems/debug.ts` for debug commands.
- `src/systems/samosbor.ts` only for a single aftermath hook, if no event bus exists.
- `src/systems/world_log.ts` optional trace sink.
- `src/core/types.ts` only if shared save state requires type export.

## Public Interfaces

```ts
export function registerDirectorBeat(def: DirectorBeatDef): void;
export function registerDirectorSignalProvider(provider: DirectorSignalProvider): void;
export function registerDirectorChainTemplate(template: DirectorChainTemplateDef): void;
export function buildCampaignSnapshot(state: GameState): CampaignSnapshot;
export function tickDirector(state: GameState, reason: DirectorTickReason): DirectorTickResult;
export function forceDirectorBeat(state: GameState, beatId: string): DirectorTickResult;
export function getDirectorTrace(): readonly DirectorTraceEntry[];
```

## Adapter Rules

Expansion systems may expose read-only adapters:

```ts
export interface DirectorSignalProvider {
  id: string;
  expansionId: string;
  collectSignals(snapshot: CampaignSnapshot, out: DirectorSignal[]): DirectorSignalProviderResult;
}
```

No adapter may allocate large arrays per tick. Use caller-provided `out` or bounded module storage.

## Save/Load

Director save state must be optional:

```ts
export interface DirectorSaveV1 {
  act: number;
  beatCooldowns: [string, number][];
  beatRunCounts: [string, number][];
  activeChains: DirectorChainState[];
  dangerBudget: number;
  reliefBudget: number;
}
```

Unknown beat ids are ignored on load. Missing director state initializes defaults.

## Non-Interference Rules

- Director must not create new floors.
- Director must not spawn large NPC groups.
- Director must not modify pathfinding.
- Director must not directly write item stacks except through a target system adapter.
- Director must not alter samosbor timer frequency in MVP.
- Director must not run from render loop.

## Failure Behavior

If no legal beat exists, director records `no_legal_beat` and does nothing. This is correct behavior, not a bug.

If an adapter is missing, beats requiring its signal are rejected with `missing_signal_provider`.

If a beat effect fails, director records `effect_failed` and consumes no cooldown unless the effect explicitly says otherwise.

## Black Box Requirements

`DirectorTraceEntry[300]` ring buffer is mandatory. Trace must include chosen beat, rejection reason for top candidate, budget state, act and tick reason.

On NaN, impossible act, negative cooldown or invalid chain step, director must dump trace through existing agent log/dump path when runtime dump support exists. Until then, debug output is mandatory.

## Hook Contract Requirement

Future expansion implementations must use director hooks as data registration, not direct imports into the director. Each expansion may register beat definitions and signal providers, but the director must tolerate absent providers with typed rejection reasons. Debug must expose provider status, cooldowns, chains, trace entries and `no_legal_beat` outcomes.
