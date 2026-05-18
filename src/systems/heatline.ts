/* ── Heatline Zero inspection helpers ───────────────────────────
 * Static hazard rooms only: no pressure tick, no cell heat field.
 */

import {
  Cell, EntityType, Feature, FloorLevel, RoomType,
  type Entity, type GameState, type Room,
  msg,
} from '../core/types';
import { World } from '../core/world';
import { addItem, hasItem, removeItem } from './inventory';
import { publishEvent } from './events';

const HEATLINE_PREFIX = 'Теплотрасса Ноль';
const HEATLINE_RESOLVED = 'сброс открыт';

let nextPressureUseAt = 0;
let pressureCooldownState: GameState | null = null;

function isHeatlineRoom(room: Room): boolean {
  return room.name.includes(HEATLINE_PREFIX);
}

function heatTag(room: Room): string {
  if (room.name.includes('обваренный')) return 'hazard';
  if (room.name.includes('обход')) return 'safe';
  if (room.name.includes('ремонт')) return 'repair';
  if (room.name.includes('вентиль')) return 'valve';
  return 'static';
}

function roomTypeName(type: RoomType): string {
  switch (type) {
    case RoomType.BATHROOM: return 'bath';
    case RoomType.CORRIDOR: return 'corridor';
    case RoomType.PRODUCTION: return 'prod';
    case RoomType.STORAGE: return 'store';
    default: return `type${type}`;
  }
}

function heatlineRooms(world: World): Room[] {
  return world.rooms.filter(r => r && isHeatlineRoom(r));
}

function heatlineResolved(world: World): boolean {
  return heatlineRooms(world).some(room => room.name.includes(HEATLINE_RESOLVED));
}

function findHeatlineRoom(world: World, tag: string): Room | undefined {
  return heatlineRooms(world).find(room => heatTag(room) === tag);
}

function isPressureTarget(feature: Feature): boolean {
  return feature === Feature.MACHINE || feature === Feature.APPARATUS || feature === Feature.LAMP;
}

function pressureTargetRoom(world: World, lookX: number, lookY: number): Room | null {
  const x = world.wrap(Math.floor(lookX));
  const y = world.wrap(Math.floor(lookY));
  const ci = world.idx(x, y);
  if (!isPressureTarget(world.features[ci] as Feature)) return null;

  const roomId = world.roomMap[ci];
  if (roomId < 0) return null;
  const room = world.rooms[roomId];
  if (!room || !isHeatlineRoom(room)) return null;

  const tag = heatTag(room);
  return tag === 'valve' || tag === 'repair' || tag === 'hazard' ? room : null;
}

function pressureCooldownReady(state: GameState): boolean {
  if (pressureCooldownState !== state || nextPressureUseAt > state.time + 10) {
    pressureCooldownState = state;
    nextPressureUseAt = 0;
  }
  return state.time >= nextPressureUseAt;
}

function forRoomCells(world: World, room: Room, fn: (ci: number, x: number, y: number) => void): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const x = world.wrap(room.x + dx);
      const y = world.wrap(room.y + dy);
      fn(world.idx(x, y), x, y);
    }
  }
}

function setRoomFog(world: World, room: Room, density: number, mode: 'set' | 'max' | 'min'): void {
  forRoomCells(world, room, ci => {
    const cell = world.cells[ci];
    if (cell === Cell.WALL || cell === Cell.LIFT) return;
    if (mode === 'set') world.fog[ci] = density;
    else if (mode === 'max') world.fog[ci] = Math.max(world.fog[ci], density);
    else world.fog[ci] = Math.min(world.fog[ci], density);
  });
}

function stampSteamResidue(world: World, room: Room, seedBase: number, hot: boolean): void {
  const y = room.y + Math.floor(room.h / 2);
  for (let dx = 2; dx < room.w - 2; dx += 4) {
    world.stamp(
      room.x + dx, y,
      0.5, 0.5, hot ? 0.36 : 0.24,
      hot ? 130 : 80,
      seedBase + room.id * 31 + dx,
      hot ? 120 : 55,
      hot ? 45 : 105,
      hot ? 12 : 110,
    );
  }
}

function damagePlayer(player: Entity, amount: number): void {
  if (player.hp === undefined) return;
  player.hp = Math.max(1, player.hp - amount);
}

function publishHeatlineEvent(
  world: World,
  player: Entity,
  state: GameState,
  room: Room,
  outcome: 'repair' | 'shortcut' | 'failure' | 'blocked',
  severity: 2 | 3 | 4,
  data: Record<string, unknown>,
): void {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  const ci = world.idx(px, py);
  publishEvent(state, {
    type: 'player_use_item',
    zoneId: world.zoneMap[ci],
    roomId: room.id,
    x: player.x,
    y: player.y,
    actorId: player.id,
    actorName: player.name ?? 'Вы',
    actorFaction: player.faction,
    itemId: outcome === 'failure' ? 'manometer' : 'sealant_tube',
    itemName: outcome === 'failure' ? 'Манометр' : 'Герметик',
    severity,
    privacy: player.type === EntityType.PLAYER ? 'local' : 'private',
    tags: ['player', 'maintenance', 'heatline', 'pressure', outcome],
    data: {
      system: 'heatline_zero',
      outcome,
      roomName: room.name,
      ...data,
    },
  });
}

function applyPressureResolution(world: World, clean: boolean): void {
  const valve = findHeatlineRoom(world, 'valve');
  const hazard = findHeatlineRoom(world, 'hazard');
  const safe = findHeatlineRoom(world, 'safe');
  const repair = findHeatlineRoom(world, 'repair');
  const hazardId = hazard?.id ?? -1;

  if (valve) valve.name = clean
    ? 'Теплотрасса Ноль: ручной сброс открыт давление 0'
    : 'Теплотрасса Ноль: ручной сброс открыт без стрелки';
  if (hazard) hazard.name = clean
    ? 'Теплотрасса Ноль: остывший короткий ход жар 0 давление 0'
    : 'Теплотрасса Ноль: слепой короткий ход пар 1 давление 0';
  if (safe) safe.name = clean
    ? 'Теплотрасса Ноль: душевой обход резерв'
    : 'Теплотрасса Ноль: душевой обход мокрый резерв';
  if (repair) repair.name = clean
    ? 'Теплотрасса Ноль: ремонтный ящик опечатан после сброса'
    : 'Теплотрасса Ноль: ремонтный ящик пуст после слепого сброса';

  for (const room of heatlineRooms(world)) {
    const isHazard = room.id === hazardId;
    if (clean || !isHazard) setRoomFog(world, room, 0, 'set');
    else setRoomFog(world, room, 75, 'min');
    stampSteamResidue(world, room, clean ? 6100 : 7200, !clean && isHazard);
  }
  world.markFogDirty();
}

function applyPressureFailure(world: World): void {
  for (const room of heatlineRooms(world)) {
    const tag = heatTag(room);
    if (tag === 'safe') continue;
    setRoomFog(world, room, tag === 'hazard' ? 155 : 95, 'max');
    stampSteamResidue(world, room, 8300, true);
  }
  world.markFogDirty();
}

export function tryUseHeatlinePressure(
  world: World,
  player: Entity,
  state: GameState,
  lookX: number,
  lookY: number,
): boolean {
  const room = pressureTargetRoom(world, lookX, lookY);
  if (!room) return false;

  if (state.currentFloor !== FloorLevel.MAINTENANCE) return false;
  if (!pressureCooldownReady(state)) {
    state.msgs.push(msg('Вентиль еще стучит после прошлого поворота.', state.time, '#888'));
    return true;
  }
  nextPressureUseAt = state.time + 1.2;

  if (heatlineResolved(world)) {
    state.msgs.push(msg('Теплотрасса уже сброшена. Короткий ход условно безопасен.', state.time, '#8cf'));
    publishHeatlineEvent(world, player, state, room, 'blocked', 2, { reason: 'already_resolved' });
    return true;
  }

  const hasCord = hasItem(player, 'asbestos_cord');
  const hasSealant = hasItem(player, 'sealant_tube');
  const hasGauge = hasItem(player, 'manometer');

  if (hasCord && hasSealant && hasGauge) {
    removeItem(player, 'asbestos_cord', 1);
    removeItem(player, 'sealant_tube', 1);
    applyPressureResolution(world, true);
    addItem(player, 'valve_tag', 1);
    addItem(player, 'filtered_water', 1);
    state.msgs.push(msg('Манометр дрогнул и успокоился. Давление сброшено, короткий ход остыл.', state.time, '#6cf'));
    publishHeatlineEvent(world, player, state, room, 'repair', 4, {
      consumed: ['asbestos_cord', 'sealant_tube'],
      checkedWith: 'manometer',
      reward: ['valve_tag', 'filtered_water'],
    });
    nextPressureUseAt = state.time + 2.5;
    return true;
  }

  if (hasCord && hasSealant) {
    removeItem(player, 'asbestos_cord', 1);
    removeItem(player, 'sealant_tube', 1);
    applyPressureResolution(world, false);
    damagePlayer(player, 10);
    addItem(player, 'valve_tag', 1);
    state.msgs.push(msg('Слепой сброс сработал. Пар ушел в соседей, коридор открыт, кожа спорит.', state.time, '#fa4'));
    publishHeatlineEvent(world, player, state, room, 'shortcut', 4, {
      consumed: ['asbestos_cord', 'sealant_tube'],
      missing: 'manometer',
      damage: 10,
      reward: ['valve_tag'],
    });
    nextPressureUseAt = state.time + 3.5;
    return true;
  }

  applyPressureFailure(world);
  damagePlayer(player, 16);
  state.msgs.push(msg('Вентиль сорвался паром. Нужны асбестовый шнур и герметик; манометр спасет кожу.', state.time, '#f84'));
  publishHeatlineEvent(world, player, state, room, 'failure', 3, {
    missing: [
      ...(hasCord ? [] : ['asbestos_cord']),
      ...(hasSealant ? [] : ['sealant_tube']),
      ...(hasGauge ? [] : ['manometer']),
    ],
    damage: 16,
  });
  nextPressureUseAt = state.time + 5;
  return true;
}

export function summarizeHeatline(world: World, limit = 8): string[] {
  const rooms = heatlineRooms(world);
  if (rooms.length === 0) return ['[HEATLINE] узлы не найдены на этом этаже'];

  let hazard = 0;
  let safe = 0;
  let repair = 0;
  const zones = new Set<number>();
  for (const room of rooms) {
    const tag = heatTag(room);
    if (tag === 'hazard') hazard++;
    if (tag === 'safe') safe++;
    if (tag === 'repair') repair++;
    const ci = world.idx(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
    zones.add(world.zoneMap[ci]);
  }

  const lines = [
    `[HEATLINE] rooms=${rooms.length} hazard=${hazard} safe=${safe} repair=${repair} resolved=${heatlineResolved(world) ? 1 : 0} zones=${[...zones].map(z => z + 1).join(',')}`,
  ];
  for (const room of rooms.slice(0, limit)) {
    lines.push(`[HEATLINE] #${room.id} ${heatTag(room)} ${roomTypeName(room.type)} ${room.name}`);
  }
  return lines;
}
