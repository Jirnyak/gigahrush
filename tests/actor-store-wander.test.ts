import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, ItemType, NpcState, Occupation, type Entity, type ItemDef,
} from '../src/core/types';
import { ITEMS } from '../src/data/items';
import { roomAffordanceWeight } from '../src/data/room_affordances';
import { DRIVE_BY_ID, driveWeight, scoreDrive, type DriveView } from '../src/systems/actor/drives';
import { createActorNeeds, readActorNeeds } from '../src/systems/actor/needs';
import { createActorClock, readActorClock } from '../src/systems/actor/clock';
import { createActorSenses, type ActorSenses } from '../src/systems/actor/senses';
import { FieldChannel } from '../src/systems/fields';
import { scanSpareInventory } from '../src/systems/npc_work';
import { makeTestNpc } from './helpers';

/* Склад и роуминг в ядре актора.
 *
 * Оба драйва — строки данных, и проверяется здесь ровно то, что перенос обязан
 * был сохранить: тяга склада поднимается ВЕЩАМИ (лишнее в карманах, пустой
 * магазин), квестовая вещь неотчуждаема, а роуминг остаётся ФОНОВЫМ ПОЛОМ — он
 * стоит выше порога захвата в любой час и уступает и телу, и страху.
 */

/** Порог, ниже которого ядро вообще не берёт актора (`brain.ts`, `CLAIM_FLOOR`). */
const CLAIM_FLOOR = 0.15;

/** Пустое восприятие: ни врагов, ни своих, ни крови под ногами. */
function calmSenses(e: Entity): ActorSenses {
  const s = createActorSenses();
  s.actor = e;
  s.beast = false;
  s.cell = 0;
  s.armed = true;
  s.nearestHostileDist = Infinity;
  s.nearestVisibleHostileDist = Infinity;
  s.captureDistance = Infinity;
  return s;
}

function viewAt(e: Entity, hour: number, samosbor = false): DriveView {
  return {
    senses: calmSenses(e),
    needs: readActorNeeds(e, createActorNeeds()),
    clock: readActorClock({ hour, minute: 0, totalMinutes: hour * 60 }, samosbor, createActorClock()),
  };
}

function makeActor(overrides: Partial<Entity> = {}): Entity {
  const e = makeTestNpc({ id: 7, x: 12, y: 12, ...overrides });
  e.hp = 100;
  e.maxHp = 100;
  e.needs = { food: 100, water: 100, sleep: 100, pee: 0, poo: 0 };
  e.ai = { goal: AIGoal.IDLE, tx: e.x, ty: e.y, path: [], pi: 0, stuck: 0, timer: 0 };
  return e;
}

function score(id: 'store' | 'wander' | 'eat' | 'hide', v: DriveView): number {
  return scoreDrive(DRIVE_BY_ID[id], v, undefined);
}

/* ── СКЛАД ─────────────────────────────────────────────────────────────── */

test('склад объявлен строкой данных: ярус комнаты, назначение store, занятие — смена', () => {
  const def = DRIVE_BY_ID.store;
  assert.ok(def, 'драйв store не зарегистрирован');
  assert.equal(def.tier, 'room');
  assert.equal(def.affordance, 'store');
  assert.equal(def.group, 'work');
  // Отдельного занятия у носки вещей нет: для речи и анимаций это та же смена.
  assert.equal(def.arrivedState, NpcState.WORKING);
  assert.ok(def.onArrived, 'складской цикл не подключён к приходу');
  assert.ok(def.roomTarget, 'у рейса нет собственного адреса');
  assert.ok(roomAffordanceWeight(15 as never, 'store') >= 0);
});

test('склада у твари нет, и выключен он весом, а не веткой', () => {
  assert.equal(driveWeight('beast', 'store'), 0);
  assert.equal(driveWeight('beast', 'wander'), 0);
});

test('тягу к складу поднимают ВЕЩИ: пустые карманы — нулевой драйв', () => {
  const empty = makeActor();
  assert.equal(score('store', viewAt(empty, 12)), 0, 'с пустыми карманами склад не нужен');

  const loaded = makeActor();
  loaded.inventory = [
    { defId: 'armor_light', count: 1 },
    { defId: 'armor_medium', count: 1 },
    { defId: 'armor_heavy', count: 1 },
  ];
  assert.equal(scanSpareInventory(loaded).count, 3);
  assert.ok(score('store', viewAt(loaded, 12)) > CLAIM_FLOOR,
    'три лишние вещи обязаны поднять склад выше порога захвата');
});

test('нечем стрелять — сильнейшая причина рейса, и она работает В ЛЮБОЙ ЧАС', () => {
  const dry = makeActor({ weapon: 'makarov' });
  dry.inventory = [];
  const twoSpares = makeActor({ id: 7 });
  twoSpares.inventory = [
    { defId: 'armor_light', count: 1 },
    { defId: 'armor_medium', count: 1 },
  ];
  assert.ok(score('store', viewAt(dry, 12)) > score('store', viewAt(twoSpares, 12)),
    'пустой магазин обязан тянуть сильнее пары лишних вещей');

  // Рейс за патронами возникает после стрельбы, а не по расписанию: ночью он
  // слабее, но остаётся делом, за которое ядро берёт актора.
  for (const hour of [0, 3, 6, 9, 12, 15, 18, 21]) {
    assert.ok(score('store', viewAt(dry, hour)) > CLAIM_FLOOR,
      `в ${hour}:00 рейс за патронами провалился ниже порога захвата`);
  }

  const armed = makeActor({ weapon: 'makarov' });
  armed.inventory = [{ defId: 'ammo_9mm', count: 20 }];
  assert.equal(score('store', viewAt(armed, 12)), 0, 'с патронами в кармане склад не нужен');
});

test('квестовая вещь неотчуждаема: на склад её не сдают', () => {
  const relicId = 'test_actor_store_relic';
  const relic: ItemDef = {
    id: relicId,
    name: 'Тестовая реликвия',
    type: ItemType.MISC,
    value: 500,
    tags: ['quest'],
  } as ItemDef;
  ITEMS[relicId] = relic;
  try {
    const e = makeActor();
    e.inventory = [
      { defId: relicId, count: 1 },
      { defId: 'armor_light', count: 1 },
      { defId: 'armor_medium', count: 1 },
    ];
    const spare = scanSpareInventory(e);
    assert.equal(spare.count, 2, 'реликвия попала в излишки — её сдадут в первый же ящик');
    assert.ok(spare.first > 0, 'первым лишним слотом оказалась защищённая вещь');
  } finally {
    delete ITEMS[relicId];
  }
});

test('самосбор отменяет рейс целиком', () => {
  const e = makeActor();
  e.inventory = [
    { defId: 'armor_light', count: 1 },
    { defId: 'armor_medium', count: 1 },
    { defId: 'armor_heavy', count: 1 },
  ];
  assert.ok(score('store', viewAt(e, 12)) > 0);
  assert.equal(score('store', viewAt(e, 12, true)), 0);
});

/* ── РОУМИНГ ───────────────────────────────────────────────────────────── */

test('роуминг объявлен строкой данных: комната, назначение wander, дело дороги', () => {
  const def = DRIVE_BY_ID.wander;
  assert.ok(def, 'драйв wander не зарегистрирован');
  assert.equal(def.tier, 'room');
  assert.equal(def.affordance, 'wander');
  assert.ok(def.roamSec !== undefined && def.roamSec > 0,
    'роуминг обязан быть делом ДОРОГИ: без такта переезда актор осядет в первой же комнате');
  assert.ok(def.roomTarget, 'развилка «интересная комната или потоптаться тут» не подключена');
});

test('роуминг — ФОНОВЫЙ ПОЛ: он выше порога захвата в любой час суток', () => {
  const e = makeActor();
  for (let hour = 0; hour < 24; hour++) {
    const s = score('wander', viewAt(e, hour));
    assert.ok(s > CLAIM_FLOOR,
      `в ${hour}:00 роуминг просел до ${s.toFixed(3)} — «нечего делать» снова стало молчаливой уступкой`);
  }
});

test('полоса фонового пола: выше порога захвата, но слабее самого слабого дела', () => {
  /* Полоса узкая и заперта с обеих сторон. Снизу — порог захвата: провалившись
   * под него, роуминг перестаёт быть решением. Сверху — ближний сбор, самое
   * слабое настоящее дело ядра: свой в девяти клетках стоит 0.27, и обыграв его,
   * фоновый пол начнёт растаскивать людей от своих. */
  const HUDDLE_AT_NINE = 0.27;
  let low = Infinity;
  let high = 0;
  for (let id = 1; id <= 64; id++) {
    const e = makeActor({ id, alifeId: id });
    for (const hour of [0, 6, 12, 18, 23]) {
      const s = score('wander', viewAt(e, hour));
      if (s < low) low = s;
      if (s > high) high = s;
    }
  }
  assert.ok(low > CLAIM_FLOOR, `нижняя граница полосы ${low.toFixed(3)} утонула под порогом захвата`);
  assert.ok(high < HUDDLE_AT_NINE, `верхняя граница полосы ${high.toFixed(3)} обыгрывает ближний сбор`);
});

test('роуминг остаётся полом: он не перебивает ни тело, ни страх', () => {
  const hungry = makeActor();
  hungry.needs = { food: 12, water: 100, sleep: 100, pee: 0, poo: 0 };
  const hv = viewAt(hungry, 18); // вечер — самый сильный час прогулки
  assert.ok(score('eat', hv) > score('wander', hv),
    'голод обязан перебивать прогулку, иначе люди перестанут ходить есть');

  const scared = makeActor();
  const sv = viewAt(scared, 18);
  sv.senses.hostiles = 2;
  sv.senses.hostilePower = 60;
  // Прячутся ОТ ПРОСТОРА: в глухом углу прятаться уже некуда, и без просвета
  // укрытие честно молчит — это его контекст, а не поломка.
  sv.senses.field[FieldChannel.OPENNESS] = 0.7;
  // Враг в поле зрения обнуляет возможность гулять целиком: гулять при нём
  // некуда, и это не «слабее», а «нельзя».
  assert.equal(score('wander', sv), 0, 'при враге рядом прогулка обязана обнуляться');
  assert.ok(score('hide', sv) > 0, 'а укрытие — работать');
});

test('развилка 68/32 перебрасывается: один и тот же человек и ходит, и топчется', () => {
  const def = DRIVE_BY_ID.wander;
  // Комната под ногами обязана быть: ветка «потоптаться здесь» именно её и
  // называет, и на пустой карте развилка выродилась бы в один ответ.
  const world = { rooms: [], roomAt: () => ({ id: 5 }) } as never;
  const e = makeActor();
  const answers = new Set<number>();
  // Такт развилки — 15 секунд; двух минут хватает, чтобы увидеть обе ветки.
  for (let t = 0; t < 120; t += 5) answers.add(def.roomTarget!(world, e, t));
  assert.ok(answers.size > 1,
    'ответ развилки заморожен: треть населения не пошла бы в интересные комнаты никогда');
});

test('бродяга и домосед стоят в разных состояниях', () => {
  const def = DRIVE_BY_ID.wander;
  const world = {} as never;
  const settled = makeActor({ isTraveler: false, assignedRoomId: 3 });
  def.onArrived!(world, settled, 0);
  assert.equal(settled.ai!.npcState, NpcState.FREE_TIME);

  const traveler = makeActor({ id: 8, isTraveler: true, occupation: Occupation.TRADER });
  def.onArrived!(world, traveler, 0);
  assert.equal(traveler.ai!.npcState, NpcState.TRAVELING,
    'у TRAVELING живые читатели в репликах, опциях взаимодействия и анимациях');
});
