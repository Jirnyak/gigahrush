import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { ItemType } from '../src/core/types';
import { ITEMS, WEAPON_STATS } from '../src/data/catalog';
import { ITEM_TAGS } from '../src/data/items';
import { resourceForItem } from '../src/data/resources';
import { authoredCacheById, authoredCacheMatchesFloor } from '../src/data/authored_caches';
import { generateProceduralFloor } from '../src/gen/procedural_floor';
import { findProceduralSpec } from './generator_helpers';

test('rifle bolt pack is scarce Losyash rifle ammunition', () => {
  const def = ITEMS.rifle_bolt_pack;

  assert.equal(def.name, 'Полимерные болты');
  assert.equal(def.type, ItemType.AMMO);
  assert.deepEqual(def.spawnRooms, []);
  assert.equal(def.spawnW, 0);
  assert.equal(resourceForItem(def.id)?.id, 'ammo');
  assert.equal(WEAPON_STATS.losyash_rifle.ammoType, def.id);
  assert.equal(WEAPON_STATS.losyash_rifle.projSprite, WEAPON_STATS.harpoon_gun.projSprite);

  for (const tag of ['ammo', 'liquidator', 'rifle', 'polymer_bolt', 'anti_elite', 'deep_recon_stash']) {
    assert.ok(def.tags?.includes(tag), `rifle_bolt_pack item must carry ${tag} tag`);
    assert.ok(ITEM_TAGS.rifle_bolt_pack?.includes(tag), `rifle_bolt_pack registry must publish ${tag} tag`);
  }
});

test('rifle bolt pack is reachable from the deep sump recon stash', () => {
  // Условия сцены берутся из реестра схронов, а не переписываются в тесте:
  // одно место истины и для генератора, и для проверки.
  const cache = authoredCacheById('deep_recon_stash')!;
  const spec = findProceduralSpec(candidate => authoredCacheMatchesFloor(cache, candidate), 'deep_recon_stash');

  const generated = generateProceduralFloor(spec);
  const stash = generated.world.containers.find(container =>
    container.tags.includes('deep_recon_stash') &&
    container.inventory.some(item => item.defId === 'rifle_bolt_pack')
  );

  assert.ok(stash, 'deep sump procedural floor should expose rifle_bolt_pack');
  assert.equal(stash.access, 'secret');
  assert.equal(stash.inventory.find(item => item.defId === 'rifle_bolt_pack')?.count, 3);
  assert.equal(stash.inventory.find(item => item.defId === 'losyash_rifle')?.count, 1);
});
