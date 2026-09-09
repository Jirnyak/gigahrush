import test from 'node:test';
import assert from 'node:assert/strict';

import { type Entity } from '../src/core/types';
import { govnyakAimSpreadMult } from '../src/systems/govnyak';
import { makeTestPlayer } from './helpers';

/* ── §3 / `#155`: у облегчения не было потребителя ────────────────
 *
 * `govnyak_relief` ставился при затяжке, капался по времени, уезжал в сейв — и
 * не читался НИ ОДНИМ потребителем. Кашель и долг при этом давно двигали
 * разброс (`govnyakAimSpreadMult` → `systems/inventory.ts`). То есть у сделки
 * была только расплата и не было того, ради чего её заключают.
 *
 * Облегчение положено на ТУ ЖЕ ось, что и две другие метки говняка: своей оси
 * заводить незачем. Числа — решение агента, требует подтверждения владельца.
 */
function withStatuses(pairs: [string, number][]): Entity {
  const e = makeTestPlayer({ x: 10.5, y: 10.5 });
  e.statuses = pairs.map(([id, intensity]) => ({
    id, source: 'govnyak_roll', startedAt: 0, expiresAt: 1e9, intensity,
  })) as Entity['statuses'];
  return e;
}

test('чистая рука — базовый разброс', () => {
  assert.equal(govnyakAimSpreadMult(makeTestPlayer({ x: 1.5, y: 1.5 })), 1);
  assert.equal(govnyakAimSpreadMult(withStatuses([])), 1);
});

test('кашель и долг разброс увеличивают', () => {
  const cough = govnyakAimSpreadMult(withStatuses([['govnyak_cough', 1]]));
  const both = govnyakAimSpreadMult(withStatuses([['govnyak_cough', 1], ['govnyak_debt', 2]]));
  assert.ok(cough > 1, 'кашель не двигает разброс');
  assert.ok(both > cough, 'долг поверх кашля не двигает разброс');
});

test('свежая затяжка держит руку — и это видно в разбросе', () => {
  const shaken = govnyakAimSpreadMult(withStatuses([['govnyak_cough', 1], ['govnyak_debt', 1]]));
  const relieved = govnyakAimSpreadMult(withStatuses([['govnyak_cough', 1], ['govnyak_debt', 1], ['govnyak_relief', 1]]));
  assert.ok(relieved < shaken, 'облегчение не читается — метка снова мертва');
  assert.ok(govnyakAimSpreadMult(withStatuses([['govnyak_relief', 1]])) < 1, 'одно облегчение не даёт твёрдой руки');
});

test('облегчение не перекрывает свою же расплату целиком', () => {
  /* Сделка обязана остаться сделкой: затяжка при полном кашле и полном долге
   * не должна давать руку лучше чистой. Иначе говняк — чистая выгода. */
  const heavy = govnyakAimSpreadMult(withStatuses([
    ['govnyak_cough', 3], ['govnyak_debt', 3], ['govnyak_relief', 1],
  ]));
  assert.ok(heavy > 1, `тяжёлый кашель с долгом дал руку лучше чистой: ${heavy}`);

  // И вниз оно ограничено: разброс не уходит в ноль ни при какой силе метки.
  const absurd = govnyakAimSpreadMult(withStatuses([['govnyak_relief', 99]]));
  assert.ok(absurd >= 0.8, `облегчение пробило нижнюю границу: ${absurd}`);
});
