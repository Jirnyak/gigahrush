import { test } from 'node:test';
import { World } from '../src/core/world';
import { Cell } from '../src/core/types';
import { getAcousticDistance, bakeNavigationTree } from '../src/systems/ai/pathfinding';

const world = new World();
world.cells.fill(Cell.WALL);
for (let y = 1; y < 60; y++) {
  for (let x = 1; x < 60; x++) {
    world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
}
bakeNavigationTree(world);

const d = getAcousticDistance(world, 5, 2, 2.5, 2.5);
console.log('Distance:', d);
