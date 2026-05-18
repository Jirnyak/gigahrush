import {
  type Entity,
  type GameState,
  type Item,
  type ItemDef,
  type RPGStats,
  Faction,
  FloorLevel,
  Occupation,
} from '../core/types';
import { ITEMS } from '../data/catalog';
import { type EconomyState, createEconomyFloorState, createEconomyState, normalizeEconomyState } from '../data/economy';
import { isSilverSlimeItem, SILVER_SLIME_SEALED_ID } from '../data/items';
import { RESOURCES, resourceForItem, resourceForItemType } from '../data/resources';
import { publishEvent } from './events';
import { isGovnyakItem } from './govnyak';
import { intContractRewardMult } from './rpg';

type EconomyGameState = GameState & { economy?: EconomyState };
type CachedPrice = { price: number; multiplier: number };
type PriceCache = { floor: FloorLevel; version: number; items: Map<string, CachedPrice> };

const priceCaches = new WeakMap<GameState, PriceCache>();

function isEconomyState(value: unknown): value is EconomyState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EconomyState>;
  return typeof candidate.priceVersion === 'number'
    && !!candidate.floors
    && typeof candidate.floors === 'object';
}

export function ensureEconomyState(state: GameState): EconomyState {
  const econState = state as EconomyGameState;
  if (!isEconomyState(econState.economy)) {
    econState.economy = normalizeEconomyState(econState.economy ?? createEconomyState());
    priceCaches.delete(state);
  }
  if (!econState.economy.floors[state.currentFloor]) {
    econState.economy.floors[state.currentFloor] = createEconomyFloorState(state.currentFloor);
  }
  return econState.economy;
}

export function normalizeGameEconomy(state: GameState, saved: unknown): void {
  const econState = state as EconomyGameState;
  econState.economy = normalizeEconomyState(saved);
  priceCaches.delete(state);
  if (!econState.economy.floors[state.currentFloor]) {
    econState.economy.floors[state.currentFloor] = createEconomyFloorState(state.currentFloor);
  }
}

export function economyForSave(state: GameState): EconomyState {
  return ensureEconomyState(state);
}

export function getResourceScarcity(state: GameState, resourceId: string, floor: FloorLevel = state.currentFloor): number {
  const econ = ensureEconomyState(state);
  const floorState = econ.floors[floor] ?? createEconomyFloorState(floor);
  econ.floors[floor] = floorState;
  const res = RESOURCES.find(r => r.id === resourceId);
  const stock = floorState.resources[resourceId];
  if (!res || !stock) return 1;
  return Math.max(0.25, Math.min(4, stock.target / Math.max(1, stock.stock)));
}

export function changeResourceStock(state: GameState, resourceId: string, delta: number, floor: FloorLevel = state.currentFloor): boolean {
  const econ = ensureEconomyState(state);
  const floorState = econ.floors[floor] ?? createEconomyFloorState(floor);
  econ.floors[floor] = floorState;
  const stock = floorState.resources[resourceId];
  if (!stock) return false;
  const next = Math.max(0, Math.min(stock.target * 2, stock.stock + delta));
  stock.lastDelta = next - stock.stock;
  stock.stock = next;
  if (stock.lastDelta !== 0) econ.priceVersion++;
  floorState.lastTickAt = state.time;
  return true;
}

export function canSpendResources(state: GameState, inputs: { id: string; count: number }[], floor: FloorLevel = state.currentFloor): boolean {
  const econ = ensureEconomyState(state);
  const floorState = econ.floors[floor] ?? createEconomyFloorState(floor);
  econ.floors[floor] = floorState;
  for (const i of inputs) {
    const stock = floorState.resources[i.id];
    if (!stock || stock.stock < i.count) return false;
  }
  return true;
}

export function spendResources(state: GameState, inputs: { id: string; count: number }[], floor: FloorLevel = state.currentFloor): boolean {
  if (!canSpendResources(state, inputs, floor)) return false;
  for (const i of inputs) changeResourceStock(state, i.id, -i.count, floor);
  return true;
}

function priceCacheFor(state: GameState): PriceCache {
  const econ = ensureEconomyState(state);
  let cache = priceCaches.get(state);
  if (!cache || cache.floor !== state.currentFloor || cache.version !== econ.priceVersion) {
    cache = { floor: state.currentFloor, version: econ.priceVersion, items: new Map() };
    priceCaches.set(state, cache);
  }
  return cache;
}

function computeItemPriceMultiplier(state: GameState, defId: string): number {
  const def = ITEMS[defId];
  if (!def) return 1;
  const resource = resourceForItem(defId) ?? resourceForItemType(def.type);
  if (!resource) return 1;
  return getResourceScarcity(state, resource.id);
}

function cachedItemPrice(state: GameState, defId: string): CachedPrice {
  const cache = priceCacheFor(state);
  const cached = cache.items.get(defId);
  if (cached) return cached;
  const def = ITEMS[defId] as ItemDef | undefined;
  if (!def) return { price: 0, multiplier: 1 };
  const multiplier = computeItemPriceMultiplier(state, defId);
  const price = Math.max(1, Math.round((def.value ?? 0) * multiplier));
  const next = { price, multiplier };
  cache.items.set(defId, next);
  return next;
}

export function primeTradePriceCache(state: GameState, inventories: readonly (readonly Item[] | undefined)[]): void {
  for (const inv of inventories) {
    if (!inv) continue;
    for (const item of inv) cachedItemPrice(state, item.defId);
  }
}

export function getItemPriceMultiplier(state: GameState, defId: string): number {
  return cachedItemPrice(state, defId).multiplier;
}

export function getAdjustedItemPrice(state: GameState, defId: string): number {
  return cachedItemPrice(state, defId).price;
}

export function recordPlayerItemSale(
  state: GameState,
  seller: Entity,
  buyer: Entity,
  defId: string,
  count: number,
  unitPrice: number,
  zoneId?: number,
): void {
  const def = ITEMS[defId];
  const silver = isSilverSlimeItem(defId);
  const govnyak = isGovnyakItem(defId);
  const scienceBuyer = buyer.faction === Faction.SCIENTIST || buyer.occupation === Occupation.SCIENTIST;
  const blackMarketBuyer = buyer.occupation === Occupation.STOREKEEPER
    || buyer.faction === Faction.WILD
    || buyer.faction === Faction.CULTIST;
  const liquidatorConfiscation = govnyak && buyer.faction === Faction.LIQUIDATOR;
  const sealedScienceHandoff = silver && defId === SILVER_SLIME_SEALED_ID && scienceBuyer;
  const outcome = sealedScienceHandoff
    ? 'science_handoff'
    : silver && blackMarketBuyer ? 'black_market_sale'
      : silver ? 'cash_sale'
        : liquidatorConfiscation ? 'confiscation'
          : govnyak && blackMarketBuyer ? 'contraband_sale'
            : govnyak ? 'pressure_sale'
              : 'sale';
  publishEvent(state, {
    type: sealedScienceHandoff || liquidatorConfiscation ? 'player_handoff_item' : 'player_sell_item',
    zoneId,
    actorId: seller.id,
    actorName: seller.name ?? 'Вы',
    actorFaction: seller.faction,
    targetId: buyer.id,
    targetName: buyer.name,
    targetFaction: buyer.faction,
    itemId: defId,
    itemName: def?.name ?? defId,
    itemCount: count,
    itemValue: def?.value ?? 0,
    severity: silver ? 4 : govnyak ? liquidatorConfiscation ? 4 : 3 : 1,
    privacy: silver ? 'witnessed' : govnyak ? 'local' : 'private',
    tags: silver
      ? ['player', 'trade', 'slime', 'silver_slime', sealedScienceHandoff ? 'science' : blackMarketBuyer ? 'black_market' : 'cash', outcome]
      : govnyak
        ? ['player', 'trade', 'govnyak', 'contraband', liquidatorConfiscation ? 'confiscation' : blackMarketBuyer ? 'black_market' : 'cash', outcome]
      : ['player', 'trade', 'sale'],
    data: {
      unitPrice,
      totalPrice: unitPrice * count,
      outcome,
      rumorIds: silver
        ? [sealedScienceHandoff ? 'silver_slime_science_handoff' : 'silver_slime_sale_suspicion']
        : govnyak
          ? [liquidatorConfiscation ? 'govnyak_confiscation' : 'govnyak_trade']
        : undefined,
    },
  });
}

export function getScarcityAdjustedReward(
  state: GameState,
  resourceId: string,
  baseReward: number,
  floor: FloorLevel = state.currentFloor,
  maxMultiplier = 3,
  rpg?: RPGStats,
): number {
  const scarcity = getResourceScarcity(state, resourceId, floor);
  const multiplier = Math.min(maxMultiplier, Math.max(1, scarcity));
  const intMultiplier = rpg ? intContractRewardMult(rpg) : 1;
  return Math.max(1, Math.round(baseReward * multiplier * intMultiplier));
}

export function summarizeEconomy(state: GameState, limit = 8): string[] {
  const econ = ensureEconomyState(state);
  const floorState = econ.floors[state.currentFloor] ?? createEconomyFloorState(state.currentFloor);
  econ.floors[state.currentFloor] = floorState;
  return RESOURCES.slice(0, limit).map(r => {
    const stock = floorState.resources[r.id];
    const mult = getResourceScarcity(state, r.id);
    return `${r.name}: ${Math.round(stock.stock)}/${stock.target} x${mult.toFixed(2)}`;
  });
}
