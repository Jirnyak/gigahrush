import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityType, Faction, FloorLevel, Occupation } from '../src/core/types';
import {
  createPrefilledAlifeState,
  recordAlifeNpcDeath,
  setAlifeState,
} from '../src/systems/alife';
import {
  buildDemosProfileFeedView,
  buildDemosSocialLinksView,
  canOpenDemosProfileForNpc,
  demosCursorForNpcProfile,
  demosTraitContextTags,
  getDemosProfileDetails,
  getDemosProfileForNpcEntity,
  getDemosTraitViews,
  type DemosSocialLinkSeed,
} from '../src/systems/demos_profiles';
import {
  clearDemosNpcSocialEdges,
  setDemosSocialEdge,
} from '../src/systems/demos_social';
import {
  DEMOS_EDGE_ENEMY,
  DEMOS_EDGE_FRIEND,
} from '../src/data/demos_social';
import { createWorldEventState, publishEvent } from '../src/systems/events';
import { floorKeyForStory } from '../src/systems/floor_keys';
import { makeGameState, makeTestNpc } from './helpers';

function makeProfileState() {
  const state = makeGameState({
    currentFloor: FloorLevel.LIVING,
    worldEvents: createWorldEventState(),
  });
  createPrefilledAlifeState(state, 2468, 4, {
    buckets: [{
      floorKey: floorKeyForStory(FloorLevel.LIVING),
      floor: FloorLevel.LIVING,
      targetCount: 4,
      reserved: [
        {
          name: 'Миша Ребёнок',
          female: false,
          faction: Faction.CITIZEN,
          occupation: Occupation.CHILD,
          familyId: 77,
          level: 1,
        },
        {
          name: 'Нина Родитель',
          female: true,
          faction: Faction.CITIZEN,
          occupation: Occupation.COOK,
          familyId: 77,
          level: 3,
        },
        {
          name: 'Роман Смена',
          female: false,
          faction: Faction.CITIZEN,
          occupation: Occupation.COOK,
          familyId: 88,
          age: 25,
          sex: 'male',
          accountRubles: 1234,
          level: 4,
          canGiveQuest: true,
        },
        {
          name: 'Глеб Недруг',
          female: false,
          faction: Faction.CULTIST,
          occupation: Occupation.PILGRIM,
          familyId: 99,
          level: 5,
        },
      ],
    }],
  });
  return state;
}

function setEdges(state: ReturnType<typeof makeGameState>, alifeId: number, edges: readonly DemosSocialLinkSeed[]): void {
  const host = state as ReturnType<typeof makeGameState> & {
    demosProfileSocialEdges?: Record<number, readonly DemosSocialLinkSeed[]>;
  };
  host.demosProfileSocialEdges = {
    ...(host.demosProfileSocialEdges ?? {}),
    [alifeId]: edges,
  };
}

test('Demos profile traits are deterministic and capped to four slots', () => {
  const state = makeProfileState();
  const first = getDemosTraitViews(state, 3).map(trait => trait.id);
  const second = getDemosTraitViews(state, 3).map(trait => trait.id);
  const contextTags = demosTraitContextTags(state, 3);

  assert.deepEqual(second, first);
  assert.equal(first.length <= 4, true);
  assert.equal(new Set(first).size, first.length);
  assert.ok(contextTags.includes('age.young_adult'));
  assert.ok(contextTags.includes('sex.male'));
  assert.ok(contextTags.some(tag => tag.startsWith('trait.')));
});

test('Demos profile details expose live A-Life page fields and recent feed hints', () => {
  const state = makeProfileState();
  publishEvent(state, {
    type: 'quest_created',
    severity: 2,
    privacy: 'public',
    tags: ['quest', 'demos_profile_test'],
    actorName: 'Роман Смена',
    targetName: 'доска заявок',
    data: { actorAlifeId: 3 },
  });

  const npc = makeTestNpc({ id: 55, alifeId: 3, persistentNpcId: 'alife:3', name: 'Роман Смена' });
  const details = getDemosProfileForNpcEntity(state, npc);
  const feed = buildDemosProfileFeedView(state, 3);

  assert.equal(canOpenDemosProfileForNpc(npc), true);
  assert.equal(demosCursorForNpcProfile(state, npc), 2);
  assert.equal(details?.alifeId, 3);
  assert.equal(details?.dead, false);
  assert.equal(details?.age, 25);
  assert.equal(details?.sexLabel, 'мужской');
  assert.equal(details?.accountRubles, 1234);
  assert.equal(details?.accountLabel, '1234₽');
  assert.equal(details?.favoriteWorkLabel, 'держит кухню');
  assert.equal(details?.lastPostId, 1);
  assert.equal(details?.mentionsRecent, 1);
  assert.equal(feed[0]?.postId, 1);
});

test('Demos profile interests do not repeat visible perk labels', () => {
  const state = makeProfileState();
  const details = getDemosProfileDetails(state, 3);
  assert.ok(details);

  const perkLabels = new Set(details.traits.map(trait => trait.label));
  assert.equal(details.interests.some(interest => perkLabels.has(interest)), false);
});

test('Demos social counts use outgoing links only', () => {
  const state = makeProfileState();
  setEdges(state, 1, [
    { targetAlifeId: 3, relation: 90, role: 'friend' },
    { targetAlifeId: 4, relation: -100, role: 'enemy' },
  ]);
  setEdges(state, 2, [
    { targetAlifeId: 1, relation: 90, role: 'parent' },
  ]);

  const details = getDemosProfileDetails(state, 1);
  assert.equal(details?.friendsCount, 1);
  assert.equal(details?.enemiesCount, 1);
  assert.equal(details?.familyCount, 0);
});

test('Demos profile social links read the shared outgoing graph when no override exists', () => {
  const state = makeProfileState();
  clearDemosNpcSocialEdges(state, 1);
  setDemosSocialEdge(state, 1, 3, 90, DEMOS_EDGE_FRIEND);
  setDemosSocialEdge(state, 1, 4, -100, DEMOS_EDGE_ENEMY);

  const details = getDemosProfileDetails(state, 1);
  const links = buildDemosSocialLinksView(state, 1);

  assert.equal(details?.friendsCount, 1);
  assert.equal(details?.enemiesCount, 1);
  assert.equal(links.some(link => link.targetAlifeId === 3 && link.role === 'friend'), true);
  assert.equal(links.some(link => link.targetAlifeId === 4 && link.role === 'enemy'), true);
});

test('Demos child profile family label comes from outgoing parent edge', () => {
  const state = makeProfileState();
  setEdges(state, 1, [
    { targetAlifeId: 2, relation: 96, role: 'parent', tags: ['family'] },
  ]);

  const details = getDemosProfileDetails(state, 1);
  const links = buildDemosSocialLinksView(state, 1);

  assert.equal(details?.familyStatusLabel, 'семейное: ребёнок, родитель alife:2');
  assert.equal(details?.familyCount, 1);
  assert.equal(links[0]?.role, 'parent');
});

test('Demos dead profiles keep traits and outgoing social summary', () => {
  const state = makeProfileState();
  const dead = makeTestNpc({ id: 71, alifeId: 1, persistentNpcId: 'alife:1', hp: 0, alive: false });
  recordAlifeNpcDeath(state, dead);
  setEdges(state, 1, [
    { targetAlifeId: 2, relation: 92, role: 'parent', tags: ['family'] },
    { targetAlifeId: 4, relation: -90, role: 'enemy' },
  ]);

  const details = getDemosProfileDetails(state, 1);
  assert.equal(details?.dead, true);
  assert.equal((details?.traits.length ?? 0) > 0, true);
  assert.equal(details?.familyCount, 1);
  assert.equal(details?.enemiesCount, 1);
});

test('Demos face-to-face helper rejects NPCs without stable A-Life identity', () => {
  const state = makeProfileState();
  const transient = makeTestNpc({ id: 12, persistentNpcId: undefined });
  const monsterLike = { ...transient, type: EntityType.MONSTER };

  assert.equal(canOpenDemosProfileForNpc(transient), false);
  assert.equal(canOpenDemosProfileForNpc(monsterLike), false);
  assert.equal(getDemosProfileForNpcEntity(state, transient), undefined);
});

test('Demos one-profile view uses compact trait cache instead of profile-list allocation', () => {
  const state = makeGameState({ currentFloor: FloorLevel.LIVING });
  setAlifeState(state, { seed: 13579, total: 100_000 });

  const details = getDemosProfileDetails(state, 1);
  const cache = (state as typeof state & {
    demosProfileTraitCache?: { traitIds: unknown; ready: unknown; total: number };
  }).demosProfileTraitCache;

  assert.equal(details?.traits.length, 4);
  assert.equal((details?.interests.length ?? 0) <= 5, true);
  assert.equal(cache?.total, 100_000);
  assert.equal(cache?.traitIds instanceof Uint16Array, true);
  assert.equal(cache?.ready instanceof Uint8Array, true);
});
