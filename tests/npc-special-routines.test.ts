import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal } from '../src/core/types';
import { getPlotNpcNumericId, getNpcPackageByPlotNpcId, npcPackageDisplayName } from '../src/data/npc_packages';
import { postNpcToRoom } from '../src/systems/npc_special_routines';
import {
  actorLeashRoom, bindActorToRoom, releaseActorFromRoom,
  resetRoomLeashClockForTests, setRoomLeashMinute,
} from '../src/systems/room_leash';
import { getNpcSpecialRoutine } from '../src/data/npc_special_routines';
import { makeTestNpc } from './helpers';
import '../src/data/npc_plot_packages';

function plotNpcName(plotNpcId: string): string {
  const pack = getNpcPackageByPlotNpcId(getPlotNpcNumericId(plotNpcId)!);
  assert.ok(pack, `missing NPC package for plot NPC ${plotNpcId}`);
  return npcPackageDisplayName(pack);
}

function testNpc(plotNpcId: string) {
  return makeTestNpc({
    id: getPlotNpcNumericId(plotNpcId),
    name: plotNpcName(plotNpcId),
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [1, 2], pi: 1, stuck: 0, timer: 0 },
  });
}

test('starter tutors declare a post and it binds them to the room they are placed in', () => {
  resetRoomLeashClockForTests();
  const olga = testNpc('olga');
  const barni = testNpc('barni');

  assert.equal(getNpcPackageByPlotNpcId(getPlotNpcNumericId('olga')!)?.runtime?.specialRoutineId, 'starter_post_shift');
  assert.equal(getNpcPackageByPlotNpcId(getPlotNpcNumericId('barni')!)?.runtime?.specialRoutineId, 'starter_post_shift');

  assert.equal(postNpcToRoom(olga, 7), true);
  assert.equal(postNpcToRoom(barni, 9), true);
  assert.equal(actorLeashRoom(olga), 7);
  assert.equal(actorLeashRoom(barni), 9);
});

test('the post lasts eight in-game hours and then releases itself, with no tick to run it', () => {
  resetRoomLeashClockForTests();
  const olga = testNpc('olga');
  postNpcToRoom(olga, 7);

  setRoomLeashMinute(0);
  assert.equal(actorLeashRoom(olga), 7);
  setRoomLeashMinute(8 * 60 - 1);
  assert.equal(actorLeashRoom(olga), 7);
  setRoomLeashMinute(8 * 60);
  assert.equal(actorLeashRoom(olga), undefined);
  // Отпустил — и обратно сам не берёт: срок абсолютный, а не остаток.
  setRoomLeashMinute(0);
  assert.equal(actorLeashRoom(olga), undefined);
});

test('the post no longer hangs on plot flags: finishing the tutorial quest does not release it', () => {
  resetRoomLeashClockForTests();
  const olga = testNpc('olga');
  postNpcToRoom(olga, 7);
  // Вводная цепочка закрыта: `systems/quests.ts` ставит это дающему за пару
  // игровых минут, и раньше ровно на этом наставники уходили с постов.
  olga.plotDone = true;
  setRoomLeashMinute(10);
  assert.equal(actorLeashRoom(olga), 7);
});

test('the post leaves the actor otherwise untouched: no pinned goal, no emptied path', () => {
  resetRoomLeashClockForTests();
  const barni = testNpc('barni');
  postNpcToRoom(barni, 9);
  setRoomLeashMinute(30);

  // Пост запрещает выйти за порог, а не думать и не ходить.
  assert.equal(barni.ai?.goal, AIGoal.WANDER);
  assert.deepEqual(barni.ai?.path, [1, 2]);
});

test('NPCs without a declared post are never leashed', () => {
  resetRoomLeashClockForTests();
  const yakov = testNpc('yakov');
  assert.equal(postNpcToRoom(yakov, 3), false);
  assert.equal(actorLeashRoom(yakov), undefined);
});

test('room leash is a generic binding: any system may bind and release an actor', () => {
  resetRoomLeashClockForTests();
  const anyone = makeTestNpc({ id: 4242, name: 'Прохожий' });

  bindActorToRoom(anyone, 12, 100);
  setRoomLeashMinute(50);
  assert.equal(actorLeashRoom(anyone), 12);
  releaseActorFromRoom(anyone);
  assert.equal(actorLeashRoom(anyone), undefined);
});

test('getNpcSpecialRoutine returns the correct routine or undefined', () => {
  const routine = getNpcSpecialRoutine('starter_post_shift');
  assert.ok(routine);
  assert.equal(routine.id, 'starter_post_shift');
  assert.equal(routine.boundToRoomUntilMinutes, 8 * 60);

  assert.equal(getNpcSpecialRoutine(undefined), undefined);
  assert.equal(getNpcSpecialRoutine('unknown_id'), undefined);
});
