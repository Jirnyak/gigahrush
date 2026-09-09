/* Замок шва «архив узнаёт, что с ним сделали».
 *
 * Держит КЛАСС: каждый объявленный `RaionsovetArchiveEventKind` обязан иметь
 * живой путь из игры, и каждая объявленная проверка допуска — своего
 * спрашивающего. До 2026-09-09 ни `publishRaionsovetArchiveEvent`, ни
 * `resolveRaionsovetArchiveAccess` не звали ни разу: четыре побочки игрались, а
 * подозрение и репутация за подлог никуда не шли.
 *
 * Отрицательные случаи готовы ко ВСЕМУ, кроме проверяемого признака.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Faction, type GameState, type WorldEvent } from '../src/core/types';
import {
  RAIONSOVET_ARCHIVE_ACCESS_CHECKS,
  RAIONSOVET_ARCHIVE_ROUTE_ID,
  RAIONSOVET_ARCHIVE_Z,
  generateRaionsovetArchiveDesignFloor,
} from '../src/gen/raionsovet_archive';
import {
  bindRaionsovetArchiveDecisions,
  resetRaionsovetArchiveDecisions,
} from '../src/gen/raionsovet_archive/decisions';
import { createWorldEventState, getRecentEvents, publishEvent } from '../src/systems/events';
import { makeGameState } from './helpers';

const ALL_KINDS = ['permit_issued', 'card_swapped', 'shelf_burned', 'market_license_changed', 'archive_denied'];

function freshState(): GameState {
  const state = makeGameState({ currentZ: RAIONSOVET_ARCHIVE_Z });
  state.worldEvents = createWorldEventState();
  return state;
}

function archiveFloor(): void {
  resetRaionsovetArchiveDecisions();
  const gen = generateRaionsovetArchiveDesignFloor();
  bindRaionsovetArchiveDecisions(gen.world);
}

function archiveEvents(state: GameState): WorldEvent[] {
  return getRecentEvents(state, {})
    .filter(e => e.tags.includes('archive') && e.tags.includes(RAIONSOVET_ARCHIVE_ROUTE_ID));
}

function kinds(state: GameState): string[] {
  return archiveEvents(state).map(e => String(e.data?.archiveEvent));
}

function closeSideQuest(state: GameState, sideQuestId: string, z = RAIONSOVET_ARCHIVE_Z): void {
  publishEvent(state, {
    type: 'quest_completed',
    z,
    roomId: 3,
    zoneId: 1,
    actorId: 77,
    actorName: 'Лида Индексная',
    actorFaction: Faction.CITIZEN,
    severity: 4,
    privacy: 'local',
    tags: ['quest', 'completed'],
    data: { sideQuestId },
  });
}

function submitPaper(
  state: GameState,
  itemId: string,
  type: 'access_granted' | 'permit_exposed' = 'access_granted',
  z = RAIONSOVET_ARCHIVE_Z,
): void {
  publishEvent(state, {
    type,
    z,
    roomId: 5,
    zoneId: 2,
    actorId: 1,
    actorName: 'Игрок',
    actorFaction: Faction.PLAYER,
    itemId,
    severity: 4,
    privacy: 'local',
    tags: ['permit', 'access'],
    data: {},
  });
}

/* ── 1. Все пять видов достижимы ───────────────────────────────── */

test('все пять видов событий архива имеют живой путь из игры', () => {
  archiveFloor();
  const state = freshState();

  closeSideQuest(state, 'archive_get_floor_permit');
  closeSideQuest(state, 'archive_swap_card');
  closeSideQuest(state, 'archive_save_or_burn');
  closeSideQuest(state, 'archive_market_license');
  /* Пятый вид приходит бумагой, а не делом: разоблачённая краденая карточка —
   * это и есть отказ картотеки, и он `witnessed` по построению. */
  submitPaper(state, 'stolen_archive_card', 'permit_exposed');

  const seen = [...new Set(kinds(state))].sort();
  assert.deepEqual(seen, [...ALL_KINDS].sort(), 'вид объявлен в данных, но игрок не может его вызвать');

  const denied = archiveEvents(state).find(e => e.data?.archiveEvent === 'archive_denied');
  assert.equal(denied?.privacy, 'witnessed');
  assert.equal(denied?.severity, 4);
});

test('каждая проверка допуска имеет своего спрашивающего', () => {
  /* `resolveRaionsovetArchiveAccess` объявлена на три цели; если бумага одной из
   * них не двигает мир, проверка мертва так же, как была мертва вся функция. */
  for (const check of RAIONSOVET_ARCHIVE_ACCESS_CHECKS) {
    archiveFloor();
    const state = freshState();
    submitPaper(state, check.legalItemId);
    const events = archiveEvents(state);
    assert.equal(events.length, 1, `законная бумага цели ${check.targetId} не дошла до архива`);
    assert.equal(events[0].data?.targetId, check.targetId);
  }
});

test('факт архива уезжает на свою высоту, а не в министерство', () => {
  archiveFloor();
  const state = freshState();
  closeSideQuest(state, 'archive_save_or_burn');
  const [event] = archiveEvents(state);
  assert.ok(event, 'решение не опубликовано');
  assert.equal(event.z, RAIONSOVET_ARCHIVE_Z);
});

test('вид объявляется один раз за прогон этажа', () => {
  archiveFloor();
  const state = freshState();
  closeSideQuest(state, 'archive_swap_card');
  closeSideQuest(state, 'archive_swap_card');
  submitPaper(state, 'official_permit_slip');
  submitPaper(state, 'official_permit_slip');
  assert.equal(archiveEvents(state).length, 2);
});

/* ── 2. Негативные контроли, поимённо ──────────────────────────── */

test('чужой этаж молчит: сторож z', () => {
  archiveFloor();
  const state = freshState();
  closeSideQuest(state, 'archive_get_floor_permit', RAIONSOVET_ARCHIVE_Z + 8);
  submitPaper(state, 'archive_access_permit', 'access_granted', RAIONSOVET_ARCHIVE_Z + 8);
  assert.deepEqual(kinds(state), []);
});

test('чужая побочка молчит: сторож таблицы sideQuestId', () => {
  archiveFloor();
  const state = freshState();
  closeSideQuest(state, 'archive_lida_index');
  assert.deepEqual(kinds(state), []);
});

test('чужая бумага молчит: сторож проверки допуска', () => {
  archiveFloor();
  const state = freshState();
  /* Этаж свой, событие своего типа — бумага не из пары ни одной цели. */
  submitPaper(state, 'bread');
  assert.deepEqual(kinds(state), []);
});

test('без архива под ногами шов молчит: сторож привязки', () => {
  archiveFloor();
  resetRaionsovetArchiveDecisions();
  const state = freshState();
  closeSideQuest(state, 'archive_get_floor_permit');
  submitPaper(state, 'archive_access_permit');
  assert.deepEqual(kinds(state), []);
});

test('собственный факт архива в него не возвращается', () => {
  archiveFloor();
  const state = freshState();
  /* Событие несёт СВОИ теги архива и при этом всё, за что шов цепляется:
   * ту же высоту, тот же тип и живой `sideQuestId`. Единственная причина
   * промолчать — сторож рекурсии. */
  publishEvent(state, {
    type: 'quest_completed',
    z: RAIONSOVET_ARCHIVE_Z,
    roomId: 3,
    zoneId: 1,
    severity: 4,
    privacy: 'local',
    tags: ['archive', RAIONSOVET_ARCHIVE_ROUTE_ID, 'permit_issued'],
    data: { sideQuestId: 'archive_get_floor_permit' },
  });
  assert.deepEqual(kinds(state).filter(k => k !== 'undefined'), []);
});
