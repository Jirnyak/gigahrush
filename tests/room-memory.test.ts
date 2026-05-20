import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Faction, FloorLevel } from '../src/core/types';
import { createWorldEventState, publishEvent } from '../src/systems/events';
import {
  ROOM_MEMORY_BITS,
  ROOM_MEMORY_CAP,
  clearRoomMemory,
  getRoomMemory,
  getRoomMemoryCount,
  roomMemoryHas,
  tickRoomMemory,
} from '../src/systems/room_memory';
import { makeGameState } from './helpers';

test('room memory records public and local player deeds but ignores private events', () => {
  clearRoomMemory();
  const state = makeGameState({
    currentFloor: FloorLevel.LIVING,
    worldEvents: createWorldEventState(),
  });

  publishEvent(state, {
    type: 'item_stolen',
    roomId: 7,
    zoneId: 1,
    actorId: 12,
    actorName: 'Игрок',
    actorFaction: Faction.PLAYER,
    severity: 4,
    privacy: 'witnessed',
    tags: ['container', 'theft', 'witnessed'],
  });
  publishEvent(state, {
    type: 'item_stolen',
    roomId: 8,
    zoneId: 1,
    actorId: 12,
    actorFaction: Faction.PLAYER,
    severity: 5,
    privacy: 'private',
    tags: ['container', 'theft'],
  });

  const memory = getRoomMemory(FloorLevel.LIVING, 7);
  assert.ok(memory);
  assert.equal(roomMemoryHas(memory, ROOM_MEMORY_BITS.THEFT), true);
  assert.equal(memory.severity, 4);
  assert.equal(getRoomMemory(FloorLevel.LIVING, 8), undefined);
});

test('room memory decays on slow ticks and expires without a save shape', () => {
  clearRoomMemory();
  const state = makeGameState({
    currentFloor: FloorLevel.LIVING,
    worldEvents: createWorldEventState(),
  });
  publishEvent(state, {
    type: 'item_deposited',
    roomId: 3,
    zoneId: 0,
    actorId: 1,
    actorFaction: Faction.PLAYER,
    severity: 3,
    privacy: 'local',
    tags: ['container', 'resident_relief', 'relief'],
  });

  const before = getRoomMemory(FloorLevel.LIVING, 3);
  assert.ok(before);
  const ttl = before.ttl;
  const severity = before.severity;
  tickRoomMemory(state.time, 181);
  const decayed = getRoomMemory(FloorLevel.LIVING, 3);
  assert.ok(decayed);
  assert.ok(decayed.ttl < ttl);
  assert.ok(decayed.severity < severity || decayed.ttl <= ttl - 181);

  tickRoomMemory(state.time + ttl + 10, ttl + 10);
  assert.equal(getRoomMemory(FloorLevel.LIVING, 3), undefined);
});

test('room memory keeps only the bounded newest/highest records', () => {
  clearRoomMemory();
  const state = makeGameState({
    currentFloor: FloorLevel.LIVING,
    worldEvents: createWorldEventState(),
  });

  for (let roomId = 0; roomId < ROOM_MEMORY_CAP + 8; roomId++) {
    state.time = roomId;
    publishEvent(state, {
      type: 'player_kill_monster',
      roomId,
      zoneId: roomId % 4,
      actorId: 1,
      actorFaction: Faction.PLAYER,
      severity: 3,
      privacy: 'local',
      tags: ['combat', 'kill', 'monster'],
    });
  }

  assert.equal(getRoomMemoryCount(), ROOM_MEMORY_CAP);
  assert.equal(getRoomMemory(FloorLevel.LIVING, 0), undefined);
  assert.ok(getRoomMemory(FloorLevel.LIVING, ROOM_MEMORY_CAP + 7));
});
