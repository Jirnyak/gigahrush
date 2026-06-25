import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateDamage } from '../src/systems/combat';

describe('calculateDamage', () => {
  test('calculates normal damage correctly', () => {
    assert.equal(calculateDamage(10, 2), 8);
  });

  test('clamps damage to 0 when armor exceeds base damage', () => {
    assert.equal(calculateDamage(5, 10), 0);
  });

  test('handles zero values correctly', () => {
    assert.equal(calculateDamage(0, 0), 0);
    assert.equal(calculateDamage(10, 0), 10);
    assert.equal(calculateDamage(0, 10), 0);
  });

  test('handles negative inputs', () => {
    assert.equal(calculateDamage(-10, 0), 0);
    assert.equal(calculateDamage(10, -5), 15);
    assert.equal(calculateDamage(-10, -5), 0);
  });
});
