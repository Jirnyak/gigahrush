import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, DoorState } from '../src/core/types';
import { World } from '../src/core/world';
import { setDoorState, damageDoor } from '../src/systems/door_state';

/* Замок на контракт версии створок.
 *
 * Рендер держит состояния дверей отдельной текстурой и до этой правки перебирал
 * ВСЕ створки этажа каждый кадр, только чтобы заметить изменение: на жилом этаже
 * их 2837, и в профиле это был лист на 1.6% кадра. Теперь перебор идёт только
 * когда поднялась `world.doorVersion`.
 *
 * Отсюда обязанность: КАЖДЫЙ рантайм-путь, меняющий вид створки, обязан поднять
 * версию. Пропущенный путь не падает и не шумит — дверь просто навсегда
 * остаётся нарисованной в прежнем виде, и заметить это можно лишь глазами в
 * игре. Поэтому проверка здесь, а не в браузере.
 *
 * `cellVersion` этой роли не берёт: для навигации обычные открытая и закрытая
 * створки — одно и то же (топологию меняют только LOCKED и HERMETIC_CLOSED),
 * поэтому на обычном открывании он не двигается, а картинка меняется.
 */

function worldWithDoor(idx: number): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.cells[idx] = Cell.DOOR;
  world.doors.set(idx, { idx, state: DoorState.CLOSED, roomA: -1, roomB: -1, keyId: '', timer: 0 });
  return world;
}

test('обычное открывание створки поднимает doorVersion, не трогая cellVersion', () => {
  const idx = 300 * 1024 + 300;
  const world = worldWithDoor(idx);
  const door = world.doors.get(idx)!;
  const v0 = world.doorVersion;
  const c0 = world.cellVersion;

  assert.equal(setDoorState(world, door, DoorState.OPEN), true);
  assert.notEqual(world.doorVersion, v0, 'рендер не узнает, что дверь открылась');
  assert.equal(world.cellVersion, c0, 'обычная створка топологию не меняет');
});

test('запирание поднимает обе версии: и вид, и топологию', () => {
  const idx = 301 * 1024 + 301;
  const world = worldWithDoor(idx);
  const door = world.doors.get(idx)!;
  const v0 = world.doorVersion;
  const c0 = world.cellVersion;

  assert.equal(setDoorState(world, door, DoorState.LOCKED), true);
  assert.notEqual(world.doorVersion, v0);
  assert.notEqual(world.cellVersion, c0, 'LOCKED перекрывает путь — навигация обязана узнать');
});

test('повторная установка того же состояния версию не двигает', () => {
  const idx = 302 * 1024 + 302;
  const world = worldWithDoor(idx);
  const door = world.doors.get(idx)!;
  setDoorState(world, door, DoorState.OPEN);
  const v0 = world.doorVersion;

  assert.equal(setDoorState(world, door, DoorState.OPEN), false);
  assert.equal(world.doorVersion, v0, 'пустая смена не должна заставлять рендер перебирать двери');
});

test('урон по створке поднимает версию: трещина — это другой вид', () => {
  const idx = 303 * 1024 + 303;
  const world = worldWithDoor(idx);
  const door = world.doors.get(idx)!;
  const v0 = world.doorVersion;

  // Рендер держит признак «hp ниже половины» отдельным битом состояния.
  assert.equal(damageDoor(world, door, 1), false);
  assert.notEqual(world.doorVersion, v0, 'рендер не узнает, что створка треснула');
});
