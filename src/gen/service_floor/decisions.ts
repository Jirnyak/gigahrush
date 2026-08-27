/* -- Design z: Служебный этаж С-15 / доступ к развилкам ------------
 *
 * Пять развилок служебного этажа написаны целиком — мастер-ключ,
 * ремонт лебёдки, две запитки щитовой и вентиляции, отвод рейда, — с
 * событиями, флагами маршрута и переходами на Пояс, Тёмную пересадку и
 * Темноту. Дойти до них было нельзя: `learnServiceMasterKey`,
 * `repairServiceLiftMachine`, `restoreServicePowerZone`,
 * `rerouteServiceRaid` и `applyServiceMasterKeyScope` не звал никто,
 * а `serviceState` уезжал в объект генерации и терялся.
 *
 * Каждая развилка получает клетку в той авторской комнате, ради которой
 * писалась: мастер-ключ и ремонт — в машинном зале, свет — в щитовой,
 * вентиляция — в вентиляционном узле, отвод рейда — там же, где стоит
 * маршрутная подсказка о рейде.
 *
 * Функции решения приходят ПАРАМЕТРОМ из генератора: реестр остаётся
 * листом графа импортов и не тянет генератор обратно.
 */

import {
  Cell,
  Feature,
  W,
  msg,
  type Entity,
  type GameState,
  type Room,
} from '../../core/types';
import { World } from '../../core/world';
import { registerContentInteractionHook } from '../../systems/content_hooks';
import { registerDebugCommand } from '../../systems/debug_registry';
import { hasItem, removeItem } from '../../systems/inventory';
import {
  BREAKER_ROOM,
  DESIGN_FLOOR_ID,
  LIFT_MACHINE_ROOM,
  SERVICE_FLOOR_Z,
  VENT_JUNCTION,
  type ServiceFloorState,
} from './meta';
import type { ServicePowerZoneId } from './utility_graph';

const SERVICE_DECISION_REACH = 2.4;
const SERVICE_DECISION_LOOK = 1.5;

export type ServiceDecisionKind =
  | { kind: 'master_key' }
  | { kind: 'repair_lift' }
  | { kind: 'power'; zoneId: ServicePowerZoneId }
  | { kind: 'reroute_raid' };

export interface ServiceDecisionSpec {
  id: string;
  decision: ServiceDecisionKind;
  roomName: string;
  dx: number;
  dy: number;
  feature: Feature;
  prompt: string;
  donePrompt: string;
  costItem?: { defId: string; count: number };
  costHint: string;
}

/* Цены взяты С ЭТОГО ЖЕ ЭТАЖА, а не выдуманы: ключ и шестерня лежат в
   шкафу уборщика, предохранители — в щитовом ящике и там же. Бесплатной
   развилки тут нет: обход замка обязан стоить ресурса, иначе замка не
   было. Отвод рейда цены не берёт — его цена в том, что он публичен. */
export const SERVICE_DECISION_SPECS: readonly ServiceDecisionSpec[] = [
  {
    id: 'service_master_key',
    decision: { kind: 'master_key' },
    roomName: LIFT_MACHINE_ROOM,
    dx: 5,
    dy: 4,
    feature: Feature.DESK,
    prompt: ' разобрать связку мастер-ключа',
    donePrompt: ' мастер-ключ уже разобран',
    costItem: { defId: 'wrench', count: 1 },
    costHint: 'Нужен ключ: связка сидит на служебной планке. В шкафу уборщика он есть.',
  },
  {
    id: 'service_repair_lift',
    decision: { kind: 'repair_lift' },
    roomName: LIFT_MACHINE_ROOM,
    dx: 9,
    dy: 7,
    feature: Feature.MACHINE,
    prompt: ' починить лебёдку С-15',
    donePrompt: ' лебёдка С-15 уже работает',
    costItem: { defId: 'gear', count: 1 },
    costHint: 'Нужна шестерня: у лебёдки С-15 сорван зуб. Шкаф уборщика держит запасную.',
  },
  {
    id: 'service_power_breaker',
    decision: { kind: 'power', zoneId: 'breaker_room' },
    roomName: BREAKER_ROOM,
    dx: 5,
    dy: 4,
    feature: Feature.SCREEN,
    prompt: ' поднять щитовую',
    donePrompt: ' щитовая уже под током',
    costItem: { defId: 'fuse', count: 1 },
    costHint: 'Нужен предохранитель: щит выбило вместе с релейной схемой.',
  },
  {
    id: 'service_power_vent',
    decision: { kind: 'power', zoneId: 'ventilation' },
    roomName: VENT_JUNCTION,
    dx: 5,
    dy: 4,
    feature: Feature.APPARATUS,
    prompt: ' запитать вентиляционный узел',
    donePrompt: ' вентиляция уже под током',
    costItem: { defId: 'fuse', count: 1 },
    costHint: 'Нужен предохранитель: узел снят с питания вместе с щитовой.',
  },
  {
    id: 'service_reroute_raid',
    decision: { kind: 'reroute_raid' },
    roomName: BREAKER_ROOM,
    dx: 8,
    dy: 6,
    feature: Feature.SHELF,
    prompt: ' отвести рейд рынка',
    donePrompt: ' рейд уже отведён',
    costHint: 'Отвести рейд можно только со щитовой: наряд идёт по её свету.',
  },
];

export interface ServiceDecisionAnchor extends ServiceDecisionSpec {
  cell: number;
  x: number;
  y: number;
}

/** Авторские функции приходят из генератора, чтобы реестр остался листом. */
export interface ServiceDecisionBinding {
  learnMasterKey(game: GameState, world: World, service: ServiceFloorState): unknown;
  repairLift(game: GameState, service: ServiceFloorState): unknown;
  restorePower(game: GameState, service: ServiceFloorState, zoneId: ServicePowerZoneId): unknown;
  rerouteRaid(game: GameState, service: ServiceFloorState): unknown;
  summarize(service: ServiceFloorState): string[];
}

interface ServiceDecisionState {
  service: ServiceFloorState;
  anchors: ServiceDecisionAnchor[];
  binding: ServiceDecisionBinding;
}

const serviceDecisionsByWorld = new WeakMap<World, ServiceDecisionState>();

export function serviceDecisionAnchors(world: World): readonly ServiceDecisionAnchor[] {
  return serviceDecisionsByWorld.get(world)?.anchors ?? [];
}

export function serviceFloorStateFor(world: World): ServiceFloorState | undefined {
  return serviceDecisionsByWorld.get(world)?.service;
}

function anchorCell(world: World, room: Room | undefined, dx: number, dy: number): number {
  if (!room) return -1;
  const tryCell = (x: number, y: number): number => {
    if (x <= room.x || y <= room.y || x >= room.x + room.w - 1 || y >= room.y + room.h - 1) return -1;
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.FLOOR) return -1;
    if (world.features[ci] !== Feature.NONE || world.containerMap.has(ci)) return -1;
    return ci;
  };
  const wanted = tryCell(room.x + dx, room.y + dy);
  if (wanted >= 0) return wanted;
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      const ci = tryCell(x, y);
      if (ci >= 0) return ci;
    }
  }
  return -1;
}

/** Ставит якоря развилок. Зовётся генератором ПОСЛЕ финализации и декора. */
export function placeServiceDecisionAnchors(
  world: World,
  service: ServiceFloorState,
  binding: ServiceDecisionBinding,
): number {
  const anchors: ServiceDecisionAnchor[] = [];
  for (const spec of SERVICE_DECISION_SPECS) {
    const room = world.rooms.find(candidate => candidate?.name === spec.roomName);
    const cell = anchorCell(world, room, spec.dx, spec.dy);
    if (cell < 0) continue;
    world.features[cell] = spec.feature;
    anchors.push({ ...spec, cell, x: (cell % W) + 0.5, y: ((cell / W) | 0) + 0.5 });
  }
  if (anchors.length > 0) world.markFeaturesDirty(false);
  serviceDecisionsByWorld.set(world, { service, anchors, binding });
  return anchors.length;
}

export function serviceDecisionDone(service: ServiceFloorState, decision: ServiceDecisionKind): boolean {
  switch (decision.kind) {
    case 'master_key': return service.masterKeyKnown;
    case 'repair_lift': return service.liftMachineState === 'repaired';
    case 'power': return service.powerZones.some(zone => zone.id === decision.zoneId && zone.powered);
    case 'reroute_raid': return service.rerouteFlags.marketRaidDiverted;
  }
}

function anchorAtLook(world: World, player: Entity, lookX: number, lookY: number): ServiceDecisionAnchor | undefined {
  const store = serviceDecisionsByWorld.get(world);
  if (!store || store.anchors.length === 0) return undefined;
  const lx = Math.floor(lookX) + 0.5;
  const ly = Math.floor(lookY) + 0.5;
  let best: ServiceDecisionAnchor | undefined;
  let bestD2 = Infinity;
  for (const anchor of store.anchors) {
    if (world.dist2(player.x, player.y, anchor.x, anchor.y) > SERVICE_DECISION_REACH * SERVICE_DECISION_REACH) continue;
    const d2 = world.dist2(lx, ly, anchor.x, anchor.y);
    if (d2 > SERVICE_DECISION_LOOK * SERVICE_DECISION_LOOK || d2 >= bestD2) continue;
    best = anchor;
    bestD2 = d2;
  }
  return best;
}

export function applyServiceDecision(
  world: World,
  game: GameState,
  player: Entity,
  anchor: ServiceDecisionAnchor,
  skipCost = false,
): boolean {
  const store = serviceDecisionsByWorld.get(world);
  if (!store) return false;
  const { service, binding } = store;
  if (serviceDecisionDone(service, anchor.decision)) {
    game.msgs.push(msg(anchor.donePrompt.trim(), game.time, '#888'));
    return false;
  }
  if (!skipCost && anchor.costItem) {
    if (!hasItem(player, anchor.costItem.defId)) {
      game.msgs.push(msg(anchor.costHint, game.time, '#c96'));
      return false;
    }
    removeItem(player, anchor.costItem.defId, anchor.costItem.count);
  }
  switch (anchor.decision.kind) {
    case 'master_key':
      binding.learnMasterKey(game, world, service);
      game.msgs.push(msg('Связка мастер-ключа разобрана: служебные замки С-15 больше не держат.', game.time, '#9cf'));
      break;
    case 'repair_lift':
      binding.repairLift(game, service);
      game.msgs.push(msg('Лебёдка С-15 пошла: нижний персональный коридор открыт, обход к Поясу взведён.', game.time, '#9cf'));
      break;
    case 'power':
      binding.restorePower(game, service, anchor.decision.zoneId);
      game.msgs.push(msg('Свет вернулся в отсек. То, что живёт в темноте, это заметит.', game.time, '#9cf'));
      break;
    case 'reroute_raid':
      binding.rerouteRaid(game, service);
      game.msgs.push(msg('Наряд ушёл другим светом: рейд рынка отведён от служебного крыла.', game.time, '#9cf'));
      break;
  }
  return true;
}

registerContentInteractionHook({
  id: 'service_floor_decisions',
  target(ctx) {
    /* Сторож высоты ПЕРВОЙ строкой: крюк зовётся каждый кадр. */
    if (ctx.state.currentZ !== SERVICE_FLOOR_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    const service = serviceDecisionsByWorld.get(ctx.world)!.service;
    return {
      id: 747_000 + (anchor.cell % 1000),
      targetId: anchor.id,
      x: anchor.x,
      y: anchor.y,
      priority: 74,
      prompt: serviceDecisionDone(service, anchor.decision) ? anchor.donePrompt : anchor.prompt,
    };
  },
  use(ctx) {
    if (ctx.state.currentZ !== SERVICE_FLOOR_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    applyServiceDecision(ctx.world, ctx.state, ctx.player, anchor);
    return { handled: true, worldChanged: anchor.decision.kind === 'master_key' };
  },
});

registerDebugCommand({
  id: 'service_floor_decisions',
  group: 'route',
  label: 'Служебный С-15: развилки',
  sort: -SERVICE_FLOOR_Z,
  run(ctx) {
    const store = serviceDecisionsByWorld.get(ctx.world);
    if (!store) {
      ctx.say(`[${DESIGN_FLOOR_ID}] состояние этажа не найдено: это не служебный С-15`, '#c66');
      return;
    }
    for (const line of store.binding.summarize(store.service)) ctx.say(`  ${line}`, '#9cf');
    for (const anchor of store.anchors) {
      const done = serviceDecisionDone(store.service, anchor.decision);
      ctx.say(`  ${anchor.id} @${Math.floor(anchor.x)},${Math.floor(anchor.y)} ${done ? 'закрыто' : 'открыто'}`, done ? '#888' : '#9f7');
      if (!done) applyServiceDecision(ctx.world, ctx.state, ctx.player, anchor, true);
    }
  },
});
