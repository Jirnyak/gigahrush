import {
  Faction,
  Occupation,
  RoomType,
  Tex,
  ZoneFaction,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('registry_morgue');

export const REGISTRY_MORGUE_ROUTE_ID = 'registry_morgue' as const;

export const REGISTRY_MORGUE_FUTURE_Z = 18 as const;

export const REGISTRY_MORGUE_BASE_FLOOR = 30;

export const REGISTRY_MORGUE_DEBUG_ENTRY = 'design_floor.registry_morgue' as const;

export const CORPSE_NUMBER_TAG_ITEM = 'corpse_number_tag' as const;

export const REGISTRY_MORGUE_TARGET_ROUTE = {
  designFloorId: REGISTRY_MORGUE_ROUTE_ID,
  z: REGISTRY_MORGUE_FUTURE_Z,
  tags: ['registry_morgue', 'morgue', 'death_record'],
  label: 'Морг регистраций',
  risk: 4,
} as const;

export type NextId = { v: number };

export type MorgueDoorSide = 'north' | 'south' | 'west' | 'east';

export type MorgueRecordDomain = 'living_record' | 'dead_record' | 'contaminated_record';

export interface MorgueDrawerSlot {
  x: number;
  y: number;
  roomId: number;
  hilbert: number;
}

export interface MorgueHqSpec {
  owner: TerritoryOwner;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  supportPrefix: string;
  wallTex: Tex;
  floorTex: Tex;
  exitSide: MorgueDoorSide;
  connectX: number;
  connectY: number;
  support: readonly RoomType[];
}

export interface MorgueArchiveBlockSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  connectX: number;
  connectY: number;
  ownerHint: TerritoryOwner;
}

export interface MorgueRecordDomainDef {
  label: string;
  tag: string;
  faction: Faction;
  access: WorldContainer['access'];
  items: readonly string[];
}

export const MORGUE_RECORD_DOMAIN_ORDER: readonly MorgueRecordDomain[] = [
  'living_record',
  'dead_record',
  'contaminated_record',
];

export const REGISTRY_MORGUE_HQ_SPECS: readonly MorgueHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    x: 118,
    y: 132,
    w: 48,
    h: 30,
    name: 'Гражданский гермопункт выдачи тел',
    supportPrefix: 'Очередь выдачи тел',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_LINO,
    exitSide: 'south',
    connectX: 142,
    connectY: 260,
    support: [RoomType.KITCHEN, RoomType.BATHROOM, RoomType.STORAGE, RoomType.COMMON],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    x: 790,
    y: 132,
    w: 66,
    h: 38,
    name: 'Ликвидаторский штаб карантинной выдачи',
    supportPrefix: 'Карантинный пост выдачи',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
    exitSide: 'south',
    connectX: 824,
    connectY: 260,
    support: [RoomType.STORAGE, RoomType.MEDICAL, RoomType.OFFICE, RoomType.KITCHEN, RoomType.BATHROOM],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    x: 474,
    y: 132,
    w: 58,
    h: 34,
    name: 'НИИ-гермокор сверки посмертных записей',
    supportPrefix: 'НИИ сверки записей',
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_MARBLE_TILE,
    exitSide: 'south',
    connectX: 512,
    connectY: 260,
    support: [RoomType.MEDICAL, RoomType.OFFICE, RoomType.PRODUCTION, RoomType.STORAGE],
  },
  {
    owner: ZoneFaction.CULTIST,
    x: 130,
    y: 836,
    w: 42,
    h: 28,
    name: 'Скрытая культовая комната последней подписи',
    supportPrefix: 'Культовая подпись',
    wallTex: Tex.DARK,
    floorTex: Tex.F_RED_CARPET,
    exitSide: 'north',
    connectX: 152,
    connectY: 782,
    support: [RoomType.COMMON, RoomType.STORAGE, RoomType.BATHROOM],
  },
  {
    owner: ZoneFaction.WILD,
    x: 806,
    y: 834,
    w: 46,
    h: 30,
    name: 'Дикий выбитый пост чужих бирок',
    supportPrefix: 'Выбитый пост бирок',
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_CONCRETE,
    exitSide: 'north',
    connectX: 828,
    connectY: 782,
    support: [RoomType.STORAGE, RoomType.KITCHEN, RoomType.BATHROOM, RoomType.COMMON],
  },
] as const;

export const MORGUE_RECORD_DOMAINS: Record<MorgueRecordDomain, MorgueRecordDomainDef> = {
  living_record: {
    label: 'живая запись',
    tag: 'potts_living_record',
    faction: Faction.SCIENTIST,
    access: 'owner',
    items: ['passport_stub', 'blank_form', 'sealed_complaint'],
  },
  dead_record: {
    label: 'мертвая запись',
    tag: 'potts_dead_record',
    faction: Faction.SCIENTIST,
    access: 'locked',
    items: ['denunciation', 'ink_bottle', 'blank_form'],
  },
  contaminated_record: {
    label: 'зараженная запись',
    tag: 'potts_contaminated_record',
    faction: Faction.LIQUIDATOR,
    access: 'locked',
    items: ['emergency_roster', 'container_key_label', 'denunciation'],
  },
};

export const NPC_DEFS: Record<string, PlotNpcDef> = {
  morgue_registrar_faina: {
    name: 'Фаина Реестровая',
    isFemale: true,
    faction: Faction.SCIENTIST,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 105, maxHp: 105, money: 90, speed: 0.7,
    inventory: [
      { defId: 'official_quarantine_clearance', count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'ink_bottle', count: 1 },
    ],
    talkLines: [
      'Здесь не спорят, кто умер. Здесь смотрят, какая строка в журнале осталась открытой.',
      'Бирка без книги ничего не значит. Книга без бирки значит слишком много.',
      'Холодильная камера держит туман лучше людей, но внутри всегда есть цена.',
      'Не подписывайте пустое свидетельство. Пустая графа быстро получает чужой пульс.',
      'Если запись исправить правильно, Райсовет признает новый факт раньше человека.',
    ],
    talkLinesPost: [
      'Запись легла ровно. Теперь дверь открывается на другое имя.',
      'Не носите две справки рядом. Они начинают сверять вас между собой.',
    ],
  },

  morgue_orderly_stepan: {
    name: 'Степан Носильный',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.LOCKSMITH,
    sprite: Occupation.LOCKSMITH,
    hp: 140, maxHp: 140, money: 35, speed: 0.8,
    inventory: [
      { defId: 'crowbar', count: 1 },
      { defId: 'container_key_label', count: 1 },
    ],
    talkLines: [
      'Я тележки считаю по колесам. Сегодня одно колесо вернулось без тележки.',
      'В грязной камере человек попросил свою бирку слишком вежливо.',
      'Бирку лучше не класть в карман с пропуском. Потом оба спорят, кто из вас живой.',
      'Не подходите близко к тому, кто сам знает номер ящика.',
    ],
    talkLinesPost: [
      'Теперь хотя бы ясно, кого не было.',
      'Бирки снова молчат. Для морга это хороший звук.',
    ],
  },

  morgue_relative_ira: {
    name: 'Ира Заименованная',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.HOUSEWIFE,
    sprite: Occupation.HOUSEWIFE,
    hp: 70, maxHp: 70, money: 18, speed: 0.65,
    inventory: [
      { defId: 'tea', count: 1 },
      { defId: 'sealed_complaint', count: 1 },
    ],
    talkLines: [
      'Мне не нужны лекарства. Мне нужна фамилия, которую не вычеркнули.',
      'Если найдете личное дело, я узнаю, кого мне оплакивать в очереди.',
      'Пустая бирка хуже пустого ящика. Ящик хотя бы честно молчит.',
      'Корешок без дела не возвращает человека. Но без корешка его даже искать не будут.',
    ],
    talkLinesPost: [
      'Имя вернулось. Этого мало, но теперь хотя бы есть кому молчать.',
      'Возьмите копию дела. Я больше не хочу быть единственным свидетелем.',
    ],
  },

  morgue_quarantine_sanitar: {
    name: 'Санитар Крутов',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 220, maxHp: 220, money: 75, speed: 0.95,
    inventory: [
      { defId: 'pipe', count: 1 },
      { defId: 'bandage', count: 1 },
      { defId: 'denunciation', count: 1 },
    ],
    talkLines: [
      'Медицинский шкаф открывается справкой, ключом или преступлением.',
      'Мне нужна чистая карантинная бумага. Тогда выдача станет законной.',
      'Если полезете в шкаф сами, журнал назовет это кражей. Я назову громче.',
      'Справка без адресата заражает очередь быстрее кашля.',
    ],
    talkLinesPost: [
      'Справка чистая. Лекарства теперь грязнятся только руками.',
      'Не тратьте ампулу на смелость. Смелость плохо документируется.',
    ],
  },
};

