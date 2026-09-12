/* Имя комнаты — подпись, а не источник истины.
 *
 * Тот же закон, по которому снят `ownerForLabyrinthRoomName` («выводить хозяина
 * обратно из ИМЕНИ комнаты незачем»). В `systems/` осталось два места, где
 * поведение решалось подстрокой в подписи, и замер показал, что оба врали.
 *
 * `quests.ts` — «кабинетная работа» по подстрокам: 59 комнат при 2004
 * настоящих кабинетах, пересечение 2. А флаг решает ДЕНЬГИ: бумажная работа
 * платит умным больше (`intDocumentRewardMult`, до +70 % против +50 %).
 *
 * `caravans.ts` — «рыночная комната» по подстрокам: 346 попаданий на пяти
 * этажах, и ВСЕ 346 ложные — «Жилая #88», «Санузел #288», «Зал #880». С
 * настоящими рынками пересечение НОЛЬ, то есть место сборки каравана
 * выбиралось по случайному числу в подписи комнаты и никогда — по торговле.
 *
 * Замок держит оба вопроса на настоящих данных: типе комнаты и её теге.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RoomType } from '../src/core/types';

function codeWithoutComments(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('ни quests, ни caravans не решают по подписи комнаты', () => {
  for (const file of ['src/systems/quests.ts', 'src/systems/caravans.ts']) {
    const code = codeWithoutComments(file);
    const offenders = [...code.matchAll(/(?:room|r)\.name\.(?:includes|startsWith)\(([^)]*)\)/g)].map(m => m[1]);
    assert.deepEqual(offenders, [],
      `${file}: поведение снова решается подписью комнаты — спросите тип или тег`);
  }
});

test('кабинетная работа спрашивает тип комнаты и авторский тег', () => {
  const code = codeWithoutComments('src/systems/quests.ts');
  assert.ok(code.includes('room.type === RoomType.OFFICE'),
    'вопрос «кабинет ли это» больше не задаётся типу комнаты');
  assert.ok(code.includes("room.tags?.includes('archive')"),
    'авторский архив выпал из бумажной работы: типа в RoomType у него нет, только тег');
  // И тип обязан доезжать до зовущего: раньше он терялся в узком объекте.
  assert.ok(/pickVisitRoom[\s\S]{0,500}type: RoomType/.test(readFileSync('src/systems/quests.ts', 'utf8')),
    'pickVisitRoom снова не отдаёт тип комнаты — вопрос придётся угадывать');
});

test('место сборки каравана спрашивает торговый тип', () => {
  const code = codeWithoutComments('src/systems/caravans.ts');
  assert.ok(code.includes('RoomType.MARKET') && code.includes('RoomType.SHOP'),
    'караван снова не знает, что такое торговый ряд');
  assert.equal(typeof RoomType.MARKET, 'number', 'тип торгового ряда исчез из ядра');
});

test('проверка смотрит на код, а не на пояснение к правке', () => {
  /* Негативный контроль САМОГО замка: пояснения в исходниках НАЗЫВАЮТ снятые
   * подстроки, и без чистки комментариев замок краснел бы на собственном
   * тексте — тот же класс, что однажды случился с `Math.random` и с метками
   * оружия. */
  const raw = readFileSync('src/systems/caravans.ts', 'utf8');
  assert.ok(raw.includes('«88»'), 'пояснение о ложных «88» исчезло — контроль ниже стал пустым');
  assert.ok(!codeWithoutComments('src/systems/caravans.ts').includes('«88»'),
    'чистка комментариев не работает, замок будет ловить сам себя');
});
