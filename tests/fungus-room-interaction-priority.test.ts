/* ── Грибница уступает тому, на что игрок смотрит ─────────────────
 *
 * `postrelease.md` §3, `#59`: комнатный `tryUseCarnivorousFungus` возвращал
 * `handled` РАНЬШЕ дверей и ящиков — а он отвечает по КОМНАТЕ, не по клетке,
 * то есть просто на факт «игрок стоит внутри». Ближний проход near→far
 * закрывался грибницей до того, как дальний вообще смотрел на створку, и в
 * комнате гриба нельзя было открыть по E ни дверь, ни ящик вовсе.
 *
 * Правка: грибница переехала в САМЫЙ КОНЕЦ диспетчера, после обоих проходов.
 * Замок держит обе стороны — и что фикстура выигрывает, и что грибница при
 * пустом прицеле по-прежнему отвечает.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, ContainerKind, DoorState, RoomType, W, type Door, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { activateInteraction } from '../src/systems/interactions';
import { createWorldEventState } from '../src/systems/events';
import { addTestRoom, makeGameState, makeTestPlayer } from './helpers';

const FUNGUS_ROOM_NAME = 'Плотоядная грибница у стояка';

interface Fixture {
  world: World;
  state: ReturnType<typeof makeGameState>;
  player: Entity;
  door: Door;
  press: (lookX: number, lookY: number) => boolean;
}

function fungusRoomFixture(): Fixture {
  const world = new World();
  const room = addTestRoom(world, {
    id: 0, type: RoomType.STORAGE, x: 4, y: 4, w: 8, h: 8, name: FUNGUS_ROOM_NAME,
  });
  const doorIdx = world.idx(6, 4);
  world.cells[doorIdx] = Cell.DOOR;
  const door: Door = { idx: doorIdx, state: DoorState.CLOSED, roomA: room.id, roomB: -1, keyId: '', timer: 0 };
  world.doors.set(doorIdx, door);
  room.doors.push(doorIdx);

  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState(), time: 1 });
  const player = makeTestPlayer({ id: 1, x: 6.5, y: 5.5, angle: 0 });
  return {
    world, state, player, door,
    press: (lookX, lookY) => {
      state.time += 0.5;
      let opened = false;
      activateInteraction({
        world, state, player,
        entities: [player],
        nextEntityId: { v: 2 },
        lookX, lookY,
        openContainerMenu: () => { opened = true; },
      });
      return opened;
    },
  };
}

test('дверь в комнате грибницы открывается по E', () => {
  const f = fungusRoomFixture();
  f.press(f.door.idx % W, (f.door.idx / W) | 0);
  assert.equal(f.door.state, DoorState.OPEN, 'грибница не имеет права съедать нажатие на створку');
});

test('ящик в комнате грибницы открывается по E', () => {
  const f = fungusRoomFixture();
  f.world.addContainer({
    id: 1, x: 7, y: 6, z: 0, roomId: 0, zoneId: 0,
    kind: ContainerKind.CRATE, name: 'Ящик у грибницы',
    inventory: [], capacitySlots: 4, access: 'public', discovered: true,
    tags: ['test'],
  });
  f.player.x = 7.5;
  f.player.y = 7.5;
  assert.equal(f.press(7.5, 6.5), true, 'грибница не имеет права съедать нажатие на ящик');
});

test('при пустом прицеле грибница по-прежнему отвечает', () => {
  const f = fungusRoomFixture();
  // Голый пол комнаты: ни створки, ни ящика — отвечать больше некому.
  f.player.x = 8.5;
  f.player.y = 8.5;
  const before = f.state.msgs.length;
  f.press(9.5, 8.5);
  assert.ok(f.state.msgs.length > before, 'комнатная механика обязана оставаться доступной');
});
