/* ── Design floor: antenna_court / Антенный двор ─────────────── */

import {
  W, Cell, ContainerKind, Feature, FloorLevel, LiftDirection,
  RoomType, Tex, ZoneFaction,
  type Entity, EntityType, AIGoal, Faction, Occupation, QuestType, MonsterKind,
  type GameState, type Room, type WorldContainer, type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, registerSideQuest } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { Spr } from '../../render/sprite_index';
import { publishEvent } from '../../systems/events';
import {
  connectRoomsMST,
  ensureConnectivity,
  generateZones,
  placeDoor,
  stampRoom,
} from '../shared';
import { placeProceduralScreens, SCREEN_FRAMES } from '../procedural_screens';
import type { FloorGeneration } from '../floor_manifest';

export const DESIGN_FLOOR_ID = 'antenna_court' as const;
export const ANTENNA_COURT_ROUTE_Z = -32 as const;
export const ANTENNA_COURT_BASE_FLOOR = FloorLevel.MINISTRY;

const SIGNAL_FLAG_TUNED = 1 << 0;
const SIGNAL_FLAG_MARKET_JAMMED = 1 << 1;
const SIGNAL_FLAG_VOID_RECORDED = 1 << 2;
const SIGNAL_FLAG_MINISTRY_NOTICED = 1 << 3;
const SIGNAL_FLAG_BATTERY_STOLEN = 1 << 4;

const CONTAINER_ID_BASE = 320_300;
const CX = W >> 1;
const CY = W >> 1;

export type AntennaRouteId =
  | 'roof'
  | 'obzh_school'
  | 'ministry'
  | 'metro_error_line'
  | 'market_88'
  | 'void_protocol';

export interface AntennaCourtSignalState {
  signalQuality: number;       // 0..5
  jamUntilHour: number;        // total game hour, -1 when inactive
  lastTunedRouteId: AntennaRouteId | '';
  recordedAnomalyFlags: number;
}

export interface AntennaSignalResult {
  ok: boolean;
  routeId: AntennaRouteId;
  label: string;
  clue: string;
  signalQuality: number;
  eventTags: string[];
}

export interface AntennaCourtGeneration extends FloorGeneration {
  routeId: typeof DESIGN_FLOOR_ID;
  z: typeof ANTENNA_COURT_ROUTE_Z;
  signalState: AntennaCourtSignalState;
  debug: string[];
}

interface SignalClueDef {
  label: string;
  minQuality: number;
  clue: string;
  faintClue: string;
  tags: string[];
}

const SIGNAL_CLUES: Record<AntennaRouteId, SignalClueDef> = {
  roof: {
    label: 'Крыша',
    minQuality: 4,
    clue: 'Верхний люк отвечает только после ремонта мачты; ищи сухой ход и не верь открытому небу.',
    faintClue: 'Сверху слышен ветер и стук люка, но частота срывается.',
    tags: ['roof', 'repair', 'upper_route'],
  },
  obzh_school: {
    label: 'ОБЖ',
    minQuality: 2,
    clue: 'На школьной частоте повторяют: аптечка, убежище, список, гермодверь.',
    faintClue: 'Детский голос считает пункты эвакуации, дальше помеха.',
    tags: ['living', 'obzh', 'shelter'],
  },
  ministry: {
    label: 'Министерство',
    minQuality: 3,
    clue: 'Министерская несущая шипит про проверку записей: незаконный сигнал лучше не нести через очередь.',
    faintClue: 'Слышно слово "акт", потом печать глушит эфир.',
    tags: ['ministry', 'inspection', 'papers'],
  },
  metro_error_line: {
    label: 'Ошибка метро',
    minQuality: 3,
    clue: 'Темная платформа отвечает через билет: линия ошибается чаще у экранов и аппаратов.',
    faintClue: 'Под эфиром слышен поезд без станции.',
    tags: ['metro', 'wrong_stop', 'screen'],
  },
  market_88: {
    label: 'Рынок 88',
    minQuality: 2,
    clue: 'Черный рынок считает рейды по сухим щелчкам; короткий глушитель выиграет время, но оставит подпись.',
    faintClue: 'Восемьдесят восемь щелкает кассой, потом канал режут.',
    tags: ['market_88', 'raid', 'jam'],
  },
  void_protocol: {
    label: 'Пустотный протокол',
    minQuality: 5,
    clue: 'Пустота записывается как отсутствие слов; не открывай банку рядом с зеркальным экраном.',
    faintClue: 'В тишине слышна фраза без говорящего.',
    tags: ['void', 'protocol', 'recording'],
  },
};

const NPC_DEFS: Record<string, PlotNpcDef> = {
  antenna_pasha_grown: {
    name: 'Паша Выросший',
    isFemale: false,
    faction: Faction.SCIENTIST,
    occupation: Occupation.ELECTRICIAN,
    sprite: Occupation.ELECTRICIAN,
    hp: 120, maxHp: 120, money: 80, speed: 0.85,
    inventory: [
      { defId: 'radio', count: 1 },
      { defId: 'relay_diagram', count: 1 },
      { defId: 'tea', count: 1 },
    ],
    talkLines: [
      'Я был Пашей из радиокружка, пока этажи не начали отвечать взрослыми голосами.',
      'Антенный двор слушает не дальние города, а соседние ошибки дома.',
      'Настраивать можно. Верить нельзя. Хороший сигнал дает зацепку, не карту.',
      'Частота ОБЖ ещё жива: аптечка, убежище, список, гермодверь. Нина бы одобрила.',
    ],
    talkLinesPost: [
      'Реле держится. Теперь эфир врет аккуратнее.',
      'Если услышишь свой адрес, не отвечай. Адреса тут ходят стаями.',
    ],
  },
  antenna_mirra_jammer: {
    name: 'Мирра Глушилка',
    isFemale: true,
    faction: Faction.WILD,
    occupation: Occupation.TRAVELER,
    sprite: Occupation.TRAVELER,
    hp: 95, maxHp: 95, money: 160, speed: 1.05,
    inventory: [
      { defId: 'wire_coil', count: 2 },
      { defId: 'cigs', count: 3 },
      { defId: 'metro_ticket', count: 1 },
    ],
    talkLines: [
      'Глушить надо коротко. Длинная тишина заметнее крика.',
      'Рынок 88 покупает минуты без рейда. Министерство продает вопросы после таких минут.',
      'Дашь проволоку и предохранители - я соберу заглушку, а ты решишь, кому станет тише.',
    ],
    talkLinesPost: [
      'Канал погас, но подпись осталась в шуме.',
      'Если инспектор спросит, ты слышал только прогноз погоды.',
    ],
  },
  antenna_captain_krug: {
    name: 'Капитан Круг',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 260, maxHp: 260, money: 95, speed: 1.05,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 10 },
      { defId: 'official_permit_slip', count: 1 },
    ],
    talkLines: [
      'Круг, инспекция сигнала. Незаконная запись отличается от законной тем, кто первый составил акт.',
      'Батарейный шкаф под охраной. Нужна ячейка - оформляй ремонт или воруй достаточно тихо.',
      'Глушение рейдов я не слышал. Если услышу - услышу и тебя.',
    ],
    talkLinesPost: [
      'Батареи на месте или в отчете. Меня устроит любой вариант с подписью.',
      'Не носи пустотную запись через Министерство без бумаги.',
    ],
  },
  antenna_echo_zhenya: {
    name: 'Эхо Женя',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.CHILD,
    sprite: Occupation.CHILD,
    hp: 70, maxHp: 70, money: 18, speed: 0.9,
    inventory: [
      { defId: 'note', count: 2 },
      { defId: 'bread', count: 1 },
    ],
    talkLines: [
      'Я повторяю не людей. Я повторяю места, когда они забывают закрыть рот.',
      'Пустотный сигнал можно записать в банку. Потом его можно продать. Или отдать Якову. Или пожалеть.',
      'Если банка дрожит без голоса, значит запись получилась.',
    ],
    talkLinesPost: [
      'Теперь у меня во рту тише. Спасибо или извини, не знаю.',
      'Яков поймет запись. Рынок просто купит страх.',
    ],
    talkQuestResponse: 'Скажи Паше: верхняя мачта не сломана, она притворяется лежачей антенной.',
  },
};

registerSideQuest('antenna_pasha_grown', NPC_DEFS.antenna_pasha_grown, [
  {
    id: 'antenna_tune_floor',
    giverNpcId: 'antenna_pasha_grown',
    type: QuestType.VISIT,
    desc: 'Паша Выросший: «Дойди до Релейной будки и настрой школьную частоту. Награда - зацепка, не карта.»',
    targetRoomName: 'Релейная будка',
    rewardItem: 'relay_diagram', rewardCount: 1,
    extraRewards: [{ defId: 'caravan_route', count: 1 }],
    relationDelta: 12, xpReward: 45, moneyReward: 30,
  },
  {
    id: 'antenna_tell_echo',
    giverNpcId: 'antenna_pasha_grown',
    type: QuestType.TALK,
    desc: 'Паша Выросший: «Сверься с Эхо Женей. Он повторяет этажи, когда приборы начинают льстить.»',
    targetNpcId: 'antenna_echo_zhenya',
    rewardItem: 'radio', rewardCount: 1,
    relationDelta: 8, xpReward: 30, moneyReward: 20,
  },
]);

registerSideQuest('antenna_mirra_jammer', NPC_DEFS.antenna_mirra_jammer, [
  {
    id: 'antenna_jam_raid',
    giverNpcId: 'antenna_mirra_jammer',
    type: QuestType.FETCH,
    desc: 'Мирра Глушилка: «Принеси два предохранителя. Я дам короткую заглушку для рейда 88, но инспектор потом услышит пустое место.»',
    targetItem: 'fuse', targetCount: 2,
    rewardItem: 'metro_ticket', rewardCount: 1,
    extraRewards: [{ defId: 'wire_coil', count: 1 }],
    relationDelta: 10, xpReward: 50, moneyReward: 90,
  },
]);

registerSideQuest('antenna_captain_krug', NPC_DEFS.antenna_captain_krug, [
  {
    id: 'antenna_battery_theft',
    giverNpcId: 'antenna_captain_krug',
    type: QuestType.FETCH,
    desc: 'Капитан Круг: «Нужны две энергоячейки из батарейного шкафа. Получишь разрешение, если не заставишь меня писать слово "кража".»',
    targetItem: 'ammo_energy', targetCount: 2,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'ammo_9mm', count: 8 }],
    relationDelta: 12, xpReward: 60, moneyReward: 50,
  },
]);

registerSideQuest('antenna_echo_zhenya', NPC_DEFS.antenna_echo_zhenya, [
  {
    id: 'antenna_record_void',
    giverNpcId: 'antenna_echo_zhenya',
    type: QuestType.FETCH,
    desc: 'Эхо Женя: «Запиши невозможный голос в банку и реши: продать страх или отдать его тем, кто понимает пустоту.»',
    targetItem: 'bottled_voice', targetCount: 1,
    rewardItem: 'psi_stabilizer', rewardCount: 1,
    extraRewards: [{ defId: 'antidep', count: 1 }],
    relationDelta: 10, xpReward: 70, moneyReward: 180,
  },
]);

export function createAntennaCourtSignalState(seed = 0): AntennaCourtSignalState {
  return {
    signalQuality: 3 + (Math.abs(seed) % 2),
    jamUntilHour: -1,
    lastTunedRouteId: '',
    recordedAnomalyFlags: 0,
  };
}

export function tuneAntennaCourtSignal(
  signalState: AntennaCourtSignalState,
  routeId: AntennaRouteId,
): AntennaSignalResult {
  const def = SIGNAL_CLUES[routeId];
  const quality = clampQuality(signalState.signalQuality);
  const ok = quality >= def.minQuality;
  signalState.signalQuality = quality;
  signalState.lastTunedRouteId = routeId;
  signalState.recordedAnomalyFlags |= SIGNAL_FLAG_TUNED;
  return {
    ok,
    routeId,
    label: def.label,
    clue: ok ? def.clue : def.faintClue,
    signalQuality: quality,
    eventTags: def.tags,
  };
}

export function repairAntennaCourtSignal(signalState: AntennaCourtSignalState, amount = 1): number {
  signalState.signalQuality = clampQuality(signalState.signalQuality + Math.max(0, amount | 0));
  return signalState.signalQuality;
}

export function jamAntennaCourtSignal(
  signalState: AntennaCourtSignalState,
  nowTotalHour: number,
  durationHours = 2,
): AntennaSignalResult {
  signalState.jamUntilHour = Math.max(signalState.jamUntilHour, nowTotalHour + Math.max(1, durationHours));
  signalState.signalQuality = clampQuality(signalState.signalQuality - 1);
  signalState.recordedAnomalyFlags |= SIGNAL_FLAG_MARKET_JAMMED | SIGNAL_FLAG_MINISTRY_NOTICED;
  return tuneAntennaCourtSignal(signalState, 'market_88');
}

export function recordAntennaCourtAnomaly(
  signalState: AntennaCourtSignalState,
  routeId: Extract<AntennaRouteId, 'void_protocol' | 'metro_error_line'> = 'void_protocol',
): AntennaSignalResult {
  const result = tuneAntennaCourtSignal(signalState, routeId);
  if (result.ok) signalState.recordedAnomalyFlags |= SIGNAL_FLAG_VOID_RECORDED;
  return result;
}

export function markAntennaCourtBatteryTaken(signalState: AntennaCourtSignalState): void {
  signalState.recordedAnomalyFlags |= SIGNAL_FLAG_BATTERY_STOLEN;
}

export function publishAntennaCourtSignalEvent(
  game: GameState,
  signalState: AntennaCourtSignalState,
  action: 'tune' | 'jam' | 'record' | 'repair' | 'battery',
  result?: AntennaSignalResult,
): WorldEvent {
  const routeId = (result?.routeId ?? signalState.lastTunedRouteId) || undefined;
  const eventTags = result?.eventTags ?? [];
  return publishEvent(game, {
    type: 'rumor_observed',
    floor: game.currentFloor,
    severity: action === 'jam' || action === 'record' ? 4 : 3,
    privacy: action === 'jam' ? 'witnessed' : 'local',
    targetName: routeId ?? DESIGN_FLOOR_ID,
    tags: [
      DESIGN_FLOOR_ID,
      'signal',
      `antenna_${action}`,
      ...eventTags,
    ],
    data: {
      routeId,
      designFloorId: DESIGN_FLOOR_ID,
      z: ANTENNA_COURT_ROUTE_Z,
      signalQuality: signalState.signalQuality,
      jamUntilHour: signalState.jamUntilHour,
      lastTunedRouteId: signalState.lastTunedRouteId,
      recordedAnomalyFlags: signalState.recordedAnomalyFlags,
      clue: result?.clue,
      ok: result?.ok,
    },
  });
}

export function antennaCourtDebugLines(signalState: AntennaCourtSignalState): string[] {
  return [
    `route=${DESIGN_FLOOR_ID}`,
    `z=${ANTENNA_COURT_ROUTE_Z}`,
    `quality=${clampQuality(signalState.signalQuality)}/5`,
    `tuned=${signalState.lastTunedRouteId || 'none'}`,
    `jamUntilHour=${signalState.jamUntilHour}`,
    `flags=${signalState.recordedAnomalyFlags}`,
  ];
}

export function generateAntennaCourtDesignFloor(seed = 0): AntennaCourtGeneration {
  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 1 };
  let nextContainerId = CONTAINER_ID_BASE;

  world.wallTex.fill(Tex.CONCRETE);
  world.floorTex.fill(Tex.F_CONCRETE);

  const rooms = stampAntennaCourtRooms(world);
  connectRoomsMST(world, [
    rooms.courtyard,
    rooms.radioClub,
    rooms.relay,
    rooms.archive,
    rooms.battery,
    rooms.dorm,
    rooms.jammer,
    rooms.inspection,
    rooms.entry,
    rooms.exit,
  ]);
  placeDoor(world, rooms.courtyard, rooms.radioClub, '', false);
  placeDoor(world, rooms.courtyard, rooms.relay, '', false);
  placeDoor(world, rooms.archive, rooms.battery, 'key', false);

  generateZones(world);
  retuneAntennaZones(world, rooms);
  decorateAntennaCourt(world, rooms);
  placeProceduralScreens(world, ANTENNA_COURT_BASE_FLOOR);
  placeAuthoredSignalScreens(world, rooms);

  const pasha = spawnPlotNpc(entities, nextId, 'antenna_pasha_grown', rooms.radioClub, 4, 4, 0);
  const mirra = spawnPlotNpc(entities, nextId, 'antenna_mirra_jammer', rooms.jammer, 4, 4, Math.PI / 2);
  const captain = spawnPlotNpc(entities, nextId, 'antenna_captain_krug', rooms.inspection, 5, 5, Math.PI, { weapon: 'makarov' });
  spawnPlotNpc(entities, nextId, 'antenna_echo_zhenya', rooms.dorm, 3, 3, -Math.PI / 2, { spriteScale: 0.72 });

  spawnGuard(entities, nextId, rooms.battery.x + 2, rooms.battery.y + 7, 'Сержант Частотный');
  spawnGuard(entities, nextId, rooms.inspection.x + 8, rooms.inspection.y + 2, 'Дежурный Гц');
  spawnSignalMonsters(world, entities, nextId, rooms);

  addContainer(world, nextContainerId++, rooms.battery, 4, 4, ContainerKind.TOOL_LOCKER, 'Батарейный шкаф антенн', 'owner', [
    { defId: 'ammo_energy', count: 3 },
    { defId: 'fuse', count: 2 },
    { defId: 'wire_coil', count: 2 },
  ], captain);
  addContainer(world, nextContainerId++, rooms.archive, 4, 4, ContainerKind.FILING_CABINET, 'Архив записанных частот', 'locked', [
    { defId: 'bottled_voice', count: 1 },
    { defId: 'note', count: 3 },
    { defId: 'record_exposure_notice', count: 1 },
  ]);
  addContainer(world, nextContainerId++, rooms.relay, 7, 4, ContainerKind.METAL_CABINET, 'Ящик релейных схем', 'room', [
    { defId: 'relay_diagram', count: 2 },
    { defId: 'circuit_board', count: 1 },
    { defId: 'lamp_bulb', count: 2 },
  ], pasha);
  addContainer(world, nextContainerId++, rooms.jammer, 8, 3, ContainerKind.CASHBOX, 'Касса короткой тишины', 'owner', [
    { defId: 'metro_ticket', count: 1 },
    { defId: 'cigs', count: 2 },
    { defId: 'denunciation', count: 1 },
  ], mirra);

  dropItem(entities, nextId, rooms.entry.x + 3, rooms.entry.y + 4, 'radio', 1);
  dropItem(entities, nextId, rooms.courtyard.x + 22, rooms.courtyard.y + 25, 'wire_coil', 1);
  dropDesk(entities, nextId, rooms.radioClub.x + 6, rooms.radioClub.y + 5);
  dropDesk(entities, nextId, rooms.archive.x + 12, rooms.archive.y + 5);

  placeFixedLift(world, rooms.entry.x + 2, rooms.entry.y + 2, LiftDirection.DOWN);
  placeFixedLift(world, rooms.exit.x + rooms.exit.w - 3, rooms.exit.y + 2, LiftDirection.UP);

  const spawnX = rooms.entry.x + 5.5;
  const spawnY = rooms.entry.y + 5.5;
  ensureConnectivity(world, spawnX, spawnY);
  world.bakeLights();

  const signalState = createAntennaCourtSignalState(seed);
  return {
    world,
    entities,
    spawnX,
    spawnY,
    routeId: DESIGN_FLOOR_ID,
    z: ANTENNA_COURT_ROUTE_Z,
    signalState,
    debug: antennaCourtDebugLines(signalState),
  };
}

function clampQuality(value: number): number {
  return Math.max(0, Math.min(5, value | 0));
}

function stampAntennaCourtRooms(world: World): Record<string, Room> {
  const courtyard = stampNamedRoom(world, RoomType.COMMON, CX - 22, CY - 19, 44, 34, 'Антенный двор', Tex.PANEL, Tex.F_CONCRETE);
  return {
    courtyard,
    radioClub: stampNamedRoom(world, RoomType.PRODUCTION, CX - 38, CY - 14, 12, 12, 'Радиоклуб взрослых детей', Tex.METAL, Tex.F_CONCRETE),
    relay: stampNamedRoom(world, RoomType.PRODUCTION, CX + 26, CY - 14, 12, 12, 'Релейная будка', Tex.PIPE, Tex.F_CONCRETE),
    archive: stampNamedRoom(world, RoomType.OFFICE, CX - 10, CY - 34, 20, 10, 'Архив мониторинга', Tex.MARBLE, Tex.F_MARBLE_TILE),
    battery: stampNamedRoom(world, RoomType.STORAGE, CX + 14, CY - 34, 10, 10, 'Батарейная кладовая', Tex.METAL, Tex.F_CONCRETE),
    dorm: stampNamedRoom(world, RoomType.LIVING, CX - 10, CY + 19, 20, 9, 'Операторская спальня', Tex.PANEL, Tex.F_LINO),
    jammer: stampNamedRoom(world, RoomType.SMOKING, CX - 38, CY + 1, 12, 11, 'Кабина глушения', Tex.DARK, Tex.F_CARPET),
    inspection: stampNamedRoom(world, RoomType.HQ, CX + 26, CY + 1, 12, 11, 'Пост сигнал-инспекции', Tex.MARBLE, Tex.F_RED_CARPET),
    entry: stampNamedRoom(world, RoomType.CORRIDOR, CX - 24, CY + 33, 11, 8, 'Входной лифтовый тамбур', Tex.CONCRETE, Tex.F_CONCRETE),
    exit: stampNamedRoom(world, RoomType.CORRIDOR, CX - 24, CY - 44, 11, 8, 'Верхний лифтовый тамбур', Tex.CONCRETE, Tex.F_CONCRETE),
  };
}

function stampNamedRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        world.floorTex[ci] = floorTex;
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
  return room;
}

function retuneAntennaZones(world: World, rooms: Record<string, Room>): void {
  world.factionControl.fill(ZoneFaction.CITIZEN);
  for (const zone of world.zones) {
    const d = world.dist(zone.cx, zone.cy, CX, CY);
    zone.level = d < 70 ? 3 : 2;
    zone.faction = ZoneFaction.CITIZEN;
  }
  paintRoomFaction(world, rooms.inspection, ZoneFaction.LIQUIDATOR);
  paintRoomFaction(world, rooms.battery, ZoneFaction.LIQUIDATOR);
  paintRoomFaction(world, rooms.archive, ZoneFaction.CITIZEN);
  paintRoomFaction(world, rooms.jammer, ZoneFaction.WILD);
  paintRoomFaction(world, rooms.relay, ZoneFaction.CITIZEN);
}

function paintRoomFaction(world: World, room: Room, faction: ZoneFaction): void {
  const zid = world.zoneMap[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))];
  if (world.zones[zid]) world.zones[zid].faction = faction;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      world.factionControl[ci] = faction;
    }
  }
}

function decorateAntennaCourt(world: World, rooms: Record<string, Room>): void {
  const court = rooms.courtyard;
  for (let dy = 4; dy < court.h - 3; dy += 7) {
    for (let dx = 5; dx < court.w - 4; dx += 8) {
      placeAntennaMast(world, court.x + dx, court.y + dy);
    }
  }
  for (let dx = 2; dx < court.w - 2; dx += 5) setFeatureIfFloor(world, court.x + dx, court.y + 1, Feature.APPARATUS);
  for (let dx = 3; dx < court.w - 3; dx += 7) setFeatureIfFloor(world, court.x + dx, court.y + court.h - 2, Feature.LAMP);

  for (const room of [rooms.radioClub, rooms.relay, rooms.archive, rooms.jammer, rooms.inspection]) {
    setFeatureIfFloor(world, room.x + 1, room.y + 1, Feature.LAMP);
    setFeatureIfFloor(world, room.x + 2, room.y + 2, Feature.APPARATUS);
    setFeatureIfFloor(world, room.x + room.w - 3, room.y + 2, Feature.MACHINE);
    setFeatureIfFloor(world, room.x + room.w - 3, room.y + room.h - 3, Feature.TABLE);
    setFeatureIfFloor(world, room.x + room.w - 4, room.y + room.h - 3, Feature.CHAIR);
  }

  setFeatureIfFloor(world, rooms.battery.x + 2, rooms.battery.y + 2, Feature.SHELF);
  setFeatureIfFloor(world, rooms.battery.x + 6, rooms.battery.y + 3, Feature.MACHINE);
  setFeatureIfFloor(world, rooms.dorm.x + 3, rooms.dorm.y + 4, Feature.BED);
  setFeatureIfFloor(world, rooms.dorm.x + 9, rooms.dorm.y + 4, Feature.TABLE);
  setFeatureIfFloor(world, rooms.entry.x + 5, rooms.entry.y + 2, Feature.LAMP);
  setFeatureIfFloor(world, rooms.exit.x + 5, rooms.exit.y + 2, Feature.LAMP);
}

function placeAntennaMast(world: World, x: number, y: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  world.cells[ci] = Cell.WALL;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = Tex.METAL;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    setFeatureIfFloor(world, x + dx, y + dy, Feature.APPARATUS);
  }
}

function setFeatureIfFloor(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
}

function placeAuthoredSignalScreens(world: World, rooms: Record<string, Room>): void {
  setWallScreen(world, rooms.courtyard.x + 7, rooms.courtyard.y - 1, 3);
  setWallScreen(world, rooms.courtyard.x + 18, rooms.courtyard.y - 1, 4);
  setWallScreen(world, rooms.courtyard.x + 29, rooms.courtyard.y - 1, 7);
  setWallScreen(world, rooms.radioClub.x + 4, rooms.radioClub.y - 1, 0);
  setWallScreen(world, rooms.relay.x + rooms.relay.w, rooms.relay.y + 4, 6);
  setWallScreen(world, rooms.archive.x + 8, rooms.archive.y + rooms.archive.h, 7);
  setWallScreen(world, rooms.jammer.x + 5, rooms.jammer.y - 1, 2);
}

function setWallScreen(world: World, x: number, y: number, variant: number): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.WALL) return;
  const frame = Math.abs((x * 17 + y * 31 + variant * 7) | 0) % SCREEN_FRAMES;
  world.wallTex[ci] = (Tex.SCREEN_BASE + variant * SCREEN_FRAMES + frame) as Tex;
  world.features[ci] = Feature.SCREEN;
  if (!world.screenCells.includes(ci)) world.screenCells.push(ci);
}

function spawnPlotNpc(
  entities: Entity[],
  nextId: { v: number },
  plotNpcId: string,
  room: Room,
  dx: number,
  dy: number,
  angle: number,
  extra?: Partial<Entity>,
): Entity {
  const def = NPC_DEFS[plotNpcId];
  const npc: Entity = {
    id: nextId.v++,
    type: EntityType.NPC,
    x: room.x + dx + 0.5,
    y: room.y + dy + 0.5,
    angle,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    name: def.name,
    isFemale: def.isFemale,
    needs: freshNeeds(),
    hp: def.hp,
    maxHp: def.maxHp,
    money: def.money,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(i => ({ ...i })),
    faction: def.faction,
    occupation: def.occupation,
    plotNpcId,
    canGiveQuest: true,
    questId: -1,
    ...extra,
  };
  entities.push(npc);
  return npc;
}

function spawnGuard(entities: Entity[], nextId: { v: number }, x: number, y: number, name: string): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.PI / 2,
    pitch: 0,
    alive: true,
    speed: 1.0,
    sprite: Occupation.HUNTER,
    name,
    isFemale: false,
    needs: freshNeeds(),
    hp: 180,
    maxHp: 180,
    money: 35,
    ai: { goal: AIGoal.IDLE, tx: 0, ty: 0, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: [{ defId: 'makarov', count: 1 }, { defId: 'ammo_9mm', count: 8 }],
    weapon: 'makarov',
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    canGiveQuest: false,
    questId: -1,
  });
}

function spawnSignalMonsters(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: Record<string, Room>,
): void {
  spawnMonster(world, entities, nextId, MonsterKind.EYE, rooms.courtyard.x + 21, rooms.courtyard.y + 8);
  spawnMonster(world, entities, nextId, MonsterKind.EYE, rooms.courtyard.x + 29, rooms.courtyard.y + 22);
  spawnMonster(world, entities, nextId, MonsterKind.REBAR, rooms.relay.x + 3, rooms.relay.y + 7);
  spawnMonster(world, entities, nextId, MonsterKind.SHADOW, rooms.archive.x + 16, rooms.archive.y + 6);
}

function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  kind: MonsterKind,
  x: number,
  y: number,
): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR) return;
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.random() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed,
    sprite: def.sprite,
    hp: def.hp,
    maxHp: def.hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: CX, ty: CY, path: [], pi: 0, stuck: 0, timer: 0 },
  });
}

function addContainer(
  world: World,
  id: number,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: WorldContainer['inventory'],
  owner?: Entity,
): void {
  const x = room.x + dx;
  const y = room.y + dy;
  const ci = world.idx(x, y);
  world.addContainer({
    id,
    x,
    y,
    floor: ANTENNA_COURT_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind,
    name,
    inventory,
    capacitySlots: 10,
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: owner?.faction,
    access,
    lockDifficulty: access === 'locked' || access === 'owner' ? 3 : undefined,
    discovered: true,
    tags: [DESIGN_FLOOR_ID, 'signal', 'radio', access === 'owner' ? 'theft' : 'loot'],
  });
}

function dropItem(entities: Entity[], nextId: { v: number }, x: number, y: number, defId: string, count: number): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

function dropDesk(entities: Entity[], nextId: { v: number }, x: number, y: number): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.DESK,
    spriteScale: 0.55,
    inventory: [],
  });
}

function placeFixedLift(world: World, x: number, y: number, direction: LiftDirection): void {
  const ci = world.idx(x, y);
  world.cells[ci] = Cell.LIFT;
  world.roomMap[ci] = -1;
  world.wallTex[ci] = Tex.LIFT_DOOR;
  world.liftDir[ci] = direction;
  const bi = world.idx(x + 1, y);
  if (world.cells[bi] === Cell.FLOOR) {
    world.features[bi] = Feature.LIFT_BUTTON;
    world.liftDir[bi] = direction;
  }
}

export const ANTENNA_COURT_DEBUG_ENTRY = {
  routeId: DESIGN_FLOOR_ID,
  z: ANTENNA_COURT_ROUTE_Z,
  generator: 'generateAntennaCourtDesignFloor',
} as const;
