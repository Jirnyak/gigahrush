/* Запертая дверь: гость бьёт створку ровно так же, как хозяин клавиатуры.
 *
 * Без ключа и без бумаги ветка обслуживания гостя не делала НИЧЕГО: створка не
 * получала удара, мир не слышал ни звука, внутрь попасть было нечем. У хозяина
 * тот же случай вёл в `bashBlockedDoor` — проламывание законно, оно просто
 * стоит прочности двери и шума. Тот же класс, что уже был у репутации, у
 * навигации и у инструмента: у гостя отдельный, более дешёвый путь к тому же
 * действию, хотя он такой же член фракции `PLAYER`.
 *
 * Сведено 2026-09-12: шаг один (`bashBlockedDoorFor`), приёмник строк приходит
 * параметром — у гостя он выбрасывается (решение владельца), — а прочность и
 * шум общие. Здесь заперты ПОСЛЕДСТВИЯ в мире, одинаковые для обеих рук, и
 * отдельно то, что ветка гостя этот шаг зовёт: `main.ts` в тесте не поднять.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Cell, DoorState, RoomType, W, type Door, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { createWorldEventState } from '../src/systems/events';
import { activateInteraction, bashBlockedDoorFor } from '../src/systems/interactions';
import { getRecentNoiseRecords, resetNoiseRecords } from '../src/systems/noise';
import { addTestRoom, makeGameState, makeTestPlayer } from './helpers';

function lockedDoorFixture() {
  resetNoiseRecords();
  const world = new World();
  const room = addTestRoom(world, { id: 0, type: RoomType.LIVING, x: 4, y: 4, w: 8, h: 8, name: 'Запертый отсек' });
  const doorIdx = world.idx(6, 4);
  world.cells[doorIdx] = Cell.DOOR;
  const door: Door = { idx: doorIdx, state: DoorState.LOCKED, roomA: room.id, roomB: -1, keyId: 'nobody_has_this', timer: 0 };
  world.doors.set(doorIdx, door);
  room.doors.push(doorIdx);
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState(), time: 1 });
  return { world, state, door, doorIdx };
}

function doorNoiseCount(state: ReturnType<typeof makeGameState>): number {
  return getRecentNoiseRecords(state, { tags: ['door'] }).length;
}

test('удар в запертую створку даёт один и тот же мир у обеих рук', () => {
  // Рука хозяина клавиатуры: общий путь `E`.
  const host = lockedDoorFixture();
  const owner = makeTestPlayer({ id: 1, x: 5.5, y: 4.5, angle: 0, inventory: [] });
  const hpBeforeHost = host.door.hp;
  activateInteraction({
    world: host.world,
    state: host.state,
    player: owner,
    entities: [owner],
    nextEntityId: { v: 2 },
    lookX: host.doorIdx % W,
    lookY: (host.doorIdx / W) | 0,
  });
  const hostNoise = getRecentNoiseRecords(host.state, { tags: ['door'] });
  assert.equal(hostNoise.length, 1, 'рука хозяина не оставила записи в слухе мира');
  assert.notEqual(host.door.hp, hpBeforeHost, 'рука хозяина не сняла прочность со створки');

  // Рука гостя: тот же шаг, приёмник строк выбрасывается.
  const peerSide = lockedDoorFixture();
  const guest = makeTestPlayer({ id: 2, x: 5.5, y: 4.5, angle: 0, inventory: [] });
  guest.peerSlot = 1;
  const sink: Msg[] = [];
  const hpBeforeGuest = peerSide.door.hp;
  bashBlockedDoorFor(
    peerSide.world, peerSide.state, guest, peerSide.door, peerSide.doorIdx,
    'Заперто. Нужен ключ. (Удар -5)', sink,
  );
  const guestNoise = getRecentNoiseRecords(peerSide.state, { tags: ['door'] });

  assert.equal(guestNoise.length, hostNoise.length, 'рука гостя оставила в слухе мира не столько же записей');
  assert.equal(guestNoise[0].severity, hostNoise[0].severity, 'удар гостя слышен иначе, чем удар хозяина');
  assert.equal(guestNoise[0].radius, hostNoise[0].radius, 'удар гостя слышен на другом радиусе');
  assert.equal(
    (hpBeforeGuest ?? 0) - (peerSide.door.hp ?? 0),
    (hpBeforeHost ?? 0) - (host.door.hp ?? 0),
    'створка под рукой гостя теряет не столько же прочности',
  );
  assert.ok(sink.length > 0, 'шаг гостя не написал ни строки: приёмник должен получать их, чтобы их глотать');
});

test('ветка двери у гостя зовёт общий удар, а не молчит', () => {
  /* Негативная сторона прежнего поведения: «не делать ничего» — это отсутствие
   * вызова, и поймать его можно только в исходнике. */
  const src = readFileSync('src/main.ts', 'utf8');
  const start = src.indexOf('function onPeerIntentInteract');
  assert.ok(start > 0, 'ветка E гостя исчезла: перепишите замок под новое место');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.equal(body.split('bashBlockedDoorFor(').length - 1, 2,
    'у гостя не два случая удара (запертая без ключа и гермостворка в самосбор) — значит один из них снова молчит');
  assert.ok(body.includes('peerMsgSink()'),
    'строки гостя снова уезжают в журнал хозяина вместо приёмника');
});
