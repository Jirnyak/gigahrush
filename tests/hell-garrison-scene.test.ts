/* Замок на сцену «Гарнизон входит в Ад» — первая в игре сцена с СОБЫТИЙНЫМ
 * триггером. Механизм триггера существовал, но применений у него не было, и
 * потому здесь проверяется не только контент, но и то, что событие вообще
 * поднимает сцену.
 *
 * Проверяется:
 *   — сцена зарегистрирована и объявляет ключ этажа Ада;
 *   — триггер цепляется за СОДЕРЖАНИЕ события прибытия, а не за номер шага
 *     цепочки: цепочку собираются переставлять, и индексы поедут;
 *   — комната-якорь находится в СГЕНЕРИРОВАННОМ Аду точным сравнением `defId` —
 *     тем же, которым её ищут проигрыватель сцен и скриптовое прибытие;
 *   — публикация события прибытия поднимает сцену и ставит её каст;
 *   — все роли, на которые ссылаются такты, объявлены среди актёров.
 *
 * Чего здесь намеренно НЕТ: исхода боя. Сцене он не принадлежит (`cutscene.md`,
 * главное правило) — она лишь сводит ликвидаторов и тварей, дальше решают
 * стволы. И нет требования, чтобы удержание зависело от сцены: шаг цепочки
 * закрывается сам, сцена показывает его последствие.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../src/content';
import { EntityType, type Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { designNpcFloorKey } from '../src/data/plot';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { HELL_ANCHOR_ZONE_ALIAS } from '../src/gen/hell/plot_chain';
import {
  HELL_GARRISON_ENTRY_EVENT_TAG,
  HELL_GARRISON_ENTRY_EVENT_TYPE,
  HELL_GARRISON_ENTRY_SCENE_ID,
} from '../src/gen/hell/garrison_entry';
import { createRuntimeCamera } from '../src/systems/camera';
import {
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
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const HELL_Z = -36;
const HELL_FLOOR_KEY = designNpcFloorKey('hell');
const FRAME = 1 / 60;
const SCENE_SOURCE = 'src/gen/hell/garrison_entry.ts';
/** Пакет майора: сцена зовёт уже высаженного лифтом человека, а не создаёт своего. */
const MAJOR_PACKAGE_ID = 'major_grom';

function scene() {
  const def = floorSceneById(HELL_GARRISON_ENTRY_SCENE_ID);
  assert.ok(def, 'сцена входа гарнизона не зарегистрирована');
  return def!;
}

/** Роли, на которые ссылается точка кадра. Место и говоривший ролей не называют. */
function spotRole(spot: SceneSpot): string | undefined {
  return 'role' in spot ? spot.role : undefined;
}

/**
 * Свежесгенерированный Ад стоит РОВНО НА МЯГКОМ ПРЕДЕЛЕ акторов: замерено 19
 * человек и 4077 тварей при пределе 4096 (для сравнения — коллекторы 1769,
 * министерство 2101). Слотов на спавн там ноль, и `entitySpawnSlots` молча
 * отдаёт пустой список.
 *
 * Сцена играется НЕ на свежем этаже: перед ней игрок пять минут держал зону и
 * выбил вокруг себя не один десяток тварей. Прогон это и воспроизводит — снимает
 * с этажа дальних тварей, освобождая слоты ровно так, как их освобождает бой.
 * Без этого шага замок проверял бы не сцену, а плотность населения Ада.
 */
function freeActorSlotsAfterHoldout(entities: Entity[]): void {
  let freed = 0;
  for (let i = entities.length - 1; i >= 0 && freed < 128; i--) {
    if (entities[i].type !== EntityType.MONSTER) continue;
    entities.splice(i, 1);
    freed++;
  }
  assert.ok(freed > 0, 'на Аду не нашлось тварей: прогон опирается не на тот этаж');
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

test('сцена входа гарнизона объявлена на Аду и висит на событии, а не на номере шага', () => {
  const def = scene();
  assert.equal(def.floorKey, HELL_FLOOR_KEY, 'сцена обязана принадлежать этажу Ада');
  assert.equal(def.anchorRoomAlias, HELL_ANCHOR_ZONE_ALIAS);
  assert.equal(def.trigger.kind, 'event', 'триггер обязан быть событийным: первый визит на Ад уже прошёл');
  assert.equal(def.trigger.kind === 'event' ? def.trigger.eventType : '', HELL_GARRISON_ENTRY_EVENT_TYPE);
  assert.equal(def.trigger.kind === 'event' ? def.trigger.tag : '', HELL_GARRISON_ENTRY_EVENT_TAG);
  // Предохранитель камеры обязателен: без него сцена вправе висеть вечно.
  assert.ok(def.maxSeconds > 0, 'у сцены нет потолка проигрывания');
});

test('такты сцены ссылаются только на объявленных актёров', () => {
  const def = scene();
  const declared = new Set(def.actors.map((actor: SceneActorDef) => actor.role));
  for (const beat of def.beats) {
    for (const role of beatRoles(beat)) {
      assert.ok(declared.has(role), `такт ${beat.kind} зовёт необъявленную роль ${role}`);
    }
  }
  // Отложенная роль обязана быть воплощена тактом, иначе она мёртвые данные.
  for (const actor of def.actors) {
    if (!actor.deferred) continue;
    assert.ok(
      def.beats.some(beat => beat.kind === 'materialize' && beat.role === actor.role),
      `отложенная роль ${actor.role} не воплощается ни одним тактом`);
  }
});

test('сцена не цепляется за номер шага сюжетной цепочки', () => {
  /* Главная цепочка будет переставлена, и числовые индексы шагов поедут вместе с
   * ней. Сцена обязана опираться на тег события, который переживёт перестановку. */
  const source = readFileSync(SCENE_SOURCE, 'utf8');
  assert.ok(!source.includes('plotStepIndex'), 'сцена читает номер шага цепочки');
  assert.ok(!source.includes('PLOT_CHAIN'), 'сцена индексирует цепочку напрямую');
  assert.ok(source.includes(HELL_GARRISON_ENTRY_EVENT_TAG), 'сцена обязана цепляться за тег события');
});

test('событие прибытия поднимает сцену на живом Аду и ставит каст', () => {
  seedGlobalRng(0xa11d + 7);
  initFactionRelations();
  const gen = generateFloor(HELL_Z, 61_061);
  const world = gen.world;

  // Якорь ищется ТОЧНЫМ сравнением `defId` — так его ищут и проигрыватель сцен,
  // и скриптовое прибытие. Запасной ветки по имени у них нет.
  const anchor = world.rooms.find(room => room?.defId === HELL_ANCHOR_ZONE_ALIAS);
  assert.ok(anchor, 'в сгенерированном Аду нет комнаты-якоря с объявленным defId');

  const player = makeTestPlayer({ x: anchor!.x + anchor!.w / 2, y: anchor!.y + anchor!.h / 2, angle: 0 });
  /* Майора на этаж привозит скриптовое прибытие, и сцена зовёт именно его. Здесь
   * он ставится руками ровно тем же признаком — пакетом: без него роль командира
   * осталась бы пустой и сцена лишилась бы голоса. */
  const major = makeTestNpc({
    id: 900_001,
    x: player.x + 1,
    y: player.y + 1,
    name: 'Майор Громный',
  }) as Entity & { npcPackageId?: string };
  major.npcPackageId = MAJOR_PACKAGE_ID;

  const entities: Entity[] = [player, major, ...gen.entities];
  freeActorSlotsAfterHoldout(entities);
  const state = makeGameState({ currentZ: HELL_Z });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, 0);

  bindSceneCamera(createRuntimeCamera());
  resetFloorScenes();

  const before = new Set(entities.map(e => e.id));
  const nextEntityId = { v: 950_000 };
  const tick = () => {
    state.time += FRAME;
    state.tick++;
    updateContentRuntimeHooks({
      world, entities, player, state,
      nextEntityId, dt: FRAME, phase: 'floor_activity', gameOver: false,
    });
  };

  // Кадр до события: сцена событийная, сама по себе подниматься не должна.
  tick();
  assert.equal(isFloorSceneActive(), false, 'событийная сцена поднялась без события');

  // То самое событие, которым скриптовое прибытие объявляет высадку группы.
  publishEvent(state, {
    type: HELL_GARRISON_ENTRY_EVENT_TYPE,
    severity: 4,
    privacy: 'public',
    tags: ['scripted_arrival', 'alife_migration', HELL_GARRISON_ENTRY_EVENT_TAG, 'liquidator'],
  });

  tick();
  assert.equal(isFloorSceneActive(), true, 'событие прибытия не подняло сцену');

  // Каст поставлен: штурмовая группа воплощена, командир найден по пакету.
  const spawned = entities.filter(e => !before.has(e.id) && e.type === EntityType.NPC);
  assert.ok(spawned.length >= 12, `штурмовая группа поставлена наполовину: ${spawned.length}`);
  assert.equal(major.cinematicState?.sceneId, HELL_GARRISON_ENTRY_SCENE_ID,
    'майор не взят сценой: роль командира осталась пустой');

  resetFloorScenes(state, entities);
});
