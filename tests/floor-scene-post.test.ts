/* Замок на пост актёра: место вместо нити.
 *
 * ЧТО ЗДЕСЬ ЛОВИТСЯ. Пост держал человека нитью: каждый кадр, если тот ушёл
 * дальше радиуса, ему ставили приказ вернуться и дотягивали тело. Волю при этом
 * не трогали вовсе — и она, целая, вела его наружу снова, едва приказ гас по
 * приходу. Получался предельный цикл: замерено на прологе жилого (сид 61061,
 * `tmp/prologue_jitter_probe.ts`) — период ровно секунда, амплитуда клетка,
 * полсотни человек идут каждый кадр и за двадцать пять секунд наматывают по
 * 57 клеток при смещении в одну. Со стороны строй дрожал.
 *
 * Починка — не длина поводка, а ШОВ: место выражено поводком (`room_leash.ts`),
 * который не даёт НАЗНАЧИТЬ дорогу наружу. Спорить не о чем, маршрута наружу
 * просто нет, человек при этом живой. Нити в сценах не осталось вовсе.
 *
 * Поэтому замок проверяет звенья, а не число дрожи:
 *   — каст, поставленный внутри якоря, привязан к его комнате;
 *   — тело такого больше НИКТО не дёргает: ушёл по залу — идёт дальше;
 *   — роль со своим радиусом поста (`post`) держится кругом на своём месте в
 *     строю: на арене Базы двое врагов на одном песке разойдутся только по
 *     объявленному числу, зал их пускает друг к другу;
 *   — `release` меняет пост на поводок МЕСТА ДЕЙСТВИЯ, а конец сцены снимает всё.
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
import {
  actorLeashRoom, actorLeashSpot, resetRoomLeashClockForTests, setRoomLeashMinute,
} from '../src/systems/room_leash';

const SCENE_ID = 'test_scene_post_is_a_room';
const ANCHOR = 'test_scene_post_anchor';
const ROOM_ID = 1;
/** Зал 20x14 с серединой в (30, 27): все смещения сцены считаются от неё. */
const HALL_CX = 30;
const HALL_CY = 27;
/** Радиус поста дуэлянта: столько же, сколько на арене Базы. */
const DUEL_POST = 1.4;

function buildWorld(): World {
  const world = new World();
  for (let y = 20; y < 34; y++) {
    for (let x = 20; x < 40; x++) world.carve(x, y);
  }
  const room = {
    id: ROOM_ID, type: RoomType.COMMON, x: 20, y: 20, w: 20, h: 14,
    aptId: -1, name: 'Испытательный зал', defId: ANCHOR, doors: [],
  } as never;
  world.rooms.push(room);
  // Пост держится комнатой, а комната читается по `roomMap`: без разметки клеток
  // привязывать было бы не к чему.
  for (let y = 20; y < 34; y++) {
    for (let x = 20; x < 40; x++) world.roomMap[world.idx(x, y)] = ROOM_ID;
  }
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

interface Stage {
  world: World;
  entities: Entity[];
  player: Entity;
  state: GameState;
  nextEntityId: { v: number };
}

function tick(stage: Stage, dt: number): void {
  stage.state.time += dt;
  // Минуту поводку ставит цикл AI; здесь его нет, и её ставим за него.
  setRoomLeashMinute(stage.state.clock.totalMinutes);
  updateContentRuntimeHooks({
    world: stage.world, entities: stage.entities, player: stage.player, state: stage.state,
    nextEntityId: stage.nextEntityId, dt, phase: 'floor_activity', gameOver: false,
  });
}

/** Поднятая сцена: строй на посту по умолчанию и пара с объявленным радиусом. */
function raiseScene(): Stage {
  resetFloorScenes();
  resetRoomLeashClockForTests();
  registerFloorScene({
    id: SCENE_ID,
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 60,
    leash: 18,
    actors: [
      { role: 'squad', count: 3, faction: Faction.LIQUIDATOR, occupation: Occupation.HUNTER, ox: -4, oy: 0, spread: 2 },
      { role: 'duel', count: 1, faction: Faction.CULTIST, occupation: Occupation.PILGRIM, ox: 5, oy: 0, spread: 0, post: DUEL_POST },
    ],
    beats: [
      { kind: 'pause', seconds: 30 },
      { kind: 'release', roles: ['squad'] },
      { kind: 'pause', seconds: 30 },
    ],
  });
  bindSceneCamera(createRuntimeCamera());

  const stage: Stage = {
    world: buildWorld(),
    state: buildState(),
    player: makePlayer(),
    entities: [],
    nextEntityId: { v: 9000 },
  };
  stage.entities.push(stage.player);

  assert.equal(requestFloorScene(SCENE_ID), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(stage, 0.1);
  assert.equal(isFloorSceneActive(), true, 'сцена должна была начаться');
  return stage;
}

function castOf(stage: Stage, faction: Faction): Entity[] {
  return stage.entities.filter(e => e.cinematicState !== undefined && e.faction === faction);
}

test('пост внутри якоря держится комнатой, а не нитью', () => {
  const stage = raiseScene();
  const squad = castOf(stage, Faction.LIQUIDATOR);
  assert.ok(squad.length >= 2, 'строй должен был встать');

  for (const man of squad) {
    assert.equal(actorLeashRoom(man), ROOM_ID, 'каждый в строю привязан к залу сцены');
  }

  /* Ушёл по залу своими ногами — это его дело, и нить его трогать не вправе.
   * Пока она его возвращала, спор с собственной волей и давал дрожь. */
  const walker = squad[0];
  walker.x = HALL_CX + 5.5;
  walker.y = HALL_CY + 4.5;
  const wasX = walker.x;
  const wasY = walker.y;
  tick(stage, 1 / 60);

  assert.equal(walker.x, wasX, 'привязанного никто не тянет обратно по X');
  assert.equal(walker.y, wasY, 'привязанного никто не тянет обратно по Y');
  assert.equal(walker.ai!.orderX, undefined, 'приказа возвращаться на пост больше нет');
  assert.notEqual(walker.ai!.goal, AIGoal.GOTO, 'курс домой ему не переписывают');
});

test('роль со своим радиусом поста держится кругом, а не залом', () => {
  const stage = raiseScene();
  const duellist = castOf(stage, Faction.CULTIST)[0];
  assert.ok(duellist, 'дуэлянт должен был встать');
  assert.equal(actorLeashRoom(duellist), undefined, 'объявленный радиус залом не подменяют');

  const post = duellist.cinematicState!;
  const spot = actorLeashSpot(duellist);
  assert.ok(spot, 'дуэлянту положен круг вокруг его места в строю');
  assert.equal(spot!.radius, DUEL_POST, 'радиус круга — тот, что объявила роль');
  assert.ok(
    stage.world.dist(spot!.x, spot!.y, post.postX, post.postY) < 0.001,
    'круг стоит на посту, а не на якоре сцены',
  );
});

test('release меняет пост на поводок места действия', () => {
  const stage = raiseScene();
  const man = castOf(stage, Faction.LIQUIDATOR)[0];
  for (let i = 0; i < 400 && man.cinematicState !== undefined; i++) tick(stage, 0.1);
  assert.equal(man.cinematicState, undefined, 'такт release обязан снять роль');

  const spot = actorLeashSpot(man);
  assert.ok(spot, 'отпущенного держит объявленное сценой место действия');
  assert.equal(spot!.radius, 18, 'радиус — общий поводок сцены');
  assert.ok(
    stage.world.dist(spot!.x, spot!.y, HALL_CX, HALL_CY) < 1,
    'место действия считается от якоря, а не от поста',
  );
  assert.equal(actorLeashRoom(man), undefined, 'зал его больше не держит: пост снят');
});

test('release снимает привязку вместе с ролью', () => {
  const stage = raiseScene();
  const squad = castOf(stage, Faction.LIQUIDATOR);
  const man = squad[0];
  assert.equal(actorLeashRoom(man), ROOM_ID, 'до такта он на посту');

  for (let i = 0; i < 400 && man.cinematicState !== undefined; i++) tick(stage, 0.1);
  assert.equal(man.cinematicState, undefined, 'такт release обязан снять роль');
  assert.equal(man.role, NpcRole.WANDERER, 'человеку возвращают его прежнюю роль');
  assert.equal(
    actorLeashRoom(man),
    undefined,
    'отпустить на словах, оставив запрет выходить за порог зала, нельзя',
  );
});

test('дуэлянт остаётся на посту, пока его роль не сняли', () => {
  const stage = raiseScene();
  const duellist = castOf(stage, Faction.CULTIST)[0];
  for (let i = 0; i < 200; i++) tick(stage, 0.1);
  assert.notEqual(duellist.cinematicState, undefined, 'release его роли не касался');
  assert.equal(duellist.type, EntityType.NPC, 'дуэлянт — обычный человек, а не особая порода');
});
