import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ContainerKind, ItemType, RoomType } from '../src/core/types';
import { CONTAINER_DEFS } from '../src/data/container_defs';
import { ITEM_TAGS, ITEMS } from '../src/data/items';
import { resourceForItem } from '../src/data/resources';

test('hermetic tape is stackable storage/medical seal gear with resource pressure', () => {
  const def = ITEMS.hermetic_tape;

  assert.equal(def.name, 'Гермолента');
  assert.equal(def.type, ItemType.MISC);
  assert.deepEqual(def.spawnRooms, [RoomType.STORAGE, RoomType.MEDICAL]);
  assert.equal(def.stack, 8);
  assert.equal(resourceForItem(def.id)?.id, 'tools');

  for (const tag of ['temporary_seal', 'cleanup', 'technical_cleanup', 'counterplay']) {
    assert.ok(ITEM_TAGS.hermetic_tape?.includes(tag), `hermetic_tape must publish ${tag}`);
  }

  assert.ok(
    CONTAINER_DEFS[ContainerKind.MEDICAL_CABINET].itemPool.some(item => item.defId === def.id),
    'medical cabinets should expose hermetic tape',
  );
  assert.ok(
    CONTAINER_DEFS[ContainerKind.TOOL_LOCKER].itemPool.some(item => item.defId === def.id),
    'storage tool lockers should expose hermetic tape',
  );
});
