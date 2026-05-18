import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  WRONG_DOOR_MAX_DIST2,
  WRONG_DOOR_MIN_DIST2,
  chooseWrongDoorRouteOption,
  isUsableWrongDoorRoute,
  type WrongDoorRouteOption,
} from '../src/systems/wrong_door';

function option(overrides: Partial<WrongDoorRouteOption>): WrongDoorRouteOption {
  return {
    sourceIdx: 1,
    targetIdx: 2,
    targetDoorIdx: 3,
    sourceRoomId: 10,
    targetRoomId: 20,
    distance2: WRONG_DOOR_MIN_DIST2 + 1,
    sourceDist2: 4,
    targetDanger: 0,
    ...overrides,
  };
}

test('wrong-door route validation rejects same-room, same-cell, and out-of-band routes', () => {
  assert.equal(isUsableWrongDoorRoute(option({})), true);
  assert.equal(isUsableWrongDoorRoute(option({ targetIdx: 1 })), false);
  assert.equal(isUsableWrongDoorRoute(option({ targetRoomId: 10 })), false);
  assert.equal(isUsableWrongDoorRoute(option({ distance2: WRONG_DOOR_MIN_DIST2 - 1 })), false);
  assert.equal(isUsableWrongDoorRoute(option({ distance2: WRONG_DOOR_MAX_DIST2 + 1 })), false);
});

test('wrong-door route picker prefers a reachable nearby source over a remote source', () => {
  const picked = chooseWrongDoorRouteOption([
    option({ sourceIdx: 11, sourceDist2: 400, distance2: 60 * 60 }),
    option({ sourceIdx: 22, sourceDist2: 4, distance2: 42 * 42 }),
    option({ sourceIdx: 33, targetRoomId: 10, sourceDist2: 0, distance2: 90 * 90, targetDanger: 5 }),
  ], 1234);

  assert.equal(picked?.sourceIdx, 22);
});
