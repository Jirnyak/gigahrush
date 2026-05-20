import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, DoorState } from '../src/core/types';
import { World } from '../src/core/world';
import { GAMBLING_MACHINES } from '../src/data/gambling';
import { clearGamblingMachines, resolveGamblingBet, placeGamblingMachine } from '../src/systems/gambling';
import { findInteractionTarget } from '../src/systems/interactions';
import { netHackChance, netHackDifficultyTotal, netHackSkill } from '../src/systems/net_hack';
import { addTestRoom, makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

test('gambling odds resolve stake, gross payout and net result without mutating state', () => {
  const roulette = GAMBLING_MACHINES.roulette;
  assert.deepEqual(resolveGamblingBet(roulette, 10, 0.01), {
    win: true,
    stake: 10,
    grossPayout: 20,
    net: 10,
  });
  assert.deepEqual(resolveGamblingBet(roulette, 10, 0.99), {
    win: false,
    stake: 10,
    grossPayout: 0,
    net: -10,
  });
});

test('net hack chance follows the documented difficulty and skill formula', () => {
  const input = { baseDifficulty: 10, floorDangerOrZ: 5, terminalRandom: 2, level: 4, int: 3 };
  assert.equal(netHackDifficultyTotal(input), 17);
  assert.equal(netHackSkill(input.level, input.int), 17);
  assert.equal(netHackChance(input), 0.45);
  assert.equal(netHackChance({ ...input, level: 99, int: 99 }), 0.92);
  assert.equal(netHackChance({ ...input, level: 0, int: 0, baseDifficulty: 200 }), 0.08);
});

test('interaction dispatcher reports generated gambling machines as E targets', () => {
  clearGamblingMachines();
  const world = new World();
  addTestRoom(world, { id: 0, x: 4, y: 4, w: 6, h: 6 });
  const idx = world.idx(6, 6);
  world.cells[idx] = Cell.FLOOR;
  const machine = placeGamblingMachine(world, 6, 6, 'slots');
  assert.ok(machine);

  const state = makeGameState();
  const player = makeTestPlayer({ x: 5, y: 6, angle: 0 });
  const target = findInteractionTarget({
    world,
    state,
    player,
    entities: [player],
    nextEntityId: { v: 2 },
    lookX: 6,
    lookY: 6,
  });

  assert.equal(target?.kind, 'gambling');
  assert.equal(target?.defId, 'slots');
});

test('interaction dispatcher only reports NPCs when the crosshair is on the sprite', () => {
  clearGamblingMachines();
  const world = new World();
  addTestRoom(world, { id: 0, x: 4, y: 4, w: 8, h: 8 });
  const state = makeGameState();
  const player = makeTestPlayer({ id: 1, x: 5, y: 6, angle: 0 });
  const npc = makeTestNpc({ id: 2, x: 6.25, y: 6, angle: Math.PI });

  const aimed = findInteractionTarget({
    world,
    state,
    player,
    entities: [player, npc],
    nextEntityId: { v: 3 },
    lookX: 6,
    lookY: 6,
  });

  assert.equal(aimed?.kind, 'npc');

  npc.y = 6.75;
  const offCrosshair = findInteractionTarget({
    world,
    state,
    player,
    entities: [player, npc],
    nextEntityId: { v: 3 },
    lookX: 6,
    lookY: 6,
  });

  assert.equal(offCrosshair, null);
});

test('off-crosshair nearby NPC does not mask an aimed door', () => {
  clearGamblingMachines();
  const world = new World();
  addTestRoom(world, { id: 0, x: 4, y: 4, w: 8, h: 8 });
  const doorIdx = world.idx(6, 6);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, { idx: doorIdx, state: DoorState.CLOSED, roomA: -1, roomB: -1, keyId: '', timer: 0 });

  const state = makeGameState();
  const player = makeTestPlayer({ id: 1, x: 5, y: 6, angle: 0 });
  const npc = makeTestNpc({ id: 2, x: 5.4, y: 7.1, angle: -Math.PI / 2 });
  const target = findInteractionTarget({
    world,
    state,
    player,
    entities: [player, npc],
    nextEntityId: { v: 3 },
    lookX: 6,
    lookY: 6,
  });

  assert.equal(target?.kind, 'door');
});
