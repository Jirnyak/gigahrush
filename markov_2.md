# Markov Batch 2: Context And Speech Router

> Parallel GPT-5.5/GPT-5 worker task. You are not alone in the codebase. Other
> workers own the Markov core and adapters. Do not revert unrelated changes.

## Objective

Implement the compact context lowering layer and the universal speech router.
This task does not wire existing gameplay systems yet.

This worker owns:

- `src/systems/markov_context.ts`
- `src/systems/speech_router.ts`
- `tests/markov-router-context.test.ts`

Do not edit existing integration files. The final orchestrator will do that.

## Mandatory Intake

Read:

- `AGENTS.md`
- `README.md`
- `architecture.md`
- `scenarist.md`
- `markov.md`
- `src/systems/context.ts`
- `src/systems/events.ts`
- `src/systems/npc_memory.ts`
- `src/systems/floor_keys.ts`
- `src/core/types.ts`
- `src/systems/markov_text.ts` if it exists

Check:

```bash
git status --short
```

## Implementation

Create `src/systems/markov_context.ts`.

Responsibilities:

- convert `ContextSnapshot` into `MarkovTextContext`;
- derive stable tags and bands:
  - `room.*`
  - `need.food.low`, `need.water.urgent`
  - `danger.samosbor.warning`, `danger.combat`
  - `relation.hostile|cold|neutral|warm|friend`
  - `faction.*`
  - `event.*`
  - `quest.*`
- convert provided `WorldEvent` into compact text context;
- convert provided quest/contract payload into compact text context;
- convert Demos post candidates into compact text context;
- build stable `contextHash` from ids/bands/tags only.

Do not scan the world, entities or A-Life pool to fill missing facts. Use only
facts supplied by the caller.

Create `src/systems/speech_router.ts`.

Responsibilities:

- source ordering:

```txt
locked_author_text
exact gameplay fallback
generated_markov
curated_pool fallback
```

- `routeSpeech(request): SpeechRouterResult`;
- pass generated requests to `generateMarkovText()`;
- return exact locked text unchanged;
- enforce max char caps per intent;
- expose `SpeechRouterRequest`, `SpeechRouterResult`, `MarkovTextContext` if the
  core has not already exported them.

## Tests

Add `tests/markov-router-context.test.ts`.

Required assertions:

- hunger/thirst/wound/samosbor/faction/room snapshots derive expected tags;
- locked text returns exact string and `source='locked_author_text'`;
- blocked tags prevent generated template usage;
- missing optional world data does not crash;
- context hash is stable for same ids/bands/tags;
- context hash does not include long raw room text;
- event context never invents item/NPC/route names;
- router fallback returns exact fallback when generation is unavailable.

## Acceptance

- `npm run typecheck`
- relevant unit tests pass.

## Anti-Patterns

Do not:

- use Russian display names as identity keys;
- derive facts by scanning all entities/A-Life;
- put Demos social storage here;
- mutate `NpcMemory` directly except via explicit caller-provided repeat metadata;
- generate text in render/UI;
- expose route/endgame spoiler tags without explicit context.
