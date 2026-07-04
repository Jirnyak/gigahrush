import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, EMPTY_VISUAL_CELL_CODE } from '../src/core/world';
import { addVisualSlotFirstFree, addVisualSlotByPriority } from '../src/gen/visual_cell_slots';
import { visualCellDefById } from '../src/data/visual_cell_slots';

function code(id: string): number {
  const def = visualCellDefById(id);
  if (!def) throw new Error(`unknown id ${id}`);
  return def.code;
}

test('Cannot place two center meshes on the same cell', () => {
    const world = new World();
    const cell = world.idx(10, 10);

    // Using correct valid IDs from visual_cell_slots.ts
    const boxCode = code('machine_body');
    const colCode = code('column_concrete_square');

    const success1 = addVisualSlotFirstFree(world, cell, boxCode);
    const success2 = addVisualSlotFirstFree(world, cell, colCode);

    assert.strictEqual(success1, 0, 'First center mesh should be placed at slot 0');
    assert.strictEqual(success2, -1, 'Second center mesh should be rejected');
});
