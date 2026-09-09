/* Замок шва «конвейер узнаёт о своём решении».
 *
 * Держит КЛАСС, а не строку проводки: четыре решения трубопровода объявлены в
 * данных (`PRODUCTION_BELT_PIPELINE_DEPENDENCIES`), и каждое обязано иметь
 * живой путь из игры. До 2026-09-09 `publishProductionBeltDecision` не звали ни
 * разу — четыре побочки игрались, а мир о выборе не узнавал вовсе.
 *
 * Отрицательные случаи готовы ко ВСЕМУ, кроме проверяемого признака: у события
 * на месте и `z`, и `sideQuestId`, и `containerId`, — иначе контроль сверял бы
 * пустоту с пустотой (форма «б» из `postrelease.md` §6).
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Faction, type GameState, type WorldEvent } from '../src/core/types';
import {
  PRODUCTION_BELT_PIPELINE_DEPENDENCIES,
  PRODUCTION_BELT_Z,
  generateProductionBeltDesignFloor,
} from '../src/gen/production_belt';
import {
  announcedProductionBeltDecisions,
  bindProductionBeltDecisions,
  resetProductionBeltDecisions,
} from '../src/gen/production_belt/decisions';
import { createWorldEventState, getRecentEvents, publishEvent } from '../src/systems/events';
import { makeGameState } from './helpers';

function freshState(): GameState {
  const state = makeGameState({ currentZ: PRODUCTION_BELT_Z });
  state.worldEvents = createWorldEventState();
  return state;
}

function beltFloor(): ReturnType<typeof generateProductionBeltDesignFloor> {
  resetProductionBeltDecisions();
  const gen = generateProductionBeltDesignFloor();
  bindProductionBeltDecisions(gen.world, gen.productionState);
  return gen;
}

function decisionEvents(state: GameState): WorldEvent[] {
  return getRecentEvents(state, {}).filter(e => e.tags.includes('production_belt') && e.tags.includes('pipeline'));
}

function closeSideQuest(state: GameState, sideQuestId: string, z = PRODUCTION_BELT_Z): void {
  publishEvent(state, {
    type: 'quest_completed',
    z,
    actorId: 4242,
    actorName: 'Аудитор-БОТ 14',
    actorFaction: Faction.CITIZEN,
    severity: 4,
    privacy: 'local',
    tags: ['quest', 'completed'],
    data: { sideQuestId },
  });
}

function badBatchContainerId(gen: ReturnType<typeof beltFloor>): number {
  const line = gen.productionState.lines.find(l => l.factoryId === 'illegal_ammo_smelter');
  assert.ok(line, 'у этажа пропала линия нелегальной смены — замок стал бессмысленным');
  return line!.outputContainerId;
}

function lootContainer(state: GameState, containerId: number, z = PRODUCTION_BELT_Z): void {
  publishEvent(state, {
    type: 'item_stolen',
    z,
    x: 12.5,
    y: 12.5,
    actorId: 1,
    actorName: 'Игрок',
    actorFaction: Faction.PLAYER,
    containerId,
    severity: 3,
    privacy: 'secret',
    tags: ['theft'],
    data: {},
  });
}

/* ── 1. Каждое объявленное решение достижимо из игры ───────────── */

test('все четыре решения трубопровода имеют живой путь из игры', () => {
  const gen = beltFloor();
  const state = freshState();

  closeSideQuest(state, 'prod_restore_line');
  closeSideQuest(state, 'prod_steal_crate');
  closeSideQuest(state, 'prod_bad_batch');
  lootContainer(state, badBatchContainerId(gen));

  const declared = [...new Set(PRODUCTION_BELT_PIPELINE_DEPENDENCIES.map(dep => dep.decisionId))].sort();
  const announced = [...announcedProductionBeltDecisions()].sort();
  assert.deepEqual(announced, declared, 'решение объявлено в данных, но игрок не может его принять');

  const events = decisionEvents(state);
  assert.equal(events.length, 4, `шов опубликовал ${events.length} фактов вместо четырёх`);
  /* Кража зелёной партии — тайный факт и остановка производства, сдача
   * аудитору — тоже остановка, но не тайная. Обе стороны здесь важны: слух
   * различает их именно по приватности. */
  const steal = events.find(e => e.data?.decisionId === 'steal_bad_batch');
  assert.equal(steal?.type, 'room_blocked_production');
  assert.equal(steal?.privacy, 'secret');
  const repair = events.find(e => e.data?.decisionId === 'repair_metal_line');
  assert.equal(repair?.type, 'room_produced_items');
  assert.equal(repair?.privacy, 'local');
});

test('решение объявляется один раз за прогон этажа', () => {
  const gen = beltFloor();
  const state = freshState();

  closeSideQuest(state, 'prod_bad_batch');
  closeSideQuest(state, 'prod_bad_batch');
  lootContainer(state, badBatchContainerId(gen));
  lootContainer(state, badBatchContainerId(gen));

  assert.equal(decisionEvents(state).length, 2, 'повторный заход в тот же ящик не меняет трубопровод');
});

test('событие несёт зону, иначе слух о решении не дойдёт до соседей', () => {
  /* `quest_completed` координат не несёт вовсе; зона обязана прийти от самой
   * линии, иначе факт выпадает из зонных буферов шины. */
  beltFloor();
  const state = freshState();
  closeSideQuest(state, 'prod_restore_line');
  const [event] = decisionEvents(state);
  assert.ok(event, 'решение не опубликовано');
  assert.ok(event.zoneId !== undefined && event.zoneId >= 0, `зона решения: ${event.zoneId}`);
  assert.ok(event.roomId !== undefined, 'решение без комнаты линии');
});

/* ── 2. Негативные контроли, поимённо на каждую охраняемую строку ── */

test('чужой этаж молчит: сторож z', () => {
  beltFloor();
  const state = freshState();
  /* Всё на месте, кроме высоты: побочка та же, id тот же. */
  closeSideQuest(state, 'prod_restore_line', PRODUCTION_BELT_Z + 2);
  assert.deepEqual(announcedProductionBeltDecisions(), []);
  assert.equal(decisionEvents(state).length, 0);
});

test('чужая побочка молчит: сторож таблицы sideQuestId', () => {
  beltFloor();
  const state = freshState();
  /* Высота своя, форма события своя — не совпадает только id дела. */
  closeSideQuest(state, 'prod_worker_escort');
  assert.deepEqual(announcedProductionBeltDecisions(), []);
});

test('чужой ящик молчит: сторож выходного контейнера', () => {
  const gen = beltFloor();
  const state = freshState();
  /* Кража на своём этаже, событие того же типа — другой только ящик. */
  lootContainer(state, badBatchContainerId(gen) + 1000);
  assert.deepEqual(announcedProductionBeltDecisions(), []);
});

test('без этажа под ногами шов молчит: сторож привязки', () => {
  beltFloor();
  resetProductionBeltDecisions();
  const state = freshState();
  closeSideQuest(state, 'prod_restore_line');
  assert.deepEqual(announcedProductionBeltDecisions(), []);
  assert.equal(decisionEvents(state).length, 0);
});
