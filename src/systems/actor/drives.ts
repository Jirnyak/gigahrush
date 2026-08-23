import { ItemType, MAX_DRAW, Faction, NpcState, type Entity, type GameState } from '../../core/types';
import type { RoomAffordanceId } from '../../data/room_affordances';
import type { World } from '../../core/world';
import { carriesFor, consumeCarried, eatMeatChunk, relieveInPlace } from './body';
import { FieldChannel } from '../fields';
import { CAPTURE_MIN_PRESSURE, declareTerritoryPush, territoryCaptureTarget } from '../territory';
import { npcWorkErrandRoomId, tickNpcWorkDeed } from '../npc_work';
import {
  defaultDuty, defaultSociability, npcUtilityIdentityFromEntity, npcUtilityRhythmBias,
  occupationWorkDrive, patrolDrive,
  type NpcUtilityIdentity, type NpcUtilityIntentId,
} from '../ai/npc_utility';
import { clamp01, type ActorNeeds } from './needs';
import type { ActorClock } from './clock';
import { ACTOR_SENSE_RADIUS, sensed, sensedFar, type ActorSenses } from './senses';

/**
 * Драйвы — ДАННЫМИ.
 *
 * Драйв это пара «поле + знак» плюс формула счёта. Идти вверх по каналу или
 * вниз — вот и всё поведение: страх идёт вниз по опасности, охота вверх по
 * плотности добычи, укрытие вниз по просвету, стая вверх по плотности своих.
 * Актор НИКОГДА не ищет перебором, «где ближайшее X»: он читает градиент под
 * ногами.
 *
 * Счёт — произведение четырёх сомножителей, как договорено:
 *
 *   счёт = потребность × контекст × фракция × возможность
 *
 * Потребность отвечает «насколько мне это надо», контекст — «насколько здесь
 * уместно», фракция — «насколько это вообще про меня» (таблица ниже, она же
 * задаёт разницу видов), возможность — «могу ли я это сделать отсюда». Каждый
 * сомножитель ноль обнуляет драйв целиком, и это единственный способ его
 * выключить: белых списков «кому что можно» здесь нет.
 *
 * Новое поведение — строка в `DRIVES`, а не правка графа переходов.
 */

/**
 * Предел хода тактического драйва. Дальность отрисовки: тактика по определению
 * то, что актор видит вокруг себя, и уводить дальше собственной видимости она
 * не вправе. Стратегическому драйву предела нет — в этом всё его назначение.
 */
const TACTICAL_REACH = MAX_DRAW;

/**
 * Докуда человек пойдёт ради нужды. Втрое дальше своей видимости: за едой
 * ходят в соседний блок, но не через весь этаж — этаж это 1024 клетки, и
 * дорога туда стоила бы дороже самой нужды.
 */
const BODY_REACH = MAX_DRAW * 3;

export type DriveGroup = 'body' | 'survival' | 'work' | 'social' | 'growth';

export const DRIVE_IDS = [
  'flee',
  'hide',
  'seek_noise',
  'track_scent',
  'hunt',
  'flock',
  'pack',
  'huddle',
  'eat',
  'drink',
  'sleep',
  'toilet',
  'heal',
  'capture',
  'fight',
  'work',
  'social',
  'patrol',
] as const;

export type DriveId = (typeof DRIVE_IDS)[number];

/** Что видит формула счёта. Ни одного обращения к миру: только снимки. */
export interface DriveView {
  senses: ActorSenses;
  needs: ActorNeeds;
  clock: ActorClock;
}

/**
 * Ярус, на котором драйв читает поле, — он же способ исполнения.
 *
 * `step` — ТАКТИКА: своя клетка и восемь соседей, шаг по склону, без маршрута.
 * Сюда идёт то, что решается шагом и мгновенно устаревает: кровь под ногами,
 * просвет вокруг, чужой след. След особенно: он лежит связной цепочкой клеток,
 * и стратегический ярус размазал бы дорожку в пятно, потеряв саму дорогу.
 *
 * `route` — СТРАТЕГИЯ: ячейка 16×16, цель за горизонтом, дорогу до неё кладёт
 * поиск пути. Сюда идёт то, ради чего пересекают этаж: где людно, где шумит бой.
 *
 * `actor` — ПРОТИВНИК: цель не место вовсе, а живой человек или тварь. Пока бой
 * живёт своим слоем, исполнение у этого яруса особое: ядро ОБЪЯВЛЯЕТ цель и
 * уступает ход боевому слою, а не ведёт актора само. Смысл переезда именно в
 * решении: драться или бежать теперь считается тем же счётом, что голод и
 * страх, а не отдельной машиной.
 *
 * `room` — НАЗНАЧЕНИЕ: цель не точка поля, а комната, УМЕЮЩАЯ закрыть нужду.
 * Поля тут ни при чём и не помогут: «где здесь спят» — свойство назначения
 * комнаты, а не плотности чего-либо. Ищется ближайшая годная через индекс
 * комнат в радиусе `reach`, без единого обхода списка комнат этажа.
 */
export type DriveTier = 'step' | 'route' | 'room' | 'actor';

export interface DriveDef {
  id: DriveId;
  group: DriveGroup;
  tier: DriveTier;
  /** Канал, по градиенту которого драйв ведёт тело. */
  field: FieldChannel;
  /** Знак градиента: вверх (+1) или вниз (−1). */
  sign: 1 | -1;
  /** Доля обычной скорости на этом деле: страх бежит, стая подходит. */
  pace: number;
  /** Сколько секунд выбор держится, даже если счёт просел (гистерезис). */
  holdSec: number;
  /**
   * Докуда драйв вправе увести актора от точки, где он его взял. `Infinity` —
   * без предела: у стратегического драйва увести далеко и есть всё дело.
   * У тактического предел обязателен, иначе «прячется» превращается в «ушёл
   * в другой конец этажа».
   */
  reach: number;
  /** ПОТРЕБНОСТЬ, 0..1: откуда берётся тяга. */
  need(v: DriveView): number;
  /** КОНТЕКСТ, множитель ≥0: насколько здесь и сейчас это уместно. */
  context(v: DriveView): number;
  /** ВОЗМОЖНОСТЬ, 0..1: могу ли я это сделать отсюда прямо сейчас. */
  opportunity(v: DriveView): number;
  /** Назначение комнаты, которое закрывает нужду. Только для яруса `room`. */
  affordance?: RoomAffordanceId;
  /**
   * Чем актор занят, когда ДОШЁЛ. Не украшение: по этой отметке восстановление
   * нужд (`systems/needs.ts`) понимает, что человек лёг спать, а не просто
   * стоит в комнате с кроватью, и по ней же его читают речь и анимации.
   */
  arrivedState?: NpcState;
  /**
   * Закрыть нужду тем, что уже при себе. Пробуется ПЕРЕД дорогой: носить паёк
   * и идти за едой через этаж — это не характер, а дыра.
   */
  satisfyCarried?(world: World, e: Entity, now: number): boolean;
  /** Есть ли при себе то, чем закрыть нужду. Для счёта возможности. */
  hasCarried?(e: Entity): boolean;
  /**
   * Цель маршрута в обход поля: клетка мира (`world.idx`) или −1. Для яруса
   * `route` — то же, чем `heading` служит тактике.
   *
   * Нужна там, где ответа нет у поля по его природе. Владение землёй — такой
   * случай: оно дискретно («чья эта клетка»), а не плотно, и градиентом не
   * выражается вовсе; спрашивают его у переписи фронта.
   */
  routeTarget?(world: World, e: Entity): number;
  /**
   * Цель яруса `room` в обход НАЗНАЧЕНИЯ: номер комнаты, названной самим делом.
   * Возвращает −1, когда своего адреса у дела нет и годится обычный поиск.
   *
   * Нужна там же, где и `routeTarget`: назначение комнаты на этот вопрос не
   * отвечает по своей природе. Наряд кладовщика — ровно такой случай: хлеб
   * везут на кухню, а кухня «работой» не считается и в поиске годных комнат не
   * появится никогда.
   */
  roomTarget?(world: World, e: Entity): number;
  /**
   * Дело, которое делается ПО ПРИХОДЕ на место, своим тактом. Драйв доводит до
   * комнаты, а что там делать — знает тот, кто это дело ведёт: уборка
   * поверхностей, складской цикл, разнос груза.
   *
   * Смысл хука в том, что перенос распорядка — это смена ТОЧКИ ВЫЗОВА, а не
   * переписывание дела заново: за этой строчкой стоят покупка за деньги, кража
   * со свидетелями и неотчуждаемость квестовой вещи, и второго их экземпляра
   * быть не должно.
   */
  onArrived?(world: World, e: Entity, now: number, state?: GameState): void;
  /**
   * Намерение донорского выбора комнаты. Идентификаторы распорядка совпадают с
   * его намерениями не случайно — это одно и то же дело под одним именем; у
   * телесных драйвов такого намерения нет, и им остаётся нейтральное.
   */
  preferenceIntent?: NpcUtilityIntentId;
  /**
   * Что драйв делает КАЖДЫЙ свой такт, пока ведёт актора. Не действие на месте,
   * а объявление намерения: система захвата переворачивает клетки только под
   * теми, кто объявил захват своей целью, и список объявивших она чистит каждый
   * свой такт.
   */
  sustain?(world: World, e: Entity): void;
  /**
   * Дело делается ПРИСУТСТВИЕМ на цели: дойдя, актор стоит и продолжает такт, а
   * не бросает драйв. Без этого пришедший захватчик отпускал намерение на первом
   * же кадре после прихода — маршрут пуст, цель та же, назначение отвечает «та
   * же цель», и драйв честно уходил в никуда за миг до такта захвата.
   */
  holdsTarget?: boolean;
  /**
   * Курс в обход поля: если объявлен, тактическое исполнение берёт направление
   * отсюда, а не со склона канала.
   *
   * Нужен ровно там, где поле по своей природе ответить не может. Держаться
   * рядом со своими — такой случай: актор САМ льёт в канал плотности и потому
   * всегда стоит на собственном пике, а ячейка стратегического яруса (16×16)
   * крупнее разброса самой пачки. Ни один ярус не видит «где мои» — это знает
   * только тот единственный радиусный запрос, который восприятию и разрешён.
   *
   * Возвращает false, если курса нет. Пишет в `out` единичный вектор.
   */
  heading?(v: DriveView, out: { x: number; y: number }): boolean;
}

/** Насколько актор слабее того, кто на него смотрит. 0..1. */
function outgunned(s: ActorSenses): number {
  if (s.hostiles === 0) return 0;
  const total = s.hostilePower + s.allyPower;
  return total <= 0 ? 0 : clamp01((s.hostilePower - s.allyPower) / total);
}

/** Давление врагов, которых видно поимённо. Насыщается на четырёх. */
function hostilePressure(s: ActorSenses): number {
  return clamp01(s.hostiles / 4);
}

/**
 * Тяга к плотности с насыщением: пусто — незачем, в самый раз — максимум, в
 * давке — снова незачем.
 *
 * Здесь и живёт штраф «туда уже пошли трое», который в прежнем скоринге
 * вычитался в тринадцати формулах и всегда был нулём: считать чужую толкучку
 * не нужно, она УЖЕ написана в клетке.
 */
function crowdComfort(density: number): number {
  return clamp01(density * (1 - density) * 4);
}

/* ── РАСПОРЯДОК: личность и часы ──────────────────────────────────
 *
 * Все числа распорядка берутся у прежнего слоя (`ai/npc_utility.ts`) и здесь не
 * пересчитываются: кривая окна смены, личный сдвиг ±90 минут, тяга к ремеслу,
 * долг и общительность — по одному экземпляру на проект. Второй экземпляр той
 * же кривой разошёлся бы с первым на первой же правке.
 */

/**
 * Личность для распорядка. Считается раз на актора: три драйва распорядка
 * спрашивают её в одном такте решения, и строить объект второй раз незачем.
 * Памятка держится на самом акторе, а не на времени, — цикл решения перебирает
 * драйвы одного актора подряд.
 */
let routineIdentityOwner: Entity | undefined;
let routineIdentity: NpcUtilityIdentity | undefined;

function routineIdentityFor(e: Entity): NpcUtilityIdentity {
  if (routineIdentityOwner !== e || routineIdentity === undefined) {
    routineIdentityOwner = e;
    routineIdentity = npcUtilityIdentityFromEntity(e);
  }
  return routineIdentity;
}

/**
 * Насколько СЕЙЧАС час этого дела, 0..1. Кривая окна и личный сдвиг смены —
 * донорские; масштаб 1, потому что здесь это множитель контекста, а не слагаемое
 * очков. Ноль законен и означает «не моё время»: у сомножителя ноль обнуляет
 * драйв, и это и есть смена, начинающаяся по часам.
 */
function routinePhase(v: DriveView, intent: NpcUtilityIntentId): number {
  const e = v.senses.actor;
  if (!e) return 0;
  return npcUtilityRhythmBias(intent, v.clock.minuteOfDay, routineIdentityFor(e), 1);
}

/** Долг: сколько человек вообще склонен делать дело. Донорские числа. */
function routineDuty(v: DriveView): number {
  const e = v.senses.actor;
  return e ? clamp01(defaultDuty(e.faction, e.occupation)) : 0;
}

export const DRIVES: readonly DriveDef[] = [
  {
    id: 'flee',
    group: 'survival',
    // Тактика: от крови под ногами уходят шагом, а не маршрутом через этаж.
    tier: 'step',
    field: FieldChannel.DANGER,
    sign: -1,
    pace: 1,
    holdSec: 2,
    reach: TACTICAL_REACH,
    // Страшно от того, что здесь уже проливали кровь, от чужой силы и от своей
    // раны. Три источника одного страха, максимум из них и есть страх.
    need: v => clamp01(Math.max(
      sensed(v.senses, FieldChannel.DANGER),
      hostilePressure(v.senses) * 0.8,
      v.needs.pain * 0.7,
    )),
    // Сильному страшно вдвое меньше, чем тому, кого перевешивают.
    context: v => 0.6 + outgunned(v.senses),
    // Бежать вниз по опасности можно только там, где опасность есть: на ровном
    // месте у страха нет направления, и драйв честно уступает.
    opportunity: v => (sensed(v.senses, FieldChannel.DANGER) > 0 ? 1 : 0),
  },
  {
    id: 'hide',
    group: 'survival',
    /* Тактика, и это не компромисс: просвет статичен, запечён поклеточно и
     * описывает форму укрытия — угол, косяк, чокпойнт. На ярусе 16×16 угол
     * исчезает. Предел хода тут обязателен: прячутся ЗДЕСЬ. */
    tier: 'step',
    field: FieldChannel.OPENNESS,
    sign: -1,
    pace: 0.85,
    holdSec: 3,
    reach: TACTICAL_REACH,
    // Прятаться хочется ровно настолько, насколько страшно и насколько плохо телу.
    need: v => clamp01(Math.max(
      sensed(v.senses, FieldChannel.DANGER) * 0.8,
      hostilePressure(v.senses),
      v.needs.pain,
    )),
    // На просторе — сильнее всего: в глухом углу прятаться уже некуда.
    context: v => sensed(v.senses, FieldChannel.OPENNESS),
    // Раненый и безоружный жмётся к стене охотнее вооружённого.
    opportunity: v => (v.senses.armed ? 0.45 : 1),
  },
  {
    id: 'seek_noise',
    group: 'survival',
    /* Идти на выстрелы — и теперь честно, издалека. Раньше драйв пришлось слить
     * со следом: поклеточный NOISE жил ровно одну клетку от места выстрела
     * (замер: 115, 16, 0), и вести никуда не мог. На стратегическом ярусе бой
     * слышно через весь этаж, и драйв делает то, ради чего заведён: втягивает
     * соседей в чужую драку. */
    tier: 'route',
    field: FieldChannel.NOISE,
    sign: 1,
    pace: 1,
    holdSec: 4,
    reach: Infinity,
    // Слышно и вблизи, и вообще в этой части этажа: берём громкое из двух.
    need: v => clamp01(Math.max(
      sensed(v.senses, FieldChannel.NOISE),
      sensedFar(v.senses, FieldChannel.NOISE),
    )),
    // На чужую драку идут смелее при своих под боком; одному лезть незачем.
    context: v => (v.senses.beast
      ? 0.7 + v.needs.hunger
      : 0.3 + crowdComfort(sensedFar(v.senses, FieldChannel.PEOPLE))),
    // Никто не идёт искать бой, когда бой уже нашёл его сам.
    opportunity: v => (v.senses.hostiles > 0 ? 0 : v.senses.beast || v.senses.armed ? 1 : 0.25),
  },
  {
    id: 'track_scent',
    group: 'survival',
    /* Тактика по природе следа: дорожка это ЦЕПОЧКА клеток, по которой кто-то
     * прошёл, и идут по ней клетка за клеткой. Стратегический ярус усреднил бы
     * дорожку по ячейке 16×16 и вернул бы «здесь кто-то ходил» вместо «вот
     * куда он ушёл» — то есть потерял бы ровно то, что делает след следом. */
    tier: 'step',
    field: FieldChannel.SCENT,
    sign: 1,
    pace: 0.7,
    holdSec: 4,
    reach: Infinity, // след ведёт, докуда ведёт: предел здесь был бы произволом
    // По следу идут, когда громкого нет: свежий бой важнее старой дорожки.
    need: v => sensed(v.senses, FieldChannel.SCENT)
      * (1 - clamp01(sensedFar(v.senses, FieldChannel.NOISE))),
    // Голодная тварь нюхает охотнее сытой; человеку чужой след интересен слабо.
    context: v => (v.senses.beast ? 0.6 + v.needs.hunger : 0.25),
    opportunity: v => (v.senses.hostiles > 0 ? 0 : 1),
  },
  {
    id: 'hunt',
    group: 'growth',
    // Стратегия: хищник обязан уходить к толпе через весь этаж, а не топтаться.
    tier: 'route',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.9,
    holdSec: 4,
    reach: Infinity,
    /* Тянет ТЕЛО: голод — причина, добыча — направление и повод. Разделение
     * осталось верным и после появления яруса, но добыча вернулась в счёт
     * честно: теперь её слышно издалека, а не только из-под ног. */
    need: v => clamp01(v.needs.hunger + sensedFar(v.senses, FieldChannel.PEOPLE) * 0.5),
    // Сытая одиночка охотится вяло, голодная стая рядом с людьми — всерьёз.
    context: v => 0.4 + sensedFar(v.senses, FieldChannel.PEOPLE)
      + sensedFar(v.senses, FieldChannel.BEASTS) * 0.6,
    // Охота — дело зверя, и не тогда, когда добыча уже вцепилась в тебя.
    opportunity: v => (v.senses.beast && v.senses.hostiles === 0 ? 1 : 0),
  },
  {
    id: 'flock',
    group: 'social',
    // Стратегия: к людям идут туда, где люди, а не туда, где стоял сам.
    tier: 'route',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.5,
    holdSec: 3,
    reach: Infinity,
    /* Одиночество меряется по ЯРУСУ, и это чинит собственный пик: в своей
     * клетке актор всегда стоит на максимуме канала, который сам же и налил,
     * поэтому поклеточная тяга к людям у одиночки была вечным нулём. На ячейке
     * 16×16 свой вклад размазан и одиночество наконец читается. */
    need: v => clamp01((1 - sensedFar(v.senses, FieldChannel.PEOPLE))
      * (0.4 + sensedFar(v.senses, FieldChannel.DANGER) * 0.6)),
    // В самый раз людно — идём; в давке — уже незачем.
    context: v => crowdComfort(sensedFar(v.senses, FieldChannel.PEOPLE)),
    opportunity: v => (v.senses.beast || v.senses.hostiles > 0 ? 0 : 1),
  },
  {
    id: 'huddle',
    group: 'social',
    /* Ближний сбор: «держаться рядом со СВОИМИ», в отличие от `flock`/`pack`,
     * которые тянут «туда, где вообще людно». Разведены намеренно — через поле
     * стая не собирается ни на одном ярусе, см. `heading`. */
    tier: 'step',
    // Канал объявлен ради единообразия строки и читается формулами; курс сюда
    // приходит из `heading`, а не со склона.
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.6,
    holdSec: 3,
    reach: TACTICAL_REACH,
    // Тянет тем сильнее, чем дальше свои и чем тревожнее вокруг.
    need: v => clamp01(Math.hypot(v.senses.allyDx, v.senses.allyDy) / TACTICAL_REACH
      * (0.5 + sensed(v.senses, FieldChannel.DANGER))),
    // Уже вплотную — расходиться заставит расталкивание, звать сюда незачем.
    context: v => clamp01((Math.hypot(v.senses.allyDx, v.senses.allyDy) - 1) * 0.5),
    // Своих надо иметь, и не тогда, когда на тебе висит враг.
    opportunity: v => (v.senses.allies > 0 && v.senses.hostiles === 0 ? 1 : 0),
    heading: (v, out) => {
      const dx = v.senses.allyDx;
      const dy = v.senses.allyDy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (!(len > 0.0001)) return false;
      out.x = dx / len;
      out.y = dy / len;
      return true;
    },
  },
  {
    id: 'pack',
    group: 'social',
    tier: 'route',
    field: FieldChannel.BEASTS,
    sign: 1,
    pace: 0.6,
    holdSec: 3,
    reach: Infinity,
    need: v => clamp01((1 - sensedFar(v.senses, FieldChannel.BEASTS)) * 0.7),
    context: v => crowdComfort(sensedFar(v.senses, FieldChannel.BEASTS)),
    opportunity: v => (v.senses.beast && v.senses.hostiles === 0 ? 1 : 0),
  },
  /* ── ТЕЛО ────────────────────────────────────────────────────────────────
   *
   * Все пятеро устроены одинаково: тянет давление тела, закрывает НАЗНАЧЕНИЕ
   * комнаты, и перед всякой дорогой пробуется то, что уже в руках. Разница
   * между ними — строка данных, а не пятый обработчик.
   */
  {
    id: 'eat',
    group: 'body',
    tier: 'room',
    arrivedState: NpcState.LUNCH,
    affordance: 'eat',
    // Канал объявлен ради единообразия строки; ярус `room` его не читает.
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 1,
    holdSec: 6,
    reach: BODY_REACH,
    need: v => v.needs.hunger,
    // Голодный не идёт обедать под выстрелами.
    context: v => 1 - sensed(v.senses, FieldChannel.DANGER) * 0.7,
    opportunity: () => 1,
    satisfyCarried: (world, e) => consumeCarried(e, ItemType.FOOD) || eatMeatChunk(world, e),
    hasCarried: e => carriesFor(e, ItemType.FOOD),
  },
  {
    id: 'drink',
    group: 'body',
    tier: 'room',
    arrivedState: NpcState.LUNCH,
    affordance: 'drink',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 1,
    holdSec: 6,
    reach: BODY_REACH,
    need: v => v.needs.thirst,
    context: v => 1 - sensed(v.senses, FieldChannel.DANGER) * 0.7,
    opportunity: () => 1,
    satisfyCarried: (_world, e) => consumeCarried(e, ItemType.DRINK),
    hasCarried: e => carriesFor(e, ItemType.DRINK),
  },
  {
    id: 'sleep',
    group: 'body',
    tier: 'room',
    arrivedState: NpcState.SLEEPING,
    affordance: 'sleep',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.9,
    holdSec: 12,
    reach: BODY_REACH,
    need: v => v.needs.sleepiness,
    // Спать под кровью и на виду не ложатся.
    context: v => (1 - sensed(v.senses, FieldChannel.DANGER))
      * (v.senses.hostiles > 0 ? 0 : 1),
    opportunity: () => 1,
  },
  {
    id: 'toilet',
    group: 'body',
    tier: 'room',
    arrivedState: NpcState.MORNING,
    affordance: 'toilet',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 1,
    holdSec: 6,
    reach: BODY_REACH,
    need: v => v.needs.bladder,
    // Терпит хуже всего остального: опасность его почти не откладывает.
    context: () => 1,
    opportunity: () => 1,
    satisfyCarried: (world, e, now) => relieveInPlace(world, e, now),
  },
  {
    id: 'fight',
    group: 'survival',
    tier: 'actor',
    // Канал объявлен ради единообразия строки; ярус читает соседа, а не поле.
    field: FieldChannel.DANGER,
    sign: 1,
    pace: 1,
    /* Держится дольше прочего: драка, брошенная через две секунды, — это удар в
     * спину. Отпускает её либо смерть противника (цель исчезает), либо страх,
     * который обязан перебить надбавку действующего драйва. */
    holdSec: 6,
    reach: Infinity,
    /* Тянет БЛИЗОСТЬ ВИДИМОГО врага, а не число врагов: один противник в двух
     * шагах — это уже драка, а счёт по «сколько их» давал 1/4 и не дотягивал
     * даже до порога захвата актора (замерено: 0.146 против порога 0.15 —
     * вооружённый боец не дрался вовсе с одиночным врагом перед носом). Число
     * видимых остаётся вторым источником: толпа тянет и издали. Своя рана
     * добавляет решимости решить прямо сейчас — в ту или в другую сторону. */
    need: v => clamp01(Math.max(
      1 - v.senses.nearestVisibleHostileDist / ACTOR_SENSE_RADIUS,
      clamp01(v.senses.visibleHostiles / 4),
    ) * (0.7 + v.needs.pain * 0.3)),
    // Расклад: сильному драка уместна, слабому — нет. Безоружный вдвое неохотнее.
    context: v => (1 - outgunned(v.senses)) * (v.senses.armed ? 1 : 0.5),
    /* Драться можно только с тем, кого ВИДНО. Страх и укрытие работают и от
     * неувиденного — там довольно того, что читается в клетке, — а драка без
     * линии взгляда отправляла актора в бетон. */
    opportunity: v => (v.senses.nearestVisibleHostile !== undefined ? 1 : 0),
  },
  {
    id: 'capture',
    group: 'work',
    /* Стратегия по способу исполнения (дальняя цель + маршрут), но цель приходит
     * от переписи фронта, а не со склона канала — см. `routeTarget`. */
    tier: 'route',
    // Канал объявлен ради единообразия строки; ярус его не читает.
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.9,
    holdSec: 8,
    /* Предела хода нет, как и у всякой стратегии: уводить далеко и есть её
     * дело. Дальность и так ограничена дважды — сама перепись не смотрит дальше
     * шести бакетов (96 клеток), а тяга гаснет с дорогой (см. `need`). Жёсткий
     * поводок поверх этого только рвал бы дело на полпути. */
    reach: Infinity,
    holdsTarget: true,
    /* Тянет ценность участка, гаснущая с дорогой до него: за своей землёй идут
     * не дальше, чем за обедом, и это тяга, а не запрет. */
    need: v => clamp01(v.senses.captureValue
      * (1 - clamp01(v.senses.captureDistance / BODY_REACH))),
    /* Один в поле не воин, и это не запрет, а та же физика, что и на месте:
     * клетку переворачивает только перевес своих над чужими
     * (`CAPTURE_MIN_PRESSURE`), поэтому одиночке туда незачем. Здесь тот же счёт,
     * только заранее — и он же делает рейд рейдом: идут те, у кого рядом свои.
     * Под кровью под ногами воевать за землю хочется вдвое меньше. */
    context: v => clamp01(v.senses.allies / CAPTURE_MIN_PRESSURE)
      * (1 - sensed(v.senses, FieldChannel.DANGER) * 0.5),
    // Дело людей со стороной и не тогда, когда враг уже на плечах.
    opportunity: v => (v.senses.beast || v.senses.hostiles > 0 ? 0 : 1),
    routeTarget: (world, e) => {
      const target = territoryCaptureTarget(world, e);
      return target ? world.idx(target.x, target.y) : -1;
    },
    sustain: (_world, e) => declareTerritoryPush(e),
  },
  {
    id: 'heal',
    group: 'body',
    tier: 'room',
    arrivedState: NpcState.FREE_TIME,
    affordance: 'heal',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 1,
    holdSec: 8,
    reach: BODY_REACH,
    need: v => v.needs.pain,
    context: () => 1,
    opportunity: () => 1,
    satisfyCarried: (_world, e) => consumeCarried(e, ItemType.MEDICINE),
    hasCarried: e => carriesFor(e, ItemType.MEDICINE),
  },
  /* ── РАСПОРЯДОК ──────────────────────────────────────────────────────────
   *
   * Все трое устроены как тело: ярус `room`, назначение комнаты вместо поля,
   * дорога через индекс комнат. Разница с телом одна — тянет их не давление
   * тела, а ЧАСЫ вместе с личностью, поэтому весь распорядок и висит на
   * контексте: не твой час — не твоё дело, каким бы прилежным ты ни был.
   */
  {
    id: 'work',
    group: 'work',
    tier: 'room',
    arrivedState: NpcState.WORKING,
    affordance: 'work',
    preferenceIntent: 'work',
    // Канал объявлен ради единообразия строки; ярус `room` его не читает.
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 1,
    /* Держится дольше всего прочего: смена, брошенная через шесть секунд, —
     * это не смена. Прежний слой переспрашивал работу раз в 14–18 с. */
    holdSec: 16,
    reach: BODY_REACH,
    // Долг человека и тяга его ремесла — обе величины донорские.
    need: v => {
      const e = v.senses.actor;
      if (!e) return 0;
      return clamp01(routineDuty(v) * 0.65 + occupationWorkDrive(e.occupation) * 0.35);
    },
    /* Час смены — множитель, а не слагаемое: ночью работы нет ни у кого, и это
     * не запрет, а те же часы. Кровь под ногами и плохое телу гасят работу:
     * голодный и раненый смену не тянет, а под выстрелами её не тянет никто. */
    context: v => routinePhase(v, 'work')
      * (1 - sensed(v.senses, FieldChannel.DANGER) * 0.8)
      * (1 - v.needs.worst * 0.6)
      * (v.clock.samosbor ? 0 : 1),
    // С врагом на плечах не работают.
    opportunity: v => (v.senses.hostiles > 0 ? 0 : 1),
    /* Наряд бьёт назначение: везти надо туда, где ждут груз. Без этого рейсы
     * кладовщика, кормление вставших цехов и разнос вещей по природному адресу
     * умерли бы молча — ни одна из этих комнат «работой» не считается. */
    roomTarget: (world, e) => npcWorkErrandRoomId(world, e),
    /* Дойдя — работать: уборка поверхностей и складской цикл, своим тактом.
     * `state` обязателен: на нём висят свидетели кражи и аудит сделок. */
    onArrived: (world, e, now, state) => { tickNpcWorkDeed(world, e, now, state); },
  },
  {
    id: 'social',
    group: 'social',
    tier: 'room',
    arrivedState: NpcState.FREE_TIME,
    affordance: 'social',
    preferenceIntent: 'social',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.8,
    holdSec: 10,
    reach: BODY_REACH,
    need: v => {
      const e = v.senses.actor;
      if (!e) return 0;
      return clamp01(defaultSociability(e.faction, e.occupation));
    },
    /* Говорить идут в свой час и когда тихо. Толпа тянет саму себя: в пустом
     * баре разговаривать не с кем, в давке — уже незачем. */
    context: v => routinePhase(v, 'social')
      * (0.5 + crowdComfort(sensedFar(v.senses, FieldChannel.PEOPLE)))
      * (1 - sensed(v.senses, FieldChannel.DANGER) * 0.9)
      * (1 - v.needs.worst * 0.5)
      * (v.clock.samosbor ? 0 : 1),
    opportunity: v => (v.senses.hostiles > 0 ? 0 : 1),
  },
  {
    id: 'patrol',
    group: 'work',
    tier: 'room',
    arrivedState: NpcState.PATROL,
    affordance: 'patrol',
    preferenceIntent: 'patrol',
    field: FieldChannel.PEOPLE,
    sign: 1,
    pace: 0.9,
    holdSec: 12,
    /* Обход не знает предела своей видимости — в этом всё его дело. Дальность
     * и так ограничена радиусом поиска годной комнаты. */
    reach: BODY_REACH,
    /* Патруль — это просто перемещение по карте между комнатами, и назначение
     * `patrol` уже расставлено осмысленно: коридор, штаб, общий зал, ряд.
     * Прежний закон «патруль ходит ВНЕ комнат» не перенесён намеренно. */
    need: v => {
      const e = v.senses.actor;
      if (!e) return 0;
      return clamp01(patrolDrive(e.faction, e.occupation) * 0.67 + routineDuty(v) * 0.33);
    },
    /* Единственное рутинное дело, которому угроза ПОВЫШАЕТ тягу: обход затем и
     * нужен, что где-то неспокойно. Самосбор обход не отменяет по той же
     * причине — и это не ветка по фракции, а свойство самого дела. */
    context: v => (0.35 + routinePhase(v, 'patrol') * 0.65)
      * (1 + sensed(v.senses, FieldChannel.DANGER) + hostilePressure(v.senses))
      * (1 - v.needs.worst * 0.5),
    opportunity: v => (v.senses.hostiles > 0 ? 0 : 1),
  },
];

export const DRIVE_BY_ID: Readonly<Record<DriveId, DriveDef>> = Object.fromEntries(
  DRIVES.map(d => [d.id, d]),
) as Record<DriveId, DriveDef>;

/**
 * Порода актора для таблицы весов. Тварь — такая же порода, как фракция:
 * человек, тварь и игрок идут через один цикл, и разница между ними живёт
 * ЗДЕСЬ, в весах, а не в развилке кода.
 */
export type DriveActorKind = Faction | 'beast';

/**
 * Вес драйва у породы. Отсутствие строки — единица.
 *
 * Это и есть третий сомножитель счёта. Ликвидатор не боится не потому, что для
 * него написана отдельная ветка, а потому, что у него страх весит треть.
 */
const DRIVE_WEIGHTS: Partial<Record<DriveActorKind, Partial<Record<DriveId, number>>>> = {
  [Faction.LIQUIDATOR]: { flee: 0.3, hide: 0.35, seek_noise: 1.8, flock: 0.7, capture: 1.6, fight: 1.6 },
  [Faction.CULTIST]: { flee: 0.6, hide: 0.7, seek_noise: 1.2, flock: 1.4, capture: 1.2, fight: 1.3 },
  [Faction.SCIENTIST]: { flee: 1.3, hide: 1.4, seek_noise: 0.4, flock: 1.2, capture: 0.15, fight: 0.4 },
  [Faction.WILD]: { flee: 0.8, hide: 0.9, seek_noise: 1.1, track_scent: 1.4, capture: 1.3, fight: 1.4 },
  [Faction.CITIZEN]: { seek_noise: 0.5, huddle: 1.2, capture: 0.3, fight: 0.7 },
  beast: { flee: 0.5, hide: 0.4, seek_noise: 1.2, track_scent: 1.5, hunt: 1.4, pack: 1.2, fight: 1.6,
    /* Распорядка у твари нет: она не работает, не разговаривает и не обходит
     * посты. Выключено весом, а не веткой в коде и не белым списком «кому
     * можно» — породная разница живёт ровно здесь. */
    work: 0,
    social: 0,
    patrol: 0,
    /* Землю делят стороны, а не экология: у твари захват выключен весом, а не
     * веткой в коде. */
    capture: 0,
    /* Ноль намеренно: ближний сбор твари уже несёт свой слой (`ai/monster_pack`),
     * и второй сборщик поверх него не складывается, а тянет ту же пачку двумя
     * руками. Людям своего сбора никто не давал — им `huddle` и достаётся. */
    huddle: 0 },
};

export function driveActorKind(e: Entity, beast: boolean): DriveActorKind | undefined {
  return beast ? 'beast' : e.faction;
}

export function driveWeight(kind: DriveActorKind | undefined, id: DriveId): number {
  if (kind === undefined) return 1;
  return DRIVE_WEIGHTS[kind]?.[id] ?? 1;
}

/** Счёт драйва: потребность × контекст × фракция × возможность. */
export function scoreDrive(def: DriveDef, v: DriveView, kind: DriveActorKind | undefined): number {
  const need = def.need(v);
  if (!(need > 0)) return 0;
  const opportunity = def.opportunity(v);
  if (!(opportunity > 0)) return 0;
  const context = def.context(v);
  if (!(context > 0)) return 0;
  const score = need * context * driveWeight(kind, def.id) * opportunity;
  return Number.isFinite(score) && score > 0 ? score : 0;
}
