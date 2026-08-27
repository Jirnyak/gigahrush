/* Фаза служебного потолка на шве — у клетки БЕЗ комнаты.
 *
 * ЧТО ЗАЩИЩАЕТ. Длинный служебный прогон под потолком режется на куски
 * решёткой шага `MAX_CORRIDOR_CEILING_RUN` (14), и кусок, начавшийся в такой
 * точке, накрывает вперёд не более 14 клеток. У клетки С комнатой отсчёт
 * решётки локален к углу комнаты — это уже закрыто
 * `tests/torus-seam-room-local.test.ts`. У клетки БЕЗ комнаты (`roomMap === -1`)
 * отсчёта нет, и решётка считалась от абсолютной координаты.
 *
 * ЧЕМ ОШИБКА ОБОШЛАСЬ. Кольцо мира — 1024 клетки, а 1024 = 14*73 + 2, то есть
 * решётка шага 14 на нём НЕ ЗАМЫКАЕТСЯ. Обойдя кольцо, фаза приходила смещённой
 * на две клетки: на линии шва соседние начала расходились на 16 клеток при
 * длине куска максимум 14, и две клетки потолка оставались голыми. Разрыв шёл
 * ровно по x=0 и y=0. Замерено на сиде 61061: 4797 безкомнатных клеток шва
 * несут прогон вдоль самого шва, на 33 этажах из 51 — то есть это видно почти
 * везде.
 *
 * КАК ПРОВЕРЯЕТСЯ. Кольцевой коридор шириной в клетку опоясывает мир целиком и
 * не принадлежит ни одной комнате. Покрытие `collector` выбрано намеренно: у
 * него нет шумового отсева клеток и нулевая хеш-фаза, поэтому прогон сплошной,
 * и единственное, что расставляет начала кусков, — сама решётка. Тест требует
 * не «правильной фазы», а игрового факта: под каждой клеткой коридора висит
 * потолочный пучок. При старой абсолютной решётке две клетки у шва пусты.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, RoomType, Tex, W } from '../src/core/types';
import { World } from '../src/core/world';
import { collectMeshScene, type MeshInstance, type MeshPassContext } from '../src/render/mesh/scene_collect';
import type { CameraView } from '../src/systems/camera';

const CORRIDOR_Y = 300;
/* Радиус сбора берётся с запасом: чтобы поймать дыру, окно должно быть шире
 * одного куска решётки, иначе «пусто» не отличить от «за краем окна». */
const COLLECT_RADIUS = 48;

function ringCorridorWorld(): World {
  const world = new World();
  for (let x = 0; x < W; x++) {
    const idx = world.idx(x, CORRIDOR_Y);
    world.cells[idx] = Cell.FLOOR;
    world.floorTex[idx] = Tex.F_CONCRETE;
    world.roomMap[idx] = -1;
    for (const dy of [-1, 1]) {
      const wall = world.idx(x, CORRIDOR_Y + dy);
      world.cells[wall] = Cell.WALL;
      world.wallTex[wall] = Tex.CONCRETE;
      world.roomMap[wall] = -1;
    }
  }
  world.markCellsDirty();
  return world;
}

function corridorContext(world: World, cameraX: number): MeshPassContext {
  const camera: CameraView = {
    mode: 'player',
    x: cameraX,
    y: CORRIDOR_Y + 0.5,
    angle: 0,
    pitch: 0,
    height: 0.5,
    fovRadians: Math.PI / 2,
  };
  return {
    world,
    camera,
    floorKey: 'test:torus_seam_ceiling',
    seed: 61_061,
    time: 0,
    mode: 'high',
    profile: {
      radius: COLLECT_RADIUS,
      instanceCap: 65_536,
      ceilingDetail: 0,
      furnitureDetail: 0,
      corridorVolumeDetail: 1,
      organicVolumeDetail: 1,
      corridorVolumeStyle: 'service',
      corridorCoveringId: 'collector',
      includeVisualSlots: false,
      includeFeatures: false,
      includeContainers: false,
      includeEntities: false,
      includeCorridorVolumes: true,
    },
  };
}

/* Подпись куска служебного прогона. Те же две модели ставит ещё и трубная сеть
 * покрытия `collector`, но у неё свои габариты и свой поворот; кусок прогона —
 * единственный, кто идёт вдоль оси коридора габаритом 0.62 x 0.52. */
function isRunPiece(instance: MeshInstance): boolean {
  if (instance.modelId !== 'ceiling_pipe_bundle' && instance.modelId !== 'ceiling_cable_bundle') return false;
  return instance.yaw === 0 && instance.scaleY === 0.62 && instance.scaleZ === 0.52;
}

/** Кратность покрытия каждой клетки коридора (0 — дыра, 2 — пучок поверх пучка)
 *  и длины всех кусков кольца. Прогон целен, поэтому правильный ответ —
 *  ровно единица на клетку, а длина куска равна шагу решётки. */
function coverageCounts(world: World): { counts: Map<number, number>; lengths: number[] } {
  /* Окна сбора идут внахлёст: пучок собирается только тем окном, в котором
   * лежит его НАЧАЛО, и при стыке впритык хвосты выпадали бы из счёта. */
  const pieces = new Map<string, { from: number; length: number }>();
  for (let cameraX = 0; cameraX < W; cameraX += COLLECT_RADIUS / 4) {
    const instances = collectMeshScene(corridorContext(world, cameraX + 0.5)).filter(isRunPiece);
    for (const instance of instances) {
      const half = instance.scaleX * 0.5;
      const from = (((Math.round(instance.x - half) % W) + W) % W);
      const length = Math.round(instance.scaleX);
      pieces.set(`${from}:${length}`, { from, length });
    }
  }

  const counts = new Map<number, number>();
  for (const piece of pieces.values()) {
    for (let step = 0; step < piece.length; step++) {
      const cell = (piece.from + step) % W;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
  }
  return { counts, lengths: [...pieces.values()].map(piece => piece.length) };
}

test('кольцевой служебный потолок без комнаты накрыт ровно один раз на каждой клетке', () => {
  const world = ringCorridorWorld();
  const { counts } = coverageCounts(world);

  assert.equal(counts.size > 0, true, 'потолочные пучки не собрались вовсе — тест ничего не проверяет');

  const bare: number[] = [];
  const doubled: number[] = [];
  for (let x = 0; x < W; x++) {
    const n = counts.get(x) ?? 0;
    if (n === 0) bare.push(x);
    else if (n > 1) doubled.push(x);
  }

  assert.deepEqual(
    bare,
    [],
    `клетки кольца остались без потолка (${bare.slice(0, 8).join(', ')}${bare.length > 8 ? ', …' : ''}) — ` +
      'решётка разошлась шире куска; на шве это давало ровно тот разрыв, ради которого написан тест',
  );
  assert.deepEqual(
    doubled,
    [],
    `на клетках кольца висит по два пучка (${doubled.slice(0, 8).join(', ')}${doubled.length > 8 ? ', …' : ''}) — ` +
      'кусок перекрыл соседний: длина куска перестала кончаться на следующем начале',
  );
});

test('шаг решётки на кольце ровный: обрубка у шва не появляется', () => {
  const world = ringCorridorWorld();
  const { lengths } = coverageCounts(world);

  /* 1024 = 14*73 + 2, поэтому решётка ровного шага 14 на кольцо не ложится, и
   * остаток вылезал одним куском у шва: при фазе 0 — обрубком в две клетки,
   * при фазе больше единицы — дырой в две клетки. Ровная решётка кладёт на
   * кольцо 74 доли шагом 13 или 14 и других длин не даёт. */
  const seen = [...new Set(lengths)].sort((a, b) => a - b);
  assert.deepEqual(
    seen,
    [13, 14],
    `длины кусков на кольце: ${seen.join(', ')} — среди них есть чужая, ` +
      'значит решётка снова считается от абсолютной координаты и не замыкается на торе',
  );
  assert.equal(lengths.length, 74, `кусков на кольце ${lengths.length}, а долей должно быть 74`);
});
