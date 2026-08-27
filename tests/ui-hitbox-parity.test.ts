/*
 * Замок «нарисовано здесь — нажимается здесь».
 *
 * Класс дефекта: панель рисуется по одной арифметике, а попадание пальца
 * проверяется по другой. На мобильном промахнуться нечем — там только тап, и
 * игрок либо не попадает по видимой надписи, либо попадает в невидимый
 * прямоугольник и получает НЕ то действие.
 *
 * Что это стоило игроку до правки (замерено на холсте 640x360, ts=1.62):
 *
 *  1. Инвентарь, строка «ИСП./ВЫК.». Рисование вело её по ПОТОКУ правой колонки
 *     (описание 1..4 строк, урон, заголовок сопротивлений и по строке на
 *     каждое), попадание — по постоянному `details.y + 37*ts`. При описании в
 *     две строки текст стоял на 68.15, полоса нажатия — [82.57, 102.01]: полосы
 *     не пересекались ВООБЩЕ. В самой полосе лежала строка имени игрока, и тап
 *     по ней слева ИСПОЛЬЗОВАЛ предмет, справа — ВЫБРАСЫВАЛ.
 *  2. Инвентарь, строка СИЛ/ЛОВ/ИНТ. Прямоугольник `layout.attr` не читал никто
 *     из рисующих: на 640x360 он приходился на [123.07, 145.75], где стоит
 *     подпись полосы «ХП: n/m» (базовая линия 124.20). Тап по подписи здоровья
 *     тратил очко характеристики, а какой именно — решала горизонтальная треть.
 *  3. Журнал заданий. Полоса [py+ph-44sy, py+ph-22sy] переключала активную цель,
 *     но под ней НИЧЕГО не нарисовано: там последние строки описания квеста.
 *     Тап по тексту менял цель на карте.
 *  4. Крафт. Полоса строки при рисовании начиналась на `-2*scale`, при
 *     попадании — на `-3*scale` при шаге 12*scale. Верхняя полоска каждого
 *     рецепта выбирала соседа сверху.
 *
 * Правило, которое держит замок: геометрия строки принадлежит ОДНОЙ стороне, и
 * это сторона отрисовки. Слой нажатия обязан спрашивать у неё, а не держать
 * вторую копию арифметики.
 *
 * Каждый случай проверяется на трёх размерах холста (640x360, 480x270,
 * 320x180 — это backing store при PIXEL_SCALE = 2, то есть окна 1280x720,
 * 960x540 и 640x360) и сопровождается ОТРИЦАТЕЛЬНЫМ КОНТРОЛЕМ: та же проверка
 * по старой арифметике обязана падать.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ItemType, type Entity, type GameState, type Quest, QuestType } from '../src/core/types';
import { craftListRowRect, craftListWindow } from '../src/render/craft_ui';
import { questLogHitRects, drawQuestLog } from '../src/render/quest_ui';
import { drawInventory, inventoryActionRows } from '../src/render/stats_ui';
import { craftMenuLayout, fullscreenInventoryLayout, type UiRect } from '../src/render/ui_layout';
import { ITEMS } from '../src/data/catalog';
import { makeGameState, makeTestPlayer } from './helpers';

/** Backing store канваса; PIXEL_SCALE = 2, так что это окна вдвое шире. */
const CANVAS_SIZES: readonly (readonly [number, number])[] = [[640, 360], [480, 270], [320, 180]];

const SCR_W = 320;
const SCR_H = 200;

/** Тот же зажим, что у `canvasMenuScale` в слое меню. */
function menuScale(w: number, h: number): number {
  return Math.max(0.72, Math.min(1.68, Math.min(w / SCR_W, h / SCR_H)));
}

interface DrawnText {
  text: string;
  x: number;
  y: number;
  fontPx: number;
}

/** Канвас-заглушка, которая ЗАПОМИНАЕТ, что и куда легло. Ширина символа
 *  моноширинная — как и настоящий "Press Start 2P". */
class RecordingContext {
  readonly canvas: { width: number; height: number };
  readonly texts: DrawnText[] = [];
  readonly rects: (UiRect & { fill: string })[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  globalAlpha = 1;
  font = '10px monospace';
  imageSmoothingEnabled = false;
  textBaseline: CanvasTextBaseline = 'alphabetic';
  textAlign: CanvasTextAlign = 'start';

  constructor(width: number, height: number) {
    this.canvas = { width, height };
  }

  get fontPx(): number {
    return Number(/^(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
  }

  measureText(text: string): TextMetrics {
    return { width: text.length * this.fontPx * 0.62 } as TextMetrics;
  }

  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, fontPx: this.fontPx });
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({ x, y, w, h, fill: String(this.fillStyle) });
  }

  strokeRect(): void {}
  beginPath(): void {}
  rect(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  stroke(): void {}
  fill(): void {}
  save(): void {}
  restore(): void {}
  clip(): void {}
  translate(): void {}
  drawImage(): void {}
  createLinearGradient(): CanvasGradient {
    return { addColorStop() {} } as unknown as CanvasGradient;
  }
  createRadialGradient(): CanvasGradient {
    return { addColorStop() {} } as unknown as CanvasGradient;
  }

  as2d(): CanvasRenderingContext2D {
    return this as unknown as CanvasRenderingContext2D;
  }

  find(fragment: string): DrawnText {
    const hit = this.texts.find(t => t.text.includes(fragment));
    assert.ok(hit, `на холсте нет строки с «${fragment}»`);
    return hit!;
  }
}

/** Полоса глифов строки, положенной по базовой линии: буквы стоят НАД ней. */
function glyphBand(line: DrawnText): { top: number; bottom: number; center: number } {
  const top = line.y - line.fontPx;
  const bottom = line.y;
  return { top, bottom, center: (top + bottom) / 2 };
}

function bandInside(line: DrawnText, rect: UiRect): boolean {
  const band = glyphBand(line);
  return band.top >= rect.y - 0.001 && band.bottom <= rect.y + rect.h + 0.001;
}

function yInside(y: number, rect: UiRect): boolean {
  return y >= rect.y - 0.001 && y <= rect.y + rect.h + 0.001;
}

/* ────────────────────────────────────────────────────────────────
 * 1 и 2. Инвентарь: «ИСП./ВЫК.» и СИЛ/ЛОВ/ИНТ
 * ──────────────────────────────────────────────────────────────── */

function inventoryFixture(descLines: 'short' | 'long'): { player: Entity; state: GameState } {
  // Предмет с сопротивлениями и длинным описанием — худший случай потока:
  // описание в несколько строк, заголовок сопротивлений и строка на каждое.
  const armor = Object.values(ITEMS).find(def => def.resistances && Object.keys(def.resistances).length >= 2);
  assert.ok(armor, 'в каталоге нет предмета с сопротивлениями');
  const plain = Object.values(ITEMS).find(def => !def.resistances && def.type !== ItemType.WEAPON && (def.desc?.length ?? 0) < 40);
  assert.ok(plain, 'в каталоге нет предмета с коротким описанием');
  const def = descLines === 'long' ? armor! : plain!;
  const player = makeTestPlayer({
    hp: 70,
    maxHp: 100,
    inventory: [{ defId: def.id, count: 1 }],
    rpg: { level: 3, xp: 12, attrPoints: 2, str: 5, agi: 4, int: 7, psi: 20, maxPsi: 40 },
    needs: { food: 60, water: 55, sleep: 70, pee: 20 },
  });
  const state = makeGameState({ invSel: 0 });
  return { player, state };
}

test('инвентарь: строка «ИСП./ВЫК.» нажимается там, где нарисована', () => {
  for (const [w, h] of CANVAS_SIZES) {
    for (const kind of ['short', 'long'] as const) {
      const { player, state } = inventoryFixture(kind);
      const ctx = new RecordingContext(w, h);
      drawInventory(ctx.as2d(), player, state, w / SCR_W, h / SCR_H, 0);

      const rows = inventoryActionRows(ctx.as2d(), player, state, w / SCR_W, h / SCR_H);
      assert.ok(rows.drop, `${w}x${h}/${kind}: нет полосы «вык.»`);
      const drop = ctx.find('вык.');
      assert.ok(
        bandInside(drop, rows.drop!),
        `${w}x${h}/${kind}: «вык.» нарисована на ${drop.y.toFixed(2)}, полоса [${rows.drop!.y.toFixed(2)}, ${(rows.drop!.y + rows.drop!.h).toFixed(2)}]`,
      );
      assert.ok(drop.x >= rows.drop!.x - 0.001 && drop.x <= rows.drop!.x + rows.drop!.w + 0.001);

      if (rows.use) {
        const use = ctx.find('исп.');
        assert.ok(bandInside(use, rows.use), `${w}x${h}/${kind}: «исп.» вне своей полосы`);
      }

      // Соседи не должны попадать в ту же полосу: сверху «Цена», снизу имя игрока.
      const price = ctx.find('Цена:');
      assert.ok(!bandInside(price, rows.drop!), `${w}x${h}/${kind}: «Цена» попала в полосу действий`);
    }
  }
});

test('ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ: постоянный отступ details.y + 37*ts мимо строки действий', () => {
  // Короткое описание — один такт потока, и строка действий встаёт ВЫШЕ старой
  // полосы. Совпадение полос у старой арифметики было случайностью содержимого:
  // на предмете с сопротивлениями они пересекались, на обычном — нет.
  let missed = 0;
  for (const [w, h] of CANVAS_SIZES) {
    const { player, state } = inventoryFixture('short');
    const ctx = new RecordingContext(w, h);
    drawInventory(ctx.as2d(), player, state, w / SCR_W, h / SCR_H, 0);
    const layout = fullscreenInventoryLayout(w, h, w / SCR_W, h / SCR_H);
    // Старая арифметика слоя нажатия, дословно.
    const old: UiRect = {
      x: layout.drop.x,
      y: layout.details.y + 37 * layout.textScale,
      w: layout.drop.w,
      h: 12 * layout.textScale,
    };
    const drop = ctx.find('вык.');
    const overlaps = glyphBand(drop).bottom > old.y && glyphBand(drop).top < old.y + old.h;
    if (!overlaps) missed++;
  }
  assert.equal(missed, CANVAS_SIZES.length, 'старая полоса обязана промахиваться на всех трёх размерах');
});

test('инвентарь: сегменты СИЛ/ЛОВ/ИНТ лежат под своими же буквами', () => {
  for (const [w, h] of CANVAS_SIZES) {
    const { player, state } = inventoryFixture('long');
    const ctx = new RecordingContext(w, h);
    drawInventory(ctx.as2d(), player, state, w / SCR_W, h / SCR_H, 0);

    const rows = inventoryActionRows(ctx.as2d(), player, state, w / SCR_W, h / SCR_H);
    assert.equal(rows.attr.length, 3, `${w}x${h}: ожидались три сегмента характеристик`);
    assert.deepEqual(rows.attr.map(a => a.key), ['str', 'agi', 'int']);

    const attrLine = ctx.find('СИЛ ');
    for (const { key, rect } of rows.attr) {
      assert.ok(
        bandInside(attrLine, rect),
        `${w}x${h}/${key}: строка характеристик на ${attrLine.y.toFixed(2)}, полоса [${rect.y.toFixed(2)}, ${(rect.y + rect.h).toFixed(2)}]`,
      );
    }
    // Сегменты идут слева направо, стыкуются и не выходят за нарисованный текст.
    const lineW = attrLine.text.length * attrLine.fontPx * 0.62;
    assert.ok(Math.abs(rows.attr[0].rect.x - attrLine.x) < 0.001);
    for (let i = 1; i < rows.attr.length; i++) {
      const prev = rows.attr[i - 1].rect;
      assert.ok(Math.abs(prev.x + prev.w - rows.attr[i].rect.x) < 0.001, `${w}x${h}: сегменты не стыкуются`);
    }
    const last = rows.attr[2].rect;
    assert.ok(last.x + last.w <= attrLine.x + lineW + 0.001, `${w}x${h}: сегмент шире нарисованной строки`);

    // Подпись «ХП» — соседняя строка и в полосы характеристик попадать не смеет.
    const hp = ctx.find('ХП:');
    for (const { rect } of rows.attr) {
      assert.ok(!bandInside(hp, rect), `${w}x${h}: подпись ХП попала в полосу характеристик`);
    }
  }
});

test('ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ: layout.attr стоит на чужой строке, а не на характеристиках', () => {
  let wrong = 0;
  for (const [w, h] of CANVAS_SIZES) {
    const { player, state } = inventoryFixture('short');
    const ctx = new RecordingContext(w, h);
    drawInventory(ctx.as2d(), player, state, w / SCR_W, h / SCR_H, 0);
    const old = fullscreenInventoryLayout(w, h, w / SCR_W, h / SCR_H).attr;
    const attrLine = ctx.find('СИЛ ');
    const strangers = ctx.texts.filter(t => t !== attrLine && yInside(t.y, old));
    if (!bandInside(attrLine, old) && strangers.length > 0) wrong++;
  }
  assert.equal(wrong, CANVAS_SIZES.length, 'старый прямоугольник обязан стоять на чужой строке');
});

/* ────────────────────────────────────────────────────────────────
 * 3. Журнал заданий: полоса переключения активной цели
 * ──────────────────────────────────────────────────────────────── */

function questFixture(): GameState {
  const quests: Quest[] = [1, 2].map(id => ({
    id,
    type: QuestType.KILL,
    desc: 'Зачистить техэтаж от крыс. Длинное описание, которое занимает несколько строк подряд и доходит до самого низа панели журнала заданий.',
    done: false,
    giverName: 'Сосед',
    targetMonsterKind: 0,
    killNeeded: 3,
    killCount: 0,
  } as unknown as Quest));
  return makeGameState({ quests, questPage: 0, showQuests: true });
}

test('журнал заданий: активная цель переключается под своей же надписью', () => {
  for (const [w, h] of CANVAS_SIZES) {
    const s = menuScale(w, h);
    const state = questFixture();
    const ctx = new RecordingContext(w, h);
    drawQuestLog(ctx.as2d(), state, s, s, 0, null);

    const rects = questLogHitRects(ctx.as2d(), state, s, s);
    assert.ok(rects.toggleActive, `${w}x${h}: нет полосы переключения цели`);
    const hint = ctx.find('цель на карте');
    const toggle = rects.toggleActive!;

    // Слова «цель на карте» нарисованы внутри полосы и по вертикали, и по горизонтали.
    assert.ok(yInside(glyphBand(hint).center, toggle), `${w}x${h}: подсказка вне полосы по вертикали`);
    const startX = hint.x + hint.text.indexOf('цель на карте') * hint.fontPx * 0.62;
    const endX = startX + 'цель на карте'.length * hint.fontPx * 0.62;
    assert.ok(startX >= toggle.x - 0.001 && endX <= toggle.x + toggle.w + 0.001,
      `${w}x${h}: слова [${startX.toFixed(2)}, ${endX.toFixed(2)}] вне полосы [${toggle.x.toFixed(2)}, ${(toggle.x + toggle.w).toFixed(2)}]`);

    // «Закрыть» нарисовано в полосе закрытия и НЕ попадает в полосу переключения.
    const closeIdx = hint.text.indexOf('закрыть');
    assert.ok(closeIdx >= 0);
    const closeX = hint.x + closeIdx * hint.fontPx * 0.62;
    assert.ok(closeX >= toggle.x + toggle.w - 0.001, `${w}x${h}: «закрыть» попало в полосу переключения цели`);
    assert.ok(yInside(glyphBand(hint).center, rects.close));
  }
});

test('ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ: старая полоса [ph-44sy, ph-22sy] лежит выше своей подсказки', () => {
  let blind = 0;
  for (const [w, h] of CANVAS_SIZES) {
    const s = menuScale(w, h);
    const state = questFixture();
    const ctx = new RecordingContext(w, h);
    drawQuestLog(ctx.as2d(), state, s, s, 0, null);

    const pw = Math.min(400 * s, w - 24 * s);
    const ph = Math.min(320 * s, h - 24 * s);
    const py = (h - ph) / 2;
    const old: UiRect = { x: (w - pw) / 2, y: py + ph - 44 * s, w: pw, h: 22 * s };
    const hint = ctx.find('цель на карте');
    const band = glyphBand(hint);
    // Единственная надпись, которая объясняет действие, лежит НИЖЕ полосы целиком:
    // в самой полосе идёт содержимое квеста и объяснения действию нет вовсе.
    const explains = band.bottom > old.y && band.top < old.y + old.h;
    const newRect = questLogHitRects(ctx.as2d(), state, s, s).toggleActive!;
    if (!explains && yInside(band.center, newRect)) blind++;
  }
  assert.equal(blind, CANVAS_SIZES.length, 'старая полоса обязана быть слепой на всех трёх размерах');
});

/* ────────────────────────────────────────────────────────────────
 * 4. Крафт: строка рецепта
 * ──────────────────────────────────────────────────────────────── */

test('крафт: полоса строки рецепта совпадает с нарисованной подсветкой', () => {
  for (const [w, h] of CANVAS_SIZES) {
    const layout = craftMenuLayout(w, h);
    const s = layout.scale;
    const win = craftListWindow(layout, 40, 0);

    for (let row = 0; row < win.visibleRows; row++) {
      const rect = craftListRowRect(layout, win, row);
      // Базовая линия текста строки лежит внутри своей же полосы.
      const baseline = rect.y + 2 * s;
      assert.ok(yInside(baseline, rect), `${w}x${h}: базовая линия строки ${row} вне полосы`);
      // Полосы стыкуются без щелей и нахлёстов: между рецептами нет мёртвой зоны.
      if (row > 0) {
        const prev = craftListRowRect(layout, win, row - 1);
        assert.ok(Math.abs(prev.y + prev.h - rect.y) < 1e-9, `${w}x${h}: щель между строками ${row - 1} и ${row}`);
      }
    }
  }
});

test('ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ: старое начало строки -3*scale сдвигало выбор на строку вверх', () => {
  let shifted = 0;
  for (const [w, h] of CANVAS_SIZES) {
    const layout = craftMenuLayout(w, h);
    const s = layout.scale;
    const win = craftListWindow(layout, 40, 0);
    const row = 3;
    const drawn = craftListRowRect(layout, win, row);
    // Старая арифметика слоя нажатия, дословно.
    const old: UiRect = { x: layout.list.x, y: win.listTop + row * layout.rowH - 3 * s, w: layout.list.w, h: layout.rowH };
    assert.ok(Math.abs(old.y - drawn.y) > 1e-9, `${w}x${h}: старая полоса не отличалась от нарисованной`);
    // Точка в спорной полоске: нарисована как строка row-1, нажималась как row.
    const probe = old.y + 0.5 * s;
    const above = craftListRowRect(layout, win, row - 1);
    if (yInside(probe, above) && yInside(probe, old) && !yInside(probe, drawn)) shifted++;
  }
  assert.equal(shifted, CANVAS_SIZES.length, 'старая полоса обязана красть полоску у соседа сверху');
});
