/* ── Design z: dark_metro / Темная пересадка ─────────────── */

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  DoorState,
  Faction,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Entity,
  type GameState,
  type TerritoryOwner,
  type Zone,
} from '../../core/types';
import { World } from '../../core/world';
import { hashSeed, withSeededRandom, seededRandom } from '../../core/rand';
import { factionToTerritoryOwner } from '../../data/factions';
import { designNpcFloorKey, type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { publishEvent } from '../../systems/events';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { applyDesignFloorPopulationField } from '../design_floors/population';
import { syncZoneMetadataFromTerritory } from '../../systems/territory';

import {
  DarkMetroFullFloorStyle,
  axisDistance,
  nearestDarkMetroLineDistance,
  nearestDarkMetroDefendedPostDistance2,
  darkMetroProtectedMask,
  paintDarkMetroRoomOwner,
  decorateDarkMetroOwnedRoom,
  hardenDarkMetroHqRoom,
  addDarkMetroHqCompounds,
  addDarkMetroStationBlocks,
  addDarkMetroServiceIslands,
  addDarkMetroBlindCells,
  carveDarkMetroStationLine,
  addDarkMetroTicketHalls,
  addDarkMetroServiceRoutes,
  addDarkMetroTransferWeb,
  addDarkMetroTransferNodes,
  addDarkMetroRailBaitEdges,
  addDarkMetroDefendedPlatforms,
  applyDarkMetroPlatformSafetyShells,
  linkDarkMetroCoreToInterchange,
  stampDarkMetroLayout,
  tuneDarkMetroZones,
  dressDarkMetro
} from './geometry';
import {
  seedCoreMetroTrain,
  seedFullFloorMetroTrains,
  spawnDarkMetroNpcs,
  spawnDarkMetroLoot,
  spawnDarkMetroThreats,
  registerDarkMetroRouteCues,
  isDarkMetroAmbientNpc,
  darkMetroTerritorySpawnCells,
  applyDarkMetroAmbientLight} from './npcs';

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('dark_metro');

export const DESIGN_FLOOR_ID = 'dark_metro' as const;
export const DARK_METRO_DISPLAY_NAME = 'Темная пересадка';
export const DARK_METRO_FUTURE_Z = -32;
export const DARK_METRO_DEFAULT_SEED = 0x17da_4b0d;

export const DARK_METRO_BASE_FLOOR = 140;

export const enum PlatformLightState {
  OFF = 0,
  WEAK = 1,
  ON = 2,
}

export const enum SignalBoxState {
  WORN = 0,
  REPAIRED = 1,
  SABOTAGED = 2,
}

export const enum StrandedNpcState {
  STRANDED = 0,
  GUIDED = 1,
  LEFT_BEHIND = 2,
}

export type DarkMetroPackedState = number;

export interface DarkMetroStateParts {
  platformLight: 'off' | 'weak' | 'on';
  wrongRouteArmed: DarkMetroRouteId;
  signalBox: 'worn' | 'repaired' | 'sabotaged';
  strandedNpc: 'stranded' | 'guided' | 'left_behind';
}

export type DarkMetroRouteId =
  | 'dark_metro_market_88_smuggle'
  | 'dark_metro_service_floor_shortcut'
  | 'dark_metro_red_lower_wrong'
  | 'dark_metro_platform_fallback';

export interface DarkMetroRouteDef {
  id: DarkMetroRouteId;
  label: string;
  panelSlot: number;
  costItem?: string;
  costCount?: number;
  destinationHook: string;
  clue: string;
  fallbackRouteId: DarkMetroRouteId;
  tags: readonly string[];
}

export type DarkMetroAmbushCueId =
  | 'dark_metro_white_lamp_ambush'
  | 'dark_metro_red_panel_wrong_stop';

export interface DarkMetroAmbushCueDef {
  id: DarkMetroAmbushCueId;
  label: string;
  markerRoom: 'underpass' | 'platform';
  targetRoom: 'blindTunnel' | 'exit';
  warning: string;
  tags: readonly string[];
}

export interface DarkMetroFloorState {
  routeId: typeof DESIGN_FLOOR_ID;
  z: typeof DARK_METRO_FUTURE_Z;
  packedState: DarkMetroPackedState;
  ambushCueIds: DarkMetroAmbushCueId[];
  shortcutRouteIds: DarkMetroRouteId[];
}

export interface DarkMetroGeneration extends FloorGeneration {
  metroState: DarkMetroFloorState;
}

export const ROUTE_BITS = 2;
export const SIGNAL_BITS = 4;
export const STRANDED_BITS = 6;

export const DARK_METRO_ROUTES: readonly DarkMetroRouteDef[] = [
  {
    id: 'dark_metro_market_88_smuggle',
    label: 'Черный рынок 88: служебный ход',
    panelSlot: 0,
    costItem: 'metro_ticket',
    costCount: 1,
    destinationHook: 'future.market_88.underpass_entry',
    clue: 'Над табло мигает зеленая лампа, а на полу к тоннелю ведут три желтых пятна.',
    fallbackRouteId: 'dark_metro_platform_fallback',
    tags: ['dark_metro', 'market_88', 'smuggle', 'shortcut'],
  },
  {
    id: 'dark_metro_service_floor_shortcut',
    label: 'Служебный этаж: стрелочный коридор',
    panelSlot: 1,
    costItem: 'fuse',
    costCount: 1,
    destinationHook: 'future.service_floor.signal_hatch',
    clue: 'Табло щелкает в такт реле; стрелка горит только при живом предохранителе.',
    fallbackRouteId: 'dark_metro_platform_fallback',
    tags: ['dark_metro', 'service_floor', 'signal', 'shortcut'],
  },
  {
    id: 'dark_metro_red_lower_wrong',
    label: 'Красная нижняя: чужая остановка',
    panelSlot: 2,
    costItem: 'metro_ticket',
    costCount: 2,
    destinationHook: 'future.hell.red_platform_edge',
    clue: 'Красное табло показывает номер вагона без станции; безопасный обход подписан мелом у подземного хода.',
    fallbackRouteId: 'dark_metro_platform_fallback',
    tags: ['dark_metro', 'hell', 'wrong_route', 'red_line'],
  },
  {
    id: 'dark_metro_platform_fallback',
    label: 'Петля платформы: вернуться к свету',
    panelSlot: 3,
    destinationHook: 'dark_metro.station_hall',
    clue: 'Белые лампы вдоль стены ведут обратно в зал даже после неверного объявления.',
    fallbackRouteId: 'dark_metro_platform_fallback',
    tags: ['dark_metro', 'fallback', 'safe_return'],
  },
];

export const DARK_METRO_AMBUSH_CUES: readonly DarkMetroAmbushCueDef[] = [
  {
    id: 'dark_metro_white_lamp_ambush',
    label: 'Белые лампы перед засадой',
    markerRoom: 'underpass',
    targetRoom: 'blindTunnel',
    warning: 'Белый свет кончается перед слепым тоннелем: дальше слышно шаги, но фонарь ловит только мокрый бетон.',
    tags: ['dark_metro', 'ambush', 'shadow', 'warning'],
  },
  {
    id: 'dark_metro_red_panel_wrong_stop',
    label: 'Красное табло неверной посадки',
    markerRoom: 'platform',
    targetRoom: 'exit',
    warning: 'Красный номер на табло ведет к короткому ходу, но может объявить чужую остановку.',
    tags: ['dark_metro', 'wrong_route', 'shortcut', 'warning'],
  },
];

export const NORA_DEF: PlotNpcDef = {
  name: 'Нора Диспетчерская',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 150, maxHp: 150, money: 70, speed: 0.9,
  inventory: [
    { defId: 'metro_ticket', count: 3 },
    { defId: 'relay_diagram', count: 1 },
    { defId: 'tea', count: 1 },
  ],
  talkLines: [
    'Поезд здесь не ходит по расписанию. Он приходит, когда реле щелкнет не в ту сторону.',
    'Если табло говорит ровно, проверь лампу. Ровные объявления у нас чаще всего чужие.',
    'Не садись туда, где красный номер появился раньше станции. Возвратная петля отмечена белым светом.',
    'Двери закрываются - руки убрать, мысли тоже. Потом уже решай, ехать или ждать.',
    'Повторилась станция - сиди. Второй раз она обычно проверяет смелых.',
  ],
  talkLinesPost: [
    'Стрелка снова отвечает на ручку. Это не значит, что ей можно верить без билета.',
    'Платформа стала светлее. Теперь видно, кто стоит у края без билета.',
  ],
};

export const VENDOR_DEF: PlotNpcDef = {
  name: 'Ламповщик Гена',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 120, maxHp: 120, money: 110, speed: 0.85,
  inventory: [
    { defId: 'flashlight', count: 1 },
    { defId: 'lamp_bulb', count: 2 },
    { defId: 'metro_ticket', count: 2 },
    { defId: 'cigs', count: 3 },
  ],
  talkLines: [
    'Лампа дешевле, чем лечение после темного тоннеля.',
    'Платформу можно зажечь. Можно не зажигать. В темноте меньше видят и свои, и чужие.',
    'Фонарик не делает маршрут безопасным. Он только показывает, где платить.',
    'Если пустой состав дышит, спрячься за киоск. Пусть высадит тех, кого уже везет.',
    'Белая лампа у депо не спасает. Просто под ней видно обратную стену.',
  ],
  talkLinesPost: [
    'Горит? Значит, кто-то еще не украл лампу.',
    'Теперь у киоска видно руки. Этого уже хватает для торговли.',
  ],
};

export const STRANDED_DEF: PlotNpcDef = {
  name: 'Сержант Барсуков',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 95, maxHp: 180, money: 28, speed: 0.75,
  inventory: [
    { defId: 'bandage', count: 1 },
    { defId: 'ammo_9mm', count: 10 },
    { defId: 'gasmask_filter', count: 1 },
  ],
  talkLines: [
    'Я не заблудился. Я занял неправильную станцию до приказа.',
    'До света дойду. До голоса диспетчера - не уверен.',
    'Если объявят мою фамилию, не отвечай. Это не эвакуация.',
    'Красная нижняя теплая, как кабина после чужого рейса. От такой отходят к стене.',
    'Проводник был прав: первый щелчок слушай, на втором не стой у края.',
  ],
  talkLinesPost: [
    'Свет вижу. Значит, живые пока выигрывают у расписания.',
    'Возьми фильтр. Внизу воздух тоже любит проверять документы.',
  ],
  talkQuestResponse: 'Барсуков дошел? Хорошо. Пусть сидит у белой лампы и не спорит с объявлениями.',
};

export const MISHA_DEF: PlotNpcDef = {
  name: 'Миша с повтором',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.CHILD,
  sprite: Occupation.CHILD,
  hp: 80, maxHp: 80, money: 0, speed: 1.0,
  inventory: [
    { defId: 'child_map', count: 1 },
  ],
  talkLines: [
    'Не красный. Белый путь назад.',
    'Если поезд спросит имя, молчи.',
    'Я уже сказал это. Значит, еще не поздно.',
    'Билет с зубами прячь от света.',
    'Когда станция повторяется, пол холоднее двери. Сиди на полу.',
  ],
  talkLinesPost: [
    'Белый путь назад.',
  ],
};

let contentRegistered = false;

export function registerDarkMetroContent(): void {
  if (contentRegistered) return;
  contentRegistered = true;

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'dark_metro_dispatcher_nora', NORA_DEF, [
    {
      id: 'dark_metro_wrong_train',
      giverId: getPlotNpcNumericId('dark_metro_dispatcher_nora')!,
      type: QuestType.FETCH,
      desc: 'Нора: «Принеси билет метро и выбери табло с подсказкой. Неверная посадка должна стоить жетон, а не жизнь.»',
      targetItem: 'metro_ticket', targetCount: 1,
      rewardItem: 'lift_scheme', rewardCount: 1,
      extraRewards: [{ defId: 'clean_health_cert', count: 1 }],
      relationDelta: 10, xpReward: 65, moneyReward: 35,
    },
    {
      id: 'dark_metro_signal_box',
      giverId: getPlotNpcNumericId('dark_metro_dispatcher_nora')!,
      type: QuestType.FETCH,
      desc: 'Нора: «Два предохранителя в сигнальный ящик - и стрелка хотя бы начнет врать одинаково.»',
      targetItem: 'fuse', targetCount: 2,
      rewardItem: 'metro_ticket', rewardCount: 2,
      extraRewards: [{ defId: 'relay_diagram', count: 1 }],
      relationDelta: 12, xpReward: 80, moneyReward: 50,
    },
  ]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'dark_metro_lamp_vendor', VENDOR_DEF, [
    {
      id: 'dark_metro_light_platform',
      giverId: getPlotNpcNumericId('dark_metro_lamp_vendor')!,
      type: QuestType.FETCH,
      desc: 'Гена: «Три целые лампы - и на платформе будет видно край. Не принесешь - людей снова будут считать по крику.»',
      targetItem: 'lamp_bulb', targetCount: 3,
      rewardItem: 'flashlight', rewardCount: 1,
      extraRewards: [{ defId: 'metro_ticket', count: 1 }],
      relationDelta: 10, xpReward: 70, moneyReward: 30,
    },
  ]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'dark_metro_stranded_liquidator', STRANDED_DEF, [
    {
      id: 'dark_metro_rescue_stranded',
      giverId: getPlotNpcNumericId('dark_metro_stranded_liquidator')!,
      type: QuestType.TALK,
      desc: 'Барсуков: «Проведи меня до Норы {dir}. Если белые лампы кончатся, идем назад, не героим.»',
      targetNpcId: getPlotNpcNumericId('dark_metro_dispatcher_nora')!,
      rewardItem: 'gasmask_filter', rewardCount: 1,
      extraRewards: [{ defId: 'ammo_9mm', count: 12 }, { defId: 'bandage', count: 1 }],
      relationDelta: 12, xpReward: 75, moneyReward: 40,
    },
  ]);

  registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'dark_metro_child_omen_misha', MISHA_DEF, []);
}

registerDarkMetroContent();

export function packDarkMetroState(parts: DarkMetroStateParts): DarkMetroPackedState {
  const light = parts.platformLight === 'on' ? PlatformLightState.ON
    : parts.platformLight === 'off' ? PlatformLightState.OFF
      : PlatformLightState.WEAK;
  const route = Math.max(0, DARK_METRO_ROUTES.findIndex(r => r.id === parts.wrongRouteArmed));
  const signal = parts.signalBox === 'repaired' ? SignalBoxState.REPAIRED
    : parts.signalBox === 'sabotaged' ? SignalBoxState.SABOTAGED
      : SignalBoxState.WORN;
  const stranded = parts.strandedNpc === 'guided' ? StrandedNpcState.GUIDED
    : parts.strandedNpc === 'left_behind' ? StrandedNpcState.LEFT_BEHIND
      : StrandedNpcState.STRANDED;
  return light | (route << ROUTE_BITS) | (signal << SIGNAL_BITS) | (stranded << STRANDED_BITS);
}

export function unpackDarkMetroState(packed: DarkMetroPackedState): DarkMetroStateParts {
  const light = packed & 3;
  const routeIndex = (packed >> ROUTE_BITS) & 3;
  const signal = (packed >> SIGNAL_BITS) & 3;
  const stranded = (packed >> STRANDED_BITS) & 3;
  return {
    platformLight: light === PlatformLightState.ON ? 'on' : light === PlatformLightState.OFF ? 'off' : 'weak',
    wrongRouteArmed: DARK_METRO_ROUTES[Math.min(routeIndex, DARK_METRO_ROUTES.length - 1)].id,
    signalBox: signal === SignalBoxState.REPAIRED ? 'repaired' : signal === SignalBoxState.SABOTAGED ? 'sabotaged' : 'worn',
    strandedNpc: stranded === StrandedNpcState.GUIDED ? 'guided'
      : stranded === StrandedNpcState.LEFT_BEHIND ? 'left_behind'
        : 'stranded',
  };
}

export function initialDarkMetroState(seed = DARK_METRO_DEFAULT_SEED): DarkMetroPackedState {
  const routeIndex = hashSeed(DESIGN_FLOOR_ID, seed) % (DARK_METRO_ROUTES.length - 1);
  return packDarkMetroState({
    platformLight: 'weak',
    wrongRouteArmed: DARK_METRO_ROUTES[routeIndex].id,
    signalBox: 'worn',
    strandedNpc: 'stranded',
  });
}

export function createDarkMetroFloorState(packedState = initialDarkMetroState()): DarkMetroFloorState {
  return {
    routeId: DESIGN_FLOOR_ID,
    z: DARK_METRO_FUTURE_Z,
    packedState,
    ambushCueIds: DARK_METRO_AMBUSH_CUES.map(cue => cue.id),
    shortcutRouteIds: DARK_METRO_ROUTES
      .filter(route => route.tags.includes('shortcut'))
      .map(route => route.id),
  };
}

export function publishDarkMetroRouteEvent(
  state: GameState,
  world: World,
  actor: Entity,
  routeId: DarkMetroRouteId,
  packedState = initialDarkMetroState(),
): void {
  const route = DARK_METRO_ROUTES.find(r => r.id === routeId) ?? DARK_METRO_ROUTES[3];
  const parts = unpackDarkMetroState(packedState);
  const wrongStop = route.id === parts.wrongRouteArmed && route.id !== 'dark_metro_platform_fallback';
  const px = Math.floor(actor.x);
  const py = Math.floor(actor.y);
  const zoneId = world.zoneMap[world.idx(px, py)];
  publishEvent(state, {
    type: wrongStop ? 'metro_wrong_stop' : 'metro_route_taken',
    zoneId: zoneId >= 0 ? zoneId : undefined,
    x: actor.x,
    y: actor.y,
    actorId: actor.id,
    actorName: actor.name ?? 'Вы',
    actorFaction: actor.faction,
    severity: wrongStop ? 4 : 3,
    privacy: 'local',
    tags: ['metro', 'dark_metro', route.id, wrongStop ? 'wrong_route' : 'route_taken'],
    data: {
      routeId: route.id,
      routeLabel: route.label,
      routeCostItem: route.costItem,
      routeCostCount: route.costCount,
      destinationHook: route.destinationHook,
      fallbackRouteId: route.fallbackRouteId,
      clue: route.clue,
      platformLight: parts.platformLight,
      signalBox: parts.signalBox,
      strandedNpc: parts.strandedNpc,
      futureHooks: route.tags,
    },
  });
}

export function publishDarkMetroAmbushWarning(
  state: GameState,
  world: World,
  actor: Entity,
  cueId: DarkMetroAmbushCueId,
): void {
  const cue = DARK_METRO_AMBUSH_CUES.find(c => c.id === cueId);
  const px = Math.floor(actor.x);
  const py = Math.floor(actor.y);
  const zoneId = world.zoneMap[world.idx(px, py)];
  publishEvent(state, {
    type: 'monster_sighted',
    z: DARK_METRO_BASE_FLOOR,
    zoneId: zoneId >= 0 ? zoneId : undefined,
    x: actor.x,
    y: actor.y,
    actorId: actor.id,
    actorName: actor.name,
    actorFaction: actor.faction,
    severity: 4,
    privacy: 'local',
    tags: ['dark_metro', 'ambush_cue', cueId, ...(cue?.tags ?? [])],
    data: {
      routeId: DESIGN_FLOOR_ID,
      z: DARK_METRO_FUTURE_Z,
      cueId,
      warning: cue?.warning,
    },
  });
}

export interface BuildCtx {
  world: World;
  entities: Entity[];
  nextId: { v: number };
  nextContainerId: { v: number };
  packedState: DarkMetroPackedState;
}

export type DarkMetroRoomSide = 'north' | 'south' | 'west' | 'east';

export interface DarkMetroOwnedRoomSpec {
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  side: DarkMetroRoomSide;
  targetX: number;
  targetY: number;
  wallTex: Tex;
  floorTex: Tex;
  doorState?: DoorState;
}

export interface DarkMetroHqCompoundSpec {
  owner: TerritoryOwner;
  core: DarkMetroOwnedRoomSpec;
  support: readonly DarkMetroOwnedRoomSpec[];
}

export const DARK_METRO_FULL_LINE_YS = [118, 260, 402, 642, 786, 920] as const;
export const DARK_METRO_SAFETY_SHELL_RADIUS = 18;

export const DARK_METRO_HQ_ROOM_NAMES = {
  citizen: 'Гермокасса белой петли',
  liquidator: 'Гермопост короткого хода',
  cultist: 'Гермосвечная неверной станции',
  scientist: 'Гермолаборатория стрелочного шума',
  wild: 'Гермобаррикада черного перегона',
} as const;

export const DARK_METRO_HQ_COMPOUNDS: readonly DarkMetroHqCompoundSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    core: { name: DARK_METRO_HQ_ROOM_NAMES.citizen, type: RoomType.HQ, x: 84, y: 168, w: 26, h: 14, side: 'east', targetX: 176, targetY: 184, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_LINO, doorState: DoorState.HERMETIC_OPEN },
    support: [
      { name: 'Кухня белой петли', type: RoomType.KITCHEN, x: 46, y: 190, w: 24, h: 12, side: 'east', targetX: 84, targetY: 182, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Общая комната ожидающих пересадку', type: RoomType.COMMON, x: 122, y: 188, w: 28, h: 13, side: 'west', targetX: 110, targetY: 182, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
      { name: 'Санузел кассовой петли', type: RoomType.BATHROOM, x: 50, y: 142, w: 18, h: 10, side: 'east', targetX: 84, targetY: 168, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Кладовая честных жетонов', type: RoomType.STORAGE, x: 126, y: 142, w: 22, h: 10, side: 'west', targetX: 110, targetY: 168, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    core: { name: DARK_METRO_HQ_ROOM_NAMES.liquidator, type: RoomType.HQ, x: 742, y: 150, w: 28, h: 15, side: 'south', targetX: 690, targetY: 130, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE, doorState: DoorState.HERMETIC_OPEN },
    support: [
      { name: 'Оружейная короткого хода', type: RoomType.STORAGE, x: 704, y: 170, w: 28, h: 12, side: 'east', targetX: 742, targetY: 158, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
      { name: 'Медшкаф белых ламп', type: RoomType.MEDICAL, x: 780, y: 170, w: 24, h: 12, side: 'west', targetX: 770, targetY: 158, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Кабинет рейсового журнала', type: RoomType.OFFICE, x: 704, y: 126, w: 28, h: 11, side: 'east', targetX: 742, targetY: 150, wallTex: Tex.MARBLE, floorTex: Tex.F_GREEN_CARPET },
      { name: 'Санузел поста короткого хода', type: RoomType.BATHROOM, x: 784, y: 126, w: 18, h: 10, side: 'west', targetX: 770, targetY: 150, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    core: { name: DARK_METRO_HQ_ROOM_NAMES.cultist, type: RoomType.HQ, x: 244, y: 846, w: 26, h: 14, side: 'south', targetX: 304, targetY: 908, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_RED_CARPET, doorState: DoorState.HERMETIC_OPEN },
    support: [
      { name: 'Свечная кухня неверной станции', type: RoomType.KITCHEN, x: 204, y: 870, w: 24, h: 12, side: 'east', targetX: 244, targetY: 854, wallTex: Tex.DARK, floorTex: Tex.F_GREEN_CARPET },
      { name: 'Тихая комната объявления без голоса', type: RoomType.COMMON, x: 284, y: 870, w: 30, h: 12, side: 'west', targetX: 270, targetY: 854, wallTex: Tex.DARK, floorTex: Tex.F_RED_CARPET },
      { name: 'Кладовая копченых билетов', type: RoomType.STORAGE, x: 202, y: 822, w: 24, h: 10, side: 'east', targetX: 244, targetY: 846, wallTex: Tex.ROTTEN, floorTex: Tex.F_CONCRETE },
      { name: 'Санузел свечной платформы', type: RoomType.BATHROOM, x: 286, y: 822, w: 18, h: 10, side: 'west', targetX: 270, targetY: 846, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    core: { name: DARK_METRO_HQ_ROOM_NAMES.scientist, type: RoomType.HQ, x: 748, y: 708, w: 28, h: 15, side: 'north', targetX: 690, targetY: 775, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE, doorState: DoorState.HERMETIC_OPEN },
    support: [
      { name: 'Лаборатория стрелочного шума', type: RoomType.PRODUCTION, x: 706, y: 734, w: 30, h: 13, side: 'east', targetX: 748, targetY: 716, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
      { name: 'Медкабинет повторной станции', type: RoomType.MEDICAL, x: 790, y: 734, w: 28, h: 12, side: 'west', targetX: 776, targetY: 716, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Кабинет фазового расписания', type: RoomType.OFFICE, x: 706, y: 682, w: 28, h: 11, side: 'east', targetX: 748, targetY: 708, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET },
      { name: 'Склад измеренных ламп', type: RoomType.STORAGE, x: 792, y: 682, w: 24, h: 10, side: 'west', targetX: 776, targetY: 708, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    core: { name: DARK_METRO_HQ_ROOM_NAMES.wild, type: RoomType.HQ, x: 568, y: 506, w: 36, h: 18, side: 'west', targetX: 512, targetY: 520, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE, doorState: DoorState.HERMETIC_OPEN },
    support: [
      { name: 'Кухня черного перегона', type: RoomType.KITCHEN, x: 528, y: 532, w: 28, h: 14, side: 'east', targetX: 568, targetY: 520, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Общак пассажиров без билета', type: RoomType.COMMON, x: 612, y: 532, w: 32, h: 14, side: 'west', targetX: 604, targetY: 520, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
      { name: 'Склад сорванных поручней', type: RoomType.STORAGE, x: 528, y: 482, w: 30, h: 12, side: 'east', targetX: 568, targetY: 506, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
      { name: 'Санузел разбитой платформы', type: RoomType.BATHROOM, x: 618, y: 482, w: 18, h: 10, side: 'west', targetX: 604, targetY: 506, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Западный герморазвал черного перегона', type: RoomType.HQ, x: 104, y: 520, w: 22, h: 12, side: 'east', targetX: 176, targetY: 520, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE, doorState: DoorState.HERMETIC_OPEN },
      { name: 'Восточный герморазвал черного перегона', type: RoomType.HQ, x: 900, y: 520, w: 22, h: 12, side: 'west', targetX: 842, targetY: 520, wallTex: Tex.HERMO_WALL, floorTex: Tex.F_CONCRETE, doorState: DoorState.HERMETIC_OPEN },
    ],
  },
];

export const DARK_METRO_TRANSFER_NODES = [
  { x: 524, y: 184, w: 18, h: 14, name: 'Пересадочный узел линий 1-2', a: [580, 133], b: [484, 246] },
  { x: 338, y: 324, w: 18, h: 14, name: 'Пересадочный узел линий 2-3', a: [304, 275], b: [390, 388] },
  { x: 676, y: 516, w: 18, h: 16, name: 'Пересадочный узел линий 3-4', a: [684, 432], b: [684, 630] },
  { x: 338, y: 706, w: 18, h: 14, name: 'Пересадочный узел линий 4-5', a: [304, 657], b: [390, 772] },
  { x: 524, y: 846, w: 18, h: 14, name: 'Пересадочный узел линий 5-6', a: [580, 801], b: [484, 906] },
] as const;

export function tuneDarkMetroRouteZone(zone: Zone): void {
  const lineDistance = nearestDarkMetroLineDistance(zone.cy);
  const defended = nearestDarkMetroDefendedPostDistance2(zone.cx, zone.cy) <= 92 * 92;
  const serviceDistance = Math.min(axisDistance(zone.cx, 176), axisDistance(zone.cx, 842), axisDistance(zone.cx, 512));
  const serviceTunnel = serviceDistance <= 52 && zone.cy > 96 && zone.cy < 940;

  zone.level = defended ? 4 : lineDistance <= 44 || serviceTunnel ? 5 : 4;
  zone.faction = defended ? ZoneFaction.LIQUIDATOR
    : lineDistance <= 28 && zone.id % 4 === 0 ? ZoneFaction.SAMOSBOR
      : lineDistance <= 58 || serviceTunnel ? ZoneFaction.WILD
        : zone.id % 5 === 0 ? ZoneFaction.CULTIST
          : ZoneFaction.LIQUIDATOR;
  zone.fogged = false;
}

export function expandDarkMetroFullFloorGeometry(
  world: World,
  rng: () => number,
  style: DarkMetroFullFloorStyle,
  entities?: Entity[],
): void {
  const protectedCells = darkMetroProtectedMask(world);
  for (let i = 0; i < DARK_METRO_FULL_LINE_YS.length; i++) {
    carveDarkMetroStationLine(world, protectedCells, DARK_METRO_FULL_LINE_YS[i], i, style, rng);
  }

  addDarkMetroTicketHalls(world, protectedCells, style);
  addDarkMetroServiceRoutes(world, protectedCells, style, rng);
  addDarkMetroTransferWeb(world, protectedCells, style);
  addDarkMetroTransferNodes(world, protectedCells, style);
  addDarkMetroRailBaitEdges(world, style);
  addDarkMetroDefendedPlatforms(world, protectedCells, style);
  addDarkMetroHqCompounds(world, protectedCells);
  addDarkMetroStationBlocks(world, protectedCells, style, rng);
  addDarkMetroServiceIslands(world, protectedCells, style, rng);
  addDarkMetroBlindCells(world, protectedCells, style, rng);
  applyDarkMetroPlatformSafetyShells(world);
  linkDarkMetroCoreToInterchange(world, style);
  if (entities) seedFullFloorMetroTrains(world, entities);
  world.markFogDirty();
}

export function reinforceDarkMetroAuthoredHqTerritory(world: World): void {
  for (const compound of DARK_METRO_HQ_COMPOUNDS) {
    const names = new Set([compound.core.name, ...compound.support.map(room => room.name)]);
    for (const room of world.rooms) {
      if (!room || !names.has(room.name)) continue;
      paintDarkMetroRoomOwner(world, room, compound.owner);
      decorateDarkMetroOwnedRoom(world, room, compound.owner, room.id);
      if (room.name === compound.core.name || room.type === RoomType.HQ) {
        hardenDarkMetroHqRoom(world, room, compound.owner);
      }
    }
  }
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty(false);
  syncZoneMetadataFromTerritory(world);
}

export function alignDarkMetroAmbientNpcTerritory(world: World, entities: Entity[]): void {
  const cells = darkMetroTerritorySpawnCells(world);
  const offsets = new Uint16Array(8);
  for (const entity of entities) {
    if (!isDarkMetroAmbientNpc(entity) || entity.faction === undefined) continue;
    const owner = factionToTerritoryOwner(entity.faction);
    const list = cells.get(owner);
    if (!list || list.length === 0) continue;
    const offset = offsets[owner]++ | 0;
    const cell = list[(entity.id * 193 + offset * 421) % list.length];
    entity.x = (cell % W) + 0.5;
    entity.y = ((cell / W) | 0) + 0.5;
    entity.assignedRoomId = world.roomMap[cell] >= 0 ? world.roomMap[cell] : -1;
    if (entity.ai) {
      entity.ai.tx = cell % W;
      entity.ai.ty = (cell / W) | 0;
      entity.ai.path = [];
      entity.ai.pi = 0;
      entity.ai.stuck = 0;
    }
  }
}



export function generateDarkMetroDesignFloor(seed = DARK_METRO_DEFAULT_SEED): DarkMetroGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const ctx: BuildCtx = {
      world,
      entities,
      nextId: { v: 1 },
      nextContainerId: { v: 1 },
      packedState: initialDarkMetroState(seed),
    };

    const layout = stampDarkMetroLayout(ctx);
    generateZones(world);
    tuneDarkMetroZones(world);
    dressDarkMetro(ctx, layout);
    seedCoreMetroTrain(ctx, layout);
    spawnDarkMetroNpcs(ctx, layout);
    spawnDarkMetroLoot(ctx, layout);
    spawnDarkMetroThreats(ctx, layout);
    registerDarkMetroRouteCues(ctx, layout);

    const spawnX = layout.hall.x + Math.floor(layout.hall.w / 2) + 0.5;
    const spawnY = layout.hall.y + Math.floor(layout.hall.h / 2) + 0.5;
    // Hooks moved from full_floor.ts
    const rngFn = seededRandom(hashSeed('design-full:dark_metro:-32', -32));
    const style = { wallTex: 24 /* Tex.METRO_WALL */, floorTex: 10 /* Tex.METRO_FLOOR */, faction: 3 /* ZoneFaction.MONSTERS */, danger: 4 };
    expandDarkMetroFullFloorGeometry(world, rngFn, style, entities);
    
    // Now finalize
    generateZones(world);
    for (const zone of world.zones) {
      tuneDarkMetroRouteZone(zone);
    }
    reinforceDarkMetroAuthoredHqTerritory(world);
    
    ensureConnectivity(world, spawnX, spawnY);
    sanitizeDoors(world);
    
    // For dark metro, we scatter lights as well
        // Actually full_floor.ts used to scatterAmbientLights, but we need that function!
    // I can just import it from shared? Wait, scatterAmbientLights was defined in full_floor.ts!
    // If we need it, we must copy it or export it. Wait!
    // Is scatterAmbientLights needed? Yes, it was called in full_floor.ts!
    world.bakeLights();
    applyDarkMetroAmbientLight(world, layout, ctx.packedState);
    world.markFogDirty();

    const generation = { world, entities, spawnX, spawnY, metroState: createDarkMetroFloorState(ctx.packedState) };
      applyDesignFloorPopulationField(generation as any, { id: 'dark_metro', z: -32 } as any);
      return { ...generation, isDecentralized: true } as any;
    });
}

