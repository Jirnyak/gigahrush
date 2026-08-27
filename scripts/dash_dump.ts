#!/usr/bin/env tsx
/* Дамп семьи рывков: пять видов, одинаковые сцены, побайтовая сверка до/после.
 *
 * Поштучная сверка «глазами» ловит только то, на что смотришь. Здесь каждый вид
 * прогоняется по одному набору геометрий (открытая прямая, стена в лоб, стол на
 * пути, узкий косяк, тор через шов), и печатается ровно то, чем рывок кончился:
 * куда встал, сколько снял, сколько потерял сам, что сказал в лог.
 *
 * Запуск: npx tsx scripts/dash_dump.ts > /tmp/dash_before.txt
 */
import '../src/content';
import {
  AIGoal, Cell, EntityType, Feature, MonsterKind, RoomType, type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { seedGlobalRng } from '../src/core/rand';
import { setEntityMap, updateMonster, setTonkayaLine } from '../src/systems/ai/monster';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { createWorldEventState } from '../src/systems/events';
import { setListenerPos } from '../src/systems/audio';
import { createArenaGameState } from '../src/arena_scenarios';

const ROOM_Y = 40;
const ROOM_W = 30;
const ROOM_H = 16;

/** Комната-полигон вокруг `ox`. `walls` — бетон, `cover` — мебель. */
function scene(
  ox: number,
  walls: readonly (readonly [number, number])[],
  cover: readonly (readonly [number, number])[],
): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  const x0 = ox - 8;
  for (let y = ROOM_Y; y < ROOM_Y + ROOM_H; y++) {
    for (let x = x0; x < x0 + ROOM_W; x++) {
      world.cells[world.idx(world.wrap(x), y)] = Cell.FLOOR;
      world.roomMap[world.idx(world.wrap(x), y)] = 1;
    }
  }
  world.rooms.push({
    id: 1, type: RoomType.STORAGE, x: world.wrap(x0), y: ROOM_Y, w: ROOM_W, h: ROOM_H,
    cx: world.wrap(x0 + ROOM_W / 2), cy: ROOM_Y + ROOM_H / 2, doors: [], name: 'полигон',
  } as never);
  for (const [dx, dy] of walls) world.cells[world.idx(world.wrap(ox + dx), ROOM_Y + dy)] = Cell.WALL;
  for (const [dx, dy] of cover) world.features[world.idx(world.wrap(ox + dx), ROOM_Y + dy)] = Feature.TABLE;
  world.cellVersion++;
  bakeNavigationTree(world);
  return world;
}

function victim(x: number, y: number): Entity {
  return {
    id: 1, type: EntityType.NPC, persistentNpcId: 'dummy',
    x, y, angle: 0, pitch: 0, alive: true, speed: 3, sprite: 0,
    hp: 900, maxHp: 900, name: 'Мишень',
    ai: { goal: AIGoal.IDLE, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function monster(kind: MonsterKind, x: number, y: number, extra: Partial<Entity['ai']> = {}): Entity {
  const def = MONSTERS[kind];
  return {
    id: 7, type: EntityType.MONSTER,
    x, y, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0, currentMag: 1,
    ai: {
      goal: AIGoal.HUNT, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0,
      ...extra,
    },
  } as Entity;
}

const f = (v: number | undefined): string => (v === undefined ? '-' : v.toFixed(4));

interface Case {
  name: string;
  /** Стены и мебель заданы СМЕЩЕНИЕМ от клетки твари. */
  walls: readonly (readonly [number, number])[];
  cover: readonly (readonly [number, number])[];
  /** Смещение цели от твари. */
  dx: number;
  dy: number;
  /** Клетка твари по X. По умолчанию середина карты, у шва — ноль. */
  ox?: number;
}

/** Одинаковый набор геометрий на все пять видов. */
const CASES: readonly Case[] = [
  { name: 'открытая прямая     ', walls: [], cover: [], dx: 5, dy: 0 },
  { name: 'открытая диагональ  ', walls: [], cover: [], dx: 3.5, dy: 3.5 },
  { name: 'стена в лоб         ', walls: [[3, 8], [3, 7], [3, 9]], cover: [], dx: 5, dy: 0 },
  { name: 'стол на пути        ', walls: [], cover: [[3, 8]], dx: 5, dy: 0 },
  { name: 'узкий косяк         ', walls: [[3, 7], [3, 9]], cover: [], dx: 5, dy: 0 },
  { name: 'вплотную            ', walls: [], cover: [], dx: 1.2, dy: 0 },
  { name: 'рывок назад         ', walls: [], cover: [], dx: -5, dy: 0 },
  { name: 'через шов тора      ', walls: [], cover: [], dx: 5, dy: 0, ox: 1 },
  { name: 'стена на шве тора   ', walls: [[3, 8], [3, 7], [3, 9]], cover: [], dx: 5, dy: 0, ox: 1 },
];

interface Drive {
  ticks: number;
  dt: number;
  /** Довести вид до самого рывка ОБЩИМ путём: полей состояния дамп не знает. */
  prime?: (world: World, threat: Entity, target: Entity, step: (dt: number) => void) => void;
}

function runCase(label: string, kind: MonsterKind, c: Case, drive: Drive): void {
  seedGlobalRng(20260827);
  const ox = c.ox ?? 512;
  const world = scene(ox, c.walls, c.cover);
  setListenerPos(512, 512, world.dist2.bind(world));
  const mx = ox + 0.5;
  const my = ROOM_Y + 8.5;
  const threat = monster(kind, world.wrap(mx), my);
  const target = victim(world.wrap(mx + c.dx), my + c.dy);
  const entities = [target, threat];
  const state = createArenaGameState();
  state.currentZ = -14;
  state.worldEvents = createWorldEventState();
  const msgs: Msg[] = [];
  let time = 1;
  const step = (dt: number): void => {
    rebuildEntityIndex(entities);
    setEntityMap(new Map(entities.map(e => [e.id, e])));
    state.time = time;
    updateMonster(world, entities, threat, dt, time, msgs, target.id, { v: 900 }, state);
    time += dt;
  };
  drive.prime?.(world, threat, target, step);
  for (let i = 0; i < drive.ticks; i++) step(drive.dt);
  const texts = msgs.map(m => m.text.replace(/-?\d+/g, '#')).join(' | ');
  console.log([
    label, c.name,
    `pos=${f(threat.x)},${f(threat.y)}`,
    `mhp=${f(threat.hp)}/${f(threat.maxHp)}`,
    `thp=${f(target.hp)}`,
    `stag=${f(threat.ai?.staggerTimer)}`,
    `cd=${f(threat.attackCd)}`,
    `msgs=${texts}`,
  ].join('  '));
}

/* Ржавник просыпается только вплотную: будим его штатным подходом и уводим
 * мишень на дистанцию сцены ДО того, как замах истечёт. Ни одного поля руками. */
const RZHAVNIK_DRIVE: Drive = {
  ticks: 6, dt: 0.1,
  prime: (world, threat, target, step) => {
    // Спящая стопка — стартовое состояние от генератора, а не поле рывка.
    threat.ai!.scrapWake = 0;
    const [tx, ty] = [target.x, target.y];
    target.x = world.wrap(threat.x + 1.4);
    target.y = threat.y;
    step(0.05);
    target.x = tx;
    target.y = ty;
  },
};

/* Тонкая Тень бросается только с готовой линии: линия — публичная запись
 * `ai.baitLine`, её и ставим на клетку самой тени вдоль оси к мишени. */
const TONKAYA_DRIVE: Drive = {
  ticks: 4, dt: 0.1,
  prime: (world, threat, target) => {
    const dx = Math.abs(world.delta(threat.x, target.x)) >= Math.abs(world.delta(threat.y, target.y)) ? 1 : 0;
    setTonkayaLine(threat, {
      x: Math.floor(threat.x), y: Math.floor(threat.y),
      dx, dy: dx === 1 ? 0 : 1, nerve: 5.6, armed: true, spent: false,
    });
    threat.ai!.combatTargetId = target.id;
  },
};

for (const c of CASES) runCase('РЖАВНИК', MonsterKind.RZHAVNIK, c, RZHAVNIK_DRIVE);
for (const c of CASES) runCase('ЖОРНАЯ', MonsterKind.ZHORNAYA_TVAR, c, { ticks: 14, dt: 0.1 });
// Разгоняющиеся идут кадром живой игры: на нём подшаг ровно один, и дамп
// сравнивает развязку, а не число подшагов.
for (const c of CASES) runCase('ТРЕСКОТНИК', MonsterKind.TRESKOTNIK, c, { ticks: 90, dt: 1 / 60 });
for (const c of CASES) runCase('ДИКИЙ', MonsterKind.DIKIY_MERTVYAK, c, { ticks: 90, dt: 1 / 60 });
for (const c of CASES) runCase('ТОНКАЯ', MonsterKind.TONKAYA_TEN, c, TONKAYA_DRIVE);
