import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createHudSlots,
  mobileHudSafeInsetsForCanvas,
  type MobileHudSafeContext,
} from '../src/render/ui_layout';

// The touch layer measures its reserved bands in CSS pixels (it lays out DOM
// controls with them). The HUD canvas runs at half resolution, so the same
// numbers used verbatim reserved twice the space: in portrait left+right
// exceeded the canvas width and every HUD slot collapsed to zero, with the
// navigation slot placed at a negative x.
function portraitContext(): MobileHudSafeContext {
  return {
    enabled: true,
    portrait: true,
    // Values computeMobileHudSafeInsets produces for a 390x844 CSS viewport.
    safeInsets: { top: 60, right: 164, bottom: 140, left: 140 },
    viewportWidth: 390,
    viewportHeight: 844,
  };
}

test('mobile safe insets are converted from CSS pixels into canvas pixels', () => {
  const insets = mobileHudSafeInsetsForCanvas(portraitContext(), 195, 422);
  assert.ok(insets);
  assert.equal(insets.left, 70);
  assert.equal(insets.right, 82);
  assert.equal(insets.top, 30);
  assert.equal(insets.bottom, 70);
});

test('portrait phone HUD keeps every slot on canvas with non-zero width', () => {
  const canvasW = 195;
  const canvasH = 422;
  const sx = canvasW / 320;
  const sy = canvasH / 200;
  const slots = createHudSlots(canvasW, canvasH, sx, sy, {
    mobileControls: true,
    safeInsets: mobileHudSafeInsetsForCanvas(portraitContext(), canvasW, canvasH),
    topRightWidth: 212 * sx,
  });

  for (const [name, rect] of Object.entries(slots)) {
    if (name === 'safe') continue;
    const slot = rect as { x: number; y: number; w: number; h: number };
    assert.ok(slot.x >= 0, `${name}.x must stay on canvas, got ${slot.x}`);
    assert.ok(slot.w > 0, `${name}.w must be positive, got ${slot.w}`);
    assert.ok(slot.x + slot.w <= canvasW + 0.5, `${name} must not overflow canvas width`);
  }
});
