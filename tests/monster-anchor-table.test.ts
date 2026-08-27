/* ── Семья «привязка к точке мира»: якорь стал строкой вида ────────
 *
 * Замок под сведение семьи (`problems.md`, «Полная карта семей в ai/monster.ts»,
 * строка 4). Форма семьи одна: «пока якорь цел и виден — тварь работает; якорь
 * перерезали — ослабла», а хранилась она тремя способами сразу. Ламповый читал
 * обстановку в кадре, Червие держал ОТВЕТ в четырёх полях `AIState` у каждого
 * актора игры и поддерживал их своим тактом, числа обоих лежали константами в
 * теле общего AI.
 *
 * Числа ниже сняты прогоном (`scripts/anchor_dump.ts`), а не переписаны из головы.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, EntityType, Feature, MonsterKind, RoomType, type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { findMonsterAnchor, monsterAnchored } from '../src/systems/monster_traits';
import { setEntityMap, updateChervieNetPossessor } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { createWorldEventState } from '../src/systems/events';
import { makeGameState } from './helpers';

/** Виды, объявившие якорь. Семья открыта: новый член дописывает строку в деф. */
const ANCHOR_OWNERS: readonly MonsterKind[] = [
  MonsterKind.CHERVIE_AVATAR,
  MonsterKind.LAMPOVY,
];

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.features.fill(Feature.NONE);
  world.rooms.push({
    id: 1, type: RoomType.PRODUCTION, x: 4, y: 4, w: 32, h: 16,
    cx: 20, cy: 12, doors: [], name: 'узел',
  } as never);
  for (let y = 4; y < 20; y++) for (let x = 4; x < 36; x++) world.roomMap[world.idx(x, y)] = 1;
  return world;
}

function monster(kind: MonsterKind, x = 10.5, y = 10.5): Entity {
  const def = MONSTERS[kind];
  return {
    id: 2, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0, currentMag: 1,
    ai: { goal: AIGoal.WANDER, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
  } as Entity;
}

test('якорь объявлен данными вида, а не константами в теле общего AI', () => {
  for (const kind of ANCHOR_OWNERS) {
    const anchor = MONSTERS[kind].anchor;
    assert.ok(anchor, `${MonsterKind[kind]} обязан объявить строку якоря`);
    assert.ok(anchor!.features.length > 0, `${MonsterKind[kind]}: якорю нужны годные клетки`);
    assert.ok(anchor!.radius > 0, `${MonsterKind[kind]}: якорю нужен радиус`);
    // Хоть одна колонка последствий: якорь без последствий — мёртвая строка.
    const effects = [anchor!.moveMult, anchor!.dmgMult, anchor!.detect];
    assert.ok(effects.some(v => v !== undefined), `${MonsterKind[kind]}: якорь обязан что-то менять`);
  }
  // Числа Червия сняты дампом с дерева до сведения.
  const chervie = MONSTERS[MonsterKind.CHERVIE_AVATAR].anchor!;
  assert.deepEqual([...chervie.features], [Feature.SCREEN, Feature.APPARATUS]);
  assert.deepEqual(
    [chervie.radius, chervie.moveMult, chervie.cutMoveMult, chervie.dmgMult, chervie.cutDmgMult, chervie.detect, chervie.cutDetect],
    [7, 1.2, 0.62, 1.22, 0.68, 24, 12],
  );
  const lampovy = MONSTERS[MonsterKind.LAMPOVY].anchor!;
  assert.deepEqual([...lampovy.features], [Feature.LAMP]);
  assert.deepEqual([lampovy.radius, lampovy.dmgMult, lampovy.cutDmgMult], [3, 1.35, 0.9]);
});

test('прямая до якоря — колонка вида, а не свойство кода', () => {
  /* Тот же поиск обслуживает обоих. В экран Червие смотрит, поэтому глухая
   * стена рвёт питание; лампа светит и из-за угла, и Ламповому стена не помеха.
   * Раньше это были две разные функции: своя `findChervieNetSource` с прямой и
   * общий `nearFeature` без неё. */
  const chervieWorld = openWorld();
  const chervie = monster(MonsterKind.CHERVIE_AVATAR);
  chervieWorld.features[chervieWorld.idx(14, 10)] = Feature.SCREEN;
  assert.equal(monsterAnchored(chervieWorld, chervie), true, 'целая линия питает Червие');
  chervieWorld.cells[chervieWorld.idx(12, 10)] = Cell.WALL;
  assert.equal(monsterAnchored(chervieWorld, chervie), false, 'стена рвёт линию к экрану');

  const lampWorld = openWorld();
  const lampovy = monster(MonsterKind.LAMPOVY);
  lampWorld.features[lampWorld.idx(12, 10)] = Feature.LAMP;
  assert.equal(monsterAnchored(lampWorld, lampovy), true, 'лампа в радиусе питает Лампового');
  lampWorld.cells[lampWorld.idx(11, 10)] = Cell.WALL;
  assert.equal(monsterAnchored(lampWorld, lampovy), true, 'свет достаёт и из-за угла: прямая не объявлена');
});

test('якорь ищется в кадре и не хранит ответ ни в одном поле ядра', () => {
  /* Ответ жил в `ai.netPowered`/`netAnchorX`/`netAnchorY` у КАЖДОГО актора игры,
   * а поддерживал его персональный такт. Теперь мир спрашивают на месте: снятый
   * экран меняет ответ в тот же миг, без единого тика. */
  const world = openWorld();
  const e = monster(MonsterKind.CHERVIE_AVATAR);
  world.features[world.idx(13, 10)] = Feature.APPARATUS;
  assert.equal(monsterAnchored(world, e), true);
  world.features[world.idx(13, 10)] = Feature.NONE;
  assert.equal(monsterAnchored(world, e), false, 'ответ обязан следовать за миром без тика');

  // И после полного такта в ядре не заводится ни одного поля про сеть.
  world.features[world.idx(13, 10)] = Feature.APPARATUS;
  const entities = [e];
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(x => [x.id, x])));
  const state = makeGameState({ currentZ: -14, worldEvents: createWorldEventState() });
  updateChervieNetPossessor(world, e, 1, 1, [] as Msg[], 999, state);
  const netKeys = Object.keys(e.ai as object).filter(k => k.startsWith('net'));
  assert.deepEqual(netKeys, [], 'состояние вида живёт рядом с видом, а не в AIState');
});

test('якорь без строки у вида не ищется вовсе', () => {
  // Ворота — строка вида, а не имя: у кого её нет, тот платит один поиск в карте.
  const world = openWorld();
  world.features[world.idx(11, 10)] = Feature.SCREEN;
  const plain = monster(MonsterKind.KRYSNOZHKA);
  assert.equal(findMonsterAnchor(world, plain), undefined);
  assert.equal(monsterAnchored(world, plain), false);
});
