/* ── Семья рывков: одна мысль вместо пяти ──────────────────────────
 *
 * «Взять вектор на цель, пройти по нему без права правки курса, проверить
 * геометрию и развязать — попал / промазал / врезался» было написано пять раз:
 * прыжок Ржавника, бросок Жорной твари, спринт Трескотника, разгон Дикого
 * Мертвяка и фланговый бросок Тонкой Тени.
 *
 * Расхождения между ними не были замыслом. Предикатов «не проскочить сквозь
 * стену» было ЧЕТЫРЕ (`world.solid` точкой, то же через `stepActorBy`, свой
 * `treskotnikSprintBlocked` и `canActorOccupy`), и только последний знал про
 * радиус тела; самоурон был ровно у одного из пяти; трассировка шла копией
 * марша пробами, которая не проверяла концы отрезка.
 *
 * Здесь предикат один: ДОШЁЛ ЛИ, не задев мир, — точная растеризация отрезка
 * (`world/line_of_sight`, обход Amanatides–Woo) плюс занятость точки
 * приземления телом (`canActorOccupy`). Всё остальное — колонки `MonsterDashDef`
 * в файле самого вида.
 */

import { Feature, type Entity } from '../../core/types';
import type { World } from '../../core/world';
import { MONSTERS, type MonsterDashDef } from '../../entities/monster';
import { isLineOfFireCover, lineCoverCells } from '../../world/line_of_sight';
import {
  actorOccupyRadius, canActorOccupy, entityIgnoresFineBlockers, stepActorBy,
  type ActorOccupyOptions,
} from '../movement_collision';
import { spawnDeathPool } from '../blood_fx';
import { killEntity } from '../entity_death';
import { speciesState } from './species_state';

/**
 * Запас гейта дистанции в трассировке.
 *
 * Гейт `dist > maxDist` в растеризации отсекает слишком длинный луч; для рывка
 * длина уже посчитана, и запас нужен только чтобы гейт не срезал собственный
 * шаг на округлении. Ржавник звал трассировку с КОНСТАНТОЙ (полная длина
 * прыжка), Жорная — с фактическим шагом; разницы в ответе это не давало,
 * потому что гейт в обоих случаях не срабатывал никогда. Число одно на семью.
 */
const DASH_TRACE_SLACK = 0.35;

/** Подшаг разгона: длиннее — и разогнавшийся проскакивает клетку целиком. */
const DASH_SUBSTEP = 0.22;

/** Общий на всех запрос занятия точки: живёт ровно до одного чтения. */
const _dashOccupyOpt: ActorOccupyOptions = { ignoreFineBlockers: false };

export const enum DashStep {
  /** Долетел чисто. */
  CLEAR,
  /** Упёрся и соскользнул вдоль препятствия. */
  SLID,
  /** Упёрся и встал. */
  BLOCKED,
}

export const enum DashRunOutcome {
  /** Разгона нет. */
  IDLE,
  /** Едет дальше. */
  MOVING,
  /** Достал цель. */
  HIT,
  /** Влетел в мир. */
  CRASHED,
  /** Разгон кончился сам. */
  SPENT,
}

/* ── Замер срывов о геометрию ─────────────────────────────────── */

export interface DashStat {
  tries: number;
  breaks: number;
  slides: number;
}

/** Ключей ровно столько, сколько видов со строкой рывка. */
const _dashStats = new Map<number, DashStat>();

function statFor(e: Entity): DashStat {
  const key = e.monsterKind ?? -1;
  let stat = _dashStats.get(key);
  if (!stat) {
    stat = { tries: 0, breaks: 0, slides: 0 };
    _dashStats.set(key, stat);
  }
  return stat;
}

/** Сколько рывков каждого вида сорвалось о геометрию. Замер и отладка. */
export function peekDashStats(): ReadonlyMap<number, DashStat> {
  return _dashStats;
}

/* ── Один шаг рывка ───────────────────────────────────────────── */

function dashPathClear(world: World, e: Entity, x: number, y: number, dist: number, dash: MonsterDashDef): boolean {
  _dashOccupyOpt.ignoreFineBlockers = entityIgnoresFineBlockers(e);
  // Радиус тела знал ровно один член семьи из пяти. Знают все: тварь шириной в
  // треть клетки не пролетает в щель, в которую пролезает её математический центр.
  if (!canActorOccupy(world, x, y, actorOccupyRadius(e), _dashOccupyOpt)) return false;
  const cover = lineCoverCells(world, e.x, e.y, x, y, dist + DASH_TRACE_SLACK);
  if (cover < 0) return false;
  if (!dash.coverBlocks) return true;
  // Клетка приземления укрытием у растеризации не считается — она отвечает про
  // ПУТЬ. Для того, кто осыпается о стол, стол в точке остановки тоже считается.
  return cover === 0 && !isLineOfFireCover(world.features[world.idx(Math.floor(x), Math.floor(y))] as Feature);
}

/**
 * Перенести тварь в точку рывка.
 *
 * `maxDist` — предел досягаемости броска (для тех, кто выбирает точку, а не
 * шагает по вектору); дальше него бросок не переносит вовсе.
 */
export function dashTo(
  world: World, e: Entity, x: number, y: number, dash: MonsterDashDef, maxDist?: number,
): DashStep {
  const nx = world.wrap(x);
  const ny = world.wrap(y);
  const dx = world.delta(e.x, nx);
  const dy = world.delta(e.y, ny);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const stat = statFor(e);
  stat.tries++;
  if ((maxDist === undefined || dist <= maxDist) && dashPathClear(world, e, nx, ny, dist, dash)) {
    e.x = nx;
    e.y = ny;
    return DashStep.CLEAR;
  }
  stat.breaks++;
  if (!dash.slideOnBlock) return DashStep.BLOCKED;
  // Скользит тем же общим разрешением столкновений, что и обычный ход актора:
  // засаду теряет, но остаётся целым.
  if (!stepActorBy(world, e, dx, dy)) return DashStep.BLOCKED;
  stat.slides++;
  return DashStep.SLID;
}

/** Точка приземления мгновенного рывка в цель. Своя на вызов не нужна. */
export interface DashLanding {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  dist: number;
  step: number;
}
const _landing: DashLanding = { x: 0, y: 0, dirX: 1, dirY: 0, dist: 0, step: 0 };

/**
 * Куда встанет мгновенный рывок в точку `(tx, ty)`.
 *
 * Формула у Ржавника и Жорной твари была одна и та же с точностью до зазора:
 * `min(длина рывка, расстояние − зазор)`. Зазор стал колонкой, формула — одной.
 */
export function dashLanding(world: World, e: Entity, tx: number, ty: number, dash: MonsterDashDef): DashLanding {
  const dx = world.delta(e.x, tx);
  const dy = world.delta(e.y, ty);
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const step = Math.min(dash.step ?? dist, Math.max(0, dist - (dash.gap ?? 0)));
  _landing.dirX = dx / dist;
  _landing.dirY = dy / dist;
  _landing.dist = dist;
  _landing.step = step;
  _landing.x = world.wrap(e.x + _landing.dirX * step);
  _landing.y = world.wrap(e.y + _landing.dirY * step);
  return _landing;
}

/** Достал ли рывок цель. Радиус — колонка вида. */
export function dashReached(world: World, e: Entity, target: Entity, dash: MonsterDashDef): boolean {
  const hit = dash.hitRange;
  if (hit === undefined || !target.alive) return false;
  return world.dist2(e.x, e.y, target.x, target.y) <= hit * hit;
}

/**
 * Самоурон рывка долей `maxHp`. Единственное место, где рывок бьёт своего.
 *
 * Пол «не меньше 3/4 очков» из тела Трескотника снят: при его 18 здоровья доли
 * 0.22 и 0.28 дают 4 и 5, то есть пол не срабатывал НИ РАЗУ и был мёртвым
 * числом. Осталась единица — граница «удар вообще был».
 */
export function dashSelfDamage(world: World, e: Entity, fraction: number): number {
  // Не объявил долю — не платит собой. Пол в единицу иначе снимал бы очко с тех
  // четырёх членов семьи, у кого самоурона нет вовсе.
  if (!(fraction > 0)) return 0;
  const maxHp = e.maxHp ?? (e.monsterKind !== undefined ? MONSTERS[e.monsterKind].hp : 1);
  const damage = Math.max(1, Math.round(maxHp * fraction));
  if (e.hp === undefined) return damage;
  e.hp = Math.max(0, e.hp - damage);
  if (e.hp <= 0) {
    killEntity(e);
    spawnDeathPool(world, e.x, e.y, true);
  }
  return damage;
}

/* ── Разгон по зафиксированному курсу ─────────────────────────── */

interface DashRun {
  dirX: number;
  dirY: number;
  speed: number;
  timer: number;
}

/**
 * Курс, скорость и остаток разгона живут РЯДОМ С СЕМЬЁЙ, а не в `AIState`.
 *
 * Трескотник держал `sprintDx`/`sprintDy`/`sprintTimer`, Дикий Мертвяк — свою
 * запись возле вида. Поле `AIState` носит каждая сущность мира, включая
 * предметы на полу; за три поля ради двух видов платили все.
 */
const _dashRun = speciesState<DashRun>(() => ({ dirX: 1, dirY: 0, speed: 0, timer: 0 }));

/** Курс берётся ОДИН раз: в этом вся семья — правки курса на ходу нет. */
export function startDashRun(e: Entity, dirX: number, dirY: number, dash: MonsterDashDef): void {
  const run = _dashRun.of(e);
  run.dirX = dirX;
  run.dirY = dirY;
  run.timer = dash.runSec ?? Infinity;
  run.speed = dash.accel !== undefined ? e.speed : dashTopSpeed(e, dash);
}

export function endDashRun(e: Entity): void {
  const run = _dashRun.peek(e);
  if (run) run.speed = 0;
}

/** Идёт ли разгон сейчас: отладка, тесты и читаемость позы. */
export function dashRunSpeed(e: Entity): number {
  return _dashRun.peek(e)?.speed ?? 0;
}

function dashTopSpeed(e: Entity, dash: MonsterDashDef): number {
  return Math.max(e.speed * (dash.speedMult ?? 1), dash.minSpeed ?? 0);
}

/**
 * Один кадр разгона: подшаги по вектору, проверка мира на каждом.
 *
 * Подшаг общий на семью. Трескотник шагал по 0.22 без трассировки вовсе, Дикий
 * Мертвяк — полным кадровым шагом без подшагов: на длинном кадре он проносился
 * сквозь тонкую стену, потому что проверял только точку приземления.
 */
export function advanceDashRun(
  world: World, e: Entity, target: Entity | null, dt: number, dash: MonsterDashDef,
): DashRunOutcome {
  const run = _dashRun.peek(e);
  if (!run || run.speed <= 0) return DashRunOutcome.IDLE;

  const top = dashTopSpeed(e, dash);
  run.speed = dash.accel === undefined ? top : Math.min(top, run.speed + e.speed * dash.accel * dt);

  let remain = run.speed * dt;
  while (remain > 0) {
    const step = Math.min(DASH_SUBSTEP, remain);
    const landed = dashTo(world, e, e.x + run.dirX * step, e.y + run.dirY * step, dash);
    if (landed !== DashStep.CLEAR) {
      run.speed = 0;
      return DashRunOutcome.CRASHED;
    }
    remain -= step;
    if (target && dashReached(world, e, target, dash)) {
      run.speed = 0;
      return DashRunOutcome.HIT;
    }
  }

  e.angle = Math.atan2(run.dirY, run.dirX);
  run.timer -= dt;
  if (run.timer <= 0) {
    run.speed = 0;
    return DashRunOutcome.SPENT;
  }
  return DashRunOutcome.MOVING;
}
