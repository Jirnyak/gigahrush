import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, Faction, MonsterKind, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { selectMeleeTarget } from '../src/systems/melee_targeting';
import { initFactionRelations } from '../src/data/relations';

/* Замах ИИ не проходит сквозь своих.
 *
 * Целится ИИ по проверенному врагу, а РАЗРЕШАЛСЯ удар по любому телу в круге —
 * фильтра по вражде там не было. Ближайший союзник перед мордой забирал удар,
 * урон списывался настоящий, а извещение жертвы пару «монстр против монстра»
 * отбрасывает: стая тихо выкашивала сама себя, и никто не отвечал.
 * Политика — `fight.md`: «monster-vs-monster не является базовой политикой».
 *
 * Обратная сторона правила так же важна: управляемый актор целится сам и обязан
 * сохранить право ударить мирного — так начинается драка с горожанином. */

function monster(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.MONSTER, monsterKind: MonsterKind.ZOMBIE,
    x, y, angle: 0, alive: true, hp: 100, maxHp: 100,
  } as unknown as Entity;
}

function citizen(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.NPC, faction: Faction.CITIZEN,
    x, y, angle: 0, alive: true, hp: 100, maxHp: 100,
  } as unknown as Entity;
}

function openWorld(): World {
  const world = new World();
  world.cells.fill(0);
  return world;
}

test('замах ИИ минует своего и достаёт врага за ним', () => {
  initFactionRelations();
  const world = openWorld();
  const attacker = monster(1, 40, 40);
  const packMate = monster(2, 40.4, 40);   // ближе и прямо по курсу
  const prey = citizen(3, 40.9, 40);       // дальше, но враг

  const picked = selectMeleeTarget(world, attacker, [packMate, prey], 1.2, undefined, true);
  assert.equal(picked?.id, prey.id, 'ИИ ударил своего вместо врага');
});

test('без фильтра ближайший всё ещё выигрывает — правило именно в фильтре', () => {
  initFactionRelations();
  const world = openWorld();
  const attacker = monster(1, 40, 40);
  const packMate = monster(2, 40.4, 40);
  const prey = citizen(3, 40.9, 40);

  const picked = selectMeleeTarget(world, attacker, [packMate, prey], 1.2);
  assert.equal(picked?.id, packMate.id, 'сцена перестала воспроизводить исходный выбор');
});

test('управляемый актор сохраняет право ударить мирного', () => {
  initFactionRelations();
  const world = openWorld();
  const player = citizen(1, 40, 40);
  player.faction = Faction.PLAYER;
  const bystander = citizen(2, 40.4, 40);

  const picked = selectMeleeTarget(world, player, [bystander], 1.2);
  assert.equal(picked?.id, bystander.id, 'мирного стало невозможно ударить');
});
