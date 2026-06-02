import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, NpcState, Occupation, RoomType, type Entity, type GameClock, ZoneFaction } from '../src/core/types';
import { World } from '../src/core/world';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext, updateNPC } from '../src/systems/ai/npc_fsm';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeTestPlayer } from './helpers';

function makeRoutineWorld(): World {
  const world = new World();
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  return world;
}

function makeNpc(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 8.5,
    y: 8.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function tickNpc(world: World, npc: Entity, clock: GameClock = { hour: 9, minute: 0, totalMinutes: 540 }): void {
  const player = makeTestPlayer({ id: 1, x: 90, y: 90 });
  const entities = [player, npc];
  rebuildEntityIndexForSimulation(entities, clock.totalMinutes);
  setPathContext([], clock.totalMinutes);
  setNpcContext([], clock.totalMinutes);
  updateNPC(world, entities, npc, 0, clock.totalMinutes, clock, false);
}

test('routine thirst prefers a friendly kitchen over a closer hostile kitchen', () => {
  const world = makeRoutineWorld();
  addTestRoom(world, { id: 1, x: 12, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 1, zoneFaction: ZoneFaction.CULTIST });
  const friendly = addTestRoom(world, { id: 2, x: 54, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(10, { needs: { food: 90, water: 0, sleep: 100, pee: 0, poo: 0 } });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.DRINK);
  assert.equal(npc.ai?.npcState, NpcState.LUNCH);
  assert.equal(npc.ai?.tx, friendly.x + Math.floor(friendly.w / 2));
  assert.equal(npc.ai?.ty, friendly.y + Math.floor(friendly.h / 2));
});

test('routine toilet pressure avoids hostile bathroom when a friendly bathroom is reachable', () => {
  const world = makeRoutineWorld();
  addTestRoom(world, { id: 1, x: 13, y: 8, w: 5, h: 5, type: RoomType.BATHROOM, zoneId: 1, zoneFaction: ZoneFaction.WILD });
  const friendly = addTestRoom(world, { id: 2, x: 42, y: 8, w: 5, h: 5, type: RoomType.BATHROOM, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(11, { needs: { food: 100, water: 100, sleep: 100, pee: 96, poo: 80 } });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.TOILET);
  assert.equal(npc.ai?.tx, friendly.x + Math.floor(friendly.w / 2));
  assert.equal(npc.ai?.ty, friendly.y + Math.floor(friendly.h / 2));
});

test('routine work uses an assigned work room only when the room is friendly', () => {
  const world = makeRoutineWorld();
  const hostileAssigned = addTestRoom(world, { id: 1, x: 14, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 1, zoneFaction: ZoneFaction.CULTIST });
  const friendly = addTestRoom(world, { id: 2, x: 52, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(12, {
    assignedRoomId: hostileAssigned.id,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
  });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.WORK);
  assert.equal(npc.ai?.npcState, NpcState.WORKING);
  assert.equal(npc.ai?.tx, friendly.x + Math.floor(friendly.w / 2));
  assert.equal(npc.ai?.ty, friendly.y + Math.floor(friendly.h / 2));
});

test('routine work keeps a friendly assigned work room as the strongest anchor', () => {
  const world = makeRoutineWorld();
  const assigned = addTestRoom(world, { id: 1, x: 36, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  addTestRoom(world, { id: 2, x: 14, y: 8, w: 6, h: 6, type: RoomType.PRODUCTION, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const npc = makeNpc(13, {
    assignedRoomId: assigned.id,
    occupation: Occupation.MECHANIC,
    needs: { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 },
  });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.WORK);
  assert.equal(npc.ai?.tx, assigned.x + Math.floor(assigned.w / 2));
  assert.equal(npc.ai?.ty, assigned.y + Math.floor(assigned.h / 2));
});

test('survival need can trespass only after no friendly room candidate exists', () => {
  const world = makeRoutineWorld();
  const hostileKitchen = addTestRoom(world, { id: 1, x: 16, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 1, zoneFaction: ZoneFaction.CULTIST });
  const npc = makeNpc(14, { needs: { food: 100, water: 0, sleep: 100, pee: 0, poo: 0 } });

  tickNpc(world, npc);

  assert.equal(npc.ai?.goal, AIGoal.DRINK);
  assert.equal(npc.ai?.tx, hostileKitchen.x + Math.floor(hostileKitchen.w / 2));
  assert.equal(npc.ai?.ty, hostileKitchen.y + Math.floor(hostileKitchen.h / 2));
});
