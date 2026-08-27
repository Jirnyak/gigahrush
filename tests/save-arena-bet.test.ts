/* ── Замок: залог арены не съедается сохранением ───────────────────
 *
 * Что защищает: деньги, отданные распорядителю песка под ставку.
 *
 * Чем ошибка обошлась игроку: `placeBet` списывает сумму немедленно, а сама
 * дуэль живёт модульной переменной `arena.ts` и указывает на сущности
 * активного этажа — в сейв она не идёт и уйти не может. Ставка при этом тоже
 * не сохранялась, а `loadGame` звал `clearActiveBet()`. Итог: автосейв
 * посреди боя (а он срабатывает на сворачивании вкладки) уносил 500 ₽
 * навсегда — списаны, выплаты нет, возврата нет. Все ОСТАЛЬНЫЕ выходы из
 * дуэли деньги возвращают: таймаут и двойной нокаут через `refundActiveBet`,
 * победитель через `onArenaDuelEnded`.
 *
 * Как держит: залог — состояние кадра, и на входе в запись он приводится к
 * персистентной форме (правило `save.md` о транзиентных полях). Персистентная
 * форма ставки без дуэли — возвращённые деньги, поэтому снимок отдаёт сумму
 * игроку ровно так же, как несостоявшийся бой.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, type Entity } from '../src/core/types';
import {
  activeBetEscrowAmount,
  clearActiveBet,
  getCurrentActiveBet,
  placeBet,
} from '../src/systems/arena_betting';
import { createGameSavePayload } from '../src/systems/save_runtime';
import { makeGameState, makeTestPlayer } from './helpers';

function betPlayer(money: number): Entity {
  return makeTestPlayer({
    id: 1,
    x: 10,
    y: 11,
    hp: 80,
    maxHp: 100,
    faction: Faction.PLAYER,
    type: EntityType.NPC,
    money,
  });
}

test('снимок возвращает игроку залог активной ставки', () => {
  clearActiveBet();
  const state = makeGameState({ time: 40 });
  const player = betPlayer(1000);

  assert.equal(placeBet(state, player, 500, '77', 2.4), true);
  assert.equal(player.money, 500, 'ставка списывается немедленно');

  const payload = createGameSavePayload(player, state, []);

  assert.equal(payload.player.money, 1000, 'в сейв уходят деньги вместе с залогом');
  assert.equal(player.money, 500, 'живая ставка снимком не отменяется');
  assert.ok(getCurrentActiveBet(), 'ставка продолжает играть в текущем прогоне');
  clearActiveBet();
});

test('без активной ставки снимок денег не выдумывает', () => {
  clearActiveBet();
  const state = makeGameState({ time: 40 });
  const player = betPlayer(1000);

  const payload = createGameSavePayload(player, state, []);

  assert.equal(payload.player.money, 1000);
  assert.equal(activeBetEscrowAmount(), 0);
});

test('порченая сумма ставки не превращается в деньги из воздуха', () => {
  clearActiveBet();
  const state = makeGameState({ time: 40 });
  const player = betPlayer(1000);
  assert.equal(placeBet(state, player, 500, '77', 2.4), true);

  const bet = getCurrentActiveBet()!;
  (bet as { amount: number }).amount = Number.NaN;
  assert.equal(activeBetEscrowAmount(), 0, 'нечисло не возвращается');

  (bet as { amount: number }).amount = -900;
  assert.equal(activeBetEscrowAmount(), 0, 'отрицательный залог не отнимает деньги');

  (bet as { amount: number }).amount = 250.7;
  assert.equal(activeBetEscrowAmount(), 250, 'дробный залог округляется вниз');
  clearActiveBet();
});
