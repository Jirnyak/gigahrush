import test from 'node:test';
import assert from 'node:assert/strict';

import { AIGoal, Cell, EntityType, FloorLevel, Faction, MonsterKind, Occupation, type Entity, type GameClock, type Msg } from '../src/core/types';
import { World } from '../src/core/world';
import { updateAI, getAiSchedulerStats } from '../src/systems/ai';
import { rebuildEntityIndexForSimulation } from '../src/systems/entity_index';
import { initFactionRelations } from '../src/data/relations';
import { makeGameState } from './helpers';

function makeOpenWorld(): World {
  const world = new World();
  for (let y = 0; y < 360; y++) {
    for (let x = 0; x < 360; x++) world.set(x, y, Cell.FLOOR);
  }
  return world;
}

function aiState() {
  return { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 10, thinkAccum: 0 };
}

function player(): Entity {
  return {
    id: 1,
    type: EntityType.PLAYER,
    x: 10,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    faction: Faction.PLAYER,
  };
}

function npc(id: number, x: number, extra: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.NPC,
    x,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 1,
    sprite: 0,
    hp: 50,
    maxHp: 50,
    faction: Faction.CITIZEN,
    ai: aiState(),
    ...extra,
  };
}

function monster(id: number, x: number, kind: MonsterKind): Entity {
  return {
    id,
    type: EntityType.MONSTER,
    x,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    hp: 100,
    maxHp: 100,
    monsterKind: kind,
    attackCd: 1,
    ai: aiState(),
  };
}

function projectile(id: number, ownerId: number): Entity {
  return {
    id,
    type: EntityType.PROJECTILE,
    x: 12,
    y: 10,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: 0,
    ownerId,
    projLife: 1,
  };
}

function tick(world: World, entities: Entity[], dt: number, time: number, clock: GameClock, msgs: Msg[] = []): void {
  rebuildEntityIndexForSimulation(entities, Math.floor(time * 1000));
  updateAI(world, entities, dt, time, msgs, 1, clock, false, { v: 1000 }, FloorLevel.LIVING, makeGameState({ time, clock }));
}

test('AI scheduler classifies hot warm cold actors and important overrides', () => {
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const p = player();
  const shooter = npc(5, 300);
  const entities = [
    p,
    npc(2, 20),
    npc(3, 90),
    npc(4, 300),
    npc(6, 310, { plotNpcId: 'test_plot_target' }),
    monster(7, 320, MonsterKind.MATKA),
    shooter,
    projectile(8, shooter.id),
    npc(9, 330, { ai: { ...aiState(), combatTargetId: p.id } }),
  ];

  tick(world, entities, 1 / 60, 0, clock);
  const stats = getAiSchedulerStats();

  assert.equal(stats.near, 1);
  assert.equal(stats.warmBubble, 1);
  assert.equal(stats.cold, 1);
  assert.equal(stats.plot, 1);
  assert.equal(stats.bosses, 1);
  assert.equal(stats.activeAttackers, 1);
  assert.equal(stats.projectileOwners, 1);
  assert.equal(stats.projectiles, 1);
  assert.equal(stats.updatedWarm, 0);
  assert.equal(stats.updatedCold, 0);
  assert.equal(stats.updatedHot >= 5, true);
});

test('warm actors tick on a cohort cadence while cold routine actors wait longer', () => {
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const entities = [player(), npc(2, 90), npc(3, 300)];
  let warmUpdates = 0;
  let coldUpdates = 0;

  for (let i = 0; i < 60; i++) {
    tick(world, entities, 1 / 60, i / 60, clock);
    const stats = getAiSchedulerStats();
    warmUpdates += stats.updatedWarm;
    coldUpdates += stats.updatedCold;
  }

  assert.equal(warmUpdates > 0, true);
  assert.equal(warmUpdates < 60, true);
  assert.equal(coldUpdates, 0);
});

test('cold routine actors eventually tick instead of saturating below their interval', () => {
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const entities = [player(), npc(2, 300)];
  let coldUpdates = 0;

  for (let i = 0; i < 240; i++) {
    tick(world, entities, 1 / 60, i / 60, clock);
    coldUpdates += getAiSchedulerStats().updatedCold;
  }

  assert.equal(coldUpdates > 0, true);
});

test('near player wakes monster target acquisition even during scan cooldown', () => {
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const p = player();
  p.x = 20;
  const m = monster(2, 25, MonsterKind.SBORKA);
  m.speed = 1;
  m.ai!.combatScanCd = 10;
  const entities = [p, m];

  tick(world, entities, 1 / 60, 0, clock);

  assert.equal(m.ai?.combatTargetId, p.id);
  assert.equal(m.ai?.goal, AIGoal.HUNT);
});

test('combat NPC acquires nearby monster even during scan cooldown', () => {
  initFactionRelations();
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const guard = npc(2, 25, {
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    weapon: 'knife',
    inventory: [{ defId: 'knife', count: 1 }],
  });
  guard.ai!.combatScanCd = 10;
  const mob = monster(3, 29, MonsterKind.SBORKA);
  mob.speed = 1;
  const entities = [player(), guard, mob];

  tick(world, entities, 1 / 60, 0, clock);

  assert.equal(guard.ai?.combatTargetId, mob.id);
  assert.equal(guard.ai?.goal, AIGoal.HUNT);
});

test('cold hostile NPC groups wake up and start an emergent ranged firefight', () => {
  initFactionRelations();
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const entities = [player()];
  let id = 2;

  for (let i = 0; i < 6; i++) {
    entities.push(npc(id++, 300 + (i % 3), {
      y: 300 + Math.floor(i / 3),
      faction: Faction.LIQUIDATOR,
      occupation: Occupation.HUNTER,
      weapon: 'makarov',
      inventory: [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 24 }],
    }));
  }
  for (let i = 0; i < 6; i++) {
    entities.push(npc(id++, 306 + (i % 3), {
      y: 300 + Math.floor(i / 3),
      faction: Faction.CULTIST,
      occupation: Occupation.PILGRIM,
      weapon: 'makarov',
      inventory: [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 24 }],
    }));
  }

  const msgs: Msg[] = [];
  for (let i = 0; i < 480; i++) tick(world, entities, 1 / 60, i / 60, clock, msgs);

  assert.equal(entities.filter(e => e.type === EntityType.PROJECTILE).length > 0, true);
  assert.equal(entities.filter(e => e.type === EntityType.NPC && e.ai?.combatTargetId !== undefined).length >= 8, true);
});

test('recent damage promotes a far actor to hot briefly', () => {
  const world = makeOpenWorld();
  const clock = { hour: 8, minute: 0, totalMinutes: 0 };
  const wounded = npc(2, 300);
  const entities = [player(), wounded];

  tick(world, entities, 1 / 60, 0, clock);
  wounded.hp = 35;
  tick(world, entities, 1 / 60, 1 / 60, clock);
  const stats = getAiSchedulerStats();

  assert.equal(stats.recentlyDamaged, 1);
  assert.equal(stats.hot, 1);
  assert.equal(stats.updatedHot, 1);
});
