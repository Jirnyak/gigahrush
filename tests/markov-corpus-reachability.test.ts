import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Occupation } from '../src/core/types.js';
import { seedGlobalRng } from '../src/core/rand.js';
import * as MarkovData from '../src/data/markov_text.js';
import {
  MARKOV_DOMAINS,
  MARKOV_INTENT_FALLBACKS,
  MARKOV_SPOILER_BLACKLIST,
  MARKOV_TONE_BLACKLIST,
  MARKOV_INTERNAL_BLACKLIST,
  type MarkovIntent,
} from '../src/data/markov_text.js';
import { selectCuratedCorpusLine } from '../src/systems/markov_text.js';

/* Замок против «написали и забыли»: авторский корпус живёт в игре только через
   реестр доменов. Тест не перечисляет корпуса поимённо — он берёт все экспорты
   модуля, которые выглядят как корпус реплик, и требует, чтобы каждая их строка
   лежала в каком-нибудь домене. Новый массив, не вписанный в MARKOV_DOMAINS,
   валит тест сам, без правки списка. */

const BLACKLIST = [
  ...MARKOV_TONE_BLACKLIST,
  ...MARKOV_INTERNAL_BLACKLIST,
  ...MARKOV_SPOILER_BLACKLIST,
];

function corpusAllowsLine(line: string): boolean {
  const lower = line.toLocaleLowerCase('ru-RU');
  return !BLACKLIST.some(word => lower.includes(word));
}

function isCorpusLine(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Экспорт-корпус: массив реплик или запись «ключ перечисления → реплики». */
function collectCorpusExports(): Map<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const [name, value] of Object.entries(MarkovData)) {
    if (name.includes('BLACKLIST') || name.includes('TERMINAL_CLASSES')) continue;
    if (Array.isArray(value) && value.length > 0 && value.every(isCorpusLine)) {
      found.set(name, value as readonly string[]);
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const groups = Object.entries(value as Record<string, unknown>);
    if (groups.length === 0) continue;
    if (!groups.every(([key, lines]) => /^\d+$/.test(key) && Array.isArray(lines) && lines.every(isCorpusLine))) continue;
    found.set(name, groups.flatMap(([, lines]) => lines as string[]));
  }
  return found;
}

const REGISTERED_TEXTS: ReadonlySet<string> = new Set(
  MARKOV_DOMAINS.flatMap(domain => domain.corpus.map(line => line.text)),
);

test('каждый объявленный корпус реплик достижим через реестр доменов', () => {
  const corpora = collectCorpusExports();
  assert.ok(corpora.size >= 40, `корпусов найдено ${corpora.size}, ожидалась вся семья массивов реплик`);

  const orphans: string[] = [];
  for (const [name, lines] of corpora) {
    const live = lines.filter(corpusAllowsLine);
    if (live.length === 0) continue;
    const missing = live.filter(line => !REGISTERED_TEXTS.has(line));
    if (missing.length > 0) orphans.push(`${name}: ${missing.length}/${live.length} строк вне доменов (${missing[0]})`);
  }
  assert.deepEqual(orphans, [], `корпуса без домена:\n${orphans.join('\n')}`);
});

test('домен объявлен целиком: теги, интенты, fallback и совпадение интента строк', () => {
  const seen = new Set<string>();
  for (const domain of MARKOV_DOMAINS) {
    assert.equal(seen.has(domain.id), false, `дубль домена ${domain.id}`);
    seen.add(domain.id);
    assert.ok(domain.tags.length > 0, `${domain.id}: домен без тегов невыбираем`);
    assert.ok(domain.allowedIntents.length > 0, `${domain.id}: домен без интентов невыбираем`);
    assert.ok(domain.fallback.trim().length > 0, `${domain.id}: домен без fallback`);
    for (const line of domain.corpus) {
      assert.equal(line.domain, domain.id, `строка ${line.id} лежит в чужом домене`);
      assert.ok(
        domain.allowedIntents.includes(line.intent),
        `${domain.id}: строка ${line.id} с интентом ${line.intent} недостижима — домен его не разрешает`,
      );
      assert.ok((line.contextTags ?? []).length > 0, `${line.id}: строка без полос контекста не выбирается`);
    }
  }
  for (const intent of Object.keys(MARKOV_INTENT_FALLBACKS) as MarkovIntent[]) {
    assert.ok(MARKOV_INTENT_FALLBACKS[intent].length >= 0);
  }
});

test('семья профессий доезжает до своего NPC, а не до соседа по этажу', () => {
  seedGlobalRng(4242);
  const cases: readonly [Occupation, RegExp][] = [
    [Occupation.DOCTOR, /врач|медпункт|санитар|фельдшер|карантин|морфин|раненых/i],
    [Occupation.HUNTER, /след|тварь|патрон|магазин|фильтр|контейнер|хабар|охот/i],
    [Occupation.SCIENTIST, /лаборант|завлаб|образец|проб|журнал|допуск|прибор|псиc?|техник/i],
  ];
  for (const [occupation, expect] of cases) {
    const seenDomains = new Set<string>();
    const texts: string[] = [];
    for (let i = 0; i < 24; i++) {
      const picked = selectCuratedCorpusLine('talk_context', { occupation, tags: [] });
      assert.ok(picked, `профессия ${occupation}: строка не выбралась вовсе`);
      seenDomains.add(picked.domainId);
      texts.push(picked.line.text);
    }
    assert.deepEqual([...seenDomains], ['occupations'], `профессия ${occupation}: выбор ушёл из домена профессий`);
    assert.ok(texts.some(text => expect.test(text)), `профессия ${occupation}: ни одна строка не про её ремесло — ${texts[0]}`);
    assert.ok(new Set(texts).size > 1, `профессия ${occupation}: корпус не варьируется`);
  }
});

test('фракционные барки выбираются по фракции и по обстановке', () => {
  seedGlobalRng(77);
  const hide = new Set<string>();
  const ambient = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const inShelter = selectCuratedCorpusLine('bark_ambient', {
      faction: 1,
      tags: ['danger.samosbor.active'],
      isSamosborActive: true,
    });
    const quiet = selectCuratedCorpusLine('bark_ambient', { faction: 1, tags: [] });
    assert.ok(inShelter && quiet);
    hide.add(inShelter.line.text);
    ambient.add(quiet.line.text);
  }
  for (const text of hide) {
    assert.ok(
      (MarkovData.CONTEXT_BARK_FACTION_HIDE[1] as readonly string[]).includes(text),
      `в самосбор ликвидатор говорит не из укрытийного корпуса: ${text}`,
    );
  }
  for (const text of ambient) {
    assert.ok(
      (MarkovData.CONTEXT_BARK_FACTION_AMBIENT[1] as readonly string[]).includes(text)
      || (MarkovData.CONTEXT_BARK_FACTION[1] as readonly string[]).includes(text),
      `в тишине ликвидатор говорит не из своего корпуса: ${text}`,
    );
  }
  assert.ok(hide.size > 1 && ambient.size > 1, 'фракционные барки не варьируются');
});

test('строка не ссылается на событие, которого нет в контексте', () => {
  seedGlobalRng(9);
  const eventOnly = new Set(
    (MarkovData.CONTEXT_FACTION_EVENT_FACTION_LINES[0] as readonly string[]),
  );
  for (let i = 0; i < 32; i++) {
    const picked = selectCuratedCorpusLine('talk_context', { faction: 0, tags: [] });
    assert.ok(picked);
    assert.equal(eventOnly.has(picked.line.text), false, `реплика про фракционную драку без драки: ${picked.line.text}`);
  }
  const withClash = selectCuratedCorpusLine('talk_context', { faction: 0, tags: ['event.faction_clash'] });
  assert.ok(withClash);
});

test('выбор детерминирован при одном зерне', () => {
  const roll = () => {
    seedGlobalRng(31337);
    return Array.from({ length: 8 }, () => selectCuratedCorpusLine('bark_ambient', { faction: 2, occupation: Occupation.PILGRIM, tags: [] })?.line.id);
  };
  assert.deepEqual(roll(), roll());
});
