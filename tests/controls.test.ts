import { afterEach, beforeEach, test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  CONTROL_ACTIONS,
  applyControlCode,
  clearControlBinding,
  controlActionLocked,
  controlBindings,
  consumeControlCaptureCode,
  beginControlCapture,
  isControlResetCode,
  isMenuCloseCode,
  matchesControlAction,
  resetAllControlBindings,
  setControlPrimaryBinding,
} from '../src/systems/controls';
import { createInput } from '../src/input';

beforeEach(() => {
  resetAllControlBindings();
});

afterEach(() => {
  resetAllControlBindings();
});

test('keyboard rebinding appends keys without stealing them from other actions', () => {
  assert.equal(matchesControlAction('quests', 'KeyQ'), true);

  assert.equal(setControlPrimaryBinding('moveBackward', 'KeyQ'), true);

  assert.deepEqual([...controlBindings('moveBackward')], ['KeyS', 'ArrowDown', 'KeyQ']);
  assert.equal(matchesControlAction('moveBackward', 'KeyQ'), true);
  assert.equal(matchesControlAction('quests', 'KeyQ'), true);
});

test('main gameplay keys are rebindable and can share one physical key', () => {
  assert.equal(controlActionLocked('interact'), false);
  assert.equal(controlActionLocked('gameMenu'), false);

  assert.equal(setControlPrimaryBinding('moveBackward', 'KeyE'), true);
  assert.equal(setControlPrimaryBinding('quests', 'Enter'), true);
  assert.equal(setControlPrimaryBinding('moveForward', 'KeyB'), true);
  assert.equal(setControlPrimaryBinding('attack', 'Space'), false);
  assert.equal(setControlPrimaryBinding('quests', 'Escape'), false);

  assert.deepEqual([...controlBindings('interact')], ['KeyE']);
  assert.deepEqual([...controlBindings('gameMenu')], ['Enter']);
  assert.deepEqual([...controlBindings('attack')], []);
  assert.deepEqual([...controlBindings('useTool')], ['KeyR']);
  assert.equal(matchesControlAction('moveBackward', 'KeyE'), true);
  assert.equal(matchesControlAction('interact', 'KeyE'), true);
  assert.equal(matchesControlAction('quests', 'Enter'), true);
  assert.equal(matchesControlAction('gameMenu', 'Enter'), true);
  assert.equal(matchesControlAction('attack', 'Space'), false);
  assert.equal(matchesControlAction('useTool', 'KeyG'), false);
  assert.equal(matchesControlAction('mapLegend', 'KeyG'), true);
  assert.equal(matchesControlAction('useTool', 'KeyR'), true);
  assert.equal(matchesControlAction('moveForward', 'KeyB'), true);
  assert.equal(matchesControlAction('quests', 'Escape'), false);
});

test('menu accept stays on Enter while menu close is Space', () => {
  assert.deepEqual([...controlBindings('gameMenu')], ['Enter']);
  assert.deepEqual([...controlBindings('netSubmit')], ['Enter']);
  assert.deepEqual([...controlBindings('netClose')], ['Delete']);
  assert.deepEqual([...controlBindings('netErase')], ['Backspace']);
  assert.equal(isMenuCloseCode('Space'), true);
  assert.equal(isMenuCloseCode('Backspace'), false);
  assert.equal(isMenuCloseCode('Delete'), false);
  assert.equal(isMenuCloseCode('Enter'), false);
  assert.equal(isControlResetCode('Backspace'), true);
});

test('Space is reserved for menu close and Backspace is reserved for key reset', () => {
  const input = createInput();

  assert.equal(setControlPrimaryBinding('moveBackward', 'Space'), false);
  assert.equal(setControlPrimaryBinding('moveBackward', 'Backspace'), false);
  assert.equal(setControlPrimaryBinding('moveBackward', 'Delete'), true);
  assert.equal(matchesControlAction('moveBackward', 'Space'), false);
  assert.equal(matchesControlAction('moveBackward', 'Backspace'), false);
  assert.equal(matchesControlAction('moveBackward', 'Delete'), true);
  assert.equal(applyControlCode(input, 'Space', true), false);
  assert.equal(applyControlCode(input, 'Backspace', true), false);
  assert.equal(input.back, false);
});

test('sprint is a held Shift movement binding', () => {
  const input = createInput();

  assert.deepEqual([...controlBindings('sprint')], ['ShiftLeft', 'ShiftRight']);
  assert.equal(applyControlCode(input, 'ShiftLeft', true), true);
  assert.equal(input.sprint, true);
  assert.equal(applyControlCode(input, 'ShiftLeft', false), true);
  assert.equal(input.sprint, false);
});

test('listed actions can be cleared and the reset command is not a binding row', () => {
  assert.equal(clearControlBinding('quests'), true);
  assert.deepEqual([...controlBindings('quests')], []);

  assert.equal(CONTROL_ACTIONS.some((action: { id: string }) => action.id === 'controlReset'), false);
});

test('capture assigns Enter and refuses fixed menu/reset keys', () => {
  beginControlCapture('quests');
  assert.equal(consumeControlCaptureCode('Enter'), true);
  assert.equal(matchesControlAction('quests', 'Enter'), true);

  beginControlCapture('quests');
  assert.equal(consumeControlCaptureCode('Space'), true);
  assert.equal(matchesControlAction('quests', 'Space'), false);

  beginControlCapture('quests');
  assert.equal(consumeControlCaptureCode('Backspace'), true);
  assert.equal(matchesControlAction('quests', 'Backspace'), false);
});
