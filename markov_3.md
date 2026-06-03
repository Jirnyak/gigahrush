# Markov Batch 3: Dialogue, Rumor And Procedural Quest Adapters

> Parallel GPT-5.5/GPT-5 worker task. You are not alone in the codebase. This
> task creates adapter modules only. The final orchestrator wires existing
> systems.

## Objective

Create adapters for ordinary NPC talk, rumor flavor and procedural quest speech
while preserving authored/plot/design text exactly.

This worker owns:

- `src/systems/markov_dialogue.ts`
- `src/systems/markov_rumor.ts`
- `src/systems/markov_procedural_quests.ts`
- `tests/markov-dialogue-quests.test.ts`

Do not edit `src/systems/dialogue.ts`, `src/systems/rumor.ts`,
`src/systems/quests.ts`, `src/data/plot.ts` or `src/data/contracts.ts`.

## Mandatory Intake

Read:

- `AGENTS.md`
- `README.md`
- `architecture.md`
- `scenarist.md`
- `markov.md`
- `src/systems/dialogue.ts`
- `src/systems/rumor.ts`
- `src/systems/quests.ts`
- `src/data/plot.ts`
- `src/data/rumors.ts`
- `src/data/contracts.ts`
- `src/data/context_lines.ts`

Check:

```bash
git status --short
```

## Implementation

Create `src/systems/markov_dialogue.ts`.

Responsibilities:

- helper for ordinary talk after plot/locked authored text has already won;
- accept `Entity`, `ContextSnapshot`, optional `NpcMemory`, time/seed inputs;
- call `routeSpeech()` with `talk_context` or `talk_ambient`;
- preserve exact fallback to current generic/context line behavior where needed;
- never replace plot `talkLines`, `talkLinesPost` or named special responses.

Create `src/systems/markov_rumor.ts`.

Responsibilities:

- helper that receives selected `RumorDef`/`rumorId` and context;
- generate only short flavor around selected rumor facts;
- preserve `rumorId`, topic, lead/reveal semantics and event bridge;
- exact fallback to current `renderRumor()` style if generation fails.

Create `src/systems/markov_procedural_quests.ts`.

Responsibilities:

- render procedural quest offer/reminder/completion/failure speech from actual
  `Quest` and `ContractDef` facts;
- use real target item, room, monster kind, target NPC, reward, deadline and
  contract ids only when present;
- support fetch/visit/kill/talk/repair/steal/expose/escort/hold/route classes
  where current quest data supports them;
- exact fallback to current `Quest.desc` / contract `desc`.

## Tests

Add `tests/markov-dialogue-quests.test.ts`.

Required assertions:

- authored plot lines pass through unchanged when passed as locked text;
- ordinary generated talk contains a context anchor;
- rumor output preserves `rumorId`;
- rumor output does not invent a different target/floor/item;
- procedural quest speech does not mention a reward absent from payload;
- procedural quest speech does not mention a deadline absent from payload;
- procedural quest speech does not invent target NPC/item/monster/route;
- deterministic output for same seed/context.

## Acceptance

- `npm run typecheck`
- targeted unit tests pass.

## Anti-Patterns

Do not:

- change quest mechanics, rewards, deadlines or completion logic;
- rewrite `PLOT_CHAIN`, `SIDE_QUESTS` or authored `talkQuestResponse`;
- use live `entity.id` as durable player-facing identity;
- make generic quest code depend on Russian display-name lookups;
- add broad quest refactors.
