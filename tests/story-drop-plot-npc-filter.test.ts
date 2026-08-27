import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, type Entity } from '../src/core/types';
import { getPlotNpcNumericId, getPlotNpcStringId } from '../src/data/npc_packages';
import type { StoryDropRule } from '../src/data/plot_outcomes';
import { STORY_DROP_RULES } from '../src/data/plot_outcomes';
import { storyDeathDropCandidates } from '../src/systems/plot_outcomes';
import { makeGameState } from './helpers';

/** Первый занятый слот сюжетной личности — берётся из замороженного порядка,
 *  чтобы тест не зависел от состава импортов контента. */
function firstPlotSlot(): { slot: number; id: string } {
  for (let slot = 1; slot < 512; slot++) {
    const id = getPlotNpcStringId(slot);
    if (id) return { slot, id };
  }
  throw new Error('нет ни одного сюжетного слота');
}

function killedNpc(alifeId: number): Entity {
  return {
    id: 42,
    type: EntityType.NPC,
    x: 4.5,
    y: 4.5,
    angle: 0,
    pitch: 0,
    alive: false,
    speed: 0,
    sprite: 0,
    alifeId,
  };
}

function ruleFor(plotNpcIds: readonly string[]): StoryDropRule {
  return {
    id: 'test_plot_npc_drop',
    source: { kind: 'death', entityTypes: [EntityType.NPC], plotNpcIds },
    drops: [{ itemId: 'canned', count: 1 }],
  };
}

test('story drop rules honour the declared plotNpcIds filter', () => {
  const first = firstPlotSlot();
  const other = getPlotNpcStringId(first.slot + 1);
  assert.ok(other, 'нужен второй занятый слот для отрицательного случая');
  assert.equal(getPlotNpcNumericId(first.id), first.slot);

  const state = makeGameState();
  const ctx = { killed: killedNpc(first.slot), killerIsPlayer: true, state };

  const matching = storyDeathDropCandidates(ctx, [ruleFor([first.id])]);
  assert.equal(matching.length, 1, 'объявленная личность обязана проходить фильтр');
  assert.equal(matching[0]!.itemId, 'canned');

  const foreign = storyDeathDropCandidates(ctx, [ruleFor([other!])]);
  assert.equal(foreign.length, 0, 'чужая личность не должна ронять авторский дроп');

  const noIdentity = storyDeathDropCandidates(
    { killed: killedNpc(0), killerIsPlayer: true, state },
    [ruleFor([first.id])],
  );
  assert.equal(noIdentity.length, 0, 'безымянный NPC не подходит ни под какой plotNpcIds');
});

test('shipped story drop rules stay matchable by the runtime matcher', () => {
  for (const rule of STORY_DROP_RULES) {
    for (const key of Object.keys(rule.source)) {
      assert.ok(
        ['kind', 'killer', 'entityTypes', 'plotNpcIds', 'actorPackageIds', 'monsterKinds', 'factions'].includes(key),
        `${rule.id}: поле source.${key} матчер не читает`,
      );
    }
  }
});
