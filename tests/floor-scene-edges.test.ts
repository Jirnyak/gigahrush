/* Стыки сцены этажа: смерть, обрыв, сброс, чужой запрос.
 *
 * Сцена — гость в чужом кадре: игрок может умереть посреди неё, уехать лифтом
 * или загрузить сейв. Здесь проверяется не проигрывание тактов (это делает
 * `floor-scene.test.ts`), а то, что мир переживает обрыв: игрока не вынимают из
 * массива, замок снимается, роли актёров возвращаются людям.
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
import { createRuntimeCamera, type RuntimeCamera } from '../src/systems/camera';
import {
  abortFloorScene,
  activeFloorSceneId,
  bindSceneCamera,
  isFloorSceneActive,
  registerFloorScene,
  requestFloorScene,
  resetFloorScenes,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { ensureFloorRunState } from '../src/systems/procedural_floors';

const ANCHOR = 'test_scene_edge_anchor';

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
  nextEntityId: { v: number };
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
  // Игрок по умолчанию — своё тело: иначе прошлый тест оставил бы чужой id.
  setCurrentPlayerEntity(player);
  return {
    world, state, player, entities, nextEntityId, camera,
    tick(dt = 0.1) {
      state.time += dt;
      updateContentRuntimeHooks({
        world, entities, player, state, nextEntityId, dt, phase: 'floor_activity', gameOver: false,
      });
    },
  };
}

/** Сцена, которая уводит роль с этажа: на этом такте и ломался мир. */
function registerDepartingScene(id: string): void {
  registerFloorScene({
    id,
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 60,
    actors: [{ role: 'crowd', count: 3, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, ox: 2, oy: 0, spread: 3 }],
    beats: [
      { kind: 'pause', seconds: 0.2 },
      { kind: 'depart', roles: ['crowd'], toFloorKey: 'design:maintenance' },
      { kind: 'pause', seconds: 0.2 },
    ],
  });
}

function startedCast(rig: Rig): Entity[] {
  rig.tick();
  assert.equal(isFloorSceneActive(), true, 'сцена должна была подняться первым кадром');
  return rig.entities.filter(e => e.id !== rig.player.id);
}

test('такт ухода не вынимает из мира того, кто стал игроком после смерти', () => {
  resetFloorScenes();
  const SCENE = 'test_scene_edge_depart_player';
  registerDepartingScene(SCENE);
  const rig = buildRig(1000);

  assert.equal(requestFloorScene(SCENE), true);
  const cast = startedCast(rig);
  assert.equal(cast.length, 3);

  // Смерть посреди сцены: путь продолжается телом актёра — ровно то, что делает
  // `continueDeathAsRandomNpc`, вселяя игрока в живого NPC этажа.
  const host = cast[0];
  setCurrentPlayerEntity(host);
  const others = cast.slice(1).map(e => e.id);

  for (let i = 0; i < 40 && rig.entities.some(e => others.includes(e.id)); i++) rig.tick();
  assert.equal(rig.entities.some(e => others.includes(e.id)), false, 'остальной каст обязан уйти');
  assert.ok(
    rig.entities.some(e => e.id === host.id),
    'игрок остаётся в мире, чьим бы телом он ни был: иначе такт ухода стирает мир из-под него',
  );

  setCurrentPlayerEntity(null);
  resetFloorScenes();
});

test('уход снимает роль сцены до того, как человек уедет с этажа', () => {
  resetFloorScenes();
  const SCENE = 'test_scene_edge_depart_role';
  registerDepartingScene(SCENE);
  const rig = buildRig(2000);

  assert.equal(requestFloorScene(SCENE), true);
  const cast = startedCast(rig);
  assert.ok(cast.every(e => e.role === NpcRole.CINEMATIC_ACTOR));

  const departedIds = cast.map(e => e.id);
  for (let i = 0; i < 40 && rig.entities.some(e => departedIds.includes(e.id)); i++) rig.tick();
  assert.equal(rig.entities.some(e => departedIds.includes(e.id)), false, 'ушедшие вынуты из мира');

  // Ссылки на объекты живут дальше массива: роль обязана быть снята ДО того, как
  // состояние уехало в A-Life, иначе человек останется актёром несуществующей сцены.
  assert.ok(
    cast.every(e => e.role !== NpcRole.CINEMATIC_ACTOR),
    'ушедшие не имеют права увезти с собой роль сцены',
  );
  assert.ok(cast.every(e => e.cinematicState === undefined), 'состояние сцены снято вместе с ролью');

  resetFloorScenes();
});

test('обрыв сцены снаружи снимает замок, отпускает актёров и возвращает камеру', () => {
  resetFloorScenes();
  const SCENE = 'test_scene_edge_abort';
  registerDepartingScene(SCENE);
  const rig = buildRig(3000);

  assert.equal(requestFloorScene(SCENE), true);
  const cast = startedCast(rig);
  assert.equal(rig.state.sceneLock, true);

  // Так сцену обрывают смерть, переход этажа и загрузка сейва.
  abortFloorScene(rig.state, rig.entities);

  assert.equal(isFloorSceneActive(), false, 'проигрыватель обязан отпустить кадр');
  assert.equal(rig.state.sceneLock, false, 'иначе управление заперто до конца прогона');
  assert.ok(cast.every(e => e.role !== NpcRole.CINEMATIC_ACTOR), 'актёры возвращаются в цикл AI');
  assert.equal(rig.camera.mode, 'player', 'камера возвращается игроку');

  resetFloorScenes();
});

test('сброс сцен закрывает играющую сцену, а не забывает про неё', () => {
  resetFloorScenes();
  const SCENE = 'test_scene_edge_reset';
  registerDepartingScene(SCENE);
  const rig = buildRig(4000);

  assert.equal(requestFloorScene(SCENE), true);
  const cast = startedCast(rig);
  assert.equal(rig.state.sceneLock, true);

  resetFloorScenes(rig.state, rig.entities);

  assert.equal(isFloorSceneActive(), false);
  assert.equal(rig.state.sceneLock, false, 'сброс без снятия замка запирал управление навсегда');
  assert.ok(cast.every(e => e.role !== NpcRole.CINEMATIC_ACTOR), 'актёры не остаются вне цикла AI');
  assert.equal(rig.camera.mode, 'player');
});

test('запрос сцены с чужого этажа не съедает первый визит и ждёт своего этажа', () => {
  resetFloorScenes();
  const HOME = 'test_scene_edge_first_visit';
  const FOREIGN = 'test_scene_edge_foreign';
  registerFloorScene({
    id: HOME,
    floorKey: 'design:living',
    trigger: { kind: 'first_visit' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 2,
    actors: [{ role: 'crowd', count: 1, faction: Faction.LIQUIDATOR, ox: 0, oy: 0 }],
    beats: [{ kind: 'pause', seconds: 0.2 }],
  });
  registerFloorScene({
    id: FOREIGN,
    floorKey: 'design:ministry',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 2,
    actors: [{ role: 'crowd', count: 1, faction: Faction.MINISTRY, ox: 0, oy: 0 }],
    beats: [{ kind: 'pause', seconds: 0.2 }],
  });

  const rig = buildRig(5000);
  assert.equal(requestFloorScene(FOREIGN), true);

  rig.tick();
  assert.equal(isFloorSceneActive(), true, 'пролог этого этажа обязан играть, а не пропадать за чужим запросом');
  assert.equal(activeFloorSceneId(), HOME);

  for (let i = 0; i < 400 && isFloorSceneActive(); i++) rig.tick(0.2);
  assert.equal(isFloorSceneActive(), false);

  // Запрос остался в очереди и поднимается там, где ему место.
  ensureFloorRunState(rig.state).currentZ = 30;
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) rig.tick();
  assert.equal(isFloorSceneActive(), true, 'запрос обязан пережить чужой этаж');
  assert.equal(activeFloorSceneId(), FOREIGN);

  resetFloorScenes(rig.state, rig.entities);
});
