import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ContainerKind, ItemType, RoomType } from '../src/core/types';
import { CONTAINER_DEFS } from '../src/data/container_defs';
import { ITEM_TAGS, ITEMS } from '../src/data/items';
import { resourceForItem } from '../src/data/resources';

const ITEM_ID = 'vent_damper_plate';

test('vent damper plate is Maintenance repair stock with tool resource pressure', () => {
  const def = ITEMS[ITEM_ID];

  assert.equal(def.id, ITEM_ID);
  assert.equal(def.name, 'Заслонка вентиляции');
  assert.equal(def.type, ItemType.MISC);
  assert.deepEqual(def.spawnRooms, [RoomType.PRODUCTION, RoomType.STORAGE, RoomType.CORRIDOR]);
  assert.equal(def.stack, 3);
  assert.equal(resourceForItem(def.id)?.id, 'tools');

  for (const tag of ['vent', 'repair', 'maintenance', 'temporary_seal', 'counterplay', 'samosbor']) {
    assert.ok(ITEM_TAGS[ITEM_ID]?.includes(tag), `vent_damper_plate registry must publish ${tag}`);
    assert.ok(def.tags?.includes(tag), `vent_damper_plate item must carry ${tag}`);
  }

  assert.ok(
    CONTAINER_DEFS[ContainerKind.TOOL_LOCKER].itemPool.some(item => item.defId === ITEM_ID),
    'Maintenance tool lockers should expose vent damper plates',
  );
});
