# Markov Batch 0: Indexator

> Начальный индексатор для полной реализации `Markov NPC Text`.
>
> Это orchestration prompt, а не shipped fact. Фактическое состояние проверять
> по `README.md`, `architecture.md`, `scenarist.md`, `markov.md`, текущим `src/`
> и тестам.

## Objective

Запустить реализацию единой универсальной procedural text системы для обычной
NPC-речи, bark/log speech, процедурных quest формулировок и Demos posts/reactions.

Система должна быть:

- data-oriented;
- deterministic where visible/persistent;
- bounded по длине, частоте, scans и save payload;
- минимальной по внешним взаимодействиям;
- расширяемой через data definitions, а не через локальные строковые массивы;
- безопасной для authored text.

Не цель: переписывать предизайн сюжет, authored side quests, lore/design scenes,
точные safety warnings, combat commands, HUD/system telemetry и Net Sphere chat.

## Common Intake For All Agents

Перед работой читать:

- `AGENTS.md`;
- `README.md`;
- `architecture.md`;
- `scenarist.md`;
- `markov.md`;
- релевантные файлы из своего task prompt.

Всегда проверять:

```bash
git status --short
```

В дереве могут быть чужие изменения. Не откатывать их.

## Review Provenance

Перед подготовкой этого batch были запущены шесть независимых review lanes:

- математическая модель Markov core: completed;
- Demos/A-Life/save/social integration: completed;
- implementation task decomposition: completed;
- integration architecture: remote compact failed, covered by local code audit;
- text-surface inventory: remote compact failed, covered by local code audit;
- validation/performance strategy: remote compact failed, covered by local code
  audit against `tests.md`, `optimization.md` and current tests.

Использовать итоговый contract в `markov.md` и task prompts below as source of
truth for this batch. Не искать старые agent logs или неудачные remote thread
states.

## Shared Contract

Все worker-задачи должны согласоваться с этим минимальным API:

```ts
type MarkovSource = 'generated_markov' | 'curated_pool' | 'locked_author_text';

type MarkovIntent =
  | 'talk_ambient'
  | 'talk_context'
  | 'log_speech'
  | 'bark_ambient'
  | 'procedural_quest'
  | 'rumor_flavor'
  | 'demos_post'
  | 'demos_reaction'
  | 'locked_author_text';

interface MarkovTextContext {
  actorId?: number;
  actorAlifeId?: number;
  targetId?: number;
  targetAlifeId?: number;
  floorKey?: string;
  floor?: number;
  roomType?: number;
  roomName?: string;
  zoneId?: number;
  zoneFaction?: number;
  faction?: number;
  occupation?: number;
  relationBand?: 'hostile' | 'cold' | 'neutral' | 'warm' | 'friend';
  needBand?: 'ok' | 'low' | 'urgent';
  dangerBand?: 'quiet' | 'uneasy' | 'threat' | 'combat' | 'panic';
  wealthBand?: 'broke' | 'small' | 'payday' | 'fat';
  itemId?: string;
  itemName?: string;
  monsterKind?: number;
  eventType?: string;
  eventId?: number;
  questId?: number;
  contractId?: string;
  rumorId?: string;
  tags: readonly string[];
}

interface SpeechRouterRequest {
  intent: MarkovIntent;
  source?: MarkovSource;
  context: MarkovTextContext;
  lockedText?: string;
  exactFallback?: string;
  repeatIndex?: number;
  maxChars?: number;
}

interface SpeechRouterResult {
  text: string;
  source: MarkovSource;
  intent: MarkovIntent;
  templateId?: string;
  domainId?: string;
  tags: readonly string[];
  fallbackUsed: boolean;
}
```

Only the final orchestrator wires existing systems into the router. Parallel
workers create modules/adapters in disjoint files.

## Parallel Tasks

Run these five GPT-5.5/GPT-5 worker tasks in parallel:

| Task | File | Ownership |
| --- | --- | --- |
| Transient Markov core | `markov_1.md` | `src/data/markov_text.ts`, `src/systems/markov_text.ts`, `tests/markov-text.test.ts` |
| Context and speech router | `markov_2.md` | `src/systems/markov_context.ts`, `src/systems/speech_router.ts`, `tests/markov-router-context.test.ts` |
| Dialogue/rumor/procedural quest adapters | `markov_3.md` | `src/systems/markov_dialogue.ts`, `src/systems/markov_rumor.ts`, `src/systems/markov_procedural_quests.ts`, `tests/markov-dialogue-quests.test.ts` |
| Bark and log-speech adapters | `markov_4.md` | `src/systems/markov_barks.ts`, `src/systems/markov_log_speech.ts`, `tests/markov-barks-log.test.ts` |
| Demos feed text layer | `markov_5.md` | `src/data/demos_posts.ts`, `src/systems/demos_posts.ts`, `src/render/demos_feed_ui.ts`, `tests/markov-demos-posts.test.ts` |

After all five finish, run:

| Task | File | Ownership |
| --- | --- | --- |
| Final integration orchestrator | `markov_6.md` | existing integration files only |

## Global Anti-Patterns

Reject:

- free Markov chain over all project strings;
- generated facts, deaths, rewards, deadlines, routes or debts;
- player chat, debug strings, Net Sphere chat or exact HUD telemetry as corpus;
- Markov in render/UI;
- per-frame compile or full-world/A-Life scans;
- save strings as primary generated text state;
- new runtime dependencies;
- morphology engine;
- content-specific logic in `main.ts`, `core/world.ts`, `render/webgl.ts`;
- Demos as hidden Sims or ordinary NPC refill.

## Expected Final State

After `markov_6.md`:

- ordinary NPC talk, procedural quest speech, ambient/lead bark, explicit NPC
  log speech and Demos posts/reactions route through one speech router;
- plot/lore/design/special authored lines are exact `locked_author_text`;
- critical warning and combat command strings stay exact;
- generated strings are deterministic where visible/persistent;
- Demos transient feed works without save shape change, unless the orchestrator
  deliberately implements persistent feed with a version bump;
- tests prove no false facts, no unbounded scans and no dominant fallback.
