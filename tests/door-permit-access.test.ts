import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, DoorState, RoomType, W, type Door, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { PERMIT_DEFS, resolvePermitAccess } from '../src/data/permits';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { activateInteraction } from '../src/systems/interactions';
import { findActorPermit, findActorDoorPermit } from '../src/systems/permits';
import { resetNoiseRecords } from '../src/systems/noise';
import { addTestRoom, makeGameState, makeTestPlayer } from './helpers';

/* Замок на мост «дверь ↔ пермит».
 *
 * Генераторы уже вешают на створки сам документ доступа: `cayley_byuro` кладёт
 * в `keyId` поддельный корешок, `voronoi_quarantine` чередует официальный и
 * поддельный карантинный допуск по серийному номеру ребра. Раз дверь знала
 * только точное совпадение id, один замок распадался на два несовместимых:
 * официальный допуск не открывал дверь, помеченную подделкой, и наоборот —
 * то есть подделка как способ обхода на дверях не работала вовсе.
 */

interface DoorFixture {
  world: World;
  state: ReturnType<typeof makeGameState>;
  player: Entity;
  door: Door;
  press: () => void;
}

function doorFixture(keyId: string, carried: readonly string[]): DoorFixture {
  resetNoiseRecords();
  const world = new World();
  const room = addTestRoom(world, { id: 0, type: RoomType.LIVING, x: 4, y: 4, w: 8, h: 8, name: 'Карантинный отсек' });
  const doorIdx = world.idx(6, 4);
  world.cells[doorIdx] = Cell.DOOR;
  const door: Door = { idx: doorIdx, state: DoorState.LOCKED, roomA: room.id, roomB: -1, keyId, timer: 0 };
  world.doors.set(doorIdx, door);
  room.doors.push(doorIdx);

  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState(), time: 1 });
  const player = makeTestPlayer({
    id: 1,
    x: 5.5,
    y: 4.5,
    angle: 0,
    inventory: carried.map(defId => ({ defId, count: 1 })),
  });
  return {
    world,
    state,
    player,
    door,
    press: () => {
      state.time += 0.5;
      activateInteraction({
        world,
        state,
        player,
        entities: [player],
        nextEntityId: { v: 2 },
        lookX: doorIdx % W,
        lookY: (doorIdx / W) | 0,
      });
    },
  };
}

test('официальный допуск открывает дверь, помеченную подделкой того же класса', () => {
  const f = doorFixture('forged_quarantine_clearance', ['official_quarantine_clearance']);

  f.press();

  assert.equal(f.door.state, DoorState.OPEN, 'официальная бумага обязана открывать тот же замок');
  assert.equal(f.door.hp, undefined, 'дверь не должна получать удар при законном проходе');
  const granted = getRecentEvents(f.state, { type: 'access_granted', limit: 1 })[0];
  assert.ok(granted, 'проход по документу обязан оставлять запись доступа, как на контейнере');
  assert.equal(granted.itemId, 'official_quarantine_clearance');
});

test('подделка открывает дверь, помеченную официальным допуском', () => {
  const f = doorFixture('official_quarantine_clearance', ['forged_quarantine_clearance']);

  f.press();

  assert.equal(f.door.state, DoorState.OPEN, 'подделка обязана обходить дверной гейт своего класса');
});

test('чужой документ дверь не открывает — мост не превращает пермит в отмычку', () => {
  const f = doorFixture('official_quarantine_clearance', ['bank_debt_paper']);

  f.press();

  assert.equal(f.door.state, DoorState.LOCKED, 'долговая бумага не карантинный допуск');
  assert.ok((f.door.hp ?? 0) > 0, 'без доступа остаётся только пролом');
  assert.equal(getRecentEvents(f.state, { type: 'access_granted', limit: 1 }).length, 0);
});

test('обычный ключ по-прежнему требует точного совпадения', () => {
  const f = doorFixture('lift_key', ['official_quarantine_clearance']);

  f.press();

  assert.equal(f.door.state, DoorState.LOCKED, 'документ не заменяет физический ключ');
  assert.equal(findActorDoorPermit(f.player, 'lift_key'), undefined, 'не-пермит в keyId не открывает мост');
});

test('в записи доступа стоит допуск, которого потребовала дверь', () => {
  // Райсоветский пропуск открывает архивную дверь, но его собственный
  // профильный тег — `raionsovet`, а не `archive`.
  const f = doorFixture('archive_access_permit', ['raionsovet_floor_pass']);

  f.press();

  assert.equal(f.door.state, DoorState.OPEN);
  const granted = getRecentEvents(f.state, { type: 'access_granted', limit: 1 })[0];
  assert.ok(granted);
  assert.equal(granted.data?.requiredTag, 'archive', 'записан допуск двери, а не первый тег бумаги');
});

test('выбор пермита живёт одной реализацией', () => {
  const stolen = PERMIT_DEFS.find(def => def.method === 'stolen');
  assert.ok(stolen, 'опора теста: краденый документ существует');
  const forged = PERMIT_DEFS.find(def => def.method === 'forged' && def.accessTags.some(tag => stolen.accessTags.includes(tag)));
  assert.ok(forged, 'опора теста: у краденого есть подделка того же класса');

  const actor = makeTestPlayer({
    id: 7,
    inventory: [{ defId: forged.itemId, count: 1 }, { defId: stolen.itemId, count: 1 }],
  });
  const tags = stolen.accessTags;

  // Собственный отбор в `systems/permits.ts` считал краденое худшим (40), чем
  // подделка (40 через ту же ветку, но выигрывала первая по порядку инвентаря),
  // тогда как канон в `data/permits.ts` ставит краденое выше (50).
  assert.equal(findActorPermit(actor, tags)?.id, stolen.id, 'краденая карточка приоритетнее подделки');
  assert.equal(
    findActorPermit(actor, tags)?.id,
    resolvePermitAccess([forged.itemId, stolen.itemId], tags)?.id,
    'системный выбор обязан совпадать с каноническим',
  );
});
