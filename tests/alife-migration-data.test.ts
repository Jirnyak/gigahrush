import test from 'node:test';
import assert from 'node:assert/strict';

import { FloorLevel } from '../src/core/types';
import {
  ALIFE_POPULATION_BASELINE,
  ALIFE_POPULATION_CAPACITY,
  ALIFE_POPULATION_JITTER,
  buildAlifePopulationPlan,
  validateAlifePopulationPlan,
} from '../src/data/alife_population_plan';
import { validateAlifeMigrationProfiles } from '../src/data/alife_migration';
import {
  floorKeyAllowsNpcs,
  floorKeyBaseFloor,
  floorKeyKnown,
  floorKeyZ,
} from '../src/data/floor_keys';
import {
  DESIGN_FLOOR_ROUTES,
} from '../src/data/design_floors';
import {
  PROCEDURAL_FLOOR_ZS,
  makeProceduralFloorSpec,
} from '../src/data/procedural_floors';
import '../src/gen/design_floors/floor_69';
import '../src/gen/hell/madoka';
import '../src/gen/maintenance/gordon';
import '../src/gen/ministry/npcs';

function routeKeysForRun(runSeed: number): string[] {
  return [
    'story:ministry',
    'story:kvartiry',
    'story:living',
    'story:maintenance',
    'story:hell',
    'story:void',
    ...DESIGN_FLOOR_ROUTES.map(route => `design:${route.id}`),
    ...PROCEDURAL_FLOOR_ZS.map(z => `procedural:z${z}`),
  ];
}

test('A-Life population plan validates and allocates the run-sized budget', () => {
  const runSeed = 24680;
  const plan = buildAlifePopulationPlan({
    runSeed,
    routeKeys: routeKeysForRun(runSeed),
    proceduralSpecs: PROCEDURAL_FLOOR_ZS.map(z => makeProceduralFloorSpec(runSeed, z)),
  });

  assert.deepEqual(validateAlifePopulationPlan(plan), []);
  assert.ok(plan.total >= ALIFE_POPULATION_BASELINE - ALIFE_POPULATION_JITTER);
  assert.ok(plan.total <= ALIFE_POPULATION_CAPACITY);
  assert.equal(plan.version, 1);
  const ordinary = plan.buckets.reduce((sum, bucket) => sum + bucket.targetCount, 0);
  assert.equal(ordinary + plan.reserved.length, plan.total);
  assert.equal(new Set(plan.buckets.map(bucket => bucket.floorKey)).size, plan.buckets.length);
  assert.equal(new Set(plan.reserved.map(identity => identity.plotNpcId).filter(Boolean)).size, plan.reserved.filter(identity => identity.plotNpcId).length);
});

test('A-Life population plan uses seed-sized totals below technical capacity', () => {
  const totals = new Set<number>();
  for (const runSeed of [1, 2, 3, 4, 5, 13579, 24680]) {
    const plan = buildAlifePopulationPlan({
      runSeed,
      routeKeys: routeKeysForRun(runSeed),
      proceduralSpecs: PROCEDURAL_FLOOR_ZS.map(z => makeProceduralFloorSpec(runSeed, z)),
    });
    assert.ok(plan.total >= ALIFE_POPULATION_BASELINE - ALIFE_POPULATION_JITTER);
    assert.ok(plan.total <= ALIFE_POPULATION_CAPACITY);
    totals.add(plan.total);
  }
  assert.ok(totals.size > 1, 'run seed should change actual A-Life population total');
});

test('A-Life population plan keeps authored floor taste and NPC-free route stops explicit', () => {
  const runSeed = 13579;
  const plan = buildAlifePopulationPlan({
    runSeed,
    routeKeys: routeKeysForRun(runSeed),
    proceduralSpecs: PROCEDURAL_FLOOR_ZS.map(z => makeProceduralFloorSpec(runSeed, z)),
  });
  const byKey = new Map(plan.buckets.map(bucket => [bucket.floorKey, bucket]));

  assert.ok((byKey.get('design:floor_69')?.targetCount ?? 0) > 0);
  assert.ok(byKey.get('design:floor_69')?.tags.includes('floor_69'));
  assert.ok((byKey.get('design:black_market_88')?.targetCount ?? 0) > 0);
  assert.ok(byKey.get('design:black_market_88')?.tags.includes('black_market_88'));
  assert.ok((byKey.get('design:slime_nii')?.targetCount ?? 0) > 0);
  assert.ok(byKey.get('design:slime_nii')?.tags.includes('slime_nii'));
  assert.ok((byKey.get('story:ministry')?.targetCount ?? 0) > 0);
  assert.equal(byKey.get('story:void')?.targetCount, 0);
  assert.equal(byKey.get('design:darkness')?.targetCount, 0);

  const lowerProcedural = [...byKey.values()].filter(bucket =>
    bucket.floorKey.startsWith('procedural:') &&
    bucket.baseFloor !== FloorLevel.VOID &&
    bucket.tags.some(tag => tag === 'route_pressure' || tag === 'industrial' || tag === 'samosbor' || tag === 'cult')
  );
  assert.ok(lowerProcedural.length > 0, 'lower procedural route groups should be represented by tagged buckets');
});

test('A-Life population plan resolves authored NPC floor keys from their content packages', () => {
  const runSeed = 86420;
  const plan = buildAlifePopulationPlan({
    runSeed,
    routeKeys: routeKeysForRun(runSeed),
    proceduralSpecs: PROCEDURAL_FLOOR_ZS.map(z => makeProceduralFloorSpec(runSeed, z)),
  });
  const reserved = new Map(plan.reserved.map(identity => [identity.plotNpcId, identity]));

  assert.equal(reserved.get('gordon_freeman')?.floorKey, 'story:maintenance');
  assert.equal(reserved.get('meduka_meguku')?.floorKey, 'story:hell');
  assert.equal(reserved.get('f69_performer_ira')?.floorKey, 'design:floor_69');
  assert.equal(reserved.get('rotenbergov')?.floorKey, 'story:ministry');
  assert.equal(reserved.get('rotenbergov')?.money, 10_000);
  assert.equal(reserved.get('rotenbergov')?.accountRubles, 4_990_000);
  assert.equal(reserved.get('rotenbergov')?.hp, 3000);
  assert.equal(reserved.get('rotenbergov')?.maxHp, 3000);
  assert.equal(reserved.get('yakov')?.level, 10);
  assert.equal(reserved.get('yakov')?.hp, 800);
  assert.equal(reserved.get('yakov')?.maxHp, 800);
  assert.equal(reserved.get('vanka')?.level, 2);
  assert.equal(reserved.get('vanka')?.hp, 300);
});

test('A-Life migration profiles validate statically', () => {
  assert.deepEqual(validateAlifeMigrationProfiles(), []);
});

test('shared floor key resolver covers story, design and procedural A-Life keys', () => {
  assert.equal(floorKeyKnown('story:living'), true);
  assert.equal(floorKeyZ('story:living'), 0);
  assert.equal(floorKeyBaseFloor('story:living'), FloorLevel.LIVING);
  assert.equal(floorKeyAllowsNpcs('story:void'), false);

  assert.equal(floorKeyKnown('design:floor_69'), true);
  assert.equal(floorKeyBaseFloor('design:floor_69'), FloorLevel.MAINTENANCE);

  const proceduralZ = PROCEDURAL_FLOOR_ZS[0];
  assert.equal(floorKeyKnown(`procedural:z${proceduralZ}`), true);
  assert.equal(floorKeyZ(`procedural:z${proceduralZ}`), proceduralZ);
});
