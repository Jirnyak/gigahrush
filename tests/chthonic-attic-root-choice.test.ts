/* Замок ветви корня на чердаке.
 *
 * `ChthonicAtticRootChoice` меняет геометрию этажа: створки, гермозакрытия,
 * прожиг молельной ниши и цену укрытия. До 2026-09-09 манифест звал генератор
 * без аргумента — ветвь была навсегда `'cut'`, а `'feed'` и `'burn'` оставались
 * написанным и никем не виденным контентом; `publishChthonicAtticRootChoice`
 * при этом не звали ни разу, и мир не знал, какой чердак ему достался.
 *
 * Замок держит КЛАСС: каждая объявленная ветвь обязана появляться в прогонах И
 * обязана оставлять этаж проходимым. Число прогонов взято с запасом — порог по
 * двум сидам не порог.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { Cell, W, type Entity } from '../src/core/types';
import { auditReachability } from '../src/core/world';
import { withSeededRandom } from '../src/core/rand';
import {
  CHTHONIC_ATTIC_ROOT_CHOICES,
  DESIGN_FLOOR_ID,
  DESIGN_FLOOR_Z,
  bindChthonicAtticRootState,
  chthonicAtticRootAnnounced,
  chthonicAtticRootChoiceForSeed,
  generateChthonicAtticDesignFloor,
  resetChthonicAtticArrival,
} from '../src/gen/chthonic_attic';
import { designFloorGenerationSeed } from '../src/gen/design_floors/manifest';
import { runContentFloorArrivalHooks } from '../src/systems/content_hooks';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { makeGameState, makeTestPlayer } from './helpers';

const RUNS = 240;

test('все три ветви корня выпадают в обычных прогонах', () => {
  const seen = new Map<string, number>();
  for (let runSeed = 1; runSeed <= RUNS; runSeed++) {
    const choice = chthonicAtticRootChoiceForSeed(designFloorGenerationSeed(DESIGN_FLOOR_ID, runSeed));
    seen.set(choice, (seen.get(choice) ?? 0) + 1);
  }
  for (const choice of CHTHONIC_ATTIC_ROOT_CHOICES) {
    const hits = seen.get(choice) ?? 0;
    assert.ok(hits > 0, `ветвь ${choice} не выпадает ни в одном из ${RUNS} прогонов — это мёртвый контент`);
    /* Разбивка не обязана быть ровной, но ветвь, встречающаяся раз на сто, для
     * игрока такая же несуществующая, как и мёртвая. */
    assert.ok(hits >= RUNS / 10, `ветвь ${choice}: ${hits} из ${RUNS}`);
  }
  assert.equal([...seen.keys()].every(c => (CHTHONIC_ATTIC_ROOT_CHOICES as readonly string[]).includes(c)), true);
});

test('ветвь выводится из сида и не зависит от глобального жребия', () => {
  const seed = designFloorGenerationSeed(DESIGN_FLOOR_ID, 4242);
  const first = chthonicAtticRootChoiceForSeed(seed);
  /* Тот же сид под другим состоянием глобального RNG обязан дать ту же ветвь:
   * иначе вариант поедет от любой правки соседнего этажа. */
  const second = withSeededRandom(777, () => chthonicAtticRootChoiceForSeed(seed));
  assert.equal(first, second);
});

test('ни одна ветвь не запирает этаж', () => {
  for (const choice of CHTHONIC_ATTIC_ROOT_CHOICES) {
    const gen = withSeededRandom(1337, () => generateChthonicAtticDesignFloor(choice));
    for (const check of gen.routeChecks) {
      assert.equal(check.reachable, true, `ветвь ${choice}: выход ${check.exitId} недостижим`);
    }
    const { reachable } = auditReachability(gen.world, gen.world.idx(Math.floor(gen.spawnX), Math.floor(gen.spawnY)));
    const dead = gen.world.rooms.filter(room => {
      if (!room) return false;
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) if (reachable[gen.world.idx(x, y)]) return false;
      }
      return true;
    });
    assert.deepEqual(dead.map(r => r.name), [], `ветвь ${choice} оставила комнату без единой достижимой клетки`);
    let passable = 0;
    for (let i = 0; i < W * W; i++) {
      const cell = gen.world.cells[i];
      if (cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.LIFT || cell === Cell.WATER) passable++;
    }
    assert.ok(passable > 700_000, `ветвь ${choice}: проходимых клеток ${passable}`);
  }
});

test('прибытие объявляет ветвь миру, и один раз', () => {
  for (const choice of CHTHONIC_ATTIC_ROOT_CHOICES) {
    resetChthonicAtticArrival();
    const gen = withSeededRandom(1337, () => generateChthonicAtticDesignFloor(choice));
    bindChthonicAtticRootState(gen.world, gen.rootState);

    const state = makeGameState({ currentZ: DESIGN_FLOOR_Z });
    state.worldEvents = createWorldEventState();
    const player = makeTestPlayer() as Entity;
    const ctx = {
      world: gen.world,
      entities: gen.entities,
      player,
      state,
      nextEntityId: { v: 900_000 },
      designFloorId: DESIGN_FLOOR_ID,
      z: DESIGN_FLOOR_Z,
      insideFloorInstance: false,
    };
    runContentFloorArrivalHooks(ctx);
    runContentFloorArrivalHooks(ctx);

    const announced = getRecentEvents(state, {}).filter(e => e.tags.includes(DESIGN_FLOOR_ID));
    assert.equal(announced.length, 1, `ветвь ${choice}: объявлений ${announced.length}`);
    assert.equal(announced[0].data?.choice, choice);
    assert.equal(announced[0].data?.crossFloorFlag, gen.rootState.crossFloorFlag);
    assert.equal(chthonicAtticRootAnnounced(), true);
  }
});

/* ── Негативные контроли ───────────────────────────────────────── */

test('чужой этаж не объявляет чердачную ветвь', () => {
  resetChthonicAtticArrival();
  const gen = withSeededRandom(1337, () => generateChthonicAtticDesignFloor('burn'));
  bindChthonicAtticRootState(gen.world, gen.rootState);

  const state = makeGameState({ currentZ: DESIGN_FLOOR_Z });
  state.worldEvents = createWorldEventState();
  /* Всё на месте, кроме маршрутного id: тот же мир, то же состояние, тот же
   * игрок — молчать заставляет только сторож этажа. */
  runContentFloorArrivalHooks({
    world: gen.world,
    entities: gen.entities,
    player: makeTestPlayer() as Entity,
    state,
    nextEntityId: { v: 900_000 },
    designFloorId: 'roof',
    z: DESIGN_FLOOR_Z,
    insideFloorInstance: false,
  });
  assert.equal(chthonicAtticRootAnnounced(), false);
  assert.equal(getRecentEvents(state, {}).filter(e => e.tags.includes(DESIGN_FLOOR_ID)).length, 0);
});

test('внутри экземпляра этажа прибытия не объявляют', () => {
  resetChthonicAtticArrival();
  const gen = withSeededRandom(1337, () => generateChthonicAtticDesignFloor('feed'));
  bindChthonicAtticRootState(gen.world, gen.rootState);

  const state = makeGameState({ currentZ: DESIGN_FLOOR_Z });
  state.worldEvents = createWorldEventState();
  runContentFloorArrivalHooks({
    world: gen.world,
    entities: gen.entities,
    player: makeTestPlayer() as Entity,
    state,
    nextEntityId: { v: 900_000 },
    designFloorId: DESIGN_FLOOR_ID,
    z: DESIGN_FLOOR_Z,
    insideFloorInstance: true,
  });
  assert.equal(chthonicAtticRootAnnounced(), false);
});
