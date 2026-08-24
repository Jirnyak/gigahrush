/* Откат атаки убывает В ОДНОЙ ТОЧКЕ и у всех.
 *
 * Убыль `attackCd` жила по видовым веткам и срабатывала только в тех кадрах,
 * где тварь уже дотянулась до цели. Бродящий монстр поэтому не отпускал откат
 * НИКОГДА: контакт со створкой (`actorContactDoor`) гейтится тем же откатом и
 * сам же его взводит, так что первый удар в дверь оказывался и последним.
 *
 * Тесты закрывают три стороны одного правила:
 *   1. откат убывает у того, у кого нет цели вовсе;
 *   2. один кадр снимает РОВНО dt — второй убыли не осталось ни у кого
 *      (двойная убыль удвоила бы темп атак и молча сдвинула бой);
 *   3. игрок и сетевой пир НЕ получают из цикла третью убыль — у них своя;
 *   4. тварь, упершаяся в обычную закрытую створку, доламывает её.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, DoorState, EntityType, Faction, MonsterKind,
  type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { seedGlobalRng } from '../src/core/rand';
import { MONSTERS } from '../src/entities/monster';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { updateAI } from '../src/systems/ai';
import { actorContactDoor } from '../src/systems/door_state';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState } from './helpers';

const DT = 1 / 60;

function openRoom(cx: number, cy: number, radius: number): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      world.set(world.wrap(x), world.wrap(y), Cell.FLOOR);
    }
  }
  world.cellVersion++;
  return world;
}

function monster(id: number, kind: MonsterKind, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  const def = MONSTERS[kind];
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function citizen(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 2,
    sprite: 0,
    hp: 100000,
    maxHp: 100000,
    faction: Faction.CITIZEN,
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function stepAi(world: World, entities: Entity[], tick: number, time: number): void {
  rebuildEntityIndexForSimulation(entities, tick);
  updateAI(
    world, entities, DT, time, [] as Msg[], -1,
    { hour: 8, minute: 0, totalMinutes: 480 }, false, { v: 9000 }, 0,
    makeGameState({ time, currentZ: 0 }),
  );
}

/* ── 1. Откат убывает и без цели ─────────────────────────────────── */

test('откат атаки бродящего монстра убывает сам, без цели и без контакта', () => {
  seedGlobalRng(11);
  const world = openRoom(40, 40, 6);
  const beast = monster(1, MonsterKind.SBORKA, 40.5, 40.5, { attackCd: 1 });
  const entities = [beast];

  let time = 0;
  for (let tick = 0; tick < 90; tick++) {
    stepAi(world, entities, tick, time);
    time += DT;
  }

  assert.equal(
    beast.attackCd, 0,
    `бродящий монстр держит откат ${beast.attackCd} после 1.5 с — убыли вне боя нет`,
  );
});

/* ── 2. Ровно dt за кадр, ни у кого не вдвое ─────────────────────── */

const TEMPO_KINDS: MonsterKind[] = [
  MonsterKind.SBORKA,
  MonsterKind.TVAR,
  MonsterKind.ZOMBIE,
  MonsterKind.POLZUN,
  MonsterKind.KOSTOREZ,
  MonsterKind.SLEPOGLAZ,
  MonsterKind.TRESKOTNIK,
];

test('один кадр снимает с отката ровно dt — второй убыли не осталось', () => {
  for (const kind of TEMPO_KINDS) {
    seedGlobalRng(23);
    const world = openRoom(40, 40, 6);
    const beast = monster(1, kind, 40.5, 40.5, { attackCd: 1 });
    // Жертва вплотную: старая убыль жила ровно в этих ветках, и без контакта
    // тест не отличил бы «убыли нет» от «убыль одна».
    const victim = citizen(2, 41.0, 40.5);
    const entities = [beast, victim];

    stepAi(world, entities, 0, 0);

    assert.ok(
      Math.abs((beast.attackCd ?? 0) - (1 - DT)) < 1e-9,
      `${MonsterKind[kind]}: за кадр откат ушёл 1 → ${beast.attackCd}, ожидалось ${1 - DT}`,
    );
  }
});

/* ── 3. Игроку и пиру третья убыль не достаётся ──────────────────── */

test('цикл AI не трогает откат игрока и сетевого пира — у них своя убыль', () => {
  seedGlobalRng(29);
  const world = openRoom(40, 40, 6);
  // Тело игрока и тело пира — обычные люди со строкой `ai`: они попадают в
  // индекс думающих. Откат им тикают `movePlayer` / `hostTickRemoteActor`,
  // поэтому цикл обязан пройти мимо, иначе темп стрельбы удвоится ровно у них.
  const hero: Entity = { ...citizen(1, 40.5, 40.5), persistentNpcId: 'player', attackCd: 1 };
  const peer: Entity = { ...citizen(2, 42.5, 40.5), peerSlot: 0, attackCd: 1 };
  const beast = monster(3, MonsterKind.SBORKA, 44.5, 40.5, { attackCd: 1 });
  const entities = [hero, peer, beast];

  setCurrentPlayerEntity(hero);
  try {
    stepAi(world, entities, 0, 0);
  } finally {
    setCurrentPlayerEntity(undefined);
  }

  assert.equal(hero.attackCd, 1, 'игроку убыль из цикла AI не полагается');
  assert.equal(peer.attackCd, 1, 'пиру убыль из цикла AI не полагается');
  assert.ok(
    Math.abs((beast.attackCd ?? 0) - (1 - DT)) < 1e-9,
    `а обычному актору полагается: ${beast.attackCd}`,
  );
});

/* ── 4. Створка ломается, а не переживает один удар ──────────────── */

test('монстр, упершийся в обычную закрытую створку, доламывает её', () => {
  seedGlobalRng(37);
  const world = openRoom(40, 40, 6);
  const doorIdx = world.idx(42, 40);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, {
    idx: doorIdx, state: DoorState.CLOSED, roomA: -1, roomB: -1, keyId: '', timer: 0,
  });
  world.cellVersion++;

  const beast = monster(1, MonsterKind.SBORKA, 41.5, 40.5, { attackCd: 0 });
  const entities = [beast];

  let time = 0;
  let hits = 0;
  const limit = 60 * 60; // минута симуляции — с запасом на любой темп удара
  for (let tick = 0; tick < limit && world.doors.has(doorIdx); tick++) {
    stepAi(world, entities, tick, time);
    // Тварь физически прижата к створке: движение сюда не тащим, проверяется
    // политика контакта, а не поиск пути.
    beast.x = 41.5;
    beast.y = 40.5;
    const hpBefore = world.doors.get(doorIdx)?.hp;
    actorContactDoor(world, beast, doorIdx);
    const hpAfter = world.doors.get(doorIdx)?.hp;
    // `actorContactDoor` возвращает true только на ЛОМАЮЩЕМ ударе, поэтому
    // замахи считаются по просадке здоровья створки.
    if (hpAfter === undefined || hpAfter < (hpBefore ?? Infinity)) hits++;
    time += DT;
  }

  assert.equal(world.doors.has(doorIdx), false, `створка выстояла ${hits} ударов за минуту`);
  assert.ok(hits > 1, `монстр ударил створку ${hits} раз(а) — откат так и не отпустил`);
  assert.equal(world.cells[doorIdx], Cell.FLOOR, 'сломанная створка обязана оставить дыру');
});
