import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, RoomType, Tex } from '../src/core/types';
import { World } from '../src/core/world';
import {
  isMapCellExplored,
  resetMapExploration,
  revealMapZone,
} from '../src/systems/map_exploration';

test('map zone reveal includes corridor geometry without revealing other zones', () => {
  const world = new World();
  resetMapExploration(world);

  const corridor = world.idx(20, 20);
  const door = world.idx(21, 20);
  const lift = world.idx(22, 20);
  const water = world.idx(23, 20);
  const abyss = world.idx(24, 20);
  const wall = world.idx(25, 20);
  const otherZoneFloor = world.idx(26, 20);

  world.cells[corridor] = Cell.FLOOR;
  world.cells[door] = Cell.DOOR;
  world.cells[lift] = Cell.LIFT;
  world.cells[water] = Cell.WATER;
  world.cells[abyss] = Cell.ABYSS;
  world.cells[wall] = Cell.WALL;
  world.cells[otherZoneFloor] = Cell.FLOOR;

  for (const idx of [corridor, door, lift, water, abyss, wall]) world.zoneMap[idx] = 7;
  world.zoneMap[otherZoneFloor] = 8;

  revealMapZone(world, 7);

  assert.equal(isMapCellExplored(world, corridor), true);
  assert.equal(isMapCellExplored(world, door), true);
  assert.equal(isMapCellExplored(world, lift), true);
  assert.equal(isMapCellExplored(world, water), true);
  assert.equal(isMapCellExplored(world, abyss), true);
  assert.equal(isMapCellExplored(world, wall), false);
  assert.equal(isMapCellExplored(world, otherZoneFloor), false);
});

test('zone reveal treats touched rooms as whole map elements', () => {
  const world = new World();
  resetMapExploration(world);

  const left = world.idx(30, 30);
  const right = world.idx(31, 30);
  world.cells[left] = Cell.FLOOR;
  world.cells[right] = Cell.FLOOR;
  world.zoneMap[left] = 3;
  world.zoneMap[right] = 4;
  world.roomMap[left] = 0;
  world.roomMap[right] = 0;
  world.rooms.push({
    id: 0,
    type: RoomType.COMMON,
    x: 30,
    y: 30,
    w: 2,
    h: 1,
    doors: [],
    sealed: false,
    name: 'test room',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.CONCRETE,
  });

  revealMapZone(world, 3);

  assert.equal(isMapCellExplored(world, left), true);
  assert.equal(isMapCellExplored(world, right), true);
});
