/* Замок: коллекторы не генерируют контент чужого этажа.
 *
 * История. `src/gen/maintenance/content_manifest.ts` звал
 * `generateLiquidatorBaseArena` из пакета Базы Ликвидаторов и штамповал её
 * арену 50×50 в середину коллекторов. Замерено на трёх сидах ДО правки
 * (`e690df77^`, z = -26, сиды 1 · 61061 · 4242): комната «Арена» 2500 клеток —
 * крупнейшая на этаже, вдвое больше следующей, — и 627 · 637 · 586 стульев,
 * то есть ковёр мебели по всему залу. Каждый стул ставит блокиратор пути.
 * ПОСЛЕ: 0 комнат арены и 17 стульев на всех трёх сидах.
 *
 * Замок держит обе стороны правила, потому что дефект умеет вернуться двумя
 * путями: импортом из чужой папки и просто копией генератора внутрь своей.
 *
 *   1. Ни один файл пакета `gen/maintenance/` не импортирует из другого пакета
 *      этажа. Корневые `gen/*.ts` (shared, floor_manifest, log и прочая общая
 *      инфраструктура) правилом не запрещены: инвариант генерации ставится
 *      один раз, а не копируется по 51 этажу.
 *   2. Сгенерированные коллекторы не несут комнаты арены — ни по тегу `arena`,
 *      по которому туда ходят претенденты чемпиона и разборки NPC, ни по имени
 *      «Арена». Арена живёт на Базе Ликвидаторов (z = -12), и её замок —
 *      `tests/liquidatorbase-layers.test.ts`.
 *
 * Общий счёт рёбер между ВСЕМИ пакетами этажей держит `npm run check:invariants`
 * (проверка 4.1). Здесь — адресная проверка коллекторов и, главное, факт мира:
 * инвариант читает импорты, а этот тест смотрит на сгенерированный этаж.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/content';
import { seedGlobalRng } from '../src/core/rand';
import { generateFloor } from '../src/gen/floor_manifest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GEN_ROOT = path.join(REPO_ROOT, 'src', 'gen');
const OWNER = 'maintenance';

/** Коллекторы. Канон — числовой `z` из `DESIGN_FLOOR_ROUTES`. */
const COLLECTORS_Z = -26;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

test('коллекторы не импортируют из пакета другого этажа', () => {
  const floorPackages = new Set(
    fs.readdirSync(GEN_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'design_floors')
      .map(e => e.name),
  );

  const edges: string[] = [];
  for (const file of listTsFiles(path.join(GEN_ROOT, OWNER))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from\s+|^\s*import\s+|require\()['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = path.relative(GEN_ROOT, path.resolve(path.dirname(file), spec))
        .replaceAll(path.sep, '/');
      if (target.startsWith('..')) continue;
      const targetPackage = target.split('/')[0];
      if (targetPackage === OWNER || !floorPackages.has(targetPackage)) continue;
      edges.push(`${path.relative(REPO_ROOT, file)} → gen/${targetPackage} (${spec})`);
    }
  }

  assert.deepEqual(edges, [],
    'этаж — замкнутый субмодуль: если модуль нужен коллекторам, он лежит у них, а не в чужом пакете');
});

test('на сгенерированных коллекторах нет арены чужого этажа', () => {
  for (const seed of [1, 4242]) {
    seedGlobalRng(0xa5e1 + seed);
    const { world } = generateFloor(COLLECTORS_Z, seed);

    const tagged = world.rooms.filter(r => r?.tags?.includes('arena'));
    assert.equal(tagged.length, 0,
      `сид ${seed}: комната с тегом \`arena\` на коллекторах — арена живёт на Базе Ликвидаторов`);

    const named = world.rooms.filter(r => r?.name === 'Арена');
    assert.equal(named.length, 0, `сид ${seed}: комната «Арена» вернулась на коллекторы`);
  }
});
