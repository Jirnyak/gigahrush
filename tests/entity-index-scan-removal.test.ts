/**
 * Замок на снятые полные переборы.
 *
 * Правки этой партии заменили перебор всего массива сущностей на общий индекс.
 * Здесь проверяется ровно то, что от такой замены может незаметно поехать:
 * порядок разбора, ответы при НЕсобранном индексе и ответы при индексе,
 * собранном для ЧУЖОГО массива.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { MAX_INVENTORY_SLOTS } from '../src/data/inventory_limits';
import { activeActorSoftLimit } from '../src/data/entity_limits';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { countLiveActiveActors, countLiveEntitiesOfType, countLiveFloorObjects, remainingEntitySpawnSlots } from '../src/systems/entity_limits';
import { pickupNearby } from '../src/systems/inventory';
import { updateBlockCrushDamage } from '../src/systems/damage';
import { countInventoryItem, makeGameState, makeTestPlayer } from './helpers';

/** Подбор звучит; в Node звука нет, и без заглушки падает сам вызов, а не проверка. */
function installNoopAudioContext(): void {
  const fakeNode = {
    connect: () => fakeNode,
    disconnect: () => undefined,
    gain: {
      value: 0,
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    },
    frequency: {
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
    },
    start: () => undefined,
    stop: () => undefined,
    type: 'sine',
  };
  class FakeAudioContext {
    currentTime = 0;
    destination = fakeNode;
    state: AudioContextState = 'running';
    createOscillator(): OscillatorNode { return fakeNode as unknown as OscillatorNode; }
    createGain(): GainNode { return fakeNode as unknown as GainNode; }
    resume(): Promise<void> { return Promise.resolve(); }
  }
  (globalThis as typeof globalThis & { AudioContext: typeof AudioContext }).AudioContext = FakeAudioContext as unknown as typeof AudioContext;
}

function drop(id: number, x: number, y: number, defId: string): Entity {
  return {
    id,
    type: EntityType.ITEM_DROP,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    inventory: [{ defId, count: 1 }],
  };
}

function monster(id: number, x: number, y: number, alive = true): Entity {
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
  };
}

test('pickupNearby разбирает дропы с конца массива, как и до индекса', () => {
  installNoopAudioContext();
  const world = new World();
  // Один свободный слот: возьмётся ровно ОДИН предмет, и какой — решает порядок.
  const player = makeTestPlayer({
    id: 1,
    x: 10,
    y: 10,
    inventory: Array.from({ length: MAX_INVENTORY_SLOTS - 1 }, () => ({ defId: 'pipe', count: 1 })),
  });
  // Старший в массиве стоит ДАЛЬШЕ: разбор по расстоянию взял бы не его.
  const olderNearer = drop(2, 10.2, 10, 'bread');
  const newerFarther = drop(3, 11.2, 10, 'canned');
  const entities: Entity[] = [player, olderNearer, newerFarther];
  const msgs = makeGameState().msgs;

  pickupNearby(world, entities, player, msgs, 1);

  assert.equal(countInventoryItem(player, 'canned'), 1, 'разбор обязан начинаться с конца массива');
  assert.equal(countInventoryItem(player, 'bread'), 0);
});

test('pickupNearby не трогает дроп за радиусом подбора', () => {
  const world = new World();
  const player = makeTestPlayer({ id: 1, x: 10, y: 10, inventory: [] });
  const far = drop(2, 12.5, 10, 'bread');
  const entities: Entity[] = [player, far];

  pickupNearby(world, entities, player, makeGameState().msgs, 1);

  assert.equal(far.alive, true);
  assert.equal(countInventoryItem(player, 'bread'), 0);
});

test('счётчики пределов совпадают при собранном и несобранном индексе', () => {
  const player = makeTestPlayer({ id: 1, x: 5, y: 5 });
  const entities: Entity[] = [
    player,
    monster(2, 6, 5),
    monster(3, 7, 5, false),
    drop(4, 8, 5, 'bread'),
  ];

  // Индекс собран для ЧУЖОГО массива — счётчики обязаны идти по своему.
  rebuildEntityIndex([monster(90, 1, 1), monster(91, 2, 2), monster(92, 3, 3)], 'manual');
  const staleActors = countLiveActiveActors(entities);
  const staleMonsters = countLiveEntitiesOfType(entities, EntityType.MONSTER);
  const staleSlots = remainingEntitySpawnSlots(entities, EntityType.MONSTER);

  rebuildEntityIndex(entities, 'manual');
  assert.equal(countLiveActiveActors(entities), staleActors);
  assert.equal(countLiveEntitiesOfType(entities, EntityType.MONSTER), staleMonsters);
  assert.equal(remainingEntitySpawnSlots(entities, EntityType.MONSTER), staleSlots);

  assert.equal(staleActors, 1, 'живой монстр один, игрок в мягкий предел не входит');
  assert.equal(staleMonsters, 1);
  assert.equal(staleSlots, activeActorSoftLimit() - 1);
});

test('счётчики видят смерть, случившуюся после сборки индекса', () => {
  const player = makeTestPlayer({ id: 1, x: 5, y: 5 });
  const doomed = monster(2, 6, 5);
  const entities: Entity[] = [player, doomed, monster(3, 7, 5)];
  rebuildEntityIndex(entities, 'manual');
  assert.equal(countLiveActiveActors(entities), 2);

  doomed.alive = false;
  assert.equal(countLiveActiveActors(entities), 1, 'срез индекса — снимок, alive перепроверяется на месте');
});

test('раздавливание в структуре достаёт актёров при индексе от чужого массива', () => {
  const world = new World();
  const state = makeGameState({ time: 3 });
  const victim = monster(2, 5.5, 5.5);
  const bystander = monster(3, 40.5, 40.5);
  const entities: Entity[] = [victim, bystander];
  // Клетка жертвы — стена, клетка соседа остаётся полом.
  world.cells[world.idx(5, 5)] = 1;
  world.cells[world.idx(40, 40)] = 0;

  rebuildEntityIndex([monster(80, 1, 1)], 'manual');
  updateBlockCrushDamage(world, entities, state, 1);

  assert.ok((victim.hp ?? 0) < 50, 'жертва в стене обязана получить урон');
  assert.equal(bystander.hp, 50);
});

test('предел напольных объектов считается по индексу и совпадает с перебором', () => {
  const player = makeTestPlayer({ id: 1, x: 5, y: 5 });
  const projectile: Entity = {
    id: 20, type: EntityType.PROJECTILE, x: 6, y: 5,
    angle: 0, pitch: 0, alive: true, speed: 8, sprite: 0, projLife: 1,
  };
  const billboard: Entity = {
    id: 21, type: EntityType.BILLBOARD, x: 7, y: 5,
    angle: 0, pitch: 0, alive: true, speed: 0, sprite: 0,
  };
  const entities: Entity[] = [
    player,
    drop(30, 8, 5, 'bread'),
    drop(31, 9, 5, 'bread'),
    drop(32, 10, 5, 'bread'),
    projectile,
    billboard,
    monster(40, 11, 5),
  ];

  // Индекс собран для ЧУЖОГО массива — ответ обязан прийти из честного перебора.
  rebuildEntityIndex([drop(90, 1, 1, 'bread')], 'manual');
  const stale = countLiveFloorObjects(entities);
  const staleSlots = remainingEntitySpawnSlots(entities, EntityType.ITEM_DROP);

  rebuildEntityIndex(entities, 'manual');
  assert.equal(countLiveFloorObjects(entities), stale, 'индекс и перебор обязаны сходиться');
  assert.equal(remainingEntitySpawnSlots(entities, EntityType.ITEM_DROP), staleSlots);
  assert.equal(stale, 5, 'три дропа, снаряд и билборд; монстр и игрок в пол не идут');
});

test('дописанный дроп виден пределу в том же кадре, а не со следующей пересборки', () => {
  const player = makeTestPlayer({ id: 1, x: 5, y: 5 });
  const entities: Entity[] = [player, drop(30, 8, 5, 'bread')];
  rebuildEntityIndex(entities, 'manual');
  assert.equal(countLiveFloorObjects(entities), 1);

  // Всплеск посмертного лута дописывает дропы прямо в массив: длина разъезжается
  // с индексом, и предел обязан вернуться к честному перебору, иначе за один
  // кадр можно перелить через мягкий потолок сколько угодно.
  entities.push(drop(31, 9, 5, 'bread'), drop(32, 10, 5, 'bread'));
  assert.equal(countLiveFloorObjects(entities), 3);
});
