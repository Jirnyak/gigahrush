import test from 'node:test';
import assert from 'node:assert';
import { calculateOdds, calculateCombatScore } from '../src/systems/arena_betting';
import { Entity, EntityType } from '../src/core/types';

test('arena_betting', async (t) => {
  await t.test('calculateOdds returns bounded values', () => {
    const fighterA: Entity = {
      id: 1,
      type: EntityType.NPC,
      x: 0, y: 0,
      hp: 100,
      alive: true,
    } as any;

    const fighterB: Entity = {
      id: 2,
      type: EntityType.NPC,
      x: 0, y: 0,
      hp: 50,
      alive: true,
    } as any;

    const { oddsA, oddsB } = calculateOdds(fighterA, fighterB);

    assert.ok(oddsA >= 1.1);
    assert.ok(oddsB >= 1.1);
    assert.ok(!isNaN(oddsA));
    assert.ok(!isNaN(oddsB));
    assert.ok(isFinite(oddsA));
    assert.ok(isFinite(oddsB));
  });

  await t.test('calculateOdds handles zeroes safely', () => {
    const fighterA: Entity = {
      id: 1,
      type: EntityType.NPC,
      x: 0, y: 0,
      hp: 0,
      alive: true,
    } as any;

    const fighterB: Entity = {
      id: 2,
      type: EntityType.NPC,
      x: 0, y: 0,
      hp: 0,
      alive: true,
    } as any;

    const { oddsA, oddsB } = calculateOdds(fighterA, fighterB);

    assert.strictEqual(oddsA, 1.1);
    assert.strictEqual(oddsB, 1.1);
  });
});
