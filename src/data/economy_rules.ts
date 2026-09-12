import { Faction, Occupation } from '../core/types';
import { floorKeyForDesign } from './floor_keys';
import type { SamosborVariantId } from './samosbor_variants';

export type EconomyFloorRef = number | string;

export type EconomyRouteDecisionId = 'sell_sample' | 'pay_debt' | 'steal' | 'risky_job' | 'report';

export interface EconomyRouteDecisionRule {
  routeId: string;
  id: EconomyRouteDecisionId;
  label: string;
  heatDelta: number;
  trustDelta: number;
  debtDelta: number;
  demandDelta: number;
  severity: 1 | 2 | 3 | 4 | 5;
  rumorIds: readonly string[];
  tags: readonly string[];
}

export interface EconomyRouteSamosborDemandRule {
  routeId: string;
  variantId: SamosborVariantId;
  heatDelta: number;
  resourcePressure: readonly {
    resourceId: string;
    multiplier: number;
    reason: string;
    tags: readonly string[];
  }[];
  rumorIds: readonly string[];
}

export interface EconomyDemandRule {
  resourceId: string;
  floor?: EconomyFloorRef;
  multiplier: number;
  reason: string;
  tags?: readonly string[];
}

export interface EconomyTariffRule {
  resourceId?: string;
  floor?: EconomyFloorRef;
  multiplier: number;
  reason: string;
  tags?: readonly string[];
}

export interface EconomyTradeSpreadRule {
  id: string;
  occupation?: Occupation;
  faction?: Faction;
  buyMultiplier: number;
  sellMultiplier: number;
  reason: string;
  tags: readonly string[];
}

/** Достаток обычного жителя этажа — множитель к его деньгам.
 *
 *  Ссылка на этаж намеренно двух видов, и это не небрежность: число значит
 *  ВЫСОТУ, то есть весь пояс целиком вместе с процедурными этажами на нём,
 *  а строка — ключ одного конкретного авторского этажа. Банковский этаж богат
 *  сам по себе, а не потому, что висит на своей высоте.
 *
 *  Таблица живёт здесь, а не в A-Life: система считает деньги, но не обязана
 *  знать, какой этаж богат. */
export interface NpcWealthRule {
  floor: EconomyFloorRef;
  multiplier: number;
  reason: string;
}

export const NPC_WEALTH_RULES: readonly NpcWealthRule[] = [
  { floor: 'bank_floor', multiplier: 6.5, reason: 'сейфы, залоги и долговые книги' },
  { floor: 30, multiplier: 2.4, reason: 'министерство: оклады и подписи' },
  { floor: -26, multiplier: 1.25, reason: 'коллекторы: сменная оплата' },
  { floor: -36, multiplier: 0.45, reason: 'ад: деньги почти ничего не решают' },
];

export function npcWealthMultiplier(z: number, floorKey: string): number {
  for (const rule of NPC_WEALTH_RULES) {
    const hit = typeof rule.floor === 'string'
      ? floorKey === floorKeyForDesign(rule.floor)
      : rule.floor === z;
    if (hit) return rule.multiplier;
  }
  return 1;
}

export const ECONOMY_ROUTE_BLACK_MARKET_88 = 'black_market_88';

export const ECONOMY_DEMAND_RULES: readonly EconomyDemandRule[] = [
  { floor: 30, resourceId: 'documents', multiplier: 1.36, reason: 'ministry_document_demand', tags: ['ministry', 'documents'] },
  { floor: 30, resourceId: 'paper', multiplier: 1.28, reason: 'ministry_paper_queue', tags: ['ministry', 'paper'] },
  { floor: 30, resourceId: 'medicine', multiplier: 1.12, reason: 'ministry_clinic_queue', tags: ['ministry', 'medicine'] },
  { floor: 30, resourceId: 'food', multiplier: 1.10, reason: 'ministry_canteen_queue', tags: ['ministry', 'food'] },

  { floor: 14, resourceId: 'drink_water', multiplier: 1.34, reason: 'kvartiry_water_queue', tags: ['kvartiry', 'water'] },
  { floor: 14, resourceId: 'food', multiplier: 1.24, reason: 'kvartiry_food_queue', tags: ['kvartiry', 'food'] },
  { floor: 14, resourceId: 'medicine', multiplier: 1.18, reason: 'kvartiry_medicine_queue', tags: ['kvartiry', 'medicine'] },

  { floor: 0, resourceId: 'food', multiplier: 1.08, reason: 'living_food_baseline', tags: ['living', 'food'] },
  { floor: 0, resourceId: 'contraband', multiplier: 1.12, reason: 'living_contraband_appetite', tags: ['living', 'contraband'] },

  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'slime_samples', multiplier: 1.42, reason: 'market88_sample_buyer', tags: ['market88', 'sample', 'black_market'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'contraband', multiplier: 1.34, reason: 'market88_contraband_layer', tags: ['market88', 'contraband', 'govnyak'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'zhelemish', multiplier: 1.24, reason: 'market88_zhelemish_counter', tags: ['market88', 'zhelemish', 'reagent'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'documents', multiplier: 1.22, reason: 'market88_document_booth', tags: ['market88', 'documents', 'forgery'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'paper', multiplier: 1.14, reason: 'market88_blank_forms', tags: ['market88', 'paper', 'forms'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'ammo', multiplier: 1.18, reason: 'market88_quiet_ammo', tags: ['market88', 'ammo', 'weapons'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'medicine', multiplier: 1.16, reason: 'market88_under_counter_medicine', tags: ['market88', 'medicine'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'tools', multiplier: 1.12, reason: 'market88_filter_hatch', tags: ['market88', 'production', 'filters'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'electronics', multiplier: 1.10, reason: 'market88_floor69_parts', tags: ['market88', 'production', 'floor_69'] },
  { floor: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'industrial_slurry', multiplier: 1.08, reason: 'market88_production_scrap', tags: ['market88', 'production'] },

  { floor: -26, resourceId: 'metal', multiplier: 1.12, reason: 'maintenance_repair_demand', tags: ['maintenance', 'metal'] },
  { floor: -26, resourceId: 'tools', multiplier: 1.10, reason: 'maintenance_tool_demand', tags: ['maintenance', 'tools'] },
  { floor: -26, resourceId: 'fuel', multiplier: 1.22, reason: 'maintenance_fuel_demand', tags: ['maintenance', 'fuel'] },
  { floor: -26, resourceId: 'electronics', multiplier: 1.18, reason: 'maintenance_electronics_demand', tags: ['maintenance', 'electronics'] },

  { floor: -36, resourceId: 'medicine', multiplier: 1.34, reason: 'hell_trauma_demand', tags: ['hell', 'medicine'] },
  { floor: -36, resourceId: 'psi', multiplier: 1.30, reason: 'hell_psi_demand', tags: ['hell', 'psi'] },
  { floor: -36, resourceId: 'fuel', multiplier: 1.18, reason: 'hell_burn_demand', tags: ['hell', 'fuel'] },

  { floor: -50, resourceId: 'psi', multiplier: 1.42, reason: 'void_psi_demand', tags: ['void', 'psi'] },
  { floor: -50, resourceId: 'electronics', multiplier: 1.22, reason: 'void_signal_demand', tags: ['void', 'electronics'] },
  { floor: -50, resourceId: 'documents', multiplier: 1.18, reason: 'void_record_demand', tags: ['void', 'documents'] },
];

export const ECONOMY_TARIFF_RULES: readonly EconomyTariffRule[] = [
  { floor: 30, resourceId: 'documents', multiplier: 1.08, reason: 'ministry_stamp_tariff', tags: ['tariff', 'stamp'] },
  { floor: 30, resourceId: 'paper', multiplier: 1.05, reason: 'ministry_form_tariff', tags: ['tariff', 'forms'] },
  { floor: 14, resourceId: 'drink_water', multiplier: 1.05, reason: 'kvartiry_queue_tariff', tags: ['tariff', 'ration'] },
  { floor: 14, resourceId: 'food', multiplier: 1.03, reason: 'kvartiry_ration_tariff', tags: ['tariff', 'ration'] },
  { floor: -26, resourceId: 'metal', multiplier: 0.84, reason: 'maintenance_local_scrap', tags: ['tariff', 'local_supply'] },
  { floor: -26, resourceId: 'tools', multiplier: 0.88, reason: 'maintenance_tool_exchange', tags: ['tariff', 'local_supply'] },
  { floor: -36, multiplier: 1.08, reason: 'hell_hazard_tariff', tags: ['tariff', 'hazard'] },
  { floor: -50, multiplier: 1.10, reason: 'void_anomaly_tariff', tags: ['tariff', 'anomaly'] },
];

export const DEFAULT_TRADE_SPREAD: EconomyTradeSpreadRule = {
  id: 'default',
  buyMultiplier: 1.15,
  sellMultiplier: 0.85,
  reason: 'default_trade_spread',
  tags: ['spread', 'default'],
};

export const ECONOMY_TRADE_SPREAD_RULES: readonly EconomyTradeSpreadRule[] = [
  {
    id: 'storekeeper',
    occupation: Occupation.STOREKEEPER,
    buyMultiplier: 1.12,
    sellMultiplier: 0.88,
    reason: 'storekeeper_spread',
    tags: ['spread', 'storekeeper'],
  },
  {
    id: 'wild_market',
    faction: Faction.WILD,
    buyMultiplier: 1.25,
    sellMultiplier: 0.72,
    reason: 'wild_market_spread',
    tags: ['spread', 'wild'],
  },
  {
    id: 'cult_buyer',
    faction: Faction.CULTIST,
    buyMultiplier: 1.20,
    sellMultiplier: 0.78,
    reason: 'cult_buyer_spread',
    tags: ['spread', 'cult'],
  },
  {
    id: 'liquidator_pressure',
    faction: Faction.LIQUIDATOR,
    buyMultiplier: 1.10,
    sellMultiplier: 0.75,
    reason: 'liquidator_pressure_spread',
    tags: ['spread', 'liquidator'],
  },
  {
    id: 'scientist_specimen',
    faction: Faction.SCIENTIST,
    buyMultiplier: 1.08,
    sellMultiplier: 0.92,
    reason: 'scientist_specimen_spread',
    tags: ['spread', 'scientist'],
  },
  {
    id: 'scientist_occupation',
    occupation: Occupation.SCIENTIST,
    buyMultiplier: 1.08,
    sellMultiplier: 0.92,
    reason: 'scientist_specimen_spread',
    tags: ['spread', 'scientist'],
  },
];
