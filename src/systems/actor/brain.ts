import type { Entity } from '../../core/types';
import { roomAffordanceWeight } from '../../data/room_affordances';
import { factionToTerritoryOwner } from '../../data/factions';
import { territoryRoomOwner } from '../territory';
import {
  getRoomMemory, getRoomMemoryCount, roomMemoryIsHelpful, roomMemoryIsHostile,
  roomMemoryRevealsStash,
} from '../room_memory';
import {
  npcUtilityIdentityFromEntity, npcUtilityRoomCapacity, scoreNpcUtilityTargetPreference,
  type NpcUtilityRoomMemorySnapshot, type NpcUtilityTargetCandidate,
  type NpcUtilityTargetPreferenceContext,
} from '../ai/npc_utility';
import { roomIdsAroundInto } from '../../world/room_index';
import { crowdRoomTotal } from '../../world/crowd_index';
import { noteRoomVisit, roomVisitNovelty } from '../room_visits';
import type { World } from '../../core/world';
import {
  fieldAt, fieldCellX, fieldCellY, fieldGradientStep, fieldMacroTargetCell,
  FieldChannel, FIELD_TICK_SECONDS, FIELD_VALUE_MAX,
} from '../fields';
import { actorOccupyRadius, canActorOccupy, stepActorBy } from '../movement_collision';
import { followPath, roomTargetCell, tryAssignPathToCell, wanderInRoom } from '../ai/pathfinding';
import { speciesState } from '../ai/species_state';
import { STORE_ACTION_BASE_SEC } from '../npc_work';
import { clearCombatThreat } from '../combat_stimulus';
import {
  DRIVES,
  DRIVE_BY_ID,
  driveActorKind,
  scoreDrive,
  type DriveDef,
  type DriveId,
  type DriveView,
} from './drives';
import { createActorNeeds, readActorNeeds } from './needs';
import { createActorClock, readActorClock } from './clock';
import { createActorSenses, senseActor } from './senses';
import type { GameClock, GameState } from '../../core/types';

/**
 * Ядро актора: один цикл на человека, тварь и игрока.
 *
 *   восприятие → счёт ВСЕХ драйвов → максимум с гистерезисом → исполнение
 *
 * Ни FSM, ни дерева поведения: победитель это просто максимум счёта, а держит
 * его гистерезис, а не граф переходов. Разница между видами живёт целиком в
 * таблице весов (`drives.ts`) — здесь нет ни одной развилки по фракции, типу
 * сущности или сюжету, и заводить их нельзя.
 *
 * Каданс решения — своя пауза у каждого, расфазированная от `id`. Пауза НЕ
 * зависит от расстояния до игрока: актор на другом конце этажа думает ровно
 * так же часто, как тот, на кого смотрят. Исполнение идёт каждый кадр.
 */

/**
 * Границы паузы решения. Выведены из такта самих полей: думать чаще, чем поле
 * успевает измениться, бессмысленно — под ногами будет тот же байт. Три такта
 * снизу, восемь сверху, то есть 1.5..4 с.
 */
const DECIDE_MIN_TICKS = 3;
const DECIDE_SPAN_TICKS = 5;

/**
 * Гистерезис: насколько дороже стоит начатое дело. Претендент обязан перебить
 * действующий драйв с этой надбавкой, иначе актор не дёргается.
 */
const INCUMBENT_BONUS = 0.25;

/**
 * Порог, ниже которого драйв не берёт актора себе вовсе. Слабая тяга — это не
 * повод отменять то, что актор делал без нас: ядро тогда честно уступает ход
 * прежнему слою и не притворяется, будто у него есть решение.
 */
const CLAIM_FLOOR = 0.15;

interface BrainState {
  drive: DriveId | undefined;
  score: number;
  /** Время следующего пересчёта счёта. */
  decideAt: number;
  /** До этого времени выбор держится, даже если счёт просел. */
  holdUntil: number;
  /** Клетка, в которой последний раз щупали градиент (тактика). */
  probedCell: number;
  /** Единичное направление шага; `has` — нашёлся ли вообще склон. */
  dirX: number;
  dirY: number;
  hasDir: boolean;
  /** Ядро проложило маршрут и ведёт по нему (стратегия). */
  routing: boolean;
  /** Кого ядро назначило противником (ярус `actor`). Берётся на РЕШЕНИИ. */
  targetId: number | undefined;
  /** Дошли до цели, и дело делается стоянием на ней (`holdsTarget`). */
  arrived: boolean;
  /** Время следующего такта дела на месте (`onArrived`) и пересмотра наряда. */
  deedAt: number;
  /** Откуда драйв взял актора: отсюда меряется его предел хода. */
  anchorX: number;
  anchorY: number;
}

const brains = speciesState<BrainState>(() => ({
  drive: undefined,
  score: 0,
  decideAt: -Infinity,
  holdUntil: -Infinity,
  probedCell: -1,
  dirX: 0,
  dirY: 0,
  hasDir: false,
  routing: false,
  targetId: undefined,
  arrived: false,
  deedAt: -Infinity,
  anchorX: 0,
  anchorY: 0,
}));

const senses = createActorSenses();
const needs = createActorNeeds();
/* Часы ОБЩИЕ на кадр: время у всех одно. Снимок переписывается один раз в
 * точке входа, а не на каждого актора, — см. `setActorCoreContext`. */
const clock = createActorClock();
const view: DriveView = { senses, needs, clock };

/** Расфазировка от `id`: соседние номера расходятся по всей паузе. */
function idUnit(e: Entity): number {
  let x = (e.id ^ 0x9e3779b9) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  return (x >>> 8) / 0x01000000;
}

function decideInterval(e: Entity): number {
  return FIELD_TICK_SECONDS * (DECIDE_MIN_TICKS + idUnit(e) * DECIDE_SPAN_TICKS);
}

/**
 * Пересчитать все драйвы и выбрать победителя.
 *
 * Единственное место, где ядро обращается к миру: один снимок полей под ногами
 * и один радиусный запрос с капом внутри `senseActor`. Дальше — только
 * арифметика по снимку.
 */
function decide(world: World, e: Entity, st: BrainState, now: number): void {
  senseActor(world, e, senses);
  readActorNeeds(e, needs);
  const kind = driveActorKind(e, senses.beast);

  let bestId: DriveId | undefined;
  let bestScore = 0;
  for (let i = 0; i < DRIVES.length; i++) {
    const def = DRIVES[i];
    let score = scoreDrive(def, view, kind);
    if (score <= 0) continue;
    if (def.id === st.drive) score *= 1 + INCUMBENT_BONUS;
    if (score > bestScore) {
      bestScore = score;
      bestId = def.id;
    }
  }

  if (bestScore < CLAIM_FLOOR) bestId = undefined;
  // Пока держится начатое дело, чужой драйв обязан перебить его вместе с
  // надбавкой. Само дело при этом вправе выдохнуться и уйти в никуда.
  if (bestId !== st.drive && st.drive !== undefined && now < st.holdUntil) return;

  if (bestId !== st.drive) {
    releaseDrive(e, st);
    st.drive = bestId;
    // Якорь ставится в момент захвата: предел хода меряется отсюда, а не от
    // места, где актор случайно оказался посреди дела.
    st.anchorX = e.x;
    st.anchorY = e.y;
    st.holdUntil = bestId === undefined ? -Infinity : now + DRIVE_BY_ID[bestId].holdSec;
  }
  st.score = bestScore;

  /* Курс в обход поля берётся ЗДЕСЬ, пока снимок принадлежит этому актору, и
   * держится до следующего решения. Обновлять его чаще нечем: сам снимок между
   * решениями не меняется. */
  const winner = bestId === undefined ? undefined : DRIVE_BY_ID[bestId];
  if (winner?.heading) {
    st.hasDir = winner.heading(view, headingOut);
    st.dirX = headingOut.x;
    st.dirY = headingOut.y;
  }
  /* Противник берётся ЗДЕСЬ по той же причине, что и курс: снимок восприятия —
   * общий модульный объект, и прочитать его на исполнении значит прочитать
   * чужие глаза. */
  st.targetId = winner?.tier === 'actor' ? senses.nearestVisibleHostile?.id : undefined;

  /* Разрыв контакта. Если победил не бой, а актор с кем-то дрался, драка
   * бросается ЗДЕСЬ — и вместе с боевой памятью: без этого `forcedTarget`
   * вернёт его в ту же драку следующим кадром, и «испугался» не случится
   * никогда. Это и есть весь смысл переезда решения в ядро: страх и драка
   * теперь спорят одним счётом, а не двумя системами.
   */
  const ai = e.ai;
  if (ai?.combatTargetId !== undefined && winner?.tier !== 'actor') {
    ai.combatTargetId = undefined;
    clearCombatThreat(e);
  }
}

/** Куда драйв просит идти, когда поле ответить не может. Модульный, без аллокаций. */
const headingOut = { x: 0, y: 0 };

/** Этаж активного прогона: ключ коммунальной памяти комнат. Подсовывается раз
 *  за кадр из точки входа — тот же приём, что у пути, боя и социального графа. */
let _coreZ: number | undefined;
/** Состояние прогона: нужно делу смены (аудит сделок, свидетели кражи). */
let _coreState: GameState | undefined;

export function setActorCoreContext(
  currentZ: number | undefined,
  gameClock?: GameClock,
  samosborActive = false,
  state?: GameState,
): void {
  _coreZ = currentZ;
  _coreState = state;
  // Часы читаются ОДИН раз за кадр: время у всех одно, и снимок общий.
  readActorClock(gameClock, samosborActive, clock);
}

/**
 * Отпустить актора. Проложенный ядром маршрут обязан умереть вместе с делом:
 * иначе прежний слой унаследует чужую цель и пойдёт по ней со своими мотивами.
 */
function releaseDrive(e: Entity, st: BrainState): void {
  st.probedCell = -1;
  st.hasDir = false;
  st.arrived = false;
  st.deedAt = -Infinity;
  if (st.routing && e.ai) {
    e.ai.path.length = 0;
    e.ai.pi = 0;
  }
  st.routing = false;
}

/**
 * Пощупать склон канала под ногами. Восемь соседей, ни одной аллокации,
 * никакого BFS: `fieldGradientStep` возвращает клетку, куда ведёт градиент.
 *
 * Цель — ЦЕНТР соседней клетки, а не сама клетка, поэтому направление выходит
 * непрерывным, а не квантованным по восьми румбам: актор стоит в дробной точке
 * своей клетки, и вектор до центра соседней зависит от того, где именно он стоит.
 *
 * Если склона нет, ход НЕ бросается сразу: сначала пробуем идти прежним курсом,
 * пока впереди вообще есть сигнал. Без этого следопыт травит собственный след —
 * он метит клетку, в которую вошёл, его свежая метка перебивает старые впереди,
 * и он встаёт на им же насыпанном пике, не пройдя и клетки. Замерено: след
 * 92,107,122,…, актор входит во вторую клетку, та становится 124, и обе соседние
 * оказываются ниже. Пространственный гистерезис — та же мысль, что и временной:
 * начатое дело не переспрашивают на каждом шагу.
 */
function probe(world: World, e: Entity, def: DriveDef, st: BrainState): void {
  /* Курс в обход поля считается на РЕШЕНИИ, а не здесь: он выводится из снимка
   * восприятия, а снимок — общий на всех модульный объект, который переписывает
   * каждый решающий актор. Прочитать его позже значит прочитать чужие глаза. */
  if (def.heading) return;
  const cell = fieldGradientStep(world, def.field, e.x, e.y, def.sign);
  if (cell >= 0) {
    const tx = fieldCellX(cell) + 0.5;
    const ty = fieldCellY(cell) + 0.5;
    const dx = world.delta(e.x, tx);
    const dy = world.delta(e.y, ty);
    const len = Math.sqrt(dx * dx + dy * dy);
    // Склон знает только про `world.solid`, а телу нужен ещё и радиус: широкая
    // тварь видит проход, в который не пролезает. Спрашиваем тело сразу.
    if (len > 0.0001 && canActorOccupy(world, tx, ty, actorOccupyRadius(e))) {
      st.dirX = dx / len;
      st.dirY = dy / len;
      st.hasDir = true;
      return;
    }
  }
  // Курса нет вовсе — держать нечего.
  if (!st.hasDir) return;
  // Пустая клетка впереди значит, что сигнал кончился: и подниматься больше
  // некуда, и убегать уже не от чего. Это конец дела, а не заминка.
  const ax = e.x + st.dirX;
  const ay = e.y + st.dirY;
  if (world.solid(ax, ay) || fieldAt(world, def.field, ax, ay) <= 0) st.hasDir = false;
}

/** Бросить дело до следующего решения, вернув ход прежнему слою. */
function dropDrive(e: Entity, st: BrainState): void {
  releaseDrive(e, st);
  st.drive = undefined;
  st.holdUntil = -Infinity;
}

/**
 * СТРАТЕГИЯ: цель за горизонтом.
 *
 * Ярус отдаёт не соседнюю клетку, а клетку мира как ЦЕЛЬ, и дорогу до неё
 * кладёт обычный поиск пути. Маршрут строится один раз на дело, а не на кадр:
 * пока идём — просто идём. Дошли — на следующем решении ярус спросят заново, и
 * цель сама сместится, если толпа за это время ушла.
 *
 * Маршрут принадлежит ядру, и `ai.path` тут — общая с прежним слоем витрина,
 * а не его собственность: точка входа в `ai/index.ts` пускает ядро дальше
 * ровно потому, что видит здесь наш маршрут (`actorBrainOwnsRoute`).
 */
function followRoute(
  world: World, e: Entity, def: DriveDef, st: BrainState, dt: number,
): boolean {
  const ai = e.ai;
  if (!ai) return false;

  if (!st.routing || ai.path.length === 0) {
    /* Цель либо со склона стратегического яруса, либо от собственного
     * поставщика драйва: владение землёй полем не выражается. */
    const cell = def.routeTarget
      ? def.routeTarget(world, e)
      : fieldMacroTargetCell(world, def.field, e.x, e.y, def.sign);
    // Ни склона, ни цели — драйв обязан честно промолчать.
    if (cell < 0) {
      dropDrive(e, st);
      return false;
    }
    /* Годится ТОЛЬКО «назначено». `same` значит «цель та же или я уже в ней» —
     * принимать его за успех нельзя: маршрута от этого не появится, а драйв
     * будет заказывать его каждый кадр. У фронта монстров ровно этот приём
     * поднял пересборку пути с 0.43 до 8.96 в секунду. */
    if (tryAssignPathToCell(world, e, fieldCellX(cell) + 0.5, fieldCellY(cell) + 0.5) !== 'assigned') {
      /* ...кроме тех дел, которые делаются стоянием на цели. Для них «я уже в
       * ней» — это ПРИХОД, а не отказ: маршрута больше не надо, надо стоять.
       * Пересчитают цель на следующем решении, а не на следующем кадре. */
      if (def.holdsTarget) {
        st.routing = false;
        st.arrived = true;
        return true;
      }
      dropDrive(e, st);
      return false;
    }
    st.routing = true;
    st.arrived = false;
  }

  followPath(world, e, dt);
  return true;
}

/** Сырая выборка индекса комнат: надмножество круга, фильтруется на месте. */
const roomScratch: number[] = [];
/* Кандидат и запрос — модульные: в горячем пути аллокаций быть не должно. */
const roomCandidate: NpcUtilityTargetCandidate = { id: 0 };
const roomPreference: NpcUtilityTargetPreferenceContext = {
  intent: 'wander', // намерений тела у прежнего слоя больше нет; ведёт `affordance`
  stableJitter: 2,
  distanceScale: 96,
};

/**
 * НАЗНАЧЕНИЕ: закрыть нужду там, где её умеют закрывать.
 *
 * Порядок обязателен и в нём вся суть:
 *
 *  1. То, что уже в руках. Носить консерву и идти за едой через этаж — дыра,
 *     а не характер, и закрывается она здесь, до всякой дороги.
 *  2. Комната, в которой стоим, если она умеет нужное. Тогда просто стоим:
 *     восстановление считает `systems/needs.ts`, ядру довольно не мешать.
 *  3. Ближайшая годная комната в радиусе `reach` — через индекс комнат, а не
 *     обходом всех комнат этажа (на квартирах их 13873).
 */
function workRoom(
  world: World, e: Entity, def: DriveDef, st: BrainState, dt: number, now: number,
): boolean {
  if (def.satisfyCarried?.(world, e, now)) {
    // Съели — нужда просела, пусть следующее решение выберет заново.
    dropDrive(e, st);
    return true;
  }

  const affordance = def.affordance;
  if (affordance === undefined) return false;

  const here = world.roomAt(e.x, e.y);
  // Где человек был — свойство человека, и кольцо у обоих слоёв одно: иначе
  // новизна у ядра и у распорядка расходилась бы и они водили бы разных людей.
  noteRoomVisit(e, here?.id);

  const hereSuits = !!here && roomAffordanceWeight(here.type, affordance) > 0;

  if (st.routing && e.ai) {
    if (e.ai.path.length > 0) {
      followPath(world, e, dt);
      return true;
    }
    st.routing = false;
    /* Наряд ведёт в комнату, которая нужного уметь НЕ обязана (кухне везут
     * хлеб), поэтому конец дороги — это приход, а не совпадение назначения. */
    if (def.roomTarget) st.arrived = true;
    else if (!hereSuits) {
      /* Дорога кончилась, а место не то. Перевыбирать цель В КАДРЕ нельзя:
       * тогда драйв заказывает один и тот же маршрут каждый кадр — замерено,
       * назначения пути 0.55 → 0.89/с, худший актор 25/с. Дело откладывается
       * до следующего решения, как и всякая неудача. */
      dropDrive(e, st);
      return false;
    }
  }

  if (st.arrived || hereSuits) {
    // Пришли. Отметка занятия обязательна: по ней восстановление нужд отличает
    // «лёг спать» от «стоит в комнате с кроватью», и по ней же актора читают
    // речь и анимации.
    if (def.arrivedState !== undefined && e.ai) e.ai.npcState = def.arrivedState;
    if (def.onArrived === undefined) return true;
    /* Дело на месте идёт своим тактом, а не каждый кадр: внутри него сделки с
     * ящиками и уборка, и переспрашивать их шестьдесят раз в секунду незачем.
     * На том же такте пересматривается и наряд — он стоит перебора ящиков в
     * радиусе, и в кадр его пускать нельзя. */
    if (now < st.deedAt) return true;
    st.deedAt = now + (def.roamSec ?? DEED_INTERVAL_SEC);
    const errand = def.roomTarget ? def.roomTarget(world, e, now) : -1;
    if (errand >= 0) {
      // Наряд бьёт «здесь и так сойдёт»: если делу нужен другой адрес — идём.
      if (errand !== here?.id) return routeToRoom(world, e, st, errand, dt);
    } else if (def.roamSec !== undefined) {
      /* Дело ДОРОГИ на приходе не кончается: дойдя, роумер выбирает следующую
       * комнату. Без этого весь этаж осел бы в первых же годных залах — а
       * развилка внутри `roomTarget` сторожит ровно от этого и работала бы
       * ровно один раз на человека. */
      const next = nearestAffordingRoom(world, e, def, def.reach);
      if (next >= 0 && next !== here?.id) return routeToRoom(world, e, st, next, dt);
    }
    def.onArrived(world, e, now, _coreState);
    /* Дело делается НЕ СТОЯ. Работник ходит по своей комнате — это и жизнь в
     * кадре, и то, чем прежний слой закрывал ту же смену. Маршрут забирается
     * ядру: чужой маршрут закрыл бы шлюз входа и отдал бы актора прежнему
     * слою на следующем же кадре. */
    if (e.ai && e.ai.path.length === 0) {
      wanderInRoom(world, e);
      if (e.ai.path.length > 0) st.routing = true;
    }
    return true;
  }

  const errand = def.roomTarget ? def.roomTarget(world, e, now) : -1;
  const target = errand >= 0 ? errand : nearestAffordingRoom(world, e, def, def.reach);
  if (target < 0) {
    dropDrive(e, st);
    return false;
  }
  return routeToRoom(world, e, st, target, dt);
}

/**
 * Пауза дела на месте. Взята у складской сделки прежнего слоя: на этом же такте
 * там жила и своя присыпка от личности, и ускорять его нечем — сделка с ящиком
 * не становится осмысленнее от того, что её пробуют чаще.
 */
const DEED_INTERVAL_SEC = STORE_ACTION_BASE_SEC;

/** Проложить маршрут к комнате. Не назначилось — дело откладывается до решения. */
function routeToRoom(
  world: World, e: Entity, st: BrainState, roomId: number, dt: number,
): boolean {
  const room = world.rooms[roomId];
  if (!room) {
    dropDrive(e, st);
    return false;
  }
  const cell = roomTargetCell(world, e, room);
  const status = tryAssignPathToCell(world, e, cell.x, cell.y);
  if (status === 'not_found') {
    dropDrive(e, st);
    return false;
  }
  if (status === 'same') {
    /* Цель — клетка, в которой уже стоим. Для дела, которое делается НА МЕСТЕ,
     * это ПРИХОД, а не отказ: маршрута больше не надо, надо стоять и делать.
     * Тот же приём и по той же причине, что у яруса `route` с `holdsTarget`. */
    st.routing = false;
    st.arrived = true;
    return true;
  }
  st.routing = true;
  st.arrived = false;
  followPath(world, e, dt);
  return true;
}

/**
 * Ближайшая ГОДНАЯ комната.
 *
 * Индекс комнат отдаёт надмножество квадрата бакетов вокруг радиуса — ни одного
 * обхода всех комнат этажа (на квартирах их 13873). Оценка берётся у прежнего
 * слоя целиком: `scoreNpcUtilityTargetPreference` — сильнейший кусок того кода
 * и чистая функция, и переписывать её вторым экземпляром было бы ровно тем
 * дублированием, ради ухода от которого всё и затевалось.
 *
 * Каналы, которые она приносит и которых у наивного «вес минус расстояние» не
 * было: чужая территория, память комнаты (где при мне убивали — туда не идут),
 * новизна, забитость, и ничья, решаемая личностью, а не номером в массиве.
 */
function nearestAffordingRoom(
  world: World, e: Entity, def: DriveDef, reach: number,
): number {
  const affordance = def.affordance;
  if (affordance === undefined) return -1;
  const found = roomIdsAroundInto(world, e.x, e.y, reach, roomScratch);
  roomPreference.identity = npcUtilityIdentityFromEntity(e);
  /* Намерение донорского выбора. У тела его нет и не было — назначение комнаты
   * ведёт вместо него; у распорядка есть, и без него терпимость к опасности
   * считалась бы по нейтральному намерению: обход перестал бы ходить туда, где
   * неспокойно, то есть ровно туда, зачем он и нужен. */
  roomPreference.intent = def.preferenceIntent ?? 'wander';
  roomPreference.affordance = affordance;
  roomPreference.occupation = e.occupation;
  roomPreference.faction = e.faction;
  roomPreference.needs = e.needs;
  roomPreference.hp = e.hp;
  roomPreference.maxHp = e.maxHp;

  let best = -1;
  let bestScore = -Infinity;
  const limit = reach * reach;
  const own = e.faction === undefined ? undefined : factionToTerritoryOwner(e.faction);
  for (let i = 0; i < found; i++) {
    const room = world.rooms[roomScratch[i]];
    if (!room) continue;
    if (roomAffordanceWeight(room.type, affordance) <= 0) continue;
    const cx = room.x + room.w * 0.5;
    const cy = room.y + room.h * 0.5;
    const d2 = world.dist2(e.x, e.y, cx, cy);
    if (d2 > limit) continue;
    roomCandidate.id = room.id;
    roomCandidate.roomId = room.id;
    roomCandidate.roomType = room.type;
    roomCandidate.distance = Math.sqrt(d2);
    /* Забитость и вместимость. Читаются из переписи скоплений одним обращением
     * к массиву — своего обхода комнаты здесь нет и быть не может: перепись уже
     * идёт раз в секунду на весь этаж, и второй спрашивающий не стоит ничего.
     * Без этих двух полей вся толпа шла в одну ближайшую годную комнату:
     * забитость — единственный канал, который её оттуда выталкивает. */
    roomCandidate.crowd = crowdRoomTotal(world, room.id);
    roomCandidate.capacity = npcUtilityRoomCapacity(room);
    // Новизна: только что покинутая комната тянет слабее незнакомой.
    roomCandidate.novelty = roomVisitNovelty(e, room.id);
    /* Опасность комнаты — то же поле, что читает восприятие, только не под
     * ногами, а в середине комнаты: туда, где недавно лили кровь, за водой не
     * ходят. Одно чтение байта на кандидата, без обхода клеток комнаты. */
    roomCandidate.danger = fieldAt(world, FieldChannel.DANGER, cx, cy) / FIELD_VALUE_MAX;
    // Чужая территория отталкивает: в чужой красный угол за водой не ходят.
    roomCandidate.factionPenalty = own !== undefined
      && territoryRoomOwner(world, room.id) !== own ? ROOM_UNWELCOME : 0;
    roomCandidate.memory = roomMemoryFor(world, room.id);
    const score = scoreNpcUtilityTargetPreference(roomCandidate, roomPreference);
    if (score > bestScore) {
      bestScore = score;
      best = room.id;
    }
  }
  return best;
}

/** Насколько чужая территория отталкивает. Та же цена, что у прежнего слоя. */
const ROOM_UNWELCOME = 18;

/** Что комната помнит о человеке. Пустая память не стоит ничего. */
function roomMemoryFor(_world: World, roomId: number): NpcUtilityRoomMemorySnapshot | undefined {
  if (_coreZ === undefined || getRoomMemoryCount() === 0) return undefined;
  const record = getRoomMemory(_coreZ, roomId);
  if (!record) return undefined;
  return {
    hostile: roomMemoryIsHostile(record),
    helpful: roomMemoryIsHelpful(record),
    stash: roomMemoryRevealsStash(record),
    severity: record.severity,
  };
}

/**
 * Ведёт ли ядро актора по своему маршруту. Точка входа спрашивает это, чтобы
 * не принять наш собственный маршрут за чужой начатый ход и не отдать актора
 * прежнему слою на первом же кадре после прокладки.
 */
export function actorBrainOwnsRoute(e: Entity): boolean {
  return brains.peek(e)?.routing === true;
}

/**
 * Один такт ядра. Возвращает true, если ядро реально повело актора и прежнему
 * слою в этом кадре делать нечего.
 *
 * Отказ здесь — нормальный ответ, а не ошибка: у актора может не быть ни одной
 * тяги выше порога, либо он уже стоит в локальном экстремуме своего канала. В
 * обоих случаях ход честно уступается тому, кто вёл актора до нас.
 */
export function tickActorBrain(world: World, e: Entity, dt: number, now: number): boolean {
  if (!e.alive) return false;
  const st = brains.of(e);

  if (st.decideAt === -Infinity) {
    // Первое решение разводится по всей паузе, иначе весь этаж думает в один
    // кадр. До него актора ведёт прежний слой.
    st.decideAt = now + idUnit(e) * FIELD_TICK_SECONDS * (DECIDE_MIN_TICKS + DECIDE_SPAN_TICKS);
    return false;
  }
  if (now >= st.decideAt) {
    decide(world, e, st, now);
    st.decideAt = now + decideInterval(e);
  }

  const id = st.drive;
  if (id === undefined) return false;
  const def = DRIVE_BY_ID[id];

  // Предел хода: тактический драйв не вправе увести дальше своей видимости.
  if (def.reach !== Infinity
    && world.dist2(e.x, e.y, st.anchorX, st.anchorY) > def.reach * def.reach) {
    dropDrive(e, st);
    return false;
  }

  /* Намерение объявляется каждый такт, пока драйв ведёт актора: список
   * объявивших чистится своим тактом, и одного объявления при выборе не хватило
   * бы даже до первого захвата. */
  def.sustain?.(world, e);

  /* ЯРУС ПРОТИВНИКА: ядро объявляет цель и уступает ход боевому слою. Оно
   * намеренно возвращает false — вести драку (оружие, дистанция, перезарядка,
   * тактики вида) пока умеет только он, а ядро отвечает за то, СТОИТ ЛИ эта
   * драка того по сравнению с бегством, укрытием и голодом. */
  if (def.tier === 'actor') {
    const ai = e.ai;
    /* Цель ставится, только если её нет: выбор противника принадлежит боевому
     * слою, и перебивать его своим «ближайшим» значит трепать цель каждый такт.
     * Ядро отвечает на другой вопрос — драться ли вообще. */
    if (ai && st.targetId !== undefined && ai.combatTargetId === undefined) ai.combatTargetId = st.targetId;
    return false;
  }

  if (def.tier === 'route') {
    // Пришли и делаем дело стоянием — маршрут не пересобираем до решения.
    if (st.arrived) return true;
    return followRoute(world, e, def, st, dt);
  }
  if (def.tier === 'room') return workRoom(world, e, def, st, dt, now);

  // Склон щупается один раз на пройденную клетку, а не каждый кадр: внутри
  // клетки он не меняется, а восемь чтений плоскости на кадр на каждого актора
  // — это ровно тот расход, ради ухода от которого поля и заведены.
  const cell = world.idx(Math.floor(e.x), Math.floor(e.y));
  if (cell !== st.probedCell) {
    st.probedCell = cell;
    probe(world, e, def, st);
  }
  if (!st.hasDir) return false;

  const step = (e.speed > 0 ? e.speed : 0) * def.pace * dt;
  if (!(step > 0)) return false;
  if (!stepActorBy(world, e, st.dirX * step, st.dirY * step)) {
    /* Упёрлись телом. Склон проверяет `world.solid`, а телу нужен ещё и радиус,
     * поэтому широкая тварь регулярно видит проход, в который не пролезает.
     * Курс здесь ОБЯЗАН сбрасываться, а не только клетка: иначе на следующем
     * кадре мы пощупаем ту же клетку, получим тот же ответ и будем толкаться в
     * тот же косяк весь срок гистерезиса — ровно так ядро добавило монстрам
     * застревания в первом замере. Уступаем ход и даём вести прежнему слою. */
    // ...и само дело откладывается до следующего решения. Держать его дальше
    // значит толкаться в косяк ещё несколько секунд.
    dropDrive(e, st);
    return false;
  }
  return true;
}

/** Текущий драйв актора. Для отладки, стенда и тестов. */
export function actorDrive(e: Entity): DriveId | undefined {
  return brains.peek(e)?.drive;
}

/** Счёт текущего драйва. Для отладки и тестов. */
export function actorDriveScore(e: Entity): number {
  return brains.peek(e)?.score ?? 0;
}

/** Ярус, на котором работает текущий драйв. Для отладки и тестов. */
export function actorDriveTier(e: Entity): DriveDef['tier'] | undefined {
  const id = brains.peek(e)?.drive;
  return id === undefined ? undefined : DRIVE_BY_ID[id].tier;
}

/** Забыть решение актора: смена этажа, воскрешение, тест. */
export function forgetActorBrain(e: Entity): void {
  brains.forget(e);
}
