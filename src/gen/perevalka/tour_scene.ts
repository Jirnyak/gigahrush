/* ── Перевалка: знакомство с ярусом ───────────────────────────────
 *
 * Кадр выезжает с погрузочной площадки и объезжает четыре двора: грибную артель
 * диких, общинную перевалку гражданских, теневую лабораторию учёных и досмотровую
 * заставу ликвидаторов. У каждого двора — свой хозяин в кадре, и каждый
 * рассказывает СВОЮ версию одной и той же истории: как единый грузовой ярус
 * развалился на четыре доли. Версии не сходятся, и это замысел — правда тут у
 * каждого своя и каждому выгодная.
 *
 * Закрывает сцену не слово, а показ: кадр подъезжает к лифтовому тамбуру,
 * упирается в запертую створку, проходит её (у камеры ключей нет и не надо) и
 * облетает шахту вниз. Игрок выходит из сцены, зная, что вниз ведут шестнадцать
 * лифтов, все шестнадцать за чужими дверьми, и что дверей всего четыре.
 *
 * Своего кода у сцены нет: она объявляет актёров и такты, отыгрывает общий
 * проигрыватель (`cutscene.md`). Хозяева — уже живущие на этаже пакеты NPC:
 * сцена их ЗОВЁТ и ставит на их же рабочее место. Такта `release` здесь нет ни
 * одного: это знакомство, а не бой.
 *
 * ПОЧЕМУ СЦЕНА ПЕРЕРЕГИСТРИРУЕТСЯ. Три четверти её точек — авторские координаты
 * дворов и авеню, они в бетоне. Но показательный тамбур не авторский: лифты
 * ставит единая система шахт по ключу прогона, и до `onAfterPopulate` его
 * координат не существует ни у кого. Поэтому объявление собирается функцией:
 * при импорте — без замка (его ещё нет), а после обноса лифтов этаж зовёт
 * `refreshPerevalkaTourScene` и объявление переписывается с настоящим тамбуром.
 * `registerFloorScene` заменяет сцену по `id` — это её штатное поведение.
 */

import { Faction, Occupation, W } from '../../core/types';
import { designNpcFloorKey } from '../../data/plot';
import { registerFloorScene, type FloorSceneDef, type SceneBeat } from '../../systems/cinematics';
import {
  BASE_HQ_H,
  BASE_HQ_W,
  BASE_WORK_W,
  PEREVALKA_BASES,
  PEREVALKA_DESIGN_FLOOR_ID,
  PEREVALKA_DOCK,
  PEREVALKA_DOCK_ALIAS,
} from './meta';
import type { PerevalkaLiftGate, PerevalkaLiftGateReport } from './lift_gates';

export const PEREVALKA_TOUR_SCENE_ID = 'perevalka_four_doors' as const;
/** Якорь — общий двор: единственное место яруса, не принадлежащее никому из четверых. */
export const PEREVALKA_TOUR_ANCHOR = PEREVALKA_DOCK_ALIAS;

const FLOOR_KEY = designNpcFloorKey(PEREVALKA_DESIGN_FLOOR_ID);

/* ── Цифры этажа ─────────────────────────────────────────────────
 *
 * Всё считается от объявленной геометрии двора и баз, а не от вкуса: те же
 * числа, по которым генератор роет площадку, дворы и въезды с авеню.
 */
const ANCHOR_X = PEREVALKA_DOCK.x + PEREVALKA_DOCK.w / 2;
const ANCHOR_Y = PEREVALKA_DOCK.y + PEREVALKA_DOCK.h / 2;

/** Точка кадра по абсолютным координатам яруса: этаж авторится ими, а не смещениями. */
function at(x: number, y: number): { ox: number; oy: number } {
  return { ox: x - ANCHOR_X, oy: y - ANCHOR_Y };
}

const base = (id: string) => PEREVALKA_BASES.find(spec => spec.id === id)!;
const WILD = base('wild');
const CITIZEN = base('citizen');
const LIQUIDATOR = base('liquidator');
const SCIENCE = base('science');

/* Ряд въездной двери двора и ряд общей стены штаба с рабочей комнатой: обе
 * двери генератор ставит ровно по этим строкам (`yard.ts`). Кадр идёт по ним же,
 * и потому даже вынужденный прямой ход проходит СКВОЗЬ ПРОЁМ, а не сквозь бетон. */
const GATE_ROW = (spec: typeof WILD) => spec.y + (BASE_HQ_H >> 1) - 6;
const MID_ROW = (spec: typeof WILD) => spec.y + (BASE_HQ_H >> 1);
/** Клетка сразу за въездной дверью, внутри штаба. */
const DOOR_IN = (spec: typeof WILD) => at(spec.x + 3, GATE_ROW(spec));
/** Улица перед въездом: авеню, с которой двор выходит наружу. */
const GATE_OUT = (spec: typeof WILD) => at(spec.x - 16, GATE_ROW(spec));
const HQ_MID = (spec: typeof WILD) => at(spec.x + (BASE_HQ_W >> 1) - 2, MID_ROW(spec));
/** Последняя клетка штаба перед общей стеной: отсюда прямой ход идёт в проём. */
const HQ_SHARE = (spec: typeof WILD) => at(spec.x + BASE_HQ_W - 1, MID_ROW(spec));
/** Середина рабочей комнаты: ферма, общий стол, пакгауз, тенеловка. */
const WORK_MID = (spec: typeof WILD) => at(spec.x + BASE_HQ_W + 1 + (BASE_WORK_W >> 1), MID_ROW(spec));

const DOCK = at(ANCHOR_X, ANCHOR_Y);
const DOCK_CREW = at(ANCHOR_X, ANCHOR_Y + 9);
/** Выезд с площадки: дверь смотрит на северный разгрузочный проход. */
const DOCK_OUT = at(ANCHOR_X, 468);

/* Грузовые авеню, по которым идёт весь проезд. Шаг решётки 128, смещение 96
 * (`yard.ts`), поэтому это настоящие координаты линий, а не круглые числа.
 *
 * Выезд и возвращение идут ОДНИМ кольцом (авеню y=480): двор стоит на нём, и
 * кадру не приходится обходить времянки, которые перерезают соседнюю авеню
 * x=352 поперёк. Замерено: обход стоил около пятисот клеток дороги. */
const AV_RING_EAST = at(480, 481);
const AV_RING_WEST = at(224, 481);
const AV_NORTH_WEST = at(224, 96);
const AV_NORTH_EAST = at(736, 96);
const AV_EAST_SOUTH = at(736, 608);
const AV_SOUTH_WEST = at(224, 608);

/* Скорости кадра — по длине маршрута, а не на глаз. Авеню прямые, широкие и
 * освещённые, и быстрый проезд по ним читается трассой; двор и комнаты
 * смотрят медленно. */
const V_HIGHWAY = 56;
const V_STREET = 34;
const V_APPROACH = 22;
const V_ROOM = 11;
const V_CLOSE = 8;

/* Облёт считается от комнаты: штаб 40x28, рабочая комната 30x28, площадка 64x34.
 * Половина меньшей стороны минус клетка — тринадцать; пять дают близкий кадр с
 * запасом, и круг ни разу не идёт прижатым к простенку. */
const ROOM_ORBIT = 5;
const DOCK_ORBIT = 6;
/** Тамбур — квадрат 9x9 в лучшем случае и 3x3 в худшем, когда рядом чужая шахта. */
const GATE_ORBIT = 2;

const DOCKER_VOICE = '#a9b1a6';
const DANTES_VOICE = '#c8b48a';
const ARIEL_VOICE = '#ccd6dd';
const ZHIRNYAK_VOICE = '#b6c5ba';
const TOMILOV_VOICE = '#c2c7cb';

/** Свой поводок говорящему: общего у сцены нет, а пост держит кадр на человеке. */
const OWNER_LEASH = 3;

/* ── Показательный тамбур ────────────────────────────────────────
 *
 * Из четырёх тамбуров заставы берётся ближайший к общему двору: на обратной
 * дороге он лежит по пути, и после него кадру недалеко возвращаться к игроку.
 * Выбор детерминирован — при равном расстоянии решает номер клетки, а не
 * порядок обхода отчёта.
 */
function pickShowcaseGate(gates: readonly PerevalkaLiftGate[]): PerevalkaLiftGate | null {
  // Показывается дверь ТОМИЛОВА: он говорит про замок последним, и его двор —
  // последний на объезде. Если застава почему-то не держит ни одного лифта,
  // годится любой: смысл кадра в запертой створке, а не в имени на ней.
  const own = gates.filter(gate => gate.baseId === LIQUIDATOR.id);
  let best: PerevalkaLiftGate | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const gate of (own.length ? own : gates)) {
    const dx = Math.abs(((gate.x - ANCHOR_X + W * 1.5) % W) - W / 2);
    const dy = Math.abs(((gate.y - ANCHOR_Y + W * 1.5) % W) - W / 2);
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && best !== null && gate.idx < best.idx)) {
      bestD = d;
      best = gate;
    }
  }
  return best;
}

/**
 * Два такта замка: подъезд к запертой створке снаружи и проход внутрь, к шахте.
 *
 * Кнопка лифта стоит клеткой восточнее шахты (`lift_gates.ts`), она проходима, и
 * потому именно она — точка кадра: сама клетка шахты непроходима, вставать в неё
 * камере незачем, а в кадре она всё равно рядом.
 */
function lockBeats(gate: PerevalkaLiftGate | null): SceneBeat[] {
  if (!gate) return [];
  const doorX = gate.doorIdx % W;
  const doorY = (gate.doorIdx / W) | 0;
  return [
    // Подъезд берётся не «на две клетки от створки»: снаружи двери бывает
    // бетон, и такая точка приземлялась бы куда попало. Обнос сам называет
    // клетку, к которой прорубил подход, и она заведомо ходибельная.
    { kind: 'fly', to: at(gate.approachX, gate.approachY), look: at(doorX, doorY), speed: 26, height: 1.3 },
    { kind: 'pause', seconds: 1.6 },
    { kind: 'fly', to: at(gate.x + 1, gate.y), speed: 4, height: 1.0 },
    { kind: 'orbit', around: at(gate.x + 1, gate.y), radius: GATE_ORBIT, speed: 0.32, height: 1.0, seconds: 5 },
  ];
}

/* ── Объявление ──────────────────────────────────────────────── */

export function buildPerevalkaTourScene(gate: PerevalkaLiftGate | null): FloorSceneDef {
  return {
    id: PEREVALKA_TOUR_SCENE_ID,
    floorKey: FLOOR_KEY,
    trigger: { kind: 'first_visit' },
    anchorRoomAlias: PEREVALKA_TOUR_ANCHOR,
    /* Потолок с запасом, и запас взят от ЗАМЕРА, а не от круглого числа. Проезд
     * по четырём углам яруса — около четырёх тысяч клеток дороги: дворы стоят по
     * углам мира, короче объезд не сделать. Замерено на шестнадцати ключах
     * прогона: от 192 до 252 секунд. Разброс даёт не сцена, а геометрия — тамбур
     * девять на девять садится туда, где лёг лифт, и иногда режет авеню поперёк,
     * после чего подъезд к соседнему двору идёт в обход. Упереться в потолок
     * значит потерять замок в конце, ради которого всё и снято. */
    maxSeconds: 300,
    actors: [
      /* Двор: грузчики. Безымянные и потому честные — они и открывают, и
       * закрывают сцену, а между ними говорят те, у кого есть доля. */
      {
        role: 'dockers',
        count: 6,
        faction: Faction.CITIZEN,
        occupation: Occupation.STOREKEEPER,
        level: 2,
        ...DOCK_CREW,
        spread: 5,
      },

      /* Хозяева. Сцена их не создаёт, а зовёт — и ставит туда, где у каждого
       * дело: Дантеса на ферму, Ариэль за стол переговоров, Жирняка в бокс,
       * Томилова в пакгауз изъятого. */
      { role: 'dantes', packageId: 'perevalka_dantes', ...WORK_MID(WILD), leash: OWNER_LEASH },
      { role: 'ariel', packageId: 'perevalka_ariel', ...HQ_MID(CITIZEN), leash: OWNER_LEASH },
      { role: 'zhirnyak', packageId: 'perevalka_zhirnyak', ...WORK_MID(SCIENCE), leash: OWNER_LEASH },
      { role: 'tomilov', packageId: 'perevalka_tomilov', ...WORK_MID(LIQUIDATOR), leash: OWNER_LEASH },

      /* Свита. У троих она есть, у Жирняка её нет — и это не экономия, а его
       * характеристика: с ним никто не хочет иметь дел, и бокс пустой. */
      {
        role: 'farmhands',
        count: 5,
        faction: Faction.WILD,
        occupation: Occupation.TRAVELER,
        level: 3,
        ...at(WILD.x + BASE_HQ_W + 8, MID_ROW(WILD) + 6),
        spread: 6,
      },
      {
        role: 'queue',
        count: 6,
        faction: Faction.CITIZEN,
        occupation: Occupation.TRAVELER,
        level: 1,
        ...at(CITIZEN.x + 12, MID_ROW(CITIZEN) + 7),
        spread: 6,
      },
      {
        role: 'inspectors',
        count: 4,
        faction: Faction.LIQUIDATOR,
        occupation: Occupation.HUNTER,
        level: 5,
        ...at(LIQUIDATOR.x + BASE_HQ_W + 8, MID_ROW(LIQUIDATOR) - 6),
        spread: 5,
      },
    ],
    beats: [
      /* ── Двор: с чего всё грузится ─────────────────────────── */
      { kind: 'fly', to: DOCK, look: { role: 'dockers' }, speed: 28, height: 1.8 },
      { kind: 'say', role: 'dockers', text: 'Перевалка. Всё, что идёт вниз, идёт отсюда.', color: DOCKER_VOICE, seconds: 3.4 },
      { kind: 'orbit', around: { speaker: true }, radius: DOCK_ORBIT, speed: 0.22, height: 1.3, seconds: 5 },
      { kind: 'say', role: 'dockers', text: 'И ничего не идёт просто так.', color: DOCKER_VOICE, seconds: 2.8 },

      /* ── Северо-запад: дикие ───────────────────────────────── */
      { kind: 'fly', to: DOCK_OUT, speed: V_APPROACH, height: 1.6 },
      { kind: 'fly', to: AV_RING_EAST, speed: V_STREET, height: 1.9 },
      { kind: 'fly', to: AV_RING_WEST, speed: V_HIGHWAY, height: 2.0 },
      { kind: 'fly', to: GATE_OUT(WILD), speed: V_HIGHWAY, height: 1.9 },
      { kind: 'fly', to: DOOR_IN(WILD), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_MID(WILD), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_SHARE(WILD), speed: V_ROOM, height: 1.1 },
      { kind: 'fly', to: WORK_MID(WILD), look: { role: 'dantes' }, speed: V_CLOSE, height: 1.1 },
      { kind: 'say', role: 'dantes', text: 'Ярус был один. Отец держал его страхом, и ярус стоял ровно.', color: DANTES_VOICE, seconds: 4.2 },
      { kind: 'orbit', around: { speaker: true }, radius: ROOM_ORBIT, speed: 0.22, height: 1.1, seconds: 4.5 },
      { kind: 'say', role: 'dantes', text: 'Пришла проверка. Отца не стало. Ярус растащили по углам.', color: DANTES_VOICE, seconds: 4.2 },
      { kind: 'say', role: 'dantes', text: 'Вечером у меня концерт. Явка добровольная. Отсутствующих я запоминаю.', color: DANTES_VOICE, seconds: 4.6 },

      /* ── Северо-восток: гражданские ────────────────────────── */
      { kind: 'fly', to: HQ_SHARE(WILD), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: DOOR_IN(WILD), speed: V_APPROACH, height: 1.3 },
      { kind: 'fly', to: GATE_OUT(WILD), speed: V_APPROACH, height: 1.5 },
      { kind: 'fly', to: AV_NORTH_WEST, speed: V_STREET, height: 1.9 },
      { kind: 'fly', to: AV_NORTH_EAST, speed: V_HIGHWAY, height: 2.0 },
      { kind: 'fly', to: GATE_OUT(CITIZEN), speed: V_APPROACH, height: 1.6 },
      { kind: 'fly', to: DOOR_IN(CITIZEN), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_MID(CITIZEN), look: { role: 'ariel' }, speed: V_CLOSE, height: 1.1 },
      { kind: 'say', role: 'ariel', text: 'Дантес сказал «гастащили»? Ах. Никто ничего не тащил.', color: ARIEL_VOICE, seconds: 4.0 },
      { kind: 'orbit', around: { speaker: true }, radius: ROOM_ORBIT, speed: -0.22, height: 1.1, seconds: 4.5 },
      { kind: 'say', role: 'ariel', text: 'Все сели за стол. Встали уже с долями. Стол накгывала я.', color: ARIEL_VOICE, seconds: 4.2 },

      /* ── Юго-восток: учёные ────────────────────────────────── */
      { kind: 'fly', to: DOOR_IN(CITIZEN), speed: V_APPROACH, height: 1.3 },
      { kind: 'fly', to: GATE_OUT(CITIZEN), speed: V_APPROACH, height: 1.5 },
      { kind: 'fly', to: AV_EAST_SOUTH, speed: V_HIGHWAY, height: 2.0 },
      { kind: 'fly', to: GATE_OUT(SCIENCE), speed: V_APPROACH, height: 1.6 },
      { kind: 'fly', to: DOOR_IN(SCIENCE), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_MID(SCIENCE), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_SHARE(SCIENCE), speed: V_ROOM, height: 1.1 },
      { kind: 'fly', to: WORK_MID(SCIENCE), look: { role: 'zhirnyak' }, speed: V_CLOSE, height: 1.0 },
      { kind: 'say', role: 'zhirnyak', text: 'Делили ярус. Мне оставили угол потемнее. Правильно сделали.', color: ZHIRNYAK_VOICE, seconds: 4.2 },
      { kind: 'orbit', around: { speaker: true }, radius: ROOM_ORBIT, speed: 0.26, height: 1.0, seconds: 4.5 },
      { kind: 'say', role: 'zhirnyak', text: 'Тень выходит раньше тела. Раньше! Тут пусто. Я так попросил.', color: ZHIRNYAK_VOICE, seconds: 4.4 },

      /* ── Юго-запад: ликвидаторы, и с ними правда ───────────── */
      { kind: 'fly', to: HQ_SHARE(SCIENCE), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: DOOR_IN(SCIENCE), speed: V_APPROACH, height: 1.3 },
      { kind: 'fly', to: GATE_OUT(SCIENCE), speed: V_APPROACH, height: 1.5 },
      { kind: 'fly', to: AV_EAST_SOUTH, speed: V_STREET, height: 1.8 },
      { kind: 'fly', to: AV_SOUTH_WEST, speed: V_HIGHWAY, height: 2.0 },
      { kind: 'fly', to: GATE_OUT(LIQUIDATOR), speed: V_APPROACH, height: 1.6 },
      { kind: 'fly', to: DOOR_IN(LIQUIDATOR), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_MID(LIQUIDATOR), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: HQ_SHARE(LIQUIDATOR), speed: V_ROOM, height: 1.1 },
      { kind: 'fly', to: WORK_MID(LIQUIDATOR), look: { role: 'tomilov' }, speed: V_CLOSE, height: 1.1 },
      { kind: 'say', role: 'tomilov', text: 'В журнале за тот день записано: плановая проверка. Записывал я.', color: TOMILOV_VOICE, seconds: 4.4 },
      { kind: 'orbit', around: { speaker: true }, radius: ROOM_ORBIT, speed: 0.2, height: 1.1, seconds: 4.5 },
      { kind: 'say', role: 'tomilov', text: 'Одну группу я тогда уже отдал. Больше меня ни о чём не просили.', color: TOMILOV_VOICE, seconds: 4.4 },
      { kind: 'say', role: 'tomilov', text: 'Вниз идут шестнадцать лифтов. Все шестнадцать — за нашими дверьми.', color: TOMILOV_VOICE, seconds: 4.6 },

      /* ── Замок: его показывают, а не рассказывают ──────────── */
      { kind: 'fly', to: HQ_SHARE(LIQUIDATOR), speed: V_ROOM, height: 1.2 },
      { kind: 'fly', to: DOOR_IN(LIQUIDATOR), speed: V_APPROACH, height: 1.3 },
      { kind: 'fly', to: GATE_OUT(LIQUIDATOR), speed: V_APPROACH, height: 1.5 },
      { kind: 'fly', to: AV_RING_WEST, speed: V_HIGHWAY, height: 1.9 },
      ...lockBeats(gate),

      /* ── Домой, на двор ────────────────────────────────────── */
      { kind: 'fly', to: DOCK, look: { role: 'dockers' }, speed: V_STREET, height: 1.6 },
      { kind: 'say', role: 'dockers', text: 'Ключей у нас нет. Мы грузим. Ключей на ярусе всего четыре.', color: DOCKER_VOICE, seconds: 4.4 },
    ],
  };
}

registerFloorScene(buildPerevalkaTourScene(null));

/**
 * Переписать объявление сцены настоящим тамбуром. Зовётся этажом из
 * `onAfterPopulate` — первого хука, который видит уже поставленные и обнесённые
 * шахты. До него замка на этаже не существует, и показывать нечего.
 */
export function refreshPerevalkaTourScene(report: PerevalkaLiftGateReport): void {
  registerFloorScene(buildPerevalkaTourScene(pickShowcaseGate(report.gates)));
}
