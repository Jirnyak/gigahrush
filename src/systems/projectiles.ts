/* ── Единая дверь рождения снаряда ─────────────────────────────────
 *
 * Снаряд в мире появляется ТОЛЬКО отсюда. До 2026-08-29 точек рождения было
 * пять — две игроцких, две ко-оп-пира и одна боевого AI, — и все пять несли по
 * своей копии одного и того же выражения, включая смещение вперёд на 0.85
 * клетки. Это смещение и было дефектом.
 *
 * ПОЧЕМУ 0.85 СУЩЕСТВОВАЛ. Проверка попаданий (`main.ts`) отбирала кандидатов
 * по «жив» и «человек или тварь» — ВЛАДЕЛЬЦА она не пропускала. Родись пуля в
 * центре стрелка, она застрелила бы его тем же кадром: радиус попадания 0.6, а
 * 0.85 > 0.6. То есть смещение выносило снаряд за пределы собственного тела
 * стрелка, и это был обход отсутствующей проверки, а не физика.
 *
 * ЧТО ОН ЛОМАЛ. Развёртка столкновения идёт ОТ точки рождения вперёд, поэтому
 * отрезок от груди стрелка до 0.85 не проверялся никогда. Цель ближе 0.85
 * оказывалась ПОЗАДИ родившейся пули, и попасть в неё было нельзя в принципе.
 * Замерено: ликвидатор с пистолетом за 18 секунд непрерывной стрельбы не снял
 * ни очка с цели в клетке от себя. Дефект общий — обе игроцких точки несли то
 * же самое число, то есть выстрел в упор не работал и у игрока.
 *
 * ЧЕМ ЗАМЕНЁН. Снаряд рождается В ЦЕНТРЕ стрелка, а владелец пропускается ровно
 * до тех пор, пока снаряд не вышел за СВОЙ ЖЕ радиус попадания
 * (`projectileSparesOwner`). Порог не заведён ручкой: это тот самый радиус,
 * которым снаряд и попадает, то есть буквально «пока я внутри стрелка».
 * Проверка живая, а не выданный однажды иммунитет, поэтому отскочившая граната,
 * вернувшись, снова законно убивает бросившего.
 *
 * Второй половиной идёт `projectileHitsForward`: бить можно только вперёд по
 * курсу. Без неё рождение в центре стрелка означало бы, что прижавшийся к спине
 * попадает в радиус отрезка и ловит пулю от выстрела ВПЕРЁД. Проверка общая для
 * всех кадров, а не только первого, и заодно отменяет попадания «назад» у уже
 * пролетевшего мимо снаряда.
 *
 * СВЕДЕНИЕ БЕЗ СДВИНУТЫХ ЧИСЕЛ — тем же приёмом, что и единая дверь урона:
 * расхождения путей вынесены ЯВНЫМИ полями входа, а не спрятаны в «как у всех».
 * Найденные расхождения (ни одно не тронуто):
 *   - боевой AI красит снаряд `hostileProjectileSprite` — игрок и пир нет;
 *   - боевой AI даёт гранате `projLife` 3.0, игрок и пир — 1.5;
 *   - боевой AI не ставит `projGore` вовсе, игрок и пир ставят по оружию;
 *   - `spriteScale` у боевого AI знает два случая, у игрока — четыре;
 *   - вертикальная скорость: игрок и пир целятся ТАНГАЖОМ, боевой AI —
 *     компенсацией падения на дистанцию. Это разные способы прицелиться, а не
 *     разная физика, и сводить их — отдельное решение владельца.
 */

import { EntityType, type Entity, type ProjType } from '../core/types';
import type { World } from '../core/world';
import type { WeaponStats } from '../data/weapons';

/** Всё, чем пути рождения снаряда РАСХОДЯТСЯ. Общее живёт в самой двери. */
export interface ProjectileLaunch {
  /** Курс ЭТОЙ дробины: разброс уже разрешён вызывающим. */
  angle: number;
  speed: number;
  /** Вертикальная скорость: тангаж стрелка либо компенсация падения. */
  vz: number;
  sprite: number;
  life: number;
  spriteScale: number;
  gore?: number;
  projType?: ProjType;
}

/**
 * Выпустить снаряд.
 *
 * Рождается В ЦЕНТРЕ стрелка — смещения вперёд больше нет ни у кого. Всё, что
 * нужно, чтобы стрелок не убил сам себя, делает проверка попаданий; см. шапку.
 */
export function launchProjectile(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  shooter: Entity,
  weaponId: string,
  ws: WeaponStats,
  launch: ProjectileLaunch,
): Entity {
  const cos = Math.cos(launch.angle);
  const sin = Math.sin(launch.angle);
  const proj: Entity = {
    id: nextId.v++,
    type: EntityType.PROJECTILE,
    x: world.wrap(shooter.x),
    y: world.wrap(shooter.y),
    angle: launch.angle,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: launch.sprite,
    vx: cos * launch.speed,
    vy: sin * launch.speed,
    vz: launch.vz,
    projDmg: ws.dmg,
    projLife: launch.life,
    ownerId: shooter.id,
    weapon: weaponId,
    spriteScale: launch.spriteScale,
    spriteZ: 0.5,
  };
  if (launch.projType !== undefined) proj.projType = launch.projType;
  if (launch.gore !== undefined) proj.projGore = launch.gore;
  if (ws.aoeRadius) {
    proj.aoeRadius = ws.aoeRadius;
    proj.aoeDmg = ws.dmg;
  }
  entities.push(proj);
  return proj;
}

/**
 * Щадит ли снаряд своего стрелка прямо сейчас.
 *
 * Только пока не покинул его тело, и мерка тела — тот же радиус, которым снаряд
 * попадает. Выйдя наружу, он снова опасен всем, включая бросившего: это и есть
 * разница между «иммунитет» и «я ещё в стволе».
 */
export function projectileSparesOwner(
  world: World, p: Entity, candidate: Entity, hitRadius: number,
): boolean {
  if (candidate.id !== p.ownerId) return false;
  return world.dist2(p.x, p.y, candidate.x, candidate.y) <= hitRadius * hitRadius;
}

/**
 * Впереди ли цель по курсу снаряда.
 *
 * Отрезок развёртки «толстый» (радиус попадания), поэтому без этой проверки в
 * него попадает и тот, кто стоит ВПЛОТНУЮ СЗАДИ, — выстрел вперёд убивал бы
 * прижавшегося к спине. Считается от начала отрезка этого кадра, значит заодно
 * отменяет попадание в того, кого снаряд уже миновал.
 */
export function projectileHitsForward(
  world: World, startX: number, startY: number, moveX: number, moveY: number, candidate: Entity,
): boolean {
  const len2 = moveX * moveX + moveY * moveY;
  // Снаряд стоит на месте (нулевой шаг) — направления нет, судить не о чем.
  if (len2 <= 0) return true;
  const dx = world.delta(startX, candidate.x);
  const dy = world.delta(startY, candidate.y);
  return dx * moveX + dy * moveY > 0;
}
