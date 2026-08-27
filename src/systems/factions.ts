/* ── Faction warfare system — cell territory control ─────────── */
/*   Cell-based territory map, local capture AI, faction events,   */
/*   and faction strength from territory.                          */

import {
  type Entity, type GameState,
  EntityType, AIGoal, Faction, ZoneFaction,
  type WorldEventSeverity, type WorldEventType,
} from '../core/types';
import { World } from '../core/world';
import { ITEMS } from '../data/catalog';
import { monsterHasAIFlag } from '../entities/monster';
import { occupationHasAnyProfileTag, occupationHasProfileTag } from '../data/occupation_profiles';
import {
  NPC_FACTION_ATTITUDE_SLOTS,
  RELATION_UNSET,
  getFactionRel,
} from '../data/relations';
import { addAlifeFactionAttitude, existingAlifeFactionAttitudes } from './alife';
import { isPsiMad, isPsiAlly } from './psi_state';
import { isPlayerEntity } from './player_actor';
import { recordFactionClashPlayerHit, updateFactionEvents } from './faction_events';
import { MAX_CARAVAN_LANES_PER_TICK, tickCaravans } from './caravans';
import { getRecentEvents, publishEvent } from './events';
import { getRecentNoiseRecords, type NoiseRecord } from './noise';
import { tryAssignPathToCell } from './ai/pathfinding';
import { ENTITY_MASK_NPC, getEntityIndex } from './entity_index';
import {
  countTerritoryCells,
  currentTerritoryZoneId,
  initializeCellTerritory,
  territoryOwnerAt,
  updateTerritoryCapture,
} from './territory';
import {
  QUEST_FACTION_RELATION_DELTA,
  RELATION_HOSTILE_THRESHOLD,
  addNpcPlayerRelation,
  isNpcPlayerHostile,
  setNpcPlayerRelation,
} from './npc_relations';
import { applyDemosRelationDelta, isDemosPersonalEnemy } from './demos_social';
import { addKarma } from './alife_rating';
import { isPassiveDefensiveNeutralMonster } from './monster_traits';

/* ── Faction relation accessors (dynamic — reads live matrix) ─── */
// Monsters use a fixed attitude, not tracked in the matrix
const FACTION_VS_MONSTER: number[] = [
  /* CITIZEN */ -100,
  /* LIQUID. */ -100,
  /* CULTIST */   50,
  /* SCIENTIST*/ -80,
  /* WILD    */ -100,
  /* PLAYER  */ -100,
];

/** Get dynamic faction-to-faction relation */
export function getFactionRelation(a: Faction, b: Faction): number {
  return getFactionRel(a, b);
}

/** Get faction-to-monster relation */
export function getFactionMonsterRelation(f: Faction): number {
  return FACTION_VS_MONSTER[f] ?? -100;
}

/** Check if two factions are hostile (base relation) */
export function areFactionsHostile(a: Faction, b: Faction): boolean {
  return getFactionRelation(a, b) <= RELATION_HOSTILE_THRESHOLD;
}

/**
 * Считает ли ЭТОТ конкретный смотрящий ту фракцию враждебной.
 *
 * Враждебность решается личным числом, а не общей матрицей: у каждой личности
 * A-Life своё отношение к каждой фракции, рождённое из базы таблицы плюс
 * индивидуальный разброс. Матрица осталась источником этой базы и продолжает
 * отвечать за всех, у кого личности нет вовсе, — за монстров, процедурных NPC,
 * игрока, — а также за столбцы сверх реальных фракций, где стоит
 * `RELATION_UNSET`.
 *
 * Одно чтение байта и одно сравнение: предикат самый горячий в игре.
 */
export function isSideHostileToFaction(viewer: Entity, viewerFaction: Faction, targetFaction: Faction): boolean {
  const alifeId = viewer.alifeId;
  const column = factionAttitudeColumn;
  if (alifeId !== undefined && alifeId > 0 && column !== undefined) {
    const offset = (alifeId - 1) * NPC_FACTION_ATTITUDE_SLOTS + targetFaction;
    if (offset < column.length) {
      const value = column[offset];
      if (value !== RELATION_UNSET) return value <= RELATION_HOSTILE_THRESHOLD;
    }
  }
  return areFactionsHostile(viewerFaction, targetFaction);
}

/* ── Личная вражда между людьми — ссылка на кадр ──────────────── */
// Социальный граф Демоса живёт в GameState, а isHostile зовётся из самого
// горячего скана боя и state не принимает. Ссылку подсовывают раз за кадр, как
// соседним AI-модулям (setPathContext / setCombatContext / setNpcContext).
// Без контекста личная вражда просто не читается: остаётся матрица фракций.
let socialContextState: GameState | undefined;
/* Тем же кадровым контекстом подсовывается колонка личных отношений к фракциям:
 * `isHostile` вызывается тысячами раз за кадр и не может лазить в состояние. */
let factionAttitudeColumn: Int8Array | undefined;

export function setFactionsSocialContext(state?: GameState): void {
  socialContextState = state;
  factionAttitudeColumn = state === undefined ? undefined : existingAlifeFactionAttitudes(state);
}

/**
 * Личная вражда одного человека к другому — по графу Демоса.
 *
 * ЭТО НЕ ПРИЗНАК ЦЕЛИ. Личная неприязнь меняет ПОВЕДЕНИЕ, а не убивает: сосед,
 * ненавидящий соседа, не помогает ему в драке, обходит его комнату, не торгует
 * с ним и в конце концов вызывает его на разборку (`systems/npc_feud.ts`), —
 * но не открывает огонь посреди коридора. Пока личный канал стоял внутри
 * `isHostile`, двое жителей ДРУЖЕСТВЕННЫХ фракций были друг для друга законной
 * боевой целью, и мир выедал сам себя без игрока и без монстров.
 *
 * Ребро направленное: встречное читается своим вызовом.
 */
export function isPersonalFeudEnemy(attacker: Entity, target: Entity): boolean {
  const state = socialContextState;
  if (state === undefined) return false;
  const from = attacker.alifeId;
  const to = target.alifeId;
  if (from === undefined || to === undefined) return false;
  return isDemosPersonalEnemy(state, from, to);
}

/** Состояние кадра для тех, кому личная вражда нужна вместе с остальным
 *  графом (разборки, лента). Тот же кадровый контекст, что у `isHostile`. */
export function factionsSocialContextState(): GameState | undefined {
  return socialContextState;
}

/* Монстр по умолчанию — экология, а не сторона: все три канала ниже отвечают за
 * него фиксированной таблицей FACTION_VS_MONSTER. Исключение объявляет ВИД
 * флагом `sided`, и только тогда читается его `faction`.
 *
 * Признаком стороны нельзя брать само наличие `faction`: поле общее для всех
 * сущностей, его проставляют мимоходом (так делают и тестовые фабрики), и вся
 * обычная экология молча переехала бы на человеческие правила. Флаг вида —
 * решение автора монстра, а не побочный эффект чужого кода. */
function factionedMonsterSide(e: Entity): Faction | undefined {
  if (e.type !== EntityType.MONSTER) return undefined;
  return monsterHasAIFlag(e, 'sided') ? e.faction : undefined;
}

/**
 * Одна ли сторона у двоих.
 *
 * Сторона — не поле `faction`: оно есть у всех и проставляется мимоходом. У
 * человека сторона и есть его фракция, у монстра — только объявленная флагом
 * `sided`; обычная экология стороной не является никому, кроме такой же
 * экологии. Отсюда и читается «свой»: внутри одной стороны удар не делает
 * врагом — там вражда идёт только личным каналом, — а между разными делает.
 */
export function areSameSide(a: Entity, b: Entity): boolean {
  return combatSideOf(a) === combatSideOf(b);
}

/**
 * Сторона актора в счёте отношений — или её отсутствие.
 *
 * У человека и у игрока сторона есть всегда, у монстра — только объявленная
 * флагом `sided`. Обычная экология стороны НЕ имеет, и это ответ, а не пробел:
 * укус крысы не портит жителям мнение о диких, а очередь по гнилушке не
 * ссорит стрелка ни с кем. Через это отсутствие закон «насилие двигает
 * репутацию» сам отсекает всю экологию, и списка исключений ему не нужно.
 */
export function combatSideOf(e: Entity): Faction | undefined {
  return e.type === EntityType.MONSTER ? factionedMonsterSide(e) : (e.faction ?? Faction.CITIZEN);
}

/** Check if entity considers another entity hostile */
export function isHostile(attacker: Entity, target: Entity): boolean {
  // PSI control: controlled entities don't attack their controller (and vice-versa)
  if (isPsiAlly(attacker, target)) return false;
  // Monsters are one ecology faction. They can compete through movement/space, but not through combat hostility.
  // Отсекается только пара «экология против экологии»: стоит одной стороне быть
  // объявленной (`sided`), как она уже член фракции, и вражду решают каналы ниже.
  if (attacker.type === EntityType.MONSTER && target.type === EntityType.MONSTER
    && factionedMonsterSide(attacker) === undefined && factionedMonsterSide(target) === undefined) return false;
  // PSI madness: mad entities attack everyone
  if (isPsiMad(attacker)) return target.id !== attacker.id;
  if (isPassiveDefensiveNeutralMonster(attacker) || isPassiveDefensiveNeutralMonster(target)) return false;
  if (isPlayerEntity(target) && attacker.id !== target.id) {
    if (attacker.type === EntityType.MONSTER) {
      const side = factionedMonsterSide(attacker);
      return side !== undefined
        ? areFactionsHostile(side, Faction.PLAYER)
        : getFactionMonsterRelation(Faction.PLAYER) <= RELATION_HOSTILE_THRESHOLD;
    }
    if (attacker.type === EntityType.NPC && isNpcPlayerHostile(attacker)) return true;
    return areFactionsHostile(attacker.faction ?? Faction.CITIZEN, Faction.PLAYER);
  }
  // Monsters: use faction-vs-monster table
  if (attacker.type === EntityType.MONSTER) {
    // Monsters are hostile to everyone except cultists
    const tFaction = target.faction ?? Faction.CITIZEN;
    const side = factionedMonsterSide(attacker);
    if (side === undefined) return getFactionMonsterRelation(tFaction) <= RELATION_HOSTILE_THRESHOLD;
    // Сторонний монстр — член фракции целиком, а не только против людей: против
    // ОБЫЧНОЙ экологии он читает ту же таблицу «фракция-монстры», что человек
    // его фракции. Иначе боец-ликвидатор проходил бы мимо тени, которую тот же
    // ликвидатор-человек атакует.
    if (target.type === EntityType.MONSTER && factionedMonsterSide(target) === undefined) {
      return getFactionMonsterRelation(side) <= RELATION_HOSTILE_THRESHOLD;
    }
    return isSideHostileToFaction(attacker, side, tFaction);
  }
  // Черный ликвидатор выглядит как свой: настоящие ликвидаторы не поднимают
  // тревогу, пока он не ударил первым. Состояния для этого не нужно — ударив,
  // он попадёт в память угрозы жертвы (`notifyActorDamaged`), и та ответит
  // через `forcedTarget` в обход этой проверки.
  if (target.type === EntityType.MONSTER
    && monsterHasAIFlag(target, 'looksLiquidator')
    && (attacker.faction ?? Faction.CITIZEN) === Faction.LIQUIDATOR) {
    return false;
  }
  if (target.type === EntityType.MONSTER) {
    const aFaction = attacker.faction ?? Faction.CITIZEN;
    const side = factionedMonsterSide(target);
    return side !== undefined
      ? isSideHostileToFaction(attacker, aFaction, side)
      : getFactionMonsterRelation(aFaction) <= RELATION_HOSTILE_THRESHOLD;
  }
  // Symmetric personal channel: an NPC personally hostile to the player (they
  // already attack, see the target-is-player branch) reads as hostile FROM the
  // player too, even when the faction matrix was befriended in this run
  // (e.g. a WILD-faction invader vs a host who allied with the wilds).
  if (isPlayerEntity(attacker) && target.type === EntityType.NPC && isNpcPlayerHostile(target)) {
    return true;
  }
  // NPC vs NPC / Player
  const aFaction = attacker.faction ?? Faction.CITIZEN;
  const bFaction = target.faction ?? Faction.CITIZEN;
  // Дальше — личное число смотрящего к фракции цели, и оно направленное: житель
  // может считать врагом ликвидатора, которому сам врагом не кажется. Личная
  // неприязнь к ЧЕЛОВЕКУ боевой целью по-прежнему НЕ делает — см.
  // `isPersonalFeudEnemy`. Ответ на удар с чужой стороны идёт мимо этой
  // проверки, через боевую память (`notifyActorDamaged` → `forcedTarget`).
  return isSideHostileToFaction(attacker, aFaction, bFaction);
}

export interface FactionZoneUiSnapshot {
  zoneId: number;
  x: number;
  y: number;
  level: number;
  owner: ZoneFaction;
  dominant: ZoneFaction;
  ownerShare: number;
  dominantShare: number;
  pressure: number;
  contested: boolean;
  recentEventCount: number;
  lastEventSeverity: WorldEventSeverity;
  lastEventTime: number;
}

export interface FactionOwnerUiSnapshot {
  faction: ZoneFaction;
  cells: number;
  fronts: number;
}

export interface FactionRecentEventUiSnapshot {
  id: number;
  time: number;
  z: number;
  zoneId: number;
  x: number;
  y: number;
  type: WorldEventType;
  severity: WorldEventSeverity;
  name: string;
  phase: string;
  text: string;
  actorFaction?: Faction;
  targetFaction?: Faction;
}

export interface FactionUiSnapshot {
  time: number;
  z: number;
  zones: FactionZoneUiSnapshot[];
  zoneById: (FactionZoneUiSnapshot | undefined)[];
  owners: FactionOwnerUiSnapshot[];
  contestedZones: number;
  recentEvents: FactionRecentEventUiSnapshot[];
}

const ZONE_UI_FACTIONS = [
  ZoneFaction.CITIZEN,
  ZoneFaction.LIQUIDATOR,
  ZoneFaction.CULTIST,
  ZoneFaction.SCIENTIST,
  ZoneFaction.WILD,
  ZoneFaction.SAMOSBOR,
] as const;
const UI_CONTESTED_PRESSURE = 0.22;
const UI_DOMINANT_CONTESTED_SHARE = 0.28;
const UI_RECENT_EVENT_LIMIT = 8;
const UI_IDLE_REFRESH_SEC = 4;
const UI_OPEN_REFRESH_SEC = 1;
let factionUiSnapshot: FactionUiSnapshot | undefined;
let factionUiSnapshotAccum = 0;

export function getFactionUiSnapshot(): FactionUiSnapshot | undefined {
  return factionUiSnapshot;
}

function factionEventString(data: Record<string, unknown> | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value : '';
}

function refreshFactionUiSnapshot(world: World, state: GameState): void {
  const zones: FactionZoneUiSnapshot[] = [];
  const zoneById: (FactionZoneUiSnapshot | undefined)[] = [];
  const ownerCounts = new Map<ZoneFaction, FactionOwnerUiSnapshot>();
  for (const faction of ZONE_UI_FACTIONS) ownerCounts.set(faction, { faction, cells: 0, fronts: 0 });

  let contestedZones = 0;
  for (const row of countTerritoryCells(world, 4)) {
    const owner = ownerCounts.get(row.owner);
    if (owner) owner.cells = row.cells;
  }
  for (const zone of world.zones) {
    if (!zone) continue;

    const counts = zone.territoryCounts;
    let owner = territoryOwnerAt(world, zone.cx, zone.cy);
    let ownerCount = counts && owner < counts.length ? counts[owner] : 0;
    let strongest = owner;
    let strongestCount = ownerCount;
    let pressureOwner = owner;
    let pressureCount = 0;
    let sampled = 0;

    if (counts) {
      for (let i = 0; i < counts.length; i++) {
        const count = counts[i];
        sampled += count;
        if (count > strongestCount) {
          strongestCount = count;
          strongest = i as ZoneFaction;
        }
        if (i !== owner && count > pressureCount) {
          pressureCount = count;
          pressureOwner = i as ZoneFaction;
        }
      }

      if (sampled > 0 && ownerCount === 0) {
        owner = strongest;
        ownerCount = strongestCount;
        pressureOwner = owner;
        pressureCount = 0;
        for (let i = 0; i < counts.length; i++) {
          const count = counts[i];
          if (i !== owner && count > pressureCount) {
            pressureCount = count;
            pressureOwner = i as ZoneFaction;
          }
        }
      }
    }

    const ownerShare = sampled > 0 ? ownerCount / sampled : 1;
    const dominantShare = sampled > 0 ? pressureCount / sampled : 0;
    const pressure = dominantShare;
    const contested = owner !== ZoneFaction.SAMOSBOR
      && sampled > 0
      && (pressure >= UI_CONTESTED_PRESSURE || (pressureOwner !== owner && dominantShare >= UI_DOMINANT_CONTESTED_SHARE));

    const row: FactionZoneUiSnapshot = {
      zoneId: zone.id,
      x: zone.cx,
      y: zone.cy,
      level: zone.level ?? 1,
      owner,
      dominant: pressureOwner,
      ownerShare,
      dominantShare,
      pressure,
      contested,
      recentEventCount: 0,
      lastEventSeverity: 0,
      lastEventTime: -Infinity,
    };
    zones.push(row);
    zoneById[zone.id] = row;
    const ownerRow = ownerCounts.get(owner);
    if (ownerRow) {
      if (contested) ownerRow.fronts++;
    }
    if (contested) contestedZones++;
  }

  const recentEvents = getRecentEvents(state, { tags: ['faction_event'], limit: UI_RECENT_EVENT_LIMIT }).map(event => {
    const zoneId = event.zoneId ?? -1;
    const zone = zoneId >= 0 ? zoneById[zoneId] : undefined;
    if (event.z === state.currentZ && zone) {
      zone.recentEventCount++;
      if (event.severity > zone.lastEventSeverity) zone.lastEventSeverity = event.severity;
      if (event.time >= zone.lastEventTime) zone.lastEventTime = event.time;
    }
    return {
      id: event.id,
      time: event.time,
      z: event.z,
      zoneId,
      x: event.x ?? zone?.x ?? 0,
      y: event.y ?? zone?.y ?? 0,
      type: event.type,
      severity: event.severity,
      name: factionEventString(event.data, 'name'),
      phase: factionEventString(event.data, 'phase'),
      text: factionEventString(event.data, 'residueText') || factionEventString(event.data, 'text'),
      actorFaction: event.actorFaction,
      targetFaction: event.targetFaction,
    };
  });

  factionUiSnapshot = {
    time: state.time,
    z: state.currentZ,
    zones,
    zoneById,
    owners: ZONE_UI_FACTIONS.map(faction => ownerCounts.get(faction) ?? { faction, cells: 0, fronts: 0 }),
    contestedZones,
    recentEvents,
  };
}

/* ── Initialize per-cell faction control ─────────────────────── */
export function initFactionControl(world: World): void {
  initializeCellTerritory(world);
}

let activityAccum = 0;
const NOISE_PATROL_EVENT_LIMIT = 6;
const NOISE_PATROL_COOLDOWN_S = 8;
const NOISE_PATROL_RADIUS = 44;
const NOISE_PATROL_RESPONDERS_PER_EVENT = 3;
const NOISE_PATROL_ENTITY_SCAN_CAP = 360;
const lastNoisePatrolResponseAt = new Map<string, number>();
const noisePatrolQuery: Entity[] = [];

export function updateFactionCapture(world: World, entities: Entity[], dt: number, state?: GameState): void {
  updateTerritoryCapture(world, entities, state, dt);
}

export function updateFactionActivity(
  world: World,
  entities: Entity[],
  player: Entity,
  state: GameState,
  nextId: { v: number },
  dt: number,
  allowSpawns = true,
): void {
  activityAccum += dt;
  if (activityAccum < 1) return;
  const elapsed = activityAccum;
  activityAccum = 0;
  updateNoisePatrolResponse(world, entities, state);
  updateFactionEvents(state, world, player, entities, nextId, elapsed, allowSpawns);
  tickCaravans(state, elapsed, false, MAX_CARAVAN_LANES_PER_TICK, world, entities, nextId);
  factionUiSnapshotAccum += elapsed;
  const uiRefreshSec = state.showFactions ? UI_OPEN_REFRESH_SEC : UI_IDLE_REFRESH_SEC;
  if (!factionUiSnapshot || factionUiSnapshot.z !== state.currentZ || factionUiSnapshotAccum >= uiRefreshSec) {
    factionUiSnapshotAccum = 0;
    refreshFactionUiSnapshot(world, state);
  }
}

function canRespondToNoise(e: Entity): boolean {
  if (!e.alive || e.type !== EntityType.NPC || !e.ai || e.faction === undefined) return false;
  return e.faction === Faction.LIQUIDATOR ||
    e.faction === Faction.CULTIST ||
    e.faction === Faction.WILD ||
    occupationHasAnyProfileTag(e.occupation, ['combat', 'patrol']) ||
    e.isTraveler === true ||
    occupationHasProfileTag(e.occupation, 'traveler');
}

function noiseZoneId(world: World, record: NoiseRecord): number {
  return currentTerritoryZoneId(world, record.x, record.y);
}

function shouldRespondToNoise(state: GameState, zoneId: number, record: NoiseRecord): boolean {
  const key = `${state.currentZ}:${zoneId}:${record.source}`;
  const last = lastNoisePatrolResponseAt.get(key) ?? -Infinity;
  // `last <= state.time` guards an in-session restart: initGame resets state.time
  // to 0 while this module Map persists, so a stale future timestamp would wrongly
  // suppress responses. Time is monotonic within a run, so this never changes normal play.
  if (last <= state.time && state.time - last < NOISE_PATROL_COOLDOWN_S) return false;
  lastNoisePatrolResponseAt.set(key, state.time);
  return true;
}

function sendNoisePatrol(world: World, _entities: Entity[], record: NoiseRecord): number {
  let responders = 0;
  const tx = Math.floor(record.x);
  const ty = Math.floor(record.y);
  getEntityIndex().queryRadiusCapped(record.x, record.y, NOISE_PATROL_RADIUS, noisePatrolQuery, ENTITY_MASK_NPC, NOISE_PATROL_ENTITY_SCAN_CAP);
  for (const e of noisePatrolQuery) {
    if (responders >= NOISE_PATROL_RESPONDERS_PER_EVENT) break;
    if (!canRespondToNoise(e)) continue;
    if (record.actorId !== undefined && e.id === record.actorId) continue;
    const ai = e.ai!;
    ai.goal = AIGoal.HUNT;
    ai.combatScanCd = 0;
    ai.timer = 4 + responders;
    tryAssignPathToCell(world, e, tx, ty);
    responders++;
  }
  noisePatrolQuery.length = 0;
  return responders;
}

function updateNoisePatrolResponse(world: World, entities: Entity[], state: GameState): void {
  const records = getRecentNoiseRecords(state, { minSeverity: 3, limit: NOISE_PATROL_EVENT_LIMIT }, state.time);
  for (const record of records) {
    if (record.source === 'footstep') continue;
    const zoneId = noiseZoneId(world, record);
    if (!shouldRespondToNoise(state, zoneId, record)) continue;
    const responders = sendNoisePatrol(world, entities, record);
    if (responders <= 0) continue;
    publishEvent(state, {
      type: 'faction_event',
      zoneId,
      x: record.x,
      y: record.y,
      actorId: record.actorId,
      actorFaction: record.actorFaction,
      itemId: record.itemId,
      itemName: record.itemId ? ITEMS[record.itemId]?.name ?? record.itemId : undefined,
      severity: record.severity,
      privacy: 'local',
      tags: ['faction_event', 'noise_response', record.source, 'patrol'],
      data: {
        name: 'Патруль на шум',
        phase: 'patrol_response',
        text: 'Патруль пошёл на шум.',
        source: record.source,
        responders,
        noiseId: record.id,
      },
    });
  }
}

/** Recalculate which faction owns each zone based on cell majority.
 *  Only checks zones in the given set (those that had cells flipped). */
/* ── Apply damage relation penalty between factions ──────────── */
/** Штраф отношений за удар: −1 за каждые пять урона, но не меньше единицы. */
export function damageRelationPenalty(damage: number): number {
  return -Math.max(1, Math.floor(damage / 5));
}

/**
 * Двинуть личное отношение человека к игроку.
 *
 * Один накопитель: дельта уходит в граф Демоса, живая сущность зеркалит
 * результат. Две независимые прибавки к одному числу давали разный итог в
 * зависимости от того, когда игрок ушёл с этажа.
 */
function addPlayerRelationDelta(state: GameState | undefined, npc: Entity, delta: number): void {
  const applied = state && npc.alifeId !== undefined
    ? applyDemosRelationDelta(state, npc.alifeId, { targetKind: 'player' }, delta, { reasonTag: 'damage' })
    : undefined;
  if (applied) setNpcPlayerRelation(npc, applied.relation);
  else addNpcPlayerRelation(npc, delta);
}

/**
 * Во сколько раз смерть весомее удара.
 *
 * Одно число на оба канала свидетеля — и на личную ячейку к фракции обидчика, и
 * на личное отношение к игроку, — потому что факт один: «при мне убили» против
 * «при мне ударили». Четвёрка выбрана по расстоянию до порога вражды: сосед
 * жителя смотрит на ликвидаторов с +48, до вражды ему 112 шагов, то есть
 * двадцать восемь увиденных убийств. Резня в жилом блоке разворачивает квартал
 * против её автора, одиночный труп — нет.
 */
export const WITNESS_KILL_WEIGHT = 4;

/**
 * Свидетель видел насилие — и помнит того, кто его учинил.
 *
 * Платит свидетель половину цены жертвы: он видел, а не почувствовал (тем же
 * шагом, что и разница «замечена кража» против «выявлена ревизией»). Кого
 * считать свидетелем, решает вызывающий: у него уже есть радиусный запрос и
 * комната, и второго запроса на удар мы не делаем.
 *
 * Канала два, потому что у отношения к игроку и отношения к фракции разные
 * хранилища, а не разные законы: сторона `PLAYER` синтетическая, её членов
 * помнят личным числом `playerRelation`, все прочие — своей ячейкой к фракции.
 * В восемь ячеек `Faction.PLAYER` писать нельзя, там нет такого столбца.
 *
 * Своя фракция не двигается: она принадлежность, а не мнение.
 */
export function applyWitnessedViolencePenalty(
  state: GameState | undefined,
  witness: Entity,
  attackerSide: Faction,
  damage: number,
  killed: boolean,
): number {
  if ((witness.faction ?? Faction.CITIZEN) === attackerSide) return 0;
  const weight = killed ? WITNESS_KILL_WEIGHT : 1;
  if (attackerSide === Faction.PLAYER) {
    const penalty = Math.min(-1, Math.round(damageRelationPenalty(damage) / 2)) * weight;
    addPlayerRelationDelta(state, witness, penalty);
    return penalty;
  }
  if (!state || witness.alifeId === undefined) return 0;
  const penalty = -QUEST_FACTION_RELATION_DELTA * weight;
  return addAlifeFactionAttitude(state, witness.alifeId, attackerSide, penalty) === undefined ? 0 : penalty;
}

/**
 * Чем удар платит отношениям.
 *
 * Закон один на всех: атакующий — это ЕГО ФРАКЦИЯ, и только. Отдельного пути
 * для игрока здесь больше нет; единственное, что осталось от прежних шести
 * веток «атакующий — игрок», — запись в ГЛОБАЛЬНУЮ матрицу, и это решение с
 * замером, а не недосмотр (см. ниже).
 */
export function applyDamageRelationPenalty(
  attackerFaction: Faction | undefined, targetFaction: Faction | undefined,
  damage: number,
  target?: Entity,
  attacker?: Entity,
  state?: GameState,
): void {
  if (attackerFaction === undefined || targetFaction === undefined) return;
  if (attackerFaction === targetFaction) return;

  const wasFactionEnemy = areFactionsHostile(attackerFaction, targetFaction);
  /* «Он и так меня ненавидел» — довод не только игрока. У жертвы-человека
   * личная вражда к обидчику читается тем же графом Демоса, каким читается
   * вражда к игроку; раньше эту ветку спрашивали только для `Faction.PLAYER`,
   * и удар по своему давнему врагу стоил NPC кармы, а игроку — нет. */
  const wasPersonalEnemy = target !== undefined && (
    attackerFaction === Faction.PLAYER
      ? target.type === EntityType.NPC && isNpcPlayerHostile(target)
      : attacker !== undefined && isPersonalFeudEnemy(target, attacker)
  );
  const wasNonEnemy = !wasFactionEnemy && !wasPersonalEnemy;
  const penalty = damageRelationPenalty(damage);
  if (attackerFaction === Faction.PLAYER && target?.type === EntityType.NPC) {
    addPlayerRelationDelta(state, target, penalty);
  } else if (state && target?.type === EntityType.NPC && attacker?.type === EntityType.NPC && target.alifeId !== undefined && attacker.alifeId !== undefined) {
    applyDemosRelationDelta(state, target.alifeId, { targetKind: 'alife', targetAlifeId: attacker.alifeId }, penalty, {
      reasonTag: 'damage',
    });
  }
  /* Насилие — цена МЕСТНАЯ, и ничья больше. Глобальную матрицу фракций бой не
   * двигает ни от чьей руки, включая игрока: она общая на все этажи, и одна
   * драка объявляла войну везде разом (замер `simulation.md`, «Политика
   * фракций»: 64 → −64 между жителями и ликвидаторами за десять секунд, 690
   * смертей из 2175 за 90 с). Раньше исключение было ровно одно — игрок, «единственный
   * намеренный агент», — и оно же было последним местом, где закон «игрок —
   * просто NPC» не выполнялся: у игрока имелся канал, которого нет ни у кого.
   *
   * Что осталось у фракции как у целого: кражи (`applyTheftRelationPenalty`),
   * память комнат, инфраструктура, пропуска и поручения. То есть договор и
   * имущество — а не трупы. Трупы помнят те, кто их видел.
   *
   * Карма — не матрица: это личный счёт бьющего, и он общий для всех. */
  if (wasNonEnemy && attacker) {
    addKarma(attacker, -Math.max(1, Math.min(4, Math.floor(damage / 20) || 1)));
  }
}

/**
 * Чем удар платит отношениям — одно место на все пути урона.
 *
 * Зовётся ТОЛЬКО из единой двери урона (`systems/combat_stimulus.ts`,
 * `damageActor`), и решает всё по одному признаку: кто ударил и какой он
 * стороны. Шести веток «атакующий — игрок» не осталось ни одной. Глобальную
 * матрицу бой не двигает больше НИ ОТ ЧЬЕЙ руки: насилие стало ценой местной,
 * и платят за него те, кто был рядом.
 *
 * Единственная запись, спрашивающая про игрока, — выбор стороны в фракционной
 * стычке (`recordFactionClashPlayerHit`), и она не про репутацию: это ход
 * СЮЖЕТА. Запись говорит, кому игрок помог, и по ней считается развязка
 * стычки; у NPC такой записи нет и быть не может — стычку разрешает не он.
 *
 * Стороны берутся у `combatSideOf`, поэтому вся обычная экология выпадает из
 * закона сама: у монстра без флага `sided` стороны нет.
 */
export function applyCombatRelationOutcome(
  world: World,
  state: GameState | undefined,
  attacker: Entity,
  victim: Entity,
  damage: number,
): void {
  applyDamageRelationPenalty(combatSideOf(attacker), combatSideOf(victim), damage, victim, attacker, state);
  if (state && isPlayerEntity(attacker)) recordFactionClashPlayerHit(state, world, attacker, victim, damage);
}

/* ── Фронт: кто идёт давить ────────────────────────────────────────
 *
 * Отправителя здесь больше нет. Пока у ядра актора не было веса захвата, людей
 * на фронт отпускала эта функция: раз в такт активности она сама считала цель
 * за каждого бойца, сама сверяла совпадения и сама назначала путь. Это был
 * ВТОРОЙ источник цели поверх ядра — тот самый случай «маршрут честно есть, а
 * движения нет», когда актора тянут двое.
 *
 * Теперь захват — обычный драйв (`systems/actor/drives.ts`, `capture`): цель
 * даёт та же перепись фронта, намерение объявляется каждый такт, а рейд
 * получается из совпадения независимых решений, как и раньше. Порог согласия
 * не нужен отдельной ручкой — его роль играет физика места: клетку
 * переворачивает только перевес своих (`CAPTURE_MIN_PRESSURE`), и он же стоит
 * в контексте драйва.
 */
