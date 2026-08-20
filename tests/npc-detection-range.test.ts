/*
 * ИЗМЕРИТЕЛЬ, а не замок.
 *
 * Синтетическая пустая комната, два враждебных NPC (LIQUIDATOR vs WILD по
 * матрице src/data/relations.ts), прямая видимость, никаких стен между.
 * Крутим настоящий боевой AI (updateAI) фиксированным dt и меряем, за сколько
 * секунд модельного времени кто-нибудь назначит другого целью (ai.combatTargetId).
 *
 * Цифры печатаются в console.log. Ассерты — только на то, что замер вообще
 * состоялся: конкретные секунды порогом делать нельзя, они станут ложным замком.
 *
 * Позиции актёров ПРИБИТЫ: после каждого шага AI координаты возвращаются на
 * место. Одного speed = 0 не хватает — NPC всё равно уходит с места (замерено:
 * за 6с уезжает на 7+ клеток), и «обнаружение на 20 клетках» превратилось бы в
 * «дошёл пешком до 8». Прибивание делает D настоящей независимой переменной.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, Occupation,
  type Entity, type GameClock,
} from '../src/core/types';
import { World } from '../src/core/world';
import { updateAI } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { initFactionRelations } from '../src/data/relations';
import { resetCombatStimulus } from '../src/systems/combat_stimulus';
import { seedGlobalRng } from '../src/core/rand';
import { getPlotNpcCount } from '../src/data/npc_packages';
import { makeGameState } from './helpers';

/* ── Сцена ────────────────────────────────────────────────────── */

// 32x32 вместо ровных 24x24: нужно уместить и D = 20, и кольцо толпы
// радиусом 6 вокруг наблюдателя, не выпихивая посторонних в стену.
const ROOM_X0 = 100;
const ROOM_Y0 = 100;
const ROOM_SIZE = 32;
const OBS_X = ROOM_X0 + 6.5;
const OBS_Y = ROOM_Y0 + 15.5;

// Игрока в сцене нет: playerId заведомо отсутствует в списке сущностей.
// Иначе tryFactionCombat поднял бы дальность WILD-наблюдателя до NPC_CHASE_RANGE
// (он враждебен игроку всегда, независимо от расстояния), и таблица мерила бы
// не дистанцию замечания, а перекос «враждебен игроку / не враждебен».
const ABSENT_PLAYER_ID = -1;
const DT = 1 / 60;
const TIME_LIMIT_SEC = 30;
const BASE_ID = getPlotNpcCount() + 1000;

type Loadout = 'unarmed' | 'knife' | 'makarov';

function openRoom(): World {
  const world = new World();
  for (let y = ROOM_Y0; y < ROOM_Y0 + ROOM_SIZE; y++) {
    for (let x = ROOM_X0; x < ROOM_X0 + ROOM_SIZE; x++) world.set(x, y, Cell.FLOOR);
  }
  return world;
}

function aiState() {
  return { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [] as number[], pi: 0, stuck: 0, timer: 10 };
}

function inventoryFor(loadout: Loadout) {
  if (loadout === 'unarmed') return [];
  return loadout === 'makarov'
    ? [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 60 }]
    : [{ defId: 'knife', count: 1 }];
}

function actor(id: number, x: number, y: number, faction: Faction, loadout: Loadout, frozen = true): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: frozen ? 0 : 1,
    sprite: 0,
    hp: 60,
    maxHp: 60,
    faction,
    // Безоружный вариант — это обычный житель целиком: и профессия мирная,
    // и оружия нет. Именно так выглядит рядовое население этажа.
    occupation: loadout === 'unarmed' ? Occupation.COOK : Occupation.HUNTER,
    weapon: loadout === 'unarmed' ? '' : loadout,
    currentMag: 8,
    inventory: inventoryFor(loadout),
    ai: aiState(),
  } as unknown as Entity;
}

/** Нейтральная массовка — деталь эксперимента «перегрузка выборки». */
function bystander(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    hp: 40,
    maxHp: 40,
    faction: Faction.CITIZEN,
    occupation: Occupation.COOK,
    weapon: '',
    inventory: [],
    ai: aiState(),
  } as unknown as Entity;
}

/** Детерминированное кольцо вокруг наблюдателя, без единого броска кубика. */
function ringPositions(count: number, radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt((i + 0.7) / count);
    const a = i * golden;
    out.push({ x: OBS_X + Math.cos(a) * r, y: OBS_Y + Math.sin(a) * r });
  }
  return out;
}

/**
 * Прибивает актёров на месте: только так дистанция остаётся независимой переменной.
 * Ключ — сама сущность, а не индекс: список во время боя растёт снарядами.
 */
function homeOf(entities: readonly Entity[]): Map<Entity, { x: number; y: number }> {
  return new Map(entities.map(e => [e, { x: e.x, y: e.y }]));
}

function pinPositions(home: ReadonlyMap<Entity, { x: number; y: number }>): void {
  for (const [e, at] of home) {
    e.x = at.x;
    e.y = at.y;
  }
}

interface RunResult {
  seconds: number | null;
  who: string;
  distAtLock: number;
}

/** Крутит AI до захвата цели или до лимита. Возвращает секунды модельного времени. */
function runUntilLock(world: World, entities: Entity[], a: Entity, b: Entity, limitSec = TIME_LIMIT_SEC): RunResult {
  const clock: GameClock = { hour: 12, minute: 0, totalMinutes: 720 };
  const state = makeGameState({ time: 0, clock, currentZ: 0 });
  const nextId = { v: BASE_ID + 100000 };
  const home = homeOf(entities);
  const steps = Math.round(limitSec / DT);
  for (let i = 0; i < steps; i++) {
    const time = i * DT;
    state.time = time;
    rebuildEntityIndexForSimulation(entities, Math.floor(time * 1000));
    updateAI(world, entities, DT, time, state.msgs, ABSENT_PLAYER_ID, clock, false, nextId, 0, state);
    pinPositions(home);
    if (state.msgs.length > 64) state.msgs.length = 0;
    const aLock = a.ai?.combatTargetId === b.id;
    const bLock = b.ai?.combatTargetId === a.id;
    if (aLock || bLock) {
      return {
        seconds: time + DT,
        who: aLock && bLock ? 'оба' : aLock ? 'ликвидатор' : 'дикий',
        distAtLock: Math.sqrt(world.dist2(a.x, a.y, b.x, b.y)),
      };
    }
  }
  return { seconds: null, who: '—', distAtLock: Math.sqrt(world.dist2(a.x, a.y, b.x, b.y)) };
}

function prepare(seed: number): void {
  seedGlobalRng(seed);
  resetCombatStimulus();
  initFactionRelations();
}

function fmt(r: RunResult): string {
  return r.seconds === null ? `не заметил за ${TIME_LIMIT_SEC}с` : `${r.seconds.toFixed(2)}с (${r.who})`;
}

/* ── ЗАМЕР 1: дистанция ───────────────────────────────────────── */

const DISTANCES = [2, 4, 6, 8, 10, 14, 20];

function measureDistance(d: number, loadout: Loadout): RunResult {
  prepare(0xC0FFEE);
  const world = openRoom();
  const liq = actor(BASE_ID + 1, OBS_X, OBS_Y, Faction.LIQUIDATOR, loadout);
  const wild = actor(BASE_ID + 2, OBS_X + d, OBS_Y, Faction.WILD, loadout);
  return runUntilLock(world, [liq, wild], liq, wild);
}

test('ЗАМЕР 1: за сколько секунд враждебные NPC замечают друг друга на дистанции D', () => {
  const rows: Array<[number, RunResult, RunResult, RunResult]> = [];
  for (const d of DISTANCES) {
    rows.push([d, measureDistance(d, 'unarmed'), measureDistance(d, 'knife'), measureDistance(d, 'makarov')]);
  }

  console.log('\n=== ЗАМЕР 1. Дистанция обнаружения (LIQUIDATOR vs WILD, прямая видимость, оба прибиты на месте) ===');
  console.log('D, клеток | безоружный житель          | нож (ближний бой)          | макаров (дальнобой)');
  console.log('----------+----------------------------+----------------------------+----------------------------');
  for (const [d, bare, knife, gun] of rows) {
    console.log(`${String(d).padStart(9)} | ${fmt(bare).padEnd(26)} | ${fmt(knife).padEnd(26)} | ${fmt(gun)}`);
  }

  assert.equal(rows.length, DISTANCES.length);
  assert.equal(rows.some(([, , knife, gun]) => knife.seconds !== null || gun.seconds !== null), true);
});

/* ── ЗАМЕР 1б: влияние присутствия игрока на дальность ────────── */

test('ЗАМЕР 1б: тот же опыт, но в сцене есть живой игрок (далеко, в углу комнаты)', () => {
  const rows: Array<[number, RunResult]> = [];
  for (const d of DISTANCES) {
    prepare(0xC0FFEE);
    const world = openRoom();
    const liq = actor(BASE_ID + 1, OBS_X, OBS_Y, Faction.LIQUIDATOR, 'knife');
    const wild = actor(BASE_ID + 2, OBS_X + d, OBS_Y, Faction.WILD, 'knife');
    // persistentNpcId === 'player' — единственный признак, по которому
    // isPlayerEntity() узнаёт тело игрока без setCurrentPlayerEntity().
    const player = actor(BASE_ID + 3, ROOM_X0 + 30.5, ROOM_Y0 + 30.5, Faction.PLAYER, 'knife');
    (player as { persistentNpcId?: string }).persistentNpcId = 'player';
    delete (player as { ai?: unknown }).ai;
    const entities = [player, liq, wild];
    const clock: GameClock = { hour: 12, minute: 0, totalMinutes: 720 };
    const state = makeGameState({ time: 0, clock, currentZ: 0 });
    const nextId = { v: BASE_ID + 100000 };
    let res: RunResult = { seconds: null, who: '—', distAtLock: d };
    const home = homeOf(entities);
    const steps = Math.round(TIME_LIMIT_SEC / DT);
    for (let i = 0; i < steps; i++) {
      const time = i * DT;
      rebuildEntityIndexForSimulation(entities, Math.floor(time * 1000));
      updateAI(world, entities, DT, time, state.msgs, player.id, clock, false, nextId, 0, state);
      pinPositions(home);
      if (state.msgs.length > 64) state.msgs.length = 0;
      const aLock = liq.ai?.combatTargetId === wild.id;
      const bLock = wild.ai?.combatTargetId === liq.id;
      if (aLock || bLock) {
        res = { seconds: time + DT, who: aLock && bLock ? 'оба' : aLock ? 'ликвидатор' : 'дикий', distAtLock: d };
        break;
      }
    }
    rows.push([d, res]);
  }

  console.log('\n=== ЗАМЕР 1б. То же самое с ножами, но в сцене есть игрок (нужен для сравнения с ЗАМЕРОМ 1) ===');
  console.log('D, клеток | нож, игрок в сцене');
  console.log('----------+----------------------------');
  for (const [d, r] of rows) console.log(`${String(d).padStart(9)} | ${fmt(r)}`);

  assert.equal(rows.length, DISTANCES.length);
});

/* ── ЗАМЕР 2: перегрузка выборки толпой ───────────────────────── */

const CROWDS = [0, 10, 30, 60];

function measureCrowd(crowd: number, d: number, loadout: Loadout): RunResult {
  prepare(0xBEEF);
  const world = openRoom();
  const liq = actor(BASE_ID + 1, OBS_X, OBS_Y, Faction.LIQUIDATOR, loadout);
  const wild = actor(BASE_ID + 2, OBS_X + d, OBS_Y, Faction.WILD, loadout);
  const entities: Entity[] = [liq, wild];
  const spots = ringPositions(crowd, 6);
  for (let i = 0; i < spots.length; i++) entities.push(bystander(BASE_ID + 10 + i, spots[i].x, spots[i].y));
  return runUntilLock(world, entities, liq, wild);
}

test('ЗАМЕР 2: мешает ли толпа нейтралов заметить врага', () => {
  const far: Array<[number, RunResult]> = [];
  const near: Array<[number, RunResult]> = [];
  for (const c of CROWDS) {
    far.push([c, measureCrowd(c, 10, 'makarov')]);
    near.push([c, measureCrowd(c, 6, 'knife')]);
  }

  console.log('\n=== ЗАМЕР 2. Толпа нейтралов (CITIZEN) в радиусе 6 клеток вокруг ликвидатора ===');
  console.log('посторонних | D=10, макаров              | D=6, нож');
  console.log('------------+----------------------------+----------------------------');
  for (let i = 0; i < CROWDS.length; i++) {
    console.log(`${String(CROWDS[i]).padStart(11)} | ${fmt(far[i][1]).padEnd(26)} | ${fmt(near[i][1])}`);
  }

  assert.equal(far.length, CROWDS.length);
  assert.equal(near.length, CROWDS.length);
});

/* ── ЗАМЕР 3: смена фракции на лету ───────────────────────────── */

interface SwitchResult {
  seconds: number | null;
  peaceSec: number;
}

function measureFactionSwitch(clearCached: boolean): SwitchResult {
  prepare(0xFACE);
  const world = openRoom();
  const peaceSec = 2;
  // Макаров: дальность обнаружения 15 клеток, чтобы D = 8 заведомо был в
  // пределах видимости и опыт мерил именно реакцию на смену фракции,
  // а не упирался в порог дальности ближнего боя (ровно 8, строгое «меньше»).
  const a = actor(BASE_ID + 1, OBS_X, OBS_Y, Faction.LIQUIDATOR, 'makarov');
  const b = actor(BASE_ID + 2, OBS_X + 8, OBS_Y, Faction.LIQUIDATOR, 'makarov');
  const entities = [a, b];
  const clock: GameClock = { hour: 12, minute: 0, totalMinutes: 720 };
  const state = makeGameState({ time: 0, clock, currentZ: 0 });
  const nextId = { v: BASE_ID + 100000 };

  const home = homeOf(entities);
  const peaceSteps = Math.round(peaceSec / DT);
  for (let i = 0; i < peaceSteps; i++) {
    const time = i * DT;
    rebuildEntityIndexForSimulation(entities, Math.floor(time * 1000));
    updateAI(world, entities, DT, time, state.msgs, ABSENT_PLAYER_ID, clock, false, nextId, 0, state);
    pinPositions(home);
    if (state.msgs.length > 64) state.msgs.length = 0;
  }

  b.faction = Faction.WILD;
  if (clearCached) {
    b.ai!.combatTargetId = undefined;
    b.ai!.combatScanCd = 0;
  }

  const steps = Math.round(TIME_LIMIT_SEC / DT);
  for (let i = 0; i < steps; i++) {
    const time = peaceSec + i * DT;
    rebuildEntityIndexForSimulation(entities, Math.floor(time * 1000));
    updateAI(world, entities, DT, time, state.msgs, ABSENT_PLAYER_ID, clock, false, nextId, 0, state);
    pinPositions(home);
    if (state.msgs.length > 64) state.msgs.length = 0;
    if (a.ai?.combatTargetId === b.id || b.ai?.combatTargetId === a.id) {
      return { seconds: i * DT + DT, peaceSec };
    }
  }
  return { seconds: null, peaceSec };
}

test('ЗАМЕР 3: за сколько секунд замечают соседа, сменившего фракцию на лету', () => {
  const plain = measureFactionSwitch(false);
  const reset = measureFactionSwitch(true);

  console.log('\n=== ЗАМЕР 3. Два ликвидатора на D = 8, через 2с мирной жизни один становится WILD ===');
  console.log('вариант                                   | время до захвата цели');
  console.log('------------------------------------------+----------------------------');
  console.log(`только entity.faction = WILD              | ${plain.seconds === null ? `не заметили за ${TIME_LIMIT_SEC}с` : `${plain.seconds.toFixed(2)}с`}`);
  console.log(`+ combatTargetId = undefined, scanCd = 0   | ${reset.seconds === null ? `не заметили за ${TIME_LIMIT_SEC}с` : `${reset.seconds.toFixed(2)}с`}`);

  assert.equal(plain.peaceSec, 2);
  assert.equal(reset.peaceSec, 2);
});
