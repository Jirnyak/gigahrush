#!/usr/bin/env tsx
/* Возраст поля восприятия и его содержимое: сверка амортизации с прежним тактом.
 *
 * Печатает три вещи, и каждая — отдельный вопрос к амортизации:
 *  1) на каких кадрах КАЖДЫЙ канал реально переписывался (по изменению самой
 *     плоскости, а не по внутреннему флагу) — отсюда интервал и худший возраст;
 *  2) контрольную сумму каждой плоскости на закреплённых кадрах;
 *  3) сумму значений — чтобы расхождение читалось глазом, а не только хэшем.
 *
 * Сценарий БЕЗ доливов после старта: тогда сдвиг фазы не мешает, и поле обязано
 * сойтись байт в байт с прежним поведением на кадрах, где круг уже закрыт.
 *
 * Запуск: npx tsx scripts/perception_age_dump.ts <seed> <frames>
 */
import { World } from '../src/core/world';
import { Cell, W } from '../src/core/types';
import { seedGlobalRng, seededRandom } from '../src/core/rand';
import {
  DYNAMIC_FIELD_COUNT,
  FIELD_PLANE,
  depositField,
  prewarmPerceptionFields,
  resetPerceptionFieldsState,
  updatePerceptionFields,
} from '../src/systems/fields';

const seed = Number(process.argv[2] ?? 7);
const frames = Number(process.argv[3] ?? 240);
const dt = 1 / 60;

seedGlobalRng(seed);
const world = new World();
world.cells.fill(Cell.FLOOR);
const rnd = seededRandom(seed);
// Немного бетона, чтобы диффузия и проходимость яруса работали не вхолостую.
for (let i = 0; i < 40000; i++) {
  const x = Math.floor(rnd() * W);
  const y = Math.floor(rnd() * W);
  world.cells[world.idx(x, y)] = Cell.WALL;
}

resetPerceptionFieldsState();
world.perceptionBaked = false;
prewarmPerceptionFields(world);

// Стартовый залив: 200 источников на канал, дальше НИ ОДНОГО долива.
for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * W);
    if (world.cells[world.idx(x, y)] === Cell.WALL) continue;
    depositField(world, ch, x, y, 200);
  }
}

function planeHash(ch: number): number {
  const p = world.perceptionFields;
  const base = ch * FIELD_PLANE;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < FIELD_PLANE; i++) {
    h = (h ^ p[base + i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function planeSum(ch: number): number {
  const p = world.perceptionFields;
  const base = ch * FIELD_PLANE;
  let s = 0;
  for (let i = 0; i < FIELD_PLANE; i++) s += p[base + i];
  return s;
}

const lastHash: number[] = [];
const changeFrames: number[][] = [];
for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
  lastHash.push(planeHash(ch));
  changeFrames.push([]);
}

const lines: string[] = [];
for (let f = 0; f < frames; f++) {
  updatePerceptionFields(world, dt);
  for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
    const h = planeHash(ch);
    if (h !== lastHash[ch]) { changeFrames[ch].push(f); lastHash[ch] = h; }
  }
  // Контрольные кадры: конец каждого такта, когда круг заведомо закрыт.
  if ((f + 1) % 30 === 0) {
    for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
      lines.push(`f${f + 1}\tch${ch}\t${planeHash(ch)}\t${planeSum(ch)}`);
    }
  }
}

for (let ch = 0; ch < DYNAMIC_FIELD_COUNT; ch++) {
  const fr = changeFrames[ch];
  const gaps: number[] = [];
  for (let i = 1; i < fr.length; i++) gaps.push(fr[i] - fr[i - 1]);
  lines.push(`AGE\tch${ch}\tupdates=${fr.length}\tfirst=${fr[0] ?? -1}\tgapMin=${Math.min(...gaps)}\tgapMax=${Math.max(...gaps)}\tgapMaxSec=${(Math.max(...gaps) * dt).toFixed(4)}`);
}

process.stdout.write(lines.join('\n') + '\n');
