/* Замки: приказ «иди в точку» переживает бой.
 *
 * Приказ живёт в своей записи (`ai.orderX/orderY`, `src/core/types.ts`), а не в
 * курсе `ai.goal`: курс переписывает первая же драка, и сцена или караван молча
 * теряли актора навсегда. Заперты три места:
 *
 *  1. Приказ возобновляется после боя — у человека и у твари, одним и тем же
 *     исполнителем `tickGotoOrder`.
 *  2. Рутинный видовой такт твари уступает приказу, а битая тварь — нет.
 *  3. Приказ, забравший такт твари, не оставляет за собой мёртвую боевую цель:
 *     иначе счётчик `activeAttackers` числит марширующего дерущимся.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity, type GameClock } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { updateAI } from '../src/systems/ai';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { damageActor, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { trySetMicroGoal } from '../src/systems/ai/micro_goals';
import { actorUnderOrder, clearActorOrder, setActorOrder } from '../src/systems/ai/goto_order';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const CLOCK: GameClock = { hour: 8, minute: 0, totalMinutes: 8 * 60 };
const DT = 0.1;

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = 1; y < 60; y++) {
    for (let x = 1; x < 60; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
  // Клетка игрока — на другом конце тора: иначе тварь держит целью ЕГО, и замер
  // превращается в замер дальности обнаружения.
  world.cells[world.idx(500, 500)] = Cell.FLOOR;
  world.cellVersion++;
  bakeNavigationTree(world);
  return world;
}

function monster(kind: MonsterKind, x: number, y: number, id: number): Entity {
  const def = MONSTERS[kind];
  return {
    id, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: 0, hp: def.hp, maxHp: def.hp, name: def.name,
    monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

/** Приказ ставится СЫРЬЁМ, ровно как в `aimAtSpot` (`systems/cinematics.ts`):
 *  запись заводит усыновление в цикле AI, а не вызывающий. */
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

interface Scene {
  world: World;
  entities: Entity[];
  state: ReturnType<typeof makeGameState>;
  player: Entity;
}

function scene(): Scene {
  resetCombatStimulus();
  const world = openWorld();
  const player = makeTestPlayer({ id: 1, x: 500.5, y: 500.5 });
  return {
    world,
    entities: [player],
    state: makeGameState({ time: 4, clock: CLOCK, currentZ: -26 }),
    player,
  };
}

/** Кадр, на котором `watched` ВПЕРВЫЕ встал в клетку цели, или -1. Смотреть на
 *  позицию в конце нельзя: приказ конечен, дошедший уходит по своим делам. */
function run(s: Scene, frames: number, watched: Entity, tx: number, ty: number,
  hook?: (f: number) => void): number {
  let reachedAt = -1;
  for (let f = 0; f < frames; f++) {
    hook?.(f);
    s.state.time += DT;
    rebuildEntityIndexForSimulation(s.entities, f + 1);
    updateAI(s.world, s.entities, DT, s.state.time, s.state.msgs, s.player.id, CLOCK,
      false, { v: 50_000 }, s.state.currentZ, s.state);
    if (reachedAt < 0
      && s.world.idx(Math.floor(watched.x), Math.floor(watched.y)) === s.world.idx(Math.floor(tx), Math.floor(ty))) {
      reachedAt = f;
    }
  }
  return reachedAt;
}

/* ── 1. Приказ переживает бой ─────────────────────────────────── */
test('человек доходит по приказу ПОСЛЕ драки по дороге', () => {
  const s = scene();
  const walker = makeTestNpc({ id: 2, x: 20.5, y: 30.5, speed: 2.4, hp: 400, maxHp: 400, faction: Faction.CITIZEN });
  walker.ai = { goal: AIGoal.WANDER, tx: 20.5, ty: 30.5, path: [], pi: 0, stuck: 0, timer: 0 };
  const foe = monster(MonsterKind.BETONOED, 24.5, 30.5, 3);
  foe.hp = 500; foe.maxHp = 500;
  s.entities.push(walker, foe);
  run(s, 1, walker, 45.5, 30.5);      // кадр прогрева: заводится намерение A-Life
  order(walker, 45.5, 30.5);

  const reachedAt = run(s, 500, walker, 45.5, 30.5, (f) => {
    if (f === 20) assert.notEqual(walker.ai!.goal, AIGoal.GOTO, 'сцена собрана неверно: драки не случилось');
    if (f === 200) { foe.alive = false; foe.hp = 0; }   // бой кончился
  });
  assert.notEqual(reachedAt, -1, 'человек не дошёл до заказанной клетки после боя');
  assert.ok(reachedAt > 200, 'дошёл ДО конца боя — сцена не про то');
});

test('тварь доходит по приказу ПОСЛЕ драки по дороге', () => {
  const s = scene();
  const beast = monster(MonsterKind.BETONOED, 20.5, 30.5, 2);
  const foe = makeTestNpc({ id: 3, x: 24.5, y: 30.5, speed: 0, hp: 4000, maxHp: 4000, faction: Faction.CITIZEN });
  s.entities.push(beast, foe);
  order(beast, 45.5, 30.5);

  const reachedAt = run(s, 500, beast, 45.5, 30.5, (f) => {
    if (f === 20) assert.equal(beast.ai!.goal, AIGoal.HUNT, 'сцена собрана неверно: драки не случилось');
    if (f === 200) { foe.alive = false; foe.hp = 0; }
  });
  assert.notEqual(reachedAt, -1, 'тварь не дошла до заказанной клетки после боя');
  assert.ok(reachedAt > 200, 'дошла ДО конца боя — сцена не про то');
});

/* ── 2. Рутинный видовой такт уступает приказу ─────────────────── */
test('рутинный видовой такт уступает приказу, а битая тварь — нет', () => {
  const s = scene();
  const slime = monster(MonsterKind.SLIMEVIK, 20.5, 30.5, 2);
  s.entities.push(slime);
  order(slime, 40.5, 30.5);
  const reachedAt = run(s, 500, slime, 40.5, 30.5);
  assert.notEqual(reachedAt, -1, 'видовой такт (блуждание и кормёжка) отнял у приказа все кадры');

  // Контроль: битую тварь приказ не отменяет — вид отвечает по-своему.
  const c = scene();
  const slime2 = monster(MonsterKind.SLIMEVIK, 20.5, 30.5, 2);
  slime2.hp = 500; slime2.maxHp = 500;
  const bully = makeTestNpc({ id: 3, x: 19.5, y: 30.5, speed: 0, hp: 4000, maxHp: 4000, faction: Faction.CITIZEN });
  c.entities.push(slime2, bully);
  order(slime2, 40.5, 30.5);
  const before = c.world.dist(slime2.x, slime2.y, bully.x, bully.y);
  run(c, 300, slime2, 40.5, 30.5, (f) => {
    if (f % 10 !== 0 || !slime2.alive) return;
    damageActor(c.world, c.state, slime2, { damage: 5, source: 'npc_melee', attacker: bully, time: c.state.time });
  });
  assert.ok(c.world.dist(slime2.x, slime2.y, bully.x, bully.y) > before + 3,
    'битая тварь под приказом перестала отвечать своим видовым тактом');
});

test('микроцель уступает приказу и у твари тоже', () => {
  const s = scene();
  const beast = monster(MonsterKind.BETONOED, 30.5, 30.5, 2);
  s.entities.push(beast);
  order(beast, 45.5, 30.5);
  // Микроцель тянет В ПРОТИВОПОЛОЖНУЮ сторону и держится дольше всего замера:
  // у человека такт микроцелей стоит НИЖЕ приказа и под ним не выполнялся
  // никогда, у твари — ВЫШЕ, и молча отнимал у приказа кадр.
  assert.equal(trySetMicroGoal(beast, 'reposition', { targetX: 12.5, targetY: 30.5, timer: 60 }), true,
    'сцена собрана неверно: микроцель не поставилась');

  const reachedAt = run(s, 400, beast, 45.5, 30.5);
  assert.notEqual(reachedAt, -1, 'микроцель увела тварь из-под приказа');
});

test('явный вход в канал: приказ ставится и отменяется', () => {
  const s = scene();
  const walker = makeTestNpc({ id: 2, x: 20.5, y: 30.5, speed: 2.4, faction: Faction.CITIZEN });
  walker.ai = { goal: AIGoal.WANDER, tx: 20.5, ty: 30.5, path: [], pi: 0, stuck: 0, timer: 0 };
  s.entities.push(walker);
  setActorOrder(walker, 45.5, 30.5);
  assert.equal(actorUnderOrder(walker), true, 'приказ не встал');

  run(s, 30, walker, 45.5, 30.5);
  assert.equal(walker.ai!.orderX, 45.5, 'приказ погас сам собой, а срока годности у него нет');

  // Отмена — единственный способ снять приказ снаружи.
  clearActorOrder(walker);
  assert.equal(actorUnderOrder(walker), false, 'отменённый приказ остался стоять');
  const reachedAt = run(s, 200, walker, 45.5, 30.5);
  assert.equal(reachedAt, -1, 'отменённый приказ всё равно довёл человека до клетки');
});

/* ── 3. Приказ не оставляет мёртвой боевой цели ────────────────── */
test('тварь, вернувшаяся к приказу, не числится активным атакующим', () => {
  const s = scene();
  /* Вид взят НЕ произвольно. Общий поиск цели (`findCombatTarget`) чистит свой
   * кэш сам, когда цель перестала годиться, — на бетоноеде дыру не увидеть.
   * Лишённый ходит на СВЕТ, и его ветка выбора цели (`findLishennyyLightTarget`)
   * боевой памяти не касается вовсе: остывшая цель лежит в ней, пока её не
   * снимет ветка `!target` — до которой приказ, забрав такт, не доходит. */
  const beast = monster(MonsterKind.LISHENNYY, 20.5, 30.5, 2);
  const foe = makeTestNpc({ id: 3, x: 50.5, y: 50.5, speed: 0, hp: 9000, maxHp: 9000, faction: Faction.CITIZEN });
  s.entities.push(beast, foe);
  order(beast, 45.5, 30.5);
  // Память о прошлом кадре боя: цель ЖИВА, но далеко, и откат атаки ещё горяч.
  beast.ai!.combatTargetId = foe.id;
  beast.attackCd = 2;

  let phantomFrames = 0;
  run(s, 60, beast, 45.5, 30.5, (f) => {
    if (f === 0) return;
    const ai = beast.ai!;
    // Повтор `isActiveAttacker` (`ai/index.ts`) на одной твари.
    if (ai.combatTargetId !== undefined && foe.alive
      && (((ai.windupTimer ?? 0) > 0) || ((beast.attackCd ?? 0) > 0))) phantomFrames++;
  });
  assert.equal(phantomFrames, 0, 'марширующая по приказу тварь числится дерущейся');
  assert.equal(beast.ai!.combatTargetId, undefined, 'ушедшая цель осталась в боевой памяти');
});
