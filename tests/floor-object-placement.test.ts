import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Feature, FloorLevel, RoomType } from '../src/core/types';
import { World, auditReachability } from '../src/core/world';
import { designFloorById } from '../src/data/design_floors';
import {
  floorObjectProfileForDesignFloor,
  floorObjectProfileForStoryFloor,
  type FloorObjectPlacementProfile,
} from '../src/data/floor_object_placement';
import { craftStationCells } from '../src/gen/craft_stations';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { applyFloorObjectPlacementProfile } from '../src/gen/floor_object_placement';
import { generateFloor } from '../src/gen/floor_manifest';
import { findInteractionTarget } from '../src/systems/interactions';
import {
  addTestRoom,
  makeGameState,
  makeTestPlayer,
} from './helpers';
import { testGenerationMatrix } from './generator_helpers';

test('floor object profile places decor, explicit interactives and fixture overlays in one pass', () => {
  const world = new World();
  const room = addTestRoom(world, { type: RoomType.PRODUCTION, w: 20, h: 12 });
  const sinkX = room.x + room.w - 3;
  const sinkY = room.y + room.h - 3;
  world.setFeatureAt(world.idx(sinkX, sinkY), Feature.SINK);
  const profile: FloorObjectPlacementProfile = {
    id: 'test_object_profile',
    tags: ['test'],
    featureRules: [
      {
        id: 'test_pump_machines',
        kind: 'feature',
        feature: Feature.MACHINE,
        min: 2,
        max: 2,
        roomDivisor: 1,
        roomTypeWeights: { [RoomType.PRODUCTION]: 1 },
      },
    ],
    interactiveRules: [
      {
        id: 'test_basic_workbench',
        kind: 'interactive',
        defId: 'workbench_basic',
        forceFeature: true,
        min: 1,
        max: 1,
        roomDivisor: 1,
        roomTypeWeights: { [RoomType.PRODUCTION]: 1 },
      },
    ],
    brokenFixtures: [
      {
        id: 'test_broken_sink',
        baseChance: 1,
        max: 1,
        features: [Feature.SINK],
        roomTypeWeights: { [RoomType.PRODUCTION]: 1 },
      },
    ],
  };

  const summary = applyFloorObjectPlacementProfile(world, [room], room.x + 1, room.y + 1, profile);
  const machineCells = [...world.features].filter(feature => feature === Feature.MACHINE).length;
  const state = makeGameState();
  const player = makeTestPlayer({ id: 1, x: sinkX - 1, y: sinkY });
  const target = findInteractionTarget({
    world,
    state,
    player,
    entities: [player],
    nextEntityId: { v: 2 },
    lookX: sinkX,
    lookY: sinkY,
  });

  assert.equal(summary?.features.test_pump_machines, 2);
  assert.equal(summary?.interactives.test_basic_workbench, 1);
  assert.equal(summary?.brokenFixtures.test_broken_sink, 1);
  assert.equal(machineCells >= 3, true, 'decor machines and workbench feature should be visible');
  assert.equal(target?.defId, 'sink_broken');
});

test('maintenance object profile wraps craft stations and collector machinery rules', () => {
  const profile = floorObjectProfileForStoryFloor(FloorLevel.MAINTENANCE);
  assert.ok(profile, 'maintenance object profile should exist');
  assert.ok(profile.craftStations, 'maintenance object profile should include craft station subprofile');
  assert.equal(profile.featureRules?.some(rule => rule.id.includes('pump')), true);
});

testGenerationMatrix('maintenance object profile places reachable craft stations', () => {
  const gen = generateFloor(FloorLevel.MAINTENANCE, 0x51002);
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  const stations = [...craftStationCells(gen.world, 'craft_lathe'), ...craftStationCells(gen.world, 'disassembly_workbench')];

  assert.equal(craftStationCells(gen.world, 'craft_lathe').length >= 1, true);
  assert.equal(craftStationCells(gen.world, 'disassembly_workbench').length >= 1, true);
  assert.equal(stations.every(idx => audit.reachable[idx] === 1), true, 'profile stations should be reachable');
});

test('slime NII object profile wraps lab decor and craft stations', () => {
  const route = designFloorById('slime_nii');
  assert.ok(route, 'slime_nii route should exist');
  const profile = floorObjectProfileForDesignFloor(route);
  assert.ok(profile?.craftStations, 'slime_nii object profile should include craft station subprofile');
  assert.equal(profile?.featureRules?.some(rule => rule.id === 'slime_nii_sample_apparatus'), true);
});

testGenerationMatrix('slime NII object profile places reachable craft stations', () => {
  const gen = generateDesignFloor('slime_nii');
  const audit = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
  const stations = [
    ...craftStationCells(gen.world, 'craft_lathe'),
    ...craftStationCells(gen.world, 'disassembly_workbench'),
    ...craftStationCells(gen.world, 'craft_lab_bench'),
  ];

  assert.equal(stations.length >= 3, true, 'slime_nii should expose profile craft stations');
  assert.equal(stations.every(idx => audit.reachable[idx] === 1), true, 'slime_nii stations should be reachable');
});
