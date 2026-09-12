/* Граф Демоса слышен в поведении — `#87` старого реестра.
 *
 * `buildDemosAiSocialContext` считал смещения (`escortBias`, `fleeBias`,
 * `talkBias`, `targetHostilityBias`) и не отдавал их НИКОМУ: единственный
 * вызывающий жил в тестах. Родня, друзья и враги на поведение не влияли.
 *
 * Подключено к такту ПЕРЕОЦЕНКИ намерения, а не к кадру, и поверх него стоит
 * свой каданс. Замерено на жилом этаже, 1949 акторов, средний кадр AI:
 *   база 9.462 мс · без каданса 9.714 (+2.7 %) · с кадансом 9.496 (+0.4 %).
 *
 * ВАЖНОЕ, ЧТО ПОКАЗАЛ ЗАМЕР И ЧЕГО МОСТ НЕ ЧИНИТ: связи есть у всех 1851
 * жителя, но связанный тоже на этаже лишь у 144, и ближе 24 клеток — у ТРЁХ.
 * Медиана до ближайшего связанного 430 клеток. Граф Демоса и расстановка
 * A-Life друг о друге не знают, поэтому «семья» живёт в другом конце мира.
 * Мост работает правильно, но замечать ему почти некого; настоящая цена этой
 * механики откроется, когда расстановка начнёт сажать связанных рядом.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

test('мост графа к поведению зовётся из игры, а не только из тестов', () => {
  /* Тот самый класс, которым мост и был мёртв: функция есть, вызывающего нет.
   * Инвариант считает КОД, а не комментарии — иначе он покраснеет на
   * собственном объяснении, как это уже случалось с `Math.random`. */
  const callers = sourceFiles().filter(path => {
    if (path === 'src/systems/demos_ai_social.ts') return false;
    return /\bbuildDemosAiSocialContext\s*\(/.test(codeWithoutComments(path));
  });
  assert.ok(
    callers.length > 0,
    'граф Демоса снова не влияет на AI: buildDemosAiSocialContext не зовут из src/',
  );
});

test('смещение считается по СВОЕМУ кадансу, а не на каждой переоценке', () => {
  /* Переоценка намерения идёт каждые 1.5–4 с на человека; связи меняются
   * медленнее. Замерено: без этого каданса проход AI дорожал на 2.7 %, с ним —
   * на 0.4 %. Каданс тут не украшение, а разница между «заметно» и «в шуме». */
  const code = codeWithoutComments('src/systems/ai/npc_fsm.ts');
  assert.ok(/SOCIAL_BIAS_INTERVAL_SEC/.test(code), 'каданс социального смещения исчез');
  assert.ok(
    /socialBiasByNpc/.test(code),
    'кэш смещения исчез — значит граф снова опрашивается на каждой переоценке',
  );
});

test('смещения графа доезжают до намерений, а не оседают в контексте', () => {
  /* Контекст считает четыре смещения; если ни одно не кладётся в оценку
   * намерения, мост снова декоративен. */
  const code = codeWithoutComments('src/systems/ai/npc_fsm.ts');
  for (const [field, intent] of [['talkBias', 'social'], ['fleeBias', 'flee']] as const) {
    assert.ok(code.includes(field), `${field} не читается в разборе намерений`);
    assert.ok(code.includes(`'${intent}'`), `намерение ${intent} не получает смещения`);
  }
});

function codeWithoutComments(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

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
