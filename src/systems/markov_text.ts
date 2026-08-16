/* ── Bounded deterministic Markov NPC text core ───────────────── */

import { rng } from '../core/rand';
import { randomName } from '../data/catalog';
import { MARKOV_TEXT_DEFINITIONS, MarkovIntent, MarkovSource } from '../data/markov_text';
import {
  COMPILED_SKELETONS, COMPILED_CATEGORIES, COMPILED_MARKOV_GRAPH, COMPILED_PATTERN_DISTANCES,
  COMPILED_TAG_BITS, markovEdgeCount, markovEdgeMask,
} from '../data/markov_compiled_matrix';
/* Реляция берётся из data/relations напрямую, а не через systems/factions:
   getFactionRelation там — однострочный проброс к getFactionRel, а ребро
   markov_text → factions держало рантайм-цикл на 26 файлов. Генератору речи
   не нужна система войны за территорию, ему нужно одно число. */
import { getFactionRel } from '../data/relations';

export interface MarkovTextContext {
  readonly actorId?: number;
  readonly actorAlifeId?: number;
  readonly actorName?: string;
  readonly targetId?: number;
  readonly targetAlifeId?: number;
  readonly targetName?: string;
  readonly floorKey?: string;
  readonly z?: number;
  readonly roomType?: number;
  readonly roomDefId?: string;
  readonly zoneId?: number;
  readonly zoneFaction?: number;
  readonly faction?: number;
  readonly occupation?: number;
  readonly relationBand?: 'hostile' | 'cold' | 'neutral' | 'warm' | 'friend';
  readonly socialEdgeFlags?: number;
  readonly needBand?: 'ok' | 'low' | 'urgent';
  readonly dangerBand?: 'quiet' | 'uneasy' | 'threat' | 'combat' | 'panic';
  readonly wealthBand?: 'broke' | 'small' | 'payday' | 'fat';
  readonly timeBand?: 'night' | 'morning' | 'work' | 'evening' | 'late';
  readonly itemId?: string;
  readonly itemName?: string;
  readonly monsterKind?: number;
  readonly eventType?: string;
  readonly eventId?: number;
  readonly tags?: readonly string[];
  readonly requiredAnchors?: readonly string[];
  readonly args?: Readonly<Record<string, string | number | undefined>>;
  readonly seed?: number;
  readonly dangerLevel?: number;
  readonly thirst?: number;
  readonly hunger?: number;
  readonly foundItemValue?: number;
  readonly recentTrauma?: boolean;
  readonly isSamosborActive?: boolean;
}

export interface SpeechRouterRequest {
  readonly intent: MarkovIntent;
  readonly source?: MarkovSource;
  readonly context?: MarkovTextContext;
  readonly lockedText?: string;
  readonly exactFallback?: string;
  readonly repeatIndex?: number;
  readonly maxChars?: number;
  readonly seed?: number;
}

export interface SpeechRouterResult {
  readonly text: string;
  readonly source: MarkovSource;
  readonly intent: MarkovIntent;
  readonly templateId?: string;
  readonly domainId?: string;
  readonly tags: readonly string[];
  readonly fallbackUsed: boolean;
}

export function computePcaContext(context: MarkovTextContext | undefined) {
  if (!context) return { pcaDanger: 0.1, pcaWealth: 0.1, pcaNeed: 0.1 };
  const danger = context.dangerLevel ?? (
    context.dangerBand === 'panic' ? 1.0 :
    context.dangerBand === 'combat' ? 0.8 :
    context.dangerBand === 'threat' ? 0.6 :
    context.dangerBand === 'uneasy' ? 0.3 :
    context.isSamosborActive ? 0.9 :
    context.recentTrauma ? 0.7 : 0.1
  );
  const wealth = context.foundItemValue !== undefined ? Math.min(1.0, context.foundItemValue / 100) : (
    context.wealthBand === 'fat' ? 0.9 :
    context.wealthBand === 'payday' ? 0.7 :
    context.wealthBand === 'small' ? 0.3 :
    context.wealthBand === 'broke' ? -0.5 : 0.1
  );
  const need = Math.max(
    context.thirst ?? 0,
    context.hunger ?? 0,
    context.needBand === 'urgent' ? 0.9 :
    context.needBand === 'low' ? 0.5 : 0.1
  );
  return {
    pcaDanger: Math.max(-1, Math.min(1, danger)),
    pcaWealth: Math.max(-1, Math.min(1, wealth)),
    pcaNeed: Math.max(-1, Math.min(1, need)),
  };
}

/* Score(A,C) = W_base + α·bitCount(Tags_A ∩ Tags_C) + β·CosineSim(V(A), V(C)).
   α держит тег главным различителем, β — мягкая доводка по осям, W_base
   логарифмический, чтобы предмет за 5000 не съедал всю категорию. */
const SCORE_TAG_ALPHA = 1.5;
const SCORE_PCA_BETA = 1.0;
/* В обходе графа тег умножает вес: там он конкурирует с эвристикой скелета,
   поэтому прибавка кратная, а не аддитивная. Прежние +15 за тег подбирались
   вслепую на ветке, которая ни разу не срабатывала. */
const GRAPH_TAG_ALPHA = 3;
/* Спуск к цели скелета экспоненциальный, а не 100/(d+1): пологий градиент
   тонул в разбросе count (частотное слово на d=8 било редкое на d=0), обход
   гулял на постоянной дистанции и не доходил до цели — фраза упиралась в
   потолок в 100 слов. При основании 8 медиана реплики 125 символов и 300 из
   300 прогонов различны, копипасты корпуса нет. */
const SKELETON_GRADIENT = 8;
const SKELETON_OFF_PATH = 1e-4;

/* Скелеты ссылаются на все категории, но корпус абстрагирован только до
   восьми плейсхолдеров (categoryMap компилятора). У остальных целей карта
   расстояний пуста: дойти до них обходом графа нельзя в принципе. Такую цель
   надо пропускать, а не вести к ней — иначе patternIndex не двигается,
   конец фразы давится множителем 0.01 и реплика идёт до упора в maxWords.
   Слот всё равно наполняется из COMPILED_CATEGORIES при подстановке. */
const STEERABLE_TARGETS: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const target of Object.keys(COMPILED_PATTERN_DISTANCES)) {
    for (const _ in COMPILED_PATTERN_DISTANCES[target]) { set.add(target); break; }
  }
  return set;
})();

function bitCount(v: number): number {
  let x = v - ((v >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

/** Маска контекста: имена тегов резолвятся через словарь матрицы, не по порядку. */
function contextTagMask(tags: Iterable<string>): number {
  let mask = 0;
  for (const tag of tags) mask |= COMPILED_TAG_BITS[tag] ?? 0;
  return mask;
}

/**
 * Что игра сейчас говорит о ситуации, в терминах канонического словаря.
 * Единственная точка, где контекст превращается в биты: и обход графа, и
 * подстановка атомов смотрят на одну и ту же маску. Новая система добавляет
 * свой тег в словарь и кладёт его в ctx.tags — ветка здесь не нужна.
 */
export function buildContextTagMask(ctx: MarkovTextContext | undefined): number {
  if (!ctx) return 0;
  const activeTags = new Set<string>();
  if (ctx.tags) {
    for (const tag of ctx.tags) activeTags.add(tag);
  }
  if (ctx.occupation === 2 || ctx.occupation === 1) activeTags.add('guard'); // just examples based on occupation ID mapping
  if (ctx.occupation === 3) activeTags.add('repair');
  if ((ctx.thirst || 0) > 60 || ctx.needBand === 'urgent') activeTags.add('thirst');
  if ((ctx.hunger || 0) > 60 || ctx.needBand === 'urgent') activeTags.add('hunger');
  if (ctx.isSamosborActive) activeTags.add('samosbor');
  if ((ctx.dangerLevel || 0) > 50 || ctx.dangerBand === 'threat') activeTags.add('danger');
  if (ctx.relationBand === 'hostile') activeTags.add('hostile');
  if (ctx.recentTrauma) activeTags.add('fear');
  if (ctx.foundItemValue !== undefined) {
    if (ctx.foundItemValue >= 1000) activeTags.add('expensive_item');
    if (ctx.foundItemValue < 100) activeTags.add('cheap_item');
  }
  return contextTagMask(activeTags);
}

/** Выбор атома категории по Score(A,C). Отдельная точка входа для тестов. */
export function pickCategoryAtom(categoryName: string, ctx: MarkovTextContext | undefined): string {
  return resolveCategory(`<${categoryName}>`, ctx, buildContextTagMask(ctx));
}

function atomScore(
  item: { readonly weight: number; readonly mask: number; readonly pcaDanger: number; readonly pcaWealth: number; readonly pcaNeed: number },
  ctxMask: number, cd: number, cw: number, cn: number, ctxNorm: number,
): number {
  const wBase = Math.log10(1 + Math.max(0, item.weight));
  const overlap = bitCount(item.mask & ctxMask);
  let cosine = 0;
  const itemNorm = Math.sqrt(item.pcaDanger * item.pcaDanger + item.pcaWealth * item.pcaWealth + item.pcaNeed * item.pcaNeed);
  if (itemNorm > 0 && ctxNorm > 0) {
    cosine = (item.pcaDanger * cd + item.pcaWealth * cw + item.pcaNeed * cn) / (itemNorm * ctxNorm);
  }
  const score = wBase + SCORE_TAG_ALPHA * overlap + SCORE_PCA_BETA * cosine;
  return score > 0.01 ? score : 0.01;
}

function resolveCategory(tag: string, ctx: MarkovTextContext | undefined, ctxMask: number): string {
  const categoryName = tag.replace(/[<>]/g, '');
  if (categoryName === 'NPC_NAME') {
    const r = rng();
    if (r < 0.1 && ctx?.targetName) return ctx.targetName;
    if (r < 0.2 && ctx?.actorName) return ctx.actorName;
    return randomName(ctx?.faction).firstName;
  }

  const items = COMPILED_CATEGORIES[categoryName];
  if (!items || items.length === 0) return tag;

  if (categoryName === 'FACTION_NAME' && ctx?.faction !== undefined) {
    const factions = items.map(item => {
      const match = item.tags.find(t => t.startsWith('faction_id_'));
      const fId = match ? parseInt(match.replace('faction_id_', '')) : -1;
      let relation = 0;
      if (fId !== -1) {
        relation = getFactionRel(ctx.faction!, fId);
      }
      const weight = Math.max(10, Math.abs(relation) + 10);
      return { item, weight };
    });
    const totalWeight = factions.reduce((sum, f) => sum + f.weight, 0);
    let r = rng() * totalWeight;
    for (const f of factions) {
      r -= f.weight;
      if (r <= 0) return f.item.text;
    }
    return items[Math.floor(rng() * items.length)].text;
  }

  /* Два прохода без аллокаций: argmin с полосой 0.1 всплывал одними и теми же
     атомами и не читал weight вовсе. Здесь выбор вероятностный по Score. */
  const pca = computePcaContext(ctx);
  const cd = pca.pcaDanger, cw = pca.pcaWealth, cn = pca.pcaNeed;
  const ctxNorm = Math.sqrt(cd * cd + cw * cw + cn * cn);

  let total = 0;
  for (const item of items) total += atomScore(item, ctxMask, cd, cw, cn, ctxNorm);

  let r = rng() * total;
  for (const item of items) {
    r -= atomScore(item, ctxMask, cd, cw, cn, ctxNorm);
    if (r <= 0) return item.text;
  }
  return items[items.length - 1].text;
}

export function generateMarkovText(request: SpeechRouterRequest): SpeechRouterResult {
  const source = request.source ?? 'generated_markov';
  
  if (source === 'locked_author_text' || request.intent === 'locked_author_text') {
    return {
      text: request.lockedText || request.exactFallback || MARKOV_TEXT_DEFINITIONS.intentFallbacks['locked_author_text'] || '',
      source: 'locked_author_text',
      intent: request.intent,
      tags: [],
      fallbackUsed: false,
    };
  }

  if (Object.keys(COMPILED_MARKOV_GRAPH).length === 0) {
    if (request.intent === 'talk_context' || request.intent === 'talk_ambient' || request.intent === 'bark_ambient' || request.intent === 'rumor_flavor') {
      return {
        text: 'в онлайн версии общайся в чате нет сферы через N и играй с друзьями через /host /join',
        source: 'generated_markov',
        intent: request.intent,
        tags: [],
        fallbackUsed: true
      };
    }
  }

  const skeletons = COMPILED_SKELETONS.filter(s => s.intent === request.intent);
  if (skeletons.length === 0) {
    return {
      text: request.exactFallback || MARKOV_TEXT_DEFINITIONS.intentFallbacks[request.intent] || '...',
      source: 'generated_markov',
      intent: request.intent,
      tags: [],
      fallbackUsed: true
    };
  }

  let totalWeight = skeletons.reduce((sum, s) => sum + s.weight, 0);
  let r = rng() * totalWeight;
  let skeleton = skeletons[0];
  for (const s of skeletons) {
    r -= s.weight;
    if (r <= 0) {
      skeleton = s;
      break;
    }
  }

  const pattern = skeleton.pattern.map(p => `<${p}>`);
  const START_TOKEN = "<s>";
  const END_TOKEN = "</s>";
  const maxWords = 100;
  /* Без запроса длину держит не число, а конец предложения из корпуса. */
  const charBudget = request.maxChars && request.maxChars > 0 ? request.maxChars : Infinity;
  let spentChars = 0;

  /* Матрица компилируется на порядке 1: истории графа и ключи эвристики
     скелетов — одиночные токены. Рантайм собирал двухсловный ключ, поэтому
     не попадал ни в граф (там спасал откат), ни в COMPILED_PATTERN_DISTANCES
     (а там отката не было: промах давал ×0.01 всем кандидатам сразу, и
     скелет переставал вести генерацию вообще). */
  const currentSequence = [START_TOKEN];
  const result: string[] = [];

  const ctx = request.context || {};
  const ctxMask = buildContextTagMask(ctx);

  let patternIndex = 0;

  for (let step = 0; step < maxWords; step++) {
    const history = currentSequence[currentSequence.length - 1];
    const transitions = COMPILED_MARKOV_GRAPH[history];
    const entries = transitions ? Object.entries(transitions) : null;

    if (!entries || entries.length === 0) break;

    const candidates: { word: string, weight: number }[] = [];
    let tw = 0;

    while (patternIndex < pattern.length && !STEERABLE_TARGETS.has(pattern[patternIndex])) patternIndex++;
    const currentTarget = patternIndex < pattern.length ? pattern[patternIndex] : null;
    const targetDistMap = currentTarget ? COMPILED_PATTERN_DISTANCES[currentTarget] : null;

    for (const [nextWord, edge] of entries) {
      let weight = markovEdgeCount(edge);

      const overlap = bitCount(markovEdgeMask(edge) & ctxMask);
      if (overlap > 0) weight *= 1 + GRAPH_TAG_ALPHA * overlap;

      if (currentTarget && targetDistMap) {
        const dist = targetDistMap[nextWord];
        weight *= dist !== undefined ? Math.pow(SKELETON_GRADIENT, -dist) : SKELETON_OFF_PATH;
      }

      candidates.push({ word: nextWord, weight });
      tw += weight;
    }

    if (candidates.length === 0) break;

    let rw = rng() * tw;
    let chosenWord = END_TOKEN;
    for (const cand of candidates) {
      rw -= cand.weight;
      if (rw <= 0) {
        chosenWord = cand.word;
        break;
      }
    }

    if (chosenWord === END_TOKEN) {
      if (patternIndex < pattern.length) break;
      break;
    }

    result.push(chosenWord);
    currentSequence.push(chosenWord);
    spentChars += chosenWord.length + 1;

    if (currentTarget && chosenWord === currentTarget) {
      patternIndex++;
    }

    /* Скелет ведёт генерацию к своим целям и до их закрытия давит конец
       фразы (промах по эвристике — ×0.01, включая </s>). Поэтому останов
       здесь: скелет закрыт и корпус сам поставил точку — реплика целая.
       Исчерпав бюджет символов, снимаем ведение, иначе получатель дорежет
       строку по-живому. */
    if (patternIndex >= pattern.length && /^[.!?]$/.test(chosenWord)) break;
    if (spentChars >= charBudget) {
      if (patternIndex >= pattern.length) break;
      patternIndex = pattern.length;
    }
  }

  const resolvedResult = result.map(word => {
    if (word.startsWith('<') && word.endsWith('>')) {
      return resolveCategory(word, ctx, ctxMask);
    }
    return word;
  });

  let finalSentence = '';
  for (let i = 0; i < resolvedResult.length; i++) {
    const w = resolvedResult[i];
    if (/^[.,!?]$/.test(w)) {
      finalSentence += w;
    } else {
      if (finalSentence.length > 0) finalSentence += ' ';
      finalSentence += w;
    }
  }

  if (finalSentence.length > 0) {
    finalSentence = finalSentence.charAt(0).toUpperCase() + finalSentence.slice(1);
    if (!/[.,!?]$/.test(finalSentence)) finalSentence += '.';
    
    // Capitalize after end of sentence marks
    finalSentence = finalSentence.replace(/([.!?])\s+([a-zа-яё])/gi, (_, p1, p2) => {
      return p1 + ' ' + p2.toUpperCase();
    });
  }

  if (finalSentence.length === 0) {
    return {
      text: request.exactFallback || MARKOV_TEXT_DEFINITIONS.intentFallbacks[request.intent] || '...',
      source: 'generated_markov',
      intent: request.intent,
      tags: [],
      fallbackUsed: true
    };
  }

  return {
    text: finalSentence,
    source: 'generated_markov',
    intent: request.intent,
    templateId: skeleton.id,
    tags: [],
    fallbackUsed: false,
  };
}

export function validateMarkovTextData(): readonly string[] {
  // no-op for now to satisfy imports
  return [];
}
export const MARKOV_SLOT_ATOM_CAP = 8;
export { MARKOV_TEXT_DEFINITIONS } from '../data/markov_text';
