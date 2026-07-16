import test from 'node:test';
import assert from 'node:assert/strict';
import { MonsterKind } from '../src/core/types';
import { generateMonsterLoot } from '../src/systems/procedural_loot';
import { getMonsterEcology } from '../src/data/monster_ecology';

test('generateMonsterLoot respects deterministic chances and counts', () => {
  // ZOMBIE is seeded with:
  // wet_rag_bundle, chance: 0.35, count 1
  // rawmeat, chance: 0.15, min 1 max 2

  // Test 1: High chance (force success for both)
  let val = 0.05; // 0.05 < 0.15, both succeed
  // 0.05 in amount calculation for rawmeat: 0.05 * 2 = 0.1 -> floor -> 0 -> + min 1 = 1.
  const highRand = () => val;
  const dropHigh = generateMonsterLoot(MonsterKind.ZOMBIE, highRand);

  assert.equal(dropHigh.length, 2, 'Should drop two items');
  assert.strictEqual(dropHigh[0]?.itemDefId, 'rawmeat');
  assert.equal(dropHigh[0].amount, 1);
  assert.equal(dropHigh[1].itemDefId, 'wet_rag_bundle');
  assert.equal(dropHigh[1].amount, 1);

  // Test 2: Low chance (fail both)
  const failRand = () => 0.99;
  const dropFail = generateMonsterLoot(MonsterKind.ZOMBIE, failRand);
  assert.equal(dropFail.length, 0, 'Should drop nothing');

  // Test 3: Rawmeat max count roll
  // Let's create a custom rand to return a pass for chance, and high value for amount
  // 1st call for chance wet_rag_bundle: 0.5 (fails)
  // 2nd call for chance rawmeat: 0.1 (passes)
  // 3rd call for amount rawmeat: 0.9 (0.9 * 2 = 1.8 -> floor -> 1 -> + 1 = 2)
  let calls = 0;
  const customRand = () => {
      calls++;
      if (calls === 1) return 0.5; // fails wet_rag
      if (calls === 2) return 0.1; // passes rawmeat
      return 0.9;                  // max amount rawmeat
  };

  const dropCustom = generateMonsterLoot(MonsterKind.ZOMBIE, customRand);
  assert.equal(dropCustom.length, 1);
  assert.equal(dropCustom[0].itemDefId, 'rawmeat');
  assert.equal(dropCustom[0].amount, 2);
});

test('generateMonsterLoot handles unknown kinds', () => {
    // 9999 is invalid
    const emptyDrop = generateMonsterLoot(9999 as MonsterKind, () => 0.01);
    assert.deepEqual(emptyDrop, []);
});
