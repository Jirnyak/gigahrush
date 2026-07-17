/* -- Design z: Черный рынок 88 --------------------------------
 * Standalone future-floor slice. It deliberately does not add a new
 * number; route integration belongs to the floor manifest owner.
 */

import { clamp } from '../../render/ui_utils';
import { ITEMS } from '../../data/catalog';
import { type Market88LaneId, type Market88AccessKind, type Market88Settlement } from './meta';
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

export const MAX_DEBTS = 64;
export const MAX_HEAT = 100;
export const MIN_TRUST = -5;
export const MAX_TRUST = 5;
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
    id: 'market88.purchase.popobava_blister',
    traderId: 'market88_marta_broker',
    lane: 'medicine',
    itemId: 'sleeping_pills',
    count: 2,
    markup: 1.65,
    heatDelta: 3,
    maxPrice: 180,
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
    id: 'market88.purchase.homemade_9mm',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'homemade_9mm',
    count: 6,
    markup: 1.55,
    heatDelta: 5,
    maxPrice: 38,
  },
  {
    id: 'market88.purchase.homemade_ammo_instruction',
    traderId: 'market88_zlata_silence',
    lane: 'documents',
    itemId: 'homemade_ammo_instruction',
    count: 1,
    markup: 2.05,
    heatDelta: 4,
    maxPrice: 260,
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
  {
    id: 'market88.purchase.stolen_terminal_stamp',
    traderId: 'market88_zlata_silence',
    lane: 'documents',
    itemId: 'stolen_terminal_stamp',
    count: 1,
    markup: 2.25,
    heatDelta: 6,
    maxPrice: 420,
  },
  {
    id: 'market88.purchase.black_shells',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'black_market_shells',
    count: 4,
    markup: 2.6,
    heatDelta: 6,
    maxPrice: 180,
  },
  {
    id: 'market88.purchase.shock_baton_under_shelf',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'shock_baton',
    count: 1,
    markup: 1.85,
    heatDelta: 5,
    maxPrice: 780,
  },
  {
    id: 'market88.purchase.rb91_drum_box',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'rb91_auto_shotgun',
    count: 1,
    markup: 1.75,
    heatDelta: 9,
    maxPrice: 6200,
  },
  {
    id: 'market88.purchase.pushkin_shell_platform',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'pushkin_shotgun',
    count: 1,
    markup: 1.95,
    heatDelta: 10,
    maxPrice: 6800,
  },
  {
    id: 'market88.purchase.chest_failsafe_charge',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'chest_failsafe_charge',
    count: 1,
    markup: 2.4,
    heatDelta: 12,
    maxPrice: 5200,
  },
  {
    id: 'market88.purchase.stolen_filters',
    traderId: 'market88_marta_broker',
    lane: 'survival',
    itemId: 'stolen_filter_pack',
    count: 1,
    markup: 1.7,
    heatDelta: 4,
    maxPrice: 240,
  },
  {
    id: 'market88.purchase.braga_bucket',
    traderId: 'market88_marta_broker',
    lane: 'survival',
    itemId: 'braga_bucket',
    count: 1,
    markup: 1.55,
    heatDelta: 3,
    maxPrice: 220,
  },
  {
    id: 'market88.purchase.moonshine_still_part',
    traderId: 'market88_marta_broker',
    lane: 'access',
    itemId: 'moonshine_still_part',
    count: 1,
    markup: 1.9,
    heatDelta: 4,
    maxPrice: 320,
  },
  {
    id: 'market88.purchase.weapon_blueprint_t2',
    traderId: 'market88_zlata_silence',
    lane: 'documents',
    itemId: 'weapon_blueprint_t2',
    count: 1,
    markup: 2.2,
    heatDelta: 7,
    maxPrice: 720,
  },
  {
    id: 'market88.purchase.shocker_parts',
    traderId: 'market88_zhoka_knife',
    lane: 'weapons',
    itemId: 'contraband_shocker_parts',
    count: 1,
    markup: 2,
    heatDelta: 5,
    maxPrice: 360,
  },
  {
    id: 'market88.purchase.maiden_paint_can',
    traderId: 'market88_zlata_silence',
    lane: 'access',
    itemId: 'aerosol_paint_maiden',
    count: 2,
    markup: 1.9,
    heatDelta: 3,
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
    rewardTable: ['fake_pass', 'money'],
    failureConsequence: 'ministry audit pressure',
  },
] as const;

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
  variant: 'classic' | 'wet' | 'electric' | 'meat',
): Market88DesignResult {
  if (variant === 'classic') {
    state.demand.survival = clamp(state.demand.survival + 0.35, 0.75, 2.75);
    state.demand.medicine = clamp(state.demand.medicine + 0.3, 0.75, 2.75);
    state.heat = clamp(state.heat + 4, 0, MAX_HEAT);
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

