import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, RoomType, Tex, type Room } from '../src/core/types';
import { World } from '../src/core/world';
import { applyFrontFieldStitch } from '../src/systems/samosbor_wave';
import { makeGameState } from './helpers';

function floorWorld(x0: number, y0: number, w: number, h: number): World {
  const world = new World();
  const room: Room = {
    id: 0,
    type: RoomType.COMMON,
    x: x0,
    y: y0,
    w,
    h,
    doors: [],
    sealed: false,
    name: 'Зал',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  };
  world.rooms = [room];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const ci = world.idx(x, y);
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = 0;
    }
  }
  return world;
}

// Regression lock: the stitch used to push a "Перестроенный участок" room with a
// hard-coded 1x1 box at (0,0), so every bbox consumer (territory ownership, room
// centre, shelter search, A-Life anchoring) read the map corner as the rebuilt
// section — and the room was pushed even when no cell carried its id.
test('samosbor stitch patch room covers the cells it owns', () => {
  const world = floorWorld(40, 40, 8, 8);
  const replacement = floorWorld(40, 40, 8, 8);
  const state = makeGameState({ currentZ: 0 });

  const touched = new Set<number>();
  for (let y = 42; y <= 44; y++) {
    for (let x = 42; x <= 44; x++) touched.add(world.idx(x, y));
  }

  const copied = applyFrontFieldStitch(world, state, touched, {
    world: replacement,
    entities: [],
    spawnX: 41,
    spawnY: 41,
  });
  assert.ok(copied > 0);

  const patch = world.rooms.find(room => room.name === 'Перестроенный участок');
  assert.ok(patch, 'patch room must exist when cells adopted its id');
  const owned: number[] = [];
  for (let y = 38; y <= 48; y++) {
    for (let x = 38; x <= 48; x++) {
      const ci = world.idx(x, y);
      if (world.roomMap[ci] === patch.id) owned.push(ci);
    }
  }
  assert.ok(owned.length > 0);
  for (const ci of owned) {
    const x = ci % 1024;
    const y = Math.floor(ci / 1024);
    assert.ok(x >= patch.x && x < patch.x + patch.w, `cell x ${x} inside patch bbox`);
    assert.ok(y >= patch.y && y < patch.y + patch.h, `cell y ${y} inside patch bbox`);
  }
  assert.notEqual(`${patch.x},${patch.y},${patch.w},${patch.h}`, '0,0,1,1');
});
