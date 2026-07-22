/* ── Markov rumor adapter: flavor around selected rumor facts ─── */

import { Faction, RoomType, type ZoneFaction } from '../core/types';
import { DESIGN_FLOOR_ROUTES } from '../data/design_floors';
import { ITEMS } from '../data/items';
import { RUMORS, type RumorDef, type RumorLead, type RumorReveal } from '../data/rumors';
import { monsterTypeName } from '../entities/monster';
import { type ContextSnapshot } from './context';
import { type NpcMemory } from './npc_memory';
import {
  cleanLine,
  hashSpeechSeed,
  type MarkovAdapterSpeechRequest,
  type MarkovAdapterSpeechResult,
  type MarkovRouteSpeech,
} from './markov_dialogue';
import { type RumorEventLike } from './rumor';

export interface MarkovRumorFlavorOptions {
  rumor?: RumorDef;
  rumorId?: string;
  snapshot: ContextSnapshot;
  memory?: Pick<NpcMemory, 'entityId' | 'knownRumorIds'>;
  event?: RumorEventLike;
  lockedText?: string;
  exactFallback?: string;
  seed?: number | string;
  repeatIndex?: number;
  now?: number;
  maxChars?: number;
  routeSpeech?: MarkovRouteSpeech;
}

export interface MarkovRumorFlavorResult extends MarkovAdapterSpeechResult {
  rumorId: string;
  topic: RumorDef['topic'];
  leadText?: string;
  revealText?: string;
}

const DEFAULT_MAX_RUMOR_CHARS = 180;

export function renderMarkovRumorFlavor(options: MarkovRumorFlavorOptions): MarkovRumorFlavorResult {
  const rumor = options.rumor ?? (options.rumorId ? findRumor(options.rumorId) : undefined);
  const rumorId = rumor?.id ?? options.rumorId ?? '';
  const locked = cleanLine(options.lockedText);
  if (locked) {
    return {
      text: locked,
      source: 'locked_author_text',
      intent: 'locked_author_text',
      tags: ['locked_author_text', 'rumor'],
      fallbackUsed: false,
      rumorId,
      topic: rumor?.topic ?? 'room',
    };
  }

  if (!rumor) {
    const fallback = cleanLine(options.exactFallback) ?? '';
    return {
      text: fallback,
      source: 'curated_pool',
      intent: 'rumor_flavor',
      tags: ['rumor', 'missing_rumor'],
      fallbackUsed: true,
      rumorId,
      topic: 'room',
    };
  }

  const maxChars = options.maxChars ?? DEFAULT_MAX_RUMOR_CHARS;
  const fallback = cleanLine(options.exactFallback) ?? renderRumorFallback(rumor, options);
  const leadText = formatLeadLine(rumor.lead, options.event);
  const revealText = formatRevealLine(rumor.reveals);
  const leadItemId = rumor.lead?.itemId ?? options.event?.itemId;
  const leadMonsterKind = rumor.lead?.monsterKind;
  const requiredAnchors: string[] = [];
  if (options.event?.type) requiredAnchors.push('event');
  else if (rumor.topic === 'room' || rumor.topic === 'floor' || options.snapshot.roomDefId) requiredAnchors.push('room');
  else if (rumor.topic === 'monster' || rumor.topic === 'samosbor') requiredAnchors.push('danger');
  else if (rumor.topic === 'economy' || rumor.topic === 'rare_item' || rumor.topic === 'contract') requiredAnchors.push('item');
  else if (rumor.topic === 'faction') requiredAnchors.push('faction');

  const tags = ['rumor', `rumor.${rumor.topic}`, rumor.id];
  if (options.snapshot.roomDefId) tags.push('room');
  if (leadItemId) tags.push('item');
  if (leadMonsterKind || rumor.topic === 'monster' || rumor.topic === 'samosbor') tags.push('danger');
  if (rumor.topic === 'faction' || options.snapshot.npcFaction) tags.push('faction');
  if (options.event?.type) tags.push('event');

  const context = {
    z: options.snapshot.z,
    roomDefId: options.snapshot.roomDefId,
    roomType: options.snapshot.roomType,
    zoneId: options.snapshot.zoneId,
    itemId: leadItemId,
    itemName: leadItemId ? ITEMS[leadItemId]?.name : undefined,
    monsterKind: leadMonsterKind,
    eventType: options.event?.type,
    eventId: options.event?.id,
    requiredAnchors: requiredAnchors.length > 0 ? requiredAnchors : undefined,
    tags,
  };
  const request: MarkovAdapterSpeechRequest = {
    intent: 'rumor_flavor',
    source: 'generated_markov',
    context,
    exactFallback: fallback,
    seed: options.seed ?? rumor.id,
    repeatIndex: options.repeatIndex,
    maxChars,
  };

  const routed = options.routeSpeech?.(request);
  if (routed && validRumorGeneratedText(routed.text, maxChars)) {
    return {
      ...routed,
      intent: 'rumor_flavor',
      tags: routed.tags.length ? routed.tags : context.tags,
      fallbackUsed: routed.fallbackUsed,
      rumorId: rumor.id,
      topic: rumor.topic,
      leadText,
      revealText,
    };
  }

  return {
    text: fallback,
    source: 'curated_pool',
    intent: 'rumor_flavor',
    domainId: 'rumor',
    tags: context.tags,
    fallbackUsed: true,
    rumorId: rumor.id,
    topic: rumor.topic,
    leadText,
    revealText,
  };
}

export function renderMarkovRumorText(options: MarkovRumorFlavorOptions): string {
  return renderMarkovRumorFlavor(options).text;
}

function renderRumorFallback(rumor: RumorDef, options: MarkovRumorFlavorOptions): string {
  const memory = options.memory;
  const idxSeed = memory
    ? Math.abs((memory.entityId * 31 + rumor.id.length * 17 + memory.knownRumorIds.length) | 0)
    : hashSpeechSeed(options.seed ?? rumor.id, options.repeatIndex ?? 0, 'rumor-text');
  const text = fillSlots(rumor.text[idxSeed % rumor.text.length] ?? rumor.text[0] ?? '', options.snapshot);
  const lead = formatLeadLine(rumor.lead, options.event);
  if (lead) return `${text} (${lead}).`;
  const reveal = formatRevealLine(rumor.reveals);
  return reveal ? `${text} ${reveal}` : text;
}

function validRumorGeneratedText(
  text: string,
  maxChars: number,
): boolean {
  const clean = cleanLine(text);
  if (!clean || clean.length > maxChars) return false;
  if (clean.includes('{')) return false;
  return true;
}

function formatLeadLine(lead: RumorLead | undefined, event?: RumorEventLike): string {
  if (lead) return formatStaticLead(lead);
  return event ? formatEventLead(event) : '';
}

function formatStaticLead(lead: RumorLead): string {
  const parts: string[] = [];
  if (lead.z !== undefined) parts.push(floorName(lead.z));
  if (lead.zoneHint) parts.push(lead.zoneHint);
  if (lead.roomDefId) parts.push(lead.roomDefId);
  else if (lead.roomType !== undefined) parts.push(roomTypeName(lead.roomType));
  if (lead.itemId) {
    const itemName = ITEMS[lead.itemId]?.name.toLowerCase();
    if (itemName) parts.push(itemName);
  }
  if (lead.monsterKind !== undefined) parts.push(monsterTypeName(lead.monsterKind).toLowerCase());
  const prefix = parts.length > 0 ? `${parts.join(' / ')}: ` : '';
  return `${prefix}${lead.action}`;
}

function formatEventLead(event: RumorEventLike): string {
  const parts: string[] = [];
  if (event.z !== undefined) parts.push(floorName(event.z));
  if (event.zoneName) parts.push(event.zoneName);
  else if (event.zoneId !== undefined) parts.push(`зона ${event.zoneId + 1}`);
  if (event.roomDefId) parts.push(event.roomDefId);
  else if (event.roomType !== undefined) parts.push(roomTypeName(event.roomType));
  if (event.itemId) {
    const itemName = ITEMS[event.itemId]?.name.toLowerCase();
    if (itemName) parts.push(itemName);
  }
  if (event.monsterKind !== undefined) parts.push(monsterTypeName(event.monsterKind).toLowerCase());
  const action = eventLeadAction(event);
  return parts.length > 0 ? `${parts.join(' / ')}: ${action}` : action;
}

function eventLeadAction(event: RumorEventLike): string {
  const type = event.type ?? '';
  if (type === 'contract_created' || type === 'quest_created') return 'открой журнал заданий и подготовь вылазку';
  if (type === 'item_stolen') return 'держись подальше от владельца контейнера или готовь объяснение';
  if (type === 'player_kill_monster' || type === 'npc_kill_monster') return 'проверь место боя на редкий дроп';
  if (type.includes('floor') || event.tags?.includes('floor_transition')) return 'ищи лифт и сверяй этаж перед выходом';
  return 'проверь место слуха, пока свидетели не разошлись';
}

function formatRevealLine(input: RumorDef['reveals']): string {
  if (!input) return '';
  const reveals = Array.isArray(input) ? input : [input];
  if (reveals.length < 2 && !reveals.some(revealIsActionable)) return '';
  const parts: string[] = [];
  for (const reveal of reveals) {
    const part = formatReveal(reveal);
    if (part && !parts.includes(part)) parts.push(part);
  }
  return parts.length > 0 ? `${parts.join(', ')}.` : '';
}

function revealIsActionable(reveal: RumorReveal): boolean {
  if (reveal.kind === 'danger' || reveal.kind === 'container') return true;
  if (reveal.confidence < 4) return false;
  return formatReveal(reveal).length > 0;
}

function formatReveal(reveal: RumorReveal): string {
  switch (reveal.kind) {
    case 'floor':
      return floorName(reveal.z);
    case 'zone':
      if (reveal.zoneId !== undefined) return `зона ${reveal.zoneId + 1}`;
      if (reveal.faction !== undefined) return `зона: ${zoneFactionName(reveal.faction)}`;
      return '';
    case 'room':
      return reveal.roomDefId ?? (reveal.roomType !== undefined ? roomTypeName(reveal.roomType) : '');
    case 'danger':
      return 'опасность';
    case 'monster':
      return reveal.monsterKind !== undefined ? monsterTypeName(reveal.monsterKind).toLowerCase() : '';
    case 'container':
      return reveal.name ?? reveal.tag ?? '';
    case 'item':
      return ITEMS[reveal.itemId]?.name.toLowerCase() ?? '';
    case 'faction':
      return reveal.faction !== undefined ? factionName(reveal.faction) : '';
    case 'warning':
      return reveal.tag.replace(/_/g, ' ');
  }
}

function fillSlots(text: string, snapshot: ContextSnapshot): string {
  let out = text;
  if (out.includes('{zone}')) out = out.split('{zone}').join(snapshot.zoneId === undefined ? 'этой зоне' : `зоне ${snapshot.zoneId + 1}`);
  if (out.includes('{room}')) out = out.split('{room}').join(snapshot.roomDefId ?? 'этой комнате');
  return out;
}

function findRumor(id: string): RumorDef | undefined {
  return RUMORS.find(rumor => rumor.id === id);
}

function floorName(z: number): string {
  const route = DESIGN_FLOOR_ROUTES.find(r => r.z === z);
  return route ? route.displayName : `Этаж ${z}`;
}

function roomTypeName(roomType: RoomType): string {
  switch (roomType) {
    case RoomType.LIVING: return 'жилая комната';
    case RoomType.KITCHEN: return 'кухня';
    case RoomType.BATHROOM: return 'санузел';
    case RoomType.STORAGE: return 'кладовая';
    case RoomType.MEDICAL: return 'медпункт';
    case RoomType.COMMON: return 'общая комната';
    case RoomType.PRODUCTION: return 'производственная';
    case RoomType.CORRIDOR: return 'коридор';
    case RoomType.SMOKING: return 'курилка';
    case RoomType.OFFICE: return 'кабинет';
    case RoomType.HQ: return 'штаб';
    case RoomType.CLASSROOM: return 'класс';
  }
}

function factionName(faction: Faction): string {
  switch (faction) {
    case Faction.CITIZEN: return 'жильцы';
    case Faction.LIQUIDATOR: return 'ликвидаторы';
    case Faction.CULTIST: return 'культисты';
    case Faction.SCIENTIST: return 'ученые';
    case Faction.WILD: return 'дикие';
    case Faction.PLAYER: return 'вы';
  }
}

function zoneFactionName(faction: ZoneFaction): string {
  switch (faction) {
    case 0: return 'жильцы';
    case 1: return 'ликвидаторы';
    case 2: return 'культисты';
    case 3: return 'самосбор';
    case 4: return 'дикие';
    default: return 'чужая';
  }
}
