/**
 * Замки на принцип «игрок — это просто NPC» со стороны монстров.
 *
 * Каждый тест ставит рядом с монстром NPC вместо игрока и требует того же
 * поведения: цель выбирают по признакам (кто ударил, кто пахнет, кто стоит
 * у порога), а не по идентификатору игрока.
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  AIGoal, Cell, DoorState, EntityType, Faction, Feature, MonsterKind, RoomType,
  type Entity, type Msg,
} from '../src/core/types';
import { World } from '../src/core/world';
import { DEF as RZHAVNIK_DEF } from '../src/entities/rzhavnik';
import { DEF as ROY_DEF } from '../src/entities/pomoynyy_roy';
import { DEF as BEZEKHIY_DEF } from '../src/entities/bezekhiy';
import { DEF as BLACK_LIQUIDATOR_DEF } from '../src/entities/black_liquidator';
import { DEF as CHERVIE_DEF } from '../src/entities/chervie_avatar';
import { DEF as CHERNOSLIZ_DEF } from '../src/entities/chernosliz';
import { DEF as PROTOKOLNIK_DEF } from '../src/entities/protokolnik';
import {
  peekProtokolnikPressure,
  setEntityMap,
  updateMonster,
  updateChervieNetPossessor,
  updateProtokolnikProtocolPressure,
} from '../src/systems/ai/monster';
import { notifyActorDamaged, resetCombatStimulus } from '../src/systems/combat_stimulus';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { createWorldEventState, getRecentEvents } from '../src/systems/events';
import { resetMonsterBaits } from '../src/systems/monster_bait';
import { setListenerPos } from '../src/systems/audio';
import { bakeNavigationTree } from '../src/systems/ai/pathfinding';
import { addTestRoom, makeGameState } from './helpers';

let simulationFrame = 0;

function sync(entities: Entity[]): void {
  rebuildEntityIndexForSimulation(entities, ++simulationFrame);
  setEntityMap(new Map(entities.map(e => [e.id, e])));
}

function openWorld(): World {
  const world = new World();
  world.cells.fill(Cell.FLOOR);
  world.zoneMap.fill(0);
  world.zones[0] = { id: 0, cx: 16, cy: 16, faction: 0, hasLift: false, fogged: false, level: 1, hqRoomId: -1 };
  return world;
}

function person(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 2,
    sprite: 0,
    hp: 60,
    maxHp: 60,
    name: `Житель ${id}`,
    faction: Faction.CITIZEN,
    inventory: [],
    ai: { goal: AIGoal.WANDER, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

function playerBody(id: number, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    persistentNpcId: 'player',
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 3,
    sprite: 0,
    hp: 100,
    maxHp: 100,
    name: 'Вы',
    faction: Faction.PLAYER,
    inventory: [],
    ...overrides,
  };
}

function monster(id: number, kind: MonsterKind, def: typeof RZHAVNIK_DEF, x: number, y: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    currentMag: 1,
    ai: { goal: AIGoal.IDLE, tx: Math.floor(x), ty: Math.floor(y), path: [], pi: 0, stuck: 0, timer: 0 },
    ...overrides,
  };
}

test('раненый ржавник просыпается на того, кто в него стрелял, а не на игрока', () => {
  resetCombatStimulus();
  const world = new World();
  addTestRoom(world, { id: 1, type: RoomType.STORAGE, x: 10, y: 10, w: 16, h: 10 });
  bakeNavigationTree(world);
  setListenerPos(512, 512, world.dist2.bind(world));

  const shooter = person(7, 20.5, 14.5);
  const player = playerBody(1, 24.5, 18.5);
  const threat = monster(32, MonsterKind.RZHAVNIK, RZHAVNIK_DEF, 14.5, 14.5);
  threat.hp = (threat.maxHp ?? 40) - 6;
  const entities = [player, shooter, threat];
  const state = makeGameState({ currentZ: -14, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  sync(entities);
  notifyActorDamaged(world, threat, shooter, 6, 'npc_ranged', 1, state);
  // Память угрозы сама подсказывает цель обороняющемуся; гасим её, чтобы замок
  // проверял именно пробуждение ржавника, а не подсказку боевого стимула.
  threat.ai!.combatTargetId = undefined;

  sync(entities);
  updateMonster(world, entities, threat, 0.1, 1.1, msgs, player.id, { v: 100 }, state);

  assert.equal(threat.ai?.scrapWake, 1, 'обстрел обязан будить спящий ржавник');
  assert.equal(threat.ai?.combatTargetId, shooter.id, 'рывок готовится на стрелявшего NPC');
  assert.notEqual(threat.ai?.combatTargetId, player.id, 'игрок не притягивает пробуждение через полкарты');
});

test('помойный рой одинаково идёт на приманку у NPC и у игрока', () => {
  const carrierResults: number[] = [];
  for (const carrierIsPlayer of [false, true]) {
    resetMonsterBaits();
    resetCombatStimulus();
    const world = openWorld();
    const bait = [{ defId: 'rawmeat', count: 1 }];
    const carrier = carrierIsPlayer
      ? playerBody(1, 10, 10, { inventory: bait })
      : person(7, 10, 10, { inventory: bait });
    // Второй актор стоит на том же расстоянии, но без запаха: его рой не берёт.
    const bystander = carrierIsPlayer ? person(7, 10, 30) : playerBody(1, 10, 30);
    const threat = monster(2, MonsterKind.POMOYNY_ROY, ROY_DEF, 32, 10);
    const entities = [carrier, bystander, threat];
    const state = makeGameState({ currentZ: 0, worldEvents: createWorldEventState() });
    const msgs: Msg[] = [];

    sync(entities);
    updateMonster(world, entities, threat, 0.1, 1, msgs, carrierIsPlayer ? carrier.id : bystander.id, { v: 10 }, state);

    assert.equal(threat.ai?.combatTargetId, carrier.id, 'рой берёт носителя приманки, кем бы тот ни был');
    carrierResults.push(threat.ai?.combatTargetId ?? -1);
  }
  assert.equal(carrierResults.length, 2);
  resetMonsterBaits();
});


test('безэхий держит того, кого видит, и теряет за стеной — игрок тут не особенный', () => {
  resetCombatStimulus();
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));

  const walker = person(7, 13.5, 10.5);
  const player = playerBody(1, 60, 60);
  const threat = monster(2, MonsterKind.BEZEKHIY, BEZEKHIY_DEF, 10.5, 10.5);
  const entities = [player, walker, threat];
  const state = makeGameState({ worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  // NPC в прямой видимости вблизи — цель, хотя игрок за полкарты.
  sync(entities);
  updateMonster(world, entities, threat, 0.1, 1, msgs, player.id, { v: 3 }, state);
  assert.equal(threat.ai?.combatTargetId, walker.id, 'берёт того, кого видит, а не игрока');

  // Стена между ними — и цель потеряна: другого канала у него нет.
  for (let y = 9; y <= 12; y++) world.cells[world.idx(12, y)] = Cell.WALL;
  sync(entities);
  updateMonster(world, entities, threat, 0.1, 1.2, msgs, player.id, { v: 3 }, state);
  assert.equal(threat.ai?.combatTargetId, undefined, 'за стеной он теряет цель насовсем');
  assert.equal(player.hp, 100, 'игрок за полкарты не участвует');
});

// Чернослиз прячется от свойств места (чёрная вода, темнота, целая шкура), а
// не от того, кто рядом стоит. Между сканами цели он одинаково сжат и при
// игроке в пяти клетках, и при таком же NPC.
test('чернослиз держит маскировку одинаково при игроке и при NPC рядом', () => {
  const scales: (number | undefined)[] = [];
  for (const observerIsPlayer of [false, true]) {
    resetCombatStimulus();
    const world = openWorld();
    world.cells[world.idx(10, 10)] = Cell.WATER;
    const observer = observerIsPlayer ? playerBody(1, 15.5, 10.5) : person(7, 15.5, 10.5);
    const threat = monster(2, MonsterKind.CHERNOSLIZ, CHERNOSLIZ_DEF, 10.5, 10.5, {
      // Скан цели ещё не подошёл: решение о маскировке принимается без цели.
      ai: { goal: AIGoal.WANDER, tx: 10, ty: 10, path: [], pi: 0, stuck: 0, timer: 0, combatScanCd: 0.5 },
    });
    const entities = [observer, threat];
    const state = makeGameState({ currentZ: -26, worldEvents: createWorldEventState() });
    const msgs: Msg[] = [];

    sync(entities);
    updateMonster(world, entities, threat, 0.1, 1, msgs, observerIsPlayer ? observer.id : 999, { v: 10 }, state);
    scales.push(threat.spriteScale);
  }
  assert.equal(scales[0], scales[1], 'маскировка не вправе спадать от одного лишь присутствия игрока');
});

// Давление протокола копится на любом, кто держит строку и несёт бумаги, —
// значит, и пульс обязан прилетать любому, а не одному игроку.
test('пульс протокольника бьёт NPC с бумагами на этаже без игрока', () => {
  resetCombatStimulus();
  const world = openWorld();
  setListenerPos(512, 512, world.dist2.bind(world));
  const clerk = person(7, 22.5, 10.5, {
    inventory: [{ defId: 'official_permit_slip', count: 2 }, { defId: 'blank_form', count: 4 }],
  });
  const threat = monster(2, MonsterKind.PROTOKOLNIK, PROTOKOLNIK_DEF, 10.5, 10.5, {
    ai: { goal: AIGoal.HUNT, tx: 10, ty: 10, path: [], pi: 0, stuck: 0, timer: 0 },
  });
  const entities = [clerk, threat];
  const state = makeGameState({ currentZ: 30, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  sync(entities);
  // 999 — несуществующее тело игрока: сверка идёт без него.
  updateProtokolnikProtocolPressure(world, entities, threat, clerk, 8, 8, msgs, 999, { v: 900 }, state);

  assert.ok(peekProtokolnikPressure(threat) > 0, 'давление обязано копиться на NPC');
  assert.ok((clerk.hp ?? 60) < 60, 'пульс сверки бьёт носителя бумаг, кем бы он ни был');
});

test('червие подставляет ближайшего человека даже без игрока на этаже', () => {
  resetCombatStimulus();
  const world = openWorld();
  addTestRoom(world, { id: 1, type: RoomType.PRODUCTION, x: 4, y: 4, w: 32, h: 16 });
  world.features[world.idx(11, 10)] = Feature.APPARATUS;

  const threat = monster(2, MonsterKind.CHERVIE_AVATAR, CHERVIE_DEF, 10.5, 10.5, {
    ai: { goal: AIGoal.WANDER, tx: 10, ty: 10, path: [], pi: 0, stuck: 0, timer: 0 },
  });
  const near = person(3, 11.5, 10.5);
  const far = person(4, 13.5, 11.5);
  const farther = person(5, 14.5, 11.5);
  // Тело игрока стоит в том же импульсе: муть в голове ему положена наравне со всеми.
  const bystander = playerBody(1, 12.5, 10.5);
  const entities = [threat, near, far, farther, bystander];
  const state = makeGameState({ currentZ: -14, worldEvents: createWorldEventState() });
  const msgs: Msg[] = [];

  sync(entities);
  // 999 — несуществующее тело игрока: этаж без него обязан жить так же.
  updateChervieNetPossessor(world, threat, 1, 1, msgs, 999, state);

  assert.equal(threat.ai?.netPowered, true);
  assert.equal(far.ai?.combatTargetId, near.id, 'ложный приказ выписан на ближайшего человека');
  assert.equal(farther.ai?.combatTargetId, near.id);
  assert.equal(near.ai?.combatTargetId, threat.id, 'подставленный не воюет сам с собой');
  assert.ok((bystander.psiMadness ?? 0) > 0, 'импульс мутит голову и игроку: иммунитета по лицу нет');
  assert.ok((near.psiMadness ?? 0) > 0);
  const order = getRecentEvents(state, { type: 'chervie_false_order', limit: 1 })[0];
  assert.equal(order?.targetId, near.id);
});
