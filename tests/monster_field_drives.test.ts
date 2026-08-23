import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, MonsterKind, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { monsterHuntsBeasts, monsterPackShape, monsterPreysOn } from '../src/data/monster_ecology';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { getEntityIndex, rebuildEntityIndex } from '../src/systems/entity_index';
import { setEntityMap } from '../src/systems/ai/monster';
import {
  feedMonster,
  forgetMonsterFeeding,
  isMonsterSated,
  monsterWanderDrive,
  MONSTER_SATED_SEC,
} from '../src/systems/ai/monster_pack';
import {
  FieldChannel,
  FIELD_PRESENCE_DEPOSIT,
  fieldAt,
  fieldCellX,
  fieldMacroAt,
  fieldMacroTargetCell,
  depositPeople,
  prewarmPerceptionFields,
  updatePerceptionFields,
  resetPerceptionFieldsState,
} from '../src/systems/fields';

const CROWD_X = 44;
const CROWD_Y = 30;

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.WALL);
  for (let y = 1; y < 60; y++) {
    for (let x = 1; x < 60; x++) world.cells[world.idx(x, y)] = Cell.FLOOR;
  }
  world.cellVersion++;
  resetPerceptionFieldsState();
  prewarmPerceptionFields(world);
  return world;
}

function monster(id: number, kind: MonsterKind, x: number, y: number): Entity {
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
    sprite: 0,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
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
    speed: 3,
    sprite: 0,
    hp: 100,
    maxHp: 100,
    name: 'Житель',
    faction: Faction.CITIZEN,
  };
}

function prime(world: World, entities: Entity[]): void {
  rebuildEntityIndex(entities);
  getEntityIndex().beginTelemetryFrame();
  setEntityMap(new Map(entities.map(e => [e.id, e])));
  bakeNavigationTree(world);
}

/** Продержать толпу на месте столько, чтобы её плотность разошлась по полю.
 *  Депозит идёт с тем же стрйдом, что и в игровом цикле — раз в 16 кадров. */
function soakCrowd(world: World, crowd: readonly Entity[], seconds: number): void {
  const dt = 1 / 60;
  for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
    if ((frame & 15) === 0) {
      for (const person of crowd) depositPeople(world, person.x, person.y, FIELD_PRESENCE_DEPOSIT);
    }
    updatePerceptionFields(world, dt);
  }
}

function crowdOf(count: number): Entity[] {
  const crowd: Entity[] = [];
  for (let i = 0; i < count; i++) {
    crowd.push(citizen(100 + i, CROWD_X + (i % 3) - 1, CROWD_Y + ((i / 3) | 0) - 1));
  }
  return crowd;
}

/**
 * ДВА ЯРУСА ВОСПРИЯТИЯ, И ДАЛЬНИЙ ДРАЙВ ЖИВЁТ ТОЛЬКО НА ВЕРХНЕМ.
 *
 * Поклеточный ярус хранит байт, и доля соседа от малого значения округляется в
 * нём до нуля: хвост диффузии рвётся на второй-третьей клетке. Замерено на
 * НАСЫЩЕННОМ источнике (255 в клетке, долив каждый кадр, минута симуляции):
 * 0:255 1:59 2:1 3:0 — дальше нули при любой толпе и при любом времени.
 * Амплитуда тут ни при чём, это разрядность.
 *
 * Поэтому охота на скопление идёт по стратегическому ярусу 16×16, который
 * держит склон через весь этаж. Замок ниже фиксирует ОБА факта: близорукость
 * поклеточного и дальнозоркость стратегического. Если поклеточный вдруг
 * дотянулся дальше — тюнинг канала изменили, и драйвы надо пересмотреть.
 */
const PER_CELL_HORIZON = 3;

test('дальний склон несёт стратегический ярус, поклеточный близорук', () => {
  const world = openWorld();
  const crowd = crowdOf(6);
  soakCrowd(world, crowd, 20);

  assert.ok(fieldAt(world, FieldChannel.PEOPLE, CROWD_X, CROWD_Y) > 0, 'в клетке толпы должно быть людно');
  assert.equal(
    fieldAt(world, FieldChannel.PEOPLE, CROWD_X - PER_CELL_HORIZON - 1, CROWD_Y), 0,
    'поклеточный канал за горизонтом обязан быть пуст',
  );

  // Стратегический ярус видит ту же толпу далеко за горизонтом поклеточного.
  const far = CROWD_X - 24;
  assert.ok(
    fieldMacroAt(world, FieldChannel.PEOPLE, far, CROWD_Y) > 0,
    'стратегический ярус обязан чуять толпу там, где поклеточный уже пуст',
  );

  // И отдаёт цель для маршрута в сторону толпы.
  const cell = fieldMacroTargetCell(world, FieldChannel.PEOPLE, far, CROWD_Y, 1);
  assert.ok(cell >= 0, 'склона по людям не нашлось');
  const before = Math.abs(world.delta(far, CROWD_X));
  const after = Math.abs(world.delta(fieldCellX(cell), CROWD_X));
  assert.ok(after < before, `цель не ближе к толпе: было ${before}, стало ${after}`);
});

test('голодный хищник без цели идёт на скопление людей, сытый остаётся на месте', () => {
  const world = openWorld();
  const crowd = crowdOf(6);
  soakCrowd(world, crowd, 20);

  // Хищник стоит далеко за горизонтом ПОКЛЕТОЧНОГО яруса: увидеть толпу он не
  // может, и сдвинуть его может только дальний драйв по стратегическому.
  const hunter = monster(1, MonsterKind.TVAR, CROWD_X - 24, CROWD_Y);
  const entities = [hunter, ...crowd];
  prime(world, entities);

  forgetMonsterFeeding(hunter);
  const driven = monsterWanderDrive(world, hunter, 0);
  assert.ok(driven, 'голодный хищник обязан пойти на плотность людей');
  const before = Math.abs(world.delta(hunter.x, CROWD_X));
  const after = Math.abs(world.delta(hunter.ai!.tx, CROWD_X));
  assert.ok(after < before, `цель драйва не ближе к толпе: было ${before}, стало ${after}`);

  // Наевшаяся тварь ушла переваривать: прохожие ей не интересны.
  hunter.ai!.path = [];
  hunter.ai!.pi = 0;
  feedMonster(hunter, 0);
  assert.ok(isMonsterSated(hunter, 0), 'после кормёжки тварь обязана быть сыта');
  assert.equal(monsterWanderDrive(world, hunter, 0), false, 'сытая тварь не охотится');

  // Сытость проходит сама, и голод возвращается.
  assert.equal(isMonsterSated(hunter, MONSTER_SATED_SEC + 1), false);
  forgetMonsterFeeding(hunter);
});

test('отбившийся от стаи возвращается к своим, а стоящий в куче никуда не идёт', () => {
  const world = openWorld();
  const shape = monsterPackShape(MonsterKind.SBORKA);
  assert.ok(shape.size[1] > 1 && shape.spread > 0, 'сборка обязана быть стайным видом');

  const packX = 20;
  const packY = 20;
  const pack: Entity[] = [];
  for (let i = 0; i < 5; i++) pack.push(monster(10 + i, MonsterKind.SBORKA, packX + (i % 3), packY + ((i / 3) | 0)));
  // Отбившийся стоит дальше объявленного разброса, но внутри радиуса поиска своих.
  const stray = monster(20, MonsterKind.SBORKA, packX + shape.spread + 3, packY);
  const entities = [...pack, stray];
  prime(world, entities);

  const before = world.dist2(stray.x, stray.y, packX + 1, packY);
  assert.ok(monsterWanderDrive(world, stray, 0), 'отбившийся обязан пойти к своим');
  const after = world.dist2(stray.ai!.tx, stray.ai!.ty, packX + 1, packY);
  assert.ok(after < before, `стая не притянула: было ${before}, стало ${after}`);

  // Тот, кто уже в куче, второй раз никуда не срывается.
  const inside = pack[0];
  inside.ai!.path = [];
  inside.ai!.pi = 0;
  assert.equal(monsterWanderDrive(world, inside, 0), false, 'стоящий в стае остаётся на месте');
});

test('пищевая цепь объявлена данными: хищник ест мелочь, мелочь хищника — нет', () => {
  assert.equal(monsterPreysOn(MonsterKind.TVAR, MonsterKind.SBORKA), true);
  assert.equal(monsterPreysOn(MonsterKind.GREEN_DOG, MonsterKind.POMOYNY_ROY), true);
  assert.equal(monsterPreysOn(MonsterKind.SBORKA, MonsterKind.TVAR), false);
  assert.equal(monsterPreysOn(MonsterKind.TVAR, MonsterKind.TVAR), false, 'своих не едят');
  assert.equal(monsterHuntsBeasts(MonsterKind.TVAR), true);
  assert.equal(monsterHuntsBeasts(MonsterKind.SBORKA), false, 'маска скана расширяется не всем');
});

test('дальность и каданс восприятия объявлены в дефе вида, а не в общем AI', () => {
  // Числа те же, что раньше лежали константами `*_DETECT_SQ` и веткой switch.
  assert.equal(MONSTERS[MonsterKind.PECHATEED].detect, 24);
  assert.equal(MONSTERS[MonsterKind.KONTORSHCHIK].detect, 28);
  assert.equal(MONSTERS[MonsterKind.PROTOKOLNIK].detect, 26);
  assert.equal(MONSTERS[MonsterKind.KANTSELYARSKIY_IDOL].detect, 23);
  assert.equal(MONSTERS[MonsterKind.SBORKA].scanSec, 0.55);
  assert.equal(MONSTERS[MonsterKind.SWARM].scanSec, 0.35);

  // Общий AI не имеет права знать конкретный вид: каждое объявленное число
  // должно быть либо дальностью, либо кадансом, и оба — положительные.
  for (const def of Object.values(MONSTERS)) {
    if (def.detect !== undefined) assert.ok(def.detect > 0, `${def.name}: дальность обязана быть > 0`);
    if (def.scanSec !== undefined) assert.ok(def.scanSec > 0, `${def.name}: каданс обязан быть > 0`);
  }
});
