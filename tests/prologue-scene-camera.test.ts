/* Замок на плавность кадра — прогоном ВСЕЙ сцены пролога на живом этаже.
 *
 * Отдельные такты по одному ничего не доказывают: рвётся кадр на переходах между
 * ними и на длинных облётах, где геометрия меняется под лучом. Поэтому сцена
 * играется целиком, а мерятся два числа за каждый кадр.
 *
 * ПЕРЕСКОК ПОЗИЦИИ. Три источника уже были найдены и закрыты: узел за преградой
 * промотывал ломаную и кадр переносился в цель силой; облёт вокруг прижатого к
 * стене человека ставил кадр в самих актёров, то есть прыжком на весь радиус;
 * а обрез радиуса по стене падал с шести клеток до четверти за один кадр.
 *
 * СКОРОСТЬ РАЗВОРОТА. Смена субъекта разворачивала взгляд на сто пятьдесят
 * градусов одной экспонентой — девятьсот градусов в секунду в первом же кадре,
 * то есть хлыст вместо панорамы.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { seedGlobalRng } from '../src/core/rand';
import { initFactionRelations } from '../src/data/relations';
import { generateFloor } from '../src/gen/floor_manifest';
import { PROLOGUE_SCENE_ID } from '../src/gen/living/prologue_hall';
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

const FRAME = 1 / 60;
/* Самый быстрый ход сцены — обратный пролёт (`SCENE_RETURN_FLY_SPEED`), плюс
 * четверть на округления. Всё, что больше, ходом уже не объяснить. */
const MAX_STEP_PER_FRAME = (26 * FRAME) * 1.25;
/* Потолок разворота в камере — 2 рад/с. Проверяем с небольшим запасом. */
const MAX_TURN_DEG_PER_SEC = 130;
/* Потолок сцены 210 с плюс обратный пролёт; берём с запасом и обрываем по факту. */
const MAX_FRAMES = 60 * 260;

test('the whole prologue plays without a single camera teleport or whip-pan', () => {
  seedGlobalRng(0x51eed);
  initFactionRelations();
  const gen = generateFloor(0, 61_061, true);
  const world = gen.world;
  const player = makeTestPlayer({ x: gen.spawnX, y: gen.spawnY, angle: 0 });
  const entities = [player, ...gen.entities];
  const state = makeGameState({ currentZ: 0 });
  state.tutorialMode = true;
  setCurrentPlayerEntity(player);
  rebuildEntityIndexForSimulation(entities, world);

  const camera = createRuntimeCamera();
  bindSceneCamera(camera);
  resetFloorScenes();
  assert.equal(requestFloorScene(PROLOGUE_SCENE_ID), true, 'сцена пролога обязана быть в реестре');

  const nextEntityId = { v: 900_000 };
  let prevX = -1;
  let prevY = -1;
  let prevAngle = 0;
  let worstStep = 0;
  let worstStepFrame = -1;
  let worstTurn = 0;
  let worstTurnFrame = -1;
  let frames = 0;
  let started = false;

  for (let f = 0; f < MAX_FRAMES; f++) {
    state.time += FRAME;
    state.tick++;
    updateContentRuntimeHooks({
      world, entities, player, state, nextEntityId, dt: FRAME,
      phase: 'floor_activity', gameOver: false,
    });
    // Камеру двигает игровой цикл, а не хуки сцены: без этого шага кадр стоит на
    // месте, и любая проверка плавности проходит впустую.
    updateRuntimeCamera(camera, world, FRAME, player);
    frames = f;

    if (isFloorSceneActive()) started = true;
    if (camera.mode !== 'cinematic') {
      if (started && !isFloorSceneActive()) break;
      continue;
    }

    const view = runtimeCameraView(camera, player);
    if (prevX >= 0) {
      const step = Math.hypot(world.delta(prevX, view.x), world.delta(prevY, view.y));
      if (step > worstStep) { worstStep = step; worstStepFrame = f; }
      let turned = view.angle - prevAngle;
      while (turned > Math.PI) turned -= Math.PI * 2;
      while (turned < -Math.PI) turned += Math.PI * 2;
      const turnRate = Math.abs(turned) * 180 / Math.PI / FRAME;
      if (turnRate > worstTurn) { worstTurn = turnRate; worstTurnFrame = f; }
    }
    prevX = view.x;
    prevY = view.y;
    prevAngle = view.angle;
  }

  assert.equal(started, true, 'сцена так и не поднялась');
  assert.equal(isFloorSceneActive(), false, `сцена не закончилась за ${(frames / 60).toFixed(0)}с`);
  assert.ok(
    worstStep <= MAX_STEP_PER_FRAME,
    `перескок ${worstStep.toFixed(2)} клетки за кадр на ${(worstStepFrame / 60).toFixed(1)}с `
      + `(ходом объяснимо не больше ${MAX_STEP_PER_FRAME.toFixed(2)})`,
  );
  assert.ok(
    worstTurn <= MAX_TURN_DEG_PER_SEC,
    `разворот ${worstTurn.toFixed(0)}°/с на ${(worstTurnFrame / 60).toFixed(1)}с — это хлыст, а не панорама`,
  );
  resetFloorScenes();
});
