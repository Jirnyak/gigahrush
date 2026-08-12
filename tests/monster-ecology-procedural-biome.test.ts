import test from 'node:test';
import assert from 'node:assert/strict';

import { MonsterKind } from '../src/core/types';
import { getMonsterEcology, rankMonsterEcology, type MonsterEcologyRank } from '../src/data/monster_ecology';

// Authored ecology anchors (`floors`) are design-floor coordinates and every
// procedural route stop sits on an odd z, so a plain `floors.includes(z)` match
// was dead there: NATIVE_FLOOR_MULT never applied and a hell-native creature was
// exactly as likely on a collector floor as a collector-native one. The floor's
// biome tags are the universal key, so the same authored affinity now works on
// design floors, procedural floors and samosbor waves alike.
function weightOf(ranks: readonly MonsterEcologyRank[], kind: MonsterKind): number {
  return ranks.find(rank => rank.kind === kind)?.weight ?? 0;
}

/** A spawnable kind (non-zero weight in the given ranking) native to `z` but not to `notZ`. */
function nativeKind(ranks: readonly MonsterEcologyRank[], z: number, notZ: number): MonsterKind | undefined {
  for (const rank of ranks) {
    if (rank.weight <= 0) continue;
    const def = getMonsterEcology(rank.kind);
    if (!def || def.rare) continue;
    if (def.floors.includes(z) && !def.floors.includes(notZ)) return rank.kind;
  }
  return undefined;
}

test('procedural floor biome tags give native monsters their affinity multiplier', () => {
  // Odd z = procedural stop: no authored anchor sits on it.
  const bare = rankMonsterEcology({ z: -25 });
  const maintenanceNative = nativeKind(bare, -26, -36);
  const hellNative = nativeKind(bare, -36, -26);
  assert.ok(maintenanceNative !== undefined, 'needs a spawnable maintenance-native ecology entry');
  assert.ok(hellNative !== undefined, 'needs a spawnable hell-native ecology entry');

  const onMaintenance = rankMonsterEcology({ z: -25, floorThemeTags: ['maintenance'] });
  assert.ok(
    weightOf(onMaintenance, maintenanceNative) > weightOf(bare, maintenanceNative),
    'a maintenance-native monster must gain weight on a maintenance-themed procedural floor',
  );
  assert.equal(
    weightOf(onMaintenance, hellNative),
    weightOf(bare, hellNative),
    'a hell-native monster must not gain weight there',
  );

  const onHell = rankMonsterEcology({ z: -25, floorThemeTags: ['hell'] });
  assert.ok(weightOf(onHell, hellNative) > weightOf(bare, hellNative));
  assert.equal(weightOf(onHell, maintenanceNative), weightOf(bare, maintenanceNative));
});

test('design floor ranking is unchanged when its own theme tags are supplied', () => {
  const byZ = rankMonsterEcology({ z: -26 });
  const byTags = rankMonsterEcology({ z: -26, floorThemeTags: ['maintenance'] });
  assert.deepEqual(byTags.map(rank => rank.kind), byZ.map(rank => rank.kind));
});
