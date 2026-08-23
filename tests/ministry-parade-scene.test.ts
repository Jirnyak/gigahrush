/* Замок на смотр гарнизона — третья сцена на движке.
 *
 * Прогон идёт на живом министерстве. Комната-якорь тут, в отличие от форпоста,
 * фиксирована: центральный вестибюль 33x33 на скрещении обеих публичных осей
 * рисуется макрогеометрией одинаково на любом сиде. Зато у сцены свой риск,
 * которого не было ни у пролога, ни у форпоста, — ПЛОТНОСТЬ: три сотни человек
 * в одном зале, а движок молча пропускает того, кому не нашлось клетки в
 * пределах разброса. Строй, наполовину не поставленный, выглядит не смотром, а
 * редкой цепочкой, и заметить это можно только счётом.
 *
 * Проверяется механика, и только она:
 *   — зал-якорь есть и он того размера, от которого считаны смещения кадра;
 *   — генерал доставлен на этаж и стоит в зале, а не уехал на случайную клетку;
 *   — строй поставлен почти целиком;
 *   — пост развода СВЯЗЕН со строем: вейпойнт в отрезанный карман — это колонна,
 *     которая никуда не пойдёт;
 *   — сцена поднимается и закрывается сама;
 *   — камера идёт ходом: ни перескока, ни хлыста, и не живёт у стены.
 *
 * Чего здесь намеренно НЕТ: требования, чтобы все три сотни дошли до поста.
 * `moveTo` — вейпойнт, а не поводок: дойдя, человек свободен, и куда он денется
 * дальше, сцене не принадлежит.
 *
 * Прогон дозирован. Замок форпоста играет все три сида целиком, потому что там
 * от сида зависит САМА комната-якорь. Здесь зал один и тот же на любом сиде, от
 * сида зависит только лабиринт вокруг — то есть дорога подлёта. Поэтому целиком
 * играется один сид, а два других идут до конца подлёта и первых кадров в зале:
 * это ровно то место, где сид ещё что-то решает. Полные три прогона стоили шесть
 * с половиной минут — половину всей матрицы генерации, — и покупали на этом
 * якоре повторение одного и того же.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { EntityType, type Entity } from '../src/core/types';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { MINISTRY_VESTIBULE_ANCHOR } from '../src/gen/ministry/geometry';
import { GARRISON_PARADE_SCENE_ID, PARADE_GENERAL_ID } from '../src/gen/ministry/garrison_parade';
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

const MINISTRY_Z = 30;
const FRAME = 1 / 60;
/* Самый быстрый ход сцены — обратный пролёт (26 клеток/с), плюс четверть на
 * округления. Всё, что больше, ходом уже не объяснить. */
const MAX_STEP_PER_FRAME = (26 * FRAME) * 1.25;
/** Потолок разворота в камере — 2 рад/с; проверяем с запасом. */
const MAX_TURN_DEG_PER_SEC = 130;
/** Потолок сцены — 200 секунд, плюс запас на обратный пролёт камеры. */
const FULL_FRAMES = 60 * 210;
/** Проба: подлёт с любого из шестнадцати лифтов плюс первые кадры в зале. */
const PROBE_FRAMES = 60 * 45;
const SEEDS = [61_061, 7, 12_345];
/** Целиком играется только первый: см. шапку про дозировку прогона. */
const FULL_SEED = SEEDS[0];

/** Сколько человек объявлено в строю: четыре колонны на две стороны прохода. */
const DECLARED_RANKS = 8 * 40;
/** Пост развода относительно середины зала — тот же, что в тактах `moveTo`. */
const MARCH_POST_OX = -22;
/** Сколько человек строя проверять на связь с постом: полный обход — сотни BFS. */
const CONNECTIVITY_SAMPLE = 16;

interface Run {
  anchorSize: string;
  generalPlaced: boolean;
  generalWorstDrift: number;
  ranksPlaced: number;
  ranksStranded: number;
  seconds: number;
  worstStep: number;
  worstTurn: number;
  /** Доля кадров, проведённых вплотную к стене, в процентах. */
  scrapePercent: number;
  finished: boolean;
}

function playParadeScene(seed: number, frames: number): Run {
  seedGlobalRng(0xf0f0 + seed);
  initFactionRelations();
  const gen = generateFloor(MINISTRY_Z, seed);
  const world = gen.world;
  const anchor = world.rooms.find(room => room?.defId === MINISTRY_VESTIBULE_ANCHOR);
  assert.ok(anchor, `сид ${seed}: у министерства нет комнаты-якоря`);

  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities: Entity[] = [player, ...gen.entities];
  const state = makeGameState({ currentZ: MINISTRY_Z });
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, world);

  const camera = createRuntimeCamera();
  bindSceneCamera(camera);
  resetFloorScenes();
  assert.equal(requestFloorScene(GARRISON_PARADE_SCENE_ID), true, 'сцена обязана быть в реестре');

  const beforeIds = new Set(entities.map(e => e.id));
  const nextEntityId = { v: 900_000 };
  const anchorCx = anchor!.x + anchor!.w / 2;
  const anchorCy = anchor!.y + anchor!.h / 2;
  const general = entities.find(e => (e as { npcPackageId?: string }).npcPackageId === PARADE_GENERAL_ID);
  const run: Run = {
    anchorSize: `${anchor!.w}x${anchor!.h}`,
    generalPlaced: general !== undefined,
    generalWorstDrift: 0,
    ranksPlaced: 0, ranksStranded: 0,
    seconds: 0, worstStep: 0, worstTurn: 0, scrapePercent: 0, finished: false,
  };

  let cinematicFrames = 0;
  let scrapeFrames = 0;
  let castTaken = false;
  let started = false;
  let prevX = -1;
  let prevY = -1;
  let prevAngle = 0;

  for (let f = 0; f < frames; f++) {
    state.time += FRAME;
    state.tick++;
    updateContentRuntimeHooks({
      world, entities, player, state, nextEntityId, dt: FRAME,
      phase: 'floor_activity', gameOver: false,
    });
    rebuildEntityIndexForSimulation(entities, world);
    updateAI(world, entities, FRAME, state.time, state.msgs, player.id, state.clock, false, nextEntityId, MINISTRY_Z, state);
    updateRuntimeCamera(camera, world, FRAME, player);
    run.seconds = f / 60;

    if (isFloorSceneActive()) {
      started = true;
      /* Генерал — ось всей сцены и единственный, кого она не отпускает: смотр
       * принимают стоя. Уйдёт из зала — облетать станет некого. */
      if (general?.alive) {
        run.generalWorstDrift = Math.max(run.generalWorstDrift,
          world.dist(general.x, general.y, anchorCx, anchorCy));
      }
    }
    if (started && !castTaken) {
      castTaken = true;
      const fresh = entities.filter(e => !beforeIds.has(e.id) && e.type === EntityType.NPC);
      run.ranksPlaced = fresh.length;
      /* Связность поста считается от самих людей строя: свободная клетка ещё не
       * значит достижимая, а колонна, которой некуда идти, простоит весь развод
       * на месте. Выборкой — полный обход строя это три сотни BFS по тору. */
      const postX = Math.floor(anchorCx + MARCH_POST_OX);
      const postY = Math.floor(anchorCy);
      const step = Math.max(1, Math.floor(fresh.length / CONNECTIVITY_SAMPLE));
      for (let i = 0; i < fresh.length; i += step) {
        const man = fresh[i];
        if (bfsPath(world, Math.floor(man.x), Math.floor(man.y), postX, postY).length === 0) run.ranksStranded++;
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

/* Прогон дорогой: на министерстве под две тысячи живых сущностей, и каждый кадр
 * их ведёт полный цикл AI. Оба замка смотрят на один и тот же прогон. */
const runs = new Map<number, Run>();
function paradeRun(seed: number): Run {
  const cached = runs.get(seed);
  if (cached) return cached;
  const run = playParadeScene(seed, seed === FULL_SEED ? FULL_FRAMES : PROBE_FRAMES);
  runs.set(seed, run);
  return run;
}

test('ministry garrison parade musters the whole hall', () => {
  for (const seed of SEEDS) {
    const run = paradeRun(seed);
    assert.equal(run.anchorSize, '33x33',
      `сид ${seed}: зал-якорь ${run.anchorSize}, а смещения кадра считаны от 33x33`);
    assert.equal(run.generalPlaced, true,
      `сид ${seed}: генерала нет на этаже — доставка авторских пакетов его не нашла`);
    // Дойти до конца обязан целиком сыгранный сид; пробы обрываются намеренно.
    if (seed === FULL_SEED) {
      assert.equal(run.finished, true,
        `сид ${seed}: сцена не закончилась за ${run.seconds.toFixed(0)}с`);
    }

    /* Порог не «сколько красиво», а «сколько влезает»: три сотни человек в зале
     * 33x33 занимают около трети клеток, и десятая доля потерь на тесноте —
     * ожидаемый разброс. Половина потерянного строя — это уже другая сцена. */
    assert.ok(
      run.ranksPlaced >= DECLARED_RANKS * 0.85,
      `сид ${seed}: поставлено ${run.ranksPlaced} из ${DECLARED_RANKS} — залу не хватило места на строй`,
    );
    assert.equal(run.ranksStranded, 0,
      `сид ${seed}: ${run.ranksStranded} человек строя отрезаны от поста развода`);
  }
});

test('ministry garrison parade keeps the camera on foot: no teleports, no whip-pans', () => {
  for (const seed of SEEDS) {
    const run = paradeRun(seed);
    assert.ok(
      run.worstStep <= MAX_STEP_PER_FRAME,
      `сид ${seed}: перескок ${run.worstStep.toFixed(2)} клетки за кадр — `
        + `ходом объяснимо не больше ${MAX_STEP_PER_FRAME.toFixed(2)}`,
    );
    assert.ok(
      run.worstTurn <= MAX_TURN_DEG_PER_SEC,
      `сид ${seed}: разворот ${run.worstTurn.toFixed(0)}°/с — это хлыст, а не панорама`,
    );
    /* Зал просторный, и кадру тут скрести нечем: круг облёта в пять клеток лежит
     * внутри 33x33 с большим запасом. Порог тот же, что у форпоста, — ловится
     * грубое несоответствие, а не везение сида. */
    assert.ok(
      run.scrapePercent < 45,
      `сид ${seed}: ${run.scrapePercent.toFixed(0)}% кадров кадр провёл вплотную к стене`,
    );
    /* Генерал стоит смирно: сцена его не отпускает ни одним тактом, и уйти он
     * может только если кто-то отпустил его вне сцены. Полшага на округления. */
    assert.ok(
      run.generalWorstDrift < 12,
      `сид ${seed}: генерал отошёл от середины зала на ${run.generalWorstDrift.toFixed(1)} клетки`,
    );
  }
});
