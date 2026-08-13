import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, type Entity } from '../src/core/types';
import { ITEM_DROP_FIFO_CAP } from '../src/data/entity_limits';
import { enforceItemDropFifoCap } from '../src/systems/entity_limits';

function makeDrop(id: number, defId = 'water', ownerId?: number): Entity {
  return {
    id, type: EntityType.ITEM_DROP,
    x: 1 + (id % 500), y: 1 + Math.floor(id / 500), angle: 0, pitch: 0,
    alive: true, speed: 0, sprite: 0,
    ownerId,
    inventory: [{ defId, count: 1 }],
  };
}

function liveDrops(entities: Entity[]): Entity[] {
  return entities.filter(e => e.alive && e.type === EntityType.ITEM_DROP);
}

test('under the cap nothing is evicted', () => {
  const entities = Array.from({ length: 100 }, (_, i) => makeDrop(i + 1));
  assert.equal(enforceItemDropFifoCap(entities), 0);
  assert.equal(liveDrops(entities).length, 100);
});

test('past the cap the oldest drops rot away first and the cap holds', () => {
  const over = 8;
  const entities = Array.from({ length: ITEM_DROP_FIFO_CAP + over }, (_, i) => makeDrop(i + 1));
  const evicted = enforceItemDropFifoCap(entities);
  assert.equal(evicted, over);
  assert.equal(liveDrops(entities).length, ITEM_DROP_FIFO_CAP);
  // Array order is creation order: exactly the first `over` entries died.
  for (let i = 0; i < over; i++) assert.equal(entities[i].alive, false);
  assert.equal(entities[over].alive, true);
});

test('player stashes and progression items are exempt from eviction', () => {
  const entities: Entity[] = [];
  entities.push(makeDrop(1, 'water', 42)); // player-placed stash (ownerId)
  entities.push(makeDrop(2, 'note'));      // NOTE-type: progression-critical
  for (let i = 0; i < ITEM_DROP_FIFO_CAP + 3; i++) entities.push(makeDrop(10 + i));
  const evicted = enforceItemDropFifoCap(entities);
  assert.equal(evicted, 5);
  assert.equal(entities[0].alive, true);
  assert.equal(entities[1].alive, true);
  // The oldest expendable drops after the protected pair took the hit.
  assert.equal(entities[2].alive, false);
  assert.equal(entities[6].alive, false);
  assert.equal(entities[7].alive, true);
});
