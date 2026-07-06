import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W } from '../src/core/types';
import { visualSlotOffset, VISUAL_SLOTS_PER_CELL } from '../src/core/world';

test('visualSlotOffset computes correct offsets and enforces bounds', () => {
  // Happy path
  assert.equal(visualSlotOffset(0, 0), 0);
  assert.equal(visualSlotOffset(1, 0), VISUAL_SLOTS_PER_CELL);
  assert.equal(visualSlotOffset(1, 1), VISUAL_SLOTS_PER_CELL + 1);
  assert.equal(visualSlotOffset(5, 7), 5 * VISUAL_SLOTS_PER_CELL + 7);

  // Boundary conditions
  const MAX_CELL_IDX = W * W - 1;
  const MAX_SLOT = VISUAL_SLOTS_PER_CELL - 1;

  assert.equal(visualSlotOffset(MAX_CELL_IDX, 0), MAX_CELL_IDX * VISUAL_SLOTS_PER_CELL);
  assert.equal(visualSlotOffset(MAX_CELL_IDX, MAX_SLOT), MAX_CELL_IDX * VISUAL_SLOTS_PER_CELL + MAX_SLOT);
  assert.equal(visualSlotOffset(0, MAX_SLOT), MAX_SLOT);

  // Error cases: cellIdx
  assert.throws(() => visualSlotOffset(-1, 0), RangeError, 'Should throw for negative cellIdx');
  assert.throws(() => visualSlotOffset(W * W, 0), RangeError, 'Should throw for cellIdx >= W*W');
  assert.throws(() => visualSlotOffset(NaN, 0), RangeError, 'Should throw for NaN cellIdx');
  assert.throws(() => visualSlotOffset(Infinity, 0), RangeError, 'Should throw for Infinity cellIdx');
  assert.throws(() => visualSlotOffset(-Infinity, 0), RangeError, 'Should throw for -Infinity cellIdx');
  assert.throws(() => visualSlotOffset(1.5, 0), RangeError, 'Should throw for non-integer cellIdx');

  // Error cases: slot
  assert.throws(() => visualSlotOffset(0, -1), RangeError, 'Should throw for negative slot');
  assert.throws(() => visualSlotOffset(0, VISUAL_SLOTS_PER_CELL), RangeError, 'Should throw for slot >= VISUAL_SLOTS_PER_CELL');
  assert.throws(() => visualSlotOffset(0, NaN), RangeError, 'Should throw for NaN slot');
  assert.throws(() => visualSlotOffset(0, Infinity), RangeError, 'Should throw for Infinity slot');
  assert.throws(() => visualSlotOffset(0, -Infinity), RangeError, 'Should throw for -Infinity slot');
  assert.throws(() => visualSlotOffset(0, 1.5), RangeError, 'Should throw for non-integer slot');

  // Both error
  assert.throws(() => visualSlotOffset(-1, -1), RangeError, 'Should throw if both are invalid');
});
