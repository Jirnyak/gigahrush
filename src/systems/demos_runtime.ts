/* ── Инфосеть Демос: один конвейер вместо трёх модулей ─────────────
 *
 * Было три файла, и они выстраивались в цепочку с ЕДИНСТВЕННЫМ вызывающим у
 * каждого звена: такт кадра звал разбор событий, тот — режиссёра ленты. Наружу
 * кластера не торчал ни один из трёх. Это не три системы, а три этапа одной, и
 * держать их врозь стоило только лишних границ.
 *
 * Слияние сразу вскрыло дефект, который врозь был невидим: две функции с одним
 * именем `positiveId` и РАЗНЫМ поведением. Разбор — у самой функции ниже.
 *
 * Порядок сохранён: разбор событий → режиссёр ленты → заметки доски → такт кадра.
 */

import {
  type Entity,
  EntityType,
  type GameState,
  WORLD_EVENT_IMPORTANT_CAPACITY,
  type WorldEvent,
  msg,
} from '../core/types';
import {
  type World,
} from '../core/world';
import {
  type AlifeNpcSnapshot,
  currentAlifeFloorKey,
  getAlifeNpcRecordSnapshot,
  sampleAlifeFloorRecordIds,
} from './alife';
import {
  registerContentRuntimeHook,
} from './content_hooks';
import {
  DEMOS_REACTION_DELTA_MAX,
  DEMOS_REACTION_DELTA_MIN,
  type DemosPersistentPost,
  type DemosPersistentReaction,
  type DemosRelationOverride,
  type DemosSocialSaveState,
  createEmptyDemosSocialSaveState,
} from './demos_save';
import {
  type DemosRelationDeltaResult,
  type DemosRelationDeltaTarget,
  applyDemosRelationDelta,
  getDemosNpcOnlySocialEdges,
} from './demos_social';
import {
  type DemosOutgoingSocialEdge,
  type DemosPostAuthorFact,
  chooseDemosReactionKind,
  createDemosPostQueue,
  enqueueDemosPostFromEvent,
} from './demos_posts';
import {
  refreshDemosQuestNoticesFromSnapshots,
} from './demos_quest_notices';
import {
  WORLD_EVENT_IMPORTANT_SEVERITY,
  compareEventPriority,
  getImportantEvents,
  getRecentEvents,
  publishEvent,
} from './events';
import {
  registerDebugCommand,
} from './debug_registry';
import {
  DEMOS_EDGE_DEBT,
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FAMILY,
  DEMOS_EDGE_FRIEND,
  DEMOS_SOCIAL_NPC_SLOTS,
  DEMOS_SOCIAL_OVERRIDE_CAP,
  RELATION_FRIENDLY_THRESHOLD,
} from '../data/demos_social';
import {
  type AlifeMigrationReason,
} from '../data/alife_migration';
import {
  DEMOS_EDGE_HIDDEN,
  DEMOS_EDGE_QUEST,
  DEMOS_PERSISTENT_POST_CAP,
  DEMOS_PERSISTENT_REACTION_CAP,
  DEMOS_REACTIONS_PER_POST_CAP,
  type DemosReactionKind,
} from '../data/demos_posts';
import {
  type DemosSocialVisitReason,
  demosSocialVisitIntent,
} from '../data/demos_social_visits';
import {
  isPlotNpc,
} from '../data/plot';
import {
  type AlifeJourney,
  ensureAlifeMobilityState,
  startActiveAlifeDeparture,
} from './alife_migration';
import {
  cleanFloorKey,
  floorKeyAllowsNpcs,
  floorKeyKnown,
} from './floor_keys';
import {
  isNativePlayerBodyEntity,
  isPlayerEntity,
} from './player_actor';
import {
  clampRelation,
} from '../data/relations';
import {
  hash32,
} from '../core/rand';

export interface DemosSocialFeedbackSummary {
  processedEvents: number;
  relationChanges: number;
  publishedEvents: number;
  lastEventId: number;
}

export interface DemosSocialFeedbackOptions {
  events?: readonly WorldEvent[];
  maxEvents?: number;
  maxOutcomes?: number;
  maxOutcomesPerEvent?: number;
  maxDeathEdges?: number;
  ignoreCursor?: boolean;
}

export interface DemosSocialJourneyOptions {
  world?: World;
  entities?: Entity[];
  activeFloorKey?: string;
  allowPlotOrReserved?: boolean;
  preferredX?: number;
  preferredY?: number;
  travelSeconds?: number;
}

interface DemosSocialFeedbackState {
  version: 1;
  lastEventId: number;
  lastJourneyTick: number;
  lastSummary?: DemosSocialFeedbackSummary;
}

type DemosSocialFeedbackHost = GameState & {
  demosSocialFeedback?: DemosSocialFeedbackState;
  floorRun?: { specs?: Record<string, { z?: number }> };
};

const DEFAULT_EVENT_LIMIT = 24;
// Ответ круга близких — не «до четырёх реакций»: у смерти столько последствий,
// сколько у человека было связей. Кап остаётся как граница работы за тик,
// но одну смерть он резать не вправе.
const DEFAULT_OUTCOME_LIMIT = 32;
const DEFAULT_OUTCOME_PER_EVENT = DEMOS_SOCIAL_NPC_SLOTS;
// Все связи убитого, а не выборка: слотов у человека столько, и молча
// отбрасывать чью-то потерю нельзя.
const DEFAULT_DEATH_EDGE_LIMIT = DEMOS_SOCIAL_NPC_SLOTS;

function ensureFeedbackState(state: GameState): DemosSocialFeedbackState {
  const host = state as DemosSocialFeedbackHost;
  if (host.demosSocialFeedback?.version === 1) return host.demosSocialFeedback;
  host.demosSocialFeedback = {
    version: 1,
    lastEventId: 0,
    lastJourneyTick: -1,
  };
  return host.demosSocialFeedback;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

/* «Нет id» обязано читаться как НЕТ, а не как единица.
 *
 * Здесь стоял `clampInt(value, 0, 1, 0x7fffffff)`, а у `clampInt` третий
 * аргумент — МИНИМУМ: отсутствующее поле подтягивалось к 1 и возвращалось как
 * настоящий номер. Слот 1 — не пустое место, это первая сюжетная личность
 * (Марко Лоло), и вся социальная обратная связь от событий без `actorAlifeId`
 * приписывалась ему.
 *
 * Хуже того, цепочка `actorAlifeId ?? killerAlifeId ?? helperAlifeId ??
 * giverAlifeId` из-за этого не проваливалась НИКОГДА: первый поиск всегда
 * возвращал единицу, и три остальных были мёртвым кодом. */
function positiveId(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const id = Math.trunc(value);
  return id > 0 ? Math.min(id, 0x7fffffff) : undefined;
}

function eventData(event: WorldEvent): Record<string, unknown> {
  return event.data ?? {};
}

function dataId(event: WorldEvent, key: string): number | undefined {
  return positiveId(eventData(event)[key]);
}

function actorAlifeId(event: WorldEvent): number | undefined {
  return dataId(event, 'actorAlifeId')
    ?? dataId(event, 'killerAlifeId')
    ?? dataId(event, 'helperAlifeId')
    ?? dataId(event, 'giverAlifeId');
}

function targetAlifeId(event: WorldEvent): number | undefined {
  return dataId(event, 'targetAlifeId')
    ?? dataId(event, 'victimAlifeId')
    ?? dataId(event, 'ownerAlifeId')
    ?? dataId(event, 'giverAlifeId')
    ?? dataId(event, 'reactorAlifeId');
}

function hasTag(event: WorldEvent, ...tags: string[]): boolean {
  return tags.some(tag => event.tags.includes(tag));
}

function isDeathEvent(event: WorldEvent): boolean {
  return event.type === 'npc_kill_npc' || event.type === 'player_kill_npc' || event.type === 'death_seen';
}

function isTheftOrDebtEvent(event: WorldEvent): boolean {
  return event.type === 'item_stolen' ||
    event.type === 'container_looted' ||
    event.type === 'ration_coupon_stolen' ||
    hasTag(event, 'theft', 'debt', 'witness');
}

function isHelpEvent(event: WorldEvent): boolean {
  return hasTag(event, 'help', 'rescue', 'shelter') ||
    event.type === 'gnilushka_delivered' ||
    event.type === 'shelter_tally_handled';
}

function isPositiveReactionEvent(event: WorldEvent): boolean {
  return hasTag(event, 'positive_reaction', 'thanks', 'gratitude');
}

function isThreatReactionEvent(event: WorldEvent): boolean {
  return hasTag(event, 'mock', 'threat', 'revenge');
}

function importantDelta(delta: number, relation: number, previous: number): boolean {
  if (Math.abs(delta) >= 8) return true;
  if (previous < RELATION_FRIENDLY_THRESHOLD && relation >= RELATION_FRIENDLY_THRESHOLD) return true;
  return false;
}

function publishSocialConsequence(
  state: GameState,
  event: WorldEvent,
  result: DemosRelationDeltaResult,
  reason: string,
): boolean {
  if (!result.changed || !importantDelta(result.delta, result.relation, result.previous)) return false;
  publishEvent(state, {
    type: 'rumor_observed',
    severity: Math.abs(result.delta) >= 12 ? 3 : 2,
    privacy: 'private',
    tags: ['demos_social', 'social_consequence', reason],
    data: {
      sourceEventId: event.id,
      fromAlifeId: result.fromAlifeId,
      targetAlifeId: result.targetAlifeId,
      delta: result.delta,
      relation: result.relation,
      reason,
    },
  });
  return true;
}

function applyFeedbackDelta(
  state: GameState,
  event: WorldEvent,
  fromAlifeId: number | undefined,
  toAlifeId: number | undefined,
  delta: number,
  flags: number,
  reason: string,
  budget: { remaining: number; published: number },
  opts: { toPlayer?: boolean; propagate?: boolean } = {},
): number {
  if (budget.remaining <= 0 || fromAlifeId === undefined) return 0;
  const target: DemosRelationDeltaTarget = opts.toPlayer
    ? { targetKind: 'player' }
    : { targetKind: 'alife', targetAlifeId: toAlifeId };
  if (!opts.toPlayer && (toAlifeId === undefined || fromAlifeId === toAlifeId)) return 0;
  const result = applyDemosRelationDelta(state, fromAlifeId, target, delta, {
    flags,
    reasonTag: reason,
    propagate: opts.propagate,
  });
  if (!result?.changed) return 0;
  budget.remaining--;
  if (publishSocialConsequence(state, event, result, reason)) budget.published++;
  return 1;
}

/**
 * Ответ круга близких на причинённый им вред.
 *
 * Одна дверь на смерть и на избиение, потому что закон один: цена — ровно то,
 * чем пострадавший БЫЛ для оставшегося. Любил на всю шкалу — столько же и
 * отнимется у обидчика; ненавидел — столько же прибавится. Ни деления, ни
 * отдельных ставок за родню и друзей: вес связи и есть ставка, а «близость» —
 * просто её величина.
 *
 * Отличаются только два входа, и оба — свойства СОБЫТИЯ, а не второй закон:
 *
 * - `share` — какая доля человека отнята. У смерти это единица. У удара — доля
 *   снятого здоровья, поэтому полполоски стоит половины связи, и слабый со
 *   сильным платят одинаково за одинаковое горе.
 * - «узнали ли вообще». О смерти узнают по телу, поэтому она доходит всегда.
 *   Об ударе — только через ОЧЕВИДЦА: избить человека наедине по-прежнему
 *   ничего не стоит в глазах тех, кто его любит, и это решение владельца
 *   (2026-09-12), а не недосмотр.
 */
function processHarmFeedback(
  state: GameState,
  event: WorldEvent,
  budget: { remaining: number; published: number },
  maxEdges: number,
  share: number,
): number {
  const victimAlifeId = targetAlifeId(event);
  if (victimAlifeId === undefined || share <= 0) return 0;
  // Игрок в графе — не запись A-Life, а собственный слот, поэтому обидчик им
  // опознаётся по типу события, а не по id.
  const offenderIsPlayer = event.type.startsWith('player_');
  const offenderAlifeId = actorAlifeId(event);
  if (!offenderIsPlayer && offenderAlifeId === undefined) return 0;
  let changed = 0;
  let scanned = 0;
  for (const edge of getDemosNpcOnlySocialEdges(state, victimAlifeId)) {
    if (scanned >= maxEdges || budget.remaining <= 0) break;
    scanned++;
    if (edge.targetAlifeId === undefined || edge.targetAlifeId === offenderAlifeId) continue;
    const delta = Math.round(-edge.relation * share);
    if (delta === 0) continue;
    changed += applyFeedbackDelta(
      state,
      event,
      edge.targetAlifeId,
      offenderAlifeId,
      delta,
      0,
      delta < 0 ? 'bond_revenge' : 'bond_relief',
      budget,
      // Только прямые связи пострадавшего: расходиться дальше по знакомым весть не должна.
      { toPlayer: offenderIsPlayer, propagate: false },
    );
  }
  return changed;
}

/** Доля здоровья, снятая ударом; её считает публикатор события, у которого тело
 *  в руках. Без очевидца круг об ударе не узнаёт вовсе. */
function witnessedHurtShare(event: WorldEvent): number {
  if (event.type !== 'player_hurt_npc' && event.type !== 'npc_hurt_npc') return 0;
  const data = event.data as { witnesses?: unknown; hpShare?: unknown; killed?: unknown } | undefined;
  // Добивающий удар платит кругу как СМЕРТЬ и только один раз: событие смерти
  // выходит тем же кадром и несёт полный вес связи.
  if (data?.killed === true) return 0;
  const witnesses = typeof data?.witnesses === 'number' ? data.witnesses : 0;
  if (!(witnesses > 0)) return 0;
  const share = typeof data?.hpShare === 'number' ? data.hpShare : 0;
  return Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
}

function processEventFeedback(
  state: GameState,
  event: WorldEvent,
  budget: { remaining: number; published: number },
  opts: Required<Pick<DemosSocialFeedbackOptions, 'maxOutcomesPerEvent' | 'maxDeathEdges'>>,
): number {
  if (event.tags.includes('demos_social')) return 0;
  const before = budget.remaining;
  const localBudget = {
    remaining: Math.min(budget.remaining, opts.maxOutcomesPerEvent),
    published: 0,
  };
  let changed = 0;
  const actor = actorAlifeId(event);
  const target = targetAlifeId(event);

  if (isDeathEvent(event)) changed += processHarmFeedback(state, event, localBudget, opts.maxDeathEdges, 1);
  else changed += processHarmFeedback(state, event, localBudget, opts.maxDeathEdges, witnessedHurtShare(event));
  if (event.type === 'quest_completed' || event.type === 'contract_completed') {
    changed += applyFeedbackDelta(state, event, target, actor, 6, DEMOS_EDGE_QUEST | DEMOS_EDGE_FRIEND, 'quest_gratitude', localBudget);
  }
  if (isHelpEvent(event)) {
    changed += applyFeedbackDelta(state, event, target, actor, 5, DEMOS_EDGE_FRIEND, 'help_gratitude', localBudget);
  }
  if (isPositiveReactionEvent(event)) {
    changed += applyFeedbackDelta(state, event, actor, target, 3, DEMOS_EDGE_FRIEND, 'positive_reaction', localBudget);
  }
  if (isTheftOrDebtEvent(event)) {
    changed += applyFeedbackDelta(state, event, target, actor, -6, DEMOS_EDGE_DEBT | DEMOS_EDGE_ENEMY, 'theft_debt', localBudget);
  }
  if (isThreatReactionEvent(event)) {
    changed += applyFeedbackDelta(state, event, actor, target, -5, DEMOS_EDGE_ENEMY, 'threat_reaction', localBudget);
  }

  budget.remaining = before - changed;
  budget.published += localBudget.published;
  return changed;
}

export function processDemosSocialFeedbackEvents(
  state: GameState,
  opts: DemosSocialFeedbackOptions = {},
): DemosSocialFeedbackSummary {
  const feedback = ensureFeedbackState(state);
  const maxEvents = clampInt(opts.maxEvents, DEFAULT_EVENT_LIMIT, 1, 64);
  const budget = {
    remaining: clampInt(opts.maxOutcomes, DEFAULT_OUTCOME_LIMIT, 1, 32),
    published: 0,
  };
  // Тот же порядок, что у ленты: бюджет последствий тоже узкий, и смерть должна
  // добраться до круга близких раньше, чем его выест рутина.
  const events = (opts.events ?? getRecentEvents(state, { limit: maxEvents }))
    .slice()
    .sort(compareEventPriority);
  let processedEvents = 0;
  let relationChanges = 0;
  let lastEventId = feedback.lastEventId;
  for (const event of events) {
    if (processedEvents >= maxEvents || budget.remaining <= 0) break;
    if (!opts.ignoreCursor && event.id <= feedback.lastEventId) continue;
    processedEvents++;
    relationChanges += processEventFeedback(state, event, budget, {
      maxOutcomesPerEvent: clampInt(opts.maxOutcomesPerEvent, DEFAULT_OUTCOME_PER_EVENT, 1, 16),
      maxDeathEdges: clampInt(opts.maxDeathEdges, DEFAULT_DEATH_EDGE_LIMIT, 1, 16),
    });
    if (event.id > lastEventId) lastEventId = event.id;
  }
  feedback.lastEventId = Math.max(feedback.lastEventId, lastEventId);
  feedback.lastSummary = {
    processedEvents,
    relationChanges,
    publishedEvents: budget.published,
    lastEventId: feedback.lastEventId,
  };
  return feedback.lastSummary;
}

function proceduralSpecsContext(state: GameState): { proceduralSpecs?: Readonly<Record<string, { z?: number }>> } {
  const specs = (state as DemosSocialFeedbackHost).floorRun?.specs;
  return { proceduralSpecs: specs as Readonly<Record<string, { z?: number }>> | undefined };
}

function activeEntityForAlifeId(entities: readonly Entity[] | undefined, alifeId: number): Entity | undefined {
  return entities?.find(entity => entity.alive && entity.type === EntityType.NPC && entity.alifeId === alifeId);
}

function routeAllowsNpcDestination(state: GameState, floorKey: string): boolean {
  const context = proceduralSpecsContext(state);
  if (!floorKeyKnown(floorKey, context)) return false;
  return floorKeyAllowsNpcs(floorKey, context) !== false;
}

function ordinaryRecordAllowed(record: AlifeNpcSnapshot, allowPlotOrReserved: boolean): boolean {
  if (record.dead) return false;
  if (!allowPlotOrReserved && (record.plotNpcId !== undefined || record.reservedKind || record.reservedIdentityId === 'player')) return false;
  return true;
}

function activeEntityAllowed(state: GameState, entity: Entity | undefined): boolean {
  if (!entity) return true;
  if (isPlayerEntity(entity) || isNativePlayerBodyEntity(entity) || entity.persistentNpcId === 'player') return false;
  if (isPlotNpc(entity)) return false;
  if (entity.questId !== undefined && entity.questId !== -1) return false;
  if (entity.canGiveQuest === true) return false;
  if (state.showNpcMenu && state.npcMenuTarget === entity.id) return false;
  return true;
}

function migrationRiskForReason(reason: AlifeMigrationReason): 1 | 2 | 3 | 4 | 5 {
  if (reason === 'refugee' || reason === 'samosbor') return 4;
  if (reason === 'faction' || reason === 'quest') return 3;
  return 2;
}

function journeyAlreadyExists(state: GameState, alifeId: number): boolean {
  const mobility = ensureAlifeMobilityState(state);
  if (mobility.activeDepartures.some(item => item.alifeId === alifeId)) return true;
  if (mobility.pendingArrivals.some(item => item.alifeId === alifeId)) return true;
  return Object.values(mobility.journeys).some(item => item.alifeId === alifeId && item.status === 'in_transit');
}

function travelSecondsFor(record: AlifeNpcSnapshot, def: ReturnType<typeof demosSocialVisitIntent>, opts: DemosSocialJourneyOptions): number {
  if (opts.travelSeconds !== undefined) return clampInt(opts.travelSeconds, def.minTravelSeconds, 1, 3600);
  const span = Math.max(0, def.maxTravelSeconds - def.minTravelSeconds);
  const jitter = span > 0 ? (record.id * 1103515245 >>> 0) % (span + 1) : 0;
  return def.minTravelSeconds + jitter;
}

function enqueueDemosJourney(
  state: GameState,
  record: AlifeNpcSnapshot,
  toFloorKey: string,
  reason: DemosSocialVisitReason,
  opts: DemosSocialJourneyOptions,
): boolean {
  const def = demosSocialVisitIntent(reason);
  const mobility = ensureAlifeMobilityState(state);
  const id = `demos_social_${mobility.nextJourneySeq++}`;
  const risk = migrationRiskForReason(def.migrationReason);
  const journey: AlifeJourney = {
    id,
    alifeId: record.id,
    fromFloorKey: record.floorKey,
    toFloorKey,
    intentId: def.intentId,
    reason: def.migrationReason,
    laneId: `${record.floorKey}->${toFloorKey}`,
    risk,
    startedAt: state.time,
    etaAt: state.time + travelSecondsFor(record, def, opts),
    status: 'in_transit',
  };
  mobility.journeys[id] = journey;
  publishEvent(state, {
    type: 'alife_migration',
    severity: 2,
    privacy: 'private',
    actorName: record.name,
    actorFaction: record.faction,
    tags: [...def.tags, 'alife_migration', 'migration'].slice(0, 8),
    data: {
      alifeId: record.id,
      fromFloorKey: record.floorKey,
      toFloorKey,
      intentId: def.intentId,
      reason: def.migrationReason,
      journeyId: id,
      source: 'demos_social',
    },
  });
  return true;
}

export function requestDemosSocialJourney(
  state: GameState,
  fromAlifeId: number,
  toFloorKeyInput: string,
  reason: DemosSocialVisitReason,
  opts: DemosSocialJourneyOptions = {},
): boolean {
  const feedback = ensureFeedbackState(state);
  if (feedback.lastJourneyTick === state.tick) return false;
  const toFloorKey = cleanFloorKey(toFloorKeyInput);
  if (!toFloorKey || !routeAllowsNpcDestination(state, toFloorKey)) return false;
  const def = demosSocialVisitIntent(reason);
  if (state.samosborActive && !def.allowDuringSamosbor) return false;
  const record = getAlifeNpcRecordSnapshot(state, fromAlifeId);
  if (!record || !ordinaryRecordAllowed(record, opts.allowPlotOrReserved === true)) return false;
  if (record.floorKey === toFloorKey) return false;
  if (journeyAlreadyExists(state, record.id)) return false;

  const activeFloorKey = cleanFloorKey(opts.activeFloorKey) || currentAlifeFloorKey(state);
  const activeEntity = activeEntityForAlifeId(opts.entities, record.id);
  if (!activeEntityAllowed(state, activeEntity)) return false;
  let ok = false;
  if (record.floorKey === activeFloorKey) {
    if (!activeEntity || !opts.world) return false;
    ok = startActiveAlifeDeparture(state, opts.world, activeEntity, toFloorKey, def.intentId, def.migrationReason);
  } else {
    ok = enqueueDemosJourney(state, record, toFloorKey, reason, opts);
  }
  if (!ok) return false;
  feedback.lastJourneyTick = state.tick;
  return true;
}

export const DEMOS_EVENT_SCAN_PER_TICK_CAP = 32;
export const DEMOS_POSTS_PER_TICK_CAP = 8;
export const DEMOS_REACTIONS_PER_TICK_CAP = 32;

/* Узкий двойник `DemosRelationDeltaTarget` снят 2026-09-10 при слиянии: у
 * режиссёра ленты он объявлял только `alife`, а настоящий в `demos_social`
 * умеет и `player`. Две РАЗНЫХ формы под одним именем врозь не были видны;
 * стоило файлам сойтись — компилятор показал их за секунду. */

export interface DemosRelationDeltaMeta {
  reasonTag: string;
  postId?: number;
  reactionId?: number;
}

export type ApplyDemosRelationDelta = (
  state: GameState,
  fromAlifeId: number,
  target: DemosRelationDeltaTarget,
  delta: number,
  meta: DemosRelationDeltaMeta,
) => void;

export interface DemosSocialDirectorOptions {
  now?: number;
  seedSalt?: number;
  maxEvents?: number;
  maxPosts?: number;
  maxReactions?: number;
  allowPrivateEvents?: boolean;
  fallbackAuthorAlifeIds?: readonly number[];
  alifeIdForEntityId?: (entityId: number) => number | undefined;
  snapshotForAlifeId?: (alifeId: number) => DemosPostAuthorFact | undefined;
  outgoingEdgesForAlifeId?: (authorAlifeId: number) => readonly DemosOutgoingSocialEdge[];
  relationForPair?: (fromAlifeId: number, targetAlifeId: number) => number | undefined;
  applyRelationDelta?: ApplyDemosRelationDelta;
  gameState?: GameState;
}

export interface DemosSocialDirectorResult {
  eventsConsumed: number;
  /* Сколько из разобранного было важным. Нужно вызывающему, чтобы отличить
   * законный недобор рутины от потери смерти. */
  importantConsumed: number;
  postsCreated: number;
  reactionsCreated: number;
  repliesCreated: number;
  relationDeltas: number;
  eventCursor: number;
}

function intIn(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}



function clampDelta(value: number): number {
  return Math.max(DEMOS_REACTION_DELTA_MIN, Math.min(DEMOS_REACTION_DELTA_MAX, Math.trunc(value)));
}

export function demosReactionRelationDelta(kind: DemosReactionKind): number {
  switch (kind) {
    case 'like': return 2;
    case 'help': return 3;
    case 'grief': return 1;
    case 'joke': return 1;
    case 'rumor': return 0;
    case 'fear': return -1;
    case 'dislike': return -2;
    case 'anger': return -4;
    case 'threat': return -6;
  }
}

function pushPost(state: DemosSocialSaveState, post: DemosPersistentPost): void {
  state.posts.push(post);
  while (state.posts.length > DEMOS_PERSISTENT_POST_CAP) state.posts.shift();
  const validPostIds = new Set(state.posts.map(saved => saved.id));
  state.reactions = state.reactions.filter(reaction => validPostIds.has(reaction.postId));
}

function pushReaction(state: DemosSocialSaveState, reaction: DemosPersistentReaction): void {
  state.reactions.push(reaction);
  while (state.reactions.length > DEMOS_PERSISTENT_REACTION_CAP) state.reactions.shift();
}

function relationOverrideIndex(
  overrides: readonly DemosRelationOverride[],
  fromAlifeId: number,
  targetAlifeId: number,
): number {
  return overrides.findIndex(override =>
    override.fromAlifeId === fromAlifeId
    && override.targetKind === 'alife'
    && override.targetAlifeId === targetAlifeId);
}

function applyRelationDelta(
  social: DemosSocialSaveState,
  fromAlifeId: number,
  targetAlifeId: number,
  deltaInput: number,
  reaction: DemosPersistentReaction,
  opts: DemosSocialDirectorOptions,
): boolean {
  const delta = clampDelta(deltaInput);
  if (delta === 0) return false;
  const existingIndex = relationOverrideIndex(social.relationOverrides, fromAlifeId, targetAlifeId);
  const existing = existingIndex >= 0 ? social.relationOverrides[existingIndex] : undefined;
  const base = existing?.value ?? opts.relationForPair?.(fromAlifeId, targetAlifeId) ?? 0;
  const value = clampRelation(base + delta);
  const next: DemosRelationOverride = {
    fromAlifeId,
    targetKind: 'alife',
    targetAlifeId,
    value,
    updatedAt: reaction.createdAt,
    reasonTag: 'demos_reaction',
    postId: reaction.postId,
    reactionId: reaction.id,
  };
  if (existingIndex >= 0) social.relationOverrides[existingIndex] = next;
  else social.relationOverrides.push(next);
  while (social.relationOverrides.length > DEMOS_SOCIAL_OVERRIDE_CAP) social.relationOverrides.shift();

  opts.applyRelationDelta?.(
    opts.gameState ?? ({} as GameState),
    fromAlifeId,
    { targetKind: 'alife', targetAlifeId },
    delta,
    { reasonTag: 'demos_reaction', postId: reaction.postId, reactionId: reaction.id },
  );
  return true;
}

function canReplyToPost(post: DemosPersistentPost, kind: DemosReactionKind): boolean {
  if (post.parentPostId !== undefined) return false;
  return kind === 'help' || kind === 'grief' || kind === 'anger' || kind === 'threat';
}

function createReplyPost(
  social: DemosSocialSaveState,
  post: DemosPersistentPost,
  reactorAlifeId: number,
  kind: DemosReactionKind,
  seed: number,
  now: number,
): DemosPersistentPost {
  return {
    id: social.nextPostId++,
    authorAlifeId: reactorAlifeId,
    createdAt: now,
    floorKey: post.floorKey,
    sourceEventId: post.sourceEventId,
    parentPostId: post.id,
    templateId: post.templateId,
    seed: hash32(post.seed, reactorAlifeId, seed),
    args: post.args.slice(0),
    mentionedAlifeIds: [post.authorAlifeId, ...(post.mentionedAlifeIds ?? [])]
      .filter((id, index, ids) => id !== reactorAlifeId && ids.indexOf(id) === index)
      .slice(0, 4),
    privacy: post.privacy,
    tags: [...post.tags, 'reply', `reaction.${kind}`].slice(0, 8),
    score: 0,
  };
}

function persistentPostFromTransient(post: ReturnType<typeof enqueueDemosPostFromEvent>): DemosPersistentPost | undefined {
  if (!post) return undefined;
  return {
    id: post.id,
    authorAlifeId: post.authorAlifeId,
    createdAt: post.createdAt,
    floorKey: post.floorKey,
    sourceEventId: post.sourceEventId,
    parentPostId: post.parentPostId,
    templateId: post.templateId,
    seed: post.seed,
    args: post.args.slice(0),
    mentionedAlifeIds: post.mentionedAlifeIds?.slice(0, 4),
    privacy: post.privacy ?? 'public',
    tags: post.tags.slice(0, 8),
    score: post.score ?? 0,
  };
}

function eventAllowed(event: WorldEvent, allowPrivateEvents: boolean): boolean {
  return allowPrivateEvents || (event.privacy !== 'private' && event.privacy !== 'secret');
}

export function runDemosSocialDirector(
  social: DemosSocialSaveState,
  events: readonly WorldEvent[],
  opts: DemosSocialDirectorOptions = {},
): DemosSocialDirectorResult {
  const maxEvents = intIn(opts.maxEvents, DEMOS_EVENT_SCAN_PER_TICK_CAP, 0, DEMOS_EVENT_SCAN_PER_TICK_CAP);
  const maxPosts = intIn(opts.maxPosts, DEMOS_POSTS_PER_TICK_CAP, 0, DEMOS_POSTS_PER_TICK_CAP);
  const maxReactions = intIn(opts.maxReactions, DEMOS_REACTIONS_PER_TICK_CAP, 0, DEMOS_REACTIONS_PER_TICK_CAP);
  const result: DemosSocialDirectorResult = {
    eventsConsumed: 0,
    importantConsumed: 0,
    postsCreated: 0,
    reactionsCreated: 0,
    repliesCreated: 0,
    relationDeltas: 0,
    eventCursor: social.eventCursor,
  };
  if (maxEvents <= 0 || maxPosts <= 0) return result;

  /* Разбор идёт по важности, а не по свежести: постов за такт всего `maxPosts`,
   * и рутина не вправе занять их раньше смерти. Потребитель забирает ПРЕФИКС
   * этого порядка — на этом стоит счётчик потерь в `demos_runtime`. */
  const fresh = events
    .filter(event => event.id > social.eventCursor)
    .slice()
    .sort(compareEventPriority)
    .slice(0, maxEvents);

  for (const event of fresh) {
    if (result.postsCreated + result.repliesCreated >= maxPosts) break;
    result.eventsConsumed++;
    if (event.severity >= WORLD_EVENT_IMPORTANT_SEVERITY) result.importantConsumed++;
    social.eventCursor = Math.max(social.eventCursor, event.id);
    result.eventCursor = social.eventCursor;
    if (!eventAllowed(event, opts.allowPrivateEvents === true)) continue;

    const queue = createDemosPostQueue(1);
    queue.lastSourceEventId = event.id - 1;
    queue.nextId = social.nextPostId;
    const transient = enqueueDemosPostFromEvent(queue, event, {
      now: opts.now,
      seedSalt: opts.seedSalt,
      allowPrivateEvents: opts.allowPrivateEvents,
      fallbackAuthorAlifeIds: opts.fallbackAuthorAlifeIds,
      alifeIdForEntityId: opts.alifeIdForEntityId,
      snapshotForAlifeId: opts.snapshotForAlifeId,
    });
    const post = persistentPostFromTransient(transient);
    if (!post) continue;
    social.nextPostId = Math.max(social.nextPostId, queue.nextId);
    pushPost(social, post);
    result.postsCreated++;

    const edges = opts.outgoingEdgesForAlifeId?.(post.authorAlifeId) ?? [];
    const seenReactors = new Set<number>();
    let repliesForPost = 0;
    for (
      let i = 0;
      i < edges.length
      && i < DEMOS_REACTIONS_PER_POST_CAP * 2
      && result.reactionsCreated < maxReactions;
      i++
    ) {
      const edge = edges[i];
      const reactorAlifeId = positiveId(edge.targetAlifeId);
      if (reactorAlifeId === undefined || reactorAlifeId === post.authorAlifeId || seenReactors.has(reactorAlifeId)) continue;
      if (((edge.flags ?? 0) & DEMOS_EDGE_HIDDEN) !== 0) continue;
      seenReactors.add(reactorAlifeId);
      const seed = hash32(post.seed, reactorAlifeId, edge.flags ?? 0);
      const kind = chooseDemosReactionKind(post, edge, seed);
      const relationDelta = clampDelta(demosReactionRelationDelta(kind));
      const reaction: DemosPersistentReaction = {
        id: social.nextReactionId++,
        postId: post.id,
        reactorAlifeId,
        createdAt: opts.now ?? post.createdAt,
        kind,
        relationDelta,
        flags: edge.flags,
      };
      pushReaction(social, reaction);
      result.reactionsCreated++;
      if (applyRelationDelta(social, reactorAlifeId, post.authorAlifeId, relationDelta, reaction, opts)) {
        result.relationDeltas++;
      }
      if (
        repliesForPost === 0
        && result.postsCreated + result.repliesCreated < maxPosts
        && canReplyToPost(post, kind)
      ) {
        pushPost(social, createReplyPost(social, post, reactorAlifeId, kind, seed, opts.now ?? post.createdAt));
        result.repliesCreated++;
        repliesForPost++;
      }
    }
  }
  return result;
}

const DEMOS_RUNTIME_TICK_SECONDS = 30;
const DEMOS_RUNTIME_RECORDS_PER_TICK = 64;
const DEMOS_RUNTIME_EVENT_LIMIT = 64;
const DEMOS_RUNTIME_OUTCOMES_PER_TICK = 4;
const DEMOS_RUNTIME_POSTS_PER_TICK = 4;
const DEMOS_RUNTIME_REACTIONS_PER_TICK = 4;

interface DemosRuntimeState {
  version: 1;
  acc: number;
  /* Событий, мимо которых курсор ленты прыгнул, не разобрав. Молчаливый
   * отброс — то, из-за чего пропажа смертей прожила незамеченной, поэтому
   * счётчик есть всегда, а не под флагом. Живёт только в рантайме: в сейв
   * диагностика не едет. */
  dropped: number;
  droppedImportant: number;
  seen: number;
  consumed: number;
  lastSummary?: {
    posts: number;
    reactions: number;
    notices: number;
    feedback: number;
    journeyRequested: boolean;
    consumed: number;
    dropped: number;
  };
}

type DemosRuntimeHost = GameState & {
  demosSocial?: DemosSocialSaveState;
  demosRuntime?: DemosRuntimeState;
};

function ensureDemosSocialState(state: GameState): DemosSocialSaveState {
  const host = state as DemosRuntimeHost;
  if (!host.demosSocial || host.demosSocial.version !== 1) host.demosSocial = createEmptyDemosSocialSaveState();
  return host.demosSocial;
}

function ensureDemosRuntimeState(state: GameState): DemosRuntimeState {
  const host = state as DemosRuntimeHost;
  if (host.demosRuntime?.version === 1) return host.demosRuntime;
  host.demosRuntime = { version: 1, acc: 0, dropped: 0, droppedImportant: 0, seen: 0, consumed: 0 };
  return host.demosRuntime;
}

function liveAlifeIdByEntityId(entities: readonly Entity[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const entity of entities) {
    if (entity.alive && entity.alifeId !== undefined) out.set(entity.id, entity.alifeId);
  }
  return out;
}

function sampleCurrentFloorSnapshots(state: GameState, social: DemosSocialSaveState): AlifeNpcSnapshot[] {
  const floorKey = currentAlifeFloorKey(state);
  const sampled = sampleAlifeFloorRecordIds(state, floorKey, social.cursor, DEMOS_RUNTIME_RECORDS_PER_TICK);
  social.cursor = sampled.nextCursor;
  return sampled.ids
    .map(id => getAlifeNpcRecordSnapshot(state, id))
    .filter((snapshot): snapshot is AlifeNpcSnapshot => !!snapshot);
}

/**
 * Что лента разбирает за такт.
 *
 * `getRecentEvents` отдаёт САМЫЕ СВЕЖИЕ непрочитанные, и на живом этаже их
 * втрое-вчетверо больше бюджета: всё, что не влезло в окно, курсор потом
 * перепрыгивал. Терялись при этом не «лишние» события, а любые, — в том числе
 * смерти людей, пока в ленту лезла рутина.
 *
 * Поэтому окно собирается из двух готовых колец, а не из одного: сперва кольцо
 * `importantEvents` (в него ложится всё от `WORLD_EVENT_IMPORTANT_SEVERITY`,
 * смерть человека — 4), затем свежая рутина добором. Третьего механизма для
 * этого не заводится: разделение колец в `events.ts` уже ровно про это.
 */
function recentDemosEvents(state: GameState, cursor: number): WorldEvent[] {
  /* Кольцо отдаётся свежим вперёд, а разбирать надо СТАРОЕ вперёд: курсор
   * помнит максимум разобранного, и взятая «верхушка» накрыла бы им хвост
   * очереди. Хвост тут — самые давние непрочитанные смерти. */
  const pending = getImportantEvents(state, WORLD_EVENT_IMPORTANT_CAPACITY).filter(event => event.id > cursor);
  const out = pending.length > DEMOS_RUNTIME_EVENT_LIMIT ? pending.slice(-DEMOS_RUNTIME_EVENT_LIMIT) : pending;
  const seen = out.length > 0 ? new Set(out.map(event => event.id)) : undefined;
  for (const event of getRecentEvents(state, { sinceId: cursor, limit: DEMOS_RUNTIME_EVENT_LIMIT })) {
    if (seen?.has(event.id)) continue;
    out.push(event);
  }
  return out;
}

/**
 * Важных событий, которые курсор накрыл за такт. Накрытое и не разобранное
 * потеряно навсегда: следующий такт отбирает по `id > cursor`.
 *
 * Считается по САМОМУ КОЛЬЦУ важного, а не по окну такта, и уже после разбора.
 * Иначе счётчик проверял бы выборку её же глазами: выпади важное из окна — оно
 * и из проверки выпало бы, и потеря снова стала бы молчаливой.
 */
function countImportantPassed(events: readonly WorldEvent[], from: number, to: number): number {
  let n = 0;
  for (const event of events) {
    if (event.severity < WORLD_EVENT_IMPORTANT_SEVERITY) continue;
    if (event.id > from && event.id <= to) n++;
  }
  return n;
}

function requestOneSocialJourney(
  state: GameState,
  world: World,
  entities: Entity[],
  snapshots: readonly AlifeNpcSnapshot[],
): boolean {
  const activeFloorKey = currentAlifeFloorKey(state);
  for (const snapshot of snapshots) {
    for (const edge of getDemosNpcOnlySocialEdges(state, snapshot.id)) {
      const targetId = edge.targetAlifeId;
      if (targetId === undefined) continue;
      const target = getAlifeNpcRecordSnapshot(state, targetId);
      if (!target || target.dead || target.floorKey === snapshot.floorKey) continue;
      const reason = (edge.flags & DEMOS_EDGE_FAMILY) !== 0
        ? 'family_visit'
        : edge.relation < -64
          ? 'conflict_visit'
          : 'social_visit';
      if (requestDemosSocialJourney(state, snapshot.id, target.floorKey, reason, {
        world,
        entities,
        activeFloorKey,
      })) return true;
    }
  }
  return false;
}

function outgoingSocialEdgesForAlifeId(state: GameState, alifeId: number): readonly DemosOutgoingSocialEdge[] {
  return getDemosNpcOnlySocialEdges(state, alifeId)
    .filter((edge): edge is typeof edge & { targetAlifeId: number } => edge.targetAlifeId !== undefined)
    .map(edge => ({
      targetAlifeId: edge.targetAlifeId,
      relation: edge.relation,
      flags: edge.flags,
    }));
}

registerContentRuntimeHook({
  id: 'demos_social_runtime',
  phases: ['floor_activity'],
  update: ({ state, entities, world, dt, gameOver }) => {
    if (gameOver) return;
    const runtime = ensureDemosRuntimeState(state);
    runtime.acc += Math.max(0, dt);
    if (runtime.acc < DEMOS_RUNTIME_TICK_SECONDS) return;
    runtime.acc %= DEMOS_RUNTIME_TICK_SECONDS;

    const social = ensureDemosSocialState(state);
    const liveMap = liveAlifeIdByEntityId(entities);
    const snapshots = sampleCurrentFloorSnapshots(state, social);
    const cursorBefore = social.eventCursor;
    const events = recentDemosEvents(state, cursorBefore);
    const byId = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
    const director = runDemosSocialDirector(social, events, {
      now: state.time,
      seedSalt: state.tick,
      maxEvents: DEMOS_RUNTIME_EVENT_LIMIT,
      maxPosts: DEMOS_RUNTIME_POSTS_PER_TICK,
      maxReactions: DEMOS_RUNTIME_REACTIONS_PER_TICK,
      fallbackAuthorAlifeIds: snapshots.map(snapshot => snapshot.id),
      alifeIdForEntityId: entityId => liveMap.get(entityId),
      snapshotForAlifeId: alifeId => {
        const snapshot = byId.get(alifeId) ?? getAlifeNpcRecordSnapshot(state, alifeId);
        return snapshot ? {
          alifeId: snapshot.id,
          name: snapshot.name,
          faction: snapshot.faction,
          floorKey: snapshot.floorKey,
          dead: snapshot.dead,
        } : undefined;
      },
      outgoingEdgesForAlifeId: alifeId => outgoingSocialEdgesForAlifeId(state, alifeId),
      relationForPair: (fromAlifeId, targetAlifeId) =>
        getDemosNpcOnlySocialEdges(state, fromAlifeId).find(edge => edge.targetAlifeId === targetAlifeId)?.relation,
      applyRelationDelta: (targetState, fromAlifeId, target, delta, meta) => {
        applyDemosRelationDelta(targetState, fromAlifeId, target, delta, {
          reasonTag: meta.reasonTag,
        });
      },
      gameState: state,
    });
    const notices = refreshDemosQuestNoticesFromSnapshots(state, snapshots, {
      floorKey: currentAlifeFloorKey(state),
      seed: state.tick,
      nowMinutes: state.clock.totalMinutes,
    });
    const feedback = processDemosSocialFeedbackEvents(state, {
      events,
      maxEvents: DEMOS_RUNTIME_EVENT_LIMIT,
      maxOutcomes: DEMOS_RUNTIME_OUTCOMES_PER_TICK,
      maxOutcomesPerEvent: DEMOS_RUNTIME_OUTCOMES_PER_TICK,
    });
    const journeyRequested = requestOneSocialJourney(state, world, entities, snapshots);

    /* Учёт потерь. Id событий плотные — их выдаёт один счётчик, — поэтому в
     * промежутке (cursorBefore, eventCursor] ровно столько событий, на сколько
     * сдвинулся курсор, а разобрано из них `eventsConsumed`. Остальные курсор
     * перепрыгнул, и это надо ВИДЕТЬ, а не угадывать по пустой ленте.
     *
     * Недобор рутины законен: бюджет такта конечен. Недобор ВАЖНОГО — дефект, и
     * `droppedImportant` обязан стоять на нуле: порядок разбора выводит важное
     * вперёд и по возрастанию id, поэтому недобранное важное остаётся выше
     * курсора и приезжает следующим тактом. */
    const advanced = Math.max(0, social.eventCursor - cursorBefore);
    const dropped = Math.max(0, advanced - director.eventsConsumed);
    runtime.seen += advanced;
    runtime.consumed += director.eventsConsumed;
    runtime.dropped += dropped;
    runtime.droppedImportant += Math.max(0, countImportantPassed(
      getImportantEvents(state, WORLD_EVENT_IMPORTANT_CAPACITY),
      cursorBefore,
      social.eventCursor,
    ) - director.importantConsumed);
    runtime.lastSummary = {
      posts: director.postsCreated + director.repliesCreated,
      reactions: director.reactionsCreated,
      notices: notices.length,
      feedback: feedback.relationChanges,
      journeyRequested,
      consumed: director.eventsConsumed,
      dropped,
    };
  },
});

/* ── Отладка ──────────────────────────────────────────────────
 * Команда живёт рядом со своей системой, как у `events.ts`: меню собирает
 * реестр. Здесь видно ровно то, чего раньше не было видно никак, — сколько
 * событий лента разобрала и мимо скольких прыгнула. */

registerDebugCommand({
  /* Demos feed throughput and dropped events */
  id: 'demos_feed',
  group: 'world',
  label: 'Лента Демоса: поток',
  run: ({ state }) => {
    const runtime = ensureDemosRuntimeState(state);
    const social = ensureDemosSocialState(state);
    const share = runtime.seen > 0 ? Math.round(runtime.consumed / runtime.seen * 100) : 100;
    state.msgs.push(msg(
      `[DEMOS] окно ${runtime.consumed}/${runtime.seen} (${share}%), потеряно ${runtime.dropped}, важных ${runtime.droppedImportant}`,
      state.time,
      runtime.droppedImportant > 0 ? '#f88' : '#ff0',
    ));
    state.msgs.push(msg(
      `[DEMOS] курсор ${social.eventCursor}, постов ${social.posts.length}, реакций ${social.reactions.length}`,
      state.time,
      '#ccf',
    ));
    const last = runtime.lastSummary;
    state.msgs.push(msg(last
      ? `[DEMOS] такт: разобрано ${last.consumed}, потеряно ${last.dropped}, постов ${last.posts}, реакций ${last.reactions}, заметок ${last.notices}, отношений ${last.feedback}`
      : '[DEMOS] такт ленты ещё не проходил',
      state.time,
      '#9cf',
    ));
  } });
