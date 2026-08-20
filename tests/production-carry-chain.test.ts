/* Цепочка «цех → склад» человеческими руками (`rooms.md`).
 *
 * Раньше выход смены телепортировался в контейнер цеха. Теперь его забирает
 * тот, кто стоит у станка, кладёт в цеховой ящик, если есть место, и несёт
 * дальше, если места нет; кладовщик забирает из цеха и увозит на склад.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, ContainerKind, EntityType, Faction, Occupation, RoomType, Tex, ZoneFaction,
  type Entity, type GameClock,
} from '../src/core/types';
import { World } from '../src/core/world';
import { createWorldEventState } from '../src/systems/events';
import { ensureProductionRooms, tickProduction, type ProductionState } from '../src/systems/production';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext, updateNPC } from '../src/systems/ai/npc_fsm';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeGameState, makeTestContainer, makeTestPlayer } from './helpers';

const FULL_NEEDS = { food: 95, water: 95, sleep: 95, pee: 5, poo: 5 };

function makePressState() {
  return makeGameState({ currentZ: -26, time: 1000, worldEvents: createWorldEventState() });
}

function makePressWorld(): World {
  const world = new World();
  for (let y = 8; y < 40; y++) {
    for (let x = 8; x < 40; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  addTestRoom(world, {
    id: 0,
    type: RoomType.PRODUCTION,
    x: 10, y: 10, w: 7, h: 7,
    name: 'Брикетный цех: линия концентрата',
    zoneId: 0,
    zoneFaction: ZoneFaction.CITIZEN,
    wallTex: Tex.PIPE,
  });
  world.addContainer(makeTestContainer({
    id: 1,
    x: 12, y: 12, z: -26,
    roomId: 0,
    zoneId: 0,
    kind: ContainerKind.METAL_CABINET,
    name: 'Выходной шкаф линии концентрата',
    inventory: [{ defId: 'grey_briquette', count: 1 }],
    capacitySlots: 8,
    access: 'room',
    faction: Faction.CITIZEN,
    tags: ['concentrate_press', 'concentrate_press_output', 'production_output', 'food'],
  }));
  return world;
}

function primeProduction(state: ReturnType<typeof makePressState>, world: World): void {
  ensureProductionRooms(state, world);
  const production = (state as typeof state & { production: ProductionState[] }).production;
  assert.equal(production.length, 1);
  production[0].cycleCount = 2;
  production[0].nextTickAt = 0;
}

function makeWorker(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    occupation: Occupation.MECHANIC,
    alifeId: 8000 + id,
    needs: { ...FULL_NEEDS },
    inventory: [],
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function tickNpc(world: World, entities: Entity[], npc: Entity, minutes: number): void {
  rebuildEntityIndexForSimulation(entities, minutes);
  setPathContext([], minutes);
  setNpcContext([], minutes, -26);
  const clock: GameClock = { hour: 12, minute: 0, totalMinutes: minutes };
  updateNPC(world, entities, npc, 0, minutes, clock, false);
}

test('смену забирает тот, кто стоит у станка, а не ящик', () => {
  const state = makePressState();
  const world = makePressWorld();
  primeProduction(state, world);

  const worker = makeWorker(1, 12.5, 13.5);
  const entities = [worker];
  const output = world.containerById.get(1)!;
  const beforeSlots = output.inventory.length;

  assert.equal(tickProduction(state, world, true, undefined, entities), 1);

  const carried = (worker.inventory ?? []).map(slot => slot.defId);
  assert.ok(carried.includes('green_briquette'), `работник должен получить смену в руки, а получил ${JSON.stringify(carried)}`);
  assert.equal(output.inventory.length, beforeSlots, 'в ящик ничего не телепортируется, пока есть кому забрать');
});

test('пустой цех работает по-старому: смена ложится в ящик', () => {
  const state = makePressState();
  const world = makePressWorld();
  primeProduction(state, world);

  assert.equal(tickProduction(state, world, true), 1);

  const output = world.containerById.get(1)!;
  assert.ok(output.inventory.some(item => item.defId === 'green_briquette'), 'без людей выход обязан достаться ящику');
});

test('работник складывает смену в цеховой ящик, не таща её через этаж', () => {
  const world = makePressWorld();
  addTestRoom(world, { id: 1, type: RoomType.STORAGE, x: 28, y: 10, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  const shop = world.containerById.get(1)!;
  const worker = makeWorker(2, 12.5, 13.5, {
    inventory: [
      { defId: 'green_briquette', count: 4 },
      { defId: 'acid_bottle', count: 2 },
      { defId: 'zhelemish_sample_sealed', count: 2 },
      { defId: 'arena_gold_trophy', count: 1 },
    ],
  });
  const entities = [makeTestPlayer({ id: 99, x: 38, y: 38 }), worker];

  const before = shop.inventory.length;
  for (let step = 0; step < 6; step++) {
    worker.x = 12.5;
    worker.y = 13.5;
    worker.ai!.path = [];
    worker.ai!.pi = 0;
    worker.ai!.timer = 0;
    tickNpc(world, entities, worker, 700 + step * 4);
  }

  assert.ok(shop.inventory.length > before, 'смена обязана лечь в ящик своего же цеха');
});

test('кладовщик забирает товар из цеха и увозит на склад', () => {
  const world = makePressWorld();
  const storage = addTestRoom(world, { id: 1, type: RoomType.STORAGE, x: 28, y: 10, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  world.addContainer(makeTestContainer({
    id: 2,
    x: storage.x + 2, y: storage.y + 2, z: -26,
    roomId: storage.id,
    zoneId: 1,
    kind: ContainerKind.SHELF,
    name: 'Складской стеллаж',
    inventory: [],
    access: 'room',
    faction: Faction.CITIZEN,
    tags: [],
  }));
  const shop = world.containerById.get(1)!;
  shop.inventory.push({ defId: 'green_briquette', count: 6 });
  const shelf = world.containerById.get(2)!;

  const keeper = makeWorker(3, 12.5, 13.5, { occupation: Occupation.STOREKEEPER });
  const entities = [makeTestPlayer({ id: 99, x: 38, y: 38 }), keeper];

  // Забирает из цеха.
  for (let step = 0; step < 4; step++) {
    keeper.x = 12.5;
    keeper.y = 13.5;
    keeper.ai!.path = [];
    keeper.ai!.pi = 0;
    keeper.ai!.timer = 0;
    tickNpc(world, entities, keeper, 700 + step * 4);
  }
  assert.ok((keeper.inventory ?? []).length > 0, 'кладовщик обязан взять товар из цехового ящика');
  assert.equal(shop.inventory.length, 0, 'цеховой ящик должен опустеть');

  // Довозит до склада.
  for (let step = 0; step < 6; step++) {
    keeper.x = storage.x + 2.5;
    keeper.y = storage.y + 2.5;
    keeper.ai!.path = [];
    keeper.ai!.pi = 0;
    keeper.ai!.timer = 0;
    tickNpc(world, entities, keeper, 730 + step * 4);
  }

  assert.ok(shelf.inventory.length > 0, 'товар обязан доехать до склада');
});

test('кладовщик разносит со склада туда, где вещи место', () => {
  const world = makePressWorld();
  const storage = addTestRoom(world, { id: 1, type: RoomType.STORAGE, x: 28, y: 10, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  const kitchen = addTestRoom(world, { id: 2, type: RoomType.KITCHEN, x: 20, y: 24, w: 6, h: 6, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  world.addContainer(makeTestContainer({
    id: 2,
    x: storage.x + 2, y: storage.y + 2, z: -26,
    roomId: storage.id, zoneId: 1,
    kind: ContainerKind.SHELF, name: 'Складской стеллаж',
    inventory: [{ defId: 'bread', count: 6 }],
    access: 'room', faction: Faction.CITIZEN, tags: [],
  }));
  world.addContainer(makeTestContainer({
    id: 3,
    x: kitchen.x + 2, y: kitchen.y + 2, z: -26,
    roomId: kitchen.id, zoneId: 2,
    kind: ContainerKind.SHELF, name: 'Кухонный шкаф',
    inventory: [],
    access: 'room', faction: Faction.CITIZEN, tags: [],
  }));
  const shelf = world.containerById.get(2)!;
  const cupboard = world.containerById.get(3)!;

  const keeper = makeWorker(4, storage.x + 2.5, storage.y + 2.5, { occupation: Occupation.STOREKEEPER });
  const entities = [makeTestPlayer({ id: 99, x: 38, y: 38 }), keeper];

  // Берёт хлеб со склада.
  for (let step = 0; step < 4; step++) {
    keeper.x = storage.x + 2.5;
    keeper.y = storage.y + 2.5;
    keeper.ai!.path = [];
    keeper.ai!.pi = 0;
    keeper.ai!.timer = 0;
    tickNpc(world, entities, keeper, 700 + step * 4);
  }
  assert.ok((keeper.inventory ?? []).some(slot => slot.defId === 'bread'), 'кладовщик обязан взять со склада то, чего ждут в комнатах');
  assert.ok(shelf.inventory.every(slot => slot.defId !== 'bread' || slot.count < 6), 'хлеб должен убыть со стеллажа');

  // Доносит до кухни.
  for (let step = 0; step < 6; step++) {
    keeper.x = kitchen.x + 2.5;
    keeper.y = kitchen.y + 2.5;
    keeper.ai!.path = [];
    keeper.ai!.pi = 0;
    keeper.ai!.timer = 0;
    tickNpc(world, entities, keeper, 730 + step * 4);
  }

  assert.ok(cupboard.inventory.some(slot => slot.defId === 'bread'), 'хлеб обязан доехать до кухни');
});

test('порожний кладовщик на кухне ничего не уносит обратно', () => {
  const world = makePressWorld();
  const kitchen = addTestRoom(world, { id: 2, type: RoomType.KITCHEN, x: 20, y: 24, w: 6, h: 6, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  world.addContainer(makeTestContainer({
    id: 3,
    x: kitchen.x + 2, y: kitchen.y + 2, z: -26,
    roomId: kitchen.id, zoneId: 2,
    kind: ContainerKind.SHELF, name: 'Кухонный шкаф',
    inventory: [{ defId: 'bread', count: 4 }],
    access: 'room', faction: Faction.CITIZEN, tags: [],
  }));
  const cupboard = world.containerById.get(3)!;
  const before = cupboard.inventory.find(slot => slot.defId === 'bread')?.count;

  const keeper = makeWorker(5, kitchen.x + 2.5, kitchen.y + 2.5, { occupation: Occupation.STOREKEEPER });
  const entities = [makeTestPlayer({ id: 99, x: 38, y: 38 }), keeper];
  for (let step = 0; step < 6; step++) {
    keeper.x = kitchen.x + 2.5;
    keeper.y = kitchen.y + 2.5;
    keeper.ai!.path = [];
    keeper.ai!.pi = 0;
    keeper.ai!.timer = 0;
    tickNpc(world, entities, keeper, 700 + step * 4);
  }

  assert.equal(cupboard.inventory.find(slot => slot.defId === 'bread')?.count, before, 'донесённое не должно уезжать назад');
  assert.equal((keeper.inventory ?? []).length, 0, 'на кухне кладовщику брать нечего');
});
