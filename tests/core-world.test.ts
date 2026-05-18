import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, DoorState, Feature, W } from '../src/core/types';
import { World } from '../src/core/world';

test('World wraps coordinates and measures toroidal distance', () => {
  const world = new World();

  assert.equal(world.wrap(-1), W - 1);
  assert.equal(world.wrap(W + 2), 2);
  assert.equal(world.idx(-1, -1), (W - 1) * W + (W - 1));
  assert.equal(world.delta(0, W - 1), -1);
  assert.equal(world.delta(W - 1, 0), 1);
  assert.equal(world.dist(0, 0, W - 1, 0), 1);
  assert.equal(world.dist2(0, 0, W - 1, W - 1), 2);
});

test('World solid() respects door states and passable cells', () => {
  const world = new World();
  const i = world.idx(10, 10);

  world.cells[i] = Cell.FLOOR;
  assert.equal(world.solid(10, 10), false);

  world.cells[i] = Cell.WATER;
  assert.equal(world.solid(10, 10), false);

  world.cells[i] = Cell.DOOR;
  world.doors.set(i, { idx: i, state: DoorState.CLOSED, roomA: -1, roomB: -1, keyId: '', timer: 0 });
  assert.equal(world.solid(10, 10), true);

  world.doors.get(i)!.state = DoorState.OPEN;
  assert.equal(world.solid(10, 10), false);

  world.doors.get(i)!.state = DoorState.HERMETIC_CLOSED;
  assert.equal(world.solid(10, 10), true);
});

test('World dirty markers are monotonic signed counters', () => {
  const world = new World();
  const wallVersion = world.wallTexVersion;
  const fogVersion = world.fogVersion;

  world.markWallTexDirty();
  world.markFogDirty();

  assert.equal(world.wallTexVersion, (wallVersion + 1) | 0);
  assert.equal(world.fogVersion, (fogVersion + 1) | 0);
});

test('World bakeLights lights nearby cells without leaking past radius', () => {
  const world = new World();
  const cx = 100;
  const cy = 100;
  world.features[world.idx(cx, cy)] = Feature.LAMP;

  world.bakeLights();

  assert.equal(world.light[world.idx(cx, cy)], 1);
  assert.ok(world.light[world.idx(cx + 4, cy)] > 0);
  assert.equal(world.light[world.idx(cx + 9, cy)], 0);
});
