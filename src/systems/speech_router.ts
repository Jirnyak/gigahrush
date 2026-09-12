/* -- Universal Markov NPC speech router ------------------------- */

import { finalizeMarkovContext, type MarkovTextContext } from './markov_context';
import type { MarkovAdapterSpeechRequest, MarkovAdapterSpeechResult } from './markov_dialogue';
import type { MarkovSpeechRouterRequest, MarkovSpeechRouterResult } from './markov_barks';
import type { DemosSpeechRouterRequest, DemosSpeechRouterResult } from './demos_posts';
import { hashSeed } from '../core/rand';
import {
  generateMarkovText as generateCoreMarkovText,
  validateMarkovTextData as validateCoreMarkovTextData,
} from './markov_text';

export type {
  MarkovDangerBand,
  MarkovNeedBand,
  MarkovRelationBand,
  MarkovRouteZBand,
  MarkovTextContext,
  MarkovTimeBand,
  MarkovWealthBand,
} from './markov_context';

export type MarkovIntent =
  | 'talk_ambient'
  | 'talk_context'
  | 'log_speech'
  | 'bark_ambient'
  | 'procedural_quest'
  | 'rumor_flavor'
  | 'demos_post'
  | 'demos_reaction'
  | 'locked_author_text'
  | 'document_flavor'
  | 'lore_note';

export type MarkovSource = 'generated_markov' | 'curated_pool' | 'locked_author_text';

export interface SpeechRouterRequest {
  intent: MarkovIntent;
  source?: MarkovSource;
  context: MarkovTextContext;
  lockedText?: string;
  exactFallback?: string;
  repeatIndex?: number;
  maxChars?: number;
  seed?: number | string;
}

export interface SpeechRouterResult {
  text: string;
  source: MarkovSource;
  intent: MarkovIntent;
  templateId?: string;
  domainId?: string;
  tags: readonly string[];
  fallbackUsed: boolean;
}

const DEFAULT_INTENT_CAPS: Record<MarkovIntent, number> = {
  talk_ambient: 120,
  talk_context: 140,
  log_speech: 120,
  bark_ambient: 96,
  procedural_quest: 180,
  rumor_flavor: 140,
  demos_post: 220,
  demos_reaction: 120,
  locked_author_text: 4096,
  document_flavor: 280,
  lore_note: 340,
};

const CURATED_FALLBACKS: Record<MarkovIntent, string> = {
  talk_ambient: 'Потом скажу. Сейчас не до разговоров.',
  talk_context: 'Сначала осмотрись, потом спрашивай.',
  log_speech: 'Слышали разговор, но слов не разобрали.',
  bark_ambient: 'Не стой на проходе.',
  procedural_quest: 'Работа есть, но детали скажу у места.',
  rumor_flavor: 'Слухи ходят по этажу, но правду знают у дверей.',
  demos_post: 'Короткая запись без лишних подробностей.',
  demos_reaction: 'Принято к сведению.',
  locked_author_text: '',
  document_flavor: 'Обрывок бумаги с полустертыми цифрами и печатью смены.',
  lore_note: 'Заметка дежурного: герметичность в норме, посторонних шумов нет.',
};

const GENERATED_BLOCKED_TAGS = new Set([
  'blocked.markov',
  'markov.blocked',
  'markov.no_generate',
  'locked_author_text',
  'source.locked_author_text',
]);

export function routeSpeech(request: SpeechRouterRequest): SpeechRouterResult {
  if (request.source === 'locked_author_text' || request.intent === 'locked_author_text') {
    return lockedTextResult(request);
  }

  if (request.source === 'curated_pool') return curatedPoolResult(request);

  // Try Markov generation first; use exactFallback only as safety net on failure
  const generated = generateMarkovText(request);
  if (!generated.fallbackUsed) return generated;

  if (hasText(request.exactFallback)) return fallbackResult(request, 'curated_pool');

  return generated;
}

export function generateMarkovText(request: SpeechRouterRequest): SpeechRouterResult {
  if (!generatedAllowed(request.context)) return curatedPoolResult(request);

  const generated = generateCoreMarkovText({
    intent: request.intent,
    source: 'generated_markov',
    context: request.context,
    exactFallback: request.exactFallback,
    repeatIndex: request.repeatIndex,
    maxChars: request.maxChars,
    seed: normalizeSeed(request.seed),
  });

  if (generated && generated.source === 'generated_markov' && hasText(generated.text) && !generated.fallbackUsed) {
    return {
      ...generated,
      // Universal rule: authored text is never truncated, generated text is
      // ALWAYS capped. `maxCharsForRequest` falls back to the per-intent cap,
      // so a caller that forgets `maxChars` still cannot overflow a HUD panel.
      text: capText(generated.text, maxCharsForRequest(request)),
      tags: normalizeResultTags(request, generated.tags),
      fallbackUsed: false,
    };
  }

  return curatedPoolResult(request);
}

export function validateMarkovTextData(): readonly string[] {
  return validateCoreMarkovTextData();
}

function lockedTextResult(request: SpeechRouterRequest): SpeechRouterResult {
  const text = request.lockedText ?? request.exactFallback ?? '';
  return {
    text,
    source: 'locked_author_text',
    intent: request.intent,
    tags: normalizeResultTags(request),
    fallbackUsed: false,
  };
}

function fallbackResult(request: SpeechRouterRequest, source: MarkovSource): SpeechRouterResult {
  const text = request.exactFallback ?? CURATED_FALLBACKS[request.intent] ?? CURATED_FALLBACKS.talk_context;
  return {
    text: request.maxChars !== undefined ? capText(text, maxCharsForRequest(request)) : text.replace(/\s+/g, ' ').trim(),
    source,
    intent: request.intent,
    tags: normalizeResultTags(request),
    fallbackUsed: true,
  };
}

function curatedPoolResult(request: SpeechRouterRequest): SpeechRouterResult {
  const curated = generateCoreMarkovText({
    intent: request.intent,
    source: 'curated_pool',
    context: request.context,
    repeatIndex: request.repeatIndex,
    maxChars: request.maxChars,
    seed: normalizeSeed(request.seed),
  });
  if (hasText(curated.text)) {
    return {
      ...curated,
      text: request.maxChars !== undefined ? capText(curated.text, maxCharsForRequest(request)) : curated.text.replace(/\s+/g, ' ').trim(),
      source: 'curated_pool',
      tags: normalizeResultTags(request, curated.tags),
    };
  }
  return fallbackResult(request, 'curated_pool');
}

function normalizeResultTags(request: SpeechRouterRequest, extra: readonly string[] = []): readonly string[] {
  const out: string[] = [];
  for (const tag of [...request.context.tags, ...extra]) {
    if (tag.length > 0 && !out.includes(tag)) out.push(tag);
  }
  return out.sort();
}

function generatedAllowed(context: MarkovTextContext): boolean {
  return !context.tags.some(tag => GENERATED_BLOCKED_TAGS.has(tag));
}

function maxCharsForRequest(request: SpeechRouterRequest): number {
  const explicit = request.maxChars;
  if (explicit !== undefined && Number.isFinite(explicit)) return Math.max(8, Math.trunc(explicit));
  return DEFAULT_INTENT_CAPS[request.intent] ?? 120;
}

function capText(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  if (maxChars <= 3) return compact.slice(0, maxChars);
  return `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}

function hasText(text: string | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0;
}

function normalizeSeed(seed: number | string | undefined): number | undefined {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed;
  if (typeof seed === 'string') return hashSeed(seed);
  return undefined;
}

/* ── Поверхности речи: один вызов на все три ───────────────────────
 *
 * Здесь лежал отдельный модуль-шим `markov_router_adapters` на 94 строки, и в
 * нём одна и та же двадцатистрочная функция была написана ТРИЖДЫ: для диалога,
 * для барка и для ленты Демоса. Различались они ровно двумя вещами — формой
 * входного контекста и приведением типа результата. Ни то ни другое системы не
 * стоит.
 *
 * Ветка `source === 'generated_markov'` сохранена дословно: она выбирает между
 * прямой генерацией и полным роутером, и это не украшение — роутер умеет отдать
 * авторскую строку, а прямая генерация нет.
 */

function routeSurfaceSpeech(request: {
  intent: MarkovIntent;
  source?: MarkovSource;
  /* Контекст приходит НЕДОсобранным — без `contextHash`: его ставит
   * `finalizeMarkovContext`, и он же единственная разница между входом
   * поверхности и входом роутера. */
  context: Partial<MarkovTextContext> & { tags?: readonly string[] };
  lockedText?: string;
  exactFallback?: string;
  repeatIndex?: number;
  maxChars?: number;
  seed?: string | number;
}): SpeechRouterResult {
  const routerRequest: SpeechRouterRequest = {
    intent: request.intent,
    source: request.source,
    context: finalizeMarkovContext(request.context),
    lockedText: request.lockedText,
    exactFallback: request.exactFallback,
    repeatIndex: request.repeatIndex,
    maxChars: request.maxChars,
    seed: request.seed,
  };
  return request.source === 'generated_markov'
    ? generateMarkovText(routerRequest)
    : routeSpeech(routerRequest);
}

export function routeAdapterSpeech(request: MarkovAdapterSpeechRequest): MarkovAdapterSpeechResult {
  const result = routeSurfaceSpeech(request);
  return {
    ...result,
    intent: result.intent as MarkovAdapterSpeechResult['intent'],
    source: result.source as MarkovAdapterSpeechResult['source'],
  };
}

export function routeDemosSpeech(request: DemosSpeechRouterRequest): DemosSpeechRouterResult {
  const result = routeSurfaceSpeech(request);
  return {
    ...result,
    intent: result.intent as DemosSpeechRouterResult['intent'],
    source: result.source as DemosSpeechRouterResult['source'],
  };
}

/** Барк приходит со СВОЕЙ формой контекста — плоской, с якорями отдельным
 *  списком. Это единственное настоящее отличие трёх прежних копий. */
export function routeBarkSpeech(request: MarkovSpeechRouterRequest): MarkovSpeechRouterResult {
  const c = request.context;
  const result = routeSurfaceSpeech({
    ...request,
    context: {
      actorId: c.actorId,
      targetId: c.targetId,
      z: c.z,
      roomType: c.roomType,
      roomDefId: c.roomDefId,
      zoneId: c.zoneId,
      faction: c.actorFaction,
      occupation: c.actorOccupation,
      itemId: c.itemId,
      itemName: c.itemName,
      eventType: typeof c.eventType === 'string' ? c.eventType : undefined,
      eventId: c.eventId,
      tags: [...c.tags, ...c.anchors.map(anchor => `anchor.${anchor}`)],
    },
  });
  return {
    ...result,
    intent: result.intent as MarkovSpeechRouterResult['intent'],
    source: result.source as MarkovSpeechRouterResult['source'],
  };
}

/* ── Домен говорит контекстом, а не своей машиной ──────────────────
 *
 * Слух и процедурный квест держали ОДИН И ТОТ ЖЕ порядок действий, каждый у
 * себя: запертый текст отдать как есть → собрать запрос → позвать роутер →
 * проверить ответ своими правилами → если не годится, взять запасной. Различий
 * между ними ровно два, и оба — не машина: КОНТЕКСТ (что домен знает о мире) и
 * ПРАВИЛО ПРИЁМКИ (какая строка для него годится).
 *
 * Порядок теперь живёт здесь. Домен приносит контекст, приёмку и — если у него
 * есть свой генератор фактов — запасной генератор.
 *
 * Роутер больше не впрыскивается вызывающим: инъекция держала адаптеры
 * листьями графа импортов, а теперь листьями им быть незачем — они сами часть
 * речи. Цикла это не добавляет: `speech_router` ни одного домена не импортирует.
 */

export interface DomainSpeechSpec {
  intent: MarkovIntent;
  context: Partial<MarkovTextContext> & { tags?: readonly string[] };
  /** Строка, которой домен обходится, когда сказать нечем. */
  exactFallback: string;
  seed?: string | number;
  repeatIndex?: number;
  maxChars: number;
  /** Годится ли сгенерированная строка для этого домена. */
  accept: (text: string) => boolean;
  /** Запасной генератор домена: зовётся, когда роутер не дал годного. */
  generate?: () => string | undefined;
}

export interface DomainSpeechResult {
  text: string;
  source: MarkovSource;
  tags: readonly string[];
  fallbackUsed: boolean;
  /** Полный ответ роутера, когда он и был взят: домен дописывает к нему своё. */
  routed?: SpeechRouterResult;
}

export function speakDomain(spec: DomainSpeechSpec): DomainSpeechResult {
  const routed = routeSurfaceSpeech({
    intent: spec.intent,
    source: 'generated_markov',
    context: spec.context,
    exactFallback: spec.exactFallback,
    seed: spec.seed,
    repeatIndex: spec.repeatIndex,
    maxChars: spec.maxChars,
  });
  const contextTags = [...(spec.context.tags ?? [])];
  if (routed && spec.accept(routed.text)) {
    return {
      text: routed.text,
      source: routed.source,
      tags: routed.tags.length ? routed.tags : contextTags,
      fallbackUsed: routed.fallbackUsed,
      routed,
    };
  }
  const generated = spec.generate?.();
  if (generated && spec.accept(generated)) {
    return { text: generated, source: 'generated_markov', tags: contextTags, fallbackUsed: false };
  }
  return { text: spec.exactFallback, source: 'curated_pool', tags: contextTags, fallbackUsed: true };
}
