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

/* ── Рука гостя и рука хозяина — один шаг ──────────────────────────────────
 *
 * Дерево инструментов жило ДВУМЯ реализациями (ветка внутри `applyPeerToolUse`
 * и обработчики локального игрока), и разошлись они не строками, а игрой:
 * отбойник, дверной набор, блок и уборка в руках гостя НЕ ИЗНАШИВАЛИСЬ вовсе,
 * а уборка не приносила отношений с хозяином земли. Сведено 2026-09-12: у
 * инструмента одна реализация, приёмник сообщений приходит параметром (строки
 * гостя глотаются — решение владельца), откат возвращается в секундах.
 *
 * Замок держит КЛАСС «один инструмент — один шаг»: каждая правка мира,
 * которую делает инструмент, обязана быть в исходнике ровно один раз.
 */

/** Правки мира, каждая из которых принадлежит одному инструменту. */
const TOOL_WORLD_EDITS: ReadonlyArray<readonly [string, string]> = [
  ['setCellToFloor(cx, cy)', 'отбойник'],
  ['world.cells[ci] = Cell.DOOR', 'дверной набор'],
  ['world.cells[ci] = Cell.WALL', 'блок стены'],
  ['cleanSurfaceArea(tx, ty', 'уборка'],
  ['world.markFogDirty()', 'пылесос'],
];

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('у каждого инструмента одна реализация правки мира', () => {
  const src = mainSource().join('\n');
  for (const [needle, tool] of TOOL_WORLD_EDITS) {
    assert.equal(occurrences(src, needle), 1,
      `${tool}: правка мира выписана не один раз — рука гостя и рука хозяина снова разойдутся`);
  }
});

test('рука гостя зовёт те же шаги, а своей правки мира не делает', () => {
  const src = mainSource().join('\n');
  const start = src.indexOf('function applyPeerToolUse');
  assert.ok(start > 0, 'ветка инструмента гостя исчезла: перепишите замок под новое место');
  const body = src.slice(start, src.indexOf('\n}\n', start));

  for (const shared of [
    'handleUvSpotlightTool(', 'handleChalkTool(', 'handleVacuumTool(',
    'handleJackhammerTool(', 'handleDoorKitTool(', 'handleBlockKitTool(', 'handleCleanupTool(',
  ]) {
    assert.ok(body.includes(shared),
      `рука гостя не зовёт общий шаг ${shared}: у неё снова своя реализация, и износ с отношениями потеряются`);
  }
  /* Обратная сторона: своих записей в мир у ветки гостя быть не должно.
   * Именно такая запись и была дешёвым путём — без износа и без отношений. */
  assert.ok(!/world\.cells\[[^\]]+\]\s*=/.test(body),
    'рука гостя снова пишет в world.cells сама, минуя общий шаг');
  assert.ok(!body.includes('consumeToolDurability'),
    'рука гостя снова считает износ сама: цену обязан назначать общий шаг');
});
