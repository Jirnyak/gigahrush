import test from 'node:test';
import assert from 'node:assert';
import { World } from '../src/core/world';
import { RoomType, Tex, W, type Room } from '../src/core/types';
import { roomIdsAroundInto, roomIdsOfDefKey, roomIdsOfType, roomRadiusCoversFloor } from '../src/world/room_index';
import { seededRandom } from '../src/core/rand';

function room(id: number, x: number, y: number, type: RoomType, name = `Комната ${id}`, defId?: string): Room {
  return {
    id, type, x, y, w: 4, h: 4,
    doors: [], sealed: false, name, defId,
    apartmentId: -1, wallTex: Tex.W_CONCRETE, floorTex: Tex.F_CONCRETE,
  };
}

function worldWith(rooms: Room[]): World {
  const world = new World();
  world.rooms = rooms;
  return world;
}

/** Прежний сплошной проход по всем комнатам — эталон для сверки. */
function scanAll(world: World, x: number, y: number, limit: number): number[] {
  const limit2 = limit === Infinity ? Infinity : limit * limit;
  const out: number[] = [];
  for (const r of world.rooms) {
    if (!r) continue;
    const d2 = world.dist2(x, y, r.x + r.w * 0.5, r.y + r.h * 0.5);
    if (d2 <= limit2) out.push(r.id);
  }
  return out;
}

function scanIndexed(world: World, x: number, y: number, limit: number): number[] {
  const scratch: number[] = [];
  const limit2 = limit * limit;
  const found = roomIdsAroundInto(world, x, y, limit, scratch);
  const out: number[] = [];
  for (let i = 0; i < found; i++) {
    const r = world.rooms[scratch[i]];
    if (!r) continue;
    if (world.dist2(x, y, r.x + r.w * 0.5, r.y + r.h * 0.5) <= limit2) out.push(r.id);
  }
  out.sort((a, b) => a - b);
  return out;
}

test('выборка по радиусу тождественна сплошному проходу, включая шов тора', () => {
  const rand = seededRandom(0x51ce);
  const rooms: Room[] = [];
  for (let id = 0; id < 3000; id++) {
    rooms.push(room(id, Math.floor(rand() * W), Math.floor(rand() * W), RoomType.LIVING));
  }
  const world = worldWith(rooms);

  // Обычный предел рутины, предел выживания и точки на самом шве.
  for (const limit of [132, 220]) {
    for (const [x, y] of [[512.5, 512.5], [0.5, 0.5], [W - 1.5, 3.5], [3.5, W - 1.5]]) {
      assert.deepEqual(
        scanIndexed(world, x, y, limit),
        scanAll(world, x, y, limit),
        `радиус ${limit} в точке ${x},${y}`,
      );
    }
  }
});

test('бесконечный предел индексом не покрывается и остаётся сплошным проходом', () => {
  assert.equal(roomRadiusCoversFloor(Infinity), true);
  assert.equal(roomRadiusCoversFloor(W), true);
  assert.equal(roomRadiusCoversFloor(132), false);
  assert.equal(roomRadiusCoversFloor(220), false);
});

test('проекции по типу и по адресу отдают комнаты в порядке world.rooms', () => {
  const world = worldWith([
    room(0, 10, 10, RoomType.LIVING, 'Жильё'),
    room(1, 40, 10, RoomType.OFFICE, 'Кабинет', 'ministry_office'),
    room(2, 70, 10, RoomType.LIVING, 'Жильё'),
    room(3, 90, 10, RoomType.OFFICE, 'ministry_office'),
  ]);
  assert.deepEqual([...roomIdsOfType(world, RoomType.LIVING)], [0, 2]);
  assert.deepEqual([...roomIdsOfType(world, RoomType.OFFICE)], [1, 3]);
  assert.deepEqual([...roomIdsOfType(world, RoomType.KITCHEN)], []);

  // Адрес комнаты: авторский defId, иначе имя — ровно то же правило, по
  // которому квест сверяет комнату.
  assert.deepEqual([...roomIdsOfDefKey(world, 'ministry_office')], [1, 3]);
  assert.deepEqual([...roomIdsOfDefKey(world, 'Жильё')], [0, 2]);
  assert.deepEqual([...roomIdsOfDefKey(world, 'Кабинет')], []);
  assert.deepEqual([...roomIdsOfDefKey(world, '')], []);
});

test('индекс замечает и дописанную комнату, и переехавшую', () => {
  const world = worldWith([room(0, 10, 10, RoomType.LIVING)]);
  assert.deepEqual([...roomIdsOfType(world, RoomType.LIVING)], [0]);

  world.rooms.push(room(1, 12, 10, RoomType.LIVING));
  assert.deepEqual([...roomIdsOfType(world, RoomType.LIVING)], [0, 1]);

  // Самосбор двигает комнаты и бампает cellVersion — признак пересборки.
  world.rooms[1].x = 800;
  world.rooms[1].y = 800;
  world.cellVersion++;
  const near: number[] = [];
  roomIdsAroundInto(world, 10.5, 10.5, 32, near);
  assert.deepEqual(near, [0]);
  const far: number[] = [];
  roomIdsAroundInto(world, 801.5, 801.5, 32, far);
  assert.deepEqual(far, [1]);
});

test('дыра в списке комнат не ломает ни одну проекцию', () => {
  const rooms: (Room | undefined)[] = [room(0, 10, 10, RoomType.LIVING), undefined, room(2, 14, 10, RoomType.LIVING)];
  const world = worldWith(rooms as Room[]);
  assert.deepEqual([...roomIdsOfType(world, RoomType.LIVING)], [0, 2]);
  const near: number[] = [];
  roomIdsAroundInto(world, 12.5, 10.5, 24, near);
  assert.deepEqual(near.sort((a, b) => a - b), [0, 2]);
});
