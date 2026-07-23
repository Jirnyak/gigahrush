import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPILED_CATEGORIES, COMPILED_SKELETONS, COMPILED_MARKOV_GRAPH } from '../src/data/markov_compiled_matrix.js';

test('compiled markov matrix has all categories and zero alien franchise words', () => {
  assert.ok(Object.keys(COMPILED_CATEGORIES).length >= 5, 'Must have canonical categories');
  assert.ok(COMPILED_SKELETONS.length >= 10, 'Must have syntax skeletons');
  assert.ok(Object.keys(COMPILED_MARKOV_GRAPH).length > 100, 'Graph must contain states trained from 10 corpus sources');

  const BANNED = ['сидорович', 'чаэс', 'припять', 'чернобыль', 'снорк', 'меченый', 'стрелок', 'вднх', 'полис', 'ганза', 'орден', 'саркофаг'];
  for (const [catName, items] of Object.entries(COMPILED_CATEGORIES)) {
    for (const item of items) {
      const lower = item.text.toLowerCase();
      for (const bannedWord of BANNED) {
        assert.equal(lower.includes(bannedWord), false, `Banned word "${bannedWord}" found in category ${catName}: ${item.text}`);
      }
    }
  }
});

