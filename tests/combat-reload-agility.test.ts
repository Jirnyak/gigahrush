import { test } from 'node:test';
import * as assert from 'node:assert';
import { calculateReloadTime } from '../src/systems/combat';

test('Agility asymptotically reduces reload time', () => {
    const base = 100;
    const t0 = calculateReloadTime(base, 0);
    const t10 = calculateReloadTime(base, 10);
    const t50 = calculateReloadTime(base, 50);
    const t100 = calculateReloadTime(base, 100);

    assert.strictEqual(t0, 100);
    assert.ok(t10 < t0, `t10 (${t10}) should be less than t0 (${t0})`);
    assert.ok(t50 < t10, `t50 (${t50}) should be less than t10 (${t10})`);
    assert.ok(t100 < t50, `t100 (${t100}) should be less than t50 (${t50})`);
    assert.ok(t100 >= 25, `t100 (${t100}) should not drop below 25`);
});
