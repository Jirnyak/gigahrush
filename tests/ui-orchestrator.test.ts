import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_UI_PRESET_ID,
  UI_ELEMENT_DEFS,
  UI_PRESETS,
  activeUiPresetId,
  applyUiPreset,
  resetUiElement,
  resetUiSettings,
  setUiElementEnabled,
  nextVisibleMapMode,
  normalizeVisibleMapMode,
  toggleUiElement,
  uiElementEnabled,
  uiSettingsRowCount,
} from '../src/systems/ui_orchestrator';

test('UI orchestrator defaults to the novice-safe HUD enabled', () => {
  resetUiSettings();
  const enabled = UI_ELEMENT_DEFS
    .filter(def => !def.locked && uiElementEnabled(def.id))
    .map(def => def.id);
  assert.deepEqual(enabled, [
    'bottom_tabs',
    'weapon_panel',
    'crosshair',
    'interaction_prompt',
    'hazard_warning',
    'minimap',
  ]);
  assert.equal(DEFAULT_UI_PRESET_ID, 'novice');
  assert.equal(activeUiPresetId(), 'novice');
  assert.equal(UI_ELEMENT_DEFS.find(def => def.id === 'messages')?.label, 'Стенографическая сводка');
  assert.equal(uiElementEnabled('messages'), false);
  assert.equal(uiElementEnabled('route_hints'), false);
  assert.equal(uiElementEnabled('damage_feedback'), true);
  assert.equal(uiElementEnabled('samosbor_text'), true);
  assert.equal(uiElementEnabled('credits'), true);
});

test('UI orchestrator skips invisible minimap map states', () => {
  resetUiSettings();
  assert.equal(nextVisibleMapMode(0, true), 1);
  assert.equal(nextVisibleMapMode(1, true), 2);
  assert.equal(nextVisibleMapMode(2, true), 0);
  assert.equal(nextVisibleMapMode(0, false), 2);
  assert.equal(nextVisibleMapMode(2, false), 0);
  assert.equal(normalizeVisibleMapMode(1, false), 0);
  assert.equal(normalizeVisibleMapMode(1, true), 1);
});

test('UI orchestrator toggles normal elements but keeps locked system text visible', () => {
  resetUiSettings();
  assert.equal(toggleUiElement('caravan_hints'), true);
  assert.equal(uiElementEnabled('caravan_hints'), true);
  assert.equal(setUiElementEnabled('samosbor_text', false), true);
  assert.equal(uiElementEnabled('samosbor_text'), true);
  assert.equal(setUiElementEnabled('damage_feedback', false), true);
  assert.equal(uiElementEnabled('damage_feedback'), true);
  assert.equal(resetUiElement('caravan_hints'), false);
  assert.equal(uiElementEnabled('caravan_hints'), false);
  assert.equal(resetUiElement('minimap'), true);
  assert.equal(uiElementEnabled('minimap'), true);
});

test('UI orchestrator applies combat preset deterministically', () => {
  resetUiSettings();
  assert.equal(applyUiPreset('combat'), true);
  assert.equal(activeUiPresetId(), 'combat');
  assert.equal(uiElementEnabled('weapon_panel'), true);
  assert.equal(uiElementEnabled('crosshair'), true);
  assert.equal(uiElementEnabled('hazard_warning'), true);
  assert.equal(uiElementEnabled('damage_feedback'), true);
});

test('UI orchestrator presets cover minimal and full player-safe modes', () => {
  resetUiSettings();
  assert.equal(applyUiPreset('minimal'), true);
  assert.equal(activeUiPresetId(), 'minimal');
  assert.equal(uiElementEnabled('bottom_tabs'), true);
  assert.equal(uiElementEnabled('interaction_prompt'), true);
  assert.equal(uiElementEnabled('hazard_warning'), true);
  assert.equal(uiElementEnabled('minimap'), true);
  assert.equal(uiElementEnabled('weapon_panel'), false);
  assert.equal(uiElementEnabled('messages'), false);
  assert.equal(uiElementEnabled('samosbor_text'), true);

  assert.equal(applyUiPreset('full'), true);
  assert.equal(activeUiPresetId(), 'full');
  for (const def of UI_ELEMENT_DEFS) {
    assert.equal(uiElementEnabled(def.id), true, `${def.id} should be enabled by full preset`);
  }
  assert.equal(uiSettingsRowCount(), UI_PRESETS.length + UI_ELEMENT_DEFS.length);
});
