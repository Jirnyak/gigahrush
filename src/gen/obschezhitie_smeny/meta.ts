import {
  Faction,
  Occupation,
  RoomType,
  ZoneFaction,
  type Room,
} from '../../core/types';
import { hashSeed } from '../../core/rand';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('obschezhitie_smeny');

export const OBSCHEZHITIE_SMENY_DESIGN_FLOOR_ID = 'obschezhitie_smeny' as const;

export const OBSCHEZHITIE_SMENY_ROUTE_Z = -6;

export const BASE_FLOOR = 100;

export const DORM_SEED = hashSeed(OBSCHEZHITIE_SMENY_DESIGN_FLOOR_ID);

export const SLEEPER_TEMPLATE_COUNT = 36;

export const PATROL_TEMPLATE_COUNT = 8;

export const DORM_RINGS = [
  { left: 300, top: 398, right: 724, bottom: 622, width: 3 },
  { left: 224, top: 342, right: 800, bottom: 688, width: 3 },
  { left: 150, top: 278, right: 874, bottom: 754, width: 3 },
  { left: 82, top: 198, right: 942, bottom: 834, width: 3 },
] as const;

export const NPC_IDS = {
  rita: 'obschezhitie_rita_starshaya',
  gleb: 'obschezhitie_gleb_obhod',
  senya: 'obschezhitie_senya_tikhiy',
} as const;

export const NPC_DEFS: Record<(typeof NPC_IDS)[keyof typeof NPC_IDS], PlotNpcDef> = {
  obschezhitie_rita_starshaya: {
    name: 'Рита Старшая Смены',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 95,
    maxHp: 95,
    money: 34,
    speed: 0.82,
    inventory: [{ defId: 'shelter_tally', count: 1 }, { defId: 'bread', count: 2 }, { defId: 'water_coupon', count: 1 }],
    talkLines: [
      'Смена спит не потому, что спокойно. Просто иначе завтра никто не дойдёт до станка.',
      'Будишь одного - просыпается коридор. Коридор потом всё помнит.',
      'Ведомость укрытых нужна до сирены. Во сне фамилии легко теряются.',
      'Шкафы не наши и не чужие. Они сменные. Это хуже.',
    ],
    talkLinesPost: [
      'Список лежит у гермы. Если сирена начнётся, буди не голосом, а дверью.',
      'Кто взял по талону, тот живёт дольше. Кто взял тихо, живёт тише.',
    ],
  },
  obschezhitie_gleb_obhod: {
    name: 'Глеб Ночной Обход',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 130,
    maxHp: 130,
    money: 48,
    speed: 0.95,
    weapon: 'rubber_club',
    inventory: [{ defId: 'flashlight', count: 1 }, { defId: 'cigs', count: 2 }, { defId: 'samosbor_tally', count: 1 }],
    talkLines: [
      'Маршрут простой: дверь, храп, шкаф, тишина. Сложным его делают живые.',
      'Если хочешь пройти тихо, держи свет ниже лиц. Лицо просыпается быстрее человека.',
      'Пачка сигарет покупает один круг молчания. Второй круг уже оформляется.',
      'Сирена здесь звучит глухо. Зато шаги по линолеуму слышно прекрасно.',
    ],
    talkLinesPost: [
      'Обход видел меньше, чем мог. Запомни это как услугу.',
      'Тихая ночь не бесплатная, просто квитанцию выпишут утром.',
    ],
  },
  obschezhitie_senya_tikhiy: {
    name: 'Сеня Тихий',
    isFemale: false,
    faction: Faction.WILD,
    occupation: Occupation.TRAVELER,
    sprite: Occupation.TRAVELER,
    hp: 100,
    maxHp: 100,
    money: 17,
    speed: 1.03,
    inventory: [{ defId: 'container_key_label', count: 1 }, { defId: 'sleeping_pills', count: 1 }, { defId: 'cigs', count: 1 }],
    talkLines: [
      'Тут воруют не руками. Тут воруют звуком: хлопнул шкафом - уже пойман.',
      'Снотворное не для них, а для совести. Совесть громче койки скрипит.',
      'Я знаю шкаф, который открывается без свидетелей. Но сначала нужен повод не проснуться.',
      'Если начнётся самосбор, все станут честными сразу. До него выбирай сам.',
    ],
    talkLinesPost: [
      'Тихо получилось. Слишком тихо, но это уже не моя работа.',
      'Шкафы любят ночь. Утром они начинают жаловаться.',
    ],
  },
};

export interface DormLayout {
  northY: number;
  southY: number;
  leftX: number;
  rightX: number;
  spawnX: number;
  spawnY: number;
}

export interface DormRooms {
  bunks: Room[];
  support: Room[];
  hqs: DormHq[];
  watch: Room;
  kitchen: Room;
  lockers: Room;
  wash: Room;
  shelter: Room;
  smoking: Room;
}

export interface DormHq {
  owner: ZoneFaction;
  hq: Room;
  support: Room[];
}

export interface DormHqSpec {
  owner: ZoneFaction;
  name: string;
  hq: [number, number, number, number];
  door: 'north' | 'south' | 'west' | 'east';
  target: { x: number; y: number };
  support: readonly [RoomType, number, number, number, number, string][];
}

