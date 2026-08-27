/* ── Monster shared types & registry ──────────────────────────── */

import { DamageType, Feature, MonsterKind, RoomType, type ProjType } from '../core/types';

export type MonsterAIFlag =
  | 'wallBias'
  | 'weakWallBreach'
  | 'debrisLurker'
  | 'lampPowered'
  | 'lightLock'
  | 'documentHunter'
  | 'documentScent'
  | 'waterStrider'
  | 'drainArmor'
  | 'waterPressureLine'
  | 'rangedClause'
  | 'closeReveal'
  | 'foodBait'
  | 'wallBrace'
  | 'strikeReveal'
  | 'scentOvercommit'
  | 'garbageSurround'
  | 'sourceSwarm'
  | 'slimeScavenger'
  | 'slimeStrider'
  | 'weepingAngel'
  | 'looksLiquidator'
  | 'melee'
  | 'meatGrowth'
  | 'blackWaterWake'
  | 'rootedPlant'
  | 'roomBoundAberration'
  | 'lastSoundBeam'
  | 'meatWorm'
  | 'scrapWake'
  | 'baitLine'
  | 'officeField'
  | 'hostParasite'
  | 'protocolPressure'
  | 'noBrakes'
  | 'netPossessor'
  | 'silent'
  | 'defensiveNeutral'
  | 'webSpitter'
  | 'flying'
  | 'noclip'
  | 'wetLineShot'
  | 'packHowl'
  | 'noiseFear'
  | 'fogSwimmer'
  | 'larvaCarrier'
  | 'rootHive'
  | 'fractureSprint'
  | 'lurkingFurniture'
  | 'lightFollower'
  /**
   * Бьёт в ближнем бою через читаемый замах, который срывается дистанцией,
   * геометрией и дробью.
   *
   * Косторез и Сейфгард были ЕДИНСТВЕННЫМИ двумя видами со спецповедением и
   * без единого флага: их ворота стояли `switch`-ем по `MonsterKind` внутри
   * общего AI, то есть механика выглядела общей, а была заперта именем вида.
   * Числа и тексты замаха приносит `MonsterDef.windup`.
   */
  | 'meleeWindup'
  /* Вид воюет сторонами: его вражда решается общей матрицей отношений по
   * полю `faction`, а не фиксированной таблицей «фракция-монстры». Флаг здесь
   * не роскошь — без него признаком стороны было бы просто наличие `faction`,
   * и любое случайно проставленное поле молча переводило бы обычную экологию
   * на человеческие правила. */
  | 'sided';

/* Вид-источник: приплод, каденция и потолок живых детей. Раньше это были три
 * константы в `systems/matka_source.ts` и жёсткая проверка на матку; теперь
 * источником делает объявление, а шаг остался один на всех. */
export interface MonsterSourceDef {
  childKinds: readonly MonsterKind[];
  cooldownSec: number;
  cap: number;
  /** Имя ребёнка. Родительный падеж названия вида не выводится, поэтому он тут. */
  childName: string;
  /** Строка в лог при рождении, `%s` — имя вида ребёнка. Без неё источник молчит. */
  spawnMsg?: string;
}

/**
 * Вид-с-якорем: тварь работает от точки в мире, и перерезанный якорь её ослабляет.
 *
 * Форма семьи одна на всех: «пока якорь цел и виден — тварь сильнее; якорь
 * перерезали — ослабла». Хранилось это тремя разными способами. Ламповый читал
 * обстановку в кадре (`nearFeature`), Червие держал ОТВЕТ в четырёх полях
 * `AIState` у КАЖДОГО актора игры (`netPowered`, `netAnchorX`, `netAnchorY`) и
 * поддерживал их своим тактом на 115 строк, а числа обоих лежали константами в
 * теле общего AI. Кэш ответа при этом отставал от мира на кадр и обязан был
 * тикать даже там, где никого не интересовал.
 *
 * Теперь якорь — строка у вида, а поиск — один в кадре, как у всей остальной
 * обстановочной родни (укрытие, туман, мокрая клетка, свет). Умолчание везде
 * единица: вид объявляет ровно то, что якорь ему меняет.
 */
export interface MonsterAnchorDef {
  /** Клетки, годные в якорь. */
  features: readonly Feature[];
  /** Радиус поиска якоря и предел прямой до него, в клетках. */
  radius: number;
  /**
   * Нужна ли прямая до якоря.
   *
   * Свойство вида, а не кода: в экран Червие смотрит, поэтому стена питание
   * рвёт; лампа же светит и из-за угла, и Ламповому прямая не нужна.
   */
  sight?: boolean;
  /** Ход при живом якоре и с перерезанным. */
  moveMult?: number;
  cutMoveMult?: number;
  /** Урон при живом якоре и с перерезанным. */
  dmgMult?: number;
  cutDmgMult?: number;
  /** Дальность обнаружения в клетках при живом якоре и с перерезанным. */
  detect?: number;
  cutDetect?: number;
}

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  attackRate: number;
  /**
   * Чем бьёт вид. Нет поля — кинетика: зубы, кулак, обрезок арматуры.
   *
   * Раньше поля не было вовсе, и кинетикой был КАЖДЫЙ удар твари: кислотная
   * плеть слизневика, споровый выдох ковра и удар тени считались тем же, чем
   * кувалда, и упирались в те же проценты бронеплиты. Тип объявляется здесь,
   * а не ветками в общем AI: `damageActor` берёт его у бьющего сам.
   */
  damageType?: DamageType;
  /**
   * Пол урона по типу: доля `maxHp`, ниже которой удар этого типа не опускается.
   *
   * Механика «уязвимость доводит до порога», а не «уязвимость множит»: огнемёт
   * снимает шесть за впрыск, и никакой множитель ниже трёх не сделает огонь
   * ответом на девяносто шесть здоровья растения. Порог отвечает на вопрос
   * «сколькими попаданиями», множитель — на «насколько эффективнее»; это разные
   * вопросы, и растению нужен первый. Читает поле единая дверь урона, поэтому
   * порог работает от ЛЮБОЙ руки, а не только на пути снаряда игрока.
   */
  damageFloor?: Partial<Record<DamageType, number>>;
  sprite: number;
  /**
   * Дальность обнаружения в клетках. Раньше это была общая константа на всех
   * и два десятка отдельных `*_DETECT_SQ` в теле общего AI: новый вид не мог
   * объявить свою дальность данными. Теперь это свойство вида, как и скорость.
   * Отсутствие поля означает «общая дальность» — виды с ОБСТАНОВОЧНОЙ дальностью
   * (туман, укрытие, питание от сети) считают её сами и поле не заполняют.
   */
  detect?: number;
  /** Период скана целей в секундах. Без поля — общая каденция боевого скана. */
  scanSec?: number;
  /**
   * Дальность ближнего удара в клетках. Нет поля — общая (`MONSTER_REACH`).
   *
   * Была `switch (kind)` на девять видов в общем боевом такте: таблица вида,
   * живущая не у вида. Обстановочную дальность (упор Панельника, стадия
   * Головного слизня) поле не описывает — она считается на месте, как и всё
   * остальное обстановочное.
   */
  reach?: number;
  isRanged?: boolean;       // shoots projectiles instead of melee
  projSpeed?: number;       // projectile speed (cells/sec)
  projSprite?: number;      // projectile sprite index
  projType?: ProjType;      // projectile behavior tag
  aiFlags?: readonly MonsterAIFlag[];
  source?: MonsterSourceDef; // spawns capped persistent children on a timer
  /** Точка мира, от которой вид работает. Нет строки — якоря у вида нет. */
  anchor?: MonsterAnchorDef;
  /**
   * Чем кормится обстановочное поле вида: вес комнаты и вес клетки вокруг.
   *
   * Была таблица `RoomType → число` внутри общего боевого AI плюс тройка весов
   * признаков литералами рядом. Какая обстановка кормит вид — свойство вида ровно
   * настолько же, насколько его якорь; общий такт только складывает числа.
   */
  affinity?: MonsterAffinityDef;
  counterplay?: string;
  lootHint?: string;
  /**
   * Замах: числа и тексты телеграфируемого удара. Свойство вида — живёт в дефе
   * вида, а не таблицей в общем AI.
   *
   * Босс объявляет ровно это же поле внутри `boss`, поэтому второй строки ему не
   * нужно: `monsterWindup()` берёт `windup ?? boss`.
   */
  windup?: MonsterWindupDef;
  /**
   * Рывок: числа разгона, попадания и удара о мир. Свойство вида, как и замах.
   *
   * Замах телеграфирует, рывок ЕДЕТ — это разные половины одного удара, поэтому
   * строки две, а не одна: длина замаха и способ его срыва живут в `windup`,
   * длина броска, зазор до цели, самоурон и цена столкновения — здесь.
   */
  dash?: MonsterDashDef;
  /**
   * Спецудар: тексты и кровь применения урона. Третья половина того же удара.
   *
   * Замах телеграфирует, рывок ЕДЕТ, спецудар ПРИКЛАДЫВАЕТ. Строк три, потому
   * что виды берут эти половины по отдельности: Косторез замахивается стоя,
   * Жорная рвётся без замаха, а корень Кровавого растения не делает ни того,
   * ни другого — и всё-таки прикладывает урон тем же шагом.
   */
  strike?: MonsterStrikeDef;
  /**
   * Как вид отвечает на жёсткий свет в упор (УФ-прожектор ликвидатора).
   *
   * Массив — строка НА СТАДИЮ (`Entity.monsterStage`): сорванный головной
   * слизень отвечает не тем же, чем сидящий на шее. Нет строки — вид на луч
   * не реагирует, и таких большинство.
   */
  uv?: MonsterUvDef | readonly MonsterUvDef[];
  boss?: MonsterBossReadability;
}

/**
 * Одна строка семьи «как вид реагирует на яркий свет».
 *
 * До сведения это были ПЯТЬ подряд идущих веток `if (target.monsterKind === …)`
 * в общем инструменте (`systems/uv_spotlight.ts`): пять раз один и тот же блок
 * «поднять откат → толкнуть от луча → ужать спрайт → потерять цель и маршрут →
 * поставить паузу», и различались они только числами и одной строкой тега.
 * Прожектор — общий инструмент, и знать имена видов ему незачем.
 */
export interface MonsterUvDef {
  /** Тег эффекта: уходит в событие, в теги и в разбор на стороне читателей. */
  effect: string;
  /** Откат удара после засветки, сек. */
  attackCd: number;
  /** Пауза до следующего решения (`ai.timer`), сек. */
  daze: number;
  /** Сдвиг от луча, клеток. Нет поля — вид стоит на месте (Глаз). */
  push?: number;
  /** Ужимка спрайта: видно, что вид скукожило. */
  scale?: number;
  /**
   * Урон: доля `maxHp`, но не ниже `damageMin`. Тип — ЭНЕРГИЯ, и он идёт через
   * единую дверь, поэтому врождённая броня твари его встречает. Не смертельный:
   * прожектор гонит с места, а не убивает.
   */
  damageFrac?: number;
  damageMin?: number;
  /** Сбросить цель до блуждания, а не просто потерять её. */
  wander?: boolean;
  /** Оглушение (`ai.staggerTimer`), сек. */
  stagger?: number;
  /**
   * Сколько секунд вид НЕ ДЕЛАЕТ СВОЁ ГЛАВНОЕ после засветки.
   *
   * Одно число на две механики, потому что механика одна: ослеплённый вид
   * теряет то, ради чего живёт. Лишенный столько не идёт на свет, головной
   * слизень столько не переползает. Кому именно отдать число, решает флаг вида
   * (`lightFollower`, `hostParasite`), а не имя.
   */
  blindSec?: number;
}

/**
 * Строка ответа вида на свет с учётом стадии.
 *
 * Стадии нет или строка одна — берётся она же: вид без стадий отвечает всегда
 * одинаково.
 */
export function monsterUv(kind: MonsterKind | undefined, stage: number | undefined): MonsterUvDef | undefined {
  const uv = kind === undefined ? undefined : MONSTERS[kind]?.uv;
  if (uv === undefined) return undefined;
  return Array.isArray(uv) ? uv[stage ?? 0] ?? uv[0] : uv as MonsterUvDef;
}

/**
 * Одна строка семьи «применение спецурона».
 *
 * До сведения общий блок «дверь урона → запись игроку → добивание → кровь →
 * строка убийства» был переписан руками в ОДИННАДЦАТИ функциях `ai/monster.ts`,
 * и различались копии не замыслом, а тем, ЧЕГО в них не дописали: у одной не
 * было записи урона игроку на смертельном ударе, у двух кровь лилась мимо
 * отладочного бессмертия, у трёх не было строки убийства вовсе. Всё, чем удары
 * отличаются по существу, стало колонками; всё, чем они отличались случайно,
 * исчезло.
 *
 * `%s` в тексте — имя бьющего, `%t` — имя убитого. Подстановка, а не
 * склеивание: удар может называть себя не именем вида («Протокол сжал виски»),
 * и это его право, а не повод держать своё тело.
 */
export interface MonsterStrikeDef {
  /**
   * База урона, если удар бьёт НЕ полным уроном вида.
   *
   * Заполняет её тот, у кого удар второй: ближний тычок Слепоглаза слабее его
   * же луча, и это свойство удара, а не вида.
   */
  damage?: number;
  /** Запись урона игроку. Хвост `: -N` дописывает общий шаг. */
  hurt?: string;
  /** Строка убийства. Без неё удар о смерти молчит. */
  kill?: string;
  /** Цвет строки убийства. Без поля — общий красный. */
  killColor?: string;
  /**
   * Брызги крови на попадании.
   *
   * `false` — удар приходит не по телу: пси-сверка протокола и давление мокрой
   * линии не рвут кожу и крови не дают.
   */
  blood?: boolean;
}

/**
 * Обстановочная кормушка вида: веса комнат и веса клеток.
 *
 * Комнаты и признаки, не названные в строке, весят ноль — «эта обстановка вид
 * не кормит». Отдельного списка «годных признаков» поэтому не нужно: он и был
 * второй записью того же знания (`isOfficeFieldFeature` рядом с тройкой
 * литералов веса).
 */
export interface MonsterAffinityDef {
  rooms?: Partial<Record<RoomType, number>>;
  features?: Partial<Record<Feature, number>>;
  /** Потолок суммы. Без него поле росло бы с размером комнаты без предела. */
  cap: number;
}

/** Строка спецудара этого вида. */
export function monsterStrike(kind: MonsterKind | undefined): MonsterStrikeDef | undefined {
  return kind === undefined ? undefined : MONSTERS[kind]?.strike;
}

/**
 * Одна строка семьи «разогнаться по вектору и либо попасть, либо врезаться».
 *
 * До сведения мысль была написана пять раз — прыжок Ржавника, бросок Жорной,
 * спринт Трескотника, разгон Дикого Мертвяка и фланговый бросок Тонкой Тени, —
 * и различались они не замыслом, а авторами: ЧЕТЫРЕ разных предиката «не
 * проскочить сквозь стену», самоурон ровно у одного из пяти и радиус тела,
 * известный тоже ровно одному. Всё, чем виды отличаются ПО СУЩЕСТВУ, стало
 * колонками; всё, чем они отличались случайно, исчезло.
 */
export interface MonsterDashDef {
  /** Длина мгновенного рывка в клетках. Разгоняющиеся виды поля не заполняют. */
  step?: number;
  /**
   * Зазор до цели: рывок встаёт, не доходя на столько клеток.
   *
   * Ржавник останавливается за 0.65 и бьёт с вытянутых прутьев, Жорная тварь
   * влетает в цель телом. Разница была спрятана литералом в теле функции —
   * теперь она объявлена и видна рядом с радиусом попадания.
   */
  gap?: number;
  /** Радиус попадания рывком в клетках. */
  hitRange?: number;
  /** Множитель урона рывка поверх базового урона вида. */
  damageMult?: number;
  /**
   * Упёршийся скользит вдоль препятствия общим шагом вместо того, чтобы встать.
   *
   * Это и есть ответ «что при упоре в стену»: скольжение теряет засаду, но
   * оставляет тварь целой; остановка — цена для тех, кто платит за неё телом.
   */
  slideOnBlock?: boolean;
  /** Мебель-укрытие рвёт рывок так же, как бетон. */
  coverBlocks?: boolean;
  /** Самоурон о препятствие, доля `maxHp`. */
  crashSelfDamage?: number;
  /** Самоурон о цель, доля `maxHp`. */
  strikeSelfDamage?: number;
  /** Оглушение после удара о геометрию. */
  crashStunSec?: number;
  /** Потолок скорости разгона в долях обычного хода вида. */
  speedMult?: number;
  /** Пол скорости разгона в клетках в секунду. */
  minSpeed?: number;
  /** Разгон в долях обычного хода за секунду. Без него скорость сразу потолочная. */
  accel?: number;
  /** Длительность разгона. Без неё — до столкновения или контакта. */
  runSec?: number;
  /**
   * Цена СОСТОЯВШЕГОСЯ удара о мир: корпус становится хрупким навсегда.
   *
   * Доля `maxHp`, ниже которой здоровье уже не поднимется, и потолок множителя
   * урона. Числа были двумя константами вида в теле общего AI
   * (`RZHAVNIK_FRAGILE_HP_MULT`, `RZHAVNIK_FRAGILE_DMG_MULT`) — а это свойство
   * вида ровно в той же мере, что и длина его рывка.
   *
   * Платит только тот, чей рывок ДОШЁЛ: сорванный о собственную стену остаётся
   * целым (`slideOnBlock`).
   */
  fragileHpMult?: number;
  fragileDmgMult?: number;
  /** Подсказка контрплея в событии читаемости рывка. */
  counterplay?: string;
}

/** Строка рывка этого вида. */
export function monsterDash(kind: MonsterKind | undefined): MonsterDashDef | undefined {
  return kind === undefined ? undefined : MONSTERS[kind]?.dash;
}

export interface MonsterBossPhaseCue {
  hpPct: number;
  tag: string;
  line: string;
}

/**
 * Одна строка семьи «замах и телеграфируемый удар».
 *
 * До сведения эта мысль была написана в четырёх местах: таблица
 * `bladeEliteTuning` на два вида, семь `switch (kind)` по видам дальнобойных,
 * `MonsterBossReadability` на трёх боссов и константы вида россыпью в
 * `ai/monster.ts`. Поля с необязательным типом имеют общий умолчательный
 * ответ в шаге замаха — вид заполняет только то, чем отличается.
 */
export interface MonsterWindupDef {
  /** Длина замаха в секундах. */
  windupSec: number;
  /** Дальность, с которой замах ЗАВОДИТСЯ. */
  range: number;
  /** Мёртвая зона: ближе замах не заводится. */
  minRange: number;
  /** Дальность СРЫВА заведённого замаха. Без поля — та же `range`. */
  breakRange?: number;
  /** Боль от дроби по замаху. Без поля вид дробью не сбивается. */
  staggerSec?: number;
  /** Дальше этого вид забывает цель замаха. */
  escapeDist?: number;
  /**
   * Мебель рвёт линию так же, как бетон.
   *
   * Единственная колонка таблицы, за которой стоит осознанное авторское
   * решение: Косторез режет через стол (`false`), Сейфгард — нет (`true`),
   * и в этом вся разница между ними как противниками.
   */
  coverBlocks?: boolean;
  /** Метка вида в событиях читаемости. Без поля — имя вида в нижнем регистре. */
  tag?: string;
  /** Цвет строк замаха в логе. */
  color?: string;
  /** Строка при первом взгляде на цель. `%s` — имя твари. */
  warningLine?: string;
  /** Строка на взводе. `%s` — имя твари. */
  windupLine?: string;
  /** Строка на срыве. */
  interruptLine?: string;
  /** Строка, когда замах сбили дробью. */
  staggerLine?: string;
  /** Глагол удара в строке попадания. */
  strikeVerb?: string;
  /**
   * Подсказка контрплея в событии читаемости.
   *
   * Слухов здесь НЕТ по разбору: у Кострореза и Сейфгарда своя копия списка
   * слухов лежала рядом с боевым AI и слово в слово совпадала с
   * `MonsterEcologyDef.rumorIds`. Копия снята, слухи у всех берутся из экологии.
   */
  counterplay?: string;
}

export interface MonsterBossReadability extends MonsterWindupDef {
  warningLine: string;
  windupLine: string;
  interruptLine: string;
  deathCause: string;
  counterplay: string;
  phases: readonly MonsterBossPhaseCue[];
}

/**
 * Строка замаха этого вида. Боссы объявляют её внутри `boss` — второй копии им
 * не нужно, `MonsterBossReadability` и есть строка замаха плюс фазы.
 */
export function monsterWindup(kind: MonsterKind | undefined): MonsterWindupDef | undefined {
  if (kind === undefined) return undefined;
  const def = MONSTERS[kind];
  return def?.windup ?? def?.boss;
}

// Import all monsters
import { DEF as SBORKA_DEF, generateSprite as genSborka } from './sborka';
import { DEF as TVAR_DEF, generateSprite as genTvar } from './tvar';
import { DEF as POLZUN_DEF, generateSprite as genPolzun } from './polzun';
import { DEF as BETONNIK_DEF, generateSprite as genBetonnik } from './betonnik';
import { DEF as BETONOED_DEF, generateSprite as genBetonoed } from './betonoed';
import { DEF as ZOMBIE_DEF, generateSprite as genZombie } from './zombie';
import { DEF as EYE_DEF, generateSprite as genEye, generateBoltSprite as genEyeBolt } from './eye';
import { DEF as NIGHTMARE_DEF, generateSprite as genNightmare } from './nightmare';
import { DEF as SHADOW_DEF, generateSprite as genShadow } from './shadow';
import { DEF as TONKAYA_TEN_DEF, generateSprite as genTonkayaTen } from './tonkaya_ten';
import { DEF as GLUBINNAYA_TEN_DEF, generateSprite as genGlubinnayaTen } from './glubinnaya_ten';
import { DEF as REBAR_DEF, generateSprite as genRebar } from './rebar';
import { DEF as MATKA_DEF, generateSprite as genMatka } from './matka';
import { DEF as KHOROVAYA_MATKA_DEF, generateSprite as genKhorovayaMatka } from './khorovaya_matka';
import { DEF as IDOL_DEF, generateSprite as genIdol } from './idol';
import { DEF as KANTSELYARSKIY_IDOL_DEF, generateSprite as genKantselyarskiyIdol } from './kantselyarskiy_idol';
import { DEF as MANCOBUS_DEF, generateSprite as genMancobus } from './mancobus';
import { DEF as HERALD_DEF, generateSprite as genHerald } from './herald';
import { DEF as CREATOR_DEF, generateSprite as genCreator } from './creator';
import { DEF as SPIRIT_DEF, generateSprite as genSpirit } from './spirit';
import { DEF as ROBOT_DEF, generateSprite as genRobot } from './robot';
import { DEF as SHOVNIK_DEF, generateSprite as genShovnik } from './shovnik';
import { DEF as LAMPOVY_DEF, generateSprite as genLampovy } from './lampovy';
import { DEF as LAMPOGLAZ_DEF, generateSprite as genLampoglaz } from './lampoglaz';
import { DEF as PECHATEED_DEF, generateSprite as genPechateed } from './pechateed';
import { DEF as KONTORSHCHIK_DEF, generateSprite as genKontorshchik } from './kontorshchik';
import { DEF as TUBE_EEL_DEF, generateSprite as genTubeEel } from './tube_eel';
import { DEF as LOTOCHNIK_DEF, generateSprite as genLotochnik } from './lotochnik';
import { DEF as PARAGRAPH_DEF, generateSprite as genParagraph } from './paragraph';
import { DEF as NELYUD_DEF, generateSprite as genNelyud } from './nelyud';
import { DEF as KRYSNOZHKA_DEF, generateSprite as genKrysnozhka } from './krysnozhka';
import { DEF as POMOYNY_ROY_DEF, generateSprite as genPomoynyRoy } from './pomoynyy_roy';
import { DEF as KOSTOREZ_DEF, generateSprite as genKostorez } from './kostorez';
import { DEF as SAFEGUARD_DEF, generateSprite as genSafeguard } from './safeguard';
import { DEF as BLACK_LIQUIDATOR_DEF, generateSprite as genBlackLiquidator } from './black_liquidator';
import { DEF as PANELNIK_DEF, generateSprite as genPanelnik } from './panelnik';
import { DEF as SLIMEVIK_DEF, generateSprite as genSlimevik } from './slimevik';
import { DEF as SOBRANNYY_DEF, generateSprite as genSobrannyy } from './sobrannyy';
import { DEF as CHERNOSLIZ_DEF, generateSprite as genChernosliz } from './chernosliz';
import { DEF as BORSHCHEVIK_DEF, generateSprite as genBorshchevik } from './borshchevik';
import { DEF as ZHORNAYA_TVAR_DEF, generateSprite as genZhornayaTvar } from './zhornaya_tvar';
import { DEF as TUMANNIK_DEF, generateSprite as genTumannik } from './tumannik';
import { DEF as SLEPOGLAZ_DEF, generateSprite as genSlepoglaz } from './slepoglaz';
import { DEF as PSEUDOLIFT_DEF, generateSprite as genPseudolift } from './pseudolift';
import { DEF as OLGOY_DEF, generateSprite as genOlgoy } from './olgoy';
import { DEF as VODYANOY_KOSHMAR_DEF, generateSprite as genVodyanoyKoshmar } from './vodyanoy_koshmar';
import { DEF as DIKIY_MERTVYAK_DEF, generateSprite as genDikiyMertvyak } from './dikiy_mertvyak';
import { DEF as OBZHIVALSHCHIK_DEF, generateSprite as genObzhivalshchik } from './obzhivalshchik';
import { DEF as RZHAVNIK_DEF, generateSprite as genRzhavnik } from './rzhavnik';
import { DEF as ZAKALENNAYA_ARMATURA_DEF, generateSprite as genZakalennayaArmatura } from './zakalennaya_armatura';
import { DEF as PROTOKOLNIK_DEF, generateSprite as genProtokolnik } from './protokolnik';
import { DEF as BEZEKHIY_DEF, generateSprite as genBezekhiy } from './bezekhiy';
import { DEF as TRUBNYY_AVTOMAT_DEF, generateSprite as genTrubnyyAvtomat } from './trubnyy_avtomat';
import { DEF as LOZHNYY_DUKH_DEF, generateSprite as genLozhnyyDukh } from './lozhnyy_dukh';
import { DEF as TRESKOTNIK_DEF, generateSprite as genTreskotnik } from './treskotnik';
import { DEF as GREEN_DOG_DEF, generateSprite as genGreenDog } from './green_dog';
import { DEF as SLIME_WOMAN_DEF, generateSprite as genSlimeWoman } from './slime_woman';
import { DEF as GNILUSHKA_DEF, generateSprite as genGnilushka } from './gnilushka';
import { DEF as PAUPSINA_DEF, generateSprite as genPaupsina } from './paupsina';
import { DEF as HEAD_SLUG_DEF, generateSprite as genHeadSlug } from './head_slug';
import { DEF as CHERVIE_AVATAR_DEF, generateSprite as genChervieAvatar } from './chervie_avatar';
import { DEF as MUKHOZHUK_HOST_DEF, generateSprite as genMukhozhukHost } from './mukhozhuk';
import { DEF as FOG_SHARK_DEF, generateSprite as genFogShark } from './fog_shark';
import { DEF as BLOOD_PLANT_DEF, generateSprite as genBloodPlant } from './blood_plant';
import { DEF as SPORE_CARPET_DEF, generateSprite as genSporeCarpet } from './spore_carpet';
import { DEF as SWARM_DEF, generateSprite as genSwarm } from './swarm_mass';
import { DEF as LISHENNYY_DEF, generateSprite as genLishennyy } from './lishennyy';
import { DEF as SCULPTURE_DEF, generateSprite as genSculpture } from './sculpture';
import { DEF as GNOME_DEF, generateSprite as genGnome } from './gnome';
import { DEF as BASHNYA_DEF, generateSprite as genBashnya } from './bashnya';
import { DEF as GNEZDO_DEF, generateSprite as genGnezdo } from './gnezdo';
import { DEF as BOEC_DEF, generateSprite as genBoec } from './boec';
import { DEF as LOGOVO_DEF, generateSprite as genLogovo } from './logovo';

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  [MonsterKind.SBORKA]:    SBORKA_DEF,
  [MonsterKind.TVAR]:      TVAR_DEF,
  [MonsterKind.POLZUN]:    POLZUN_DEF,
  [MonsterKind.BETONNIK]:  BETONNIK_DEF,
  [MonsterKind.BETONOED]:  BETONOED_DEF,
  [MonsterKind.ZOMBIE]:    ZOMBIE_DEF,
  [MonsterKind.EYE]:       EYE_DEF,
  [MonsterKind.NIGHTMARE]: NIGHTMARE_DEF,
  [MonsterKind.SHADOW]:    SHADOW_DEF,
  [MonsterKind.TONKAYA_TEN]: TONKAYA_TEN_DEF,
  [MonsterKind.GLUBINNAYA_TEN]: GLUBINNAYA_TEN_DEF,
  [MonsterKind.REBAR]:     REBAR_DEF,
  [MonsterKind.MATKA]:     MATKA_DEF,
  [MonsterKind.KHOROVAYA_MATKA]: KHOROVAYA_MATKA_DEF,
  [MonsterKind.IDOL]:      IDOL_DEF,
  [MonsterKind.KANTSELYARSKIY_IDOL]: KANTSELYARSKIY_IDOL_DEF,
  [MonsterKind.MANCOBUS]:  MANCOBUS_DEF,
  [MonsterKind.HERALD]:    HERALD_DEF,
  [MonsterKind.CREATOR]:   CREATOR_DEF,
  [MonsterKind.SPIRIT]:    SPIRIT_DEF,
  [MonsterKind.ROBOT]:     ROBOT_DEF,
  [MonsterKind.SHOVNIK]:   SHOVNIK_DEF,
  [MonsterKind.LAMPOVY]:   LAMPOVY_DEF,
  [MonsterKind.LAMPOGLAZ]: LAMPOGLAZ_DEF,
  [MonsterKind.PECHATEED]: PECHATEED_DEF,
  [MonsterKind.KONTORSHCHIK]: KONTORSHCHIK_DEF,
  [MonsterKind.TUBE_EEL]:  TUBE_EEL_DEF,
  [MonsterKind.LOTOCHNIK]: LOTOCHNIK_DEF,
  [MonsterKind.PARAGRAPH]: PARAGRAPH_DEF,
  [MonsterKind.NELYUD]:    NELYUD_DEF,
  [MonsterKind.KRYSNOZHKA]: KRYSNOZHKA_DEF,
  [MonsterKind.POMOYNY_ROY]: POMOYNY_ROY_DEF,
  [MonsterKind.KOSTOREZ]:  KOSTOREZ_DEF,
  [MonsterKind.SAFEGUARD]: SAFEGUARD_DEF,
  [MonsterKind.BLACK_LIQUIDATOR]: BLACK_LIQUIDATOR_DEF,
  [MonsterKind.PANELNIK]:  PANELNIK_DEF,
  [MonsterKind.PAUPSINA]:  PAUPSINA_DEF,
  [MonsterKind.SLIMEVIK]:  SLIMEVIK_DEF,
  [MonsterKind.SOBRANNYY]: SOBRANNYY_DEF,
  [MonsterKind.BORSHCHEVIK]: BORSHCHEVIK_DEF,
  [MonsterKind.ZHORNAYA_TVAR]: ZHORNAYA_TVAR_DEF,
  [MonsterKind.TUMANNIK]:  TUMANNIK_DEF,
  [MonsterKind.SLEPOGLAZ]: SLEPOGLAZ_DEF,
  [MonsterKind.OBZHIVALSHCHIK]: OBZHIVALSHCHIK_DEF,
  [MonsterKind.HEAD_SLUG]: HEAD_SLUG_DEF,
  [MonsterKind.PSEUDOLIFT]: PSEUDOLIFT_DEF,
  [MonsterKind.CHERNOSLIZ]: CHERNOSLIZ_DEF,
  [MonsterKind.OLGOY]:     OLGOY_DEF,
  [MonsterKind.VODYANOY_KOSHMAR]: VODYANOY_KOSHMAR_DEF,
  [MonsterKind.ZAKALENNAYA_ARMATURA]: ZAKALENNAYA_ARMATURA_DEF,
  [MonsterKind.RZHAVNIK]:  RZHAVNIK_DEF,
  [MonsterKind.DIKIY_MERTVYAK]: DIKIY_MERTVYAK_DEF,
  [MonsterKind.PROTOKOLNIK]: PROTOKOLNIK_DEF,
  [MonsterKind.TRUBNYY_AVTOMAT]: TRUBNYY_AVTOMAT_DEF,
  [MonsterKind.BEZEKHIY]:  BEZEKHIY_DEF,
  [MonsterKind.LOZHNYY_DUKH]: LOZHNYY_DUKH_DEF,
  [MonsterKind.CHERVIE_AVATAR]: CHERVIE_AVATAR_DEF,
  [MonsterKind.TRESKOTNIK]: TRESKOTNIK_DEF,
  [MonsterKind.GREEN_DOG]: GREEN_DOG_DEF,
  [MonsterKind.SLIME_WOMAN]: SLIME_WOMAN_DEF,
  [MonsterKind.GNILUSHKA]: GNILUSHKA_DEF,
  [MonsterKind.MUKHOZHUK_HOST]: MUKHOZHUK_HOST_DEF,
  [MonsterKind.FOG_SHARK]: FOG_SHARK_DEF,
  [MonsterKind.BLOOD_PLANT]: BLOOD_PLANT_DEF,
  [MonsterKind.SWARM]: SWARM_DEF,
  [MonsterKind.SPORE_CARPET]: SPORE_CARPET_DEF,
  [MonsterKind.LISHENNYY]: LISHENNYY_DEF,
  [MonsterKind.SCULPTURE]: SCULPTURE_DEF,
  [MonsterKind.GNOME]:     GNOME_DEF,
  [MonsterKind.BASHNYA]:   BASHNYA_DEF,
  [MonsterKind.GNEZDO]:    GNEZDO_DEF,
  [MonsterKind.BOEC]:      BOEC_DEF,
  [MonsterKind.LOGOVO]:    LOGOVO_DEF,
};

/* Флаги вида, испечённые в множества один раз при загрузке.
 *
 * `aiFlags` — массив, и `includes` по нему шёл ЛИНЕЙНО на каждый вопрос. Вопрос
 * задаётся десятки раз за такт каждой твари: только два вопроса стенной
 * читаемости стоили 2.6 % времени AI на тёмном отсеке. Ответ у вида не меняется
 * никогда, поэтому он считается один раз, а не 3100 × 60 раз в секунду.
 *
 * Объявление осталось массивом: он читаемее в файле вида и хранит порядок. */
const MONSTER_FLAG_SETS: (ReadonlySet<MonsterAIFlag> | undefined)[] = (() => {
  const baked: (ReadonlySet<MonsterAIFlag> | undefined)[] = [];
  for (const value of Object.values(MonsterKind)) {
    if (typeof value !== 'number') continue;
    const flags = MONSTERS[value as MonsterKind]?.aiFlags;
    baked[value] = flags && flags.length > 0 ? new Set(flags) : undefined;
  }
  return baked;
})();

/**
 * Свойство вида объявлено флагом в его дефе — так его и спрашивают.
 * Общий код не должен знать конкретных `MonsterKind`, ему хватает флага.
 */
export function monsterHasAIFlag(e: { monsterKind?: MonsterKind }, flag: MonsterAIFlag): boolean {
  return e.monsterKind !== undefined && MONSTER_FLAG_SETS[e.monsterKind]?.has(flag) === true;
}

/** Чем бьёт эта тварь. Не тварь или вид молчит — `undefined`, то есть кинетика. */
export function monsterAttackDamageType(e: { monsterKind?: MonsterKind } | undefined): DamageType | undefined {
  return e?.monsterKind !== undefined ? MONSTERS[e.monsterKind]?.damageType : undefined;
}

/**
 * Сколько здоровья удар этого типа снимет с этой твари КАК МИНИМУМ.
 *
 * Ноль означает «порога нет» и ничего не меняет: цель не тварь, вид порогов не
 * объявлял или тип не тот. Считается от `maxHp`, а не от текущего здоровья, —
 * иначе добить раненого стоило бы дешевле, чем целого.
 */
export function monsterDamageFloor(
  target: { monsterKind?: MonsterKind; maxHp?: number; hp?: number },
  damageType: DamageType | undefined,
): number {
  if (target.monsterKind === undefined || damageType === undefined) return 0;
  const share = MONSTERS[target.monsterKind]?.damageFloor?.[damageType];
  if (share === undefined) return 0;
  return Math.ceil(Math.max(1, target.maxHp ?? target.hp ?? 1) * share);
}

export const MONSTER_SPRITES: Record<MonsterKind, () => Uint32Array> = {
  [MonsterKind.SBORKA]:    genSborka,
  [MonsterKind.TVAR]:      genTvar,
  [MonsterKind.POLZUN]:    genPolzun,
  [MonsterKind.BETONNIK]:  genBetonnik,
  [MonsterKind.BETONOED]:  genBetonoed,
  [MonsterKind.ZOMBIE]:    genZombie,
  [MonsterKind.EYE]:       genEye,
  [MonsterKind.NIGHTMARE]: genNightmare,
  [MonsterKind.SHADOW]:    genShadow,
  [MonsterKind.TONKAYA_TEN]: genTonkayaTen,
  [MonsterKind.GLUBINNAYA_TEN]: genGlubinnayaTen,
  [MonsterKind.REBAR]:     genRebar,
  [MonsterKind.MATKA]:     genMatka,
  [MonsterKind.KHOROVAYA_MATKA]: genKhorovayaMatka,
  [MonsterKind.IDOL]:      genIdol,
  [MonsterKind.KANTSELYARSKIY_IDOL]: genKantselyarskiyIdol,
  [MonsterKind.MANCOBUS]:  genMancobus,
  [MonsterKind.HERALD]:    genHerald,
  [MonsterKind.CREATOR]:   genCreator,
  [MonsterKind.SPIRIT]:    genSpirit,
  [MonsterKind.ROBOT]:     genRobot,
  [MonsterKind.SHOVNIK]:   genShovnik,
  [MonsterKind.LAMPOVY]:   genLampovy,
  [MonsterKind.LAMPOGLAZ]: genLampoglaz,
  [MonsterKind.PECHATEED]: genPechateed,
  [MonsterKind.KONTORSHCHIK]: genKontorshchik,
  [MonsterKind.TUBE_EEL]:  genTubeEel,
  [MonsterKind.LOTOCHNIK]: genLotochnik,
  [MonsterKind.PARAGRAPH]: genParagraph,
  [MonsterKind.NELYUD]:    genNelyud,
  [MonsterKind.KRYSNOZHKA]: genKrysnozhka,
  [MonsterKind.POMOYNY_ROY]: genPomoynyRoy,
  [MonsterKind.KOSTOREZ]:  genKostorez,
  [MonsterKind.SAFEGUARD]: genSafeguard,
  [MonsterKind.BLACK_LIQUIDATOR]: genBlackLiquidator,
  [MonsterKind.PANELNIK]:  genPanelnik,
  [MonsterKind.PAUPSINA]:  genPaupsina,
  [MonsterKind.SLIMEVIK]:  genSlimevik,
  [MonsterKind.SOBRANNYY]: genSobrannyy,
  [MonsterKind.BORSHCHEVIK]: genBorshchevik,
  [MonsterKind.ZHORNAYA_TVAR]: genZhornayaTvar,
  [MonsterKind.TUMANNIK]:  genTumannik,
  [MonsterKind.SLEPOGLAZ]: genSlepoglaz,
  [MonsterKind.CHERNOSLIZ]: genChernosliz,
  [MonsterKind.OBZHIVALSHCHIK]: genObzhivalshchik,
  [MonsterKind.HEAD_SLUG]: genHeadSlug,
  [MonsterKind.OLGOY]:     genOlgoy,
  [MonsterKind.VODYANOY_KOSHMAR]: genVodyanoyKoshmar,
  [MonsterKind.PSEUDOLIFT]: genPseudolift,
  [MonsterKind.ZAKALENNAYA_ARMATURA]: genZakalennayaArmatura,
  [MonsterKind.RZHAVNIK]:  genRzhavnik,
  [MonsterKind.DIKIY_MERTVYAK]: genDikiyMertvyak,
  [MonsterKind.PROTOKOLNIK]: genProtokolnik,
  [MonsterKind.TRUBNYY_AVTOMAT]: genTrubnyyAvtomat,
  [MonsterKind.BEZEKHIY]:  genBezekhiy,
  [MonsterKind.LOZHNYY_DUKH]: genLozhnyyDukh,
  [MonsterKind.CHERVIE_AVATAR]: genChervieAvatar,
  [MonsterKind.TRESKOTNIK]: genTreskotnik,
  [MonsterKind.GREEN_DOG]: genGreenDog,
  [MonsterKind.SLIME_WOMAN]: genSlimeWoman,
  [MonsterKind.GNILUSHKA]: genGnilushka,
  [MonsterKind.MUKHOZHUK_HOST]: genMukhozhukHost,
  [MonsterKind.FOG_SHARK]: genFogShark,
  [MonsterKind.BLOOD_PLANT]: genBloodPlant,
  [MonsterKind.SWARM]: genSwarm,
  [MonsterKind.SPORE_CARPET]: genSporeCarpet,
  [MonsterKind.LISHENNYY]: genLishennyy,
  [MonsterKind.SCULPTURE]: genSculpture,
  [MonsterKind.GNOME]:     genGnome,
  [MonsterKind.BASHNYA]:   genBashnya,
  [MonsterKind.GNEZDO]:    genGnezdo,
  [MonsterKind.BOEC]:      genBoec,
  [MonsterKind.LOGOVO]:    genLogovo,
};

export const EYE_BOLT_SPRITE: () => Uint32Array = genEyeBolt;

export const NEW_MONSTER_KINDS: readonly MonsterKind[] = [
  MonsterKind.SHOVNIK,
  MonsterKind.LAMPOVY,
  MonsterKind.LAMPOGLAZ,
  MonsterKind.PECHATEED,
  MonsterKind.KONTORSHCHIK,
  MonsterKind.TUBE_EEL,
  MonsterKind.LOTOCHNIK,
  MonsterKind.PARAGRAPH,
  MonsterKind.NELYUD,
  MonsterKind.KRYSNOZHKA,
  MonsterKind.POMOYNY_ROY,
  MonsterKind.KOSTOREZ,
  MonsterKind.SAFEGUARD,
  MonsterKind.BLACK_LIQUIDATOR,
  MonsterKind.PANELNIK,
  MonsterKind.PAUPSINA,
  MonsterKind.KHOROVAYA_MATKA,
  MonsterKind.SLIMEVIK,
  MonsterKind.SOBRANNYY,
  MonsterKind.BORSHCHEVIK,
  MonsterKind.TONKAYA_TEN,
  MonsterKind.GLUBINNAYA_TEN,
  MonsterKind.ZHORNAYA_TVAR,
  MonsterKind.TUMANNIK,
  MonsterKind.SLEPOGLAZ,
  MonsterKind.BETONOED,
  MonsterKind.CHERNOSLIZ,
  MonsterKind.OBZHIVALSHCHIK,
  MonsterKind.HEAD_SLUG,
  MonsterKind.OLGOY,
  MonsterKind.KANTSELYARSKIY_IDOL,
  MonsterKind.VODYANOY_KOSHMAR,
  MonsterKind.PSEUDOLIFT,
  MonsterKind.ZAKALENNAYA_ARMATURA,
  MonsterKind.RZHAVNIK,
  MonsterKind.DIKIY_MERTVYAK,
  MonsterKind.PROTOKOLNIK,
  MonsterKind.TRUBNYY_AVTOMAT,
  MonsterKind.BEZEKHIY,
  MonsterKind.LOZHNYY_DUKH,
  MonsterKind.CHERVIE_AVATAR,
  MonsterKind.TRESKOTNIK,
  MonsterKind.GREEN_DOG,
  MonsterKind.SLIME_WOMAN,
  MonsterKind.GNILUSHKA,
  MonsterKind.MUKHOZHUK_HOST,
  MonsterKind.FOG_SHARK,
  MonsterKind.BLOOD_PLANT,
  MonsterKind.SWARM,
  MonsterKind.SPORE_CARPET,
  MonsterKind.LISHENNYY,
  MonsterKind.GNOME,
];

/** Get generic type name for a monster kind (e.g. "Бетонник", "Тварь") */
export function monsterTypeName(kind: MonsterKind | undefined): string {
  if (kind === undefined) return 'Монстр';
  return MONSTERS[kind]?.name ?? 'Монстр';
}

/** Display name: NPC uses e.name, monsters use generic type name */
export function entityDisplayName(e: { name?: string; monsterKind?: MonsterKind }): string {
  if (e.name) return e.name;
  if (e.monsterKind !== undefined) return monsterTypeName(e.monsterKind);
  return 'Цель';
}
