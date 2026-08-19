/* Намерение «склад»: отнести лишнее, взять патроны (`rooms.md`).
 *
 * До этого affordance `store` у комнаты не вела никуда: склад был достижим
 * только по ремеслу. Здесь проверяется, что дело живёт от вещей в карманах, а
 * не от расписания: пустой карман и полный магазин — и склад проигрывает.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal, Cell, ContainerKind, EntityType, Faction, Occupation, RoomType, ZoneFaction,
  type Entity, type GameClock, type WorldContainer,
} from '../src/core/types';
import { World } from '../src/core/world';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext, updateNPC } from '../src/systems/ai/npc_fsm';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeTestPlayer } from './helpers';

const FULL_NEEDS = { food: 95, water: 95, sleep: 95, pee: 5, poo: 5 };

function makeStoreWorld(): { world: World; container: WorldContainer } {
  const world = new World();
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  addTestRoom(world, { id: 1, type: RoomType.COMMON, x: 8, y: 8, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  // Цех рядом: иначе работа механика сама уводит его на склад, и намерения не различить.
  addTestRoom(world, { id: 3, type: RoomType.PRODUCTION, x: 8, y: 24, w: 6, h: 6, zoneId: 3, zoneFaction: ZoneFaction.CITIZEN });
  const storage = addTestRoom(world, { id: 2, type: RoomType.STORAGE, x: 40, y: 8, w: 6, h: 6, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const container: WorldContainer = {
    id: 1,
    x: storage.x + 1,
    y: storage.y + 1,
    z: 0,
    roomId: storage.id,
    zoneId: 2,
    kind: ContainerKind.SHELF,
    name: 'Стеллаж',
    inventory: [],
    access: 'room',
    discovered: true,
    tags: [],
  };
  world.containers.push(container);
  return { world, container };
}

function makeCarrier(id: number, inventory: Entity['inventory'], overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 11.5,
    y: 11.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    occupation: Occupation.MECHANIC,
    alifeId: 6000 + id,
    needs: { ...FULL_NEEDS },
    inventory,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function tick(world: World, npc: Entity, minutes: number): void {
  const entities = [makeTestPlayer({ id: 1, x: 90, y: 90 }), npc];
  rebuildEntityIndexForSimulation(entities, minutes);
  setPathContext([], minutes);
  setNpcContext([], minutes, 0);
  const clock: GameClock = { hour: 12, minute: 0, totalMinutes: minutes };
  updateNPC(world, entities, npc, 0, minutes, clock, false);
}

/** Довести человека до склада: путь тикается, поэтому просто ставим его туда. */
function walkToStorage(world: World, npc: Entity, minutes: number): void {
  npc.x = 43.5;
  npc.y = 11.5;
  npc.ai!.path = [];
  npc.ai!.pi = 0;
  npc.ai!.timer = 0;
  tick(world, npc, minutes);
}

test('хабар в карманах поднимает намерение склада, пустые — нет', () => {
  const { world } = makeStoreWorld();
  const storage = world.rooms[2];
  let loadedToStorage = 0;
  let emptyToStorage = 0;

  // Привычка носить вещи своя у каждого: часть людей идёт сдавать сразу,
  // часть дотерпит до вечера. Проверяется форма, а не поимённое решение.
  for (let i = 0; i < 12; i++) {
    const loaded = makeCarrier(100 + i, [
      { defId: 'zhelemish_sample_sealed', count: 3 },
      { defId: 'arena_gold_trophy', count: 2 },
      { defId: 'armor_light', count: 1 },
      { defId: 'armor_medium', count: 1 },
    ]);
    const empty = makeCarrier(200 + i, []);
    tick(world, loaded, 700 + i);
    tick(world, empty, 700 + i);
    if (world.roomAt(loaded.ai?.tx ?? -1, loaded.ai?.ty ?? -1)?.id === storage.id) loadedToStorage++;
    if (world.roomAt(empty.ai?.tx ?? -1, empty.ai?.ty ?? -1)?.id === storage.id) emptyToStorage++;
  }

  assert.ok(loadedToStorage >= 4, `с полными карманами на склад собрались ${loadedToStorage} из 12 — дело не поднимается вещами`);
  assert.equal(emptyToStorage, 0, 'с пустыми карманами на складе делать нечего');
});

test('на складе человек сдаёт лишнее и не сдаёт своё', () => {
  const { world, container } = makeStoreWorld();
  const npc = makeCarrier(15, [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 12 },
    { defId: 'zhelemish_sample_sealed', count: 3 },
    { defId: 'arena_gold_trophy', count: 2 },
    { defId: 'armor_light', count: 1 },
    { defId: 'armor_medium', count: 1 },
    { defId: 'bandage', count: 1 },
  ], { weapon: 'makarov' });

  tick(world, npc, 700);
  for (let step = 0; step < 8; step++) walkToStorage(world, npc, 701 + step * 4);

  const carried = new Set((npc.inventory ?? []).map(slot => slot.defId));
  const stored = new Set(container.inventory.map(slot => slot.defId));

  assert.ok(stored.has('zhelemish_sample_sealed'), 'хабар должен уехать на склад');
  assert.ok(stored.has('arena_gold_trophy'), 'хабар должен уехать на склад');
  assert.ok(carried.has('makarov'), 'своё оружие человек не сдаёт');
  assert.ok(carried.has('ammo_9mm'), 'патроны своего калибра человек не сдаёт');
  assert.ok(carried.has('bandage'), 'лекарство человек оставляет при себе');
});

test('безоружный по патронам берёт свой калибр со склада', () => {
  const { world, container } = makeStoreWorld();
  container.inventory.push({ defId: 'ammo_9mm', count: 24 });
  const npc = makeCarrier(15, [
    { defId: 'zhelemish_sample_sealed', count: 2 },
    { defId: 'arena_gold_trophy', count: 2 },
  ], { weapon: 'makarov' });

  tick(world, npc, 700);
  for (let step = 0; step < 10; step++) walkToStorage(world, npc, 701 + step * 4);

  const ammo = (npc.inventory ?? []).find(slot => slot.defId === 'ammo_9mm');
  assert.ok(ammo && ammo.count > 0, 'человек с пустым магазином обязан унести патроны со склада');
});
