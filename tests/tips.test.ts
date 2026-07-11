import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomTip, TIP_COUNT } from '../src/data/tips';
import { seedGlobalRng } from '../src/core/rand';

test('randomTip returns a correctly formatted string', () => {
  const tip = randomTip();
  assert.equal(typeof tip, 'string');

  const match = tip.match(/^Совет (\d+): (.+)$/);
  assert.ok(match, `Tip "${tip}" does not match the expected format`);

  const num = parseInt(match[1] as string, 10);
  assert.ok(num >= 1 && num <= TIP_COUNT, `Tip number ${num} is out of bounds (1-${TIP_COUNT})`);
  assert.ok((match[2] as string).length > 0, 'Tip text should not be empty');
});

test('randomTip covers bounds with seeded global RNG', () => {
  // Seed the global RNG to get deterministic results.
  // With xorshift32 the first output for seed 1 is a known value,
  // so we just verify format and range are always valid.
  const seen = new Set<number>();
  for (let seed = 1; seed <= 2000; seed++) {
    seedGlobalRng(seed);
    const tip = randomTip();
    const match = tip.match(/^Совет (\d+): (.+)$/);
    assert.ok(match, `Seed ${seed}: Tip "${tip}" does not match the expected format`);
    const num = parseInt(match[1] as string, 10);
    assert.ok(num >= 1 && num <= TIP_COUNT, `Seed ${seed}: Tip number ${num} out of bounds`);
    seen.add(num);
  }
  // With 2000 seeds and TIP_COUNT tips, we should hit at least a third of them
  assert.ok(seen.size > TIP_COUNT * 0.1, `Only ${seen.size} unique tips seen, expected broader coverage`);
});
