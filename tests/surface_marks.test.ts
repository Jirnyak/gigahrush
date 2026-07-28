import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { World } from '../src/core/world';
import { Cell } from '../src/core/types';
import { stampBlackHandMark, getBlackHandMarkCells } from '../src/systems/surface_marks';

test('getBlackHandMarkCells returns empty array for new world', () => {
  const world = new World();
  const cells = getBlackHandMarkCells(world);
  assert.equal(cells.length, 0);
});

test('stampBlackHandMark creates a mark on valid cells', () => {
  const world = new World();
  const x = 10;
  const y = 10;

  world.cells[world.idx(x, y)] = Cell.FLOOR;

  const stamped = stampBlackHandMark(world, x, y, 12345);

  assert.equal(stamped, true);

  const cells = getBlackHandMarkCells(world);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].x, x);
  assert.equal(cells[0].y, y);
});

test('stampBlackHandMark handles wrap around coordinates', () => {
  const world = new World();
  const x = 256 + 10;
  const y = -10;

  const wx = world.wrap(x);
  const wy = world.wrap(y);

  world.cells[world.idx(wx, wy)] = Cell.FLOOR;

  const stamped = stampBlackHandMark(world, x, y, 12345);

  assert.equal(stamped, true);

  const cells = getBlackHandMarkCells(world);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].x, wx);
  assert.equal(cells[0].y, wy);
});

test('stampBlackHandMark fails on invalid cells like ABYSS', () => {
  const world = new World();
  const x = 15;
  const y = 15;

  world.cells[world.idx(x, y)] = Cell.ABYSS;

  const stamped = stampBlackHandMark(world, x, y, 12345);
  assert.equal(stamped, false);
});

test('stampBlackHandMark enforces the black-hand mark cell cap', () => {
  const world = new World();

  // Universal cap check: stamp well past any reasonable cap; the system bounds internally.
  // No hardcoded cap literal — the cap can grow without breaking this test.
  const attempts = 256;
  let stampedCount = 0;
  for (let i = 0; i < attempts; i++) {
    world.cells[world.idx(i, 0)] = Cell.FLOOR;
    if (stampBlackHandMark(world, i, 0, 12345)) stampedCount++;
  }

  const cells = getBlackHandMarkCells(world);
  assert.ok(stampedCount > 0 && stampedCount < attempts, `cap must bound stamps below ${attempts} attempts, got ${stampedCount}`);
  assert.equal(cells.length, stampedCount, 'stored marks must equal successful stamps');

  // Once at cap, a further stamp on a fresh valid FLOOR cell must fail (cap, not invalid-cell).
  const overCapIdx = attempts + 1;
  world.cells[world.idx(overCapIdx, 0)] = Cell.FLOOR;
  const overCapStamped = stampBlackHandMark(world, overCapIdx, 0, 12345);
  assert.equal(overCapStamped, false);
});

test('stampBlackHandMark ignores duplicate stamps on same cell', () => {
  const world = new World();
  const x = 20;
  const y = 20;

  world.cells[world.idx(x, y)] = Cell.FLOOR;

  // First stamp
  const stamped1 = stampBlackHandMark(world, x, y, 12345);
  assert.equal(stamped1, true);

  // Second stamp on same cell
  const stamped2 = stampBlackHandMark(world, x, y, 12346);
  assert.equal(stamped2, true); // recordBlackHandCell returns true early, but does not push another mark

  const cells = getBlackHandMarkCells(world);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].x, x);
  assert.equal(cells[0].y, y);
});
