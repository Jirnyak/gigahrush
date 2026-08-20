import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal,
  Cell,
  EntityType,
  Faction,
  Occupation,
  W,
  ZoneFaction,
  type Entity,
  type GameState,
} from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { getPlotNpcCount } from '../src/data/npc_packages';
import { initFactionRelations } from '../src/data/relations';
import { createWorldEventState, getRecentEvents, type WorldEvent } from '../src/systems/events';
import { resetFactionEventsForTests, updateFactionEvents } from '../src/systems/faction_events';
import { makeGameState } from './helpers';

const SEED = 0x5eed_1234;
const SCHEDULER_TICK_SEC = 10;

function twoSectorWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      const zoneId = x < W / 2 ? 0 : 1;
      world.zoneMap[i] = zoneId;
      world.factionControl[i] = zoneId === 0 ? ZoneFaction.CITIZEN : ZoneFaction.CULTIST;
    }
  }
  world.zones.push(
    { id: 0, cx: 256, cy: 256, faction: ZoneFaction.CITIZEN, hasLift: false, fogged: false, level: 3, hqRoomId: -1 },
    { id: 1, cx: 768, cy: 768, faction: ZoneFaction.CULTIST, hasLift: false, fogged: false, level: 3, hqRoomId: -1 },
  );
  return world;
}

function makeNpc(id: number, x: number, y: number, faction: Faction): Entity {
  return {
    id,
    type: EntityType.NPC,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1.2,
    sprite: 0,
    hp: 30,
    maxHp: 30,
    name: `npc${id}`,
    faction,
    occupation: faction === Faction.CULTIST ? Occupation.PILGRIM : Occupation.HOUSEWIFE,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function makePlayer(x: number, y: number): Entity {
  return {
    id: 1,
    type: EntityType.PLAYER,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    hp: 40,
    maxHp: 40,
    name: 'Вы',
    faction: Faction.PLAYER,
  };
}

/** Один тик планировщика при фиксированном сиде; меняется только позиция игрока. */
function scheduleOnce(playerX: number, playerY: number): { event: WorldEvent | undefined; state: GameState } {
  resetFactionEventsForTests();
  initFactionRelations();
  seedGlobalRng(SEED);

  const world = twoSectorWorld();
  const state = makeGameState({ currentZ: 0, time: 100, worldEvents: createWorldEventState() });
  const player = makePlayer(playerX, playerY);
  const entities: Entity[] = [player];
  let nextNpcId = 100;
  for (let i = 0; i < 8; i++) entities.push(makeNpc(nextNpcId++, 250.5 + i, 258.5, Faction.CITIZEN));
  for (let i = 0; i < 8; i++) entities.push(makeNpc(nextNpcId++, 762.5 + i, 770.5, Faction.CULTIST));
  const nextId = { v: getPlotNpcCount() + 200 };

  updateFactionEvents(state, world, player, entities, nextId, SCHEDULER_TICK_SEC, true);

  const event = getRecentEvents(state, { tags: ['faction_event'], limit: 1 })[0];
  return { event, state };
}

test('faction event zone and spawn center ignore where the player stands', () => {
  const cornerA = scheduleOnce(10.5, 10.5);
  const cornerB = scheduleOnce(1000.5, 1000.5);

  assert.ok(cornerA.event, 'планировщик обязан выдать событие при одинаковом сиде');
  assert.ok(cornerB.event, 'планировщик обязан выдать событие при одинаковом сиде');
  assert.equal(cornerA.event!.data?.factionEventId, cornerB.event!.data?.factionEventId);
  assert.equal(cornerA.event!.zoneId, cornerB.event!.zoneId);
  assert.equal(cornerA.event!.x, cornerB.event!.x);
  assert.equal(cornerA.event!.y, cornerB.event!.y);
});

test('faction event spawn center is the sector anchor, not the player cell', () => {
  const anchors = new Map<number, { x: number; y: number }>([
    [0, { x: 256.5, y: 256.5 }],
    [1, { x: 768.5, y: 768.5 }],
  ]);

  for (const [px, py] of [[10.5, 10.5], [1000.5, 1000.5], [520.5, 40.5]] as const) {
    const { event } = scheduleOnce(px, py);
    assert.ok(event);
    const anchor = anchors.get(event!.zoneId ?? -1);
    assert.ok(anchor, `событие ушло в неизвестный сектор ${event!.zoneId}`);
    assert.equal(event!.x, anchor!.x);
    assert.equal(event!.y, anchor!.y);
    assert.notEqual(event!.x, px);
    assert.notEqual(event!.y, py);
  }
});
