/*
 * Замок доходимости лестницы брони до мира.
 *
 * Что защищает. Цена и резисты у брони заперты двумя другими эталонами
 * (`armor-price-ladder`, `armor-matrix-parity`), и оба остаются зелёными на
 * вещи, до которой игрок физически не может добраться. Ценовая лестница прямо
 * объявляет броню ПОКУПКОЙ, а не находкой, — значит у каждой ступени обязан
 * быть прилавок или россыпь, и проверять это надо через ту же дверь, через
 * которую смотрит игра: `generateNpcTradeItems`.
 *
 * Отдельно заперт верх лестницы. СЗК-9 за 500 000 ₽ намеренно НЕ попадает в лут
 * ни при каком раскладе (`spawnW: 0`, и потолок запертого ящика на danger 5 —
 * 250 000 ₽): его единственный путь — прилавок завхоза, и витрину видно задолго
 * до денег на неё. Если однажды он выпадет из выкладки, вещь исчезнет из игры
 * молча — эту тишину строка ниже и ломает.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { EntityType, Faction, Occupation, RoomType, type Entity } from '../src/core/types';
import { ITEMS, itemEquipSlot } from '../src/data/items';
import { generateNpcTradeItems } from '../src/data/occupation_profiles';
import { seedGlobalRng } from '../src/core/rand';

const ARMORS = Object.values(ITEMS).filter(def => itemEquipSlot(def) === 'armor').map(def => def.id);

/** Торговец нужного ранга: ранг считается по уровню личности, 35+ — четвёртый. */
function trader(faction: Faction, occupation: Occupation, level: number): Entity {
  return {
    id: 1, type: EntityType.NPC, x: 0, y: 0, angle: 0, pitch: 0, alive: true, speed: 1,
    hp: 100, maxHp: 100, faction, occupation, questId: -1,
    rpg: { level, xp: 0, attrPoints: 0, str: 5, agi: 5, int: 5, psi: 0, maxPsi: 0 },
  } as unknown as Entity;
}

/** Что этот торговец способен выложить хоть в одном прогоне выкладки. */
function counterOf(npc: Entity, rolls = 200): Set<string> {
  const seen = new Set<string>();
  for (let i = 0; i < rolls; i++) {
    seedGlobalRng(1000 + i);
    for (const offer of generateNpcTradeItems(npc)) seen.add(offer.defId);
  }
  return seen;
}

test('у каждой ступени лестницы есть путь в мир: россыпь или прилавок', () => {
  const quartermaster = counterOf(trader(Faction.LIQUIDATOR, Occupation.ENGINEER, 40));
  const seniorScientist = counterOf(trader(Faction.SCIENTIST, Occupation.SCIENTIST, 40));

  const unreachable = ARMORS.filter(id => {
    if ((ITEMS[id].spawnW ?? 0) > 0 && ITEMS[id].spawnRooms.length > 0) return false;
    return !quartermaster.has(id) && !seniorScientist.has(id);
  });

  assert.deepEqual(unreachable, [], 'броня без россыпи обязана лежать хотя бы на одном прилавке');
});

test('верх лестницы — только витрина: в лут СЗК-9 не попадает никогда', () => {
  const top = ITEMS.armor_szk9;
  assert.equal(top.spawnW, 0, 'СЗК-9 не участвует в россыпи');
  assert.deepEqual(top.spawnRooms, [], 'у СЗК-9 нет комнат появления');
  assert.ok(
    counterOf(trader(Faction.LIQUIDATOR, Occupation.ENGINEER, 40)).has('armor_szk9'),
    'СЗК-9 обязан лежать на прилавке завхоза — другого пути к нему нет',
  );
  // И он дороже всей остальной лестницы: витрина обязана оставаться витриной.
  for (const id of ARMORS) {
    if (id === 'armor_szk9') continue;
    assert.ok(top.value > ITEMS[id].value, `${id} не дешевле верха лестницы`);
  }
});

test('специализация лежит там, где нужна, а не в общей россыпи', () => {
  // ОЗК — химзащита: медпункт и склад, НИИ и карантин. ТОК-200 — огневые
  // работы: цех и склад. Комнаты появления — это и есть адрес вещи в мире.
  assert.deepEqual(ITEMS.armor_ozk.spawnRooms.slice().sort(), ITEMS.protective_apron.spawnRooms.slice().sort(),
    'ОЗК водится там же, где кислотный фартук: медпункт и склад');
  /* Цех назван прямо, а не через `armor_heavy.spawnRooms[0]`. Ссылка на чужую
   * первую комнату была КОСВЕННОЙ: она держалась на том, что тяжёлая броня
   * тоже числится в цехе, и молча прошла бы, съедь обе строки куда угодно
   * вместе. А съехать пришлось: `spawnRooms` стал адресом «чья это одежда»
   * (`pickNpcArmor` сверяет их с рабочими комнатами занятия), и боевые
   * комплекты уехали к службе — иначе штурмовая броня доставалась механику
   * котельной чаще, чем охотнику гарнизона (864 против 0 на danger 5). */
  assert.ok(ITEMS.armor_tok200.spawnRooms.includes(RoomType.PRODUCTION),
    'ТОК-200 водится в цеху — там, где идут огневые работы');

  // И оба скромнее лёгкой брони по россыпи: узкий костюм — не общий хлам.
  for (const id of ['armor_ozk', 'armor_tok200']) {
    assert.ok(ITEMS[id].spawnW < ITEMS.armor_light.spawnW, `${id}: узкий костюм не бывает частым`);
  }
});

test('кислотный фартук остался вещдоком, а не стал ступенью лестницы', () => {
  /* РЕШЕНИЕ, а не недосмотр. Фартук в игре был раньше специализации, и соблазн
   * повесить резист на него велик. Нельзя: он стоит 95 ₽, и ценовая лестница
   * прямо запрещает броне начинаться раньше среднего маршрута — комплект за 109 ₽
   * со спредом по карману уже на старте и превращается в находку. Фартук поэтому
   * остаётся торговым вещдоком поста НИИ, а химзащита — отдельной вещью
   * средней ступени. */
  assert.equal(itemEquipSlot(ITEMS.protective_apron), null, 'фартук не занимает слот брони');
  assert.equal(ITEMS.protective_apron.resistances, undefined);
  assert.ok(ITEMS.protective_apron.value < ITEMS.armor_ozk.value / 100);
});
