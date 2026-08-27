import {
  msg,
  WORLD_EVENT_IMPORTANT_CAPACITY,
  type Entity,
  type GameState,
  type WorldEvent,
} from '../core/types';
import type { World } from '../core/world';
import {
  getAlifeNpcRecordSnapshot,
  sampleAlifeFloorRecordIds,
  currentAlifeFloorKey,
  type AlifeNpcSnapshot,
} from './alife';
import { registerContentRuntimeHook } from './content_hooks';
import { createEmptyDemosSocialSaveState, type DemosSocialSaveState } from './demos_save';
import { runDemosSocialDirector } from './demos_social_director';
import { getDemosNpcOnlySocialEdges, applyDemosRelationDelta } from './demos_social';
import type { DemosOutgoingSocialEdge } from './demos_posts';
import { processDemosSocialFeedbackEvents, requestDemosSocialJourney } from './demos_social_feedback';
import { decayRelationsTick } from './relation_decay';
import { refreshDemosQuestNoticesFromSnapshots } from './demos_quest_notices';
import {
  getImportantEvents,
  getRecentEvents,
  WORLD_EVENT_IMPORTANT_SEVERITY,
} from './events';
import { registerDebugCommand } from './debug_registry';
import { DEMOS_EDGE_FAMILY } from '../data/demos_social';

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
    /* Затухание отношений едет на этом же такте. Своего каданса у него нет и не
     * должно быть: это тот же социальный слой, и вторая ручка времени тут же
     * разъехалась бы с первой. Бюджет — та же мерка, что и у выборки записей. */
    decayRelationsTick(state, DEMOS_RUNTIME_RECORDS_PER_TICK, entities);

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
