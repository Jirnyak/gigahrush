import { AIGoal, type Entity } from '../../core/types';
import { World } from '../../core/world';
import { ENTITY_MASK_MONSTER, getEntityIndex } from '../entity_index';
import {
  FieldChannel, FIELD_TICK_SECONDS, FIELD_VALUE_MAX,
  fieldCellX, fieldCellY, fieldMacroTargetCell,
} from '../fields';
import { fieldFade } from '../fields/channels';
import { isCarnivoreMonster, monsterPackShape } from '../../data/monster_ecology';
import { tryAssignPathToCell } from './pathfinding';
import { speciesState } from './species_state';

export type LocalTargetSharePredicate<TContext = undefined> = (
  candidate: Entity,
  actor: Entity,
  target: Entity,
  context: TContext,
) => boolean;

export interface LocalTargetShareOptions<TContext = undefined> {
  radius: number;
  cap: number;
  scratch: Entity[];
  typeMask?: number;
  context: TContext;
  predicate?: LocalTargetSharePredicate<TContext>;
}

export function shareLocalTarget<TContext = undefined>(
  actor: Entity,
  target: Entity,
  options: LocalTargetShareOptions<TContext>,
): number {
  getEntityIndex().queryRadiusCapped(
    actor.x,
    actor.y,
    options.radius,
    options.scratch,
    options.typeMask ?? ENTITY_MASK_MONSTER,
    options.cap,
  );

  let shared = 0;
  for (const candidate of options.scratch) {
    if (candidate.id === actor.id || !candidate.alive || !candidate.ai) continue;
    if (options.predicate && !options.predicate(candidate, actor, target, options.context)) continue;
    candidate.ai.combatTargetId = target.id;
    candidate.ai.goal = AIGoal.HUNT;
    candidate.ai.timer = Math.min(candidate.ai.timer, 0.1);
    shared++;
  }
  return shared;
}

/* ── Драйвы блуждания: стая, охота на скопление, сытость ────────────────────
 *
 * Закон владельца: драйв — это пара «поле + знак». Охота — ВВЕРХ по плотности
 * добычи, кочевье — ВНИЗ по плотности своих. Дальнее знание несёт
 * СТРАТЕГИЧЕСКИЙ ярус полей: ни один драйв не перебирает коллекцию сущностей,
 * чтобы узнать то, что уже написано под ногами.
 *
 * Ближний сбор стаи — единственное исключение, и оно объяснено у себя на месте.
 * Всё это считается на пересборке пути, а не в кадре.
 */

/**
 * Сколько тварь переваривает добычу. Ровно столько же живёт след её смерти в
 * канале опасности: наевшийся уходит с места кормёжки не раньше, чем оттуда
 * выветрится запах, ради которого он пришёл. Отдельной ручки для этого не надо.
 */
export const MONSTER_SATED_SEC = FIELD_VALUE_MAX / fieldFade(FieldChannel.DANGER) * FIELD_TICK_SECONDS;

interface MonsterFeeding {
  /** Время симуляции, до которого особь сыта. */
  fullUntil: number;
}
const feeding = speciesState<MonsterFeeding>(() => ({ fullUntil: 0 }));

/** Наелась: охоту гасим, добычу не ищем, чужого не преследуем. */
export function feedMonster(e: Entity, time: number): void {
  feeding.of(e).fullUntil = time + MONSTER_SATED_SEC;
}

export function isMonsterSated(e: Entity, time: number): boolean {
  const state = feeding.peek(e);
  return state !== undefined && state.fullUntil > time;
}

/** Только для тестов и пересборки этажа: забыть сытость особи. */
export function forgetMonsterFeeding(e: Entity): void {
  feeding.forget(e);
}

/**
 * Пойти по СТРАТЕГИЧЕСКОМУ ярусу: вверх (`sign > 0`) или вниз по каналу.
 *
 * Поклеточный ярус для этого не годится и это не тюнинг, а разрядность: доля
 * соседа от малого значения округляется в байте до нуля, и градиент рвётся на
 * второй-третьей клетке. Замерено на насыщенном источнике: 0:255 1:59 2:1 3:0 —
 * дальше нули при любой толпе и любом времени. Ярус 16×16 держит склон через
 * весь этаж, и `fieldMacroTargetCell` отдаёт ДАЛЁКУЮ клетку-цель, до которой
 * дорогу прокладывает обычный поиск пути.
 *
 * Приняли только по-настоящему новый путь: `same` значит «уже стою здесь».
 */
function driveByMacro(world: World, e: Entity, ch: FieldChannel, sign: number): boolean {
  const cell = fieldMacroTargetCell(world, ch, e.x, e.y, sign);
  if (cell < 0) return false; // склона нет — драйв обязан честно промолчать
  return tryAssignPathToCell(world, e, fieldCellX(cell), fieldCellY(cell)) === 'assigned';
}

const kinQuery: Entity[] = [];

/**
 * Стянуться к своим.
 *
 * Здесь поле НЕ работает, и это не лень, а свойство канала: монстр сам льёт в
 * BEASTS в своей клетке, поэтому одиночка всегда стоит на СОБСТВЕННОМ пике, и
 * его же растёкшийся след глушит сигнал сородичей за пару клеток. Вычесть себя
 * из общей байтовой плоскости нельзя. Плотность СВОИХ — знание местное, и берут
 * его тем же ограниченным радиусным запросом, которым в этом файле уже живут
 * дележ цели и вой стаи. Поле остаётся там, где своего сигнала нет: добыча.
 *
 * Потолок выборки — объявленный размер стаи вида, радиус — её же разброс,
 * удвоенный: дальше это уже не моя пачка. Ни одного полного перебора.
 */
function tryPackCohesion(world: World, e: Entity, spread: number, cap: number): boolean {
  const count = getEntityIndex().queryRadiusCapped(
    e.x, e.y, spread * 2, kinQuery, ENTITY_MASK_MONSTER, cap,
  );
  let sumX = 0;
  let sumY = 0;
  let kin = 0;
  for (let i = 0; i < count; i++) {
    const other = kinQuery[i];
    if (other.id === e.id || !other.alive || other.monsterKind !== e.monsterKind) continue;
    // Центр считаем в системе координат самой особи: на торе среднее сырых
    // координат разъезжается по шву и утаскивает стаю на пол-мира.
    sumX += world.delta(e.x, other.x);
    sumY += world.delta(e.y, other.y);
    kin++;
  }
  if (kin === 0) return false;
  const offX = sumX / kin;
  const offY = sumY / kin;
  if (offX * offX + offY * offY <= spread * spread) return false; // и так в куче
  const tx = world.wrap(Math.floor(e.x + offX));
  const ty = world.wrap(Math.floor(e.y + offY));
  return tryAssignPathToCell(world, e, tx, ty) === 'assigned';
}

/**
 * Куда идёт тварь, у которой нет цели. Возвращает `true`, если путь назначен —
 * тогда режим блуждания вида уже не нужен.
 *
 * Порядок давлений: сначала не отбиться от своих, потом искать, чем кормиться.
 * Сытый не ищет никого: он ушёл переваривать, и прохожий ему не интересен.
 */
export function monsterWanderDrive(world: World, e: Entity, time: number): boolean {
  const shape = monsterPackShape(e.monsterKind);

  // 1. Стая держится вместе. Ближний сбор — местное знание: ячейка яруса это
  //    16×16 клеток, внутри неё склона нет, а пачка живёт на разбросе 5..10.
  //    Дальний сбор по BEASTS ярус тянет сам, если своих рядом не осталось.
  if (shape.size[1] > 1 && shape.spread > 0 &&
      tryPackCohesion(world, e, shape.spread, shape.size[1])) {
    return true;
  }

  // 2. Охота на скопление: ВВЕРХ по плотности людей через весь этаж. Это и
  //    есть «нападают на базы и скопления» — без понятия «осада» и без сканов.
  //    Сытый не идёт никуда: он ушёл переваривать.
  if (isCarnivoreMonster(e.monsterKind) && !isMonsterSated(e, time) &&
      driveByMacro(world, e, FieldChannel.PEOPLE, 1)) {
    return true;
  }

  // 3. Кочевник уходит ВНИЗ по плотности своих: пик, на котором он стоит, —
  //    это он сам и его сородичи, и спуск с него разгоняет вид по этажу.
  //    Осёдлым видам этот драйв не положен, их держит дом.
  if (shape.mode === 'roamer' && driveByMacro(world, e, FieldChannel.BEASTS, -1)) {
    return true;
  }

  return false;
}
