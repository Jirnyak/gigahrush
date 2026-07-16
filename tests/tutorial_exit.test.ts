import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import { makeGameState } from './helpers';
import { DoorState, EntityType, type Entity } from '../src/core/types';
import { activateDoor_FOR_TESTING } from '../src/systems/interactions';
import { TutorialStep } from '../src/systems/tutorial';

test('Tutorial Exit Door interactions', async (t) => {
  await t.test('Locked exit door prevents exit and requests key', () => {
    const world = new World();
    const state = makeGameState({
      tutorialMode: true,
      tutorialStep: TutorialStep.FIND_KEY,
    });
    const player: Entity = {
      id: 1,
      type: EntityType.PLAYER,
      x: 2.5,
      y: 2.5,
      inventory: [],
      alive: true,
    };

    world.idx = (x, y) => Math.floor(y) * 1024 + Math.floor(x);
    const doorIdx = world.idx(3, 3);
    world.doors.set(doorIdx, {
      idx: doorIdx,
      state: DoorState.LOCKED,
      roomA: -1,
      roomB: -1,
      keyId: 'key_tutorial_apartment',
      timer: 0,
      isTutorialExit: true,
    });

    const ctx = {
      world,
      entities: [player],
      player,
      state,
      nextEntityId: { v: 2 },
      dt: 0.1,
      lookX: 3,
      lookY: 3,
    };

    const res = activateDoor_FOR_TESTING(ctx, doorIdx);

    assert.equal(res.handled, true);
    assert.equal(world.doors.get(doorIdx)?.state, DoorState.LOCKED);

    const lastMsg = state.msgs[state.msgs.length - 1];
    assert.ok(lastMsg.text.includes('Заперто намертво. Нужно найти ключ.'));
  });

  await t.test('Exit door opens with the correct key and advances tutorial', async () => {
    const world = new World();
    const state = makeGameState({
      tutorialMode: true,
      tutorialStep: TutorialStep.FIND_KEY,
    });
    const player: Entity = {
      id: 1,
      type: EntityType.PLAYER,
      x: 2.5,
      y: 2.5,
      inventory: [{ defId: 'key_tutorial_apartment', count: 1 }],
      alive: true,
    };

    world.idx = (x, y) => Math.floor(y) * 1024 + Math.floor(x);
    const doorIdx = world.idx(3, 3);
    world.doors.set(doorIdx, {
      idx: doorIdx,
      state: DoorState.LOCKED,
      roomA: -1,
      roomB: -1,
      keyId: 'key_tutorial_apartment',
      timer: 0,
      isTutorialExit: true,
    });

    const ctx = {
      world,
      entities: [player],
      player,
      state,
      nextEntityId: { v: 2 },
      dt: 0.1,
      lookX: 3,
      lookY: 3,
    };

    const res = activateDoor_FOR_TESTING(ctx, doorIdx);

    assert.equal(res.handled, true);
    assert.equal(world.doors.get(doorIdx)?.state, DoorState.OPEN);

    const lastMsg = state.msgs[state.msgs.length - 1];
    // Dynamic import takes a tick to resolve. The message is pushed immediately.
    assert.ok(lastMsg.text.includes('Дверь со скрипом поддалась. Путь свободен.'));

    // Allow promise to resolve
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(state.tutorialMode, false);
    assert.equal(state.tutorialStep, TutorialStep.DONE);
  });
});
