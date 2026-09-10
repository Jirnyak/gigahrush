/* Свет в руке: один ярус вместо двух.
 *
 * Ярус «горит сам, пока держишь» был написан целиком — свой расход, своё
 * замедление ходьбы, своя яркость — и не включён ни у одного предмета: поле
 * `passive` стояло `false` у всех четырёх источников света. Значит все три
 * пассивные функции возвращали ноль ВСЕГДА, а свет в игре зажигался только
 * удержанием кнопки. Ярус снят 2026-09-10 по решению владельца.
 *
 * Снос вскрыл четвёртую жертву того же мёртвого поля: `equippedToolLightScore`
 * отвечал `def?.passive ? ... : 0`, то есть тоже ноль всегда. На нём висели ТРИ
 * написанных пути — противодействие гермодверному буру, опознание светящегося
 * актора у Лишенного и его же выбор цели по свету. Удалить их значило бы снести
 * авторский контрплей вместе с мусором, поэтому вопрос переформулирован по
 * существу: «человек с фонарём?» вместо «зажат ли курок в этот кадр?».
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  activeToolLightDrainPerSecond,
  activeToolLightMoveMultiplier,
  activeToolLightRenderIntensity,
  equippedToolLightScore,
} from '../src/data/tool_lights';

const HALF = { cur: 50, max: 100 };

test('пассивного яруса больше нет ни в данных, ни в коде', () => {
  const source = readFileSync('src/data/tool_lights.ts', 'utf8');
  const code = source
    .split('\n')
    .filter(line => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
    .join('\n');
  assert.ok(!/\bpassive\b/.test(code), 'поле или функция пассивного света вернулись в код');
});

test('человек с источником света в руке заметен', () => {
  /* Именно это отвечали нулём три написанных пути. Числа взяты у самих
   * определений: фонарь ярче зажигалки, ликвидаторская лампа ярче обоих. */
  assert.ok(equippedToolLightScore('flashlight') > 0);
  assert.ok(equippedToolLightScore('lighter') > 0);
  assert.ok(equippedToolLightScore('liquidator_flashlamp') > equippedToolLightScore('flashlight'));
  assert.ok(equippedToolLightScore('flashlight') > equippedToolLightScore('lighter'));
});

test('направленный луч и не-свет заметности не дают', () => {
  /* УФ-прожектор объявил `actorLightScore: 0` сам: это направленный луч, а не
   * ореол вокруг несущего. Нож и пустая рука — тем более. */
  assert.equal(equippedToolLightScore('uv_spotlight'), 0);
  assert.equal(equippedToolLightScore('knife'), 0);
  assert.equal(equippedToolLightScore(undefined), 0);
});

test('активный свет от сноса яруса не сдвинулся', () => {
  /* Регресс-страж на само удаление: условия `!def.passive` в трёх активных
   * функциях были тождественно истинны, поэтому ответы обязаны совпасть до
   * числа. Иначе снос молча поменял бы расход батареи и яркость кадра. */
  assert.equal(activeToolLightDrainPerSecond('flashlight'), 1);
  assert.equal(activeToolLightDrainPerSecond('liquidator_flashlamp'), 1.15);
  assert.equal(activeToolLightDrainPerSecond('uv_spotlight'), 0);
  assert.equal(activeToolLightMoveMultiplier('liquidator_flashlamp'), 0.82);
  assert.equal(activeToolLightMoveMultiplier('flashlight'), 1);
  assert.equal(activeToolLightRenderIntensity('flashlight', HALF), 0.5);
  assert.equal(activeToolLightRenderIntensity('knife', HALF), 0);
  assert.equal(activeToolLightRenderIntensity('flashlight', null), 0);
});
