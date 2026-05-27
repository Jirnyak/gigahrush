import { afterEach, beforeEach, test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  clearControlBinding,
  controlActionLocked,
  controlBindings,
  matchesControlAction,
  resetAllControlBindings,
  setControlPrimaryBinding,
} from '../src/systems/controls';

beforeEach(() => {
  resetAllControlBindings();
});

afterEach(() => {
  resetAllControlBindings();
});

test('keyboard rebinding replaces the action key and moves conflicting gameplay keys', () => {
  assert.equal(matchesControlAction('quests', 'KeyQ'), true);

  assert.equal(setControlPrimaryBinding('moveBackward', 'KeyQ'), true);

  assert.deepEqual([...controlBindings('moveBackward')], ['KeyQ']);
  assert.equal(matchesControlAction('moveBackward', 'KeyS'), false);
  assert.equal(matchesControlAction('moveBackward', 'KeyQ'), true);
  assert.equal(matchesControlAction('quests', 'KeyQ'), false);
});

test('reserved browser/gameplay keys stay fixed and cannot be assigned elsewhere', () => {
  assert.equal(controlActionLocked('interact'), true);
  assert.equal(controlActionLocked('gameMenu'), true);

  assert.equal(setControlPrimaryBinding('moveBackward', 'KeyE'), false);
  assert.equal(setControlPrimaryBinding('quests', 'Enter'), false);
  assert.equal(setControlPrimaryBinding('quests', 'Escape'), false);

  assert.deepEqual([...controlBindings('interact')], ['KeyE']);
  assert.deepEqual([...controlBindings('gameMenu')], ['Enter']);
  assert.equal(matchesControlAction('moveBackward', 'KeyE'), false);
  assert.equal(matchesControlAction('quests', 'Enter'), false);
  assert.equal(matchesControlAction('quests', 'Escape'), false);
});

test('Backspace clears ordinary actions but not fixed control actions', () => {
  assert.equal(clearControlBinding('quests'), true);
  assert.deepEqual([...controlBindings('quests')], []);

  assert.equal(clearControlBinding('controlReset'), false);
  assert.deepEqual([...controlBindings('controlReset')], ['Backspace']);
  assert.deepEqual([...controlBindings('netErase')], ['Backspace']);
});
