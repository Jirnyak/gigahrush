/* ── Metro Error Line interaction-time routing ───────────────── */

import {
  W, Feature, FloorLevel,
  type Entity, type GameState,
} from '../core/types';
import { type World } from '../core/world';
import {
  metroRouteForPanel,
  type MetroDestination,
  type MetroRouteDef,
} from '../data/metro';
import { hasItem, removeItem } from './inventory';
import { publishEvent } from './events';

export interface MetroUseResult {
  route: MetroRouteDef;
  destination?: MetroDestination;
  wrongStop: boolean;
  message: string;
  color: string;
}

let nextMetroUseAt = 0;

function isRoutePanel(feature: Feature): boolean {
  return feature === Feature.SCREEN || feature === Feature.APPARATUS;
}

function localDelta(from: number, to: number): number {
  return (to - from + W) % W;
}

function routeAtLookCell(world: World, lookX: number, lookY: number): MetroRouteDef | undefined {
  const x = world.wrap(Math.floor(lookX));
  const y = world.wrap(Math.floor(lookY));
  const ci = world.idx(x, y);
  if (!isRoutePanel(world.features[ci] as Feature)) return undefined;

  const roomId = world.roomMap[ci];
  if (roomId < 0) return undefined;
  const room = world.rooms[roomId];
  if (!room) return undefined;

  const lx = localDelta(room.x, x);
  const ly = localDelta(room.y, y);
  if (lx >= room.w || ly >= room.h) return undefined;

  const panelSlot = Math.max(0, Math.min(3, Math.round((lx - 2) / 3)));
  return metroRouteForPanel(room.name, panelSlot);
}

function pickWrongStop(route: MetroRouteDef): MetroDestination {
  return route.wrongStops[Math.floor(Math.random() * route.wrongStops.length)] ?? route.destination;
}

function adjustedWrongChance(route: MetroRouteDef, player: Entity, state: GameState): number {
  let chance = route.wrongStopChance;
  if (hasItem(player, 'lift_scheme')) chance *= 0.55;
  if (hasItem(player, 'clean_health_cert')) chance *= 0.8;
  if (state.samosborActive) chance = Math.min(0.85, chance + 0.18);
  return chance;
}

function destinationData(destination: MetroDestination): Record<string, unknown> {
  return destination.kind === 'floor'
    ? { destinationKind: 'floor', destinationFloor: destination.floor, destinationLabel: destination.label }
    : { destinationKind: 'local', destinationRoomName: destination.roomName, destinationLabel: destination.label };
}

function publishMetroEvent(
  world: World,
  player: Entity,
  state: GameState,
  route: MetroRouteDef,
  destination: MetroDestination,
  wrongStop: boolean,
  wrongChance: number,
): void {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const zoneId = world.zoneMap[world.idx(px, py)];
  publishEvent(state, {
    type: wrongStop ? 'metro_wrong_stop' : 'metro_route_taken',
    zoneId: zoneId >= 0 ? zoneId : undefined,
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    severity: wrongStop ? 4 : 3,
    privacy: 'local',
    tags: ['metro', 'route', route.id, wrongStop ? 'wrong_stop' : 'arrival'],
    data: {
      routeId: route.id,
      routeLabel: route.label,
      wrongStop,
      wrongChance,
      rumorIds: route.rumorIds,
      ...destinationData(destination),
    },
  });
}

export function tryUseMetroRoute(
  world: World,
  player: Entity,
  state: GameState,
  lookX: number,
  lookY: number,
): MetroUseResult | null {
  const route = routeAtLookCell(world, lookX, lookY);
  if (!route) return null;

  if (state.currentFloor !== FloorLevel.MAINTENANCE) {
    return {
      route,
      wrongStop: false,
      message: 'Табло щелкает, но линия здесь не принимает посадку.',
      color: '#888',
    };
  }

  if (state.time < nextMetroUseAt) {
    return {
      route,
      wrongStop: false,
      message: 'Турникет остывает после прошлой ошибки.',
      color: '#888',
    };
  }

  if (route.requiredItem && !hasItem(player, route.requiredItem)) {
    return {
      route,
      wrongStop: false,
      message: 'Турникет требует билет метро.',
      color: '#fa4',
    };
  }

  if (route.requiredItem) removeItem(player, route.requiredItem, 1);

  const wrongChance = adjustedWrongChance(route, player, state);
  const wrongStop = route.wrongStops.length > 0 && Math.random() < wrongChance;
  const destination = wrongStop ? pickWrongStop(route) : route.destination;
  nextMetroUseAt = state.time + route.cooldownSec + (wrongStop ? 24 : 0);

  publishMetroEvent(world, player, state, route, destination, wrongStop, wrongChance);

  return {
    route,
    destination,
    wrongStop,
    message: wrongStop
      ? `Объявление сбилось: ${route.label} стала остановкой «${destination.label}».`
      : `Состав принял маршрут: ${route.label} -> ${destination.label}.`,
    color: wrongStop ? '#f84' : '#6cf',
  };
}
