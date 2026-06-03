# Markov Batch 4: Bark And Log-Speech Adapters

> Parallel GPT-5.5/GPT-5 worker task. You are not alone in the codebase. Create
> adapter modules only; final wiring happens in `markov_6.md`.

## Objective

Implement Markov adapters for safe NPC speech surfaces:

- ambient bark;
- arrive/lead bark;
- witness flavor;
- explicit NPC log speech.

Keep alert/combat/samosbor-critical and structural world-log text exact.

This worker owns:

- `src/systems/markov_barks.ts`
- `src/systems/markov_log_speech.ts`
- `tests/markov-barks-log.test.ts`

Do not edit `src/systems/ai/barks.ts`, `src/systems/world_log.ts`,
`src/systems/ai/combat.ts`, `src/systems/ai/npc_fsm.ts` or render files.

## Mandatory Intake

Read:

- `AGENTS.md`
- `README.md`
- `architecture.md`
- `scenarist.md`
- `markov.md`
- `src/systems/ai/barks.ts`
- `src/systems/world_log.ts`
- `src/systems/ai/combat.ts`
- `src/systems/ai/npc_fsm.ts`
- `tests/npc-barks.test.ts` if present
- `tests/world-log-distance.test.ts` if present

Check:

```bash
git status --short
```

## Implementation

Create `src/systems/markov_barks.ts`.

Responsibilities:

- expose helpers for ambient/lead/witness bark generation;
- accept lightweight actor facts and optional prebuilt context;
- call `routeSpeech()` with `bark_ambient` or `log_speech`;
- reject/return undefined for alert/combat/flee/wounded/samosbor-critical
  signals;
- provide exact fallback line supplied by caller.

Create `src/systems/markov_log_speech.ts`.

Responsibilities:

- render explicit NPC speech derived from an event only when the caller marks it
  as speech;
- use actor/target/item/event ids only from supplied event/context;
- never replace `world_log.ts` structural `eventText()` by default;
- keep distance/audibility/HUD priority owned by existing log/bark systems.

## Tests

Add `tests/markov-barks-log.test.ts`.

Required assertions:

- alert/combat signals are rejected or exact fallback only;
- ambient bark respects char cap;
- generated bark contains actor/context/event anchor;
- witness/log speech uses only supplied actor/target facts;
- structural world log event types do not become Markov text by accident;
- no full `ContextSnapshot` is required for lightweight bark path;
- deterministic output for same seed/context.

## Acceptance

- `npm run typecheck`
- targeted unit tests pass.

## Anti-Patterns

Do not:

- generate variable combat commands;
- generate samosbor shelter instructions variably;
- change `pushNpcLogMessage()` or `pushNpcBarkMessage()` semantics;
- change HUD priority/radius logic;
- scan `entities`;
- make world log own gameplay decisions.
