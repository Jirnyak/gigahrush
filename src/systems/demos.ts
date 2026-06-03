import {
  EntityType,
  Faction,
  FloorLevel,
  Occupation,
  type Entity,
  type GameState,
} from '../core/types';
import { PLOT_NPCS, type PlotNpcDef } from '../data/plot';
import { cleanFloorKey, floorKeyForStory, floorKeyZ } from './floor_keys';
import { currentFloorRunEntry } from './procedural_floors';
import {
  alifeNpcRecordCount,
  getAlifeNpcRecordSnapshot,
  type AlifeNpcSnapshot,
} from './alife';

export const DEMOS_SEARCH_MAX = 48;

const FACTION_LABELS: Record<Faction, string> = {
  [Faction.CITIZEN]: 'Граждане',
  [Faction.LIQUIDATOR]: 'Ликвидаторы',
  [Faction.CULTIST]: 'Культ',
  [Faction.SCIENTIST]: 'Учёные',
  [Faction.WILD]: 'Дикие',
  [Faction.PLAYER]: 'Игрок',
};

const OCCUPATION_LABELS: Record<Occupation, string> = {
  [Occupation.HOUSEWIFE]: 'домохозяйка',
  [Occupation.LOCKSMITH]: 'слесарь',
  [Occupation.SECRETARY]: 'секретарь',
  [Occupation.ELECTRICIAN]: 'электрик',
  [Occupation.COOK]: 'повар',
  [Occupation.DOCTOR]: 'врач',
  [Occupation.TURNER]: 'токарь',
  [Occupation.MECHANIC]: 'механик',
  [Occupation.STOREKEEPER]: 'кладовщик',
  [Occupation.ALCOHOLIC]: 'алкоголик',
  [Occupation.SCIENTIST]: 'учёный',
  [Occupation.CHILD]: 'ребёнок',
  [Occupation.DIRECTOR]: 'директор',
  [Occupation.TRAVELER]: 'путник',
  [Occupation.PILGRIM]: 'паломник',
  [Occupation.HUNTER]: 'охотник',
  [Occupation.PRIEST]: 'батюшка',
};

const FLOOR_LABELS: Record<FloorLevel, string> = {
  [FloorLevel.MINISTRY]: 'Министерство',
  [FloorLevel.KVARTIRY]: 'Квартиры',
  [FloorLevel.LIVING]: 'Жилая зона',
  [FloorLevel.MAINTENANCE]: 'Коллекторы',
  [FloorLevel.HELL]: 'Ад',
  [FloorLevel.VOID]: 'Пустота',
};

interface DemosJourneyLike {
  alifeId?: unknown;
  fromFloorKey?: unknown;
  toFloorKey?: unknown;
  floorKey?: unknown;
  etaAt?: unknown;
  status?: unknown;
  reason?: unknown;
}

interface DemosMobilityLike {
  alifeMobility?: {
    journeys?: Record<string, DemosJourneyLike>;
    pendingArrivals?: DemosJourneyLike[];
  };
  alifeMigration?: {
    journeys?: Record<string, DemosJourneyLike>;
    pendingArrivals?: DemosJourneyLike[];
  };
}

export interface DemosRelationBand {
  label: string;
  color: string;
}

export interface DemosProfile {
  alifeId: number;
  cursor: number;
  total: number;
  idLabel: string;
  plotIdLabel?: string;
  name: string;
  faction: Faction;
  factionLabel: string;
  occupation: Occupation;
  occupationLabel: string;
  level: number;
  relationScore: number;
  relationLabel: string;
  relationColor: string;
  locationLabel: string;
  statusLabel: string;
  questLabel: string;
  healthLabel: string;
  moneyLabel: string;
  karmaLabel: string;
  floorKey: string;
  sprite: number;
  npcVisualId?: string;
  spriteSeed: number;
  female: boolean;
  dead: boolean;
}

export interface DemosSnapshot {
  total: number;
  cursor: number;
  query: string;
  profile?: DemosProfile;
  notFound: boolean;
}

function wrap(value: number, total: number): number {
  return ((value % total) + total) % total;
}

function normalizeCursor(cursor: number, total: number): number {
  if (total <= 0) return 0;
  return wrap(Number.isFinite(cursor) ? Math.floor(cursor) : 0, total);
}

function safeLower(value: string): string {
  return value.toLocaleLowerCase('ru-RU');
}

function parseDemosAlifeId(query: string): number | undefined {
  const lower = safeLower(query.trim());
  const raw = lower.startsWith('alife:') ? lower.slice(6) : lower;
  if (!/^\d+$/.test(raw)) return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function cleanDemosSearchQuery(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, DEMOS_SEARCH_MAX);
}

export function applyDemosSearchText(query: string, input: string): string {
  let out = cleanDemosSearchQuery(query);
  for (const ch of input) {
    if (ch === '\b') out = out.slice(0, -1);
    else if (ch === '\x7f') out = '';
    else if (ch >= ' ' && ch !== '\x7f') out += ch;
    out = cleanDemosSearchQuery(out);
  }
  return out;
}

export function demosRelationBand(scoreInput: number): DemosRelationBand {
  const score = Math.max(-100, Math.min(100, Math.round(Number.isFinite(scoreInput) ? scoreInput : 0)));
  if (score < -75) return { label: 'ненавидит', color: '#ff3b4f' };
  if (score < -50) return { label: 'враг', color: '#ff6a3b' };
  if (score < -25) return { label: 'недруг', color: '#f09a38' };
  if (score < 0) return { label: 'холодное', color: '#d7b86a' };
  if (score < 25) return { label: 'нейтрально', color: '#b8c0a0' };
  if (score < 50) return { label: 'приятель', color: '#8fd47a' };
  if (score < 75) return { label: 'друг', color: '#51e08e' };
  return { label: 'любовь', color: '#ff7ad9' };
}

export function demosSnapshotMatchesQuery(snapshot: AlifeNpcSnapshot, queryInput: string): boolean {
  const query = cleanDemosSearchQuery(queryInput).trim();
  if (!query) return true;
  const alifeId = parseDemosAlifeId(query);
  if (alifeId !== undefined) return snapshot.id === alifeId;
  const lower = safeLower(query);
  if (lower.startsWith('plot:')) return safeLower(snapshot.plotNpcId ?? '').includes(lower.slice(5));
  if (safeLower(snapshot.name).includes(lower)) return true;
  if (safeLower(snapshot.reservedIdentityId ?? '').includes(lower)) return true;
  return snapshot.plotNpcId !== undefined && safeLower(snapshot.plotNpcId).includes(lower);
}

export function findDemosCursor(state: GameState, queryInput: string, preferredCursor = 0, direction = 1): number {
  const total = alifeNpcRecordCount(state);
  if (total <= 0) return 0;
  const query = cleanDemosSearchQuery(queryInput);
  const directId = parseDemosAlifeId(query);
  if (directId !== undefined) {
    const direct = getAlifeNpcRecordSnapshot(state, directId);
    if (direct && demosSnapshotMatchesQuery(direct, query)) return direct.id - 1;
  }

  const stepDir = direction < 0 ? -1 : 1;
  const start = normalizeCursor(preferredCursor, total);
  for (let step = 0; step < total; step++) {
    const cursor = wrap(start + step * stepDir, total);
    const snapshot = getAlifeNpcRecordSnapshot(state, cursor + 1);
    if (snapshot && demosSnapshotMatchesQuery(snapshot, query)) return cursor;
  }
  return start;
}

export function moveDemosCursor(state: GameState, cursor: number, direction: number, queryInput = ''): number {
  const total = alifeNpcRecordCount(state);
  if (total <= 0) return 0;
  const dir = direction < 0 ? -1 : 1;
  return findDemosCursor(state, queryInput, normalizeCursor(cursor, total) + dir, dir);
}

function liveEntityForAlifeId(entities: readonly Entity[], alifeId: number): Entity | undefined {
  return entities.find(e => e.type === EntityType.NPC && e.alive && e.alifeId === alifeId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanLabel(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 96) : '';
}

function demosFloorNumberLabel(z: number | undefined): string {
  return typeof z === 'number' && Number.isFinite(z) ? `Этаж ${Math.trunc(z)}` : '';
}

function demosFloorKeyZ(state: GameState, floorKeyInput: unknown, fallbackFloor?: FloorLevel): number | undefined {
  const key = cleanFloorKey(floorKeyInput);
  const host = state as GameState & { floorRun?: { specs?: Record<string, { z?: number; baseFloor?: FloorLevel }> } };
  return floorKeyZ(key, { proceduralSpecs: host.floorRun?.specs })
    ?? (fallbackFloor !== undefined ? floorKeyZ(floorKeyForStory(fallbackFloor)) : undefined);
}

function demosFloorKeyLabel(state: GameState, floorKeyInput: unknown, fallbackFloor?: FloorLevel): string {
  const key = cleanLabel(floorKeyInput);
  const floorNumber = demosFloorNumberLabel(demosFloorKeyZ(state, key, fallbackFloor));
  return floorNumber ? `${floorNumber} ${key || '?'}` : key;
}

function findMobilityLabel(state: GameState, alifeId: number): string {
  const host = state as GameState & DemosMobilityLike;
  const mobility = host.alifeMobility ?? host.alifeMigration;
  if (!mobility) return '';
  const journeys = mobility.journeys ? Object.values(mobility.journeys) : [];
  for (const raw of journeys) {
    if (!isRecord(raw) || raw.alifeId !== alifeId) continue;
    const from = demosFloorKeyLabel(state, raw.fromFloorKey);
    const to = demosFloorKeyLabel(state, raw.toFloorKey);
    const eta = typeof raw.etaAt === 'number' && Number.isFinite(raw.etaAt)
      ? `, ETA ${Math.max(0, Math.ceil(raw.etaAt - state.time))}с`
      : '';
    const status = raw.status === 'lost' ? 'потерян в пути' : 'в пути';
    return `${status}: ${from || '?'} -> ${to || '?'}${eta}`;
  }
  for (const raw of mobility.pendingArrivals ?? []) {
    if (!isRecord(raw) || raw.alifeId !== alifeId) continue;
    const to = demosFloorKeyLabel(state, raw.floorKey) || demosFloorKeyLabel(state, raw.toFloorKey);
    return `ожидает входа: ${to || '?'}`;
  }
  return '';
}

function locationLabel(state: GameState, entities: readonly Entity[], snapshot: AlifeNpcSnapshot): string {
  if (snapshot.dead) return 'нет в живых';
  const live = liveEntityForAlifeId(entities, snapshot.id);
  if (live) {
    const floorNumber = demosFloorNumberLabel(currentFloorRunEntry(state).z);
    return `${floorNumber ? `${floorNumber}, ` : ''}сейчас здесь, ${Math.floor(live.x)}:${Math.floor(live.y)}`;
  }
  const mobility = findMobilityLabel(state, snapshot.id);
  if (mobility) return mobility;
  const floor = FLOOR_LABELS[snapshot.floor] ?? `этаж ${snapshot.floor}`;
  const floorNumber = demosFloorNumberLabel(demosFloorKeyZ(state, snapshot.floorKey, snapshot.floor));
  const coords = Number.isFinite(snapshot.x) && Number.isFinite(snapshot.y)
    ? `, ${Math.floor(snapshot.x ?? 0)}:${Math.floor(snapshot.y ?? 0)}`
    : '';
  return `${floorNumber ? `${floorNumber}, ` : ''}${floor} / ${snapshot.floorKey}${coords}`;
}

function fallbackSpriteSeed(snapshot: AlifeNpcSnapshot): number {
  let h = (snapshot.id * 0x45d9f3b) >>> 0;
  for (let i = 0; i < snapshot.name.length; i++) {
    h ^= snapshot.name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= Math.imul(snapshot.occupation + 1, 0x9e3779b1);
  h ^= Math.imul(snapshot.faction + 1, 0x85ebca6b);
  return (h >>> 0) || 1;
}

function plotDefForSnapshot(snapshot: AlifeNpcSnapshot): PlotNpcDef | undefined {
  return snapshot.plotNpcId ? PLOT_NPCS[snapshot.plotNpcId] : undefined;
}

function demosProfileSprite(live: Entity | undefined, snapshot: AlifeNpcSnapshot, plotDef: PlotNpcDef | undefined): number {
  if (live?.sprite !== undefined) return live.sprite;
  if (plotDef && (snapshot.sprite === undefined || snapshot.sprite === snapshot.occupation)) return plotDef.sprite;
  return snapshot.sprite ?? plotDef?.sprite ?? snapshot.occupation;
}

function demosProfileVisualId(live: Entity | undefined, snapshot: AlifeNpcSnapshot, plotDef: PlotNpcDef | undefined): string | undefined {
  return live?.npcVisualId ?? snapshot.npcVisualId ?? plotDef?.npcVisualId;
}

function buildDemosProfile(
  state: GameState,
  entities: readonly Entity[],
  snapshot: AlifeNpcSnapshot,
  cursor: number,
  total: number,
): DemosProfile {
  const live = liveEntityForAlifeId(entities, snapshot.id);
  const plotDef = plotDefForSnapshot(snapshot);
  const relationScore = Math.round(live?.playerRelation ?? snapshot.playerRelation ?? 0);
  const relation = demosRelationBand(relationScore);
  const accountRubles = Math.max(0, Math.floor(live?.accountRubles ?? snapshot.accountRubles));
  const hp = Math.max(0, Math.round(live?.hp ?? snapshot.hp));
  const maxHp = Math.max(1, Math.round(live?.maxHp ?? snapshot.maxHp));
  const faction = live?.faction ?? snapshot.faction;
  const occupation = live?.occupation ?? snapshot.occupation;
  return {
    alifeId: snapshot.id,
    cursor,
    total,
    idLabel: `alife:${snapshot.id}`,
    plotIdLabel: snapshot.plotNpcId ? `plot:${snapshot.plotNpcId}` : undefined,
    name: live?.name ?? snapshot.name,
    faction,
    factionLabel: FACTION_LABELS[faction] ?? 'неизвестно',
    occupation,
    occupationLabel: OCCUPATION_LABELS[occupation] ?? 'житель',
    level: Math.max(1, Math.floor(live?.rpg?.level ?? snapshot.level)),
    relationScore,
    relationLabel: relation.label,
    relationColor: relation.color,
    locationLabel: locationLabel(state, entities, snapshot),
    statusLabel: snapshot.dead ? 'мертвый профиль' : live ? 'на активном этаже' : 'макро A-Life',
    questLabel: snapshot.canGiveQuest ? 'может дать дело' : 'заявок нет',
    healthLabel: `${hp}/${maxHp}`,
    moneyLabel: `${accountRubles}₽`,
    karmaLabel: String(Math.round(live?.karma ?? snapshot.karma)),
    floorKey: snapshot.floorKey,
    sprite: demosProfileSprite(live, snapshot, plotDef),
    npcVisualId: demosProfileVisualId(live, snapshot, plotDef),
    spriteSeed: snapshot.spriteSeed ?? fallbackSpriteSeed(snapshot),
    female: live?.isFemale ?? plotDef?.isFemale ?? snapshot.female,
    dead: snapshot.dead,
  };
}

export function getDemosSnapshot(
  state: GameState,
  entities: readonly Entity[],
  cursorInput = state.demosCursor,
  queryInput = state.demosSearch,
): DemosSnapshot {
  const total = alifeNpcRecordCount(state);
  const query = cleanDemosSearchQuery(queryInput);
  if (total <= 0) return { total: 0, cursor: 0, query, notFound: query.trim().length > 0 };

  let cursor = normalizeCursor(cursorInput, total);
  let snapshot = getAlifeNpcRecordSnapshot(state, cursor + 1);
  if (!snapshot || !demosSnapshotMatchesQuery(snapshot, query)) {
    return { total, cursor, query, notFound: query.trim().length > 0 };
  }
  return {
    total,
    cursor,
    query,
    profile: buildDemosProfile(state, entities, snapshot, cursor, total),
    notFound: false,
  };
}
