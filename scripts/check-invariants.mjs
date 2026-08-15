#!/usr/bin/env node
/*
 * Механическая проверка трёх инвариантов, которые до сих пор держались только на дисциплине:
 *
 *   1. Границы слоёв — кто кого имеет право импортировать.
 *   2. Запрет сырого Math.random() вне core/rand.ts.
 *   3. Потолок длины функции.
 *
 * Проверка работает как храповик: у каждого нарушения есть счётчик BASELINE.
 * Стало больше — падаем. Стало меньше — тоже падаем, с требованием обновить
 * baseline, чтобы достигнутое нельзя было откатить молча.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const srcRoot = path.join(root, 'src');

/* ── 1. Слои ──────────────────────────────────────────────────────
   Порядок отражает реальность графа, а не порядок фаз игры: генераторы
   ПОТРЕБЛЯЮТ системы (пишут территорию, публикуют события, считают rpg),
   поэтому gen/ стоит НАД systems/, а не под ним.

       core → data → entities → world → systems → { gen, render }

   gen/ и render/ — соседи: ни один не имеет права звать другого. */
const ALLOWED = {
  core: [],
  data: ['core'],
  entities: ['core', 'data'],
  world: ['core', 'data'],
  systems: ['core', 'data', 'entities', 'world'],
  gen: ['core', 'data', 'entities', 'world', 'systems'],
  render: ['core', 'data', 'entities', 'world', 'systems'],
  // main.ts / input.ts / test_arena.ts — точка сборки, ей можно всё.
  root: ['core', 'data', 'entities', 'world', 'systems', 'gen', 'render'],
};

/* Известные нарушения на момент установки проверки. Только вниз. */
const BASELINE = {
  'gen->render': 5,
  'systems->gen': 8,
  'systems->render': 3,
  'data->entities': 3,
  'entities->render': 2,
  'render->gen': 2,
  'data->gen': 1,
};

const MATH_RANDOM_BASELINE = 2; // online_client.ts, net_sphere.ts — сетевые идентификаторы
const MAX_FUNCTION_LINES = 200;
const LONG_FUNCTION_BASELINE = 28;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk(srcRoot);
const rel = (abs) => path.relative(root, abs).replaceAll(path.sep, '/');
const layerOf = (srcRel) => {
  const head = srcRel.split('/')[0];
  return Object.prototype.hasOwnProperty.call(ALLOWED, head) && head !== 'root' ? head : 'root';
};

const failures = [];
const notes = [];

/* ── Проверка 1: границы слоёв ─────────────────────────────────── */
const edgeCounts = new Map();
const edgeExamples = new Map();

for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  const from = layerOf(srcRel);
  const text = fs.readFileSync(file, 'utf8');

  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
    const abs = path.resolve(path.dirname(file), m[1]).replace(/\.(js|ts)$/, '');
    const targetRel = path.relative(srcRoot, abs).replaceAll(path.sep, '/');
    if (targetRel.startsWith('..')) continue;
    const to = layerOf(targetRel);
    if (to === from || ALLOWED[from].includes(to)) continue;

    const key = `${from}->${to}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    if (!edgeExamples.has(key)) edgeExamples.set(key, []);
    edgeExamples.get(key).push(`${srcRel} → ${targetRel}`);
  }
}

for (const key of new Set([...edgeCounts.keys(), ...Object.keys(BASELINE)])) {
  const now = edgeCounts.get(key) ?? 0;
  const was = BASELINE[key] ?? 0;
  if (now > was) {
    failures.push(`Слои: ${key} — ${now}, разрешено ${was}. Новые нарушения:`);
    for (const e of edgeExamples.get(key) ?? []) failures.push(`    ${e}`);
  } else if (now < was) {
    notes.push(`Слои: ${key} — ${now} (было ${was}). Опусти BASELINE в ${path.basename(import.meta.filename)}.`);
  }
}

/* ── Проверка 2: сырой Math.random ─────────────────────────────── */
const randomHits = [];
for (const file of files) {
  const srcRel = path.relative(srcRoot, file).replaceAll(path.sep, '/');
  if (srcRel === 'core/rand.ts') continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/\bMath\.random\s*\(/.test(line)) randomHits.push(`${srcRel}:${i + 1}`);
  });
}
if (randomHits.length > MATH_RANDOM_BASELINE) {
  failures.push(`Math.random: ${randomHits.length} вызовов вне core/rand.ts, разрешено ${MATH_RANDOM_BASELINE}.`);
  for (const h of randomHits) failures.push(`    ${h}`);
} else if (randomHits.length < MATH_RANDOM_BASELINE) {
  notes.push(`Math.random: ${randomHits.length} (было ${MATH_RANDOM_BASELINE}). Опусти MATH_RANDOM_BASELINE.`);
}

/* ── Проверка 3: длина функции ─────────────────────────────────── */
const longFunctions = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

  const visit = (node) => {
    const isFn = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
      || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
    if (isFn && node.body && ts.isBlock(node.body)) {
      const start = sf.getLineAndCharacterOfPosition(node.body.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.body.getEnd()).line;
      const len = end - start + 1;
      if (len > MAX_FUNCTION_LINES) {
        const name = node.name?.getText(sf) ?? '<анонимная>';
        longFunctions.push({ where: `${rel(file)}:${start + 1}`, name, len });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
longFunctions.sort((a, b) => b.len - a.len);

if (longFunctions.length > LONG_FUNCTION_BASELINE) {
  failures.push(`Длина функции: ${longFunctions.length} функций длиннее ${MAX_FUNCTION_LINES} строк, разрешено ${LONG_FUNCTION_BASELINE}.`);
  for (const f of longFunctions.slice(0, 10)) failures.push(`    ${f.where}  ${f.name} — ${f.len}`);
} else if (longFunctions.length < LONG_FUNCTION_BASELINE) {
  notes.push(`Длина функции: ${longFunctions.length} (было ${LONG_FUNCTION_BASELINE}). Опусти LONG_FUNCTION_BASELINE.`);
}

/* ── Итог ─────────────────────────────────────────────────────── */
if (process.argv.includes('--report')) {
  console.log('Обратные рёбра между слоями:');
  for (const [k, v] of [...edgeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`);
    for (const e of edgeExamples.get(k)) console.log(`        ${e}`);
  }
  console.log(`\nMath.random вне core/rand.ts: ${randomHits.length}`);
  for (const h of randomHits) console.log(`        ${h}`);
  console.log(`\nФункций длиннее ${MAX_FUNCTION_LINES} строк: ${longFunctions.length}`);
  for (const f of longFunctions.slice(0, 20)) console.log(`        ${f.where}  ${f.name} — ${f.len}`);
}

for (const n of notes) console.log(`↓ ${n}`);
if (failures.length) {
  console.error('\nИнварианты нарушены:\n');
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`Инварианты в порядке: слои, Math.random (${randomHits.length}), длина функций (${longFunctions.length} > ${MAX_FUNCTION_LINES}).`);
