import { Faction, Occupation } from '../core/types';
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

export const ECONOMY_ROUTE_BLACK_MARKET_88 = 'black_market_88';

export const BLACK_MARKET_88_ROUTE_RESOURCE_IDS = [
  'slime_samples',
  'contraband',
  'zhelemish',
  'documents',
  'paper',
  'food',
  'ammo',
  'medicine',
  'tools',
  'electronics',
  'industrial_slurry',
  'psi',
] as const;

export const ECONOMY_DEMAND_RULES: readonly EconomyDemandRule[] = [
  { z: z.MINISTRY, resourceId: 'documents', multiplier: 1.36, reason: 'ministry_document_demand', tags: ['ministry', 'documents'] },
  { z: z.MINISTRY, resourceId: 'paper', multiplier: 1.28, reason: 'ministry_paper_queue', tags: ['ministry', 'paper'] },
  { z: z.MINISTRY, resourceId: 'medicine', multiplier: 1.12, reason: 'ministry_clinic_queue', tags: ['ministry', 'medicine'] },
  { z: z.MINISTRY, resourceId: 'food', multiplier: 1.10, reason: 'ministry_canteen_queue', tags: ['ministry', 'food'] },

  { z: z.KVARTIRY, resourceId: 'drink_water', multiplier: 1.34, reason: 'kvartiry_water_queue', tags: ['kvartiry', 'water'] },
  { z: z.KVARTIRY, resourceId: 'food', multiplier: 1.24, reason: 'kvartiry_food_queue', tags: ['kvartiry', 'food'] },
  { z: z.KVARTIRY, resourceId: 'medicine', multiplier: 1.18, reason: 'kvartiry_medicine_queue', tags: ['kvartiry', 'medicine'] },

  { z: z.LIVING, resourceId: 'food', multiplier: 1.08, reason: 'living_food_baseline', tags: ['living', 'food'] },
  { z: z.LIVING, resourceId: 'contraband', multiplier: 1.12, reason: 'living_contraband_appetite', tags: ['living', 'contraband'] },

  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'slime_samples', multiplier: 1.42, reason: 'market88_sample_buyer', tags: ['market88', 'sample', 'black_market'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'contraband', multiplier: 1.34, reason: 'market88_contraband_layer', tags: ['market88', 'contraband', 'govnyak'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'zhelemish', multiplier: 1.24, reason: 'market88_zhelemish_counter', tags: ['market88', 'zhelemish', 'reagent'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'documents', multiplier: 1.22, reason: 'market88_document_booth', tags: ['market88', 'documents', 'forgery'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'paper', multiplier: 1.14, reason: 'market88_blank_forms', tags: ['market88', 'paper', 'forms'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'ammo', multiplier: 1.18, reason: 'market88_quiet_ammo', tags: ['market88', 'ammo', 'weapons'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'medicine', multiplier: 1.16, reason: 'market88_under_counter_medicine', tags: ['market88', 'medicine'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'tools', multiplier: 1.12, reason: 'market88_filter_hatch', tags: ['market88', 'production', 'filters'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'electronics', multiplier: 1.10, reason: 'market88_floor69_parts', tags: ['market88', 'production', 'floor_69'] },
  { z: ECONOMY_ROUTE_BLACK_MARKET_88, resourceId: 'industrial_slurry', multiplier: 1.08, reason: 'market88_production_scrap', tags: ['market88', 'production'] },

  { z: z.MAINTENANCE, resourceId: 'metal', multiplier: 1.12, reason: 'maintenance_repair_demand', tags: ['maintenance', 'metal'] },
  { z: z.MAINTENANCE, resourceId: 'tools', multiplier: 1.10, reason: 'maintenance_tool_demand', tags: ['maintenance', 'tools'] },
  { z: z.MAINTENANCE, resourceId: 'fuel', multiplier: 1.22, reason: 'maintenance_fuel_demand', tags: ['maintenance', 'fuel'] },
  { z: z.MAINTENANCE, resourceId: 'electronics', multiplier: 1.18, reason: 'maintenance_electronics_demand', tags: ['maintenance', 'electronics'] },

  { z: z.HELL, resourceId: 'medicine', multiplier: 1.34, reason: 'hell_trauma_demand', tags: ['hell', 'medicine'] },
  { z: z.HELL, resourceId: 'psi', multiplier: 1.30, reason: 'hell_psi_demand', tags: ['hell', 'psi'] },
  { z: z.HELL, resourceId: 'fuel', multiplier: 1.18, reason: 'hell_burn_demand', tags: ['hell', 'fuel'] },

  { z: z.VOID, resourceId: 'psi', multiplier: 1.42, reason: 'void_psi_demand', tags: ['void', 'psi'] },
  { z: z.VOID, resourceId: 'electronics', multiplier: 1.22, reason: 'void_signal_demand', tags: ['void', 'electronics'] },
  { z: z.VOID, resourceId: 'documents', multiplier: 1.18, reason: 'void_record_demand', tags: ['void', 'documents'] },
];

export const ECONOMY_ROUTE_DECISION_RULES: readonly EconomyRouteDecisionRule[] = [
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    id: 'sell_sample',
    label: 'Сдать пробу или контрабанду',
    heatDelta: 4,
    trustDelta: 1,
    debtDelta: -6,
    demandDelta: 0.06,
    severity: 3,
    rumorIds: ['market88_white_sample_no_lamp', 'market88_nii_receipt_silver', 'govnyak_trade', 'faction_scientist_zhelemish_sample'],
    tags: ['market88', 'sale', 'sample', 'contraband'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    id: 'pay_debt',
    label: 'Погасить долг',
    heatDelta: -5,
    trustDelta: 1,
    debtDelta: -88,
    demandDelta: -0.04,
    severity: 2,
    rumorIds: ['smoking_debt_notebook', 'floor69_market88_line'],
    tags: ['market88', 'debt', 'payment'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    id: 'steal',
    label: 'Украсть из рыночного ящика',
    heatDelta: 18,
    trustDelta: -2,
    debtDelta: 32,
    demandDelta: 0.08,
    severity: 5,
    rumorIds: ['container_black_market_88_locker', 'market88_cold_storage_theft'],
    tags: ['market88', 'theft', 'debt'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    id: 'risky_job',
    label: 'Взять опасную работу',
    heatDelta: 8,
    trustDelta: 1,
    debtDelta: 12,
    demandDelta: 0.05,
    severity: 4,
    rumorIds: ['contract_black_market_88_counter', 'contract_scarcity_pressure'],
    tags: ['market88', 'contract', 'risk'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    id: 'report',
    label: 'Сдать рынок или улику',
    heatDelta: 14,
    trustDelta: -2,
    debtDelta: -24,
    demandDelta: -0.06,
    severity: 4,
    rumorIds: ['event_govnyak_den_report', 'market88_liquidator_protection_token'],
    tags: ['market88', 'report', 'authority'],
  },
];

export const ECONOMY_ROUTE_SAMOSBOR_DEMAND_RULES: readonly EconomyRouteSamosborDemandRule[] = [
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    variantId: 'classic',
    heatDelta: 4,
    resourcePressure: [
      { resourceId: 'ammo', multiplier: 1.20, reason: 'classic_samosbor_ammo_bid', tags: ['samosbor', 'classic', 'ammo'] },
      { resourceId: 'medicine', multiplier: 1.18, reason: 'classic_samosbor_medicine_bid', tags: ['samosbor', 'classic', 'medicine'] },
    ],
    rumorIds: ['economy_black_market_88_medicine', 'contract_scarcity_pressure'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    variantId: 'wet',
    heatDelta: 3,
    resourcePressure: [
      { resourceId: 'tools', multiplier: 1.22, reason: 'wet_samosbor_filter_bid', tags: ['samosbor', 'wet', 'filters'] },
      { resourceId: 'food', multiplier: 1.12, reason: 'wet_samosbor_dry_food_bid', tags: ['samosbor', 'wet', 'dry_food'] },
    ],
    rumorIds: ['samosbor_wet_variant', 'market88_filter_stall_route'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    variantId: 'electric',
    heatDelta: 5,
    resourcePressure: [
      { resourceId: 'electronics', multiplier: 1.24, reason: 'electric_samosbor_battery_bid', tags: ['samosbor', 'electric', 'battery'] },
      { resourceId: 'ammo', multiplier: 1.10, reason: 'electric_samosbor_energy_ammo', tags: ['samosbor', 'electric', 'ammo'] },
    ],
    rumorIds: ['samosbor_electric_variant', 'market88_floor69_fuse_flip'],
  },
  {
    routeId: ECONOMY_ROUTE_BLACK_MARKET_88,
    variantId: 'meat',
    heatDelta: 10,
    resourcePressure: [
      { resourceId: 'zhelemish', multiplier: 1.22, reason: 'meat_samosbor_cult_reagent_bid', tags: ['samosbor', 'meat', 'zhelemish'] },
      { resourceId: 'contraband', multiplier: 1.16, reason: 'meat_samosbor_cult_trade', tags: ['samosbor', 'meat', 'contraband'] },
      { resourceId: 'psi', multiplier: 1.12, reason: 'meat_samosbor_psi_bid', tags: ['samosbor', 'meat', 'psi'] },
    ],
    rumorIds: ['samosbor_meat_variant', 'faction_cult_zhelemish_first_gift'],
  },
];

export const ECONOMY_TARIFF_RULES: readonly EconomyTariffRule[] = [
  { z: z.MINISTRY, resourceId: 'documents', multiplier: 1.08, reason: 'ministry_stamp_tariff', tags: ['tariff', 'stamp'] },
  { z: z.MINISTRY, resourceId: 'paper', multiplier: 1.05, reason: 'ministry_form_tariff', tags: ['tariff', 'forms'] },
  { z: z.KVARTIRY, resourceId: 'drink_water', multiplier: 1.05, reason: 'kvartiry_queue_tariff', tags: ['tariff', 'ration'] },
  { z: z.KVARTIRY, resourceId: 'food', multiplier: 1.03, reason: 'kvartiry_ration_tariff', tags: ['tariff', 'ration'] },
  { z: z.MAINTENANCE, resourceId: 'metal', multiplier: 0.84, reason: 'maintenance_local_scrap', tags: ['tariff', 'local_supply'] },
  { z: z.MAINTENANCE, resourceId: 'tools', multiplier: 0.88, reason: 'maintenance_tool_exchange', tags: ['tariff', 'local_supply'] },
  { z: z.HELL, multiplier: 1.08, reason: 'hell_hazard_tariff', tags: ['tariff', 'hazard'] },
  { z: z.VOID, multiplier: 1.10, reason: 'void_anomaly_tariff', tags: ['tariff', 'anomaly'] },
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
