import { MONSTERS, MONSTER_SPRITES } from '../src/entities/monster';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { getPlotNpcCount } from '../src/data/npc_packages';
import {
  AIGoal,
  Cell,
  EntityType,
  Faction,
  MonsterKind,
  ProjType,
  RoomType,
  ZoneFaction,
  type Entity,
  type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { RUMORS } from '../src/data/rumors';
import { DEF, generateSprite } from '../src/entities/spore_carpet';
import {
  generateSporeCarpetCache,
  SPORE_CARPET_CACHE_ROOM_NAME,
} from '../src/gen/living/spore_carpet_cache';
import { S } from '../src/core/pixutil';
import { Spr } from '../src/entities/sprite_index';
import { setEntityMap, tryMonsterProjectileStagger, updateMonster } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { createWorldEventState, getRecentEvents, publishEvent } from '../src/systems/events';
import {
  activeSporeHaze,
  applySporeHaze,
  SPORE_HAZE_AIM_SPREAD_MULT,
  SPORE_HAZE_PROTECTED_AIM_SPREAD_MULT,
  SPORE_HAZE_PROTECTED_DURATION_SEC,
  sporeHazeAimSpreadMult,
} from '../src/systems/status';
import { addTestRoom, makeGameState } from './helpers';
import { DANGER_FIELD_DEATH_IMPULSE } from '../src/systems/danger_field';
import { peekSporeCarpetChildren } from '../src/systems/ai/spore_carpet';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.zoneMap.fill(0);
  world.zones[0] = {
    id: 0,
    cx: 12,
    cy: 10,
    faction: ZoneFaction.CITIZEN,
    hasLift: false,
    fogged: false,
    level: 2,
    hqRoomId: -1,
  };
  return world;
}

function player(x: number, y: number, inventory: Entity['inventory'] = []): Entity {
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
    inventory,
  };
}

function carpet(x: number, y: number): Entity {
  return {
    id: 2,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: DEF.speed,
    sprite: DEF.sprite,
    hp: DEF.hp,
    maxHp: DEF.hp,
    monsterKind: MonsterKind.SPORE_CARPET,
    monsterStage: 0,
    attackCd: DEF.attackRate,
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function prime(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

test('spore carpet is standalone domestic trap content with reachable cache', () => {
  const ecology = getMonsterEcology(MonsterKind.SPORE_CARPET);
  const sprite = generateSprite();
  let opaque = 0;
  let vein = 0;
  let mold = 0;
  for (const px of sprite) {
    if ((px >>> 24) === 0) continue;
    opaque++;
    const r = px & 0xff;
    const g = (px >>> 8) & 0xff;
    const b = (px >>> 16) & 0xff;
    if (g > r && g > b && g > 55) vein++;
    if (r > 150 && g > 145 && b > 95) mold++;
  }

  assert.equal(DEF.kind, MonsterKind.SPORE_CARPET);
  assert.equal(DEF.name, 'Ковер');
  assert.deepEqual(DEF.aiFlags, ['lurkingFurniture']);
  assert.equal(MONSTERS[MonsterKind.SPORE_CARPET], DEF);
  assert.deepEqual(ecology?.rumorIds, ['monster_spore_carpet_lifted_corner', 'ecology_spore_carpet_fire_salt', 'lead_living_spore_carpet_cache']);
  assert.equal(RUMORS.some(r => r.id === 'lead_living_spore_carpet_cache'), true);
  assert.equal(sprite.length, S * S);
  assert.equal(opaque > 650, true, 'sprite should read as a hanging rug billboard');
  assert.equal(vein > 12, true, 'green-black veins should warn before wake');
  assert.equal(mold > 8, true, 'pale mold fringe should be readable');

  const world = new World();
  world.zoneMap.fill(0);
  world.zones[0] = {
    id: 0,
    cx: 100,
    cy: 100,
    faction: ZoneFaction.CITIZEN,
    hasLift: false,
    fogged: false,
    level: 2,
    hqRoomId: -1,
  };
  const entities: Entity[] = [];
  const nextId = { v: getPlotNpcCount() + 1 }
  generateSporeCarpetCache(world, 0, entities, nextId, 100, 100);

  assert.ok(world.rooms.some(room => room?.name === SPORE_CARPET_CACHE_ROOM_NAME));
  assert.equal(entities.filter(e => e.monsterKind === MonsterKind.SPORE_CARPET).length, 2);
  assert.ok(entities.every(e => e.monsterKind !== MonsterKind.SPORE_CARPET || e.monsterStage === 0));
  assert.ok(world.containers.some(container =>
    container.tags.includes('spore_carpet') &&
    container.inventory.some(item => item.defId === 'spore_print')));
  assert.ok(world.containers.some(container =>
    container.tags.includes('counterplay') &&
    container.inventory.some(item => item.defId === 'rock_salt')));
});

test('ковёр прорастает по кровяному следу и гасит его', () => {
  const world = openWorld();
  const carpetEntity = carpet(10.5, 10.5);
  const entities = [carpetEntity];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];
  const bloodIdx = world.idx(12, 10);
  world.dangerField[bloodIdx] = DANGER_FIELD_DEATH_IMPULSE;

  prime(entities);
  updateMonster(world, entities, carpetEntity, 7, 10, msgs, 1, { v: 90 }, state);

  const grown = entities.filter(e => e.monsterKind === MonsterKind.SPORE_CARPET);
  assert.equal(grown.length, 2, 'на следе поднялся отросток');
  assert.equal(world.dangerField[bloodIdx], 0, 'след ушёл в ковёр');
  assert.equal(peekSporeCarpetChildren(carpetEntity), 1);
  assert.ok(getRecentEvents(state, { type: 'spore_carpet_grown', limit: 1 })[0]);
});

test('без крови ковёр никуда не растёт', () => {
  const world = openWorld();
  const carpetEntity = carpet(10.5, 10.5);
  const entities = [carpetEntity];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  prime(entities);
  updateMonster(world, entities, carpetEntity, 7, 10, msgs, 1, { v: 90 }, state);

  assert.equal(entities.length, 1, 'сухой пол его не кормит');
  assert.equal(peekSporeCarpetChildren(carpetEntity), 0);
});

test('ip4 gasmask counts as respiratory protection against spore haze', () => {
  const target = player(10, 10, [{ defId: 'ip4_gasmask', count: 1, data: { dur: 90 } }]);
  const threat = carpet(10.8, 10);
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState(), time: 7 });
  const status = applySporeHaze(target, 7, [], state, threat);

  assert.ok(Math.abs(status.expiresAt - status.startedAt - SPORE_HAZE_PROTECTED_DURATION_SEC) < 0.001);
  assert.equal(sporeHazeAimSpreadMult(target, 7), SPORE_HAZE_PROTECTED_AIM_SPREAD_MULT);
  assert.equal(getRecentEvents(state, { type: 'player_status_applied', tags: ['protected'], limit: 1 })[0]?.data?.protectedByGear, true);
});

