/* Объявленная личность комнаты против авто-штабов территории.
 *
 * `initializeCellTerritory` выдаёт каждому хозяину штаб и, не найдя готового,
 * ПРОИЗВОДИТ его из подходящей комнаты этажа: `hardenHqRoom` пишет `type = HQ`,
 * запечатывает комнату гермостеной и вешает гермодвери. Авторское ИМЯ этот
 * проход бережёт особо (`isGenericHqName`), а тип не берёг никак — при том что
 * тип это ПОВЕДЕНИЕ (`rooms.md`): по нему, а не по имени и не по тегам, ядро
 * актора выбирает, куда идти работать, спать и обходить.
 *
 * Выбор кандидата идёт по весу хозяина к типу ПЛЮС ПЛОЩАДЬ, а самые крупные
 * комнаты этажа — как раз авторские, поэтому этаж терял именно то, на что
 * ссылается контент. Замерено на Базе Ликвидаторов: 8 сидов из 24 уводили в
 * штаб «Плац», «Пост южных ворот» или «Склад трофеев снизу».
 *
 * Замок стоит НА ИСТОЧНИКЕ и синтетический нарочно: он не зависит ни от одного
 * этажа и держит правило для всех пятидесяти одного. Поэтажная страховка Базы
 * Ликвидаторов проверяется своим файлом (`liquidatorbase-room-identity`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, DoorState, RoomType, Tex, ZoneFaction, type Room } from '../src/core/types';
import { World } from '../src/core/world';
import { initializeCellTerritory } from '../src/systems/territory';

/** Сколько раз игрок входит на этаж: `initFactionControl` в `main.ts` зовёт
 *  проход на каждом входе, значит объявленное обязано пережить повторы. */
const FLOOR_ENTRIES = 3;

interface Plan {
  /** Объявленная личность: комната с `defId` пришла от автора этажа. */
  alias?: string;
  type: RoomType;
  w: number;
  h: number;
}

/**
 * Этаж из отдельно стоящих комнат в бетоне. Комнате нужна оболочка из стен и
 * хотя бы одна дверь: без них она не проходит `autoHqCandidateEligible` и замер
 * выродится в «кандидатов не было вовсе».
 */
function floorOfRooms(plans: readonly Plan[]): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  world.zoneMap.fill(0);
  world.zones[0] = { id: 0, cx: 64, cy: 64, faction: ZoneFaction.CITIZEN, hasLift: false, fogged: false, level: 2, hqRoomId: -1 };

  const STRIDE = 40;
  plans.forEach((plan, i) => {
    const x = 8 + (i % 8) * STRIDE;
    const y = 8 + Math.floor(i / 8) * STRIDE;
    const room: Room = {
      id: i,
      type: plan.type,
      x, y, w: plan.w, h: plan.h,
      doors: [],
      sealed: false,
      name: plan.alias ? `Авторская ${plan.alias}` : `Комната ${i}`,
      defId: plan.alias,
      tags: plan.alias ? [plan.alias] : undefined,
      apartmentId: -1,
      wallTex: Tex.CONCRETE,
      floorTex: Tex.F_CONCRETE,
    };
    world.rooms[i] = room;
    for (let dy = 0; dy < plan.h; dy++) {
      for (let dx = 0; dx < plan.w; dx++) {
        const idx = world.idx(x + dx, y + dy);
        world.cells[idx] = Cell.FLOOR;
        world.roomMap[idx] = i;
      }
    }
    const doorIdx = world.idx(x + (plan.w >> 1), y - 1);
    world.cells[doorIdx] = Cell.DOOR;
    world.doors.set(doorIdx, { idx: doorIdx, state: DoorState.CLOSED, roomA: i, roomB: -1, keyId: '', timer: 0 });
    room.doors.push(doorIdx);
  });
  return world;
}

/** Комната нулевой площади всё равно занимает слот: `world.rooms[0]` проход
 *  пропускает как служебный, поэтому нулевую комнату кладём первой. */
function padded(plans: readonly Plan[]): Plan[] {
  return [{ type: RoomType.CORRIDOR, w: 2, h: 2 }, ...plans];
}

test('объявленная комната не становится авто-штабом, сколько бы раз на этаж ни входили', () => {
  // Авторские комнаты крупнее процедурных: именно так их и выбирал жребий —
  // площадь входит в оценку кандидата слагаемым.
  const world = floorOfRooms(padded([
    { alias: 'gate_post', type: RoomType.CORRIDOR, w: 24, h: 20 },
    { alias: 'trophy_store', type: RoomType.STORAGE, w: 22, h: 20 },
    { alias: 'parade', type: RoomType.COMMON, w: 26, h: 22 },
    { alias: 'war_room', type: RoomType.HQ, w: 20, h: 18 },
    { type: RoomType.OFFICE, w: 8, h: 8 },
    { type: RoomType.COMMON, w: 9, h: 8 },
    { type: RoomType.STORAGE, w: 8, h: 9 },
    { type: RoomType.MEDICAL, w: 8, h: 8 },
    { type: RoomType.PRODUCTION, w: 9, h: 9 },
    { type: RoomType.LIVING, w: 8, h: 8 },
    { type: RoomType.KITCHEN, w: 8, h: 8 },
    { type: RoomType.CORRIDOR, w: 9, h: 8 },
  ]));
  const declared = world.rooms
    .filter((room): room is Room => !!room?.defId)
    .map(room => ({ id: room.id, alias: room.defId!, type: room.type, name: room.name }));
  assert.equal(declared.length, 4, 'замер построен неверно: авторских комнат нет');

  for (let entry = 1; entry <= FLOOR_ENTRIES; entry++) {
    initializeCellTerritory(world, { seed: 0x5eed + entry });
    for (const before of declared) {
      const room = world.rooms[before.id];
      assert.ok(room, `вход ${entry}: комната "${before.alias}" пропала`);
      assert.equal(room.defId, before.alias, `вход ${entry}: "${before.alias}" потеряла псевдоним`);
      assert.equal(room.type, before.type,
        `вход ${entry}: "${before.alias}" получила тип ${room.type} вместо объявленного ${before.type} — `
        + 'тип это поведение, по нему комнату выбирает ядро актора');
      assert.equal(room.name, before.name, `вход ${entry}: "${before.alias}" переименована`);
    }
  }

  // Авто-штабы не отменены, а лишь перестали брать объявленное: процедурные
  // комнаты по-прежнему становятся базами, иначе замок сторожил бы пустоту.
  const producedHq = world.rooms.filter(room => room?.type === RoomType.HQ && !room.defId);
  assert.ok(producedHq.length > 0, 'ни один хозяин не получил штаба: правило вырезало авто-штабы целиком');
});

test('авторский штаб остаётся якорем: правило бережёт личность, а не запрещает базу', () => {
  const world = floorOfRooms(padded([
    { alias: 'war_room', type: RoomType.HQ, w: 20, h: 18 },
    { type: RoomType.OFFICE, w: 8, h: 8 },
    { type: RoomType.COMMON, w: 9, h: 8 },
    { type: RoomType.STORAGE, w: 8, h: 9 },
    { type: RoomType.MEDICAL, w: 8, h: 8 },
  ]));
  initializeCellTerritory(world, { seed: 0x5eed });
  const authored = world.rooms.find(room => room?.defId === 'war_room');
  assert.ok(authored, 'авторский штаб пропал с этажа');
  assert.equal(authored!.type, RoomType.HQ, 'авторский штаб перестал быть штабом');
});

test('этаж из одних объявленных комнат: проход обходится без якорей и ничего не ломает', () => {
  // Крайний случай правила: производить штаб не из чего. Хозяин остаётся без
  // якоря — это уже штатное состояние прохода (так живут `stenka` и
  // `horrorfloor`), и падать он не вправе.
  const world = floorOfRooms(padded([
    { alias: 'a', type: RoomType.OFFICE, w: 14, h: 12 },
    { alias: 'b', type: RoomType.COMMON, w: 14, h: 12 },
    { alias: 'c', type: RoomType.STORAGE, w: 14, h: 12 },
    { alias: 'd', type: RoomType.MEDICAL, w: 14, h: 12 },
  ]));
  const before = world.rooms.filter((room): room is Room => !!room?.defId).map(room => ({ id: room.id, type: room.type }));

  const shares = [
    { owner: ZoneFaction.CITIZEN, share: 0.4 },
    { owner: ZoneFaction.LIQUIDATOR, share: 0.3 },
    { owner: ZoneFaction.SCIENTIST, share: 0.3 },
  ];
  assert.doesNotThrow(() => {
    for (let entry = 1; entry <= FLOOR_ENTRIES; entry++) {
      initializeCellTerritory(world, { seed: 0x5eed + entry, targetShares: shares });
    }
  });
  for (const room of before) {
    assert.equal(world.rooms[room.id]!.type, room.type, 'объявленная комната всё-таки ушла в штаб');
  }
  assert.equal(world.rooms.some(room => room?.type === RoomType.HQ), false,
    'штаб взялся неизвестно откуда: производить его было не из чего');
  // Земля при этом всё равно роздана: без якорей проход не разваливается.
  assert.ok(world.factionControl.some(owner => owner !== ZoneFaction.CITIZEN),
    'территория осталась нераспределённой');
});
