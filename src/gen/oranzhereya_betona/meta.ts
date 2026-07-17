import {
  Faction,
  Feature,
  Occupation,
  RoomType,
  Tex,
  W,
  ZoneFaction,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import { GreenhouseBlockSpec, HqSupportSpec, HqSpec } from "./geometry";
import { GreenhouseNpcId } from "./npcs";

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('oranzhereya_betona');

export const ORANZHEREYA_BETONA_ROUTE_ID = 'oranzhereya_betona' as const;

export const ORANZHEREYA_BETONA_Z = -2 as const;

export const ORANZHEREYA_BETONA_BASE_FLOOR = 100;

export const ORANZHEREYA_BETONA_DISPLAY_NAME = 'Оранжерея бетона';

export const ORANZHEREYA_ROOM_NAMES = {
  entry: 'Лифтовая теплица О-8',
  gallery: 'Галерея бетонных гряд О-8',
  pump: 'Насосная капельного полива О-8',
  northRows: 'Северные грядки пайковой зелени',
  southRows: 'Южные стеллажи грибной пайки',
  waterBasin: 'Бассейн питательного раствора',
  burnTrench: 'Прожиговая канава спор',
  mushroomWard: 'Сырой грибной карман',
  seedVault: 'Семенная кладовая жильцов',
  marketStall: 'Рыночная форточка Оранжереи',
  guardPost: 'Пост водяной нормы',
  compost: 'Компостная долговая яма',
} as const;

export const ORANZHEREYA_HQ_ROOM_NAMES = {
  citizen: 'Штаб пайковой очереди Оранжереи',
  liquidator: 'Гермопост водяной нормы',
  cultist: 'Скрытый спорохрам компоста',
  scientist: 'НИИ семенного контроля Оранжереи',
  wild: 'Дикая форточка испорченной пайки',
  citizenNorth: 'Северный пост пайковой очереди',
  citizenSouth: 'Южный пост чистой зелени',
} as const;

export const ORANZHEREYA_MICRO_ROOM_PREFIXES = [
  'Микросклад семенных кассет',
  'Переход водяной бирки',
  'Кладовая сухой тары',
  'Будка чистки фильтра',
  'Кабина спорного стеллажа',
] as const;

export const SEED = hashSeed(ORANZHEREYA_BETONA_ROUTE_ID);

export const CONTENT_TAG = 'oranzhereya_betona';

export const CX = W >> 1;

export const CY = W >> 1;

export const BLOCK_ROOM_W = 14;

export const BLOCK_ROOM_H = 8;

export const BLOCK_COLS = 6;

export const BLOCK_ROWS = 5;

export const BLOCK_GAP_X = 9;

export const BLOCK_GAP_Y = 8;

export const GREENHOUSE_BLOCKS: readonly GreenhouseBlockSpec[] = [
  { name: 'Северо-западный пайковый блок', x: 92, y: 70, owner: ZoneFaction.CITIZEN, wallTex: Tex.PANEL, floorTex: Tex.F_GREEN_CARPET },
  { name: 'Северная лабораторная гряда', x: 314, y: 74, owner: ZoneFaction.SCIENTIST, wallTex: Tex.TILE_W, floorTex: Tex.F_GREEN_CARPET },
  { name: 'Северо-восточный водяной стеллаж', x: 592, y: 72, owner: ZoneFaction.SCIENTIST, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { name: 'Восточные грибные кассеты', x: 798, y: 308, owner: ZoneFaction.WILD, wallTex: Tex.ROTTEN, floorTex: Tex.F_GREEN_CARPET },
  { name: 'Юго-восточный споровый склад', x: 704, y: 742, owner: ZoneFaction.WILD, wallTex: Tex.BRICK, floorTex: Tex.F_LINO },
  { name: 'Южный пайковый парник', x: 432, y: 824, owner: ZoneFaction.CITIZEN, wallTex: Tex.PANEL, floorTex: Tex.F_GREEN_CARPET },
  { name: 'Юго-западные компостные кассеты', x: 118, y: 742, owner: ZoneFaction.CULTIST, wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
  { name: 'Западный прожиговый ряд', x: 72, y: 324, owner: ZoneFaction.LIQUIDATOR, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
];

export const HQ_SUPPORTS: readonly HqSupportSpec[] = [
  { type: RoomType.KITCHEN, dx: -42, dy: 4, w: 30, h: 16, name: 'кухня сухой пайки', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, feature: Feature.STOVE },
  { type: RoomType.BATHROOM, dx: 78, dy: 4, w: 24, h: 14, name: 'санузел фильтров', wallTex: Tex.TILE_W, floorTex: Tex.F_WATER, feature: Feature.SINK },
  { type: RoomType.STORAGE, dx: 8, dy: -24, w: 34, h: 16, name: 'кладовая тары', wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, feature: Feature.SHELF },
  { type: RoomType.MEDICAL, dx: 12, dy: 42, w: 32, h: 16, name: 'медпункт спор', wallTex: Tex.TILE_W, floorTex: Tex.F_TILE, feature: Feature.APPARATUS },
];

export const ORANZHEREYA_HQ_SPECS: readonly HqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    name: ORANZHEREYA_HQ_ROOM_NAMES.citizen,
    x: 432,
    y: 646,
    w: 82,
    h: 38,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_LINO,
    supports: HQ_SUPPORTS,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    name: ORANZHEREYA_HQ_ROOM_NAMES.liquidator,
    x: 738,
    y: 244,
    w: 70,
    h: 34,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
    supports: HQ_SUPPORTS,
  },
  {
    owner: ZoneFaction.CULTIST,
    name: ORANZHEREYA_HQ_ROOM_NAMES.cultist,
    x: 74,
    y: 584,
    w: 58,
    h: 30,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_GREEN_CARPET,
    supports: HQ_SUPPORTS,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    name: ORANZHEREYA_HQ_ROOM_NAMES.scientist,
    x: 820,
    y: 94,
    w: 66,
    h: 34,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_TILE,
    supports: HQ_SUPPORTS,
  },
  {
    owner: ZoneFaction.WILD,
    name: ORANZHEREYA_HQ_ROOM_NAMES.wild,
    x: 816,
    y: 766,
    w: 64,
    h: 32,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_LINO,
    supports: HQ_SUPPORTS,
  },
];

export const NPC_DEFS: Record<GreenhouseNpcId, PlotNpcDef> = {
  oranzhereya_agronom_nadya: {
    name: 'Надя Агроном',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SCIENTIST,
    sprite: Occupation.SCIENTIST,
    hp: 125,
    maxHp: 125,
    money: 88,
    speed: 0.86,
    inventory: [
      { defId: 'spore_print', count: 1 },
      { defId: 'substrate_sack', count: 1 },
      { defId: 'filtered_water', count: 1 },
    ],
    talkLines: [
      'Оранжерея не выращивает чудо. Она выращивает очередь, чтобы очередь не съела себя.',
      'Если споры уйдут в капельный полив, хлеб станет слухом. Нужна соль, чистая тара и холодная голова.',
      'Рынок хочет заражённый урожай. Жильцы хотят живой. Дом хочет, чтобы мы спорили у грядки.',
    ],
    talkLinesPost: [
      'Грядки дышат ровнее. Это ещё не урожай, но уже не паника.',
      'Соль помогла. Главное теперь не продать чистый ряд под видом редкости.',
    ],
  },
  oranzhereya_irrigator_gleb: {
    name: 'Глеб Капельник',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.ELECTRICIAN,
    sprite: Occupation.ELECTRICIAN,
    hp: 115,
    maxHp: 115,
    money: 42,
    speed: 0.9,
    inventory: [
      { defId: 'valve_tag', count: 1 },
      { defId: 'pipe', count: 1 },
      { defId: 'water_coupon', count: 1 },
    ],
    talkLines: [
      'Вода идёт по графику, а график по рукам. Переставишь бирку вентиля - решишь, кто пьёт первым.',
      'Труба течёт в компост. Можно закрыть, можно пустить на чистые грядки, можно продать рыноковой форточке.',
      'Я не сантехник. Сантехники просят деньги. Я прошу, чтобы никто не умер у крана.',
    ],
    talkLinesPost: [
      'Капля пошла в нужную сторону. Очередь всё равно будет, но уже без ножей у насоса.',
      'Бирка на месте. Кто захочет спорить, пусть спорит с давлением.',
    ],
  },
  oranzhereya_guard_arsen: {
    name: 'Арсен Водомер',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 175,
    maxHp: 175,
    money: 76,
    speed: 0.96,
    weapon: 'makarov',
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
      { defId: 'filter_layer', count: 1 },
    ],
    talkLines: [
      'Водомер не охраняет еду. Водомер охраняет момент, когда еда становится поводом.',
      'Если полезете в пайковую кладовую без слова, я запишу вас как потерю воды.',
      'Сжечь заражённый ряд можно. Только не сжигайте весь этаж ради красивого дыма.',
    ],
    talkLinesPost: [
      'Пламя прошло по канаве, не по людям. Редкий случай, когда инструкция похожа на правду.',
      'Пост стоит. Теперь воруют тише, а это уже почти порядок.',
    ],
  },
  oranzhereya_market_sonya: {
    name: 'Соня Форточка',
    isFemale: true,
    faction: Faction.WILD,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 110,
    maxHp: 110,
    money: 155,
    speed: 0.88,
    inventory: [
      { defId: 'infected_mushroom', count: 2 },
      { defId: 'forged_ration_card', count: 1 },
      { defId: 'acid_bottle', count: 1 },
    ],
    talkLines: [
      'Чистая еда скучная. Заражённая еда редкая. Редкость дороже скуки.',
      'Кислота в басейн - и урожай уйдёт в рынок не как пайка, а как товар для смелых.',
      'Я не травлю жильцов. Я предлагаю им выбор, который они всё равно сделают в темноте.',
    ],
    talkLinesPost: [
      'Форточка помнит, кто умеет портить аккуратно.',
      'Если вдруг стало слишком чисто, приходите. Я испорчу цену, не урожай.',
    ],
  },
};

