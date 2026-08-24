/* ЦЕЛЬ НЕ ДОЛЖНА ЛЕЖАТЬ В БЕТОНЕ.
 *
 * Класс дефекта, найденный ареной 2026-08-24 и стоивший проекту двух мёртвых
 * механик сразу. Источник цели проверяет проходимость в основной ветке и НЕ
 * проверяет в запасной — а поиск пути на непроходимой цели возвращает пустой
 * путь, и дело падает МОЛЧА: ни ошибки, ни отказа, актор просто идёт заниматься
 * чем-то другим.
 *
 * Два живых случая этого класса:
 *  - стратегический ярус отдавал геометрический центр ячейки 16×16, а тот лежит
 *    в стене на 61% жилого этажа и 99.7% квартир — ярус был мёртв целиком, и с
 *    ним охота, стая, кучкование и «идти на выстрелы»;
 *  - `roomTargetCell` отдавал центр комнаты вслепую в обеих запасных ветках, а
 *    этим ярусом пользуются ВСЕ телесные нужды и весь распорядок.
 *
 * Тест держит оба и написан так, чтобы ловить ТРЕТИЙ: он проверяет не строку
 * кода, а свойство — «то, что источник назвал целью, проходимо».
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, type Entity, type Room, RoomType, AIGoal, EntityType } from '../src/core/types';
import { World } from '../src/core/world';
import { roomTargetCell } from '../src/systems/ai/pathfinding';

function makeActor(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    ai: { goal: AIGoal.GOTO, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

/** Комната с полом, в центре которой стоит колонна. */
function makeRoomWithPillar(world: World, x: number, y: number, w: number, h: number): Room {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) world.set(xx, yy, Cell.FLOOR);
  }
  world.set(x + (w >> 1), y + (h >> 1), Cell.WALL);
  return { id: 0, x, y, w, h, type: RoomType.LIVING, doors: [] } as unknown as Room;
}

test('цель в комнате с колонной в центре не попадает в бетон', () => {
  const world = new World();
  const room = makeRoomWithPillar(world, 40, 40, 9, 9);
  /* Много разных `id`: точка своя у каждого жильца, и запасная ветка срабатывает
   * только у тех, чья точка выпала на колонну. Один актор дефект не покажет. */
  for (let id = 0; id < 200; id++) {
    const spot = roomTargetCell(world, makeActor(id, 44.5, 44.5), room);
    assert.ok(!world.solid(spot.x, spot.y),
      `актор #${id}: цель (${spot.x}, ${spot.y}) лежит в бетоне`);
  }
});

test('пробы одного актора расходятся по комнате, а не топчутся в двух клетках', () => {
  /* Замок на дефект, который тест уже поймал ОДИН РАЗ — в первой версии этой же
   * правки. Пробы брались как `goldenFrac(id, probe*2)`, а у соли период ДВА:
   * восемь попыток посещали две-три клетки вместо восьми, и комната, забитая
   * почти целиком, не находила единственный свободный пол ни у одного из двухсот
   * акторов. Здесь проверяется само РАССЕЯНИЕ, а не вероятность удачи: сколько
   * клеток проб физически может достать, столько дефект и определяет. */
  const world = new World();
  const room = makeRoomWithPillar(world, 60, 60, 12, 12);
  // Всё внутри — бетон, чтобы источник исчерпал ВСЕ пробы и показал их набор.
  for (let yy = 61; yy <= 70; yy++) {
    for (let xx = 61; xx <= 70; xx++) world.set(xx, yy, Cell.WALL);
  }
  for (let id = 0; id < 40; id++) {
    const seen = new Set<string>();
    // Освобождаем по одной клетке и смотрим, какие из них источник вообще достаёт.
    for (let yy = 61; yy <= 70; yy++) {
      for (let xx = 61; xx <= 70; xx++) {
        world.set(xx, yy, Cell.FLOOR);
        const spot = roomTargetCell(world, makeActor(id, 66.5, 66.5), room);
        if (!world.solid(spot.x, spot.y)) seen.add(`${spot.x},${spot.y}`);
        world.set(xx, yy, Cell.WALL);
      }
    }
    assert.ok(seen.size >= 6,
      `актор #${id}: восемь проб достают лишь ${seen.size} клеток — последовательность не рассеивается`);
  }
});

test('крошечная комната без внутренней рамки не роняет источник цели', () => {
  // Вырожденный случай: ширина 2, внутренней области нет вовсе.
  const world = new World();
  for (let yy = 80; yy < 82; yy++) for (let xx = 80; xx < 82; xx++) world.set(xx, yy, Cell.FLOOR);
  const room = { id: 1, x: 80, y: 80, w: 2, h: 2, type: RoomType.LIVING, doors: [] } as unknown as Room;
  const spot = roomTargetCell(world, makeActor(7, 80.5, 80.5), room);
  assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.y));
});
