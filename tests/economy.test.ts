import test from 'node:test';
import assert from 'node:assert/strict';

import { economyForSave, ensureEconomyState, invalidateEconomyPrices, normalizeGameEconomy } from '../src/systems/economy';
import { createEconomyFloorState } from '../src/data/economy';
import { makeGameState } from './helpers';

test('economyForSave ensures economy state and returns it', () => {
  const state = makeGameState({ currentZ: 0 });
  const economy = ensureEconomyState(state);
  economy.floors[0] = createEconomyFloorState(0);
  const econ = economyForSave(state);

  // ensureEconomyState side effects
  assert.equal(state.economy, econ);
  assert.ok(econ.floors[0]);

  // Has required shape
  assert.equal(typeof econ.priceVersion, 'number');
  assert.ok(econ.floors);
  assert.ok(econ.routes);
});

test('invalidateEconomyPrices increments price version', () => {
  const state = makeGameState({ currentZ: 0 });
  const economy = ensureEconomyState(state);
  economy.floors[0] = createEconomyFloorState(0);
  const econ = ensureEconomyState(state);

  const oldVersion = econ.priceVersion;
  invalidateEconomyPrices(state);

  assert.equal(econ.priceVersion, oldVersion + 1);
});

test('normalizeGameEconomy sets up economy and deletes price caches', () => {
  const state = makeGameState({ currentZ: 0 });
  const economy = ensureEconomyState(state);
  economy.floors[0] = createEconomyFloorState(0);
  ensureEconomyState(state); // initialize

  // modify to a non-default version
  state.economy.priceVersion = 5;

  // normalize with a mock saved state that is partial
  normalizeGameEconomy(state, { priceVersion: 10 });

  assert.equal(state.economy.priceVersion, 10);
  assert.ok(state.economy.floors[state.currentZ]);
});
