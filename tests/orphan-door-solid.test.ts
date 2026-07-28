import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, DoorState } from '../src/core/types';
import { World } from '../src/core/world';

// Linchpin of the sealed-room bug class (#1/#2/#3). world.solid() treats a Cell.DOOR
// cell WITHOUT a matching world.doors entry as a permanently-solid wall. Several
// generators wrote `world.cells[i] = Cell.DOOR` but never `world.doors.set(...)`
// (temple nave, library, maintenance arena) → the door read as solid → the room
// behind it was unreachable. The connectivity net can't self-heal it either:
// isConnectivityWalkable counts the orphan door as walkable, so the net believes the
// region is connected while world.solid() silently blocks the player. The fix is to
// register every authored door. Lock the exact semantics so a future world.solid()
// refactor can't quietly resurrect the trap.

function doorCell(world: World): number {
  const i = world.idx(10, 10);
  world.cells[i] = Cell.DOOR;
  return i;
}

test('an unregistered Cell.DOOR is solid (the seal)', () => {
  const world = new World();
  doorCell(world);
  assert.equal(world.solid(10, 10), true, 'orphan door must read as solid — this is the seal');
});

test('a registered CLOSED door is still solid but is openable (has a doors entry)', () => {
  const world = new World();
  const i = doorCell(world);
  world.doors.set(i, { idx: i, state: DoorState.CLOSED, roomA: 1, roomB: -1, keyId: '', timer: 0 });
  assert.equal(world.solid(10, 10), true, 'a CLOSED door is solid until opened');
  assert.ok(world.doors.get(i), 'but it is now a real, openable door — not an orphan');
});

test('a registered OPEN door is passable', () => {
  const world = new World();
  const i = doorCell(world);
  world.doors.set(i, { idx: i, state: DoorState.OPEN, roomA: 1, roomB: -1, keyId: '', timer: 0 });
  assert.equal(world.solid(10, 10), false, 'an OPEN registered door is walkable');
});

test('a registered HERMETIC_OPEN door is passable (liquidator-base doors)', () => {
  const world = new World();
  const i = doorCell(world);
  world.doors.set(i, { idx: i, state: DoorState.HERMETIC_OPEN, roomA: 1, roomB: 2, keyId: '', timer: 0 });
  assert.equal(world.solid(10, 10), false, 'HERMETIC_OPEN registered door is walkable');
});
