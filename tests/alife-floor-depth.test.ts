import test from 'node:test';
import assert from 'node:assert/strict';

import { Faction, type GameState } from '../src/core/types';
import {
  createPrefilledAlifeState,
  getAlifeNpcRecordSnapshot,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { initFactionRelations } from '../src/data/relations';
import { designFloorAtZ } from '../src/data/design_floors';

/* Глубина этажа доходит до личности.
 *
 * Санитайзер координаты держал старую шестиключевую шкалу (30..200), а канон
 * убывает с глубиной и уходит в минус: министерство 30, квартиры 14, жилой 0,
 * коллекторы −26, ад −36, пустота −50. Всё, что ниже 30, санитайзер отвергал и
 * подменял на 100 — координату, которой в каноне нет. Хранилище было
 * `Uint8Array`, то есть отрицательную высоту физически не вмещало.
 *
 * Цена была не косметическая: `floorDanger` разбирал ту же мёртвую шкалу и на
 * каноническом этаже возвращал `undefined`, поэтому опасность у ВСЕХ падала в
 * единицу, а от неё считаются уровень, богатство и состав фракций. Ад населялся
 * первым уровнем с нулём денег наравне с жилым этажом.
 *
 * Замок держит обе стороны: канон доезжает целым, мёртвая шкала не принимается. */

const FLOORS: ReadonlyArray<{ key: string; z: number }> = [
  { key: 'design:ministry', z: 30 },
  { key: 'design:kvartiry', z: 14 },
  { key: 'design:living', z: 0 },
  { key: 'design:maintenance', z: -26 },
  { key: 'design:hell', z: -36 },
  { key: 'design:void', z: -50 },
];

const PER_FLOOR = 96;

const PLAN: AlifePopulationPlan = {
  buckets: FLOORS.map(f => ({ floorKey: f.key, z: f.z, targetCount: PER_FLOOR })),
};

function seededState(): GameState {
  initFactionRelations();
  const state = {
    currentZ: 0,
    time: 0,
    tick: 0,
    clock: { hour: 8, minute: 0, totalMinutes: 480 },
    quests: [],
    msgs: [],
    msgLog: [],
  } as unknown as GameState;
  setFloorRunState(state, undefined);
  createPrefilledAlifeState(state, 777, FLOORS.length * PER_FLOOR, PLAN);
  return state;
}

test('каноническая высота этажа доезжает до записи A-Life целой', () => {
  const state = seededState();
  const seen = new Map<string, Set<number>>();
  for (let id = 1; id <= FLOORS.length * PER_FLOOR; id++) {
    const snap = getAlifeNpcRecordSnapshot(state, id);
    if (!snap) continue;
    let zs = seen.get(snap.floorKey);
    if (!zs) { zs = new Set(); seen.set(snap.floorKey, zs); }
    zs.add(snap.z);
  }
  for (const floor of FLOORS) {
    const zs = [...(seen.get(floor.key) ?? [])];
    assert.deepEqual(zs, [floor.z], `${floor.key}: высота записи разошлась с маршрутом`);
  }
});

/** Средний уровень и достаток населения этажа. */
function averages(state: GameState, floorKey: string): { level: number; money: number } {
  let level = 0;
  let money = 0;
  let n = 0;
  for (let id = 1; id <= FLOORS.length * PER_FLOOR; id++) {
    const snap = getAlifeNpcRecordSnapshot(state, id);
    if (!snap || snap.floorKey !== floorKey) continue;
    level += snap.level;
    money += snap.money;
    n++;
  }
  return n > 0 ? { level: level / n, money: money / n } : { level: 0, money: 0 };
}

test('авторский состав этажа читается: мясной низ достаётся культу', () => {
  const state = seededState();
  const share = (floorKey: string, faction: Faction): number => {
    let hit = 0;
    let n = 0;
    for (let id = 1; id <= FLOORS.length * PER_FLOOR; id++) {
      const snap = getAlifeNpcRecordSnapshot(state, id);
      if (!snap || snap.floorKey !== floorKey) continue;
      if (snap.faction === faction) hit++;
      n++;
    }
    return n > 0 ? hit / n : 0;
  };
  /* Вес культа: жилой 0.08, мясной низ 9.5 — разница в сто раз объявлена
   * автором в `ALIFE_FACTION_PROFILES`. Пока таблица стояла на мёртвой шкале,
   * оба этажа читали дефолт, и мясной низ населяли горожане. */
  assert.ok(
    share('design:hell', Faction.CULTIST) > share('design:living', Faction.CULTIST),
    'культ не гуще на мясном низу, чем в жилом',
  );
});

test('опасность маршрута доходит до людей: глубина поднимает уровень и достаток', () => {
  const state = seededState();
  // Авторская опасность: жилой 1, мясной низ 5 — крайние точки шкалы.
  assert.equal(designFloorAtZ(0)?.danger, 1);
  assert.equal(designFloorAtZ(-36)?.danger, 5);

  const calm = averages(state, 'design:living');
  const deep = averages(state, 'design:hell');
  assert.ok(deep.level > calm.level, `мясной низ не опаснее жилого: ${deep.level} vs ${calm.level}`);
  assert.ok(deep.money > calm.money, `мясной низ не богаче жилого: ${deep.money} vs ${calm.money}`);
});
