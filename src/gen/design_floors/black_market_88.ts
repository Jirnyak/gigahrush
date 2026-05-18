/* -- Design floor: Черный рынок 88 --------------------------------
 * Standalone future-floor slice. It deliberately does not add a new
 * FloorLevel; route integration belongs to the floor manifest owner.
 */

import {
  AIGoal,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  FloorLevel,
  LiftDirection,
  Occupation,
  QuestType,
  RoomType,
  Tex,
  ZoneFaction,
  type ContainerAccess,
  type Entity,
  type Item,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { ITEMS, freshNeeds } from '../../data/catalog';
import { type PlotNpcDef, type SideQuestStep, registerSideQuest } from '../../data/plot';
import { generateZones, sanitizeDoors, stampRoom } from '../shared';
import type { FloorGeneration } from '../floor_manifest';

export const BLACK_MARKET_88_ROUTE_ID = 'black_market_88' as const;
export const BLACK_MARKET_88_DISPLAY_NAME = 'Черный рынок 88';
export const BLACK_MARKET_88_FUTURE_Z = 8;
export const BLACK_MARKET_88_CONTAINER_FLOOR = FloorLevel.LIVING;

export type Market88LaneId = 'survival' | 'weapons' | 'medicine' | 'documents' | 'access';
export type Market88AccessKind = 'password' | 'maintenance_hatch' | 'ministry_document';
export type Market88Settlement = 'rubles' | 'item' | 'contract' | 'document' | 'faction';

export interface Market88StockRow {
  id: string;
  traderId: string;
  lane: Market88LaneId;
  itemId: string;
  count: number;
  markup: number;
  heatDelta: number;
  maxPrice: number;
}

export interface Market88DebtTemplate {
  id: string;
  ownerId: string;
  severity: 1 | 2 | 3 | 4 | 5;
  dueHours: number;
  settlement: Market88Settlement;
  heatDelta: number;
  consequenceId: string;
}

export interface Market88DebtState {
  id: string;
  templateId: string;
  ownerId: string;
  createdAt: number;
  dueAt: number;
  severity: 1 | 2 | 3 | 4 | 5;
  settlement: Market88Settlement;
  consequenceId: string;
  warned: boolean;
  overdue: boolean;
  resolved: boolean;
}

export interface Market88DesignState {
  heat: number;
  trust: number;
  raidCooldownUntil: number;
  raidWarningUntil: number;
  access: Record<Market88AccessKind, boolean>;
  demand: Record<Market88LaneId, number>;
  stock: Record<string, number>;
  traderLocks: Record<string, number>;
  debts: Market88DebtState[];
  stockVersion: number;
}

export interface Market88PriceQuote {
  offerId: string;
  itemId: string;
  lane: Market88LaneId;
  baseValue: number;
  scarcityMultiplier: number;
  heatMultiplier: number;
  trustMultiplier: number;
  demandMultiplier: number;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  locked: boolean;
}

export interface Market88DesignResult {
  ok: boolean;
  reason: string;
  messages: string[];
}

const MAX_DEBTS = 64;
const MAX_HEAT = 100;
const MIN_TRUST = -5;
const MAX_TRUST = 5;

export const BLACK_MARKET_88_STOCK: readonly Market88StockRow[] = [
  {
    id: 'market88.purchase.medkit_under_counter',
    traderId: 'market88_marta_broker',
    lane: 'medicine',
    itemId: 'antibiotic',
    count: 1,
    markup: 1.8,
    heatDelta: 2,
    maxPrice: 260,
  },
  {
    id: 'market88.purchase.panic_bandages',
    traderId: 'market88_uliana_cash',
    lane: 'survival',
    itemId: 'bandage',
    count: 4,
    markup: 1.35,
    heatDelta: 1,
    maxPrice: 80,
  },
  {
    id: 'market88.purchase.quiet_9mm',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'ammo_9mm',
    count: 18,
    markup: 2.1,
    heatDelta: 4,
    maxPrice: 16,
  },
  {
    id: 'market88.purchase.false_pass',
    traderId: 'market88_zlata_silence',
    lane: 'documents',
    itemId: 'fake_pass',
    count: 1,
    markup: 2.4,
    heatDelta: 5,
    maxPrice: 190,
  },
];

export const BLACK_MARKET_88_DEBTS: readonly Market88DebtTemplate[] = [
  {
    id: 'market88.debt.goods_front',
    ownerId: 'market88_marta_broker',
    severity: 2,
    dueHours: 10,
    settlement: 'item',
    heatDelta: 8,
    consequenceId: 'market88.consequence.stock_lock',
  },
  {
    id: 'market88.debt.ruble_note',
    ownerId: 'market88_mikhail_debt',
    severity: 2,
    dueHours: 8,
    settlement: 'rubles',
    heatDelta: 10,
    consequenceId: 'market88.consequence.debt_contract',
  },
  {
    id: 'market88.debt.protection',
    ownerId: 'market88_zhoka_knife',
    severity: 3,
    dueHours: 12,
    settlement: 'faction',
    heatDelta: 14,
    consequenceId: 'market88.consequence.raid_warning',
  },
  {
    id: 'market88.debt.information',
    ownerId: 'market88_zlata_silence',
    severity: 1,
    dueHours: 6,
    settlement: 'document',
    heatDelta: 6,
    consequenceId: 'market88.consequence.access_lock',
  },
  {
    id: 'market88.debt.faction_marker',
    ownerId: 'market88_mikhail_debt',
    severity: 4,
    dueHours: 18,
    settlement: 'contract',
    heatDelta: 18,
    consequenceId: 'market88.consequence.liquidator_sweep',
  },
];

export const BLACK_MARKET_88_CONTRACT_ROWS = [
  {
    id: 'market88.contract.deliver_night_stock',
    issuerId: 'market88_marta_broker',
    objective: 'deliver',
    requiredTrust: 0,
    heatDelta: -4,
    debtSettlementIds: ['market88.debt.goods_front'],
    rewardTable: ['fake_pass', 'cigs', 'money'],
    failureConsequence: 'heat +1, stock stays low',
  },
  {
    id: 'market88.contract.hide_courier',
    issuerId: 'market88_zlata_silence',
    objective: 'hide',
    requiredTrust: 1,
    heatDelta: 3,
    debtSettlementIds: ['market88.debt.information'],
    rewardTable: ['water', 'blank_form'],
    failureConsequence: 'local witness event and heat +2',
  },
  {
    id: 'market88.contract.steal_stamp',
    issuerId: 'market88_zlata_silence',
    objective: 'steal',
    requiredTrust: 0,
    heatDelta: 5,
    debtSettlementIds: ['market88.debt.faction_marker'],
    rewardTable: ['fake_pass', 'rubles'],
    failureConsequence: 'ministry audit pressure',
  },
] as const;

const NPC_DEFS: Record<string, PlotNpcDef> = {
  market88_marta_broker: {
    name: 'Марта Восьмая',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 160, maxHp: 160, money: 140, speed: 0.75,
    inventory: [
      { defId: 'antibiotic', count: 1 },
      { defId: 'pills', count: 2 },
      { defId: 'bandage', count: 3 },
      { defId: 'fake_pass', count: 1 },
      { defId: 'govnyak_roll', count: 3 },
      { defId: 'govnyak_brick', count: 1 },
    ],
    talkLines: [
      'Восемьдесят восьмой не продает чудеса. Он продает отсрочку.',
      'Цена растет от дефицита, от жара и от того, как громко ты платишь.',
      'Берешь товар в долг - оставляешь имя. Имя здесь стоит дороже рубля.',
    ],
    talkLinesPost: [
      'Запас не бесконечный. Прилавок помнит каждую руку.',
      'После рейда ящики пустеют сами. Так дешевле, чем объяснять.',
    ],
  },
  market88_mikhail_debt: {
    name: 'Михаил Долговой',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 120, maxHp: 120, money: 88, speed: 0.7,
    inventory: [
      { defId: 'voluntary_receipt', count: 2 },
      { defId: 'blank_form', count: 1 },
      { defId: 'cigs', count: 2 },
    ],
    talkLines: [
      'Долг без владельца - слух. Долг с владельцем - расписание.',
      'Погаси восемьдесят восемь сейчас, пока охрана считает это арифметикой.',
      'Просрочка не убивает сразу. Она делает дверь внимательной.',
    ],
    talkLinesPost: [
      'Сегодня тетрадь закрыта. Завтра она снова научится читать.',
      'Если рейд пришел раньше срока, значит кто-то заплатил чужим временем.',
    ],
  },
  market88_zlata_silence: {
    name: 'Злата Тишина',
    isFemale: true,
    faction: Faction.WILD,
    occupation: Occupation.SECRETARY,
    sprite: Occupation.SECRETARY,
    hp: 95, maxHp: 95, money: 70, speed: 0.9,
    inventory: [
      { defId: 'fake_pass', count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'denunciation', count: 1 },
      { defId: 'metro_ticket', count: 1 },
    ],
    talkLines: [
      'Пароль не говорят. Его теряют рядом с тем, кто умеет слушать.',
      'Чистая печать открывает грязные двери. Грязная печать открывает быстрее.',
      'Курьера прячут не потому, что он важный. Потому что он еще не заговорил.',
    ],
    talkLinesPost: [
      'Если бумага молчит, значит сделка еще жива.',
      'Неправильный маршрут тоже маршрут, просто он берет больше.',
    ],
  },
  market88_zhoka_knife: {
    name: 'Жока Нож',
    isFemale: false,
    faction: Faction.LIQUIDATOR,
    occupation: Occupation.HUNTER,
    sprite: Occupation.HUNTER,
    hp: 240, maxHp: 240, money: 60, speed: 0.95,
    inventory: [
      { defId: 'makarov', count: 1 },
      { defId: 'ammo_9mm', count: 18 },
      { defId: 'ammo_shells', count: 3 },
      { defId: 'liquidator_token', count: 1 },
    ],
    talkLines: [
      'Оружейный ряд не любит скидки. Скидка звучит как донос.',
      'Патроны продаю поштучно, потому что очередь умирает не пачками.',
      'Рейд не грабит рынок. Рейд прячет товар так, что он перестает быть товаром.',
    ],
    talkLinesPost: [
      'Стволы закрыты, если жара выше нормы. Норма тут маленькая.',
      'Если взял из ящика без спроса, беги до того, как я досчитаю.',
    ],
  },
  market88_uliana_cash: {
    name: 'Ульяна Касса',
    isFemale: true,
    faction: Faction.CITIZEN,
    occupation: Occupation.STOREKEEPER,
    sprite: Occupation.STOREKEEPER,
    hp: 115, maxHp: 115, money: 120, speed: 0.75,
    inventory: [
      { defId: 'water', count: 3 },
      { defId: 'bread', count: 2 },
      { defId: 'canned', count: 1 },
      { defId: 'bandage', count: 2 },
    ],
    talkLines: [
      'Касса не покупает обратно то, что сама испугалась продать.',
      'Хочешь дешевле - принеси товар, снизь жар или закрой чей-нибудь долг.',
      'После мокрого самосбора сухой хлеб идет как документ.',
    ],
    talkLinesPost: [
      'Касса открыта. Ящик закрыт. Это разные новости.',
      'Если товар пропал, пропажа найдет свидетеля сама.',
    ],
  },
  market88_courier_sasha: {
    name: 'Саша Люк',
    isFemale: false,
    faction: Faction.CITIZEN,
    occupation: Occupation.TRAVELER,
    sprite: Occupation.TRAVELER,
    hp: 75, maxHp: 75, money: 12, speed: 1.15,
    inventory: [
      { defId: 'gasmask_filter', count: 1 },
      { defId: 'note', count: 1 },
    ],
    talkLines: [
      'Я не видел рейд. Я видел, как прилавки стали пустыми за минуту до него.',
      'Люк ведет вниз, если проводник трезвый. Если нет - все равно вниз.',
      'Спрячешь меня до отбоя - получишь маршрут, который еще не успели продать.',
    ],
    talkLinesPost: [
      'Спасибо. Я теперь тише, чем был должен.',
      'Люк мокрый, но живой. Пока.',
    ],
  },
};

const SIDE_QUESTS: readonly SideQuestStep[] = [
  {
    id: 'market88_deliver_night_stock',
    giverNpcId: 'market88_marta_broker',
    type: QuestType.FETCH,
    desc: 'Марта Восьмая: «Принеси антибиотик в ночной запас. Деньги будут, но главный товар - доверие.»',
    targetItem: 'antibiotic',
    targetCount: 1,
    rewardItem: 'fake_pass',
    rewardCount: 1,
    extraRewards: [{ defId: 'cigs', count: 2 }],
    relationDelta: 10,
    xpReward: 55,
    moneyReward: 80,
  },
  {
    id: 'market88_hide_courier',
    giverNpcId: 'market88_zlata_silence',
    type: QuestType.TALK,
    desc: 'Злата Тишина: «Найди Сашу Люка и скажи, что люк сегодня спит. Не геройствуй, просто доведи слова.»',
    targetNpcId: 'market88_courier_sasha',
    rewardItem: 'blank_form',
    rewardCount: 1,
    extraRewards: [{ defId: 'water', count: 1 }],
    relationDelta: 9,
    xpReward: 45,
    moneyReward: 45,
  },
  {
    id: 'market88_steal_stamp',
    giverNpcId: 'market88_zlata_silence',
    type: QuestType.FETCH,
    desc: 'Злата Тишина: «Нужна печать ЖЭК. Купить нельзя: купленная печать слишком быстро вспоминает продавца.»',
    targetItem: 'zhek_seal',
    targetCount: 1,
    rewardItem: 'fake_pass',
    rewardCount: 1,
    relationDelta: 8,
    xpReward: 60,
    moneyReward: 70,
  },
  {
    id: 'market88_settle_bad_debt',
    giverNpcId: 'market88_mikhail_debt',
    type: QuestType.FETCH,
    desc: 'Михаил Долговой: «Восемьдесят восемь рублей - и тетрадь сегодня не смотрит в твою сторону.»',
    targetItem: 'money',
    targetCount: 88,
    rewardItem: 'voluntary_receipt',
    rewardCount: 1,
    extraRewards: [{ defId: 'bread', count: 1 }],
    relationDelta: 6,
    xpReward: 35,
  },
  {
    id: 'market88_return_ammo_crate',
    giverNpcId: 'market88_zhoka_knife',
    type: QuestType.FETCH,
    desc: 'Жока Нож: «Верни двадцать четыре девятки в ряд. Оружие откроется не шире, просто позже закроется.»',
    targetItem: 'ammo_9mm',
    targetCount: 24,
    rewardItem: 'ammo_shells',
    rewardCount: 3,
    extraRewards: [{ defId: 'liquidator_token', count: 1 }],
    relationDelta: 8,
    xpReward: 50,
    moneyReward: 30,
  },
];

let contentRegistered = false;

export function registerBlackMarket88DesignFloorContent(): void {
  if (contentRegistered) return;
  for (const npcId of Object.keys(NPC_DEFS)) {
    const quests = SIDE_QUESTS.filter(q => q.giverNpcId === npcId);
    registerSideQuest(npcId, NPC_DEFS[npcId], quests);
  }
  contentRegistered = true;
}

export function createBlackMarket88DesignState(): Market88DesignState {
  const stock: Record<string, number> = {};
  for (const row of BLACK_MARKET_88_STOCK) stock[row.id] = row.count;
  return {
    heat: 18,
    trust: 0,
    raidCooldownUntil: 0,
    raidWarningUntil: 0,
    access: {
      password: true,
      maintenance_hatch: false,
      ministry_document: false,
    },
    demand: {
      survival: 1,
      weapons: 1,
      medicine: 1,
      documents: 1,
      access: 1,
    },
    stock,
    traderLocks: {},
    debts: [],
    stockVersion: 1,
  };
}

export function quoteBlackMarket88Purchase(
  state: Market88DesignState,
  offerId: string,
  scarcityMultiplier = 1,
  now = 0,
): Market88PriceQuote | null {
  const row = BLACK_MARKET_88_STOCK.find(s => s.id === offerId);
  if (!row) return null;
  const def = ITEMS[row.itemId];
  const baseValue = Math.max(1, def?.value ?? 1);
  const heatMultiplier = 1 + clamp(state.heat, 0, MAX_HEAT) / 180;
  const trust = clamp(state.trust, MIN_TRUST, MAX_TRUST);
  const trustMultiplier = trust >= 0 ? 1 - trust * 0.04 : 1 + Math.abs(trust) * 0.04;
  const demandMultiplier = clamp(state.demand[row.lane] ?? 1, 0.75, 2.75);
  const raw = baseValue * row.markup * clamp(scarcityMultiplier, 0.5, 4) * heatMultiplier * trustMultiplier * demandMultiplier;
  const buyPrice = clamp(Math.round(raw), 1, row.maxPrice);
  return {
    offerId,
    itemId: row.itemId,
    lane: row.lane,
    baseValue,
    scarcityMultiplier,
    heatMultiplier,
    trustMultiplier,
    demandMultiplier,
    buyPrice,
    sellPrice: Math.max(1, Math.floor(buyPrice * 0.45)),
    stock: state.stock[offerId] ?? 0,
    locked: (state.traderLocks[row.traderId] ?? 0) > now || (state.traderLocks[row.lane] ?? 0) > now,
  };
}

export function applyBlackMarket88Purchase(
  state: Market88DesignState,
  offerId: string,
  now = 0,
): Market88DesignResult {
  const row = BLACK_MARKET_88_STOCK.find(s => s.id === offerId);
  const quote = quoteBlackMarket88Purchase(state, offerId, 1, now);
  if (!row || !quote) return { ok: false, reason: 'missing_offer', messages: [] };
  if (quote.locked) return { ok: false, reason: 'trader_locked', messages: ['Ряд закрыт до проверки.'] };
  if (quote.stock <= 0) return { ok: false, reason: 'out_of_stock', messages: ['Товар закончился. Долг не создает новый товар.'] };

  state.stock[offerId] = quote.stock - 1;
  state.heat = clamp(state.heat + row.heatDelta, 0, MAX_HEAT);
  state.demand[row.lane] = clamp((state.demand[row.lane] ?? 1) + 0.04, 0.75, 2.75);
  state.stockVersion++;

  const messages = [`Куплено: ${ITEMS[row.itemId]?.name ?? row.itemId}. Осталось: ${state.stock[offerId]}.`];
  if (state.heat >= 65 && now >= state.raidCooldownUntil) {
    applyBlackMarket88RaidWarning(state, now);
    messages.push('Оружейный ряд убрал ящики: рейд уже стал слухом.');
  }
  return { ok: true, reason: 'purchased', messages };
}

export function createBlackMarket88Debt(
  state: Market88DesignState,
  templateId: string,
  now = 0,
): Market88DesignResult {
  const template = BLACK_MARKET_88_DEBTS.find(d => d.id === templateId);
  if (!template) return { ok: false, reason: 'missing_template', messages: [] };
  if (state.debts.length >= MAX_DEBTS) return { ok: false, reason: 'debt_cap', messages: ['Тетрадь полна. Новые долги не пишут поверх старых.'] };
  if (state.debts.some(d => !d.resolved && d.templateId === templateId)) {
    return { ok: false, reason: 'duplicate_unresolved_debt', messages: ['Сначала закрой старую строку.'] };
  }

  const debt: Market88DebtState = {
    id: `${template.id}.${Math.max(1, state.debts.length + 1)}`,
    templateId: template.id,
    ownerId: template.ownerId,
    createdAt: now,
    dueAt: now + template.dueHours * 60,
    severity: template.severity,
    settlement: template.settlement,
    consequenceId: template.consequenceId,
    warned: false,
    overdue: false,
    resolved: false,
  };
  state.debts.push(debt);
  state.heat = clamp(state.heat + template.heatDelta, 0, MAX_HEAT);
  state.trust = clamp(state.trust - 1, MIN_TRUST, MAX_TRUST);
  return {
    ok: true,
    reason: 'debt_created',
    messages: [`Долг записан: ${template.id}. Срок: ${template.dueHours} ч.`],
  };
}

export function matureBlackMarket88Debts(state: Market88DesignState, now: number): Market88DesignResult {
  const messages: string[] = [];
  let processed = 0;
  for (const debt of state.debts) {
    if (processed >= 3) break;
    if (debt.resolved || debt.overdue || now < debt.dueAt) continue;
    debt.warned = true;
    debt.overdue = true;
    processed++;
    state.heat = clamp(state.heat + debt.severity * 5, 0, MAX_HEAT);
    state.trust = clamp(state.trust - 1, MIN_TRUST, MAX_TRUST);
    if (debt.consequenceId.includes('stock_lock')) state.traderLocks.medicine = now + 6 * 60;
    if (debt.consequenceId.includes('access_lock')) state.traderLocks.access = now + 8 * 60;
    if (debt.consequenceId.includes('raid')) applyBlackMarket88RaidWarning(state, now);
    messages.push(`Просрочен долг ${debt.id}: ${debt.consequenceId}.`);
  }
  return {
    ok: processed > 0,
    reason: processed > 0 ? 'debts_matured' : 'no_due_debts',
    messages,
  };
}

export function applyBlackMarket88RaidWarning(state: Market88DesignState, now: number): Market88DesignResult {
  if (now < state.raidCooldownUntil) {
    return { ok: false, reason: 'raid_cooldown', messages: ['Рейд уже отложен, но рынок не успокоился.'] };
  }
  state.raidWarningUntil = now + 45;
  state.raidCooldownUntil = now + 12 * 60;
  state.traderLocks.weapons = now + 4 * 60;
  state.traderLocks.documents = now + 2 * 60;
  state.heat = clamp(state.heat - 12, 0, MAX_HEAT);
  state.stockVersion++;
  return {
    ok: true,
    reason: 'raid_warning',
    messages: ['Предупреждение рейда: оружие и документы спрятаны, добычи с рейда нет.'],
  };
}

export function applyBlackMarket88SamosborDemand(
  state: Market88DesignState,
  variant: 'classic' | 'quiet' | 'wet' | 'electric' | 'meat',
): Market88DesignResult {
  if (variant === 'classic' || variant === 'quiet') {
    state.demand.survival = clamp(state.demand.survival + 0.35, 0.75, 2.75);
    state.demand.medicine = clamp(state.demand.medicine + 0.3, 0.75, 2.75);
    state.heat = clamp(state.heat + (variant === 'quiet' ? 8 : 4), 0, MAX_HEAT);
  } else if (variant === 'wet') {
    state.demand.survival = clamp(state.demand.survival + 0.25, 0.75, 2.75);
    state.demand.access = clamp(state.demand.access + 0.2, 0.75, 2.75);
  } else if (variant === 'electric') {
    state.demand.weapons = clamp(state.demand.weapons + 0.25, 0.75, 2.75);
    state.traderLocks.weapons = Math.max(state.traderLocks.weapons ?? 0, 3 * 60);
  } else {
    state.demand.documents = clamp(state.demand.documents + 0.2, 0.75, 2.75);
    state.heat = clamp(state.heat + 10, 0, MAX_HEAT);
  }
  state.stockVersion++;
  return { ok: true, reason: `samosbor_${variant}`, messages: [`Спрос рынка изменен: ${variant}.`] };
}

interface MarketRooms {
  publicGate: Room;
  mainLane: Room;
  debtOffice: Room;
  documentGate: Room;
  documentBooth: Room;
  weaponStall: Room;
  medicineLocker: Room;
  serviceHatch: Room;
  courierHideout: Room;
}

export function generateBlackMarket88DesignFloor(): FloorGeneration {
  registerBlackMarket88DesignFloorContent();

  const world = new World();
  const entities: Entity[] = [];
  const nextId = { v: 1 };

  generateZones(world);
  tuneMarketZones(world);

  const rooms = buildMarketRooms(world);
  linkMarketRooms(world, rooms);
  decorateMarketRooms(world, rooms);
  addAccessLifts(world, rooms);

  const npcs = spawnMarketNpcs(world, entities, nextId, rooms);
  seedMarketContainers(world, rooms, npcs);

  sanitizeDoors(world);
  world.bakeLights();

  return {
    world,
    entities,
    spawnX: rooms.publicGate.x + 3.5,
    spawnY: rooms.publicGate.y + Math.floor(rooms.publicGate.h / 2) + 0.5,
  };
}

export function generateBlackMarket88DebugFloor(): FloorGeneration {
  return generateBlackMarket88DesignFloor();
}

function buildMarketRooms(world: World): MarketRooms {
  const x = 492;
  const y = 492;
  return {
    publicGate: makeRoom(world, 0, RoomType.CORRIDOR, x - 11, y + 5, 10, 6, 'Парольный вход 88', Tex.METAL, Tex.F_CONCRETE),
    mainLane: makeRoom(world, 1, RoomType.COMMON, x, y, 36, 16, 'Рыночные ряды 88', Tex.METAL, Tex.F_CONCRETE),
    debtOffice: makeRoom(world, 2, RoomType.OFFICE, x + 3, y - 11, 12, 10, 'Долговая контора 88', Tex.METAL, Tex.F_GREEN_CARPET),
    documentGate: makeRoom(world, 3, RoomType.CORRIDOR, x + 20, y - 18, 12, 6, 'Документальный вход 88', Tex.MARBLE, Tex.F_MARBLE_TILE),
    documentBooth: makeRoom(world, 4, RoomType.OFFICE, x + 20, y - 11, 12, 10, 'Бумажная будка 88', Tex.MARBLE, Tex.F_RED_CARPET),
    weaponStall: makeRoom(world, 5, RoomType.STORAGE, x + 3, y + 17, 13, 9, 'Оружейный ряд 88', Tex.METAL, Tex.F_CONCRETE),
    medicineLocker: makeRoom(world, 6, RoomType.MEDICAL, x + 20, y + 17, 13, 9, 'Лекарственный шкаф 88', Tex.TILE_W, Tex.F_TILE),
    serviceHatch: makeRoom(world, 7, RoomType.PRODUCTION, x + 37, y + 5, 10, 6, 'Служебный люк 88', Tex.PIPE, Tex.F_CONCRETE),
    courierHideout: makeRoom(world, 8, RoomType.SMOKING, x + 37, y + 13, 10, 8, 'Курьерская щель 88', Tex.BRICK, Tex.F_LINO),
  };
}

function makeRoom(
  world: World,
  id: number,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, id, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const i = world.idx(room.x + dx, room.y + dy);
      if (world.cells[i] === Cell.WALL) world.wallTex[i] = wallTex;
    }
  }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) world.floorTex[world.idx(room.x + dx, room.y + dy)] = floorTex;
  }
  return room;
}

function linkMarketRooms(world: World, rooms: MarketRooms): void {
  placeSharedDoor(world, rooms.publicGate, rooms.mainLane, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.debtOffice, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.documentBooth, DoorState.LOCKED, 'key');
  placeSharedDoor(world, rooms.documentGate, rooms.documentBooth, DoorState.LOCKED, 'key');
  placeSharedDoor(world, rooms.mainLane, rooms.weaponStall, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.medicineLocker, DoorState.CLOSED, '');
  placeSharedDoor(world, rooms.mainLane, rooms.serviceHatch, DoorState.LOCKED, 'key');
  placeSharedDoor(world, rooms.serviceHatch, rooms.courierHideout, DoorState.HERMETIC_CLOSED, '');
}

function placeSharedDoor(world: World, a: Room, b: Room, state: DoorState, keyId: string): void {
  const candidates: number[] = [];
  for (let dy = -1; dy <= a.h; dy++) {
    for (let dx = -1; dx <= a.w; dx++) {
      if (dx >= 0 && dx < a.w && dy >= 0 && dy < a.h) continue;
      const wx = world.wrap(a.x + dx);
      const wy = world.wrap(a.y + dy);
      const i = world.idx(wx, wy);
      if (world.cells[i] !== Cell.WALL) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (world.roomMap[world.idx(wx + ox, wy + oy)] === b.id && world.roomMap[world.idx(wx - ox, wy - oy)] === a.id) {
          candidates.push(i);
          break;
        }
      }
    }
  }
  if (candidates.length === 0) return;
  const doorIdx = candidates[Math.floor(candidates.length / 2)];
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, { idx: doorIdx, state, roomA: a.id, roomB: b.id, keyId, timer: 0 });
  a.doors.push(doorIdx);
  b.doors.push(doorIdx);
}

function decorateMarketRooms(world: World, rooms: MarketRooms): void {
  for (let dx = 3; dx < rooms.mainLane.w - 3; dx += 4) {
    world.features[world.idx(rooms.mainLane.x + dx, rooms.mainLane.y + 4)] = Feature.DESK;
    world.features[world.idx(rooms.mainLane.x + dx, rooms.mainLane.y + 11)] = Feature.SHELF;
  }
  for (let dx = 4; dx < rooms.mainLane.w - 4; dx += 8) {
    world.features[world.idx(rooms.mainLane.x + dx, rooms.mainLane.y + 2)] = Feature.LAMP;
  }
  world.features[world.idx(rooms.debtOffice.x + 3, rooms.debtOffice.y + 3)] = Feature.DESK;
  world.features[world.idx(rooms.debtOffice.x + 8, rooms.debtOffice.y + 2)] = Feature.SHELF;
  world.features[world.idx(rooms.debtOffice.x + 6, rooms.debtOffice.y + 7)] = Feature.LAMP;

  world.features[world.idx(rooms.documentBooth.x + 2, rooms.documentBooth.y + 2)] = Feature.DESK;
  world.features[world.idx(rooms.documentBooth.x + 7, rooms.documentBooth.y + 2)] = Feature.SHELF;
  world.features[world.idx(rooms.documentBooth.x + 9, rooms.documentBooth.y + 7)] = Feature.LAMP;

  for (let dx = 2; dx < rooms.weaponStall.w - 1; dx += 3) {
    world.features[world.idx(rooms.weaponStall.x + dx, rooms.weaponStall.y + 2)] = Feature.SHELF;
  }
  world.features[world.idx(rooms.weaponStall.x + 7, rooms.weaponStall.y + 6)] = Feature.MACHINE;

  for (let dx = 2; dx < rooms.medicineLocker.w - 1; dx += 3) {
    world.features[world.idx(rooms.medicineLocker.x + dx, rooms.medicineLocker.y + 2)] = Feature.SHELF;
  }
  world.features[world.idx(rooms.medicineLocker.x + 7, rooms.medicineLocker.y + 6)] = Feature.APPARATUS;

  world.features[world.idx(rooms.serviceHatch.x + 4, rooms.serviceHatch.y + 3)] = Feature.MACHINE;
  world.features[world.idx(rooms.courierHideout.x + 3, rooms.courierHideout.y + 3)] = Feature.CHAIR;
  world.features[world.idx(rooms.courierHideout.x + 7, rooms.courierHideout.y + 4)] = Feature.CANDLE;
}

function addAccessLifts(world: World, rooms: MarketRooms): void {
  addLiftGate(world, rooms.publicGate, rooms.publicGate.x - 1, rooms.publicGate.y + 3, rooms.publicGate.x, rooms.publicGate.y + 3, LiftDirection.UP);
  addLiftGate(world, rooms.serviceHatch, rooms.serviceHatch.x + rooms.serviceHatch.w, rooms.serviceHatch.y + 3, rooms.serviceHatch.x + rooms.serviceHatch.w - 1, rooms.serviceHatch.y + 3, LiftDirection.DOWN);
  addLiftGate(world, rooms.documentGate, rooms.documentGate.x + 6, rooms.documentGate.y - 1, rooms.documentGate.x + 6, rooms.documentGate.y, LiftDirection.UP);
}

function addLiftGate(world: World, room: Room, liftX: number, liftY: number, buttonX: number, buttonY: number, direction: LiftDirection): void {
  const i = world.idx(liftX, liftY);
  world.cells[i] = Cell.LIFT;
  world.roomMap[i] = -1;
  world.wallTex[i] = Tex.LIFT_DOOR;
  world.floorTex[i] = Tex.F_CONCRETE;
  world.liftDir[i] = direction;
  const bi = world.idx(buttonX, buttonY);
  world.features[bi] = Feature.LIFT_BUTTON;
  world.liftDir[bi] = direction;
  void room;
}

function spawnMarketNpcs(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  rooms: MarketRooms,
): Record<string, Entity> {
  const npcs: Record<string, Entity> = {};
  npcs.market88_marta_broker = spawnNpc(world, entities, nextId, rooms.mainLane, 'market88_marta_broker', 10, 3, Math.PI / 2, true);
  npcs.market88_mikhail_debt = spawnNpc(world, entities, nextId, rooms.debtOffice, 'market88_mikhail_debt', 5, 5, Math.PI / 2, true);
  npcs.market88_zlata_silence = spawnNpc(world, entities, nextId, rooms.documentBooth, 'market88_zlata_silence', 5, 5, Math.PI, true);
  npcs.market88_zhoka_knife = spawnNpc(world, entities, nextId, rooms.weaponStall, 'market88_zhoka_knife', 6, 5, -Math.PI / 2, true, 'makarov');
  npcs.market88_uliana_cash = spawnNpc(world, entities, nextId, rooms.mainLane, 'market88_uliana_cash', 23, 12, -Math.PI / 2, false);
  npcs.market88_courier_sasha = spawnNpc(world, entities, nextId, rooms.courierHideout, 'market88_courier_sasha', 5, 4, Math.PI, false);
  return npcs;
}

function spawnNpc(
  world: World,
  entities: Entity[],
  nextId: { v: number },
  room: Room,
  plotNpcId: string,
  dx: number,
  dy: number,
  angle: number,
  canGiveQuest: boolean,
  weapon?: string,
): Entity {
  const def = NPC_DEFS[plotNpcId];
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const entity: Entity = {
    id: nextId.v++,
    type: EntityType.NPC,
    x: x + 0.5,
    y: y + 0.5,
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
    ai: { goal: AIGoal.IDLE, tx: x + 0.5, ty: y + 0.5, path: [], pi: 0, stuck: 0, timer: 0 },
    inventory: def.inventory.map(i => ({ ...i })),
    weapon,
    faction: def.faction,
    occupation: def.occupation,
    plotNpcId,
    canGiveQuest,
    questId: -1,
  };
  entities.push(entity);
  return entity;
}

function seedMarketContainers(world: World, rooms: MarketRooms, npcs: Record<string, Entity>): void {
  addContainer(world, rooms.mainLane, 5, 12, ContainerKind.CASHBOX, 'Касса Ульяны 88', 'owner', 8, [
    { defId: 'water', count: 2 },
    { defId: 'bread', count: 2 },
    { defId: 'cigs', count: 4 },
    { defId: 'govnyak_roll', count: 2 },
    { defId: 'voluntary_receipt', count: 1 },
  ], ['market88', 'purchase', 'limited_stock', 'no_buyback'], npcs.market88_uliana_cash);

  addContainer(world, rooms.debtOffice, 9, 5, ContainerKind.SAFE, 'Сейф долговой тетради 88', 'locked', 6, [
    { defId: 'voluntary_receipt', count: 2 },
    { defId: 'denunciation', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'govnyak_bad_batch', count: 1 },
  ], ['market88', 'debt', 'audit', 'raid_warning'], npcs.market88_mikhail_debt, Faction.CITIZEN, 4);

  addContainer(world, rooms.documentBooth, 8, 6, ContainerKind.FILING_CABINET, 'Папка чужих печатей 88', 'owner', 7, [
    { defId: 'fake_pass', count: 1 },
    { defId: 'blank_form', count: 2 },
    { defId: 'denunciation', count: 1 },
    { defId: 'note', count: 1, data: '88: документ открывает дверь один раз, потом открывает дело.' },
  ], ['market88', 'documents', 'contract', 'steal_stamp'], npcs.market88_zlata_silence);

  addContainer(world, rooms.weaponStall, 9, 5, ContainerKind.WEAPON_CRATE, 'Запертый оружейный ящик 88', 'faction', 6, [
    { defId: 'ammo_9mm', count: 18 },
    { defId: 'ammo_shells', count: 3 },
    { defId: 'liquidator_token', count: 1 },
  ], ['market88', 'weapons', 'raid_lock', 'theft'], npcs.market88_zhoka_knife, Faction.LIQUIDATOR, 3);

  addContainer(world, rooms.medicineLocker, 9, 5, ContainerKind.MEDICAL_CABINET, 'Лекарственный долг 88', 'owner', 6, [
    { defId: 'pills', count: 2 },
    { defId: 'antibiotic', count: 1 },
    { defId: 'morphine_ampoule', count: 1 },
    { defId: 'sanitary_kit', count: 1 },
  ], ['market88', 'medicine', 'scarcity', 'debt'], npcs.market88_marta_broker);

  addContainer(world, rooms.serviceHatch, 6, 3, ContainerKind.TOOL_LOCKER, 'Люк проводника 88', 'secret', 5, [
    { defId: 'gasmask_filter', count: 1 },
    { defId: 'metro_ticket', count: 1 },
    { defId: 'door_kit', count: 1 },
  ], ['market88', 'access', 'maintenance_hatch', 'secret'], undefined, undefined, 2, false);
}

function addContainer(
  world: World,
  room: Room,
  dx: number,
  dy: number,
  kind: ContainerKind,
  name: string,
  access: ContainerAccess,
  capacitySlots: number,
  inventory: Item[],
  tags: string[],
  owner?: Entity,
  faction?: Faction,
  lockDifficulty?: number,
  discovered = true,
): void {
  const x = world.wrap(room.x + dx);
  const y = world.wrap(room.y + dy);
  const container: WorldContainer = {
    id: world.containers.length + 1,
    x,
    y,
    floor: BLACK_MARKET_88_CONTAINER_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(i => ({ ...i })),
    capacitySlots,
    ownerNpcId: owner?.id,
    ownerName: owner?.name,
    faction: faction ?? owner?.faction,
    access,
    lockDifficulty,
    discovered,
    tags,
  };
  world.addContainer(container);
}

function tuneMarketZones(world: World): void {
  for (const zone of world.zones) {
    zone.level = 3;
    zone.fogged = false;
    zone.faction = zone.id % 5 === 0 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
    zone.hasLift = false;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
