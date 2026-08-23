/* Балансировка интереса к комнате (`rooms.md`).
 *
 * Замок не на конкретное число, а на форму распределения: люди в разных
 * состояниях расходятся по разным комнатам, никакой канал не перетягивает
 * всех на себя, и — отдельно — очень сильная нужда обязана перебить начатое
 * дело, а терпеливое дело перебить путь не вправе.
 *
 * Ничью решает физика: при равном интересе идут в БЛИЖНЮЮ комнату, а между
 * равными по интересу и расстоянию — джиттер личности, а не номер в массиве.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, Occupation, RoomType, ZoneFaction,
  type Entity, type GameClock,
} from '../src/core/types';
import { World } from '../src/core/world';
import { setPathContext } from '../src/systems/ai/pathfinding';
import { setNpcContext, updateNPC } from '../src/systems/ai/npc_fsm';
import {
  npcUtilityEmergencyScore,
  npcUtilityIntentPatience,
} from '../src/systems/ai/npc_utility';
import {
  actorDrive, forgetActorBrain, setActorCoreContext, tickActorBrain,
} from '../src/systems/actor/brain';
import { DRIVE_BY_ID } from '../src/systems/actor/drives';
import { rebuildCrowdIndex } from '../src/world/crowd_index';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { addTestRoom, makeTestPlayer } from './helpers';

const CROWD = 64;
const OCCUPATIONS = [
  Occupation.MECHANIC, Occupation.DOCTOR, Occupation.CLERK, Occupation.HOUSEWIFE,
  Occupation.TEACHER, Occupation.COOK, Occupation.ENGINEER, Occupation.CLEANER,
];
const ALL_ROOM_TYPES = [
  RoomType.LIVING, RoomType.KITCHEN, RoomType.BATHROOM, RoomType.STORAGE,
  RoomType.MEDICAL, RoomType.COMMON, RoomType.CLASSROOM, RoomType.PRODUCTION,
  RoomType.CORRIDOR, RoomType.SMOKING, RoomType.OFFICE, RoomType.HQ,
];

function makeOpenFloor(): World {
  const world = new World();
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.factionControl[idx] = ZoneFaction.CITIZEN;
    }
  }
  return world;
}

/** Этаж-город: по два экземпляра каждой деятельности кольцом вокруг центра. */
function makeTownFloor(): World {
  const world = makeOpenFloor();
  ALL_ROOM_TYPES.forEach((type, i) => {
    for (let copy = 0; copy < 2; copy++) {
      const slot = i * 2 + copy;
      const angle = (slot / (ALL_ROOM_TYPES.length * 2)) * Math.PI * 2;
      addTestRoom(world, {
        id: slot + 1,
        type,
        x: Math.round(64 + Math.cos(angle) * (28 + copy * 14)) - 3,
        y: Math.round(64 + Math.sin(angle) * (28 + copy * 14)) - 3,
        w: 6, h: 6,
        zoneId: slot + 1,
        zoneFaction: ZoneFaction.CITIZEN,
      });
    }
  });
  return world;
}

function makeNpc(id: number, needs: Entity['needs'], overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x: 64.5,
    y: 64.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    occupation: OCCUPATIONS[id % OCCUPATIONS.length],
    alifeId: 4000 + id,
    needs,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function tick(world: World, npc: Entity, minutes: number, hour: number): void {
  const entities = [makeTestPlayer({ id: 1, x: 126, y: 126 }), npc];
  rebuildEntityIndexForSimulation(entities, minutes);
  setPathContext([], minutes);
  setNpcContext([], minutes, 0);
  const clock: GameClock = { hour, minute: 0, totalMinutes: minutes };
  updateNPC(world, entities, npc, 0, minutes, clock, false);
}

/* ── Тело выбирает комнату из ядра актора ─────────────────────────────────
 *
 * Голод, жажда, сон, туалет и лечение живут в `systems/actor`, поэтому все
 * телесные проверки гоняют цикл ЯДРА. Ядро решает по своей паузе,
 * расфазированной от `id` и выведенной из такта полей (не больше четырёх
 * секунд), а исполняет каждый кадр — одного такта не хватит ни на решение, ни
 * на дорогу. Прежний слой остаётся здесь только там, где речь о его рутине:
 * человек БЕЗ нужд ядру неинтересен, и разводит таких по этажу именно рутина.
 */
const CORE_DT = 0.5;
const CORE_DECIDE_STEPS = Math.ceil(4 / CORE_DT) + 1;

/** Такты ядра начиная с `from`. Решение НЕ сбрасывается: дело продолжается. */
function coreSteps(
  world: World, npc: Entity, entities: readonly Entity[], from: number, steps: number,
): number {
  for (let step = 0; step < steps; step++) {
    const now = from + step * CORE_DT;
    rebuildEntityIndexForSimulation(entities as Entity[], now);
    rebuildCrowdIndex(world, entities, now);
    setPathContext([], now);
    tickActorBrain(world, npc, CORE_DT, now);
  }
  return from + steps * CORE_DT;
}

function tickCore(world: World, npc: Entity, bystanders: readonly Entity[] = []): void {
  const entities = [makeTestPlayer({ id: 1, x: 126, y: 126 }), ...bystanders, npc];
  forgetActorBrain(npc);
  setActorCoreContext(0);
  coreSteps(world, npc, entities, 0, CORE_DECIDE_STEPS);
}

/** Куда разошлась толпа одинаково настроенных людей: тип комнаты → сколько. */
function targetRoomHistogram(
  world: World,
  needs: Entity['needs'],
  hour: number,
  hp = 50,
  body = true,
): Map<RoomType, number> {
  const hist = new Map<RoomType, number>();
  for (let i = 0; i < CROWD; i++) {
    const npc = makeNpc(i, { ...needs! }, { hp });
    if (body) tickCore(world, npc);
    else tick(world, npc, hour * 60, hour);
    const room = world.roomAt(npc.ai?.tx ?? -1, npc.ai?.ty ?? -1);
    if (room) hist.set(room.type, (hist.get(room.type) ?? 0) + 1);
  }
  return hist;
}

function dominant(hist: Map<RoomType, number>): [RoomType, number] {
  let best: [RoomType, number] = [RoomType.CORRIDOR, 0];
  for (const entry of hist) if (entry[1] > best[1]) best = entry;
  return best;
}

test('нужда ведёт в свою комнату: голод на кухню, мочевой в санузел, рана в медпункт', () => {
  const world = makeTownFloor();
  const cases: [string, Entity['needs'], number, RoomType][] = [
    ['голод', { food: 3, water: 90, sleep: 90, pee: 5, poo: 5 }, 50, RoomType.KITCHEN],
    ['жажда', { food: 90, water: 2, sleep: 90, pee: 5, poo: 5 }, 50, RoomType.KITCHEN],
    ['мочевой', { food: 90, water: 90, sleep: 90, pee: 99, poo: 90 }, 50, RoomType.BATHROOM],
    ['рана', { food: 90, water: 90, sleep: 90, pee: 5, poo: 5 }, 6, RoomType.MEDICAL],
  ];
  for (const [label, needs, hp, expected] of cases) {
    const hist = targetRoomHistogram(world, needs, 12, hp);
    const [type, count] = dominant(hist);
    assert.equal(type, expected, `${label}: ожидалась своя комната`);
    assert.ok(count >= CROWD * 0.75, `${label}: нужда должна вести уверенно, а не еле-еле`);
  }
});

test('сонного ночью ведёт домой, а не на работу', () => {
  const world = makeTownFloor();
  const hist = targetRoomHistogram(world, { food: 90, water: 90, sleep: 4, pee: 5, poo: 5 }, 2);
  assert.equal(dominant(hist)[0], RoomType.LIVING);
});

test('без нужды люди расходятся, а не прут в одну комнату', () => {
  const world = makeTownFloor();
  // Без нужд ядро актора актора не берёт — разводит по этажу рутина прежнего слоя.
  const hist = targetRoomHistogram(world, { food: 95, water: 95, sleep: 90, pee: 5, poo: 5 }, 12, 50, false);
  const [, top] = dominant(hist);

  assert.ok(hist.size >= 4, `сытые должны разойтись хотя бы по четырём деятельностям, а разошлись по ${hist.size}`);
  assert.ok(top <= CROWD * 0.6, `самая людная деятельность забрала ${top} из ${CROWD} — канал перетягивает всех на себя`);
});

test('при равном интересе идут в ближнюю комнату, а не в одну и ту же', () => {
  const world = makeOpenFloor();
  const kitchens = [
    addTestRoom(world, { id: 1, type: RoomType.KITCHEN, x: 10, y: 10, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN }),
    addTestRoom(world, { id: 2, type: RoomType.KITCHEN, x: 100, y: 10, w: 6, h: 6, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN }),
    addTestRoom(world, { id: 3, type: RoomType.KITCHEN, x: 10, y: 100, w: 6, h: 6, zoneId: 3, zoneFaction: ZoneFaction.CITIZEN }),
    addTestRoom(world, { id: 4, type: RoomType.KITCHEN, x: 100, y: 100, w: 6, h: 6, zoneId: 4, zoneFaction: ZoneFaction.CITIZEN }),
  ];
  let ownNearest = 0;
  const used = new Set<number>();
  for (let i = 0; i < CROWD; i++) {
    const x = 8 + (i % 8) * 16 + 0.5;
    const y = 8 + Math.floor(i / 8) * 16 + 0.5;
    const npc = makeNpc(i, { food: 3, water: 90, sleep: 90, pee: 5, poo: 5 }, { x, y });
    tickCore(world, npc);
    const room = world.roomAt(npc.ai?.tx ?? -1, npc.ai?.ty ?? -1);
    if (!room) continue;
    used.add(room.id);
    let nearest = kitchens[0];
    let best = Infinity;
    for (const kitchen of kitchens) {
      const d = world.dist2(x, y, kitchen.x + kitchen.w / 2, kitchen.y + kitchen.h / 2);
      if (d < best) { best = d; nearest = kitchen; }
    }
    if (room.id === nearest.id) ownNearest++;
  }

  assert.equal(used.size, kitchens.length, 'все четыре кухни должны быть кому-то ближайшими');
  assert.ok(ownNearest >= CROWD * 0.85, `в свою ближнюю пошли только ${ownNearest} из ${CROWD}`);
});

test('ровную ничью решает личность, а не номер комнаты в массиве', () => {
  const world = makeOpenFloor();
  addTestRoom(world, { id: 1, type: RoomType.KITCHEN, x: 34, y: 61, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  addTestRoom(world, { id: 2, type: RoomType.KITCHEN, x: 88, y: 61, w: 6, h: 6, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });

  const hist = new Map<number, number>();
  for (let i = 0; i < CROWD; i++) {
    const npc = makeNpc(i, { food: 3, water: 90, sleep: 90, pee: 5, poo: 5 });
    tickCore(world, npc);
    const room = world.roomAt(npc.ai?.tx ?? -1, npc.ai?.ty ?? -1);
    if (room) hist.set(room.id, (hist.get(room.id) ?? 0) + 1);
  }

  const first = hist.get(1) ?? 0;
  const second = hist.get(2) ?? 0;
  assert.equal(first + second, CROWD);
  assert.ok(Math.min(first, second) >= CROWD * 0.25, `две одинаковые кухни разделили толпу ${first}/${second} — ничью решает не личность`);
});

test('забитая комната тянет слабее пустой, хоть и ближе', () => {
  const world = makeOpenFloor();
  const packed = addTestRoom(world, { id: 1, type: RoomType.KITCHEN, x: 44, y: 61, w: 6, h: 6, zoneId: 1, zoneFaction: ZoneFaction.CITIZEN });
  const empty = addTestRoom(world, { id: 2, type: RoomType.KITCHEN, x: 88, y: 61, w: 6, h: 6, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });

  // Ближняя кухня уже занята: двадцать человек стоят в ней.
  const standing: Entity[] = [];
  for (let i = 0; i < 20; i++) {
    standing.push(makeNpc(500 + i, { food: 90, water: 90, sleep: 90, pee: 0, poo: 0 }, {
      x: packed.x + 1 + (i % 5) + 0.5,
      y: packed.y + 1 + Math.floor(i / 5) + 0.5,
    }));
  }

  let choseEmpty = 0;
  for (let i = 0; i < 16; i++) {
    const npc = makeNpc(i, { food: 3, water: 90, sleep: 90, pee: 5, poo: 5 });
    tickCore(world, npc, standing);
    const room = world.roomAt(npc.ai?.tx ?? -1, npc.ai?.ty ?? -1);
    if (room?.id === empty.id) choseEmpty++;
  }

  assert.ok(choseEmpty >= 12, `в пустую дальнюю кухню пошли только ${choseEmpty} из 16 — забитость не считается контекстом`);
});

test('на большом этаже отбирает ближних, а не начало массива', () => {
  const world = makeOpenFloor();
  // Двести комнат-пустышек занимают начало массива и всё окно старого скана.
  for (let id = 1; id <= 200; id++) {
    addTestRoom(world, {
      id,
      type: RoomType.LIVING,
      x: (id % 20) * 6,
      y: Math.floor(id / 20) * 6,
      w: 4, h: 4,
      zoneId: id,
      zoneFaction: ZoneFaction.CITIZEN,
    });
  }
  // Дальняя кухня стоит в самом начале массива, ближняя — в самом конце.
  const far = addTestRoom(world, { id: 2, type: RoomType.KITCHEN, x: 4, y: 4, w: 5, h: 5, zoneId: 2, zoneFaction: ZoneFaction.CITIZEN });
  const near = addTestRoom(world, { id: 260, type: RoomType.KITCHEN, x: 70, y: 66, w: 5, h: 5, zoneId: 260, zoneFaction: ZoneFaction.CITIZEN });

  let choseNear = 0;
  for (let i = 0; i < 16; i++) {
    const npc = makeNpc(i, { food: 3, water: 90, sleep: 90, pee: 5, poo: 5 });
    tickCore(world, npc);
    const room = world.roomAt(npc.ai?.tx ?? -1, npc.ai?.ty ?? -1);
    if (room?.id === near.id) choseNear++;
  }

  assert.ok(world.dist2(64.5, 64.5, near.x + 2, near.y + 2) < world.dist2(64.5, 64.5, far.x + 2, far.y + 2));
  assert.equal(choseNear, 16, `в ближнюю кухню с последним номером пошли ${choseNear} из 16 — отбор идёт по массиву, а не по расстоянию`);
});

test('терпение выводится числом на намерение, а не списком срочных дел', () => {
  // Угроза срочна сразу, работа — почти никогда; порог растёт вместе с терпением.
  assert.equal(npcUtilityIntentPatience('flee'), 0);
  assert.ok(npcUtilityIntentPatience('faction_assault') < npcUtilityIntentPatience('social'));
  assert.ok(npcUtilityIntentPatience('social') < npcUtilityIntentPatience('work'));
  assert.ok(npcUtilityIntentPatience('work') < npcUtilityIntentPatience('wander'));
  assert.ok(npcUtilityEmergencyScore('flee') < npcUtilityEmergencyScore('social'));
  assert.ok(npcUtilityEmergencyScore('social') < npcUtilityEmergencyScore('work'));
  assert.ok(npcUtilityEmergencyScore('work') > 90, 'работа обязана набрать почти предельный счёт, чтобы стать срочной');

  /* Телесная половина закона уехала в ядро актора вместе с самим телом, и там
   * терпение выражено СВОИМ числом на драйв — сроком удержания. Порядок тот же:
   * мочевой терпит хуже сна, а лечиться человек будет дольше, чем облегчаться. */
  assert.ok(DRIVE_BY_ID.toilet.holdSec < DRIVE_BY_ID.heal.holdSec);
  assert.ok(DRIVE_BY_ID.heal.holdSec < DRIVE_BY_ID.sleep.holdSec);
});

/* Дело начато телом же: человека клонит в сон, и он идёт спать. Дальше проверка
 * та же, что и была, — лопнувший мочевой обязан сорвать его с дела, а лёгкий
 * голод не вправе. В ядре актора это не два списка «срочное/терпеливое», а одна
 * физика: удержание начатого драйва (`holdSec`) плюс надбавка действующему, и
 * поверх — сама величина тяги. Лёгкий голод не срывает никого не по запрету, а
 * потому, что при 62 из 100 давление голода ещё РОВНО НОЛЬ: кривая нужды
 * начинает расти только под порогом. */
test('лопнувший мочевой перебивает начатое дело, а лёгкий голод — нет', () => {
  const world = makeTownFloor();
  const HOLD_STEPS = Math.ceil(DRIVE_BY_ID.sleep.holdSec * 2 / CORE_DT);
  let ranToToilet = 0;
  let keptSleeping = 0;

  for (let i = 0; i < 16; i++) {
    const npc = makeNpc(i, { food: 90, water: 90, sleep: 30, pee: 5, poo: 5 });
    const entities = [makeTestPlayer({ id: 1, x: 126, y: 126 }), npc];
    forgetActorBrain(npc);
    setActorCoreContext(0);
    let now = coreSteps(world, npc, entities, 0, CORE_DECIDE_STEPS);
    assert.equal(actorDrive(npc), 'sleep', 'дело должно начаться со сна');

    npc.needs!.pee = 100;
    npc.needs!.poo = 100;
    coreSteps(world, npc, entities, now, HOLD_STEPS);
    if (actorDrive(npc) === 'toilet') ranToToilet++;
  }

  for (let i = 0; i < 16; i++) {
    const npc = makeNpc(i, { food: 90, water: 90, sleep: 30, pee: 5, poo: 5 });
    const entities = [makeTestPlayer({ id: 1, x: 126, y: 126 }), npc];
    forgetActorBrain(npc);
    setActorCoreContext(0);
    const now = coreSteps(world, npc, entities, 0, CORE_DECIDE_STEPS);
    assert.equal(actorDrive(npc), 'sleep');

    // Лёгкий голод: дело терпит, начатое бросать не за чем.
    npc.needs!.food = 62;
    coreSteps(world, npc, entities, now, HOLD_STEPS);
    if (actorDrive(npc) === 'sleep') keptSleeping++;
  }

  assert.equal(ranToToilet, 16, 'с лопнувшим мочевым обязаны бросить дело и бежать');
  assert.ok(keptSleeping >= 14, `лёгкий голод сорвал с дела ${16 - keptSleeping} человек из 16`);
});
