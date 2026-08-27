/* Среда бьёт через ту же дверь и тем же типом — значит, встречает броню.
 *
 * До этой правки среда резала `hp` напрямую примерно в пятнадцати местах, и
 * следствие было ровно одно: химкомплект ОЗК за 16 000 ₽ с био-защитой 70 не
 * мешал кислоте в клетке НИЧЕМ, потому что кислота не знала, что она БИО, а
 * костюм ТОК-200 с огнестойкостью 70 не спасал от пара тепловой линии.
 *
 * Заперты обе половины закона:
 *   1. каждый тип средового урона режется СВОЕЙ бронёй и не режется чужой;
 *   2. голод и жажда бронёй НЕ режутся — они не удар, у них нет ни автора, ни
 *      типа, и защиты от них не бывает. Это единственное исключение по природе,
 *      и белый список инварианта «урон мимо двери» держит ровно его.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import { Cell, DamageType, EntityType, MonsterKind, type Entity, type GameState } from '../src/core/types';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { damageActorByEnvironment } from '../src/systems/actor_damage';
import { updateNeeds } from '../src/systems/needs';
import { registerCellHazardSite, tickCellHazards } from '../src/systems/cell_hazards';
import { makeGameState } from './helpers';

function probeWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

function probe(armorDefId?: string): Entity {
  return {
    id: 7,
    type: EntityType.NPC,
    x: 8.5,
    y: 8.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    hp: 1000,
    maxHp: 1000,
    armorDefId,
  };
}

/** Сколько среда снимет с этого носителя одним ударом такого типа. */
function envHit(state: GameState, damageType: DamageType, damage: number, armorDefId?: string): number {
  return damageActorByEnvironment(probeWorld(), state, probe(armorDefId), { damage, damageType, time: state.time });
}

test('химкомплект ОЗК спасает от кислоты и не спасает от огня', () => {
  const state = makeGameState();
  const bareBio = envHit(state, DamageType.BIO, 100);
  const ozkBio = envHit(state, DamageType.BIO, 100, 'armor_ozk');
  const ozkFire = envHit(state, DamageType.FIRE, 100, 'armor_ozk');

  assert.equal(bareBio, 100, 'без брони среда снимает всё');
  assert.equal(ozkBio, 30, 'ОЗК держит БИО на 70');
  assert.equal(ozkFire, 100, 'от огня ОЗК не держит ничего');
});

test('костюм ТОК-200 спасает от пара и огня и не спасает от кислоты', () => {
  const state = makeGameState();
  assert.equal(envHit(state, DamageType.FIRE, 100, 'armor_tok200'), 30, 'ТОК-200 держит ОГОНЬ на 70');
  assert.equal(envHit(state, DamageType.BIO, 100, 'armor_tok200'), 100, 'от кислоты ТОК-200 не держит ничего');
});

test('каждый тип средового урона режется своей бронёй', () => {
  const state = makeGameState();
  // Ряса культиста — единственная защита от ПСИ-протоколов Пустоты и псалма.
  assert.equal(envHit(state, DamageType.PSI, 100, 'armor_cultist'), 25);
  assert.equal(envHit(state, DamageType.PSI, 100, 'armor_ozk'), 100);
  // Плита — против обвала и состава на рельсах, но не против спор.
  assert.equal(envHit(state, DamageType.KINETIC, 100, 'armor_heavy'), 40);
  assert.equal(envHit(state, DamageType.BIO, 100, 'armor_heavy'), 80);
  // Сводный комплект СЗК-9 закрывает все шесть осей и потому стоит как установка.
  assert.equal(envHit(state, DamageType.ENERGY, 100, 'armor_szk9'), 40);
  assert.equal(envHit(state, DamageType.BIO, 100, 'armor_szk9'), 40);
});

test('среда не добивает игрока, но добивает всех прочих', () => {
  const state = makeGameState();
  const world = probeWorld();

  const npc = probe();
  npc.hp = 4;
  assert.equal(damageActorByEnvironment(world, state, npc, { damage: 40, damageType: DamageType.BIO }), 40);
  assert.ok(npc.hp <= 0, 'жильца кислота добивает');

  const player = probe();
  player.hp = 4;
  setCurrentPlayerEntity(player);
  try {
    const applied = damageActorByEnvironment(world, state, player, { damage: 40, damageType: DamageType.BIO });
    assert.equal(applied, 3, 'игроку среда оставляет единицу');
    assert.equal(player.hp, 1);

    // Состав на рельсах — единственная среда, которой разрешено добивать.
    player.hp = 4;
    damageActorByEnvironment(world, state, player, { damage: 40, damageType: DamageType.KINETIC, lethal: true });
    assert.ok((player.hp ?? 0) <= 0, 'поезд добивает и игрока');
  } finally {
    setCurrentPlayerEntity(null);
  }
});

test('голод и жажда бронёй не режутся: это не удар', () => {
  const state = makeGameState();

  function starve(armorDefId?: string): number {
    const e = probe(armorDefId);
    e.needs = { food: 0, water: 0, sleep: 100, pee: 0, poo: 0 };
    const before = e.hp!;
    // Тикаем как игрока: холодная когорта идёт по расписанию, а игрок — точно.
    updateNeeds([e], 10, state.time, [], e.id, undefined, state);
    return before - e.hp!;
  }

  const bare = starve();
  assert.ok(bare > 0, 'истощение снимает здоровье');
  // Ни один комплект не должен ослаблять истощение — ни по одной оси.
  for (const armor of ['armor_ozk', 'armor_tok200', 'armor_szk9', 'armor_liquidator', 'armor_cultist']) {
    assert.equal(starve(armor), bare, `${armor} не должен защищать от голода`);
  }
});

/* Интеграционный замок: кислотная клетка на живом этаже.
 *
 * Именно эта дорога была сломана — `applyHazardDamage` резал `hp` напрямую, и
 * между голым жильцом и жильцом в ОЗК не было НИКАКОЙ разницы. Тест ходит через
 * настоящий такт клеточной опасности, а не через дверь напрямую. */
test('кислотная клетка щадит жильца в ОЗК и не щадит голого', () => {
  const state = makeGameState();
  const world = probeWorld();
  const cell = world.idx(8, 8);

  registerCellHazardSite(world, {
    id: 'acid_probe',
    kind: 'acid_probe',
    displayName: 'Кислотная лужа',
    damageType: DamageType.BIO,
    cells: [cell],
    sticky: false,
    playerDamagePerSecond: 40,
    monsterDamagePerSecond: 40,
    warning: 'Кислота.',
  });

  function soak(armorDefId?: string): number {
    const victim = probe(armorDefId);
    setCurrentPlayerEntity(victim);
    try {
      const before = victim.hp!;
      tickCellHazards(world, [victim], state, 1, victim, false);
      return before - victim.hp!;
    } finally {
      setCurrentPlayerEntity(null);
    }
  }

  const bare = soak();
  const ozk = soak('armor_ozk');
  const tok = soak('armor_tok200');

  assert.ok(bare > 0, 'кислота бьёт голого');
  assert.ok(ozk < bare, `ОЗК обязан гасить кислоту: ${ozk} против ${bare}`);
  assert.equal(tok, bare, 'ТОК-200 от кислоты не спасает: он про огонь');
});

/* Потолок среды: клетка не бьёт сильнее объявленного.
 *
 * Броневой конвейер умеет и УВЕЛИЧИВАТЬ удар — `damageFloor` по виду твари
 * гарантирует, что это оружие её кусает. У Туманной акулы гарантия по огню
 * равна единице: любое попадание убивает целиком. Оружию это честно, среде нет:
 * клетка тикает четыре раза в секунду, и без потолка паровой сброс в 1.2 урона
 * снимал бы акуле всё здоровье первым же тактом. */
test('среда не бьёт сильнее объявленного даже там, где оружие бьёт наверняка', () => {
  const state = makeGameState();
  const world = probeWorld();
  const shark: Entity = {
    ...probe(), type: EntityType.MONSTER, monsterKind: MonsterKind.FOG_SHARK,
    hp: 200, maxHp: 200,
  };

  const applied = damageActorByEnvironment(world, state, shark, { damage: 2, damageType: DamageType.FIRE });

  assert.ok(applied <= 2, `среда сняла ${applied} вместо объявленных 2`);
  assert.ok(shark.alive, 'такт горячей клетки не должен убивать акулу целиком');
});
