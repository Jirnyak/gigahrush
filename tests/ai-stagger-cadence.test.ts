/* Замки на четыре механизма боевого такта, чинившиеся вместе:
 *
 *  1. каданс сканирования — у флигового скана СВОЙ счётчик, а не чужой;
 *  2. стаггер от нокбэка доходит до ИГРОКА обоими каналами;
 *  3. оглушённый монстр не статуя: не бьёт, но видит, целится и идёт;
 *  4. орбита дышит непрерывно, а не одним кадром из сотни.
 *
 * Каждый случай красный на прежнем коде — это проверено вручную возвратом
 * снятых строк, и числа записаны в комментариях к самим проверкам.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity,
} from '../src/core/types';
import { World } from '../src/core/world';
import { initFactionRelations } from '../src/data/relations';
import { setCombatContext, tryFactionCombat, tryFleeFromMonster } from '../src/systems/ai/combat';
import { tryCombatOrbitStep } from '../src/systems/ai/combat_orbit';
import { setEntityMap, updateMonster } from '../src/systems/ai/monster';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState } from './helpers';

const OX = 500;
const OY = 500;
const FRAME = 1 / 60;

function openWorld(w = 40, h = 12): World {
  const world = new World();
  for (let y = OY - 1; y <= OY + h; y++) {
    for (let x = OX - 1; x <= OX + w; x++) world.set(x, y, Cell.FLOOR);
  }
  return world;
}

function citizen(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.NPC, x, y, angle: 0, pitch: 0, alive: true, speed: 3, sprite: 0,
    hp: 40, maxHp: 40, faction: Faction.CITIZEN, weapon: '',
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function beast(id: number, x: number, y: number, kind = MonsterKind.SBORKA): Entity {
  return {
    id, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true, speed: 2, sprite: 0,
    hp: 400, maxHp: 400, monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

/* ── 1. Каданс сканирования ───────────────────────────────────── */

test('флиговый скан не тратит счётчик боевого: поле у него не своё', () => {
  const world = openWorld();
  setCombatContext([], 0);
  const man = citizen(1, OX + 2.5, OY + 2.5);
  // Счётчик принадлежит `findCombatTarget`, который вычитает из него dt в том же
  // кадре и на том же акторе. Прежний код вычитал ВТОРОЙ раз: 1.0 → 0.98333.
  man.ai!.combatScanCd = 1.0;
  const entities = [man];
  rebuildEntityIndex(entities);

  tryFleeFromMonster(world, entities, man, FRAME, 0);

  assert.equal(man.ai!.combatScanCd, 1.0, 'вторая убыль чужого счётчика');
});

test('горожанин замечает тварь за стеной по СВОЕМУ кадансу, а не по чётности чужого', () => {
  initFactionRelations();
  const world = openWorld(40, 12);
  // Бетон между ними: боевой скан твари не видит (`hasClearLine`), и весь ответ
  // держится на флиговом скане — том самом, который прежде не срабатывал.
  for (let y = OY - 1; y <= OY + 12; y++) world.set(OX + 6, y, Cell.WALL);
  setCombatContext([], 0);
  setPathContext([], 0, false);

  // id 8 выбран замером: при двойной убыли боевой счётчик перехватывал ноль
  // первым КАЖДЫЙ раз, и за десять минут флиговый скан не срабатывал ни разу.
  const man = citizen(8, OX + 2.5, OY + 2.5);
  const monster = beast(9, OX + 11.5, OY + 2.5);
  const entities = [man, monster];
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));

  let noticedAt = -1;
  for (let frame = 0; frame < 300; frame++) {
    const time = frame * FRAME;
    setCombatContext([], time);
    setPathContext([], time, false);
    if (!tryFactionCombat(world, entities, man, FRAME, time, [], { v: 100 })) {
      tryFleeFromMonster(world, entities, man, FRAME, time);
    }
    if (man.ai!.goal === AIGoal.FLEE) { noticedAt = frame; break; }
  }

  assert.ok(noticedAt >= 0, 'горожанин не заметил тварь за пять секунд');
  // Объявленный каданс — 1.5 с; первый взгляд разведён по акторам, дальше строго.
  assert.ok(noticedAt * FRAME <= 1.6, `заметил только через ${(noticedAt * FRAME).toFixed(2)} с`);
});

/* ── 2. Стаггер от нокбэка ────────────────────────────────────── */

test('кувалда сбивает удар и ИГРОКУ: обе записи, и они переживают зеркало кадра', () => {
  initFactionRelations();
  const world = openWorld();
  const state = makeGameState({ currentZ: 0 });
  setCombatContext([], 0);
  setPathContext([], 0, false);

  const player: Entity = {
    id: 1, type: EntityType.NPC, persistentNpcId: 'player', name: 'Вы',
    x: OX + 3.5, y: OY + 2.5, angle: 0, pitch: 0, alive: true, speed: 4, sprite: 0,
    hp: 100, maxHp: 100, faction: Faction.PLAYER, attackCd: 0, inventory: [],
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
  setCurrentPlayerEntity(player);
  const thug = citizen(2, OX + 2.5, OY + 2.5);
  thug.faction = Faction.WILD;      // дикие враждебны стороне игрока
  thug.weapon = 'sledgehammer';     // knockback 0.65 — самый тяжёлый в игре
  thug.attackCd = 0;
  const entities = [player, thug];
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));

  let hits = 0;
  for (let frame = 0; frame < 240 && hits === 0; frame++) {
    const time = frame * FRAME;
    setCombatContext([], time);
    setPathContext([], time, false);
    const hpBefore = player.hp ?? 0;
    tryFactionCombat(world, entities, thug, FRAME, time, [], { v: 100 }, state);
    if ((player.hp ?? 0) < hpBefore) hits++;
  }

  assert.equal(hits, 1, 'удар по игроку не состоялся — сцена собрана неверно');
  // Канон живёт на уровне сущности; прежде писалось только зеркало `ai`.
  assert.ok((player.staggerTimer ?? 0) > 0, 'боль не дошла до канонического поля');
  // Второй канал прежде пропускал игрока явным `!isPlayerEntity`.
  assert.ok((player.attackCd ?? 0) > 0, 'откат атаки игроку не поднят');

  // Зеркало кадра (`movePlayer`): ai ← сущность. Прежде оно стирало запись.
  const staggerBefore = player.ai!.staggerTimer ?? 0;
  player.ai!.staggerTimer = player.staggerTimer ?? 0;
  assert.ok(player.ai!.staggerTimer > 0, 'запись прожила ровно один кадр');
  assert.equal(player.ai!.staggerTimer, staggerBefore, 'зеркало и канон разошлись');
  setCurrentPlayerEntity(undefined);
});

/* ── 3. Оглушённый монстр ─────────────────────────────────────── */

test('оглушённый монстр не статуя: бить не может, идти и целиться — обязан', () => {
  initFactionRelations();
  const world = openWorld(40, 12);
  const state = makeGameState({ currentZ: -26 });
  const msgs: Msgs = [];
  setCombatContext(msgs, 0);
  setPathContext(msgs, 0, false);

  const armor = beast(31, OX + 12.5, OY + 2.5, MonsterKind.ZAKALENNAYA_ARMATURA);
  armor.speed = 0.65;
  const prey = citizen(2, OX + 2.5, OY + 2.5);
  const entities = [armor, prey];
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));

  // Дробь по элите даёт до секунды боли, а два попадания с интервалом в секунду
  // держали её замороженной насмерть: `updateMonster` выходил `return` на каждом
  // кадре стаггера. Здесь боль заведомо длиннее окна замера, чтобы ни один кадр
  // не достался «здоровому» пути.
  armor.ai!.staggerTimer = 2.0;
  const startD = Math.sqrt(world.dist2(armor.x, armor.y, prey.x, prey.y));
  let couldAttack = false;
  for (let frame = 0; frame < 60; frame++) {
    const time = frame * FRAME;
    setCombatContext(msgs, time);
    setPathContext(msgs, time, false);
    updateMonster(world, entities, armor, FRAME, time, msgs, 999, { v: 200 }, state);
    if ((armor.ai!.staggerTimer ?? 0) > 0 && (armor.attackCd ?? 0) <= 0) couldAttack = true;
  }
  const closed = startD - Math.sqrt(world.dist2(armor.x, armor.y, prey.x, prey.y));

  assert.equal(couldAttack, false, 'боль обязана держать откат атаки');
  assert.ok((armor.ai!.staggerTimer ?? 0) > 0, 'окно замера должно целиком лежать в боли');
  // Секунда хода со скоростью 0.65 клетки в секунду. Прежде — ровно ноль.
  assert.ok(closed > 0.3, `оглушённая тварь прошла к цели ${closed.toFixed(3)} клетки`);
  assert.equal(armor.ai!.combatTargetId, prey.id, 'боль стёрла боевую цель');
});

/* ── 4. Дыхание орбиты ────────────────────────────────────────── */

test('орбита дышит непрерывно: полоса радиуса ходит, а не стоит', () => {
  const world = openWorld(40, 24);
  const shooter = citizen(5, OX + 8.5, OY + 5.5);
  const mark = citizen(6, OX + 5.5, OY + 5.5);
  mark.speed = 0;

  let min = Infinity;
  let max = -Infinity;
  for (let frame = 0; frame < 300; frame++) {
    tryCombatOrbitStep(world, shooter, mark, 3, 2, FRAME);
    const d = Math.sqrt(world.dist2(shooter.x, shooter.y, mark.x, mark.y));
    if (frame < 30) continue; // дать шагу выйти на полосу
    min = Math.min(min, d);
    max = Math.max(max, d);
  }

  // Прежний однокадровый бросок оставлял радиус ровно на идеале: размах < 0.05.
  assert.ok(max - min > 0.5, `полоса не дышит: размах ${(max - min).toFixed(3)} клетки`);
  // И дышит В ПОЛОСЕ, а не улетает: амплитуда ограничена `PULSE_DELTA_MAX`.
  assert.ok(max - min < 4, `размах ${(max - min).toFixed(3)} вышел за объявленную полосу`);
});

type Msgs = Parameters<typeof setCombatContext>[0];
