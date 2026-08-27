import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  Cell,
  DoorState,
  EntityType,
  Faction,
  RoomType,
  Tex,
  type Entity,
  type Room,
} from '../src/core/types';
import { World } from '../src/core/world';
import { ITEMS, WEAPON_STATS } from '../src/data/catalog';
import { BREACH_CHARGE_ID, CONCRETE_BREAKER_ID, resolveBreachChargeExplosion } from '../src/systems/breach_charge';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { makeGameState } from './helpers';

interface Scene {
  world: World;
  player: Entity;
  doorIdx: number;
  concreteIdx: number;
  meatIdx: number;
}

/** Один и тот же перекрёсток: дверь, бетонная стена и мясная стена вплотную. */
function scene(): Scene {
  const world = new World();
  const room: Room = {
    id: 0,
    type: RoomType.CORRIDOR,
    x: 8,
    y: 8,
    w: 8,
    h: 8,
    doors: [],
    sealed: false,
    name: 'Тестовый коридор',
    apartmentId: -1,
    wallTex: Tex.CONCRETE,
    floorTex: Tex.F_CONCRETE,
  };
  world.rooms[0] = room;

  for (let y = 7; y <= 14; y++) {
    for (let x = 7; x <= 15; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.floorTex[idx] = Tex.F_CONCRETE;
      world.roomMap[idx] = room.id;
      world.zoneMap[idx] = 3;
    }
  }

  const doorIdx = world.idx(11, 10);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = Tex.DOOR_METAL;
  world.roomMap[doorIdx] = room.id;
  world.zoneMap[doorIdx] = 3;
  world.doors.set(doorIdx, { idx: doorIdx, state: DoorState.LOCKED, roomA: room.id, roomB: -1, keyId: 'test_key', timer: 0 });
  room.doors.push(doorIdx);

  const concreteIdx = world.idx(12, 10);
  world.cells[concreteIdx] = Cell.WALL;
  world.wallTex[concreteIdx] = Tex.CONCRETE;
  world.zoneMap[concreteIdx] = 3;

  const meatIdx = world.idx(11, 11);
  world.cells[meatIdx] = Cell.WALL;
  world.wallTex[meatIdx] = Tex.MEAT;
  world.zoneMap[meatIdx] = 3;

  const player: Entity = {
    id: 1,
    type: EntityType.NPC,
    persistentNpcId: 'player',
    x: 11.5,
    y: 10.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    name: 'Вы',
    faction: Faction.PLAYER,
  };
  return { world, player, doorIdx, concreteIdx, meatIdx };
}

test('бетонобойная граната ломает бетон, как обещают её имя и теги', () => {
  const { world, player, concreteIdx } = scene();
  const state = makeGameState({ worldEvents: createWorldEventState() });

  const result = resolveBreachChargeExplosion(
    world,
    state,
    player,
    CONCRETE_BREAKER_ID,
    11.5,
    10.5,
    WEAPON_STATS[CONCRETE_BREAKER_ID]!.aoeRadius!,
  );

  assert.ok(result.breachedWalls > 0, 'бетонобойная граната обязана вскрывать бетон');
  assert.equal(world.cells[concreteIdx], Cell.FLOOR, 'бетонная стена должна стать проходом');
  assert.ok(world.cellVersion > 0);

  const event = getRecentEvents(state, { type: 'collateral_damage', tags: [CONCRETE_BREAKER_ID], limit: 1 })[0];
  assert.ok(event, 'взрыв обязан отчитаться собственным id, а не чужим');
  assert.equal(event.itemId, CONCRETE_BREAKER_ID);
  assert.equal(event.data?.weaponId, CONCRETE_BREAKER_ID);
});

test('граната слабее заряда ровно во столько, во сколько дешевле', () => {
  const grenade = ITEMS[CONCRETE_BREAKER_ID]!;
  const charge = ITEMS[BREACH_CHARGE_ID]!;
  assert.ok(grenade.value < charge.value, 'опора решения: граната дешевле заряда');
  assert.ok(WEAPON_STATS[CONCRETE_BREAKER_ID]!.dmg < WEAPON_STATS[BREACH_CHARGE_ID]!.dmg, 'и слабее по урону');

  const g = scene();
  const c = scene();
  const state = makeGameState({ worldEvents: createWorldEventState() });

  // Дверь и мясо — работа заряда: у гранаты нет ни тега `door_work`, ни `biomass`.
  const grenadeResult = resolveBreachChargeExplosion(g.world, state, g.player, CONCRETE_BREAKER_ID, 11.5, 10.5, 3.8);
  assert.equal(grenadeResult.breachedDoors, 0, 'граната не берёт двери');
  assert.equal(grenadeResult.breachedBiomass, 0, 'граната не берёт биомассу');
  assert.equal(g.world.doors.has(g.doorIdx), true, 'дверь обязана уцелеть');
  assert.equal(g.world.cells[g.meatIdx], Cell.WALL, 'мясная стена обязана уцелеть');

  const chargeResult = resolveBreachChargeExplosion(c.world, state, c.player, BREACH_CHARGE_ID, 11.5, 10.5, 3.4);
  assert.equal(chargeResult.breachedDoors, 1, 'заряд по-прежнему берёт дверь');
  assert.equal(chargeResult.breachedBiomass, 1, 'заряд по-прежнему берёт биомассу');

  // Радиус гранаты БОЛЬШЕ (3.8 против 3.4), поэтому потолок обязан держать
  // её слабее сам по себе, а не по счастливой геометрии.
  assert.ok(
    grenadeResult.breachedWalls < 18 * (grenade.value / charge.value) + 1,
    'потолок стен у гранаты — доля от потолка заряда',
  );
});

test('прочая взрывчатка бетон не трогает', () => {
  const { world, concreteIdx, doorIdx, player } = scene();
  const state = makeGameState({ worldEvents: createWorldEventState() });

  const result = resolveBreachChargeExplosion(world, state, player, 'grenade', 11.5, 10.5, 4);
  assert.equal(result.changedCells, 0);
  assert.equal(world.cells[concreteIdx], Cell.WALL);
  assert.equal(world.doors.has(doorIdx), true);
  assert.equal(getRecentEvents(state, { type: 'collateral_damage', limit: 4 }).length, 0);
});
