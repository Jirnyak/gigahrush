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
  Cell,
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
import { isDebugOnePunchManEnabled } from '../src/systems/debug_cheats';
import {
  abortFloorScene,
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

test('walkOut keeps actors on the floor until the scene is over and a grace has passed', () => {
  resetFloorScenes();
  registerFloorScene({
    id: 'test_scene_walk_out',
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 6,
    actors: [{ role: 'leaving', count: 2, faction: Faction.LIQUIDATOR, ox: 0, oy: 0, spread: 2 }],
    // Такт ухода последний и НЕ ждёт прихода к лифту: сцена обязана закрыться
    // на нём, а ноги — идти дальше уже в живом мире.
    beats: [{ kind: 'walkOut', roles: ['leaving'], toFloorKey: 'design:maintenance' }],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  // Лифт в дальнем углу зала: без него ухода нет вовсе, и это тоже правило.
  world.cells[world.idx(38, 32)] = Cell.LIFT;
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 4000 };

  assert.equal(requestFloorScene('test_scene_walk_out'), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  const leaving = entities.filter(e => e.id !== player.id).map(e => e.id);
  assert.equal(leaving.length, 2);
  // Первый кадр только поднимает сцену; такт ухода отыгрывается со следующего.
  for (let i = 0; i < 3; i++) tick(world, entities, player, state, nextEntityId, 0.1);

  const walkers = () => entities.filter(e => leaving.includes(e.id));
  assert.ok(walkers().every(e => e.role !== NpcRole.CINEMATIC_ACTOR), 'поводок сцены снят, иначе идти нечем');
  assert.ok(walkers().every(e => e.ai?.goal === AIGoal.GOTO), 'курс задан на лифт');
  assert.ok(
    walkers().every(e => world.dist2(e.ai!.tx, e.ai!.ty, 38.5, 32.5) < 9),
    'цель обязана быть у лифта, а не у первой попавшейся клетки',
  );

  // Дошёл до лифта ПОКА СЦЕНА ИДЁТ — и всё равно остаётся: снять его с этажа
  // сейчас значит показать зрителю, как он пропадает. Именно так и было.
  for (const walker of walkers()) {
    walker.x = 38.5;
    walker.y = 32.5;
  }
  for (let i = 0; i < 10; i++) tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), true, 'сцена ещё идёт: обратный пролёт камеры не закончен');
  assert.equal(walkers().length, 2, 'в кадре уходящие исчезать не имеют права');

  // Сцена закрылась — управление у игрока, но выдержка ещё держит.
  for (let i = 0; i < 400 && isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.2);
  assert.equal(isFloorSceneActive(), false, 'сцена закрывается на такте ухода, не дожидаясь лифта');
  tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(walkers().length, 2, 'сразу после возврата камеры развоплощать рано');

  // Выдержка вышла — уходящие покидают этаж вдалеке от вернувшегося кадра.
  for (let i = 0; i < 20 && walkers().length; i++) tick(world, entities, player, state, nextEntityId, 0.5);
  assert.equal(walkers().length, 0, 'после выдержки уходящие обязаны покинуть этаж');
  resetFloorScenes();
});

test('a scene makes the player invulnerable and gives it back on its own', () => {
  /* Пока сцена держит кадр, управление отобрано: игрок не может ни отойти, ни
   * выстрелить, ни закрыть дверь. Убивать его в это время нечестно по построению,
   * а смерть под сценой вдобавок рвёт саму сцену — кадр возвращается посреди фразы.
   *
   * Неуязвимость не заводится своей: она идёт тем же путём, что и в трейлере, и
   * снимается вместе с замком сцены — а его гасят и конец, и обрыв снаружи. Снять
   * её отдельно нельзя, значит и забыть нельзя. */
  resetFloorScenes();
  registerFloorScene({
    id: 'test_scene_immunity',
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 4,
    actors: [{ role: 'crowd', count: 1, faction: Faction.LIQUIDATOR, ox: 0, oy: 0 }],
    beats: [{ kind: 'pause', seconds: 1 }],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 7000 };

  assert.equal(isDebugOnePunchManEnabled(state), false, 'до сцены игрок обычный');

  assert.equal(requestFloorScene('test_scene_immunity'), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isFloorSceneActive(), true);
  assert.equal(state.sceneLock, true);
  assert.equal(isDebugOnePunchManEnabled(state), true, 'пока сцена держит кадр, игрок неуязвим');

  // Смерть под сценой обрывает её снаружи — и неуязвимость уходит вместе с замком.
  abortFloorScene(state, entities);
  assert.equal(state.sceneLock, false);
  assert.equal(isDebugOnePunchManEnabled(state), false, 'обрыв возвращает игроку смертность');

  // И тот же путь при обычном конце: сцена закрывается сама.
  resetFloorScenes();
  assert.equal(requestFloorScene('test_scene_immunity'), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(isDebugOnePunchManEnabled(state), true);
  for (let i = 0; i < 400 && isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.2);
  assert.equal(isFloorSceneActive(), false, 'сцена обязана закончиться сама');
  assert.equal(isDebugOnePunchManEnabled(state), false, 'конец сцены возвращает игроку смертность');
  resetFloorScenes();
});

test('moveTo is a waypoint: it points the role and lets go', () => {
  resetFloorScenes();
  registerFloorScene({
    id: 'test_scene_move_to',
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 8,
    actors: [{ role: 'star', count: 1, faction: Faction.LIQUIDATOR, ox: -8, oy: -5 }],
    // Отпущенный в живой мир актёр забивается в угол, и облёт вокруг него
    // упирается в стену. Такт выводит его в середину зала своими ногами.
    beats: [{ kind: 'moveTo', roles: ['star'], to: { ox: 0, oy: 0 }, wait: 2 }],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 6000 };

  assert.equal(requestFloorScene('test_scene_move_to'), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  const star = entities.find(e => e.id !== player.id)!;
  for (let i = 0; i < 3; i++) tick(world, entities, player, state, nextEntityId, 0.1);

  // Центр испытательного зала: те же 30,27, что и якорь сцены.
  const cx = 30;
  const cy = 27;
  assert.ok(star.role !== NpcRole.CINEMATIC_ACTOR, 'поводок сцены снят, иначе идти нечем');
  assert.equal(star.ai?.goal, AIGoal.GOTO, 'курс задан');
  assert.ok(world.dist2(star.ai!.tx, star.ai!.ty, cx, cy) < 4,
    `цель ${star.ai!.tx},${star.ai!.ty} не в середине зала (${cx},${cy})`);

  // И ОТПУСКАЕТ. Такт ставит цель один раз: дальше человек живёт сам, и сбитый
  // курс никто не возвращает. Держать его на точке нельзя — дойдя, он утыкался бы
  // в неё и стоял вместо того, чтобы жить дальше.
  star.ai!.goal = AIGoal.WANDER;
  star.ai!.tx = 0;
  star.ai!.ty = 0;
  tick(world, entities, player, state, nextEntityId, 0.1);
  assert.equal(star.ai?.goal, AIGoal.WANDER, 'вейпойнт не имеет права держать человека на точке');
  resetFloorScenes();
});

test('walkOut leaves people on the floor when there is no lift to reach', () => {
  resetFloorScenes();
  registerFloorScene({
    id: 'test_scene_walk_out_no_lift',
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 6,
    actors: [{ role: 'leaving', count: 2, faction: Faction.LIQUIDATOR, ox: 0, oy: 0, spread: 2 }],
    beats: [{ kind: 'walkOut', roles: ['leaving'], toFloorKey: 'design:maintenance' }],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 5000 };

  assert.equal(requestFloorScene('test_scene_walk_out_no_lift'), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  const leaving = entities.filter(e => e.id !== player.id).map(e => e.id);

  for (let i = 0; i < 120 && isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  for (let i = 0; i < 60; i++) tick(world, entities, player, state, nextEntityId, 0.1);

  // Лифта нет — значит и уходить некуда: такт до списка уходящих никого не
  // доводит, и люди просто остаются жить на этаже. Выдержка тут ни при чём.
  assert.equal(entities.filter(e => leaving.includes(e.id)).length, 2);
  resetFloorScenes();
});
