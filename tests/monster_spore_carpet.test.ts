import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, ProjType, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { DEF, generateSprite } from '../src/entities/spore_carpet';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { updateMonster, setEntityMap, tryMonsterProjectileStagger } from '../src/systems/ai/monster';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { setListenerPos } from '../src/systems/audio';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { monsterSpr } from '../src/entities/sprite_index';
import { S } from '../src/core/pixutil';
import { makeGameState } from './helpers';
import { DANGER_FIELD_DEATH_IMPULSE } from '../src/systems/danger_field';

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

function player(x: number, y: number): Entity {
  return {
    id: 1,
    type: EntityType.NPC, persistentNpcId: 'player',
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    hp: 100,
    maxHp: 100,
    name: 'Вы',
    faction: Faction.PLAYER,
  };
}

function sporeCarpet(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: DEF.speed,
    sprite: monsterSpr(MonsterKind.SPORE_CARPET),
    hp: DEF.hp,
    maxHp: DEF.hp,
    monsterKind: MonsterKind.SPORE_CARPET,
    attackCd: 0,
    currentMag: 1,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function prime(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

test('spore carpet definition, ecology, and sprite read as a domestic lurking rug trap', () => {
  const ecology = getMonsterEcology(MonsterKind.SPORE_CARPET);
  const sprite = generateSprite();
  let opaque = 0;
  for (const px of sprite) {
    if ((px >>> 24) !== 0) opaque++;
  }

  assert.equal(DEF.kind, MonsterKind.SPORE_CARPET);
  assert.deepEqual(DEF.aiFlags, ['lurkingFurniture']);
  assert.equal(ecology?.rare, false);
  assert.match(DEF.counterplay ?? '', /кров|след|выжиг/i);
  assert.equal(sprite.length, S * S);
  assert.equal(opaque > 300, true, 'spore carpet sprite should have a readable surface area');
});

test('ковёр берёт кровь, а не прохожего', () => {
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const target = player(11, 10);
  const carpet = sporeCarpet(2, 10, 10);
  const entities = [target, carpet];
  const state = makeGameState({ worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  // Живой рядом ему безразличен: он растение, а не засада.
  prime(entities);
  updateMonster(world, entities, carpet, 7, 1, msgs, target.id, { v: 10 }, state);
  assert.equal(entities.length, 2, 'на прохожего он не реагирует');

  // А вот пролитая рядом кровь поднимает отросток.
  world.dangerField[world.idx(11, 10)] = DANGER_FIELD_DEATH_IMPULSE;
  prime(entities);
  updateMonster(world, entities, carpet, 9, 9, msgs, target.id, { v: 10 }, state);
  assert.equal(entities.length, 3, 'по следу пророс отросток');
  assert.equal(world.dangerField[world.idx(11, 10)], 0);
});
