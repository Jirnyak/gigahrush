/* Замок на сцену «Разворот Заслонова» — перелом сюжета на министерстве.
 *
 * Проверяется механика, и только она:
 *   — обе сцены министерства живут в реестре и НЕ спорят за первый визит: смотр
 *     гарнизона остаётся сценой прихода, разворот ждёт своего события;
 *   — событийный триггер вообще работает: без публикации сцена не поднимается,
 *     с публикацией — поднимается и ставит каст;
 *   — такт `defect` меняет сторону генерала и охранения и идёт ДО `release`,
 *     иначе перебежчики так и остались бы декорацией;
 *   — сторона генерала — ПОСТОЯННЫЙ факт: она переживает перегенерацию этажа,
 *     на которой тело авторской личности рождается из анкеты пакета заново.
 *
 * Чего здесь намеренно НЕТ: исхода боя и смерти генерала. Сцене они не
 * принадлежат (`cutscene.md`, главное правило) — она меняет сторону и уходит,
 * дальше решают стволы. Убийство Заслонова не является тактом сцены и не должно
 * им становиться.
 *
 * Прогон идёт на СИНТЕТИЧЕСКОМ зале того же размера, что настоящий вестибюль
 * (33x33): здесь проверяется сцена, а не макрогеометрия министерства — её
 * держит замок смотра (`tests/ministry-parade-scene.test.ts`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../src/content';
import {
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
import { seedGlobalRng } from '../src/core/rand';
import { designNpcFloorKey } from '../src/data/plot';
import { getPlotNpcNumericId } from '../src/data/npc_packages';
import { initFactionRelations } from '../src/data/relations';
import { MINISTRY_VESTIBULE_ANCHOR } from '../src/gen/ministry/geometry';
import { GARRISON_PARADE_SCENE_ID, PARADE_GENERAL_ID } from '../src/gen/ministry/garrison_parade';
import {
  MINISTRY_BETRAYAL_SCENE_ID,
  ZASLONOV_BETRAYAL_EVENT_TAG,
  ZASLONOV_BETRAYAL_EVENT_TYPE,
} from '../src/gen/ministry/general_betrayal';
import { plotNpcEntityFromPackage } from '../src/gen/plot_npc_spawn';
import {
  createPrefilledAlifeState,
  getAlifeNpcFactionOverride,
  getAlifeNpcRecordSnapshot,
  materializeAlifeFloorPopulation,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { createRuntimeCamera, updateRuntimeCamera, type RuntimeCamera } from '../src/systems/camera';
import {
  abortFloorScene,
  activeFloorSceneId,
  bindSceneCamera,
  floorSceneById,
  isFloorSceneActive,
  resetFloorScenes,
  type SceneActorDef,
  type SceneBeat,
  type SceneSpot,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { publishEvent } from '../src/systems/events';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { makeGameState, makeTestPlayer } from './helpers';

const MINISTRY_Z = 30;
const MINISTRY_FLOOR_KEY = designNpcFloorKey('ministry');
const SCENE_SOURCE = 'src/gen/ministry/general_betrayal.ts';
const FRAME = 1 / 60;
/** Потолок сцены — 150 секунд, плюс запас на обратный пролёт камеры. */
const MAX_FRAMES = 60 * 170;

/** Настоящий вестибюль — 33x33, и смещения кадра считаны от этого размера. */
const HALL = 33;
const HALL_X = 400;
const HALL_Y = 400;
const ANCHOR_CX = HALL_X + HALL / 2;
const ANCHOR_CY = HALL_Y + HALL / 2;

/** Слот личности генерала: он же `alifeId` его тела и адрес оверрайда в A-Life. */
const GENERAL_SLOT = getPlotNpcNumericId(PARADE_GENERAL_ID);

/**
 * План населения с личностью генерала. Резерв объявляется СТРОКОЙ `npc:<пакет>`:
 * числовой слот — позиционный индекс регистрации, и брать его ключом значит
 * подменять человека.
 */
const PLAN: AlifePopulationPlan = {
  buckets: [{
    floorKey: MINISTRY_FLOOR_KEY,
    z: MINISTRY_Z,
    targetCount: 64,
    reserved: [{
      id: `npc:${PARADE_GENERAL_ID}`,
      kind: 'authored',
      presence: 'population',
      name: 'Генерал Заслонов',
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      age: 54,
      sex: 'male',
    }],
  }],
};

interface Stage {
  world: World;
  entities: Entity[];
  player: Entity;
  state: GameState;
  camera: RuntimeCamera;
  nextEntityId: { v: number };
  general: Entity;
}

function buildHall(): World {
  const world = new World();
  for (let y = HALL_Y; y < HALL_Y + HALL; y++) {
    for (let x = HALL_X; x < HALL_X + HALL; x++) world.carve(x, y);
  }
  // Подступы к залу: камере нужна дорога, а уходящим — направление.
  for (let x = HALL_X - 12; x < HALL_X; x++) {
    world.carve(x, HALL_Y + Math.floor(HALL / 2));
    world.carve(x, HALL_Y + Math.floor(HALL / 2) + 1);
  }
  world.rooms.push({
    id: 1, type: RoomType.COMMON, x: HALL_X, y: HALL_Y, w: HALL, h: HALL,
    aptId: -1, name: 'Центральный вестибюль входящих дел',
    defId: MINISTRY_VESTIBULE_ANCHOR, doors: [],
  } as never);
  world.markCellsDirty();
  return world;
}

function stageMinistry(): Stage {
  seedGlobalRng(0x2a51_07);
  initFactionRelations();

  const world = buildHall();
  const state = makeGameState({ currentZ: MINISTRY_Z });
  setFloorRunState(state, undefined);
  createPrefilledAlifeState(state, 4242, 64, PLAN);

  const player = makeTestPlayer({ x: ANCHOR_CX + 10, y: ANCHOR_CY + 10, angle: 0 });
  /* Генерал приходит на этаж телом из ПАКЕТА — ровно так, как его ставит общая
   * доставка авторских NPC. Именно поэтому сторона у него анкетная, и именно её
   * перегенерация этажа возвращает обратно, если факт разворота не сохранён. */
  const general = plotNpcEntityFromPackage(900_001, PARADE_GENERAL_ID, ANCHOR_CX - 6, ANCHOR_CY + 6);
  assert.ok(general, 'пакет генерала не зарегистрирован: сцене некого звать');

  const entities: Entity[] = [player, general!];
  setCurrentPlayerEntity(player);
  const camera = createRuntimeCamera();
  bindSceneCamera(camera);
  resetFloorScenes();

  return { world, entities, player, state, camera, nextEntityId: { v: 950_000 }, general: general! };
}

/** Один кадр цикла: хуки контента поднимают и ведут сцену, камера идёт своим ходом. */
function tick(stage: Stage): void {
  stage.state.time += FRAME;
  stage.state.tick++;
  rebuildEntityIndexForSimulation(stage.entities, stage.state.tick);
  updateContentRuntimeHooks({
    world: stage.world, entities: stage.entities, player: stage.player, state: stage.state,
    nextEntityId: stage.nextEntityId, dt: FRAME, phase: 'floor_activity', gameOver: false,
  });
  updateRuntimeCamera(stage.camera, stage.world, FRAME, stage.player);
}

/**
 * Отыграть первый визит и убрать его следы.
 *
 * Смотр гарнизона — сцена ПРИХОДА на министерство, и она поднимается сама на
 * первом же кадре. Разворот играется позже, поэтому прогон честно проходит через
 * смотр: он остаётся в списке сыгранного (и потому больше не поднимется), а его
 * каст снимается с этажа — три сотни человек строя к развороту отношения не имеют.
 */
function playThroughParade(stage: Stage): void {
  tick(stage);
  assert.equal(activeFloorSceneId(), GARRISON_PARADE_SCENE_ID,
    'первый приход на министерство обязан поднимать смотр гарнизона, а не разворот');

  abortFloorScene(stage.state, stage.entities);
  const keep = new Set([stage.player.id, stage.general.id]);
  for (let i = stage.entities.length - 1; i >= 0; i--) {
    if (!keep.has(stage.entities[i].id)) stage.entities.splice(i, 1);
  }
  rebuildEntityIndexForSimulation(stage.entities, ++stage.state.tick);
}

/** Роли, на которые ссылается точка кадра. Место и говоривший ролей не называют. */
function spotRole(spot: SceneSpot): string | undefined {
  return 'role' in spot ? spot.role : undefined;
}

function beatRoles(beat: SceneBeat): string[] {
  const roles: (string | undefined)[] = [];
  if ('role' in beat && typeof beat.role === 'string') roles.push(beat.role);
  if ('roles' in beat && beat.roles) roles.push(...beat.roles);
  if ('to' in beat && beat.to) roles.push(spotRole(beat.to));
  if ('look' in beat && beat.look) roles.push(spotRole(beat.look));
  if ('around' in beat && beat.around) roles.push(spotRole(beat.around));
  return roles.filter((role): role is string => typeof role === 'string');
}

function betrayalScene() {
  const def = floorSceneById(MINISTRY_BETRAYAL_SCENE_ID);
  assert.ok(def, 'сцена разворота не зарегистрирована');
  return def!;
}

test('обе сцены министерства объявлены и не спорят за первый визит', () => {
  const parade = floorSceneById(GARRISON_PARADE_SCENE_ID);
  assert.ok(parade, 'смотр гарнизона пропал из реестра');
  assert.equal(parade!.floorKey, MINISTRY_FLOOR_KEY);
  assert.equal(parade!.anchorRoomAlias, MINISTRY_VESTIBULE_ANCHOR);
  assert.equal(parade!.trigger.kind, 'first_visit', 'смотр обязан остаться сценой прихода на этаж');

  const def = betrayalScene();
  assert.notEqual(def.id, parade!.id, 'у сцен обязаны быть разные id: список сыгранного ведётся по ним');
  assert.equal(def.floorKey, MINISTRY_FLOOR_KEY);
  assert.equal(def.anchorRoomAlias, MINISTRY_VESTIBULE_ANCHOR, 'разворот играется в том же зале, что и смотр');
  assert.equal(def.trigger.kind, 'event',
    'первый визит министерства занят смотром: разворот обязан висеть на событии');
  assert.equal(def.trigger.kind === 'event' ? def.trigger.eventType : '', ZASLONOV_BETRAYAL_EVENT_TYPE);
  assert.equal(def.trigger.kind === 'event' ? def.trigger.tag : '', ZASLONOV_BETRAYAL_EVENT_TAG);
  // Предохранитель камеры обязателен: без него сцена вправе висеть вечно.
  assert.ok(def.maxSeconds > 0, 'у сцены нет потолка проигрывания');
});

test('такты разворота ссылаются на объявленных актёров, и defect идёт до release', () => {
  const def = betrayalScene();
  const declared = new Set(def.actors.map((actor: SceneActorDef) => actor.role));
  for (const beat of def.beats) {
    for (const role of beatRoles(beat)) {
      assert.ok(declared.has(role), `такт ${beat.kind} зовёт необъявленную роль ${role}`);
    }
  }

  const defectAt = def.beats.findIndex(beat => beat.kind === 'defect');
  const releaseAt = def.beats.findIndex(beat => beat.kind === 'release');
  assert.ok(defectAt >= 0, 'в сцене предательства нет такта смены стороны');
  assert.ok(releaseAt >= 0, 'без `release` перебежчики останутся декорацией и стрелять не станут');
  assert.ok(defectAt < releaseAt, 'порядок обязателен: `defect` до `release`');

  const defect = def.beats[defectAt];
  assert.equal(defect.kind === 'defect' ? defect.faction : -1, Faction.CULTIST);
  assert.ok(defect.kind === 'defect' && (defect.playerRelation ?? 0) < 0,
    'личное отношение к игроку обязано стать враждебным');

  /* Исхода сцена не назначает: убийство генерала — обычный бой, а не такт.
   * `awaitDeath` тут был бы ожиданием собственной развязки. */
  assert.ok(!def.beats.some(beat => beat.kind === 'awaitDeath'),
    'сцена не имеет права ждать чьей-либо смерти: исход ей не принадлежит');

  // И не цепляется за номер шага цепочки: цепочку собираются переставлять.
  const source = readFileSync(SCENE_SOURCE, 'utf8');
  assert.ok(!source.includes('plotStepIndex'), 'сцена читает номер шага цепочки');
  assert.ok(!source.includes('PLOT_CHAIN'), 'сцена индексирует цепочку напрямую');
  assert.ok(source.includes(ZASLONOV_BETRAYAL_EVENT_TAG), 'сцена обязана цепляться за тег события');
});

test('разворот ждёт своего события, а дождавшись — меняет сторону навсегда', () => {
  const stage = stageMinistry();
  assert.ok(GENERAL_SLOT !== undefined, 'у генерала нет слота личности');
  assert.equal(stage.general.alifeId, GENERAL_SLOT, 'тело генерала обязано нести слот своей личности');
  assert.equal(stage.general.faction, Faction.LIQUIDATOR, 'анкета пакета: генерал рождается ликвидатором');
  assert.equal(getAlifeNpcRecordSnapshot(stage.state, GENERAL_SLOT!)?.faction, Faction.LIQUIDATOR);

  playThroughParade(stage);

  // Смотр отыгран, событие не публиковалось: подниматься нечему.
  for (let f = 0; f < 60; f++) tick(stage);
  assert.equal(isFloorSceneActive(), false, 'событийная сцена поднялась без события');

  /* То самое событие, которым сюжетный шаг объявляет разворот. Публикуется оно
   * закрытием обычного квеста, поэтому и тип обычный: тег несёт содержание. */
  publishEvent(stage.state, {
    type: ZASLONOV_BETRAYAL_EVENT_TYPE,
    severity: 4,
    privacy: 'public',
    tags: ['quest', 'completed', ZASLONOV_BETRAYAL_EVENT_TAG, 'ministry'],
  });

  tick(stage);
  assert.equal(activeFloorSceneId(), MINISTRY_BETRAYAL_SCENE_ID, 'событие не подняло сцену разворота');
  assert.equal(stage.general.cinematicState?.sceneId, MINISTRY_BETRAYAL_SCENE_ID,
    'генерал не взят сценой: роль осталась пустой, и говорить некому');

  const guards = stage.entities.filter(e =>
    e.type === EntityType.NPC && e.id !== stage.player.id && e.id !== stage.general.id);
  assert.ok(guards.length >= 4, `охранение поставлено наполовину: ${guards.length}`);

  // Докрутить до такта смены стороны.
  let frames = 0;
  while (frames < MAX_FRAMES && stage.general.faction !== Faction.CULTIST) {
    tick(stage);
    frames++;
  }
  assert.equal(stage.general.faction, Faction.CULTIST, 'генерал так и не перешёл к культистам');
  assert.equal(stage.general.alive, true, 'предательство не убивает: убивать будет игрок');
  assert.ok((stage.general.playerRelation ?? 0) < 0, 'личное отношение к игроку обязано испортиться');
  assert.equal(stage.general.ai?.combatTargetId, undefined, 'кэш прошлой цели обязан быть сброшен');
  assert.ok(guards.every(guard => guard.faction === Faction.CULTIST),
    'охранение уходит вместе с генералом: они его люди');

  /* Постоянный факт: сторона переписана в самой личности, а не только в теле. */
  assert.equal(getAlifeNpcFactionOverride(stage.state, GENERAL_SLOT!), Faction.CULTIST,
    'разворот не сохранён: генерал вернётся своим при первом же выходе с этажа');
  assert.equal(getAlifeNpcRecordSnapshot(stage.state, GENERAL_SLOT!)?.faction, Faction.CULTIST);

  // И перебежчики отпущены в живой мир: иначе никакого боя не будет.
  for (let f = 0; f < 240 && stage.general.role === NpcRole.CINEMATIC_ACTOR; f++) tick(stage);
  assert.notEqual(stage.general.role, NpcRole.CINEMATIC_ACTOR,
    'после `release` роль сцены обязана быть снята, иначе генерал не станет драться');

  /* Этаж собран заново: тело генерала приходит из анкеты пакета СТАРОЙ стороной,
   * и починить его обязан проход материализации A-Life. */
  const reborn = plotNpcEntityFromPackage(970_001, PARADE_GENERAL_ID, ANCHOR_CX - 6, ANCHOR_CY + 6)!;
  assert.equal(reborn.faction, Faction.LIQUIDATOR, 'анкета пакета не менялась — и не должна');
  const rebuilt: Entity[] = [reborn];
  materializeAlifeFloorPopulation(stage.state, buildHall(), rebuilt, { v: 990_000 }, MINISTRY_FLOOR_KEY);
  assert.equal(rebuilt.find(e => e.alifeId === GENERAL_SLOT)?.faction, Faction.CULTIST,
    'перегенерация этажа вернула генералу анкетную сторону: разворот забыт');

  resetFloorScenes(stage.state, stage.entities);
});
