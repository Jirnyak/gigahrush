/* Замки канала приказа `ai.goal = AIGoal.GOTO`.
 *
 * Приказ — единственный способ задать актору волю СНАРУЖИ его собственной
 * (сцена, караван, авторская встреча, сбор по тревоге). Исполнитель у него один
 * на человека и тварь — `tickGotoOrder` в `src/systems/ai/goto_order.ts`.
 * Здесь заперты три места, где приказ молча терялся, и граница, за которую он
 * заходить не вправе: бой.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity, type GameClock } from '../src/core/types';
import { World } from '../src/core/world';
import { updateAI } from '../src/systems/ai';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { runActorTactic } from '../src/systems/ai/tactics';
import { resetCombatStimulus } from '../src/systems/combat_stimulus';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const CLOCK: GameClock = { hour: 8, minute: 0, totalMinutes: 8 * 60 };

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = 1; y < 60; y++) {
    for (let x = 1; x < 60; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
  world.cellVersion++;
  bakeNavigationTree(world);
  return world;
}

function aiState(tx: number, ty: number): Entity['ai'] {
  return { goal: AIGoal.WANDER, tx, ty, path: [], pi: 0, stuck: 0, timer: 0 };
}

/** Приказ ставится ровно как в `aimAtSpot` (`systems/cinematics.ts`). */
function order(e: Entity, tx: number, ty: number): void {
  const ai = e.ai!;
  ai.goal = AIGoal.GOTO;
  ai.tx = tx;
  ai.ty = ty;
  ai.path = [];
  ai.pi = 0;
  ai.stuck = 0;
  ai.timer = 0;
}

function monster(kind: MonsterKind, x: number, y: number, id: number): Entity {
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 2.2,
    sprite: 0,
    hp: 90,
    maxHp: 90,
    monsterKind: kind,
    attackCd: 0,
    ai: aiState(x, y),
  };
}

/** Кадры симуляции; возвращает кадр, на котором `watched` ВПЕРВЫЕ встал в
 *  клетку `tx,ty`, или -1. Смотреть на позицию в конце прогона нельзя: приказ
 *  конечен, и дошедший актор тем же кадром уходит по своим делам. */
function run(world: World, entities: Entity[], player: Entity, frames: number,
  watched?: { e: Entity; tx: number; ty: number }): number {
  const state = makeGameState({ time: 4, clock: CLOCK, currentZ: -26 });
  let reachedAt = -1;
  for (let f = 0; f < frames; f++) {
    state.time += 0.1;
    rebuildEntityIndexForSimulation(entities, f + 1);
    updateAI(world, entities, 0.1, state.time, state.msgs, player.id, CLOCK, false, { v: 10_000 }, state.currentZ, state);
    if (watched && reachedAt < 0
      && Math.floor(watched.e.x) === Math.floor(watched.tx)
      && Math.floor(watched.e.y) === Math.floor(watched.ty)) reachedAt = f;
  }
  return reachedAt;
}

/* ── A. Приказ при спавне переживает первый кадр ───────────────── */
test('приказ, поставленный при спавне, переживает primeNpcAlifeState', () => {
  resetCombatStimulus();
  const world = openWorld();
  // Игрок далеко: замер про приказ, а не про то, кто кому враг.
  const player = makeTestPlayer({ id: 1, x: 3.5, y: 3.5 });
  const walker = makeTestNpc({ id: 2, x: 30.5, y: 30.5, speed: 2.4, faction: Faction.CITIZEN });
  walker.ai = aiState(30.5, 30.5);
  order(walker, 40.5, 30.5);
  // Приказ отдан ДО первого кадра AI: `ai.npcState` ещё не заведён, и первым
  // делом этого NPC встретит `primeNpcAlifeState`.
  assert.equal(walker.ai.npcState, undefined);

  const entities = [player, walker];
  run(world, entities, player, 1);

  assert.equal(walker.ai!.goal, AIGoal.GOTO, 'намерение утилити стёрло приказ на первом же кадре');
  assert.notEqual(walker.ai!.npcState, undefined, 'состояние A-Life всё равно должно завестись');

  const reachedAt = run(world, entities, player, 200, { e: walker, tx: 40.5, ty: 30.5 });
  assert.notEqual(reachedAt, -1, 'человек под приказом не дошёл до заказанной клетки');
});

/* ── B. Тактический профиль уступает приказу ───────────────────── */
test('тактика отказывается от актора под приказом', () => {
  resetCombatStimulus();
  const world = openWorld();
  const state = makeGameState({ time: 4, clock: CLOCK, currentZ: -26 });
  const slime = monster(MonsterKind.SLIME_WOMAN, 24.5, 24.5, 2);
  // Толпа врагов — то, ради чего у жижевой женщины вообще есть тактика.
  const crowd = [
    makeTestNpc({ id: 3, x: 23.5, y: 24.5, faction: Faction.CITIZEN }),
    makeTestNpc({ id: 4, x: 25.5, y: 24.5, faction: Faction.CITIZEN }),
    makeTestNpc({ id: 5, x: 24.5, y: 23.5, faction: Faction.CITIZEN }),
    makeTestNpc({ id: 6, x: 24.5, y: 25.5, faction: Faction.CITIZEN }),
  ];
  const entities = [makeTestPlayer({ id: 1, x: 3.5, y: 3.5 }), slime, ...crowd];
  rebuildEntityIndexForSimulation(entities, 1);

  // Контроль сцены: без приказа тактика этого актора ЗАБИРАЕТ.
  assert.equal(runActorTactic(world, slime, 0.1, state.time, state.msgs, state), true,
    'сцена собрана неверно: тактика не сработала бы и без приказа');

  order(slime, 40.5, 24.5);
  assert.equal(runActorTactic(world, slime, 0.1, state.time, state.msgs, state), false,
    'тактика забрала актора из-под приказа');
  assert.equal(slime.ai!.goal, AIGoal.GOTO, 'тактика затёрла курс приказа');
  assert.equal(slime.ai!.tx, 40.5, 'тактика затёрла заказанную точку');
});

/* ── C. Тварь читает тот же канал ──────────────────────────────── */
test('монстр под приказом идёт в заказанную клетку', () => {
  resetCombatStimulus();
  const world = openWorld();
  const player = makeTestPlayer({ id: 1, x: 3.5, y: 3.5 });
  const beast = monster(MonsterKind.BETONOED, 30.5, 30.5, 2);
  order(beast, 40.5, 30.5);
  const entities = [player, beast];

  run(world, entities, player, 1);
  assert.equal(beast.ai!.goal, AIGoal.GOTO, 'тварь бросила приказ на первом же кадре');

  const reachedAt = run(world, entities, player, 200, { e: beast, tx: 40.5, ty: 30.5 });
  assert.notEqual(reachedAt, -1, 'тварь под приказом не дошла до заказанной клетки');
  // Приказ КОНЕЧЕН: пришёл — погас, и тварь вернулась к своим делам.
  assert.notEqual(beast.ai!.goal, AIGoal.GOTO, 'приказ не погас по приходу');
});

test('приказ не отменяет бой: тварь под приказом отвечает на врага', () => {
  resetCombatStimulus();
  const world = openWorld();
  const player = makeTestPlayer({ id: 1, x: 3.5, y: 3.5 });
  const beast = monster(MonsterKind.BETONOED, 30.5, 30.5, 2);
  order(beast, 40.5, 30.5);
  const foe = makeTestNpc({ id: 3, x: 34.5, y: 30.5, faction: Faction.CITIZEN, hp: 200, maxHp: 200 });
  const entities = [player, beast, foe];

  run(world, entities, player, 20);
  assert.notEqual(beast.ai!.combatTargetId, undefined, 'тварь под приказом перестала видеть врага');
  assert.equal(beast.ai!.goal, AIGoal.HUNT, 'приказ подмял под себя бой');
});
