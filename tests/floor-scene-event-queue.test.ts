/* Второе событие не теряется за первым запросом.
 *
 * Наблюдатель сцен выходил на `active || pendingSceneId`: событие, пришедшее
 * пока висит другой запрос, пропадало молча, и взять его снова было неоткуда —
 * шина событий прошлое не повторяет. Пока событийная сцена одна на этаж, это не
 * стреляло; их уже две (`ministry_zaslonov_betrayal`, `hell_garrison_entry`).
 *
 * Здесь проверяется отложенный слот: очередь на ДВА запроса, каждый ждёт своего
 * этажа сам по себе, и ни один не переживает загрузку сейва.
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  AIGoal,
  EntityType,
  Faction,
  Occupation,
  RoomType,
  type Entity,
  type GameState,
} from '../src/core/types';
import { World } from '../src/core/world';
import { createRuntimeCamera, type RuntimeCamera } from '../src/systems/camera';
import {
  activeFloorSceneId,
  bindSceneCamera,
  isFloorSceneActive,
  registerFloorScene,
  requestFloorScene,
  resetFloorScenes,
  restoreFloorScenesFromSave,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { publishEvent } from '../src/systems/events';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { ensureFloorRunState } from '../src/systems/procedural_floors';

const ANCHOR = 'test_scene_queue_anchor';
const EVENT_TYPE = 'test_scene_queue_signal';

function buildWorld(): World {
  const world = new World();
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

interface Rig {
  world: World;
  state: GameState;
  player: Entity;
  entities: Entity[];
  camera: RuntimeCamera;
  tick(dt?: number): void;
}

function buildRig(firstEntityId: number): Rig {
  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: firstEntityId };
  const camera = createRuntimeCamera();
  bindSceneCamera(camera);
  setCurrentPlayerEntity(player);
  return {
    world, state, player, entities, camera,
    tick(dt = 0.1) {
      state.time += dt;
      updateContentRuntimeHooks({
        world, entities, player, state, nextEntityId, dt, phase: 'floor_activity', gameOver: false,
      });
    },
  };
}

function registerEventScene(id: string, tag: string, floorKey = 'design:living'): void {
  registerFloorScene({
    id,
    floorKey,
    trigger: { kind: 'event', eventType: EVENT_TYPE, tag },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 2,
    actors: [{ role: 'crowd', count: 1, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, ox: 2, oy: 0 }],
    beats: [{ kind: 'pause', seconds: 0.2 }],
  });
}

function signal(rig: Rig, tag: string): void {
  publishEvent(rig.state, { type: EVENT_TYPE, tags: [tag], text: 'проба' } as never);
}

function playOut(rig: Rig): void {
  for (let i = 0; i < 400 && isFloorSceneActive(); i++) rig.tick(0.2);
  assert.equal(isFloorSceneActive(), false, 'сцена обязана доиграть');
}

test('второе событие ждёт своей очереди, а не теряется за первым запросом', () => {
  resetFloorScenes();
  const FIRST = 'test_scene_queue_first';
  const SECOND = 'test_scene_queue_second';
  registerEventScene(FIRST, 'first');
  registerEventScene(SECOND, 'second');
  const rig = buildRig(1000);

  // Два события в одном кадре: до отложенного слота второе пропадало молча.
  signal(rig, 'first');
  signal(rig, 'second');

  rig.tick();
  assert.equal(activeFloorSceneId(), FIRST, 'первый запрос поднимается сразу');
  playOut(rig);

  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) rig.tick();
  assert.equal(isFloorSceneActive(), true, 'второе событие обязано пережить первый запрос');
  assert.equal(activeFloorSceneId(), SECOND);

  resetFloorScenes(rig.state, rig.entities);
});

test('событие во время играющей сцены тоже попадает в очередь', () => {
  resetFloorScenes();
  const PLAYING = 'test_scene_queue_playing';
  const LATE = 'test_scene_queue_late';
  registerEventScene(PLAYING, 'playing');
  registerEventScene(LATE, 'late');
  const rig = buildRig(2000);

  signal(rig, 'playing');
  rig.tick();
  assert.equal(activeFloorSceneId(), PLAYING);

  // Прежний выход на `active` выбрасывал это событие целиком.
  signal(rig, 'late');
  playOut(rig);

  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) rig.tick();
  assert.equal(activeFloorSceneId(), LATE, 'событие под чужой сценой обязано дождаться кадра');

  resetFloorScenes(rig.state, rig.entities);
});

test('отложенный запрос ждёт своего этажа сам, а не за чужим в первом слоте', () => {
  resetFloorScenes();
  const FOREIGN = 'test_scene_queue_foreign_floor';
  const HERE = 'test_scene_queue_home_floor';
  registerEventScene(FOREIGN, 'foreign', 'design:ministry');
  registerEventScene(HERE, 'here');
  const rig = buildRig(3000);

  // Первый слот занимает сцена чужого этажа — она ждёт министерства сколько
  // угодно долго. Второй слот при этом обязан играть здесь и сейчас.
  signal(rig, 'foreign');
  signal(rig, 'here');

  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) rig.tick();
  assert.equal(activeFloorSceneId(), HERE, 'отложенный запрос не имеет права запираться первым');
  playOut(rig);

  ensureFloorRunState(rig.state).currentZ = 30;
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) rig.tick();
  assert.equal(activeFloorSceneId(), FOREIGN, 'первый запрос дожидается своего этажа');

  resetFloorScenes(rig.state, rig.entities);
});

test('очередь запросов не переживает загрузку сейва', () => {
  resetFloorScenes();
  const LEAK = 'test_scene_queue_leak_pending';
  const LEAK2 = 'test_scene_queue_leak_deferred';
  registerEventScene(LEAK, 'leak');
  registerEventScene(LEAK2, 'leak2');
  const rig = buildRig(4000);

  signal(rig, 'leak');
  signal(rig, 'leak2');

  // Загрузка ставит на место прогона чужой: запросы прошлого прогона обязаны
  // умереть вместе с ним, иначе сцена поднимется в игре, которая её не просила.
  restoreFloorScenesFromSave([]);

  for (let i = 0; i < 20; i++) rig.tick();
  assert.equal(isFloorSceneActive(), false, 'запрос прошлого прогона не имеет права всплыть после загрузки');

  // Реестр при этом цел: сцену по-прежнему можно поднять явным запросом.
  assert.equal(requestFloorScene(LEAK), true);

  resetFloorScenes(rig.state, rig.entities);
});
