import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureEconomyState } from '../src/systems/economy';
import { makeGameState } from './helpers';

test('ensureEconomyState initializes economy state when undefined', () => {
  const state = makeGameState({ currentZ: 0 });
  // Ensure economy is undefined
  delete (state as any).economy;

  const economy = ensureEconomyState(state);

  assert.ok(economy);
  assert.equal(typeof economy.priceVersion, 'number');
  assert.ok(economy.floors);
  assert.ok(economy.floors['living']);
  assert.equal(economy.floors['living'].floor.LIVING);

  // Also check it mutated the state
  assert.equal((state as any).economy, economy);
});

test('ensureEconomyState normalizes invalid economy state', () => {
  const state = makeGameState({ currentZ: 0 });
  // Provide invalid economy
  (state as any).economy = { priceVersion: 'not-a-number' };

  const economy = ensureEconomyState(state);

  assert.ok(economy);
  assert.equal(typeof economy.priceVersion, 'number');
  assert.equal(economy.priceVersion, 1);
  assert.ok(economy.floors);
  assert.ok(economy.floors['living']);
});

test('ensureEconomyState adds current floor if missing', () => {
  const state = makeGameState({ currentZ: 14 });

  // Set up a valid economy but missing KVARTIRY
  const initialEconomy = {
    priceVersion: 1,
    floors: {
      ['living']: { z: 60, resources: {}, lastTickAt: 0 }
    },
    routes: {}
  };
  (state as any).economy = initialEconomy;

  const economy = ensureEconomyState(state);

  assert.equal(economy, initialEconomy);
  assert.ok(economy.floors['kvartiry']);
  assert.equal(economy.floors['kvartiry'].floor.KVARTIRY);
});

test('ensureEconomyState returns existing state when valid and floor exists', () => {
  const state = makeGameState({ currentZ: 0 });

  const initialEconomy = {
    priceVersion: 5,
    floors: {
      ['living']: { z: 60, resources: {}, lastTickAt: 100 }
    },
    routes: {}
  };
  (state as any).economy = initialEconomy;

  const economy = ensureEconomyState(state);

  assert.equal(economy, initialEconomy);
  assert.equal(economy.priceVersion, 5);
  assert.equal(economy.floors['living'].lastTickAt, 100);
});
