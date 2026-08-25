import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, type Entity, type Msg } from '../src/core/types';
import { emitMarkovBark, resetBarkState, setNpcBarkLogContext } from '../src/systems/ai/barks';

/* Замок на предпосылку, из-за которой барк перестал строить текст вслепую.
 *
 * Марковская генерация одной реплики стоит ~11 мс — две трети кадра при 60 fps.
 * Раньше она шла ВСЕГДА, а расстояние проверялось после, уже готовым текстом.
 * На жилом этаже в радиусе слышимости (100 клеток при мире 1024) оказывается
 * около 3% людей, то есть выбрасывалось почти всё. Хуже того, общие лимиты
 * частоты обновляются только у УСЛЫШАННОГО барка, поэтому выброшенный ничего не
 * тратил, и следующий актор генерировал заново в том же кадре. Замерено:
 * 303 попытки барка на настоящем этаже — 3432 мс до, 145 мс после, при
 * одинаковых девяти попавших в лог репликах.
 *
 * Здесь заперта та предпосылка, на которой стоит ранний сторож: далёкий человек
 * НЕ ДАЁТ наблюдаемого результата. Если однажды барк станет слышен со всего
 * этажа или лог перестанет резать по расстоянию, этот тест покраснеет — и это
 * будет верный сигнал вернуться и пересмотреть порядок в `emitMarkovBark`,
 * потому что тогда сторож начнёт глушить то, что должно звучать.
 */

function person(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.NPC, x, y, alive: true, hp: 10, maxHp: 10,
    name: `Житель-${id}`, speed: 1, radius: 0.3,
  } as unknown as Entity;
}

function withListener(x: number, y: number): void {
  setNpcBarkLogContext({
    listener: { x, y },
    radiusMeters: 100,
    dist2: (x1, y1, x2, y2) => (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2),
  });
}

test('человек в радиусе слышимости попадает в лог и получает реплику над головой', () => {
  resetBarkState();
  withListener(500, 500);
  const e = person(1, 505, 500);
  const msgs: Msg[] = [];

  emitMarkovBark(e, msgs, 100, 'ambient', 'Пришли.', 1.0, '#aac');

  assert.equal(msgs.length, 1, 'ближнего обязаны услышать');
  assert.ok(e.activeBark, 'и увидеть реплику над головой');
});

test('человек за радиусом не даёт ни строки в логе, ни реплики над головой', () => {
  resetBarkState();
  withListener(500, 500);
  const e = person(2, 900, 500); // 400 клеток при радиусе 100
  const msgs: Msg[] = [];

  emitMarkovBark(e, msgs, 100, 'ambient', 'Пришли.', 1.0, '#aac');

  assert.equal(msgs.length, 0, 'далёкого слышно быть не должно');
  assert.equal(e.activeBark, undefined, 'и реплики над головой у него нет');
});

test('далёкий барк не тратит общий лимит частоты: ближний сразу после него слышен', () => {
  resetBarkState();
  withListener(500, 500);
  const msgs: Msg[] = [];

  // Оба в одну и ту же секунду. Общий промежуток для неспешной речи — 4.5 с,
  // и если бы далёкий его потратил, ближний замолчал бы ни за что.
  emitMarkovBark(person(3, 900, 500), msgs, 100, 'ambient', 'Пришли.', 1.0, '#aac');
  emitMarkovBark(person(4, 502, 500), msgs, 100, 'ambient', 'Пришли.', 1.0, '#aac');

  assert.equal(msgs.length, 1, 'услышан должен быть ровно ближний');
});
