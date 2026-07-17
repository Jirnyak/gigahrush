import {
  Faction,
  Occupation,
  RoomType,
  Tex,
  W,
  ZoneFaction,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import { TuringHqSpec, TuringDistrictSpec, TuringCabinetStripSpec } from "./geometry";
import { TuringNpcId } from "./npcs";

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('turing_nursery');

export const TURING_NURSERY_ROUTE_ID = 'turing_nursery' as const;

export const TURING_NURSERY_Z = 10 as const;

export const TURING_NURSERY_BASE_FLOOR = 60;

export const TURING_NURSERY_ROOM_PREFIX = 'Ясли Тьюринга';

export const SEED = hashSeed(TURING_NURSERY_ROUTE_ID);

export const CX = W >> 1;

export const CY = W >> 1;

export const FIELD_SIZE = 64;

export const FIELD_CELLS = FIELD_SIZE * FIELD_SIZE;

export const FIELD_CELL = W / FIELD_SIZE;

export const FIELD_STEPS = 32;

export const MAX_HAZARD_CELLS = 96;

export const TURING_HQ_SPECS: readonly TuringHqSpec[] = [
  {
    owner: ZoneFaction.SCIENTIST,
    x: 592,
    y: 238,
    name: 'Герметичный штаб матриц НИИ',
    supportPrefix: 'матриц НИИ',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_TILE,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    x: 574,
    y: 760,
    name: 'Герметичный штаб нижней линии обучения',
    supportPrefix: 'нижней линии обучения',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_TILE,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    x: 230,
    y: 642,
    name: 'Герметичный штаб прожига узора',
    supportPrefix: 'прожига узора',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.CITIZEN,
    x: 224,
    y: 226,
    name: 'Герметичный штаб родителей контрольной группы',
    supportPrefix: 'родителей контрольной группы',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_LINO,
  },
  {
    owner: ZoneFaction.CULTIST,
    x: 874,
    y: 694,
    name: 'Скрытый герметичный штаб мокрой рекурсии',
    supportPrefix: 'мокрой рекурсии',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_WATER,
  },
  {
    owner: ZoneFaction.WILD,
    x: 782,
    y: 278,
    name: 'Разорённый герметичный штаб сбежавших образцов',
    supportPrefix: 'сбежавших образцов',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
  },
] as const;

export const TURING_DISTRICTS: readonly TuringDistrictSpec[] = [
  { owner: ZoneFaction.CITIZEN, x: 106, y: 108, name: 'северо-западная очередь родителей', type: RoomType.COMMON, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, wet: false },
  { owner: ZoneFaction.CITIZEN, x: 286, y: 122, name: 'приёмная сухих справок', type: RoomType.OFFICE, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 466, y: 104, name: 'верхняя лента состояний', type: RoomType.MEDICAL, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 642, y: 126, name: 'северо-восточная чаша диффузии', type: RoomType.PRODUCTION, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, wet: true },
  { owner: ZoneFaction.WILD, x: 822, y: 118, name: 'краевой склад украденных чашек', type: RoomType.STORAGE, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE, wet: true },
  { owner: ZoneFaction.LIQUIDATOR, x: 96, y: 330, name: 'западная линия прожига', type: RoomType.PRODUCTION, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 278, y: 346, name: 'лаборатория конечных автоматов', type: RoomType.MEDICAL, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 514, y: 334, name: 'центральная обучающая чаша', type: RoomType.MEDICAL, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, wet: true },
  { owner: ZoneFaction.SCIENTIST, x: 684, y: 354, name: 'пост хранения синих переходов', type: RoomType.STORAGE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, wet: false },
  { owner: ZoneFaction.WILD, x: 842, y: 346, name: 'руины пробных шкафов', type: RoomType.STORAGE, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE, wet: true },
  { owner: ZoneFaction.LIQUIDATOR, x: 104, y: 552, name: 'юго-западная дезлиния мостов', type: RoomType.PRODUCTION, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, wet: true },
  { owner: ZoneFaction.LIQUIDATOR, x: 286, y: 598, name: 'пост сухой границы', type: RoomType.OFFICE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 486, y: 580, name: 'чаша обратного вычисления', type: RoomType.MEDICAL, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, wet: true },
  { owner: ZoneFaction.SCIENTIST, x: 666, y: 604, name: 'архив мокрых поколений', type: RoomType.OFFICE, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET, wet: false },
  { owner: ZoneFaction.CULTIST, x: 832, y: 578, name: 'закутки мокрой молитвы', type: RoomType.COMMON, wallTex: Tex.BRICK, floorTex: Tex.F_WATER, wet: true },
  { owner: ZoneFaction.LIQUIDATOR, x: 112, y: 804, name: 'нижний прожиговый склад', type: RoomType.STORAGE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 326, y: 824, name: 'нижняя лента клеточных ковров', type: RoomType.PRODUCTION, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, wet: true },
  { owner: ZoneFaction.SCIENTIST, x: 512, y: 826, name: 'архив вычисленных детей', type: RoomType.OFFICE, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET, wet: false },
  { owner: ZoneFaction.SCIENTIST, x: 692, y: 820, name: 'юго-восточный банк проб', type: RoomType.STORAGE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, wet: false },
  { owner: ZoneFaction.CULTIST, x: 840, y: 806, name: 'тёмные чаши рекурсии', type: RoomType.STORAGE, wallTex: Tex.BRICK, floorTex: Tex.F_WATER, wet: true },
] as const;

export const TURING_CABINET_STRIPS: readonly TuringCabinetStripSpec[] = [
  { owner: ZoneFaction.CITIZEN, x: 62, y: 208, cols: 10, rows: 5, name: 'северная детская сетка', wallTex: Tex.PANEL, floorTex: Tex.F_LINO, roomTypes: [RoomType.LIVING, RoomType.KITCHEN, RoomType.BATHROOM, RoomType.STORAGE] },
  { owner: ZoneFaction.SCIENTIST, x: 388, y: 202, cols: 12, rows: 5, name: 'верхние микроячейки обучения', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, roomTypes: [RoomType.MEDICAL, RoomType.OFFICE, RoomType.STORAGE] },
  { owner: ZoneFaction.SCIENTIST, x: 682, y: 210, cols: 10, rows: 5, name: 'северный архив ленты', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, roomTypes: [RoomType.STORAGE, RoomType.MEDICAL, RoomType.OFFICE] },
  { owner: ZoneFaction.LIQUIDATOR, x: 70, y: 444, cols: 10, rows: 6, name: 'западные шкафы прожига', wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE, roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.BATHROOM] },
  { owner: ZoneFaction.SCIENTIST, x: 342, y: 444, cols: 12, rows: 6, name: 'центральные микроячейки чаши', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, roomTypes: [RoomType.MEDICAL, RoomType.PRODUCTION, RoomType.STORAGE] },
  { owner: ZoneFaction.WILD, x: 718, y: 446, cols: 10, rows: 6, name: 'восточные разорённые боксы', wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE, roomTypes: [RoomType.STORAGE, RoomType.SMOKING, RoomType.PRODUCTION] },
  { owner: ZoneFaction.LIQUIDATOR, x: 84, y: 716, cols: 11, rows: 5, name: 'нижние шкафы дезраствора', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, roomTypes: [RoomType.STORAGE, RoomType.PRODUCTION, RoomType.BATHROOM] },
  { owner: ZoneFaction.SCIENTIST, x: 382, y: 708, cols: 13, rows: 5, name: 'нижний ряд микроячеек НИИ', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, roomTypes: [RoomType.MEDICAL, RoomType.OFFICE, RoomType.STORAGE] },
  { owner: ZoneFaction.CULTIST, x: 718, y: 700, cols: 10, rows: 5, name: 'культовые ячейки рекурсии', wallTex: Tex.BRICK, floorTex: Tex.F_WATER, roomTypes: [RoomType.STORAGE, RoomType.COMMON, RoomType.SMOKING] },
] as const;

export const NPC_DEFS: Record<TuringNpcId, PlotNpcDef> = {
  turing_nursery_mother_agafya: {
    name: 'Агафья Мать-Алгоритм',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    sprite: Occupation.SCIENTIST,
    hp: 130, maxHp: 130, money: 140, speed: 0.78,
    inventory: [
      { defId: 'nii_sample_container', count: 1 },
      { defId: 'sample_chain_form', count: 1 },
      { defId: 'decon_fluid', count: 1 },
    ],
    talkLines: [
      'Узор не растёт. Он вспоминает, где ему разрешили быть комнатой.',
      'Инокуляция нужна чаше, а не слизи. Чаша должна ошибиться первой, иначе ошибётся коридор.',
      'Синий образец не лечит. Он доказывает, что вычисление ещё заперто в банке.',
    ],
    talkLinesPost: [
      'Чаша успокоилась. Теперь линии снова похожи на план, а не на родословную.',
      'Сожжённый мост проще объяснить, чем живой, но в отчёте оба выглядят одинаково влажно.',
    ],
  },
  turing_nursery_liquidator_bryzga: {
    name: 'Брызга Л-10',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 190, maxHp: 190, money: 72, speed: 0.96,
    weapon: 'makarov',
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 20 },
      { defId: 'napalm_mix', count: 1 },
    ],
    talkLines: [
      'Мост надо жечь, пока он мост. Когда он станет аргументом, поздно.',
      'Учёные зовут это выращенной связностью. Я зову это мокрым обходом без ответственного.',
      'Если чёрная проба пошла по скелету пола, стреляйте в глаз, а не в лужу.',
    ],
    talkLinesPost: [
      'Пепел сухой. Значит, сегодня мы победили хотя бы прилагательное.',
      'Никто не любит напалм в детской. Поэтому детскую надо было не строить.',
    ],
  },
  turing_nursery_child_sava: {
    name: 'Сава Нулевой',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.CHILD,
    sprite: Occupation.CHILD,
    hp: 70, maxHp: 80, money: 4, speed: 0.86,
    inventory: [
      { defId: 'slime_age_label_orange', count: 1 },
      { defId: 'contaminated_swab', count: 1 },
    ],
    talkLines: [
      'Меня учили не наступать на клеточки. Потом клеточки выучили меня.',
      'Милена спрятала бумагу роста. Без неё я просто ребёнок в мокрой комнате.',
      'Если мост сжечь, он перестанет шептать путь. Но там останется проба.',
    ],
    talkLinesPost: [
      'Теперь бумага знает, что я был здесь до узора.',
      'Сухие клетки звучат хуже мокрых. Зато они не хватают ботинок.',
    ],
  },
  turing_nursery_registrar_milena: {
    name: 'Милена Регистр',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 92, maxHp: 92, money: 86, speed: 0.82,
    inventory: [
      { defId: 'record_exposure_notice', count: 1 },
      { defId: 'nii_forged_audit', count: 1 },
      { defId: 'blank_form', count: 2 },
    ],
    talkLines: [
      'Рост записан как учебный. Учебное всегда дешевле, пока не съест дверь.',
      'Акт можно спрятать в сухой папке, но узор всё равно найдёт влажную строку.',
      'Сава числится контрольной группой. Группа из одного ребёнка удобна только отчёту.',
    ],
    talkLinesPost: [
      'Акт всплыл. Теперь НИИ будет доказывать, что не умеет считать детей.',
      'Ясли закрыть нельзя. Можно только заменить название на менее живое.',
    ],
  },
};

