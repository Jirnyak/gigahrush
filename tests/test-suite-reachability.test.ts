import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

function collectTestFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTestFiles(full, `${prefix}${entry}/`));
    } else if (entry.endsWith('.test.ts')) {
      out.push(`${prefix}${entry}`);
    }
  }
  return out;
}

// Оба раннера (`scripts/run-unit-tests.mjs`, `run-generation-tests.mjs`) читают
// только верхний уровень `tests/`. Файл, положенный в подкаталог, не запускается
// НИКОГДА и при этом выглядит как покрытие. Раньше так молча простаивали 17 файлов.
test('no test file is parked in a tests/ subdirectory where no runner can see it', () => {
  const nested = collectTestFiles(TESTS_DIR).filter(name => name.includes('/'));
  assert.deepEqual(nested, [], `unreachable test files: ${nested.join(', ')}`);
});

// Пустой файл-призрак проходит как «успешный файл с нулём тестов» и тихо
// уменьшает покрытие, не роняя ни один гейт.
test('no test file is an empty placeholder without a single test case', () => {
  const empty: string[] = [];
  for (const name of collectTestFiles(TESTS_DIR)) {
    const source = readFileSync(join(TESTS_DIR, name), 'utf8');
    // `testGenerationMatrix` — обёртка проекта над `test`, тоже объявляет кейс.
    if (!/\btest\s*\(|\btestGenerationMatrix\s*\(|\bdescribe\s*\(|\bit\s*\(/.test(source)) empty.push(name);
  }
  assert.deepEqual(empty, [], `test files without any test case: ${empty.join(', ')}`);
});
