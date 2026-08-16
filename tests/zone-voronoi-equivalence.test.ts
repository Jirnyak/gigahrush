import test from 'node:test';
import assert from 'node:assert/strict';

import { W } from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { generateZones } from '../src/gen/shared';

/** Эталон: полный перебор всех центров, как было до оптимизации 3×3. */
function bruteForceZoneMap(world: World): Int32Array {
  const zones = world.zones;
  const map = new Int32Array(W * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let bestD = Infinity;
      let bestZ = 0;
      for (let z = 0; z < zones.length; z++) {
        const dx = world.delta(x, zones[z].cx);
        const dy = world.delta(y, zones[z].cy);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestZ = z; }
      }
      map[y * W + x] = bestZ;
    }
  }
  return map;
}

test('zone Voronoi: 3×3-окрестность даёт побайтово тот же zoneMap, что полный перебор', () => {
  for (const seed of [1, 7, 1337, 20260816, 0x7fffffff]) {
    const world = new World();
    seedGlobalRng(seed);
    generateZones(world);

    const expected = bruteForceZoneMap(world);
    const actual = world.zoneMap;
    assert.equal(actual.length, expected.length, `сид ${seed}: длина zoneMap`);

    let mismatches = 0;
    let firstAt = -1;
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) {
        if (firstAt < 0) firstAt = i;
        mismatches++;
      }
    }
    assert.equal(
      mismatches, 0,
      `сид ${seed}: ${mismatches} расхождений, первое в клетке (${firstAt % W}, ${(firstAt / W) | 0}) — `
      + `быстрый ${actual[firstAt]}, эталон ${expected[firstAt]}`,
    );
  }
});
