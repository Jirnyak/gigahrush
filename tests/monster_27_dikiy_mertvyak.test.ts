import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { DEF, generateSprite } from '../src/entities/dikiy_mertvyak';
import { MONSTERS } from '../src/entities/monster';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { updateMonster, setEntityMap } from '../src/systems/ai/monster';
import { peekDikiyRushSpeed } from '../src/systems/ai/dikiy_mertvyak';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setListenerPos } from '../src/systems/audio';
import { S } from '../src/core/pixutil';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.zoneMap.fill(0);
  world.zones[0] = {
    id: 0,
    cx: 10,
    cy: 10,
    faction: 0,
    hasLift: false,
    fogged: false,
    level: 1,
    hqRoomId: -1,
  };
  return world;
}

function dikiy(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 2,
    type: EntityType.MONSTER,
    x: 10,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: DEF.speed,
    sprite: DEF.sprite,
    hp: DEF.hp,
    maxHp: DEF.hp,
    monsterKind: MonsterKind.DIKIY_MERTVYAK,
    attackCd: 1.2,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function crowdNpc(id: number, x: number, y: number): Entity {
  return makeTestNpc({
    id,
    x,
    y,
    hp: 40,
    maxHp: 40,
    faction: Faction.CITIZEN,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  });
}

test('dikiy mertvyak is a standalone fragile crowd-runner, not the old zombie variant', () => {
  const ecology = getMonsterEcology(MonsterKind.DIKIY_MERTVYAK);
  const sprite = generateSprite();
  let opaque = 0;
  let translucent = 0;
  let brightKnuckles = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = sprite[y * S + x];
      const alpha = px >>> 24;
      if (alpha !== 0) opaque++;
      if (alpha > 0 && alpha < 255) translucent++;
      if (x >= 41 && y >= 36 && alpha !== 0 && (px & 0xff) > 200) brightKnuckles++;
    }
  }

  assert.equal(DEF.kind, MonsterKind.DIKIY_MERTVYAK);
  assert.equal(MONSTERS[MonsterKind.DIKIY_MERTVYAK], DEF);
  assert.equal(DEF.hp < MONSTERS[MonsterKind.ZOMBIE].hp, true);
  assert.equal(DEF.speed > MONSTERS[MonsterKind.ZOMBIE].speed, true);
  assert.deepEqual(DEF.aiFlags, ['noBrakes']);
  assert.match(ecology?.counterplay ?? '', /курс|вбок|бетон/);
  assert.equal(opaque > 450, true, 'sprite should be readable as a full sprinting body');
  assert.equal(translucent > 3, true, 'sprite should include leg motion blur');
  assert.equal(brightKnuckles > 0, true, 'sprite should show pale forward knuckles');
});

test('мертвяк едет туда, где цель была, и уходит в бетон', () => {
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const player = makeTestPlayer({ id: 1, x: 16.5, y: 10.5, hp: 100, maxHp: 100 });
  const threat = dikiy({ x: 10.5, y: 10.5 });
  const entities = [player, threat];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
  updateMonster(world, entities, threat, 0.1, 1, msgs, player.id, { v: 50 }, state);
  const startX = threat.x;
  assert.ok(peekDikiyRushSpeed(threat) > 0, 'увидел цель — пошёл в разгон');

  // Цель ушла вбок, а курс уже взят: он продолжает по прямой.
  player.y = 13.5;
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
  updateMonster(world, entities, threat, 0.1, 1.1, msgs, player.id, { v: 50 }, state);
  assert.ok(threat.x > startX, 'едет туда, где цель была');
  assert.ok(Math.abs(threat.y - 10.5) < 0.2, 'курс не правит');

  // Стена на его линии — удар о бетон и оглушение.
  for (let y = 8; y <= 13; y++) world.cells[world.idx(12, y)] = Cell.WALL;
  for (let i = 0; i < 12; i++) {
    updateMonster(world, entities, threat, 0.1, 1.2 + i * 0.1, msgs, player.id, { v: 50 }, state);
    if ((threat.ai?.staggerTimer ?? 0) > 0) break;
  }
  assert.ok((threat.ai?.staggerTimer ?? 0) > 0, 'влетел в бетон и осел');
  assert.equal(peekDikiyRushSpeed(threat), 0);
  assert.ok(msgs.some(m => m.text.includes('бетон')));
});
