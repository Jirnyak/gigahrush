/* ── Один скелет выбора боевой цели ───────────────────────────────
 *
 * `postrelease.md` §2.8. Порядок «откат → удержание → быстрая полоса → скан →
 * гистерезис» был написан пять раз, и копии разошлись. Владелец решил (2026-09-09)
 * все три расхождения в пользу общего правила; замок держит именно эти три плюс
 * замеренную причину залпа сканов.
 *
 * Каждый тест показан КРАСНЫМ на своей охраняемой строке:
 *
 * 1. луч — снять `if (!seesThroughWalls && !hasClearLine(...)) continue;` в
 *    `runCombatSearch`. Цели брались через стену: краснеют все четыре вида.
 *    Дистанции нарочно взяты больше `IMMEDIATE_THREAT_RADIUS` (10) там, где у
 *    вида включена быстрая полоса, — иначе её собственный луч отсекает путь
 *    раньше, и негативный контроль остаётся ПУСТЫМ.
 * 2. гистерезис — поставить `TARGET_SWITCH_HYSTERESIS = 1`.
 * 3. скан при живой цели — вернуть рою строку `if (target || ai.combatScanCd > 0)
 *    return target;`.
 * 4. разброс каданса — вернуть `combatScanCd` к плоскому `fixedScanCd(e) ?? base`.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { findCombatTarget, setEntityMap, updateMonster } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { makeGameState, makeTestPlayer } from './helpers';
import '../src/content';

const ORIGIN = 200;

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

/** Сплошная стена по вертикали — режет луч, но не запирает: пол вокруг открыт. */
function wallColumn(world: World, x: number, y: number): void {
  for (let dy = -6; dy <= 6; dy++) world.cells[world.idx(x, y + dy)] = Cell.WALL;
  world.cellVersion++;
}

let nextTestId = 100;

function monster(kind: MonsterKind, x: number, y: number): Entity {
  const def = MONSTERS[kind];
  return {
    id: nextTestId++,
    type: EntityType.MONSTER,
    x, y, angle: 0, pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    currentMag: 1,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function prey(x: number, y: number, carries?: string): Entity {
  return makeTestPlayer({
    id: nextTestId++,
    x, y, angle: 0, pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    hp: 100,
    maxHp: 100,
    inventory: carries ? [{ defId: carries, count: 1 }] : [],
  });
}

function stage(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

function tickMonster(world: World, entities: Entity[], hunter: Entity, dt = 0.1): number | undefined {
  const msgs: Msg[] = [];
  const state = makeGameState();
  stage(entities);
  updateMonster(world, entities, hunter, dt, 1, msgs, -1, { v: 9000 }, state);
  return hunter.ai!.combatTargetId;
}

/* ── 1. Луч спрашивают все ──────────────────────────────────────── */

/** Вид, расстояние до жертвы, и чем жертва пахнет для этого вида. Без приманки
 *  охотник за документами не смотрит дальше семи клеток, а рою нечего чуять:
 *  тогда «цель не найдена» доказывало бы дальность, а не луч. */
const THROUGH_WALL_CASES: ReadonlyArray<[string, MonsterKind, number, string?]> = [
  ['чернослиз', MonsterKind.CHERNOSLIZ, 6],
  ['олгой', MonsterKind.OLGOY, 15],
  ['конторщик', MonsterKind.KONTORSHCHIK, 15, 'note'],
  ['печатеед', MonsterKind.PECHATEED, 15, 'note'],
  // Помойный рой несёт быструю полосу на упор: жертва вынесена за её радиус
  // (10), иначе покраснел бы её собственный луч, а не общий.
  ['помойный рой', MonsterKind.POMOYNY_ROY, 16, 'govnyak_roll'],
];

for (const [name, kind, distance, carries] of THROUGH_WALL_CASES) {
  test(`${name} не берёт цель сквозь стену, а без стены берёт`, () => {
    const open = openWorld();
    const hunter = monster(kind, ORIGIN, ORIGIN);
    const victim = prey(ORIGIN + distance, ORIGIN, carries);
    assert.equal(
      tickMonster(open, [hunter, victim], hunter), victim.id,
      'на открытом полу цель обязана находиться — иначе тест ниже ничего не доказывает',
    );

    const walled = openWorld();
    const hunter2 = monster(kind, ORIGIN, ORIGIN);
    const victim2 = prey(ORIGIN + distance, ORIGIN, carries);
    wallColumn(walled, ORIGIN + Math.floor(distance / 2), ORIGIN);
    assert.equal(
      tickMonster(walled, [hunter2, victim2], hunter2), undefined,
      'цель за сплошной стеной не берётся',
    );
  });
}

/* ── 2. Гистерезис переключения ─────────────────────────────────── */

test('новая цель перебивает удерживаемую только с запасом', () => {
  const world = openWorld();
  const hunter = monster(MonsterKind.SBORKA, ORIGIN, ORIGIN);
  const held = prey(ORIGIN + 10, ORIGIN);
  const rival = prey(ORIGIN + 9, ORIGIN);
  const all = [hunter, held, rival];
  stage(all);

  const rangeSq = 20 * 20;
  hunter.ai!.combatTargetId = held.id;
  hunter.ai!.combatScanCd = 0;
  // 81 против 100·0.72 = 72 — выигрыша не хватает.
  assert.equal(
    findCombatTarget(world, all, hunter, 0.1, rangeSq, 1, () => true), held,
    'почти равная цель не должна перехватывать',
  );

  rival.x = ORIGIN + 8; // 64 < 72 — запаса хватает
  stage(all);
  hunter.ai!.combatTargetId = held.id;
  hunter.ai!.combatScanCd = 0;
  assert.equal(
    findCombatTarget(world, all, hunter, 0.1, rangeSq, 1, () => true), rival,
    'заметно лучшая цель обязана перехватывать',
  );
});

/* ── 3. Скан идёт и при живой цели ──────────────────────────────── */

test('помойный рой уходит на цель ближе, не дожидаясь потери прежней', () => {
  const world = openWorld();
  const hunter = monster(MonsterKind.POMOYNY_ROY, ORIGIN, ORIGIN);
  const far = prey(ORIGIN + 19, ORIGIN);
  // Ближе прежней, но за радиусом быстрой полосы (10): перехват обязан быть
  // работой СКАНА, а не полосы на упор.
  const near = prey(ORIGIN, ORIGIN + 12);
  const all = [hunter, far, near];

  hunter.ai!.combatTargetId = far.id;
  assert.equal(tickMonster(world, all, hunter), near.id);
});

/* ── 4. Каданс скана разнесён по особям ─────────────────────────── */

test('откат скана у одного вида не совпадает у разных особей', () => {
  const world = openWorld();
  const pack = [
    monster(MonsterKind.TVAR, ORIGIN, ORIGIN),
    monster(MonsterKind.TVAR, ORIGIN + 1, ORIGIN),
    monster(MonsterKind.TVAR, ORIGIN + 2, ORIGIN),
    monster(MonsterKind.TVAR, ORIGIN + 3, ORIGIN),
  ];
  const victim = prey(ORIGIN + 6, ORIGIN);
  const all = [...pack, victim];
  for (const e of pack) tickMonster(world, all, e);

  const cds = new Set(pack.map(e => e.ai!.combatScanCd!.toFixed(4)));
  assert.equal(
    cds.size, pack.length,
    `стая обязана сканировать вразнобой, а не в один кадр: ${[...cds].join(', ')}`,
  );
});
