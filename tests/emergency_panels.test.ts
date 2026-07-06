import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { World } from '../src/core/world';
import { placeEmergencyPanel, getEmergencyPanels } from '../src/systems/emergency_panels';
import { Cell, Feature } from '../src/core/types';

test('placeEmergencyPanel creates panel and modifies world state properly', () => {
  const world = new World();
  world.cells[0] = Cell.FLOOR; // Need a floor to place it on
  world.roomMap[0] = 1;
  world.zoneMap[0] = 2;

  const panel = placeEmergencyPanel(world, 0, 0, 'panel_power', 123);

  assert.ok(panel);
  assert.equal(panel.x, 0);
  assert.equal(panel.y, 0);
  assert.equal(panel.defId, 'panel_power');
  assert.equal(panel.roomId, 1);
  assert.equal(panel.zoneId, 2);
  assert.equal(panel.seed, 123);
  assert.equal(panel.status, 'idle');

  // Verify it was added to the world panels list
  const panels = getEmergencyPanels(world);
  assert.equal(panels.length, 1);
  assert.equal(panels[0], panel);

  // Verify it modified the world cell
  assert.equal(world.features[0], Feature.APPARATUS);
});

test('placeEmergencyPanel returns null if cell is not floor or water', () => {
  const world = new World();
  world.cells[1] = Cell.WALL;
  const failPanel = placeEmergencyPanel(world, 1, 0, 'panel_power', 456);
  assert.equal(failPanel, null);

  // Ensure panels array is empty and feature was not added
  assert.equal(getEmergencyPanels(world).length, 0);
  assert.notEqual(world.features[1], Feature.APPARATUS);
});

test('placeEmergencyPanel handles missing panel definitions gracefully', () => {
  const world = new World();
  world.cells[2] = Cell.FLOOR;

  // Using an unknown defId should return null in registerEmergencyPanel
  // (Assuming getEmergencyPanelDef returns undefined, which returns null in registerEmergencyPanel)
  // Let's look at the source for registerEmergencyPanel:
  // const def = getEmergencyPanelDef(defId);
  // if (!def) return null;
  const missingDefPanel = placeEmergencyPanel(world, 2, 0, 'non_existent_panel' as any, 789);

  assert.equal(missingDefPanel, null);
  assert.equal(getEmergencyPanels(world).length, 0);
  assert.notEqual(world.features[2], Feature.APPARATUS);
});
