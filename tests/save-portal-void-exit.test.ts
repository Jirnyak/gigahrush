/* ── Замок: компактный сейв не запирает игрока в Пустоте ───────────
 *
 * Что защищает: выход из Пустоты. Лифтов там нет вовсе —
 * `routeExpectedLiftDirections` отдаёт пустой список при `z <= FLOOR_RUN_MIN_Z`,
 * и портал возврата остаётся единственной дверью наружу.
 *
 * Чем ошибка обошлась игроку: `createPortalCompactSavePayload` явно обнулял
 * `voidReturnPortal` и `voidEntryFromFloor`. Это не отладочный артефакт —
 * `gamePushSaveCandidate` отгружает компактный пейлоад всякий раз, когда
 * полный перерастает порог размера, и он же грузится обратно. Игрок с
 * большим сейвом, сохранившийся в Пустоте, оставался там навсегда: портал
 * пропал, лифта нет.
 *
 * Как держит: обе секции переживают ужатие. Это один маленький объект и два
 * числа — размерной проблемы здесь нет и не было.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, type Entity } from '../src/core/types';
import { createGameSavePayload } from '../src/systems/save_runtime';
import { createPortalCompactSavePayload } from '../src/systems/save_payload';
import { makeGameState, makeTestPlayer } from './helpers';

const PORTAL = {
  active: true,
  used: false,
  cell: 512 * 1024 + 512,
  openedAt: 1200,
  openedTick: 34_000,
  creatorId: 9,
  playerMustLeaveCell: false,
  enteredFromFloor: -36,
};

function voidPlayer(): Entity {
  return makeTestPlayer({
    id: 1,
    x: 10,
    y: 11,
    hp: 80,
    maxHp: 100,
    faction: Faction.PLAYER,
    type: EntityType.NPC,
  });
}

test('портальное ужатие сохраняет портал возврата и этаж входа', () => {
  const state = makeGameState({ time: 1300, currentZ: -50 });
  const payload = createGameSavePayload(voidPlayer(), state, [], {
    voidReturnPortal: { ...PORTAL },
    voidEntryFromFloor: -36,
  });

  assert.deepEqual(payload.state.voidReturnPortal, PORTAL, 'полный сейв обязан нести портал');

  const compact = createPortalCompactSavePayload(payload);

  assert.deepEqual(compact.state.voidReturnPortal, PORTAL, 'единственный выход из Пустоты');
  assert.equal(compact.state.voidEntryFromFloor, -36, 'этаж, куда возвращает портал');
});

test('без портала ужатие ничего не выдумывает', () => {
  const state = makeGameState({ time: 40 });
  const payload = createGameSavePayload(voidPlayer(), state, []);

  const compact = createPortalCompactSavePayload(payload);

  assert.equal(compact.state.voidReturnPortal, undefined);
  assert.equal(compact.state.voidEntryFromFloor, undefined);
});
