import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { floorKeyForEntry } from '../src/systems/floor_keys';

test('floorKeyForEntry returns story key when storyFloor is defined', () => {
  assert.equal(floorKeyForEntry({ storyFloor: 'ministry' }), 'design:ministry');
  assert.equal(floorKeyForEntry({ storyFloor: 'kvartiry' }), 'design:kvartiry');
  assert.equal(floorKeyForEntry({ storyFloor: 'void' }), 'design:void');
});

test('floorKeyForEntry returns design key when designFloorId is defined', () => {
  assert.equal(floorKeyForEntry({ designFloorId: 'roof' }), 'design:roof');
  assert.equal(floorKeyForEntry({ designFloorId: 'spetspriemnik' }), 'design:spetspriemnik');
});

test('floorKeyForEntry returns procedural key when spec is defined', () => {
  assert.equal(floorKeyForEntry({ spec: { key: 'some_proc_key' } }), 'procedural:some_proc_key');
  assert.equal(floorKeyForEntry({ spec: { key: 'another-key' } }), 'procedural:another-key');
});

test('floorKeyForEntry returns correct key when z is defined and valid', () => {
  // Assuming z=50 corresponds to 'roof' design floor (from src/data/design_floors.ts)
  assert.equal(floorKeyForEntry({ z: 50 }), 'design:roof');
  // Assuming zForStoryFloor logic resolves properly for a known Z
  assert.equal(floorKeyForEntry({ z: -2 }), 'design:oranzhereya_betona');
});

test('floorKeyForEntry falls back to default when no better info is provided', () => {
  assert.equal(floorKeyForEntry({}), 'design:living');
});

test('floorKeyForEntry priority check', () => {
  // Should pick storyFloor over designFloorId, spec, z
  assert.equal(
    floorKeyForEntry({ storyFloor: 'ministry' as any, designFloorId: 'roof', spec: { key: 'test' }, z: 50 }),
    'design:ministry'
  );

  // Should pick designFloorId over spec and z
  assert.equal(
    floorKeyForEntry({ designFloorId: 'roof', spec: { key: 'test' }, z: -100 }),
    'design:roof'
  );

  // Should pick spec over z
  assert.equal(
    floorKeyForEntry({ spec: { key: 'test' }, z: 50 }),
    'procedural:test'
  );
});

test('floorKeyForEntry truncates z value correctly', () => {
  // Test that a fractional Z is properly Math.trunc-ed
  assert.equal(floorKeyForEntry({ z: 50.9 }), 'design:roof');
});
