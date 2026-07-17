/* -- Design z: bank_floor - cash desks, debt and vault risk -- */

import { BANK_ROOM_NAMES, BANK_HQ_ROOM_NAMES, BANK_VAULT_RISK_RADIUS, BANK_VAULT_RISK_INNER_RADIUS, BankVaultRiskSource, bankVaultRiskSources, bankVaultRiskSignedDistance, bankVaultRiskTierAt, BankMicroBlockSpec, expandBankFloorRouteGeometry, decorateExpandedBankDecisionRooms, buildDebtCircuitLoop, buildBankMicroLayer, carveBankWingCorridors, stampOptionalBankRoom, decorateBankMicroRoom, applyBankVaultRiskSdf, addBankTag, createBankRooms, stampBankRoom, placeBankDoor, dressBankRooms, generateBankZones, setFeature, carveRun, carveRect, openRoomToNearestCorridor, scatterRoomFurniture } from './geometry';
import { DESIGN_NPC_HOME_FLOOR_KEY, BANK_FLOOR_ROUTE_ID, BANK_FLOOR_Z, BANK_FLOOR_BASE_FLOOR, BANK_FLOOR_META, BankFloorState, BankFloorGeneration, BankActionKind, BANK_TAGS, createBankFloorState, summarizeBankFloorState, publishBankFloorEvent, generateBankFloorDesignFloor } from './index';

import { getPlotNpcNumericId } from '../../data/npc_packages';
import {
  Cell,
  ContainerKind,
  DoorState,
  Faction,
  Feature,
  LiftDirection,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type TerritoryOwner,
  type Entity,
  type GameState,
  type Item,
  type Room,
  type WorldContainer,
  type WorldEvent,
} from '../../core/types';
import { World } from '../../core/world';
import { designNpcFloorKey, type PlotNpcDef, registerFloorSideQuest } from '../../data/plot';
import { publishEvent } from '../../systems/events';
import { setTerritoryOwnerAtIndex, syncZoneMetadataFromTerritory } from '../../systems/territory';
import { canPlaceRoom, stampRoom, placeLifts } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { finalizeExpandedFloor} from '../shared';
import { designFloorById } from '../../data/design_floors';
import { hashSeed, seededRandom } from '../../core/rand';

export interface BankHqClusterSpec {
  owner: TerritoryOwner;
  hqName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  wallTex: Tex;
  floorTex: Tex;
  support: readonly Omit<BankMicroBlockSpec, 'count' | 'stepX' | 'stepY'>[];
}

export const BANK_HQ_CLUSTERS: readonly BankHqClusterSpec[] = [
  {
    owner: ZoneFaction.CITIZEN,
    hqName: BANK_HQ_ROOM_NAMES.citizen,
    x: 156,
    y: 438,
    w: 28,
    h: 20,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_PARQUET,
    support: [
      { name: 'Общая банка гражданского штаба Б-22', type: RoomType.COMMON, x: 156, y: 410, w: 26, h: 16, wallTex: Tex.MARBLE, floorTex: Tex.F_MARBLE_TILE },
      { name: 'Кухня гражданского баланса Б-22', type: RoomType.KITCHEN, x: 156, y: 466, w: 24, h: 16, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Санузел гражданского баланса Б-22', type: RoomType.BATHROOM, x: 190, y: 438, w: 16, h: 14, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Склад квитанций гражданского баланса Б-22', type: RoomType.STORAGE, x: 84, y: 438, w: 24, h: 16, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    ],
  },
  {
    owner: ZoneFaction.LIQUIDATOR,
    hqName: BANK_HQ_ROOM_NAMES.liquidator,
    x: 832,
    y: 436,
    w: 30,
    h: 22,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
    support: [
      { name: 'Оружейный шкаф инкассаторов Б-22', type: RoomType.STORAGE, x: 928, y: 436, w: 24, h: 16, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
      { name: 'Медпункт инкассаторов Б-22', type: RoomType.MEDICAL, x: 832, y: 464, w: 26, h: 16, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Дежурка инкассаторов Б-22', type: RoomType.OFFICE, x: 832, y: 408, w: 28, h: 16, wallTex: Tex.METAL, floorTex: Tex.F_GREEN_CARPET },
      { name: 'Склад пломб инкассаторов Б-22', type: RoomType.STORAGE, x: 768, y: 436, w: 24, h: 16, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    ],
  },
  {
    owner: ZoneFaction.CULTIST,
    hqName: BANK_HQ_ROOM_NAMES.cultist,
    x: 744,
    y: 764,
    w: 26,
    h: 20,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_RED_CARPET,
    support: [
      { name: 'Свечная книга долгов Б-22', type: RoomType.COMMON, x: 744, y: 792, w: 28, h: 16, wallTex: Tex.DARK, floorTex: Tex.F_CARPET },
      { name: 'Кладовая восковых процентов Б-22', type: RoomType.STORAGE, x: 708, y: 764, w: 26, h: 16, wallTex: Tex.DARK, floorTex: Tex.F_CONCRETE },
      { name: 'Курилка долгового культа Б-22', type: RoomType.SMOKING, x: 780, y: 764, w: 26, h: 16, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
      { name: 'Санузел свечной очереди Б-22', type: RoomType.BATHROOM, x: 680, y: 710, w: 18, h: 14, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
  {
    owner: ZoneFaction.SCIENTIST,
    hqName: BANK_HQ_ROOM_NAMES.scientist,
    x: 474,
    y: 142,
    w: 28,
    h: 20,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
    support: [
      { name: 'Лаборатория процентного шума Б-22', type: RoomType.PRODUCTION, x: 508, y: 142, w: 30, h: 16, wallTex: Tex.PIPE, floorTex: Tex.F_CONCRETE },
      { name: 'Медкабинет счетчиков НИИ Б-22', type: RoomType.MEDICAL, x: 438, y: 142, w: 26, h: 16, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Кабинет статистики вкладов Б-22', type: RoomType.OFFICE, x: 474, y: 114, w: 30, h: 16, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET },
      { name: 'Склад мерных квитанций Б-22', type: RoomType.STORAGE, x: 548, y: 170, w: 26, h: 14, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    ],
  },
  {
    owner: ZoneFaction.WILD,
    hqName: BANK_HQ_ROOM_NAMES.wild,
    x: 238,
    y: 764,
    w: 28,
    h: 20,
    wallTex: Tex.HERMO_WALL,
    floorTex: Tex.F_CONCRETE,
    support: [
      { name: 'Кухня ночной кассы Б-22', type: RoomType.KITCHEN, x: 238, y: 792, w: 24, h: 16, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
      { name: 'Склад залоговых мешков диких Б-22', type: RoomType.STORAGE, x: 202, y: 764, w: 26, h: 16, wallTex: Tex.BRICK, floorTex: Tex.F_CONCRETE },
      { name: 'Курилка ночной кассы Б-22', type: RoomType.SMOKING, x: 274, y: 764, w: 26, h: 16, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
      { name: 'Санузел ночной кассы Б-22', type: RoomType.BATHROOM, x: 202, y: 732, w: 18, h: 14, wallTex: Tex.TILE_W, floorTex: Tex.F_TILE },
    ],
  },
];

export const DIRECTOR_DEF: PlotNpcDef = {
  name: 'Зинаида Балансовна',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.DIRECTOR,
  sprite: Occupation.DIRECTOR,
  hp: 150, maxHp: 150, money: 210, speed: 0.75,
  inventory: [
    { defId: 'official_permit_slip', count: 1 },
    { defId: 'ration_registry_extract', count: 1 },
    { defId: 'seal_wax', count: 2 },
  ],
  talkLines: [
    'Деньги без печати - слух. С печатью это уже обязательство, и оно умеет ждать у лифта.',
    'Хранилище открыто глазами, но закрыто ведомостью. Украсть можно. Потом ведомость украдет сон.',
    'Фальшивую долговую бумагу лучше сдавать до того, как она научилась писать вашу фамилию.',
  ],
  talkLinesPost: [
    'Баланс сошелся. В Гигахруще это не победа, а короткая пауза.',
    'Если долг стал тише, не значит, что он ушел. Он просто перешел на внутренний учет.',
  ],
};

export const CASHIER_DEF: PlotNpcDef = {
  name: 'Люба Кассир',
  isFemale: true,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 95, maxHp: 95, money: 160, speed: 0.8,
  inventory: [
    { defId: 'voluntary_receipt', count: 2 },
    { defId: 'filter_receipt', count: 1 },
    { defId: 'blank_form', count: 1 },
  ],
  talkLines: [
    'Внести можно наличные. Снять нельзя без очереди, потому что очередь тоже хочет снять.',
    'Касса любит простую арифметику: рубль вошел, бумага вышла, человек стал спокойнее на один коридор.',
    'Не ставьте локти на окно. Предыдущий локоть до сих пор числится залогом.',
  ],
  talkLinesPost: [
    'Ваш взнос лежит там, где деньги становятся строкой.',
    'Квитанцию не мочите. Мокрая бумага считает себя прощенным долгом.',
  ],
};

export const CREDIT_DEF: PlotNpcDef = {
  name: 'Прохор Кредитный',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.SECRETARY,
  sprite: Occupation.SECRETARY,
  hp: 120, maxHp: 120, money: 320, speed: 0.7,
  inventory: [
    { defId: 'voluntary_receipt', count: 1 },
    { defId: 'bank_debt_paper', count: 1 },
    { defId: 'forged_stamp_sheet', count: 1 },
    { defId: 'ink_bottle', count: 1 },
  ],
  talkLines: [
    'Кредит - это когда банк верит, что вы вернетесь. В нашем доме это почти угроза.',
    'Проценты растут медленнее самосбора, но зато без сирены.',
    'Погасить можно деньгами. Нельзя погасить взгляд ликвидатора у хранилища.',
  ],
  talkLinesPost: [
    'Долг записан. Теперь у вас есть причина вернуться живым.',
    'Погашенная строка пахнет сургучом. Непогашенная - коридором за спиной.',
  ],
};

export const GUARD_DEF: PlotNpcDef = {
  name: 'Семен Инкассатор',
  isFemale: false,
  faction: Faction.LIQUIDATOR,
  occupation: Occupation.HUNTER,
  sprite: Occupation.HUNTER,
  hp: 230, maxHp: 230, money: 55, speed: 1.05,
  inventory: [
    { defId: 'makarov', count: 1 },
    { defId: 'ammo_9mm', count: 14 },
    { defId: 'liquidator_token', count: 1 },
  ],
  talkLines: [
    'Я охраняю не деньги. Деньги сами кусаются. Я охраняю свидетелей от плохих решений.',
    'В хранилище тихо только до первой чужой руки.',
    'Черный обход существует для сотрудников. Воры тоже сотрудники, просто без ведомости.',
  ],
  talkLinesPost: [
    'Если касса молчит, значит пока все живы.',
    'У сейфа нет настроения. У меня есть.',
  ],
};

export const DEBTOR_DEF: PlotNpcDef = {
  name: 'Митя Просрочка',
  isFemale: false,
  faction: Faction.CITIZEN,
  occupation: Occupation.TRAVELER,
  sprite: Occupation.TRAVELER,
  hp: 80, maxHp: 80, money: 9, speed: 0.9,
  inventory: [
    { defId: 'forged_bank_debt_paper', count: 1 },
    { defId: 'forged_stamp_sheet', count: 1 },
    { defId: 'cigs', count: 1 },
  ],
  talkLines: [
    'Если бумага похожа на долг, банк сам дорисует остальное.',
    'Я не вор. Я курьер между чужой подписью и своим страхом.',
    'Можно сдать липу управляющей. Можно отдать мне, и касса на минуту станет слепой.',
  ],
  talkLinesPost: [
    'Долг не исчез. Он просто сменил почерк.',
    'Очередь смотрит, будто знает, кто подделал строку.',
  ],
};

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'bank_director_zinaida', DIRECTOR_DEF, [
  {
    id: 'bank_report_forged_debt_paper',
    giverId: getPlotNpcNumericId('bank_director_zinaida')!,
    type: QuestType.FETCH,
    desc: 'Зинаида Балансовна: «Найдете липовую долговую бумагу - сдайте в окно управляющей. Лучше пусть банк злится на бумагу, а не на вас.»',
    targetItem: 'forged_bank_debt_paper', targetCount: 1,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    extraRewards: [{ defId: 'seal_wax', count: 1 }],
    relationDelta: 10, xpReward: 55, moneyReward: 35,
    eventTargetName: 'Фальшивая долговая бумага сдана управляющей банка Б-22.',
    eventTags: [...BANK_TAGS, 'forgery', 'debt_paper', 'report', 'legal'],
    eventData: { bankingAction: 'report_forged_debt_paper', debtRiskClosed: true },
    abandonsSideQuestIds: ['bank_cash_forged_debt_paper'],
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'bank_cashier_lyuba', CASHIER_DEF, [
  {
    id: 'bank_wait_teller_lane',
    giverId: getPlotNpcNumericId('bank_cashier_lyuba')!,
    type: QuestType.VISIT,
    desc: 'Люба Кассир: «Встаньте в кассовую змейку Б-22. Кто дождался окна, тот уже почти внес деньги: банк любит людей, которые умеют стоять.»',
    targetRoomDefId: BANK_ROOM_NAMES.tellerLane,
    rewardItem: 'voluntary_receipt', rewardCount: 1,
    relationDelta: 4, xpReward: 18, moneyReward: 0,
    eventTargetName: 'Очередь кассовой змейки банка Б-22 выстояна до окна.',
    eventTags: [...BANK_TAGS, 'wait', 'queue', 'legal'],
    eventData: { bankingAction: 'wait_teller_lane', queueProgress: true },
  },
  {
    id: 'bank_cash_deposit_50',
    giverId: getPlotNpcNumericId('bank_cashier_lyuba')!,
    type: QuestType.FETCH,
    desc: 'Люба Кассир: «Пятьдесят рублей в кассу Б-22. На руки дам квитанцию: деньги станут строкой, строка станет спокойнее наличных.»',
    targetItem: 'money', targetCount: 50,
    rewardItem: 'voluntary_receipt', rewardCount: 1,
    extraRewards: [{ defId: 'filter_receipt', count: 1 }],
    relationDelta: 8, xpReward: 45, moneyReward: 6,
    eventTargetName: 'Наличные внесены через кассу банка Б-22.',
    eventTags: [...BANK_TAGS, 'deposit', 'cash_to_account', 'legal'],
    eventData: { bankingAction: 'cash_deposit', amount: 50, fee: 6 },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'bank_credit_prokhor', CREDIT_DEF, [
  {
    id: 'bank_take_corridor_loan',
    giverId: getPlotNpcNumericId('bank_credit_prokhor')!,
    type: QuestType.VISIT,
    desc: 'Прохор Кредитный: «Встаньте к кредитному окну. Банк выдаст сто двадцать рублей и оставит долг в журнале: вернуть придется больше.»',
    targetRoomDefId: BANK_ROOM_NAMES.credit,
    rewardItem: 'voluntary_receipt', rewardCount: 1,
    relationDelta: -2, xpReward: 30, moneyReward: 120,
    eventTargetName: 'В банке Б-22 открыт кредитный долг.',
    eventSeverity: 4,
    eventTags: [...BANK_TAGS, 'loan', 'credit', 'debt_opened'],
    eventData: { bankingAction: 'loan_taken', principal: 120, due: 140, visibleAs: 'repay_side_quest' },
  },
  {
    id: 'bank_repay_corridor_loan',
    giverId: getPlotNpcNumericId('bank_credit_prokhor')!,
    type: QuestType.FETCH,
    desc: 'Прохор Кредитный: «Верните сто сорок рублей по кредитной строке Б-22. Проценты не любят героев, они любят календарь.»',
    targetItem: 'money', targetCount: 140,
    rewardItem: 'official_permit_slip', rewardCount: 1,
    relationDelta: 14, xpReward: 65, moneyReward: 0,
    requiresSideQuestDone: 'bank_take_corridor_loan',
    eventTargetName: 'Кредит банка Б-22 погашен наличными.',
    eventTags: [...BANK_TAGS, 'loan', 'repay', 'debt_closed'],
    eventData: { bankingAction: 'loan_repaid', amount: 140, principal: 120 },
  },
]);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'bank_guard_semyon', GUARD_DEF, []);

registerFloorSideQuest(DESIGN_NPC_HOME_FLOOR_KEY, 'bank_debtor_mitya', DEBTOR_DEF, [
  {
    id: 'bank_cash_forged_debt_paper',
    giverId: getPlotNpcNumericId('bank_debtor_mitya')!,
    type: QuestType.FETCH,
    desc: 'Митя Просрочка: «Отдай мне липовую долговую бумагу. Я подсуну ее в хвост очереди, а ты получишь деньги раньше, чем касса проснется.»',
    targetItem: 'forged_bank_debt_paper', targetCount: 1,
    rewardItem: 'fake_pass', rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 2 }],
    relationDelta: -6, xpReward: 35, moneyReward: 90,
    eventTargetName: 'Фальшивая долговая бумага обналичена через очередь должников Б-22.',
    eventSeverity: 5,
    eventPrivacy: 'witnessed',
    eventTags: [...BANK_TAGS, 'forgery', 'debt_paper', 'cash_out', 'risk'],
    eventData: { bankingAction: 'cash_forged_debt_paper', heat: 3, debtRiskOpened: true },
    abandonsSideQuestIds: ['bank_report_forged_debt_paper'],
  },
]);

export function addExpandedBankContainers(
  world: World,
  rooms: {
    bribeQueue: Room;
    vaultShell: Room;
    bypassGate: Room;
  },
): void {
  addBankContainer(world, rooms.bribeQueue, rooms.bribeQueue.x + rooms.bribeQueue.w - 6, rooms.bribeQueue.y + 10, {
    kind: ContainerKind.CASHBOX,
    name: 'Короб нулевой очереди Б-22',
    access: 'faction',
    faction: Faction.CITIZEN,
    inventory: [
      { defId: 'voluntary_receipt', count: 1 },
      { defId: 'forged_stamp_sheet', count: 1 },
      { defId: 'blank_form', count: 2 },
    ],
    tags: ['bribe', 'buyable', 'debt_circuit', 'queue_skip', 'legal_window'],
  });

  addBankContainer(world, rooms.vaultShell, rooms.vaultShell.x + rooms.vaultShell.w - 9, rooms.vaultShell.y + 14, {
    kind: ContainerKind.SAFE,
    name: 'Оболочка малых сейфов Б-22',
    access: 'locked',
    faction: Faction.LIQUIDATOR,
    inventory: [
      { defId: 'debt_settlement_receipt', count: 1 },
      { defId: 'official_permit_slip', count: 1 },
      { defId: 'container_key_label', count: 1 },
      { defId: 'ammo_9mm', count: 12 },
    ],
    tags: ['vault', 'vault_shell', 'high_value', 'theft_risk', 'liquidator_audit'],
    lockDifficulty: 4,
  });

  addBankContainer(world, rooms.bypassGate, rooms.bypassGate.x + 8, rooms.bypassGate.y + rooms.bypassGate.h - 8, {
    kind: ContainerKind.TOOL_LOCKER,
    name: 'Шкаф черного служебного обхода Б-22',
    access: 'locked',
    faction: Faction.LIQUIDATOR,
    inventory: [
      { defId: 'key', count: 1 },
      { defId: 'seal_wax', count: 1 },
      { defId: 'ink_bottle', count: 1 },
    ],
    tags: ['bypass', 'service_bypass', 'escape_pressure', 'vault_risk_sdf'],
    lockDifficulty: 3,
  });
}

export function applyBankFloorTerritorySeeds(world: World): void {
  const targetNames = new Set<string>();
  for (const cluster of BANK_HQ_CLUSTERS) {
    targetNames.add(cluster.hqName);
    for (const support of cluster.support) {
      targetNames.add(support.name);
    }
  }

  const roomByName = new Map<string, Room>();
  let found = 0;
  const targetCount = targetNames.size;

  for (let i = 0; i < world.rooms.length; i++) {
    const r = world.rooms[i];
    if (r.name && targetNames.has(r.name)) {
      roomByName.set(r.name, r);
      found++;
      if (found === targetCount) break;
    }
  }

  for (const cluster of BANK_HQ_CLUSTERS) {
    const hq = roomByName.get(cluster.hqName);
    if (!hq) continue;
    hq.type = RoomType.HQ;
    hq.sealed = true;
    paintBankRoomTerritory(world, hq, cluster.owner);
    paintBankOwnerPatch(world, hq.x + (hq.w >> 1), hq.y + (hq.h >> 1), 44, cluster.owner);
    for (const support of cluster.support) {
      const room = roomByName.get(support.name);
      if (room) paintBankRoomTerritory(world, room, cluster.owner);
    }
  }
  syncZoneMetadataFromTerritory(world);
}

export function paintBankRoomTerritory(world: World, room: Room, owner: TerritoryOwner): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT) continue;
      setTerritoryOwnerAtIndex(world, idx, owner);
    }
  }
}

export function paintBankOwnerPatch(world: World, cx: number, cy: number, radius: number, owner: TerritoryOwner): void {
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const idx = world.idx(cx + dx, cy + dy);
      if (world.aptMask[idx] || world.cells[idx] === Cell.LIFT) continue;
      setTerritoryOwnerAtIndex(world, idx, owner);
    }
  }
}

export function spawnBankNpc(
  entities: Entity[],
  nextId: { v: number },
  npcId: string,
  def: PlotNpcDef,
  room: Room,
  dx: number,
  dy: number,
  angle: number,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, npcId, room.x + dx + 0.5, room.y + dy + 0.5, {
    angle,
    canGiveQuest: npcId !== 'bank_guard_semyon',
    weapon: def.inventory.some(i => i.defId === 'makarov') ? 'makarov' : undefined,
    aiTarget: { x: room.x + dx, y: room.y + dy },
  });
  return npc.id;
}

export function addBankContainers(
  world: World,
  bankState: BankFloorState,
  rooms: ReturnType<typeof createBankRooms>,
  directorId: number,
  cashierId: number,
  creditId: number,
  guardId: number,
): void {
  const cashbox = addBankContainer(world, rooms.teller, rooms.teller.x + rooms.teller.w - 4, rooms.teller.y + 5, {
    kind: ContainerKind.CASHBOX,
    name: 'Кассовый ящик Любы Б-22',
    access: 'owner',
    ownerNpcId: cashierId,
    ownerName: CASHIER_DEF.name,
    faction: Faction.CITIZEN,
    inventory: [
      { defId: 'voluntary_receipt', count: 2 },
      { defId: 'filter_receipt', count: 2 },
      { defId: 'water_coupon', count: 1 },
    ],
    tags: ['cashbox', 'deposit', 'teller', 'legal_window'],
  });
  bankState.depositContainerIds.push(cashbox.id);

  const depositBox = addBankContainer(world, rooms.deposit, rooms.deposit.x + rooms.deposit.w - 5, rooms.deposit.y + 8, {
    kind: ContainerKind.FILING_CABINET,
    name: 'Депозитная картотека Б-22',
    access: 'room',
    ownerNpcId: directorId,
    ownerName: DIRECTOR_DEF.name,
    faction: Faction.CITIZEN,
    inventory: [
      { defId: 'official_permit_slip', count: 1 },
      { defId: 'ration_registry_extract', count: 1 },
      { defId: 'debt_settlement_receipt', count: 1 },
    ],
    tags: ['deposit', 'account', 'paper_in', 'banking_drop'],
  });
  bankState.depositContainerIds.push(depositBox.id);

  addBankContainer(world, rooms.credit, rooms.credit.x + rooms.credit.w - 4, rooms.credit.y + rooms.credit.h - 4, {
    kind: ContainerKind.FILING_CABINET,
    name: 'Кредитная папка Прохора Б-22',
    access: 'owner',
    ownerNpcId: creditId,
    ownerName: CREDIT_DEF.name,
    faction: Faction.CITIZEN,
    inventory: [
      { defId: 'voluntary_receipt', count: 1 },
      { defId: 'bank_debt_paper', count: 1 },
      { defId: 'forged_stamp_sheet', count: 1 },
      { defId: 'ink_bottle', count: 1 },
    ],
    tags: ['credit', 'loan', 'debt', 'paper'],
  });

  const vaultA = addBankContainer(world, rooms.vault, rooms.vault.x + 18, rooms.vault.y + 8, {
    kind: ContainerKind.SAFE,
    name: 'Сейф вкладов Б-22',
    access: 'owner',
    ownerNpcId: guardId,
    ownerName: GUARD_DEF.name,
    faction: Faction.LIQUIDATOR,
    inventory: [
      { defId: 'official_permit_slip', count: 2 },
      { defId: 'weapon_permit_signed', count: 1 },
      { defId: 'confiscation_warrant', count: 1 },
      { defId: 'ammo_9mm', count: 18 },
    ],
    tags: ['vault', 'safe', 'cashbox', 'theft_risk', 'liquidator_audit'],
    lockDifficulty: 5,
  });
  const vaultB = addBankContainer(world, rooms.vault, rooms.vault.x + 27, rooms.vault.y + 25, {
    kind: ContainerKind.CASHBOX,
    name: 'Наличная касса хранилища Б-22',
    access: 'owner',
    ownerNpcId: guardId,
    ownerName: GUARD_DEF.name,
    faction: Faction.LIQUIDATOR,
    inventory: [
      { defId: 'voluntary_receipt', count: 3 },
      { defId: 'elevator_access_order', count: 1 },
      { defId: 'debt_settlement_receipt', count: 1 },
      { defId: 'fake_pass', count: 1 },
    ],
    tags: ['vault', 'cashbox', 'theft_risk', 'debt_paper', 'liquidator_audit'],
    lockDifficulty: 4,
  });
  bankState.vaultContainerIds.push(vaultA.id, vaultB.id);

  addBankContainer(world, rooms.queue, rooms.queue.x + rooms.queue.w - 5, rooms.queue.y + 7, {
    kind: ContainerKind.CASHBOX,
    name: 'Короб должников Б-22',
    access: 'public',
    ownerNpcId: undefined,
    ownerName: undefined,
    faction: Faction.CITIZEN,
    inventory: [
      { defId: 'forged_bank_debt_paper', count: 1 },
      { defId: 'bank_debt_paper', count: 1 },
      { defId: 'forged_stamp_sheet', count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'cigs', count: 1 },
    ],
    tags: ['debt', 'forgery', 'paper', 'risk_path'],
  });
}

export function addBankContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  opts: {
    kind: ContainerKind;
    name: string;
    access: WorldContainer['access'];
    ownerNpcId?: number;
    ownerName?: string;
    faction?: Faction;
    inventory: Item[];
    tags: string[];
    lockDifficulty?: number;
  },
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: BANK_FLOOR_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind: opts.kind,
    name: opts.name,
    inventory: opts.inventory.map(i => ({ ...i })),
    capacitySlots: Math.max(8, opts.inventory.length + 5),
    ownerNpcId: opts.ownerNpcId,
    ownerName: opts.ownerName,
    faction: opts.faction,
    access: opts.access,
    lockDifficulty: opts.lockDifficulty,
    discovered: true,
    tags: [...BANK_TAGS, ...opts.tags],
  };
  world.addContainer(container);
  setFeature(world, x, y, opts.kind === ContainerKind.CASHBOX ? Feature.DESK : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

