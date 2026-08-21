import '../src/systems/debug_content';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { World } from '../src/core/world';
import {
  debugCommandCount,
  debugPageCount,
  drawDebugOverlay,
  isDebugCommandPage,
  moveDebugPage,
  resetDebugPage,
} from '../src/systems/debug';
import { DEBUG_GROUPS, debugCommands } from '../src/systems/debug_registry';
import { makeGameState, makeTestPlayer } from './helpers';

/* Замок на постраничный экран отладки.
 *
 * Экран был двухколоночным: слева сводка, справа плоская лента из ста с лишним
 * пунктов без единого заголовка, а этажи шли в порядке объявления данных —
 * +50, потом -44, потом внезапно -16 и хвост из шести канонических. Читать
 * это было нечем. Здесь проверяется ровно то, что чинилось: страницы,
 * заголовки групп и высота этажа первой колонкой, сверху вниз. */

class CanvasStubContext {
  readonly canvas: { width: number; height: number };
  readonly texts: string[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  imageSmoothingEnabled = false;
  textBaseline: CanvasTextBaseline = 'alphabetic';
  textAlign: CanvasTextAlign = 'left';

  constructor(width = 1600, height = 900) {
    this.canvas = { width, height };
  }

  measureText(text: string): TextMetrics { return { width: text.length * 7 } as TextMetrics; }
  fillText(text: string, _x: number, _y: number): void { this.texts.push(text); }
  fillRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void {}
  save(): void {}
  restore(): void {}
  createLinearGradient(): CanvasGradient {
    return { addColorStop: () => {} } as unknown as CanvasGradient;
  }
  drawImage(): void {}
}

function draw(page: number, selection = 0): CanvasStubContext {
  const ctx = new CanvasStubContext();
  const world = new World();
  const player = makeTestPlayer({ id: 1, x: 10, y: 10 });
  const state = makeGameState();
  resetDebugPage();
  for (let i = 0; i < page; i++) moveDebugPage(1);
  drawDebugOverlay(ctx as unknown as CanvasRenderingContext2D, 1, 1, 1600, 900, world, [player], state, selection);
  return ctx;
}

test('этажи выстроены по высоте сверху вниз, и высота стоит первой', () => {
  const floors = debugCommands().filter(def => def.group === 'teleport');
  assert.ok(floors.length > 40, 'этажи маршрута должны попадать в меню целиком');

  const heights = floors.map(def => {
    const match = /^\s*([+-]?\d+)\s\s/.exec(def.label);
    assert.ok(match, `ярлык «${def.label}» должен начинаться с высоты этажа`);
    return Number(match[1]);
  });

  assert.deepEqual(heights, [...heights].sort((a, b) => b - a), 'этажи идут от +50 к -50 без разрывов порядка');
  assert.equal(heights[0], 50, 'первым стоит верхний этаж');
  assert.equal(heights[heights.length - 1], -50, 'последней стоит Пустота');
});

test('страница команд разбита заголовками групп', () => {
  const ctx = draw(0);
  assert.ok(isDebugCommandPage(), 'нулевая страница — команды');
  assert.ok(ctx.texts.length > 0, 'экран что-то рисует');
  assert.ok(ctx.texts.some(t => t.includes('КОМАНДЫ')), 'у страницы есть заголовок');

  const used = new Set(debugCommands().map(def => def.group));
  const drawnHeaders = DEBUG_GROUPS.filter(g => used.has(g.id) && ctx.texts.some(t => t.includes(g.title)));
  assert.ok(drawnHeaders.length >= 4, `на экране должны быть заголовки групп, найдено ${drawnHeaders.length}`);
});

test('листание влево-вправо даёт панели вместо второй колонки', () => {
  assert.equal(debugPageCount(), 1 + 3, 'команды плюс три панели');

  const world = draw(1);
  assert.ok(!isDebugCommandPage(), 'первая панель — уже не страница команд');
  assert.ok(world.texts.some(t => t.includes('МИР')), 'панель мира подписана');

  const factions = draw(2);
  assert.ok(factions.texts.some(t => t.includes('ФРАКЦИИ')), 'панель фракций подписана');

  resetDebugPage();
  assert.ok(isDebugCommandPage(), 'сброс возвращает на страницу команд');
});

test('выбранная команда видна даже в хвосте списка', () => {
  const last = debugCommandCount() - 1;
  const ctx = draw(0, last);
  const label = debugCommands()[last].label;
  assert.ok(ctx.texts.some(t => t.includes(label)), `хвостовая команда «${label}» должна попадать в окно прокрутки`);
});
