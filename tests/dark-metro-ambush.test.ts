import test from 'node:test';
import assert from 'node:assert/strict';

import { type WorldEvent } from '../src/core/types';
import { generateDesignFloor } from '../src/gen/design_floors/manifest';
import { createWorldEventState } from '../src/systems/events';
import { getRouteCueMarkers, updateRouteCues } from '../src/systems/route_cues';
import { DARK_METRO_Z } from '../src/gen/dark_metro/meta';
// Наблюдатель шины регистрируется импортом пакета этажа.
import '../src/gen/dark_metro/ambush';
import { makeGameState, makeTestPlayer } from './helpers';

/* ── §2.3: этаж слышит собственную подсказку ──────────────────────
 * `publishDarkMetroAmbushWarning` был объявлен и не вызван ни разу: игрок
 * читал строку про обрыв белого света, а мир не знал, что игрока предупредили.
 * Теперь этаж подписан на свой же `route_cue` и добавляет к нему свой факт.
 *
 * Тест идёт НАСТОЯЩИМ путём — `updateRouteCues` на живом этаже, — а не зовёт
 * публикатор напрямую: иначе он проверял бы функцию, а не шов.
 */
function publishedEvents(state: ReturnType<typeof makeGameState>): WorldEvent[] {
  return state.worldEvents!.recentEvents.items.filter((e): e is WorldEvent => !!e);
}

function hearCue(cueId: string) {
  const gen = generateDesignFloor('dark_metro');
  const world = gen.world;
  const marker = getRouteCueMarkers(world).find(m => m.id === cueId);
  assert.ok(marker, `маркера ${cueId} нет на этаже`);

  const state = makeGameState({ worldEvents: createWorldEventState(), currentZ: DARK_METRO_Z, time: 100 });
  const player = makeTestPlayer({ x: marker.x, y: marker.y });
  updateRouteCues(world, player, state);
  return { state, events: publishedEvents(state) };
}

test('обрыв белого света объявляет засаду слепого тоннеля', () => {
  const { events } = hearCue('dark_metro_white_lamp_ambush');

  const cue = events.find(e => e.tags.includes('route_cue'));
  assert.ok(cue, 'сама подсказка не сработала — стенд сломан, а не шов');

  const ambush = events.find(e => e.tags.includes('ambush_cue'));
  assert.ok(ambush, 'предупреждение о засаде не дошло до шины');
  assert.equal(ambush.type, 'monster_sighted');
  assert.equal(ambush.tags.includes('dark_metro_white_lamp_ambush'), true);
  assert.equal(ambush.z, DARK_METRO_Z);
  assert.equal(typeof ambush.data?.warning, 'string');
});

test('стрелочное табло объявляет неверную посадку', () => {
  const { events } = hearCue('dark_metro_service_floor_shortcut');
  const ambush = events.find(e => e.tags.includes('ambush_cue'));
  assert.ok(ambush, 'предупреждение о чужой остановке не дошло до шины');
  assert.equal(ambush.tags.includes('dark_metro_red_panel_wrong_stop'), true);
});

test('маршрутная подсказка чужого этажа засаду не объявляет', () => {
  /* Отрицательный случай готов ко ВСЕМУ, кроме адреса: этаж настоящий, маркер
   * настоящий, `route_cue` публикуется — молчать обязан сторож этажа и таблица
   * соответствия, а не отсутствие подсказки. У самой Тёмной пересадки третьего
   * маркера нет, поэтому берётся подсказка соседнего маршрутного этажа. */
  const gen = generateDesignFloor('underhell');
  const world = gen.world;
  const markers = getRouteCueMarkers(world);
  assert.ok(markers.length > 0, 'у соседнего этажа нет подсказок — контроль был бы пустым');

  const state = makeGameState({ worldEvents: createWorldEventState(), currentZ: markers[0].z, time: 100 });
  const player = makeTestPlayer({ x: markers[0].x, y: markers[0].y });
  updateRouteCues(world, player, state);

  const events = publishedEvents(state);
  assert.ok(events.some(e => e.tags.includes('route_cue')), 'подсказка соседнего этажа не сработала');
  assert.equal(events.some(e => e.tags.includes('ambush_cue')), false, 'засаду объявила чужая подсказка');
});
