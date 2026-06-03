# Markov Batch 1: Transient Markov Core

> Parallel GPT-5.5/GPT-5 worker task. You are not alone in the codebase. Other
> workers may edit disjoint Markov modules. Do not revert unrelated changes.

## Objective

Implement the bounded, deterministic, template-first Markov core with no save
shape change and no integration into existing gameplay call sites.

This worker owns:

- `src/data/markov_text.ts`
- `src/systems/markov_text.ts`
- `tests/markov-text.test.ts`

Do not edit `dialogue.ts`, `quests.ts`, `barks.ts`, `world_log.ts`, `demos.ts`,
save files, render files, `main.ts`, `core/world.ts` or `render/webgl.ts`.

## Mandatory Intake

Read:

- `AGENTS.md`
- `README.md`
- `architecture.md`
- `scenarist.md`
- `markov.md`
- `src/data/dialogue.ts`
- `src/data/context_lines.ts`
- `src/systems/dialogue.ts`
- `src/systems/ai/barks.ts`
- `tests/context-lines.test.ts` if present

Check:

```bash
git status --short
```

## Implementation

Create author-facing definitions in `src/data/markov_text.ts`:

- `MarkovIntent`
- `MarkovSource`
- `MarkovAtomClass`
- `MarkovAtomDef`
- `MarkovTemplate`
- `MarkovDomain`
- corpus definitions from existing ordinary/context/ambient line pools
- fallbacks
- tone/internal/spoiler blacklist

Use existing Russian curated text as corpus seed, but do not import debug/UI/Net
Sphere/player chat/system telemetry. Do not copy entire project strings into one
global corpus.

Create runtime core in `src/systems/markov_text.ts`:

- lazy compile once;
- numeric ids for atoms/classes/tags;
- typed-array-like compiled pack where practical;
- seeded deterministic RNG using existing project random/hash helpers;
- variable-order transitions up to 3;
- backoff: trigram -> bigram -> class transition -> domain unigram;
- finite class paths per slot;
- bounded beam/candidate generation;
- template scoring;
- runtime validator;
- exact fallback path.

Expected constants:

```ts
MARKOV_MAX_OUTPUT_CHARS_TALK = 140
MARKOV_MAX_OUTPUT_CHARS_BARK = 96
MARKOV_MAX_OUTPUT_CHARS_DEMOS = 180
MARKOV_SLOT_ATOM_CAP = 8
MARKOV_SLOT_BEAM_WIDTH = 6
MARKOV_SLOT_CANDIDATE_CAP = 8
MARKOV_TEMPLATE_ATTEMPTS = 3
MARKOV_CHAIN_ORDER_MAX = 3
```

Core API:

```ts
generateMarkovText(request: SpeechRouterRequest): SpeechRouterResult
validateMarkovTextData(): readonly string[]
```

If `SpeechRouterRequest`/`SpeechRouterResult` are not yet supplied by
`speech_router.ts`, define compatible exported types here so later workers can
reuse them.

## Tests

Add `tests/markov-text.test.ts`.

Required assertions:

- same seed/context/request yields same output;
- different `repeatIndex` can vary output when corpus supports it;
- invalid duplicate ids fail data validation;
- every domain/template has fallback;
- every atom has a class;
- class paths reach terminal state;
- output respects char caps;
- generated text has at least one grounded anchor when required;
- no unresolved `{slot}`;
- no adjacent repeated atoms or repeated bigram loops;
- tone/internal blacklist catches forbidden words;
- no `Math.random()` in the core generation path.

## Acceptance

- `npm run typecheck`
- `npm run test:unit` or the targeted unit test command if the full unit suite is
  blocked by unrelated work.

Report exact checks run.

## Anti-Patterns

Do not:

- generate whole free phrases from all words;
- invent facts in atoms;
- add a morphology engine;
- add dependencies;
- store generated strings in save/runtime state;
- read render/UI/main/core for generation;
- use `Math.random()` for persistent-visible output.
