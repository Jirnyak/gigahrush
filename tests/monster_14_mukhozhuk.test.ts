import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, Occupation, RoomType, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { getMonsterEcology } from '../src/data/monster_ecology';
import { RUMORS } from '../src/data/rumors';
import { DEF, generateSprite } from '../src/entities/mukhozhuk';
import { MONSTERS } from '../src/entities/monster';
import { S } from '../src/core/pixutil';
import { setEntityMap, updateMonster } from '../src/systems/ai/monster';
import {
  isMukhozhukInfested,
  mukhozhukLarvaCount,
  resetMukhozhukLarvae,
  updateMukhozhukLarvae,
} from '../src/systems/ai/mukhozhuk';
import { getEntityIndex, rebuildEntityIndex } from '../src/systems/entity_index';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { addTestRoom, makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function ministryWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.roomMap.fill(0);
  world.zoneMap.fill(0);
  addTestRoom(world, {
    id: 0,
    type: RoomType.HQ,
    x: 6,
    y: 6,
    w: 18,
    h: 18,
    name: 'Кабинет больного приказа',
  });
  return world;
}

function mukhozhuk(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 2,
    type: EntityType.MONSTER,
    x: 12,
    y: 12,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: DEF.speed,
    sprite: DEF.sprite,
    hp: DEF.hp,
    maxHp: DEF.hp,
    monsterKind: MonsterKind.MUKHOZHUK_HOST,
    aiFlags: DEF.aiFlags ? [...DEF.aiFlags] : undefined,
    attackCd: 0,
    currentMag: 1,
    ai: { goal: AIGoal.WANDER, tx: 12, ty: 12, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function prime(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  getEntityIndex().beginTelemetryFrame();
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

test('mukhozhuk host keeps standalone parasite registry, ecology, rumors and sprite', () => {
  const ecology = getMonsterEcology(MonsterKind.MUKHOZHUK_HOST);
  const sprite = generateSprite();
  let opaque = 0;
  let green = 0;
  let shell = 0;
  for (const px of sprite) {
    if ((px >>> 24) === 0) continue;
    opaque++;
    const r = px & 0xff;
    const g = (px >>> 8) & 0xff;
    const b = (px >>> 16) & 0xff;
    if (g > r + 20 && g > b) green++;
    if (r > 25 && r < 95 && g < 90 && b < 65) shell++;
  }

  assert.equal(DEF.kind, MonsterKind.MUKHOZHUK_HOST);
  assert.equal(MONSTERS[MonsterKind.MUKHOZHUK_HOST], DEF);
  assert.deepEqual(DEF.aiFlags, ['larvaCarrier', 'foodBait']);
  assert.match(DEF.counterplay ?? '', /личинк|ран|леч/i);
  assert.match(DEF.lootHint ?? '', /хитин|кокон|карточка/i);
  assert.equal(ecology?.rare, true);
  assert.equal(ecology?.rooms.includes(RoomType.HQ), true);
  assert.equal(ecology?.rumorIds.includes('monster_mukhozhuk_larva'), true);
  assert.equal(RUMORS.some(r => r.id === 'ecology_mukhozhuk_quarantine'), true);
  assert.equal(sprite.length, S * S);
  assert.equal(opaque > 520, true, 'sprite should read as a full infected host');
  assert.equal(green > 0, true, 'sprite should include sick green parasite highlights');
  assert.equal(shell > 30, true, 'sprite should include dark beetle carapace');
});

test('мухожук кладёт личинку в раненого, а здорового не трогает', () => {
  const world = ministryWorld();
  resetMukhozhukLarvae();
  const player = makeTestPlayer({ id: 1, x: 70, y: 70, hp: 100, maxHp: 100 });
  const host = mukhozhuk({ x: 12.5, y: 12.5 });
  const wounded = makeTestNpc({ id: 1000003, x: 12.9, y: 12.5, hp: 20, maxHp: 100 });
  const healthy = makeTestNpc({ id: 1000004, x: 13.1, y: 12.5, hp: 100, maxHp: 100 });
  const entities = [player, host, wounded, healthy];
  const state = makeGameState({ currentZ: 34, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  prime(entities);
  updateMonster(world, entities, host, 0.5, 20, msgs, player.id, { v: 50 }, state);

  assert.equal(isMukhozhukInfested(wounded), true, 'раненый получает личинку');
  assert.equal(isMukhozhukInfested(healthy), false, 'здоровому личинку не положить');
  const event = getRecentEvents(state, { type: 'mukhozhuk_infested', tags: ['larva'], limit: 1 })[0];
  assert.ok(event);
  assert.equal(event.targetId, wounded.id);
});

test('вылеченная рана личинку не донашивает', () => {
  const world = ministryWorld();
  resetMukhozhukLarvae();
  const player = makeTestPlayer({ id: 1, x: 70, y: 70, hp: 100, maxHp: 100 });
  const host = mukhozhuk({ x: 12.5, y: 12.5 });
  const wounded = makeTestNpc({ id: 1000003, x: 12.9, y: 12.5, hp: 20, maxHp: 100 });
  const entities = [player, host, wounded];
  const state = makeGameState({ currentZ: 34, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  prime(entities);
  updateMonster(world, entities, host, 0.5, 20, msgs, player.id, { v: 50 }, state);
  assert.equal(mukhozhukLarvaCount(), 1);

  wounded.hp = 95;
  updateMukhozhukLarvae(world, entities, { v: 60 }, 1, 21, msgs, state);

  assert.equal(mukhozhukLarvaCount(), 0, 'закрытая рана снимает личинку');
  assert.equal(wounded.alive, true);
});

test('смерть носителя выпускает мухожука немедленно', () => {
  const world = ministryWorld();
  resetMukhozhukLarvae();
  const player = makeTestPlayer({ id: 1, x: 70, y: 70, hp: 100, maxHp: 100 });
  const host = mukhozhuk({ x: 12.5, y: 12.5 });
  const wounded = makeTestNpc({ id: 1000003, x: 12.9, y: 12.5, hp: 20, maxHp: 100 });
  const entities = [player, host, wounded];
  const state = makeGameState({ currentZ: 34, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  prime(entities);
  updateMonster(world, entities, host, 0.5, 20, msgs, player.id, { v: 50 }, state);
  assert.equal(mukhozhukLarvaCount(), 1);

  // Добили своего — и тем ускорили ровно то, чего боялись.
  wounded.alive = false;
  wounded.hp = 0;
  prime(entities);
  updateMukhozhukLarvae(world, entities, { v: 60 }, 1, 21, msgs, state);

  assert.equal(mukhozhukLarvaCount(), 0);
  const born = entities.filter(e => e.type === EntityType.MONSTER && e.monsterKind === MonsterKind.MUKHOZHUK_HOST);
  assert.equal(born.length, 2, 'из тела вышел новый мухожук');
  assert.ok(getRecentEvents(state, { type: 'mukhozhuk_hatched', tags: ['larva'], limit: 1 })[0]);
});
