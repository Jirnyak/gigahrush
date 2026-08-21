/* Занятие без своего спрайта не должно молча садиться на чужое лицо.
 *
 * Так и было: `Occupation` вырос до 23 значений, а лист спрайтов занятий остался
 * шириной 18 (13 жильцов + путники + батюшка + перформер), и хвост занятий уехал
 * в диапазон авторских личностей — уборщица рисовалась Ветераном Степанычем,
 * работница 69-го Гордоном Фрименом, инженер Мадокой, учитель Пахомом. В зале
 * пролога это читалось как ряд одинаковых дедов с медалями.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { NPC_SPRITE_GENERATORS } from '../src/entities/npc';
import { Spr, isAuthoredNpcSpr } from '../src/entities/sprite_index';
import { isNpcSpecialSprite } from '../src/entities/npc_visuals';
import { Occupation } from '../src/core/types';

function occupationValues(): number[] {
  return Object.values(Occupation).filter((value): value is number => typeof value === 'number');
}

test('every occupation has its own sprite generator', () => {
  for (const occupation of occupationValues()) {
    assert.equal(typeof NPC_SPRITE_GENERATORS[occupation], 'function',
      `у занятия ${Occupation[occupation]} (${occupation}) нет спрайта`);
  }
});

test('occupation sprite ids never reach into the authored personality range', () => {
  for (const occupation of occupationValues()) {
    assert.equal(occupation < Spr.AUTHORED_NPC_BASE, true,
      `занятие ${Occupation[occupation]} (${occupation}) залезло в диапазон авторских личностей`);
    assert.equal(isAuthoredNpcSpr(occupation), false,
      `занятие ${Occupation[occupation]} рисуется авторской личностью`);
    assert.equal(isNpcSpecialSprite(occupation), false,
      `занятие ${Occupation[occupation]} считается особым спрайтом`);
  }
});

test('the occupation sprite block is exactly as wide as the enum', () => {
  // Шире — значит в листе есть спрайт, до которого не дотянется ни одно занятие;
  // уже — значит следующее добавленное занятие снова уедет к авторским лицам.
  assert.equal(NPC_SPRITE_GENERATORS.length, occupationValues().length);
  assert.equal(Spr.AUTHORED_NPC_BASE, occupationValues().length);
});

test('occupation sprites are distinct pixel art, not the same fallback', () => {
  // Хвост занятий раньше отдавался одним и тем же спрайтом путника по ветке
  // `default`, и «спрайт есть» ещё не значило «спрайт свой».
  const seen = new Map<string, number>();
  for (const occupation of occupationValues()) {
    const pixels = NPC_SPRITE_GENERATORS[occupation]();
    let hash = 0;
    for (let i = 0; i < pixels.length; i++) hash = (Math.imul(hash, 31) + pixels[i]) | 0;
    const key = String(hash);
    const clash = seen.get(key);
    assert.equal(clash, undefined,
      `${Occupation[occupation]} рисуется тем же спрайтом, что ${clash !== undefined ? Occupation[clash] : '?'}`);
    seen.set(key, occupation);
  }
});
