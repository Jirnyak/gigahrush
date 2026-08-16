import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedGlobalRng } from '../src/core/rand.js';
import { COMPILED_CATEGORIES, COMPILED_TAG_BITS, COMPILED_MARKOV_GRAPH, markovEdgeCount, markovEdgeMask } from '../src/data/markov_compiled_matrix.js';
import { buildContextTagMask, generateMarkovText, pickCategoryAtom } from '../src/systems/markov_text.js';
import type { MarkovIntent } from '../src/data/markov_text.js';
import type { MarkovTextContext } from '../src/systems/markov_text.js';

/* Имена тегов, которыми игра реально описывает ситуацию (buildContextTagMask).
   Контракт: словарь матрицы обязан знать каждое из них, иначе контекст молча
   перестаёт доходить до графа — ровно та поломка, из-за которой matchBoost
   не срабатывал ни разу за игру. */
const RUNTIME_CONTEXT_TAGS = [
  'guard', 'repair', 'thirst', 'hunger', 'samosbor',
  'danger', 'hostile', 'fear', 'expensive_item', 'cheap_item',
];

const INTENTS: readonly MarkovIntent[] = [
  'talk_ambient', 'talk_context', 'log_speech', 'bark_ambient', 'procedural_quest',
  'rumor_flavor', 'demos_post', 'demos_reaction', 'document_flavor', 'lore_note',
];

function textToMask(): Map<string, number> {
  const byText = new Map<string, number>();
  for (const items of Object.values(COMPILED_CATEGORIES)) {
    for (const item of items) byText.set(item.text, (byText.get(item.text) ?? 0) | item.mask);
  }
  return byText;
}

/** Доля выбранных атомов, несущих заданный бит, на N прогонах с фиксированным сидом. */
function shareWithBit(category: string, ctx: MarkovTextContext, bit: number, runs: number): number {
  const byText = textToMask();
  seedGlobalRng(20260816);
  let hits = 0;
  for (let i = 0; i < runs; i++) {
    const mask = byText.get(pickCategoryAtom(category, ctx)) ?? 0;
    if (mask & bit) hits++;
  }
  return hits / runs;
}

test('канонический словарь тегов переживает пересборку матрицы', () => {
  for (const tag of RUNTIME_CONTEXT_TAGS) {
    const mask = COMPILED_TAG_BITS[tag];
    assert.ok(mask !== undefined && mask !== 0, `рантайм говорит тег "${tag}", словарь матрицы его не знает`);
  }

  let union = 0;
  for (const mask of Object.values(COMPILED_TAG_BITS)) {
    assert.ok(Number.isInteger(mask) && mask > 0 && mask <= 0xffffffff, 'маска тега — ненулевой int32');
    union |= mask;
  }

  // Ни один атом не несёт бита, которого нет в словаре: иначе рантайм его не соберёт.
  for (const [cat, items] of Object.entries(COMPILED_CATEGORIES)) {
    for (const item of items) {
      assert.equal(item.mask & ~union, 0, `атом ${cat}/${item.text} несёт бит вне словаря`);
      for (const axis of [item.pcaDanger, item.pcaWealth, item.pcaNeed]) {
        assert.ok(axis >= -1 && axis <= 1, `ось PCA вне [-1,1] у ${item.text}`);
      }
    }
  }

  // PCA больше не пустой: оси действительно выпущены компилятором.
  const threats = COMPILED_CATEGORIES['THREAT'] ?? [];
  assert.ok(threats.some(t => t.pcaDanger > 0), 'у угроз должна быть ненулевая ось опасности');
  const items = COMPILED_CATEGORIES['ITEM'] ?? [];
  assert.ok(items.some(i => i.pcaWealth > 0) && items.some(i => i.pcaWealth < 0),
    'ось ценности должна быть растянута между хламом и дорогим хабаром');
});

test('теги графа не константа: маски различимы и упакованы в ребро', () => {
  let edges = 0;
  let masked = 0;
  const distinct = new Set<number>();
  for (const row of Object.values(COMPILED_MARKOV_GRAPH)) {
    for (const edge of Object.values(row)) {
      edges++;
      assert.ok(markovEdgeCount(edge) >= 1, 'счётчик ребра распаковывается положительным');
      const mask = markovEdgeMask(edge);
      if (mask !== 0) masked++;
      distinct.add(mask);
    }
  }
  assert.ok(edges > 10000, `рёбер должно быть много, получено ${edges}`);
  assert.ok(masked / edges > 0.5, `маска должна быть у большинства рёбер, получено ${(masked / edges * 100).toFixed(1)}%`);
  assert.ok(distinct.size > 100, `маски обязаны различаться, различных всего ${distinct.size}`);
});

test('тег в контексте статистически сдвигает выбор атомов', () => {
  const weaponBit = COMPILED_TAG_BITS['weapon'];
  const foodBit = COMPILED_TAG_BITS['food'];
  const runs = 600;

  const weaponCtx: MarkovTextContext = { tags: ['weapon', 'combat'] };
  const foodCtx: MarkovTextContext = { tags: ['food', 'need'] };

  const weaponUnderWeapon = shareWithBit('ITEM', weaponCtx, weaponBit, runs);
  const weaponUnderFood = shareWithBit('ITEM', foodCtx, weaponBit, runs);
  assert.ok(weaponUnderWeapon > weaponUnderFood + 0.1,
    `тег weapon обязан поднимать оружие: ${weaponUnderWeapon.toFixed(3)} против ${weaponUnderFood.toFixed(3)}`);

  const foodUnderFood = shareWithBit('ITEM', foodCtx, foodBit, runs);
  const foodUnderWeapon = shareWithBit('ITEM', weaponCtx, foodBit, runs);
  assert.ok(foodUnderFood > foodUnderWeapon + 0.05,
    `тег food обязан поднимать еду: ${foodUnderFood.toFixed(3)} против ${foodUnderWeapon.toFixed(3)}`);

  // Пустой контекст не должен совпадать ни с одним из перекошенных распределений.
  const neutral = shareWithBit('ITEM', {}, weaponBit, runs);
  assert.ok(weaponUnderWeapon > neutral, 'тег обязан сдвигать выбор относительно пустого контекста');
});

test('контекст доходит до маски: bandы и числа превращаются в биты', () => {
  assert.equal(buildContextTagMask(undefined), 0);
  assert.equal(buildContextTagMask({}), 0);
  assert.ok(buildContextTagMask({ isSamosborActive: true }) & COMPILED_TAG_BITS['samosbor']);
  assert.ok(buildContextTagMask({ needBand: 'urgent' }) & COMPILED_TAG_BITS['water']);
  assert.ok(buildContextTagMask({ needBand: 'urgent' }) & COMPILED_TAG_BITS['food']);
  assert.ok(buildContextTagMask({ dangerBand: 'threat' }) & COMPILED_TAG_BITS['danger']);
  assert.ok(buildContextTagMask({ foundItemValue: 5000 }) & COMPILED_TAG_BITS['wealth']);
});

test('ноль чужих франшиз в 1000 прогонах по всем интентам', () => {
  const BANNED = [
    'чаэс', 'припять', 'чернобыль', 'сидорович', 'контролер', 'контролёр', 'снорк',
    'вднх', 'полис', 'ганза', 'меченый', 'стрелок', 'монолит', 'саркофаг', 'янтарь',
    'шухарт', 'сталкер', 'кордон',
  ];
  seedGlobalRng(4242);
  const runs = 1000;
  for (let i = 0; i < runs; i++) {
    const intent = INTENTS[i % INTENTS.length];
    const { text } = generateMarkovText({
      intent,
      context: { tags: ['danger', 'samosbor', 'trade'], dangerBand: 'combat' },
      maxChars: 200,
    });
    const lower = text.toLocaleLowerCase('ru-RU');
    for (const banned of BANNED) {
      assert.equal(lower.includes(banned), false, `интент ${intent} выдал чужую франшизу "${banned}": ${text}`);
    }
  }
});

test('реплика остаётся ограниченной по длине и непустой', () => {
  seedGlobalRng(1234);
  for (let i = 0; i < 200; i++) {
    const { text } = generateMarkovText({ intent: 'bark_ambient', context: {}, maxChars: 160 });
    assert.ok(text.length > 0, 'реплика не должна быть пустой');
    assert.ok(text.length < 400, `реплика разрослась до ${text.length} символов: ${text}`);
  }
});
