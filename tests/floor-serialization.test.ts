import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Feature,
  FloorLevel,
  RoomType,
  Tex,
  W,
  type Entity,
  type Room,
} from '../src/core/types';
import { World } from '../src/core/world';
import {
  FLOOR_SNAPSHOT_VERSION,
  chunkFloorSnapshot,
  deserializeFloorSnapshot,
  packFloorForNetwork,
  reassembleFloorSnapshot,
  serializeFloorSnapshot,
  unpackFloorFromNetwork,
} from '../src/systems/floor_serialization';

function testRoom(id: number, doors: number[] = []): Room {
  return {
    id,
    type: RoomType.COMMON,
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    doors,
    sealed: false,
    name: `room ${id}`,
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  };
}

function entity(id: number, type: EntityType, x = 10.5, y = 10.5): Entity {
  return { id, type, x, y, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 0 };
}

function buildHostWorld(): World {
  const world = new World();
  const floorIdx = world.idx(17, 19);
  world.cells[floorIdx] = Cell.FLOOR;
  world.features[floorIdx] = Feature.SCREEN;
  world.rooms = [testRoom(0), testRoom(1)];
  world.apartmentRoomCount = 1;

  // A carved door mutation the peer could never reproduce from a bare seed.
  const doorIdx = world.idx(20, 20);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: DoorState.OPEN,
    roomA: 0,
    roomB: 1,
    keyId: '',
    timer: 0,
  });
  world.rooms[0].doors.push(doorIdx);

  world.addContainer({
    id: 7,
    x: 21,
    y: 21,
    floor: FloorLevel.LIVING,
    roomId: 0,
    zoneId: 0,
    kind: ContainerKind.METAL_CABINET,
    name: 'шкаф',
    inventory: [{ defId: 'medkit', count: 2 }],
    access: 'public',
    discovered: true,
    tags: [],
  });
  world.rebuildContainerMap();
  return world;
}

test('network snapshot round-trips host floor geometry and mutations to the peer', () => {
  const world = buildHostWorld();
  const entities: Entity[] = [
    entity(1, EntityType.NPC),                 // host player body
    entity(2, EntityType.MONSTER, 30.5, 30.5), // live monster
    entity(3, EntityType.ITEM_DROP, 31.5, 31.5),
    entity(4, EntityType.PROJECTILE, 32.5, 32.5), // must be dropped
    { ...entity(5, EntityType.NPC, 33.5, 33.5), peerSlot: 1 }, // remote peer — excluded
  ];

  const snapshot = packFloorForNetwork(world, entities, {
    floor: FloorLevel.LIVING,
    runSeed: 12345,
    floorKey: 'design:living',
    spawnX: 40.25,
    spawnY: 41.75,
    samosborCount: 2,
    gameTime: 90,
    nextEntityId: 6,
  });

  assert.equal(snapshot.v, FLOOR_SNAPSHOT_VERSION);
  // Projectiles and remote peer actors are not part of the checkpoint.
  assert.deepEqual(snapshot.entities.map(e => e.id).sort(), [1, 2, 3]);

  const serialized = serializeFloorSnapshot(snapshot);
  const chunks = chunkFloorSnapshot(serialized, 1024);
  assert.ok(chunks.length >= 1);

  const reassembled = reassembleFloorSnapshot(chunks, chunks.length);
  assert.equal(reassembled, serialized);

  const parsed = deserializeFloorSnapshot(reassembled!);
  assert.ok(parsed);
  const unpacked = unpackFloorFromNetwork(parsed!);
  assert.ok(unpacked);

  // Geometry + mutations survived the round-trip.
  assert.equal(unpacked!.world.cells[world.idx(17, 19)], Cell.FLOOR);
  assert.equal(unpacked!.world.features[world.idx(17, 19)], Feature.SCREEN);
  assert.equal(unpacked!.world.cells[world.idx(20, 20)], Cell.DOOR);
  assert.equal(unpacked!.world.doors.get(world.idx(20, 20))?.state, DoorState.OPEN);
  assert.equal(unpacked!.world.containers.length, 1);
  assert.equal(unpacked!.world.containers[0].inventory[0].defId, 'medkit');

  // Metadata + entities preserved.
  assert.equal(unpacked!.meta.floor, FloorLevel.LIVING);
  assert.equal(unpacked!.meta.nextEntityId, 6);
  assert.equal(unpacked!.meta.spawnX, 40.25);
  assert.deepEqual(unpacked!.entities.map(e => e.id).sort(), [1, 2, 3]);
});

test('incomplete chunk stream never reassembles', () => {
  const world = new World();
  const snapshot = packFloorForNetwork(world, [], {
    floor: FloorLevel.LIVING,
    runSeed: 1,
    spawnX: W / 2,
    spawnY: W / 2,
    samosborCount: 0,
    gameTime: 0,
    nextEntityId: 1,
  });
  const chunks = chunkFloorSnapshot(serializeFloorSnapshot(snapshot), 512);
  if (chunks.length > 1) {
    const missing = chunks.slice();
    missing[1] = undefined as unknown as string;
    assert.equal(reassembleFloorSnapshot(missing, chunks.length), null);
  }
  // A version mismatch fails the join cleanly instead of restoring garbage.
  const bad = serializeFloorSnapshot(snapshot).replace(`"v":${FLOOR_SNAPSHOT_VERSION}`, '"v":999');
  assert.equal(deserializeFloorSnapshot(bad), null);
});
