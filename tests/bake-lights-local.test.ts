import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/world';
import { Cell, Feature } from '../src/core/types';

/* Windowed light rebake (world.bakeLightsLocal / setFeatureAt) must be exactly
 * equivalent to a full world.bakeLights() for any single-cell light change. The
 * invariant: after mutating ONE feature cell and relighting locally, the ENTIRE
 * lightmap equals what a full bake would produce. Covers add, remove and the
 * overlap case (removing one of two nearby lamps must restore the other's
 * contribution in the shared region). */

/** A world with a floor block carved out so light actually propagates
 * (lightPassesCell only lets FLOOR/WATER/open-DOOR through). Interior, away from
 * the torus seam. */
function flooredWorld(): World {
  const w = new World();
  for (let y = 480; y < 544; y++) {
    for (let x = 480; x < 544; x++) {
      w.cells[w.idx(x, y)] = Cell.FLOOR;
    }
  }
  return w;
}

function assertLightEqual(actual: World, expected: World, label: string): void {
  const a = actual.light;
  const e = expected.light;
  assert.equal(a.length, e.length, `${label}: light array length`);
  let mismatches = 0;
  let firstAt = -1;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - e[i]) > 1e-6) {
      if (firstAt < 0) firstAt = i;
      mismatches++;
    }
  }
  assert.equal(
    mismatches,
    0,
    `${label}: ${mismatches} light cells differ from full bake (first at idx ${firstAt}: ` +
      `local=${firstAt >= 0 ? a[firstAt] : 'n/a'} full=${firstAt >= 0 ? e[firstAt] : 'n/a'})`,
  );
}

test('bakeLightsLocal add matches a full bake with the source present', () => {
  const idxA = 500 * 1024 + 500; // w.idx(500, 500)

  const reference = flooredWorld();
  reference.features[idxA] = Feature.LAMP;
  reference.bakeLights();

  const windowed = flooredWorld();
  windowed.bakeLights(); // all dark: no features yet
  windowed.features[idxA] = Feature.LAMP;
  windowed.bakeLightsLocal(idxA);

  assertLightEqual(windowed, reference, 'add lamp');
});

test('bakeLightsLocal remove matches a full bake with the source gone', () => {
  const idxA = 500 * 1024 + 500;
  const idxB = 500 * 1024 + 508; // 8 cells away — overlaps lamp A (radius 8)

  // Reference: only A remains.
  const reference = flooredWorld();
  reference.features[idxA] = Feature.LAMP;
  reference.bakeLights();

  // Start with A + B lit, then remove B and relight locally.
  const windowed = flooredWorld();
  windowed.features[idxA] = Feature.LAMP;
  windowed.features[idxB] = Feature.LAMP;
  windowed.bakeLights();
  windowed.features[idxB] = Feature.NONE;
  windowed.bakeLightsLocal(idxB);

  // Removing B must restore A's contribution across the region they shared.
  assertLightEqual(windowed, reference, 'remove overlapping lamp');
});

test('setFeatureAt relights through the windowed path and matches a full bake', () => {
  const idxA = 500 * 1024 + 500;

  const reference = flooredWorld();
  reference.features[idxA] = Feature.LAMP;
  reference.bakeLights();

  const viaSetter = flooredWorld();
  const before = viaSetter.lightVersion;
  const changed = viaSetter.setFeatureAt(idxA, Feature.LAMP); // triggers bakeLightsLocal internally

  assert.equal(changed, true, 'setFeatureAt reports the change');
  assert.notEqual(viaSetter.lightVersion, before, 'lightVersion bumped on relight');
  assertLightEqual(viaSetter, reference, 'setFeatureAt lamp');
});

test('setFeatureAt with a non-light feature leaves the lightmap untouched', () => {
  const idxLamp = 500 * 1024 + 500;
  const idxShelf = 500 * 1024 + 505;

  const w = flooredWorld();
  w.setFeatureAt(idxLamp, Feature.LAMP);
  const litSnapshot = Float32Array.from(w.light);
  const versionAfterLamp = w.lightVersion;

  // A non-light feature change must not rebake or bump the light version.
  w.setFeatureAt(idxShelf, Feature.SHELF);

  assert.equal(w.lightVersion, versionAfterLamp, 'no light version bump for non-light feature');
  let mismatches = 0;
  for (let i = 0; i < w.light.length; i++) {
    if (Math.abs(w.light[i] - litSnapshot[i]) > 1e-6) mismatches++;
  }
  assert.equal(mismatches, 0, 'lightmap unchanged by non-light feature change');
});

/* The samosbor wave front eats several lamps inside one tick, then relights each
 * one through its own window instead of paying a full W² bake per tick. Batched
 * windowed relights must land on exactly the same lightmap as one full bake —
 * including lamps whose ±R boxes overlap, and mixed add/remove in one batch. */
test('a batch of relightAround calls matches one full bake (samosbor wave tick)', () => {
  // Four lamps in a cluster: 500,500 / 500,506 / 506,500 / 512,512.
  // The first three overlap each other's radius-8 windows.
  const cluster = [500 * 1024 + 500, 506 * 1024 + 500, 500 * 1024 + 506, 512 * 1024 + 512];
  const eaten = cluster.slice(0, 3); // wave front removes three of them
  const grown = 504 * 1024 + 494;    // and stamps one candle nearby in the same tick

  const reference = flooredWorld();
  for (const i of cluster) reference.features[i] = Feature.LAMP;
  for (const i of eaten) reference.features[i] = Feature.NONE;
  reference.features[grown] = Feature.CANDLE;
  reference.bakeLights();

  const batched = flooredWorld();
  for (const i of cluster) batched.features[i] = Feature.LAMP;
  batched.bakeLights();
  // Mutate every cell first, exactly like the wave batch, then relight per cell.
  for (const i of eaten) batched.features[i] = Feature.NONE;
  batched.features[grown] = Feature.CANDLE;
  const before = batched.lightVersion;
  for (const i of [...eaten, grown]) batched.relightAround(i);

  assert.notEqual(batched.lightVersion, before, 'lightVersion bumped for the batch');
  assertLightEqual(batched, reference, 'batched windowed relight');
});
