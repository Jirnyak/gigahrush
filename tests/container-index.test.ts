import test from 'node:test';
import assert from 'node:assert';
import { World } from '../src/core/world';
import { ContainerKind, W, type WorldContainer } from '../src/core/types';
import { containersInRoom, forEachContainerNear, nearestContainer } from '../src/world/container_index';

function box(id: number, x: number, y: number, roomId: number): WorldContainer {
  return {
    id, x, y, z: 0, roomId, zoneId: 0,
    kind: ContainerKind.METAL_CABINET,
    name: `Ящик ${id}`,
    inventory: [],
    access: 'public',
    discovered: true,
    tags: [],
  };
}

function worldWith(...containers: WorldContainer[]): World {
  const world = new World();
  for (const c of containers) world.addContainer(c);
  return world;
}

test('ящики адресуются по комнате, а не перебором этажа', () => {
  const world = worldWith(box(1, 10, 10, 3), box(2, 12, 10, 3), box(3, 400, 400, 7));
  assert.deepEqual(containersInRoom(world, 3).map(c => c.id), [1, 2]);
  assert.deepEqual(containersInRoom(world, 7).map(c => c.id), [3]);
  assert.deepEqual(containersInRoom(world, 9).map(c => c.id), []);
  assert.deepEqual(containersInRoom(world, -1).map(c => c.id), []);
});

test('поиск по радиусу идёт по клеткам тора и через шов', () => {
  // Один ящик у нулевой кромки, второй — у противоположной: по тору они соседи.
  const world = worldWith(box(1, 2, 2, 0), box(2, W - 3, W - 3, 1));
  const seen: number[] = [];
  forEachContainerNear(world, 0.5, 0.5, 8, c => { seen.push(c.id); });
  assert.deepEqual(seen.sort(), [1, 2]);

  const far: number[] = [];
  forEachContainerNear(world, 500.5, 500.5, 8, c => { far.push(c.id); });
  assert.deepEqual(far, []);
});

test('ближайший ящик выбирается по расстоянию и не виден за радиусом', () => {
  const world = worldWith(box(1, 40, 40, 0), box(2, 44, 40, 0), box(3, 200, 200, 1));
  assert.equal(nearestContainer(world, 45.5, 40.5, 40, () => true)?.id, 2);
  // Предикат отсеивает ближний — берётся следующий по расстоянию, а не первый.
  assert.equal(nearestContainer(world, 45.5, 40.5, 40, c => c.id !== 2)?.id, 1);
  assert.equal(nearestContainer(world, 45.5, 40.5, 8, c => c.id === 3), undefined);
});

test('индекс пересобирается и на дописанный ящик, и на вычеркнутый', () => {
  const world = worldWith(box(1, 20, 20, 4));
  assert.deepEqual(containersInRoom(world, 4).map(c => c.id), [1]);

  world.addContainer(box(2, 21, 20, 4));
  assert.deepEqual(containersInRoom(world, 4).map(c => c.id), [1, 2]);

  // Удаление везде идёт пересозданием массива — индекс обязан это заметить.
  world.containers = world.containers.filter(c => c.id !== 1);
  assert.deepEqual(containersInRoom(world, 4).map(c => c.id), [2]);

  // Самосбор двигает комнаты под стоящими ящиками: признак — cellVersion.
  world.containers[0].roomId = 5;
  world.cellVersion++;
  assert.deepEqual(containersInRoom(world, 5).map(c => c.id), [2]);
  assert.deepEqual(containersInRoom(world, 4).map(c => c.id), []);
});
