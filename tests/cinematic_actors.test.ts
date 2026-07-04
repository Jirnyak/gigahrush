import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, NpcRole, type World } from '../src/core/types';
import { extractNpcForScene, releaseNpcFromScene, releaseAllSceneActors, selectCinematicExtras } from '../src/systems/cinematic_actors';
import { makeGameState, makeTestPlayer, addTestRoom } from './helpers';
import { updateAI } from '../src/systems/ai/index';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';

test('cinematic_actors - select cinematic extras using spatial index', () => {
  const player = makeTestPlayer(0, 0);
  const world: World = {
    cells: new Uint8Array(100),
    roomMap: new Int16Array(100).fill(-1),
    wallTex: new Uint8Array(100),
    floorTex: new Uint8Array(100),
    features: new Uint8Array(100),
    lampBlinks: new Uint8Array(100),
    light: new Float32Array(100),
    lightBlinks: new Uint8Array(100),
    visualSlots: new Uint8Array(100),
    pathBlockers: new Uint8Array(100),
    rooms: [],
    doors: new Map(),
    apartmentRoomCount: 0,
    aptMask: new Uint8Array(100),
    hermoWall: new Uint8Array(100),
    zones: [],
    zoneMap: new Uint8Array(100),
    factionControl: new Uint8Array(100),
    fog: new Uint8Array(100),
    tissue: new Uint8Array(100),
    tissueSignals: [],
    tissueActive: false,
    navBakeLevel: 0,
    entities: [
      player,
      { id: 2, type: EntityType.NPC, x: 5, y: 5, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 1, role: NpcRole.WANDERER },
      { id: 3, type: EntityType.NPC, x: 5, y: 6, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 1, role: NpcRole.WANDERER },
      { id: 4, type: EntityType.NPC, x: 2, y: 2, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 1, role: NpcRole.CINEMATIC_ACTOR }, // Excluded due to role
      { id: 5, type: EntityType.NPC, x: 25, y: 25, angle: 0, pitch: 0, alive: true, speed: 1, sprite: 1, role: NpcRole.WANDERER }, // Excluded due to distance
      { id: 6, type: EntityType.NPC, x: 5, y: 4, angle: 0, pitch: 0, alive: false, speed: 1, sprite: 1, role: NpcRole.WANDERER }, // Excluded because dead
    ],
    items: [],
    idx: (x: number, y: number) => x + y * 10,
    dist2: (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1),
    solid: () => false,
    solidAtIdx: () => false,
    roomAt: () => null,
    wrap: (x: number) => x,
  } as unknown as World;

  // Rebuild the index before query
  rebuildEntityIndexForSimulation(world.entities, 1);

  // Ask for up to 3 extras near (5, 5) with radius 5
  const extras = selectCinematicExtras(3, 5, 5, 5);

  assert.equal(extras.length, 2); // Should find IDs 2 and 3
  assert.ok(extras.find(e => e.id === 2));
  assert.ok(extras.find(e => e.id === 3));
  assert.equal(extras.find(e => e.id === 4), undefined);
  assert.equal(extras.find(e => e.id === 5), undefined);
  assert.equal(extras.find(e => e.id === 6), undefined);
});

test('cinematic_actors - extract and release npc', () => {
  const player = makeTestPlayer(0, 0);
  const world: World = {
    cells: new Uint8Array(100),
    roomMap: new Int16Array(100).fill(-1),
    wallTex: new Uint8Array(100),
    floorTex: new Uint8Array(100),
    features: new Uint8Array(100),
    lampBlinks: new Uint8Array(100),
    light: new Float32Array(100),
    lightBlinks: new Uint8Array(100),
    visualSlots: new Uint8Array(100),
    pathBlockers: new Uint8Array(100),
    rooms: [],
    doors: new Map(),
    apartmentRoomCount: 0,
    aptMask: new Uint8Array(100),
    hermoWall: new Uint8Array(100),
    zones: [],
    zoneMap: new Uint8Array(100),
    factionControl: new Uint8Array(100),
    fog: new Uint8Array(100),
    tissue: new Uint8Array(100),
    tissueSignals: [],
    tissueActive: false,
    navBakeLevel: 0,
    entities: [
      player,
      {
        id: 2,
        type: EntityType.NPC,
        x: 5,
        y: 5,
        angle: 0,
        pitch: 0,
        alive: true,
        speed: 1,
        sprite: 1,
        role: NpcRole.WANDERER,
        ai: {
          goal: 0,
          tx: 5,
          ty: 5,
          path: [],
          pi: 0,
          stuck: 0,
          timer: 0,
        },
      },
    ],
    items: [],
    idx: (x: number, y: number) => x + y * 10,
    dist2: (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1),
    solid: () => false,
    solidAtIdx: () => false,
    roomAt: () => null,
    roomAt: () => null,
  } as unknown as World;
  addTestRoom(world, 0, 0, 9, 9);

  const npc = world.entities[1];

  // Extract
  const extracted = extractNpcForScene(world.entities, npc.id, 'scene_1', 10, 10);
  assert.equal(extracted, true);
  assert.equal(npc.role, NpcRole.CINEMATIC_ACTOR);
  assert.equal(npc.x, 10);
  assert.equal(npc.y, 10);
  assert.ok(npc.cinematicState);
  assert.equal(npc.cinematicState.originalRole, NpcRole.WANDERER);
  assert.equal(npc.cinematicState.originalX, 5);
  assert.equal(npc.cinematicState.originalY, 5);

  // Release
  releaseNpcFromScene(world.entities, npc.id);
  assert.equal(npc.role, NpcRole.WANDERER);
  assert.equal(npc.cinematicState, undefined);
  assert.equal(npc.x, 10); // Check that position is not automatically restored

  // Extract again and release all
  extractNpcForScene(world.entities, npc.id, 'scene_2', 15, 15);
  assert.equal(npc.role, NpcRole.CINEMATIC_ACTOR);

  releaseAllSceneActors(world.entities, 'scene_1'); // Should not release
  assert.equal(npc.role, NpcRole.CINEMATIC_ACTOR);

  releaseAllSceneActors(world.entities, 'scene_2'); // Should release
  assert.equal(npc.role, NpcRole.WANDERER);
  assert.equal(npc.cinematicState, undefined);
});

test('cinematic_actors - ai skips cinematic actors', () => {
  const player = makeTestPlayer(0, 0);
  const state = makeGameState();
  const world: World = {
    cells: new Uint8Array(100),
    roomMap: new Int16Array(100).fill(-1),
    wallTex: new Uint8Array(100),
    floorTex: new Uint8Array(100),
    features: new Uint8Array(100),
    lampBlinks: new Uint8Array(100),
    light: new Float32Array(100),
    lightBlinks: new Uint8Array(100),
    visualSlots: new Uint8Array(100),
    pathBlockers: new Uint8Array(100),
    rooms: [],
    doors: new Map(),
    apartmentRoomCount: 0,
    aptMask: new Uint8Array(100),
    hermoWall: new Uint8Array(100),
    zones: [],
    zoneMap: new Uint8Array(100),
    factionControl: new Uint8Array(100),
    fog: new Uint8Array(100),
    tissue: new Uint8Array(100),
    tissueSignals: [],
    tissueActive: false,
    navBakeLevel: 0,
    entities: [
      player,
      {
        id: 2,
        type: EntityType.NPC,
        x: 5,
        y: 5,
        angle: 0,
        pitch: 0,
        alive: true,
        speed: 1,
        sprite: 1,
        role: NpcRole.CINEMATIC_ACTOR,
        ai: {
          goal: 0,
          tx: 5,
          ty: 5,
          path: [],
          pi: 0,
          stuck: 0,
          timer: 0,
        },
      },
    ],
    items: [],
    idx: (x: number, y: number) => x + y * 10,
    dist2: (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1),
    solid: () => false,
    solidAtIdx: () => false,
    roomAt: () => null,
    wrap: (x: number) => x,
  } as unknown as World;
  addTestRoom(world, 0, 0, 9, 9);

  // Rebuild index
  rebuildEntityIndexForSimulation(world.entities, 1);

  // The AI update should cleanly skip modifying intent or state of cinematic actors
  // We can track if `ai.npcState` remains undefined which indicates it skipped the initialization phase
  updateAI(world, world.entities, 0.1, 100, state.msgs, player.id, state.clock, false, { v: 10 }, 1, state);

  const npc = world.entities[1];
  assert.equal(npc.ai!.npcState, undefined);

  // Now set back to WANDERER and run again
  npc.role = NpcRole.WANDERER;
  updateAI(world, world.entities, 0.1, 100, state.msgs, player.id, state.clock, false, { v: 10 }, 1, state);

  assert.notEqual(npc.ai!.npcState, undefined); // Should be initialized
});
