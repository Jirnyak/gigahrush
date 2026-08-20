import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { type Entity, type GameState } from '../src/core/types';
import { World } from '../src/core/world';
import { FLOOR_INSTANCES } from '../src/data/floor_instances';
import { spreadElevatorInstanceRumor, type ActiveFloorInstance } from '../src/systems/floor_instances';
import { getNpcMemory, resetNpcMemoryStore } from '../src/systems/npc_memory';
import { makeTestNpc, makeTestPlayer } from './helpers';

function makeState(): GameState {
  return {
    time: 100,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    msgs: [],
    msgLog: [],
  } as unknown as GameState;
}

function makeInstance(def = FLOOR_INSTANCES[0]): ActiveFloorInstance {
  return {
    id: def.id,
    displayNumber: def.displayNumber,
    title: def.title,
    themeTags: [],
    seed: 1,
    seedTag: 't',
    risk: 1,
    enteredAt: 0,
    fromFloor: 0,
    intendedFloor: 0,
    direction: 0,
    returnFloor: 0,
  } as unknown as ActiveFloorInstance;
}

function knows(npc: Entity, rumorId: string): boolean {
  return getNpcMemory(npc, 100).knownRumorIds.includes(rumorId);
}

// Слух — факт места, а не факт игрока: он расходится от лифта, где щёлкнула
// аномалия. Игрок стоит далеко, и мир этого даже не замечает.
test('lift anomaly rumor reaches NPCs at the event, not NPCs at the player', () => {
  resetNpcMemoryStore();
  const world = new World();
  const state = makeState();
  const def = FLOOR_INSTANCES[0];
  const instance = makeInstance(def);

  const liftX = 40;
  const liftY = 40;
  const player = makeTestPlayer({ id: 1, x: 300.5, y: 300.5 });
  const atLift = makeTestNpc({ id: 11, x: liftX + 2, y: liftY });
  const atPlayer = makeTestNpc({ id: 12, x: player.x + 1, y: player.y });
  const entities = [player, atLift, atPlayer];

  const remembered = spreadElevatorInstanceRumor(world, entities, { x: liftX, y: liftY }, state, instance);

  assert.equal(remembered, 1);
  assert.equal(knows(atLift, def.rumorId), true);
  assert.equal(knows(atPlayer, def.rumorId), false);
});

test('lift anomaly rumor ignores where the player stands', () => {
  resetNpcMemoryStore();
  const world = new World();
  const state = makeState();
  const def = FLOOR_INSTANCES[0];
  const instance = makeInstance(def);

  // Зеркальный случай: сосед лифта далеко от игрока, сосед игрока далеко от лифта.
  const player = makeTestPlayer({ id: 1, x: 300.5, y: 300.5 });
  const nearPlayer = makeTestNpc({ id: 21, x: player.x + 1, y: player.y });
  const nearLift = makeTestNpc({ id: 22, x: 41, y: 40.5 });
  const entities = [player, nearPlayer, nearLift];

  const fromLift = spreadElevatorInstanceRumor(world, entities, { x: 40, y: 40 }, state, instance);
  assert.equal(fromLift, 1);
  assert.equal(knows(nearLift, def.rumorId), true);
  assert.equal(knows(nearPlayer, def.rumorId), false);

  // Та же функция, вызванная от координат игрока, учит соседа игрока: точка
  // отсчёта — единственный аргумент, никакой скрытой привязки к игроку нет.
  resetNpcMemoryStore();
  const fromPlayer = spreadElevatorInstanceRumor(world, entities, { x: player.x, y: player.y }, state, instance);
  // Двое: сосед и сам игрок — он просто NPC и запоминает слух на общих основаниях.
  assert.equal(fromPlayer, 2);
  assert.equal(knows(nearPlayer, def.rumorId), true);
  assert.equal(knows(nearLift, def.rumorId), false);
});
