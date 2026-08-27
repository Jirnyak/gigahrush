/* Опасная клетка бьёт ВСЕХ, кто на ней стоит, а не одного игрока.
 *
 * `tickHazardSubject` годами применял `playerDamagePerSecond` под условием
 * `e.id === playerId`. Жилец на кислоте, в паре, на тепловой линии и под
 * излучением только ЗАЛИПАЛ и здоровья не терял. Следствие было не косметическое:
 * вся средовая лестница брони (ОЗК против БИО, ТОК-200 против ОГНЯ) существовала
 * ровно для одного актора из тысячи — химкомплект на учёном НИИ не защищал ни от
 * чего, потому что кислота его не касалась.
 *
 * Старый замок `environment-damage-armor` этого не ловил: он передавал жертву
 * ВТОРЫМ аргументом `tickCellHazards`, то есть В СЛОТ ИГРОКА, и потому проверял
 * ту же единственную дорогу. Здесь игрок стоит отдельно и в стороне.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import { Cell, DamageType, EntityType, type Entity } from '../src/core/types';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { clearCellHazards, registerCellHazardSite, tickCellHazards } from '../src/systems/cell_hazards';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { makeGameState } from './helpers';

const HAZARD_X = 8;
const HAZARD_Y = 8;
/** Урон в секунду взят заведомо крупным: проверяется наличие удара и доля
 *  брони, а не баланс конкретного участка. */
const ACID_PER_SECOND = 40;

function acidWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  clearCellHazards(world);
  registerCellHazardSite(world, {
    id: 'acid_parity',
    kind: 'acid_parity',
    displayName: 'Кислотная лужа',
    damageType: DamageType.BIO,
    cells: [world.idx(HAZARD_X, HAZARD_Y)],
    sticky: false,
    playerDamagePerSecond: ACID_PER_SECOND,
    monsterDamagePerSecond: ACID_PER_SECOND,
    warning: 'Кислота.',
  });
  return world;
}

function actor(id: number, x: number, y: number, armorDefId?: string): Entity {
  return {
    id, type: EntityType.NPC, x, y, angle: 0, pitch: 0,
    alive: true, speed: 0, hp: 1000, maxHp: 1000, armorDefId,
  };
}

/** Сколько снимет лужа за секунду с того, кто НЕ игрок. */
function soakAsBystander(armorDefId?: string): number {
  const world = acidWorld();
  const player = actor(1, 40.5, 40.5);
  const victim = actor(2, HAZARD_X + 0.5, HAZARD_Y + 0.5, armorDefId);
  const state = makeGameState();
  setCurrentPlayerEntity(player);
  try {
    rebuildEntityIndexForSimulation([player, victim], 1);
    const before = victim.hp!;
    tickCellHazards(world, [player, victim], state, 1, player, false);
    return before - victim.hp!;
  } finally {
    setCurrentPlayerEntity(null);
  }
}

/** Сколько та же лужа снимет с игрока на той же клетке. */
function soakAsPlayer(armorDefId?: string): number {
  const world = acidWorld();
  const player = actor(1, HAZARD_X + 0.5, HAZARD_Y + 0.5, armorDefId);
  const state = makeGameState();
  setCurrentPlayerEntity(player);
  try {
    rebuildEntityIndexForSimulation([player], 1);
    const before = player.hp!;
    tickCellHazards(world, [player], state, 1, player, false);
    return before - player.hp!;
  } finally {
    setCurrentPlayerEntity(null);
  }
}

test('кислотная лужа бьёт жильца, а не только игрока', () => {
  const bystander = soakAsBystander();
  assert.ok(bystander > 0, `жилец на кислоте обязан терять здоровье, снято ${bystander}`);
});

test('жилец и игрок на одной луже теряют одинаково', () => {
  assert.equal(soakAsBystander(), soakAsPlayer(), 'у среды нет отдельной ставки для игрока');
});

test('химкомплект работает на жильце так же, как на игроке', () => {
  const bare = soakAsBystander();
  const ozk = soakAsBystander('armor_ozk');
  const tok = soakAsBystander('armor_tok200');

  assert.ok(ozk < bare, `ОЗК обязан гасить кислоту и на жильце: ${ozk} против ${bare}`);
  assert.equal(tok, bare, 'ТОК-200 от кислоты не спасает никого: он про огонь');
  assert.equal(ozk, soakAsPlayer('armor_ozk'), 'доля брони не зависит от того, кто её носит');
});
