/* ── Markov dialogue adapter: ordinary NPC talk only ──────────── */

import { Faction, FloorLevel, type Entity, Occupation, type QuestType, RoomType } from '../core/types';
import {
  FACTION_LINES,
  GENERAL_LINES,
  MEDICAL_ROOM_LINES,
  MINISTRY_CLERK_LINES,
  MINISTRY_OCC_LINES,
  OCC_LINES,
  OLD_WORLD_MEMORY_LINES,
  ROOM_MEMORY_COMBAT_LINES,
  ROOM_MEMORY_HELP_LINES,
  ROOM_MEMORY_REPAIR_LINES,
  ROOM_MEMORY_SAMOSBOR_LINES,
  ROOM_MEMORY_THEFT_LINES,
} from '../data/dialogue';
import {
  CONTEXT_ACTIVE_CONTRACT_LINES,
  CONTEXT_DANGEROUS_ZONE_LINES,
  CONTEXT_FACTION_EVENT_FACTION_LINES,
  CONTEXT_FACTION_EVENT_LINES,
  CONTEXT_FACTION_LINES,
  CONTEXT_HIGH_TRUST_LINES,
  CONTEXT_HUNGER_LINES,
  CONTEXT_LIFT_ANOMALY_FLOOR_LINES,
  CONTEXT_LIFT_ANOMALY_LINES,
  CONTEXT_LOW_TRUST_LINES,
  CONTEXT_MONSTER_KILL_FLOOR_LINES,
  CONTEXT_MONSTER_KILL_LINES,
  CONTEXT_NEAR_CONTAINER_LINES,
  CONTEXT_OCCUPATION_LINES,
  CONTEXT_PRODUCTION_LINES,
  CONTEXT_PRODUCTION_OUTPUT_LINES,
  CONTEXT_PRODUCTION_SHORTAGE_LINES,
  CONTEXT_REPEATED_HELP_LINES,
  CONTEXT_SAFE_OWN_ZONE_LINES,
  CONTEXT_SAMOSBOR_AFTER_LINES,
  CONTEXT_SAMOSBOR_WARNING_LINES,
  CONTEXT_STOLEN_GOODS_LINES,
  CONTEXT_THIRST_LINES,
  CONTEXT_THEFT_FEAR_LINES,
  CONTEXT_WOUND_LINES,
} from '../data/context_lines';
import { getNpcStateText } from './ai/npc_state_text';
import { type ContextSnapshot } from './context';
import { type NpcMemory } from './npc_memory';
import {
  npcPackageSpeechContextTags,
  resolveNpcPackageForEntity,
  selectNpcCuratedFallback,
  type NpcSpeechPackageView,
} from './npc_package_speech';
import { occupationHasAnyProfileTag, occupationHasProfileTag } from '../data/occupation_profiles';

export type MarkovAdapterIntent =
  | 'talk_context'
  | 'talk_ambient'
  | 'rumor_flavor'
  | 'procedural_quest'
  | 'locked_author_text';

export type MarkovAdapterSource = 'generated_markov' | 'curated_pool' | 'locked_author_text';

export interface MarkovAdapterTextContext {
  actorId?: number;
  actorAlifeId?: number;
  targetId?: number;
  targetAlifeId?: number;
  floor?: FloorLevel;
  roomType?: RoomType;
  roomName?: string;
  zoneId?: number;
  faction?: Faction;
  occupation?: Occupation;
  needBand?: 'ok' | 'low' | 'urgent';
  dangerBand?: 'quiet' | 'uneasy' | 'threat' | 'combat' | 'panic';
  eventType?: string;
  eventId?: number;
  itemId?: string;
  itemName?: string;
  monsterKind?: number;
  questId?: number;
  questType?: QuestType;
  contractId?: string;
  tags: readonly string[];
}

export interface MarkovAdapterSpeechRequest {
  intent: MarkovAdapterIntent;
  source?: MarkovAdapterSource;
  context: MarkovAdapterTextContext;
  lockedText?: string;
  exactFallback?: string;
  repeatIndex?: number;
  maxChars?: number;
  seed?: number | string;
}

export interface MarkovAdapterSpeechResult {
  text: string;
  source: MarkovAdapterSource;
  intent: MarkovAdapterIntent;
  templateId?: string;
  domainId?: string;
  tags: readonly string[];
  fallbackUsed: boolean;
}

export type MarkovRouteSpeech = (request: MarkovAdapterSpeechRequest) => MarkovAdapterSpeechResult | undefined;

export interface MarkovDialogueOptions {
  memory?: NpcMemory;
  lockedText?: string;
  exactFallback?: string;
  seed?: number | string;
  repeatIndex?: number;
  time?: number;
  maxChars?: number;
  routeSpeech?: MarkovRouteSpeech;
}

const DEFAULT_MAX_TALK_CHARS = 140;

export function renderMarkovDialogueTalk(
  npc: Entity,
  snapshot: ContextSnapshot,
  options: MarkovDialogueOptions = {},
): MarkovAdapterSpeechResult {
  const locked = cleanLine(options.lockedText);
  if (locked) {
    return {
      text: locked,
      source: 'locked_author_text',
      intent: 'locked_author_text',
      tags: ['locked_author_text'],
      fallbackUsed: false,
    };
  }

  const memory = options.memory ?? minimalMemory(npc, options.time ?? 0);
  const seed = options.seed ?? npc.alifeId ?? npc.id;
  const intent: MarkovAdapterIntent = hasContextAnchor(snapshot) ? 'talk_context' : 'talk_ambient';
  const pack = resolveNpcPackageForEntity(npc);
  const packageFallback = pack ? selectNpcCuratedFallback(pack, intent, seed) : undefined;
  const exactFallback = cleanLine(options.exactFallback)
    ?? packageFallback
    ?? fallbackTalkLine(npc, snapshot, memory, seed, options.repeatIndex ?? 0);
  const context = dialogueContext(npc, snapshot, memory, pack);
  const maxChars = options.maxChars ?? DEFAULT_MAX_TALK_CHARS;
  const request: MarkovAdapterSpeechRequest = {
    intent,
    source: 'generated_markov',
    context,
    exactFallback,
    repeatIndex: options.repeatIndex,
    maxChars,
    seed,
  };

  const routed = options.routeSpeech?.(request);
  if (routed && validDialogueText(routed.text, context, maxChars)) {
    return { ...routed, intent, tags: routed.tags.length ? routed.tags : context.tags, fallbackUsed: false };
  }

  const generated = generateGroundedTalk(npc, snapshot, memory, seed, options.repeatIndex ?? 0, maxChars);
  if (generated) {
    return {
      text: generated,
      source: 'generated_markov',
      intent,
      templateId: intent === 'talk_context' ? 'dialogue_context_anchor' : 'dialogue_ambient_anchor',
      domainId: 'ordinary_dialogue',
      tags: context.tags,
      fallbackUsed: false,
    };
  }

  return {
    text: exactFallback,
    source: 'curated_pool',
    intent,
    domainId: 'ordinary_dialogue',
    tags: context.tags,
    fallbackUsed: true,
  };
}

export function generateMarkovDialogueText(
  npc: Entity,
  snapshot: ContextSnapshot,
  options: MarkovDialogueOptions = {},
): string {
  return renderMarkovDialogueTalk(npc, snapshot, options).text;
}

function dialogueContext(
  npc: Entity,
  snapshot: ContextSnapshot,
  memory: NpcMemory,
  pack: NpcSpeechPackageView | undefined,
): MarkovAdapterTextContext {
  const tags: string[] = ['dialogue', 'ordinary_npc'];
  if (pack) tags.push(...npcPackageSpeechContextTags(pack, npc, 'dialogue'));
  if (snapshot.roomName) tags.push('room');
  if (snapshot.isHungry) tags.push('need.food');
  if (snapshot.isThirsty) tags.push('need.water');
  if (snapshot.isWounded || snapshot.isCritical) tags.push('need.medical');
  if (snapshot.samosborActive || snapshot.hasRecentSamosborWarning) tags.push('danger.samosbor');
  if (snapshot.isDangerousZone) tags.push('danger.zone');
  if (snapshot.nearbyContainer) tags.push('container');
  if (snapshot.nearbyProduction) tags.push('production');
  if (snapshot.hasActiveContract) tags.push('contract');
  if (memory.trustPlayer > 35) tags.push('relation.warm');
  if (memory.trustPlayer < -20 || memory.fear > 45) tags.push('relation.cold');

  return {
    actorId: npc.id,
    actorAlifeId: npc.alifeId,
    floor: snapshot.floor,
    roomType: snapshot.roomType,
    roomName: snapshot.roomName,
    zoneId: snapshot.zoneId,
    faction: snapshot.npcFaction ?? npc.faction,
    occupation: snapshot.npcOccupation as Occupation | undefined,
    needBand: snapshot.isCritical || snapshot.isHungry || snapshot.isThirsty ? 'urgent' : snapshot.isWounded ? 'low' : 'ok',
    dangerBand: snapshot.samosborActive ? 'panic' : snapshot.isDangerousZone ? 'threat' : snapshot.hasRecentSamosborWarning ? 'uneasy' : 'quiet',
    tags,
  };
}

function generateGroundedTalk(
  npc: Entity,
  snapshot: ContextSnapshot,
  memory: NpcMemory,
  seed: number | string,
  repeatIndex: number,
  maxChars: number,
): string | undefined {
  const anchor = dialogueAnchor(snapshot);
  if (!anchor) return undefined;
  const advice = dialogueAdvice(snapshot, memory, npc);
  const address = npc.name && seededChance(seed, repeatIndex, 'address', 0.22) ? `${npc.name}: ` : '';
  const templates = [
    `${address}${anchor}. ${advice}`,
    `${address}${advice} ${anchor}.`,
    `${address}${anchor}; ${advice.charAt(0).toLowerCase()}${advice.slice(1)}`,
  ];
  const text = cleanLine(pickSeeded(templates, seed, repeatIndex, 'dialogue-template'));
  if (!text || text.length > maxChars || !text.includes(anchor)) return undefined;
  return text;
}

function dialogueAnchor(snapshot: ContextSnapshot): string | undefined {
  if (snapshot.roomName) return snapshot.roomName;
  if (snapshot.zoneId !== undefined) return `зона ${snapshot.zoneId + 1}`;
  if (snapshot.floor !== undefined) return floorName(snapshot.floor);
  return undefined;
}

function dialogueAdvice(snapshot: ContextSnapshot, memory: NpcMemory, npc: Entity): string {
  if (snapshot.isCritical || snapshot.isWounded) return 'сначала бинт и стол, потом разговор';
  if (snapshot.isHungry) return 'сначала еда, потом очередь и поручения';
  if (snapshot.isThirsty) return 'воду держи ближе карты';
  if (snapshot.samosborActive || snapshot.hasRecentSamosborWarning) return 'держись у гермы и не спорь с сиреной';
  if (snapshot.hasRecentSamosborAftermath) return 'после отбоя сначала проверяют дверь и список';
  if (snapshot.isDangerousZone) return 'магазин проверь до двери, не после';
  if (snapshot.nearbyContainer) return 'у ящика сначала спроси хозяина или свидетеля';
  if (snapshot.nearbyProduction) return 'если станок молчит, завтра заговорит кладовщик';
  if (snapshot.hasActiveContract) return 'задание в журнале тяжелее пустого разговора';
  if (memory.trustPlayer > 35) return 'тебе скажу прямо, без лишнего окна';
  if (memory.trustPlayer < -20 || memory.fear > 45) return 'руки держи на виду';
  if (occupationHasProfileTag(npc.occupation, 'medical')) return 'медпункт любит чистые руки и короткие жалобы';
  if (occupationHasProfileTag(npc.occupation, 'repair')) return 'сухой шов держит лучше обещаний';
  if (npc.faction === Faction.LIQUIDATOR) return 'сначала доклад, потом выстрел, потом отход';
  return 'разговор короткий, пока очередь не сдвинулась';
}

function fallbackTalkLine(
  npc: Entity,
  snapshot: ContextSnapshot,
  memory: NpcMemory,
  seed: number | string,
  repeatIndex: number,
): string {
  const contextLine = pickContextLine(snapshot, memory, seed, repeatIndex);
  if (contextLine) return contextLine;

  if (npc.ai?.npcState !== undefined && seededChance(seed, repeatIndex, 'npc-state', 0.4)) {
    return getNpcStateText(npc.ai.npcState);
  }

  const lines: string[] = [...GENERAL_LINES];
  if (snapshot.floor === FloorLevel.MINISTRY) {
    lines.push(...MINISTRY_CLERK_LINES);
    if (npc.occupation !== undefined) lines.push(...(MINISTRY_OCC_LINES[npc.occupation] ?? []));
  }
  if (npc.faction !== undefined) lines.push(...(FACTION_LINES[npc.faction] ?? []));
  if (npc.occupation !== undefined) lines.push(...(OCC_LINES[npc.occupation] ?? []));
  if (shouldUseOldWorldMemoryLines(npc) && seededChance(seed, repeatIndex, 'old-world', 0.18)) {
    lines.push(...OLD_WORLD_MEMORY_LINES);
  }
  return pickSeeded(lines, seed, repeatIndex, 'dialogue-fallback');
}

function pickContextLine(snapshot: ContextSnapshot, memory: NpcMemory, seed: number | string, repeatIndex: number): string | undefined {
  if (memory.hurtByPlayer > 0 && memory.fear > 35) return pickContext(CONTEXT_THEFT_FEAR_LINES, memory, seed, repeatIndex, 'theft-fear');
  if (memory.trustPlayer < -25) return pickContext(CONTEXT_LOW_TRUST_LINES, memory, seed, repeatIndex, 'low-trust');
  if (snapshot.isCritical || snapshot.isWounded) return pickContext(CONTEXT_WOUND_LINES, memory, seed, repeatIndex, 'wound');
  if (snapshot.isHungry) return pickContext(CONTEXT_HUNGER_LINES, memory, seed, repeatIndex, 'hunger');
  if (snapshot.isThirsty) return pickContext(CONTEXT_THIRST_LINES, memory, seed, repeatIndex, 'thirst');
  if (snapshot.samosborActive === true || snapshot.hasRecentSamosborWarning) return pickContext(CONTEXT_SAMOSBOR_WARNING_LINES, memory, seed, repeatIndex, 'samosbor-warning');
  if (snapshot.samosborActive === false && (memory.fear > 60 || snapshot.hasRecentSamosborAftermath)) return pickContext(CONTEXT_SAMOSBOR_AFTER_LINES, memory, seed, repeatIndex, 'samosbor-after');
  if (snapshot.isDangerousZone) return pickContext(CONTEXT_DANGEROUS_ZONE_LINES, memory, seed, repeatIndex, 'danger-zone');
  if (snapshot.isSafeOwnZone) return pickContext(CONTEXT_SAFE_OWN_ZONE_LINES, memory, seed, repeatIndex, 'safe-zone');
  if (memory.helpedByPlayer >= 2 && memory.trustPlayer > 25) return pickContext(CONTEXT_REPEATED_HELP_LINES, memory, seed, repeatIndex, 'helped');
  if (snapshot.hasActiveContract && seededChance(seed, repeatIndex, 'active-contract', 0.45)) return pickContext(CONTEXT_ACTIVE_CONTRACT_LINES, memory, seed, repeatIndex, 'contract');
  if (snapshot.roomMemorySeverity >= 3 && (snapshot.hasRoomMemoryTheft || snapshot.hasRoomMemoryCombat)) {
    return pickContext(snapshot.hasRoomMemoryTheft ? ROOM_MEMORY_THEFT_LINES : ROOM_MEMORY_COMBAT_LINES, memory, seed, repeatIndex, 'room-memory-risk');
  }
  if (snapshot.roomMemorySeverity >= 3 && snapshot.hasRoomMemoryRepair) return pickContext(ROOM_MEMORY_REPAIR_LINES, memory, seed, repeatIndex, 'room-repair');
  if (snapshot.roomMemorySeverity >= 3 && snapshot.hasRoomMemoryHelp) return pickContext(ROOM_MEMORY_HELP_LINES, memory, seed, repeatIndex, 'room-help');
  if (snapshot.roomMemorySeverity >= 3 && snapshot.hasRoomMemorySamosbor) return pickContext(ROOM_MEMORY_SAMOSBOR_LINES, memory, seed, repeatIndex, 'room-samosbor');
  if (snapshot.hasRecentPlayerTheft) return pickContext(CONTEXT_STOLEN_GOODS_LINES, memory, seed, repeatIndex, 'stolen');
  if (snapshot.hasRecentProductionShortage && seededChance(seed, repeatIndex, 'prod-shortage', 0.55)) return pickContext(CONTEXT_PRODUCTION_SHORTAGE_LINES, memory, seed, repeatIndex, 'prod-shortage-line');
  if (snapshot.hasRecentProductionOutput && seededChance(seed, repeatIndex, 'prod-output', 0.45)) return pickContext(CONTEXT_PRODUCTION_OUTPUT_LINES, memory, seed, repeatIndex, 'prod-output-line');
  if (snapshot.hasRecentLiftAnomaly) return pickContext(floorPool(CONTEXT_LIFT_ANOMALY_FLOOR_LINES, snapshot.floor, CONTEXT_LIFT_ANOMALY_LINES), memory, seed, repeatIndex, 'lift');
  if (snapshot.hasRecentFactionClash) return pickContext(factionPool(snapshot, CONTEXT_FACTION_EVENT_FACTION_LINES, CONTEXT_FACTION_EVENT_LINES), memory, seed, repeatIndex, 'faction-event');
  if (snapshot.hasRecentMonsterKill) return pickContext(floorPool(CONTEXT_MONSTER_KILL_FLOOR_LINES, snapshot.floor, CONTEXT_MONSTER_KILL_LINES), memory, seed, repeatIndex, 'monster-kill');
  if (snapshot.roomType === RoomType.MEDICAL && seededChance(seed, repeatIndex, 'medical-room', 0.55)) return pickContext(MEDICAL_ROOM_LINES, memory, seed, repeatIndex, 'medical-room-line');
  if (snapshot.nearbyProduction && seededChance(seed, repeatIndex, 'production', 0.35)) return pickContext(CONTEXT_PRODUCTION_LINES, memory, seed, repeatIndex, 'production-line');
  if (snapshot.nearbyContainer && seededChance(seed, repeatIndex, 'container', 0.35)) return pickContext(CONTEXT_NEAR_CONTAINER_LINES, memory, seed, repeatIndex, 'container-line');
  if (memory.trustPlayer > 45) return pickContext(CONTEXT_HIGH_TRUST_LINES, memory, seed, repeatIndex, 'high-trust');
  if (snapshot.npcOccupation !== undefined && seededChance(seed, repeatIndex, 'occupation', 0.35)) {
    const pool = CONTEXT_OCCUPATION_LINES[snapshot.npcOccupation];
    if (pool) return pickContext(pool, memory, seed, repeatIndex, 'occupation-line');
  }
  if (snapshot.npcFaction !== undefined && seededChance(seed, repeatIndex, 'faction', 0.25)) {
    const pool = CONTEXT_FACTION_LINES[snapshot.npcFaction];
    if (pool) return pickContext(pool, memory, seed, repeatIndex, 'faction-line');
  }
  return undefined;
}

function hasContextAnchor(snapshot: ContextSnapshot): boolean {
  return snapshot.roomName !== undefined || snapshot.zoneId !== undefined || snapshot.floor !== undefined;
}

function validDialogueText(text: string, context: MarkovAdapterTextContext, maxChars: number): boolean {
  const clean = cleanLine(text);
  if (!clean || clean.length > maxChars) return false;
  const anchor = context.roomName ?? (context.zoneId !== undefined ? `зона ${context.zoneId + 1}` : context.floor !== undefined ? floorName(context.floor) : '');
  return anchor.length === 0 || clean.includes(anchor);
}

function floorPool(pools: Record<number, readonly string[]>, floor: number | undefined, fallback: readonly string[]): readonly string[] {
  return floor !== undefined ? pools[floor] ?? fallback : fallback;
}

function factionPool(snapshot: ContextSnapshot, pools: Record<number, readonly string[]>, fallback: readonly string[]): readonly string[] {
  return snapshot.npcFaction !== undefined ? pools[snapshot.npcFaction] ?? fallback : fallback;
}

function pickContext(pool: readonly string[], memory: NpcMemory, seed: number | string, repeatIndex: number, salt: string): string {
  if (pool.length === 0) return '';
  const stableIndex = Math.abs((memory.entityId + memory.knownRumorIds.length + memory.helpedByPlayer - memory.hurtByPlayer) | 0) % pool.length;
  return pool[(stableIndex + hashSpeechSeed(seed, repeatIndex, salt)) % pool.length];
}

function shouldUseOldWorldMemoryLines(npc: Entity): boolean {
  return npc.occupation !== Occupation.CHILD && (
    npc.faction === Faction.CITIZEN ||
    occupationHasAnyProfileTag(npc.occupation, ['domestic', 'admin', 'social', 'traveler'])
  );
}

function minimalMemory(npc: Entity, now: number): NpcMemory {
  return {
    entityId: npc.id,
    lastSeenPlayerAt: -Infinity,
    helpedByPlayer: 0,
    hurtByPlayer: 0,
    knownRumorIds: [],
    fear: 0,
    trustPlayer: npc.playerRelation ?? 0,
    lastSpokeAt: now,
    lastRumorAt: -Infinity,
    lastContextAt: -Infinity,
    lastBarkAt: -Infinity,
    lastMemoryTickMinute: -1,
    lastRumorEventId: 0,
    lastEventRumorId: '',
    lastEventRumorAt: -Infinity,
    lastWitnessFactLineAt: -Infinity,
    lastWitnessFactEventId: 0,
    lastTouchedAt: now,
    observedFacts: [],
  };
}

function floorName(floor: FloorLevel): string {
  switch (floor) {
    case FloorLevel.MINISTRY: return 'Министерство';
    case FloorLevel.KVARTIRY: return 'Квартиры';
    case FloorLevel.LIVING: return 'Жилая зона';
    case FloorLevel.MAINTENANCE: return 'Коллекторы';
    case FloorLevel.HELL: return 'Ад';
    case FloorLevel.VOID: return 'Пустота';
  }
}

export function hashSpeechSeed(seed: number | string | undefined, repeatIndex = 0, salt = ''): number {
  let h = 0x811c9dc5 ^ repeatIndex;
  const input = `${seed ?? 0}|${salt}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pickSeeded<T>(items: readonly T[], seed: number | string | undefined, repeatIndex = 0, salt = ''): T {
  if (items.length === 0) throw new Error('pickSeeded requires a non-empty array');
  return items[hashSpeechSeed(seed, repeatIndex, salt) % items.length];
}

function seededChance(seed: number | string | undefined, repeatIndex: number, salt: string, chance: number): boolean {
  return (hashSpeechSeed(seed, repeatIndex, salt) % 10_000) < Math.floor(chance * 10_000);
}

export function cleanLine(text: string | undefined): string | undefined {
  const clean = text?.replace(/\s+/g, ' ').trim();
  return clean && clean.length > 0 ? clean : undefined;
}
