/* Замок на бой на арене — сцену-пролог Базы Ликвидаторов.
 *
 * Проверяется механика, и только она (`cutscene.md`, §12: исхода боя в замках
 * сцены быть не должно). Здесь это особенно легко нарушить: соблазн потребовать,
 * чтобы пленного вынесли, — прямое назначение исхода, а он принадлежит стволам.
 *
 * Что держится:
 *   — сцена в реестре, и её этаж — тот самый, что у маршрута Базы;
 *   — арена вырыта, найдена ТОЧНЫМ `defId` и не потеряла тега `arena`, по
 *     которому её ищет дуэльная система;
 *   — весь кадр помещается в комнату: и точки пролётов, и круги облётов;
 *   — все роли резолвятся — каждая объявленная получила живых людей;
 *   — трибуна не вступит в бой: никто из зрителей не враждебен ни одному из
 *     бойцов, а единственный ликвидатор в кадре (распорядитель) стоит дальше,
 *     чем боец видит цель.
 *
 * Прогон один: комната-якорь у этой сцены не зависит от сида вовсе — форт
 * ставит арену ровно в середине этажа, — а от сида зависит только дорога
 * подлёта, и её замок камеры здесь не снимает.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, Faction, type Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { designNpcFloorKey } from '../src/data/plot';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { ARENA_SAND_HALF, ARENA_SIDE, ARENA_STAND_ROW } from '../src/gen/liquidatorbase/fort';
import { LIQUIDATOR_BASE_ARENA_ANCHOR } from '../src/gen/liquidatorbase/rooms';
import {
  ARENA_DUEL_ANNOUNCER_ID,
  ARENA_DUEL_SCENE_ID,
  LIQUIDATOR_BASE_FLOOR_KEY,
} from '../src/gen/liquidatorbase/arena_duel';
import { currentAlifeFloorKey } from '../src/systems/alife';
import { createRuntimeCamera } from '../src/systems/camera';
import {
  bindSceneCamera,
  floorSceneById,
  isFloorSceneActive,
  requestFloorScene,
  resetFloorScenes,
  type SceneSpot,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { areFactionsHostile } from '../src/systems/factions';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestPlayer } from './helpers';

const LIQUIDATOR_BASE_Z = -12;
const SEED = 20_881;
const FRAME = 1 / 60;
/* Потолок подъёма сцены. В норме хватает одного кадра хуков: комната-якорь
 * есть с самого начала, ждать нечего. */
const RAISE_FRAMES = 240;
/**
 * Докуда человек берёт боевую цель — `NPC_COMBAT_RANGE` из `ai/combat.ts`.
 * Константа там приватная, поэтому здесь её копия, и копия эта НАМЕРЕННАЯ:
 * замок обязан упасть, если радиус в бою вырастет, а расстановка сцены нет.
 */
const NPC_COMBAT_RANGE = 8;

/** Роли, объявленные сценой. Пусто хоть у одной — кадр без своего содержимого. */
const DECLARED_ROLES = [
  'marko', 'gladiator', 'prisoner',
  'stand_north', 'stand_south', 'stand_west', 'stand_east',
] as const;

function sceneDef() {
  const def = floorSceneById(ARENA_DUEL_SCENE_ID);
  assert.ok(def, 'сцена боя на арене не зарегистрирована');
  return def!;
}

/** Смещение точки кадра от якоря. Роль и говорящий — люди, они мерятся отдельно. */
function spotOffset(spot: SceneSpot): { ox: number; oy: number } | null {
  return 'ox' in spot ? { ox: spot.ox, oy: spot.oy } : null;
}

test('сцена боя на арене объявлена на своём этаже и держится за вырытую арену', () => {
  const def = sceneDef();
  assert.equal(def.floorKey, LIQUIDATOR_BASE_FLOOR_KEY);
  assert.equal(def.floorKey, designNpcFloorKey('liquidatorbase'));
  assert.equal(def.anchorRoomAlias, LIQUIDATOR_BASE_ARENA_ANCHOR);
  assert.equal(def.trigger.kind, 'first_visit');
  // Потолок обязателен: без него кадр висит у игрока без управления.
  assert.ok(def.maxSeconds > 0 && def.maxSeconds <= 240, `потолок сцены ${def.maxSeconds}`);
});

test('кадр помещается в арену: и точки пролётов, и круги облётов', () => {
  const def = sceneDef();
  /* Мерка `cutscene.md`: круг не больше половины МЕНЬШЕЙ стороны минус клетка.
   * Арена квадратная, так что сторона одна. Точки кадра считаются от середины
   * и обязаны лежать внутри тех же стен. */
  const half = ARENA_SIDE / 2;
  const maxRadius = half - 1;

  let orbits = 0;
  let flies = 0;
  for (const beat of def.beats) {
    if (beat.kind === 'orbit') {
      orbits++;
      assert.ok(beat.radius > 0 && beat.radius <= maxRadius,
        `радиус облёта ${beat.radius} не помещается в арену ${ARENA_SIDE}x${ARENA_SIDE}`);
      const at = spotOffset(beat.around);
      if (at) {
        assert.ok(Math.abs(at.ox) + beat.radius <= maxRadius && Math.abs(at.oy) + beat.radius <= maxRadius,
          `круг вокруг (${at.ox}, ${at.oy}) выходит за стену`);
      }
    }
    if (beat.kind !== 'fly') continue;
    flies++;
    for (const spot of [beat.to, beat.look]) {
      const at = spot ? spotOffset(spot) : null;
      if (!at) continue;
      assert.ok(Math.abs(at.ox) < half && Math.abs(at.oy) < half,
        `точка кадра (${at.ox}, ${at.oy}) лежит в стене`);
    }
  }
  assert.ok(orbits >= 2, 'облёта арены в сцене нет');
  assert.ok(flies >= 2, 'подлёта к арене в сцене нет');
});

test('арена вырыта, ищется по псевдониму и не потеряла тега дуэльной системы', () => {
  seedGlobalRng(0xa5e1 + SEED);
  const gen = generateFloor(LIQUIDATOR_BASE_Z, SEED);
  const anchor = gen.world.rooms.find(room => room?.defId === LIQUIDATOR_BASE_ARENA_ANCHOR);
  assert.ok(anchor, 'у Базы нет комнаты-якоря: сцена не начнётся и визит не засчитается');
  assert.equal(anchor!.w, ARENA_SIDE);
  assert.equal(anchor!.h, ARENA_SIDE);
  // Тег носит `findArenaRoom` в `arena_ladder.ts`; псевдоним его не вытесняет.
  assert.ok(anchor!.tags?.includes('arena'), 'арена потеряла тег `arena`');
  assert.ok(anchor!.tags?.includes(LIQUIDATOR_BASE_ARENA_ANCHOR));
});

test('сцена поднимается, все роли резолвятся, и трибуна в бой не вступит', () => {
  const def = sceneDef();
  seedGlobalRng(0xa5e1 + SEED);
  initFactionRelations();
  const gen = generateFloor(LIQUIDATOR_BASE_Z, SEED);
  const world = gen.world;
  const anchor = world.rooms.find(room => room?.defId === LIQUIDATOR_BASE_ARENA_ANCHOR)!;
  const anchorX = anchor.x + anchor.w / 2;
  const anchorY = anchor.y + anchor.h / 2;

  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: LIQUIDATOR_BASE_Z });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, 0);
  assert.equal(currentAlifeFloorKey(state), LIQUIDATOR_BASE_FLOOR_KEY,
    'прогон стоит не на Базе: сцена ждала бы своего этажа');

  const marko = entities.find(e => (e as { npcPackageId?: string }).npcPackageId === ARENA_DUEL_ANNOUNCER_ID);
  assert.ok(marko, 'распорядитель арены не доставлен на этаж — сцене некому вести бой');

  bindSceneCamera(createRuntimeCamera());
  resetFloorScenes();
  assert.equal(requestFloorScene(ARENA_DUEL_SCENE_ID), true, 'сцена обязана быть в реестре');

  const beforeIds = new Set(entities.map(e => e.id));
  let raised = false;
  for (let frame = 0; frame < RAISE_FRAMES && !raised; frame++) {
    state.time += FRAME;
    state.tick++;
    updateContentRuntimeHooks({
      world, entities, player, state,
      nextEntityId: { v: 900_000 }, dt: FRAME, phase: 'floor_activity', gameOver: false,
    });
    raised = isFloorSceneActive();
  }
  assert.equal(raised, true, 'сцена так и не поднялась');

  /* Состав роли проигрыватель наружу не отдаёт. Зато он оставляет на каждом
   * актёре ПОСТ — клетку, куда роль его поставила, — и по нему роль узнаётся
   * обратно: пост лежит у своего смещения в пределах разброса. Пусто хоть у
   * одной роли — это либо промах смещения в бетон, либо не найденный пакет. */
  const cast = entities.filter(e =>
    e.alive && e.type === EntityType.NPC && e.cinematicState?.sceneId === ARENA_DUEL_SCENE_ID);
  assert.deepEqual(def.actors.map(actor => actor.role), [...DECLARED_ROLES],
    'состав ролей сцены разошёлся с замком');

  let declared = 0;
  let placed = 0;
  for (const actor of def.actors) {
    const postX = anchorX + actor.ox;
    const postY = anchorY + actor.oy;
    // Место ищется расходящейся спиралью в пределах разброса, плюс кучка своего
    // смещения: три клетки запаса поверх разброса покрывают обе выборки.
    const reach = (actor.spread ?? 2) + 3;
    const mine = cast.filter(e => world.dist(e.cinematicState!.postX, e.cinematicState!.postY, postX, postY) <= reach);
    assert.ok(mine.length > 0, `роль "${actor.role}" не поставила никого`);
    declared += actor.packageId ? 1 : (actor.count ?? 0);
    placed += mine.length;
  }
  /* Толпа наполовину пустая ловится ТОЛЬКО счётом: кому не нашлось клетки в
   * пределах разброса, того молча пропускают, без ошибки и без записи. */
  assert.ok(placed >= declared * 0.9,
    `трибуна поставлена не целиком: ${placed} из ${declared}`);

  const byFaction = (faction: Faction) => cast.filter(e => e.faction === faction);
  assert.equal(byFaction(Faction.CULTIST).length, 1, 'пленного на песке ровно один, и он обязан быть');
  assert.ok(cast.some(e => e.id === marko!.id), 'распорядитель не взят сценой');

  /* Двое на песке — внутри ринга и в пределах взгляда друг друга: иначе бой не
   * начнётся вовсе и такт ожидания досидит до своего таймаута. */
  const fighters = cast.filter(e => e.faction === Faction.CULTIST
    || (e.faction === Faction.LIQUIDATOR && e.id !== marko!.id));
  assert.equal(fighters.length, 2, 'на песке обязаны стоять двое');
  for (const man of fighters) {
    assert.ok(Math.abs(world.delta(man.x, anchorX)) <= ARENA_SAND_HALF
      && Math.abs(world.delta(man.y, anchorY)) <= ARENA_SAND_HALF,
      'боец поставлен за столами ринга, а не на песке');
  }
  assert.ok(world.dist(fighters[0].x, fighters[0].y, fighters[1].x, fighters[1].y) <= NPC_COMBAT_RANGE,
    'бойцы разведены дальше, чем берут цель: драки не будет');

  /* Главное свойство расстановки: зритель, враждебный бойцу, дерётся наравне со
   * всеми — цикл AI актёра сцены не пропускает. Значит либо зритель терпит
   * обоих, либо он стоит дальше, чем боец берёт цель. */
  const fighterFactions = [Faction.LIQUIDATOR, Faction.CULTIST];
  const sandReach = ARENA_SAND_HALF + NPC_COMBAT_RANGE;
  for (const watcher of cast) {
    if (fighters.some(man => man.id === watcher.id)) continue;
    const faction = watcher.faction ?? Faction.CITIZEN;
    const feuding = fighterFactions.some(other =>
      areFactionsHostile(faction, other) || areFactionsHostile(other, faction));
    if (!feuding) continue;
    const away = world.dist(watcher.x, watcher.y, anchorX, anchorY);
    assert.ok(away > sandReach,
      `зритель фракции ${Faction[faction]} стоит в ${away.toFixed(1)} клетках от песка и вступит в дуэль`);
  }
  assert.ok(world.dist(marko!.x, marko!.y, anchorX, anchorY) >= ARENA_STAND_ROW - 1,
    'распорядитель стоит на песке, а не у трибуны');

  resetFloorScenes();
});
