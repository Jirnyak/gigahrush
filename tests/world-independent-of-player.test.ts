/* Замок принципа: игрок — это просто NPC.
 *
 * Мир не имеет права вести себя по-разному в зависимости от того, есть ли рядом
 * игрок и как к нему относятся. Дальность, с которой NPC замечает противника, —
 * свойство самого NPC: его смелости и его оружия. Ни присутствие игрока на
 * этаже, ни отношение к нему в эту величину входить не должны.
 *
 * История вопроса: до 2026-08-20 `detectRange` брался из враждебности к игроку,
 * из-за чего в одном бою одна сторона видела на 18 клеток, а другая на 8, и
 * вдобавок весь бой переключался самим фактом появления игрока на этаже.
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  AIGoal,
  EntityType,
  Faction,
  Occupation,
  type Entity,
  type GameState,
} from '../src/core/types';
import { World } from '../src/core/world';
import { updateAI } from '../src/systems/ai/index';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { initFactionRelations } from '../src/data/relations';
import { seedGlobalRng } from '../src/core/rand';

const STEP = 1 / 60;
const LIMIT_SECONDS = 20;

function buildWorld(): World {
  const world = new World();
  for (let y = 40; y < 70; y++) {
    for (let x = 40; x < 70; x++) world.carve(x, y);
  }
  return world;
}

function buildState(): GameState {
  return {
    time: 0,
    tick: 0,
    currentZ: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    msgs: [],
    msgLog: [],
    recentEvents: [],
    importantEvents: [],
    zoneEvents: {},
    samosborActive: false,
  } as unknown as GameState;
}

function makeActor(id: number, x: number, y: number, faction: Faction, weapon?: string): Entity {
  return {
    id,
    type: EntityType.NPC,
    x, y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: Occupation.HUNTER,
    occupation: Occupation.HUNTER,
    name: `actor_${id}`,
    hp: 200,
    maxHp: 200,
    faction,
    questId: -1,
    weapon,
    inventory: [],
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  } as unknown as Entity;
}

/**
 * Секунды до того, как враждебная пара заметит друг друга. Актёры прибиваются на
 * место после каждого шага: иначе «заметил на дистанции D» означало бы «дошёл
 * пешком до своей настоящей дистанции».
 */
function secondsUntilMutualDetection(distance: number, withPlayer: boolean): number {
  seedGlobalRng(20260820);
  initFactionRelations();
  const world = buildWorld();
  const state = buildState();

  const ax = 50.5, ay = 55.5;
  const bx = ax + distance, by = ay;
  const liquidator = makeActor(11, ax, ay, Faction.LIQUIDATOR, 'knife');
  const wild = makeActor(12, bx, by, Faction.WILD, 'knife');
  const entities: Entity[] = [liquidator, wild];

  // Игрок стоит в стороне, дальше любого радиуса обнаружения: он не цель, он
  // просто присутствует. Именно это раньше и меняло дальность зрения обоих.
  let playerId = -1;
  if (withPlayer) {
    const player = makeActor(13, ax, ay + 17, Faction.PLAYER);
    entities.push(player);
    playerId = player.id;
  }

  for (let frame = 0; frame * STEP < LIMIT_SECONDS; frame++) {
    state.time += STEP;
    rebuildEntityIndexForSimulation(entities, frame);
    updateAI(world, entities, STEP, state.time, state.msgs, playerId, state.clock, false, { v: 9000 }, 0, state);
    liquidator.x = ax; liquidator.y = ay;
    wild.x = bx; wild.y = by;
    if (liquidator.ai?.combatTargetId === wild.id && wild.ai?.combatTargetId === liquidator.id) {
      return frame * STEP;
    }
  }
  return Number.POSITIVE_INFINITY;
}

test('detection distance does not change when a player is present on the floor', () => {
  for (const distance of [6, 10, 14]) {
    const without = secondsUntilMutualDetection(distance, false);
    const withPlayer = secondsUntilMutualDetection(distance, true);
    assert.equal(
      without,
      withPlayer,
      `на ${distance} клетках мир повёл себя по-разному: без игрока ${without}с, с игроком ${withPlayer}с`,
    );
    assert.ok(
      Number.isFinite(without),
      `на ${distance} клетках враждебные NPC вообще не заметили друг друга при прямой видимости`,
    );
  }
});

test('hostile pair detects mutually, not one-sidedly', () => {
  // Обе стороны обязаны увидеть друг друга: раньше дружественная игроку сторона
  // получала вдвое меньший радиус и оставалась слепой в том же бою.
  seedGlobalRng(20260820);
  initFactionRelations();
  const world = buildWorld();
  const state = buildState();
  const ax = 50.5, ay = 55.5, distance = 12;
  const liquidator = makeActor(21, ax, ay, Faction.LIQUIDATOR, 'knife');
  const wild = makeActor(22, ax + distance, ay, Faction.WILD, 'knife');
  const entities: Entity[] = [liquidator, wild];

  for (let frame = 0; frame * STEP < LIMIT_SECONDS; frame++) {
    state.time += STEP;
    rebuildEntityIndexForSimulation(entities, frame);
    updateAI(world, entities, STEP, state.time, state.msgs, -1, state.clock, false, { v: 9000 }, 0, state);
    liquidator.x = ax; liquidator.y = ay;
    wild.x = ax + distance; wild.y = ay;
  }

  assert.equal(liquidator.ai?.combatTargetId, wild.id, 'ликвидатор обязан видеть дикого на 12 клетках');
  assert.equal(wild.ai?.combatTargetId, liquidator.id, 'дикий обязан видеть ликвидатора на тех же 12 клетках');
});
