import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, W } from '../src/core/types';
import { World } from '../src/core/world';
import {
  PATH_BLOCKER_ROWS_PER_CELL,
  pathBlockedAt,
  pathBlockerRowOffset,
  setPathBlockerRow,
} from '../src/core/path_blockers';
import {
  canActorOccupy,
  canActorOccupyFine,
} from '../src/systems/movement_collision';

const HUMAN_R = 0.16;
const TABLE_CENTER_MASK = 0b00111100;

function makeOpenWorld(cx: number, cy: number, radius: number): World {
  const world = new World();
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      world.set(x, y, Cell.FLOOR);
    }
  }
  return world;
}

function stampTableLikeMask(world: World, x: number, y: number): void {
  const cell = world.idx(x, y);
  for (let row = 2; row <= 5; row++) {
    setPathBlockerRow(world, cell, row, TABLE_CENTER_MASK);
  }
}

test('path blocker rows are eight consecutive bytes per world cell', () => {
  const world = new World();
  const cell = world.idx(7, 9);

  assert.equal(world.pathBlockers.length, W * W * PATH_BLOCKER_ROWS_PER_CELL);
  assert.equal(pathBlockerRowOffset(cell, 7) - pathBlockerRowOffset(cell, 0), 7);

  const before = world.pathBlockerVersion;
  assert.equal(setPathBlockerRow(world, cell, 4, 1 << 4), true);
  assert.equal(world.pathBlockerVersion, (before + 1) | 0);
  assert.equal(world.pathBlockerDirtyVersion, world.pathBlockerVersion);
  assert.equal(setPathBlockerRow(world, cell, 4, 1 << 4), false);
  assert.equal(world.pathBlockerDirtyVersion, world.pathBlockerVersion);
});

test('canActorOccupy rejects a human center inside a stamped table-like mask', () => {
  const world = makeOpenWorld(12, 12, 3);
  stampTableLikeMask(world, 12, 12);

  assert.equal(canActorOccupyFine(world, 12.5, 12.5, HUMAN_R), false);
  assert.equal(canActorOccupy(world, 12.5, 12.5, HUMAN_R), false);
});

test('a masked cell can remain passable at a clear subcell', () => {
  const world = makeOpenWorld(12, 12, 3);
  stampTableLikeMask(world, 12, 12);

  assert.equal(pathBlockedAt(world, 12.125, 12.125), false);
  assert.equal(canActorOccupy(world, 12.125, 12.125, HUMAN_R), true);
});

test('separate X/Y occupancy checks allow sliding around a fine blocker', () => {
  const world = makeOpenWorld(11, 11, 3);
  stampTableLikeMask(world, 11, 10);
  let x = 10.5;
  let y = 10.5;

  const nx = x + 1.0;
  if (canActorOccupy(world, nx, y, HUMAN_R)) x = nx;
  const ny = y + 0.5;
  if (canActorOccupy(world, x, ny, HUMAN_R)) y = ny;

  assert.equal(x, 10.5);
  assert.equal(y, 11.0);
});

test('ignoreFineBlockers bypasses masks but not coarse walls unless requested', () => {
  const world = makeOpenWorld(20, 20, 3);
  stampTableLikeMask(world, 20, 20);

  assert.equal(canActorOccupy(world, 20.5, 20.5, HUMAN_R), false);
  assert.equal(canActorOccupy(world, 20.5, 20.5, HUMAN_R, { ignoreFineBlockers: true }), true);

  const wallWorld = makeOpenWorld(20, 20, 3);
  wallWorld.set(20, 20, Cell.WALL);
  assert.equal(canActorOccupy(wallWorld, 20.5, 20.5, HUMAN_R, { ignoreFineBlockers: true }), false);
  assert.equal(canActorOccupy(wallWorld, 20.5, 20.5, HUMAN_R, {
    ignoreFineBlockers: true,
    ignoreCoarseSolids: true,
  }), true);
});

test('movement occupancy samples blocker masks across the torus edge', () => {
  const world = new World();
  for (const y of [-1, 0]) {
    for (const x of [-1, 0]) {
      world.set(x, y, Cell.FLOOR);
    }
  }
  setPathBlockerRow(world, world.idx(W - 1, W - 1), 7, 1 << 7);

  assert.equal(pathBlockedAt(world, -0.01, -0.01), true);
  assert.equal(canActorOccupy(world, -0.01, -0.01, 0.005), false);
});
