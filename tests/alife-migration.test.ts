import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, Occupation, type GameState } from '../src/core/types';
import {
  createPrefilledAlifeState,
  getAlifeNpcRecordSnapshot,
  moveAlifeNpcRecord,
  setAlifeState,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { createGameSavePayload } from '../src/systems/save_runtime';
import {
  ALIFE_MIGRATION_TICK_SECONDS,
  ALIFE_MIGRATION_FORCE_RECORD_CAP,
  MAX_ALIFE_JOURNEYS,
  MAX_ALIFE_PENDING_ARRIVALS,
  alifeMobilityForSave,
  ensureAlifeMobilityState,
  setAlifeMobilityState,
  summarizeAlifeMigration,
  tickAlifeMigration,
  type AlifeArrival,
  type AlifeJourney,
} from '../src/systems/alife_migration';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { makeTestPlayer } from './helpers';

function minimalState(): GameState {
  const state = {
    currentZ: 0,
    time: 0,
    tick: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 8 * 60 },
    quests: [],
    msgs: [],
    msgLog: [],
  } as unknown as GameState;
  setFloorRunState(state, { runSeed: 123, currentZ: 0 }.LIVING);
  setAlifeState(state, { seed: 12345, total: 100_000 }, { populationPlan: 'empty_packages' });
  return state;
}

function journey(id: string, alifeId: number, toFloorKey: string, etaAt: number): AlifeJourney {
  return {
    id,
    alifeId,
    fromFloorKey: 'design:ministry',
    toFloorKey,
    intentId: 'market_trade',
    reason: 'market',
    laneId: `design:ministry->${toFloorKey}`,
    risk: 3,
    startedAt: 0,
    etaAt,
    status: 'in_transit',
  };
}

test('cold A-Life migration respects cadence unless forced', () => {
  const state = minimalState();

  assert.equal(tickAlifeMigration(state, 1, { maxRecords: 8 }), 0);
  assert.equal(ensureAlifeMobilityState(state).tickAccum, 1);
  assert.ok(tickAlifeMigration(state, 0, { force: true, maxRecords: 8, activeFloorKey: 'design:living' }) <= 8);
});

test('cold A-Life migration starts bounded off-floor journeys without world or entity arrays', () => {
  const state = minimalState();
  const processed = tickAlifeMigration(state, 0, { force: true, maxRecords: 32, activeFloorKey: 'design:living' });
  const mobility = ensureAlifeMobilityState(state);

  assert.ok(processed <= 32);
  assert.ok(Object.keys(mobility.journeys).length > 0, 'forced cold tick should create at least one journey');
  assert.ok(summarizeAlifeMigration(state).some(line => line.includes('journeys=')));
  assert.ok((state.worldEvents?.recentEvents.count ?? 0) <= 3, 'migration event publication is capped per tick');
});

test('normal cold migration gives traveler occupations a bounded priority lane', () => {
  const state = minimalState();
  const reserved = Array.from({ length: 64 }, (_, index) => ({
    name: `Маршрутный тест ${index + 1}`,
    faction: Faction.CITIZEN,
    occupation: index < 32 ? Occupation.HOUSEWIFE : Occupation.TRAVELER,
  }));
  const plan: AlifePopulationPlan = {
    buckets: [{
      floorKey: 'design:ministry',
      z: 34,
      targetCount: 64,
      reserved,
    }],
  };
  createPrefilledAlifeState(state, 12345, 64, plan);

  const processed = tickAlifeMigration(state, ALIFE_MIGRATION_TICK_SECONDS, { maxRecords: 8, activeFloorKey: 'design:living' });
  const journeyIds = Object.values(ensureAlifeMobilityState(state).journeys).map(journey => journey.alifeId);

  assert.ok(processed <= 8);
  assert.ok(journeyIds.some(id => id > 32), 'traveler records beyond the cursor prefix should get migration attempts');
});

test('cold A-Life migration skips dead records and records already in a journey', () => {
  const deadState = minimalState();
  setAlifeState(deadState, { seed: 12345, total: 100_000, deadIds: [1] }, { populationPlan: 'empty_packages' });
  assert.equal(tickAlifeMigration(deadState, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(Object.keys(ensureAlifeMobilityState(deadState).journeys).length, 0);

  const journeyState = minimalState();
  const mobility = ensureAlifeMobilityState(journeyState);
  mobility.journeys.test = journey('test', 1, 'design:black_market_88', 9999);
  assert.equal(tickAlifeMigration(journeyState, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(Object.keys(mobility.journeys).length, 1);
});

test('due inactive-floor journey moves the A-Life record through the record API', () => {
  const state = minimalState();
  assert.equal(moveAlifeNpcRecord(state, 1, 'design:ministry'), true);
  const mobility = ensureAlifeMobilityState(state);
  mobility.journeys.test = journey('test', 1, 'design:black_market_88', 10);
  state.time = 11;

  assert.equal(tickAlifeMigration(state, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.floorKey, 'design:black_market_88');
  assert.equal(Object.keys(mobility.journeys).length, 0);
});

test('due active-floor journey queues a pending arrival without materializing an entity', () => {
  const state = minimalState();
  assert.equal(moveAlifeNpcRecord(state, 1, 'design:ministry'), true);
  const mobility = ensureAlifeMobilityState(state);
  mobility.journeys.test = journey('test', 1, 'design:living', 10);
  state.time = 11;

  assert.equal(tickAlifeMigration(state, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(mobility.pendingArrivals.length, 1);
  assert.equal(mobility.pendingArrivals[0].alifeId, 1);
  assert.equal(mobility.pendingArrivals[0].toFloorKey, 'design:living');
});

test('due active-floor journey waits when pending arrival queue is full', () => {
  const state = minimalState();
  assert.equal(moveAlifeNpcRecord(state, 1, 'design:ministry'), true);
  const mobility = ensureAlifeMobilityState(state);
  mobility.journeys.test = journey('test', 1, 'design:living', 10);
  for (let i = 0; i < MAX_ALIFE_PENDING_ARRIVALS; i++) {
    mobility.pendingArrivals.push({
      journeyId: `queued_${i}`,
      alifeId: i + 2,
      fromFloorKey: 'design:ministry',
      toFloorKey: 'design:living',
      intentId: 'queued',
      reason: 'routine',
      risk: 1,
      etaAt: 0,
      queuedAt: 0,
    });
  }
  state.time = 11;

  assert.equal(tickAlifeMigration(state, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(mobility.journeys.test?.alifeId, 1);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.floorKey, 'design:ministry');
  assert.equal(mobility.pendingArrivals.length, MAX_ALIFE_PENDING_ARRIVALS);

  mobility.pendingArrivals.pop();
  assert.equal(tickAlifeMigration(state, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(mobility.journeys.test, undefined);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.floorKey, 'design:living');
  assert.equal(mobility.pendingArrivals.at(-1)?.alifeId, 1);
});

test('full active-floor pending queue does not starve later due inactive-floor journeys', () => {
  const state = minimalState();
  assert.equal(moveAlifeNpcRecord(state, 1, 'design:ministry'), true);
  assert.equal(moveAlifeNpcRecord(state, 2, 'design:ministry'), true);
  const mobility = ensureAlifeMobilityState(state);
  mobility.journeys.blocked = journey('blocked', 1, 'design:living', 10);
  mobility.journeys.inactive = journey('inactive', 2, 'design:black_market_88', 10);
  for (let i = 0; i < MAX_ALIFE_PENDING_ARRIVALS; i++) {
    mobility.pendingArrivals.push({
      journeyId: `queued_${i}`,
      alifeId: i + 3,
      fromFloorKey: 'design:ministry',
      toFloorKey: 'design:living',
      intentId: 'queued',
      reason: 'routine',
      risk: 1,
      etaAt: 0,
      queuedAt: 0,
    });
  }
  state.time = 11;

  assert.equal(tickAlifeMigration(state, 0, { force: true, maxRecords: 1, activeFloorKey: 'design:living' }), 1);
  assert.equal(mobility.journeys.blocked?.alifeId, 1);
  assert.equal(mobility.journeys.inactive, undefined);
  assert.equal(getAlifeNpcRecordSnapshot(state, 1)?.floorKey, 'design:ministry');
  assert.equal(getAlifeNpcRecordSnapshot(state, 2)?.floorKey, 'design:black_market_88');
  assert.equal(mobility.pendingArrivals.length, MAX_ALIFE_PENDING_ARRIVALS);
});

test('forced cold tick hard-caps processed records', () => {
  const state = minimalState();
  const processed = tickAlifeMigration(state, 0, {
    force: true,
    maxRecords: ALIFE_MIGRATION_FORCE_RECORD_CAP + 999,
    activeFloorKey: 'design:living',
  });
  assert.ok(processed <= ALIFE_MIGRATION_FORCE_RECORD_CAP);
});

test('A-Life mobility sanitizer and save view cap journeys and pending arrivals', () => {
  const state = minimalState();
  const rawJourneys: Record<string, AlifeJourney> = {};
  const rawArrivals: AlifeArrival[] = [];
  for (let i = 0; i < MAX_ALIFE_JOURNEYS + 40; i++) {
    rawJourneys[`j${i}`] = journey(`j${i}`, i + 1, 'design:black_market_88', 100 + i);
  }
  for (let i = 0; i < MAX_ALIFE_PENDING_ARRIVALS + 40; i++) {
    rawArrivals.push({
      journeyId: `a${i}`,
      alifeId: i + 1,
      fromFloorKey: 'design:ministry',
      toFloorKey: 'design:living',
      intentId: 'refugee_shift',
      reason: 'refugee',
      risk: 2,
      etaAt: 100 + i,
      queuedAt: 100 + i,
    });
  }

  setAlifeMobilityState(state, {
    version: 1,
    tickAccum: 999,
    cursor: 999_999,
    nextJourneySeq: 12,
    journeys: rawJourneys,
    pendingArrivals: rawArrivals,
  });
  const save = alifeMobilityForSave(state);

  assert.equal(Object.keys(save.journeys).length, MAX_ALIFE_JOURNEYS);
  assert.equal(save.pendingArrivals.length, MAX_ALIFE_PENDING_ARRIVALS);
  assert.equal(save.tickAccum <= 30, true);
});

test('game save payload includes persistent A-Life mobility section', () => {
  const state = minimalState();
  const mobility = ensureAlifeMobilityState(state);
  mobility.journeys.test = journey('test', 1, 'design:black_market_88', 100);

  const payload = createGameSavePayload(makeTestPlayer(), state, []);

  const saved = payload.state.alifeMobility as ReturnType<typeof alifeMobilityForSave>;
  assert.equal(saved.version, 1);
  assert.equal(Object.keys(saved.journeys).length, 1);
  assert.equal(saved.journeys.test.toFloorKey, 'design:black_market_88');
});
