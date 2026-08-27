import {
  type CraftingState,
  type Entity,
  type GameState,
  type MutableCraftVector,
  msg,
} from '../core/types';
import { ITEMS } from '../data/catalog';
import {
  CRAFT_MATERIAL_COUNT,
  CRAFT_MATERIAL_DEFS,
  CRAFT_MATERIAL_IDS,
  CRAFT_MATERIALS,
  craftMaterialIndex,
  craftVectorTotal,
  emptyCraftVector,
  isCraftMaterialId,
  type CraftMaterialId,
  type CraftStationKind,
  type CraftVector,
} from '../data/craft_materials';
import {
  CRAFT_RECIPES,
  craftRecipeById,
  craftRecipeByItemId,
  type CraftRecipeDef,
} from '../data/craft_recipes';
import {
  craftRecipeItemId,
  type CraftRecipeSourceDef,
} from '../data/craft_recipe_sources';
import { itemComposition } from '../data/item_composition';
import { addItem, canAddItem, reconcileEquippedAfterLoss } from './inventory';
import { publishEvent } from './events';
import { rng } from '../core/rand';

export type { CraftingState, MutableCraftVector };
export type { CraftMaterialId, CraftStationKind, CraftVector };

const MAX_CRAFT_MATERIAL = 999_999;
const MAX_KNOWN_RECIPES = 2048;

export interface CraftingSavePayload {
  materials: MutableCraftVector;
  knownRecipes: string[];
}

export interface CraftRecipeLearnResult {
  sourceId?: string;
  learned: string[];
  duplicate: string[];
  unknown: string[];
}

export type CraftFailureReason =
  | 'invalid_slot'
  | 'unknown_item'
  | 'no_composition'
  | 'invalid_station'
  | 'unknown_recipe'
  | 'recipe_not_learned'
  | 'station_mismatch'
  | 'insufficient_materials'
  | 'inventory_full'
  | 'inventory_remove_failed'
  | 'inventory_add_failed';

export interface CraftCheck {
  ok: boolean;
  reason?: CraftFailureReason;
  message: string;
  recipe?: CraftRecipeDef;
}

export interface CraftingActionContext {
  actor: Entity;
  state: GameState;
  station?: CraftStationKind;
  stationKind?: CraftStationKind;
  recipeId?: string;
  slotIndex?: number;
  rng?: () => number;
}

export interface CraftingActionResult {
  ok: boolean;
  reason?: CraftFailureReason;
  message: string;
  itemId?: string;
  recipeId?: string;
  materialId?: CraftMaterialId;
  learnedRecipeId?: string;
}

export interface CraftMenuSnapshotContext {
  actor: Entity;
  state: GameState;
  mode?: 'craft' | 'disassemble';
  station?: CraftStationKind;
  stationKind?: CraftStationKind;
  filter?: string;
}

export interface CraftMenuRecipeEntry {
  kind: 'recipe';
  id: string;
  recipeId: string;
  itemId: string;
  itemName: string;
  name: string;
  description: string;
  resultCount: number;
  components: CraftVector;
  station: CraftStationKind;
  tier: 0 | 1 | 2 | 3 | 4;
  tags: readonly string[];
  canCraft: boolean;
  craftable: boolean;
  missing: MutableCraftVector;
  missingMaterials: Partial<Record<CraftMaterialId, number>>;
  blockedReason?: CraftFailureReason;
}

export interface CraftMenuDisassembleEntry {
  kind: 'disassemble';
  slotIndex: number;
  itemId: string;
  itemName: string;
  name: string;
  description: string;
  count: number;
  components: CraftVector;
  canDisassemble: boolean;
  possibleOutputs: readonly { materialId: CraftMaterialId; label: string; weight: number }[];
  blockedReason?: CraftFailureReason;
}

export interface CraftMenuSnapshot {
  mode: 'craft' | 'disassemble';
  stationKind: CraftStationKind;
  materials: MutableCraftVector;
  recipes: CraftMenuRecipeEntry[];
  inventory: CraftMenuDisassembleEntry[];
  knownRecipes: CraftMenuRecipeSnapshot[];
  disassemblyItems: CraftMenuDisassemblySnapshot[];
}

export type CraftMenuRecipeSnapshot = Omit<CraftMenuRecipeEntry, 'kind'>;
export type CraftMenuDisassemblySnapshot = Omit<CraftMenuDisassembleEntry, 'kind'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanMaterialCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_CRAFT_MATERIAL, Math.floor(n)));
}

function cleanTime(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function cloneVector(vector: CraftVector | MutableCraftVector): MutableCraftVector {
  return [
    cleanMaterialCount(vector[0]),
    cleanMaterialCount(vector[1]),
    cleanMaterialCount(vector[2]),
    cleanMaterialCount(vector[3]),
    cleanMaterialCount(vector[4]),
    cleanMaterialCount(vector[5]),
    cleanMaterialCount(vector[6]),
    cleanMaterialCount(vector[7]),
    cleanMaterialCount(vector[8]),
  ];
}

function sanitizeMaterialVector(input: unknown): MutableCraftVector {
  const out = emptyCraftVector();
  if (!Array.isArray(input)) return out;
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) out[i] = cleanMaterialCount(input[i]);
  return out;
}

let _cachedDefaultKnownRecipes: Record<string, true> | null = null;

function defaultKnownRecipes(): Record<string, true> {
  if (!_cachedDefaultKnownRecipes) {
    _cachedDefaultKnownRecipes = {};
    for (const recipe of Object.values(CRAFT_RECIPES)) {
      if (recipe.knownByDefault) _cachedDefaultKnownRecipes[recipe.id] = true;
    }
  }
  return { ..._cachedDefaultKnownRecipes };
}

function sanitizeKnownRecipes(input: unknown): Record<string, true> {
  const out = defaultKnownRecipes();
  let used = Object.keys(out).length;
  const add = (rawId: unknown): void => {
    if (used >= MAX_KNOWN_RECIPES || typeof rawId !== 'string') return;
    const id = rawId.slice(0, 96);
    const recipe = craftRecipeById(id);
    if (!recipe || out[id]) return;
    out[id] = true;
    used++;
  };

  if (Array.isArray(input)) {
    for (const rawId of input) add(rawId);
  } else if (isRecord(input)) {
    for (const [rawId, known] of Object.entries(input)) {
      if (known === true) add(rawId);
    }
  }
  return out;
}

function stateTime(state: GameState): number {
  return Number.isFinite(state.time) ? Math.max(0, state.time) : 0;
}

function touchCrafting(state: GameState, crafting = ensureCraftingState(state)): void {
  crafting.learnedCount = countKnownRecipes(crafting.knownRecipes);
  crafting.lastChangedAt = stateTime(state);
}

function fail(reason: CraftFailureReason, message: string): CraftingActionResult {
  return { ok: false, reason, message };
}

function checkFail(reason: CraftFailureReason, message: string): CraftCheck {
  return { ok: false, reason, message };
}

function stationFromContext(ctx: Pick<CraftingActionContext | CraftMenuSnapshotContext, 'station' | 'stationKind'>): CraftStationKind {
  return ctx.stationKind ?? ctx.station ?? 'any';
}

function stationMatches(recipe: CraftRecipeDef, station: CraftStationKind): boolean {
  return recipe.station === 'any' || recipe.station === station;
}

function randomUnit(rand?: () => number): number {
  const n = rand ? Number(rand()) : rng();
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(0.999999, n));
}

function removeInventorySlotItem(actor: Entity, slotIndex: number, defId: string): boolean {
  const inventory = actor.inventory;
  const slot = inventory?.[slotIndex];
  if (!slot || slot.defId !== defId || slot.count <= 0) return false;
  slot.count--;
  if (slot.count <= 0) inventory.splice(slotIndex, 1);
  return true;
}

/** Ступень материала: чем реже, тем «дороже». Словарь уже объявлен в `CRAFT_MATERIALS`. */
function materialTierRank(materialId: CraftMaterialId): number {
  const rarity = CRAFT_MATERIALS[materialId]?.rarity;
  return rarity === 'rare' ? 2 : rarity === 'specific' ? 1 : 0;
}

/**
 * Самый дорогой материал состава: сначала по ступени, при равной ступени — по
 * доле в составе. Порядок в `CRAFT_MATERIAL_IDS` решающим НЕ делаем: место в
 * массиве — не физика мира.
 */
function richestMaterial(components: CraftVector): CraftMaterialId | undefined {
  let best: CraftMaterialId | undefined;
  let bestTier = -1;
  let bestCount = 0;
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    const count = cleanMaterialCount(components[i]);
    if (count <= 0) continue;
    const id = CRAFT_MATERIAL_IDS[i];
    const tier = materialTierRank(id);
    if (tier > bestTier || (tier === bestTier && count > bestCount)) {
      best = id;
      bestTier = tier;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Что вернёт разбор: ПОЛОВИНА вектора состава, всеми типами сразу.
 *
 * Раньше разбор выдавал ОДНУ единицу ОДНОГО СЛУЧАЙНОГО типа: винтовка из
 * 18 механики, 9 электроники, 4 химии и 27 металла могла отдать одну химию —
 * и ровно столько же отдавала пустая бутылка. Выход был плоским, а состав
 * растёт со стоимостью, поэтому мусор был самым дешёвым источником материала
 * в игре, и из него собиралось что угодно.
 *
 * Округление вниз, но не в ноль: у вещи, чей состав меньше двух единиц,
 * остаётся одна — и это ОБЯЗАТЕЛЬНО самый дорогой материал состава, а не
 * жребий. Разобрать что-то ценное всегда осмысленнее, чем что-то дешёвое.
 */
function disassemblyRefund(components: CraftVector): MutableCraftVector {
  const refund = emptyCraftVector();
  let total = 0;
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    const half = Math.floor(cleanMaterialCount(components[i]) / 2);
    refund[i] = half;
    total += half;
  }
  if (total > 0) return refund;
  /* Утешительная единица — только вещи, чей состав есть что делить пополам.
   * Иначе однорублёвый хлам (сырое мясо, свёрток курьера) становится источником
   * обычного бита ПО РУБЛЮ ЗА ЕДИНИЦУ и остаётся топливом денежной петли:
   * замерено, снятие этой страховки роняет максимальную выгоду крафта
   * 52.5× → 17.5×, а 95-й перцентиль 15.3× → 5.5×. Вещь беднее двух единиц
   * состава просто не даёт ничего — разбирать ценное по-прежнему осмысленнее. */
  if (craftVectorTotal(components) >= 2) {
    const richest = richestMaterial(components);
    if (richest) refund[craftMaterialIndex(richest)] = 1;
  }
  return refund;
}

function canDisassembleAtStation(station: CraftStationKind): boolean {
  return station === 'workbench';
}

function materialTags(vector: CraftVector, limit: number): string[] {
  const tags: string[] = [];
  for (let i = 0; i < CRAFT_MATERIAL_COUNT && tags.length < limit; i++) {
    if (vector[i] > 0) tags.push(`material_${CRAFT_MATERIAL_IDS[i]}`);
  }
  return tags;
}

function missingMaterials(materials: CraftVector | MutableCraftVector, components: CraftVector): MutableCraftVector {
  const out = emptyCraftVector();
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) out[i] = Math.max(0, components[i] - materials[i]);
  return out;
}

function missingMaterialRecord(missing: CraftVector | MutableCraftVector): Partial<Record<CraftMaterialId, number>> {
  const out: Partial<Record<CraftMaterialId, number>> = {};
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    if (missing[i] > 0) out[CRAFT_MATERIAL_IDS[i]] = missing[i];
  }
  return out;
}

function vectorHasAny(vector: CraftVector | MutableCraftVector): boolean {
  return vector.some(value => value > 0);
}

function materialLabel(materialId: CraftMaterialId): string {
  return CRAFT_MATERIAL_DEFS[craftMaterialIndex(materialId)]?.shortName ?? materialId;
}

export function createCraftingState(): CraftingState {
  const knownRecipes = defaultKnownRecipes();
  return {
    materials: emptyCraftVector(),
    knownRecipes,
    learnedCount: countKnownRecipes(knownRecipes),
    lastChangedAt: 0,
  };
}

export function sanitizeCraftingState(input: unknown): CraftingState {
  if (!isRecord(input)) return createCraftingState();
  const knownRecipes = sanitizeKnownRecipes(input.knownRecipes);
  return {
    materials: sanitizeMaterialVector(input.materials),
    knownRecipes,
    learnedCount: countKnownRecipes(knownRecipes),
    lastChangedAt: cleanTime(input.lastChangedAt),
  };
}

function countKnownRecipes(knownRecipes: Record<string, true>): number {
  let count = 0;
  for (const _ in knownRecipes) {
    count++;
  }
  return count;
}

export function ensureCraftingState(state: GameState): CraftingState {
  state.crafting = sanitizeCraftingState(state.crafting);
  return state.crafting;
}

export function craftingForSave(state: GameState): CraftingSavePayload {
  const crafting = ensureCraftingState(state);
  return {
    materials: cloneVector(crafting.materials),
    knownRecipes: Object.keys(crafting.knownRecipes).filter(id => !!craftRecipeById(id)).slice(0, MAX_KNOWN_RECIPES),
  };
}

export function restoreCraftingState(input: unknown): CraftingState {
  return sanitizeCraftingState(input);
}

export function craftRecipeExists(recipeId: string): boolean {
  return !!craftRecipeById(recipeId);
}

export function craftRecipeDisplayName(recipeId: string): string {
  const recipe = craftRecipeById(recipeId);
  if (recipe) return ITEMS[recipe.itemId]?.name ?? recipe.itemId;
  const itemId = craftRecipeItemId(recipeId);
  return itemId ? ITEMS[itemId]?.name ?? itemId : recipeId;
}

export function learnCraftRecipe(state: GameState, recipeId: string, source?: string): boolean {
  const recipe = craftRecipeById(recipeId);
  if (!recipe || !recipe.discoverable) return false;
  const crafting = ensureCraftingState(state);
  if (crafting.knownRecipes[recipeId]) return false;
  crafting.knownRecipes[recipeId] = true;
  touchCrafting(state, crafting);
  publishEvent(state, {
    type: 'craft_recipe_learned',
    itemId: recipe.itemId,
    itemName: ITEMS[recipe.itemId]?.name,
    severity: 2,
    privacy: 'private',
    tags: ['crafting', 'recipe', ...recipe.tags.slice(0, 4)],
    data: { itemId: recipe.itemId, recipeId, source },
  });
  return true;
}

export function isCraftRecipeKnown(state: GameState, recipeId: string): boolean {
  return hasCraftRecipe(state, recipeId);
}

export function hasCraftRecipe(state: GameState, recipeId: string): boolean {
  return !!craftRecipeById(recipeId) && ensureCraftingState(state).knownRecipes[recipeId] === true;
}

export function addCraftMaterial(state: GameState, materialId: CraftMaterialId, count: number): void {
  if (!isCraftMaterialId(materialId)) return;
  const amount = cleanMaterialCount(count);
  if (amount <= 0) return;
  const crafting = ensureCraftingState(state);
  const idx = craftMaterialIndex(materialId);
  crafting.materials[idx] = Math.min(MAX_CRAFT_MATERIAL, crafting.materials[idx] + amount);
  touchCrafting(state, crafting);
}

export function canCraftRecipe(actor: Entity, state: GameState, recipeId: string, station: CraftStationKind): CraftCheck {
  const recipe = craftRecipeById(recipeId);
  if (!recipe) return checkFail('unknown_recipe', 'Рецепт не найден.');
  if (!hasCraftRecipe(state, recipeId)) return checkFail('recipe_not_learned', 'Рецепт не изучен.');
  if (!stationMatches(recipe, station)) return checkFail('station_mismatch', 'Здесь этот рецепт не собрать.');
  if (!ITEMS[recipe.itemId]) return checkFail('unknown_item', 'Предмет рецепта не найден.');
  const crafting = ensureCraftingState(state);
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    if (crafting.materials[i] < recipe.components[i]) return checkFail('insufficient_materials', 'Не хватает материалов.');
  }
  if (!canAddItem(actor, recipe.itemId, recipe.resultCount)) return checkFail('inventory_full', 'Нет места в инвентаре.');
  return { ok: true, message: 'Можно собрать.', recipe };
}

export function craftKnownRecipe(ctx: CraftingActionContext): CraftingActionResult {
  const recipeId = ctx.recipeId ?? '';
  const station = stationFromContext(ctx);
  const check = canCraftRecipe(ctx.actor, ctx.state, recipeId, station);
  if (!check.ok || !check.recipe) return fail(check.reason ?? 'unknown_recipe', check.message);
  const recipe = check.recipe;
  const crafting = ensureCraftingState(ctx.state);

  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) crafting.materials[i] -= recipe.components[i];
  if (!addItem(ctx.actor, recipe.itemId, recipe.resultCount)) {
    for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
      crafting.materials[i] = Math.min(MAX_CRAFT_MATERIAL, crafting.materials[i] + recipe.components[i]);
    }
    return fail('inventory_add_failed', 'Инвентарь отказал уже после проверки.');
  }

  touchCrafting(ctx.state, crafting);
  const itemName = ITEMS[recipe.itemId]?.name ?? recipe.itemId;
  publishEvent(ctx.state, {
    type: 'player_craft_item',
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    actorFaction: ctx.actor.faction,
    itemId: recipe.itemId,
    itemName,
    itemCount: recipe.resultCount,
    severity: 2,
    privacy: 'private',
    tags: ['crafting', 'recipe', ...materialTags(recipe.components, 5)],
    data: { itemId: recipe.itemId, recipeId: recipe.id, stationKind: station },
  });

  const message = `Собрано: ${itemName}.`;
  ctx.state.msgs.push(msg(message, ctx.state.time, '#8cf'));
  return { ok: true, message, itemId: recipe.itemId, recipeId: recipe.id };
}

export function disassembleInventorySlot(ctx: CraftingActionContext): CraftingActionResult {
  const slotIndex = Math.floor(Number(ctx.slotIndex));
  const station = stationFromContext(ctx);
  const inventory = ctx.actor.inventory ?? [];
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= inventory.length) return fail('invalid_slot', 'Слот разборки пуст.');
  if (!canDisassembleAtStation(station)) return fail('invalid_station', 'Нужен верстак разборки.');

  const slot = inventory[slotIndex];
  const itemDef = ITEMS[slot.defId];
  if (!itemDef) return fail('unknown_item', 'Предмет не найден.');
  const composition = itemComposition(slot.defId);
  if (!composition) return fail('no_composition', 'У предмета нет состава.');
  const refund = disassemblyRefund(composition.components);
  const materialId = richestMaterial(refund);
  if (!materialId) return fail('no_composition', 'У предмета пустой состав.');
  const removedDefId = slot.defId;
  if (!removeInventorySlotItem(ctx.actor, slotIndex, removedDefId)) return fail('inventory_remove_failed', 'Не удалось снять предмет со слота.');
  /* Разобранное перестаёт быть надетым. Это делают ВСЕ прочие пути потери вещи
   * (торговля, ящик, выброс) — разборка была единственным, который не делал.
   * Из-за этого разобранный нож оставался в руке навсегда: урон считается по
   * `e.weapon`, а износ молча ничего не находил, так что оружие ещё и не
   * ломалось. То же с разобранной надетой бронёй и её резистом.
   * Снимает только когда вещи в рюкзаке больше нет — стопка переживает разбор. */
  reconcileEquippedAfterLoss(ctx.actor, [removedDefId]);

  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    if (refund[i] > 0) addCraftMaterial(ctx.state, CRAFT_MATERIAL_IDS[i], refund[i]);
  }
  const refundTotal = craftVectorTotal(refund);
  const recipe = craftRecipeByItemId(slot.defId);
  let learnedRecipeId: string | undefined;
  if (recipe && recipe.discoverable && randomUnit(ctx.rng) < 0.5) {
    if (learnCraftRecipe(ctx.state, recipe.id, 'disassembly')) learnedRecipeId = recipe.id;
  }

  publishEvent(ctx.state, {
    type: 'player_disassemble_item',
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    actorFaction: ctx.actor.faction,
    itemId: slot.defId,
    itemName: itemDef.name,
    itemCount: 1,
    severity: learnedRecipeId ? 3 : 2,
    privacy: 'private',
    tags: ['crafting', 'disassembly', 'recipe', ...materialTags(refund, 5)],
    data: { itemId: slot.defId, recipeId: recipe?.id, materialId, materialCount: refundTotal, stationKind: station, source: 'disassembly' },
  });

  const learnedText = learnedRecipeId ? ' Рецепт всплыл в голове.' : '';
  const message = `Разобрано: ${itemDef.name}. Материала: ${refundTotal} ед., в основном ${materialLabel(materialId)}.${learnedText}`;
  ctx.state.msgs.push(msg(message, ctx.state.time, learnedRecipeId ? '#8cf' : '#ccc'));
  return { ok: true, message, itemId: slot.defId, recipeId: recipe?.id, materialId, learnedRecipeId };
}

export function learnCraftRecipesFromSource(state: GameState, source: CraftRecipeSourceDef): CraftRecipeLearnResult {
  const result: CraftRecipeLearnResult = {
    sourceId: source.id,
    learned: [],
    duplicate: [],
    unknown: [],
  };
  for (const recipeId of source.recipeIds) {
    if (!craftRecipeExists(recipeId)) {
      result.unknown.push(recipeId);
      continue;
    }
    if (learnCraftRecipe(state, recipeId, source.id)) result.learned.push(recipeId);
    else result.duplicate.push(recipeId);
  }
  return result;
}

export function craftRecipeLearnedMessage(recipeId: string): string {
  return `Рецепт изучен: ${craftRecipeDisplayName(recipeId)}`;
}

function entryMatchesFilter(text: string, filter: string | undefined): boolean {
  const clean = filter?.trim().toLowerCase();
  return !clean || text.toLowerCase().includes(clean);
}

function possibleOutputs(components: CraftVector): { materialId: CraftMaterialId; label: string; weight: number }[] {
  const out: { materialId: CraftMaterialId; label: string; weight: number }[] = [];
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    const weight = components[i];
    if (weight <= 0) continue;
    const materialId = CRAFT_MATERIAL_IDS[i];
    out.push({ materialId, label: materialLabel(materialId), weight });
  }
  return out;
}

export function craftMenuSnapshot(ctx: CraftMenuSnapshotContext): CraftMenuSnapshot {
  const mode = ctx.mode ?? 'craft';
  const stationKind = stationFromContext(ctx);
  const crafting = ensureCraftingState(ctx.state);
  const recipes: CraftMenuRecipeEntry[] = [];
  const inventory: CraftMenuDisassembleEntry[] = [];
  const filter = ctx.filter;

  for (const recipe of Object.values(CRAFT_RECIPES)) {
    if (!crafting.knownRecipes[recipe.id]) continue;
    const itemDef = ITEMS[recipe.itemId];
    if (!itemDef) continue;
    if (!entryMatchesFilter(`${itemDef.name} ${recipe.id} ${recipe.tags.join(' ')}`, filter)) continue;
    const check = canCraftRecipe(ctx.actor, ctx.state, recipe.id, stationKind);
    const missing = missingMaterials(crafting.materials, recipe.components);
    recipes.push({
      kind: 'recipe',
      id: recipe.id,
      recipeId: recipe.id,
      itemId: recipe.itemId,
      itemName: itemDef.name,
      name: itemDef.name,
      description: itemDef.desc,
      resultCount: recipe.resultCount,
      components: recipe.components,
      station: recipe.station,
      tier: recipe.tier,
      tags: recipe.tags,
      canCraft: check.ok,
      craftable: check.ok,
      missing,
      missingMaterials: missingMaterialRecord(missing),
      blockedReason: check.reason,
    });
  }

  for (let slotIndex = 0; slotIndex < (ctx.actor.inventory?.length ?? 0); slotIndex++) {
    const slot = ctx.actor.inventory![slotIndex];
    const itemDef = ITEMS[slot.defId];
    if (!itemDef) continue;
    const composition = itemComposition(slot.defId);
    const components = composition?.components ?? emptyCraftVector();
    if (!entryMatchesFilter(`${itemDef.name} ${slot.defId}`, filter)) continue;
    inventory.push({
      kind: 'disassemble',
      slotIndex,
      itemId: slot.defId,
      itemName: itemDef.name,
      name: itemDef.name,
      description: itemDef.desc,
      count: slot.count,
      components,
      canDisassemble: canDisassembleAtStation(stationKind) && !!composition && vectorHasAny(components),
      possibleOutputs: composition ? possibleOutputs(composition.components) : [],
      blockedReason: composition ? canDisassembleAtStation(stationKind) ? undefined : 'invalid_station' : 'no_composition',
    });
  }

  return {
    mode,
    stationKind,
    materials: cloneVector(crafting.materials),
    recipes,
    inventory,
    knownRecipes: recipes,
    disassemblyItems: inventory,
  };
}

export function craftMenuEntries(snapshot: CraftMenuSnapshot): readonly (CraftMenuRecipeEntry | CraftMenuDisassembleEntry)[] {
  return snapshot.mode === 'craft' ? snapshot.recipes : snapshot.inventory;
}

export function craftMaterialLine(vector: CraftVector | MutableCraftVector): string {
  const parts: string[] = [];
  for (let i = 0; i < CRAFT_MATERIAL_COUNT; i++) {
    const value = cleanMaterialCount(vector[i]);
    if (value <= 0) continue;
    parts.push(`${CRAFT_MATERIAL_DEFS[i]?.shortName ?? CRAFT_MATERIAL_IDS[i]} ${value}`);
  }
  return parts.length > 0 ? parts.join('  ') : 'нет';
}

export function craftEntryMissingLine(entry: CraftMenuRecipeEntry): string {
  return vectorHasAny(entry.missing) ? craftMaterialLine(entry.missing) : 'ничего';
}
