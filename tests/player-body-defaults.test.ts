/* Тело игрока рождается в ШЕСТИ местах, и «из чего оно сделано» — один ответ.
 *
 * Места: новая игра, загрузка сейва, смена этажа, возврат из Пустоты и две
 * сетевые (актёр гостя у хозяина, локальный актёр гостя). Пять минтят номер из
 * курсора сущностей, шестая берёт его из `PEER_LOCAL_PLAYER_ID_BASE` — это
 * разные ВХОДЫ, и сводить их нельзя. А инвариантная часть жила шестью копиями,
 * и комментарий-предупреждение был скопирован дословно ЧЕТЫРЕЖДЫ. Сам этот
 * комментарий — след прошлого дрейфа: кто-то забыл `sprite`/`spriteScale`, и
 * игрок вышел в кадр домохозяйкой в полный рост.
 *
 * Проверка статическая: `main.ts` в тесте не поднять, он тянет DOM и WebGL.
 * Тот же приём, что у `tests/coop-host-world-edits.test.ts`.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function main(): string {
  return readFileSync('src/main.ts', 'utf8');
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

test('инвариантная часть тела игрока живёт ровно в одном месте', () => {
  const s = main();
  /* Оба поля — те самые, чью пропажу оплатила домохозяйка. Если они снова
   * появятся вторым литералом, забыть их в седьмом месте станет можно. */
  assert.equal(count(s, 'spriteScale: ONLINE_PLAYER_SPRITE_SCALE'), 1,
    'масштаб силуэта игрока выписан не один раз: сведите через playerBodyDefaults()');
  assert.equal(count(s, 'speed: HUMANOID_BASE_MOVE_SPEED'), 1,
    'базовая скорость игрока выписана не один раз: сведите через playerBodyDefaults()');
});

test('все шесть мест рождения берут общую часть', () => {
  const s = main();
  assert.equal(count(s, '...playerBodyDefaults(),'), 6,
    'мест рождения тела игрока шесть; литерал, не берущий общую часть, — седьмая копия');
});

test('пол гостя приезжает ВНУТРЬ playerAlifeFields, а не рядом с ней', () => {
  /* `playerAlifeFields` расстилается последней и сама решает `sex`, `isFemale`,
   * `age` и рост. Привезённый пол, стоявший отдельным полем выше, молча
   * перетирался хозяйским — гость выходил в кадр телом хозяина. */
  const s = main();
  assert.ok(s.includes('...playerAlifeFields({ sex: importedSex })'),
    'пол гостя снова передаётся мимо playerAlifeFields и будет перетёрт хозяйским');
  /* И обратная сторона: отдельного поля `sex` в литерале тела быть не должно. */
  const bodyLiteralSex = s.split('\n').filter(line => /^\s+sex: (imp|typeof imp)/.test(line));
  assert.deepEqual(bodyLiteralSex, [], 'пол гостя вернулся отдельным полем литерала');
});
