/* ── Семья спецударов: одно применение вместо одиннадцати ─────────
 *
 * Замок под сведение семьи «применение спецурона» (`problems.md`, «Полная карта
 * семей в ai/monster.ts», строка 3).
 *
 * До сведения блок «дверь урона → запись игроку → добивание → кровь → строка
 * убийства» был написан руками одиннадцать раз, и различались копии не
 * замыслом, а тем, ЧЕГО в них не дописали. Тексты и кровь уехали в
 * `MonsterDef.strike`, применение стало одним шагом.
 *
 * Числа и строки ниже сняты ПРОГОНОМ дерева до правки
 * (`scripts/special_strike_dump.ts`), а не переписаны из головы.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, Feature, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS, monsterStrike } from '../src/entities/monster';
import { NERVE_STRIKE } from '../src/entities/slepoglaz';
import { setEntityMap, updateMonster, updateVodyanoyWaterPressureLine } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setActorDeathHandler } from '../src/systems/combat_stimulus';
import { setListenerPos } from '../src/systems/audio';
import { createWorldEventState } from '../src/systems/events';
import { seedGlobalRng } from '../src/core/rand';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { ZHELEMISH_SKIN_ID, zhelemishIncomingMeleeDamage } from '../src/systems/status';
import { makeGameState } from './helpers';

/** Все одиннадцать ударов семьи: вид и его строка. */
const STRIKE_OWNERS: readonly MonsterKind[] = [
  MonsterKind.PROTOKOLNIK,
  MonsterKind.BLOOD_PLANT,
  MonsterKind.BORSHCHEVIK,
  MonsterKind.RZHAVNIK,
  MonsterKind.ZHORNAYA_TVAR,
  MonsterKind.KOSTOREZ,
  MonsterKind.SAFEGUARD,
  MonsterKind.VODYANOY_KOSHMAR,
  MonsterKind.SLEPOGLAZ,
  MonsterKind.TONKAYA_TEN,
  MonsterKind.TRESKOTNIK,
];

test('каждый спецудар объявляет свою строку данными, а не телом', () => {
  for (const kind of STRIKE_OWNERS) {
    const strike = monsterStrike(kind);
    assert.ok(strike, `${MonsterKind[kind]} обязан объявить строку спецудара`);
    assert.ok(strike!.hurt !== undefined, `${MonsterKind[kind]}: запись урона игроку — колонка`);
  }
  // Второй удар Слепоглаза живёт рядом с его дефом, а не константами в AI.
  assert.equal(NERVE_STRIKE.damage, 7);
});

test('тексты убийства и крови сняты с дерева до сведения', () => {
  assert.equal(monsterStrike(MonsterKind.RZHAVNIK)!.kill, '%s убил %t первым металлическим рывком');
  assert.equal(monsterStrike(MonsterKind.ZHORNAYA_TVAR)!.kill, '%s убила %t');
  assert.equal(monsterStrike(MonsterKind.TONKAYA_TEN)!.kill, '%s увела и убила %t');
  assert.equal(monsterStrike(MonsterKind.TRESKOTNIK)!.kill, '%s разбил %t рывком');
  assert.equal(monsterStrike(MonsterKind.SLEPOGLAZ)!.killColor, '#9f4');
  assert.equal(monsterStrike(MonsterKind.VODYANOY_KOSHMAR)!.killColor, '#7dd');
  // Убийство объявляют не все: корень и куст не видят, кого достали.
  assert.equal(monsterStrike(MonsterKind.BLOOD_PLANT)!.kill, undefined);
  assert.equal(monsterStrike(MonsterKind.BORSHCHEVIK)!.kill, undefined);
  assert.equal(monsterStrike(MonsterKind.PROTOKOLNIK)!.kill, undefined);
  // Крови не дают только двое: они бьют не по телу.
  assert.equal(monsterStrike(MonsterKind.PROTOKOLNIK)!.blood, false);
  assert.equal(monsterStrike(MonsterKind.VODYANOY_KOSHMAR)!.blood, false);
  for (const kind of STRIKE_OWNERS) {
    if (kind === MonsterKind.PROTOKOLNIK || kind === MonsterKind.VODYANOY_KOSHMAR) continue;
    assert.notEqual(monsterStrike(kind)!.blood, false, `${MonsterKind[kind]}: удар по телу даёт кровь`);
  }
});

/* ── Живые прогоны: два закрытых расхождения ──────────────────── */

function openWorld(water = false): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.features.fill(Feature.NONE);
  if (water) {
    for (let dx = -3; dx <= 8; dx++) {
      for (let dy = -1; dy <= 1; dy++) world.cells[world.idx(10 + dx, 10 + dy)] = Cell.WATER;
    }
  }
  return world;
}

function victim(id: number, x: number, hp: number): Entity {
  return {
    id, type: EntityType.NPC, x, y: 10.5, angle: 0, pitch: 0, alive: true,
    speed: 1, sprite: 0, hp, maxHp: 900, faction: Faction.CITIZEN, name: 'Сосед',
    ai: { goal: AIGoal.IDLE, tx: Math.floor(x), ty: 10, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function monster(kind: MonsterKind, x: number): Entity {
  const def = MONSTERS[kind];
  return {
    id: 70, type: EntityType.MONSTER, x, y: 10.5, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.HUNT, tx: Math.floor(x), ty: 10, path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
}

function sync(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

test('множитель урона твари доходит до рывка Ржавника, как до остальных десяти', () => {
  /* Ржавник был ЕДИНСТВЕННЫМ из одиннадцати, чей удар не читал `monsterDmgMult`.
   * Следствие: озноб хладонца (×0.55) и усиление Матки документов (×1.12)
   * гасили его обычный удар и не доходили до первого рывка — того самого, ради
   * которого вид и сделан. Замер: 24 урона под ознобом вместо 13. */
  const damageWith = (mult: number | undefined): number => {
    seedGlobalRng(20260827);
    const world = openWorld();
    setListenerPos(512, 512, world.dist2.bind(world));
    const target = victim(2, 15.5, 900);
    const threat = monster(MonsterKind.RZHAVNIK, 10.5);
    threat.monsterDmgMult = mult;
    threat.ai!.scrapWake = 1;
    threat.ai!.windupTimer = 0;
    threat.ai!.combatTargetId = target.id;
    const entities = [target, threat];
    const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
    sync(entities);
    updateMonster(world, entities, threat, 0.1, 1, [] as Msg[], 999, { v: 100 }, state);
    return 900 - (target.hp ?? 0);
  };

  const full = damageWith(undefined);
  assert.ok(full > 0, 'рывок обязан попасть по свободному коридору');
  assert.equal(damageWith(0.55), Math.round(full * 0.55), 'озноб обязан гасить рывок ровно как всякий другой удар');
});

test('игрок, задавленный мокрой линией, получает запись урона: экран смерти знает убийцу', () => {
  /* Мокрая линия была ЕДИНСТВЕННОЙ из одиннадцати, кто на СМЕРТЕЛЬНОМ ударе не
   * звал `recordPlayerDamage`: запись стояла в ветке «жив». Игрок умирал, а
   * причиной смерти оставался предыдущий ударивший. */
  seedGlobalRng(20260827);
  const world = openWorld(true);
  setListenerPos(512, 512, world.dist2.bind(world));
  const player = victim(1, 14.5, 1);
  player.persistentNpcId = 'player';
  const threat = monster(MonsterKind.VODYANOY_KOSHMAR, 10.5);
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  setCurrentPlayerEntity(player);
  setActorDeathHandler(() => {});
  try {
    sync([player, threat]);
    for (let i = 0; i < 200 && player.alive; i++) {
      state.time = i * 0.05;
      updateVodyanoyWaterPressureLine(world, threat, player, 0.05, state.time, [] as Msg[], player.id, state);
    }
  } finally {
    setActorDeathHandler(undefined);
    setCurrentPlayerEntity(undefined);
  }

  assert.equal(player.alive, false, 'мокрая линия обязана додавить цель с одним здоровьем');
  assert.ok(state.lastDamage, 'смертельный удар обязан оставить запись урона игроку');
  assert.match(state.lastDamage!.detail ?? '', /мокрой линии/, 'запись называет мокрую линию');
});

/* ── Кожа желемыши доходит до всех одиннадцати ─────────────────── */

/**
 * Три удара из одиннадцати скидку не получали (замер дампом:
 * Косторез 17 против 12, Сейфгард 24 против 17, луч Слепоглаза 24 против 17).
 *
 * У Кострореза и Сейфгарда это ближний бой по флагу `meleeWindup` — то есть
 * защита, купленная игроком именно от ближнего боя, против двух самых опасных
 * ближних видов не срабатывала никогда. Луч бьёт с восемнадцати клеток, но
 * множитель силы БЛИЖНЕГО боя бьющего (`strMeleeDmgMult`) стоял в его формуле
 * с самого начала: половину правила про ближний бой он брал, вторую — нет.
 * Обе половины теперь идут одним `monsterStrikeDamage`.
 */
function withSkin(e: Entity): Entity {
  e.statuses = [{ id: ZHELEMISH_SKIN_ID, source: 'debug', startedAt: 0, expiresAt: 1e9 } as never];
  return e;
}

/** Урон, снятый видом `kind` с цели на дистанции `dx`, с кожей и без. */
function strikeDamage(kind: MonsterKind, dx: number, dt: number, ticks: number, skin: boolean): number {
  seedGlobalRng(20260827);
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const target = victim(2, 10.5 + dx, 900);
  if (skin) withSkin(target);
  const threat = monster(kind, 10.5);
  threat.ai!.combatTargetId = target.id;
  const entities = [target, threat];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  setActorDeathHandler(() => {});
  try {
    for (let i = 0; i < ticks && (target.hp ?? 0) === 900; i++) {
      sync(entities);
      state.time = 1 + i * dt;
      updateMonster(world, entities, threat, dt, state.time, [] as Msg[], 999, { v: 100 }, state);
    }
  } finally {
    setActorDeathHandler(undefined);
  }
  return 900 - (target.hp ?? 0);
}

test('кожа желемыши гасит рез Кострореза и Сейфгарда: это ближний бой по флагу', () => {
  for (const kind of [MonsterKind.KOSTOREZ, MonsterKind.SAFEGUARD]) {
    // Ворота — флаг, а не имя вида: скидка обязана дойти до каждого, кто им помечен.
    assert.ok(MONSTERS[kind].aiFlags?.includes('meleeWindup'), `${MonsterKind[kind]}: рез объявлен ближним боем`);
    const bare = strikeDamage(kind, 1.4, 0.05, 30, false);
    const skinned = strikeDamage(kind, 1.4, 0.05, 30, true);
    assert.ok(bare > 0, `${MonsterKind[kind]}: рез обязан состояться`);
    assert.equal(skinned, zhelemishIncomingMeleeDamage(withSkin(victim(3, 0, 900)), 1, bare),
      `${MonsterKind[kind]}: кожа обязана срезать рез на треть`);
    assert.ok(skinned < bare, `${MonsterKind[kind]}: рез под кожей обязан быть слабее`);
  }
});

test('кожа желемыши гасит луч Слепоглаза: множитель ближней силы бьющего в нём есть', () => {
  const bare = strikeDamage(MonsterKind.SLEPOGLAZ, 6, 0.1, 60, false);
  const skinned = strikeDamage(MonsterKind.SLEPOGLAZ, 6, 0.1, 60, true);
  assert.ok(bare > 0, 'луч обязан достать цель по свободному коридору');
  assert.equal(skinned, zhelemishIncomingMeleeDamage(withSkin(victim(3, 0, 900)), 1, bare),
    'луч обязан считаться ближним для скидки, раз считается ближним для силы');
});
