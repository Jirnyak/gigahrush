#!/usr/bin/env tsx
/* Дамп семьи «применение спецурона»: одиннадцать ударов, одинаковые жертвы.
 *
 * Общий блок «дверь урона → запись игроку → добивание → кровь → строка» был
 * переписан в каждой из одиннадцати функций своими руками. Сверять такое
 * глазами бесполезно: расхождения там не в форме, а в том, ЧЕГО в копии нет.
 *
 * Поэтому каждый удар прогоняется по одному набору жертв (человек, тварь,
 * игрок, бронированный, добиваемый) и печатается ровно то, чем удар кончился:
 * снятое здоровье, самоурон бьющего, стаггер, откат, факт смерти, число
 * вызовов общей двери смерти, нагрузка поля опасности в клетке жертвы (по ней
 * видно ЛИШНЮЮ лужу), запись урона игроку и все строки лога дословно.
 *
 * Запуск: npx tsx scripts/special_strike_dump.ts > /tmp/strike_before.txt
 */
import '../src/content';
import {
  AIGoal, Cell, EntityType, Faction, Feature, MonsterKind, RoomType, type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { seedGlobalRng } from '../src/core/rand';
import { setEntityMap, updateMonster, updateVodyanoyWaterPressureLine, setTonkayaLine } from '../src/systems/ai/monster';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setActorDeathHandler } from '../src/systems/combat_stimulus';
import { spawnDeathPool } from '../src/systems/blood_fx';
import { createWorldEventState } from '../src/systems/events';
import { setListenerPos } from '../src/systems/audio';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { ZHELEMISH_SKIN_ID } from '../src/systems/status';
import { createArenaGameState } from '../src/arena_scenarios';

const ROOM_Y = 40;
const ROOM_W = 44;
const ROOM_H = 16;
const OX = 512;
const MY = ROOM_Y + 8.5;
const PLAYER_ID = 1;

/** Полигон: открытая комната. `water` — мокрая дорожка вдоль оси удара. */
function scene(water: boolean): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  const x0 = OX - 8;
  for (let y = ROOM_Y; y < ROOM_Y + ROOM_H; y++) {
    for (let x = x0; x < x0 + ROOM_W; x++) {
      world.cells[world.idx(world.wrap(x), y)] = Cell.FLOOR;
      world.roomMap[world.idx(world.wrap(x), y)] = 1;
    }
  }
  world.features.fill(Feature.NONE);
  world.rooms.push({
    id: 1, type: RoomType.STORAGE, x: world.wrap(x0), y: ROOM_Y, w: ROOM_W, h: ROOM_H,
    cx: world.wrap(x0 + ROOM_W / 2), cy: ROOM_Y + ROOM_H / 2, doors: [], name: 'полигон',
  } as never);
  if (water) {
    for (let dx = -2; dx < ROOM_W - 8; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        world.cells[world.idx(world.wrap(OX + dx), Math.floor(MY) + dy)] = Cell.WATER;
      }
    }
  }
  world.cellVersion++;
  bakeNavigationTree(world);
  return world;
}

/* ── Жертвы ───────────────────────────────────────────────────── */

interface VictimSpec {
  name: string;
  type: EntityType;
  hp: number;
  armor?: string;
  player?: boolean;
  /** Кожа желемыши: гасит ВХОДЯЩИЙ БЛИЖНИЙ урон на треть. */
  skin?: boolean;
  /** Озноб хладонца на бьющем: `monsterDmgMult` ниже единицы. */
  chill?: number;
}

const VICTIMS: readonly VictimSpec[] = [
  { name: 'человек   ', type: EntityType.NPC, hp: 900 },
  { name: 'тварь     ', type: EntityType.MONSTER, hp: 900 },
  { name: 'игрок     ', type: EntityType.NPC, hp: 900, player: true },
  { name: 'бронир.   ', type: EntityType.NPC, hp: 900, armor: 'armor_medium' },
  { name: 'бронир.игр', type: EntityType.NPC, hp: 900, armor: 'armor_medium', player: true },
  { name: 'добиваемый', type: EntityType.NPC, hp: 1 },
  { name: 'добив.игр ', type: EntityType.NPC, hp: 1, player: true },
  /* Две конфигурации ради множителей, а не ради смерти: они показывают, доходит
   * ли до КАЖДОГО из одиннадцати общий множитель урона твари и общая скидка
   * ближнего урона на цели. Без них расхождение формул невидимо. */
  { name: 'желемышь  ', type: EntityType.NPC, hp: 900, skin: true },
  { name: 'озноб бьющ', type: EntityType.NPC, hp: 900, chill: 0.55 },
];

function makeVictim(spec: VictimSpec, x: number, y: number): Entity {
  const e: Entity = {
    id: spec.player ? PLAYER_ID : 2,
    type: spec.type, x, y, angle: 0, pitch: 0, alive: true,
    speed: 3, sprite: 0, hp: spec.hp, maxHp: 900,
    faction: spec.type === EntityType.NPC ? Faction.CITIZEN : undefined,
    name: spec.type === EntityType.NPC ? 'Мишень' : undefined,
    // Тварь-жертва берётся из пищевой цепи: цель типа MONSTER пускает к себе
    // только тот, у кого объявлен `preyTags` (из одиннадцати — одна Жорная).
    monsterKind: spec.type === EntityType.MONSTER ? MonsterKind.KRYSNOZHKA : undefined,
    persistentNpcId: spec.player ? 'player' : 'dummy',
    armorDefId: spec.armor,
    rpg: { level: 1, xp: 0, xpNext: 100, str: 5, agi: 5, per: 5, int: 5, luck: 5, psi: 40, psiMax: 40, points: 0 } as never,
    ai: { goal: AIGoal.IDLE, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
  if (spec.skin === true) {
    e.statuses = [{ id: ZHELEMISH_SKIN_ID, source: 'debug', startedAt: 0, expiresAt: 1e9 } as never];
  }
  return e;
}

function monster(kind: MonsterKind, x: number, y: number): Entity {
  const def = MONSTERS[kind];
  return {
    id: 7, type: EntityType.MONSTER,
    x, y, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0, currentMag: 1,
    ai: { goal: AIGoal.HUNT, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
}

const f = (v: number | undefined): string => (v === undefined ? '-' : v.toFixed(4));

/* ── Один прогон ──────────────────────────────────────────────── */

interface Strike {
  label: string;
  kind: MonsterKind;
  /** Смещение жертвы по X. */
  dx: number;
  ticks: number;
  dt: number;
  water?: boolean;
  /**
   * Свидетели в кадре, смещением от твари.
   *
   * Луч Слепоглаза — единственный из одиннадцати, кто бьёт ВСЕХ в полосе
   * (проекция вдоль и перпендикуляр), а не одну цель. Форма поражения доказана
   * разведкой и сведению не подлежит; свидетели в дампе стоят затем, чтобы
   * сведение общего блока её не задело: двое в полосе, один вне её.
   */
  extras?: readonly (readonly [number, number])[];
  /** Довести вид до самого удара; полей состояния сцена руками не трогает. */
  prime?: (world: World, threat: Entity, target: Entity, step: (dt: number) => void) => void;
  /** Особый шаг: не через `updateMonster` (мокрая линия зовётся напрямую). */
  step?: (world: World, threat: Entity, target: Entity, dt: number, time: number, msgs: Msg[], state: never) => void;
}

function run(strike: Strike, spec: VictimSpec): void {
  seedGlobalRng(20260827);
  const world = scene(strike.water === true);
  setListenerPos(512, 512, world.dist2.bind(world));
  const threat = monster(strike.kind, OX + 0.5, MY);
  if (spec.chill !== undefined) threat.monsterDmgMult = spec.chill;
  const target = makeVictim(spec, world.wrap(OX + 0.5 + strike.dx), MY);
  setCurrentPlayerEntity(spec.player === true ? target : undefined);
  const extras = (strike.extras ?? []).map(([dx, dy], i) => {
    const e = makeVictim({ name: '', type: EntityType.NPC, hp: 900 }, world.wrap(OX + 0.5 + dx), MY + dy);
    e.id = 20 + i;
    e.persistentNpcId = `extra${i}`;
    return e;
  });
  const entities = [target, threat, ...extras];
  const state = createArenaGameState();
  state.currentZ = -14;
  state.worldEvents = createWorldEventState();
  const msgs: Msg[] = [];
  let deaths = 0;
  setActorDeathHandler((v, _killer, gore, vx, vy) => {
    deaths++;
    spawnDeathPool(world, v.x, v.y, v.type === EntityType.MONSTER, gore, vx, vy);
  });

  let time = 1;
  const step = (dt: number): void => {
    rebuildEntityIndex(entities);
    setEntityMap(new Map(entities.map(e => [e.id, e])));
    state.time = time;
    if (strike.step) strike.step(world, threat, target, dt, time, msgs, state as never);
    else updateMonster(world, entities, threat, dt, time, msgs, PLAYER_ID, { v: 900 }, state);
    time += dt;
  };

  /* Мёртвую цель дожимать нечего: секунда после смерти оставляет хвост
   * (кормёжка, добивание), но не даёт удару печатать строку убийства по кругу. */
  let deadAt = Infinity;
  try {
    strike.prime?.(world, threat, target, step);
    for (let i = 0; i < strike.ticks; i++) {
      step(strike.dt);
      if (!target.alive && deadAt === Infinity) deadAt = time;
      if (time - deadAt > 1) break;
    }
  } finally {
    setActorDeathHandler(undefined);
    setCurrentPlayerEntity(undefined);
  }

  const danger = world.dangerField[world.idx(Math.floor(target.x), Math.floor(target.y))];
  const texts = msgs.map(m => `${m.color}«${m.text}»`).join(' | ');
  console.log([
    strike.label, spec.name,
    `thp=${f(target.hp)}`,
    `alive=${target.alive ? 1 : 0}`,
    `mhp=${f(threat.hp)}/${f(threat.maxHp)}`,
    `mult=${f(threat.monsterDmgMult)}`,
    `stag=${f(threat.ai?.staggerTimer)}`,
    `vstag=${f(target.ai?.staggerTimer)}`,
    `cd=${f(threat.attackCd)}`,
    `pos=${f(threat.x)},${f(threat.y)}`,
    `ext=${extras.length === 0 ? '-' : extras.map(x => f(x.hp)).join('/')}`,
    `deaths=${deaths}`,
    `danger=${danger}`,
    `hurt=${state.lastDamage ? `«${state.lastDamage.detail}»/${state.lastDamage.amount}` : '-'}`,
    `msgs=${texts}`,
  ].join('  '));
}

/* ── Приводы одиннадцати ──────────────────────────────────────── */

/* Ржавник просыпается только вплотную: будим его штатным подходом и уводим
 * мишень на дистанцию сцены до истечения замаха. Ни одного поля руками. */
const rzhavnikPrime: Strike['prime'] = (world, threat, target, step) => {
  threat.ai!.scrapWake = 0;
  const tx = target.x;
  target.x = world.wrap(threat.x + 1.4);
  step(0.05);
  target.x = tx;
};

/* Тонкая Тень бросается только с готовой линии: линия — публичная запись
 * `ai.baitLine`, её и ставим на клетку самой тени вдоль оси к мишени. */
const tonkayaPrime: Strike['prime'] = (_world, threat, target) => {
  setTonkayaLine(threat, {
    x: Math.floor(threat.x), y: Math.floor(threat.y),
    dx: 1, dy: 0, nerve: 5.6, armed: true, spent: false,
  });
  threat.ai!.combatTargetId = target.id;
};

const STRIKES: readonly Strike[] = [
  /* Протокольник копит давление на строке протокола; порог пульса 35, рост
   * около единицы в секунду — отсюда длинный прогон. */
  { label: 'ПРОТОКОЛЬНИК', kind: MonsterKind.PROTOKOLNIK, dx: 3.5, ticks: 700, dt: 0.1 },
  { label: 'КРОВ.РАСТЕНИЕ', kind: MonsterKind.BLOOD_PLANT, dx: 3.0, ticks: 8, dt: 0.1 },
  { label: 'БОРЩЕВИК    ', kind: MonsterKind.BORSHCHEVIK, dx: 1.2, ticks: 8, dt: 0.1 },
  { label: 'РЖАВНИК     ', kind: MonsterKind.RZHAVNIK, dx: 5, ticks: 6, dt: 0.1, prime: rzhavnikPrime },
  { label: 'ЖОРНАЯ      ', kind: MonsterKind.ZHORNAYA_TVAR, dx: 5, ticks: 14, dt: 0.1 },
  { label: 'КОСТОРЕЗ    ', kind: MonsterKind.KOSTOREZ, dx: 1.4, ticks: 30, dt: 0.05 },
  { label: 'СЕЙФГАРД    ', kind: MonsterKind.SAFEGUARD, dx: 1.4, ticks: 30, dt: 0.05 },
  {
    label: 'ВОДЯНОЙ     ', kind: MonsterKind.VODYANOY_KOSHMAR, dx: 4, ticks: 400, dt: 0.05, water: true,
    step: (world, threat, target, dt, time, msgs, state) => {
      updateVodyanoyWaterPressureLine(world, threat, target, dt, time, msgs, PLAYER_ID, state);
    },
  },
  {
    label: 'СЛЕПОГЛАЗ.ЛУЧ', kind: MonsterKind.SLEPOGLAZ, dx: 6, ticks: 60, dt: 0.1,
    // Двое в полосе (ближе цели и за ней), один вне полосы по перпендикуляру.
    extras: [[7, 0.3], [9, -0.4], [7, 2.5]],
  },
  { label: 'СЛЕПОГЛАЗ.НЕРВ', kind: MonsterKind.SLEPOGLAZ, dx: 1.0, ticks: 20, dt: 0.1 },
  { label: 'ТОНКАЯ ТЕНЬ ', kind: MonsterKind.TONKAYA_TEN, dx: 2.0, ticks: 4, dt: 0.1, prime: tonkayaPrime },
  { label: 'ТРЕСКОТНИК  ', kind: MonsterKind.TRESKOTNIK, dx: 5, ticks: 90, dt: 1 / 60 },
];

for (const strike of STRIKES) for (const spec of VICTIMS) run(strike, spec);
