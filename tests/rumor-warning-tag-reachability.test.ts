/* Качество имён тегов держит `rumor-tag-names.test.ts` (утечка латиницы и её
 * записанный долг). Здесь замок на другое: ДОСТИЖИМОСТЬ ветки.
 *
 * `warningTagName` получает `reveal.tag` слуха с `kind: 'warning'` — и только
 * его. Теги мировых событий (`veretar_window_sample`) и id слухов
 * (`samosbor_veretar_photo_taken`) живут в других пространствах, и написанные на
 * них авторские ветки не срабатывали никогда: слух о фото раскрывает предмет, а
 * не предупреждение. Три такие ветки были сняты; чтобы четвёртую не написали
 * снова, каждое имя в словаре обязано быть настоящим тегом предупреждения.
 *
 * С 2026-09-09 словарь — таблица `WARNING_TAG_NAMES`, а не `switch`: имя пишется
 * целиком на тег, потому что пословная сборка давала подстрочник. Замок читает
 * таблицу; ловушка та же самая и цена ошибки та же — ненайденное имя молча
 * гаснет у игрока. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { RUMORS } from '../src/data/rumors';

function warningRevealTags(): Set<string> {
  const tags = new Set<string>();
  for (const rumor of RUMORS) {
    if (!rumor.reveals) continue;
    const reveals = Array.isArray(rumor.reveals) ? rumor.reveals : [rumor.reveals];
    for (const reveal of reveals) {
      if (reveal.kind !== 'warning') continue;
      const tag = (reveal as { tag?: string }).tag;
      if (tag) tags.add(tag);
    }
  }
  return tags;
}

function warningDictionaryTags(): string[] {
  const source = readFileSync(new URL('../src/data/rumor_tag_names.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const WARNING_TAG_NAMES');
  assert.ok(start > 0, 'WARNING_TAG_NAMES не найдена в исходнике');
  const body = source.slice(start, source.indexOf('\n};', start));
  return [...body.matchAll(/^ {2}([a-z0-9_]+): '/gm)].map(match => match[1]);
}

test('каждое имя в словаре предупреждений отвечает на настоящий тег', () => {
  const live = warningRevealTags();
  assert.ok(live.size > 20, 'предупреждающих слухов не осталось — замок стал бессмысленным');

  const named = warningDictionaryTags();
  assert.ok(named.length > 20, 'словарь предупреждений разобран неверно: имена не найдены');

  const dead = named.filter(tag => !live.has(tag));
  assert.deepEqual(dead, [],
    `эти имена не из пространства тегов предупреждения и не будут напечатаны: ${dead.join(', ')}`);

  const duplicated = named.filter((tag, i) => named.indexOf(tag) !== i);
  assert.deepEqual(duplicated, [], 'имя тега написано дважды: второе молча побеждает');
});
