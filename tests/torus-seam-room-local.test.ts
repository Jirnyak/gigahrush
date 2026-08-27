/* Локальная координата клетки внутри комнаты — ПО ТОРУ.
 *
 * ЧТО ЗАЩИЩАЕТ. Мир замкнут в тор 1024x1024, и комнаты его шов пересекают: на
 * жилом таких комнат 41, на министерстве 8, на voronoi_quarantine 37, а всего
 * шов проходим на 36 этажах из 51. Клетка приходит ЗАВЁРНУТОЙ (`world.wrap`),
 * а `room.x`/`room.y` хранятся сырыми, поэтому у комнаты, начинающейся на 1023,
 * сырая разность `x - room.x` давала −1020 вместо +3.
 *
 * ЧЕМ ОШИБКА ОБОШЛАСЬ. Отрицательная разность не проходила проверку «внутри
 * комнаты», и завёрнутая половина комнаты выпадала из расчёта целиком: 478
 * клеток в 41 комнате на жилом, 332 в 8 на министерстве, 6547 в 20 на floor_69.
 * В рендере это значило, что на второй половине такой комнаты не появлялось
 * потолочных деталей, а фаза служебных прогонов срывалась на абсолютные
 * координаты и прыгала ровно на линии шва — потолок рвался пополам. В
 * генерации то же самое ЗАПЕКАЛОСЬ в этаж: `placeColumnVisualDecor` не ставил
 * колонн за швом, а сетка потолочного декора сбивалась по фазе, потому что `%`
 * в JS отдаёт отрицательный остаток.
 *
 * ОБРАТНАЯ СТОРОНА ПРАВИЛА. Модульная разность сама по себе принимает ЛЮБУЮ
 * клетку мира: 1023 — такой же законный остаток, как 3. Поэтому проверку по
 * габариту комнаты снимать нельзя, и третий случай ниже держит именно её:
 * клетки, помеченные комнатой, но лежащие вне её прямоугольника, обязаны
 * по-прежнему отбрасываться.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, RoomType, W } from '../src/core/types';
import { World, VISUAL_SLOTS_PER_CELL } from '../src/core/world';
import { fillVisualSlotsForRoomDecor } from '../src/world/visual_cell_slots';
import { collectMeshScene, type MeshPassContext } from '../src/render/mesh/scene_collect';
import type { CameraView } from '../src/systems/camera';
import { addTestRoom } from './helpers';

/* Комната стоит так, что её левая половина лежит на 1016..1023, а правая — на
 * 0..7. Обе половины смежны в мире и обязаны вести себя одинаково. */
const SEAM_ROOM_X = 1016;
const SEAM_ROOM_Y = 12;
const SEAM_ROOM_W = 16;
const SEAM_ROOM_H = 16;

function seamCamera(): CameraView {
  return {
    mode: 'player',
    x: 1023.5,
    y: SEAM_ROOM_Y + SEAM_ROOM_H / 2 - 0.5,
    angle: 0,
    pitch: 0,
    height: 0.5,
    fovRadians: Math.PI / 2,
  };
}

function ceilingContext(world: World): MeshPassContext {
  return {
    world,
    camera: seamCamera(),
    floorKey: 'test:torus_seam',
    seed: 61_061,
    time: 0,
    mode: 'high',
    profile: {
      radius: 16,
      instanceCap: 4096,
      ceilingDetail: 1,
      furnitureDetail: 0,
      includeVisualSlots: false,
      includeFeatures: false,
      includeContainers: false,
      includeCorridorVolumes: false,
    },
  };
}

/** Клетка перевалила за шов: её координата меньше начала комнаты. */
function onWrappedSide(x: number, roomX: number): boolean {
  return x < roomX;
}

test('потолочные детали появляются по ОБЕ стороны шва внутри одной комнаты', () => {
  const world = new World();
  addTestRoom(world, {
    id: 0,
    type: RoomType.COMMON,
    x: SEAM_ROOM_X,
    y: SEAM_ROOM_Y,
    w: SEAM_ROOM_W,
    h: SEAM_ROOM_H,
    name: 'Комната через шов',
  });

  const beams = collectMeshScene(ceilingContext(world)).filter(i => i.modelId === 'ceiling_beam');

  const left = beams.filter(i => Math.floor(i.x) >= SEAM_ROOM_X).length;
  const right = beams.filter(i => Math.floor(i.x) < SEAM_ROOM_W).length;
  assert.ok(left > 0, `на несмещённой половине комнаты нет потолочных деталей (${left})`);
  assert.ok(
    right > 0,
    `завёрнутая половина комнаты осталась без потолочных деталей: ${right} против ${left} — ` +
      'вернулась сырая разность x - room.x',
  );
});

test('клетка вне прямоугольника комнаты отбрасывается, даже если roomMap на неё указывает', () => {
  const world = new World();
  const room = addTestRoom(world, {
    id: 0,
    type: RoomType.COMMON,
    x: SEAM_ROOM_X,
    y: SEAM_ROOM_Y,
    w: SEAM_ROOM_W,
    h: SEAM_ROOM_H,
    name: 'Комната через шов',
  });

  /* Полоса слева ОТ комнаты: проходимая, помечена той же комнатой, но лежит вне
   * её габарита. По модулю её локальная координата равна 1016..1021 — то есть
   * формула без проверки габарита приняла бы её за свою. */
  const strip: number[] = [];
  for (let x = SEAM_ROOM_X - 6; x < SEAM_ROOM_X; x++) {
    for (let y = SEAM_ROOM_Y + 2; y < SEAM_ROOM_Y + SEAM_ROOM_H - 2; y++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.roomMap[idx] = room.id;
      strip.push(idx);
    }
  }
  assert.equal(strip.length, 72, 'полоса-ловушка собрана не полностью');

  const beams = collectMeshScene(ceilingContext(world)).filter(i => i.modelId === 'ceiling_beam');
  const inStrip = beams.filter(i => {
    const x = Math.floor(i.x);
    return x >= SEAM_ROOM_X - 6 && x < SEAM_ROOM_X;
  }).length;

  assert.equal(
    inStrip,
    0,
    `клетки вне комнаты получили потолочные детали (${inStrip}) — проверка по габариту снята, ` +
      'и модульная разность приняла весь мир за комнату',
  );
});

test('генерация ставит колонны на завёрнутой половине комнаты через шов', () => {
  const world = new World();
  const room = addTestRoom(world, {
    id: 0,
    type: RoomType.COMMON,
    x: 1014,
    y: 100,
    w: 20,
    h: 20,
    name: 'Зал через шов',
  });

  // Только колонны: стены и потолок заглушены, поэтому любой поставленный слот
  // здесь — колонна, и считать её код не нужно.
  const summary = fillVisualSlotsForRoomDecor(world, [room], {
    seed: 61_061,
    tags: ['ministry'],
    wallCap: 0,
    ceilingCap: 0,
    columnCap: 40,
  });
  assert.equal(summary.wallFixtures, 0);
  assert.equal(summary.ceilingDetails, 0);
  assert.ok(summary.columns > 0, 'колонны не поставлены вообще');

  let left = 0;
  let wrapped = 0;
  for (let i = 0; i < W * W; i++) {
    let filled = false;
    for (let s = 0; s < VISUAL_SLOTS_PER_CELL; s++) {
      if (world.visualSlots[i * VISUAL_SLOTS_PER_CELL + s] !== 0) { filled = true; break; }
    }
    if (!filled) continue;
    assert.equal(world.roomMap[i], room.id, 'колонна встала вне комнаты');
    if (onWrappedSide(i % W, room.x)) wrapped++; else left++;
  }

  assert.ok(left > 0, 'на несмещённой половине зала колонн нет');
  assert.ok(
    wrapped > 0,
    `завёрнутая половина зала осталась без колонн: ${wrapped} против ${left} — ` +
      'вернулась сырая разность candidate.x - room.x',
  );
});
