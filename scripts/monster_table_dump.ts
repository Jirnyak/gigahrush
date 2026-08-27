#!/usr/bin/env tsx
/* Дамп таблиц вида, оставшихся в общем AI: стенная читаемость, ближняя
 * дальность, поле конторщика, хрупкий корпус Ржавника, захват Лампоглаза.
 *
 * Снимается ДО переноса чисел и текстов в дефы видов и сверяется построчно.
 * Читает только НАБЛЮДАЕМОЕ поведение (строки лога, теги событий, факт удара),
 * поэтому одинаково работает на обоих деревьях.
 *
 * Запуск: npx tsx scripts/monster_table_dump.ts
 */
import '../src/content';
import {
  Cell, Feature, MonsterKind, RoomType,
  type Entity, type GameState, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { HEAD_SLUG_DETACHED_STAGE, HEAD_SLUG_HOSTED_STAGE } from '../src/entities/head_slug';
import { getRecentEvents } from '../src/systems/events';
import { updateMonster, setEntityMap } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setListenerPos } from '../src/systems/audio';
import { benchMonster, benchPlayer, benchRpg, benchState } from './bench_actors';

const out: string[] = [];

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.roomMap.fill(0);
  world.zoneMap.fill(0);
  world.light.fill(0);
  world.zones[0] = { id: 0, cx: 12, cy: 12, faction: 0, hasLift: false, fogged: false, level: 1, hqRoomId: -1 };
  world.rooms[0] = {
    id: 0, type: RoomType.COMMON, x: 4, y: 4, w: 40, h: 40, doors: [], sealed: false,
    name: 'Зал', apartmentId: -1, wallTex: 0, floorTex: 0,
  };
  return world;
}

function mon(kind: MonsterKind, x: number, y: number, stage?: number): Entity {
  const e = benchMonster(kind, { id: 3, x, y, monsterStage: stage, rpg: benchRpg() });
  e.ai!.combatTargetId = 1;
  return e;
}

function runOnce(world: World, e: Entity, player: Entity, dt = 0.2, time = 5): { msgs: Msg[]; state: GameState } {
  const entities = [player, e];
  const state = benchState();
  state.time = time;
  const msgs: Msg[] = [];
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(x => [x.id, x])));
  setListenerPos(512, 512, world.dist2.bind(world));
  updateMonster(world, entities, e, dt, time, msgs, player.id, { v: 900 }, state);
  return { msgs, state };
}

/* ── 1. Упор от стены: тег и три реплики ─────────────────────── */
out.push('== упор от стены ==');
const WALL_KINDS = [MonsterKind.TVAR, MonsterKind.SHOVNIK, MonsterKind.REBAR, MonsterKind.BETONOED, MonsterKind.ZOMBIE];
for (const kind of WALL_KINDS) {
  for (const setup of ['кромка', 'кромка+мусор', 'открытый пол'] as const) {
    const world = openWorld();
    if (setup !== 'открытый пол') {
      for (let y = 8; y <= 14; y++) world.cells[world.idx(9, y)] = Cell.WALL;
    }
    if (setup === 'кромка+мусор') {
      world.features[world.idx(11, 11)] = Feature.SHELF;
      world.features[world.idx(11, 9)] = Feature.MACHINE;
    }
    const e = mon(kind, 10.5, 10.5);
    if (setup === 'открытый пол') e.ai!.wallBiasWasActive = true;
    const player = benchPlayer({ id: 1, x: 12.5, y: 10.5, hp: 100, maxHp: 100 });
    const { msgs, state } = runOnce(world, e, player);
    const ev = getRecentEvents(state, { limit: 8 }).filter(v => v.type === 'monster_sighted' || v.type === 'monster_windup_interrupted');
    const tags = ev.map(v => (v.tags ?? []).join('+')).join(' / ');
    out.push(`${MONSTERS[kind].name.padEnd(14)} ${setup.padEnd(14)} лог=${msgs.map(m => m.text).join(' | ') || '—'} теги=${tags || '—'}`);
  }
}

/* ── 2. Ближняя дальность: с какого расстояния удар доходит ──── */
out.push('== ближняя дальность ==');
const REACH_KINDS = [
  MonsterKind.TVAR, MonsterKind.POLZUN, MonsterKind.SLIME_WOMAN, MonsterKind.OLGOY,
  MonsterKind.PANELNIK, MonsterKind.BLACK_LIQUIDATOR, MonsterKind.SWARM,
  MonsterKind.HEAD_SLUG, MonsterKind.ZOMBIE, MonsterKind.SBORKA,
];
function hitsAt(kind: MonsterKind, dist: number, wall: boolean, stage?: number): boolean {
  const world = openWorld();
  if (wall) for (let y = 8; y <= 14; y++) world.cells[world.idx(9, y)] = Cell.WALL;
  const e = mon(kind, 10.5, 10.5, stage);
  const player = benchPlayer({ id: 1, x: 10.5 + dist, y: 10.5, hp: 5000, maxHp: 5000 });
  const before = player.hp ?? 0;
  runOnce(world, e, player, 0.05, 5);
  return (player.hp ?? 0) < before;
}
for (const kind of REACH_KINDS) {
  const stages = kind === MonsterKind.HEAD_SLUG ? [HEAD_SLUG_HOSTED_STAGE, HEAD_SLUG_DETACHED_STAGE] : [undefined];
  for (const stage of stages) {
    for (const wall of kind === MonsterKind.PANELNIK ? [true, false] : [false]) {
      let lo = 0.2, hi = 2.4;
      if (!hitsAt(kind, lo, wall, stage)) { out.push(`${MONSTERS[kind].name.padEnd(18)} стадия=${stage ?? '—'} стена=${wall} НЕ БЬЁТ ВОВСЕ`); continue; }
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (hitsAt(kind, mid, wall, stage)) lo = mid; else hi = mid;
      }
      out.push(`${MONSTERS[kind].name.padEnd(18)} стадия=${stage ?? '—'} стена=${wall} дальность≈${lo.toFixed(3)}`);
    }
  }
}

/* ── 3. Поле конторщика: вес комнаты и вес клетки ────────────── */
out.push('== офисное поле ==');
const OFFICE_SETUPS: readonly (readonly [string, RoomType, readonly Feature[]])[] = [
  ['офис пусто', RoomType.OFFICE, []],
  ['офис столы', RoomType.OFFICE, [Feature.DESK, Feature.DESK, Feature.DESK]],
  ['склад полки', RoomType.STORAGE, [Feature.SHELF, Feature.SHELF]],
  ['штаб стол', RoomType.HQ, [Feature.TABLE]],
  ['коридор', RoomType.CORRIDOR, []],
  ['общая', RoomType.COMMON, [Feature.TABLE, Feature.DESK]],
  ['жилая (вне таблицы)', RoomType.LIVING, [Feature.DESK, Feature.SHELF, Feature.TABLE]],
];
for (const [label, roomType, features] of OFFICE_SETUPS) {
  const world = openWorld();
  world.rooms[0].type = roomType;
  features.forEach((f, i) => { world.features[world.idx(9 + i, 10)] = f; });
  const e = mon(MonsterKind.KANTSELYARSKIY_IDOL, 10.5, 10.5);
  const player = benchPlayer({ id: 1, x: 14.5, y: 10.5, hp: 100, maxHp: 100 });
  const { state } = runOnce(world, e, player);
  const ev = getRecentEvents(state, { limit: 8 }).find(v => v.data?.officeFieldPressure !== undefined);
  out.push(`${label.padEnd(22)} давление=${ev?.data?.officeFieldPressure ?? '—'} дальность=${ev?.data?.officeFieldRange ?? '—'}`);
}

/* ── 4. Хрупкий корпус Ржавника после состоявшегося рывка ───── */
out.push('== хрупкий корпус Ржавника ==');
for (const maxHp of [20, 30, 40, 60, 120]) {
  const world = openWorld();
  const e = mon(MonsterKind.RZHAVNIK, 10.5, 10.5);
  e.maxHp = maxHp;
  e.hp = maxHp;
  e.ai!.scrapWake = 1;
  e.ai!.windupTimer = 0;
  e.ai!.combatTargetId = 1;
  const player = benchPlayer({ id: 1, x: 14.5, y: 10.5, hp: 500, maxHp: 500 });
  const { msgs } = runOnce(world, e, player, 0.2, 5);
  out.push(`maxHp ${String(maxHp).padStart(4)} → ${e.maxHp}/${e.hp}  урон×=${e.monsterDmgMult ?? 1}  масштаб=${e.spriteScale ?? '—'}  лог=${msgs.map(m => m.text).join(' | ') || '—'}`);
}

/* ── 5. Световой захват Лампоглаза ──────────────────────────── */
out.push('== световой захват Лампоглаза ==');
for (const [label, light, lamp] of [['темно', 0, false], ['свет 0.5', 0.5, false], ['лампа рядом', 0.5, true]] as const) {
  const world = openWorld();
  world.light.fill(light);
  const player = benchPlayer({ id: 1, x: 16.5, y: 10.5, hp: 500, maxHp: 500 });
  if (lamp) world.features[world.idx(16, 10)] = Feature.LAMP;
  const e = mon(MonsterKind.LAMPOGLAZ, 10.5, 10.5);
  const { msgs, state } = runOnce(world, e, player, 0.05, 5);
  const ev = getRecentEvents(state, { limit: 8 }).find(v => v.data?.windupSec !== undefined);
  out.push(`${label.padEnd(14)} замах=${ev?.data?.windupSec ?? '—'} свет=${ev?.data?.targetLight ?? '—'} таймер=${e.ai?.windupTimer ?? '—'} масштаб=${e.spriteScale ?? '—'} лог=${msgs.map(m => m.text).join(' | ') || '—'}`);
}

console.log(out.join('\n'));
