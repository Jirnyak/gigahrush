/* ── Bounded deterministic Markov NPC text core ───────────────── */

import { SeedRng, hashSeed, shuffleWith } from '../core/rand';
import {
  MARKOV_SLOT_ATOM_CAP,
  MARKOV_TEXT_DEFINITIONS,
  type MarkovAtomClass,
  type MarkovAtomDef,
  type MarkovDomain,
  type MarkovIntent,
  type MarkovSource,
  type MarkovTemplate,
  type MarkovTemplatePart,
  type MarkovTextDefinitions,
} from '../data/markov_text';

export { MARKOV_SLOT_ATOM_CAP, MARKOV_TEXT_DEFINITIONS };
export type {
  MarkovAtomClass,
  MarkovAtomDef,
  MarkovDomain,
  MarkovIntent,
  MarkovSource,
  MarkovTemplate,
  MarkovTemplatePart,
  MarkovTextDefinitions,
} from '../data/markov_text';

export const MARKOV_MAX_OUTPUT_CHARS_TALK = 140;
export const MARKOV_MAX_OUTPUT_CHARS_BARK = 96;
export const MARKOV_MAX_OUTPUT_CHARS_DEMOS = 180;
export const MARKOV_SLOT_BEAM_WIDTH = 6;
export const MARKOV_SLOT_CANDIDATE_CAP = 8;
export const MARKOV_TEMPLATE_ATTEMPTS = 3;
export const MARKOV_CHAIN_ORDER_MAX = 3;

export interface MarkovTextContext {
  readonly actorId?: number;
  readonly actorAlifeId?: number;
  readonly targetId?: number;
  readonly targetAlifeId?: number;
  readonly floorKey?: string;
  readonly z?: number;
  readonly routeZBand?: 'center' | 'upper' | 'lower' | 'deep';
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
  // PCA numerical metrics for continuous vector scoring
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

const MARKOV_CLASSES = [
  'address',
  'place_ref',
  'need_ref',
  'event_ref',
  'item_ref',
  'faction_ref',
  'state_fact',
  'severity_ref',
  'order_marker',
  'action_advice',
  'action_ban',
  'trade_rule',
  'relation_fact',
  'terminal',
] as const satisfies readonly MarkovAtomClass[];

interface CompiledPack {
  readonly definitions: MarkovTextDefinitions;
  readonly domains: ReadonlyMap<string, CompiledDomain>;
  readonly templates: readonly MarkovTemplate[];
  readonly tagIds: ReadonlyMap<string, number>;
  readonly anchorIds: ReadonlyMap<string, number>;
  readonly classIds: ReadonlyMap<MarkovAtomClass, number>;
  readonly terminalClassMask: number;
}

interface CompiledDomain {
  readonly source: MarkovDomain;
  readonly id: string;
  readonly atomIds: ReadonlyMap<string, number>;
  readonly atomText: readonly string[];
  readonly atomClass: Uint8Array;
  readonly atomTagMask: Uint32Array;
  readonly atomAnchorMask: Uint32Array;
  readonly atomWeight: Uint16Array;
  readonly atomPcaDanger: Float32Array;
  readonly atomPcaWealth: Float32Array;
  readonly atomPcaNeed: Float32Array;
  readonly starts: Uint16Array;
  readonly terminalMask: Uint8Array;
  readonly transFrom: Uint32Array;
  readonly transTo: Uint16Array;
  readonly transWeight: Uint16Array;
  readonly classTransFrom: Uint16Array;
  readonly classTransTo: Uint8Array;
  readonly classTransWeight: Uint16Array;
  readonly atomsByClass: readonly (readonly number[])[];
  readonly unigramTotal: number;
  readonly bigram: ReadonlyMap<number, ReadonlyMap<number, number>>;
  readonly trigram: ReadonlyMap<number, ReadonlyMap<number, number>>;
  readonly classTransitions: ReadonlyMap<number, ReadonlyMap<number, number>>;
}

interface RenderedTemplate {
  readonly text: string;
  readonly domainId?: string;
  readonly atomIds: readonly number[];
  readonly anchorMask: number;
  readonly terminalOk: boolean;
}

interface SlotCandidate {
  readonly text: string;
  readonly atomIds: readonly number[];
  readonly anchorMask: number;
  readonly terminalOk: boolean;
  readonly score: number;
}

export interface PcaContext {
  readonly pcaDanger: number;
  readonly pcaWealth: number;
  readonly pcaNeed: number;
}

function clampFloat(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computePcaContext(context: MarkovTextContext | undefined): PcaContext {
  if (!context) {
    return { pcaDanger: 0.1, pcaWealth: 0.1, pcaNeed: 0.1 };
  }
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
    pcaDanger: clampFloat(danger, -1, 1),
    pcaWealth: clampFloat(wealth, -1, 1),
    pcaNeed: clampFloat(need, -1, 1),
  };
}

let compiledCache: CompiledPack | undefined;

export function generateMarkovText(request: SpeechRouterRequest): SpeechRouterResult {
  const source = request.source ?? 'generated_markov';
  const maxChars = resolveMaxChars(request);
  const baseTags = contextTags(request.context);

  if (source === 'locked_author_text' || request.intent === 'locked_author_text') {
    return {
      text: capText(request.lockedText || request.exactFallback || MARKOV_TEXT_DEFINITIONS.intentFallbacks.locked_author_text, maxChars),
      source: 'locked_author_text',
      intent: request.intent,
      tags: [...baseTags],
      fallbackUsed: false,
    };
  }

  const pack = getCompiledPack();
  if (source === 'curated_pool') {
    const curated = pickCuratedLine(pack, request, baseTags, maxChars);
    if (curated) return curated;
  }

  const contextMask = maskForTags(pack.tagIds, baseTags);
  const requiredAnchorMask = maskForTags(pack.anchorIds, request.context?.requiredAnchors ?? []);
  const seed = requestSeed(request, 'template');
  const rng = new SeedRng(seed);
  const pcaCtx = computePcaContext(request.context);
  const templates = rankTemplates(pack, request, baseTags, contextMask, requiredAnchorMask, source, rng, pcaCtx);

  for (let attempt = 0; attempt < MARKOV_TEMPLATE_ATTEMPTS; attempt++) {
    const template = pickWeighted(rng, templates, item => {
      const base = Math.max(1, item.score);
      const smoothed = Math.pow(base, 0.85);
      const fluctuation = 0.5 + rng.random() * 1.0;
      return smoothed * fluctuation;
    });
    if (!template) break;
    const rendered = renderTemplate(pack, template.template, request, rng, contextMask, requiredAnchorMask, pcaCtx);
    const validation = validateRuntimeText(rendered.text, maxChars, rendered.atomIds, rendered.anchorMask, requiredAnchorMask, rendered.terminalOk, pack);
    if (validation.length === 0) {
      return {
        text: rendered.text,
        source: template.template.source,
        intent: request.intent,
        templateId: template.template.id,
        domainId: rendered.domainId,
        tags: resultTags(baseTags, template.template, rendered.domainId, pack),
        fallbackUsed: false,
      };
    }
  }

  return fallbackResult(request, maxChars, baseTags, source);
}

export function validateMarkovTextData(definitions: MarkovTextDefinitions = MARKOV_TEXT_DEFINITIONS): readonly string[] {
  const errors: string[] = [];
  const classSet = new Set<MarkovAtomClass>(MARKOV_CLASSES);
  const terminalClasses = new Set<MarkovAtomClass>(definitions.terminalClasses);
  const domainIds = new Set<string>();
  const templateIds = new Set<string>();
  const atomIds = new Set<string>();
  const fallbackIntents = new Set(Object.keys(definitions.intentFallbacks) as MarkovIntent[]);
  const blacklist = [
    ...definitions.toneBlacklist,
    ...definitions.internalBlacklist,
    ...definitions.spoilerBlacklist,
  ];

  for (const intent of [
    'talk_ambient',
    'talk_context',
    'log_speech',
    'bark_ambient',
    'procedural_quest',
    'rumor_flavor',
    'demos_post',
    'demos_reaction',
    'locked_author_text',
    'document_flavor',
    'lore_note',
  ] as const satisfies readonly MarkovIntent[]) {
    if (!fallbackIntents.has(intent) || !definitions.intentFallbacks[intent]) {
      errors.push(`missing fallback for intent ${intent}`);
    }
    checkBlacklisted(`intent fallback ${intent}`, definitions.intentFallbacks[intent] ?? '', blacklist, errors);
  }

  for (const domain of definitions.domains) {
    if (domainIds.has(domain.id)) errors.push(`duplicate domain id ${domain.id}`);
    domainIds.add(domain.id);
    if (!domain.fallback) errors.push(`domain ${domain.id} missing fallback`);
    checkBlacklisted(`domain ${domain.id} fallback`, domain.fallback, blacklist, errors);
    if (domain.maxOrder < 1 || domain.maxOrder > MARKOV_CHAIN_ORDER_MAX) {
      errors.push(`domain ${domain.id} maxOrder out of range`);
    }
    if (!domain.atoms?.length) errors.push(`domain ${domain.id} has no atoms`);
    for (const atom of domain.atoms ?? []) {
      if (atomIds.has(atom.id)) errors.push(`duplicate atom id ${atom.id}`);
      atomIds.add(atom.id);
      if (!atom.class || !classSet.has(atom.class)) errors.push(`atom ${atom.id} has invalid class`);
      if (!atom.text.trim()) errors.push(`atom ${atom.id} has empty text`);
      checkBlacklisted(`atom ${atom.id}`, atom.text, blacklist, errors);
    }
    for (const line of domain.corpus) {
      if (line.domain !== domain.id) errors.push(`corpus ${line.id} points to ${line.domain}, expected ${domain.id}`);
      if (!domain.allowedIntents.includes(line.intent)) errors.push(`corpus ${line.id} intent ${line.intent} not allowed in ${domain.id}`);
      checkBlacklisted(`corpus ${line.id}`, line.text, blacklist, errors);
    }
  }

  for (const template of definitions.templates) {
    if (templateIds.has(template.id)) errors.push(`duplicate template id ${template.id}`);
    templateIds.add(template.id);
    if (!template.fallback) errors.push(`template ${template.id} missing fallback`);
    checkBlacklisted(`template ${template.id} fallback`, template.fallback, blacklist, errors);
    for (const domainId of template.domains) {
      if (!domainIds.has(domainId)) errors.push(`template ${template.id} references missing domain ${domainId}`);
    }
    for (const part of template.parts) {
      if (part.kind !== 'slot') continue;
      if (!domainIds.has(part.domain)) errors.push(`template ${template.id} slot references missing domain ${part.domain}`);
      if (part.minAtoms < 1 || part.maxAtoms < part.minAtoms || part.maxAtoms > MARKOV_SLOT_ATOM_CAP) {
        errors.push(`template ${template.id} slot atom range invalid`);
      }
      for (const path of part.allowedClassPaths) {
        if (path.length < part.minAtoms || path.length > part.maxAtoms) {
          errors.push(`template ${template.id} class path length invalid`);
        }
        for (const atomClass of path) {
          if (!classSet.has(atomClass)) errors.push(`template ${template.id} class path has invalid class ${atomClass}`);
        }
        const terminal = path[path.length - 1];
        if (!terminal || !terminalClasses.has(terminal)) {
          errors.push(`template ${template.id} class path does not reach terminal state`);
        }
      }
    }
  }

  return errors;
}

export function getCompiledPack(): CompiledPack {
  if (!compiledCache) compiledCache = compileMarkovText(MARKOV_TEXT_DEFINITIONS);
  return compiledCache;
}

function compileMarkovText(definitions: MarkovTextDefinitions): CompiledPack {
  const tagIds = new Map<string, number>();
  const anchorIds = new Map<string, number>();
  const classIds = new Map<MarkovAtomClass, number>();
  for (let i = 0; i < MARKOV_CLASSES.length; i++) classIds.set(MARKOV_CLASSES[i], i);
  collectDefinitionIds(definitions, tagIds, anchorIds);
  let terminalClassMask = 0;
  for (const atomClass of definitions.terminalClasses) {
    const id = classIds.get(atomClass);
    if (id !== undefined) terminalClassMask |= 1 << id;
  }

  const domains = new Map<string, CompiledDomain>();
  for (const domain of definitions.domains) {
    domains.set(domain.id, compileDomain(domain, tagIds, anchorIds, classIds, terminalClassMask));
  }
  return {
    definitions,
    domains,
    templates: definitions.templates,
    tagIds,
    anchorIds,
    classIds,
    terminalClassMask,
  };
}

function compileDomain(
  domain: MarkovDomain,
  tagIds: ReadonlyMap<string, number>,
  anchorIds: ReadonlyMap<string, number>,
  classIds: ReadonlyMap<MarkovAtomClass, number>,
  terminalClassMask: number,
): CompiledDomain {
  const atoms = domain.atoms ?? [];
  const atomIds = new Map<string, number>();
  const atomText = atoms.map(atom => atom.text);
  const atomClass = new Uint8Array(atoms.length);
  const atomTagMask = new Uint32Array(atoms.length);
  const atomAnchorMask = new Uint32Array(atoms.length);
  const atomWeight = new Uint16Array(atoms.length);
  const atomPcaDanger = new Float32Array(atoms.length);
  const atomPcaWealth = new Float32Array(atoms.length);
  const atomPcaNeed = new Float32Array(atoms.length);
  const atomsByClass: number[][] = Array.from({ length: MARKOV_CLASSES.length }, () => []);
  const starts = new Set<number>();
  const bigram = new Map<number, Map<number, number>>();
  const trigram = new Map<number, Map<number, number>>();
  const classTransitions = new Map<number, Map<number, number>>();

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    atomIds.set(atom.id, i);
    const classId = classIds.get(atom.class) ?? 0;
    atomClass[i] = classId;
    atomTagMask[i] = maskForTags(tagIds, atom.tags ?? []);
    atomAnchorMask[i] = atom.anchorKind ? maskForTags(anchorIds, [atom.anchorKind]) : 0;
    atomWeight[i] = clampWeight(atom.weight ?? 1);
    const d = atom.pcaDanger !== undefined ? atom.pcaDanger : (
      (atom.tags ?? []).some(t => ['danger', 'samosbor', 'monster', 'fear', 'combat', 'threat', 'panic'].includes(t)) ? 0.8 :
      (atom.tags ?? []).some(t => ['uneasy', 'warning'].includes(t)) ? 0.4 : 0.1
    );
    const w = atom.pcaWealth !== undefined ? atom.pcaWealth : (
      (atom.tags ?? []).some(t => ['trade', 'wealth', 'payday', 'fat', 'item', 'valuable', 'contract', 'production'].includes(t)) ? 0.8 :
      (atom.tags ?? []).some(t => ['shortage', 'broke', 'theft'].includes(t)) ? -0.5 : 0.1
    );
    const n = atom.pcaNeed !== undefined ? atom.pcaNeed : (
      (atom.tags ?? []).some(t => ['need', 'hunger', 'thirst', 'food', 'water', 'medical', 'wound'].includes(t)) ? 0.8 : 0.1
    );
    atomPcaDanger[i] = clampFloat(d, -1, 1);
    atomPcaWealth[i] = clampFloat(w, -1, 1);
    atomPcaNeed[i] = clampFloat(n, -1, 1);
    atomsByClass[classId].push(i);
  }

  for (const line of domain.corpus) {
    const path = corpusAtomPath(line.text, atoms);
    if (path.length > 0) addTransitionPath(path, line.weight ?? 1, starts, bigram, trigram, classTransitions, atomClass);
  }
  for (let i = 0; i < atoms.length; i++) {
    const classId = atomClass[i];
    if (isTerminalClassId(classId, terminalClassMask)) continue;
    starts.add(i);
  }

  const terminalMask = new Uint8Array(atoms.length);
  for (let i = 0; i < atoms.length; i++) terminalMask[i] = isTerminalClassId(atomClass[i], terminalClassMask) ? 1 : 0;
  const transitionArrays = compileTransitionArrays(bigram, trigram);
  const classArrays = compileClassTransitionArrays(classTransitions);
  return {
    source: domain,
    id: domain.id,
    atomIds,
    atomText,
    atomClass,
    atomTagMask,
    atomAnchorMask,
    atomWeight,
    atomPcaDanger,
    atomPcaWealth,
    atomPcaNeed,
    starts: Uint16Array.from([...starts].slice(0, 1024)),
    terminalMask,
    transFrom: transitionArrays.from,
    transTo: transitionArrays.to,
    transWeight: transitionArrays.weight,
    classTransFrom: classArrays.from,
    classTransTo: classArrays.to,
    classTransWeight: classArrays.weight,
    atomsByClass,
    unigramTotal: atomWeight.reduce((sum, weight) => sum + weight, 0),
    bigram,
    trigram,
    classTransitions,
  };
}

export function renderTemplate(
  pack: CompiledPack,
  template: MarkovTemplate,
  request: SpeechRouterRequest,
  rng: SeedRng,
  contextMask: number,
  requiredAnchorMask: number,
  pcaCtx?: PcaContext,
): RenderedTemplate {
  let out = '';
  let anchorMask = 0;
  let terminalOk = true;
  let domainId: string | undefined;
  const atomIds: number[] = [];

  for (const part of template.parts) {
    if (part.kind === 'literal') {
      out += part.text;
      continue;
    }
    if (part.kind === 'arg') {
      const value = resolveArg(part, request.context);
      out += value;
      if (part.anchor) anchorMask |= maskForTags(pack.anchorIds, [part.anchor]);
      continue;
    }
    const domain = pack.domains.get(part.domain);
    if (!domain) {
      terminalOk = false;
      out += template.fallback;
      continue;
    }
    const slotRequired = requiredAnchorMask | maskForTags(pack.anchorIds, part.requiredAnchors ?? []);
    const slot = generateSlot(domain, part, rng, contextMask, slotRequired, pcaCtx);
    out += slot.text;
    anchorMask |= slot.anchorMask;
    terminalOk = terminalOk && slot.terminalOk;
    atomIds.push(...slot.atomIds);
    domainId = domain.id;
  }

  return {
    text: normalizeText(out),
    domainId,
    atomIds,
    anchorMask,
    terminalOk,
  };
}

function generateSlot(
  domain: CompiledDomain,
  slot: Extract<MarkovTemplatePart, { kind: 'slot' }>,
  rng: SeedRng,
  contextMask: number,
  requiredAnchorMask: number,
  pcaCtx?: PcaContext,
): SlotCandidate {
  const candidates: SlotCandidate[] = [];
  const paths = [...slot.allowedClassPaths].sort((a, b) => b.length - a.length);
  const anchorClasses = requiredAnchorMask !== 0
    ? MARKOV_CLASSES.filter((_, idx) => (domain.atomsByClass[idx] ?? []).some(atomId => (domain.atomAnchorMask[atomId] & requiredAnchorMask) !== 0))
    : [];
  for (const path of paths) {
    if (path.length < slot.minAtoms || path.length > slot.maxAtoms) continue;
    if (requiredAnchorMask !== 0 && anchorClasses.length > 0 && !path.some(c => anchorClasses.includes(c))) {
      continue;
    }
    candidates.push(...generatePathCandidates(domain, path, contextMask, requiredAnchorMask, rng, pcaCtx));
    if (candidates.length >= MARKOV_SLOT_CANDIDATE_CAP * 4) break;
  }
  let validCandidates = requiredAnchorMask !== 0
    ? candidates.filter(c => (c.anchorMask & requiredAnchorMask) !== 0)
    : candidates;
  if (validCandidates.length === 0) validCandidates = candidates;
  shuffleWith(() => rng.random(), validCandidates);
  validCandidates.sort((a, b) => b.score - a.score);
  const bounded = validCandidates.slice(0, MARKOV_SLOT_CANDIDATE_CAP);
  const picked = pickWeighted(rng, bounded, candidate => {
    const base = Math.max(1, candidate.score);
    const smoothed = Math.pow(base, 0.75);
    const fluctuation = 0.5 + rng.random() * 1.0;
    return smoothed * fluctuation;
  });
  return picked ?? {
    text: domain.source.fallback,
    atomIds: [],
    anchorMask: 0,
    terminalOk: false,
    score: 1,
  };
}

function generatePathCandidates(
  domain: CompiledDomain,
  path: readonly MarkovAtomClass[],
  contextMask: number,
  requiredAnchorMask: number,
  rng: SeedRng,
  pcaCtx?: PcaContext,
): readonly SlotCandidate[] {
  let beams: SlotCandidate[] = [{ text: '', atomIds: [], anchorMask: 0, terminalOk: false, score: 1 }];
  for (const atomClass of path) {
    const classId = MARKOV_CLASSES.indexOf(atomClass);
    if (classId < 0) return [];
    const atoms = rankAtomsForClass(domain, classId, contextMask, requiredAnchorMask, rng, pcaCtx);
    if (atoms.length === 0) return [];
    const next: SlotCandidate[] = [];
    for (const beam of beams) {
      for (const atomId of atoms) {
        if (beam.atomIds[beam.atomIds.length - 1] === atomId) continue;
        const expandedIds = [...beam.atomIds, atomId];
        if (hasRepeatedBigram(expandedIds)) continue;
        const baseTScore = transitionScore(domain, beam.atomIds, atomId, contextMask, requiredAnchorMask, pcaCtx);
        const noise = rng.random() * 15;
        const score = beam.score + baseTScore + noise;
        next.push({
          text: joinAtoms(domain, expandedIds, rng),
          atomIds: expandedIds,
          anchorMask: beam.anchorMask | domain.atomAnchorMask[atomId],
          terminalOk: domain.terminalMask[atomId] === 1,
          score,
        });
      }
    }
    shuffleWith(() => rng.random(), next);
    next.sort((a, b) => b.score - a.score);
    beams = next.slice(0, MARKOV_SLOT_BEAM_WIDTH);
  }
  return beams;
}

function rankAtomsForClass(
  domain: CompiledDomain,
  classId: number,
  contextMask: number,
  requiredAnchorMask: number,
  rng: SeedRng,
  pcaCtx?: PcaContext,
): readonly number[] {
  const atoms = [...(domain.atomsByClass[classId] ?? [])];
  
  const scored = atoms.map(atomId => {
    const base = atomContextScore(domain, atomId, contextMask, requiredAnchorMask, pcaCtx);
    const noise = rng.random() * 20; 
    return { atomId, score: base + noise };
  });

  shuffleWith(() => rng.random(), scored);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MARKOV_SLOT_ATOM_CAP)
    .map(x => x.atomId);
}

function atomContextScore(domain: CompiledDomain, atomId: number, contextMask: number, requiredAnchorMask: number, pcaCtx?: PcaContext): number {
  let score = domain.atomWeight[atomId] || 1;
  score += bitCount(domain.atomTagMask[atomId] & contextMask) * 3;
  const anchor = domain.atomAnchorMask[atomId];
  if (anchor && (requiredAnchorMask === 0 || (anchor & requiredAnchorMask) !== 0)) score += 5;
  if (pcaCtx) {
    const dDiff = domain.atomPcaDanger[atomId] - pcaCtx.pcaDanger;
    const wDiff = domain.atomPcaWealth[atomId] - pcaCtx.pcaWealth;
    const nDiff = domain.atomPcaNeed[atomId] - pcaCtx.pcaNeed;
    const dist2 = dDiff * dDiff + wDiff * wDiff + nDiff * nDiff;
    score += Math.max(0, 10 - dist2 * 4);
  }
  return score;
}

function transitionScore(
  domain: CompiledDomain,
  path: readonly number[],
  nextAtom: number,
  contextMask: number,
  requiredAnchorMask: number,
  pcaCtx?: PcaContext,
): number {
  const prev1 = path[path.length - 1];
  const prev2 = path[path.length - 2];
  if (prev2 !== undefined && prev1 !== undefined) {
    const weight = domain.trigram.get(encodePair(prev2, prev1))?.get(nextAtom);
    if (weight !== undefined) return 18 + weight + atomContextScore(domain, nextAtom, contextMask, requiredAnchorMask, pcaCtx);
  }
  if (prev1 !== undefined) {
    const weight = domain.bigram.get(prev1)?.get(nextAtom);
    if (weight !== undefined) return 12 + weight + atomContextScore(domain, nextAtom, contextMask, requiredAnchorMask, pcaCtx);
    const classWeight = domain.classTransitions.get(domain.atomClass[prev1])?.get(domain.atomClass[nextAtom]);
    if (classWeight !== undefined) return 7 + classWeight + atomContextScore(domain, nextAtom, contextMask, requiredAnchorMask, pcaCtx);
  }
  const total = Math.max(1, domain.unigramTotal);
  return 1 + (domain.atomWeight[nextAtom] / total) * 6 + atomContextScore(domain, nextAtom, contextMask, requiredAnchorMask, pcaCtx);
}

function templateCanSatisfyAnchors(pack: CompiledPack, template: MarkovTemplate, requiredAnchorMask: number): boolean {
  if (requiredAnchorMask === 0) return true;
  if (template.requiredAnchors && (maskForTags(pack.anchorIds, template.requiredAnchors) & requiredAnchorMask) !== 0) return true;
  for (const part of template.parts) {
    if (part.kind === 'arg' && part.anchor && (maskForTags(pack.anchorIds, [part.anchor]) & requiredAnchorMask) !== 0) return true;
    if (part.kind === 'slot') {
      const domain = pack.domains.get(part.domain);
      if (domain && domain.atomsByClass.some(ids => ids.some(id => (domain.atomAnchorMask[id] & requiredAnchorMask) !== 0))) {
        return true;
      }
    }
  }
  return false;
}

export function rankTemplates(
  pack: CompiledPack,
  request: SpeechRouterRequest,
  tags: ReadonlySet<string>,
  contextMask: number,
  requiredAnchorMask: number,
  source: MarkovSource,
  rng: SeedRng,
  pcaCtx?: PcaContext,
): readonly { readonly template: MarkovTemplate; readonly score: number }[] {
  const ranked: { template: MarkovTemplate; score: number }[] = [];
  const isTalkRequest = request.intent === 'talk_context' || request.intent === 'talk_ambient';
  for (const template of pack.templates) {
    const intentMatch = template.intent === request.intent || (isTalkRequest && (template.intent === 'talk_context' || template.intent === 'talk_ambient'));
    if (!intentMatch) continue;
    if (source !== 'generated_markov' && template.source !== source) continue;
    if (template.source !== 'generated_markov') continue;
    if (!allTagsPresent(tags, template.requiredTags ?? [])) continue;
    if (anyTagsPresent(tags, template.blockedTags ?? [])) continue;
    if (!templateCanSatisfyAnchors(pack, template, requiredAnchorMask)) continue;
    const domainScore = template.domains.reduce((sum, domainId) => {
      const domain = pack.domains.get(domainId);
      return sum + (domain ? bitCount(maskForTags(pack.tagIds, domain.source.tags) & contextMask) : 0);
    }, 0);
    const anchorScore = requiredAnchorMask && template.requiredAnchors
      ? bitCount(maskForTags(pack.anchorIds, template.requiredAnchors) & requiredAnchorMask) * 5
      : 0;
    let pcaScore = 0;
    if (pcaCtx) {
      if (pcaCtx.pcaDanger > 0.5 && template.requiredTags?.includes('danger')) pcaScore += 3;
      if (pcaCtx.pcaWealth > 0.5 && template.requiredTags?.includes('wealth')) pcaScore += 3;
      if (pcaCtx.pcaNeed > 0.5 && template.requiredTags?.includes('need')) pcaScore += 3;
    }
    if (isTalkRequest && template.intent === request.intent) pcaScore += 2;
    ranked.push({
      template,
      score: Math.max(1, template.weight + (template.scoreBias ?? 0) + domainScore * 2 + anchorScore + pcaScore),
    });
  }
  shuffleWith(() => rng.random(), ranked);
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, MARKOV_SLOT_BEAM_WIDTH);
}

function pickCuratedLine(
  pack: CompiledPack,
  request: SpeechRouterRequest,
  tags: ReadonlySet<string>,
  maxChars: number,
): SpeechRouterResult | undefined {
  const candidates: { text: string; domainId: string; score: number }[] = [];
  const isTalkRequest = request.intent === 'talk_context' || request.intent === 'talk_ambient';
  for (const domain of pack.domains.values()) {
    for (const line of domain.source.corpus) {
      const intentMatch = line.intent === request.intent || (isTalkRequest && (line.intent === 'talk_context' || line.intent === 'talk_ambient'));
      if (!intentMatch) continue;
      if (line.text.length > maxChars) continue;
      const score = 1 + countMatchingTags(tags, line.contextTags ?? []);
      candidates.push({ text: line.text, domainId: domain.id, score });
    }
  }
  const rng = new SeedRng(requestSeed(request, 'curated'));
  shuffleWith(() => rng.random(), candidates);
  const picked = pickWeighted(rng, candidates.sort((a, b) => b.score - a.score).slice(0, MARKOV_SLOT_CANDIDATE_CAP), item => item.score);
  if (!picked) return undefined;
  return {
    text: picked.text,
    source: 'curated_pool',
    intent: request.intent,
    domainId: picked.domainId,
    tags: [...tags],
    fallbackUsed: false,
  };
}

export function validateRuntimeText(
  text: string,
  maxChars: number,
  atomIds: readonly number[],
  anchorMask: number,
  requiredAnchorMask: number,
  terminalOk: boolean,
  pack: CompiledPack,
): readonly string[] {
  const errors: string[] = [];
  if (!text.trim()) errors.push('empty output');
  if (text.length > maxChars) errors.push('output exceeds max chars');
  if (/\{[^}]+\}/.test(text)) errors.push('unresolved slot');
  if (!terminalOk) errors.push('class path did not reach terminal');
  if (requiredAnchorMask !== 0 && (anchorMask & requiredAnchorMask) === 0) errors.push('missing required anchor');
  const tokens = textTokens(text);
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1]) errors.push('adjacent repeated token');
  }
  if (hasRepeatedBigram(tokens)) errors.push('repeated bigram loop');
  if (hasRepeatedBigram(atomIds)) errors.push('repeated atom bigram loop');
  checkBlacklisted('runtime output', text, [
    ...pack.definitions.toneBlacklist,
    ...pack.definitions.internalBlacklist,
    ...pack.definitions.spoilerBlacklist,
  ], errors);
  return errors;
}

function fallbackResult(
  request: SpeechRouterRequest,
  maxChars: number,
  tags: ReadonlySet<string>,
  source: MarkovSource,
): SpeechRouterResult {
  return {
    text: capText(request.exactFallback || MARKOV_TEXT_DEFINITIONS.intentFallbacks[request.intent] || MARKOV_TEXT_DEFINITIONS.intentFallbacks.talk_context, maxChars),
    source,
    intent: request.intent,
    tags: [...tags],
    fallbackUsed: true,
  };
}

function contextTags(context: MarkovTextContext | undefined): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const tag of context?.tags ?? []) {
    tags.add(tag);
    const dot = tag.indexOf('.');
    if (dot > 0) tags.add(tag.slice(0, dot));
  }
  if (context?.roomDefId !== undefined || context?.roomType !== undefined) tags.add('room');
  if (context?.itemId || context?.itemName) tags.add('item');
  if (context?.eventId !== undefined || context?.eventType) tags.add('event');
  if (context?.faction !== undefined || context?.zoneFaction !== undefined) tags.add('faction');
  if (context?.occupation !== undefined) tags.add('work');
  if (context?.relationBand) {
    tags.add('relation');
    tags.add(`relation.${context.relationBand}`);
  }
  if (context?.needBand && context.needBand !== 'ok') {
    tags.add('need');
    tags.add(`need.${context.needBand}`);
  }
  if (context?.dangerBand && context.dangerBand !== 'quiet') {
    tags.add('danger');
    tags.add(`danger.${context.dangerBand}`);
  }
  if (context?.wealthBand) {
    tags.add('trade');
    tags.add(`wealth.${context.wealthBand}`);
  }
  if (context?.routeZBand) tags.add(`route.${context.routeZBand}`);
  return tags;
}

export function requestSeed(request: SpeechRouterRequest, salt: string): number {
  const context = request.context;
  const parts = [
    salt,
    request.intent,
    request.source ?? 'generated_markov',
    request.seed ?? context?.seed ?? 0,
    request.repeatIndex ?? 0,
    context?.actorAlifeId ?? context?.actorId ?? 0,
    context?.targetAlifeId ?? context?.targetId ?? 0,
    context?.floorKey ?? context?.z ?? '',
    context?.roomType ?? '',
    context?.zoneId ?? '',
    context?.faction ?? '',
    context?.occupation ?? '',
    context?.relationBand ?? '',
    context?.needBand ?? '',
    context?.dangerBand ?? '',
    context?.wealthBand ?? '',
    context?.itemId ?? context?.itemName ?? '',
    context?.monsterKind ?? '',
    context?.eventType ?? '',
    context?.eventId ?? '',
    [...contextTags(context)].sort().join(','),
  ];
  return hashSeed(parts.join('|'));
}

function resolveMaxChars(request: SpeechRouterRequest): number {
  if (request.maxChars !== undefined && Number.isFinite(request.maxChars)) return Math.max(16, Math.floor(request.maxChars));
  switch (request.intent) {
    case 'bark_ambient':
      return MARKOV_MAX_OUTPUT_CHARS_BARK;
    case 'demos_post':
    case 'demos_reaction':
      return MARKOV_MAX_OUTPUT_CHARS_DEMOS;
    default:
      return MARKOV_MAX_OUTPUT_CHARS_TALK;
  }
}

function resolveArg(part: Extract<MarkovTemplatePart, { kind: 'arg' }>, context: MarkovTextContext | undefined): string {
  const fromArgs = context?.args?.[part.key];
  if (fromArgs !== undefined) return String(fromArgs).slice(0, 64);
  switch (part.key) {
    case 'roomDefId': return context?.roomDefId ?? part.fallback;
    case 'itemName': return context?.itemName ?? part.fallback;
    case 'eventType': return context?.eventType ?? part.fallback;
    case 'floorKey': return context?.floorKey ?? part.fallback;
    default: return part.fallback;
  }
}

function collectDefinitionIds(
  definitions: MarkovTextDefinitions,
  tagIds: Map<string, number>,
  anchorIds: Map<string, number>,
): void {
  for (const domain of definitions.domains) {
    addIds(tagIds, domain.tags);
    for (const atom of domain.atoms ?? []) {
      addIds(tagIds, atom.tags ?? []);
      if (atom.anchorKind) addIds(anchorIds, [atom.anchorKind]);
    }
    for (const line of domain.corpus) {
      addIds(tagIds, line.styleTags ?? []);
      addIds(tagIds, line.contextTags ?? []);
      addIds(anchorIds, line.anchorKinds ?? []);
    }
  }
  for (const template of definitions.templates) {
    addIds(tagIds, template.requiredTags ?? []);
    addIds(tagIds, template.blockedTags ?? []);
    addIds(anchorIds, template.requiredAnchors ?? []);
    for (const part of template.parts) {
      if (part.kind === 'arg' && part.anchor) addIds(anchorIds, [part.anchor]);
      if (part.kind === 'slot') addIds(anchorIds, part.requiredAnchors ?? []);
    }
  }
}

function addIds(ids: Map<string, number>, values: readonly string[]): void {
  for (const value of values) {
    if (!ids.has(value)) ids.set(value, ids.size);
  }
}

function corpusAtomPath(line: string, atoms: readonly MarkovAtomDef[]): readonly number[] {
  const lower = line.toLocaleLowerCase('ru-RU');
  const hits: { index: number; atomId: number }[] = [];
  for (let i = 0; i < atoms.length; i++) {
    const index = lower.indexOf(atoms[i].text.toLocaleLowerCase('ru-RU'));
    if (index >= 0) hits.push({ index, atomId: i });
  }
  hits.sort((a, b) => a.index - b.index || a.atomId - b.atomId);
  const out: number[] = [];
  for (const hit of hits) {
    if (out[out.length - 1] !== hit.atomId) out.push(hit.atomId);
  }
  return out;
}

function addTransitionPath(
  path: readonly number[],
  weight: number,
  starts: Set<number>,
  bigram: Map<number, Map<number, number>>,
  trigram: Map<number, Map<number, number>>,
  classTransitions: Map<number, Map<number, number>>,
  atomClass: Uint8Array,
): void {
  if (path.length === 0) return;
  starts.add(path[0]);
  for (let i = 1; i < path.length; i++) {
    addWeightedEdge(bigram, path[i - 1], path[i], weight);
    addWeightedEdge(classTransitions, atomClass[path[i - 1]], atomClass[path[i]], weight);
    if (i >= 2) addWeightedEdge(trigram, encodePair(path[i - 2], path[i - 1]), path[i], weight);
  }
}

function addWeightedEdge(map: Map<number, Map<number, number>>, from: number, to: number, weight: number): void {
  let inner = map.get(from);
  if (!inner) {
    inner = new Map();
    map.set(from, inner);
  }
  inner.set(to, (inner.get(to) ?? 0) + clampWeight(weight));
}

function compileTransitionArrays(
  bigram: ReadonlyMap<number, ReadonlyMap<number, number>>,
  trigram: ReadonlyMap<number, ReadonlyMap<number, number>>,
): { from: Uint32Array; to: Uint16Array; weight: Uint16Array } {
  const from: number[] = [];
  const to: number[] = [];
  const weight: number[] = [];
  for (const [key, edges] of bigram) {
    for (const [target, value] of edges) {
      from.push(key);
      to.push(target);
      weight.push(clampWeight(value));
    }
  }
  for (const [key, edges] of trigram) {
    for (const [target, value] of edges) {
      from.push(key);
      to.push(target);
      weight.push(clampWeight(value));
    }
  }
  return { from: Uint32Array.from(from), to: Uint16Array.from(to), weight: Uint16Array.from(weight) };
}

function compileClassTransitionArrays(
  classTransitions: ReadonlyMap<number, ReadonlyMap<number, number>>,
): { from: Uint16Array; to: Uint8Array; weight: Uint16Array } {
  const from: number[] = [];
  const to: number[] = [];
  const weight: number[] = [];
  for (const [key, edges] of classTransitions) {
    for (const [target, value] of edges) {
      from.push(key);
      to.push(target);
      weight.push(clampWeight(value));
    }
  }
  return { from: Uint16Array.from(from), to: Uint8Array.from(to), weight: Uint16Array.from(weight) };
}

function joinAtoms(domain: CompiledDomain, atomIds: readonly number[], rng?: SeedRng): string {
  let out = '';
  for (let i = 0; i < atomIds.length; i++) {
    const text = domain.atomText[atomIds[i]];
    if (!text) continue;
    if (!out) {
      out = text;
      continue;
    }
    const atomClass = MARKOV_CLASSES[domain.atomClass[atomIds[i]]];
    let sep = ', ';
    const roll = rng ? rng.random() : ((atomIds[i] * 31 + i) % 10) / 10;
    if (atomClass === 'action_advice' || atomClass === 'action_ban' || atomClass === 'trade_rule' || atomClass === 'terminal' || atomClass === 'relation_fact') {
      sep = roll < 0.25 ? ' — ' : roll < 0.45 ? '; ' : '. ';
    } else {
      sep = roll < 0.2 ? ' — ' : roll < 0.35 ? ': ' : ', ';
    }
    out += sep + text;
  }
  return normalizeText(out);
}

function normalizeText(input: string): string {
  const compact = input
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([.!?])\s*([а-яё])/g, (_match, stop: string, char: string) => `${stop} ${char.toLocaleUpperCase('ru-RU')}`)
    .trim();
  if (!compact) return compact;
  const first = compact.charAt(0).toLocaleUpperCase('ru-RU') + compact.slice(1);
  return /[.!?]$/.test(first) ? first : `${first}.`;
}

function capText(text: string, maxChars: number): string {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;
  const sliced = normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd();
  return /[.!?]$/.test(sliced) ? sliced : `${sliced}.`;
}

function textTokens(text: string): readonly string[] {
  return text
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hasRepeatedBigram<T>(items: readonly T[]): boolean {
  const counts = new Map<string, number>();
  for (let i = 1; i < items.length; i++) {
    const key = `${String(items[i - 1])}\u0001${String(items[i])}`;
    const count = (counts.get(key) ?? 0) + 1;
    if (count > 2) return true;
    counts.set(key, count);
  }
  return false;
}

function resultTags(
  baseTags: ReadonlySet<string>,
  template: MarkovTemplate,
  domainId: string | undefined,
  pack: CompiledPack,
): readonly string[] {
  const tags = new Set(baseTags);
  for (const tag of template.requiredTags ?? []) tags.add(tag);
  if (domainId) {
    for (const tag of pack.domains.get(domainId)?.source.tags ?? []) tags.add(tag);
  }
  return [...tags];
}

function allTagsPresent(tags: ReadonlySet<string>, required: readonly string[]): boolean {
  for (const tag of required) {
    if (!tags.has(tag)) return false;
  }
  return true;
}

function anyTagsPresent(tags: ReadonlySet<string>, blocked: readonly string[]): boolean {
  for (const tag of blocked) {
    if (tags.has(tag)) return true;
  }
  return false;
}

function countMatchingTags(tags: ReadonlySet<string>, values: readonly string[]): number {
  let count = 0;
  for (const value of values) if (tags.has(value)) count++;
  return count;
}

export function maskForTags(ids: ReadonlyMap<string, number>, tags: readonly string[] | ReadonlySet<string>): number {
  let mask = 0;
  for (const tag of tags) {
    const id = ids.get(tag);
    if (id !== undefined) mask |= 1 << (id & 31);
  }
  return mask >>> 0;
}

function bitCount(value: number): number {
  let v = value >>> 0;
  let count = 0;
  while (v) {
    v &= v - 1;
    count++;
  }
  return count;
}

function encodePair(a: number, b: number): number {
  return ((a + 1) << 12) | (b + 1);
}

function isTerminalClassId(classId: number, terminalClassMask: number): boolean {
  return (terminalClassMask & (1 << classId)) !== 0;
}

function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 1;
  return Math.max(1, Math.min(65535, Math.round(weight)));
}

export function pickWeighted<T>(rng: SeedRng, items: readonly T[], weightOf: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  let total = 0;
  for (const item of items) total += Math.max(0, weightOf(item));
  if (total <= 0) return items[0];
  let roll = rng.random() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function checkBlacklisted(label: string, text: string, blacklist: readonly string[], errors: string[]): void {
  const lower = text.toLocaleLowerCase('ru-RU');
  for (const word of blacklist) {
    if (word && lower.includes(word.toLocaleLowerCase('ru-RU'))) {
      errors.push(`${label} contains forbidden word ${word}`);
    }
  }
}
