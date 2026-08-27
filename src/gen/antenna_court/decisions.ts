/* -- Design z: Антенный двор / доступ к развилкам сигнала ----------
 *
 * Пять развилок двора написаны целиком — ремонт реле, глушение рынка,
 * запись аномалии, вынос акта в Министерство и снятая батарея, — с
 * зацепками маршрута, флагами эфира и слухами. Дойти до них было
 * нельзя: `repairAntennaCourtSignal`, `jamAntennaCourtSignal`,
 * `recordAntennaCourtAnomaly`, `exposeAntennaCourtSignal` и
 * `markAntennaCourtBatteryTaken` не звал никто, а `signalState` уезжал
 * в `antennaCourtDebugLines` и навсегда оставался в исходных нулях.
 *
 * Каждая развилка получает клетку в своей авторской комнате: реле — в
 * релейной будке, глушение — в кабине глушения, запись — в архиве
 * мониторинга, акт — на посту сигнал-инспекции, батарея — в батарейной
 * кладовой. Три из них уже были описаны в `ANTENNA_COURT_ROUTE_DECISIONS`
 * вместе с ценой и последствием; модуль берёт цену оттуда, а не выдумывает.
 *
 * Функции решения приходят ПАРАМЕТРОМ из генератора: реестр остаётся
 * листом графа импортов.
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
  ANTENNA_COURT_ROUTE_DECISIONS,
  ANTENNA_COURT_ROUTE_Z,
  DESIGN_FLOOR_ID,
} from './meta';
import type { AntennaCourtSignalState, AntennaSignalResult } from './geometry';

const ANTENNA_DECISION_REACH = 2.4;
const ANTENNA_DECISION_LOOK = 1.5;

export type AntennaDecisionKind = 'repair' | 'jam' | 'record' | 'expose' | 'battery';

export interface AntennaDecisionSpec {
  id: string;
  kind: AntennaDecisionKind;
  roomName: string;
  dx: number;
  dy: number;
  feature: Feature;
  prompt: string;
  donePrompt: string;
  costItem?: { defId: string; count: number };
  costHint: string;
  /** Русская строка последствия; у трёх развилок берётся из каталога. */
  outcome: string;
}

function catalogOutcome(id: string): string {
  return ANTENNA_COURT_ROUTE_DECISIONS.find(entry => entry.id === id)?.outcome ?? '';
}

function catalogItem(id: string): { defId: string; count: number } | undefined {
  const defId = ANTENNA_COURT_ROUTE_DECISIONS.find(entry => entry.id === id)?.itemId;
  return defId ? { defId, count: 1 } : undefined;
}

export const ANTENNA_DECISION_SPECS: readonly AntennaDecisionSpec[] = [
  {
    id: 'signal_repair',
    kind: 'repair',
    roomName: 'Релейная будка',
    dx: 5,
    dy: 5,
    feature: Feature.MACHINE,
    prompt: ' починить реле',
    donePrompt: ' реле уже держит частоту',
    costItem: catalogItem('signal_repair'),
    costHint: 'Нужна плата: реле выгорело насквозь.',
    outcome: catalogOutcome('signal_repair'),
  },
  {
    id: 'market_jam',
    kind: 'jam',
    roomName: 'Кабина глушения',
    dx: 5,
    dy: 5,
    feature: Feature.APPARATUS,
    prompt: ' заглушить эфир для рынка',
    donePrompt: ' эфир уже заглушен',
    costItem: catalogItem('market_jam'),
    costHint: 'Нужен предохранитель: кабина берёт пик тока на запуске.',
    outcome: catalogOutcome('market_jam'),
  },
  {
    id: 'signal_record',
    kind: 'record',
    roomName: 'Архив мониторинга',
    dx: 9,
    dy: 4,
    feature: Feature.SCREEN,
    prompt: ' записать аномалию эфира',
    donePrompt: ' аномалия уже записана',
    costHint: 'Архив пишет сам; нужна только чужая частота в эфире.',
    outcome: 'Запись легла в архив мониторинга: протокол Пустоты теперь можно кому-то показать.',
  },
  {
    id: 'signal_exposure',
    kind: 'expose',
    roomName: 'Пост сигнал-инспекции',
    dx: 5,
    dy: 5,
    feature: Feature.DESK,
    prompt: ' подать акт о незаконной записи',
    donePrompt: ' акт уже подан',
    costItem: catalogItem('signal_exposure'),
    costHint: 'Нужен акт о раскрытой записи: на слово пост не берёт.',
    outcome: catalogOutcome('signal_exposure'),
  },
  {
    id: 'battery_taken',
    kind: 'battery',
    roomName: 'Батарейная кладовая',
    dx: 4,
    dy: 4,
    feature: Feature.SHELF,
    prompt: ' снять батарею двора',
    donePrompt: ' батарея уже снята',
    costHint: 'Батарея снимается руками, но двор это заметит.',
    outcome: 'Батарея снята. Двор проживёт на резерве, а кто-то останется без света.',
  },
];

export interface AntennaDecisionAnchor extends AntennaDecisionSpec {
  cell: number;
  x: number;
  y: number;
}

/** Авторские функции приходят из генератора, чтобы реестр остался листом. */
export interface AntennaDecisionBinding {
  repair(signal: AntennaCourtSignalState, amount?: number): number;
  jam(signal: AntennaCourtSignalState, nowTotalHour: number, durationHours?: number): AntennaSignalResult;
  record(signal: AntennaCourtSignalState): AntennaSignalResult;
  expose(signal: AntennaCourtSignalState): AntennaSignalResult;
  battery(signal: AntennaCourtSignalState): void;
  publish(
    game: GameState,
    signal: AntennaCourtSignalState,
    action: 'tune' | 'jam' | 'record' | 'repair' | 'battery' | 'expose',
    result?: AntennaSignalResult,
  ): unknown;
  debugLines(signal: AntennaCourtSignalState): string[];
}

interface AntennaDecisionState {
  signal: AntennaCourtSignalState;
  anchors: AntennaDecisionAnchor[];
  binding: AntennaDecisionBinding;
  used: Set<string>;
}

const antennaDecisionsByWorld = new WeakMap<World, AntennaDecisionState>();

export function antennaDecisionAnchors(world: World): readonly AntennaDecisionAnchor[] {
  return antennaDecisionsByWorld.get(world)?.anchors ?? [];
}

export function antennaSignalFor(world: World): AntennaCourtSignalState | undefined {
  return antennaDecisionsByWorld.get(world)?.signal;
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

/** Ставит якоря развилок. Зовётся генератором ПОСЛЕ расширения и декора. */
export function placeAntennaDecisionAnchors(
  world: World,
  signal: AntennaCourtSignalState,
  binding: AntennaDecisionBinding,
): number {
  const anchors: AntennaDecisionAnchor[] = [];
  for (const spec of ANTENNA_DECISION_SPECS) {
    const room = world.rooms.find(candidate => candidate?.name === spec.roomName);
    const cell = anchorCell(world, room, spec.dx, spec.dy);
    if (cell < 0) continue;
    world.features[cell] = spec.feature;
    anchors.push({ ...spec, cell, x: (cell % W) + 0.5, y: ((cell / W) | 0) + 0.5 });
  }
  if (anchors.length > 0) world.markFeaturesDirty(false);
  antennaDecisionsByWorld.set(world, { signal, anchors, binding, used: new Set() });
  return anchors.length;
}

function anchorAtLook(world: World, player: Entity, lookX: number, lookY: number): AntennaDecisionAnchor | undefined {
  const store = antennaDecisionsByWorld.get(world);
  if (!store || store.anchors.length === 0) return undefined;
  const lx = Math.floor(lookX) + 0.5;
  const ly = Math.floor(lookY) + 0.5;
  let best: AntennaDecisionAnchor | undefined;
  let bestD2 = Infinity;
  for (const anchor of store.anchors) {
    if (world.dist2(player.x, player.y, anchor.x, anchor.y) > ANTENNA_DECISION_REACH * ANTENNA_DECISION_REACH) continue;
    const d2 = world.dist2(lx, ly, anchor.x, anchor.y);
    if (d2 > ANTENNA_DECISION_LOOK * ANTENNA_DECISION_LOOK || d2 >= bestD2) continue;
    best = anchor;
    bestD2 = d2;
  }
  return best;
}

export function applyAntennaDecision(
  world: World,
  game: GameState,
  player: Entity,
  anchor: AntennaDecisionAnchor,
  skipCost = false,
): boolean {
  const store = antennaDecisionsByWorld.get(world);
  if (!store) return false;
  /* Ремонт и глушение намеренно повторяемы — качество эфира и есть их
     ресурс. Одноразовы только те три, что меняют чей-то статус. */
  const oneShot = anchor.kind === 'record' || anchor.kind === 'expose' || anchor.kind === 'battery';
  if (oneShot && store.used.has(anchor.id)) {
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

  const { signal, binding } = store;
  let result: AntennaSignalResult | undefined;
  switch (anchor.kind) {
    case 'repair': binding.repair(signal, 1); break;
    case 'jam': result = binding.jam(signal, Math.floor(game.time / 60)); break;
    case 'record': result = binding.record(signal); break;
    case 'expose': result = binding.expose(signal); break;
    case 'battery': binding.battery(signal); break;
  }
  store.used.add(anchor.id);
  game.msgs.push(msg(anchor.outcome, game.time, '#9cf'));
  if (result?.clue) game.msgs.push(msg(result.clue, game.time, '#cc9'));
  binding.publish(game, signal, anchor.kind, result);
  return true;
}

registerContentInteractionHook({
  id: 'antenna_court_signal_decisions',
  target(ctx) {
    /* Сторож высоты ПЕРВОЙ строкой: крюк зовётся каждый кадр. */
    if (ctx.state.currentZ !== ANTENNA_COURT_ROUTE_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    const store = antennaDecisionsByWorld.get(ctx.world)!;
    const done = store.used.has(anchor.id) && (anchor.kind === 'record' || anchor.kind === 'expose' || anchor.kind === 'battery');
    return {
      id: 748_000 + (anchor.cell % 1000),
      targetId: anchor.id,
      x: anchor.x,
      y: anchor.y,
      priority: 74,
      prompt: done ? anchor.donePrompt : anchor.prompt,
    };
  },
  use(ctx) {
    if (ctx.state.currentZ !== ANTENNA_COURT_ROUTE_Z) return null;
    const anchor = anchorAtLook(ctx.world, ctx.player, ctx.lookX, ctx.lookY);
    if (!anchor) return null;
    applyAntennaDecision(ctx.world, ctx.state, ctx.player, anchor);
    return { handled: true, worldChanged: false };
  },
});

registerDebugCommand({
  id: 'antenna_court_signal_decisions',
  group: 'route',
  label: 'Антенный двор: развилки сигнала',
  sort: -ANTENNA_COURT_ROUTE_Z,
  run(ctx) {
    const store = antennaDecisionsByWorld.get(ctx.world);
    if (!store) {
      ctx.say(`[${DESIGN_FLOOR_ID}] состояние сигнала не найдено: это не антенный двор`, '#c66');
      return;
    }
    for (const line of store.binding.debugLines(store.signal)) ctx.say(`  ${line}`, '#9cf');
    for (const anchor of store.anchors) {
      ctx.say(`  ${anchor.id} @${Math.floor(anchor.x)},${Math.floor(anchor.y)}`, '#9f7');
      applyAntennaDecision(ctx.world, ctx.state, ctx.player, anchor, true);
    }
  },
});
