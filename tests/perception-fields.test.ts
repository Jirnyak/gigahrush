import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, DoorState } from '../src/core/types';
import { World, PERCEPTION_CHANNEL_COUNT } from '../src/core/world';
import {
  FieldChannel,
  fieldAt,
  fieldCellX,
  fieldCellY,
  fieldGradientStep,
  depositDanger,
  depositNoise,
  depositScent,
  updatePerceptionFields,
  prewarmPerceptionFields,
  resetPerceptionFieldsState,
} from '../src/systems/fields';

/* Замок на слой полей восприятия.
 *
 * Закон владельца: актор решает по тому, что читается в его клетке, а глобальное
 * знание доставляют поля. Отсюда три вещи, которые здесь и заперты.
 *
 * ПЕРВОЕ — изотропия. Четырёхсвязная диффузия расползается ромбом, и драйв «идти
 * на шум» в открытом зале выводил бы актора по диагоналям в углы. Диагональ
 * обязана получать свою долю, и ровно в √2 раз меньшую.
 *
 * ВТОРОЕ — связность. Поле не проходит сквозь стену и закрытую дверь и не
 * срезает сомкнутый угол: иначе запах и звук утекают в соседнюю квартиру.
 *
 * ТРЕТЬЕ — тор. Мир замкнут, и клетка 1023 соседствует с клеткой 0. Голое
 * вычитание координат этот шов рвёт.
 */

/** Мир без запекания просвета: диффузию оно не трогает, а стоит O(W²). */
function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  world.perceptionBaked = true;
  return world;
}

function tick(world: World, times = 1): void {
  for (let i = 0; i < times; i++) updatePerceptionFields(world, 0.5);
}

test('плоскость 0 полей — это и есть world.dangerField', () => {
  const world = openWorld();
  assert.equal(world.perceptionFields.length, world.cells.length * PERCEPTION_CHANNEL_COUNT);
  assert.equal(world.dangerField.length, world.cells.length);
  depositDanger(world, 40, 41, 7);
  assert.equal(world.dangerField[world.idx(40, 41)], 7);
  assert.equal(fieldAt(world, FieldChannel.DANGER, 40, 41), 7);
  // Обратная сторона: старый писатель крови пишет в массив напрямую.
  world.dangerField[world.idx(40, 41)] = 200;
  assert.equal(fieldAt(world, FieldChannel.DANGER, 40, 41), 200);
});

test('депозит насыщается на 255 и не переполняет байт', () => {
  const world = openWorld();
  depositNoise(world, 5, 5, 200);
  depositNoise(world, 5, 5, 200);
  assert.equal(fieldAt(world, FieldChannel.NOISE, 5, 5), 255);
});

test('диффузия изотропна: восемь соседей, диагональ в √2 раз слабее', () => {
  const world = openWorld();
  depositDanger(world, 500, 500, 255);
  tick(world);

  const orth = [
    fieldAt(world, FieldChannel.DANGER, 501, 500),
    fieldAt(world, FieldChannel.DANGER, 499, 500),
    fieldAt(world, FieldChannel.DANGER, 500, 501),
    fieldAt(world, FieldChannel.DANGER, 500, 499),
  ];
  const diag = [
    fieldAt(world, FieldChannel.DANGER, 501, 501),
    fieldAt(world, FieldChannel.DANGER, 501, 499),
    fieldAt(world, FieldChannel.DANGER, 499, 501),
    fieldAt(world, FieldChannel.DANGER, 499, 499),
  ];

  for (const v of orth) assert.equal(v, orth[0], 'ортогональные соседи обязаны быть равны');
  for (const v of diag) assert.equal(v, diag[0], 'диагональные соседи обязаны быть равны');
  assert.ok(diag[0] > 0, 'четырёхсвязная диффузия: диагональ пуста, пятно — ромб');
  assert.ok(diag[0] < orth[0], 'диагональ обязана быть слабее ортогонали');
  // Вес диагонали — 1/√2 от ортогонального, с точностью до усечения в байт.
  assert.ok(Math.abs(diag[0] - orth[0] * Math.SQRT1_2) <= 1);
  assert.ok(fieldAt(world, FieldChannel.DANGER, 500, 500) > orth[0]);
});

test('поле замкнуто по тору: импульс в (0,0) достаёт до (1023,1023)', () => {
  const world = openWorld();
  depositDanger(world, 0, 0, 255);
  tick(world);
  assert.ok(fieldAt(world, FieldChannel.DANGER, 1023, 0) > 0);
  assert.ok(fieldAt(world, FieldChannel.DANGER, 0, 1023) > 0);
  assert.ok(fieldAt(world, FieldChannel.DANGER, 1023, 1023) > 0);
});

test('стена не пропускает поле, а открытая дверь пропускает', () => {
  const world = openWorld();
  // Стена во всю колонну: обойти её можно только через шов тора, за пятьсот с
  // лишним клеток, — за десяток тиков поле столько не проползёт.
  for (let y = 0; y < 1024; y++) world.cells[world.idx(501, y)] = Cell.WALL;
  const feed = (): void => {
    for (let i = 0; i < 16; i++) { depositDanger(world, 500, 500, 255); tick(world); }
  };
  feed();
  assert.ok(fieldAt(world, FieldChannel.DANGER, 500, 500) > 0, 'источник обязан остаться');
  assert.equal(fieldAt(world, FieldChannel.DANGER, 502, 500), 0, 'поле прошло сквозь стену');

  const doorIdx = world.idx(501, 500);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, { state: DoorState.CLOSED } as never);
  feed();
  assert.equal(fieldAt(world, FieldChannel.DANGER, 502, 500), 0, 'закрытая дверь обязана глушить');

  world.doors.set(doorIdx, { state: DoorState.OPEN } as never);
  feed();
  assert.ok(fieldAt(world, FieldChannel.DANGER, 502, 500) > 0, 'открытая дверь обязана пропускать');
});

test('затухание своё на канал: шум гаснет за секунды, след живёт', () => {
  const world = openWorld();
  depositNoise(world, 300, 300, 200);
  depositScent(world, 300, 300, 200);
  tick(world);
  const noise = fieldAt(world, FieldChannel.NOISE, 300, 300);
  const scent = fieldAt(world, FieldChannel.SCENT, 300, 300);
  assert.ok(scent > noise, 'след обязан жить дольше шума');
  // След — не облако: диффузии у него нет.
  assert.equal(fieldAt(world, FieldChannel.SCENT, 301, 300), 0);
  assert.ok(fieldAt(world, FieldChannel.NOISE, 301, 300) > 0);

  tick(world, 12); // шум держится единицы секунд
  assert.equal(fieldAt(world, FieldChannel.NOISE, 300, 300), 0);
  assert.ok(fieldAt(world, FieldChannel.SCENT, 300, 300) > 0);
});

test('поле само себя гасит: спящий канал не оставляет остатка', () => {
  const world = openWorld();
  depositScent(world, 700, 700, 4);
  tick(world, 8);
  assert.equal(fieldAt(world, FieldChannel.SCENT, 700, 700), 0);
});

/* ЧЕТВЁРТОЕ — сохранение массы на шве. Такт не имеет права создавать поле.
 *
 * Граница обхода канала была одной рамкой в РАЗВЁРНУТЫХ координатах, и вот чем
 * это кончалось. Депозит в столбце 0 опускал `minX` до −1, депозит в столбце
 * 1023 поднимал `maxX` до 1024, и обход шёл по 1026 столбцам вместо 1024:
 * столбцы 0 и 1023 попадали в него ДВАЖДЫ и дважды же растекались. Поле
 * прибывало из ниоткуда — 510 единиц на 400 влитых за один такт. Обрезание
 * рамки от этого не спасало: оно стоит в хвосте такта, а разрастись она успевает
 * до него.
 *
 * На обжитом этаже активность есть у обоих краёв всегда, поэтому шов постоянно
 * подливал в след, шум и людность фантомный склон — а по этим склонам ходят
 * монстры и падальщики.
 *
 * Замок общий, а не про рамку: ЛЮБАЯ будущая граница обхода обязана накрывать
 * каждую клетку ровно один раз. Проверено сверкой с эталоном без границ вообще
 * (полный обход мира каждый такт): набор грязных тайлов совпадает с ним байт в
 * байт, рамка — нет.
 */
test('такт не создаёт поле из ничего, когда источники стоят у обоих краёв', () => {
  const world = openWorld();
  // Ровно тот случай: один источник в столбце 0, другой в столбце 1023.
  // По строкам они разведены, чтобы не сливаться и считаться независимо.
  depositScent(world, 0, 100, 200);
  depositScent(world, 1023, 900, 200);
  tick(world);

  const base = FieldChannel.SCENT * world.cells.length;
  let mass = 0;
  for (let i = 0; i < world.cells.length; i++) mass += world.perceptionFields[base + i];

  // Влито 400, затухание следа — 1 на клетку за такт, живых клеток две.
  // Диффузия массу только перекладывает и на округлении может её потерять,
  // но прибавить не может ни при каких условиях.
  assert.ok(mass <= 398, `масса выросла до ${mass}: клетку обошли дважды`);
  assert.ok(mass > 300, `масса просела до ${mass}: клетку потеряли`);
});

test('шаг по градиенту идёт вверх, тормозит в максимуме и уважает знак', () => {
  const world = openWorld();
  depositScent(world, 10, 10, 200);
  depositScent(world, 11, 10, 100);

  const up = fieldGradientStep(world, FieldChannel.SCENT, 12, 10, 1);
  assert.equal(fieldCellX(up), 11);
  assert.equal(fieldCellY(up), 10);

  const next = fieldGradientStep(world, FieldChannel.SCENT, 11, 10, 1);
  assert.equal(fieldCellX(next), 10);
  assert.equal(fieldCellY(next), 10);

  assert.equal(fieldGradientStep(world, FieldChannel.SCENT, 10, 10, 1), -1, 'максимум — не шаг');
  // Вниз по градиенту от максимума — в любую нулевую соседнюю клетку.
  const down = fieldGradientStep(world, FieldChannel.SCENT, 10, 10, -1);
  assert.ok(down >= 0);
  assert.equal(fieldAt(world, FieldChannel.SCENT, fieldCellX(down), fieldCellY(down)), 0);
});

test('шаг по градиенту не лезет в стену и не срезает сомкнутый угол', () => {
  const world = openWorld();
  world.cells[world.idx(11, 10)] = Cell.WALL;
  world.perceptionFields[FieldChannel.SCENT * world.cells.length + world.idx(11, 10)] = 255;
  assert.equal(fieldGradientStep(world, FieldChannel.SCENT, 12, 10, 1), -1, 'шаг ушёл в стену');

  const world2 = openWorld();
  depositScent(world2, 10, 10, 200);
  world2.cells[world2.idx(11, 10)] = Cell.WALL;
  world2.cells[world2.idx(10, 11)] = Cell.WALL;
  assert.equal(
    fieldGradientStep(world2, FieldChannel.SCENT, 11, 11, 1), -1,
    'диагональ прошла сквозь сомкнутый угол',
  );
});

test('просвет: стена — ноль, коридор темнее зала, двоичная корзина внутри шкалы', () => {
  const world = new World(); // весь мир — камень
  resetPerceptionFieldsState();
  // Зал 40×40 и одноклеточный коридор из него.
  for (let y = 100; y < 140; y++) {
    for (let x = 100; x < 140; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
  for (let x = 140; x < 200; x++) world.cells[world.idx(x, 120)] = Cell.FLOOR;
  // Одинокая колонна в углу зала: на ней проверяются обе половины двоичной
  // корзины `getSubcellNavCost` — ортогональный сосед и только диагональный.
  world.cells[world.idx(105, 105)] = Cell.WALL;
  prewarmPerceptionFields(world);

  const wall = fieldAt(world, FieldChannel.OPENNESS, 50, 50);
  const corridor = fieldAt(world, FieldChannel.OPENNESS, 170, 120);
  const hall = fieldAt(world, FieldChannel.OPENNESS, 120, 120);
  assert.equal(wall, 0, 'камень обязан быть глухим нулём');
  assert.ok(corridor > 0, 'проходимый коридор не может быть нулём');
  assert.ok(corridor < hall, 'коридор обязан читаться теснее зала');
  assert.equal(hall, 255, 'середина большого зала — полный простор');

  // Эквивалент двоичной корзины getSubcellNavCost: перекрытый ортогональный
  // сосед — 25, только диагональный — 35, все восемь открыты — не меньше 50.
  assert.equal(fieldAt(world, FieldChannel.OPENNESS, 106, 105), 25, 'перекрыт ортогональный сосед');
  assert.equal(fieldAt(world, FieldChannel.OPENNESS, 106, 106), 35, 'перекрыт только диагональный');
  assert.ok(fieldAt(world, FieldChannel.OPENNESS, 110, 110) >= 50, 'все восемь соседей открыты');
});

test('прогрев идемпотентен и не стирает депозиты, сделанные после него', () => {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  assert.equal(world.perceptionBaked, true);
  depositNoise(world, 60, 60, 120);
  prewarmPerceptionFields(world);
  assert.equal(fieldAt(world, FieldChannel.NOISE, 60, 60), 120);
  tick(world);
  assert.ok(fieldAt(world, FieldChannel.NOISE, 61, 60) > 0, 'рамка депозита пережила прогрев');
});
