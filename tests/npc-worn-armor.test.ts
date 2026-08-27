import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import {
  AIGoal,
  Cell,
  DamageType,
  EntityType,
  Faction,
  Occupation,
  type Entity,
  type GameState,
} from '../src/core/types';
import { ITEMS } from '../src/data/items';
import { npcArmorChance, generateNpcLoadout } from '../src/systems/procedural_loot';
import { calculateDamage } from '../src/systems/combat';
import {
  createPrefilledAlifeState,
  materializeAlifeFloorPopulation,
  type AlifePopulationPlan,
} from '../src/systems/alife';
import { setFloorRunState } from '../src/systems/procedural_floors';
import { initFactionRelations } from '../src/data/relations';

/* Носимая броня работала только на игроке: `Entity.armorDefId` ставили ровно
 * два места — инвентарь игрока и импорт снаряжения онлайн-пира, — а значит вся
 * таблица резистов для NPC была тождеством. Здесь заперты обе половины правила:
 * гарнизонный охотник броню НЕСЁТ и НАДЕВАЕТ, а гражданский повар — нет. */

const GARRISON_KEY = 'design:armor_probe_garrison';
const KITCHEN_KEY = 'design:armor_probe_kitchen';

const PLAN: AlifePopulationPlan = {
  buckets: [
    {
      floorKey: GARRISON_KEY,
      z: -12,
      danger: 4,
      targetCount: 24,
      factionWeights: [{ value: Faction.LIQUIDATOR, weight: 1 }],
      occupationWeights: [{ value: Occupation.HUNTER, weight: 1 }],
    },
    {
      floorKey: KITCHEN_KEY,
      z: 0,
      danger: 1,
      targetCount: 24,
      factionWeights: [{ value: Faction.CITIZEN, weight: 1 }],
      occupationWeights: [{ value: Occupation.COOK, weight: 1 }],
    },
  ],
};

function templateNpc(id: number, x: number, y: number): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1.2,
    sprite: Occupation.HUNTER,
    hp: 100,
    maxHp: 100,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    faction: Faction.CITIZEN,
    occupation: Occupation.HUNTER,
    questId: -1,
  };
}

function floorWithRoom(count: number): { world: World; entities: Entity[] } {
  const world = new World();
  const entities: Entity[] = [];
  for (let i = 0; i < count; i++) {
    const x = 40 + (i % 12);
    const y = 40 + Math.floor(i / 12);
    world.cells[world.idx(x, y)] = Cell.FLOOR;
    entities.push(templateNpc(100 + i, x + 0.5, y + 0.5));
  }
  world.cellVersion++;
  return { world, entities };
}

function materialize(floorKey: string, count: number): Entity[] {
  initFactionRelations();
  const state = { currentZ: 0, time: 0, clock: { hour: 8, minute: 0, totalMinutes: 480 } } as GameState;
  setFloorRunState(state, undefined);
  createPrefilledAlifeState(state, 4242, 48, PLAN);
  const { world, entities } = floorWithRoom(count);
  materializeAlifeFloorPopulation(state, world, entities, { v: 5000 }, floorKey);
  return entities.filter(e => e.type === EntityType.NPC && e.alifeId !== undefined);
}

test('доля брони градуирована фракцией и занятием, а не выдана всем', () => {
  // Ликвидатор — самая вооружённая строка таблицы лута, охотник — самая
  // рисковая работа гарнизона: у него доля максимальна.
  const garrison = npcArmorChance(Faction.LIQUIDATOR, Occupation.HUNTER);
  assert.equal(garrison > 0, true);
  assert.equal(garrison <= 1, true);
  // Дикие вооружены вдвое скромнее ликвидаторов — доля падает вместе с ними.
  assert.equal(npcArmorChance(Faction.WILD, Occupation.HUNTER) < garrison, true);
  assert.equal(npcArmorChance(Faction.WILD, Occupation.HUNTER) > 0, true);
  // Фракция без оружейного веса и работа без риска — брони не носят вовсе.
  assert.equal(npcArmorChance(Faction.CITIZEN, Occupation.HUNTER), 0);
  assert.equal(npcArmorChance(Faction.LIQUIDATOR, Occupation.COOK), 0);
  assert.equal(npcArmorChance(Faction.LIQUIDATOR, Occupation.HOUSEWIFE), 0);
  assert.equal(npcArmorChance(Faction.LIQUIDATOR, undefined), 0);
});

test('генератор снаряжения кладёт броню в карман, а не только в слот', () => {
  // Карман — это и выпадение с трупа (`dropEntityInventory` высыпает инвентарь),
  // и прилавок: непустой инвентарь NPC служит торговым.
  const loadout = generateNpcLoadout(Faction.LIQUIDATOR, 6, 4, 0.4, [0.2, 0.6], {
    occupation: Occupation.HUNTER,
    rollWear: 0,      // носит гарантированно
    rollPick: 0.5,
  });
  assert.ok(loadout.armorDefId, 'охотник гарнизона обязан получить броню');
  assert.equal(ITEMS[loadout.armorDefId]?.resistances !== undefined, true);
  assert.equal(
    (loadout.inventory ?? []).some(slot => slot.defId === loadout.armorDefId),
    true,
    'надетая броня обязана лежать в кармане, иначе она не выпадет с трупа',
  );
});

test('гарнизон материализуется в броне, кухня — голой', () => {
  const garrison = materialize(GARRISON_KEY, 24);
  assert.equal(garrison.length > 0, true, 'гарнизонный бакет обязан кого-то материализовать');
  const armored = garrison.filter(e => e.armorDefId);
  assert.equal(armored.length > 0, true, 'ликвидаторы-охотники обязаны носить броню');
  for (const npc of armored) {
    assert.equal(
      (npc.inventory ?? []).some(slot => slot.defId === npc.armorDefId),
      true,
      'надетое обязано лежать в инвентаре — иначе не выпадет и не продастся',
    );
  }

  const kitchen = materialize(KITCHEN_KEY, 24);
  assert.equal(kitchen.length > 0, true, 'кухонный бакет обязан кого-то материализовать');
  assert.equal(
    kitchen.every(e => e.armorDefId === undefined),
    true,
    'гражданский повар брони не носит',
  );
});

test('надетая броня NPC режет урон ровно на объявленный резист', () => {
  const garrison = materialize(GARRISON_KEY, 24);
  const armored = garrison.find(e => e.armorDefId);
  assert.ok(armored, 'нужен хотя бы один одетый ликвидатор');
  const resist = ITEMS[armored.armorDefId!].resistances![DamageType.KINETIC] ?? 0;
  assert.equal(resist > 0, true, 'вся броня в игре держит кинетику');

  const naked: Entity = { ...armored, armorDefId: undefined };
  assert.equal(calculateDamage(100, DamageType.KINETIC, naked), 100);
  assert.equal(calculateDamage(100, DamageType.KINETIC, armored), 100 * (100 - resist) / 100);
});
