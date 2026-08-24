import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Feature,
  LiftDirection,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type Room,
  type Zone,
} from '../src/core/types';
import { pathBlockedAt } from '../src/core/path_blockers';
import { SURFACE_FLAG_CHALK_MAP, World } from '../src/core/world';
import { floorKeyForFloorInstance, floorKeyForProcedural, floorKeyForDesign } from '../src/data/floor_keys';
import { PROCEDURAL_FLOOR_ZS, proceduralFloorKey } from '../src/data/procedural_floors';
import { ROUTE_LIFTS_PER_DIRECTION } from '../src/data/route_lift_shafts';
import {
  collectFloorLiftAnchors,
  captureFloorMemory,
  clearFloorMemory,
  ensureFloorRouteLiftLayout,
  floorMemoryStats,
  floorMemoryStateForSave,
  restoreFloorMemoryFromSave,
  setFloorMemoryByteBudgetForTests,
  setFloorMemorySaveByteBudgetForTests,
  takeFloorMemory,
  tryBase64ToBytes,
  worldForSave,
  worldFromSave,
} from '../src/systems/floor_memory';
import { canActorOccupy } from '../src/systems/movement_collision';

const HUMAN_R = 0.16;

function proceduralMemoryKeyAt(index: number): string {
  const z = PROCEDURAL_FLOOR_ZS[index];
  assert.equal(typeof z, 'number');
  return floorKeyForProcedural(proceduralFloorKey(z));
}

function entity(id: number, type: EntityType): Entity {
  return {
    id,
    type,
    x: 10.5,
    y: 10.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
  };
}

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

function testZone(id: number, hasLift: boolean): Zone {
  return {
    id,
    cx: id * 128 + 64,
    cy: 64,
    faction: ZoneFaction.CITIZEN,
    hasLift,
    fogged: false,
    level: 0,
    hqRoomId: -1,
  };
}

// Deterministic dense-floor builder for the delta codec. Called independently for
// base / base2 / live it must produce byte-identical Worlds — the way a real floor
// regenerates identically from (runSeed, z). No RNG; a fixed integer hash fills the
// arrays with high entropy so the *full* snapshot is large (poor RLE) and the delta
// win is measurable. Two rooms (room 0 carries a generation-only defId+tags), two
// doors on DOOR cells, two containers, one zone.
function buildDeltaFloor(): World {
  const world = new World();
  for (let y = 40; y < 296; y++) {
    for (let x = 40; x < 296; x++) {
      const idx = world.idx(x, y);
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      world.cells[idx] = (h & 15) === 0 ? Cell.WALL : Cell.FLOOR;
      world.floorTex[idx] = h & 0xff;
      world.wallTex[idx] = (h >> 8) & 0xff;
      world.features[idx] = (h >> 16) & 0xff;
      world.roomMap[idx] = (h >> 3) & 1;
      world.zoneMap[idx] = 0;
    }
  }
  world.cells[world.idx(128, 128)] = Cell.FLOOR; // guarantee a floor spawn for the blocker rebuild
  const doorA = world.idx(60, 60);
  const doorB = world.idx(60, 80);
  for (const [idx, roomB] of [[doorA, 1], [doorB, 1]] as ReadonlyArray<readonly [number, number]>) {
    world.cells[idx] = Cell.DOOR;
    world.doors.set(idx, { idx, state: DoorState.CLOSED, roomA: 0, roomB, keyId: '', timer: 0 });
  }
  const room0 = testRoom(0, [doorA, doorB]);
  room0.x = 40; room0.y = 40; room0.w = 128; room0.h = 256;
  room0.defId = 'quest_target_room'; // generation-only fields: dropped by the sanitizer,
  room0.tags = ['tutorial', 'anchor']; // must be recovered from the base slot on a patch.
  const room1 = testRoom(1);
  room1.x = 168; room1.y = 40; room1.w = 128; room1.h = 256;
  world.rooms = [room0, room1];
  world.apartmentRoomCount = 0;
  world.zones = [testZone(0, false)];
  world.addContainer({
    id: 1, x: 50, y: 50, z: 0, roomId: 0, zoneId: 0, kind: ContainerKind.METAL_CABINET,
    name: 'cabinet', inventory: [{ defId: 'scrap', count: 2 }], access: 'public', discovered: false, tags: [],
  });
  world.addContainer({
    id: 2, x: 200, y: 50, z: 0, roomId: 1, zoneId: 0, kind: ContainerKind.SAFE,
    name: 'safe', inventory: [{ defId: 'ammo', count: 5 }], access: 'locked', discovered: false, tags: [],
  });
  return world;
}

function minLiftDistance(world: World, direction: LiftDirection): number {
  const anchors = collectFloorLiftAnchors(world, direction);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      min = Math.min(
        min,
        world.dist(
          anchors[i].liftX + 0.5,
          anchors[i].liftY + 0.5,
          anchors[j].liftX + 0.5,
          anchors[j].liftY + 0.5,
        ),
      );
    }
  }
  return min;
}

test('floor memory restores live world and keeps only persistent floor entities', () => {
  clearFloorMemory();
  const world = new World();
  const surface = new Uint8Array([1, 2, 3, 4]);
  world.surfaceMap.set(world.idx(12, 13), surface);

  const player = entity(1, EntityType.NPC);
  player.persistentNpcId = 'player';
  const npc = entity(2, EntityType.NPC);
  const projectile = entity(3, EntityType.PROJECTILE);
  assert.equal(captureFloorMemory(' route:test ', world, [player, npc, projectile], 12.5, 13.5, 90, 2), true);

  const loaded = takeFloorMemory('route:test');
  assert.ok(loaded);
  assert.equal(loaded.fromMemory, true);
  assert.equal(loaded.generation.world, world);
  assert.equal(loaded.generation.world.surfaceMap.get(world.idx(12, 13)), surface);
  assert.deepEqual(loaded.generation.entities.map(e => e.id), [2]);
  assert.equal(loaded.generation.spawnX, 12.5);
  assert.equal(loaded.generation.spawnY, 13.5);
  assert.equal((loaded.generation as { skyProvider?: unknown }).skyProvider, undefined);
  assert.equal(takeFloorMemory('route:test'), null, 'load is single-use while the floor is active');
  clearFloorMemory();
});

test('floor memory carries generation extras such as dynamic sky providers', () => {
  clearFloorMemory();
  const world = new World();
  const skyProvider = { update: () => false, dirty: false };
  assert.equal(captureFloorMemory('design:roof', world, [], 1.5, 2.5, 0, 0, { skyProvider }), true);

  const loaded = takeFloorMemory('design:roof');
  assert.ok(loaded);
  assert.equal((loaded.generation as { skyProvider?: unknown }).skyProvider, skyProvider);
  clearFloorMemory();
});

test('floor memory save restores full world snapshot without regenerating baseline', () => {
  clearFloorMemory();
  const key = proceduralMemoryKeyAt(0);
  const world = new World();
  const cellIdx = world.idx(17, 19);
  world.cells[cellIdx] = Cell.FLOOR;
  world.features[cellIdx] = Feature.SCREEN;
  world.rooms = [testRoom(0), testRoom(1), testRoom(2)];
  world.apartmentRoomCount = 2;
  world.surfaceMap.set(cellIdx, new Uint8Array(16 * 16 * 4).fill(7));
  world.surfaceFlags[cellIdx] |= SURFACE_FLAG_CHALK_MAP;
  world.addContainer({
    id: 44,
    x: 17,
    y: 19,
    floor: 0,
    roomId: -1,
    zoneId: 0,
    kind: 0,
    name: 'snapshot box',
    inventory: [{ defId: 'bread', count: 1 }],
    capacitySlots: 4,
    access: 'public',
    discovered: true,
    tags: ['snapshot'],
  });
  const npc = entity(9, EntityType.NPC);
  npc.x = 17.5;
  npc.y = 19.5;

  assert.equal(captureFloorMemory(key, world, [npc], 17.5, 19.5, 12, 3), true);
  const saved = floorMemoryStateForSave();
  assert.equal(saved.entries[0]?.world.apartmentRoomCount, 2);
  clearFloorMemory();

  const restored = restoreFloorMemoryFromSave(saved);
  assert.equal(restored.restored, 1);
  const loaded = takeFloorMemory(key);
  assert.ok(loaded);
  const restoredWorld = loaded.generation.world;
  assert.equal(restoredWorld.apartmentRoomCount, 2);
  assert.equal(restoredWorld.cells[cellIdx], Cell.FLOOR);
  assert.equal(restoredWorld.features[cellIdx], Feature.SCREEN);
  assert.equal(restoredWorld.surfaceMap.get(cellIdx)?.[0], 7);
  assert.equal((restoredWorld.surfaceFlags[cellIdx] & SURFACE_FLAG_CHALK_MAP) !== 0, true);
  assert.equal(restoredWorld.containers[0]?.name, 'snapshot box');
  assert.deepEqual(loaded.generation.entities.map(e => e.id), [9]);
  assert.equal(loaded.generation.spawnX, 17.5);
  assert.equal(loaded.generation.spawnY, 19.5);
  clearFloorMemory();
});

test('floor memory packed restore rebuilds fine blockers from saved features and containers', () => {
  clearFloorMemory();
  const key = floorKeyForDesign('living');
  const world = new World();
  for (let y = 41; y <= 45; y++) {
    for (let x = 40; x <= 47; x++) {
      world.cells[world.idx(x, y)] = Cell.FLOOR;
    }
  }

  const tableIdx = world.idx(42, 43);
  world.features[tableIdx] = Feature.TABLE;
  world.addContainer({
    id: 88,
    x: 45,
    y: 43,
    floor: 0,
    roomId: -1,
    zoneId: -1,
    kind: ContainerKind.METAL_CABINET,
    name: 'restored cabinet',
    inventory: [],
    capacitySlots: 4,
    access: 'public',
    discovered: true,
    tags: ['blocker_restore'],
  });

  assert.equal(captureFloorMemory(key, world, [], 40.5, 41.5, 1, 0), true);
  const saved = floorMemoryStateForSave();
  assert.ok(saved.entries.some(entry => entry.key === key));
  clearFloorMemory();

  const restored = restoreFloorMemoryFromSave(saved);
  assert.equal(restored.restored, 1);
  const loaded = takeFloorMemory(key);
  assert.ok(loaded);

  const restoredWorld = loaded.generation.world;
  assert.equal(restoredWorld.features[tableIdx], Feature.TABLE);
  assert.equal(restoredWorld.containers[0]?.kind, ContainerKind.METAL_CABINET);
  assert.equal(pathBlockedAt(restoredWorld, 42.5, 43.5), true);
  assert.equal(pathBlockedAt(restoredWorld, 45.5, 43.5), true);
  assert.equal(canActorOccupy(restoredWorld, 42.5, 43.5, HUMAN_R), false);
  assert.equal(canActorOccupy(restoredWorld, 45.5, 43.5, HUMAN_R), false);
  clearFloorMemory();
});

test('floor memory save view is capped and prefers newest entries', () => {
  clearFloorMemory();
  setFloorMemoryByteBudgetForTests(1);
  for (let i = 0; i < 32; i++) {
    assert.equal(captureFloorMemory(`story:cap_${i}`, new World(), [], 1, 1, i, 0), true);
  }

  const saved = floorMemoryStateForSave();
  assert.ok(saved.entries.length < 32);
  assert.ok(saved.bytes <= saved.byteBudget);
  assert.ok(saved.entries.some(entry => entry.key === 'story:cap_31'));
  assert.equal(saved.entries.some(entry => entry.key === 'story:cap_0'), false);

  setFloorMemoryByteBudgetForTests(undefined);
  clearFloorMemory();
});

test('floor memory restore keeps only the active-floor entry packed until take', () => {
  clearFloorMemory();
  const world = new World();
  assert.equal(captureFloorMemory(proceduralMemoryKeyAt(0), world, [entity(50, EntityType.NPC)], 3, 4, 1, 0), true);
  const template = floorMemoryStateForSave().entries[0];
  assert.ok(template);

  // A valid save now carries only the single active floor, but a stale or hand-edited blob may
  // still list many. Restore honours the save cap (1) and the bounded scan window, keeping just
  // the first known entry regardless of how many the blob claims.
  const entries = Array.from({ length: 32 }, (_, i) => ({
    ...JSON.parse(JSON.stringify(template)),
    key: proceduralMemoryKeyAt(i),
    capturedAt: i,
  }));
  clearFloorMemory();

  const restored = restoreFloorMemoryFromSave({
    version: 1,
    entries,
    bytes: 0,
    byteBudget: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(restored.restored, 1);
  assert.equal(restored.keys.length, 1);

  const stats = floorMemoryStats();
  assert.equal(stats.fullCount, 0);
  assert.equal(stats.packedCount, 1);
  assert.ok(takeFloorMemory(proceduralMemoryKeyAt(0)));
  assert.equal(floorMemoryStats().fullCount, 0);
  assert.equal(floorMemoryStats().packedCount, 0);
  assert.equal(takeFloorMemory(proceduralMemoryKeyAt(31)), null);
  clearFloorMemory();
});

test('floor memory restore skips unknown keys before applying restored entry cap', () => {
  clearFloorMemory();
  const validKey = floorKeyForDesign('living');
  const staleInstanceKey = floorKeyForFloorInstance('not_registered');
  assert.equal(captureFloorMemory(validKey, new World(), [entity(60, EntityType.NPC)], 5, 6, 2, 0), true);
  const template = floorMemoryStateForSave().entries[0];
  assert.ok(template);

  // Restore scans a bounded window (MAX_FLOOR_MEMORY_RESTORE_SCAN_ENTRIES) so a few stale/unknown
  // keys at the front cannot starve out the one valid active-floor entry within that window.
  const unknownEntries = Array.from({ length: 2 }, (_, i) => ({
    ...JSON.parse(JSON.stringify(template)),
    key: `design:missing_${i}`,
    capturedAt: i,
  }));
  const entries = [
    ...unknownEntries,
    { ...JSON.parse(JSON.stringify(template)), key: staleInstanceKey, capturedAt: 2 },
    { ...JSON.parse(JSON.stringify(template)), key: validKey, capturedAt: 3 },
  ];
  clearFloorMemory();

  const restored = restoreFloorMemoryFromSave({
    version: 1,
    entries,
    bytes: 0,
    byteBudget: Number.MAX_SAFE_INTEGER,
  });
  assert.equal(restored.restored, 1);
  assert.equal(restored.skipped, 3);
  assert.deepEqual(restored.keys, [validKey]);
  assert.equal(takeFloorMemory(staleInstanceKey), null);
  assert.ok(takeFloorMemory(validKey));
  clearFloorMemory();
});

test('floor memory restore resolves generation extras lazily when packed memory is taken', () => {
  clearFloorMemory();
  const key = floorKeyForDesign('living');
  assert.equal(captureFloorMemory(key, new World(), [], 3, 4, 1, 0), true);
  const saved = floorMemoryStateForSave();
  clearFloorMemory();

  let calls = 0;
  const restored = restoreFloorMemoryFromSave(saved, {
    generationExtrasForKey: restoredKey => {
      calls++;
      return { lazyExtraKey: restoredKey };
    },
  });
  assert.equal(restored.restored, 1);
  assert.equal(calls, 0);

  const loaded = takeFloorMemory(key);
  assert.ok(loaded);
  assert.equal(calls, 1);
  assert.equal((loaded.generation as { lazyExtraKey?: string }).lazyExtraKey, key);
  clearFloorMemory();
});

test('floor memory save byte cap skips oversized entries', () => {
  clearFloorMemory();
  setFloorMemorySaveByteBudgetForTests(4096);
  assert.equal(captureFloorMemory('story:small_save', new World(), [], 1, 1, 1, 0), true);

  const huge = new World();
  for (let i = 0; i < 20; i++) {
    huge.surfaceMap.set(huge.idx(100 + i, 100), new Uint8Array(16 * 16 * 4).fill(i + 1));
  }
  assert.equal(captureFloorMemory('story:huge_save', huge, [], 1, 1, 2, 0), true);

  const saved = floorMemoryStateForSave();
  assert.ok(saved.bytes <= saved.byteBudget);
  assert.ok(saved.entries.some(entry => entry.key === 'story:small_save'));
  assert.equal(saved.entries.some(entry => entry.key === 'story:huge_save'), false);

  setFloorMemorySaveByteBudgetForTests(undefined);
  clearFloorMemory();
});

test('floor memory restore sanitizes billboard props as non-item entities', () => {
  clearFloorMemory();
  const key = floorKeyForDesign('living');
  const world = new World();
  const billboard = entity(55, EntityType.BILLBOARD);
  billboard.inventory = [{ defId: 'bread', count: 1 }];
  assert.equal(captureFloorMemory(key, world, [billboard], 10.5, 10.5, 1, 0), true);

  const saved = floorMemoryStateForSave();
  const entry = JSON.parse(JSON.stringify(saved.entries[0])) as typeof saved.entries[number] & { entities: unknown[] };
  (entry.entities[0] as Record<string, unknown>).x = 'bad';
  entry.entities.push({ id: 99, type: 999, x: 1, y: 1, angle: 0, pitch: 0, alive: true, speed: 0, sprite: 0 });

  clearFloorMemory();
  const restored = restoreFloorMemoryFromSave({ version: 1, entries: [entry], bytes: 0, byteBudget: 0 });
  assert.equal(restored.restored, 1);

  const loaded = takeFloorMemory(key);
  assert.ok(loaded);
  assert.equal(loaded.generation.entities.length, 1);
  const restoredBillboard = loaded.generation.entities[0];
  assert.equal(restoredBillboard.type, EntityType.BILLBOARD);
  assert.equal(restoredBillboard.inventory, undefined);
  assert.equal(restoredBillboard.x, W / 2);
  clearFloorMemory();
});

test('floor memory restore skips corrupt snapshots and malformed nested entries', () => {
  clearFloorMemory();
  const goodKey = floorKeyForDesign('living');
  const badKey = floorKeyForDesign('ministry');
  const world = new World();
  const idx = world.idx(21, 22);
  world.cells[idx] = Cell.FLOOR;
  world.surfaceMap.set(idx, new Uint8Array(16 * 16 * 4).fill(9));
  assert.equal(captureFloorMemory(goodKey, world, [entity(40, EntityType.NPC)], 21.5, 22.5, 5, 0), true);
  const saved = floorMemoryStateForSave();
  const good = JSON.parse(JSON.stringify(saved.entries[0])) as typeof saved.entries[number];
  good.world.surfaceMap.push([world.idx(23, 24), 'not valid base64']);
  const badRle = JSON.parse(JSON.stringify(good)) as typeof good;
  (good.entities as unknown[]).push({ id: BigInt(41), type: EntityType.NPC });
  badRle.key = badKey;
  badRle.world.arrays[0].data = 'AAAA';

  clearFloorMemory();
  // Corrupt entry first: restore stops after the single valid entry it needs (save cap 1), so the
  // corrupt snapshot must be scanned before the good one for its skip to be observable.
  const restored = restoreFloorMemoryFromSave({
    version: 1,
    entries: [badRle, good],
    bytes: 0,
    byteBudget: 0,
  });
  assert.equal(restored.restored, 1);
  assert.equal(restored.skipped, 1);

  const loaded = takeFloorMemory(goodKey);
  assert.ok(loaded);
  assert.equal(loaded.generation.world.surfaceMap.get(idx)?.[0], 9);
  assert.deepEqual(loaded.generation.entities.map(e => e.id), [40]);
  assert.equal(takeFloorMemory(badKey), null);
  clearFloorMemory();
});

test('floor memory restore sanitizes invalid doors and malformed containers before hydration', () => {
  clearFloorMemory();
  const key = floorKeyForDesign('living');
  const world = new World();
  const doorIdx = world.idx(30, 30);
  world.cells[doorIdx] = Cell.DOOR;
  world.rooms = [testRoom(0, [doorIdx])];
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: DoorState.OPEN,
    roomA: 0,
    roomB: -1,
    keyId: '',
    timer: 0,
  });
  world.addContainer({
    id: 77,
    x: 31,
    y: 30,
    floor: 0,
    roomId: 0,
    zoneId: 0,
    kind: ContainerKind.METAL_CABINET,
    name: 'valid box',
    inventory: [{ defId: 'bread', count: 2 }],
    capacitySlots: 4,
    access: 'public',
    discovered: true,
    tags: ['valid'],
  });

  assert.equal(captureFloorMemory(key, world, [], 30.5, 31.5, 1, 0), true);
  const saved = floorMemoryStateForSave();
  const entry = JSON.parse(JSON.stringify(saved.entries[0])) as typeof saved.entries[number];
  entry.world.doors[0][1].state = 999;
  entry.world.doors.push([world.idx(31, 31), {
    idx: world.idx(31, 31),
    state: DoorState.OPEN,
    roomA: 0,
    roomB: -1,
    keyId: '',
    timer: 0,
  }]);
  (entry.world.containers as unknown[]).push({
    id: 'bad',
    x: 'nope',
    y: 30,
    floor: 0,
    roomId: 0,
    zoneId: 0,
    kind: ContainerKind.SAFE,
    name: 'bad box',
    inventory: [{ defId: 'ammo_9x18', count: 1 }],
    capacitySlots: 4,
    access: 'public',
    discovered: true,
    tags: ['bad'],
  });

  clearFloorMemory();
  const restored = restoreFloorMemoryFromSave({ version: 1, entries: [entry], bytes: 0, byteBudget: 0 });
  assert.equal(restored.restored, 1);
  assert.equal(floorMemoryStats().packedCount, 1);

  const loaded = takeFloorMemory(key);
  assert.ok(loaded);
  const restoredWorld = loaded.generation.world;
  assert.equal(restoredWorld.doors.get(doorIdx)?.state, DoorState.CLOSED);
  assert.equal(restoredWorld.solid(30, 30), true);
  assert.equal(restoredWorld.doors.has(world.idx(31, 31)), false);
  assert.equal(restoredWorld.containers.length, 1);
  assert.equal(restoredWorld.containerById.get(77)?.name, 'valid box');
  assert.equal(restoredWorld.containerById.has(Number.NaN), false);
  clearFloorMemory();
});

test('floor memory byte budget evicts least-recent captured floors', () => {
  clearFloorMemory();
  setFloorMemoryByteBudgetForTests(1);
  assert.equal(captureFloorMemory('story:one', new World(), [], 1, 1, 0, 0), true);
  assert.equal(captureFloorMemory('story:two', new World(), [], 2, 2, 0, 0), true);
  const stats = floorMemoryStats();
  assert.equal(stats.fullCount, 1);
  assert.equal(stats.packedCount, 1);
  assert.ok(takeFloorMemory('story:one'));
  assert.ok(takeFloorMemory('story:two'));
  setFloorMemoryByteBudgetForTests(undefined);
  clearFloorMemory();
});

/* ── Маршрутные лифты: постановка по шахтам ────────────────────────
 *
 * Прежние десять тестов проверяли снятую машинерию: перенос якорей с этажа
 * отправления, пин «того самого» лифта, перераспределение сгрудившихся,
 * добор до шестнадцати. Всего этого больше нет — и не потому, что стало
 * хуже, а потому, что стало не нужно: оба этажа перегона выводят позиции из
 * одного ключа ребра, и обратный лифт стоит в клетке отправления по
 * построению. Ниже проверяется новый контракт. */

test('рантайм ставит те же шестнадцать лифтов на направление, что и генерация', () => {
  const world = openFloorWorld();
  const result = ensureFloorRouteLiftLayout(world, 0x51ff77, 0, 228.5, 228.5);
  assert.equal(result.up, ROUTE_LIFTS_PER_DIRECTION, `вверх ${result.up}`);
  assert.equal(result.down, ROUTE_LIFTS_PER_DIRECTION, `вниз ${result.down}`);
});

test('постановка идемпотентна: второй прогон ничего не меняет', () => {
  const world = openFloorWorld();
  ensureFloorRouteLiftLayout(world, 0x51ff77, 0, 228.5, 228.5);
  const first = liftCellSignature(world);
  const again = ensureFloorRouteLiftLayout(world, 0x51ff77, 0, 228.5, 228.5);
  assert.equal(again.up, ROUTE_LIFTS_PER_DIRECTION);
  assert.equal(again.down, ROUTE_LIFTS_PER_DIRECTION);
  assert.deepEqual(liftCellSignature(world), first, 'повторный прогон сдвинул лифты');
});

test('лифты вниз этажа совпадают с лифтами вверх этажа под ним', () => {
  const upper = openFloorWorld();
  const lower = openFloorWorld();
  ensureFloorRouteLiftLayout(upper, 0x51ff77, 0, 228.5, 228.5);
  ensureFloorRouteLiftLayout(lower, 0x51ff77, -1, 228.5, 228.5);
  const down = liftCellSignature(upper).filter(entry => entry.endsWith(':down')).map(entry => entry.split(':')[0]);
  const up = liftCellSignature(lower).filter(entry => entry.endsWith(':up')).map(entry => entry.split(':')[0]);
  assert.deepEqual(down, up, 'перегон разошёлся по клеткам');
});

test('обратный лифт находится у точки отправления', () => {
  const world = openFloorWorld();
  const seeded = ensureFloorRouteLiftLayout(world, 0x51ff77, 0, 228.5, 228.5);
  assert.ok(seeded.up > 0);
  const anyUp = liftCellSignature(world).find(entry => entry.endsWith(':up'))!;
  const idx = Number(anyUp.split(':')[0]);
  const lx = (idx % W) + 0.5;
  const ly = ((idx / W) | 0) + 0.5;
  const layout = ensureFloorRouteLiftLayout(world, 0x51ff77, 0, lx, ly, LiftDirection.UP);
  assert.equal(layout.primaryLiftIdx, idx, 'ближайшим оказался не тот лифт, у которого стоим');
  assert.ok(layout.primaryAccessIdx >= 0, 'у лифта нет проходимой клетки перед ним');
});

function openFloorWorld(): World {
  const world = new World();
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) world.set(x, y, Cell.FLOOR);
  return world;
}

function liftCellSignature(world: World): string[] {
  const out: string[] = [];
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.LIFT || world.features[i] === Feature.MACHINE) continue;
    out.push(`${i}:${world.liftDir[i] === LiftDirection.UP ? 'up' : 'down'}`);
  }
  return out.sort();
}

test('tryBase64ToBytes handles invalid base64 by returning null', () => {
  const originalBuffer = globalThis.Buffer;
  (globalThis as any).Buffer = undefined;
  try {
    assert.equal(tryBase64ToBytes('%%%'), null);
  } finally {
    globalThis.Buffer = originalBuffer;
  }
});


test('floor memory delta round-trips a mutated dense floor against a regenerated base', () => {
  const base = buildDeltaFloor();
  const base2 = buildDeltaFloor(); // independent regeneration, as at load time
  const live = buildDeltaFloor();

  // Geometry mutations, each forced to differ from the (identical) base value so the
  // XOR delta is non-trivial for every one of the 12 arrays we touch.
  const cellIdx = base.idx(70, 70);
  live.cells[cellIdx] = base.cells[cellIdx] === Cell.WALL ? Cell.FLOOR : Cell.WALL;
  const featIdx = base.idx(72, 72);
  live.features[featIdx] = base.features[featIdx] ^ 0x5a;
  const wallIdx = base.idx(74, 74);
  live.wallTex[wallIdx] = base.wallTex[wallIdx] ^ 0x33;
  const floorIdx = base.idx(76, 76);
  live.floorTex[floorIdx] = base.floorTex[floorIdx] ^ 0x0f;
  const chalkIdx = base.idx(78, 78);
  live.surfaceFlags[chalkIdx] |= SURFACE_FLAG_CHALK_MAP;
  const roomMapIdx = base.idx(80, 80);
  live.roomMap[roomMapIdx] = base.roomMap[roomMapIdx] ^ 1;

  // Room patch (seal + rename room 0), appended samosbor room, door delta.
  live.rooms[0].sealed = true;
  live.rooms[0].name = 'запечатанная';
  const appended = testRoom(2);
  appended.x = 44; appended.y = 44; appended.name = 'samosbor pocket';
  live.rooms.push(appended);
  const doorA = base.idx(60, 60);
  const doorB = base.idx(60, 80);
  const newDoor = base.idx(90, 90);
  live.doors.delete(doorA); // removed
  live.doors.get(doorB)!.state = DoorState.LOCKED; // changed
  live.cells[newDoor] = Cell.DOOR; // added (cell must be DOOR for the door sanitizer)
  live.doors.set(newDoor, { idx: newDoor, state: DoorState.OPEN, roomA: 0, roomB: 1, keyId: '', timer: 0 });

  // Container loot (absolute in both modes).
  live.containers[0].inventory = [];
  live.containers[0].discovered = true;

  const deltaSave = worldForSave(live, base);
  const fullSave = worldForSave(live);
  assert.equal(deltaSave.baseDelta, true);
  const deltaBytes = JSON.stringify(deltaSave).length;
  const fullBytes = JSON.stringify(fullSave).length;
  assert.ok(deltaBytes * 10 < fullBytes, `delta ${deltaBytes} vs full ${fullBytes}`);

  const roundTripped = JSON.parse(JSON.stringify(deltaSave));
  const decoded = worldFromSave(roundTripped, 128.5, 128.5, base2);
  assert.ok(decoded, 'delta must decode against an identically regenerated base');

  // All 12 world arrays reconstruct byte-for-byte.
  assert.deepEqual(decoded.cells, live.cells);
  assert.deepEqual(decoded.roomMap, live.roomMap);
  assert.deepEqual(decoded.wallTex, live.wallTex);
  assert.deepEqual(decoded.floorTex, live.floorTex);
  assert.deepEqual(decoded.features, live.features);
  assert.deepEqual(decoded.aptMask, live.aptMask);
  assert.deepEqual(decoded.hermoWall, live.hermoWall);
  assert.deepEqual(decoded.zoneMap, live.zoneMap);
  assert.deepEqual(decoded.factionControl, live.factionControl);
  assert.deepEqual(decoded.fog, live.fog);
  assert.deepEqual(decoded.liftDir, live.liftDir);
  assert.deepEqual(decoded.surfaceFlags, live.surfaceFlags);

  // Rooms: patch applied, generation-only defId/tags recovered from base, samosbor room appended.
  assert.equal(decoded.rooms.length, 3);
  assert.equal(decoded.rooms[0].sealed, true);
  assert.equal(decoded.rooms[0].name, 'запечатанная');
  assert.equal(decoded.rooms[0].defId, 'quest_target_room');
  assert.deepEqual(decoded.rooms[0].tags, ['tutorial', 'anchor']);
  assert.equal(decoded.rooms[1].sealed, false);
  assert.equal(decoded.rooms[2].id, 2);
  assert.equal(decoded.rooms[2].name, 'samosbor pocket');

  // Doors: removed / changed / added.
  assert.equal(decoded.doors.has(doorA), false);
  assert.equal(decoded.doors.get(doorB)?.state, DoorState.LOCKED);
  assert.equal(decoded.doors.has(newDoor), true);
  assert.equal(decoded.doors.get(newDoor)?.state, DoorState.OPEN);

  // Containers (absolute): the looted state survives verbatim.
  assert.equal(decoded.containerById.get(1)?.inventory.length, 0);
  assert.equal(decoded.containerById.get(1)?.discovered, true);
  assert.equal(decoded.containerById.get(2)?.inventory.length, 1);
});

test('floor memory delta base regenerates byte-identically for the drift guard', () => {
  const a = buildDeltaFloor();
  const b = buildDeltaFloor();
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.roomMap, b.roomMap);
  assert.deepEqual(a.wallTex, b.wallTex);
  assert.deepEqual(a.floorTex, b.floorTex);
  assert.deepEqual(a.features, b.features);
  assert.deepEqual(a.rooms, b.rooms);
  assert.deepEqual([...a.doors.entries()], [...b.doors.entries()]);

  // An empty delta (live === base) must satisfy the baseHash gate against the twin.
  const save = JSON.parse(JSON.stringify(worldForSave(a, a)));
  const decoded = worldFromSave(save, 128.5, 128.5, b);
  assert.ok(decoded, 'identical base regeneration must pass the baseHash gate');
});

test('floor memory delta rejects a drifted or missing base and returns null', () => {
  const base = buildDeltaFloor();
  const live = buildDeltaFloor();
  live.rooms[0].sealed = true; // one real change so it is a genuine delta
  const save = JSON.parse(JSON.stringify(worldForSave(live, base)));

  // Drifted base: a single differing cell changes the baseHash → decode bails to null
  // so the loader falls back to a fresh regenerate instead of corrupting the grid.
  const drifted = buildDeltaFloor();
  const idx = drifted.idx(128, 128);
  drifted.cells[idx] = drifted.cells[idx] === Cell.WALL ? Cell.FLOOR : Cell.WALL;
  assert.equal(worldFromSave(save, 128.5, 128.5, drifted), null);

  // Missing base → null.
  assert.equal(worldFromSave(save, 128.5, 128.5, null), null);
  assert.equal(worldFromSave(save, 128.5, 128.5, undefined), null);
});

test('floor memory delta survives the capture→save→restore→take pipeline', () => {
  clearFloorMemory();
  const key = floorKeyForDesign('living');
  const live = buildDeltaFloor();
  const doorB = live.idx(60, 80);
  live.rooms[0].sealed = true;
  live.rooms[0].name = 'запечатанная';
  live.doors.get(doorB)!.state = DoorState.LOCKED;
  live.containers[0].inventory = [];
  live.containers[0].discovered = true;

  // 9th arg is the lazy delta base thunk (mirrors captureCurrentFloorMemory at save time).
  assert.equal(
    captureFloorMemory(key, live, [], 128.5, 128.5, 7, 0, undefined, () => buildDeltaFloor()),
    true,
  );
  const saved = JSON.parse(JSON.stringify(floorMemoryStateForSave()));
  assert.equal(saved.entries[0]?.world.baseDelta, true);

  clearFloorMemory();
  const restored = restoreFloorMemoryFromSave(saved);
  assert.equal(restored.restored, 1);
  const loaded = takeFloorMemory(key, () => buildDeltaFloor());
  assert.ok(loaded);
  const w = loaded.generation.world;
  assert.equal(w.rooms[0].sealed, true);
  assert.equal(w.rooms[0].name, 'запечатанная');
  assert.equal(w.rooms[0].defId, 'quest_target_room');
  assert.equal(w.doors.get(doorB)?.state, DoorState.LOCKED);
  assert.equal(w.containerById.get(1)?.inventory.length, 0);
  assert.equal(w.containerById.get(1)?.discovered, true);
  clearFloorMemory();
});

/* The layout pass caches its floor-wide BFS and lift scan for the duration of one
 * call and drops them only when a lift actually moved — otherwise a single boss
 * kill (main.ts → applyDesignRouteGates) paid ten reachability sweeps and a dozen
 * W² scans inside one frame. The lock: a settled floor must come back byte-for-byte
 * identical on a repeat call and report no work, so a stale cache cannot hide a
 * lift the pass should have seen. */
