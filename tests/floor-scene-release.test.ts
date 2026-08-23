/* Замок на пропуск сцены: игрок забирает кадр себе, сцена доигрывает сама.
 *
 * Пропуск здесь не обрыв. Игроку возвращают ровно то, что принадлежит зрителю —
 * камеру, ввод и вместе с замком неуязвимость, — а актёры, реплики и такты идут
 * до своего конца, как и шли бы, смотри он на них или нет. Это и есть разница
 * между «сцена кончилась» и «зритель встал и ушёл».
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
import { createRuntimeCamera } from '../src/systems/camera';
import { isDebugOnePunchManEnabled } from '../src/systems/debug_cheats';
import {
  bindSceneCamera,
  isFloorSceneActive,
  registerFloorScene,
  releaseFloorSceneToPlayer,
  requestFloorScene,
  resetFloorScenes,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';

const SCENE_ID = 'test_scene_release_to_player';
const ANCHOR = 'test_scene_release_anchor';

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

function tick(world: World, entities: Entity[], player: Entity, state: GameState, nextEntityId: { v: number }, dt: number): void {
  state.time += dt;
  updateContentRuntimeHooks({
    world, entities, player, state, nextEntityId, dt, phase: 'floor_activity', gameOver: false,
  });
}

test('клавиша «принять» отдаёт кадр игроку, а сцена доигрывает сама', () => {
  resetFloorScenes();
  registerFloorScene({
    id: SCENE_ID,
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 60,
    actors: [{ role: 'crowd', count: 2, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, ox: 0, oy: 0, spread: 2 }],
    beats: [
      { kind: 'pause', seconds: 0.2 },
      // Такт камеры ПОСЛЕ пропуска. Он ждёт прилёта кадра, которого больше нет:
      // без своей оговорки сцена повисла бы здесь до самого потолка.
      { kind: 'fly', to: { ox: 6, oy: 3 }, speed: 10 },
      { kind: 'say', role: 'crowd', text: 'Досказано без зрителя.', seconds: 1 },
      { kind: 'orbit', around: { ox: 0, oy: 0 }, radius: 2, speed: 1, seconds: 1 },
    ],
  });
  const camera = createRuntimeCamera();
  bindSceneCamera(camera);

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 9000 };

  assert.equal(requestFloorScene(SCENE_ID), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), true, 'сцена должна была начаться');
  assert.equal(state.sceneLock, true, 'до пропуска кадр принадлежит сцене');
  assert.equal(camera.mode, 'cinematic', 'до пропуска камера у сцены');
  assert.equal(isDebugOnePunchManEnabled(state), true, 'пока кадр у сцены, игрок неуязвим');

  // Кнопка, ЗАЖАТАЯ ДО сцены, пропуском не считается: то же действие держат ради
  // фонаря, и пролог пропадал бы молча у всякого, кто вошёл со светом.
  assert.equal(releaseFloorSceneToPlayer(state, true), false, 'зажатая с порога кнопка не пропуск');
  assert.equal(state.sceneLock, true, 'кадр остался у сцены');

  // Отпустил — взвёл; нажал — забрал.
  assert.equal(releaseFloorSceneToPlayer(state, false), false, 'отпускание только взводит');
  assert.equal(releaseFloorSceneToPlayer(state, true), true, 'первый пропуск обязан сработать');
  assert.equal(state.sceneLock, false, 'ввод, камера и HUD возвращаются игроку');
  assert.equal(camera.mode, 'player', 'камера обязана вернуться игроку');
  assert.equal(isFloorSceneActive(), true, 'пропуск НЕ обрывает сцену');
  assert.equal(
    isDebugOnePunchManEnabled(state),
    false,
    'неуязвимость уходит вместе с замком: это решение игрока и его цена',
  );
  assert.equal(releaseFloorSceneToPlayer(state, true), false, 'второй пропуск нечего снимать');

  // Слепок кадра игрока: дальше сцена не имеет права его трогать.
  const shot = {
    x: camera.free.x,
    y: camera.free.y,
    path: JSON.stringify(camera.cinematic?.path ?? []),
    node: camera.cinematic?.targetNodeIndex,
    lookAtX: camera.cinematic?.lookAtX,
  };

  // Такты идут дальше: пролёт закрывается сам, а слово доходит до бабла.
  let spoke = false;
  for (let i = 0; i < 60 && !spoke; i++) {
    tick(world, entities, player, state, nextEntityId, 0.1);
    spoke = entities.some(e => e.id !== player.id && e.activeBark?.text === 'Досказано без зрителя.');
  }
  assert.equal(spoke, true, 'сцена обязана доиграть свои реплики без зрителя');
  assert.equal(state.sceneLock, false, 'сцена не имеет права забирать управление обратно');

  // И ни один камерный такт кадра игрока не тронул.
  assert.equal(camera.mode, 'player', 'пролёт и облёт не вправе отбирать камеру обратно');
  assert.equal(camera.free.x, shot.x, 'кадр игрока сдвинут сценой');
  assert.equal(camera.free.y, shot.y, 'кадр игрока сдвинут сценой');
  assert.equal(JSON.stringify(camera.cinematic?.path ?? []), shot.path, 'сцена переложила маршрут чужой камеры');
  assert.equal(camera.cinematic?.targetNodeIndex, shot.node, 'сцена промотала маршрут чужой камеры');
  assert.equal(camera.cinematic?.lookAtX, shot.lookAtX, 'сцена перенацелила чужую камеру');

  // Конец наступает СВОЙ, а не по потолку: 60 секунд `maxSeconds` не выбираются.
  const startedAt = state.time;
  for (let i = 0; i < 400 && isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.2);
  assert.equal(isFloorSceneActive(), false, 'сцена обязана закончиться сама');
  assert.ok(
    state.time - startedAt < 20,
    `сцена висела до потолка вместо своего конца: ${(state.time - startedAt).toFixed(1)} с`,
  );
  assert.equal(state.sceneLock, false, 'кадр остаётся у игрока');
  assert.equal(camera.cinematic?.orbitRadius, undefined, 'облёт отпущенной сцены не вправе крутить чужую камеру');
  resetFloorScenes();
});
