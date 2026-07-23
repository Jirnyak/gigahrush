/* ── Bounded deterministic Markov NPC text core ───────────────── */

import { rng } from '../core/rand';
import { randomName } from '../data/catalog';
import { MARKOV_TEXT_DEFINITIONS, MarkovIntent, MarkovSource } from '../data/markov_text';
import { COMPILED_SKELETONS, COMPILED_CATEGORIES, COMPILED_MARKOV_GRAPH, COMPILED_PATTERN_DISTANCES } from '../data/markov_compiled_matrix';
import { getFactionRelation } from './factions';

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

function resolveCategory(tag: string, ctx: MarkovTextContext | undefined): string {
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
        relation = getFactionRelation(ctx.faction!, fId);
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

  const pcaCtx = computePcaContext(ctx);
  const targetDanger = pcaCtx.pcaDanger;
  const targetWealth = pcaCtx.pcaWealth;
  const targetNeed = pcaCtx.pcaNeed;

  let bestMatches: any[] = [];
  let minDistance = Infinity;

  for (const item of items) {
    let itemDanger = 0, itemWealth = 0, itemNeed = 0;
    if (item.tags.includes('danger') || item.tags.includes('monster')) itemDanger = 0.8;
    if (item.tags.includes('wealth') || item.tags.includes('trade')) itemWealth = 0.8;
    if (item.tags.includes('need') || item.tags.includes('food')) itemNeed = 0.8;

    const d = Math.sqrt(
      Math.pow(itemDanger - targetDanger, 2) +
      Math.pow(itemWealth - targetWealth, 2) +
      Math.pow(itemNeed - targetNeed, 2)
    );

    if (d < minDistance) {
      minDistance = d;
      bestMatches = [item];
    } else if (Math.abs(d - minDistance) < 0.1) {
      bestMatches.push(item);
    }
  }

  const selected = bestMatches[Math.floor(rng() * bestMatches.length)];
  return selected ? selected.text : items[Math.floor(rng() * items.length)].text;
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
  const order = 2;
  const maxWords = 100;
  
  let currentSequence = Array(order).fill(START_TOKEN);
  const result: string[] = [];

  const activeTags = new Set<string>();
  const ctx = request.context || {};
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

  let patternIndex = 0;

  for (let step = 0; step < maxWords; step++) {
    let history = currentSequence.slice(-order).join(' ');
    let transitions = COMPILED_MARKOV_GRAPH[history];

    if (transitions && Object.keys(transitions).length === 1 && rng() < 0.25) {
      const fallbackHistory = currentSequence.slice(-1).join(' ');
      const fallbackTransitions = COMPILED_MARKOV_GRAPH[fallbackHistory];
      if (fallbackTransitions && Object.keys(fallbackTransitions).length > 1) {
        history = fallbackHistory;
        transitions = fallbackTransitions;
      }
    }

    if (!transitions || Object.keys(transitions).length === 0) {
      history = currentSequence.slice(-1).join(' ');
      transitions = COMPILED_MARKOV_GRAPH[history];
    }

    if (!transitions || Object.keys(transitions).length === 0) break;

    const candidates: { word: string, weight: number }[] = [];
    let tw = 0;

    const currentTarget = patternIndex < pattern.length ? pattern[patternIndex] : null;
    const targetDistMap = currentTarget ? COMPILED_PATTERN_DISTANCES[currentTarget] : null;

    for (const [nextWord, info] of Object.entries(transitions)) {
      let weight = info.count;

      let matchBoost = 1;
      for (const tag of Object.keys(info.tags || {})) {
        if (activeTags.has(tag)) {
          matchBoost += 15;
        }
      }
      weight *= matchBoost;

      if (currentTarget && targetDistMap) {
        const nextHistory = history.split(' ').slice(1).concat(nextWord).join(' ');
        const dist = targetDistMap[nextHistory];
        
        if (dist !== undefined) {
          weight *= (100 / (dist + 1));
        } else {
          weight *= 0.01;
        }
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

    if (currentTarget && chosenWord === currentTarget) {
      patternIndex++;
    }
  }

  const resolvedResult = result.map(word => {
    if (word.startsWith('<') && word.endsWith('>')) {
      return resolveCategory(word, ctx);
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
