/* Замок шва «банк узнаёт, что у него сделали».
 *
 * Держит КЛАСС: каждый объявленный `BankActionKind` обязан иметь живой путь из
 * игры. До 2026-09-09 `publishBankFloorEvent` не звали ни разу, а `BankActionKind`
 * не читал никто, кроме самого публикатора: банк единственный на маршруте знает
 * про вклад, кредит, долг и хранилище — и не сообщал о них миру ничего.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Faction, type GameState, type WorldEvent } from '../src/core/types';
import {
  BANK_FLOOR_ROUTE_ID,
  BANK_FLOOR_Z,
  announcedBankFloorActions,
  bindBankFloorDecisions,
  generateBankFloorDesignFloor,
  resetBankFloorDecisions,
} from '../src/gen/bank_floor';
import { createWorldEventState, getRecentEvents, publishEvent } from '../src/systems/events';
import { makeGameState } from './helpers';

const ALL_ACTIONS = ['deposit', 'loan', 'repay', 'forgery', 'vault_theft'];

function freshState(): GameState {
  const state = makeGameState({ currentZ: BANK_FLOOR_Z });
  state.worldEvents = createWorldEventState();
  return state;
}

function bankFloor(): ReturnType<typeof generateBankFloorDesignFloor> {
  resetBankFloorDecisions();
  const gen = generateBankFloorDesignFloor();
  bindBankFloorDecisions(gen.world, gen.bankState);
  return gen;
}

function bankEvents(state: GameState): WorldEvent[] {
  return getRecentEvents(state, {}).filter(e => e.tags.includes('banking') && e.tags.includes(BANK_FLOOR_ROUTE_ID));
}

function closeSideQuest(state: GameState, sideQuestId: string, z = BANK_FLOOR_Z): void {
  publishEvent(state, {
    type: 'quest_completed',
    z,
    roomId: 4,
    zoneId: 2,
    actorId: 51,
    actorName: 'Люба Кассирша',
    actorFaction: Faction.CITIZEN,
    severity: 4,
    privacy: 'local',
    tags: ['quest', 'completed'],
    data: { sideQuestId },
  });
}

function lootVault(state: GameState, containerId: number, z = BANK_FLOOR_Z): void {
  publishEvent(state, {
    type: 'item_stolen',
    z,
    roomId: 8,
    zoneId: 3,
    actorId: 1,
    actorName: 'Игрок',
    actorFaction: Faction.PLAYER,
    containerId,
    severity: 4,
    privacy: 'secret',
    tags: ['theft'],
    data: {},
  });
}

test('все пять денежных действий банка имеют живой путь из игры', () => {
  const gen = bankFloor();
  const state = freshState();

  closeSideQuest(state, 'bank_cash_deposit_50');
  closeSideQuest(state, 'bank_take_corridor_loan');
  closeSideQuest(state, 'bank_repay_corridor_loan');
  closeSideQuest(state, 'bank_cash_forged_debt_paper');
  assert.ok(gen.bankState.vaultContainerIds.length > 0, 'у банка пропали ящики хранилища — замок стал бессмысленным');
  lootVault(state, gen.bankState.vaultContainerIds[0]);

  assert.deepEqual([...announcedBankFloorActions()].sort(), [...ALL_ACTIONS].sort());

  const theft = bankEvents(state).find(e => e.data?.bankingAction === 'vault_theft');
  /* Кража из хранилища — единственный вид, у которого нет и не может быть своей
   * побочки, и его тяжесть с приватностью прописаны отдельно. */
  assert.equal(theft?.privacy, 'witnessed');
  assert.equal(theft?.severity, 5);
  assert.equal(theft?.z, BANK_FLOOR_Z);
});

test('действие объявляется один раз за прогон этажа', () => {
  const gen = bankFloor();
  const state = freshState();
  closeSideQuest(state, 'bank_cash_deposit_50');
  closeSideQuest(state, 'bank_cash_deposit_50');
  lootVault(state, gen.bankState.vaultContainerIds[0]);
  lootVault(state, gen.bankState.vaultContainerIds[0]);
  assert.equal(bankEvents(state).length, 2);
});

/* ── Негативные контроли, поимённо ─────────────────────────────── */

test('чужой этаж молчит: сторож z', () => {
  const gen = bankFloor();
  const state = freshState();
  closeSideQuest(state, 'bank_take_corridor_loan', BANK_FLOOR_Z - 4);
  lootVault(state, gen.bankState.vaultContainerIds[0], BANK_FLOOR_Z - 4);
  assert.deepEqual(announcedBankFloorActions(), []);
});

test('чужая побочка молчит: сторож таблицы действий', () => {
  bankFloor();
  const state = freshState();
  /* Донос на поддельную бумагу — не денежное действие и в таблице его нет
   * НАМЕРЕННО. Строка держит именно это решение. */
  closeSideQuest(state, 'bank_report_forged_debt_paper');
  closeSideQuest(state, 'bank_wait_teller_lane');
  assert.deepEqual(announcedBankFloorActions(), []);
});

test('чужой ящик молчит: сторож ячеек хранилища', () => {
  const gen = bankFloor();
  const state = freshState();
  /* Депозитный ящик — тоже банковский и тоже на этом этаже, но кражей
   * хранилища он не является. */
  assert.ok(gen.bankState.depositContainerIds.length > 0);
  lootVault(state, gen.bankState.depositContainerIds[0]);
  assert.deepEqual(announcedBankFloorActions(), []);
});

test('без банка под ногами шов молчит: сторож привязки', () => {
  bankFloor();
  resetBankFloorDecisions();
  const state = freshState();
  closeSideQuest(state, 'bank_cash_deposit_50');
  assert.deepEqual(announcedBankFloorActions(), []);
});

test('собственный факт банка в него не возвращается', () => {
  bankFloor();
  const state = freshState();
  publishEvent(state, {
    type: 'quest_completed',
    z: BANK_FLOOR_Z,
    severity: 4,
    privacy: 'local',
    tags: ['banking', BANK_FLOOR_ROUTE_ID, 'deposit'],
    data: { sideQuestId: 'bank_cash_deposit_50' },
  });
  assert.deepEqual(announcedBankFloorActions(), []);
});
