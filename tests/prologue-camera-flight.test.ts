/* Замок на пролёт камеры пролога — из НАСТОЯЩЕЙ стартовой точки новой игры.
 *
 * Важнее всего здесь третий аргумент `generateFloor`. С `isTutorial = false`
 * игрок стоит в Актовом зале, у которого есть выход в лабиринт, и любой пролёт
 * выглядит здоровым. В новой игре флаг взведён, и стартовая точка другая:
 * Столовая за дверью на ключ, `sealed`, с гермостенами и единственным вторым
 * выходом в тупиковую уборную. Запечённое дерево путей считает запертое
 * непроходимым — то есть маршрута оттуда НЕ СУЩЕСТВУЕТ, и никакая проходимость
 * шага этого не лечит: лечится только маршрутом, который собирается через двери.
 *
 * Проверяется покадрово: камера дошла, шла собственным ходом (ни один кадр не
 * двигает её дальше бюджета скорости — то есть вынужденного переноса не было) и
 * ни разу не оказалась в непроходимой клетке. Запертая створка на дороге при этом
 * законна: у камеры нет ключей, и держать её замком нечем.
 *
 * Чего здесь НЕТ и быть не может: проверки, что кадр смотрит по курсу. Замерено —
 * дорога до зала почти прямая, курс и направление на цель совпадают, и оба режима
 * дают неотличимые 30° против 38°. Взгляд проверяется там, где режимы обязаны
 * разойтись, — на повороте: `tests/camera.test.ts`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content';
import { Cell } from '../src/core/types';
import { generateFloor } from '../src/gen/floor_manifest';
import {
  cinematicCameraArrived,
  createRuntimeCamera,
  routeCinematicCamera,
  startCinematicCamera,
  updateCinematicCamera,
} from '../src/systems/camera';
import { PROLOGUE_HALL_ALIAS } from '../src/gen/living/prologue_hall';

/* Те же числа, что у первого такта пролога. Проверять надо ровно тот пролёт,
 * на который жалуются. */
const FLY_SPEED = 18;
const FLY_OFFSET_X = -8;
const FLY_OFFSET_Y = -5;
const FRAME = 1 / 60;
const MAX_FLIGHT_FRAMES = 60 * 60;
/* Разные сиды дают разный лабиринт, но одну и ту же стартовую Столовую: дело не
 * в сиде, а в устройстве стартовой комнаты. */
const SEEDS = [61_061, 7, 12_345];

interface Flight {
  arrived: boolean;
  frames: number;
  jumps: number;
  worstCell: number | null;
  gap: number;
  nodes: number;
  startRoom: string;
}

function flyToHall(seed: number): Flight {
  const gen = generateFloor(0, seed, true);
  const world = gen.world;
  const hall = world.rooms.find(room => room?.defId === PROLOGUE_HALL_ALIAS);
  assert.ok(hall, 'зал пролога обязан быть на жилом этаже');
  const tx = hall!.x + hall!.w / 2 + FLY_OFFSET_X;
  const ty = hall!.y + hall!.h / 2 + FLY_OFFSET_Y;

  const startRoom = world.rooms.find(
    room => room.id === world.roomMap[world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY))],
  );

  const camera = createRuntimeCamera();
  // Как в самом такте: без точки внимания, то есть взглядом по курсу. С ней
  // камера летела бы к залу боком, не поворачивая в коридорах.
  startCinematicCamera(camera, gen.spawnX, gen.spawnY, [], {
    lookAt: null,
    hold: true,
    angle: 0,
    flySpeed: FLY_SPEED,
    height: 0.95,
  });
  routeCinematicCamera(camera, world, tx, ty);

  const budget = FLY_SPEED * FRAME;
  const flight: Flight = {
    arrived: false,
    frames: 0,
    jumps: 0,
    worstCell: null,
    gap: 0,
    nodes: camera.cinematic!.path.length,
    startRoom: startRoom?.name ?? '?',
  };

  let prevX = camera.free.x;
  let prevY = camera.free.y;
  while (!cinematicCameraArrived(camera) && flight.frames < MAX_FLIGHT_FRAMES) {
    updateCinematicCamera(camera, world, FRAME);
    const moved = Math.hypot(
      world.delta(prevX, camera.free.x),
      world.delta(prevY, camera.free.y),
    );
    if (moved > budget + 1e-6) flight.jumps++;
    const cell = world.cells[world.idx(Math.floor(camera.free.x), Math.floor(camera.free.y))];
    if (cell !== Cell.FLOOR && cell !== Cell.WATER && cell !== Cell.DOOR) flight.worstCell = cell;
    prevX = camera.free.x;
    prevY = camera.free.y;
    flight.frames++;
  }

  flight.arrived = cinematicCameraArrived(camera);
  flight.gap = world.dist(camera.free.x, camera.free.y, tx, ty);
  return flight;
}

test('prologue camera leaves the locked starting room and flies the whole way', () => {
  for (const seed of SEEDS) {
    const flight = flyToHall(seed);
    assert.equal(flight.startRoom, 'Столовая',
      `сид ${seed}: новая игра обязана начинаться в запертой Столовой, а не в "${flight.startRoom}"`);
    assert.ok(flight.nodes > 1,
      `сид ${seed}: маршрута из запертой Столовой не нашлось — кадр держится на вынужденном переносе`);
    assert.equal(flight.arrived, true, `сид ${seed}: камера не дошла до зала`);
    assert.equal(flight.jumps, 0,
      `сид ${seed}: ${flight.jumps} кадров с переносом вместо хода`);
    assert.equal(flight.worstCell, null,
      `сид ${seed}: камера побывала в непроходимой клетке (${flight.worstCell})`);
    assert.ok(flight.gap < 1, `сид ${seed}: камера встала в ${flight.gap.toFixed(1)} клетках от кадра`);
  }
});

test('prologue camera flight stays short enough to open a game with', () => {
  // Не вкусовщина, а предохранитель: пролёт держит управление у сцены, и если
  // маршрут внезапно вырос вчетверо, это видно числом, а не глазами.
  for (const seed of SEEDS) {
    const flight = flyToHall(seed);
    assert.ok(flight.frames < 60 * 12,
      `сид ${seed}: пролёт до зала занял ${(flight.frames / 60).toFixed(1)}с`);
  }
});
