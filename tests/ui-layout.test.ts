import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { mapEntityDotBudget } from '../src/render/map_ui';
import {
  allocateHudSlot,
  containerGridScale,
  containerMenuGridLayout,
  createHudSlots,
  dialogMenuScale,
  fullscreenInventoryLayout,
  tradeGridScale,
} from '../src/render/ui_layout';

test('NPC dialog text can grow beyond the capped global HUD scale', () => {
  assert.equal(dialogMenuScale(640, 400, 2, 2), 2);
  assert.ok(dialogMenuScale(1920, 1080, 2, 2) > 3);
});

test('trade and container inventories use large cells on desktop canvases', () => {
  assert.ok(tradeGridScale(1920, 1080) >= 3.2);
  assert.ok(containerGridScale(1920, 1080) >= 3.9);
});

test('trade inventory scale still fits shorter canvases', () => {
  const scale = tradeGridScale(1280, 720);
  assert.ok(scale > 2);
  assert.ok((22 * 5 * 4 + 24 * 3) * scale <= 1280 * 0.88 + 0.001);
  assert.ok((28 + 22 * 5 + 70) * scale <= 720 * 0.78 + 0.001);
});

test('grid scale does not force tiny mobile canvases to overflow', () => {
  const scale = containerGridScale(280, 180);
  assert.ok(scale < 1);
  assert.ok((22 * 5 * 2 + 24) * scale <= 280 * 0.88 + 0.001);
  assert.ok((30 + 22 * 5 + 66) * scale <= 180 * 0.78 + 0.001);
});

test('fullscreen inventory layout exposes the rendered mobile hit regions', () => {
  const layout = fullscreenInventoryLayout(844, 390, 2.6375, 1.95);

  assert.equal(layout.grid.cols, 5);
  assert.equal(layout.grid.rows, 5);
  assert.ok(layout.grid.x + layout.grid.w <= 844);
  assert.ok(layout.grid.y + layout.grid.h <= 390);
  assert.ok(layout.close.x + layout.close.w <= 844);
  assert.ok(layout.use.y >= layout.grid.y + layout.grid.h);
  assert.ok(layout.drop.y > layout.use.y);
  assert.ok(layout.attr.x >= layout.grid.x + layout.grid.w);
});

test('container menu layout shares render and hit-test grid positions', () => {
  const layout = containerMenuGridLayout(844, 390);
  const expectedContainerX = layout.startX + layout.gridTotal + 24 * layout.scale;

  assert.ok(layout.cell > 0);
  assert.equal(layout.containerX, expectedContainerX);
  assert.ok(layout.startX >= 0);
  assert.ok(layout.containerX + layout.gridTotal <= 844 + 0.001);
  assert.ok(layout.startY + layout.gridTotal <= 390);
  assert.equal(layout.close.w, 844);
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

test('HUD navigation slot stacks minimap and hints without overlap', () => {
  const slots = createHudSlots(640, 400, 2, 2);
  const minimap = allocateHudSlot(slots.topRightNavigation, 160, 160, 'right');
  const route = allocateHudSlot(slots.topRightNavigation, 70, 352, 'right');
  const caravan = allocateHudSlot(slots.topRightNavigation, 58, 352, 'right');

  assert.ok(route.y >= minimap.y + minimap.h);
  assert.ok(caravan.y >= route.y + route.h);
  assert.ok(minimap.x + minimap.w <= 640);
  assert.ok(route.x >= 0);
});

test('mobile HUD vitals use bottom center lane between touch controls', () => {
  const slots = createHudSlots(640, 360, 2, 1.8, { mobileControls: true, bottomVitalsHeight: 36 });

  assert.ok(slots.safe.bottom >= 100);
  assert.ok(slots.bottomVitals.y + slots.bottomVitals.h >= 360 - 28);
  assert.ok(slots.bottomVitals.x >= slots.safe.left);
  assert.ok(slots.bottomVitals.x + slots.bottomVitals.w <= 640 - slots.safe.right + 0.001);
});

test('mobile HUD interaction prompt stays above bottom vitals', () => {
  const slots = createHudSlots(844, 390, 2.6375, 1.95, { mobileControls: true, bottomVitalsHeight: 39 });

  assert.ok(slots.bottomVitals.y + slots.bottomVitals.h >= 390 - 32);
  assert.ok(slots.centerInteraction.y + slots.centerInteraction.h <= slots.bottomVitals.y + 0.001);
  assert.ok(slots.centerInteraction.y < slots.bottomVitals.y);
});
