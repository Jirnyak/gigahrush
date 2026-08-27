#!/usr/bin/env tsx
/* Дамп УФ-прожектора: что он делает с каждым видом.
 *
 * Снимается ДО и ПОСЛЕ сведения пяти видовых веток в колонку `MonsterDef.uv`
 * и сверяется построчно. Паритет обязан быть побайтовым.
 *
 * Запуск: npx tsx scripts/uv_dump.ts
 */
import '../src/content';
import { AIGoal, Cell, Faction, MonsterKind, RoomType, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { HEAD_SLUG_DETACHED_STAGE, HEAD_SLUG_HOSTED_STAGE } from '../src/entities/head_slug';
import { getRecentEvents } from '../src/systems/events';
import { useUvSpotlight } from '../src/systems/uv_spotlight';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setListenerPos } from '../src/systems/audio';
import { benchMonster, benchNpc, benchPlayer, benchState } from './bench_actors';

function room(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.roomMap.fill(0);
  world.zoneMap.fill(0);
  world.zones[0] = { id: 0, cx: 12, cy: 12, faction: 0, hasLift: false, fogged: false, level: 1, hqRoomId: -1 };
  world.rooms[0] = {
    id: 0, type: RoomType.MEDICAL, x: 4, y: 4, w: 24, h: 24, doors: [], sealed: false,
    name: 'Палата', apartmentId: -1, wallTex: 0, floorTex: 0,
  };
  return world;
}

function monster(kind: MonsterKind, dist: number, stage?: number): Entity {
  return benchMonster(kind, {
    id: 3, x: 10 + dist, y: 10, angle: Math.PI, monsterStage: stage,
    ai: { goal: AIGoal.HUNT, tx: 10, ty: 10, path: [0], pi: 0, stuck: 0, timer: 4, combatTargetId: 1, staggerTimer: 0 },
  });
}

interface Case { name: string; build: () => Entity; wall?: boolean }

const CASES: Case[] = [
  { name: 'Глаз', build: () => monster(MonsterKind.EYE, 3) },
  { name: 'Дух', build: () => monster(MonsterKind.SPIRIT, 3) },
  { name: 'Слизневая женщина', build: () => monster(MonsterKind.SLIME_WOMAN, 3) },
  { name: 'Лишенный', build: () => monster(MonsterKind.LISHENNYY, 3) },
  { name: 'Головной слизень (на шее)', build: () => monster(MonsterKind.HEAD_SLUG, 3, HEAD_SLUG_HOSTED_STAGE) },
  { name: 'Головной слизень (сорванный)', build: () => monster(MonsterKind.HEAD_SLUG, 3, HEAD_SLUG_DETACHED_STAGE) },
  { name: 'Глаз вплотную (0.8)', build: () => monster(MonsterKind.EYE, 0.8) },
  { name: 'Глаз на краю луча (9.5)', build: () => monster(MonsterKind.EYE, 9.5) },
  { name: 'Глаз за лучом (11)', build: () => monster(MonsterKind.EYE, 11) },
  { name: 'Глаз вне конуса (сбоку)', build: () => { const e = monster(MonsterKind.EYE, 3); e.y = 12; return e; } },
  { name: 'Тварь без строки УФ', build: () => monster(MonsterKind.TVAR, 3) },
  { name: 'Мертвяк', build: () => monster(MonsterKind.ZOMBIE, 3) },
  { name: 'Человек в луче', build: () => benchNpc({ id: 3, name: 'Прохожий', x: 13, y: 10, hp: 60, maxHp: 60, faction: Faction.CITIZEN }) },
  /* Толчок УПИРАЕТСЯ в стену: у духа проверки на плотность нет вовсе (он ходит
   * сквозь), у остальных четырёх есть. Без этих строк разница не видна. */
  { name: 'Дух в стену', build: () => monster(MonsterKind.SPIRIT, 3.7), wall: true },
  { name: 'Слизневая женщина в стену', build: () => monster(MonsterKind.SLIME_WOMAN, 3.7), wall: true },
  { name: 'Лишенный в стену', build: () => monster(MonsterKind.LISHENNYY, 3.7), wall: true },
  { name: 'Головной слизень в стену', build: () => monster(MonsterKind.HEAD_SLUG, 3.7, HEAD_SLUG_DETACHED_STAGE), wall: true },
];

const lines: string[] = [];

for (const c of CASES) {
  const world = room();
  if (c.wall) world.cells[world.idx(14, 10)] = Cell.WALL;
  setListenerPos(512, 512, world.dist2.bind(world));
  const player = benchPlayer({
    id: 1, x: 10, y: 10, angle: 0, hp: 100, maxHp: 100,
    tool: 'uv_spotlight',
    inventory: [{ defId: 'uv_spotlight', count: 1, data: { dur: 40 } }],
  });
  const target = c.build();
  const entities = [player, target];
  const state = benchState();
  rebuildEntityIndex(entities);
  const before = { x: target.x, y: target.y, hp: target.hp, cd: target.attackCd };
  const result = useUvSpotlight(world, entities, player, state);
  const ev = getRecentEvents(state, { type: 'uv_spotlight_target_affected', limit: 4 });
  const hit = ev.find(e => e.targetId === target.id);
  const dried = getRecentEvents(state, { type: 'slime_humanoid_dried', limit: 1 })[0];
  const msgs = (state.msgs as Msg[]).map(m => `${m.text}[${m.color ?? ''}]`).join(' | ');

  lines.push([
    c.name.padEnd(30),
    `задет=${result?.affected ?? '—'}`,
    `эффект=${hit?.data?.effect ?? '—'}`,
    `откат=${(target.attackCd ?? 0).toFixed(3)}(было ${(before.cd ?? 0).toFixed(2)})`,
    `сдвиг=${(target.x - before.x).toFixed(4)}/${(target.y - before.y).toFixed(4)}`,
    `hp=${target.hp}(было ${before.hp})`,
    `масштаб=${target.spriteScale ?? '—'}`,
    `цель=${target.ai?.combatTargetId ?? '—'}`,
    `путь=${target.ai?.path.length ?? '—'}`,
    `таймер=${target.ai?.timer ?? '—'}`,
    `стаггер=${target.ai?.staggerTimer ?? '—'}`,
    `goal=${target.ai?.goal ?? '—'}`,
    `сушь=${dried ? 'да' : '—'}`,
    `лог=${msgs || '—'}`,
  ].join('  '));
}

console.log(lines.join('\n'));
