import {
  Faction,
  Occupation,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('spetspriemnik');

export const SPETSPRIEMNIK_ROUTE_ID = 'spetspriemnik' as const;

export const SPETSPRIEMNIK_Z = 40 as const;

export const SPETSPRIEMNIK_BASE_FLOOR = 30;

export const SPETSPRIEMNIK_CELL_KEY = 'container_key_label';

export const SPETSPRIEMNIK_PERMIT_KEY = 'official_permit_slip';

export const SPETSPRIEMNIK_GUARD_KEY = 'liquidator_token';

export const SPETSPRIEMNIK_ROOM_NAMES = {
  lobby: 'Лифтовый вестибюль спецприёмника',
  intake: 'Окно приема задержанных',
  guardPost: 'Караульная петля спецприёмника',
  command: 'Кабинет начальника спецприёмника',
  visitor: 'Клетка свиданий и обмена фамилий',
  riotYard: 'Двор бунтовой переклички',
  lowerLift: 'Нижний конвойный лифт спецприёмника',
  contraband: 'Склад изъятых передач',
} as const;

export const CX = W >> 1;

export const CY = W >> 1;

export const BASE_TAGS = ['spetspriemnik', 'detention', 'liquidator_control'];

export type NextId = { v: number };

export type DoorSide = 'north' | 'south' | 'west' | 'east';

export type CorridorAxis = 'vertical' | 'horizontal';

export type NpcId =
  | 'spetspriemnik_nachalnik_krivda'
  | 'spetspriemnik_guard_savva'
  | 'spetspriemnik_prisoner_mira'
  | 'spetspriemnik_informant_tolya'
  | 'spetspriemnik_clerk_alla';

export interface CellBlockResult {
  rooms: Room[];
  shelterRooms: number;
  lockedDoors: number;
  barredCells: number;
}

export interface SupportClusterSpec {
  name: string;
  owner: TerritoryOwner;
  axis: CorridorAxis;
  x: number;
  y: number;
  rooms: number;
  roomW: number;
  roomH: number;
  step: number;
  typeA: RoomType;
  typeB: RoomType;
  wallTex: Tex;
  floorTex: Tex;
}

export interface HqSpec {
  owner: TerritoryOwner;
  title: string;
  x: number;
  y: number;
  wallTex: Tex;
  floorTex: Tex;
  supportWallTex: Tex;
  supportFloorTex: Tex;
}

export interface SpetspriemnikMetrics {
  routeId: typeof SPETSPRIEMNIK_ROUTE_ID;
  z: typeof SPETSPRIEMNIK_Z;
  cellRooms: number;
  shelterCellRooms: number;
  lockedCellDoors: number;
  lockedPermitDoors: number;
  guardLoopCells: number;
  barredSightlineCells: number;
  hostageContainers: number;
  riotHoldQuestBounded: boolean;
  stablePrisonerNpcIds: readonly string[];
}

export const HQ_SPECS: readonly HqSpec[] = [
  {
    owner: ZoneFaction.CULTIST,
    title: 'скрытый культовый карцер',
    x: 116,
    y: 92,
    wallTex: Tex.DARK,
    floorTex: Tex.F_RED_CARPET,
    supportWallTex: Tex.METAL,
    supportFloorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    title: 'северный караульный штаб',
    x: 730,
    y: 96,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
    supportWallTex: Tex.MARBLE,
    supportFloorTex: Tex.F_PARQUET,
  },
  {
    owner: ZoneFaction.CITIZEN,
    title: 'комната родственников',
    x: 112,
    y: 424,
    wallTex: Tex.PANEL,
    floorTex: Tex.F_LINO,
    supportWallTex: Tex.PANEL,
    supportFloorTex: Tex.F_TILE,
  },
  {
    owner: ZoneFaction.WILD,
    title: 'разбитая камера самообороны',
    x: 118,
    y: 790,
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_CONCRETE,
    supportWallTex: Tex.METAL,
    supportFloorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    title: 'экспертный НИИ-бокс',
    x: 804,
    y: 790,
    wallTex: Tex.BRICK,
    floorTex: Tex.F_TILE,
    supportWallTex: Tex.TILE_W,
    supportFloorTex: Tex.F_TILE,
  },
] as const;

export const SUPPORT_CLUSTERS: readonly SupportClusterSpec[] = [
  { name: 'северные боксы приема', owner: ZoneFaction.CULTIST, axis: 'vertical', x: 72, y: 210, rooms: 8, roomW: 24, roomH: 15, step: 28, typeA: RoomType.STORAGE, typeB: RoomType.LIVING, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { name: 'архивные карманы верхнего журнала', owner: ZoneFaction.CITIZEN, axis: 'horizontal', x: 262, y: 116, rooms: 8, roomW: 18, roomH: 14, step: 32, typeA: RoomType.OFFICE, typeB: RoomType.STORAGE, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET },
  { name: 'северо-восточные конвойные каптерки', owner: ZoneFaction.LIQUIDATOR, axis: 'vertical', x: 842, y: 210, rooms: 8, roomW: 26, roomH: 15, step: 28, typeA: RoomType.OFFICE, typeB: RoomType.STORAGE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { name: 'левая семейная очередь', owner: ZoneFaction.CITIZEN, axis: 'vertical', x: 68, y: 512, rooms: 8, roomW: 24, roomH: 15, step: 28, typeA: RoomType.COMMON, typeB: RoomType.KITCHEN, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { name: 'правый протокольный архив', owner: ZoneFaction.LIQUIDATOR, axis: 'vertical', x: 844, y: 512, rooms: 8, roomW: 26, roomH: 15, step: 28, typeA: RoomType.OFFICE, typeB: RoomType.STORAGE, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET },
  { name: 'нижний дикий пересыльник', owner: ZoneFaction.WILD, axis: 'horizontal', x: 240, y: 884, rooms: 8, roomW: 18, roomH: 14, step: 32, typeA: RoomType.SMOKING, typeB: RoomType.STORAGE, wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
  { name: 'нижняя экспертная гребенка', owner: ZoneFaction.SCIENTIST, axis: 'horizontal', x: 548, y: 884, rooms: 8, roomW: 18, roomH: 14, step: 32, typeA: RoomType.MEDICAL, typeB: RoomType.PRODUCTION, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { name: 'внутренние шкафы ключей', owner: ZoneFaction.LIQUIDATOR, axis: 'vertical', x: 166, y: 304, rooms: 7, roomW: 20, roomH: 13, step: 30, typeA: RoomType.STORAGE, typeB: RoomType.OFFICE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { name: 'восточные камеры тишины', owner: ZoneFaction.LIQUIDATOR, axis: 'vertical', x: 782, y: 304, rooms: 7, roomW: 20, roomH: 13, step: 30, typeA: RoomType.LIVING, typeB: RoomType.STORAGE, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { name: 'гражданский стол передач', owner: ZoneFaction.CITIZEN, axis: 'horizontal', x: 244, y: 246, rooms: 7, roomW: 18, roomH: 13, step: 34, typeA: RoomType.COMMON, typeB: RoomType.KITCHEN, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { name: 'скрытые молитвенные кладовки', owner: ZoneFaction.CULTIST, axis: 'horizontal', x: 244, y: 780, rooms: 7, roomW: 18, roomH: 13, step: 34, typeA: RoomType.STORAGE, typeB: RoomType.COMMON, wallTex: Tex.DARK, floorTex: Tex.F_RED_CARPET },
  { name: 'экспертные кабинки осмотра', owner: ZoneFaction.SCIENTIST, axis: 'vertical', x: 700, y: 560, rooms: 7, roomW: 20, roomH: 13, step: 30, typeA: RoomType.MEDICAL, typeB: RoomType.OFFICE, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
] as const;

export const NPC_DEFS: Record<NpcId, PlotNpcDef> = {
  spetspriemnik_nachalnik_krivda: {
    name: 'Кривда Приёмный',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.DIRECTOR,
    sprite: Occupation.DIRECTOR,
    hp: 180,
    maxHp: 180,
    money: 140,
    speed: 0.78,
    weapon: 'makarov',
    inventory: [
      { defId: SPETSPRIEMNIK_PERMIT_KEY, count: 1 },
      { defId: SPETSPRIEMNIK_GUARD_KEY, count: 1 },
      { defId: 'personal_file_copy', count: 1 },
    ],
    talkLines: [
      'Камера не тюрьма. Камера - временное окно, пока фамилия ищет себе правильную строку.',
      'Выпускать можно по бирке, по корешку или по приказу. По жалости у нас дверь не обучена.',
      'Бунт считается происшествием только после третьего разбитого стула. Первые два идут как шум.',
    ],
    talkLinesPost: [
      'Список живых и список отпущенных опять не сошлись. Это работа, не трагедия.',
      'Если ключ вернулся без человека, значит человек пошёл по другому протоколу.',
    ],
  },
  spetspriemnik_guard_savva: {
    name: 'Савва У решётки',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 210,
    maxHp: 210,
    money: 38,
    speed: 0.95,
    weapon: 'makarov',
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 18 },
      { defId: SPETSPRIEMNIK_CELL_KEY, count: 1 },
    ],
    talkLines: [
      'Не стой у решётки боком. Через прутья плюют точнее, чем через форму объясняют.',
      'Пачка сигарет - не взятка. Это протирка разговора, чтобы скрип меньше слышно было.',
      'Ключи не мои. Просто если они падают, все смотрят почему-то на меня.',
    ],
    talkLinesPost: [
      'Обход прошёл без лишнего шума. Лишний шум записали на вентиляцию.',
      'Если кто вышел, значит у него была бумага. Или я сделал вид, что была.',
    ],
  },
  spetspriemnik_prisoner_mira: {
    name: 'Мира Седьмая',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    sprite: Occupation.TRAVELER,
    hp: 82,
    maxHp: 92,
    money: 7,
    speed: 0.74,
    inventory: [
      { defId: 'ration_registry_extract', count: 1 },
      { defId: 'bread', count: 1 },
    ],
    talkLines: [
      'Мне не нужен герой. Нужна бирка от ключа и человек, который не будет читать список вслух.',
      'В гермокамере можно переждать сирену. Потом тебя всё равно пересчитают, но хотя бы живым.',
      'Если начнётся шум, не бей первого. Бей дверь, которая открывается.',
    ],
    talkLinesPost: [
      'Ряд вышел тихо. Тихо - это когда начальник ещё не понял, кого считать.',
      'Фамилии лучше не держать в кармане рядом с хлебом. Бумага жирнеет.',
    ],
  },
  spetspriemnik_informant_tolya: {
    name: 'Толя Поимённый',
    isFemale: false,
    faction: Faction.WILD,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 76,
    maxHp: 86,
    money: 31,
    speed: 0.82,
    inventory: [
      { defId: 'denunciation', count: 1 },
      { defId: 'forged_permit_slip', count: 1 },
    ],
    talkLines: [
      'Имя стоит больше пайки, если его вовремя назвать не тому человеку.',
      'Принесёшь копию личного дела - скажу, кого можно выпустить, а кого лучше оставить кричать.',
      'Донос плохой только когда подписан твоей рукой. Чужая рука иногда кормит.',
    ],
    talkLinesPost: [
      'Фамилии поменяли камеры. Теперь охрана ищет старую правду по новой койке.',
      'Я ничего не продавал. Я обменял бумагу на воздух.',
    ],
  },
  spetspriemnik_clerk_alla: {
    name: 'Алла Приёмная',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 90,
    maxHp: 90,
    money: 66,
    speed: 0.8,
    inventory: [
      { defId: 'blank_form', count: 2 },
      { defId: SPETSPRIEMNIK_PERMIT_KEY, count: 1 },
      { defId: 'stolen_terminal_stamp', count: 1 },
    ],
    talkLines: [
      'Задержанный без фамилии принимается как вещь. Вещи жалобы не пишут, но иногда возвращаются.',
      'Корешок пропуска открывает пост. Кованый корешок открывает разговор с Саввой.',
      'Если двор шумит, окно приёма закрывается. Бумаги не любят, когда их толкают плечом.',
    ],
    talkLinesPost: [
      'Окно снова принимает. Вчерашние фамилии убрали в нижний ящик.',
      'Печать целая. Значит, виноват не стол.',
    ],
  },
};

