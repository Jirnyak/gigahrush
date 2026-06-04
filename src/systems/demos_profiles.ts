import {
  EntityType,
  Faction,
  FloorLevel,
  Occupation,
  type Entity,
  type GameState,
  type WorldEvent,
  type WorldEventBuffer,
} from '../core/types';
import {
  DEMOS_TRAIT_REGISTRY_VERSION,
  DEMOS_TRAIT_SLOTS,
  demosTraitByIndex,
  demosTraitIndexById,
  demosTraitsByKind,
  type DemosTraitDef,
  type DemosTraitKind,
} from '../data/demos_traits';
import {
  DEMOS_EDGE_DEBT,
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FAMILY,
  DEMOS_EDGE_FRIEND,
  DEMOS_EDGE_QUEST,
  DEMOS_EDGE_WORK,
  DEMOS_RELATION_FRIENDLY_THRESHOLD,
  DEMOS_RELATION_HOSTILE_THRESHOLD,
  DemosSocialRoleId as DemosGraphRoleId,
} from '../data/demos_social';
import {
  characterAgeBandLabelRu,
  characterAgeSexTags,
  characterSexLabelRu,
} from '../data/demographics';
import {
  alifeNpcRecordCount,
  alifeSeed,
  getAlifeNpcRecordSnapshot,
  type AlifeNpcSnapshot,
} from './alife';
import { demosRelationBand } from './demos';
import { getDemosNpcOnlySocialEdges, type DemosSocialEdgeView } from './demos_social';

const DEMOS_PROFILE_RECENT_LIMIT = 48;
const DEMOS_SOCIAL_FALLBACK_TRIES = 24;
const DEMOS_FAMILY_PROBE_RANGE = 18;

export type DemosSocialRoleId =
  | 'acquaintance'
  | 'friend'
  | 'rival'
  | 'enemy'
  | 'parent'
  | 'child'
  | 'partner'
  | 'work'
  | 'debt'
  | 'quest';

export interface DemosTraitView {
  index: number;
  id: string;
  kind: DemosTraitKind;
  label: string;
  tags: readonly string[];
  relationBias?: number;
  questWeightBias?: number;
  barkWeightBias?: number;
}

export interface DemosSocialLinkSeed {
  targetAlifeId: number;
  relation: number;
  role?: DemosSocialRoleId;
  flags?: number;
  hidden?: boolean;
  tags?: readonly string[];
}

export interface DemosSocialLinkView {
  sourceAlifeId: number;
  targetKind: 'alife';
  targetAlifeId: number;
  targetLabel: string;
  relation: number;
  relationLabel: string;
  relationColor: string;
  role: DemosSocialRoleId;
  roleLabel: string;
  flags: number;
  hidden: boolean;
  dead: boolean;
  tags: readonly string[];
}

export interface DemosProfileFeedEntry {
  postId: number;
  eventId: number;
  eventType: string;
  createdAt: number;
  label: string;
  summary: string;
  tags: readonly string[];
}

export interface DemosProfileDetails {
  alifeId: number;
  age: number;
  ageBandLabel: string;
  sexLabel: string;
  accountRubles: number;
  accountLabel: string;
  familyStatusLabel: string;
  relationToPlayerLabel: string;
  friendsCount: number;
  enemiesCount: number;
  familyCount: number;
  traits: readonly DemosTraitView[];
  interests: readonly string[];
  favoriteWorkLabel?: string;
  fearLabel?: string;
  lastPostId?: number;
  mentionsRecent: number;
  dead: boolean;
}

interface DemosTraitCache {
  signature: string;
  total: number;
  traitIds: Uint16Array;
  ready: Uint8Array;
}

interface DemosProfileHost {
  demosProfileTraitCache?: DemosTraitCache;
  demosProfileSocialEdges?: Record<number, readonly DemosSocialLinkSeed[]> | Map<number, readonly DemosSocialLinkSeed[]>;
}

const ROLE_LABELS: Record<DemosSocialRoleId, string> = {
  acquaintance: 'знакомый',
  friend: 'друг',
  rival: 'спор',
  enemy: 'враг',
  parent: 'родитель',
  child: 'ребёнок',
  partner: 'пара',
  work: 'смена',
  debt: 'долг',
  quest: 'дело',
};

const OCCUPATION_WORK_LABELS: Record<Occupation, string> = {
  [Occupation.HOUSEWIFE]: 'держит быт',
  [Occupation.LOCKSMITH]: 'чинит замки и трубы',
  [Occupation.SECRETARY]: 'ведёт журнал',
  [Occupation.ELECTRICIAN]: 'смотрит щитки',
  [Occupation.COOK]: 'держит кухню',
  [Occupation.DOCTOR]: 'дежурит в медпункте',
  [Occupation.TURNER]: 'стоит у станка',
  [Occupation.MECHANIC]: 'чинит механизмы',
  [Occupation.STOREKEEPER]: 'считает склад',
  [Occupation.ALCOHOLIC]: 'знает курилку',
  [Occupation.SCIENTIST]: 'пишет протокол',
  [Occupation.CHILD]: 'ходит по поручениям',
  [Occupation.DIRECTOR]: 'гоняет смены',
  [Occupation.TRAVELER]: 'ходит маршрутами',
  [Occupation.PILGRIM]: 'держит обет',
  [Occupation.HUNTER]: 'берёт зачистки',
  [Occupation.PRIEST]: 'держит храм',
};

const OCCUPATION_INTERESTS: Record<Occupation, readonly string[]> = {
  [Occupation.HOUSEWIFE]: ['чайник', 'прачечная', 'соседи'],
  [Occupation.LOCKSMITH]: ['ключи', 'гермы', 'инструмент'],
  [Occupation.SECRETARY]: ['журнал', 'печати', 'очередь'],
  [Occupation.ELECTRICIAN]: ['щиток', 'кабель', 'сухие перчатки'],
  [Occupation.COOK]: ['пайка', 'вода', 'общая кухня'],
  [Occupation.DOCTOR]: ['бинты', 'йод', 'медкарта'],
  [Occupation.TURNER]: ['станок', 'резьба', 'масло'],
  [Occupation.MECHANIC]: ['насос', 'болты', 'привод'],
  [Occupation.STOREKEEPER]: ['кладовая', 'накладная', 'остатки'],
  [Occupation.ALCOHOLIC]: ['курилка', 'бутылка', 'занять рубль'],
  [Occupation.SCIENTIST]: ['образец', 'колба', 'протокол'],
  [Occupation.CHILD]: ['мел', 'домино', 'сладкий чай'],
  [Occupation.DIRECTOR]: ['план', 'норма', 'доска заявок'],
  [Occupation.TRAVELER]: ['лифт', 'карта', 'сухарь'],
  [Occupation.PILGRIM]: ['обет', 'свеча', 'тихий угол'],
  [Occupation.HUNTER]: ['патроны', 'следы', 'дверной клин'],
  [Occupation.PRIEST]: ['свечи', 'кружка воды', 'исповедь'],
};

const FACTION_INTERESTS: Record<Faction, readonly string[]> = {
  [Faction.CITIZEN]: ['жилая очередь'],
  [Faction.LIQUIDATOR]: ['патрульный журнал'],
  [Faction.CULTIST]: ['знак у двери'],
  [Faction.SCIENTIST]: ['лабораторная заявка'],
  [Faction.WILD]: ['тихий проход'],
  [Faction.PLAYER]: ['маршрут игрока'],
};

const TRAIT_INTEREST_LABELS: Partial<Record<string, string>> = {
  fear_debt: 'чистая расписка',
  fear_hunger: 'запасная пайка',
  fear_monster: 'светлый угол',
  fear_samosbor: 'герма до сирены',
  taste_documents: 'ровная справка',
  taste_food: 'кухонные слухи',
  taste_medicine: 'сухой бинт',
  taste_tools: 'исправный инструмент',
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function hash32(a: number, b: number, c = 0, d = 0): number {
  let x = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b)
    + Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2d)
    + Math.imul(c ^ 0x165667b1, 0x9e3779b1)
    + d) | 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return x >>> 0;
}

function traitCacheSignature(state: GameState, total: number): string {
  return `demos_traits:${DEMOS_TRAIT_REGISTRY_VERSION}:${alifeSeed(state)}:${total}`;
}

function ensureTraitCache(state: GameState, total: number): DemosTraitCache {
  const host = state as GameState & DemosProfileHost;
  const signature = traitCacheSignature(state, total);
  const existing = host.demosProfileTraitCache;
  if (existing && existing.signature === signature && existing.total === total) return existing;
  const cache = {
    signature,
    total,
    traitIds: new Uint16Array(total * DEMOS_TRAIT_SLOTS),
    ready: new Uint8Array(total),
  };
  host.demosProfileTraitCache = cache;
  return cache;
}

function traitIdByHash(kind: DemosTraitKind, seed: number, snapshot: AlifeNpcSnapshot, salt: number): string {
  const traits = demosTraitsByKind(kind);
  if (traits.length === 0) return '';
  const idx = hash32(seed, snapshot.id, snapshot.faction + snapshot.occupation * 31, salt) % traits.length;
  return traits[idx].id;
}

function temperTraitId(seed: number, snapshot: AlifeNpcSnapshot): string {
  const relation = snapshot.playerRelation ?? 0;
  if (relation <= -55 || snapshot.karma <= -50) return 'vengeful';
  if (snapshot.occupation === Occupation.HUNTER || relation >= 55) return 'brave';
  if (snapshot.faction === Faction.LIQUIDATOR || snapshot.faction === Faction.SCIENTIST) return 'orderly';
  if ((hash32(seed, snapshot.id, 1) & 3) === 0) return 'cowardly';
  return traitIdByHash('temper', seed, snapshot, 11);
}

function socialTraitId(seed: number, snapshot: AlifeNpcSnapshot): string {
  const relation = snapshot.playerRelation ?? 0;
  if (relation >= 45 || snapshot.karma >= 35) return 'helpful';
  if (snapshot.accountRubles > 2500 || relation <= -35) return 'greedy';
  if ((hash32(seed, snapshot.id, 2) & 1) === 0) return 'quiet_neighbor';
  return traitIdByHash('social', seed, snapshot, 23);
}

function workTraitId(snapshot: AlifeNpcSnapshot): string {
  switch (snapshot.occupation) {
    case Occupation.COOK:
      return 'kitchen_shift';
    case Occupation.LOCKSMITH:
    case Occupation.ELECTRICIAN:
    case Occupation.TURNER:
    case Occupation.MECHANIC:
    case Occupation.HUNTER:
      return 'tool_hands';
    case Occupation.SECRETARY:
    case Occupation.SCIENTIST:
    case Occupation.DOCTOR:
    case Occupation.DIRECTOR:
    case Occupation.STOREKEEPER:
      return 'paper_soul';
    default:
      return 'work_pride';
  }
}

function tasteTraitId(snapshot: AlifeNpcSnapshot): string {
  switch (snapshot.occupation) {
    case Occupation.COOK:
    case Occupation.HOUSEWIFE:
    case Occupation.ALCOHOLIC:
    case Occupation.CHILD:
      return 'taste_food';
    case Occupation.DOCTOR:
      return 'taste_medicine';
    case Occupation.SECRETARY:
    case Occupation.SCIENTIST:
    case Occupation.DIRECTOR:
      return 'taste_documents';
    default:
      return 'taste_tools';
  }
}

function questTraitId(snapshot: AlifeNpcSnapshot): string {
  switch (snapshot.occupation) {
    case Occupation.LOCKSMITH:
    case Occupation.ELECTRICIAN:
    case Occupation.MECHANIC:
    case Occupation.TURNER:
      return 'quest_repair';
    case Occupation.HUNTER:
      return 'quest_hunt';
    case Occupation.STOREKEEPER:
    case Occupation.COOK:
      return 'quest_trade';
    default:
      return 'quest_fetch';
  }
}

function fourthTraitId(seed: number, snapshot: AlifeNpcSnapshot): string {
  if (snapshot.canGiveQuest) return questTraitId(snapshot);
  const h = hash32(seed, snapshot.id, snapshot.floor + 7, 41) % 4;
  if (h === 0) return snapshot.floor === FloorLevel.HELL || snapshot.floor === FloorLevel.VOID ? 'fear_monster' : 'fear_samosbor';
  if (h === 1) return snapshot.accountRubles < 40 ? 'fear_debt' : 'fear_hunger';
  return tasteTraitId(snapshot);
}

function fillTraitSlots(state: GameState, snapshot: AlifeNpcSnapshot, cache: DemosTraitCache): void {
  const offset = (snapshot.id - 1) * DEMOS_TRAIT_SLOTS;
  const seed = alifeSeed(state);
  const ids = [
    temperTraitId(seed, snapshot),
    socialTraitId(seed, snapshot),
    workTraitId(snapshot),
    fourthTraitId(seed, snapshot),
  ];
  const used = new Set<number>();
  for (let slot = 0; slot < DEMOS_TRAIT_SLOTS; slot++) {
    let index = demosTraitIndexById(ids[slot]);
    if (index > 0 && used.has(index)) index = 0;
    if (index === 0) {
      const fallback = demosTraitsByKind(slot === 3 ? 'taste' : 'temper');
      for (const def of fallback) {
        const fallbackIndex = demosTraitIndexById(def.id);
        if (!used.has(fallbackIndex)) {
          index = fallbackIndex;
          break;
        }
      }
    }
    cache.traitIds[offset + slot] = index;
    if (index > 0) used.add(index);
  }
  cache.ready[snapshot.id - 1] = 1;
}

function traitView(index: number, def: DemosTraitDef): DemosTraitView {
  return {
    index,
    id: def.id,
    kind: def.kind,
    label: def.label,
    tags: def.tags,
    relationBias: def.relationBias,
    questWeightBias: def.questWeightBias,
    barkWeightBias: def.barkWeightBias,
  };
}

export function getDemosTraitViews(state: GameState, alifeId: number): readonly DemosTraitView[] {
  const total = alifeNpcRecordCount(state);
  if (!Number.isInteger(alifeId) || alifeId <= 0 || alifeId > total) return [];
  const snapshot = getAlifeNpcRecordSnapshot(state, alifeId);
  if (!snapshot) return [];
  const cache = ensureTraitCache(state, total);
  if (cache.ready[alifeId - 1] === 0) fillTraitSlots(state, snapshot, cache);
  const out: DemosTraitView[] = [];
  const offset = (alifeId - 1) * DEMOS_TRAIT_SLOTS;
  for (let slot = 0; slot < DEMOS_TRAIT_SLOTS; slot++) {
    const index = cache.traitIds[offset + slot];
    const def = demosTraitByIndex(index);
    if (def) out.push(traitView(index, def));
  }
  return out;
}

function relationLabel(score: number): { label: string; color: string } {
  const scaled = Math.max(-100, Math.min(100, Math.round(score * 100 / 127)));
  return demosRelationBand(scaled);
}

function roleFromRelation(relation: number): DemosSocialRoleId {
  if (relation <= DEMOS_RELATION_HOSTILE_THRESHOLD) return 'enemy';
  if (relation >= DEMOS_RELATION_FRIENDLY_THRESHOLD) return 'friend';
  return relation < 0 ? 'rival' : 'acquaintance';
}

function normalizeRole(role: unknown, fallback: DemosSocialRoleId): DemosSocialRoleId {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? role as DemosSocialRoleId : fallback;
}

function readInjectedSocialEdges(state: GameState, alifeId: number): readonly DemosSocialLinkSeed[] | undefined {
  const edges = (state as GameState & DemosProfileHost).demosProfileSocialEdges;
  if (!edges) return undefined;
  if (edges instanceof Map) return edges.get(alifeId);
  return edges[alifeId];
}

function roleFromGraphRole(role: DemosGraphRoleId, relation: number): DemosSocialRoleId {
  switch (role) {
    case DemosGraphRoleId.FRIEND:
      return 'friend';
    case DemosGraphRoleId.RIVAL:
      return 'rival';
    case DemosGraphRoleId.ENEMY:
      return 'enemy';
    case DemosGraphRoleId.PARENT:
      return 'parent';
    case DemosGraphRoleId.CHILD:
      return 'child';
    case DemosGraphRoleId.PARTNER:
      return 'partner';
    case DemosGraphRoleId.WORK:
      return 'work';
    case DemosGraphRoleId.DEBT:
      return 'debt';
    case DemosGraphRoleId.QUEST:
      return 'quest';
    default:
      return roleFromRelation(relation);
  }
}

function graphEdgeTags(edge: DemosSocialEdgeView): readonly string[] {
  const out: string[] = [];
  if ((edge.flags & DEMOS_EDGE_FAMILY) !== 0) out.push('family');
  if ((edge.flags & DEMOS_EDGE_FRIEND) !== 0) out.push('friend');
  if ((edge.flags & DEMOS_EDGE_ENEMY) !== 0) out.push('enemy');
  if ((edge.flags & DEMOS_EDGE_WORK) !== 0) out.push('work');
  if ((edge.flags & DEMOS_EDGE_DEBT) !== 0) out.push('debt');
  if ((edge.flags & DEMOS_EDGE_QUEST) !== 0) out.push('quest');
  return out;
}

function readGraphSocialEdges(state: GameState, alifeId: number): readonly DemosSocialLinkSeed[] | undefined {
  const edges = getDemosNpcOnlySocialEdges(state, alifeId);
  if (edges.length === 0) return [];
  return edges.map(edge => ({
    targetAlifeId: edge.targetAlifeId ?? 0,
    relation: edge.relation,
    role: roleFromGraphRole(edge.role, edge.relation),
    flags: edge.flags,
    hidden: edge.hidden,
    tags: graphEdgeTags(edge),
  }));
}

function addLinkSeed(out: DemosSocialLinkSeed[], seen: Set<number>, seed: DemosSocialLinkSeed, sourceAlifeId: number, total: number): void {
  const target = clampInt(seed.targetAlifeId, 0, 1, total);
  if (target <= 0 || target === sourceAlifeId || seen.has(target)) return;
  out.push({
    targetAlifeId: target,
    relation: Math.max(-127, Math.min(127, Math.round(seed.relation))),
    role: seed.role,
    flags: seed.flags,
    hidden: seed.hidden,
    tags: seed.tags,
  });
  seen.add(target);
}

function relationForSnapshots(seed: number, source: AlifeNpcSnapshot, target: AlifeNpcSnapshot, role: DemosSocialRoleId): number {
  if (role === 'parent' || role === 'child' || role === 'partner') return 92 - (hash32(seed, source.id, target.id, 1) % 14);
  let relation = (hash32(seed, source.id, target.id, 2) % 63) - 24;
  if (source.faction === target.faction) relation += 36;
  else relation -= 28;
  if (source.floorKey === target.floorKey) relation += 16;
  if (source.occupation === target.occupation) relation += 18;
  if (target.dead) relation -= 8;
  return Math.max(-127, Math.min(127, relation));
}

function familyRole(source: AlifeNpcSnapshot, target: AlifeNpcSnapshot): DemosSocialRoleId | undefined {
  if (source.familyId <= 0 || source.familyId !== target.familyId) return undefined;
  if (source.occupation === Occupation.CHILD && target.occupation !== Occupation.CHILD) return 'parent';
  if (source.occupation !== Occupation.CHILD && target.occupation === Occupation.CHILD) return 'child';
  if (source.occupation !== Occupation.CHILD && target.occupation !== Occupation.CHILD) return 'partner';
  return undefined;
}

function addFamilyProbeEdges(
  state: GameState,
  out: DemosSocialLinkSeed[],
  seen: Set<number>,
  source: AlifeNpcSnapshot,
  total: number,
): void {
  if (source.familyId <= 0) return;
  const seed = alifeSeed(state);
  for (let delta = 1; delta <= DEMOS_FAMILY_PROBE_RANGE && out.length < 3; delta++) {
    for (const targetId of [source.id - delta, source.id + delta]) {
      if (targetId <= 0 || targetId > total || seen.has(targetId)) continue;
      const target = getAlifeNpcRecordSnapshot(state, targetId);
      const role = target ? familyRole(source, target) : undefined;
      if (!target || !role) continue;
      addLinkSeed(out, seen, {
        targetAlifeId: target.id,
        relation: relationForSnapshots(seed, source, target, role),
        role,
        tags: ['family'],
      }, source.id, total);
    }
  }
}

function fallbackSocialSeeds(state: GameState, source: AlifeNpcSnapshot, limit: number): readonly DemosSocialLinkSeed[] {
  const total = alifeNpcRecordCount(state);
  if (total <= 1 || limit <= 0) return [];
  const out: DemosSocialLinkSeed[] = [];
  const seen = new Set<number>();
  addFamilyProbeEdges(state, out, seen, source, total);
  const seed = alifeSeed(state);
  for (let attempt = 0; attempt < DEMOS_SOCIAL_FALLBACK_TRIES && out.length < limit; attempt++) {
    const targetId = (hash32(seed, source.id, attempt, 77) % total) + 1;
    if (targetId === source.id || seen.has(targetId)) continue;
    const target = getAlifeNpcRecordSnapshot(state, targetId);
    if (!target) continue;
    const family = familyRole(source, target);
    const role = family
      ?? (source.occupation === target.occupation ? 'work'
        : source.faction !== target.faction && (hash32(seed, source.id, target.id, 3) & 1) === 0 ? 'rival'
          : roleFromRelation(relationForSnapshots(seed, source, target, 'acquaintance')));
    addLinkSeed(out, seen, {
      targetAlifeId: target.id,
      relation: relationForSnapshots(seed, source, target, role),
      role,
      tags: family ? ['family'] : source.occupation === target.occupation ? ['work'] : ['social'],
    }, source.id, total);
  }
  return out;
}

function linkViewFromSeed(
  state: GameState,
  source: AlifeNpcSnapshot,
  seed: DemosSocialLinkSeed,
): DemosSocialLinkView | undefined {
  const target = getAlifeNpcRecordSnapshot(state, seed.targetAlifeId);
  if (!target) return undefined;
  const relation = Math.max(-127, Math.min(127, Math.round(seed.relation)));
  const role = normalizeRole(seed.role, roleFromRelation(relation));
  const band = relationLabel(relation);
  return {
    sourceAlifeId: source.id,
    targetKind: 'alife',
    targetAlifeId: target.id,
    targetLabel: `alife:${target.id} ${target.name}`,
    relation,
    relationLabel: band.label,
    relationColor: band.color,
    role,
    roleLabel: ROLE_LABELS[role],
    flags: Math.max(0, Math.min(255, Math.trunc(seed.flags ?? 0))),
    hidden: seed.hidden === true,
    dead: target.dead,
    tags: seed.tags ?? [],
  };
}

export function buildDemosSocialLinksView(
  state: GameState,
  alifeId: number,
  limit = 6,
): readonly DemosSocialLinkView[] {
  const total = alifeNpcRecordCount(state);
  if (!Number.isInteger(alifeId) || alifeId <= 0 || alifeId > total) return [];
  const source = getAlifeNpcRecordSnapshot(state, alifeId);
  if (!source) return [];
  const cap = Math.max(0, Math.min(12, Math.floor(limit)));
  const injected = readInjectedSocialEdges(state, alifeId);
  const graphSeeds = injected === undefined ? readGraphSocialEdges(state, alifeId) : undefined;
  const seeds = injected !== undefined ? injected : graphSeeds ?? fallbackSocialSeeds(state, source, cap);
  const out: DemosSocialLinkView[] = [];
  const seen = new Set<number>();
  for (const seed of seeds) {
    if (out.length >= cap) break;
    if (seen.has(seed.targetAlifeId)) continue;
    const view = linkViewFromSeed(state, source, seed);
    if (!view) continue;
    seen.add(view.targetAlifeId);
    out.push(view);
  }
  return out;
}

function isFamilyRole(role: DemosSocialRoleId): boolean {
  return role === 'parent' || role === 'child' || role === 'partner';
}

function familyStatusLabel(snapshot: AlifeNpcSnapshot, links: readonly DemosSocialLinkView[]): string {
  const partner = links.find(link => link.role === 'partner');
  if (partner) return `семейное: вместе с alife:${partner.targetAlifeId}`;
  const parent = links.find(link => link.role === 'parent');
  if (snapshot.occupation === Occupation.CHILD && parent) return `семейное: ребёнок, родитель alife:${parent.targetAlifeId}`;
  if (links.some(link => link.role === 'child')) return 'семейное: есть дети';
  return 'семейное: один по журналу';
}

function pushUnique(out: string[], value: string, cap: number): void {
  if (out.length < cap && value && !out.includes(value)) out.push(value);
}

function buildInterests(snapshot: AlifeNpcSnapshot, traits: readonly DemosTraitView[]): readonly string[] {
  const out: string[] = [];
  for (const item of OCCUPATION_INTERESTS[snapshot.occupation] ?? []) pushUnique(out, item, 5);
  for (const item of FACTION_INTERESTS[snapshot.faction] ?? []) pushUnique(out, item, 5);
  for (const trait of traits) {
    if (trait.kind === 'taste' || trait.kind === 'fear') {
      pushUnique(out, TRAIT_INTEREST_LABELS[trait.id] ?? trait.label, 5);
    }
  }
  return out;
}

function readRecentEvents(state: GameState, limit: number): WorldEvent[] {
  const buffer: WorldEventBuffer | undefined = state.worldEvents?.recentEvents;
  if (!buffer || buffer.capacity <= 0 || buffer.count <= 0) return [];
  const out: WorldEvent[] = [];
  const total = Math.min(buffer.count, Math.max(0, Math.floor(limit)));
  for (let i = 0; i < total; i++) {
    const idx = (buffer.start + buffer.count - 1 - i + buffer.capacity) % buffer.capacity;
    const event = buffer.items[idx];
    if (event) out.push(event);
  }
  return out;
}

function eventDataAlifeIds(event: WorldEvent): number[] {
  const data = event.data;
  if (!data) return [];
  const out: number[] = [];
  for (const key of ['authorAlifeId', 'actorAlifeId', 'targetAlifeId', 'victimAlifeId', 'reactorAlifeId', 'alifeId']) {
    const raw = data[key];
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) out.push(raw);
  }
  const rawIds = data.alifeIds;
  if (Array.isArray(rawIds)) {
    for (const raw of rawIds.slice(0, 8)) {
      if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) out.push(raw);
    }
  }
  return out;
}

function eventMentionsAlifeId(event: WorldEvent, alifeId: number): boolean {
  return eventDataAlifeIds(event).includes(alifeId);
}

function eventLabel(event: WorldEvent): string {
  if (event.type.includes('samosbor')) return 'самосбор';
  if (event.type.includes('quest') || event.type.includes('contract')) return 'заявка';
  if (event.type.includes('kill') || event.type === 'death_seen') return 'смерть';
  if (event.type.includes('migration') || event.type === 'floor_transition') return 'маршрут';
  if (event.type.includes('faction')) return 'фракция';
  if (event.type.includes('stolen') || event.type.includes('looted')) return 'пропажа';
  return 'запись';
}

function eventSummary(event: WorldEvent): string {
  const parts = [event.actorName, event.targetName, event.itemName].filter((part): part is string => !!part);
  const place = event.roomId !== undefined ? `комната ${Math.floor(event.roomId)}`
    : event.zoneId !== undefined ? `зона ${Math.floor(event.zoneId)}`
      : `этаж ${event.floor}`;
  return parts.length > 0 ? `${parts.join(' -> ')}; ${place}` : `${event.type}; ${place}`;
}

export function buildDemosProfileFeedView(
  state: GameState,
  alifeId: number,
  limit = 6,
): readonly DemosProfileFeedEntry[] {
  if (!Number.isInteger(alifeId) || alifeId <= 0 || limit <= 0) return [];
  const out: DemosProfileFeedEntry[] = [];
  for (const event of readRecentEvents(state, DEMOS_PROFILE_RECENT_LIMIT)) {
    if (out.length >= limit) break;
    if (!eventMentionsAlifeId(event, alifeId)) continue;
    out.push({
      postId: event.id,
      eventId: event.id,
      eventType: event.type,
      createdAt: event.time,
      label: eventLabel(event),
      summary: eventSummary(event),
      tags: event.tags.slice(0, 5),
    });
  }
  return out;
}

function recentMentionCount(state: GameState, alifeId: number): number {
  let count = 0;
  for (const event of readRecentEvents(state, DEMOS_PROFILE_RECENT_LIMIT)) {
    if (eventMentionsAlifeId(event, alifeId)) count++;
  }
  return count;
}

export function getDemosProfileDetails(state: GameState, alifeId: number): DemosProfileDetails | undefined {
  const snapshot = getAlifeNpcRecordSnapshot(state, alifeId);
  if (!snapshot) return undefined;
  const traits = getDemosTraitViews(state, alifeId);
  const links = buildDemosSocialLinksView(state, alifeId, 8);
  const feed = buildDemosProfileFeedView(state, alifeId, 1);
  const relationScore = Math.round(snapshot.playerRelation ?? 0);
  const relation = demosRelationBand(relationScore);
  const fear = traits.find(trait => trait.kind === 'fear');
  const accountRubles = Math.max(0, Math.floor(snapshot.accountRubles));
  return {
    alifeId,
    age: snapshot.age,
    ageBandLabel: characterAgeBandLabelRu(snapshot.age),
    sexLabel: characterSexLabelRu(snapshot.sex),
    accountRubles,
    accountLabel: `${accountRubles}₽`,
    familyStatusLabel: familyStatusLabel(snapshot, links),
    relationToPlayerLabel: `${relationScore} / ${relation.label}`,
    friendsCount: links.filter(link => link.relation >= DEMOS_RELATION_FRIENDLY_THRESHOLD || link.role === 'friend').length,
    enemiesCount: links.filter(link => link.relation <= DEMOS_RELATION_HOSTILE_THRESHOLD || link.role === 'enemy').length,
    familyCount: links.filter(link => isFamilyRole(link.role)).length,
    traits,
    interests: buildInterests(snapshot, traits),
    favoriteWorkLabel: OCCUPATION_WORK_LABELS[snapshot.occupation],
    fearLabel: fear?.label,
    lastPostId: feed[0]?.postId,
    mentionsRecent: recentMentionCount(state, alifeId),
    dead: snapshot.dead,
  };
}

function alifeIdFromNpcEntity(npc: Entity): number | undefined {
  if (npc.alifeId !== undefined && Number.isInteger(npc.alifeId) && npc.alifeId > 0) return npc.alifeId;
  const id = npc.persistentNpcId;
  if (!id?.startsWith('alife:')) return undefined;
  const parsed = Number(id.slice('alife:'.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function canOpenDemosProfileForNpc(npc: Entity): boolean {
  return npc.type === EntityType.NPC && alifeIdFromNpcEntity(npc) !== undefined;
}

export function demosCursorForNpcProfile(state: GameState, npc: Entity): number | undefined {
  const alifeId = alifeIdFromNpcEntity(npc);
  if (alifeId === undefined) return undefined;
  const total = alifeNpcRecordCount(state);
  if (alifeId <= 0 || alifeId > total) return undefined;
  return getAlifeNpcRecordSnapshot(state, alifeId) ? alifeId - 1 : undefined;
}

export function getDemosProfileForNpcEntity(state: GameState, npc: Entity): DemosProfileDetails | undefined {
  const alifeId = alifeIdFromNpcEntity(npc);
  return alifeId === undefined ? undefined : getDemosProfileDetails(state, alifeId);
}

export function demosTraitContextTags(state: GameState, alifeId: number): readonly string[] {
  const out: string[] = [];
  const snapshot = getAlifeNpcRecordSnapshot(state, alifeId);
  if (snapshot) {
    for (const tag of characterAgeSexTags(snapshot.age, snapshot.sex)) {
      if (!out.includes(tag)) out.push(tag);
    }
  }
  for (const trait of getDemosTraitViews(state, alifeId)) {
    for (const tag of trait.tags) {
      if (out.length >= 12) return out;
      if (!out.includes(tag)) out.push(tag);
    }
  }
  return out;
}
