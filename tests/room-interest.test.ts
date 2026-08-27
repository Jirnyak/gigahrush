/* Замок контекстной машины интереса к комнате (`rooms.md`).
 *
 * Проверяется не «куда именно пошёл житель», а то, что решение о комнате
 * складывается независимыми каналами и что каждый из них доходит до ног:
 * нужда, память комнаты, ремесло, новизна. Белого списка типов больше нет —
 * годность даёт сумма, а не литеральный перечень в обработчике.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, Occupation, RoomType, ZoneFaction,
  type Entity, type GameClock, type WorldEvent,
} from '../src/core/types';
import { World } from '../src/core/world';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext } from '../src/systems/ai/npc_fsm';
import {
  actorDrive, forgetActorBrain, setActorCoreContext, tickActorBrain,
} from '../src/systems/actor/brain';
import { rebuildCrowdIndex } from '../src/world/crowd_index';
import { clearRoomMemory, recordRoomMemoryEvent } from '../src/systems/room_memory';

/** Цель рутины — СВОЯ точка внутри комнаты, а не её центр: `roomTargetCell`
 *  разводит жильцов по площади, иначе центр комнаты работает аттрактором и вся
 *  рутина этажа сходится в одну клетку. Проверяется выбор КОМНАТЫ, поэтому
 *  сверяется попадание цели в её прямоугольник, а не конкретная клетка. */
function assertTargetInRoom(
  npc: Entity,
  room: { x: number; y: number; w: number; h: number },
  message?: string,
): void {
  const tx = npc.ai?.tx ?? -1;
  const ty = npc.ai?.ty ?? -1;
  assert.ok(
    tx > room.x && tx < room.x + room.w && ty > room.y && ty < room.y + room.h,
    `${message ?? 'цель должна лежать в выбранной комнате'}: цель (${tx}, ${ty}), `
    + `комната [${room.x}..${room.x + room.w}) x [${room.y}..${room.y + room.h})`,
  );
}

import {
  npcUtilityRoomInterest,
  scoreNpcUtilityTargetPreference,
  type NpcUtilityTargetPreferenceContext,
} from '../src/systems/ai/npc_utility';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeTestPlayer } from './helpers';

const TEST_Z = 0;
const FULL_NEEDS = { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 };

function makeInterestWorld(): World {
  const world = new World();
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  return world;
}

function makeNpc(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 8.5,
    y: 8.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    occupation: Occupation.MECHANIC,
    needs: { ...FULL_NEEDS },
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

/* Тело уехало в ядро актора: тягу «пить» считает `systems/actor`, а не рутина
 * прежнего слоя. Гонять надо цикл ядра, поэтому здесь два такта — первый только
 * разводит момент решения по паузе (она расфазирована от `id`), второй решает и
 * ведёт. Пауза выведена из такта полей и не превышает четырёх секунд. */
const ACTOR_DECIDE_MAX_SEC = 4;

function tickNpc(world: World, npc: Entity, clock: GameClock = { hour: 9, minute: 0, totalMinutes: 540 }): void {
  const player = makeTestPlayer({ id: 1, x: 90, y: 90 });
  const entities = [player, npc];
  forgetActorBrain(npc);
  setActorCoreContext(TEST_Z);
  for (let step = 0; step <= 1; step++) {
    const now = step * ACTOR_DECIDE_MAX_SEC;
    rebuildEntityIndexForSimulation(entities, clock.totalMinutes + step);
    rebuildCrowdIndex(world, entities, now);
    setPathContext([], now);
    setNpcContext([], now, TEST_Z);
    tickActorBrain(world, npc, 1 / 60, now);
  }
}

function rememberCombat(roomId: number, severity = 5): void {
  const event: WorldEvent = {
    id: 1,
    type: 'player_kill_npc',
    time: 100,
    day: 1,
    hour: 9,
    minute: 0,
    z: TEST_Z,
    roomId,
    actorId: 0,
    actorFaction: Faction.PLAYER,
    severity: severity as WorldEvent['severity'],
    privacy: 'public',
    tags: ['combat'],
  } as WorldEvent;
  assert.ok(recordRoomMemoryEvent(event), 'событие должно осесть в памяти комнаты');
}

function context(overrides: Partial<NpcUtilityTargetPreferenceContext> = {}): NpcUtilityTargetPreferenceContext {
  return { intent: 'wander', ...overrides };
}

test('комната интересна суммой того, что в ней закроется, а не одним намерением', () => {
  const hungryThirsty = context({ needs: { food: 4, water: 4, sleep: 100, pee: 0, poo: 0 } });
  const kitchen = npcUtilityRoomInterest(RoomType.KITCHEN, hungryThirsty);
  const common = npcUtilityRoomInterest(RoomType.COMMON, hungryThirsty);
  const sated = npcUtilityRoomInterest(RoomType.KITCHEN, context({ needs: FULL_NEEDS }));

  // Намерение здесь ни при чём: у кухни нет веса под «гулять». Тянет то,
  // что человек в ней закроет — еда и вода сразу.
  assert.ok(kitchen > common, 'кухня должна перевесить общий зал у голодного и жаждущего');
  assert.ok(kitchen > sated, 'сытому кухня интересна меньше, чем голодному');
  assert.equal(sated, 0, 'без нужд и ремесла кухня под «гулять» не тянет ничем');
});

test('раненого тянет в медпункт даже под чужим намерением', () => {
  const hurt = context({ intent: 'social', hp: 8, maxHp: 100 });
  const healthy = context({ intent: 'social', hp: 100, maxHp: 100 });

  assert.ok(npcUtilityRoomInterest(RoomType.MEDICAL, hurt) > npcUtilityRoomInterest(RoomType.MEDICAL, healthy));
});

test('ремесло водит ноги: врача тянет в медпункт и на склад, механика — нет', () => {
  const doctor = context({ occupation: Occupation.DOCTOR });
  const mechanic = context({ occupation: Occupation.MECHANIC });

  assert.ok(npcUtilityRoomInterest(RoomType.MEDICAL, doctor) > 0);
  assert.ok(npcUtilityRoomInterest(RoomType.STORAGE, doctor) > 0);
  assert.equal(npcUtilityRoomInterest(RoomType.MEDICAL, mechanic), 0);
  // Первая комната ремесла тянет сильнее второй, а не наравне.
  assert.ok(npcUtilityRoomInterest(RoomType.MEDICAL, doctor) > npcUtilityRoomInterest(RoomType.STORAGE, doctor));
});

test('белого списка типов нет: годность даёт таблица, а не перечень в обработчике', () => {
  // Обе комнаты раньше отсекались литеральными списками в npc_fsm: класс не
  // входил ни в один social-перечень, коридор — ни в один wander-перечень.
  assert.ok(npcUtilityRoomInterest(RoomType.CLASSROOM, context({ intent: 'social' })) > 0);
  assert.ok(npcUtilityRoomInterest(RoomType.CORRIDOR, context({ intent: 'wander' })) > 0);
});

test('память комнаты складывается каналом: враждебная отталкивает, тайник тянет рисковых', () => {
  clearRoomMemory();
  // Назначение называется прямо: телесных намерений у этого слоя больше нет,
  // но канал памяти складывается с весом назначения ровно как раньше.
  const clean = npcUtilityRoomInterest(RoomType.KITCHEN, context({ affordance: 'eat' }));
  const hostile = npcUtilityRoomInterest(RoomType.KITCHEN, context({ affordance: 'eat' }), { hostile: true, severity: 5 });
  const faded = npcUtilityRoomInterest(RoomType.KITCHEN, context({ affordance: 'eat' }), { hostile: true, severity: 1 });
  const helpful = npcUtilityRoomInterest(RoomType.KITCHEN, context({ affordance: 'eat' }), { helpful: true, severity: 5 });

  assert.ok(hostile < clean, 'где при нём убивали — тянет меньше');
  assert.ok(hostile < faded, 'свежая тяжёлая память отталкивает сильнее выцветшей');
  assert.ok(helpful > clean, 'где помогали — тянет больше');

  const stash = { stash: true, severity: 4 };
  const risky = npcUtilityRoomInterest(RoomType.STORAGE, context({ faction: Faction.LIQUIDATOR }), stash);
  const cautious = npcUtilityRoomInterest(RoomType.STORAGE, context({ faction: Faction.CITIZEN }), stash);
  assert.ok(risky > cautious, 'слух о запасе тянет ровно настолько, насколько человек рисковый');
});

test('новизна входит весом, а не запретом на повтор', () => {
  const base = { id: 7, roomId: 7, roomType: RoomType.COMMON, distance: 10 };
  const fresh = scoreNpcUtilityTargetPreference({ ...base, novelty: 1 }, context());
  const stale = scoreNpcUtilityTargetPreference({ ...base, novelty: 0 }, context());

  assert.ok(fresh > stale, 'куда давно не ходил — интереснее');
  // Разница не должна перебивать саму комнату: это канал, а не переключатель.
  assert.ok(fresh - stale < 12);
});

test('память комнаты доходит до ног: жаждущий обходит кухню, где при нём убивали', () => {
  clearRoomMemory();
  const world = makeInterestWorld();
  const bloody = addTestRoom(world, { id: 1, x: 14, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  const quiet = addTestRoom(world, { id: 2, x: 46, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  rememberCombat(bloody.id);

  const npc = makeNpc(21, { needs: { ...FULL_NEEDS, water: 0 } });
  tickNpc(world, npc);

  assert.equal(actorDrive(npc), 'drink');
  assertTargetInRoom(npc, quiet, 'дальняя тихая кухня должна перевесить ближнюю с памятью о крови');
  clearRoomMemory();
});

test('без памяти о крови жаждущий идёт в ближнюю кухню', () => {
  clearRoomMemory();
  const world = makeInterestWorld();
  const near = addTestRoom(world, { id: 1, x: 14, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  addTestRoom(world, { id: 2, x: 46, y: 8, w: 5, h: 5, type: RoomType.KITCHEN, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });

  const npc = makeNpc(22, { needs: { ...FULL_NEEDS, water: 0 } });
  tickNpc(world, npc);

  assert.equal(actorDrive(npc), 'drink');
  assertTargetInRoom(npc, near, 'контроль: без памяти выигрывает ближняя');
});
