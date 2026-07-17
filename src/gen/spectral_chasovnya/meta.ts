import {
  Faction,
  Occupation,
  RoomType,
  W,
  ZoneFaction,
  type Room,
  type TerritoryOwner,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('spectral_chasovnya');

export const SPECTRAL_CHASOVNYA_ROUTE_ID = 'spectral_chasovnya' as const;

export const SPECTRAL_CHASOVNYA_Z = -42 as const;

export const SPECTRAL_CHASOVNYA_BASE_FLOOR = 180;

export const SPECTRAL_CHASOVNYA_ROOM_DEF_IDS = {
  entry: 'Преддверие спектральной часовни',
  nave: 'Неф стоячей волны',
  bellCage: 'Колокольная клетка спектрального звона',
  radioSacristy: 'Радиоризница глухих свечей',
  quietNorth: 'Северная акустическая тень',
  quietSouth: 'Южная акустическая тень',
  focusArch: 'Фокусирующая арка слепого прострела',
  crypt: 'Костяной резонатор нижнего хора',
  exit: 'Нижний притвор без эха',
} as const;

export type NextId = { v: number };

export type SpectralRoomKey = keyof typeof SPECTRAL_CHASOVNYA_ROOM_DEF_IDS;

export type SpectralRooms = Record<SpectralRoomKey, Room>;

export const ROOM_DEF_ID_TO_KEY = new Map<string, SpectralRoomKey>(
  Object.entries(SPECTRAL_CHASOVNYA_ROOM_DEF_IDS).map(([key, name]) => [name, key as SpectralRoomKey])
);

export type SpectralDecision = 'fire_loudly' | 'move_silently' | 'ring_bell' | 'avoid_focus' | 'listen_radio' | 'flee';

export interface SpectralStandingWaveRoom {
  id: string;
  roomDefId: string;
  roomId: number;
  x: number;
  y: number;
  wavelengthCells: number;
  pressure: 1 | 2 | 3 | 4 | 5;
  decisions: SpectralDecision[];
  tags: string[];
}

export interface SpectralShadowZone {
  id: string;
  roomDefId: string;
  roomId: number;
  x: number;
  y: number;
  radius: number;
  coverCells: number;
  decisions: SpectralDecision[];
  tags: string[];
}

export interface SpectralBellNode {
  id: string;
  roomDefId: string;
  roomId: number;
  x: number;
  y: number;
  radius: number;
  cooldownSec: number;
  pulseTags: string[];
  decisions: SpectralDecision[];
}

export interface SpectralAcousticBand {
  id: string;
  modeIndex: number;
  frequencyHint: string;
  standingWaveRoomIds: number[];
  shadowRoomIds: number[];
  bellNodeIds: string[];
  tags: string[];
}

export interface SpectralChasovnyaState {
  routeId: typeof SPECTRAL_CHASOVNYA_ROUTE_ID;
  z: typeof SPECTRAL_CHASOVNYA_Z;
  standingWaveRooms: SpectralStandingWaveRoom[];
  shadowZones: SpectralShadowZone[];
  bellNodes: SpectralBellNode[];
  acousticBands: SpectralAcousticBand[];
  rungBellNodeIds: string[];
  lastBellPulseAt: number;
}

export interface SpectralChasovnyaGeneration extends FloorGeneration {
  spectralState: SpectralChasovnyaState;
}

export const NPC_ID = 'spectral_bellwarden_miron' as const;

export const BELL_COOLDOWN_SEC = 18;

export const BELL_INTERACTION_RANGE = 2.6;

export const BELL_LOOK_RADIUS = 1.45;

export const SPECTRAL_CENTER_X = W >> 1;

export const SPECTRAL_CENTER_Y = W >> 1;

export const SPECTRAL_AMBIENT_NPC_PREFIX = 'Спектральная часовня: слушатель ';

export interface SpectralHqSupportSpec {
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpectralHqSpec {
  owner: TerritoryOwner;
  title: string;
  hq: SpectralHqSupportSpec;
  support: readonly SpectralHqSupportSpec[];
}

export const SPECTRAL_HQ_SPECS: readonly SpectralHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    title: 'Гражданский слуховой двор',
    hq: { name: 'Гражданский слуховой двор: гермоядро', type: RoomType.HQ, x: 132, y: 150, w: 28, h: 16 },
    support: [
      { name: 'Гражданский слуховой двор: кухня тихого кипятка', type: RoomType.KITCHEN, x: 96, y: 128, w: 24, h: 12 },
      { name: 'Гражданский слуховой двор: общая комната шепота', type: RoomType.COMMON, x: 164, y: 128, w: 30, h: 14 },
      { name: 'Гражданский слуховой двор: кладовая ватных дверей', type: RoomType.STORAGE, x: 96, y: 174, w: 22, h: 12 },
      { name: 'Гражданский слуховой двор: медугол слуха', type: RoomType.MEDICAL, x: 164, y: 174, w: 24, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    title: 'Ликвидаторский пост глушения',
    hq: { name: 'Ликвидаторский пост глушения: гермоядро', type: RoomType.HQ, x: 836, y: 148, w: 28, h: 16 },
    support: [
      { name: 'Ликвидаторский пост глушения: оружейная тишины', type: RoomType.STORAGE, x: 798, y: 128, w: 26, h: 12 },
      { name: 'Ликвидаторский пост глушения: журнал эха', type: RoomType.OFFICE, x: 868, y: 128, w: 28, h: 12 },
      { name: 'Ликвидаторский пост глушения: санитарный шлюз', type: RoomType.BATHROOM, x: 798, y: 174, w: 24, h: 12 },
      { name: 'Ликвидаторский пост глушения: мастерская наушников', type: RoomType.PRODUCTION, x: 868, y: 174, w: 28, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    title: 'НИИ стоячей волны',
    hq: { name: 'НИИ стоячей волны: гермоядро', type: RoomType.HQ, x: 142, y: 804, w: 28, h: 16 },
    support: [
      { name: 'НИИ стоячей волны: лаборатория тишины', type: RoomType.PRODUCTION, x: 100, y: 782, w: 30, h: 13 },
      { name: 'НИИ стоячей волны: кабинет спектра', type: RoomType.OFFICE, x: 176, y: 782, w: 28, h: 13 },
      { name: 'НИИ стоячей волны: медизмерительная', type: RoomType.MEDICAL, x: 100, y: 828, w: 24, h: 12 },
      { name: 'НИИ стоячей волны: склад камертонов', type: RoomType.STORAGE, x: 176, y: 828, w: 24, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    title: 'Дикий притон сорванного хора',
    hq: { name: 'Дикий притон сорванного хора: гермоядро', type: RoomType.HQ, x: 836, y: 804, w: 28, h: 16 },
    support: [
      { name: 'Дикий притон сорванного хора: кухня жестянок', type: RoomType.KITCHEN, x: 798, y: 782, w: 24, h: 12 },
      { name: 'Дикий притон сорванного хора: курилка глухих', type: RoomType.SMOKING, x: 868, y: 782, w: 26, h: 12 },
      { name: 'Дикий притон сорванного хора: разборная кладовая', type: RoomType.STORAGE, x: 798, y: 828, w: 28, h: 12 },
      { name: 'Дикий притон сорванного хора: общий костяк', type: RoomType.COMMON, x: 868, y: 828, w: 28, h: 12 },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    title: 'Культовая ризница низкого звона',
    hq: { name: 'Культовая ризница низкого звона: гермоядро', type: RoomType.HQ, x: 486, y: 708, w: 32, h: 18 },
    support: [
      { name: 'Культовая ризница низкого звона: общая хора', type: RoomType.COMMON, x: 444, y: 686, w: 30, h: 14 },
      { name: 'Культовая ризница низкого звона: кухня свечного жира', type: RoomType.KITCHEN, x: 528, y: 686, w: 26, h: 13 },
      { name: 'Культовая ризница низкого звона: кладовая свечей', type: RoomType.STORAGE, x: 444, y: 734, w: 26, h: 13 },
      { name: 'Культовая ризница низкого звона: исповедальная радиопомех', type: RoomType.OFFICE, x: 528, y: 734, w: 30, h: 13 },
      { name: 'Культовая ризница низкого звона: костяной медугол', type: RoomType.MEDICAL, x: 486, y: 760, w: 30, h: 13 },
    ],
  },
] as const;

export const MIRON_DEF: PlotNpcDef = {
  name: 'Мирон Звонарь',
  isFemale: false,
  faction: Faction.CULTIST,
  occupation: Occupation.PRIEST,
  sprite: Occupation.PRIEST,
  hp: 150,
  maxHp: 150,
  money: 42,
  speed: 0.74,
  inventory: [
    { defId: 'istotit_candle', count: 1 },
    { defId: 'radio_jammer', count: 1 },
    { defId: 'bottled_voice', count: 1 },
  ],
  talkLines: [
    'В часовне не слушают стены. Здесь слушают пустоты между стенами.',
    'Выстрел двигает слепых. Тихий шаг проходит мимо них, если не смотреть на колокол.',
    'Звон не спасает. Он собирает угрозу в одну точку, чтобы у тебя была другая.',
  ],
  talkLinesPost: [
    'Колокол помнит, кто тянул верёвку. Это не всегда плохо.',
    'Не спорь с эхом: оно отвечает чужим голосом.',
  ],
};

