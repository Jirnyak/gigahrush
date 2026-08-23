import { MAX_DRAW, EntityType, type Entity } from '../../core/types';
import { PERCEPTION_CHANNEL_COUNT, type World } from '../../core/world';
import { WEAPON_STATS } from '../../data/catalog';
import { ENTITY_MASK_ACTOR, getEntityIndex } from '../entity_index';
import { isHostile } from '../factions';
import { hasLineOfSight } from '../../world/line_of_sight';
import { FIELD_PLANE, FIELD_VALUE_MAX, FieldChannel, fieldMacroAt } from '../fields';
import { TERRITORY_CAPTURE_VALUE_MAX, territoryCaptureTarget } from '../territory';

/**
 * Восприятие актора.
 *
 * Закон: актор решает только по тому, что читается в ЕГО клетке. Всё глобальное
 * знание доставлено полями, и снимок берёт их одним чтением байта на канал —
 * O(1), без единого обхода коллекции.
 *
 * Ровно ОДИН радиусный запрос с капом остаётся, и он отвечает на вопрос, на
 * который поле не отвечает по своей природе: «кто конкретно рядом и чей он».
 * Поле знает плотность, но не знает вражды — вражда живёт в отношениях, а не в
 * клетке. Всё остальное («где ближайшая кухня», «куда ушла стая») запрещено
 * спрашивать перебором: на это есть градиент.
 */

/**
 * Докуда актор чувствует соседа поимённо. Половина дальности отрисовки: дальше
 * силуэт всё равно не читается, а плотность оттуда донесёт поле.
 */
export const ACTOR_SENSE_RADIUS = MAX_DRAW / 2;

/**
 * Сколько соседей забирает запрос. Счёт врагов насыщается на четырёх
 * (`dangerPressure`), так что восьмёрка ближайших — уже с запасом и на своих:
 * девятый сосед не меняет ни одного решения, а стоит места в куче отбора.
 */
const ACTOR_SENSE_CAP = 8;

/** Вес актора в столкновении: здоровье, уровень и то, чем он бьёт. */
export function actorPower(e: Entity): number {
  const ws = WEAPON_STATS[e.weapon ?? ''] ?? WEAPON_STATS[''];
  const weapon = ws ? (ws.isRanged ? ws.dmg * (ws.pellets ?? 1) * 1.6 : ws.dmg) : 0;
  return Math.max(0, e.hp ?? 20) * 0.22 + weapon + Math.max(1, e.rpg?.level ?? 1) * 3;
}

export interface ActorSenses {
  /** Чей это снимок. `undefined` — снимок ещё не заполняли. */
  actor: Entity | undefined;
  /** Тварь или человек: от этого зависит, кто «свой» в поле плотности. */
  beast: boolean;
  /** Клетка под ногами (`world.idx`). */
  cell: number;
  /**
   * ТАКТИКА: значение канала в СВОЕЙ клетке, 0..1. Индекс — `FieldChannel`.
   * Это то, что решается шагом: кровь под ногами, просвет вокруг, чужой след.
   */
  field: Float32Array;
  /**
   * СТРАТЕГИЯ: то же в масштабе ячейки 16×16 стратегического яруса, 0..1.
   * Это то, ради чего идут через этаж: где вообще людно, где шумит бой.
   * Шкала общая с поклеточной — формулы драйвов ярусы не различают.
   */
  macro: Float32Array;
  /** Враги в круге восприятия и их суммарный вес. */
  hostiles: number;
  hostilePower: number;
  /** Свои в круге восприятия и их вес (свой считается вчетверо легче себя). */
  allies: number;
  allyPower: number;
  /** Ближайший враг и расстояние до него; `Infinity`, если врагов нет. */
  nearestHostile: Entity | undefined;
  nearestHostileDist: number;
  /**
   * Сколько врагов ВИДНО и кто из них ближайший.
   *
   * Разница со счётом выше не косметическая: близость и видимость — разные
   * вопросы. Страху хватает того, что читается в клетке (кровь, шум, чужой
   * запах) — бояться неувиденного законно. А драка требует ВИДЕТЬ: без этого
   * ядро объявляло противником того, кто стоит за стеной, и актор шёл в бетон.
   *
   * Линий не больше, чем соседей в запросе (потолок восемь), и считаются они на
   * такте решения, а не на кадре.
   */
  visibleHostiles: number;
  nearestVisibleHostile: Entity | undefined;
  nearestVisibleHostileDist: number;
  /**
   * Куда сместился центр своих относительно актора, в клетках. Смысл имеет
   * только при `allies > 0`.
   *
   * Хранится СМЕЩЕНИЕМ, а не точкой: мир — тор, и среднее от абсолютных
   * координат на шве даёт точку в противоположном конце этажа. Считается в том
   * же единственном запросе, что и всё остальное, — своего обхода не заводит.
   */
  allyDx: number;
  allyDy: number;
  /** Вооружён ли сам актор чем-то серьёзнее кулака. */
  armed: boolean;
  /**
   * ФРОНТ: насколько ценна ближайшая чужая земля, которую его сторону пустят
   * давить, 0..1, и сколько до неё клеток (`Infinity` — фронта рядом нет).
   *
   * Третий род дальнего чтения, рядом с полем и соседом: владение землёй
   * дискретно и полем не выражается — «чья это клетка» читается точно, а не
   * градиентом. Спрашивается той же переписью бакетов 16×16, что и всё
   * стратегическое, и только за человека со стороной: твари землю не делят.
   */
  captureValue: number;
  captureDistance: number;
}

export function createActorSenses(): ActorSenses {
  return {
    actor: undefined,
    beast: false,
    cell: -1,
    field: new Float32Array(PERCEPTION_CHANNEL_COUNT),
    macro: new Float32Array(PERCEPTION_CHANNEL_COUNT),
    hostiles: 0,
    hostilePower: 0,
    allies: 0,
    allyPower: 0,
    nearestHostile: undefined,
    nearestHostileDist: Infinity,
    visibleHostiles: 0,
    nearestVisibleHostile: undefined,
    nearestVisibleHostileDist: Infinity,
    allyDx: 0,
    allyDy: 0,
    armed: false,
    captureValue: 0,
    captureDistance: Infinity,
  };
}

/** Соседи одного запроса. Модульный буфер: в горячем пути аллокаций нет. */
const senseNeighbors: Entity[] = [];

/**
 * Заполнить снимок. Переиспользует переданный объект и его `Float32Array`:
 * ни одной аллокации на вызов.
 */
export function senseActor(world: World, e: Entity, out: ActorSenses): ActorSenses {
  out.actor = e;
  out.beast = e.type === EntityType.MONSTER;
  const cx = world.wrap(Math.floor(e.x));
  const cy = world.wrap(Math.floor(e.y));
  out.cell = world.idx(cx, cy);

  for (let ch = 0; ch < PERCEPTION_CHANNEL_COUNT; ch++) {
    out.field[ch] = world.perceptionFields[ch * FIELD_PLANE + out.cell] / FIELD_VALUE_MAX;
    out.macro[ch] = fieldMacroAt(world, ch, e.x, e.y) / FIELD_VALUE_MAX;
  }

  const ws = WEAPON_STATS[e.weapon ?? ''];
  out.armed = !!ws && (ws.dmg > 3 || ws.isRanged);

  out.hostiles = 0;
  out.hostilePower = 0;
  out.allies = 0;
  out.allyPower = actorPower(e) * 0.35;
  out.nearestHostile = undefined;
  out.nearestHostileDist = Infinity;
  out.visibleHostiles = 0;
  out.nearestVisibleHostile = undefined;
  out.nearestVisibleHostileDist = Infinity;
  out.allyDx = 0;
  out.allyDy = 0;

  // Запрос отдаёт соседей УЖЕ отсортированными по расстоянию, поэтому первый
  // же враг в списке и есть ближайший — второго прохода на минимум не нужно.
  const found = getEntityIndex().queryRadiusCapped(
    e.x, e.y, ACTOR_SENSE_RADIUS, senseNeighbors, ENTITY_MASK_ACTOR, ACTOR_SENSE_CAP,
  );
  for (let i = 0; i < found; i++) {
    const other = senseNeighbors[i];
    if (other === e || other.id === e.id || !other.alive) continue;
    if (isHostile(e, other)) {
      out.hostiles++;
      out.hostilePower += actorPower(other);
      const dist = Math.sqrt(world.dist2(e.x, e.y, other.x, other.y));
      if (out.nearestHostile === undefined) {
        out.nearestHostile = other;
        out.nearestHostileDist = dist;
      }
      if (hasLineOfSight(world, e.x, e.y, other.x, other.y, ACTOR_SENSE_RADIUS)) {
        out.visibleHostiles++;
        if (out.nearestVisibleHostile === undefined) {
          out.nearestVisibleHostile = other;
          out.nearestVisibleHostileDist = dist;
        }
      }
    } else {
      out.allies++;
      out.allyPower += actorPower(other) * 0.25;
      out.allyDx += world.delta(e.x, other.x);
      out.allyDy += world.delta(e.y, other.y);
    }
  }
  if (out.allies > 0) {
    out.allyDx /= out.allies;
    out.allyDy /= out.allies;
  }

  out.captureValue = 0;
  out.captureDistance = Infinity;
  if (!out.beast && e.faction !== undefined) {
    const front = territoryCaptureTarget(world, e);
    if (front) {
      out.captureValue = Math.min(1, front.value / TERRITORY_CAPTURE_VALUE_MAX);
      out.captureDistance = front.distance;
    }
  }
  return out;
}

/** ТАКТИКА: значение канала в своей клетке, 0..1. */
export function sensed(s: ActorSenses, ch: FieldChannel): number {
  return s.field[ch];
}

/** СТРАТЕГИЯ: то же в масштабе ячейки стратегического яруса, 0..1. */
export function sensedFar(s: ActorSenses, ch: FieldChannel): number {
  return s.macro[ch];
}
