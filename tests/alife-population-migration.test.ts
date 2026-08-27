import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, Occupation, type GameState } from '../src/core/types';
import {
  ALIFE_MIGRATION_BATCH_CAP,
  alifeForSave,
  alifeMigrationApplied,
  createPrefilledAlifeState,
  currentAlifeFloorRecordIds,
  getAlifeNpcRecordSnapshot,
  migrateAlifePopulation,
  setAlifeState,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { initFactionRelations } from '../src/data/relations';

/* Переселение части населения как последствие события.
 *
 * Соседний `tests/alife-migration.test.ts` — про ДРУГУЮ механику: холодные
 * одиночные путешествия по собственным намерениям (`systems/alife_migration.ts`).
 * Здесь проверяется разовый вывод группы по вызову из контента: у донора
 * население реально убывает, повтор не приводит вторую волну, выбор людей
 * детерминирован от сида. */

const DONOR = 'design:liquidatorbase';
const RECEIVER = 'design:maintenance';
const DONOR_COUNT = 12;
const RECEIVER_COUNT = 5;

const PLAN: AlifePopulationPlan = {
  buckets: [
    {
      floorKey: DONOR,
      z: -12,
      targetCount: DONOR_COUNT,
      factionWeights: [{ value: Faction.LIQUIDATOR, weight: 1 }],
      occupationWeights: [{ value: Occupation.SOLDIER, weight: 1 }],
    },
    {
      floorKey: RECEIVER,
      z: -26,
      targetCount: RECEIVER_COUNT,
      factionWeights: [{ value: Faction.CITIZEN, weight: 1 }],
      occupationWeights: [{ value: Occupation.MECHANIC, weight: 1 }],
    },
  ],
};

function freshState(): GameState {
  initFactionRelations();
  const state = {
    currentZ: -12,
    time: 0,
    tick: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    quests: [],
    msgs: [],
    msgLog: [],
  } as unknown as GameState;
  setFloorRunState(state, undefined);
  return state;
}

function seededState(seed = 777): GameState {
  const state = freshState();
  createPrefilledAlifeState(state, seed, DONOR_COUNT + RECEIVER_COUNT, PLAN);
  return state;
}

function bucket(state: GameState, floorKey: string): number[] {
  return [...currentAlifeFloorRecordIds(state, floorKey)];
}

function request(id: string, count: number) {
  return { id, faction: Faction.LIQUIDATOR, fromFloorKey: DONOR, toFloorKey: RECEIVER, count };
}

test('переселение убавляет донора ровно на столько, на сколько прибавляет получателю', () => {
  const state = seededState();
  assert.equal(bucket(state, DONOR).length, DONOR_COUNT);
  assert.equal(bucket(state, RECEIVER).length, RECEIVER_COUNT);

  const moved = migrateAlifePopulation(state, request('garrison_reinforced', 4));

  assert.equal(moved, 4);
  assert.equal(bucket(state, DONOR).length, DONOR_COUNT - 4);
  assert.equal(bucket(state, RECEIVER).length, RECEIVER_COUNT + 4);

  // Люди те же самые, а не новые: суммарное население не выросло.
  const donorIds = new Set(bucket(state, DONOR));
  for (const id of bucket(state, RECEIVER)) assert.equal(donorIds.has(id), false);
  assert.equal(bucket(state, DONOR).length + bucket(state, RECEIVER).length, DONOR_COUNT + RECEIVER_COUNT);
});

test('переехавшие числятся на этаже-получателе', () => {
  const state = seededState();
  const before = new Set(bucket(state, DONOR));
  migrateAlifePopulation(state, request('garrison_reinforced', 3));

  const arrived = bucket(state, RECEIVER).filter(id => before.has(id));
  assert.equal(arrived.length, 3);
  for (const id of arrived) {
    assert.equal(getAlifeNpcRecordSnapshot(state, id)?.floorKey, RECEIVER);
    assert.equal(getAlifeNpcRecordSnapshot(state, id)?.faction, Faction.LIQUIDATOR);
  }
});

test('повторный вызов не приводит вторую волну', () => {
  const state = seededState();
  migrateAlifePopulation(state, request('garrison_reinforced', 4));
  const donorAfter = bucket(state, DONOR);
  const receiverAfter = bucket(state, RECEIVER);

  assert.equal(alifeMigrationApplied(state, 'garrison_reinforced'), true);
  assert.equal(migrateAlifePopulation(state, request('garrison_reinforced', 4)), 0);

  assert.deepEqual(bucket(state, DONOR), donorAfter);
  assert.deepEqual(bucket(state, RECEIVER), receiverAfter);

  // Другое событие — другой факт, и оно вправе увезти следующих.
  assert.equal(migrateAlifePopulation(state, request('garrison_reinforced_again', 2)), 2);
  assert.equal(bucket(state, DONOR).length, DONOR_COUNT - 6);
});

test('выбор переселенцев детерминирован от сида', () => {
  const first = seededState(31337);
  const second = seededState(31337);
  migrateAlifePopulation(first, request('garrison_reinforced', 5));
  migrateAlifePopulation(second, request('garrison_reinforced', 5));
  assert.deepEqual(bucket(first, RECEIVER), bucket(second, RECEIVER));

  // Другое имя события — другие люди при том же семени.
  const other = seededState(31337);
  migrateAlifePopulation(other, request('another_event', 5));
  assert.notDeepEqual(bucket(other, RECEIVER), bucket(first, RECEIVER));
});

test('переселение переживает круг сейв → загрузка', () => {
  const state = seededState();
  migrateAlifePopulation(state, request('garrison_reinforced', 4));
  const donorAfter = bucket(state, DONOR).sort((a, b) => a - b);
  const receiverAfter = bucket(state, RECEIVER).sort((a, b) => a - b);

  const payload = JSON.parse(JSON.stringify(alifeForSave(state)));
  assert.equal(Array.isArray(payload.migrations), true);
  assert.equal(payload.migrations.length, 1);
  assert.deepEqual(payload.migrations[0], {
    id: 'garrison_reinforced',
    fromFloorKey: DONOR,
    toFloorKey: RECEIVER,
    moved: 4,
  });

  const loaded = freshState();
  setAlifeState(loaded, payload, { populationPlan: PLAN });

  assert.deepEqual(bucket(loaded, DONOR).sort((a, b) => a - b), donorAfter);
  assert.deepEqual(bucket(loaded, RECEIVER).sort((a, b) => a - b), receiverAfter);
  assert.equal(alifeMigrationApplied(loaded, 'garrison_reinforced'), true);
  assert.equal(migrateAlifePopulation(loaded, request('garrison_reinforced', 4)), 0);
});

test('переселение ограничено капом, чужой фракцией и пустым донором', () => {
  const state = seededState();
  // Просят больше, чем есть, и больше, чем разрешено одним событием.
  const moved = migrateAlifePopulation(state, request('overask', ALIFE_MIGRATION_BATCH_CAP * 4));
  assert.equal(moved, DONOR_COUNT);
  assert.ok(moved <= ALIFE_MIGRATION_BATCH_CAP);
  assert.equal(bucket(state, DONOR).length, 0);

  // Донор пуст — никто не приходит из воздуха.
  assert.equal(migrateAlifePopulation(state, request('empty_donor', 3)), 0);

  const other = seededState();
  assert.equal(migrateAlifePopulation(other, {
    id: 'wrong_faction',
    faction: Faction.CULTIST,
    fromFloorKey: DONOR,
    toFloorKey: RECEIVER,
    count: 3,
  }), 0);
  assert.equal(bucket(other, DONOR).length, DONOR_COUNT);
});

test('бессмысленный запрос переселения ничего не делает и факта не оставляет', () => {
  const state = seededState();
  assert.equal(migrateAlifePopulation(state, request('', 3)), 0);
  assert.equal(migrateAlifePopulation(state, { ...request('same_floor', 3), toFloorKey: DONOR }), 0);
  assert.equal(bucket(state, DONOR).length, DONOR_COUNT);
  assert.equal(alifeForSave(state).migrations, undefined);

  // Нулевой запрос — законное событие «никого не увезли»: факт записан.
  assert.equal(migrateAlifePopulation(state, request('zero', 0)), 0);
  assert.equal(alifeForSave(state).migrations?.length, 1);
});

test('санитайзер отбрасывает мусор в списке переселений', () => {
  const state = seededState();
  const payload = alifeForSave(state) as Record<string, unknown>;
  payload.migrations = [
    { id: '', fromFloorKey: DONOR, toFloorKey: RECEIVER, moved: 3 },
    { id: 'no_target', fromFloorKey: DONOR, moved: 3 },
    { id: 'same_floor', fromFloorKey: DONOR, toFloorKey: DONOR, moved: 3 },
    { id: 'ok', fromFloorKey: DONOR, toFloorKey: RECEIVER, moved: 1e9 },
    { id: 'ok', fromFloorKey: DONOR, toFloorKey: RECEIVER, moved: 2 },
    'мусор',
  ];

  const loaded = freshState();
  setAlifeState(loaded, JSON.parse(JSON.stringify(payload)), { populationPlan: PLAN });

  const saved = alifeForSave(loaded).migrations ?? [];
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 'ok');
  assert.equal(saved[0].moved, ALIFE_MIGRATION_BATCH_CAP);
  assert.equal(alifeMigrationApplied(loaded, 'same_floor'), false);
  assert.equal(alifeMigrationApplied(loaded, 'no_target'), false);
});
