/* ── Журнал печатает СНЯТОЕ, а не задуманное ───────────────────────
 *
 * `audit.md` C7. Три мили-пути сообщали игроку ДО-броневое число, а здоровье
 * теряли ПОСЛЕ-броневое: `recordPlayerDamage(state, e, dmg, …)` при живом
 * `hit.applied`. Игрок надевал плиту, читал в журнале прежний урон и делал
 * единственно возможный вывод — броня не работает.
 *
 * Соседи по тем же строкам это правило уже держали: кровь в `ai/combat.ts`
 * бралась от `hit.applied` с комментарием «по-другому броня твари была бы видна
 * на числе здоровья и не видна на луже». Разошлись именно журнал и лужа.
 *
 * Замок ловит расхождение ЧИСЛОМ, а не глазами: жертве даётся броня, и снятое
 * обязано совпасть и с падением здоровья, и со строкой журнала.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, DamageType, EntityType, Faction, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { damageActor, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { formatLastPlayerDamageCause, recordPlayerDamage } from '../src/systems/damage';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { createWorldEventState } from '../src/systems/events';
import { makeGameState } from './helpers';
import '../src/content';

function armouredPlayer(): Entity {
  return {
    id: 1, type: EntityType.PLAYER, x: 512.5, y: 512.5, angle: 0, pitch: 0,
    alive: true, speed: 3, sprite: 0, hp: 100, maxHp: 100, faction: Faction.PLAYER,
    // Носимая плита: именно её конвейер и списывает часть удара.
    armorDefId: 'armor_heavy',
    inventory: [{ defId: 'armor_heavy', count: 1 }],
  };
}

test('в журнал игрока уходит ровно то, что сняли с его здоровья', () => {
  const world = new World();
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState(), time: 10 });
  const victim = armouredPlayer();
  const attacker: Entity = {
    id: 2, type: EntityType.MONSTER, x: 512.5, y: 513.5, angle: 0, pitch: 0,
    alive: true, speed: 1, sprite: 0, hp: 50, maxHp: 50, faction: Faction.WILD,
    name: 'Тварь',
    ai: { goal: AIGoal.HUNT, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };

  resetCombatStimulus();
  setCurrentPlayerEntity(victim);
  rebuildEntityIndex([victim, attacker]);

  const hpBefore = victim.hp!;
  const intended = 40;
  const hit = damageActor(world, state, victim, {
    damage: intended,
    damageType: DamageType.KINETIC,
    source: 'monster_melee',
    attacker,
    time: state.time,
  });
  const lost = hpBefore - (victim.hp ?? 0);

  assert.equal(hit.applied, lost, 'дверь обязана возвращать ровно то, что сняла');
  /* КОНТРОЛЬ СОДЕРЖАТЕЛЬНОСТИ. Без него замок пуст: если броня не сработала,
   * снятое равно задуманному, и «журнал печатает снятое» становится
   * тавтологией. Первая редакция этого теста ровно так и прошла — на
   * несуществующем `armor_plate`. */
  assert.ok(
    hit.applied < intended,
    `броня обязана срезать удар, иначе замок ничего не проверяет: снято ${hit.applied} из ${intended}`,
  );

  // Так это делает каждый из трёх мили-путей после правки.
  recordPlayerDamage(state, attacker, hit.applied, `Тварь задела тебя: -${hit.applied}`);
  const cause = formatLastPlayerDamageCause(state, state.time);
  assert.ok(cause?.includes(String(hit.applied)), `в журнале обязано стоять снятое: ${cause}`);
  assert.equal(
    cause?.includes(String(intended)) && intended !== hit.applied, false,
    'задуманное число в журнал попадать не должно — иначе броня не видна игроку',
  );
});
