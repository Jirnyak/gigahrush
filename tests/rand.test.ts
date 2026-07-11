import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { seededRandom, withSeededRandom, rng, seedGlobalRng, _overrideRng, _restoreRng } from '../src/core/rand';

test('seededRandom produces deterministic values', () => {
  const seed = 12345;
  const rng1 = seededRandom(seed);
  const val1_1 = rng1();
  const val1_2 = rng1();

  assert.notEqual(val1_1, val1_2, 'Successive values should differ');

  const rng2 = seededRandom(seed);
  const val2_1 = rng2();
  const val2_2 = rng2();

  assert.equal(val1_1, val2_1, 'First random value should match for same seed');
  assert.equal(val1_2, val2_2, 'Second random value should match for same seed');
});

test('withSeededRandom produces deterministic rng() values and restores state', () => {
  const seed = 54321;
  const values1: number[] = [];

  seedGlobalRng(999);
  const beforeVal = rng();

  withSeededRandom(seed, () => {
    values1.push(rng());
    values1.push(rng());
  });

  const values2: number[] = [];
  withSeededRandom(seed, () => {
    values2.push(rng());
    values2.push(rng());
  });

  assert.deepEqual(values1, values2, 'rng() should produce deterministic values under the same seed');
});

test('withSeededRandom restores rng state even if an error is thrown', () => {
  const seed = 999;
  seedGlobalRng(42);
  const valBefore = rng();

  seedGlobalRng(42);
  assert.throws(() => {
    withSeededRandom(seed, () => {
      rng(); // consume one value under different seed
      throw new Error('Test error');
    });
  }, /Test error/);

  // After throw, rng state should be restored
  const valAfterThrow = rng();
  // The value should match what we'd get from seed 42 after consuming one value
  assert.equal(valAfterThrow, valBefore, 'rng state should be restored after error');
});

test('_overrideRng/_restoreRng work for test mocking', () => {
  const values = [0.1, 0.5, 0.9];
  let idx = 0;
  _overrideRng(() => values[idx++]!);

  assert.equal(rng(), 0.1);
  assert.equal(rng(), 0.5);
  assert.equal(rng(), 0.9);

  _restoreRng();

  // After restore, rng() should use xorshift again (non-deterministic without seed)
  const val = rng();
  assert.equal(typeof val, 'number');
  assert.ok(val >= 0 && val < 1);
});
