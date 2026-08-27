/* Качество имён тегов держит `rumor-tag-names.test.ts` (утечка латиницы и её
 * записанный долг). Здесь замок на другое: ДОСТИЖИМОСТЬ ветки.
 *
 * `warningTagName` получает `reveal.tag` слуха с `kind: 'warning'` — и только
 * его. Теги мировых событий (`veretar_window_sample`) и id слухов
 * (`samosbor_veretar_photo_taken`) живут в других пространствах, и написанные на
 * них авторские ветки не срабатывали никогда: слух о фото раскрывает предмет, а
 * не предупреждение. Три такие ветки были сняты; чтобы четвёртую не написали
 * снова, каждая метка `case` обязана быть настоящим тегом предупреждения. */

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

function warningSwitchCaseTags(): string[] {
  const source = readFileSync(new URL('../src/data/rumor_tag_names.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function warningTagName');
  assert.ok(start > 0, 'warningTagName не найдена в исходнике');
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/case '([a-z0-9_]+)':/g)].map(match => match[1]);
}

test('каждая ветка warningTagName отвечает на настоящий тег предупреждения', () => {
  const live = warningRevealTags();
  assert.ok(live.size > 20, 'предупреждающих слухов не осталось — замок стал бессмысленным');

  const cases = warningSwitchCaseTags();
  assert.ok(cases.length > 0, 'словарь предупреждений разобран неверно: ветки не найдены');

  const dead = cases.filter(tag => !live.has(tag));
  assert.deepEqual(dead, [],
    `эти имена не из пространства тегов предупреждения и не будут напечатаны: ${dead.join(', ')}`);
});
