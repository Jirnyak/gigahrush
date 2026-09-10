/* Правка мира рукой ПИРА обязана двигать навигацию ХОЗЯИНА.
 *
 * Дерево инструментов в `main.ts` живёт тремя копиями: хост за пира
 * (`applyPeerToolUse`), предсказание пира (`tickPeerLocalToolResources`) и
 * локальный игрок (`updateEquippedTool` с хелперами). `markNavigationCellsDirty`
 * стоял ТОЛЬКО у локального игрока: пир ставил дверь или закладывал стену, и
 * навигация на хозяине этого не узнавала — AI хоста продолжал считать клетку
 * прежней. Отбойник при этом был исправен, потому что идёт через общий
 * `setCellToFloor`, который метку ставит сам.
 *
 * Замок держит КЛАСС, а не две починенные строки: любая запись `world.cells`,
 * меняющая ПРОХОДИМОСТЬ клетки, обязана стоять рядом с пометкой навигации.
 * Проверка статическая, потому что `applyPeerToolUse` не экспортируется и
 * поднять `main.ts` в тесте нельзя — он тянет DOM и WebGL.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Сколько строк ниже записи считается «рядом». Правка проходимости и её
 *  пометка стоят вплотную во всех живых площадках; запас взят на комментарий. */
const NEARBY_LINES = 8;

function mainSource(): string[] {
  return readFileSync('src/main.ts', 'utf8').split('\n');
}

test('запись проходимости в main.ts всегда помечает навигацию', () => {
  const lines = mainSource();
  const offenders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    /* Ловим только смену ПРОХОДИМОСТИ: пол → стена, пол → дверь и обратно.
     * Присвоения текстур, тумана и фич навигацию не двигают. */
    if (!/world\.cells\[[^\]]+\]\s*=\s*Cell\.(WALL|DOOR|FLOOR)\b/.test(line)) continue;
    const window = lines.slice(Math.max(0, i - NEARBY_LINES), i + NEARBY_LINES + 1).join('\n');
    if (window.includes('markNavigationCellsDirty')) continue;
    offenders.push(`main.ts:${i + 1}: ${line.trim()}`);
  }
  assert.deepEqual(offenders, [],
    'клетка сменила проходимость, а навигация об этом не узнала: AI пойдёт сквозь стену или упрётся в открытую дверь');
});

test('замок видит именно пометку, а не любое соседнее слово', () => {
  /* Негативный контроль САМОГО замка: без него достаточно было бы, чтобы в
   * окне встретилось что угодно, и правило стало бы бессмысленным. */
  const line = '        world.cells[ci] = Cell.DOOR;';
  assert.ok(/world\.cells\[[^\]]+\]\s*=\s*Cell\.(WALL|DOOR|FLOOR)\b/.test(line));
  assert.ok(!'world.markCellsDirty();'.includes('markNavigationCellsDirty'));
});
