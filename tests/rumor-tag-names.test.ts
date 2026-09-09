/* Слух доходит до игрока двумя путями — обычным (`systems/rumor`) и марковским
 * (`systems/markov_rumor`), — и русские словари имён тегов лежали только в
 * обычном. Марковская ветка печатала сырой внутренний id: вместо «риск
 * самосбора» игрок читал `samosbor warning`, вместо «досье ЧБ» — `chernobog`.
 * Словари вынесены в `data/rumor_tag_names.ts` и общие для обоих путей.
 *
 * Замок держит сам словарь, а не путь: латиница в имени означает, что тег до
 * словаря не дошёл и утечёт в бабл. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RUMORS } from '../src/data/rumors';
import { containerTagName, warningTagName } from '../src/data/rumor_tag_names';

function collectTags(kind: 'container' | 'warning'): string[] {
  const tags = new Set<string>();
  for (const rumor of RUMORS) {
    if (!rumor.reveals) continue;
    const reveals = Array.isArray(rumor.reveals) ? rumor.reveals : [rumor.reveals];
    for (const reveal of reveals) {
      if (reveal.kind !== kind) continue;
      const tag = (reveal as { tag?: string }).tag;
      if (tag) tags.add(tag);
    }
  }
  return [...tags];
}

const leaksLatin = (text: string) => /[A-Za-z_]/.test(text);

test('каждый тег ящика назван по-русски', () => {
  const tags = collectTags('container');
  assert.ok(tags.length > 0, 'в данных не осталось ящиков — замок стал бессмысленным');
  const leaked = tags.filter(tag => leaksLatin(containerTagName(tag)));
  assert.deepEqual(leaked, [], `сырой id утечёт в реплику NPC: ${leaked.join(', ')}`);
});

/* Долг закрыт 2026-09-09: из 159 тегов предупреждений 113 не имели русского
 * имени и печатались игроку как «arena champion», «Маронарий beep», «same дверь
 * sleep». Порог был ратчетом (`KNOWN_WARNING_LEAKS = 113`); теперь это КОНТРАКТ,
 * и ратчет снят — новый тег обязан прийти со своей строкой в
 * `WARNING_TAG_NAMES`, а не подвинуть потолок.
 *
 * Замеряется словарь, а не путь: латиница в имени означает, что тег до словаря
 * не дошёл и его подсказка молча погаснет в `localizedTagName`. */
test('каждый тег предупреждения назван по-русски', () => {
  const tags = collectTags('warning');
  assert.ok(tags.length > 0, 'в данных не осталось предупреждений — замок стал бессмысленным');
  const leaked = tags.filter(tag => leaksLatin(warningTagName(tag)));
  assert.deepEqual(leaked, [],
    `подсказка погаснет у игрока. Добавьте имя в data/rumor_tag_names.ts: ${leaked.join(', ')}`);
});

/* Негативный контроль САМОГО замка: запасной ход `humanizeTag` обязан
 * по-прежнему пропускать латиницу наружу, иначе тест выше зелен всегда и не
 * ловит забытый тег. Имя выбрано заведомо отсутствующим в словаре. */
test('тег без своей строки по-прежнему виден замку', () => {
  assert.ok(leaksLatin(warningTagName('tag_that_nobody_named')));
});
