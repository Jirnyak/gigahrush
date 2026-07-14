import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cell, EntityType, Occupation } from './src/core/types';
import { World } from './src/core/world';
import { setAlifeState, materializeAlifeFloorPopulation } from './src/systems/alife';
import { makeGameState } from './tests/helpers';
import { setFloorRunState } from './src/systems/procedural_floors';

const state = makeGameState({ currentFloor: 0 });
setFloorRunState(state, { runSeed: 123, currentZ: 0 }, 0);
const alife = setAlifeState(state, { seed: 12345, total: 100_000, overrides: [{ id: 1, money: 640, accountRubles: 999_360 }] }) as any;
alife.floorIndex['story:living'] = [0];

const world = new World();
world.cells[world.idx(12, 10)] = Cell.FLOOR;
const entities = [{
  id: 1,
  type: EntityType.NPC,
  x: 12.5,
  y: 10.5,
  angle: 0,
  pitch: 0,
  alive: true,
  speed: 1.2,
  sprite: Occupation.TRAVELER,
}];

console.log("floorIds", alife.floorIndex['story:living']);
console.log("record", alife.npcs[0]);

materializeAlifeFloorPopulation(state, world, entities as any, { v: 2 }, 'story:living');
console.log("entities after", entities.length, entities[0]);
