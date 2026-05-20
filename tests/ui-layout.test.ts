import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { mapEntityDotBudget } from '../src/render/map_ui';
import { containerGridScale, dialogMenuScale, tradeGridScale } from '../src/render/ui_layout';

test('NPC dialog text can grow beyond the capped global HUD scale', () => {
  assert.equal(dialogMenuScale(640, 400, 2, 2), 2);
  assert.ok(dialogMenuScale(1920, 1080, 2, 2) > 3);
});

test('trade and container inventories use large cells on desktop canvases', () => {
  assert.ok(tradeGridScale(1920, 1080) >= 3.9);
  assert.ok(containerGridScale(1920, 1080) >= 3.9);
});

test('trade inventory scale still fits shorter canvases', () => {
  const scale = tradeGridScale(1280, 720);
  assert.ok(scale > 2.5);
  assert.ok((22 * 5 * 2 + 24) * scale <= 1280 * 0.88 + 0.001);
  assert.ok((28 + 22 * 5 + 58) * scale <= 720 * 0.78 + 0.001);
});

test('grid scale does not force tiny mobile canvases to overflow', () => {
  const scale = containerGridScale(280, 180);
  assert.ok(scale < 1);
  assert.ok((22 * 5 * 2 + 24) * scale <= 280 * 0.88 + 0.001);
  assert.ok((30 + 22 * 5 + 66) * scale <= 180 * 0.78 + 0.001);
});

test('map entity dot budget compresses minimap and dense mobile maps', () => {
  const minimapBudget = mapEntityDotBudget(160, 160, 40);
  assert.ok(minimapBudget <= 240);
  assert.equal(mapEntityDotBudget(320, 180, 200), minimapBudget);
});

test('desktop full map entity dot budget scales but stays bounded', () => {
  const desktopBudget = mapEntityDotBudget(1920, 1080, 200);
  assert.ok(desktopBudget > mapEntityDotBudget(640, 360, 200));
  assert.ok(desktopBudget <= 900);
});
