import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCeilingHeightForTier } from '../src/gen/ceiling_heights.js';

describe('Ceiling Height Tiering', () => {
  it('caps ceiling height and uses correct base step', () => {
    assert.equal(getCeilingHeightForTier(0), 2.0);
    assert.equal(getCeilingHeightForTier(1), 3.5);
    assert.equal(getCeilingHeightForTier(2), 5.0);
    assert.equal(getCeilingHeightForTier(3), 5.0); // should cap at tier 2
    assert.equal(getCeilingHeightForTier(10), 5.0);
  });
});
