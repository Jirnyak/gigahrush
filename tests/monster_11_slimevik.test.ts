import { MONSTERS, MONSTER_SPRITES } from '../src/entities/monster';
import { test } from 'node:test';
import { getPlotNpcCount } from '../src/data/npc_packages';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, RoomType, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { CONTRACTS } from '../src/data/contracts';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { RUMORS } from '../src/data/rumors';
import { DEF, generateSprite } from '../src/entities/slimevik';
import { S } from '../src/core/pixutil';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { getRecentEvents, publishEvent } from '../src/systems/events';
import { peekSlimevikBelly, updateSlimevikMonster } from '../src/systems/slimevik';
import { dropMonsterLoot } from '../src/systems/monster_drops';
import { addTestRoom, makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function openSlimeRoom(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  addTestRoom(world, {
    id: 0,
    x: 8,
    y: 8,
    w: 8,
    h: 8,
    type: RoomType.PRODUCTION,
    name: 'Кормовая ванна слизневика',
    zoneLevel: 2,
  });
  return world;
}

function slimevik(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 2,
    type: EntityType.MONSTER,
    x: 11.5,
    y: 10.5,
    angle: Math.PI,
    pitch: 0,
    alive: true,
    speed: DEF.speed,
    sprite: DEF.sprite,
    hp: DEF.hp,
    maxHp: DEF.hp,
    monsterKind: MonsterKind.SLIMEVIK,
    attackCd: DEF.attackRate,
    ai: { goal: AIGoal.WANDER, tx: 11, ty: 10, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

test('Slimevik is standalone neutral scavenger content with route leads', () => {
  const ecology = getMonsterEcology(MonsterKind.SLIMEVIK);
  const sprite = generateSprite();
  let opaque = 0;
  for (const px of sprite) if ((px >>> 24) !== 0) opaque++;

  assert.equal(DEF.kind, MonsterKind.SLIMEVIK);
  assert.equal(MONSTERS[MonsterKind.SLIMEVIK], DEF);
  assert.deepEqual(DEF.aiFlags, ['slimeScavenger']);
  assert.deepEqual(ecology?.rumorIds, ['monster_slimevik_bargain', 'lead_maintenance_safe_slimevik']);
  assert.equal(RUMORS.some(r => r.id === 'lead_maintenance_safe_slimevik'), true);
  assert.equal(CONTRACTS.some(c => c.id === 'exp_maint_safe_slimevik_bargain'), true);
  assert.equal(sprite.length, S * S);
  assert.equal(opaque > 700, true, 'Slimevik sprite should read as a full symbiote scavenger');
});

test('слизневик глотает брошенное, а смерть возвращает съеденное', () => {
  const world = openSlimeRoom();
  const state = makeGameState({ time: 12, currentZ: -14 });
  const threat = slimevik();
  const drop: Entity = {
    id: 5,
    type: EntityType.ITEM_DROP,
    x: 10.9,
    y: 10.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    inventory: [{ defId: 'pills', count: 2 }],
  };
  const entities: Entity[] = [threat, drop];
  const msgs: Msg[] = [];

  rebuildEntityIndex(entities);
  updateSlimevikMonster(world, entities, threat, 2.3, state.time, msgs, state);

  assert.equal(drop.alive, false, 'лежащее на полу он втягивает в себя');
  assert.equal(peekSlimevikBelly(threat)[0]?.defId, 'pills');
  assert.equal(peekSlimevikBelly(threat)[0]?.count, 2);

  // Убили — вещь возвращается через общую дверь дропа, а не через случай вида.
  const nextId = { v: getPlotNpcCount() + 50 };
  dropMonsterLoot(threat, entities, nextId, () => 0.5);
  const returned = entities.filter(e => e.type === EntityType.ITEM_DROP && e.alive && e.inventory?.[0]?.defId === 'pills');
  assert.equal(returned.length, 1, 'съеденное выпало обратно');
  assert.equal(peekSlimevikBelly(threat).length, 0);
});

test('Hurt Slimevik flees from nearby actors through bounded broadphase', () => {
  const world = openSlimeRoom();
  const state = makeGameState({ time: 21, currentZ: -14 });
  const player = makeTestPlayer({ id: 1, x: 80, y: 80 });
  const neighbor = makeTestNpc({ id: 3, x: 12.8, y: 10.5, faction: Faction.CITIZEN });
  const threat = slimevik({ id: 2, hp: DEF.hp - 4 });
  const entities = [player, neighbor, threat];
  const msgs: Msg[] = [];

  rebuildEntityIndex(entities);
  assert.equal(updateSlimevikMonster(world, entities, threat, 0.2, state.time, msgs, state), true);

  assert.equal(threat.ai?.goal, AIGoal.FLEE);
  assert.equal(threat.ai?.combatTargetId, neighbor.id);
  assert.equal(neighbor.hp, undefined, 'hurt slimevik should flee before attacking in open floor');
});

test('Slimevik kill events publish the standalone slimevik_killed fact', () => {
  const state = makeGameState({ time: 24, currentZ: -14 });

  publishEvent(state, {
    type: 'player_kill_monster',
    x: 12,
    y: 10,
    actorId: 1,
    actorName: 'Вы',
    actorFaction: Faction.PLAYER,
    targetId: 2,
    targetName: 'Слизневик',
    monsterKind: MonsterKind.SLIMEVIK,
    severity: 3,
    privacy: 'local',
    tags: ['combat', 'kill', 'monster'],
  });

  const killed = getRecentEvents(state, { type: 'slimevik_killed', limit: 1 })[0];
  assert.equal(killed?.monsterKind, MonsterKind.SLIMEVIK);
  assert.equal(killed?.targetId, 2);
  assert.ok(killed?.tags.includes('slimevik'));
});
