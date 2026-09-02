import { Entity, GameState, Item } from '../core/types';
import { ITEMS } from '../data/catalog';
import { type EconomyFloorRef } from '../data/economy_rules';
import { MAX_INVENTORY_SLOTS } from '../data/inventory_limits';
import { addItem, reconcileEquippedAfterLoss } from './inventory';
import {
  changeResourceStock,
  getEconomyQuote,
  primeTradePriceCache,
  type EconomyQuote,
  type EconomyQuoteOptions,
} from './economy';
import { publishEvent } from './events';

export type TradeResultCode =
  | 'bought'
  | 'sold'
  | 'handoff'
  | 'deal_done'
  | 'offer_added'
  | 'offer_removed'
  | 'offer_full'
  | 'ask_added'
  | 'ask_removed'
  | 'ask_full'
  | 'no_item'
  | 'player_no_money'
  | 'player_no_space'
  | 'npc_no_money'
  | 'npc_no_space';

export interface TradeCreditSummary {
  creditValue: number;
  creditCount: number;
  fullPrice: number;
  cashDue: number;
  changeDue: number;
  surplus: number;
  npcOfferValue?: number;
  npcOfferCount?: number;
}

export interface TradeResult {
  ok: boolean;
  code: TradeResultCode;
  defId?: string;
  price?: number;
  quote?: EconomyQuote;
  credit?: TradeCreditSummary;
}

export interface TradeOptions {
  floor?: EconomyFloorRef;
  stockFloor?: number;
  zoneId?: number;
  tariffMultiplier?: number;
  tags?: readonly string[];
  reason?: string;
}

interface TradeOfferSession {
  playerOffer: Item[];
  npcOffer: Item[];
}

/** A deal is a handful of stacks, not a second inventory: the basket holds a
 *  quarter of an inventory, which is exactly what the trade table can show. A
 *  staged item the player cannot see is a staged item they cannot take back. */
export const TRADE_OFFER_SLOT_CAP = MAX_INVENTORY_SLOTS / 4;

const tradeOfferSessions = new WeakMap<GameState, TradeOfferSession>();

function tradeOfferSession(state: GameState): TradeOfferSession {
  let session = tradeOfferSessions.get(state);
  if (!session) {
    session = { playerOffer: [], npcOffer: [] };
    tradeOfferSessions.set(state, session);
  }
  return session;
}

export function clearTradeOffers(state: GameState): void {
  const session = tradeOfferSessions.get(state);
  if (!session) return;
  session.playerOffer.length = 0;
  session.npcOffer.length = 0;
}

export function getTradeOffer(state: GameState): readonly Item[] {
  return tradeOfferSession(state).playerOffer;
}

export function getTradeNpcOffer(state: GameState): readonly Item[] {
  return tradeOfferSession(state).npcOffer;
}

function mutableTradeOffer(state: GameState): Item[] {
  return tradeOfferSession(state).playerOffer;
}

function mutableTradeNpcOffer(state: GameState): Item[] {
  return tradeOfferSession(state).npcOffer;
}

function quoteOptions(npc: Entity, opts: TradeOptions): EconomyQuoteOptions {
  return {
    floor: opts.floor,
    stockFloor: opts.stockFloor,
    trader: npc,
    tariffMultiplier: opts.tariffMultiplier,
    tags: opts.tags,
    reason: opts.reason,
  };
}

function stockFloorForTrade(state: GameState, opts: TradeOptions): number {
  if (opts.stockFloor !== undefined) return opts.stockFloor;
  return typeof opts.floor === 'number' ? opts.floor : state.currentZ;
}

function sameItemData(a: unknown, b: unknown): boolean {
  return a === b;
}

function sameOfferItem(slot: Item, item: Pick<Item, 'defId' | 'data'>): boolean {
  return slot.defId === item.defId && sameItemData(slot.data, item.data);
}

function itemCount(inventory: readonly Item[] | undefined, item: Pick<Item, 'defId' | 'data'>): number {
  let total = 0;
  for (const slot of inventory ?? []) {
    if (sameOfferItem(slot, item)) total += Math.max(0, slot.count);
  }
  return total;
}

function offerCount(offer: readonly Item[], item: Pick<Item, 'defId' | 'data'>): number {
  return itemCount(offer, item);
}

function totalOfferCount(offer: readonly Item[]): number {
  let total = 0;
  for (const item of offer) total += Math.max(0, item.count);
  return total;
}

function cloneInventory(inventory: readonly Item[] | undefined): Item[] {
  return (inventory ?? []).map(item => ({ ...item }));
}

function addToOffer(offer: Item[], source: Item): boolean {
  const existing = offer.find(slot => sameOfferItem(slot, source));
  if (existing) {
    existing.count++;
    return true;
  }
  if (offer.length >= TRADE_OFFER_SLOT_CAP) return false;
  const item: Item = { defId: source.defId, count: 1 };
  if (source.data !== undefined) item.data = source.data;
  offer.push(item);
  return true;
}

function removeOfferUnit(offer: Item[], slotIndex: number): Item | undefined {
  const slot = offer[slotIndex];
  if (!slot || slot.count <= 0) return undefined;
  const removed: Item = { defId: slot.defId, count: 1 };
  if (slot.data !== undefined) removed.data = slot.data;
  slot.count--;
  if (slot.count <= 0) offer.splice(slotIndex, 1);
  return removed;
}

function hasInventoryItems(inventory: readonly Item[] | undefined, items: readonly Item[]): boolean {
  for (const item of items) {
    if (item.count <= 0) continue;
    if (itemCount(inventory, item) < item.count) return false;
  }
  return true;
}

function removeInventoryItems(inventory: Item[], items: readonly Item[]): boolean {
  if (!hasInventoryItems(inventory, items)) return false;
  for (const item of items) {
    let remaining = item.count;
    for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = inventory[i];
      if (!sameOfferItem(slot, item)) continue;
      const taken = Math.min(remaining, slot.count);
      slot.count -= taken;
      remaining -= taken;
      if (slot.count <= 0) inventory.splice(i, 1);
    }
  }
  return true;
}

function canReceiveAll(receiver: Entity, inventoryAfterOutgoing: readonly Item[], incoming: readonly Item[]): boolean {
  const probe: Entity = { ...receiver, inventory: cloneInventory(inventoryAfterOutgoing) };
  for (const item of incoming) {
    if (item.count <= 0) continue;
    if (!addItem(probe, item.defId, item.count, item.data)) return false;
  }
  return true;
}

function itemListForEvent(items: readonly Item[]): { id: string; count: number }[] {
  return items
    .filter(item => item.count > 0)
    .slice(0, TRADE_OFFER_SLOT_CAP)
    .map(item => ({ id: item.defId, count: item.count }));
}

function tradeCreditUnitQuote(
  state: GameState,
  npc: Entity,
  item: Pick<Item, 'defId'>,
  opts: TradeOptions,
): EconomyQuote {
  return getEconomyQuote(state, item.defId, quoteOptions(npc, opts));
}

function tradeCreditUnitValue(
  state: GameState,
  npc: Entity,
  item: Pick<Item, 'defId'>,
  opts: TradeOptions,
): number {
  return tradeCreditUnitQuote(state, npc, item, opts).sellPrice;
}

function tradeAskUnitValue(
  state: GameState,
  npc: Entity,
  item: Pick<Item, 'defId'>,
  opts: TradeOptions,
): number {
  return getEconomyQuote(state, item.defId, quoteOptions(npc, opts)).buyPrice;
}

function offerValue(
  state: GameState,
  npc: Entity,
  offer: readonly Item[],
  opts: TradeOptions,
): number {
  let total = 0;
  for (const item of offer) {
    if (item.count <= 0) continue;
    total += tradeCreditUnitValue(state, npc, item, opts) * item.count;
  }
  return total;
}

function askValue(
  state: GameState,
  npc: Entity,
  offer: readonly Item[],
  opts: TradeOptions,
): number {
  let total = 0;
  for (const item of offer) {
    if (item.count <= 0) continue;
    total += tradeAskUnitValue(state, npc, item, opts) * item.count;
  }
  return total;
}

function tradeSummaryFromOffers(
  state: GameState,
  npc: Entity,
  playerOffer: readonly Item[],
  npcOffer: readonly Item[],
  opts: TradeOptions,
): TradeCreditSummary {
  const creditValue = offerValue(state, npc, playerOffer, opts);
  const fullPrice = askValue(state, npc, npcOffer, opts);
  const surplus = Math.max(0, creditValue - fullPrice);
  return {
    creditValue,
    creditCount: totalOfferCount(playerOffer),
    fullPrice,
    cashDue: Math.max(0, fullPrice - creditValue),
    changeDue: Math.min(surplus, Math.max(0, npc.money ?? 0)),
    surplus,
    npcOfferValue: fullPrice,
    npcOfferCount: totalOfferCount(npcOffer),
  };
}

export function getTradeDealSummary(
  state: GameState,
  npc: Entity,
  opts: TradeOptions = {},
): TradeCreditSummary {
  return tradeSummaryFromOffers(state, npc, getTradeOffer(state), getTradeNpcOffer(state), opts);
}

export function getTradeCreditSummary(
  state: GameState,
  npc: Entity,
  buyDefId?: string,
  opts: TradeOptions = {},
): TradeCreditSummary {
  const playerOffer = getTradeOffer(state);
  const npcOffer: Item[] = [];
  if (buyDefId) npcOffer.push({ defId: buyDefId, count: 1 });
  return tradeSummaryFromOffers(state, npc, playerOffer, npcOffer, opts);
}

export function addTradeOfferFromSlot(
  state: GameState,
  player: Entity,
  npc: Entity,
  slotIndex: number,
  opts: TradeOptions = {},
): TradeResult {
  const inventory = player.inventory ?? [];
  const source = inventory[slotIndex];
  if (!source || source.count <= 0) return { ok: false, code: 'no_item' };

  const offer = mutableTradeOffer(state);
  const alreadyOffered = offerCount(offer, source);
  const available = itemCount(inventory, source) - alreadyOffered;
  if (available <= 0) return { ok: false, code: 'no_item', defId: source.defId };
  if (!addToOffer(offer, source)) return { ok: false, code: 'offer_full', defId: source.defId };

  const quote = tradeCreditUnitQuote(state, npc, source, opts);
  return {
    ok: true,
    code: 'offer_added',
    defId: source.defId,
    price: quote.sellPrice,
    quote,
    credit: getTradeCreditSummary(state, npc, undefined, opts),
  };
}

export function removeTradeOfferSlot(
  state: GameState,
  npc: Entity,
  slotIndex: number,
  opts: TradeOptions = {},
): TradeResult {
  const removed = removeOfferUnit(mutableTradeOffer(state), slotIndex);
  if (!removed) return { ok: false, code: 'no_item' };
  const quote = tradeCreditUnitQuote(state, npc, removed, opts);
  return {
    ok: true,
    code: 'offer_removed',
    defId: removed.defId,
    price: quote.sellPrice,
    quote,
    credit: getTradeCreditSummary(state, npc, undefined, opts),
  };
}

export function addTradeAskFromSlot(
  state: GameState,
  npc: Entity,
  slotIndex: number,
  opts: TradeOptions = {},
): TradeResult {
  const inventory = npc.inventory ?? [];
  const source = inventory[slotIndex];
  if (!source || source.count <= 0) return { ok: false, code: 'no_item' };

  const offer = mutableTradeNpcOffer(state);
  const alreadyOffered = offerCount(offer, source);
  const available = itemCount(inventory, source) - alreadyOffered;
  if (available <= 0) return { ok: false, code: 'no_item', defId: source.defId };
  if (!addToOffer(offer, source)) return { ok: false, code: 'ask_full', defId: source.defId };

  const quote = tradeCreditUnitQuote(state, npc, source, opts);
  return {
    ok: true,
    code: 'ask_added',
    defId: source.defId,
    price: quote.buyPrice,
    quote,
    credit: getTradeDealSummary(state, npc, opts),
  };
}

export function removeTradeAskSlot(
  state: GameState,
  npc: Entity,
  slotIndex: number,
  opts: TradeOptions = {},
): TradeResult {
  const removed = removeOfferUnit(mutableTradeNpcOffer(state), slotIndex);
  if (!removed) return { ok: false, code: 'no_item' };
  const quote = tradeCreditUnitQuote(state, npc, removed, opts);
  return {
    ok: true,
    code: 'ask_removed',
    defId: removed.defId,
    price: quote.buyPrice,
    quote,
    credit: getTradeDealSummary(state, npc, opts),
  };
}

function applyTradeCreditStockDeltas(
  state: GameState,
  npc: Entity,
  playerOffer: readonly Item[],
  opts: TradeOptions,
): void {
  const floor = stockFloorForTrade(state, opts);
  for (const item of playerOffer) {
    const quote = getEconomyQuote(state, item.defId, quoteOptions(npc, opts));
    if (quote.resourceId) changeResourceStock(state, quote.resourceId, item.count, floor);
  }
}

function applyTradeAskStockDeltas(
  state: GameState,
  npc: Entity,
  npcOffer: readonly Item[],
  opts: TradeOptions,
): void {
  const floor = stockFloorForTrade(state, opts);
  for (const item of npcOffer) {
    const quote = getEconomyQuote(state, item.defId, quoteOptions(npc, opts));
    if (quote.resourceId) changeResourceStock(state, quote.resourceId, -item.count, floor);
  }
}

function combinedQuoteTags(quotes: readonly EconomyQuote[]): string[] {
  const tags = new Set<string>();
  for (const quote of quotes) for (const tag of quote.tags) tags.add(tag);
  return [...tags];
}

function publishTradeDealEvent(
  state: GameState,
  player: Entity,
  npc: Entity,
  price: number,
  summary: TradeCreditSummary,
  playerOffer: readonly Item[],
  npcOffer: readonly Item[],
  quotes: readonly EconomyQuote[],
  zoneId?: number,
): void {
  const firstAsk = npcOffer.find(item => item.count > 0);
  const defId = firstAsk?.defId ?? playerOffer.find(item => item.count > 0)?.defId ?? '';
  const def = defId ? ITEMS[defId] : undefined;
  const hasCredit = summary.creditCount > 0;
  publishEvent(state, {
    type: 'player_handoff_item',
    zoneId,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    targetId: npc.id,
    targetName: npc.name,
    targetFaction: npc.faction,
    itemId: defId || undefined,
    itemName: def ? def.name : defId || undefined,
    itemCount: totalOfferCount(npcOffer) > 0 ? totalOfferCount(npcOffer) : totalOfferCount(playerOffer),
    itemValue: totalOfferCount(npcOffer) > 0 ? summary.fullPrice : summary.creditValue,
    severity: 1,
    privacy: 'private',
    tags: [
      'player',
      'inventory',
      'trade',
      ...(totalOfferCount(npcOffer) > 0 ? ['buy'] : ['sell']),
      ...(hasCredit ? ['barter'] : []),
      ...(totalOfferCount(npcOffer) > 1 ? ['bundle'] : []),
      ...combinedQuoteTags(quotes),
    ],
    data: {
      price,
      cashPaid: price,
      cashReceived: summary.changeDue,
      netCashPaid: price - summary.changeDue,
      direction: totalOfferCount(npcOffer) > 0 ? 'npc_to_player' : 'player_to_npc',
      creditValue: summary.creditValue,
      creditCount: summary.creditCount,
      creditSurplus: summary.surplus,
      unpaidSurplus: Math.max(0, summary.surplus - summary.changeDue),
      creditItems: itemListForEvent(playerOffer),
      askValue: summary.fullPrice,
      askCount: totalOfferCount(npcOffer),
      unitPrice: summary.fullPrice,
      totalPrice: summary.fullPrice,
      askItems: itemListForEvent(npcOffer),
      sellerId: npc.id,
      sellerName: npc.name,
      buyerId: player.id,
      buyerName: player.name,
      quoteTags: combinedQuoteTags(quotes),
    },
  });
}

export function executeTradeDeal(
  state: GameState,
  player: Entity,
  npc: Entity,
  opts: TradeOptions = {},
): TradeResult {
  const playerOffer = cloneInventory(getTradeOffer(state));
  const npcOffer = cloneInventory(getTradeNpcOffer(state));
  const summary = tradeSummaryFromOffers(state, npc, playerOffer, npcOffer, opts);
  const firstAsk = npcOffer.find(item => item.count > 0);
  const firstOffer = playerOffer.find(item => item.count > 0);
  const firstItem = firstAsk ?? firstOffer;
  if (!firstItem) return { ok: false, code: 'no_item', price: summary.cashDue, credit: summary };
  if ((player.money ?? 0) < summary.cashDue) {
    return { ok: false, code: 'player_no_money', defId: firstItem.defId, price: summary.cashDue, credit: summary };
  }
  if (!hasInventoryItems(player.inventory, playerOffer) || !hasInventoryItems(npc.inventory, npcOffer)) {
    clearTradeOffers(state);
    return { ok: false, code: 'no_item', defId: firstItem.defId, price: summary.cashDue, credit: getTradeDealSummary(state, npc, opts) };
  }

  const playerAfterOutgoing = cloneInventory(player.inventory);
  const npcAfterOutgoing = cloneInventory(npc.inventory);
  if (!removeInventoryItems(playerAfterOutgoing, playerOffer) || !removeInventoryItems(npcAfterOutgoing, npcOffer)) {
    clearTradeOffers(state);
    return { ok: false, code: 'no_item', defId: firstItem.defId, price: summary.cashDue, credit: getTradeDealSummary(state, npc, opts) };
  }
  if (!canReceiveAll(player, playerAfterOutgoing, npcOffer)) {
    return { ok: false, code: 'player_no_space', defId: firstItem.defId, price: summary.cashDue, credit: summary };
  }
  if (!canReceiveAll(npc, npcAfterOutgoing, playerOffer)) {
    return { ok: false, code: 'npc_no_space', defId: firstItem.defId, price: summary.cashDue, credit: summary };
  }

  if (!player.inventory) player.inventory = [];
  if (!npc.inventory) npc.inventory = [];
  removeInventoryItems(player.inventory, playerOffer);
  removeInventoryItems(npc.inventory, npcOffer);
  for (const item of npcOffer) addItem(player, item.defId, item.count, item.data);
  for (const item of playerOffer) addItem(npc, item.defId, item.count, item.data);
  reconcileEquippedAfterLoss(player, playerOffer.map(i => i.defId));
  reconcileEquippedAfterLoss(npc, npcOffer.map(i => i.defId));
  player.money = (player.money ?? 0) - summary.cashDue + summary.changeDue;
  npc.money = (npc.money ?? 0) + summary.cashDue - summary.changeDue;
  applyTradeAskStockDeltas(state, npc, npcOffer, opts);
  applyTradeCreditStockDeltas(state, npc, playerOffer, opts);
  const quotes = [...npcOffer, ...playerOffer].map(item => getEconomyQuote(state, item.defId, quoteOptions(npc, opts)));
  publishTradeDealEvent(state, player, npc, summary.cashDue, summary, playerOffer, npcOffer, quotes, opts.zoneId);
  clearTradeOffers(state);
  primeTradePriceCache(state, [npc.inventory, player.inventory]);
  return { ok: true, code: 'deal_done', defId: firstItem.defId, price: summary.cashDue, quote: quotes[0], credit: summary };
}
