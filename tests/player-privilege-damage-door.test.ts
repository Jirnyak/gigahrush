/* Игрок — просто NPC: четыре снятых привилегии в путях урона.
 *
 * Каждая из проверок ниже падает при возврате старой формы, и каждая старая
 * форма реально жила в коде:
 *   · состав бил игрока на 38, а всех прочих на 260, и кулдаун переезда 0.85 с
 *     существовал ТОЛЬКО у игрока — то есть игрок был защищён спецслучаем ровно
 *     от того, что мгновенно убивало всех остальных;
 *   · давление самосбора вне гермы и колокол Истотита резали `hp` напрямую,
 *     мимо всякой брони: пропитанная ряса с пси-защитой 75 не значила ничего;
 *   · пси-удар имел ВТОРУЮ дорогу «без состояния», которая считала врождённую
 *     броню твари, но не носимую, и не сообщала жертве, кто ударил.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world';
import {
  AIGoal, Cell, DamageType, EntityType, Faction, W, type Entity, type Msg,
} from '../src/core/types';
import { setCurrentPlayerEntity } from '../src/systems/player_actor';
import { damageActorByEnvironment } from '../src/systems/actor_damage';
import { addRailTrainRoute, updateRailTrains } from '../src/systems/rail_trains';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { castInstantSpell } from '../src/systems/psi';
import { makeGameState, makeTestNpc, makeTestPlayer } from './helpers';

function railWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  return world;
}

/** Прямая линия рельсов по y = 10 и один состав на ней. */
function seedTrack(world: World, entities: Entity[]): void {
  const cells: number[] = [];
  for (let x = 4; x < 60; x++) cells.push(world.idx(x, 10));
  addRailTrainRoute(world, entities, { v: 900 }, {
    id: 'probe_line',
    label: 'Пробный состав',
    cells,
    stationOffsets: [0],
    platformCells: [world.idx(20, 13)],
    loop: true,
  }, {
    id: 'probe_train',
    label: 'Пробный состав',
    speed: 6,
    length: 4,
    initialOffset: 20,
    stopSeconds: 0,
  });
}

/** Сколько состав снимет с этого тела за один кадр контакта. */
function crush(victim: Entity): number {
  const world = railWorld();
  const entities: Entity[] = [victim];
  seedTrack(world, entities);
  const state = makeGameState();
  state.time = 1;
  const train = world.railTrains[0];
  /* Свежий состав стоит на станции (`stopUntil < 0` читается как «стоит»), а
   * стоящий никого не давит. Выпускаем его вручную: иначе проверка молча мерит
   * ноль и выглядит зелёной в любую сторону. */
  train.stopUntil = 0;
  train.lastStopOffset = 0;
  train.offset = 20;
  /* Тело ставится РОВНО в вагон: контакт проверяется по расстоянию до состава,
   * а не по метке клетки, и промах в полклетки прячет удар целиком. */
  const seat = world.railTracks[0].cells[train.offset];
  victim.x = (seat % W) + 0.5;
  victim.y = Math.floor(seat / W) + 0.5;
  const ghost = makeTestNpc({ id: 8000, x: 500.5, y: 500.5 });
  rebuildEntityIndexForSimulation(entities.concat(ghost), 0);
  const before = victim.hp ?? 0;
  updateRailTrains(world, entities.concat(ghost), ghost, state, 1 / 60);
  return before - (victim.hp ?? 0);
}

test('состав снимает с игрока и с жильца ОДНО число', () => {
  const player = makeTestPlayer({ id: 1, hp: 4000, maxHp: 4000 });
  setCurrentPlayerEntity(player);
  const playerLoss = crush(player);
  setCurrentPlayerEntity(undefined);
  const npcLoss = crush(makeTestNpc({ id: 2, hp: 4000, maxHp: 4000 }));

  assert.equal(npcLoss, 260, 'переезд стоит 260 — столько он стоил всем, кроме игрока');
  assert.equal(playerLoss, npcLoss, 'игрок больше не защищён спецслучаем от того, что убивает прочих');
});

test('состав ДОБИВАЕТ игрока: порог выживания среды на него не распространяется', () => {
  const player = makeTestPlayer({ id: 1, hp: 100, maxHp: 100 });
  setCurrentPlayerEntity(player);
  crush(player);
  setCurrentPlayerEntity(undefined);
  assert.ok((player.hp ?? 1) <= 0, 'под колёсами не выживают — ни игрок, ни жилец');
});

test('давление самосбора и колокол Истотита встречают пси-защиту', () => {
  /* Оба места самосбора зовут дверь как ПСИ. Проверяется сама дверь тем же
   * типом и той же величиной: до правки удар шёл мимо резистов целиком. */
  const state = makeGameState();
  const bare = makeTestNpc({ id: 11, hp: 500, maxHp: 500 });
  const robed = makeTestNpc({ id: 12, hp: 500, maxHp: 500, armorDefId: 'armor_cultist' });
  const world = railWorld();

  const bareLoss = damageActorByEnvironment(world, state, bare, { damage: 4, damageType: DamageType.PSI, time: 1 });
  const robedLoss = damageActorByEnvironment(world, state, robed, { damage: 4, damageType: DamageType.PSI, time: 1 });

  assert.equal(bareLoss, 4, 'без пропитки давление снимает своё полностью');
  assert.equal(robedLoss, 1, 'ряса культиста режет ПСИ на 75 процентов');
});

test('пси-удар идёт ОДНОЙ дорогой и считает носимую броню', () => {
  /* Запасной путь `psiHit` без состояния считал врождённую броню твари, но не
   * носимую. Дороги больше нет: состояние обязательно, дверь одна. Буря на два
   * одинаковых тела, одно в рясе — разница обязана быть. */
  const world = railWorld();
  const state = makeGameState();
  const msgs: Msg[] = [];
  const caster = makeTestPlayer({
    id: 1, x: 20.5, y: 20.5, angle: 0,
    rpg: { level: 5, xp: 0, attrPoints: 0, str: 0, agi: 0, int: 3, psi: 50, maxPsi: 50 },
  });
  const ai = { goal: AIGoal.WANDER, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 1 };
  const bare = makeTestNpc({ id: 4001, x: 24.5, y: 20.5, hp: 500, maxHp: 500, faction: Faction.WILD, ai: { ...ai } });
  const robed = makeTestNpc({
    id: 4002, x: 24.5, y: 21.5, hp: 500, maxHp: 500, faction: Faction.WILD,
    armorDefId: 'armor_cultist', ai: { ...ai },
  });
  const entities = [caster, bare, robed];
  setCurrentPlayerEntity(caster);
  castInstantSpell('storm', caster, entities, world, msgs, 1, state);
  setCurrentPlayerEntity(undefined);

  const bareLoss = 500 - (bare.hp ?? 0);
  const robedLoss = 500 - (robed.hp ?? 0);
  assert.ok(bareLoss > 0, 'буря вообще дошла до цели');
  assert.ok(robedLoss < bareLoss, 'носимая пси-защита режет бурю; запасной путь этого не умел');
  assert.equal(bare.type, EntityType.NPC);
});
