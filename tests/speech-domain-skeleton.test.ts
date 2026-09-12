/* Слух и квест — это КОНТЕКСТ для речи, а не две машины.
 *
 * До 2026-09-10 у каждого был свой экземпляр одного и того же порядка:
 * запертый текст отдать как есть → собрать запрос → позвать роутер → проверить
 * ответ своими правилами → взять запасной. Различий между ними ровно два, и оба
 * не машина: КОНТЕКСТ (что домен знает о мире) и ПРАВИЛО ПРИЁМКИ (какая строка
 * для него годится). Порядок переехал в `speakDomain` (`systems/speech_router.ts`).
 *
 * Там же исчезли три копии одной двадцатистрочной функции поверхностей
 * (`markov_router_adapters`, 94 строки) и мёртвая `markov_log_speech` (145
 * строк), которую в игре не звал никто — только тесты.
 *
 * Замок держит ПОРЯДОК, а не строку: кто кого зовёт и в каком случае.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import { speakDomain } from '../src/systems/speech_router';

const LONG_ENOUGH = 200;

test('годный ответ роутера берётся как есть', () => {
  const spoken = speakDomain({
    intent: 'rumor_flavor',
    context: { tags: ['rumor'] },
    exactFallback: 'запасная строка',
    maxChars: LONG_ENOUGH,
    accept: text => text.length > 0,
  });
  assert.ok(spoken.text.length > 0);
  assert.equal(spoken.fallbackUsed, false);
  assert.ok(spoken.routed, 'ответ роутера обязан доехать до домена целиком');
});

test('негодный ответ уступает своему генератору домена', () => {
  const spoken = speakDomain({
    intent: 'procedural_quest',
    context: { tags: ['quest'] },
    exactFallback: 'запасная строка',
    maxChars: LONG_ENOUGH,
    accept: text => text === 'строка домена',
    generate: () => 'строка домена',
  });
  assert.equal(spoken.text, 'строка домена');
  assert.equal(spoken.source, 'generated_markov');
  assert.equal(spoken.fallbackUsed, false);
  assert.equal(spoken.routed, undefined, 'ответ роутера отвергнут — его не должно быть в результате');
});

test('без своего генератора негодный ответ уходит в запасную строку', () => {
  /* Это и есть разница слуха и квеста: у слуха генератора фактов нет. */
  const spoken = speakDomain({
    intent: 'rumor_flavor',
    context: { tags: ['rumor'] },
    exactFallback: 'запасная строка',
    maxChars: LONG_ENOUGH,
    accept: () => false,
  });
  assert.equal(spoken.text, 'запасная строка');
  assert.equal(spoken.source, 'curated_pool');
  assert.equal(spoken.fallbackUsed, true);
});

test('негодный ответ СВОЕГО генератора тоже уходит в запасную строку', () => {
  /* Генератор домена не привилегирован: его строку судит то же правило
   * приёмки. Иначе домен мог бы протащить мимо собственной проверки. */
  const spoken = speakDomain({
    intent: 'procedural_quest',
    context: { tags: ['quest'] },
    exactFallback: 'запасная строка',
    maxChars: LONG_ENOUGH,
    accept: () => false,
    generate: () => 'строка домена',
  });
  assert.equal(spoken.text, 'запасная строка');
  assert.equal(spoken.fallbackUsed, true);
});

test('метки домена доезжают, когда роутер своих не дал', () => {
  const spoken = speakDomain({
    intent: 'rumor_flavor',
    context: { tags: ['rumor', 'rumor.monster'] },
    exactFallback: 'запасная строка',
    maxChars: LONG_ENOUGH,
    accept: () => false,
  });
  assert.deepEqual([...spoken.tags], ['rumor', 'rumor.monster']);
});

test('ни один домен не держит своей копии порядка речи', () => {
  /* Инвариант класса: домен, зовущий роутер напрямую и разбирающий ответ сам,
   * — это третья копия скелета. Признак — впрыск роутера параметром, которым
   * прежние адаптеры и держались листьями графа импортов. */
  const offenders: string[] = [];
  for (const path of sourceFiles()) {
    if (path === 'src/systems/speech_router.ts') continue;
    const text = readFileSync(path, 'utf8');
    if (!/routeSpeech\?\.\(/.test(text)) continue;
    offenders.push(path);
  }
  assert.deepEqual(offenders, [],
    'домен снова разбирает ответ роутера сам — порядок держит speakDomain');
});

test('мёртвая система речи не вернулась', () => {
  /* `markov_log_speech` жила 145 строк и не вызывалась в игре ни разу — только
   * из тестов. Интент `log_speech` при этом ЖИВ: его шлёт барк свидетеля. */
  const paths = sourceFiles();
  assert.equal(paths.includes('src/systems/markov_log_speech.ts'), false);
  assert.equal(paths.includes('src/systems/markov_router_adapters.ts'), false);
  const router = readFileSync('src/systems/speech_router.ts', 'utf8');
  assert.ok(router.includes("'log_speech'"), 'интент свидетеля пропал вместе с мёртвым модулем');
});

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) out.push(path);
    }
  };
  walk('src');
  return out;
}
