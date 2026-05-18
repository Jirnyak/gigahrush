import { type Entity, type FloorLevel, type GameState, type WorldContainer, msg } from '../core/types';
import { World } from '../core/world';
import { FACTORIES, factoryForRoom, type FactoryDef, type FactoryRecipeDef } from '../data/factories';
import { ITEMS } from '../data/catalog';
import { ensureRoomContainers } from './containers';
import { canSpendResources, spendResources } from './economy';
import { publishEvent } from './events';

export interface ProductionState {
  floor: FloorLevel;
  roomId: number;
  factoryId: string;
  recipeId: string;
  progressSec: number;
  nextTickAt: number;
  outputContainerId: number;
  blockedReason?: 'no_inputs' | 'container_full' | 'no_container';
}

type ProductionGameState = GameState & { production?: ProductionState[] };
const MAX_PRODUCTION_ROOMS = 64;

function productionList(state: GameState): ProductionState[] {
  const s = state as ProductionGameState;
  if (!s.production) s.production = [];
  return s.production;
}

function productionFloor(state: GameState, p: ProductionState): FloorLevel {
  const saved = p as ProductionState & { floor?: FloorLevel };
  if (saved.floor === undefined) saved.floor = state.currentFloor;
  return saved.floor;
}

function productionCountForCurrentFloor(state: GameState): number {
  let count = 0;
  for (const p of productionList(state)) {
    if (productionFloor(state, p) === state.currentFloor) count++;
  }
  return count;
}

function outputContainer(world: World, id: number): WorldContainer | undefined {
  return world.containerById.get(id);
}

function productionValidForWorld(state: GameState, world: World, p: ProductionState): boolean {
  if (productionFloor(state, p) !== state.currentFloor) return true;
  const room = world.rooms[p.roomId];
  if (!room) return false;
  const factory = FACTORIES.find(f => f.id === p.factoryId);
  if (!factory || !factory.recipes.some(r => r.id === p.recipeId)) return false;
  if (factoryForRoom(room.type, room.name)?.id !== factory.id) return false;
  const container = outputContainer(world, p.outputContainerId);
  return !!container && container.floor === state.currentFloor && container.roomId === p.roomId;
}

export function pruneProductionForWorld(state: GameState, world: World): number {
  const list = productionList(state);
  let write = 0;
  let removed = 0;
  for (let read = 0; read < list.length; read++) {
    const production = list[read];
    if (productionValidForWorld(state, world, production)) {
      list[write++] = production;
    } else {
      removed++;
    }
  }
  list.length = write;
  return removed;
}

function markProductionContainer(container: WorldContainer, factoryId: string): void {
  container.factoryId = factoryId;
  if (!container.tags.includes('production_output')) container.tags.push('production_output');
  if (!container.tags.includes(factoryId)) container.tags.push(factoryId);
}

function observerNearContainer(world: World, observer: Entity | undefined, container: WorldContainer): boolean {
  return observer !== undefined && world.dist2(observer.x, observer.y, container.x + 0.5, container.y + 0.5) <= 64;
}

function roomZoneId(world: World, roomId: number): number | undefined {
  const room = world.rooms[roomId];
  if (!room) return undefined;
  return world.zoneMap[world.idx(room.x + (room.w >> 1), room.y + (room.h >> 1))];
}

function canFit(container: WorldContainer, recipe: FactoryRecipeDef): boolean {
  const slots = container.inventory.map(i => ({ defId: i.defId, count: i.count }));
  for (const input of recipe.inputItems ?? []) {
    let left = input.count;
    for (const slot of slots) {
      if (left <= 0) break;
      if (slot.defId !== input.defId) continue;
      const take = Math.min(left, slot.count);
      slot.count -= take;
      left -= take;
    }
    if (left > 0) return false;
  }
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].count <= 0) slots.splice(i, 1);
  }
  for (const out of recipe.outputs) {
    if (!ITEMS[out.defId]) return false;
    const exists = slots.some(i => i.defId === out.defId);
    if (!exists) {
      if (slots.length >= container.capacitySlots) return false;
      slots.push({ defId: out.defId, count: 0 });
    }
  }
  return true;
}

function missingResourceIds(state: GameState, recipe: FactoryRecipeDef, floor: FloorLevel): string[] {
  const missing: string[] = [];
  for (const input of recipe.inputs) {
    if (!canSpendResources(state, [input], floor)) missing.push(input.id);
  }
  return missing;
}

function missingInputItemIds(container: WorldContainer, recipe: FactoryRecipeDef): string[] {
  const missing: string[] = [];
  for (const input of recipe.inputItems ?? []) {
    let count = 0;
    for (const item of container.inventory) {
      if (item.defId === input.defId) count += item.count;
    }
    if (count < input.count) missing.push(input.defId);
  }
  return missing;
}

function consumeInputItems(container: WorldContainer, recipe: FactoryRecipeDef): void {
  for (const input of recipe.inputItems ?? []) {
    let left = input.count;
    for (let i = 0; i < container.inventory.length && left > 0; i++) {
      const item = container.inventory[i];
      if (item.defId !== input.defId) continue;
      const take = Math.min(left, item.count);
      item.count -= take;
      left -= take;
      if (item.count <= 0) {
        container.inventory.splice(i, 1);
        i--;
      }
    }
  }
}

function addOutput(container: WorldContainer, recipe: FactoryRecipeDef): void {
  for (const out of recipe.outputs) {
    const existing = container.inventory.find(i => i.defId === out.defId);
    if (existing) existing.count += out.count;
    else container.inventory.push({ defId: out.defId, count: out.count });
  }
}

function registerFactoryRoom(state: GameState, factory: FactoryDef, roomId: number, containerId: number): void {
  const list = productionList(state);
  if (list.some(p => productionFloor(state, p) === state.currentFloor && p.roomId === roomId && p.factoryId === factory.id)) return;
  if (productionCountForCurrentFloor(state) >= MAX_PRODUCTION_ROOMS) return;
  list.push({
    floor: state.currentFloor,
    roomId,
    factoryId: factory.id,
    recipeId: factory.recipes[0].id,
    progressSec: 0,
    nextTickAt: state.time + 30 + ((roomId * 17) % 90),
    outputContainerId: containerId,
  });
}

function productionTags(base: string[], recipe: FactoryRecipeDef, extra: string[] = []): string[] {
  const tags: string[] = [];
  for (const tag of [...base, ...extra, ...(recipe.eventTags ?? [])]) {
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function ensureProductionRooms(state: GameState, world: World): number {
  ensureRoomContainers(world, state.currentFloor);
  pruneProductionForWorld(state, world);
  let added = 0;
  for (const room of world.rooms) {
    if (!room) continue;
    const factory = factoryForRoom(room.type, room.name);
    if (!factory) continue;
    const container = world.containers.find(c => c.roomId === room.id && c.tags.some(t => factory.outputTags.includes(t)))
      ?? world.containers.find(c => c.roomId === room.id);
    if (!container) continue;
    markProductionContainer(container, factory.id);
    const before = productionList(state).length;
    registerFactoryRoom(state, factory, room.id, container.id);
    if (productionList(state).length > before) added++;
    if (added >= 48 || productionCountForCurrentFloor(state) >= MAX_PRODUCTION_ROOMS) break;
  }
  return added;
}

export function tickProduction(state: GameState, world: World, force = false, observer?: Entity): number {
  ensureProductionRooms(state, world);
  let made = 0;
  for (const p of productionList(state)) {
    if (productionFloor(state, p) !== state.currentFloor) continue;
    if (!force && state.time < p.nextTickAt) continue;
    const factory = FACTORIES.find(f => f.id === p.factoryId);
    const recipe = factory?.recipes.find(r => r.id === p.recipeId);
    if (!factory || !recipe) continue;
    const container = outputContainer(world, p.outputContainerId);
    if (!container) {
      p.blockedReason = 'no_container';
      publishEvent(state, {
        type: 'room_blocked_production',
        zoneId: roomZoneId(world, p.roomId),
        roomId: p.roomId,
        severity: 2,
        privacy: 'local',
        tags: ['production', 'blocked', factory.id, 'no_container'],
        data: { recipeId: recipe.id, blockedReason: 'no_container' },
      });
      p.nextTickAt = state.time + 60;
      continue;
    }
    const missingResources = missingResourceIds(state, recipe, p.floor);
    const missingItems = missingInputItemIds(container, recipe);
    if (missingResources.length > 0 || missingItems.length > 0) {
      p.blockedReason = 'no_inputs';
      container.productionBlockedReason = 'no_inputs';
      const nearObserver = observerNearContainer(world, observer, container);
      const missingTags = [
        ...missingResources.map(id => `${id}_missing`),
        ...missingItems.map(id => `${id}_missing`),
      ];
      publishEvent(state, {
        type: 'room_lacked_resources',
        zoneId: container.zoneId,
        roomId: p.roomId,
        containerId: container.id,
        severity: nearObserver ? 3 : 2,
        privacy: 'local',
        tags: productionTags(
          nearObserver ? ['production', 'shortage', 'near_player', factory.id] : ['production', 'shortage', factory.id],
          recipe,
          missingTags,
        ),
        data: {
          recipeId: recipe.id,
          blockedReason: 'no_inputs',
          inputs: recipe.inputs,
          inputItems: recipe.inputItems,
          missingResources,
          missingItems,
        },
      });
      p.nextTickAt = state.time + Math.max(30, recipe.cycleSec / 2);
      continue;
    }
    if (!canFit(container, recipe)) {
      p.blockedReason = 'container_full';
      container.productionBlockedReason = 'container_full';
      const nearObserver = observerNearContainer(world, observer, container);
      publishEvent(state, {
        type: 'room_blocked_production',
        zoneId: container.zoneId,
        roomId: p.roomId,
        containerId: container.id,
        severity: nearObserver ? 3 : 2,
        privacy: 'local',
        tags: productionTags(
          nearObserver ? ['production', 'blocked', 'near_player', factory.id, 'container_full'] : ['production', 'blocked', factory.id, 'container_full'],
          recipe,
        ),
        data: { recipeId: recipe.id, blockedReason: 'container_full' },
      });
      p.nextTickAt = state.time + 60;
      continue;
    }
    spendResources(state, recipe.inputs, p.floor);
    consumeInputItems(container, recipe);
    addOutput(container, recipe);
    container.factoryId = factory.id;
    container.lastProducedAt = state.time;
    container.lastProducedItemId = recipe.outputs[0]?.defId;
    container.lastProducedCount = recipe.outputs[0]?.count;
    container.productionBlockedReason = undefined;
    p.progressSec = 0;
    p.blockedReason = undefined;
    p.nextTickAt = state.time + Math.max(30, recipe.cycleSec);
    made++;
    const nearObserver = observerNearContainer(world, observer, container);
    publishEvent(state, {
      type: 'room_produced_items',
      zoneId: container.zoneId,
      roomId: p.roomId,
      containerId: container.id,
      severity: nearObserver ? 3 : 2,
      privacy: 'local',
      itemId: recipe.outputs[0]?.defId,
      itemName: recipe.outputs[0] ? ITEMS[recipe.outputs[0].defId]?.name : undefined,
      itemCount: recipe.outputs[0]?.count,
      tags: productionTags(nearObserver ? ['production', 'output', 'near_player', factory.id] : ['production', 'output', factory.id], recipe),
      data: { recipeId: recipe.id, inputItems: recipe.inputItems, outputs: recipe.outputs.slice(0, 4) },
    });
  }
  if (force) state.msgs.push(msg(`[PROD] тик: партий ${made}`, state.time, made > 0 ? '#4f4' : '#888'));
  return made;
}

export function summarizeProduction(state: GameState, limit = 6): string[] {
  return productionList(state).filter(p => productionFloor(state, p) === state.currentFloor).slice(0, limit).map(p => {
    const blocked = p.blockedReason ? ` ${p.blockedReason}` : '';
    return `room ${p.roomId}: ${p.factoryId}/${p.recipeId} next ${Math.max(0, Math.round(p.nextTickAt - state.time))}s${blocked}`;
  });
}
