import test from 'node:test';
import assert from 'node:assert/strict';
import * as cameraApi from '../src/systems/camera';
import {
  CAMERA_DEATH_FLOOR_HEIGHT,
  CAMERA_STANDING_HEIGHT,
  cinematicCameraArrived,
  createRuntimeCamera,
  moveFreeCamera,
  resetRuntimeCamera,
  runtimeCameraView,
  setFreeCameraFromSubject,
  startCinematicCamera,
  startDeathCamera,
  updateCinematicCamera,
  updateRuntimeCamera,
  type RuntimeCamera,
} from '../src/systems/camera';
import { Cell, DoorState, W } from '../src/core/types';
import { World } from '../src/core/world';
import { makeTestPlayer } from './helpers';

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

function rng(values: readonly number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0.5;
}

test('runtime camera follows the controlled actor by default', () => {
  const camera = createRuntimeCamera();
  const player = makeTestPlayer({ x: 12.5, y: 20.25, angle: 1.2, pitch: -0.2 });
  let view = runtimeCameraView(camera, player, 1.1);

  assert.equal(view.mode, 'player');
  assert.equal(view.x, player.x);
  assert.equal(view.y, player.y);
  assert.equal(view.angle, player.angle);
  assert.equal(view.pitch, player.pitch);
  assert.equal(view.height, CAMERA_STANDING_HEIGHT);
  assert.equal(view.fovRadians, 1.1);

  player.x = 44;
  player.y = 55;
  player.angle = -0.4;
  player.pitch = 0.3;
  view = runtimeCameraView(camera, player, 0.9);

  assert.equal(view.x, 44);
  assert.equal(view.y, 55);
  assert.equal(view.angle, -0.4);
  assert.equal(view.pitch, 0.3);
  assert.equal(view.fovRadians, 0.9);
});

test('runtime player camera adds bounded inertial head bob from real movement', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  const player = makeTestPlayer({ x: 12, y: 20, angle: 1.2, pitch: -0.1, alive: true });

  updateRuntimeCamera(camera, world, 1 / 60, player);
  for (let i = 0; i < 10; i++) {
    player.x += 0.034;
    updateRuntimeCamera(camera, world, 1 / 60, player);
  }
  const view = runtimeCameraView(camera, player);

  assert.equal(view.mode, 'player');
  assert.equal(view.x, player.x);
  assert.equal(view.y, player.y);
  assert.equal(view.angle, player.angle);
  assert.equal(view.pitch, player.pitch);
  assert.equal(view.height !== CAMERA_STANDING_HEIGHT, true);
  assert.equal(Math.abs(view.height - CAMERA_STANDING_HEIGHT) > 0.006, true);
  assert.equal(Math.abs(view.height - CAMERA_STANDING_HEIGHT) < 0.035, true);
});

test('free camera moves without mutating the controlled actor', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  const player = makeTestPlayer({ x: 100, y: 100, angle: Math.PI / 2, pitch: 0.1 });

  setFreeCameraFromSubject(camera, player);
  moveFreeCamera(camera, world, { forward: 1, strafe: 1, vertical: 1, turn: 1, pitch: -1, speed: 2 }, 0.5);
  const view = runtimeCameraView(camera, player, 1.2);

  assert.equal(view.mode, 'free');
  assert.notEqual(view.x, player.x);
  assert.notEqual(view.y, player.y);
  assert.notEqual(view.angle, player.angle);
  assert.equal(player.x, 100);
  assert.equal(player.y, 100);
  assert.equal(player.angle, Math.PI / 2);
  assert.equal(view.fovRadians, 1.2);

  resetRuntimeCamera(camera);
  assert.equal(runtimeCameraView(camera, player).mode, 'player');
});

test('death camera captures actor transform and stops following later actor movement', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  const player = makeTestPlayer({ x: 30, y: 40, angle: 0, pitch: 0 });

  startDeathCamera(camera, player.x, player.y, player.angle, rng([0.5, 0.5]));
  player.x = 300;
  player.y = 400;
  updateRuntimeCamera(camera, world, 0.1);
  const view = runtimeCameraView(camera, player);

  assert.equal(view.mode, 'death');
  assert.notEqual(view.x, player.x);
  assert.notEqual(view.y, player.y);
  assert.equal(Number.isFinite(view.angle), true);
  assert.equal(Number.isFinite(view.pitch), true);
  assert.equal(Number.isFinite(view.height), true);
});

test('death camera drops to floor height and clamps there', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  const player = makeTestPlayer({ x: 10, y: 10, angle: 0 });

  startDeathCamera(camera, player.x, player.y, player.angle, rng([0.5, 0.5]));
  updateRuntimeCamera(camera, world, 1);
  const view = runtimeCameraView(camera, player);

  assert.equal(view.height, CAMERA_DEATH_FLOOR_HEIGHT);
});

test('death camera bounces from solid world cells', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  world.cells[world.idx(11, 10)] = Cell.WALL;
  const player = makeTestPlayer({ x: 10.6, y: 10.5, angle: 0 });

  startDeathCamera(camera, player.x, player.y, player.angle, rng([0.5, 0.5]));
  updateRuntimeCamera(camera, world, 0.2);
  const view = runtimeCameraView(camera, player);

  assert.equal(view.mode, 'death');
  assert.equal(view.x < player.x, true);
});

test('death camera wraps toroidal coordinates', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  const player = makeTestPlayer({ x: W - 0.1, y: 12.5, angle: 0 });

  startDeathCamera(camera, player.x, player.y, player.angle, rng([0.5, 0.5]));
  updateRuntimeCamera(camera, world, 0.1);
  const view = runtimeCameraView(camera, player);

  assert.equal(view.x >= 0, true);
  assert.equal(view.x < W, true);
  assert.equal(view.x < 1, true);
});

/* Стена во всю высоту мира с единственным проёмом: обойти её нельзя, поэтому
 * кадр либо проходит створку, либо не проходит вовсе — без третьего варианта. */
function walledWorld(doorState?: DoorState): World {
  const world = openWorld();
  for (let y = 0; y < W; y++) world.cells[world.idx(10, y)] = Cell.WALL;
  if (doorState !== undefined) {
    const idx = world.idx(10, 5);
    world.cells[idx] = Cell.DOOR;
    world.doors.set(idx, { idx, state: doorState, roomA: -1, roomB: -1, keyId: '', timer: 0 });
  }
  return world;
}

function flyCinematicTo(camera: RuntimeCamera, world: World, path: number[][], frames: number): void {
  startCinematicCamera(camera, 5.5, 5.5, path, { lookAt: { x: 15.5, y: 5.5 }, hold: true, flySpeed: 8 });
  for (let i = 0; i < frames; i++) updateCinematicCamera(camera, world, 1 / 60);
}

test('cinematic camera flies through a locked door instead of stopping at it', () => {
  const camera = createRuntimeCamera();
  const world = walledWorld(DoorState.LOCKED);

  // Один узел — это «маршрута нет»: запечённое дерево путей считает запертое
  // непроходимым, и до цели остаётся слепой прогон по прямой.
  flyCinematicTo(camera, world, [[15.5, 5.5]], 120);

  assert.equal(cinematicCameraArrived(camera), true);
  assert.equal(Math.abs(world.delta(camera.free.x, 15.5)) < 0.5, true);
});

test('cinematic camera is transferred to the target when concrete leaves no way through', () => {
  const camera = createRuntimeCamera();
  const world = walledWorld();

  flyCinematicTo(camera, world, [[15.5, 5.5]], 120);

  assert.equal(cinematicCameraArrived(camera), true);
  assert.equal(Math.abs(world.delta(camera.free.x, 15.5)) < 0.5, true);
});

test('cinematic camera never reports arrival while parked short of the route end', () => {
  const camera = createRuntimeCamera();
  const world = walledWorld();

  // Ломаная ведёт сквозь бетон: узлы за преградой признаются пройденными, и
  // раньше на этом кадр «прибывал», стоя носом в стену на девятой клетке.
  flyCinematicTo(camera, world, [[8.5, 5.5], [12.5, 5.5], [15.5, 5.5]], 120);

  assert.equal(cinematicCameraArrived(camera), true);
  assert.equal(Math.abs(world.delta(camera.free.x, 15.5)) < 0.5, true);
});

/** Есть ли между актёрами и кадром бетон. Так и ловится проход сквозь стену: не
 *  по факту «камера в стене», а по потерянной прямой видимости до точки внимания. */
function wallBetween(world: World, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = world.delta(ax, bx);
  const dy = world.delta(ay, by);
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 8);
  for (let i = 0; i <= steps; i++) {
    const x = ax + (dx * i) / steps;
    const y = ay + (dy * i) / steps;
    if (world.solid(Math.floor(x), Math.floor(y))) return true;
  }
  return false;
}

test('orbiting camera never crosses to the far side of a wall', () => {
  const camera = createRuntimeCamera();
  const world = openWorld();
  // Простенок в одной клетке от точки внимания: круг радиусом 6 гарантированно
  // пересекал бы его, и раньше кадр перескакивал стену по касательной.
  for (let y = 0; y < 20; y++) world.cells[world.idx(22, y)] = Cell.WALL;

  startCinematicCamera(camera, 20.5, 10.5, [], {
    lookAt: { x: 20.5, y: 10.5 },
    orbit: { radius: 6, speed: 2.5 },
    hold: true,
  });

  for (let i = 0; i < 600; i++) {
    updateCinematicCamera(camera, world, 1 / 60);
    assert.equal(world.solid(Math.floor(camera.free.x), Math.floor(camera.free.y)), false,
      `кадр внутри бетона на шаге ${i}: ${camera.free.x.toFixed(2)}, ${camera.free.y.toFixed(2)}`);
    assert.equal(wallBetween(world, 20.5, 10.5, camera.free.x, camera.free.y), false,
      `кадр за стеной на шаге ${i}: ${camera.free.x.toFixed(2)}, ${camera.free.y.toFixed(2)}`);
  }
});

test('a fly beat without a look target faces the course through a corner', () => {
  // Разница между «смотрю по курсу» и «смотрю на актёров» видна только НА
  // ПОВОРОТЕ: на прямой оба режима совпадают, и мерить их там бессмысленно.
  // Поэтому ломаная буквой Г, а сравнивается взгляд в конце — после поворота.
  const world = openWorld();
  const corner: number[][] = [];
  for (let x = 5; x <= 15; x += 0.25) corner.push([x, 5.5]);      // на восток
  for (let y = 5.5; y <= 15; y += 0.25) corner.push([15.0, y]);   // затем на юг

  const byCourse = createRuntimeCamera();
  startCinematicCamera(byCourse, 5.5, 5.5, corner.map(p => [...p]), {
    lookAt: null, hold: true, angle: 0, flySpeed: 8,
  });
  const atTarget = createRuntimeCamera();
  startCinematicCamera(atTarget, 5.5, 5.5, corner.map(p => [...p]), {
    lookAt: { x: 15.0, y: 15.0 }, hold: true, angle: 0, flySpeed: 8,
  });
  for (let i = 0; i < 600; i++) {
    updateCinematicCamera(byCourse, world, 1 / 60);
    updateCinematicCamera(atTarget, world, 1 / 60);
  }

  // Оба кадра прошли поворот и идут на юг. Смотрящий по курсу развернулся вместе
  // с дорогой; смотрящий на цель держал её в прицеле всю дорогу и потому пришёл
  // к повороту уже развёрнутым — курс он поймал раньше, чем в него вошёл.
  const south = Math.PI / 2;
  const gap = (a: number): number => {
    let d = a - south;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d) * 180 / Math.PI;
  };
  assert.ok(gap(byCourse.free.angle) < 15,
    `кадр по курсу смотрит в ${gap(byCourse.free.angle).toFixed(0)}° от направления хода`);
  assert.ok(byCourse.free.x > 14 && byCourse.free.y > 12,
    `кадр по курсу не прошёл поворот: ${byCourse.free.x.toFixed(1)},${byCourse.free.y.toFixed(1)}`);
});

test('camera module does not expose old death camera entry points', () => {
  const camera = createRuntimeCamera();
  startDeathCamera(camera, 1, 1, 0, rng([0.5, 0.5]));
  assert.equal('death' in camera, false);
  assert.equal('DeathCam' in cameraApi, false);
  assert.equal('initDeathCam' in cameraApi, false);
  assert.equal('updateDeathCam' in cameraApi, false);
  assert.equal('getDeathCamAngle' in cameraApi, false);
  assert.equal('getDeathCamPitch' in cameraApi, false);
});
