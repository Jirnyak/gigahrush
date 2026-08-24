/* Замки на четыре механизма ближнего и дальнего боя, чинившиеся вместе:
 * линия взгляда, пейн-реакция, мебель на линии огня и дальность по оружию. */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Faction, Feature, MonsterKind, type Entity,
} from '../src/core/types';
import { World } from '../src/core/world';
import { WEAPON_STATS } from '../src/data/catalog';
import { initFactionRelations } from '../src/data/relations';
import { hasLineOfSight, lineCoverCells } from '../src/world/line_of_sight';
import { applyHitStaggerAndKnockback, setCombatClock } from '../src/systems/combat';
import { setCombatContext, tryFactionCombat } from '../src/systems/ai/combat';
import { rebuildEntityIndex } from '../src/systems/entity_index';

const OX = 500;
const OY = 500;

function openWorld(w = 40, h = 12): World {
  const world = new World();
  for (let y = OY - 1; y <= OY + h; y++) {
    for (let x = OX - 1; x <= OX + w; x++) world.set(x, y, Cell.FLOOR);
  }
  return world;
}

function fighter(id: number, x: number, y: number, weapon: string, faction: Faction): Entity {
  return {
    id, type: EntityType.NPC, x, y, angle: 0, pitch: 0, alive: true, speed: 3, sprite: 0,
    hp: 100, maxHp: 100, faction, weapon,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function prey(id: number, x: number, y: number): Entity {
  return {
    id, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true, speed: 2, sprite: 0,
    hp: 400, maxHp: 400, monsterKind: MonsterKind.SBORKA,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

/* ── Линия взгляда ────────────────────────────────────────────── */

test('линия взгляда проверяет КОНЕЧНУЮ клетку: цель в бетоне не видно', () => {
  const world = openWorld();
  world.set(OX + 3, OY, Cell.WALL);
  // Шаговая растеризация шла i = 1..steps-1 и клетку цели не смотрела вовсе.
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 0.5, OX + 3.5, OY + 0.5, 10), false);
});

test('клетка наблюдателя преградой не считается: замурованный видит наружу', () => {
  const world = openWorld();
  world.set(OX, OY, Cell.WALL);
  // Иначе выбитый толчком в косяк актор слепнет навсегда.
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 0.5, OX + 2.5, OY + 0.5, 10), true);
});

test('угол не запирает взгляд: соседи по диагонали видят друг друга', () => {
  const world = openWorld();
  world.set(OX + 1, OY, Cell.WALL);
  world.set(OX, OY + 1, Cell.WALL);
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 0.5, OX + 1.5, OY + 1.5, 10), true);
});

test('стена между держит взгляд, дальность обрезает', () => {
  const world = openWorld();
  world.set(OX + 2, OY, Cell.WALL);
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 0.5, OX + 4.5, OY + 0.5, 10), false);
  // Та же чистая линия, обрезанная только дальностью.
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 1.5, OX + 8.5, OY + 1.5, 4), false);
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 1.5, OX + 8.5, OY + 1.5, 20), true);
});

test('мебель линию не рвёт, а считается', () => {
  const world = openWorld();
  world.features[world.idx(OX + 2, OY)] = Feature.DESK;
  world.features[world.idx(OX + 3, OY)] = Feature.SHELF;
  assert.equal(hasLineOfSight(world, OX + 0.5, OY + 0.5, OX + 5.5, OY + 0.5, 10), true);
  assert.equal(lineCoverCells(world, OX + 0.5, OY + 0.5, OX + 5.5, OY + 0.5, 10), 2);
  world.set(OX + 4, OY, Cell.WALL);
  assert.equal(lineCoverCells(world, OX + 0.5, OY + 0.5, OX + 5.5, OY + 0.5, 10), -1);
});

/* ── Пейн-реакция ─────────────────────────────────────────────── */

test('царапина не оглушает, заметный удар оглушает один раз за рефрактерный период', () => {
  const world = openWorld();
  setCombatClock(0);
  const victim = fighter(1, OX + 5.5, OY + 0.5, '', Faction.CITIZEN);

  // 1% здоровья — прежний порог. Толчок остаётся, боли нет.
  applyHitStaggerAndKnockback(world, victim, OX + 4.5, OY + 0.5, 5);
  assert.equal(victim.ai!.staggerTimer ?? 0, 0);
  assert.ok((victim.vx ?? 0) !== 0, 'отскок обязан работать и от мелкого попадания');

  applyHitStaggerAndKnockback(world, victim, OX + 4.5, OY + 0.5, 25);
  const first = victim.ai!.staggerTimer ?? 0;
  assert.ok(first > 0, 'заметный удар обязан сбивать действие');

  // Второй такой же удар в тот же миг — уже отболел, повторно не оглушает.
  victim.ai!.staggerTimer = 0;
  victim.staggerTimer = 0;
  applyHitStaggerAndKnockback(world, victim, OX + 4.5, OY + 0.5, 25);
  assert.equal(victim.ai!.staggerTimer ?? 0, 0, 'stunlock: боль наложилась сама на себя');

  // За рефрактерным периодом — снова можно.
  setCombatClock(first * 2 + 0.01);
  applyHitStaggerAndKnockback(world, victim, OX + 4.5, OY + 0.5, 25);
  assert.ok((victim.ai!.staggerTimer ?? 0) > 0);
  setCombatClock(0);
});

test('отдача на шве тора толкает ОТ атакующего, а не в него', () => {
  // Мир замкнут: стрелок у x=1023.5 стоит вплотную к цели у x=0.5.
  // Сырое вычитание давало разницу в 1023 клетки и разворачивало толчок назад.
  const world = new World();
  for (let y = OY - 1; y <= OY + 1; y++) {
    world.set(0, y, Cell.FLOOR);
    world.set(1023, y, Cell.FLOOR);
  }
  setCombatClock(0);
  const victim = fighter(1, 0.5, OY + 0.5, '', Faction.CITIZEN);
  applyHitStaggerAndKnockback(world, victim, 1023.5, OY + 0.5, 25);
  assert.ok((victim.vx ?? 0) > 0, 'жертву отбросило внутрь атакующего через шов');
  setCombatClock(0);
});

test('оглушённый боец не выпадает из мира: цель ищет, ударить не может', () => {
  initFactionRelations();
  const world = openWorld();
  setCombatContext([], 5);
  const guard = fighter(1, OX + 2.5, OY + 0.5, 'pipe', Faction.LIQUIDATOR);
  const beast = prey(2, OX + 6.5, OY + 0.5);
  guard.ai!.staggerTimer = 0.5;
  const entities = [guard, beast];
  rebuildEntityIndex(entities);

  // Раньше здесь стоял `return true` и съедал весь апдейт целиком.
  tryFactionCombat(world, entities, guard, 0.1, 5, [], { v: 100 });
  assert.equal(guard.ai!.combatTargetId, beast.id, 'оглушённый обязан продолжать видеть врага');
  assert.ok((guard.attackCd ?? 0) > 0, 'но бить он не может');
  assert.equal(beast.hp, 400);
});

/* ── Мебель в ближнем бою ─────────────────────────────────────── */

test('через стол бьют: укрытие больше не работает бетоном вплотную', () => {
  initFactionRelations();
  const world = openWorld();
  setCombatContext([], 5);
  world.features[world.idx(OX + 3, OY)] = Feature.DESK;
  const guard = fighter(1, OX + 2.5, OY + 0.5, 'pipe', Faction.LIQUIDATOR);
  const beast = prey(2, OX + 4.2, OY + 0.5);
  const entities = [guard, beast];
  rebuildEntityIndex(entities);

  assert.equal(tryFactionCombat(world, entities, guard, 0.1, 5, [], { v: 100 }), true);
  assert.equal(beast.hp, 400 - WEAPON_STATS.pipe.dmg, 'стоял вплотную через стол и не бил');
});

/* ── Дальний бой ──────────────────────────────────────────────── */

test('дальность выводится из баллистики оружия, а не из общего потолка', () => {
  initFactionRelations();
  const world = openWorld(40, 4);
  setCombatContext([], 5);
  // Двадцать пять клеток: вдвое дальше прежнего потолка NPC_RANGED_MAX = 13,
  // но втрое ближе честного полёта пули макарова (22 кл/с × 3 с = 66).
  const shooter = fighter(1, OX + 0.5, OY + 0.5, 'makarov', Faction.LIQUIDATOR);
  const beast = prey(2, OX + 25.5, OY + 0.5);
  const entities = [shooter, beast];
  rebuildEntityIndex(entities);

  assert.equal(tryFactionCombat(world, entities, shooter, 0.1, 5, [], { v: 100 }), true);
  assert.equal(shooter.ai!.combatTargetId, beast.id, 'не увидел цель на дистанции своего ствола');
  assert.ok(entities.some(x => x.type === EntityType.PROJECTILE), 'не выстрелил');
});

test('первый бой не начинается с фиктивной перезарядки', () => {
  initFactionRelations();
  const world = openWorld(40, 4);
  setCombatContext([], 5);
  // Оружие пришло от генератора: надето, но `currentMag` никто не ставил —
  // с ППШ это давало 3.2 секунды неподвижности в первом же контакте.
  const shooter = fighter(1, OX + 0.5, OY + 0.5, 'ppsh', Faction.LIQUIDATOR);
  assert.equal(shooter.currentMag, undefined);
  const beast = prey(2, OX + 8.5, OY + 0.5);
  const entities = [shooter, beast];
  rebuildEntityIndex(entities);

  tryFactionCombat(world, entities, shooter, 0.1, 5, [], { v: 100 });
  assert.equal(shooter.reloading ?? false, false, 'ушёл в перезарядку с полным магазином');
  assert.ok(entities.some(x => x.type === EntityType.PROJECTILE), 'не выстрелил');
});

test('рукопашник не перезаряжает кулаки', () => {
  initFactionRelations();
  const world = openWorld();
  setCombatContext([], 5);
  const guard = fighter(1, OX + 2.5, OY + 0.5, 'pipe', Faction.LIQUIDATOR);
  const beast = prey(2, OX + 4.0, OY + 0.5);
  const entities = [guard, beast];
  rebuildEntityIndex(entities);

  tryFactionCombat(world, entities, guard, 0.1, 5, [], { v: 100 });
  assert.equal(guard.reloading ?? false, false);
  assert.ok(beast.hp! < 400, 'ударил в первом же такте');
});

/* ── Потеря цели ──────────────────────────────────────────────── */

test('потеря цели включает поиск по последней позиции, а не пятисекундную слепоту', () => {
  initFactionRelations();
  const world = openWorld(60, 4);
  setCombatContext([], 5);
  const guard = fighter(1, OX + 0.5, OY + 0.5, '', Faction.LIQUIDATOR);
  const beast = prey(2, OX + 50.5, OY + 0.5);
  // Цель была захвачена, но ушла далеко за предел обнаружения кулачного бойца.
  guard.ai!.combatTargetId = beast.id;
  const entities = [guard, beast];
  rebuildEntityIndex(entities);

  assert.equal(tryFactionCombat(world, entities, guard, 0.1, 5, [], { v: 100 }), false);
  assert.equal(guard.ai!.combatTargetId, undefined);
  assert.equal(guard.ai!.combatScanCd, 0, 'пять секунд без сканирования при живом враге рядом');
  assert.equal(guard.ai!.microGoalId, 'search_lkp', 'микроцель поиска не поставил никто');
  assert.equal(guard.ai!.microTargetX, Math.floor(beast.x));
});
