/* ── Перевалка: константы, базы и личности ────────────────────────
 *
 * Этаж стоит на одном замысле: ВСЕ лифты вниз лежат внутри баз четырёх
 * фракций, за запертыми дверьми. Куда лягут лифты — решает единая система
 * шахт (`world/route_lifts.ts`), этаж их только читает и обносит. Поэтому
 * здесь нет ни одной лифтовой координаты: есть четыре базы, четыре ключа и
 * правило «лифт принадлежит ближайшей базе».
 *
 * Четыре базы — четыре РАЗНЫЕ природы доступа, а не четыре одинаковых
 * поручения с разными именами:
 *   дикие (Дантес)      — сила и грибы;
 *   гражданские (Ариэль)— разговор и услуга;
 *   ликвидаторы (Томилов)— контрабанда и умолчание;
 *   учёные (Жирняк)     — теневики, потому что торговать он отказывается.
 */

import {
  Faction,
  MonsterKind,
  Occupation,
  RoomType,
  Tex,
  ZoneFaction,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import type { NamedRoomTable } from '../named_rooms';

export const PEREVALKA_DESIGN_FLOOR_ID = 'perevalka';
/** Маршрутный z, а не легаси-номер этажа: контейнеры чистятся самосбором по нему. */
export const PEREVALKA_Z = -16;
export const PEREVALKA_SEED = 0x9e12;

/** Ключ бакета A-Life: по нему резервируются личности этажа. Константа на модуль. */
export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey(PEREVALKA_DESIGN_FLOOR_ID);

export const PEREVALKA_BASE_TAGS = ['perevalka', 'freight', 'lift_gate'] as const;

/* ── Общий двор ──────────────────────────────────────────────────
 * Погрузочная площадка — единственное место яруса, которое не принадлежит
 * никому из четверых: сюда свозят всё, что поедет вниз. Поэтому она и якорь
 * сцены знакомства, и её начало, и её конец. Геометрия объявлена здесь, а не
 * литералами в генераторе: сцена считает от неё все свои смещения. */
export const PEREVALKA_DOCK_ALIAS = 'perevalka_dock';
export const PEREVALKA_DOCK = { x: 432, y: 424, w: 64, h: 34 } as const;

/** Тварь, вокруг которой держится единственный интерес Жирняка. Своей не заводим. */
export const PEREVALKA_SHADOW_KIND = MonsterKind.SHADOW;

/* ── Ключи баз ───────────────────────────────────────────────────
 * Ключ — строка, совпадающая с `defId` предмета. Одной базе один ключ, и его
 * знают ВСЕ лифтовые двери этой базы: игрок решает вопрос с одной базой, а не
 * с одной дверью. Цена решена владельцем — 10 000. */
export const PEREVALKA_KEY_WILD = 'perevalka_key_wild';
export const PEREVALKA_KEY_CITIZEN = 'perevalka_key_citizen';
export const PEREVALKA_KEY_LIQUIDATOR = 'perevalka_key_liquidator';
export const PEREVALKA_KEY_SCIENCE = 'perevalka_key_science';

export type PerevalkaBaseId = 'wild' | 'citizen' | 'liquidator' | 'science';

export type PerevalkaNpcId =
  | 'perevalka_dantes'
  | 'perevalka_ariel'
  | 'perevalka_tomilov'
  | 'perevalka_zhirnyak';

export interface PerevalkaBaseSpec {
  id: PerevalkaBaseId;
  /** Владелец территории: им красятся комнаты базы и её лифтовые тамбуры. */
  owner: ZoneFaction;
  faction: Faction;
  keyId: string;
  npcId: PerevalkaNpcId;
  /** Человеческое имя базы — уходит в имя лифтового тамбура. */
  title: string;
  /** Левый верхний угол двора базы. Вход смотрит на ближайшую грузовую авеню. */
  x: number;
  y: number;
  hqAlias: string;
  workAlias: string;
  wallTex: Tex;
  floorTex: Tex;
  workWallTex: Tex;
  workFloorTex: Tex;
}

/** Ширина/высота комнат базы. Двор = штаб + рабочая комната через общую стену. */
export const BASE_HQ_W = 40;
export const BASE_HQ_H = 28;
export const BASE_WORK_W = 30;

export const PEREVALKA_BASES: readonly PerevalkaBaseSpec[] = [
  {
    id: 'wild',
    owner: ZoneFaction.WILD,
    faction: Faction.WILD,
    keyId: PEREVALKA_KEY_WILD,
    npcId: 'perevalka_dantes',
    title: 'Грибная артель Дантеса',
    x: 240,
    y: 112,
    hqAlias: 'perevalka_wild_hq',
    workAlias: 'perevalka_wild_farm',
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_CONCRETE,
    workWallTex: Tex.BRICK,
    workFloorTex: Tex.F_CONCRETE,
  },
  {
    id: 'citizen',
    owner: ZoneFaction.CITIZEN,
    faction: Faction.CITIZEN,
    keyId: PEREVALKA_KEY_CITIZEN,
    npcId: 'perevalka_ariel',
    title: 'Общинная перевалка Ариэль',
    x: 752,
    y: 112,
    hqAlias: 'perevalka_citizen_hq',
    workAlias: 'perevalka_citizen_hall',
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    workWallTex: Tex.PANEL,
    workFloorTex: Tex.F_TILE,
  },
  {
    id: 'liquidator',
    owner: ZoneFaction.LIQUIDATOR,
    faction: Faction.LIQUIDATOR,
    keyId: PEREVALKA_KEY_LIQUIDATOR,
    npcId: 'perevalka_tomilov',
    title: 'Досмотровая застава Томилова',
    x: 240,
    y: 624,
    hqAlias: 'perevalka_liquidator_hq',
    workAlias: 'perevalka_liquidator_depot',
    wallTex: Tex.METAL,
    floorTex: Tex.F_LINO,
    workWallTex: Tex.METAL,
    workFloorTex: Tex.F_CONCRETE,
  },
  {
    id: 'science',
    owner: ZoneFaction.SCIENTIST,
    faction: Faction.SCIENTIST,
    keyId: PEREVALKA_KEY_SCIENCE,
    npcId: 'perevalka_zhirnyak',
    title: 'Теневая лаборатория Жирняка',
    x: 752,
    y: 624,
    hqAlias: 'perevalka_science_hq',
    workAlias: 'perevalka_science_lab',
    wallTex: Tex.TILE_W,
    floorTex: Tex.F_TILE,
    workWallTex: Tex.DARK,
    workFloorTex: Tex.F_CONCRETE,
  },
] as const;

export const PEREVALKA_ROOMS: NamedRoomTable = {
  perevalka_dock: { type: RoomType.PRODUCTION, name: 'Погрузочная площадка', tags: ['perevalka', 'freight', 'dock'] },
  perevalka_wild_hq: { type: RoomType.HQ, name: 'Правление грибной артели', tags: ['perevalka', 'base', 'wild'] },
  perevalka_wild_farm: { type: RoomType.PRODUCTION, name: 'Грибная ферма Дантеса', tags: ['perevalka', 'base', 'wild', 'mushroom'] },
  perevalka_citizen_hq: { type: RoomType.HQ, name: 'Переговорная Ариэль', tags: ['perevalka', 'base', 'citizen'] },
  perevalka_citizen_hall: { type: RoomType.COMMON, name: 'Общий стол общинной перевалки', tags: ['perevalka', 'base', 'citizen', 'parley'] },
  perevalka_liquidator_hq: { type: RoomType.HQ, name: 'Досмотровая Томилова', tags: ['perevalka', 'base', 'liquidator'] },
  perevalka_liquidator_depot: { type: RoomType.STORAGE, name: 'Пакгауз изъятого груза', tags: ['perevalka', 'base', 'liquidator', 'contraband'] },
  perevalka_science_hq: { type: RoomType.HQ, name: 'Кабинет физика Жирняка', tags: ['perevalka', 'base', 'scientist'] },
  perevalka_science_lab: { type: RoomType.MEDICAL, name: 'Тенеловка: бокс наблюдения', tags: ['perevalka', 'base', 'scientist', 'shadow'] },
};

/* ── Личности держателей ключей ──────────────────────────────────
 * Ключ стоит ПЕРВЫМ слотом инвентаря сознательно: тот же инвентарь высыпается
 * при смерти целиком и он же служит прилавком. Один положенный предмет
 * закрывает разом три пути игрока — убить, обокрасть, купить, — и ни одного
 * из них не надо программировать отдельно. */
export const NPC_DEFS: Record<PerevalkaNpcId, PlotNpcDef> = {
  perevalka_dantes: {
    name: 'Данила Шведчик',
    firstName: 'Данила',
    lastName: 'Шведчик',
    nickname: 'Дантес',
    isFemale: false,
    age: 41,
    faction: Faction.WILD,
    occupation: Occupation.DIRECTOR,
    sprite: Occupation.DIRECTOR,
    homeFloorKey: DESIGN_NPC_HOME_FLOOR_KEY,
    spawnRoomAlias: 'perevalka_wild_hq',
    hp: 240,
    maxHp: 240,
    level: 7,
    money: 900,
    speed: 0.82,
    weapon: 'makarov',
    inventory: [
      { defId: PEREVALKA_KEY_WILD, count: 1 },
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 24 },
      { defId: 'mushroom_mass', count: 3 },
    ],
    talkLines: [
      'Отец держал этот ярус страхом. Я держу грибом. Гриб надёжнее: он растёт, пока ты спишь.',
      'Ключ от моего лифта — не бумажка, а доля. Хочешь долю — покажи, что за ферму умеешь стоять.',
      'Аргонов — гений. Он это знает, я это знаю, а больше знать никому и не надо.',
      'Я собираю композиции на НЕТ-железе. Слушать не обязательно. Обсуждать — не советую.',
    ],
    talkLinesPost: [
      'Ферма стоит, урожай считан. Ты теперь не гость, ты статья расхода со знаком плюс.',
      'Как поедешь вниз — не хлопай дверью. За хлопок с меня спросят соседи, а с соседей спрошу я.',
    ],
  },
  perevalka_ariel: {
    name: 'Ариэль',
    firstName: 'Ариэль',
    nickname: 'Русалочка',
    isFemale: true,
    age: 34,
    faction: Faction.CITIZEN,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    homeFloorKey: DESIGN_NPC_HOME_FLOOR_KEY,
    spawnRoomAlias: 'perevalka_citizen_hq',
    hp: 96,
    maxHp: 96,
    level: 4,
    money: 1400,
    speed: 0.8,
    inventory: [
      { defId: PEREVALKA_KEY_CITIZEN, count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'water', count: 2 },
    ],
    talkLines: [
      'Ах, наконец живой человек. Садитесь, догогой. Здесь бетон, но разговор мы всё-таки постелем.',
      'Оружие у вас есть, я вижу. У меня его нет — и заметьте, очередь стоит у моего стола, а не у чужого.',
      'Ключ я не пгодаю и не прячу. Я его отдаю тому, кто сделал общине маленькую услугу. C\'est tout.',
      'Томилов человек тяжёлый, но вежливый. Дантес наоборот. С обоими можно говорить, если знать, чем платить.',
    ],
    talkLinesPost: [
      'Вы держались рядом, пока я говорила, — и досмотр стал вежлив. Вот вам вся дипломатия, догогой.',
      'Ключ ваш. Ступайте вниз, только не ссорьтесь там ни с кем от моего имени.',
    ],
  },
  perevalka_tomilov: {
    name: 'Томилов',
    lastName: 'Томилов',
    isFemale: false,
    age: 46,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    homeFloorKey: DESIGN_NPC_HOME_FLOOR_KEY,
    spawnRoomAlias: 'perevalka_liquidator_hq',
    hp: 200,
    maxHp: 200,
    level: 6,
    money: 620,
    speed: 0.9,
    weapon: 'makarov',
    inventory: [
      { defId: PEREVALKA_KEY_LIQUIDATOR, count: 1 },
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 20 },
      { defId: 'liquidator_token', count: 1 },
    ],
    talkLines: [
      'Я на посту. Пост — это место, где записывают. Что не записано, того не было.',
      'Дикие возят мимо весов. Я это знаю. Я это и оформил — иначе возили бы мимо меня.',
      'Один раз я уже отдал группу. Не за деньги. За то, чтобы остальное осталось как есть.',
      'Принеси мне корешок с чужой печатью — и в журнале за сегодня будет на один груз меньше.',
    ],
    talkLinesPost: [
      'Груза не было, досмотра не было, тебя тут не было. Ключ, впрочем, был.',
      'Если спросят, кто открыл нижнюю дверь, — я отвечу честно: замок исправен.',
    ],
  },
  perevalka_zhirnyak: {
    name: 'Жирняк',
    lastName: 'Жирняк',
    isFemale: false,
    age: 52,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    sprite: Occupation.SCIENTIST,
    homeFloorKey: DESIGN_NPC_HOME_FLOOR_KEY,
    spawnRoomAlias: 'perevalka_science_hq',
    hp: 110,
    maxHp: 110,
    level: 5,
    // Денег нет вовсе: он ничего не покупает и ни с кем не договаривается.
    money: 0,
    speed: 0.86,
    inventory: [
      { defId: PEREVALKA_KEY_SCIENCE, count: 1 },
      { defId: 'anti_spore_inhaler', count: 1 },
    ],
    talkLines: [
      'Торговать не буду. Договариваться не буду. Союзов не будет. Уходи или говори про теневиков.',
      'Тень выходит раньше тела. Раньше! Понимаешь, что это значит? Нет. Никто не понимает.',
      'Убей троих в темноте и приходи. Не приноси мне сгусток, приноси счёт. Счёт — это данные.',
      'Ликвидаторы считают груз, дикие считают выручку, гражданские считают людей. Я считаю тени.',
    ],
    talkLinesPost: [
      'Трое. Хорошо. Теперь я знаю, что тень выходит раньше тела не иногда, а всегда.',
      'Ключ забирай, он мне не нужен. Внизу темнее — там их больше.',
    ],
  },
};
