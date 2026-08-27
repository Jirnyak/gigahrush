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
import { World } from '../src/core/world';
import { generateFloor } from '../src/gen/floor_manifest';
import {
  cinematicCameraArrived,
  createRuntimeCamera,
  routeCinematicCamera,
  startCinematicCamera,
  startTrailerCamera,
  updateCinematicCamera,
  updateTrailerCamera,
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

/* Этаж строится ОДИН РАЗ на сид и достаётся всем замкам файла: генерация жилого —
 * весь расход прогона, сами пролёты это тысячи кадров чистой камеры. */
const floors = new Map<number, ReturnType<typeof generateFloor>>();
function livingFloor(seed: number): ReturnType<typeof generateFloor> {
  const cached = floors.get(seed);
  if (cached) return cached;
  const gen = generateFloor(0, seed, true);
  floors.set(seed, gen);
  return gen;
}

function flyToHall(seed: number): Flight {
  const gen = livingFloor(seed);
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

/* Весь расход прогона — генерация жилого этажа: сам пролёт это меньше тысячи
 * кадров чистой камеры, без единого шага AI. Оба замка смотрят на один и тот же
 * пролёт, и генерировать этаж каждому из них по разу — это вдвое дороже ни за
 * что. Кэш на сид, как в замке смотра. */
const flights = new Map<number, Flight>();
function hallFlight(seed: number): Flight {
  const cached = flights.get(seed);
  if (cached) return cached;
  const flight = flyToHall(seed);
  flights.set(seed, flight);
  return flight;
}

test('prologue camera leaves the locked starting room and flies the whole way', () => {
  for (const seed of SEEDS) {
    const flight = hallFlight(seed);
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

/* Трейлерный кадр главного меню — ТОТ ЖЕ ПРОЛЁТ, что у сцены, ему лишь дописывают
 * маршрут на ходу. Замок ловит ровно ту поломку, из-за которой его переписали:
 * прежний кадр летел не по ломаной, а по собственному курсу, доворачивая к узлу
 * экспонентой. Радиус разворота при этом (скорость / потолок разворота = две
 * клетки) заведомо больше допуска на узел, поэтому узел был недостижим в принципе:
 * кадр наматывал вокруг него круги, а поскольку ход шёл без проверки преград —
 * наматывал их сквозь бетон. Замерено на живом этаже: за две минуты кадр не
 * покидал одной комнаты и четверть времени проводил внутри стен.
 *
 * Поэтому и мерятся две вещи: побывал ли кадр в бетоне (ни разу) и сколько комнат
 * он показал (больше одной — значит летит, а не кружит).
 *
 * Сид ОДИН, и это не экономия на охвате: поломка структурная, а не сидовая — на
 * всех трёх сидах она давала одну и ту же комнату и те же двадцать процентов
 * времени в бетоне. Зато смена сида здесь стоит дорого не генерацией (этаж уже
 * в кэше файла), а перепечкой дерева путей: оно кэшируется на ОДИН мир, и каждый
 * переход на другой этаж перепекает его целиком — три сида это плюс минута к
 * матрице ни за что. */
test('the title trailer camera tours rooms instead of circling through concrete', () => {
  const FRAME = 1 / 60;
  const SECONDS = 90;
  for (const seed of SEEDS.slice(0, 1)) {
    const gen = livingFloor(seed);
    const world: World = gen.world;
    const camera = createRuntimeCamera();
    startTrailerCamera(camera, gen.spawnX, gen.spawnY);

    const rooms = new Set<number>();
    let inSolid = 0;
    for (let f = 0; f < SECONDS * 60; f++) {
      updateTrailerCamera(camera, world, FRAME);
      const ci = world.idx(Math.floor(camera.free.x), Math.floor(camera.free.y));
      const cell = world.cells[ci];
      if (cell !== Cell.FLOOR && cell !== Cell.WATER && cell !== Cell.DOOR) inSolid++;
      const roomId = world.roomMap[ci];
      if (roomId !== undefined && roomId >= 0) rooms.add(roomId);
    }

    assert.equal(inSolid, 0,
      `сид ${seed}: кадр трейлера ${inSolid} раз оказался внутри непроходимой клетки`);
    assert.ok(rooms.size > 1,
      `сид ${seed}: кадр за ${SECONDS}с показал комнат: ${rooms.size} — это круг на месте, а не пролёт`);
  }
});

test('prologue camera flight stays short enough to open a game with', () => {
  // Не вкусовщина, а предохранитель: пролёт держит управление у сцены, и если
  // маршрут внезапно вырос вчетверо, это видно числом, а не глазами.
  for (const seed of SEEDS) {
    const flight = hallFlight(seed);
    assert.ok(flight.frames < 60 * 12,
      `сид ${seed}: пролёт до зала занял ${(flight.frames / 60).toFixed(1)}с`);
  }
});
