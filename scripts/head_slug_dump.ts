#!/usr/bin/env tsx
/* Дамп переползания Головного слизня: что он выбирает носителем.
 *
 * Снимается ДО и ПОСЛЕ смены правила выбора трупа и сверяется построчно.
 * Расхождения обязаны быть ровно там, где правило поменялось, и нигде больше.
 *
 * Запуск: npx tsx scripts/head_slug_dump.ts
 */
import '../src/content';
import { AIGoal, Cell, EntityType, Faction, MonsterKind, RoomType, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { DEF, HEAD_SLUG_DETACHED_STAGE, HEAD_SLUG_HOSTED_STAGE } from '../src/entities/head_slug';
import { getRecentEvents } from '../src/systems/events';
import { findHeadSlugRehostTarget, rememberHeadSlugVictim, updateMonster, setEntityMap } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setListenerPos } from '../src/systems/audio';
import { setActorDeathHandler } from '../src/systems/combat_stimulus';
import { benchNpc, benchPlayer, benchState } from './bench_actors';

function medicalWorld(): World {
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

function slugAt(x: number, y: number, detached: boolean): Entity {
  return {
    id: 2, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true,
    speed: detached ? 1.92 : DEF.speed, sprite: DEF.sprite,
    hp: detached ? 12 : DEF.hp, maxHp: detached ? 18 : DEF.hp,
    monsterKind: MonsterKind.HEAD_SLUG,
    monsterStage: detached ? HEAD_SLUG_DETACHED_STAGE : HEAD_SLUG_HOSTED_STAGE,
    attackCd: 0, currentMag: 1, spriteScale: detached ? 0.58 : undefined,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function corpse(id: number, name: string, x: number, y: number): Entity {
  return benchNpc({ id, name, x, y, alive: false, hp: 0, maxHp: 60, speed: 0.9, faction: Faction.CITIZEN });
}

function stunned(id: number, name: string, x: number, y: number): Entity {
  return benchNpc({
    id, name, x, y, alive: true, hp: 30, maxHp: 60, speed: 0.9, faction: Faction.CITIZEN,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0, staggerTimer: 1.0 },
  });
}

interface Case {
  name: string;
  /** Кого слизень убил сам перед тем, как сорваться. */
  ownVictimId?: number;
  build: () => { slug: Entity; others: Entity[] };
}

const CASES: Case[] = [
  {
    name: 'живой оглушённый рядом',
    build: () => ({ slug: slugAt(10, 10, true), others: [stunned(3, 'Санитар', 10.65, 10.15)] }),
  },
  {
    name: 'своя жертва вплотную',
    ownVictimId: 3,
    build: () => ({ slug: slugAt(10, 10, true), others: [corpse(3, 'Своя жертва', 10.6, 10.1)] }),
  },
  {
    name: 'чужой труп вплотную',
    build: () => ({ slug: slugAt(10, 10, true), others: [corpse(4, 'Чужой труп', 10.6, 10.1)] }),
  },
  {
    name: 'своя жертва в четырёх клетках',
    ownVictimId: 3,
    build: () => ({ slug: slugAt(10, 10, true), others: [corpse(3, 'Своя жертва', 14, 10)] }),
  },
  {
    name: 'своя жертва за радиусом (9 клеток)',
    ownVictimId: 3,
    build: () => ({ slug: slugAt(10, 10, true), others: [corpse(3, 'Своя жертва', 19, 10)] }),
  },
  {
    name: 'своя жертва дальше чужого трупа',
    ownVictimId: 3,
    build: () => ({ slug: slugAt(10, 10, true), others: [corpse(4, 'Чужой труп', 10.6, 10.1), corpse(3, 'Своя жертва', 13, 10)] }),
  },
  {
    name: 'восемьдесят чужих трупов вокруг',
    build: () => ({
      slug: slugAt(10, 10, true),
      others: Array.from({ length: 80 }, (_, i) => corpse(20 + i, `Труп ${i}`, 10 + (i % 9) * 0.5, 10 + Math.floor(i / 9) * 0.5)),
    }),
  },
  {
    name: 'живой оглушённый и своя жертва вместе',
    ownVictimId: 3,
    build: () => ({ slug: slugAt(10, 10, true), others: [stunned(5, 'Оглушённый', 11.4, 10), corpse(3, 'Своя жертва', 10.6, 10.1)] }),
  },
  {
    name: 'пусто вокруг',
    build: () => ({ slug: slugAt(10, 10, true), others: [] }),
  },
  {
    name: 'носитель цел: слизень ещё на шее',
    build: () => ({ slug: slugAt(10, 10, false), others: [stunned(3, 'Санитар', 10.65, 10.15)] }),
  },
];

const lines: string[] = [];
setActorDeathHandler(undefined);

for (const c of CASES) {
  const world = medicalWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const player = benchPlayer({ id: 1, x: 40, y: 40, hp: 100, maxHp: 100 });
  const { slug, others } = c.build();
  const entities = [player, slug, ...others];
  const state = benchState();
  const msgs: Msg[] = [];
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));

  // Память о своей жертве ставится тем же вызовом, каким её ставит бой.
  const victim = c.ownVictimId !== undefined ? others.find(e => e.id === c.ownVictimId) : undefined;
  if (victim) rememberHeadSlugVictim(slug, victim);

  const picked = findHeadSlugRehostTarget(world, slug);
  updateMonster(world, entities, slug, 1.3, 2, msgs, player.id, { v: 900 }, state);
  const ev = getRecentEvents(state, { type: 'head_slug_rehosted', tags: ['head_slug'], limit: 1 })[0];

  lines.push([
    c.name.padEnd(38),
    `выбран=${picked ? `${picked.name}#${picked.id}` : '—'}`,
    `стадия=${slug.monsterStage}`,
    `имя=${slug.name ?? '—'}`,
    `скорость=${(slug.speed ?? 0).toFixed(3)}`,
    `hp=${slug.hp}/${slug.maxHp}`,
    `фракция=${slug.faction ?? '—'}`,
    `навык=${slug.parasiteHostSkill?.toFixed(3) ?? '—'}`,
    `событие=${ev ? `${ev.targetName}/живой:${ev.data?.hostWasAlive}` : '—'}`,
    `лог=${msgs.map(m => m.text).join(' | ') || '—'}`,
  ].join('  '));
}

console.log(lines.join('\n'));
