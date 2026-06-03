# Markov Batch 5: Demos Feed Text Layer

> Parallel GPT-5.5/GPT-5 worker task. You are not alone in the codebase. This
> task creates a transient Demos text/feed layer. It does not implement
> persistent save state unless the final orchestrator explicitly chooses that
> later.

## Objective

Create transient Demos posts/reactions from real `WorldEvent`, A-Life snapshot
and supplied social-edge facts. Text goes through the Markov speech router.

This worker owns:

- `src/data/demos_posts.ts`
- `src/systems/demos_posts.ts`
- `src/render/demos_feed_ui.ts`
- `tests/markov-demos-posts.test.ts`

Do not edit `src/systems/demos.ts`, `src/render/demos_ui.ts`,
`src/systems/alife.ts`, `src/systems/events.ts`, save files or `main.ts`.

## Mandatory Intake

Read:

- `AGENTS.md`
- `README.md`
- `architecture.md`
- `scenarist.md`
- `markov.md`
- `demos.md`
- `alife.md`
- `save.md`
- `src/systems/demos.ts`
- `src/render/demos_ui.ts`
- `src/systems/alife.ts`
- `src/systems/events.ts`
- `tests/demos.test.ts`

Check:

```bash
git status --short
```

## Implementation

Create `src/data/demos_posts.ts`.

Responsibilities:

- Demos post/reaction templates;
- compact post domains and tags;
- no player chat or Net Sphere chat corpus.

Create `src/systems/demos_posts.ts`.

Responsibilities:

- event-to-post candidate queue using existing `WorldEvent` facts;
- bounded ring cap;
- compact post record:

```ts
interface DemosMarkovPost {
  id: number;
  authorAlifeId: number;
  createdAt: number;
  sourceEventId?: number;
  templateId: string;
  seed: number;
  args: readonly string[];
  tags: readonly string[];
}
```

- render post/reaction text through `routeSpeech()`;
- choose author only from explicit event actor/target A-Life ids or bounded
  supplied fallback;
- reaction renderer scans only supplied outgoing edges;
- no full A-Life scan per render.

Create `src/render/demos_feed_ui.ts`.

Responsibilities:

- draw ready Demos feed view model only;
- no text generation in render;
- no DOM.

## Tests

Add `tests/markov-demos-posts.test.ts`.

Required assertions:

- only real events/compact facts create posts;
- ring cap drops old entries;
- post text reconstructs from `templateId + seed + args + tags`;
- generated string is not primary storage;
- reaction API scans only supplied outgoing edges;
- no inactive floor load;
- no save shape change;
- deterministic output for same post record.

## Acceptance

- `npm run typecheck`
- targeted unit tests pass.

## Anti-Patterns

Do not:

- create a timer that makes 100k NPCs post;
- store long generated strings in save;
- build full social graph here;
- create Demos-specific actors;
- teleport/migrate NPCs;
- generate text in render;
- use Net Sphere chat as corpus.
