import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { World } from '../src/core/world';
import {
  FieldChannel,
  fieldAt,
  fieldMacroAt,
  fieldMacroTargetCell,
  fieldCellX,
  fieldCellY,
  depositPeople,
  updatePerceptionFields,
  prewarmPerceptionFields,
  resetPerceptionFieldsState,
} from '../src/systems/fields';

/* Замок на стратегический ярус полей.
 *
 * ЗАЧЕМ ОН ВООБЩЕ ЕСТЬ. Поклеточный ярус хранит байт, и градиент в нём умирает
 * на второй-третьей клетке: доля соседа от значения 7 равна 0.26, а в байт это
 * ноль, и каскад обрывается МЕЖДУ тактами. Замерено: 255 → 205 → 56 → 14 → 0.
 * Значит «актор читает градиент под ногами» без второго яруса работает на два
 * шага, и охота на скопление через этаж невыразима в принципе.
 *
 * Первый тест держит именно это различие: там, где поклеточный ярус УЖЕ ноль,
 * стратегический обязан нести склон. Если кто-то решит «упростить» слой до
 * одного яруса, тест назовёт цену.
 *
 * Второй держит связность: стратегия не течёт сквозь сплошной бетон, иначе
 * хищник ломится в стену, а не идёт в обход.
 *
 * Третий держит смысл: по склону можно дойти. Ярус меряется не значением, а
 * тем, что он приводит.
 */

const SX = 512;
const SY = 512;
const TICK = 0.5;

function feedFor(world: World, seconds: number, sx = SX, sy = SY): void {
  for (let t = 0; t < seconds / TICK; t++) {
    for (let k = 0; k < 8; k++) depositPeople(world, sx + (k & 3), sy + (k >> 2), 8);
    updatePerceptionFields(world, TICK);
  }
}

test('стратегический ярус несёт склон там, где поклеточный уже ноль', () => {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  feedFor(world, 60);

  // Поклеточный ярус на этой дистанции мёртв — это не регресс, это его природа.
  assert.equal(fieldAt(world, FieldChannel.PEOPLE, SX + 32, SY), 0);
  assert.equal(fieldAt(world, FieldChannel.PEOPLE, SX + 64, SY), 0);

  const at0 = fieldMacroAt(world, FieldChannel.PEOPLE, SX, SY);
  const at32 = fieldMacroAt(world, FieldChannel.PEOPLE, SX + 32, SY);
  const at64 = fieldMacroAt(world, FieldChannel.PEOPLE, SX + 64, SY);
  const at128 = fieldMacroAt(world, FieldChannel.PEOPLE, SX + 128, SY);

  assert.ok(at32 > 1, `на 32 клетках склон обязан быть, получено ${at32}`);
  assert.ok(at64 > 0.5, `на 64 клетках склон обязан быть, получено ${at64}`);
  // Монотонный спад: без него это не склон, а плато, и градиент не ведёт.
  assert.ok(at0 > at32 && at32 > at64 && at64 > at128,
    `профиль обязан убывать, получено ${at0} ${at32} ${at64} ${at128}`);
});

test('стратегический ярус не течёт сквозь сплошной бетон', () => {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  // Глухая стена в 32 клетки шириной — две полные ячейки яруса, чтобы проверка
  // не держалась на округлении одной ячейки.
  for (let y = 0; y < 1024; y++) {
    for (let x = SX + 48; x < SX + 80; x++) world.cells[world.idx(x, y)] = Cell.WALL;
  }
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  feedFor(world, 60);

  const before = fieldMacroAt(world, FieldChannel.PEOPLE, SX + 40, SY);
  const behind = fieldMacroAt(world, FieldChannel.PEOPLE, SX + 96, SY);
  assert.ok(before > 1, `перед стеной склон обязан быть, получено ${before}`);
  assert.ok(behind < before * 0.1,
    `за глухой стеной поле обязано глохнуть: перед ${before}, за ${behind}`);
});

test('по стратегическому склону можно дойти до источника', () => {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  feedFor(world, 60);

  let x = SX + 200;
  let y = SY;
  let steps = 0;
  for (; steps < 64; steps++) {
    const cell = fieldMacroTargetCell(world, FieldChannel.PEOPLE, x, y, +1);
    if (cell < 0) break;
    const nx = fieldCellX(cell);
    const ny = fieldCellY(cell);
    if (nx === x && ny === y) break;
    x = nx;
    y = ny;
  }
  const away = Math.hypot(world.delta(x, SX), world.delta(y, SY));
  assert.ok(away <= 24, `градиент обязан привести к источнику, остановился в ${away.toFixed(0)} клетках`);
  assert.ok(steps < 40, `дорога обязана быть короткой, получено ${steps} шагов`);
});

test('пустой канал не выдаёт склона', () => {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  updatePerceptionFields(world, TICK);

  assert.equal(fieldMacroAt(world, FieldChannel.BEASTS, SX, SY), 0);
  assert.equal(fieldMacroTargetCell(world, FieldChannel.BEASTS, SX, SY, +1), -1);
});
