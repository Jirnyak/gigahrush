/* Замок на ПЕРЕНАЦЕЛИВАНИЕ занятого приказом «иди в точку».
 *
 * Канал приказа усыновляет сырой курс (`goal = AIGoal.GOTO` плюс `tx/ty`)
 * строго «пока записи ещё нет»: иначе бегство твари от обидчика подменяло бы
 * приказ. Цена этого правила — сырая запись НЕ перенацеливает того, кто уже
 * идёт по приказу. Кому надо перенацелить занятого, зовёт `setActorOrder`.
 *
 * Два места перенацеливают по кадансу, и оба чинятся тут:
 *   — перерешение укрытия в тревоге (`applyNpcEmergencyDecision`);
 *   — такты сцены `moveTo` / `walkOut` (`aimAtSpot` в `cinematics.ts`).
 *
 * У каждой правки свой НЕГАТИВНЫЙ КОНТРОЛЬ: правило усыновления обязано
 * остаться прежним, иначе починка перенацеливания сломала бы испуг.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal,
  EntityType,
  Faction,
  NpcState,
  Occupation,
  RoomType,
  type Entity,
  type GameState,
} from '../src/core/types';
import { World } from '../src/core/world';
import { createRuntimeCamera } from '../src/systems/camera';
import {
  bindSceneCamera,
  isFloorSceneActive,
  registerFloorScene,
  requestFloorScene,
  resetFloorScenes,
} from '../src/systems/cinematics';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { actorUnderOrder, adoptActorOrder, setActorOrder } from '../src/systems/ai/goto_order';
import {
  applyNpcEmergencyDecision,
  type NpcEmergencyDecision,
} from '../src/systems/ai/npc_emergency';
import { makeTestNpc } from './helpers';

const ANCHOR = 'test_retarget_anchor';
const OLD_X = 12;
const OLD_Y = 34;
const NEW_X = 40;
const NEW_Y = 41;

function walker(): Entity {
  const e = makeTestNpc({ id: 2, x: 20.5, y: 20.5, faction: Faction.CITIZEN });
  e.ai = { goal: AIGoal.WANDER, tx: 20.5, ty: 20.5, path: [], pi: 0, stuck: 0, timer: 0 };
  return e;
}

/** Решение о тревоге с заданной целью: сам выбор укрытия проверяет свой замок. */
function decisionTo(aiGoal: AIGoal, x: number, y: number): NpcEmergencyDecision {
  return {
    npcId: 2,
    phase: 'active',
    role: 'citizen',
    intent: {
      kind: aiGoal === AIGoal.GOTO ? 'guard_shelter' : 'seek_shelter',
      role: 'citizen',
      phase: 'active',
      aiGoal,
      npcState: NpcState.HIDING,
      urgency: 0.9,
      shelterBias: 10,
      defenseBias: 0,
      panic: 0.5,
      reason: 'test',
    },
    targetRoomId: 1,
    targetX: x + 0.5,
    targetY: y + 0.5,
    targetCellX: x,
    targetCellY: y,
    candidates: [],
    jitter: 0.5,
    rethinkAfterSec: 2,
  };
}

test('перерешение укрытия перенацеливает того, кто уже идёт по приказу', () => {
  const e = walker();
  setActorOrder(e, OLD_X, OLD_Y);

  applyNpcEmergencyDecision(e, decisionTo(AIGoal.GOTO, NEW_X, NEW_Y));

  assert.equal(e.ai!.orderX, NEW_X, 'перерешение обязано перебить стоящий приказ');
  assert.equal(e.ai!.orderY, NEW_Y);
  assert.equal(e.ai!.goal, AIGoal.GOTO);
  assert.equal(e.ai!.tx, NEW_X);
  assert.equal(e.ai!.path.length, 0, 'дорога к прежнему адресу обязана быть стёрта');

  /* НЕГАТИВНЫЙ КОНТРОЛЬ к этой правке: само правило усыновления не сдвинулось.
   * Сырая запись курса поверх стоящего приказа по-прежнему НЕ перенацеливает —
   * на этом держится испуг твари, которая заказывает себе бегство тем же полем. */
  const raw = walker();
  setActorOrder(raw, OLD_X, OLD_Y);
  raw.ai!.goal = AIGoal.GOTO;
  raw.ai!.tx = NEW_X;
  raw.ai!.ty = NEW_Y;
  adoptActorOrder(raw);
  assert.equal(raw.ai!.orderX, OLD_X, 'сырая запись не имеет права подменять приказ');
});

test('страх в тревоге СНИМАЕТ приказ, а не спорит с ним каждый кадр', () => {
  const e = walker();
  setActorOrder(e, OLD_X, OLD_Y);

  applyNpcEmergencyDecision(e, decisionTo(AIGoal.HIDE, NEW_X, NEW_Y));

  assert.equal(actorUnderOrder(e), false, 'иначе исполнитель вернёт курс следующим кадром');
  assert.equal(e.ai!.goal, AIGoal.HIDE);
  assert.equal(e.ai!.tx, NEW_X);
  assert.equal(e.ai!.npcState, NpcState.HIDING);

  /* НЕГАТИВНЫЙ КОНТРОЛЬ: снятие приказа не заводит приказ там, где его не было,
   * и не подменяет решение о укрытии приказом. */
  const free = walker();
  applyNpcEmergencyDecision(free, decisionTo(AIGoal.HIDE, NEW_X, NEW_Y));
  assert.equal(free.ai!.orderX, undefined, 'укрытие — не приказ');
  assert.equal(free.ai!.goal, AIGoal.HIDE);
});

/* ── Такт сцены ────────────────────────────────────────────────── */

const SCENE_ID = 'test_scene_retarget_move_to';

function buildWorld(): World {
  const world = new World();
  for (let y = 20; y < 34; y++) {
    for (let x = 20; x < 40; x++) world.carve(x, y);
  }
  world.rooms.push({
    id: 1, type: RoomType.COMMON, x: 20, y: 20, w: 20, h: 14,
    aptId: -1, name: 'Испытательный зал', defId: ANCHOR, doors: [],
  } as never);
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
  } as unknown as GameState;
}

function makePlayer(): Entity {
  return {
    id: 1, type: EntityType.NPC, x: 25.5, y: 25.5, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: Occupation.TRAVELER, hp: 100, maxHp: 100,
    ai: { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    faction: Faction.PLAYER, questId: -1,
  } as unknown as Entity;
}

function tick(world: World, entities: Entity[], player: Entity, state: GameState, nextEntityId: { v: number }, dt: number): void {
  state.time += dt;
  updateContentRuntimeHooks({
    world, entities, player, state, nextEntityId, dt, phase: 'floor_activity', gameOver: false,
  });
}

test('такт сцены перенацеливает актёра, который уже идёт по чужому приказу', () => {
  resetFloorScenes();
  registerFloorScene({
    id: SCENE_ID,
    floorKey: 'design:living',
    trigger: { kind: 'manual' },
    anchorRoomAlias: ANCHOR,
    maxSeconds: 8,
    actors: [{ role: 'star', count: 1, faction: Faction.LIQUIDATOR, ox: -8, oy: -5 }],
    // Пауза нужна, чтобы успеть поставить актёру ЧУЖОЙ приказ до такта.
    beats: [
      { kind: 'pause', seconds: 0.5 },
      { kind: 'moveTo', roles: ['star'], to: { ox: 0, oy: 0 }, wait: 2 },
    ],
  });
  bindSceneCamera(createRuntimeCamera());

  const world = buildWorld();
  const state = buildState();
  const player = makePlayer();
  const entities: Entity[] = [player];
  const nextEntityId = { v: 7000 };

  assert.equal(requestFloorScene(SCENE_ID), true);
  for (let i = 0; i < 20 && !isFloorSceneActive(); i++) tick(world, entities, player, state, nextEntityId, 0.1);
  const star = entities.find(e => e.id !== player.id)!;

  // Кто-то другой уже ведёт актёра: караван, тревожная панель, шествие.
  setActorOrder(star, OLD_X, OLD_Y);
  for (let i = 0; i < 12; i++) tick(world, entities, player, state, nextEntityId, 0.1);

  const cx = 30;
  const cy = 27;
  assert.equal(actorUnderOrder(star), true, 'такт обязан оставить приказ, а не курс без записи');
  assert.ok(
    world.dist2(star.ai!.orderX!, star.ai!.orderY!, cx, cy) < 4,
    `сцена не перенацелила: приказ ведёт в ${star.ai!.orderX},${star.ai!.orderY}, а не в середину зала (${cx},${cy})`,
  );
  assert.notEqual(star.ai!.orderX, OLD_X, 'прежний адрес обязан быть забыт');
  resetFloorScenes();
});
