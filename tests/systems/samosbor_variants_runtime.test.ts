import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { FloorLevel } from '../../src/core/types.js';
import {
  chooseSamosborVariant,
  getActiveSamosborVariant,
  clearActiveSamosborVariant,
  forceNextSamosborVariant,
  getForcedSamosborVariant,
  getLastSamosborVariant,
} from '../../src/systems/samosbor_variants_runtime.js';
import { SAMOSBOR_VARIANTS, getSamosborVariantWeight } from '../../src/data/samosbor_variants.js';

let originalMathRandom: typeof Math.random;
let originalCrypto: Crypto | undefined;

let mockRandomValue = 0.5;

beforeEach(() => {
  originalMathRandom = Math.random;
  originalCrypto = globalThis.crypto;

  Math.random = () => mockRandomValue;
  // Override crypto to make sure our mocked Math.random is used,
  // or mock crypto if we want to test secureRandom specifically.
  // The secureRandom function falls back to Math.random if crypto doesn't have getRandomValues
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: (arr: Uint32Array) => {
        // mockRandomValue is 0..1, max uint32 is 4294967296
        arr[0] = Math.floor(mockRandomValue * 4294967296);
        return arr;
      }
    },
    writable: true,
    configurable: true
  });

  clearActiveSamosborVariant();
});

afterEach(() => {
  Math.random = originalMathRandom;
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    writable: true,
    configurable: true
  });
  clearActiveSamosborVariant();
});

test('chooseSamosborVariant selects variant based on random weight roll (low roll)', () => {
  mockRandomValue = 0.0; // Should pick the very first valid variant

  const variant = chooseSamosborVariant(FloorLevel.LIVING);
  const active = getActiveSamosborVariant();

  assert.ok(variant);
  assert.ok(active);
  assert.equal(variant.def.id, active.def.id);

  // With roll 0, we expect the first variant that has weight > 0 on LIVING
  let firstValidId = null;
  for (const def of SAMOSBOR_VARIANTS) {
    if (getSamosborVariantWeight(def.id, FloorLevel.LIVING) > 0) {
      firstValidId = def.id;
      break;
    }
  }

  assert.equal(variant.def.id, firstValidId);
  assert.equal(getLastSamosborVariant(), firstValidId);
});

test('chooseSamosborVariant selects variant based on random weight roll (high roll)', () => {
  mockRandomValue = 0.9999999; // Should pick the last valid variant

  const variant = chooseSamosborVariant(FloorLevel.LIVING);

  let total = 0;
  for (const def of SAMOSBOR_VARIANTS) {
    total += getSamosborVariantWeight(def.id, FloorLevel.LIVING);
  }

  let roll = mockRandomValue * total;
  let expectedId = null;
  for (const def of SAMOSBOR_VARIANTS) {
    roll -= getSamosborVariantWeight(def.id, FloorLevel.LIVING);
    if (roll <= 0) {
      expectedId = def.id;
      break;
    }
  }

  if (!expectedId) {
      expectedId = SAMOSBOR_VARIANTS[0].id;
  }

  assert.equal(variant.def.id, expectedId);
  assert.equal(getLastSamosborVariant(), expectedId);
});

test('forceNextSamosborVariant forces the next variant correctly', () => {
  // Pick a specific variant we know exists, like 'electric' or 'meat'
  // and force it.
  const forcedId = 'meat';

  // Verify it exists in SAMOSBOR_VARIANTS first
  const def = SAMOSBOR_VARIANTS.find(v => v.id === forcedId);
  assert.ok(def, `Variant ${forcedId} must exist for test to work`);

  const success = forceNextSamosborVariant(forcedId);
  assert.equal(success, true);
  assert.equal(getForcedSamosborVariant(), forcedId);

  // We need a floor where this variant is valid
  const validFloor = def.floors[0];

  const variant = chooseSamosborVariant(validFloor);

  assert.equal(variant.def.id, forcedId);
  assert.equal(getActiveSamosborVariant()?.def.id, forcedId);
  assert.equal(getLastSamosborVariant(), forcedId);
  assert.equal(getForcedSamosborVariant(), null, 'Forced variant should be cleared after use');
});

test('forceNextSamosborVariant falls back to random if forced variant is not valid for floor', () => {
  // Let's find a variant that has specific floor requirements
  let restrictedDef = null;
  let invalidFloor = null;

  for (const def of SAMOSBOR_VARIANTS) {
    // Find a floor that is NOT in def.floors
    const allFloors = [FloorLevel.LIVING, FloorLevel.HELL, FloorLevel.VOID, FloorLevel.KVARTIRY, FloorLevel.MAINTENANCE, FloorLevel.MINISTRY];
    for (const floor of allFloors) {
      if (!def.floors.includes(floor)) {
        restrictedDef = def;
        invalidFloor = floor;
        break;
      }
    }
    if (restrictedDef) break;
  }

  assert.ok(restrictedDef, 'Must find a variant with floor restrictions');
  assert.ok(invalidFloor, 'Must find an invalid floor for the restricted variant');

  const success = forceNextSamosborVariant(restrictedDef.id);
  assert.equal(success, true);

  mockRandomValue = 0.0; // Predictable fallback

  const variant = chooseSamosborVariant(invalidFloor);

  assert.notEqual(variant.def.id, restrictedDef.id, 'Should not choose forced variant on invalid floor');
  assert.equal(getForcedSamosborVariant(), null, 'Forced variant should still be cleared even if unused/rejected');
});

test('forceNextSamosborVariant returns false for unknown variants', () => {
  // @ts-ignore - Intentionally passing invalid ID
  const success = forceNextSamosborVariant('invalid_made_up_variant_123');
  assert.equal(success, false);
  assert.equal(getForcedSamosborVariant(), null);
});

test('clearActiveSamosborVariant clears the active variant', () => {
  mockRandomValue = 0.5;
  chooseSamosborVariant(FloorLevel.LIVING);

  assert.ok(getActiveSamosborVariant());

  clearActiveSamosborVariant();

  assert.equal(getActiveSamosborVariant(), null);
});
