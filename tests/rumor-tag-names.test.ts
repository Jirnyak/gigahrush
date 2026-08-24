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

/* Предупреждения закрыты НЕ полностью, и это осознанно записанный долг, а не
 * недосмотр. Замерено 2026-08-24: из 159 тегов предупреждений 113 не имеют
 * русского имени и печатаются игроку как «arena champion», «Маронарий beep»,
 * «same дверь sleep». Словарь работает пословно (`TAG_WORDS`), и закрыть их —
 * значит дописать около 170 словарных слов, то есть сочинить игровой текст за
 * автора: это работа сценариста, а не чистки. Долг записан в `problems.md`.
 *
 * Пока он не закрыт, замок держит границу: число утечек не имеет права расти.
 * Новый тег обязан приходить со своим русским именем. */
const KNOWN_WARNING_LEAKS = 113;

test('утечка латиницы в предупреждениях не растёт', () => {
  const tags = collectTags('warning');
  const leaked = tags.filter(tag => leaksLatin(warningTagName(tag)));
  assert.ok(leaked.length <= KNOWN_WARNING_LEAKS,
    `новых тегов без русского имени: ${leaked.length - KNOWN_WARNING_LEAKS}. `
    + `Добавьте имя в data/rumor_tag_names.ts: ${leaked.slice(-5).join(', ')}`);
  assert.equal(leaked.length, KNOWN_WARNING_LEAKS,
    `утечек стало ${leaked.length} вместо ${KNOWN_WARNING_LEAKS} — опустите порог в этом замке`);
});
