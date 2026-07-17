import {
  Faction,
  Occupation,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('penrose_laundry');

export const PENROSE_LAUNDRY_ROUTE_ID = 'penrose_laundry' as const;

export const PENROSE_LAUNDRY_Z = -8;

export const PENROSE_LAUNDRY_BASE_FLOOR = 100;

export const PENROSE_LAUNDRY_ROOM_DEF_IDS = {
  liftLobby: 'Лифтовая бирка прачечной П-81',
  firstSun: 'Прачечная метка Солнце П-81',
  secondSun: 'Сушильная метка Солнце П-81',
  kiteBoiler: 'Котельная метка Кайт П-81',
  steamValve: 'Паровой отвод П-81',
  lock: 'Прачечный замок П-81',
  hiddenCache: 'Скрытая умывальная кэш П-81',
  dryCache: 'Сухая кэш-складка П-81',
  deflationA: 'Карман дефляции А П-81',
  deflationB: 'Карман дефляции Б П-81',
  rinseLine: 'Ополаскиватель без периода П-81',
  drainTail: 'Хвост сливной решетки П-81',
} as const;

export type PenroseLaundrySymbol = 'sun' | 'kite' | 'dart' | 'drop' | 'coil';

export type PenroseLaundryMotif = 'route' | 'water' | 'heat' | 'deflation' | 'lock' | 'cache';

export interface PenroseTileSpec {
  id: string;
  roomDefId: string;
  symbol: PenroseLaundrySymbol;
  motif: PenroseLaundryMotif;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  wallTex: Tex;
  floorTex: Tex;
}

export interface PenroseLaundryTileRecord {
  id: string;
  roomDefId: string;
  roomId: number;
  symbol: PenroseLaundrySymbol;
  motif: PenroseLaundryMotif;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PenroseFullNode {
  room: Room;
  index: number;
  symbol: PenroseLaundrySymbol;
}

export interface PenroseHqSpec {
  owner: ZoneFaction;
  title: string;
  x: number;
  y: number;
  strong?: boolean;
  wallTex: Tex;
  floorTex: Tex;
  supportWallTex: Tex;
  supportFloorTex: Tex;
}

export interface PenroseLaundryState {
  routeId: typeof PENROSE_LAUNDRY_ROUTE_ID;
  anchorZ: typeof PENROSE_LAUNDRY_Z;
  tiles: PenroseLaundryTileRecord[];
  symbolChainRoomNames: string[];
  deflationPocketRoomNames: string[];
  lockedDoorIds: number[];
  containerIds: {
    laundryLock: number;
    steamValve: number;
    hiddenWashroomCache: number;
  };
  waterCells: number;
  steamCells: number;
  debugEntry: {
    spawnX: number;
    spawnY: number;
    summary: string;
  };
}

export interface PenroseLaundryGeneration extends FloorGeneration {
  penroseLaundryState: PenroseLaundryState;
}

export const C = W >> 1;

export const PHI = (1 + Math.sqrt(5)) / 2;

export const GOLDEN_TURN = Math.PI * (3 - Math.sqrt(5));

export const LOCK_KEY_ID = 'container_key_label';

export const TILE_SPECS: readonly PenroseTileSpec[] = [
  { id: 'lift_lobby', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.liftLobby, symbol: 'coil', motif: 'route', type: RoomType.CORRIDOR, x: C - 34, y: C - 20, w: 22, h: 20, wallTex: Tex.LIFT_DOOR, floorTex: Tex.F_CONCRETE },
  { id: 'first_sun', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.firstSun, symbol: 'sun', motif: 'water', type: RoomType.PRODUCTION, x: C, y: C - 32, w: 36, h: 18, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { id: 'west_drop', roomDefId: 'Мокрая метка Капля П-81', symbol: 'drop', motif: 'water', type: RoomType.BATHROOM, x: C - 71, y: C - 23, w: 26, h: 18, wallTex: Tex.TILE_W, floorTex: Tex.F_WATER },
  { id: 'deflation_a', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.deflationA, symbol: 'dart', motif: 'deflation', type: RoomType.STORAGE, x: C - 22, y: C - 52, w: 16, h: 12, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { id: 'kite_boiler', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.kiteBoiler, symbol: 'kite', motif: 'heat', type: RoomType.PRODUCTION, x: C + 40, y: C - 7, w: 28, h: 22, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
  { id: 'deflation_b', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.deflationB, symbol: 'sun', motif: 'deflation', type: RoomType.STORAGE, x: C + 48, y: C - 38, w: 14, h: 14, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
  { id: 'rinse_line', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.rinseLine, symbol: 'drop', motif: 'water', type: RoomType.BATHROOM, x: C + 103, y: C - 12, w: 28, h: 16, wallTex: Tex.TILE_W, floorTex: Tex.F_WATER },
  { id: 'drain_tail', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.drainTail, symbol: 'dart', motif: 'water', type: RoomType.STORAGE, x: C + 78, y: C - 50, w: 22, h: 14, wallTex: Tex.DARK, floorTex: Tex.F_WATER },
  { id: 'steam_valve', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.steamValve, symbol: 'kite', motif: 'heat', type: RoomType.PRODUCTION, x: C + 11, y: C + 23, w: 32, h: 22, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
  { id: 'second_sun', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.secondSun, symbol: 'sun', motif: 'water', type: RoomType.PRODUCTION, x: C - 32, y: C + 44, w: 28, h: 18, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
  { id: 'laundry_lock', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.lock, symbol: 'coil', motif: 'lock', type: RoomType.STORAGE, x: C - 67, y: C + 23, w: 26, h: 16, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  { id: 'hidden_cache', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.hiddenCache, symbol: 'sun', motif: 'cache', type: RoomType.BATHROOM, x: C - 98, y: C + 46, w: 20, h: 14, wallTex: Tex.TILE_W, floorTex: Tex.F_WATER },
  { id: 'dry_cache', roomDefId: PENROSE_LAUNDRY_ROOM_DEF_IDS.dryCache, symbol: 'dart', motif: 'cache', type: RoomType.STORAGE, x: C + 78, y: C + 23, w: 18, h: 14, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
] as const;

export const SYMBOL_CHAIN_IDS = ['first_sun', 'deflation_b', 'second_sun', 'hidden_cache'] as const;

export const DEFLATION_IDS = ['deflation_a', 'deflation_b'] as const;

export const FULL_FLOOR_NODE_COUNT = 96;

export const FULL_FLOOR_NODE_RADIUS_MIN = 96;

export const FULL_FLOOR_NODE_RADIUS_SPAN = 408;

export const FULL_FLOOR_NODE_SYMBOLS: readonly PenroseLaundrySymbol[] = ['sun', 'kite', 'dart', 'drop', 'coil'];

export const PENROSE_HQ_SPECS: readonly PenroseHqSpec[] = [
  { owner: ZoneFaction.CITIZEN, title: 'граждан', x: 110, y: 154, strong: true, wallTex: Tex.PANEL, floorTex: Tex.F_LINO, supportWallTex: Tex.PANEL, supportFloorTex: Tex.F_TILE },
  { owner: ZoneFaction.LIQUIDATOR, title: 'ликвидаторов', x: 785, y: 142, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE, supportWallTex: Tex.PIPE, supportFloorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.SCIENTIST, title: 'учёных', x: 762, y: 736, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET, supportWallTex: Tex.TILE_W, supportFloorTex: Tex.F_TILE },
  { owner: ZoneFaction.WILD, title: 'диких', x: 132, y: 746, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE, supportWallTex: Tex.METAL, supportFloorTex: Tex.F_CONCRETE },
  { owner: ZoneFaction.CULTIST, title: 'культистов', x: 452, y: 878, wallTex: Tex.MEAT, floorTex: Tex.F_MEAT, supportWallTex: Tex.DARK, supportFloorTex: Tex.F_GREEN_CARPET },
] as const;

export const NPC_IDS = {
  marfa: 'penrose_laundry_marfa_symbols',
  igor: 'penrose_laundry_igor_lock',
  lidia: 'penrose_laundry_lidia_steam',
  tonya: 'penrose_laundry_tonya_cache',
} as const;

export const MARFA_DEF: PlotNpcDef = {
  name: 'Марфа Меточная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.HOUSEWIFE,
  sprite: Occupation.HOUSEWIFE,
  hp: 88, maxHp: 88, money: 24, speed: 0.78,
  inventory: [{ defId: 'chalk', count: 1 }, { defId: 'cloth_roll', count: 1 }],
  talkLines: [
    'Плитка тут не повторяется. Повторяется только знак. За Солнцем иди к Солнцу, а не прямо.',
    'Если знак совпал, не спорь с углом. Машинка знает короче, чем глаз.',
    'Кто идет по мокрому ромбу, тот выходит к сухой кэш-складке.',
  ],
  talkLinesPost: [
    'Солнца сошлись. Значит, прачечная еще помнит, где у нее изнанка.',
    'Метки лучше не стирать: без них пол снова станет просто полом.',
  ],
};

export const IGOR_DEF: PlotNpcDef = {
  name: 'Игорь Прищеп',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.LOCKSMITH,
  sprite: Occupation.LOCKSMITH,
  hp: 110, maxHp: 110, money: 31, speed: 0.82,
  inventory: [{ defId: 'wrench', count: 1 }, { defId: LOCK_KEY_ID, count: 1 }],
  talkLines: [
    'Прачечный замок не открывают. Его убеждают ключом, рукояткой или плохой паузой.',
    'Бирка от ключа подходит не к двери, а к ее памяти. Этого тут хватает.',
    'Сломаешь тихо - шкаф обидится меньше, чем очередь.',
  ],
  talkLinesPost: [
    'Замок стал мягче. Не добрее, просто мягче.',
    'Теперь у двери есть версия, что она открылась сама.',
  ],
};

export const LIDIA_DEF: PlotNpcDef = {
  name: 'Лидия Пароотвод',
  isFemale: true,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.MECHANIC,
  sprite: Occupation.MECHANIC,
  hp: 128, maxHp: 128, money: 40, speed: 0.84,
  inventory: [{ defId: 'valve_tag', count: 1 }, { defId: 'asbestos_cord', count: 1 }, { defId: 'boiler_water', count: 1 }],
  talkLines: [
    'Пар можно пустить в сушку, в слив или в лицо тому, кто не читает бирку.',
    'Мне нужна бирка вентиля. Тогда жар уйдет в котел, а не в коридор.',
    'Красный туман тут короткий. Длинные ожоги делает не пар, а геройство.',
  ],
  talkLinesPost: [
    'Пар ушел по ромбу. Слушай: теперь свистит не на тебя.',
    'Котел не благодарит. Это хороший признак.',
  ],
};

export const TONYA_DEF: PlotNpcDef = {
  name: 'Тоня Тайник',
  isFemale: true,
  faction: Faction.WILD,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 92, maxHp: 92, money: 16, speed: 0.9,
  inventory: [{ defId: 'pressure_logbook', count: 1 }, { defId: 'filtered_water', count: 1 }],
  talkLines: [
    'Скрытая умывальная есть только когда не ищешь умывальную. Иди по двум одинаковым Солнцам.',
    'В кэше лежит мокрый журнал. Не открывай его над водой, он начнет спорить с давлением.',
    'Тайник не мой. Я просто первая поняла, что он боится сухих рук.',
  ],
  talkLinesPost: [
    'Журнал нашелся. Теперь давление хотя бы можно обвинить по фамилии.',
    'Не рассказывай очереди, где кэш. Очередь туда не влезет, но попробует.',
  ],
};

