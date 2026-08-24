import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPILED_CATEGORIES, COMPILED_SKELETONS, COMPILED_MARKOV_GRAPH } from '../src/data/markov_compiled_matrix.js';

test('compiled markov matrix has all categories and zero alien franchise words', () => {
  assert.ok(Object.keys(COMPILED_CATEGORIES).length >= 5, 'Must have canonical categories');
  assert.ok(COMPILED_SKELETONS.length >= 10, 'Must have syntax skeletons');
  assert.ok(Object.keys(COMPILED_MARKOV_GRAPH).length > 100, 'Graph must contain states trained from 10 corpus sources');

  const BANNED = ['сидорович', 'чаэс', 'припять', 'чернобыль', 'снорк', 'меченый', 'стрелок', 'вднх', 'полис', 'ганза', 'орден', 'саркофаг'];
  for (const [catName, items] of Object.entries(COMPILED_CATEGORIES)) {
    for (const item of items) {
      const lower = item.text.toLowerCase();
      for (const bannedWord of BANNED) {
        assert.equal(lower.includes(bannedWord), false, `Banned word "${bannedWord}" found in category ${catName}: ${item.text}`);
      }
    }
  }
});

/* Корпус собран из внешних текстов, и часть их — мета-разговор о самой вселенной
 * (треды, форумы, комментарии, имиджборды). Такие слова доходили до реплик NPC
 * и ломали иллюзию мира. Замок держит ОБЕ стороны фильтра: мусора нет, а похожие
 * внутримировые слова (подпись на ведомости, вентиляционный канал) на месте —
 * наивное расширение фильтра выкинуло бы их вместе с мусором. */
test('граф маркова: площадочных слов нет, а внутримировые соседи целы', () => {
  const tokens = new Set<string>();
  for (const [state, next] of Object.entries(COMPILED_MARKOV_GRAPH)) {
    tokens.add(state);
    for (const word of Object.keys(next)) tokens.add(word);
  }
  const PLATFORM = /^(тред|форум|коммент|сайт|абучан|двач|имиджборд|пикабу|реддит)/i;
  const found = [...tokens].filter(t => PLATFORM.test(t));
  assert.deepEqual(found, [], `Площадочные слова в графе речи: ${found.join(', ')}`);

  for (const inWorld of ['подпись', 'канализация', 'канале']) {
    assert.ok(tokens.has(inWorld), `Внутримировое слово "${inWorld}" выкошено фильтром корпуса`);
  }
});

