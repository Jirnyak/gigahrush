/* Тело игрока появляется в мире ПЯТЬЮ входами, и собирает его один шаг.
 *
 * Входы: новая игра, загрузка сейва, смена этажа, возврат из Пустоты и
 * локальный актёр гостя. Четыре первых минтят номер из курсора сущностей,
 * пятый берёт его из `PEER_LOCAL_PLAYER_ID_BASE` — это разные ВХОДЫ, и сводить
 * их нельзя; сводится то, ИЗ ЧЕГО тело сделано (`buildPlayerBody`). Шестое
 * место — актёр ГОСТЯ у хозяина: другой человек с привезёнными полями и своей
 * фракцией, и он остаётся своим литералом намеренно.
 *
 * Историю дрейфа тут стоит помнить: когда-то инвариантная часть жила шестью
 * копиями с дословно скопированным предупреждением, и кто-то забыл
 * `sprite`/`spriteScale` — игрок вышел в кадр домохозяйкой в полный рост.
 * Список переноса жил двумя копиями и терял `currentMag` (см. ниже).
 *
 * Проверка статическая: `main.ts` в тесте не поднять, он тянет DOM и WebGL.
 * Тот же приём, что у `tests/coop-host-world-edits.test.ts`. Поведение пары
 * «магазин переживает смену тела» заперто отдельно и ПРОГОНОМ —
 * `tests/weapon-magazine.test.ts`; здесь охраняется только то, что шаг позван.
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

test('тело игрока собирает один шаг, и общую часть берут только он и гость', () => {
  const s = main();
  assert.equal(count(s, '...playerBodyDefaults(),'), 2,
    'общую часть тела берут ровно двое: buildPlayerBody и актёр гостя у хозяина');
  // Пять входов плюс само объявление.
  assert.equal(count(s, 'buildPlayerBody('), 6,
    'вход, не зовущий buildPlayerBody, собирает тело игрока своим литералом');
});

test('список переноса через границу мира — один, и магазин в нём', () => {
  /* Одиннадцать `saved*` были выписаны дважды дословно — на лифте и на возврате
   * из Пустоты, — и обе копии теряли `currentMag`: на границе строится НОВОЕ
   * тело, а патроны в стволе живут числом на сущности. Отдельного канала
   * магазину не нужно, нужна та же пара, что у смены оружия: убрать в слот
   * предмета до границы, достать после. Инвентарь и есть слоты, он переносится. */
  const s = main();
  assert.equal(count(s, 'capturePlayerCarry()'), 3,
    'снимок переносимого состояния снова выписан не одним шагом (объявление и два перехода)');
  assert.deepEqual(
    s.split('\n').filter(line => /^\s+const saved(Inventory|Needs|Hp|MaxHp|Weapon|Tool|Armor|Rpg|Statuses|Money) =/.test(line)),
    [], 'список переноса снова разложен по `saved*` локалам рядом с capturePlayerCarry');

  const capture = s.slice(s.indexOf('function capturePlayerCarry'), s.indexOf('function freshPlayerCarry'));
  assert.ok(capture.includes('stashEquippedMagazine(player)'),
    'снимок не убирает магазин в слот ствола: заряд не доедет до нового тела');
  const build = s.slice(s.indexOf('function buildPlayerBody'), s.indexOf('function buildPlayerBody') + 1200);
  assert.ok(build.includes('loadEquippedMagazine(body)'),
    'сборка тела не достаёт магазин из слота: ствол окажется пустым после переезда');
});
