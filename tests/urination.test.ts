import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, Occupation, RoomType, Tex, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { setNpcContext, updateNPC, processUrinationEvents } from '../src/systems/ai/npc_fsm';
import { resetUrinationTraceCadenceForTests, stampUrineTrace } from '../src/systems/urination';
import { makeGameState } from './helpers';
import { publishEvent } from '../src/systems/events';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

function npc(id: number, faction: Faction, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    faction,
    occupation: faction === Faction.WILD ? Occupation.TRAVELER : Occupation.CLEANER,
    needs: { food: 80, water: 80, sleep: 80, pee: 90, poo: 0 },
    hp: 80,
    maxHp: 80,
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function addBathroom(world: World, id: number, x: number, y: number, w: number, h: number): void {
  world.rooms.push({
    id,
    type: RoomType.BATHROOM,
    x,
    y,
    w,
    h,
    doors: [],
    sealed: false,
    name: 'test bathroom',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  });
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      world.roomMap[world.idx(xx, yy)] = id;
    }
  }
}

function countYellowPixels(world: World): number {
  let count = 0;
  for (const cell of world.surfaceMap.values()) {
    for (let i = 0; i < cell.length; i += 4) {
      if (cell[i + 3] <= 0) continue;
      if (cell[i] >= 160 && cell[i + 1] >= 130 && cell[i + 2] <= 80) count++;
    }
  }
  return count;
}

test('shared urine trace stamps compact yellow marks at the projected hit point', () => {
  const world = openWorld();
  const actor = npc(10, Faction.CITIZEN, 20.25, 20.5);
  const beforeVersion = world.surfaceVersion;
  const actorCell = world.idx(20, 20);

  const stamped = stampUrineTrace(world, actor, {
    seed: 12345,
    pressure: 1,
    streamLength: 1.5,
    spread: 0.35,
    streamSteps: 24,
    width: 0.055,
    dropCount: 1,
  });

  assert.equal(stamped, true);
  assert.ok(world.surfaceVersion > beforeVersion);
  assert.ok(world.surfaceMap.size <= 3);
  assert.equal(world.surfaceMap.has(actorCell), false);
  assert.ok(countYellowPixels(world) >= 8);
});

test('public urination penalizes relation and makes NPC hostile if threshold is met', () => {
  const world = openWorld();
  const state = makeGameState();
  const observer = npc(30, Faction.CITIZEN, 10, 10);
  observer.playerRelation = -15; // Set so one penalty (-15) pushes it to -30

  const event = publishEvent(state, {
    type: 'player_urinated',
    actorId: 999,
    x: 12,
    y: 12,
    roomId: undefined,
    severity: 1,
    privacy: 'witnessed',
    tags: ['urination'],
  });

  observer.ai!.lastSeenUrinationId = event.id - 1;

  processUrinationEvents(world, observer, observer.ai!, state, [], 10);

  // -15 initial - 15 penalty = -30
  assert.equal(observer.playerRelation, -30);
  assert.equal(observer.ai?.goal, AIGoal.HUNT);
  assert.equal(observer.ai?.combatTargetId, 999);
});

test('public urination does not penalize relation if in a bathroom', () => {
  const world = openWorld();
  const state = makeGameState();
  // We need to add a dummy room 0 first to ensure the bathroom is index 1 to match the ID
  addBathroom(world, 0, 0, 0, 1, 1);
  addBathroom(world, 1, 10, 10, 5, 5);
  const observer = npc(40, Faction.CITIZEN, 12, 12);
  observer.playerRelation = 0;

  const event = publishEvent(state, {
    type: 'player_urinated',
    actorId: 999,
    x: 12,
    y: 12,
    roomId: 1,
    severity: 1,
    privacy: 'witnessed',
    tags: ['urination'],
  });

  observer.ai!.lastSeenUrinationId = event.id - 1;

  processUrinationEvents(world, observer, observer.ai!, state, [], 10);

  // Still 0 since it was in a bathroom
  assert.equal(observer.playerRelation, 0);
  assert.notEqual(observer.ai?.goal, AIGoal.HUNT);
});

test('public urination does not penalize relation if too far away', () => {
  const world = openWorld();
  const state = makeGameState();
  const observer = npc(50, Faction.CITIZEN, 10, 10);
  observer.playerRelation = 0;

  const event = publishEvent(state, {
    type: 'player_urinated',
    actorId: 999,
    x: 30, // Way outside 8 cells (64 dist2)
    y: 30,
    roomId: undefined,
    severity: 1,
    privacy: 'witnessed',
    tags: ['urination'],
  });

  observer.ai!.lastSeenUrinationId = event.id - 1;

  processUrinationEvents(world, observer, observer.ai!, state, [], 10);

  assert.equal(observer.playerRelation, 0);
});

test('wild NPC urination is an explicit in-place routine instead of a bathroom path', () => {
  resetUrinationTraceCadenceForTests();
  const world = openWorld();
  addBathroom(world, 0, 40, 40, 5, 5);
  const wild = npc(20, Faction.WILD, 10.5, 10.5);

  setNpcContext([], 10);
  updateNPC(world, [wild], wild, 1, 10, { hour: 12, minute: 0, totalMinutes: 720 }, false);

  assert.ok((wild.needs?.pee ?? 90) < 90);
  assert.equal(wild.ai?.path.length ?? 0, 0);
  assert.ok(world.surfaceMap.size > 0);
  for (const idx of world.surfaceMap.keys()) {
    assert.equal(world.roomMap[idx], -1);
  }
});
