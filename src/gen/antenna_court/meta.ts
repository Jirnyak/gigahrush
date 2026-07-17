import {
  W, 
  ZoneFaction,
  Faction, Occupation, 
  type GameState, type WorldEvent,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import { publishEvent } from '../../systems/events';
import { AntennaRouteId, AntennaCourtSignalState, AntennaSignalResult, SignalClueDef } from "./geometry";

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('antenna_court');

export const DESIGN_FLOOR_ID = 'antenna_court' as const;

export const ANTENNA_COURT_ROUTE_Z = 42 as const;

export const ANTENNA_COURT_BASE_FLOOR = 30;

export const SIGNAL_FLAG_TUNED = 1 << 0;

export const SIGNAL_FLAG_MARKET_JAMMED = 1 << 1;

export const SIGNAL_FLAG_VOID_RECORDED = 1 << 2;

export const SIGNAL_FLAG_MINISTRY_NOTICED = 1 << 3;

export const SIGNAL_FLAG_BATTERY_STOLEN = 1 << 4;

export const SIGNAL_FLAG_EXPOSED = 1 << 5;

export const CONTAINER_ID_BASE = 320_300;

export const CX = W >> 1;

export const CY = W >> 1;

export const ANTENNA_COURT_ROUTE_DECISIONS = [
  {
    id: 'signal_repair',
    roomDefId: 'Релейная будка',
    itemId: 'circuit_board',
    eventAction: 'repair',
    outcome: 'Паша чинит реле: сигнал дает маршрутную зацепку, не полную карту.',
  },
  {
    id: 'signal_exposure',
    roomDefId: 'Пост сигнал-инспекции',
    itemId: 'record_exposure_notice',
    eventAction: 'expose',
    outcome: 'Круг принимает акт о незаконной записи: подсказка становится министерским следом и слухом.',
  },
  {
    id: 'market_jam',
    roomDefId: 'Кабина глушения',
    itemId: 'fuse',
    eventAction: 'jam',
    outcome: 'Мирра дает короткую тишину для рынка 88, но оставляет заметную подпись в эфире.',
  },
] as const;

export const ANTENNA_TERRITORY_TARGETS = [
  { owner: ZoneFaction.CITIZEN, share: 0.18 },
  { owner: ZoneFaction.LIQUIDATOR, share: 0.36 },
  { owner: ZoneFaction.CULTIST, share: 0.08 },
  { owner: ZoneFaction.SCIENTIST, share: 0.24 },
  { owner: ZoneFaction.WILD, share: 0.14 },
] as const;

export const TARGET_SHARE_BY_FACTION = new Float64Array(10);

export const SIGNAL_CLUES: Record<AntennaRouteId, SignalClueDef> = {
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
    label: '[ДАННЫЕ УДАЛЕНЫ]',
    minQuality: 5,
    clue: 'Сигнал записан как [ДАННЫЕ УДАЛЕНЫ]; банку не открывать рядом с зеркальным экраном.',
    faintClue: 'В тишине слышно: [ДАННЫЕ УДАЛЕНЫ].',
    tags: ['void', 'protocol', 'recording'],
  },
};

export const NPC_DEFS: Record<string, PlotNpcDef> = {
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
      'Антенный двор ловит не дальние города, а помехи с соседних этажей.',
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
      'Не носи закрытую запись через Министерство без бумаги.',
    ],
  },
  antenna_guard_frequency_sergeant: {
    name: 'Сержант Частотный',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 180, maxHp: 180, money: 35, speed: 1.0,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 8 },
    ],
    talkLines: [
      'Батарейная стоит под охраной. Реле молчит лучше людей.',
      'Проверяй пропуск у Круга. Я проверяю руки.',
    ],
    talkLinesPost: [
      'Частота ровнее. Охрана остается.',
      'После глушения батареи считают дважды.',
    ],
  },
  antenna_guard_hz_watch: {
    name: 'Дежурный Гц',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 180, maxHp: 180, money: 35, speed: 1.0,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 8 },
    ],
    talkLines: [
      'У инспекции один вопрос: чей это шум.',
      'Если канал пустой, значит кто-то заплатил за пустоту.',
    ],
    talkLinesPost: [
      'Круг сказал ждать. Я жду громко.',
      'Пустое место в эфире уже записано.',
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
      'Сигнал можно записать в банку. Потом его можно продать, отдать Якову или запереть обратно в архив.',
      'Если банка дрожит без голоса, значит запись получилась.',
    ],
    talkLinesPost: [
      'Теперь у меня во рту тише. Спасибо или извини, не знаю.',
      'Яков разберет запись. Рынок просто купит банку.',
    ],
    talkQuestResponse: 'Скажи Паше: верхняя мачта не сломана, она притворяется лежачей антенной.',
  },
};

export function publishAntennaCourtSignalEvent(
  game: GameState,
  signalState: AntennaCourtSignalState,
  action: 'tune' | 'jam' | 'record' | 'repair' | 'battery' | 'expose',
  result?: AntennaSignalResult,
): WorldEvent {
  const routeId = (result?.routeId ?? signalState.lastTunedRouteId) || undefined;
  const eventTags = result?.eventTags ?? [];
  return publishEvent(game, {
    type: 'rumor_observed',
    z: game.currentZ,
    severity: action === 'jam' || action === 'record' || action === 'expose' ? 4 : 3,
    privacy: action === 'jam' || action === 'expose' ? 'witnessed' : 'local',
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

export const ANTENNA_COURT_DEBUG_ENTRY = {
  routeId: DESIGN_FLOOR_ID,
  z: ANTENNA_COURT_ROUTE_Z,
  generator: 'generateAntennaCourtDesignFloor',
} as const;

