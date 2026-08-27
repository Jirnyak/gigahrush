import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell } from '../src/core/types';
import { World } from '../src/core/world';
import {
  DYNAMIC_FIELD_COUNT,
  FIELD_PLANE,
  FIELD_TICK_SECONDS,
  FieldChannel,
  depositField,
  fieldAt,
  prewarmPerceptionFields,
  resetPerceptionFieldsState,
  updatePerceptionFields,
} from '../src/systems/fields';

/**
 * Замок амортизации полей восприятия.
 *
 * Такт полей — пять независимых проходов, и все пять шли в одном кадре: 9.7 мс
 * дважды в секунду при медиане кадра 0.001 мс. Работа размазана по кадрам, по
 * каналу на кадр, и цена такой сделки известна заранее — ПОЛЕ НЕ ИМЕЕТ ПРАВА
 * СОСТАРИТЬСЯ. Здесь заперты ровно те три условия, которыми эта сделка честна:
 *
 * 1) интервал между двумя обновлениями канала остаётся тактом, а не растёт на
 *    длину очереди;
 * 2) за N тактов КАЖДЫЙ канал обновляется ровно N раз — ни один не пропущен и
 *    ни один не обсчитан дважды;
 * 3) кадр длиной в целый такт очереди не заводит и идёт целиком, иначе
 *    крупный шаг растянул бы один такт на пять.
 */

const FRAME = 1 / 60;
const FRAMES_PER_TICK = Math.round(FIELD_TICK_SECONDS / FRAME);

function seededWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  world.perceptionBaked = true;
  return world;
}

/** Отпечаток плоскости канала: по нему видно, переписали её в этом кадре или нет. */
function planeHash(world: World, ch: number): number {
  const base = ch * FIELD_PLANE;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < FIELD_PLANE; i++) {
    h = Math.imul((h ^ world.perceptionFields[base + i]) >>> 0, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** На каких кадрах канал реально переписывался. */
function changeFrames(world: World, frames: number): number[][] {
  const last: number[] = [];
  const at: number[][] = [];
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) { last.push(planeHash(world, ch)); at.push([]); }
  for (let f = 0; f < frames; f++) {
    updatePerceptionFields(world, FRAME);
    for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
      const h = planeHash(world, ch);
      if (h !== last[ch]) { at[ch].push(f); last[ch] = h; }
    }
  }
  return at;
}

test('амортизация: интервал обновления канала остаётся тактом', () => {
  const world = seededWorld();
  // Источник на канал, далеко друг от друга: каналы не должны сливаться в один
  // отпечаток, и каждый обязан жить дольше прогона.
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) depositField(world, ch, 100 + ch * 40, 100, 255);

  const at = changeFrames(world, FRAMES_PER_TICK * 6);
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
    const fr = at[ch];
    // Четыре, а не шесть: шум гаснет за ×16 быстрее прочих и к концу прогона
    // от пятна не остаётся ничего — обновлять нечего, и это правильно.
    assert.ok(fr.length >= 4, `канал ${ch} обязан обновляться, а обновился ${fr.length} раз`);
    for (let i = 1; i < fr.length; i++) {
      assert.equal(
        fr[i] - fr[i - 1], FRAMES_PER_TICK,
        `канал ${ch}: интервал ${fr[i] - fr[i - 1]} кадров вместо ${FRAMES_PER_TICK} — поле стало старше такта`,
      );
    }
    // Фаза сдвинута на номер канала — это и есть амортизация, ровно на кадр.
    assert.equal(fr[0], FRAMES_PER_TICK + ch, `канал ${ch} обязан идти своим кадром круга`);
  }
});

test('амортизация: за N тактов каждый канал обновлён ровно N раз', () => {
  const world = seededWorld();
  /* Считаем по каналу БЕЗ расплывания: у следа диффузия ноль, поэтому клетка
   * теряет ровно `fade` за такт, и число тактов читается из самого значения. */
  const V = 200;
  depositField(world, FieldChannel.SCENT, 300, 300, V);
  const before = fieldAt(world, FieldChannel.SCENT, 300, 300);
  assert.equal(before, V);

  const rounds = 8;
  for (let f = 0; f < FRAMES_PER_TICK * rounds + FRAMES_PER_TICK; f++) updatePerceptionFields(world, FRAME);
  const after = fieldAt(world, FieldChannel.SCENT, 300, 300);
  const fadePerTick = (V - after) / rounds;
  assert.ok(Number.isInteger(fadePerTick) && fadePerTick > 0, `убыль за такт ${fadePerTick} — канал обсчитан не ровно ${rounds} раз`);
  assert.equal(after, V - fadePerTick * rounds);
});

test('амортизация: кадр длиной в такт идёт целиком, без очереди', () => {
  const world = seededWorld();
  const V = 200;
  depositField(world, FieldChannel.SCENT, 400, 400, V);
  // Один вызов с крупным шагом — один полный такт на ВСЕ каналы, как до
  // амортизации. Иначе безголовые стенды и зажатая вкладка растянули бы такт впятеро.
  updatePerceptionFields(world, FIELD_TICK_SECONDS);
  const oneTick = fieldAt(world, FieldChannel.SCENT, 400, 400);
  assert.ok(oneTick < V, 'крупный шаг обязан обсчитать канал сразу');

  updatePerceptionFields(world, FIELD_TICK_SECONDS);
  const twoTicks = fieldAt(world, FieldChannel.SCENT, 400, 400);
  assert.equal(twoTicks, V - 2 * (V - oneTick), 'второй крупный шаг обязан стоить ровно того же');
});

test('амортизация: смена этажа очередь не наследует', () => {
  const world = seededWorld();
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) depositField(world, ch, 500, 500 + ch, 255);
  // Останавливаемся ПОСРЕДИ круга: часть каналов уже обсчитана, часть ждёт.
  for (let f = 0; f < FRAMES_PER_TICK + 2; f++) updatePerceptionFields(world, FRAME);

  const next = new World();
  next.cells.fill(Cell.FLOOR);
  next.perceptionBaked = false;
  prewarmPerceptionFields(next);
  // Новый этаж начинает с ПУСТОЙ очереди: недоеденный круг прошлого этажа не
  // имеет права дообсчитаться по его грязным тайлам. Признак — круг на новом
  // этаже идёт от нулевого канала подряд, а не с середины.
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) depositField(next, ch, 600, 600 + ch, 200);
  const at = changeFrames(next, FRAMES_PER_TICK * 3);
  for (let ch = 1; ch < DYNAMIC_FIELD_COUNT; ch++) {
    assert.equal(
      at[ch][0] - at[0][0], ch,
      `канал ${ch} обязан идти своим кадром круга, а круг — начинаться с нулевого`,
    );
  }
});
