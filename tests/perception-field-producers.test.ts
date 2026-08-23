/* Замок на ПРОДЮСЕРОВ полей восприятия.
 *
 * Слой полей был построен и заперт отдельно (`perception-fields.test.ts`), но
 * четыре из шести каналов стояли пустыми: движок диффузии работал вхолостую.
 * Здесь проверяется ровно то, что в каналы кто-то пишет и пишет правильно.
 *
 * ПЕРВОЕ — страйд. Депозит присутствия на каждом кадре насыщает байт до 255 за
 * долю секунды, и поле перестаёт нести градиент: «людно» становится
 * неотличимо от «кто-то прошёл». Депозит обязан идти раз в
 * FIELD_DEPOSIT_STRIDE_MASK + 1 кадров, с фазой от id.
 *
 * ВТОРОЕ — игрок. По закону владельца «игрок — просто NPC» он обязан писать в
 * PEOPLE и SCENT наравне со всеми, хотя цикл AI его логику и пропускает.
 *
 * ТРЕТЬЕ — след. SCENT ставится на ВХОДЕ в новую клетку, а не по таймеру: иначе
 * плотность следа зависела бы от скорости актора и от частоты кадров, а
 * топчущийся на месте выжигал бы свою клетку до потолка.
 *
 * ЧЕТВЁРТОЕ — шум. Громкость в поле выводится из уже существующего радиуса
 * слышимости, и одна запись ложится в поле ровно один раз.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, EntityType, Faction, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import {
  FieldChannel,
  FIELD_DEPOSIT_STRIDE_MASK,
  FIELD_PRESENCE_DEPOSIT,
  FIELD_SCENT_DEPOSIT,
  FIELD_VALUE_MAX,
  fieldAt,
  resetPerceptionFieldsState,
} from '../src/systems/fields';
import { updateAI } from '../src/systems/ai';
import { stepActorBy } from '../src/systems/movement_collision';
import {
  depositPendingNoise,
  findNoiseForActor,
  publishNoise,
  resetNoiseRecords,
} from '../src/systems/noise';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

const FRAME = 1 / 60;
const STRIDE = FIELD_DEPOSIT_STRIDE_MASK + 1;

/** Мир без запекания просвета: продюсеров оно не трогает, а стоит O(W²). */
function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  resetPerceptionFieldsState();
  world.perceptionBaked = true;
  return world;
}

/** Сумма канала по всему миру. Устойчива к тому, что актор за прогон сдвинулся:
 *  проверяется, сколько в канал влили, а не в какой именно клетке это осело. */
function channelTotal(world: World, ch: FieldChannel): number {
  const plane = world.perceptionFields;
  const base = ch * world.cells.length;
  let sum = 0;
  for (let i = 0; i < world.cells.length; i++) sum += plane[base + i];
  return sum;
}

function makeMonster(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    name: 'Тестовый монстр',
    faction: Faction.MONSTER,
    hp: 50,
    maxHp: 50,
    ai: { goal: 0, timer: 1, path: [], pi: 0, tx: x, ty: y, stuck: 0 },
  } as Entity;
}

/** Прогнать кадры настоящего updateAI. Поля НЕ тикают: без диффузии депозит
 *  остаётся ровно там, куда его положили, и утверждения становятся точными. */
function runFrames(world: World, entities: Entity[], frames: number): void {
  const state = makeGameState({ currentZ: 0 });
  const nextId = { v: 900_000 };
  const player = entities.find(e => e.faction === Faction.PLAYER);
  if (player) setCurrentPlayerEntity(player);
  for (let f = 0; f < frames; f++) {
    state.time += FRAME;
    rebuildEntityIndexForSimulation(entities, f);
    updateAI(
      world, entities, FRAME, state.time, state.msgs, player?.id ?? -1,
      state.clock, false, nextId, 0, state,
    );
  }
}

test('люди и звери попадают каждый в свой канал', () => {
  const world = openWorld();
  const npc = makeTestNpc({ id: 11, x: 40.5, y: 40.5, speed: 0 });
  npc.ai = { goal: 0, timer: 1, path: [], pi: 0, tx: 40.5, ty: 40.5, stuck: 0 } as Entity['ai'];
  const monster = makeMonster(12, 60.5, 60.5);

  runFrames(world, [npc, monster], STRIDE * 4);

  assert.ok(channelTotal(world, FieldChannel.PEOPLE) > 0, 'человек обязан писать в PEOPLE');
  assert.ok(channelTotal(world, FieldChannel.BEASTS) > 0, 'монстр обязан писать в BEASTS');
  // Каналы не путаются: человек не зверь и наоборот.
  assert.equal(fieldAt(world, FieldChannel.BEASTS, 40, 40), 0, 'человек не должен писать в BEASTS');
  assert.equal(fieldAt(world, FieldChannel.PEOPLE, 60, 60), 0, 'монстр не должен писать в PEOPLE');
});

test('игрок пишет в PEOPLE наравне с NPC: он просто ещё один человек', () => {
  const world = openWorld();
  /* Сущность игрока НЕ заводит `ai` — ровно так её и строит `main.ts`. Значит
   * её нет в `entityIndex.ai`, и цикл AI до неё не доходит в принципе: депозит
   * обязан идти отдельным вызовом. Именно поэтому здесь нет `player.ai`. */
  const player = makeTestPlayer({ id: 1, x: 30.5, y: 30.5, speed: 0 });
  assert.equal(player.ai, undefined, 'игрок в игре живёт без AIState — тест обязан это повторять');

  runFrames(world, [player], STRIDE * 2);

  assert.ok(fieldAt(world, FieldChannel.PEOPLE, 30, 30) > 0, 'игрок обязан писать в PEOPLE');
  assert.ok(fieldAt(world, FieldChannel.SCENT, 30, 30) > 0, 'игрок обязан оставлять след');
});

test('страйд не даёт присутствию насытить байт', () => {
  const world = openWorld();
  const npc = makeTestNpc({ id: 7, x: 50.5, y: 50.5, speed: 0 });
  npc.ai = { goal: 0, timer: 1, path: [], pi: 0, tx: 50.5, ty: 50.5, stuck: 0 } as Entity['ai'];

  // Ровно столько кадров, что без страйда байт был бы давно на потолке:
  // FIELD_PRESENCE_DEPOSIT на каждом кадре даёт 255 меньше чем за секунду.
  const frames = STRIDE * 6;
  runFrames(world, [npc], frames);

  const total = channelTotal(world, FieldChannel.PEOPLE);
  assert.ok(total < FIELD_VALUE_MAX, `поле насыщено: ${total}`);
  assert.ok(
    total <= Math.ceil(frames / STRIDE) * FIELD_PRESENCE_DEPOSIT,
    `депозитов больше, чем разрешает страйд: ${total}`,
  );
  assert.ok(total >= FIELD_PRESENCE_DEPOSIT, `не было ни одного депозита: ${total}`);
});

test('след ставится на входе в клетку, а не на каждом шаге', () => {
  const world = openWorld();
  const walker = makeTestNpc({ id: 21, x: 20.1, y: 20.5, speed: 1 });

  // Первое появление актора отмечается: иначе только что заспавненный не
  // оставлял бы следа до самой границы клетки.
  assert.ok(stepActorBy(world, walker, 0.2, 0), 'шаг внутри клетки должен пройти');
  assert.equal(fieldAt(world, FieldChannel.SCENT, 20, 20), FIELD_SCENT_DEPOSIT);

  // А вот второй шаг внутри ТОЙ ЖЕ клетки следа уже не добавляет, иначе
  // топчущийся на месте выжигает свою клетку до потолка.
  assert.ok(stepActorBy(world, walker, 0.1, 0), 'второй шаг внутри клетки должен пройти');
  assert.equal(
    channelTotal(world, FieldChannel.SCENT), FIELD_SCENT_DEPOSIT,
    'внутри одной клетки след не нарастает',
  );

  // Шаг через границу клетки — новый след.
  assert.ok(stepActorBy(world, walker, 0.9, 0), 'шаг в соседнюю клетку должен пройти');
  assert.equal(Math.floor(walker.x), 21, 'актор обязан оказаться в новой клетке');
  assert.equal(fieldAt(world, FieldChannel.SCENT, 21, 20), FIELD_SCENT_DEPOSIT);

  // Ещё один шаг внутри новой клетки следа не добавляет.
  stepActorBy(world, walker, 0.05, 0);
  assert.equal(fieldAt(world, FieldChannel.SCENT, 21, 20), FIELD_SCENT_DEPOSIT, 'след не должен нарастать на месте');
});

test('шум ложится в поле по своему радиусу и ровно один раз', () => {
  const world = openWorld();
  resetNoiseRecords();
  const state = makeGameState({ currentZ: 0 });

  publishNoise(state, {
    x: 70.5, y: 70.5, radius: 24, ttl: 3, source: 'weapon_fire', severity: 4,
  });
  publishNoise(state, {
    x: 80.5, y: 80.5, radius: 3, ttl: 1, source: 'footstep', severity: 1,
  });
  depositPendingNoise(world, state);

  const loud = fieldAt(world, FieldChannel.NOISE, 70, 70);
  const quiet = fieldAt(world, FieldChannel.NOISE, 80, 80);
  assert.ok(loud > 0, 'выстрел обязан попасть в поле');
  assert.ok(loud > quiet, 'выстрел обязан быть громче шага');

  // Повторный слив ничего не добавляет: курсор помнит, что уже учтено.
  depositPendingNoise(world, state);
  assert.equal(fieldAt(world, FieldChannel.NOISE, 70, 70), loud, 'запись не должна лечь в поле дважды');
  resetNoiseRecords();
});

test('точная отсечка по прямому расстоянию не меняет, кто что услышал', () => {
  const world = openWorld();
  resetNoiseRecords();
  const state = makeGameState({ currentZ: 0 });
  const listener = makeTestNpc({ id: 31, x: 100.5, y: 100.5 });

  const near = publishNoise(state, {
    x: 104.5, y: 100.5, radius: 12, ttl: 5, source: 'weapon_fire', severity: 4,
  });
  assert.ok(near, 'запись обязана опубликоваться');
  assert.equal(
    findNoiseForActor(world, state, listener, state.time)?.id, near!.id,
    'шум внутри радиуса обязан быть услышан',
  );

  // Тот же шум, но за пределами своего радиуса: отсечка обязана его отбросить,
  // как отбрасывало и полное акустическое расстояние.
  resetNoiseRecords();
  const far = makeTestNpc({ id: 32, x: 100.5, y: 100.5 });
  publishNoise(state, {
    x: 140.5, y: 100.5, radius: 12, ttl: 5, source: 'weapon_fire', severity: 4,
  });
  assert.equal(
    findNoiseForActor(world, state, far, state.time), undefined,
    'шум за радиусом слышен быть не должен',
  );
  resetNoiseRecords();
});
