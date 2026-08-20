/* Замок на проигрыватель сцен этажа.
 *
 * Проверяется механика, а не пролог жилого: сцена — это объявление, и важно,
 * что такты идут по порядку, что предательство меняет только сторону, а уход
 * не пишет смерть. Контент проверяется своим этажом.
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  AIGoal,
  EntityType,
  Faction,
  NpcRole,
  Occupation,
  RoomType,
  type Entity,
  type GameState,
} from '../src/core/types';
import { World } from '../src/core/world';
import { createRuntimeCamera } from '../src/systems/camera';
import {
  bindSceneCamera,
  isFloorSceneActive,
  registerFloorScene,
  requestFloorScene,
  resetFloorScenes,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';

const SCENE_ID = 'test_scene_engine';
const ANCHOR = 'test_scene_anchor';

function buildWorld(): World {
  const world = new World();
  // Небольшой открытый зал: актёрам нужно куда встать.
  for (let y = 20; y < 34; y++) {
    for (let x = 20; x < 40; x++) world.carve(x, y);
  }
  world.rooms.push({
    id: 1, type: RoomType.COMMON, x: 20, y: 20, w: 20, h: 14,
    aptId: -1, name: 'Испытательный зал', defId: ANCHOR, doors: [],
  } as never);
  return world;
}

function buildState(): GameState {
  return {
    time: 0,
    tick: 0,
    currentZ: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    msgs: [],
    msgLog: [],
    recentEvents: [],
    importantEvents: [],
    zoneEvents: {},
  } as unknown as GameState;
}

function makePlayer(): Entity {
  return {
    id: 1, type: EntityType.NPC, x: 25.5, y: 25.5, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: Occupation.TRAVELER, hp: 100, maxHp: 100,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    faction: Faction.PLAYER, questId: -1,
  } as unknown as Entity;
}

/** Один кадр игрового цикла: сцена живёт на фазе floor_activity. */
function tick(world: World, entities: Entity[], player: Entity, state: GameState, nextEntityId: { v: number }, dt: number): void {
  state.time += dt;
  updateContentRuntimeHooks({
    world, entities, player, state, nextEntityId, dt, phase: 'floor_activity', gameOver: false,
  });
}

function setupScene(): void {
  registerFloorScene({
    id: SCENE_ID,
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 60,
    actors: [
      { role: 'loyal', count: 4, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, level: 3, ox: -3, oy: 0, spread: 3 },
      { role: 'traitor', count: 2, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, level: 9, ox: 3, oy: 0, spread: 2 },
    ],
    beats: [
      { kind: 'say', role: 'loyal', text: 'Проверка связи.', seconds: 1 },
      { kind: 'defect', roles: ['traitor'], faction: Faction.WILD, playerRelation: -50 },
      { kind: 'pause', seconds: 1 },
      { kind: 'depart', roles: ['traitor'], toFloorKey: 'design:maintenance' },
      { kind: 'pause', seconds: 1 },
    ],
  });
}

test('floor scene casts actors, defects a side and departs without recording deaths', () => {
  resetFloorScenes();
  setupScene();
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 1000 };

  assert.equal(requestFloorScene(SCENE_ID), true);

  // Первый кадр поднимает сцену: люди встают, камера уходит с игрока.
  tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), true, 'сцена должна была начаться');
  assert.equal(state.sceneLock, true, 'ввод игрока обязан быть заперт');

  const cast = entities.filter(e => e.id !== player.id);
  assert.equal(cast.length, 6, 'должны встать 4 верных и 2 будущих перебежчика');
  assert.ok(cast.every(e => e.role === NpcRole.CINEMATIC_ACTOR), 'все актёры помечены ролью сцены');
  assert.ok(cast.every(e => !world.solid(Math.floor(e.x), Math.floor(e.y))), 'никто не стоит в стене');
  assert.equal(cast.filter(e => e.faction === Faction.LIQUIDATOR).length, 6);

  // Первый кадр только поднимает сцену; такты начинаются со следующего.
  tick(world, entities, player, state, nextEntityId, 0.1);
  const speaker = cast.find(e => e.activeBark);
  assert.ok(speaker, 'реплика обязана дойти до бабла');
  assert.equal(speaker!.activeBark!.text, 'Проверка связи.');

  // Докрутить до предательства.
  for (let i = 0; i < 20 && cast.filter(e => e.faction === Faction.WILD).length === 0; i++) {
    tick(world, entities, player, state, nextEntityId, 0.1);
  }
  const defected = cast.filter(e => e.faction === Faction.WILD);
  assert.equal(defected.length, 2, 'сторону меняют ровно объявленные роли');
  assert.ok(defected.every(e => e.alive), 'предательство не убивает');
  assert.ok(defected.every(e => e.ai?.combatTargetId === undefined), 'кэш прошлой цели обязан быть сброшен');
  assert.ok(defected.every(e => (e.playerRelation ?? 0) < 0), 'личное отношение к игроку испорчено');

  // Докрутить до ухода.
  const departedIds = defected.map(e => e.id);
  for (let i = 0; i < 40 && entities.some(e => departedIds.includes(e.id)); i++) {
    tick(world, entities, player, state, nextEntityId, 0.1);
  }
  assert.equal(entities.some(e => departedIds.includes(e.id)), false, 'ушедшие вынуты из мира');
  assert.equal(
    entities.some(e => departedIds.includes(e.id) && e.alive === false),
    false,
    'уход не имеет права оставлять мёртвых: это записалось бы гибелью в A-Life',
  );

  // Досмотреть до конца. Такты кончаются раньше: после них сцена ещё летит
  // камерой обратно к игроку и лишь потом отдаёт управление.
  for (let i = 0; i < 400 && isFloorSceneActive(); i++) {
    tick(world, entities, player, state, nextEntityId, 0.2);
  }
  assert.equal(isFloorSceneActive(), false, 'сцена обязана закончиться сама');
  assert.equal(state.sceneLock, false, 'управление возвращается игроку');
  resetFloorScenes();
});

test('first_visit scene plays once on arrival and not on return', () => {
  resetFloorScenes();
  registerFloorScene({
    id: 'test_scene_first_visit',
    floorKey: 'design:living',
    trigger: { kind: 'first_visit' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 2,
    actors: [{ role: 'crowd', count: 2, faction: Faction.LIQUIDATOR, ox: 0, oy: 0, spread: 2 }],
    beats: [{ kind: 'pause', seconds: 1 }],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 3000 };

  // Никто ничего не запрашивал: приход на этаж сам поднимает сцену.
  tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), true, 'первый приход обязан запустить сцену');

  for (let i = 0; i < 400 && isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.2);
  assert.equal(isFloorSceneActive(), false);

  // Возврат на тот же этаж второй раз ничего не играет.
  for (let i = 0; i < 20; i++) tick(world, entities, player, state, nextEntityId, 0.2);
  assert.equal(isFloorSceneActive(), false, 'повторный приход не имеет права переигрывать пролог');
  resetFloorScenes();
});

test('floor scene stops at its own ceiling even if beats stall', () => {
  resetFloorScenes();
  registerFloorScene({
    id: 'test_scene_ceiling',
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 3,
    actors: [{ role: 'victim', count: 1, faction: Faction.LIQUIDATOR, ox: 0, oy: 0 }],
    // Ждём смерти того, кого никто не трогает: без потолка сцена висела бы вечно.
    beats: [{ kind: 'awaitDeath', role: 'victim', timeout: 600 }],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 2000 };

  assert.equal(requestFloorScene('test_scene_ceiling'), true);
  for (let i = 0; i < 100 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), true);

  for (let i = 0; i < 600 && isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), false, 'потолок сцены обязан её закрыть');
  assert.equal(state.sceneLock, false);
  resetFloorScenes();
});
