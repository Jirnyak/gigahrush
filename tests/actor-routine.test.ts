import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, NpcState, Occupation, RoomType, Tex,
} from '../src/core/types';
import { World } from '../src/core/world';
import { initFactionRelations } from '../src/data/relations';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { prewarmNavigationTree } from '../src/systems/ai/pathfinding';
import {
  FIELD_VALUE_MAX, FieldChannel, depositDanger, resetPerceptionFieldsState,
  prewarmPerceptionFields,
} from '../src/systems/fields';
import { actorDrive, setActorCoreContext, forgetActorBrain, tickActorBrain } from '../src/systems/actor/brain';
import { DRIVE_BY_ID, scoreDrive, type DriveView } from '../src/systems/actor/drives';
import { createActorNeeds, readActorNeeds } from '../src/systems/actor/needs';
import { createActorClock, readActorClock } from '../src/systems/actor/clock';
import { createActorSenses, senseActor } from '../src/systems/actor/senses';
import { ITEMS } from '../src/data/items';
import { scanSpareInventory } from '../src/systems/npc_work';
import { addTestRoom, makeTestNpc } from './helpers';

/* Распорядок в ядре актора: часы как третий род входа, три драйва строками
 * данных и та игровая фактура, которую перенос обязан был сохранить. */

const ROOM_X = 20;
const ROOM_Y = 20;
const ROOM_W = 28;
const ROOM_H = 28;

function makeOpenWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = ROOM_Y; y < ROOM_Y + ROOM_H; y++) {
    for (let x = ROOM_X; x < ROOM_X + ROOM_W; x++) {
      const i = world.idx(x, y);
      world.cells[i] = Cell.FLOOR;
      world.wallTex[i] = Tex.CONCRETE;
      world.floorTex[i] = Tex.F_CONCRETE;
    }
  }
  world.cellVersion++;
  world.perceptionBaked = false;
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  prewarmNavigationTree(world);
  return world;
}

function makeActor(overrides: Parameters<typeof makeTestNpc>[0] = {}) {
  const e = makeTestNpc({ id: 1, x: ROOM_X + 3.5, y: ROOM_Y + 3.5, ...overrides });
  e.speed = 4;
  e.hp = 100;
  e.maxHp = 100;
  e.needs = { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 };
  e.ai = { goal: AIGoal.IDLE, tx: e.x, ty: e.y, path: [], pi: 0, stuck: 0, timer: 0 };
  forgetActorBrain(e);
  return e;
}

/** Снимок на заданный час суток: распорядок целиком висит на минуте. */
function viewAt(world: World, e: import('../src/core/types').Entity, hour: number, samosbor = false): DriveView {
  rebuildEntityIndex([e]);
  return {
    senses: senseActor(world, e, createActorSenses()),
    needs: readActorNeeds(e, createActorNeeds()),
    clock: readActorClock({ hour, minute: 0, totalMinutes: hour * 60 }, samosbor, createActorClock()),
  };
}

test('распорядок объявлен строками данных: ярус комнаты, назначение, занятие', () => {
  const rows = [
    ['work', 'work', NpcState.WORKING] as const,
    ['social', 'social', NpcState.FREE_TIME] as const,
    ['patrol', 'patrol', NpcState.PATROL] as const,
  ];
  for (const [id, affordance, state] of rows) {
    const def = DRIVE_BY_ID[id];
    assert.ok(def, `драйв ${id} не зарегистрирован`);
    assert.equal(def.tier, 'room', `${id}: распорядок ведёт НАЗНАЧЕНИЕ комнаты`);
    assert.equal(def.affordance, affordance);
    assert.equal(def.arrivedState, state);
  }
  // Патруль объявлен работой, разговоры — общением: группы не перепутаны.
  assert.equal(DRIVE_BY_ID.work.group, 'work');
  assert.equal(DRIVE_BY_ID.patrol.group, 'work');
  assert.equal(DRIVE_BY_ID.social.group, 'social');
});

test('смена начинается по часам: ночью работы нет ни у кого', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ occupation: Occupation.ENGINEER });

  const night = scoreDrive(DRIVE_BY_ID.work, viewAt(world, e, 3), Faction.CITIZEN);
  const shift = scoreDrive(DRIVE_BY_ID.work, viewAt(world, e, 10), Faction.CITIZEN);
  assert.equal(night, 0, 'в три ночи работа обязана быть нулём');
  assert.ok(shift > 0, `в смену работа обязана тянуть, а тянет ${shift}`);
});

test('смена личная: у двух людей свой сдвиг, а часы у них одни', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  // Личность берётся из alifeId — сдвиг смены выводится из неё, а не из часов.
  const early = makeActor({ id: 11 });
  early.alifeId = 4;
  const late = makeActor({ id: 12 });
  late.alifeId = 91;

  let differing = 0;
  for (const hour of [5, 6, 7, 15, 16, 17]) {
    const a = scoreDrive(DRIVE_BY_ID.work, viewAt(world, early, hour), Faction.CITIZEN);
    const b = scoreDrive(DRIVE_BY_ID.work, viewAt(world, late, hour), Faction.CITIZEN);
    if (Math.abs(a - b) > 1e-6) differing++;
  }
  assert.ok(differing >= 3, `смены не разъехались: разошлись только в ${differing} часах из шести`);
});

test('опасность гасит работу и разговоры, но ПОДНИМАЕТ обход', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ occupation: Occupation.GUARD });

  const calmWork = scoreDrive(DRIVE_BY_ID.work, viewAt(world, e, 10), Faction.LIQUIDATOR);
  const calmSocial = scoreDrive(DRIVE_BY_ID.social, viewAt(world, e, 21), Faction.CITIZEN);
  const calmPatrol = scoreDrive(DRIVE_BY_ID.patrol, viewAt(world, e, 10), Faction.LIQUIDATOR);

  depositDanger(world, e.x, e.y, FIELD_VALUE_MAX);
  const bloodyWork = scoreDrive(DRIVE_BY_ID.work, viewAt(world, e, 10), Faction.LIQUIDATOR);
  const bloodySocial = scoreDrive(DRIVE_BY_ID.social, viewAt(world, e, 21), Faction.CITIZEN);
  const bloodyPatrol = scoreDrive(DRIVE_BY_ID.patrol, viewAt(world, e, 10), Faction.LIQUIDATOR);

  assert.ok(bloodyWork < calmWork, `под кровью работа не просела: ${calmWork} → ${bloodyWork}`);
  assert.ok(bloodySocial < calmSocial, `под кровью разговоры не просели: ${calmSocial} → ${bloodySocial}`);
  assert.ok(bloodyPatrol > calmPatrol, `обход не поднялся тревогой: ${calmPatrol} → ${bloodyPatrol}`);
});

test('самосбор отменяет смену и разговоры, но не обход', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ occupation: Occupation.CLERK });
  assert.equal(scoreDrive(DRIVE_BY_ID.work, viewAt(world, e, 10, true), Faction.CITIZEN), 0);
  assert.equal(scoreDrive(DRIVE_BY_ID.social, viewAt(world, e, 21, true), Faction.CITIZEN), 0);
  assert.ok(scoreDrive(DRIVE_BY_ID.patrol, viewAt(world, e, 10, true), Faction.LIQUIDATOR) > 0);
});

test('распорядка у твари нет, и выключен он ВЕСОМ, а не веткой', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const beast = makeActor({ id: 21 });
  beast.type = EntityType.MONSTER;
  const v = viewAt(world, beast, 10);
  // Тот же снимок, та же формула — разводит только порода.
  for (const id of ['work', 'social', 'patrol'] as const) {
    assert.equal(scoreDrive(DRIVE_BY_ID[id], v, 'beast'), 0, `${id}: тварь взялась за людское дело`);
    assert.ok(scoreDrive(DRIVE_BY_ID[id], v, Faction.CITIZEN) > 0, `${id}: у человека тот же снимок дал ноль`);
  }
});

test('в смену человек доходит до комнаты, которая умеет работать', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const shop = addTestRoom(world, {
    id: 1, type: RoomType.PRODUCTION, x: ROOM_X + 18, y: ROOM_Y + 18, w: 6, h: 6,
  });
  for (let y = shop.y; y < shop.y + shop.h; y++) {
    for (let x = shop.x; x < shop.x + shop.w; x++) world.roomMap[world.idx(x, y)] = shop.id;
  }
  const e = makeActor({ id: 1, occupation: Occupation.ENGINEER, faction: Faction.CITIZEN });
  e.inventory = [];
  rebuildEntityIndex([e]);
  // Десять утра: смена. Часы приходят снимком из точки входа, как в игре.
  setActorCoreContext(0, { hour: 10, minute: 0, totalMinutes: 600 }, false, undefined);

  const before = world.dist2(e.x, e.y, shop.x + 3, shop.y + 3);
  const dt = 1 / 60;
  let now = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 1800; i++) {
    now += dt;
    tickActorBrain(world, e, dt, now);
    const id = actorDrive(e);
    if (id) seen.add(id);
  }
  assert.ok(seen.has('work'), `не работал, а делал ${[...seen].join(',') || 'ничего'}`);
  const after = world.dist2(e.x, e.y, shop.x + 3, shop.y + 3);
  assert.ok(after < before, `к цеху не пошёл: было ${before}, стало ${after}`);
  assert.equal(e.ai?.npcState, NpcState.WORKING, 'дойдя, не объявил себя работающим');
  setActorCoreContext(undefined);
});

test('квестовая вещь неотчуждаема: на склад её не сдают', () => {
  /* Единственное, что не даёт NPC сдать квестовый предмет в ящик, — теги вещи
   * (`quest|persistent|cannot_drop`). Механика переехала в
   * `systems/npc_work.ts`, и замок обязан переехать с ней. Сторож защитный: в
   * реестре сегодня НЕТ ни одной вещи с такими тегами, поэтому образец заводим
   * на время проверки и убираем за собой. */
  const kept = ITEMS['test_quest_token'];
  const plain = ITEMS['armor_light'];
  assert.ok(plain && plain.value > 0, 'опорная вещь исчезла из реестра');
  ITEMS['test_quest_token'] = { ...plain, id: 'test_quest_token', tags: ['quest'] };
  try {
    const e = makeActor({ id: 31 });
    e.weapon = undefined;
    e.tool = undefined;
    e.inventory = [
      { defId: 'test_quest_token', count: 1 },
      { defId: 'armor_light', count: 1 },
    ];
    const spare = scanSpareInventory(e);
    assert.ok(spare.first >= 0, 'хабар обязан оставаться лишним');
    assert.notEqual(e.inventory[spare.first].defId, 'test_quest_token',
      'квестовая вещь попала в излишек и уедет на склад');
    assert.equal(spare.count, 1, 'в излишек попало больше одной вещи из двух');
  } finally {
    if (kept === undefined) delete ITEMS['test_quest_token'];
    else ITEMS['test_quest_token'] = kept;
  }
});

test('канал опасности читается снимком, а не миром: формула не ходит в мир', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  const v = viewAt(world, e, 10);
  // Подмена снимка меняет счёт — значит формула читает ЕГО, а не мир заново.
  const before = scoreDrive(DRIVE_BY_ID.work, v, Faction.CITIZEN);
  v.senses.field[FieldChannel.DANGER] = 1;
  const after = scoreDrive(DRIVE_BY_ID.work, v, Faction.CITIZEN);
  assert.ok(after < before, `снимок не решает: ${before} → ${after}`);
});
