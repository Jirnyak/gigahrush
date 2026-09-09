import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, type WorldEvent } from '../src/core/types';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { getDarknessState } from '../src/gen/darkness/geometry';
import { DARKNESS_PRESERVED_NAME_ID } from '../src/gen/darkness/npcs';
import { DARKNESS_FUTURE_Z as DARKNESS_Z } from '../src/gen/darkness/meta';
import { createWorldEventState } from '../src/systems/events';
import { updateContentRuntimeHooks } from '../src/systems/content_hooks';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { makeGameState, makeTestPlayer } from './helpers';
// Хук регистрируется импортом пакета этажа.
import '../src/gen/darkness/return_trace';

/* ── §2.3: вынесенное имя становится фактом ───────────────────────
 * `publishDarknessReturnTrace` был объявлен и не вызван ни разу, вместе с
 * `getDarknessState` и полем `returnTracePublished`, объявленным ровно под
 * этот случай. Карточка Тамары Беловой лежала в мире, и вынос её никем не
 * замечался.
 */
function findLift(world: ReturnType<typeof generateDesignFloor>['world']): number {
  for (let i = 0; i < world.cells.length; i++) if (world.cells[i] === Cell.LIFT) return i;
  return -1;
}

function stand(onLift: boolean, withCard: boolean) {
  const gen = generateDesignFloor('darkness');
  const world = gen.world;
  const lift = findLift(world);
  assert.ok(lift >= 0, 'на этаже нет лифта — стенд сломан');

  const state = makeGameState({ worldEvents: createWorldEventState(), currentZ: DARKNESS_Z, time: 100, tick: 30 });
  setFloorRunState(state, { runSeed: 11, currentZ: DARKNESS_Z, specs: {}, visited: {} });
  const cell = onLift ? lift : world.cells.findIndex(c => c === Cell.FLOOR);
  const player = makeTestPlayer({ x: (cell % 1024) + 0.5, y: Math.floor(cell / 1024) + 0.5 });
  if (withCard) {
    player.inventory = [{ defId: 'personal_file_copy', count: 1, data: { darknessNameId: DARKNESS_PRESERVED_NAME_ID } }];
  }

  updateContentRuntimeHooks({
    world, entities: [player], player, state, nextEntityId: { v: 9000 },
    dt: 0.016, phase: 'floor_activity', gameOver: false,
  });
  const events = state.worldEvents!.recentEvents.items.filter((e): e is WorldEvent => !!e);
  return { world, state, events, darkness: getDarknessState(world) };
}

test('имя, вынесенное на лифт, доходит до трёх поздних адресатов', () => {
  const { events, darkness } = stand(true, true);
  const trace = events.find(e => e.tags.includes('return_trace'));
  assert.ok(trace, 'след возврата не дошёл до шины');
  assert.equal(trace.type, 'rumor_observed');
  assert.equal(trace.tags.includes('living_hook'), true);
  assert.equal(trace.tags.includes('ministry_hook'), true);
  assert.equal(trace.tags.includes('yakov_hook'), true);
  assert.equal(trace.data?.preservedNameId, DARKNESS_PRESERVED_NAME_ID);
  assert.equal(darkness?.returnTracePublished, true, 'флаг повторной публикации не выставлен');
});

test('след возврата публикуется один раз', () => {
  const { world, state, darkness } = stand(true, true);
  assert.equal(darkness?.returnTracePublished, true);
  const before = state.worldEvents!.recentEvents.count;
  const player = makeTestPlayer({ x: 0, y: 0 });
  // Второй проход тем же путём: флаг обязан удержать.
  updateContentRuntimeHooks({
    world, entities: [player], player, state, nextEntityId: { v: 9001 },
    dt: 0.016, phase: 'floor_activity', gameOver: false,
  });
  assert.equal(state.worldEvents!.recentEvents.count, before, 'след опубликован повторно');
});

test('лифт без карточки и карточка вне лифта молчат', () => {
  /* Оба отрицательных случая готовы ко ВСЕМУ, кроме одного условия: этаж
   * настоящий, состояние настоящее, хук зовётся. Молчать обязан именно
   * недостающий признак, а не отсутствие стенда. */
  const noCard = stand(true, false);
  assert.equal(noCard.events.some(e => e.tags.includes('return_trace')), false, 'пустой лифт объявил вынос имени');
  assert.equal(noCard.darkness?.returnTracePublished, false);

  const notOnLift = stand(false, true);
  assert.equal(notOnLift.events.some(e => e.tags.includes('return_trace')), false, 'карточка объявила вынос вдали от лифта');
  assert.equal(notOnLift.darkness?.returnTracePublished, false);
});
