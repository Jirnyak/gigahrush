import type { World } from '../core/world';
import { EntityType, W, type Entity } from '../core/types';
import { MONSTERS } from '../entities/monster';
import { pathBlockedAt, PATH_BLOCKER_SUBDIV } from '../core/path_blockers';
import { ENTITY_MASK_ACTOR, getEntityIndex } from './entity_index';
import { depositScent, FIELD_SCENT_DEPOSIT } from './fields';

export interface ActorOccupyOptions {
  ignoreFineBlockers?: boolean;
  ignoreCoarseSolids?: boolean;
}

export interface ActorOccupyPosition {
  x: number;
  y: number;
}

export interface ActorUnstuckOptions {
  radius?: number;
  maxCellRadius?: number;
  /** If true, rescue entities that are inside solid cells instead of leaving them for crush damage */
  rescueFromSolid?: boolean;
}

const ACTOR_UNSTUCK_OFFSETS = [
  [0.5, 0.5],
  [0.25, 0.5],
  [0.75, 0.5],
  [0.5, 0.25],
  [0.5, 0.75],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
] as const;

export function entityIgnoresFineBlockers(e: Pick<Entity, 'type' | 'monsterKind'>): boolean {
  if (e.type !== EntityType.MONSTER || e.monsterKind === undefined) return false;
  const flags = MONSTERS[e.monsterKind]?.aiFlags;
  return flags !== undefined && (flags.includes('flying') || flags.includes('noclip'));
}

export function actorOccupyRadius(e: Pick<Entity, 'type' | 'height' | 'radius' | 'monsterKind'>): number {
  if (e.radius !== undefined) return e.radius;
  if (e.type === EntityType.MONSTER && e.monsterKind !== undefined) {
    const override = MONSTERS[e.monsterKind]?.radius;
    if (override !== undefined) return override;
    return 0.18;
  }
  if (e.height !== undefined) return 0.16 * (e.height / 1.8);
  return 0.16;
}

/* Тело актёра держит дистанцию от стен, но не больше половины подклетки.
 * Причина жёсткая: маршруты печёт сетка подклеток PATH_BLOCKER_SUBDIV, и центр
 * крайней подклетки отстоит от стены ровно на эту величину. Клиренс больше —
 * и законный вейпойнт становится недостижим, актёр встаёт перед ним навсегда.
 * Настоящий размер тела (actorOccupyRadius, до 0.18 и больше у крупных) идёт
 * в расталкивание акторов, где застрять не обо что. */
const ACTOR_WALL_CLEARANCE_MAX = 0.5 / PATH_BLOCKER_SUBDIV;

/** Клетка дальнего края тела. Граница тела замкнута: касание ребра клетки —
 *  ещё не вторжение в неё, иначе центр крайней подклетки (ровно на клиренсе от
 *  стены) переставал быть занимаемым и вейпойнт становился недостижим. */
function bodyEdgeCell(v: number): number {
  const c = Math.floor(v);
  return c === v ? c - 1 : c;
}

export function canActorOccupyCoarse(world: World, x: number, y: number, radius: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (world.solid(cx, cy)) return false;
  const r = radius > ACTOR_WALL_CLEARANCE_MAX ? ACTOR_WALL_CLEARANCE_MAX : radius;
  if (!(r > 0)) return true;
  // r < 0.5, поэтому тело задевает максимум две клетки по оси: хватает углов.
  const loX = Math.floor(x - r);
  const hiX = bodyEdgeCell(x + r);
  const loY = Math.floor(y - r);
  const hiY = bodyEdgeCell(y + r);
  if (loX === cx && hiX === cx && loY === cy && hiY === cy) return true;
  return !world.solid(loX, loY) && !world.solid(hiX, loY)
    && !world.solid(loX, hiY) && !world.solid(hiX, hiY);
}

export function canActorOccupyFine(world: World, x: number, y: number, radius: number): boolean {
  // Мелкие блокеры сами живут на сетке подклеток: клиренс вокруг них съел бы
  // соседнюю подклетку целиком и запер бы актёра рядом с любой мебелью.
  void radius;
  return !pathBlockedAt(world, x, y);
}

export function canActorOccupy(
  world: World,
  x: number,
  y: number,
  radius: number,
  options: ActorOccupyOptions = {},
): boolean {
  if (!options.ignoreCoarseSolids && !canActorOccupyCoarse(world, x, y, radius)) return false;
  if (!options.ignoreFineBlockers && !canActorOccupyFine(world, x, y, radius)) return false;
  return true;
}

/* ── След актора ──────────────────────────────────────────────── */

/**
 * Клетка, в которой актору последний раз отметили след.
 *
 * Слабый ключ: запись живёт ровно столько же, сколько сама сущность, новых
 * полей в `AIState` не заводит и на сейв не влияет — след вообще не
 * сериализуется, как и остальные динамические каналы.
 */
const _trailCell = new WeakMap<Entity, number>();

/**
 * Отметить след актора в канале SCENT.
 *
 * След ставится на ВХОДЕ в новую клетку, а не по таймеру. Тогда его плотность в
 * пространстве не зависит ни от скорости актора, ни от частоты кадров: быстрый
 * и медленный оставляют одинаковую дорожку, и топчущийся на месте не выжигает
 * свою клетку до потолка.
 */
export function depositActorTrail(world: World, e: Entity): void {
  const cell = world.idx(Math.floor(e.x), Math.floor(e.y));
  if (_trailCell.get(e) === cell) return;
  _trailCell.set(e, cell);
  depositScent(world, e.x, e.y, FIELD_SCENT_DEPOSIT);
}

/* ── Общий шаг актёра ─────────────────────────────────────────── */

/** Общий на всех запрос занятия клетки: живёт ровно до двух чтений подряд. */
const _stepOccupyOpt: ActorOccupyOptions = { ignoreFineBlockers: false };

/**
 * Изотропный шаг актёра на (dx, dy).
 *
 * Сначала пробуется ПОЛНЫЙ 2D-шаг и только потом осевое скольжение. Раздельные
 * оси в начале давали несимметричный угол: X всегда коммитился первым и всегда
 * выигрывал ничью, поэтому в одинаковых по геометрии углах актёр вёл себя
 * по-разному в зависимости от того, какая ось «своя». Скольжение теперь
 * начинается с доминирующей оси — правило геометрическое, а не «сначала X».
 *
 * Возвращает true, если позиция изменилась.
 */
export function stepActorBy(world: World, e: Entity, dx: number, dy: number, radius?: number): boolean {
  if (!applyActorStep(world, e, dx, dy, radius)) return false;
  // Единственный общий путь движения актора — здесь же и единственное место,
  // где рождается след. Отдельного прохода по акторам ради запаха не нужно.
  depositActorTrail(world, e);
  return true;
}

function applyActorStep(world: World, e: Entity, dx: number, dy: number, radius?: number): boolean {
  if (dx === 0 && dy === 0) return false;
  const r = radius ?? actorOccupyRadius(e);
  const opt = _stepOccupyOpt;
  opt.ignoreFineBlockers = entityIgnoresFineBlockers(e);

  const nx = world.wrap(e.x + dx);
  const ny = world.wrap(e.y + dy);
  const freeX = canActorOccupy(world, nx, e.y, r, opt);
  if (canActorOccupy(world, nx, ny, r, opt)
    && (freeX || canActorOccupy(world, e.x, ny, r, opt))) {
    e.x = nx;
    e.y = ny;
    return true;
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0 && freeX) { e.x = nx; return true; }
    if (dy !== 0 && canActorOccupy(world, e.x, ny, r, opt)) { e.y = ny; return true; }
  } else {
    if (dy !== 0 && canActorOccupy(world, e.x, ny, r, opt)) { e.y = ny; return true; }
    if (dx !== 0 && freeX) { e.x = nx; return true; }
  }
  return false;
}

/* ── Боковой обход при упоре ──────────────────────────────────── */

/** Свой экземпляр: `applyActorStep` перепишет свой прямо внутри этого шага. */
const _sidestepOccupyOpt: ActorOccupyOptions = { ignoreFineBlockers: false };

/**
 * Полный шаг вбок вокруг препятствия, в которое актёр упёрся почти в лоб.
 *
 * Осевое скольжение в `applyActorStep` сохраняет ТАНГЕНЦИАЛЬНУЮ составляющую, и
 * это верная физика: вдоль стены нельзя идти быстрее, чем идёшь. Но у
 * упёршегося в лоб тангенциальной составляющей почти нет — он ползёт вдоль
 * свободной оси со скоростью, стремящейся к нулю. Маршрут при этом честный, ноги
 * шевелятся, продвижения нет: это и есть замеренные 20% окон без продвижения у
 * монстров, в 80% которых маршрут живой.
 *
 * Сторона выбирается пробой НА КЛЕТКУ вперёд, а не на длину шага: шаг короче
 * подклетки, по нему тупик от прохода не отличить. Из двух свободных сторон
 * решает чётность id, и это не жребий за неимением лучшего: сторона обязана
 * держаться кадр за кадром, иначе актёр дрожит на месте вместо того, чтобы идти
 * ВДОЛЬ препятствия. Подсказка от маршрута («обходи туда, куда лежит следующий
 * вейпойнт») ПРОВЕРЕНА И ОТВЕРГНУТА замером: вейпойнт стоит за препятствием
 * почти по курсу, знак у проекции околонулевой и скачет — застревание монстров
 * 23.0% → 24.1%, залипших насмерть 8.3% → 10.6%, трёпка маршрутов втрое.
 * Своего состояния обход не заводит.
 */
export function sidestepActor(
  world: World,
  e: Entity,
  dirX: number,
  dirY: number,
  step: number,
  radius?: number,
): boolean {
  if (!(step > 0)) return false;
  const r = radius ?? actorOccupyRadius(e);
  const opt = _sidestepOccupyOpt;
  opt.ignoreFineBlockers = entityIgnoresFineBlockers(e);
  const px = -dirY;
  const py = dirX;
  const first = (e.id & 1) === 0 ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? first : -first;
    const probeX = world.wrap(e.x + px * s);
    const probeY = world.wrap(e.y + py * s);
    if (!canActorOccupy(world, probeX, probeY, r, opt)) continue;
    if (stepActorBy(world, e, px * s * step, py * s * step, r)) return true;
  }
  return false;
}

/* ── Расталкивание акторов ────────────────────────────────────── */

/** Сколько ближайших соседей участвует в расталкивании. Capped-запрос уже
 *  отдаёт их отсортированными по расстоянию, дальние не меняют картину. */
const SEPARATION_NEIGHBOR_CAP = 4;
/** Доля обычного шага, которую актёр тратит на расталкивание за кадр. */
const SEPARATION_SPEED_FRAC = 0.5;
/** Скорость расталкивания для тех, у кого своей скорости нет (speed = 0). */
const SEPARATION_FALLBACK_SPEED = 1;

const _separationNeighbors: Entity[] = [];
const _separationPush = { x: 0, y: 0 };

/**
 * Нормированный вектор «прочь от налезших соседей», или false, если никто не
 * налез. Один capped-запрос по общей броадфазе, ноль аллокаций в кадре,
 * никакой физики: перекрытие тел даёт направление, глубина — вес.
 */
function actorSeparationPush(world: World, e: Entity): boolean {
  const r = actorOccupyRadius(e);
  const reach = r * 2;
  const found = getEntityIndex().queryRadiusCapped(
    e.x, e.y, reach, _separationNeighbors, ENTITY_MASK_ACTOR, SEPARATION_NEIGHBOR_CAP + 1,
  );
  let px = 0;
  let py = 0;
  for (let i = 0; i < found; i++) {
    const other = _separationNeighbors[i];
    if (other === e || other.id === e.id || !other.alive) continue;
    const want = r + actorOccupyRadius(other);
    const dx = world.delta(other.x, e.x);
    const dy = world.delta(other.y, e.y);
    const d2 = dx * dx + dy * dy;
    if (d2 >= want * want) continue;
    if (d2 < 1e-8) {
      // Сложились в одну точку: детерминированный разворот по id, иначе пара
      // так и останется слипшейся — направления «прочь» у неё нет.
      const a = e.id * 2.3999632297;
      px += Math.cos(a);
      py += Math.sin(a);
      continue;
    }
    const d = Math.sqrt(d2);
    const weight = (want - d) / want;
    px += (dx / d) * weight;
    py += (dy / d) * weight;
  }
  if (px === 0 && py === 0) return false;
  const len = Math.sqrt(px * px + py * py);
  _separationPush.x = px / len;
  _separationPush.y = py / len;
  return true;
}

/**
 * Развести актёра с налезшими соседями. Срабатывает только при реальном
 * перекрытии тел, поэтому вызывать можно и у стоящего: без толкучки это один
 * дешёвый запрос по броадфазе и выход.
 */
export function applyActorSeparation(world: World, e: Entity, dt: number): boolean {
  if (!actorSeparationPush(world, e)) return false;
  const speed = e.speed > 0 ? e.speed : SEPARATION_FALLBACK_SPEED;
  const step = Math.min(actorOccupyRadius(e), speed * SEPARATION_SPEED_FRAC * dt);
  if (!(step > 0)) return false;
  return stepActorBy(world, e, _separationPush.x * step, _separationPush.y * step);
}

export function findNearestActorOccupyPosition(
  world: World,
  x: number,
  y: number,
  radius: number,
  maxCellRadius = 6,
  options: ActorOccupyOptions = {},
): ActorOccupyPosition | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (canActorOccupy(world, x, y, radius, options)) return { x: world.wrap(x), y: world.wrap(y) };

  const baseX = Math.floor(x);
  const baseY = Math.floor(y);
  const maxR = Math.max(0, Math.min(W >> 1, Math.floor(maxCellRadius)));

  for (let r = 0; r <= maxR; r++) {
    let best: ActorOccupyPosition | null = null;
    let bestD2 = Infinity;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const cellX = world.wrap(baseX + dx);
        const cellY = world.wrap(baseY + dy);
        for (const [ox, oy] of ACTOR_UNSTUCK_OFFSETS) {
          const px = cellX + ox;
          const py = cellY + oy;
          if (!canActorOccupy(world, px, py, radius, options)) continue;
          const d2 = world.dist2(x, y, px, py);
          if (d2 >= bestD2) continue;
          bestD2 = d2;
          best = { x: px, y: py };
        }
      }
    }

    if (best) return best;
  }

  return null;
}

export function unstuckActorFromBlockers(
  world: World,
  e: Entity,
  options: ActorUnstuckOptions = {},
): boolean {
  // If the entity is directly inside a solid block and rescue is not requested,
  // do not unstuck so it takes crush damage (samosbor).  AI entities pass
  // rescueFromSolid=true to be extracted from accidental wall positions.
  if (world.solid(Math.floor(e.x), Math.floor(e.y)) && !options.rescueFromSolid) return false;

  const radius = options.radius ?? actorOccupyRadius(e);
  const ignoreFineBlockers = entityIgnoresFineBlockers(e);
  if (canActorOccupy(world, e.x, e.y, radius, { ignoreFineBlockers })) return false;

  const pos = findNearestActorOccupyPosition(world, e.x, e.y, radius, options.maxCellRadius, { ignoreFineBlockers });
  if (!pos) return false;

  e.x = pos.x;
  e.y = pos.y;
  return true;
}
