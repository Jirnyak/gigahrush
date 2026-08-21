/* Замок на сцену обороны форпоста — вторая сцена на движке, и потому проверка
 * самого движка не меньше, чем контента.
 *
 * Прогон идёт целиком на живом этаже коллекторов и на трёх сидах: комната-якорь
 * там не фиксирована — генератор форпоста либо рвёт девять на семь, либо занимает
 * готовую не меньше пяти на пять. Именно из-за этого сцена и ловила перескок
 * камеры: смещения точек кадра, верные для зала пролога, у малой комнаты лежат в
 * бетоне, и кадр вырождался в вынужденный перенос.
 *
 * Проверяется механика, и только она:
 *   — сцена поднимается и закрывается сама;
 *   — камера идёт ходом: ни перескока, ни хлыста;
 *   — обе волны ДОСТИЖИМЫ от форпоста: свободная клетка ещё не значит связная, а
 *     монстр в замурованном кармане не придёт ни к кому и ни от кого не погибнет;
 *   — вторая волна приходит.
 *
 * Чего здесь намеренно НЕТ: требования, чтобы взвод непременно добил первую волну.
 * Исход боя сцене не принадлежит (`cutscene.md`, главное правило), и на части
 * сидов взвод несёт тяжёлые потери. Темп держит `awaitDeath` со своим таймаутом,
 * а не гарантия победы.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, type Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { FORPOST_ANCHOR } from '../src/gen/maintenance/forpost';
import { FORPOST_DEFENSE_SCENE_ID } from '../src/gen/maintenance/forpost_defense';
import { updateAI } from '../src/systems/ai';
import { bfsPath } from '../src/systems/ai/pathfinding';
import {
  createRuntimeCamera,
  runtimeCameraView,
  updateRuntimeCamera,
} from '../src/systems/camera';
import {
  bindSceneCamera,
  isFloorSceneActive,
  requestFloorScene,
  resetFloorScenes,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestPlayer } from './helpers';

const MAINTENANCE_Z = -26;
const FRAME = 1 / 60;
/* Самый быстрый ход сцены — обратный пролёт (26 клеток/с), плюс четверть на
 * округления. Всё, что больше, ходом уже не объяснить. */
const MAX_STEP_PER_FRAME = (26 * FRAME) * 1.25;
/** Потолок разворота в камере — 2 рад/с; проверяем с запасом. */
const MAX_TURN_DEG_PER_SEC = 130;
const MAX_FRAMES = 60 * 170;
const SEEDS = [61_061, 7, 12_345];

interface Run {
  anchorSize: string;
  wave1: number;
  wave1Stranded: number;
  wave2: number;
  wave2Stranded: number;
  wave2At: number;
  seconds: number;
  worstStep: number;
  worstTurn: number;
  /** Доля кадров, проведённых вплотную к стене, в процентах. */
  scrapePercent: number;
  /** Худшее удаление майора от середины зала за сцену, в клетках. */
  majorWorstDrift: number;
  finished: boolean;
}

function playForpostScene(seed: number): Run {
  seedGlobalRng(0xf0f0 + seed);
  initFactionRelations();
  const gen = generateFloor(MAINTENANCE_Z, seed);
  const world = gen.world;
  const anchor = world.rooms.find(room => room?.defId === FORPOST_ANCHOR);
  assert.ok(anchor, `сид ${seed}: у форпоста нет комнаты-якоря`);

  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: MAINTENANCE_Z });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, world);

  const camera = createRuntimeCamera();
  bindSceneCamera(camera);
  resetFloorScenes();
  assert.equal(requestFloorScene(FORPOST_DEFENSE_SCENE_ID), true, 'сцена обязана быть в реестре');

  const beforeIds = new Set(entities.map(e => e.id));
  const nextEntityId = { v: 900_000 };
  const run: Run = {
    anchorSize: `${anchor!.w}x${anchor!.h}`,
    wave1: 0, wave1Stranded: 0, wave2: 0, wave2Stranded: 0, wave2At: -1,
    seconds: 0, worstStep: 0, worstTurn: 0, scrapePercent: 0, majorWorstDrift: 0, finished: false,
  };
  const anchorCx = anchor!.x + anchor!.w / 2;
  const anchorCy = anchor!.y + anchor!.h / 2;
  const major = entities.find(e => (e as { npcPackageId?: string }).npcPackageId === 'major_grom');
  let cinematicFrames = 0;
  let scrapeFrames = 0;
  // Мерить связность до центра комнаты нельзя: там стоит обстановка, и путей до
  // неё нет ни у кого — у форпоста в самом центре лампа, на которой стоит и сам
  // майор. Опора — сами защитники: до них твари и должны дойти.
  let defenders: Entity[] = [];
  const stranded = (e: Entity): boolean => {
    if (!defenders.length) return false;
    return !defenders.some(d =>
      bfsPath(world, Math.floor(e.x), Math.floor(e.y), Math.floor(d.x), Math.floor(d.y)).length > 0);
  };

  let wave1Ids: number[] = [];
  let castTaken = false;
  let started = false;
  let prevX = -1;
  let prevY = -1;
  let prevAngle = 0;

  for (let f = 0; f < MAX_FRAMES; f++) {
    state.time += FRAME;
    state.tick++;
    updateContentRuntimeHooks({
      world, entities, player, state, nextEntityId, dt: FRAME,
      phase: 'floor_activity', gameOver: false,
    });
    // Бой и камеру двигает игровой цикл, а не хуки сцены. Без этих двух шагов
    // сцена «играет» в пустоту: никто не дерётся и кадр стоит на месте.
    rebuildEntityIndexForSimulation(entities, world);
    updateAI(world, entities, FRAME, state.time, state.msgs, player.id, state.clock, false, nextEntityId, MAINTENANCE_Z, state);
    updateRuntimeCamera(camera, world, FRAME, player);
    run.seconds = f / 60;

    if (isFloorSceneActive()) {
      started = true;
      // Командир — ось всей сцены. Уйдёт из зала, и облетать становится некого.
      if (major?.alive) {
        run.majorWorstDrift = Math.max(run.majorWorstDrift,
          world.dist(major.x, major.y, anchorCx, anchorCy));
      }
    }
    if (started && !castTaken) {
      castTaken = true;
      const fresh = entities.filter(e => !beforeIds.has(e.id));
      defenders = fresh.filter(e => e.type === EntityType.NPC).slice(0, 8);
      const spawnedMonsters = fresh.filter(e => e.type === EntityType.MONSTER);
      wave1Ids = spawnedMonsters.map(e => e.id);
      run.wave1 = wave1Ids.length;
      run.wave1Stranded = spawnedMonsters.filter(stranded).length;
    }
    if (castTaken) {
      if (run.wave2At < 0) {
        const later = entities.filter(e =>
          e.type === EntityType.MONSTER && !beforeIds.has(e.id) && !wave1Ids.includes(e.id));
        if (later.length > 0) {
          run.wave2At = f / 60;
          run.wave2 = later.length;
          run.wave2Stranded = later.filter(stranded).length;
        }
      }
    }

    if (camera.mode === 'cinematic') {
      const view = runtimeCameraView(camera, player);
      if (prevX >= 0) {
        run.worstStep = Math.max(run.worstStep,
          Math.hypot(world.delta(prevX, view.x), world.delta(prevY, view.y)));
        let turned = view.angle - prevAngle;
        while (turned > Math.PI) turned -= Math.PI * 2;
        while (turned < -Math.PI) turned += Math.PI * 2;
        run.worstTurn = Math.max(run.worstTurn, Math.abs(turned) * 180 / Math.PI / FRAME);
      }
      // Кадр «скребёт», когда прижат к стене вплотную — то есть работает зазор.
      // Изредка это нормально, постоянно — значит круг облёта не влезает в комнату.
      cinematicFrames++;
      const fx = view.x - Math.floor(view.x);
      const fy = view.y - Math.floor(view.y);
      const cxCell = Math.floor(view.x);
      const cyCell = Math.floor(view.y);
      if ((fx < 0.36 && world.solid(cxCell - 1, cyCell))
        || (fx > 0.64 && world.solid(cxCell + 1, cyCell))
        || (fy < 0.36 && world.solid(cxCell, cyCell - 1))
        || (fy > 0.64 && world.solid(cxCell, cyCell + 1))) scrapeFrames++;
      prevX = view.x;
      prevY = view.y;
      prevAngle = view.angle;
    }

    if (started && !isFloorSceneActive()) { run.finished = true; break; }
  }

  assert.equal(started, true, `сид ${seed}: сцена так и не поднялась`);
  run.scrapePercent = cinematicFrames ? (scrapeFrames / cinematicFrames) * 100 : 0;
  resetFloorScenes();
  return run;
}

test('forpost defense plays out on the live collectors floor', () => {
  for (const seed of SEEDS) {
    const run = playForpostScene(seed);
    assert.equal(run.finished, true,
      `сид ${seed}: сцена не закончилась за ${run.seconds.toFixed(0)}с (якорь ${run.anchorSize})`);
    assert.ok(run.wave1 > 0, `сид ${seed}: первая волна не поставлена`);
    assert.ok(run.wave2At >= 0, `сид ${seed}: вторая волна так и не пришла`);
    assert.ok(run.wave2 > 0, `сид ${seed}: вторая волна пуста`);

    // Достижимость — механика, и её сцена обязана обеспечить. Посаженный в
    // замурованный карман монстр ни до кого не дойдёт и ни от кого не погибнет,
    // а такт, ждущий его смерти, повиснет до таймаута.
    assert.equal(run.wave1Stranded, 0,
      `сид ${seed} (якорь ${run.anchorSize}): ${run.wave1Stranded} из ${run.wave1} тварей первой волны `
        + 'посажены в отрезанные от форпоста карманы');
    assert.equal(run.wave2Stranded, 0,
      `сид ${seed}: ${run.wave2Stranded} из ${run.wave2} тварей второй волны отрезаны от форпоста`);
  }
});

test('forpost defense keeps the camera on foot: no teleports, no whip-pans', () => {
  for (const seed of SEEDS) {
    const run = playForpostScene(seed);
    assert.ok(
      run.worstStep <= MAX_STEP_PER_FRAME,
      `сид ${seed} (якорь ${run.anchorSize}): перескок ${run.worstStep.toFixed(2)} клетки за кадр — `
        + `ходом объяснимо не больше ${MAX_STEP_PER_FRAME.toFixed(2)}`,
    );
    assert.ok(
      run.worstTurn <= MAX_TURN_DEG_PER_SEC,
      `сид ${seed}: разворот ${run.worstTurn.toFixed(0)}°/с — это хлыст, а не панорама`,
    );
    /* Кадр не должен ЖИТЬ у стены. Форпост тесен: комната порядка тринадцати на
     * семь, а бой уходит в трубы шириной в клетку. Круг облёта обязан помещаться,
     * и облетать надо того, кто стоит на открытом месте, — иначе кадр не облетает,
     * а скребёт по простенку.
     *
     * Порог широкий намеренно. Доля у стены заметно гуляет от прогона к прогону, и
     * узкий порог ловил бы не кадр, а везение: замерено 17% и 30% на разных сидах
     * при одном и том же коде. Ловится грубое несоответствие — круг шире комнаты
     * давал больше сорока. */
    /* Майор держится середины. На нём стоит весь кадр, и общий поводок ему не
     * помощник: он шире самой комнаты. Свой короткий поводок роли возвращает его
     * обратно, снимая на время возврата боевую цель, — иначе бой перебивает курс
     * раньше, чем поводок сработает, и командир уходит, формально оставаясь «на
     * поводке». Замерено: без этого он уходил на пятнадцать клеток и проводил вне
     * зала пятую часть сцены. */
    assert.ok(
      run.majorWorstDrift < 6,
      `сид ${seed} (якорь ${run.anchorSize}): майор отошёл от середины на ${run.majorWorstDrift.toFixed(1)} клетки`,
    );
    assert.ok(
      run.scrapePercent < 45,
      `сид ${seed} (якорь ${run.anchorSize}): ${run.scrapePercent.toFixed(0)}% кадров кадр провёл вплотную к стене`,
    );
  }
});
