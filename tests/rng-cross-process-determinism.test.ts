/* Замок: глобальный ГСЧ стартует из КОНСТАНТЫ, а не из стенных часов.
 *
 * Пока в `core/rand.ts` стояло `let _s = (Date.now() | 0) || 1`, случайность,
 * потраченная модулями НА ИМПОРТЕ, отличалась в каждом процессе. Сбросить это
 * задним числом нельзя: `seedGlobalRng` чинит поток, но не переписывает число,
 * которое модуль уже положил себе в переменную. Замерено на `faction_events.ts`
 * (`nextEventAt`): 36 c в одном процессе и 45 c в соседнем, и один и тот же
 * прогон жилого этажа расходился по контрольной сумме между запусками.
 *
 * Проверять это в одном процессе невозможно по определению дефекта, поэтому
 * замок поднимает два ОТДЕЛЬНЫХ процесса и сверяет их вывод.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tsxBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const probe = join('tests', 'rng_boot_probe.ts');

function bootState(): string {
  const r = spawnSync(tsxBin, [probe], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(r.status, 0, `зонд загрузки упал: ${r.stderr}`);
  const line = (r.stdout || '').split('\n').map(s => s.trim()).find(s => s.startsWith('BOOT '));
  assert.ok(line, `зонд не напечатал состояние: ${r.stdout}\n${r.stderr}`);
  return line!.slice(5);
}

test('состояние глобального ГСЧ после импорта контента одинаково в разных процессах', () => {
  const a = bootState();
  const b = bootState();
  assert.equal(a, b,
    'два процесса получили разное состояние ГСЧ после импорта: значит на импорте тратится '
    + 'случайность, засеянная часами. Начальное `_s` в src/core/rand.ts обязано быть константой.');
});
