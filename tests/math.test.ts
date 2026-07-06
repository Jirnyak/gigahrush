import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { clamp } from '../src/core/math';

test('clamp function', async (t) => {
  await t.test('returns the value when it is within the range', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(0, -10, 10), 0);
  });

  await t.test('returns the minimum when the value is below the range', () => {
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(-20, -10, 10), -10);
  });

  await t.test('returns the maximum when the value is above the range', () => {
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(20, -10, 10), 10);
  });

  await t.test('returns the value when it is exactly at the boundaries', () => {
    assert.equal(clamp(0, 0, 10), 0);
    assert.equal(clamp(10, 0, 10), 10);
  });

  await t.test('handles decimal numbers correctly', () => {
    assert.equal(clamp(5.5, 0.0, 10.0), 5.5);
    assert.equal(clamp(-1.5, 0.0, 10.0), 0.0);
    assert.equal(clamp(11.1, 0.0, 10.0), 10.0);
  });

  await t.test('handles identical min and max correctly', () => {
    assert.equal(clamp(5, 10, 10), 10);
    assert.equal(clamp(15, 10, 10), 10);
    assert.equal(clamp(10, 10, 10), 10);
  });
});
