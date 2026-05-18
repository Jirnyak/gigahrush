import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, EntityType, FloorLevel, LiftDirection } from '../src/core/types';
import {
  PROCEDURAL_FLOOR_COUNT,
  PROCEDURAL_FLOOR_ZS,
  makeProceduralFloorSpec,
} from '../src/data/procedural_floors';
import {
  commitFloorRunEntry,
  resolveFloorRunRoute,
  setFloorRunState,
} from '../src/systems/procedural_floors';
import { generateProceduralFloor } from '../src/gen/procedural_floor';
import { makeGameState } from './helpers';

test('floor run inserts three procedural floors before the next lower authored floor', () => {
  const state = makeGameState({ currentFloor: FloorLevel.LIVING });
  setFloorRunState(state, { runSeed: 123, currentZ: 0, specs: {}, visited: {} }, FloorLevel.LIVING);

  const first = resolveFloorRunRoute(state, LiftDirection.DOWN);
  assert.equal(first?.z, 1);
  assert.equal(first?.procedural, true);
  commitFloorRunEntry(state, first!);

  const second = resolveFloorRunRoute(state, LiftDirection.DOWN);
  assert.equal(second?.z, 2);
  assert.equal(second?.procedural, true);
  commitFloorRunEntry(state, second!);

  const third = resolveFloorRunRoute(state, LiftDirection.DOWN);
  assert.equal(third?.z, 3);
  assert.equal(third?.procedural, true);
  commitFloorRunEntry(state, third!);

  const authored = resolveFloorRunRoute(state, LiftDirection.DOWN);
  assert.equal(authored?.z, 4);
  assert.equal(authored?.designFloorId, 'floor_69');
  assert.equal(authored?.baseFloor, FloorLevel.MAINTENANCE);
});

test('floor run exposes seeded procedural slots across the normal lift span', () => {
  assert.equal(PROCEDURAL_FLOOR_COUNT, 60);
  assert.equal(PROCEDURAL_FLOOR_ZS[0], -39);
  assert.equal(PROCEDURAL_FLOOR_ZS.at(-1), 39);

  const state = makeGameState({ currentFloor: FloorLevel.LIVING });
  setFloorRunState(state, { runSeed: 456, currentZ: 0, specs: {}, visited: {} }, FloorLevel.LIVING);

  for (const expectedZ of [-1, -2, -3]) {
    const entry = resolveFloorRunRoute(state, LiftDirection.UP);
    assert.equal(entry?.z, expectedZ);
    assert.equal(entry?.procedural, true);
    commitFloorRunEntry(state, entry!);
  }

  const communalRing = resolveFloorRunRoute(state, LiftDirection.UP);
  assert.equal(communalRing?.z, -4);
  assert.equal(communalRing?.designFloorId, 'communal_ring');
  commitFloorRunEntry(state, communalRing!);

  for (const expectedZ of [-5, -6, -7]) {
    const entry = resolveFloorRunRoute(state, LiftDirection.UP);
    assert.equal(entry?.z, expectedZ);
    assert.equal(entry?.procedural, true);
    commitFloorRunEntry(state, entry!);
  }

  const crossroads = resolveFloorRunRoute(state, LiftDirection.UP);
  assert.equal(crossroads?.z, -8);
  assert.equal(crossroads?.designFloorId, 'manhattan_crossroads');
  commitFloorRunEntry(state, crossroads!);

  for (const expectedZ of [-9, -10, -11]) {
    const entry = resolveFloorRunRoute(state, LiftDirection.UP);
    assert.equal(entry?.z, expectedZ);
    assert.equal(entry?.procedural, true);
    commitFloorRunEntry(state, entry!);
  }

  const kvartiry = resolveFloorRunRoute(state, LiftDirection.UP);
  assert.equal(kvartiry?.z, -12);
  assert.equal(kvartiry?.storyFloor, FloorLevel.KVARTIRY);
});

test('procedural floor specs are deterministic from run seed and z', () => {
  const a = makeProceduralFloorSpec(999, 2);
  const b = makeProceduralFloorSpec(999, 2);
  const c = makeProceduralFloorSpec(999, 3);

  assert.deepEqual(a, b);
  assert.notEqual(a.seed, c.seed);
});

test('procedural floor generator returns a playable non-story floor', () => {
  const spec = makeProceduralFloorSpec(321, 1);
  const gen = generateProceduralFloor(spec);
  const spawnCell = gen.world.cells[gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY))];
  const liftUp = gen.world.liftDir.some((dir, idx) => dir === LiftDirection.UP && gen.world.cells[idx] === Cell.LIFT);
  const liftDown = gen.world.liftDir.some((dir, idx) => dir === LiftDirection.DOWN && gen.world.cells[idx] === Cell.LIFT);

  assert.equal(spawnCell, Cell.FLOOR);
  assert.equal(liftUp, true);
  assert.equal(liftDown, true);
  assert.equal(gen.entities.some(e => e.type === EntityType.NPC), true);
  assert.equal(gen.entities.some(e => e.type === EntityType.MONSTER), true);
  assert.equal(gen.entities.some(e => e.type === EntityType.ITEM_DROP), true);
});
