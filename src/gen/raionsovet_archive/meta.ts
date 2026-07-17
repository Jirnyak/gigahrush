import {
  Tex, RoomType, 
  Faction, Occupation, ZoneFaction,
  type GameState, type WorldEvent,
} from '../../core/types';
import { designNpcFloorKey, type PlotNpcDef } from '../../data/plot';
import { publishEvent } from '../../systems/events';
import { RaionsovetArchiveDocument, RaionsovetArchiveAccessCheck, RaionsovetArchiveEventKind, ArchiveMicroGridSpec, ArchiveHqSpec, ArchiveMacroMotif } from "./geometry";

export const DESIGN_NPC_HOME_FLOOR_KEY = designNpcFloorKey('raionsovet_archive');

export const RAIONSOVET_ARCHIVE_ROUTE_ID = 'raionsovet_archive' as const;

export const RAIONSOVET_ARCHIVE_Z = 22;

export const RAIONSOVET_ARCHIVE_DEBUG_SEED = 602006;

export const RAIONSOVET_ARCHIVE_META = {
  routeId: RAIONSOVET_ARCHIVE_ROUTE_ID,
  displayName: 'Райсовет и архив картотек',
  z: RAIONSOVET_ARCHIVE_Z,
  debugEntry: 'generateRaionsovetArchiveDesignFloor()',
} as const;

export const RAIONSOVET_ARCHIVE_DOCUMENTS: readonly RaionsovetArchiveDocument[] = [
  {
    id: 'doc_archive_floor_permit',
    itemId: 'archive_access_permit',
    title: 'Допуск к закрытой картотеке',
    routeId: RAIONSOVET_ARCHIVE_ROUTE_ID,
    accessTags: ['archive_entry', 'personal_file'],
    suspicion: 0,
    legal: true,
    flag: 'archive.permit.raionsovet_archive',
  },
  {
    id: 'doc_route_registry_morgue',
    itemId: 'elevator_access_order',
    title: 'Маршрутная бумага к моргу регистраций',
    routeId: 'registry_morgue',
    accessTags: ['route_permit', 'registry_morgue'],
    suspicion: 1,
    legal: true,
    flag: 'archive.permit.registry_morgue',
  },
  {
    id: 'doc_apartment_rights_card',
    itemId: 'personal_file_copy',
    title: 'Копия квартирного права',
    routeId: 'living',
    accessTags: ['apartment_rights', 'personal_file'],
    suspicion: 0,
    legal: true,
    flag: 'archive.card_swapped.living_shelf_17',
  },
  {
    id: 'doc_burned_shelf_act',
    itemId: 'record_exposure_notice',
    title: 'Акт о сожженной зараженной полке',
    routeId: RAIONSOVET_ARCHIVE_ROUTE_ID,
    accessTags: ['archive_burn_order', 'samosbor_record'],
    suspicion: 3,
    legal: true,
    flag: 'archive.shelf_burned.west_stack',
  },
  {
    id: 'doc_market_88_license',
    itemId: 'official_permit_slip',
    title: 'Лицензионный корешок рынка 88',
    routeId: 'black_market_88',
    accessTags: ['trade_license', 'market_88'],
    suspicion: 2,
    legal: true,
    flag: 'archive.market_license_state.licensed',
  },
  {
    id: 'doc_forged_archive_route',
    itemId: 'forged_stamp_sheet',
    title: 'Поддельная печать на архивный обход',
    routeId: RAIONSOVET_ARCHIVE_ROUTE_ID,
    accessTags: ['archive_entry', 'forged'],
    suspicion: 12,
    legal: false,
    flag: 'archive.permit.raionsovet_archive.forged',
  },
  {
    id: 'doc_stolen_apartment_card',
    itemId: 'stolen_archive_card',
    title: 'Краденая карточка квартирных прав',
    routeId: 'living',
    accessTags: ['apartment_rights', 'stolen'],
    suspicion: 9,
    legal: false,
    flag: 'archive.card_swapped.living_shelf_17.stolen',
  },
  {
    id: 'doc_false_market_license',
    itemId: 'fake_pass',
    title: 'Липовая рыночная лицензия',
    routeId: 'black_market_88',
    accessTags: ['trade_license', 'forged'],
    suspicion: 10,
    legal: false,
    flag: 'archive.market_license_state.forged',
  },
];

export const RAIONSOVET_ARCHIVE_ACCESS_CHECKS: readonly RaionsovetArchiveAccessCheck[] = [
  {
    id: 'access_living_shelf_legal',
    targetId: 'door_living_rights_front',
    roomDefId: 'Закрытые жилые полки',
    legalItemId: 'archive_access_permit',
    illegalItemId: 'forged_stamp_sheet',
    legalFlag: 'archive.permit.raionsovet_archive',
    illegalFlag: 'archive.permit.raionsovet_archive.forged',
    visibleEffect: 'Передняя дверь открывается законным допуском; черный вход открывается поддельной печатью.',
  },
  {
    id: 'access_market_license_safe',
    targetId: 'container_market_88_license_safe',
    roomDefId: 'Лицензионная ниша рынка 88',
    legalItemId: 'official_permit_slip',
    illegalItemId: 'fake_pass',
    legalFlag: 'archive.market_license_state.licensed',
    illegalFlag: 'archive.market_license_state.forged',
    visibleEffect: 'Лицензионный сейф дает чистый корешок или подозрительный липовый пропуск.',
  },
  {
    id: 'access_apartment_card_swap',
    targetId: 'container_living_rights_shelf',
    roomDefId: 'Полка квартирных прав',
    legalItemId: 'personal_file_copy',
    illegalItemId: 'stolen_archive_card',
    legalFlag: 'archive.card_swapped.living_shelf_17',
    illegalFlag: 'archive.card_swapped.living_shelf_17.stolen',
    visibleEffect: 'Карточка меняет владельца комнаты через поручение или через кражу из картотеки.',
  },
];

export function resolveRaionsovetArchiveAccess(documentItemId: string, targetId: string): {
  allowed: boolean;
  flag: string;
  suspicionDelta: number;
  legal: boolean;
} | null {
  const check = RAIONSOVET_ARCHIVE_ACCESS_CHECKS.find(c => c.targetId === targetId);
  if (!check) return null;
  if (documentItemId === check.legalItemId) {
    const doc = RAIONSOVET_ARCHIVE_DOCUMENTS.find(d => d.itemId === documentItemId && d.legal);
    return { allowed: true, flag: check.legalFlag, suspicionDelta: doc?.suspicion ?? 0, legal: true };
  }
  if (documentItemId === check.illegalItemId) {
    const doc = RAIONSOVET_ARCHIVE_DOCUMENTS.find(d => d.itemId === documentItemId && !d.legal);
    return { allowed: true, flag: check.illegalFlag, suspicionDelta: doc?.suspicion ?? 8, legal: false };
  }
  return { allowed: false, flag: 'archive.denied.missing_record', suspicionDelta: 1, legal: false };
}

export function publishRaionsovetArchiveEvent(
  state: GameState,
  kind: RaionsovetArchiveEventKind,
  routeId: string,
  targetId: string,
  roomId?: number,
  zoneId?: number,
): WorldEvent {
  return publishEvent(state, {
    type: 'rumor_observed',
    z: 30,
    roomId,
    zoneId,
    targetName: targetId,
    severity: kind === 'shelf_burned' || kind === 'archive_denied' ? 4 : 3,
    privacy: kind === 'archive_denied' ? 'witnessed' : 'local',
    tags: ['archive', RAIONSOVET_ARCHIVE_ROUTE_ID, kind, routeId],
    data: { archiveEvent: kind, routeId, targetId },
  });
}

export const LIDA_DEF: PlotNpcDef = {
  name: 'Лида Индексная',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 120, maxHp: 120, money: 70, speed: 0.75,
  inventory: [
    { defId: 'archive_access_permit', count: 1 },
    { defId: 'elevator_access_order', count: 1 },
    { defId: 'blank_form', count: 2 },
  ],
  talkLines: [
    'Маршрут не существует, пока я не поставила его в указатель у лифта.',
    'Два пустых бланка - и у вас будет допуск к закрытой картотеке.',
    'Кованая печать тоже открывает полку. Потом полка открывает дело на вас.',
    'Не подписывайте форму без адресата. В картотеке пустая графа быстро получает чужую фамилию.',
  ],
  talkLinesPost: [
    'Ваш маршрут внесен в журнал. В лифте держите ордер сверху, а не в кармане.',
    'Карточки любят аккуратных. Громких тут переписывают без очереди.',
  ],
};

export const GRANDFATHER_DEF: PlotNpcDef = {
  name: 'Дед Бумажный',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.STOREKEEPER,
  sprite: Occupation.STOREKEEPER,
  hp: 140, maxHp: 140, money: 20, speed: 0.45,
  inventory: [
    { defId: 'personal_file_copy', count: 1 },
    { defId: 'passport_stub', count: 1 },
  ],
  talkLines: [
    'Я не старый. Я карточка, которую забыли вынуть из человека.',
    'Вернете краденую карточку — покажу, чья комната пережила самосбор.',
    'Если меня сдвинуть на полку, в комнате окажется другой жилец с правильной карточкой.',
    'Дело без обложки не принимается. Обложку берегите: по ней пропускают к полке.',
  ],
  talkLinesPost: [
    'Карточка легла не туда. Теперь квартира спорит с фамилией.',
    'Запомните: право на комнату тише ключа, зато проверяющий смотрит сначала в него.',
  ],
};

export const FIRE_LIQUIDATOR_DEF: PlotNpcDef = {
  name: 'Инна Огневая',
  isFemale: true,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 240, maxHp: 240, money: 110, speed: 1.0,
  inventory: [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 12 },
    { defId: 'record_exposure_notice', count: 1 },
  ],
  talkLines: [
    'Западные стеллажи заражены туманом. Бумага уже кашляет фамилиями.',
    'Принесете пропавшее дело — решим: сохранить запись или сжечь полку.',
    'Сохранить — значит рискнуть людьми. Сжечь — значит оставить людей без прав.',
    'Печатеед у огневой полки не сторож. Он санитар документа: ест лишних владельцев.',
  ],
  talkLinesPost: [
    'Полка дымится, но коридор стал тише.',
    'Если запись спасли, проверьте дверь. В журнале теперь лишнее имя, и проверяющий его найдет.',
  ],
};

export const FALSE_HEIR_DEF: PlotNpcDef = {
  name: 'Гера Наследник',
  isFemale: false,
  faction: Faction.WILD,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 110, maxHp: 110, money: 160, speed: 1.05,
  inventory: [
    { defId: 'fake_pass', count: 1 },
    { defId: 'forged_stamp_sheet', count: 1 },
    { defId: 'ration_registry_extract', count: 1 },
  ],
  talkLines: [
    'Я наследую только пустые комнаты. Они не возражают, если бумага правильная.',
    'Рынок 88 любит лицензии, особенно те, которые никто не проверял утром.',
    'Принесите лист с печатью — сделаем так, будто торговля была всегда.',
    'Липовая лицензия открывает рынок и закрывает чей-то настоящий адрес.',
  ],
  talkLinesPost: [
    'Лицензия чистая на вид. Грязь спрятана в журнале.',
    'Если рынок спросит, я здесь не стоял. Если архив спросит, вы тоже.',
  ],
};

export const RAIONSOVET_ARCHIVE_MICRO_GRIDS: readonly ArchiveMicroGridSpec[] = [
  {
    name: 'Северные окна справок',
    owner: ZoneFaction.CITIZEN,
    x: 382,
    y: 196,
    cols: 6,
    rows: 5,
    roomW: 15,
    roomH: 9,
    gapX: 10,
    gapY: 8,
    connector: { x: 512, y: 256 },
    floorTex: Tex.F_MARBLE_TILE,
    wallTex: Tex.MARBLE,
    roomTypes: [RoomType.OFFICE, RoomType.STORAGE, RoomType.OFFICE, RoomType.COMMON],
  },
  {
    name: 'Юго-западные шкафы прописки',
    owner: ZoneFaction.WILD,
    x: 78,
    y: 538,
    cols: 6,
    rows: 6,
    roomW: 13,
    roomH: 9,
    gapX: 9,
    gapY: 8,
    connector: { x: 142, y: 512 },
    floorTex: Tex.F_WOOD,
    wallTex: Tex.PANEL,
    roomTypes: [RoomType.STORAGE, RoomType.SMOKING, RoomType.STORAGE, RoomType.KITCHEN],
  },
  {
    name: 'Юго-восточная сетка допусков',
    owner: ZoneFaction.SCIENTIST,
    x: 660,
    y: 632,
    cols: 8,
    rows: 6,
    roomW: 14,
    roomH: 9,
    gapX: 9,
    gapY: 8,
    connector: { x: 768, y: 768 },
    floorTex: Tex.F_CONCRETE,
    wallTex: Tex.METAL,
    roomTypes: [RoomType.OFFICE, RoomType.PRODUCTION, RoomType.MEDICAL, RoomType.STORAGE],
  },
  {
    name: 'Нижние маленькие спорные дела',
    owner: ZoneFaction.CITIZEN,
    x: 598,
    y: 878,
    cols: 7,
    rows: 4,
    roomW: 14,
    roomH: 9,
    gapX: 10,
    gapY: 8,
    connector: { x: 512, y: 864 },
    floorTex: Tex.F_PARQUET,
    wallTex: Tex.MARBLE,
    roomTypes: [RoomType.STORAGE, RoomType.OFFICE, RoomType.STORAGE, RoomType.BATHROOM],
  },
  {
    name: 'Культовые ячейки сгоревших фамилий',
    owner: ZoneFaction.CULTIST,
    x: 704,
    y: 812,
    cols: 5,
    rows: 4,
    roomW: 13,
    roomH: 9,
    gapX: 9,
    gapY: 8,
    connector: { x: 768, y: 768 },
    floorTex: Tex.F_MEAT,
    wallTex: Tex.ROTTEN,
    roomTypes: [RoomType.STORAGE, RoomType.COMMON, RoomType.SMOKING, RoomType.MEDICAL],
  },
];

export const RAIONSOVET_ARCHIVE_HQ_SPECS: readonly ArchiveHqSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    name: 'Гражданский штаб очереди райсовета',
    x: 420,
    y: 334,
    linkX: 512,
    linkY: 256,
    wallTex: Tex.PANEL,
    floorTex: Tex.F_PARQUET,
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    name: 'Пост ликвидаторов зараженной полки',
    x: 850,
    y: 546,
    linkX: 884,
    linkY: 512,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.SCIENTIST,
    name: 'НИИ-штаб сверки картотек',
    x: 862,
    y: 704,
    linkX: 884,
    linkY: 768,
    wallTex: Tex.METAL,
    floorTex: Tex.F_CONCRETE,
  },
  {
    owner: ZoneFaction.WILD,
    name: 'Дикий штаб подмены адресов',
    x: 86,
    y: 604,
    linkX: 142,
    linkY: 512,
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_WOOD,
  },
  {
    owner: ZoneFaction.CULTIST,
    name: 'Скрытый культовый штаб пепельной ведомости',
    x: 640,
    y: 828,
    linkX: 768,
    linkY: 768,
    wallTex: Tex.ROTTEN,
    floorTex: Tex.F_MEAT,
  },
];

export const ARCHIVE_MACRO_MOTIFS: readonly ArchiveMacroMotif[] = [
  { id: 0, weight: 5, east: [0, 1, 3, 4], south: [0, 2, 3, 4] },
  { id: 1, weight: 4, east: [0, 1, 2, 4], south: [1, 2, 3, 4] },
  { id: 2, weight: 3, east: [1, 2, 3, 4], south: [0, 1, 2, 4] },
  { id: 3, weight: 2, east: [0, 2, 3, 4], south: [1, 2, 3, 4] },
  { id: 4, weight: 2, east: [0, 1, 2, 3, 4], south: [0, 1, 2, 3, 4] },
];

