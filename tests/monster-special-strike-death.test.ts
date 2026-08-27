/* ── Смерть от спецудара идёт общей дверью ────────────────────────
 *
 * Замок под два бага, найденных сравнением членов семьи спецударов
 * (`problems.md`, «Полная карта семей в ai/monster.ts»).
 *
 * A. `deathByCaller` стоял на ОДНОМ спецударе из одиннадцати — рывке Ржавника.
 *    Флаг отключает `actorDeathHandler → handleKill`, то есть лут, событие
 *    убийства, запись смерти в A-Life и сюжетный дневник. Остальные десять
 *    флага не ставили и потому получали ВТОРУЮ лужу крови: `spawnDeathPool`
 *    звался и в `handleKill`, и следом руками. Правой признана половина без
 *    флага: последствия смерти принадлежат одной двери.
 *
 * B. Ржавник «завершал» рывок, упершись в стену: `if (свободно) { … }` без
 *    `else`. Дальше он всё равно уходил в необратимо хрупкое состояние
 *    (maxHp ×0.58) — терял 42% здоровья за срыв, которого не было.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, Faction, Feature, MonsterKind, type Entity, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { MONSTERS } from '../src/entities/monster';
import { setEntityMap, updateMonster } from '../src/systems/ai/monster';
import { rebuildEntityIndex } from '../src/systems/entity_index';
import { setActorDeathHandler } from '../src/systems/combat_stimulus';
import { spawnDeathPool } from '../src/systems/blood_fx';
import { DANGER_FIELD_DEATH_IMPULSE } from '../src/systems/danger_field';
import { setListenerPos } from '../src/systems/audio';
import { createWorldEventState } from '../src/systems/events';
import { makeGameState } from './helpers';

/** Верхняя добавка в поле опасности от ОДНОГО попадания (`spawnBloodHit`). */
const WOUND_IMPULSE_CAP = 20;

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.features.fill(Feature.NONE);
  return world;
}

function victim(id: number, x: number, y: number, hp = 1): Entity {
  return {
    id, type: EntityType.NPC, x, y, angle: 0, pitch: 0, alive: true,
    speed: 1, sprite: 0, hp, maxHp: 100, faction: Faction.CITIZEN,
    name: 'Сосед',
    ai: { goal: AIGoal.IDLE, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function monster(id: number, kind: MonsterKind, x: number, y: number): Entity {
  const def = MONSTERS[kind];
  return {
    id, type: EntityType.MONSTER, x, y, angle: 0, pitch: 0, alive: true,
    speed: def.speed, sprite: def.sprite, hp: def.hp, maxHp: def.hp,
    monsterKind: kind, attackCd: 0,
    ai: { goal: AIGoal.HUNT, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
  };
}

function syncEntities(entities: Entity[]): void {
  rebuildEntityIndex(entities);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

interface DeathLog { victims: Entity[]; killers: (Entity | undefined)[] }

/**
 * Дверь смерти, как её ставит точка сборки: считает вызовы и льёт лужу.
 * Именно этой лужей `handleKill` и отвечает за кровь на полу.
 */
function installDeathDoor(world: World): DeathLog {
  const log: DeathLog = { victims: [], killers: [] };
  setActorDeathHandler((v, killer, gore, vx, vy) => {
    log.victims.push(v);
    log.killers.push(killer);
    spawnDeathPool(world, v.x, v.y, v.type === EntityType.MONSTER, gore, vx, vy);
  });
  return log;
}

function poolCellLoad(world: World, e: Entity): number {
  return world.dangerField[world.idx(Math.floor(e.x), Math.floor(e.y))];
}

function armedRzhavnik(x: number, y: number, targetId: number): Entity {
  const e = monster(70, MonsterKind.RZHAVNIK, x, y);
  e.ai!.scrapWake = 1;
  e.ai!.windupTimer = 0;
  e.ai!.combatTargetId = targetId;
  return e;
}

test('убитый рывком Ржавника доходит до общей двери смерти и получает ОДНУ лужу', () => {
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const target = victim(2, 11.2, 10.5);
  const threat = armedRzhavnik(10.5, 10.5, target.id);
  const entities = [target, threat];
  const msgs: Msg[] = [];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const deaths = installDeathDoor(world);

  try {
    syncEntities(entities);
    updateMonster(world, entities, threat, 0.1, 1, msgs, 999, { v: 100 }, state);
  } finally {
    setActorDeathHandler(undefined);
  }

  assert.equal(target.alive, false, 'рывок должен добить цель с одним здоровьем');
  // До правки здесь стоял `deathByCaller: true` и дверь не звалась вовсе:
  // ни лута, ни события убийства, ни записи смерти в A-Life.
  assert.equal(deaths.victims.length, 1, 'смерть от рывка обязана пройти общий обработчик');
  assert.equal(deaths.victims[0], target);
  assert.equal(deaths.killers[0], threat, 'убийца обязан доехать до обработчика');
  // Вторая лужа удваивает импульс смерти в поле опасности — его читают
  // блуждание монстров и Олгой, так что двойная лужа не косметика.
  assert.ok(
    poolCellLoad(world, target) <= DANGER_FIELD_DEATH_IMPULSE + WOUND_IMPULSE_CAP,
    'одна смерть — один импульс смерти в поле опасности',
  );
});

test('убитый замахом Кострореза получает ровно одну лужу', () => {
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const target = victim(3, 11.4, 10.5);
  const threat = monster(71, MonsterKind.KOSTOREZ, 10.5, 10.5);
  const entities = [target, threat];
  const msgs: Msg[] = [];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
  const deaths = installDeathDoor(world);

  try {
    syncEntities(entities);
    // Первый такт ставит замах, второй — доводит его до удара.
    updateMonster(world, entities, threat, 0.05, 1, msgs, 999, { v: 100 }, state);
    assert.ok((threat.ai?.windupTimer ?? 0) > 0, 'в упор Косторез обязан завести замах');
    updateMonster(world, entities, threat, threat.ai!.windupTimer! + 0.01, 2, msgs, 999, { v: 100 }, state);
  } finally {
    setActorDeathHandler(undefined);
  }

  assert.equal(target.alive, false);
  assert.equal(deaths.victims.length, 1);
  assert.ok(
    poolCellLoad(world, target) <= DANGER_FIELD_DEATH_IMPULSE + WOUND_IMPULSE_CAP,
    'до правки лужа лилась дважды: и в handleKill, и руками следом',
  );
});

test('Ржавник, упершийся в стену, не платит хрупкостью за рывок, которого не было', () => {
  const blockedWorld = openWorld();
  setListenerPos(512, 512, blockedWorld.dist2.bind(blockedWorld));
  // Стена вплотную по курсу рывка: прыжка не выйдет.
  for (let dy = -2; dy <= 2; dy++) blockedWorld.cells[blockedWorld.idx(12, 10 + dy)] = Cell.WALL;

  const farTarget = victim(4, 15.5, 10.5, 100);
  const blocked = armedRzhavnik(10.5, 10.5, farTarget.id);
  const fullHp = blocked.maxHp!;
  const msgs: Msg[] = [];
  const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });

  syncEntities([farTarget, blocked]);
  updateMonster(blockedWorld, [farTarget, blocked], blocked, 0.1, 1, msgs, 999, { v: 100 }, state);

  assert.equal(blocked.maxHp, fullHp, 'сорванный о стену рывок не имеет права снимать 42% здоровья');
  assert.equal(blocked.hp, fullHp, 'здоровье тоже остаётся целым');

  // Контроль: тот же ржавник по свободному коридору рывок ДЕЛАЕТ и хрупким становится.
  const openWorldClear = openWorld();
  const clearTarget = victim(5, 15.5, 10.5, 100);
  const leaper = armedRzhavnik(10.5, 10.5, clearTarget.id);
  syncEntities([clearTarget, leaper]);
  updateMonster(openWorldClear, [clearTarget, leaper], leaper, 0.1, 1, msgs, 999, { v: 100 }, state);

  assert.ok(leaper.x > 10.5, 'по свободному месту рывок обязан сдвинуть тварь');
  assert.ok(leaper.maxHp! < fullHp, 'состоявшийся рывок по-прежнему делает корпус хрупким');
});
