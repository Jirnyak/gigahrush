#!/usr/bin/env tsx
/* Дамп семьи «привязка к точке мира»: цел якорь или перерезан — и что от этого.
 *
 * Форма семьи одна: «пока якорь цел и виден — тварь работает; якорь перерезали —
 * ослабла». Хранилась она тремя способами сразу, поэтому сверять правку глазами
 * бесполезно: расхождение не в форме, а в том, ЧЕРЕЗ ЧТО получен ответ.
 *
 * Скрипт зовёт только публичные шаги (`updateMonster`, `updateChervieNetPossessor`)
 * и печатает СЛЕДСТВИЯ: пройденный путь (множитель хода), снятое здоровье
 * (множитель урона), размер спрайта, дальность захвата цели (чутьё), строки лога
 * и типы событий. Всё это одинаково видно и до сведения, и после, поэтому дамп
 * запускается из ОБОИХ деревьев и сверяется побайтово.
 *
 * Запуск: npx tsx scripts/anchor_dump.ts > /tmp/anchor_before.txt
 */
import '../src/content';
import {
  AIGoal, Cell, EntityType, Faction, Feature, MonsterKind, RoomType, type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { seedGlobalRng } from '../src/core/rand';
import { setEntityMap, updateMonster, updateChervieNetPossessor } from '../src/systems/ai/monster';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setActorDeathHandler } from '../src/systems/combat_stimulus';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { setListenerPos } from '../src/systems/audio';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { applyMonsterArmorHit } from '../src/systems/monster_armor';
import { DamageType } from '../src/core/types';
import { createArenaGameState } from '../src/arena_scenarios';

const ROOM_Y = 30;
const ROOM_W = 60;
const ROOM_H = 24;
const OX = 512;
const MY = ROOM_Y + 12.5;
const PLAYER_ID = 1;

/** Полигон: открытая комната; `wall` — глухая перегородка между тварью и якорем. */
function scene(anchorFeature: Feature | undefined, anchorDx: number, wall: boolean): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  const x0 = OX - 20;
  for (let y = ROOM_Y; y < ROOM_Y + ROOM_H; y++) {
    for (let x = x0; x < x0 + ROOM_W; x++) {
      world.cells[world.idx(world.wrap(x), y)] = Cell.FLOOR;
      world.roomMap[world.idx(world.wrap(x), y)] = 1;
    }
  }
  world.features.fill(Feature.NONE);
  world.light.fill(0.5);
  world.rooms.push({
    id: 1, type: RoomType.PRODUCTION, x: world.wrap(x0), y: ROOM_Y, w: ROOM_W, h: ROOM_H,
    cx: world.wrap(x0 + ROOM_W / 2), cy: ROOM_Y + ROOM_H / 2, doors: [], name: 'полигон',
  } as never);
  if (anchorFeature !== undefined) {
    world.features[world.idx(world.wrap(OX + anchorDx), Math.floor(MY))] = anchorFeature;
  }
  if (wall) {
    // Перегородка ровно посередине между тварью и якорем: рвёт прямую, не радиус.
    const wx = world.wrap(OX + Math.round(anchorDx / 2));
    for (let dy = -6; dy <= 6; dy++) world.cells[world.idx(wx, Math.floor(MY) + dy)] = Cell.WALL;
  }
  world.cellVersion++;
  bakeNavigationTree(world);
  return world;
}

function victim(x: number, hp: number): Entity {
  return {
    id: 2, type: EntityType.NPC, x, y: MY, angle: 0, pitch: 0, alive: true,
    speed: 3, sprite: 0, hp, maxHp: 900, faction: Faction.CITIZEN, name: 'Мишень',
    persistentNpcId: 'dummy',
    rpg: { level: 1, xp: 0, xpNext: 100, str: 5, agi: 5, per: 5, int: 5, luck: 5, psi: 40, psiMax: 40, points: 0 } as never,
    ai: { goal: AIGoal.IDLE, tx: Math.floor(x), ty: Math.floor(MY), path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
}

function monster(kind: MonsterKind, x: number): Entity {
  const def = MONSTERS[kind];
  return {
    id: 7, type: EntityType.MONSTER, x, y: MY, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0, currentMag: 1,
    ai: { goal: AIGoal.HUNT, tx: Math.floor(x), ty: Math.floor(MY), path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
}

const f = (v: number | undefined): string => (v === undefined ? '-' : v.toFixed(4));

interface Case {
  label: string;
  kind: MonsterKind;
  /** Признак якоря и его смещение по X от твари; `undefined` — якоря в мире нет. */
  anchor?: Feature;
  anchorDx: number;
  /** Перегородка между тварью и якорем: рвёт прямую, оставляя радиус. */
  wall?: boolean;
  /** Смещение мишени по X. Дальняя мишень проверяет ЧУТЬЁ. */
  targetDx: number;
  ticks: number;
  dt: number;
  /** Гонять ли персональный такт Червия (импульс и перелом линии). */
  netTick?: boolean;
}

function run(c: Case): void {
  seedGlobalRng(20260827);
  const world = scene(c.anchor, c.anchorDx, c.wall === true);
  setListenerPos(512, 512, world.dist2.bind(world));
  const threat = monster(c.kind, OX + 0.5);
  const target = victim(world.wrap(OX + 0.5 + c.targetDx), 900);
  const entities = [target, threat];
  const state = createArenaGameState();
  state.currentZ = -14;
  state.worldEvents = createWorldEventState();
  const msgs: Msg[] = [];
  setCurrentPlayerEntity(undefined);
  setActorDeathHandler(() => {});
  const startX = threat.x;
  const startY = threat.y;

  let time = 1;
  try {
    for (let i = 0; i < c.ticks; i++) {
      rebuildEntityIndex(entities);
      setEntityMap(new Map(entities.map(e => [e.id, e])));
      state.time = time;
      if (c.netTick === true) updateChervieNetPossessor(world, threat, c.dt, time, msgs, PLAYER_ID, state);
      updateMonster(world, entities, threat, c.dt, time, msgs, PLAYER_ID, { v: 900 }, state);
      time += c.dt;
    }
  } finally {
    setActorDeathHandler(undefined);
  }

  /* Броня спрашивает у того же якоря: при живой сети тело считается живой сетью,
   * при перерезанной — проводкой. Два удара одним числом показывают обе строки. */
  const kinetic = applyMonsterArmorHit(world, state as never, threat, { damage: 100, damageType: DamageType.KINETIC } as never);
  const energy = applyMonsterArmorHit(world, state as never, threat, { damage: 100, damageType: DamageType.ENERGY } as never);

  const moved = Math.hypot(world.delta(threat.x, startX), world.delta(threat.y, startY));
  const evTypes = getRecentEvents(state, { limit: 32 }).map(e => e.type).sort().join(',');
  console.log([
    c.label,
    `moved=${f(moved)}`,
    `scale=${f(threat.spriteScale)}`,
    `tgt=${f(target.hp)}`,
    `locked=${threat.ai?.combatTargetId ?? '-'}`,
    `goal=${threat.ai?.goal ?? '-'}`,
    `armorK=${f(kinetic.damage)}`,
    `armorE=${f(energy.damage)}`,
    `armorAct=${kinetic.armorActive ? 1 : 0}`,
    `ev=${evTypes || '-'}`,
    `msgs=${msgs.map(m => `${m.color}«${m.text}»`).join(' | ') || '-'}`,
  ].join('  '));
}

/* Червие: якорь цел / перерезан стеной / отсутствует, вплотную и на чутьё.
 * Ламповый: то же самое лампой, у него якорь БЕЗ прямой — стена ему не помеха. */
const CASES: readonly Case[] = [
  { label: 'ЧЕРВИЕ экран      ', kind: MonsterKind.CHERVIE_AVATAR, anchor: Feature.SCREEN, anchorDx: 4, targetDx: 9, ticks: 40, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ аппарат    ', kind: MonsterKind.CHERVIE_AVATAR, anchor: Feature.APPARATUS, anchorDx: 4, targetDx: 9, ticks: 40, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ оба        ', kind: MonsterKind.CHERVIE_AVATAR, anchor: Feature.SCREEN, anchorDx: 3, targetDx: 9, ticks: 40, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ за стеной  ', kind: MonsterKind.CHERVIE_AVATAR, anchor: Feature.SCREEN, anchorDx: 6, wall: true, targetDx: 9, ticks: 40, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ вне радиуса', kind: MonsterKind.CHERVIE_AVATAR, anchor: Feature.SCREEN, anchorDx: 12, targetDx: 9, ticks: 40, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ без якоря  ', kind: MonsterKind.CHERVIE_AVATAR, anchorDx: 0, targetDx: 9, ticks: 40, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ чутьё +18  ', kind: MonsterKind.CHERVIE_AVATAR, anchor: Feature.SCREEN, anchorDx: 4, targetDx: 18, ticks: 12, dt: 0.1, netTick: true },
  { label: 'ЧЕРВИЕ чутьё рез  ', kind: MonsterKind.CHERVIE_AVATAR, anchorDx: 0, targetDx: 18, ticks: 12, dt: 0.1, netTick: true },
  { label: 'ЛАМПОВЫЙ лампа    ', kind: MonsterKind.LAMPOVY, anchor: Feature.LAMP, anchorDx: 2, targetDx: 1.2, ticks: 40, dt: 0.1 },
  { label: 'ЛАМПОВЫЙ за стеной', kind: MonsterKind.LAMPOVY, anchor: Feature.LAMP, anchorDx: 2, wall: true, targetDx: 1.2, ticks: 40, dt: 0.1 },
  { label: 'ЛАМПОВЫЙ далеко   ', kind: MonsterKind.LAMPOVY, anchor: Feature.LAMP, anchorDx: 6, targetDx: 1.2, ticks: 40, dt: 0.1 },
  { label: 'ЛАМПОВЫЙ без лампы', kind: MonsterKind.LAMPOVY, anchorDx: 0, targetDx: 1.2, ticks: 40, dt: 0.1 },
];

for (const c of CASES) run(c);
