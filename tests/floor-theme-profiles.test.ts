import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ZoneFaction } from '../src/core/types';
import { DESIGN_FLOOR_ROUTES } from '../src/data/design_floors';
import {
  FLOOR_RUN_NPC_FREE_Z,
  PROCEDURAL_FLOOR_ZS,
  FLOOR_MAJORITY_FACTIONS,
  makeProceduralFloorSpec,
} from '../src/data/procedural_floors';
import {
  dominantTerritoryShareOwner,
  themeForDesignRoute,
  themeForProceduralSpec,
  themeForDesignFloor,
} from '../src/data/floor_theme_profiles';
import {
  territorySharesForDesignFloor,
  territorySharesForProceduralSpec,
  territorySharesForDesignFloor,
} from '../src/data/floor_territory';
import {
  floorKeyForDesign,
  floorKeyForProcedural,
} from '../src/systems/floor_keys';

const ALL_STORY_FLOORS = DESIGN_FLOOR_ROUTES.map(r => r.id);
const STORY_THEMES = ALL_STORY_FLOORS.map(id => themeForDesignFloor(id));

function totalShare(shares: readonly { share: number }[]): number {
  return shares.reduce((sum, row) => sum + row.share, 0);
}

test('base floor themes compose current design territory and route facts', () => {
  for (const id of ALL_STORY_FLOORS) {
    const route = DESIGN_FLOOR_ROUTES.find(r => r.id === id)!;
    const theme = themeForDesignFloor(id);
    assert.equal(theme.kind, 'design');
    assert.equal(theme.routeZ, route.z);
    assert.equal(theme.floorKey, floorKeyForDesign(id));
    assert.deepEqual(theme.territoryShares, territorySharesForDesignFloor(id));
    assert.equal(theme.majorityOwner, dominantTerritoryShareOwner(theme.territoryShares));
    assert.ok(totalShare(theme.territoryShares) > 0, `${id} should have territory shares`);
  }
});

test('every authored design route exposes a composed floor theme profile', () => {
  for (const route of DESIGN_FLOOR_ROUTES) {
    const theme = themeForDesignRoute(route);
    assert.equal(theme.kind, 'design');
    assert.equal(theme.routeId, route.id);
    assert.equal(theme.routeZ, route.z);
    assert.equal(theme.floorKey, floorKeyForDesign(route.id));
    assert.equal(theme.baseFloor, route.baseFloor);
    assert.equal(theme.danger, route.danger);
    assert.deepEqual(theme.territoryShares, territorySharesForDesignFloor(route.id));
    assert.equal(theme.majorityOwner, dominantTerritoryShareOwner(theme.territoryShares));
    assert.ok(theme.populationProfileId?.startsWith('design:'), `${route.id} should expose design population profile id`);
  }
});

test('procedural floor themes expose majority owner, anomaly pressure tags and NPC allowance', () => {
  for (const majority of FLOOR_MAJORITY_FACTIONS) {
    const spec = {
      ...makeProceduralFloorSpec(12345, -12),
      key: `test_${majority.id}`,
      majorityId: majority.id,
    };
    const theme = themeForProceduralSpec(spec);
    assert.equal(theme.kind, 'procedural');
    assert.equal(theme.floorKey, floorKeyForProcedural(spec.key));
    assert.equal(theme.majorityOwner, majority.zoneFaction);
    assert.equal(theme.npcAllowed, true);
    assert.deepEqual(theme.territoryShares, territorySharesForProceduralSpec(spec));
    assert.equal(theme.specialContentTags.includes(majority.id), true);
  }
});

test('deep endgame procedural themes keep current NPC-free route contract', () => {
  const spec = makeProceduralFloorSpec(9876, -49);
  const theme = themeForProceduralSpec(spec);
  assert.equal(theme.npcAllowed, false);
  assert.equal(theme.routeZ, -49);
});

test('all current procedural route specs expose composed floor themes', () => {
  for (const z of PROCEDURAL_FLOOR_ZS) {
    const spec = makeProceduralFloorSpec(13579, z);
    const theme = themeForProceduralSpec(spec);
    assert.equal(theme.kind, 'procedural');
    assert.equal(theme.routeZ, z);
    assert.equal(theme.baseFloor, spec.baseFloor);
    assert.equal(theme.danger, spec.danger);
    assert.equal(theme.floorKey, floorKeyForProcedural(spec.key));
    assert.deepEqual(theme.territoryShares, territorySharesForProceduralSpec(spec));
  }
});

test('story, design and procedural route themes preserve current NPC-free boundary', () => {
  const themes = [
    ...STORY_THEMES,
    ...DESIGN_FLOOR_ROUTES.map(route => themeForDesignRoute(route)),
    ...PROCEDURAL_FLOOR_ZS.map(z => themeForProceduralSpec(makeProceduralFloorSpec(97531, z))),
  ];
  for (const theme of themes) {
    assert.equal(
      theme.npcAllowed,
      (theme.routeZ ?? 0) > FLOOR_RUN_NPC_FREE_Z,
      `${theme.floorKey} NPC allowance should match route z boundary`,
    );
  }
});

test('theme territory shares include a human or samosbor owner without new number values', () => {
  const allowedOwners = new Set(Object.values(ZoneFaction).filter(value => typeof value === 'number'));
  const allowedFloors = new Set(ALL_STORY_FLOORS);
  for (const theme of [
    ...STORY_THEMES,
    ...DESIGN_FLOOR_ROUTES.map(route => themeForDesignRoute(route)),
    themeForProceduralSpec(makeProceduralFloorSpec(2468, 13)),
  ]) {
    if (theme.kind !== 'procedural') assert.equal(allowedFloors.has(theme.routeId), true, `${theme.floorKey} should use known number ${theme.routeId}`);
    assert.ok(theme.territoryShares.length > 0, `${theme.floorKey} should have territory shares`);
    for (const share of theme.territoryShares) {
      assert.equal(allowedOwners.has(share.owner), true, `${theme.floorKey} should use known territory owner ${share.owner}`);
    }
  }
});
