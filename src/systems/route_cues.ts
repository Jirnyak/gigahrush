/* ── Bounded route cues: generated markers -> rare audio/HUD hints ─ */

import {
  EntityType, msg,
  type Entity, type FloorLevel, type GameState, type WorldEventSeverity,
} from '../core/types';
import { type World } from '../core/world';
import { playRouteCueTone, playSoundAt } from './audio';
import { publishEvent } from './events';

export interface RouteCueMarker {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  floor: FloorLevel;
  label: string;
  hint: string;
  targetName: string;
  color: string;
  tags: readonly string[];
  toneSeed: number;
  radius?: number;
  targetRadius?: number;
  cooldownSec?: number;
  roomId?: number;
  targetRoomId?: number;
  zoneId?: number;
  heardText?: string;
  followedText?: string;
  ignoredText?: string;
}

export interface RouteCueHud {
  id: string;
  floor: FloorLevel;
  label: string;
  hint: string;
  targetName: string;
  color: string;
  targetX: number;
  targetY: number;
  startedAt: number;
  expiresAt: number;
}

interface RouteCueWorldState {
  markers: RouteCueMarker[];
  nextScanAt: number;
  heardAt: Map<string, number>;
  lastPlayedAt: Map<string, number>;
  followed: Set<string>;
  ignored: Set<string>;
}

const cueByWorld = new WeakMap<World, RouteCueWorldState>();
let activeHud: RouteCueHud | null = null;

function cueState(world: World): RouteCueWorldState {
  let state = cueByWorld.get(world);
  if (!state) {
    state = {
      markers: [],
      nextScanAt: 0,
      heardAt: new Map(),
      lastPlayedAt: new Map(),
      followed: new Set(),
      ignored: new Set(),
    };
    cueByWorld.set(world, state);
  }
  return state;
}

function normalizedMarker(marker: RouteCueMarker): RouteCueMarker {
  return {
    ...marker,
    radius: marker.radius ?? 9,
    targetRadius: marker.targetRadius ?? 2.6,
    cooldownSec: marker.cooldownSec ?? 26,
  };
}

export function registerRouteCue(world: World, marker: RouteCueMarker): void {
  const state = cueState(world);
  const next = normalizedMarker(marker);
  const existing = state.markers.findIndex(m => m.id === next.id);
  if (existing >= 0) state.markers[existing] = next;
  else state.markers.push(next);
}

export function routeCueCount(world: World): number {
  return cueByWorld.get(world)?.markers.length ?? 0;
}

function nearestMarker(world: World, player: Entity): RouteCueMarker | undefined {
  const state = cueByWorld.get(world);
  if (!state || state.markers.length === 0) return undefined;
  let best: RouteCueMarker | undefined;
  let bestD2 = Infinity;
  for (const marker of state.markers) {
    const d2 = world.dist2(player.x, player.y, marker.x, marker.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = marker;
    }
  }
  return best;
}

function eventSeverity(action: string): WorldEventSeverity {
  return action === 'followed' ? 4 : 3;
}

function publishCueEvent(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  action: 'heard' | 'inspected' | 'followed' | 'ignored' | 'debug',
): void {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const ci = world.idx(px, py);
  publishEvent(state, {
    type: 'rumor_observed',
    floor: marker.floor,
    zoneId: marker.zoneId ?? world.zoneMap[ci],
    roomId: action === 'followed' ? marker.targetRoomId : marker.roomId,
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    targetName: marker.targetName,
    severity: eventSeverity(action),
    privacy: player.type === EntityType.PLAYER ? 'local' : 'private',
    tags: ['route_cue', action, ...marker.tags],
    data: {
      cueId: marker.id,
      action,
      label: marker.label,
      hint: marker.hint,
      targetName: marker.targetName,
      targetX: Math.round(marker.targetX),
      targetY: Math.round(marker.targetY),
      distanceCells: Math.round(world.dist(player.x, player.y, marker.targetX, marker.targetY)),
    },
  });
}

function cueMessage(marker: RouteCueMarker, action: string): string {
  if (action === 'followed') return marker.followedText ?? `Пение вывело к цели: ${marker.targetName}.`;
  if (action === 'ignored') return marker.ignoredText ?? `Пение вентиля осталось позади: ${marker.targetName} не проверена.`;
  return marker.heardText ?? `Вентиляция поет: ${marker.hint}`;
}

function setCueHud(state: GameState, marker: RouteCueMarker): void {
  activeHud = {
    id: marker.id,
    floor: marker.floor,
    label: marker.label,
    hint: marker.hint,
    targetName: marker.targetName,
    color: marker.color,
    targetX: marker.targetX,
    targetY: marker.targetY,
    startedAt: state.time,
    expiresAt: state.time + 7,
  };
}

function triggerCue(
  world: World,
  player: Entity,
  state: GameState,
  marker: RouteCueMarker,
  action: 'heard' | 'inspected' | 'followed' | 'ignored' | 'debug',
  forceSound: boolean,
): void {
  const cueWorld = cueState(world);
  const now = state.time;
  if (action === 'heard' || action === 'inspected' || action === 'debug') {
    cueWorld.heardAt.set(marker.id, now);
    const last = cueWorld.lastPlayedAt.get(marker.id) ?? -Infinity;
    if (forceSound || now - last >= (marker.cooldownSec ?? 26)) {
      cueWorld.lastPlayedAt.set(marker.id, now);
      playSoundAt(() => playRouteCueTone(marker.toneSeed, action === 'debug' ? 1.15 : 1), marker.x, marker.y);
    }
    setCueHud(state, marker);
  }

  if (action === 'followed') cueWorld.followed.add(marker.id);
  if (action === 'ignored') cueWorld.ignored.add(marker.id);

  state.msgs.push(msg(cueMessage(marker, action), now, action === 'ignored' ? '#888' : marker.color));
  publishCueEvent(world, player, state, marker, action);
}

export function updateRouteCues(world: World, player: Entity, state: GameState): void {
  const cueWorld = cueByWorld.get(world);
  if (!cueWorld || cueWorld.markers.length === 0) return;
  if (state.time < cueWorld.nextScanAt) return;
  cueWorld.nextScanAt = state.time + 0.45;

  for (const marker of cueWorld.markers) {
    const heardAt = cueWorld.heardAt.get(marker.id);
    if (heardAt !== undefined && !cueWorld.followed.has(marker.id)) {
      const targetRadius = marker.targetRadius ?? 2.6;
      if (world.dist2(player.x, player.y, marker.targetX, marker.targetY) <= targetRadius * targetRadius) {
        triggerCue(world, player, state, marker, 'followed', false);
        continue;
      }
      const radius = marker.radius ?? 9;
      if (!cueWorld.ignored.has(marker.id) && state.time - heardAt > 32 &&
          world.dist2(player.x, player.y, marker.x, marker.y) > (radius + 18) * (radius + 18)) {
        triggerCue(world, player, state, marker, 'ignored', false);
        continue;
      }
    }

    const radius = marker.radius ?? 9;
    if (world.dist2(player.x, player.y, marker.x, marker.y) > radius * radius) continue;
    const last = cueWorld.lastPlayedAt.get(marker.id) ?? -Infinity;
    if (state.time - last >= (marker.cooldownSec ?? 26)) {
      triggerCue(world, player, state, marker, 'heard', false);
      break;
    }
  }
}

function markerAtLook(
  world: World,
  player: Entity,
  lookX: number,
  lookY: number,
): RouteCueMarker | undefined {
  const cueWorld = cueByWorld.get(world);
  if (!cueWorld || cueWorld.markers.length === 0) return undefined;
  const lx = Math.floor(lookX) + 0.5;
  const ly = Math.floor(lookY) + 0.5;
  for (const marker of cueWorld.markers) {
    if (world.dist2(lx, ly, marker.x, marker.y) > 2.25) continue;
    if (world.dist2(player.x, player.y, marker.x, marker.y) > 12.25) continue;
    return marker;
  }
  return undefined;
}

export function isRouteCueTarget(world: World, player: Entity, lookX: number, lookY: number): boolean {
  return markerAtLook(world, player, lookX, lookY) !== undefined;
}

export function tryUseRouteCue(
  world: World,
  player: Entity,
  state: GameState,
  lookX: number,
  lookY: number,
): boolean {
  const marker = markerAtLook(world, player, lookX, lookY);
  if (!marker) return false;
  triggerCue(world, player, state, marker, 'inspected', true);
  return true;
}

export function debugTriggerRouteCue(world: World, player: Entity, state: GameState): string[] {
  const marker = nearestMarker(world, player);
  if (!marker) {
    playSoundAt(() => playRouteCueTone(75075, 1.15), player.x, player.y);
    activeHud = {
      id: 'debug_route_cue',
      floor: state.currentFloor,
      label: 'DEBUG route cue',
      hint: 'local audio/HUD smoke',
      targetName: 'debug marker',
      color: '#9f7',
      targetX: player.x + Math.cos(player.angle) * 8,
      targetY: player.y + Math.sin(player.angle) * 8,
      startedAt: state.time,
      expiresAt: state.time + 5,
    };
    publishEvent(state, {
      type: 'rumor_observed',
      x: player.x,
      y: player.y,
      actorId: player.id,
      actorName: player.name ?? 'Вы',
      actorFaction: player.faction,
      targetName: 'debug route cue',
      severity: 2,
      privacy: 'private',
      tags: ['route_cue', 'debug', 'audio_smoke'],
      data: { cueId: 'debug_route_cue', action: 'debug_no_marker' },
    });
    return ['no registered route cue; played local route-cue smoke'];
  }

  triggerCue(world, player, state, marker, 'debug', true);
  return [
    `${marker.id}: ${Math.round(world.dist(player.x, player.y, marker.x, marker.y))} cells to cue`,
    `target: ${marker.targetName}, ${Math.round(world.dist(player.x, player.y, marker.targetX, marker.targetY))} cells`,
  ];
}

export function getActiveRouteCueHud(time: number, floor: FloorLevel): RouteCueHud | null {
  if (!activeHud || activeHud.expiresAt < time || activeHud.floor !== floor) return null;
  return activeHud;
}
