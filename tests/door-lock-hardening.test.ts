import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, DoorState, RoomType, W, type Door } from '../src/core/types';
import { World } from '../src/core/world';
import { createWorldEventState } from '../src/systems/events';
import { activateInteraction } from '../src/systems/interactions';
import { getRecentNoiseRecords, resetNoiseRecords } from '../src/systems/noise';
import { addTestRoom, makeGameState, makeTestPlayer } from './helpers';

/* Замок на цену обхода замка.
 *
 * Запертая створка была бесплатным и БЕЗЗВУЧНЫМ препятствием: ветка «нет ключа»
 * снимала 5 hp и не публиковала ничего, поэтому тридцать нажатий `E` вскрывали
 * любой запертый лифт так, что об этом не узнавал ни один сосед. По закону
 * проекта недопустим не обход как таковой, а обход бесплатный и незамеченный.
 *
 * Здесь проверяется ровно эта цена и то, что три остальных законных пути живы:
 * ключ отпирает, гермодверь вне самосбора открывается свободно, а проломить
 * дверь руками по-прежнему можно — просто дороже, если генератор дал ей броню.
 */

interface DoorFixture {
  world: World;
  state: ReturnType<typeof makeGameState>;
  player: ReturnType<typeof makeTestPlayer>;
  doorIdx: number;
  press: () => void;
}

function doorFixture(state: DoorState, extra: Partial<Door> = {}, cy = 4): DoorFixture {
  resetNoiseRecords();
  const world = new World();
  const room = addTestRoom(world, { id: 0, type: RoomType.LIVING, x: 4, y: cy, w: 8, h: 8, name: 'Тестовая квартира' });
  const doorIdx = world.idx(6, cy);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, { idx: doorIdx, state, roomA: room.id, roomB: -1, keyId: '', timer: 0, ...extra });
  room.doors.push(doorIdx);

  const gameState = makeGameState({ currentZ: 0, worldEvents: createWorldEventState(), time: 1 });
  const player = makeTestPlayer({ id: 1, x: 5.5, y: cy + 0.5, angle: 0 });
  const fixture: DoorFixture = {
    world,
    state: gameState,
    player,
    doorIdx,
    press: () => {
      // Кадры разводятся по времени: слух хранит записи с ttl, и без сдвига
      // часов удары сливались бы в одну и ту же секунду мира.
      gameState.time += 0.5;
      activateInteraction({
        world,
        state: gameState,
        player,
        entities: [player],
        nextEntityId: { v: 2 },
        lookX: doorIdx % W,
        lookY: (doorIdx / W) | 0,
      });
    },
  };
  return fixture;
}

function doorNoiseCount(fixture: DoorFixture): number {
  return getRecentNoiseRecords(fixture.state, { source: 'door' }, fixture.state.time).length;
}

test('удар по запертой двери без ключа слышен: тихого пролома нет', () => {
  const f = doorFixture(DoorState.LOCKED);

  f.press();

  assert.equal(f.world.doors.get(f.doorIdx)?.hp, 145, 'удар обязан снимать здоровье как раньше');
  const noises = getRecentNoiseRecords(f.state, { source: 'door' }, f.state.time);
  assert.equal(noises.length, 1, 'удар по створке не оставил следа в слухе мира');
  assert.equal(noises[0].severity, 2, 'громкость взята у обычной двери, новых величин не заводим');
  assert.equal(noises[0].actorId, f.player.id);
});

test('каждое нажатие E по запертой двери шумит отдельно, а не один раз за замок', () => {
  const f = doorFixture(DoorState.LOCKED);

  for (let i = 0; i < 4; i++) f.press();

  assert.equal(f.world.doors.get(f.doorIdx)?.hp, 130);
  assert.equal(doorNoiseCount(f), 4, 'спам `E` обязан быть слышен на каждом ударе');
});

test('дверь с авторской бронёй не выбивается за прежние 30 нажатий', () => {
  const armored = doorFixture(DoorState.LOCKED, { maxHp: 600 });
  const plain = doorFixture(DoorState.LOCKED, {}, 20);

  for (let i = 0; i < 30; i++) {
    armored.press();
    plain.press();
  }

  assert.equal(plain.world.doors.has(plain.doorIdx), false, 'обычная запертая дверь выбивается за 30 ударов как прежде');
  const door = armored.world.doors.get(armored.doorIdx);
  assert.ok(door, 'броня из данных была молча заменена базовым значением по состоянию');
  assert.equal(door.maxHp, 600, 'ленивая раздача hp затёрла авторский maxHp');
  assert.equal(door.hp, 450);
  assert.equal(door.state, DoorState.LOCKED);
});

test('бронированная дверь всё же ломается руками: путь «проломить» остаётся живым', () => {
  const f = doorFixture(DoorState.LOCKED, { maxHp: 600 });

  for (let i = 0; i < 120; i++) f.press();

  assert.equal(f.world.doors.has(f.doorIdx), false, 'непроламываемых дверей в структуре не бывает');
  assert.equal(f.world.cells[f.doorIdx], Cell.FLOOR, 'выбитая створка обязана оставлять настоящую дыру');
});

test('ключ по-прежнему отпирает дверь и не снимает с неё здоровье', () => {
  const f = doorFixture(DoorState.LOCKED);
  f.player.inventory = [{ defId: 'key', count: 1 }];

  f.press();

  const door = f.world.doors.get(f.doorIdx);
  assert.equal(door?.state, DoorState.OPEN);
  assert.equal(door?.hp, undefined, 'отпирание ключом — не удар');
  assert.equal(doorNoiseCount(f), 1, 'щелчок замка слышен так же, как раньше');
});

test('гермодверь вне самосбора открывается бесплатно и не получает урона', () => {
  const f = doorFixture(DoorState.HERMETIC_CLOSED);
  assert.equal(f.state.samosborActive, false);

  f.press();

  const door = f.world.doors.get(f.doorIdx);
  assert.equal(door?.state, DoorState.HERMETIC_OPEN);
  assert.equal(door?.hp, undefined, 'вне самосбора гермодверь — это ручка, а не преграда');
});

test('гермодверь в самосборе бьётся с гермо-громкостью, а не с обычной', () => {
  const f = doorFixture(DoorState.HERMETIC_CLOSED);
  f.state.samosborActive = true;

  f.press();

  assert.equal(f.world.doors.get(f.doorIdx)?.hp, 495);
  const noises = getRecentNoiseRecords(f.state, { source: 'door' }, f.state.time);
  assert.equal(noises.length, 1);
  assert.equal(noises[0].severity, 3, 'у гермостворки своя громкость в publishDoorNoise');
  assert.equal(noises[0].tags.includes('hermetic'), true);
});
