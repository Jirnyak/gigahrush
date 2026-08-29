/* Замок на выстрел в упор.
 *
 * Снаряд рождался на 0.85 клетки ВПЕРЕДИ стрелка, а развёртка столкновения идёт
 * ОТ точки рождения. Отрезок от груди стрелка до 0.85 не проверялся никогда, и
 * цель ближе этого расстояния оказывалась ПОЗАДИ родившейся пули: промах был
 * геометрический, а не вероятностный. Замерено до правки: ликвидатор с
 * пистолетом за 18 секунд непрерывной стрельбы не снял ни очка с цели в клетке
 * от себя. Все пять точек рождения (две игроцких, две ко-оп-пира, боевой AI)
 * несли одно и то же число, поэтому выстрел в упор не работал и у игрока.
 *
 * Смещение было обходом ОТСУТСТВУЮЩЕЙ проверки: цикл попаданий не пропускал
 * владельца, и пуля из центра стрелка убила бы его тем же кадром (0.85 > радиуса
 * попадания 0.6). Теперь обход заменён самой проверкой.
 *
 * ЧЕГО ЭТОТ ФАЙЛ НЕ ПРОВЕРЯЕТ: сам шаг снаряда живёт в `updateProjectiles`
 * (`main.ts`) и наружу не экспортируется, поэтому сквозного «выстрелил —
 * попал» здесь нет и быть не может. Заперта ПРИЧИНА: геометрия рождения и оба
 * предиката, которыми цикл попаданий теперь отличает своего от чужого.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EntityType, ProjType, type Entity } from '../src/core/types';
import { World } from '../src/core/world';
import { WEAPON_STATS } from '../src/data/catalog';
import {
  launchProjectile,
  projectileHitsForward,
  projectileSparesOwner,
} from '../src/systems/projectiles';
import { Spr } from '../src/entities/sprite_index';
import { makeTestEntity } from './helpers';

/** Радиус попадания обычного снаряда в `updateProjectiles`. */
const HIT_RADIUS = 0.6;

function shooterAt(x: number, y: number, angle: number): Entity {
  return makeTestEntity({ id: 1, type: EntityType.NPC, x, y, angle, hp: 100, maxHp: 100 });
}

function fire(world: World, shooter: Entity, entities: Entity[]): Entity {
  const ws = WEAPON_STATS['pistol'] ?? WEAPON_STATS[''];
  return launchProjectile(world, entities, { v: 100 }, shooter, 'pistol', ws, {
    angle: shooter.angle,
    speed: 20,
    vz: 0,
    sprite: Spr.BULLET,
    life: 3,
    spriteScale: 0.25,
    projType: ProjType.NORMAL,
  });
}

test('снаряд рождается В СТРЕЛКЕ, а не на 0.85 клетки впереди него', () => {
  const world = new World();
  const shooter = shooterAt(20.5, 20.5, 0);
  const entities: Entity[] = [shooter];
  const p = fire(world, shooter, entities);

  assert.equal(p.x, shooter.x, 'смещения вперёд быть не должно');
  assert.equal(p.y, shooter.y);
  assert.equal(p.ownerId, shooter.id, 'снаряд обязан помнить, кто выстрелил');
});

test('цель в упор лежит НА отрезке первого кадра, а не позади него', () => {
  const world = new World();
  const shooter = shooterAt(20.5, 20.5, 0);
  const entities: Entity[] = [shooter];
  const p = fire(world, shooter, entities);

  /* Ровно тот случай, на котором ловили дефект: противник в полклетки по курсу.
   * Прежняя точка рождения (0.85) лежала ЗА ним, и отрезок этого кадра начинался
   * уже позади цели — попасть было нельзя ничем. */
  const victimX = shooter.x + 0.5;
  assert.ok(victimX > p.x, 'цель обязана быть впереди точки рождения');
  assert.ok(victimX < 20.5 + 0.85, 'и при этом ближе прежнего смещения — иначе тест ни о чём');

  const victim = makeTestEntity({ id: 2, type: EntityType.NPC, x: victimX, y: shooter.y, hp: 50, maxHp: 50 });
  const moveX = (p.vx ?? 0) * (1 / 60);
  assert.ok(projectileHitsForward(world, p.x, p.y, moveX, 0, victim), 'цель впереди — бить можно');
});

test('стрелок не ловит собственную пулю, пока она внутри его тела', () => {
  const world = new World();
  const shooter = shooterAt(30.5, 30.5, 0);
  const entities: Entity[] = [shooter];
  const p = fire(world, shooter, entities);

  assert.ok(projectileSparesOwner(world, p, shooter, HIT_RADIUS),
    'в момент выстрела пуля ещё в стрелке — она его не задевает');

  /* Вышла наружу — и стрелок снова обычная мишень. Это не выданный однажды
   * иммунитет, а живая проверка: отскочившая граната, вернувшись, законно убьёт
   * бросившего. */
  p.x = world.wrap(shooter.x + HIT_RADIUS + 0.01);
  assert.equal(projectileSparesOwner(world, p, shooter, HIT_RADIUS), false,
    'покинув тело, снаряд опасен и своему стрелку');
});

test('чужого снаряд щадить не обязан ни на каком расстоянии', () => {
  const world = new World();
  const shooter = shooterAt(40.5, 40.5, 0);
  const entities: Entity[] = [shooter];
  const p = fire(world, shooter, entities);
  const other = makeTestEntity({ id: 7, type: EntityType.NPC, x: 40.5, y: 40.5, hp: 50, maxHp: 50 });

  assert.equal(projectileSparesOwner(world, p, other, HIT_RADIUS), false,
    'пощада — только своему стрелку, и только по ownerId');
});

test('выстрел вперёд не убивает прижавшегося к спине', () => {
  const world = new World();
  const shooter = shooterAt(50.5, 50.5, 0);
  const entities: Entity[] = [shooter];
  const p = fire(world, shooter, entities);

  /* Цена рождения в центре стрелка: отрезок развёртки «толстый» (радиус 0.6), и
   * стоящий вплотную СЗАДИ попадает в него. Без проверки курса выстрел вперёд
   * укладывал бы того, кто стоит за спиной. */
  const behind = makeTestEntity({ id: 3, type: EntityType.NPC, x: 50.2, y: 50.5, hp: 50, maxHp: 50 });
  const moveX = (p.vx ?? 0) * (1 / 60);
  assert.equal(projectileHitsForward(world, p.x, p.y, moveX, 0, behind), false,
    'стоящий сзади не должен ловить выстрел, направленный вперёд');
});

test('проверка курса работает через шов тора', () => {
  const world = new World();
  // Стрелок у самого края мира, цель — за швом: разность координат обязана
  // считаться по тору, иначе «впереди» и «сзади» меняются местами на шве.
  const shooter = shooterAt(0.5, 10.5, 0);
  const entities: Entity[] = [shooter];
  const p = fire(world, shooter, entities);
  const ahead = makeTestEntity({ id: 4, type: EntityType.NPC, x: 1.0, y: 10.5, hp: 50, maxHp: 50 });
  const acrossSeam = makeTestEntity({ id: 5, type: EntityType.NPC, x: world.wrap(-0.3), y: 10.5, hp: 50, maxHp: 50 });
  const moveX = (p.vx ?? 0) * (1 / 60);

  assert.ok(projectileHitsForward(world, p.x, p.y, moveX, 0, ahead));
  assert.equal(projectileHitsForward(world, p.x, p.y, moveX, 0, acrossSeam), false,
    'за швом и позади — всё равно позади');
});
