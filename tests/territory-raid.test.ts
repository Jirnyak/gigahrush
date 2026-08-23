import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Cell, EntityType, Faction, Occupation, RoomType, Tex, W, ZoneFaction,
  type Entity, type Room,
} from '../src/core/types';
import { World } from '../src/core/world';
import { territoryOwnerHqName } from '../src/data/factions';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import {
  declareTerritoryPush,
  ensureTerritoryFront,
  territoryCaptureTarget,
  territoryOwnerAt,
  territoryRoomOwner,
  updateTerritoryCapture,
} from '../src/systems/territory';
import {
  crowdAt, crowdInRoom, crowdIndexStats, crowdRoomTotal, rebuildCrowdIndex,
} from '../src/world/crowd_index';
import { makeGameState } from './helpers';

function flatWorld(owner: ZoneFaction): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.zoneMap.fill(0);
  world.factionControl.fill(owner);
  world.zones[0] = { id: 0, cx: 64, cy: 64, faction: owner, hasLift: false, fogged: false, level: 2, hqRoomId: -1 };
  return world;
}

function npc(id: number, faction: Faction, x: number, y: number): Entity {
  return {
    id, type: EntityType.NPC, x, y, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 0,
    name: `npc ${id}`, faction, occupation: Occupation.TRAVELER,
  };
}

function mappedRoom(world: World, id: number, x: number, y: number, w: number, h: number, type: RoomType): Room {
  const room: Room = {
    id, type, x, y, w, h, doors: [], sealed: false, name: `room ${id}`,
    apartmentId: -1, wallTex: Tex.CONCRETE, floorTex: Tex.F_CONCRETE,
  };
  world.rooms[id] = room;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const idx = world.idx(x + dx, y + dy);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = id;
    }
  }
  return room;
}

test('crowd index counts people by owner, bucket and room in one pass', () => {
  const world = flatWorld(ZoneFaction.CITIZEN);
  mappedRoom(world, 1, 100, 100, 4, 4, RoomType.COMMON);
  const actors = [
    npc(1, Faction.LIQUIDATOR, 100.5, 100.5),
    npc(2, Faction.LIQUIDATOR, 101.5, 100.5),
    npc(3, Faction.CULTIST, 102.5, 101.5),
    npc(4, Faction.CITIZEN, 400.5, 400.5),
  ];

  rebuildCrowdIndex(world, actors, 1);

  assert.equal(crowdAt(world, 100, 100, ZoneFaction.LIQUIDATOR), 2);
  assert.equal(crowdAt(world, 100, 100, ZoneFaction.CULTIST), 1);
  assert.equal(crowdAt(world, 400, 400, ZoneFaction.CITIZEN), 1);
  assert.equal(crowdRoomTotal(world, 1), 3);
  assert.equal(crowdInRoom(world, 1)[ZoneFaction.LIQUIDATOR], 2);
  const stats = crowdIndexStats(world);
  assert.equal(stats.people, 4);
  assert.equal(stats.occupiedRooms, 1);
});

test('capture target is a pure function of world state, so neighbours converge without agreeing', () => {
  const world = flatWorld(ZoneFaction.LIQUIDATOR);
  for (let y = 0; y < W; y++) {
    for (let x = W / 2; x < W; x++) world.factionControl[world.idx(x, y)] = ZoneFaction.CITIZEN;
  }
  const a = npc(1, Faction.LIQUIDATOR, 505.5, 100.5);
  const b = npc(2, Faction.LIQUIDATOR, 511.5, 100.5);
  rebuildCrowdIndex(world, [a, b], 1);
  ensureTerritoryFront(world, 1);

  const ta = territoryCaptureTarget(world, a);
  const tb = territoryCaptureTarget(world, b);

  assert.ok(ta, 'у бойца у границы обязана быть цель захвата');
  assert.ok(tb);
  // Один бакет — одна клетка-цель. Сговора нет: одинаковый вход, одинаковый выход.
  assert.equal(ta!.bucket, tb!.bucket);
  assert.equal(ta!.x, tb!.x);
  assert.equal(ta!.y, tb!.y);
  assert.equal(ta!.owner, ZoneFaction.CITIZEN);
  assert.equal(territoryOwnerAt(world, ta!.x, ta!.y), ZoneFaction.CITIZEN);
  // Повторный вопрос даёт тот же ответ: цель не бросается кубиком.
  assert.deepEqual(territoryCaptureTarget(world, a), ta);
});

test('capture target is null deep inside own land: there is no front to press', () => {
  const world = flatWorld(ZoneFaction.LIQUIDATOR);
  const alone = npc(1, Faction.LIQUIDATOR, 100.5, 100.5);
  rebuildCrowdIndex(world, [alone], 1);
  ensureTerritoryFront(world, 1);

  assert.equal(territoryCaptureTarget(world, alone), null);
});

test('a crowd on enemy ground captures nothing until capture is declared its goal', () => {
  const world = flatWorld(ZoneFaction.CULTIST);
  const state = makeGameState({ currentZ: 14, time: 10, worldEvents: createWorldEventState() });
  const squad = [
    npc(1, Faction.LIQUIDATOR, 64.5, 64.5),
    npc(2, Faction.LIQUIDATOR, 65.5, 64.5),
    npc(3, Faction.LIQUIDATOR, 66.5, 64.5),
  ];

  assert.equal(updateTerritoryCapture(world, squad, state, 2.1), 0);
  assert.equal(territoryOwnerAt(world, 64, 64), ZoneFaction.CULTIST);

  for (const e of squad) declareTerritoryPush(e);
  assert.ok(updateTerritoryCapture(world, squad, state, 2.1) > 0);
  assert.equal(territoryOwnerAt(world, 64, 64), ZoneFaction.LIQUIDATOR);
});

test('a base can fall: the HQ room changes hands and takes the new owner name', () => {
  const world = flatWorld(ZoneFaction.CULTIST);
  const room = mappedRoom(world, 1, 64, 64, 4, 4, RoomType.HQ);
  room.name = territoryOwnerHqName(ZoneFaction.CULTIST);
  const state = makeGameState({ currentZ: 14, time: 30, worldEvents: createWorldEventState() });
  const squad: Entity[] = [];
  for (let i = 0; i < 6; i++) squad.push(npc(10 + i, Faction.LIQUIDATOR, 65.5 + (i % 2), 65.5 + ((i / 2) | 0)));

  assert.equal(territoryRoomOwner(world, room.id), ZoneFaction.CULTIST);
  for (const e of squad) declareTerritoryPush(e);
  assert.ok(updateTerritoryCapture(world, squad, state, 2.1) > 0);

  assert.equal(territoryRoomOwner(world, room.id), ZoneFaction.LIQUIDATOR);
  assert.equal(room.type, RoomType.HQ, 'комната остаётся штабом, меняется только хозяин');
  assert.equal(room.name, territoryOwnerHqName(ZoneFaction.LIQUIDATOR));
  const fall = getRecentEvents(state, { tags: ['hq_lost'], limit: 4 })[0];
  assert.ok(fall, 'падение базы обязано быть публичным фактом');
  assert.equal(fall.data?.previousOwner, ZoneFaction.CULTIST);
  assert.equal(fall.data?.owner, ZoneFaction.LIQUIDATOR);
});
