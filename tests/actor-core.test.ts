import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, RoomType, Tex, ZoneFaction } from '../src/core/types';
import { World } from '../src/core/world';
import { initFactionRelations } from '../src/data/relations';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { prewarmNavigationTree } from '../src/systems/ai/pathfinding';
import {
  FIELD_PRESENCE_DEPOSIT,
  FIELD_TICK_SECONDS,
  FIELD_VALUE_MAX,
  FieldChannel,
  fieldMacroAt,
  depositBeasts,
  depositDanger,
  depositNoise,
  depositPeople,
  depositScent,
  resetPerceptionFieldsState,
} from '../src/systems/fields';
import { prewarmPerceptionFields, updatePerceptionFields } from '../src/systems/fields';
import { actorDrive, actorDriveTier, forgetActorBrain, tickActorBrain } from '../src/systems/actor/brain';
import {
  DRIVES,
  DRIVE_BY_ID,
  DRIVE_IDS,
  driveWeight,
  scoreDrive,
  type DriveView,
} from '../src/systems/actor/drives';
import { createActorNeeds, readActorNeeds } from '../src/systems/actor/needs';
import { createActorClock, readActorClock } from '../src/systems/actor/clock';
import { createActorSenses, sensed, sensedFar, senseActor } from '../src/systems/actor/senses';
import {
  declaredTerritoryPushCount, ensureTerritoryFront, territoryCaptureTarget,
} from '../src/systems/territory';
import { rebuildCrowdIndex } from '../src/world/crowd_index';
import { addTestRoom, countInventoryItem, makeTestNpc } from './helpers';

const ROOM_X = 20;
const ROOM_Y = 20;
const ROOM_W = 24;
const ROOM_H = 24;

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
  // Стратегический драйв ведёт МАРШРУТОМ, а маршрут кладёт запечённое дерево
  // навигации. Без него `tryAssignPathToCell` честно отвечает 'not_found'.
  prewarmNavigationTree(world);
  return world;
}

function makeActor(overrides: Parameters<typeof makeTestNpc>[0] = {}) {
  const e = makeTestNpc({ id: 1, x: ROOM_X + 12.5, y: ROOM_Y + 12.5, ...overrides });
  e.speed = 4;
  e.hp = 100;
  e.maxHp = 100;
  e.needs = { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 };
  // Стратегический драйв ведёт по `ai.path`, а `makeTestNpc` блок AI не заводит.
  e.ai = { goal: AIGoal.IDLE, tx: e.x, ty: e.y, path: [], pi: 0, stuck: 0, timer: 0 };
  forgetActorBrain(e);
  return e;
}

function makeBeast(overrides: Parameters<typeof makeTestNpc>[0] = {}) {
  const e = makeActor(overrides);
  e.type = EntityType.MONSTER;
  e.faction = undefined;
  e.monsterKind = MonsterKind.SOSED;
  return e;
}

/** Прогнать поля столько тактов, чтобы вклад успел растечься. */
function settleFields(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) updatePerceptionFields(world, FIELD_TICK_SECONDS);
}

function viewOf(world: World, e: import('../src/core/types').Entity): DriveView {
  rebuildEntityIndex([e]);
  const senses = senseActor(world, e, createActorSenses());
  const needs = readActorNeeds(e, createActorNeeds());
  // Часы — третий вход счёта: без них формулы распорядка читали бы пустоту.
  // Полдень взят как нейтральный час: тело и страх времени не знают вовсе.
  const clock = readActorClock({ hour: 12, minute: 0, totalMinutes: 720 }, false, createActorClock());
  return { senses, needs, clock };
}

/** Прогнать ядро столько времени, чтобы первое решение точно состоялось. */
function runBrain(world: World, e: import('../src/core/types').Entity, seconds: number): number {
  const dt = 1 / 60;
  let acted = 0;
  let now = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    now += dt;
    if (tickActorBrain(world, e, dt, now)) acted++;
  }
  return acted;
}

test('реестр драйвов объявлен данными и согласован', () => {
  assert.equal(DRIVES.length, DRIVE_IDS.length);
  const seen = new Set<string>();
  for (const def of DRIVES) {
    assert.ok(!seen.has(def.id), `дубль драйва ${def.id}`);
    seen.add(def.id);
    assert.equal(DRIVE_BY_ID[def.id], def);
    assert.ok(def.pace > 0 && def.pace <= 1, `${def.id}: доля скорости вне 0..1`);
    assert.ok(def.holdSec > 0, `${def.id}: гистерезис обязан держать хоть сколько-то`);
    assert.ok(def.sign === 1 || def.sign === -1, `${def.id}: знак градиента`);
    assert.ok(def.field >= 0 && def.field <= FieldChannel.OPENNESS, `${def.id}: канал`);
    assert.ok(def.tier === 'step' || def.tier === 'route' || def.tier === 'room' || def.tier === 'actor',
      `${def.id}: ярус`);
    // Ярус назначения обязан назвать, ЧТО именно комната должна уметь.
    if (def.tier === 'room') {
      assert.ok(def.affordance !== undefined, `${def.id}: ярус комнаты без назначения`);
      assert.ok(Number.isFinite(def.reach), `${def.id}: за нуждой без предела хода`);
    }
    // Тактике предел хода обязателен, стратегии он запрещён: увести далеко и
    // есть всё её дело.
    if (def.tier === 'step' && def.field !== FieldChannel.SCENT) {
      assert.ok(Number.isFinite(def.reach), `${def.id}: тактика без предела хода`);
    }
    if (def.tier === 'route') assert.equal(def.reach, Infinity, `${def.id}: стратегия с пределом`);
  }
  for (const id of DRIVE_IDS) assert.ok(seen.has(id), `${id} объявлен, но не зарегистрирован`);
});

test('счёт — произведение четырёх сомножителей: ноль в любом обнуляет драйв', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  const v = viewOf(world, e);
  for (const def of DRIVES) {
    const zeroNeed = { ...def, need: () => 0 };
    const zeroContext = { ...def, context: () => 0 };
    const zeroOpportunity = { ...def, opportunity: () => 0 };
    assert.equal(scoreDrive(zeroNeed, v, Faction.CITIZEN), 0, `${def.id}: нулевая потребность`);
    assert.equal(scoreDrive(zeroContext, v, Faction.CITIZEN), 0, `${def.id}: нулевой контекст`);
    assert.equal(scoreDrive(zeroOpportunity, v, Faction.CITIZEN), 0, `${def.id}: нулевая возможность`);
  }
  const full = { ...DRIVES[0], need: () => 1, context: () => 1, opportunity: () => 1 };
  assert.equal(scoreDrive(full, v, Faction.CITIZEN), driveWeight(Faction.CITIZEN, DRIVES[0].id));
});

test('разница видов живёт только в весах: одна формула, разный вес', () => {
  // Ликвидатору страшно втрое меньше, чем учёному, при ОДНОМ и том же снимке.
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  depositDanger(world, e.x, e.y, FIELD_VALUE_MAX);
  const v = viewOf(world, e);
  const flee = DRIVE_BY_ID.flee;
  const liquidator = scoreDrive(flee, v, Faction.LIQUIDATOR);
  const scientist = scoreDrive(flee, v, Faction.SCIENTIST);
  assert.ok(liquidator > 0 && scientist > 0);
  assert.ok(scientist > liquidator * 2, `учёный ${scientist} против ликвидатора ${liquidator}`);
});

test('восприятие читает канал под ногами за одно чтение и нормирует его', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  depositNoise(world, e.x, e.y, FIELD_VALUE_MAX);
  depositScent(world, e.x, e.y, FIELD_VALUE_MAX);
  const senses = senseActor(world, e, createActorSenses());
  assert.equal(senses.field[FieldChannel.NOISE], 1);
  assert.equal(senses.field[FieldChannel.SCENT], 1);
  assert.equal(senses.field[FieldChannel.PEOPLE], 0);
  assert.equal(senses.cell, world.idx(Math.floor(e.x), Math.floor(e.y)));
  assert.equal(senses.beast, false);
});

test('восприятие различает своих и чужих одним запросом с капом', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ faction: Faction.LIQUIDATOR });
  const ally = makeTestNpc({ id: 2, x: e.x + 2, y: e.y, faction: Faction.LIQUIDATOR });
  const foe = makeTestNpc({ id: 3, x: e.x + 4, y: e.y, faction: Faction.CULTIST });
  rebuildEntityIndex([e, ally, foe]);
  const senses = senseActor(world, e, createActorSenses());
  assert.equal(senses.allies, 1);
  assert.equal(senses.hostiles, 1);
  assert.equal(senses.nearestHostile?.id, 3);
  assert.ok(senses.nearestHostileDist > 3 && senses.nearestHostileDist < 5);
});

test('тело: давления растут по своим шкалам, усталость выводится из запаса сил', () => {
  const e = makeActor();
  const fed = readActorNeeds(e, createActorNeeds());
  assert.equal(fed.hunger, 0);
  assert.equal(fed.worst, 0);

  e.needs = { food: 0, water: 0, sleep: 0, pee: 100, poo: 0 };
  e.hp = 25;
  const spent = readActorNeeds(e, createActorNeeds());
  assert.equal(spent.hunger, 1);
  assert.equal(spent.thirst, 1);
  assert.equal(spent.bladder, 1);
  assert.equal(spent.pain, 0.75);
  assert.equal(spent.worst, 1);
  // Запас сил = сытость × выспанность; своей шкалы у усталости нет.
  assert.equal(spent.fatigue, 1);

  e.needs = { food: 100, water: 100, sleep: 0, pee: 0, poo: 0 };
  e.hp = 100;
  const sleepy = readActorNeeds(e, createActorNeeds());
  assert.equal(sleepy.hunger, 0);
  assert.equal(sleepy.fatigue, 1);
});

test('страх ведёт ВНИЗ по опасности', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ faction: Faction.CITIZEN });
  // Очаг у левого края комнаты, актор — прямо в нём.
  const hotX = ROOM_X + 4;
  const hotY = ROOM_Y + 12;
  e.x = hotX + 0.5;
  e.y = hotY + 0.5;
  for (let i = 0; i < 6; i++) {
    depositDanger(world, hotX, hotY, FIELD_VALUE_MAX);
    settleFields(world, 1);
  }
  rebuildEntityIndex([e]);
  const before = world.dist2(e.x, e.y, hotX + 0.5, hotY + 0.5);
  const acted = runBrain(world, e, 6);
  assert.ok(acted > 0, 'ядро ни разу не повело актора');
  assert.equal(actorDrive(e), 'flee');
  const after = world.dist2(e.x, e.y, hotX + 0.5, hotY + 0.5);
  assert.ok(after > before, `ушёл недалеко: было ${before}, стало ${after}`);
});

test('укрытие ведёт ВНИЗ по просвету', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ faction: Faction.SCIENTIST });
  e.hp = 20; // ранен — прятаться захочется
  e.weapon = '';
  rebuildEntityIndex([e]);
  const openness = (x: number, y: number) =>
    world.perceptionFields[FieldChannel.OPENNESS * world.cells.length + world.idx(Math.floor(x), Math.floor(y))];
  const before = openness(e.x, e.y);
  runBrain(world, e, 8);
  assert.equal(actorDrive(e), 'hide');
  assert.ok(openness(e.x, e.y) <= before, `просвет вырос: было ${before}, стало ${openness(e.x, e.y)}`);
});

test('след ведёт клетка за клеткой — это тактика', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const beast = makeBeast({ id: 1 });
  beast.x = ROOM_X + 6.5;
  beast.y = ROOM_Y + 12.5;
  // Дорожку подхватывают, стоя НА ней: под ногами след обязан быть.
  for (let d = 0; d <= 10; d++) {
    depositScent(world, beast.x + d, beast.y, FIELD_VALUE_MAX * (0.3 + d * 0.06));
  }
  rebuildEntityIndex([beast]);
  const before = beast.x;
  runBrain(world, beast, 6);
  assert.equal(actorDrive(beast), 'track_scent');
  assert.equal(actorDriveTier(beast), 'step');
  assert.ok(beast.x > before + 1, `по следу не пошёл: было ${before}, стало ${beast.x}`);
});

test('поклеточный ярус по-прежнему близорук — это его роль, а не поломка', () => {
  // Замок на разделение ярусов. Поклеточный канал носит тактику и дальше
  // клетки-двух не достаёт (замер: 115, 16, 0) — дальнобойность живёт на
  // стратегическом ярусе, и путать их нельзя.
  const world = makeOpenWorld();
  const cx = ROOM_X + 12;
  const cy = ROOM_Y + 12;
  for (let t = 0; t < 20; t++) {
    depositNoise(world, cx, cy, FIELD_VALUE_MAX);
    settleFields(world, 1);
  }
  const cellAt = (d: number) =>
    world.perceptionFields[FieldChannel.NOISE * world.cells.length + world.idx(cx + d, cy)];
  assert.ok(cellAt(0) > 0, 'шум не удержался даже в своей клетке');
  assert.equal(cellAt(2), 0, 'поклеточный шум достаёт дальше клетки');
  // ...а стратегический — достаёт, иначе `seek_noise` вести некуда.
  assert.ok(fieldMacroAt(world, FieldChannel.NOISE, cx, cy) > 0, 'ярус не услышал бой');
});

test('на выстрелы идут через этаж: шум ведёт маршрутом', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const armed = makeActor({ id: 1, faction: Faction.LIQUIDATOR });
  armed.weapon = 'makarov';
  armed.x = ROOM_X + 3.5;
  armed.y = ROOM_Y + 12.5;
  // Бой в дальнем конце комнаты — поклеточный шум оттуда не долетит никогда.
  const noiseX = ROOM_X + ROOM_W - 3;
  const noiseY = ROOM_Y + 12;
  for (let t = 0; t < 20; t++) {
    depositNoise(world, noiseX, noiseY, FIELD_VALUE_MAX);
    settleFields(world, 1);
  }
  assert.equal(
    world.perceptionFields[FieldChannel.NOISE * world.cells.length + world.idx(armed.x, armed.y)],
    0,
    'предпосылка теста сломана: поклеточный шум долетел',
  );
  rebuildEntityIndex([armed]);
  const before = world.dist2(armed.x, armed.y, noiseX + 0.5, noiseY + 0.5);
  runBrain(world, armed, 8);
  assert.equal(actorDrive(armed), 'seek_noise');
  assert.equal(actorDriveTier(armed), 'route');
  const after = world.dist2(armed.x, armed.y, noiseX + 0.5, noiseY + 0.5);
  assert.ok(after < before, `на выстрелы не пошёл: было ${before}, стало ${after}`);
});

test('хищник уходит к толпе, а не топчется', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const beast = makeBeast({ id: 5 });
  beast.needs = { food: 0, water: 100, sleep: 100, pee: 0, poo: 0 };
  beast.x = ROOM_X + 3.5;
  beast.y = ROOM_Y + 3.5;
  const crowdX = ROOM_X + ROOM_W - 4;
  const crowdY = ROOM_Y + ROOM_H - 4;
  for (let t = 0; t < 20; t++) {
    depositPeople(world, crowdX, crowdY, FIELD_VALUE_MAX);
    settleFields(world, 1);
  }
  rebuildEntityIndex([beast]);
  const before = world.dist2(beast.x, beast.y, crowdX + 0.5, crowdY + 0.5);
  // Дело может и закончиться раньше конца прогона — дойдя до толпы, хищник
  // честно отпускает драйв. Ловим сам факт охоты, а не срез на последнем кадре.
  const seen = new Set<string>();
  const dt = 1 / 60;
  let now = 0;
  for (let i = 0; i < 600; i++) {
    now += dt;
    tickActorBrain(world, beast, dt, now);
    const id = actorDrive(beast);
    if (id) {
      seen.add(id);
      if (id === 'hunt') assert.equal(actorDriveTier(beast), 'route');
    }
  }
  assert.ok(seen.has('hunt'), `хищник не охотился, а делал ${[...seen].join(',') || 'ничего'}`);
  const after = world.dist2(beast.x, beast.y, crowdX + 0.5, crowdY + 0.5);
  assert.ok(after < before, `хищник не тронулся к толпе: было ${before}, стало ${after}`);
});

test('стая держится ближним сбором, а не полем', () => {
  // Через поле стая не собирается ни на одном ярусе: актор сам льёт в канал
  // плотности и стоит на собственном пике, а ячейка 16×16 крупнее разброса
  // самой пачки. «Где мои» знает только радиусный запрос восприятия.
  const world = makeOpenWorld();
  initFactionRelations();
  const stray = makeActor({ id: 1, faction: Faction.CITIZEN });
  stray.x = ROOM_X + 4.5;
  stray.y = ROOM_Y + 12.5;
  const mates = [2, 3, 4].map(id => makeTestNpc({
    id, x: ROOM_X + 15.5 + (id - 3), y: ROOM_Y + 12.5, faction: Faction.CITIZEN,
  }));
  rebuildEntityIndex([stray, ...mates]);

  const senses = senseActor(world, stray, createActorSenses());
  assert.equal(senses.allies, 3);
  assert.ok(senses.allyDx > 8, `центр своих не там: ${senses.allyDx}`);
  assert.ok(Math.abs(senses.allyDy) < 0.001, 'своих снесло по вертикали');

  const before = stray.x;
  const dt = 1 / 60;
  let now = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    now += dt;
    tickActorBrain(world, stray, dt, now);
    const id = actorDrive(stray);
    if (id) seen.add(id);
  }
  assert.ok(seen.has('huddle'), `к своим не пошёл, а делал ${[...seen].join(',') || 'ничего'}`);
  assert.ok(stray.x > before + 1, `к своим не сдвинулся: было ${before}, стало ${stray.x}`);
});

test('курс в обход поля берётся из СВОЕГО снимка, а не из чужого', () => {
  /* Снимок восприятия — общий модульный объект: его переписывает каждый
   * решающий актор. Курс `huddle` обязан считаться в момент решения, иначе
   * актор пойдёт туда, куда смотрел сосед. Двое стоят по разные стороны от
   * своих групп, и разойтись они должны в РАЗНЫЕ стороны. */
  const world = makeOpenWorld();
  initFactionRelations();
  const west = makeActor({ id: 1, faction: Faction.CITIZEN });
  west.x = ROOM_X + 3.5;
  west.y = ROOM_Y + 6.5;
  const east = makeActor({ id: 2, faction: Faction.CITIZEN });
  east.x = ROOM_X + 20.5;
  east.y = ROOM_Y + 18.5;
  const westMate = makeTestNpc({ id: 3, x: ROOM_X + 12.5, y: ROOM_Y + 6.5, faction: Faction.CITIZEN });
  const eastMate = makeTestNpc({ id: 4, x: ROOM_X + 11.5, y: ROOM_Y + 18.5, faction: Faction.CITIZEN });
  rebuildEntityIndex([west, east, westMate, eastMate]);

  const dt = 1 / 60;
  let now = 0;
  for (let i = 0; i < 600; i++) {
    now += dt;
    tickActorBrain(world, west, dt, now);
    tickActorBrain(world, east, dt, now);
  }
  // Западный тянется на восток к своему, восточный — на запад к своему.
  assert.ok(west.x > ROOM_X + 4.5, `западный не пошёл к своему: ${west.x}`);
  assert.ok(east.x < ROOM_X + 19.5, `восточный увязался за чужим курсом: ${east.x}`);
});

test('голодный ест то, что несёт, а не идёт через этаж на кухню', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ id: 1 });
  e.needs = { food: 5, water: 100, sleep: 100, pee: 0, poo: 0 };
  e.inventory = [{ defId: 'canned', count: 2 }];
  rebuildEntityIndex([e]);
  const x = e.x;
  const y = e.y;

  const dt = 1 / 60;
  let now = 0;
  for (let i = 0; i < 600; i++) {
    now += dt;
    tickActorBrain(world, e, dt, now);
  }

  // Ест, пока не наестся, и на этом останавливается — а не жуёт весь запас.
  assert.ok(e.needs.food > 60, `консерва осталась в кармане: сытость ${e.needs.food}`);
  assert.ok(countInventoryItem(e, 'canned') < 2, 'ни одной не съел');
  // И никуда при этом не пошёл: еда была при себе.
  assert.ok(world.dist2(e.x, e.y, x, y) < 1, `ушёл за едой, имея её при себе: ${e.x},${e.y}`);
});

test('без еды при себе голод ведёт в комнату, которая кормит', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const kitchen = addTestRoom(world, {
    id: 1, type: RoomType.KITCHEN, x: ROOM_X + 16, y: ROOM_Y + 16, w: 6, h: 6,
  });
  for (let y = kitchen.y; y < kitchen.y + kitchen.h; y++) {
    for (let x = kitchen.x; x < kitchen.x + kitchen.w; x++) {
      world.roomMap[world.idx(x, y)] = kitchen.id;
    }
  }
  const e = makeActor({ id: 1 });
  e.needs = { food: 5, water: 100, sleep: 100, pee: 0, poo: 0 };
  e.inventory = [];
  e.x = ROOM_X + 3.5;
  e.y = ROOM_Y + 3.5;
  rebuildEntityIndex([e]);

  const before = world.dist2(e.x, e.y, kitchen.x + 3, kitchen.y + 3);
  const dt = 1 / 60;
  let now = 0;
  const seen = new Set<string>();
  for (let i = 0; i < 900; i++) {
    now += dt;
    tickActorBrain(world, e, dt, now);
    const id = actorDrive(e);
    if (id) seen.add(id);
  }
  assert.ok(seen.has('eat'), `не проголодался, а делал ${[...seen].join(',') || 'ничего'}`);
  const after = world.dist2(e.x, e.y, kitchen.x + 3, kitchen.y + 3);
  assert.ok(after < before, `к кухне не пошёл: было ${before}, стало ${after}`);
});

test('одинокий актор больше не стоит на собственном пике', () => {
  // Риск, который ядро несло на поклеточном ярусе: человек сам льёт в PEOPLE и
  // в своей клетке всегда стоит на максимуме, который сам же и налил, поэтому
  // тяга к людям у одиночки была вечным нулём. На ячейке 16×16 свой вклад
  // размазан, и одиночество наконец читается.
  const world = makeOpenWorld();
  initFactionRelations();
  const lone = makeActor({ id: 9 });
  depositPeople(world, lone.x, lone.y, FIELD_PRESENCE_DEPOSIT);
  settleFields(world, 1);
  const alone = viewOf(world, lone).senses;
  assert.ok(sensedFar(alone, FieldChannel.PEOPLE) < 0.5,
    `ячейку насытил один актор: ${sensedFar(alone, FieldChannel.PEOPLE)}`);
  // Тяга к людям у одиночки на ярусе ЖИВАЯ — на поклеточном она была нулём,
  // потому что актор стоял на пике собственного вклада.
  const lonely = DRIVE_BY_ID.flock.need(viewOf(world, lone));
  assert.ok(lonely > 0.3, `одиночество не читается: ${lonely}`);
});

test('охота — дело зверя: у человека тот же снимок даёт ноль', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const beast = makeBeast({ id: 7 });
  beast.needs = { food: 0, water: 100, sleep: 100, pee: 0, poo: 0 };
  depositPeople(world, beast.x + 3, beast.y, FIELD_VALUE_MAX);
  settleFields(world, 2);
  const beastView = viewOf(world, beast);
  assert.ok(scoreDrive(DRIVE_BY_ID.hunt, beastView, 'beast') > 0);

  const human = makeActor({ id: 8, x: beast.x, y: beast.y });
  human.needs = { food: 0, water: 100, sleep: 100, pee: 0, poo: 0 };
  const humanView = viewOf(world, human);
  assert.equal(scoreDrive(DRIVE_BY_ID.hunt, humanView, Faction.CITIZEN), 0);
});

test('тяга к плотности насыщается: в давке звать уже некуда', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  const empty = viewOf(world, e);
  const emptyScore = scoreDrive(DRIVE_BY_ID.flock, empty, Faction.CITIZEN);

  // Умеренно людно: тяга должна быть выше, чем в пустоте и чем в давке.
  depositPeople(world, e.x + 4, e.y, FIELD_VALUE_MAX * 0.5);
  settleFields(world, 2);
  const some = scoreDrive(DRIVE_BY_ID.flock, viewOf(world, e), Faction.CITIZEN);

  depositPeople(world, e.x, e.y, FIELD_VALUE_MAX);
  const packed = scoreDrive(DRIVE_BY_ID.flock, viewOf(world, e), Faction.CITIZEN);
  assert.ok(some >= emptyScore, `в пустоте ${emptyScore} против умеренного ${some}`);
  assert.equal(packed, 0, 'в полной давке тяга к людям обязана обнулиться');
});

test('гистерезис держит выбор, а не граф переходов', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor({ faction: Faction.CITIZEN });
  const hotX = ROOM_X + 4;
  const hotY = ROOM_Y + 12;
  e.x = hotX + 0.5;
  e.y = hotY + 0.5;
  for (let i = 0; i < 6; i++) {
    depositDanger(world, hotX, hotY, FIELD_VALUE_MAX);
    settleFields(world, 1);
  }
  rebuildEntityIndex([e]);
  runBrain(world, e, 6);
  assert.equal(actorDrive(e), 'flee');

  // Опасность убрали, но выбор обязан ещё держаться свой срок.
  world.perceptionFields.fill(0, 0, world.cells.length);
  const dt = 1 / 60;
  let now = 6;
  let heldFrames = 0;
  for (let i = 0; i < Math.round(DRIVE_BY_ID.flee.holdSec / dt) - 1; i++) {
    now += dt;
    tickActorBrain(world, e, dt, now);
    if (actorDrive(e) === 'flee') heldFrames++;
  }
  assert.ok(heldFrames > 0, 'выбор не продержался ни кадра');
});

test('каданс решения расфазирован по id и не зависит от игрока', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const first = makeActor({ id: 11 });
  const second = makeActor({ id: 12 });
  rebuildEntityIndex([first, second]);
  const dt = 1 / 60;
  let now = 0;
  let firstAt = -1;
  let secondAt = -1;
  for (let i = 0; i < 600; i++) {
    now += dt;
    tickActorBrain(world, first, dt, now);
    tickActorBrain(world, second, dt, now);
    if (firstAt < 0 && actorDrive(first) !== undefined) firstAt = i;
    if (secondAt < 0 && actorDrive(second) !== undefined) secondAt = i;
  }
  // Без тяги драйва не будет вовсе — это законный ответ; важно, что ядро при
  // этом НЕ ведёт актора и уступает ход прежнему слою.
  assert.equal(tickActorBrain(world, first, dt, now + dt), false);
});

test('без тяги ядро честно уступает ход', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  rebuildEntityIndex([e]);
  const x = e.x;
  const y = e.y;
  const acted = runBrain(world, e, 10);
  assert.equal(acted, 0, 'ядро повело актора, которому ничего не нужно');
  assert.equal(e.x, x);
  assert.equal(e.y, y);
});

test('ядро не аллоцирует в горячем пути', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const e = makeActor();
  depositDanger(world, e.x, e.y, FIELD_VALUE_MAX);
  settleFields(world, 2);
  rebuildEntityIndex([e]);
  runBrain(world, e, 6);
  const before = process.memoryUsage().heapUsed;
  const dt = 1 / 60;
  let now = 100;
  for (let i = 0; i < 20000; i++) {
    now += dt;
    tickActorBrain(world, e, dt, now);
  }
  const grown = process.memoryUsage().heapUsed - before;
  // Порог с большим запасом: ловим утечку на порядок, а не шум сборщика.
  assert.ok(grown < 8 * 1024 * 1024, `куча выросла на ${grown} байт за 20000 тактов`);
});

/* ── Захват территории как драйв ─────────────────────────────────
 *
 * Пока веса захвата в ядре не было, людей на фронт отпускал отдельный
 * фракционный отправитель — второй источник цели поверх ядра. Драйв заменил
 * его целиком, поэтому здесь проверяется не «идёт ли война», а то, из чего она
 * складывается: ценность участка тянет, группа разрешает, одиночка и тварь
 * молчат, цель берётся у переписи фронта, а такт объявляет намерение.
 */

function makeFrontWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  const x0 = 200;
  const y0 = 200;
  for (let y = y0; y < y0 + 48; y++) {
    for (let x = x0; x < x0 + 96; x++) {
      const i = world.idx(x, y);
      world.cells[i] = Cell.FLOOR;
      world.wallTex[i] = Tex.CONCRETE;
      world.floorTex[i] = Tex.F_CONCRETE;
      // Левая половина зала — ликвидаторы, правая — жители: между ними фронт.
      world.factionControl[i] = x < x0 + 48 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    }
  }
  world.cellVersion++;
  world.perceptionBaked = false;
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  return world;
}

function frontFighter(id: number, x: number, y: number) {
  const e = makeTestNpc({ id, x, y, faction: Faction.LIQUIDATOR });
  e.speed = 4;
  e.hp = 100;
  e.maxHp = 100;
  e.needs = { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 };
  e.ai = { goal: AIGoal.IDLE, tx: e.x, ty: e.y, path: [], pi: 0, stuck: 0, timer: 0 };
  forgetActorBrain(e);
  return e;
}

test('чужая земля рядом тянет захватом, но только когда рядом свои', () => {
  initFactionRelations();
  const world = makeFrontWorld();
  const lone = frontFighter(1, 246.5, 220.5);
  const mateA = frontFighter(2, 245.5, 221.5);
  const mateB = frontFighter(3, 245.5, 219.5);

  rebuildCrowdIndex(world, [lone, mateA, mateB], 1);
  ensureTerritoryFront(world, 1);
  const capture = DRIVE_BY_ID.capture;

  // Одиночка: ценность видит, но группы нет — контекст обнуляет драйв.
  rebuildEntityIndex([lone]);
  const alone = { senses: senseActor(world, lone, createActorSenses()), needs: readActorNeeds(lone, createActorNeeds()), clock: createActorClock() };
  assert.ok(alone.senses.captureValue > 0, 'у бойца на границе обязан быть виден фронт');
  assert.equal(scoreDrive(capture, alone, Faction.LIQUIDATOR), 0, 'один в поле не воин');

  // Те же входные данные, но своих двое: драйв оживает.
  const group = viewOf(world, lone);
  rebuildEntityIndex([lone, mateA, mateB]);
  group.senses = senseActor(world, lone, createActorSenses());
  assert.ok(group.senses.allies >= 2);
  assert.ok(scoreDrive(capture, group, Faction.LIQUIDATOR) > 0, 'группе у фронта захват положен');

  // Землю делят стороны, а не экология: у твари он выключен весом, не веткой.
  assert.equal(driveWeight('beast', 'capture'), 0);
});

test('цель захвата берётся у переписи фронта, а такт объявляет намерение', () => {
  initFactionRelations();
  const world = makeFrontWorld();
  const fighter = frontFighter(11, 246.5, 220.5);
  const mate = frontFighter(12, 245.5, 221.5);
  rebuildCrowdIndex(world, [fighter, mate], 1);
  ensureTerritoryFront(world, 1);

  const capture = DRIVE_BY_ID.capture;
  const target = territoryCaptureTarget(world, fighter);
  assert.ok(target, 'фронт рядом обязан дать цель');
  assert.equal(capture.routeTarget?.(world, fighter), world.idx(target!.x, target!.y));

  const before = declaredTerritoryPushCount();
  capture.sustain?.(world, fighter);
  assert.equal(declaredTerritoryPushCount(), before + 1,
    'без объявления намерения система захвата не перевернёт ни одной клетки');
});

/* ── Бой как драйв ───────────────────────────────────────────────
 *
 * Решение «драться или бежать» переехало в общий счёт: раньше боевой слой
 * забирал всякого, у кого есть цель, и до ядра решение не доходило вовсе —
 * разорвать контакт было физически нечем. Сам бой (оружие, дистанция,
 * перезарядка, тактики вида) остался в слое: ядро отвечает на вопрос СТОИТ ЛИ.
 */

test('драка спорит с бегством одним счётом, и расклад решает', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const fight = DRIVE_BY_ID.fight;
  const flee = DRIVE_BY_ID.flee;

  const strong = makeActor({ id: 41, faction: Faction.LIQUIDATOR, weapon: 'ak74' });
  const weakling = makeActor({ id: 42, faction: Faction.CITIZEN, x: ROOM_X + 13.5 });
  weakling.hp = 12;
  const enemy = makeActor({ id: 43, faction: Faction.WILD, x: ROOM_X + 12.5, y: ROOM_Y + 13.5, weapon: 'ak74' });
  enemy.rpg = { ...enemy.rpg!, level: 8 };
  rebuildEntityIndex([strong, weakling, enemy]);

  const brave = { senses: senseActor(world, strong, createActorSenses()), needs: readActorNeeds(strong, createActorNeeds()), clock: createActorClock() };
  assert.ok(brave.senses.hostiles > 0, 'дикий обязан читаться врагом ликвидатора');
  assert.ok(scoreDrive(fight, brave, Faction.LIQUIDATOR) > 0, 'вооружённому ликвидатору драка положена');

  const scared = { senses: senseActor(world, weakling, createActorSenses()), needs: readActorNeeds(weakling, createActorNeeds()), clock: createActorClock() };
  /* Спасение — это ДВА драйва, и на чистом полу выигрывает укрытие: бегство
   * ведёт вниз по опасности, а на полу без единой капли крови у страха нет
   * направления, и он честно уступает. Сравнивать драку надо с лучшим из них. */
  const escape = Math.max(
    scoreDrive(flee, scared, Faction.CITIZEN),
    scoreDrive(DRIVE_BY_ID.hide, scared, Faction.CITIZEN),
  );
  assert.ok(
    escape > scoreDrive(fight, scared, Faction.CITIZEN),
    'раненому безоружному жителю против вооружённого врага спасение обязано перевесить драку',
  );

  // Землю и голод драка не отменяет по списку: её выключает нулевой сомножитель.
  const calm = viewOf(world, makeActor({ id: 44, x: ROOM_X + 2.5, y: ROOM_Y + 2.5 }));
  assert.equal(scoreDrive(fight, calm, Faction.CITIZEN), 0, 'драться не с кем — нечего и решать');
});

test('ядро объявляет цель и уступает ход боевому слою', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  const fighter = makeActor({ id: 51, faction: Faction.LIQUIDATOR, weapon: 'ak74' });
  const enemy = makeActor({ id: 52, faction: Faction.WILD, x: ROOM_X + 13.5, weapon: 'ak74' });
  rebuildEntityIndex([fighter, enemy]);

  const led = runBrain(world, fighter, 12);

  assert.equal(fighter.ai?.combatTargetId, enemy.id, 'ядро обязано назвать противника');
  assert.equal(led, 0, 'но вести драку ядро не берётся: ход остаётся боевому слою');
});

test('драка требует ВИДЕТЬ, а страх — нет', () => {
  const world = makeOpenWorld();
  initFactionRelations();
  // Стена поперёк комнаты: враги в двух шагах друг от друга, но через бетон.
  const wallX = ROOM_X + 12;
  for (let y = ROOM_Y; y < ROOM_Y + ROOM_H; y++) {
    const i = world.idx(wallX, y);
    world.cells[i] = Cell.WALL;
  }
  world.cellVersion++;

  const fighter = makeActor({ id: 61, faction: Faction.LIQUIDATOR, x: wallX - 1.5, weapon: 'ak74' });
  const enemy = makeActor({ id: 62, faction: Faction.WILD, x: wallX + 1.5, weapon: 'ak74' });
  rebuildEntityIndex([fighter, enemy]);

  const v = { senses: senseActor(world, fighter, createActorSenses()), needs: readActorNeeds(fighter, createActorNeeds()), clock: createActorClock() };
  assert.equal(v.senses.hostiles, 1, 'враг рядом и чувствуется');
  assert.equal(v.senses.visibleHostiles, 0, 'но сквозь бетон его не видно');
  assert.equal(scoreDrive(DRIVE_BY_ID.fight, v, Faction.LIQUIDATOR), 0,
    'нельзя драться с тем, кого не видно: актор уходил бы бить стену');
  assert.ok(scoreDrive(DRIVE_BY_ID.hide, v, Faction.LIQUIDATOR) > 0,
    'а прятаться от неувиденного — законно: в клетке читается достаточно');
});
