import { stampSurfaceSplat } from '../../systems/surface_marks';
import {
  Cell, DoorState, EntityType, Feature,
  LiftDirection, RoomType,
  Tex, W, ZoneFaction,
  type Entity, type GameState, type Room, 
  type WorldEvent, type WorldEventSeverity,
} from '../../core/types';
import { auditReachability, World, type ReachabilityAudit } from '../../core/world';
import { Spr } from '../../render/sprite_index';
import { publishEvent } from '../../systems/events';
import { registerRouteCue } from '../../systems/route_cues';
import { calcZoneLevel } from '../../systems/rpg';
import { placeDoorAt, stampRoom } from '../shared';
import { UNDERHELL_ROUTE_ID, UNDERHELL_Z, UNDERHELL_FLOOR, SPAWN_X, SPAWN_Y, THRESHOLD_MASK, WITNESS_MASK, UNDERHELL_THRESHOLD_CHAIN_MIN_SCORE, UNDERHELL_FLAGS, UnderhellWitnessState, UnderhellVoidGateState, UnderhellLateWarningId, UnderhellRitualState, UnderhellRitualSnapshot, UnderhellThresholdCostId, UnderhellThresholdChainRole, UnderhellThresholdChainNode, UnderhellThresholdChainScore, UnderhellSdfMetrics, UnderhellThresholdCost, UNDERHELL_THRESHOLD_COSTS, UNDERHELL_LATE_WARNINGS } from "./meta";

export function snapshotUnderhellFlags(flags: number): UnderhellRitualSnapshot {
  const thresholdCost = thresholdCostFromFlags(flags);
  const witnessState: UnderhellWitnessState =
    (flags & UNDERHELL_FLAGS.WITNESS_RESCUED) ? 'rescued'
      : (flags & UNDERHELL_FLAGS.WITNESS_SILENCED) ? 'silenced'
        : 'sealed';
  const voidGateState: UnderhellVoidGateState =
    (flags & UNDERHELL_FLAGS.VOID_GATE_OPEN) ? 'open'
      : (flags & UNDERHELL_FLAGS.VOID_ANCHOR_BROKEN) ? 'anchored'
        : 'sealed';
  return {
    thresholdPaid: thresholdCost !== 'none',
    thresholdCost,
    witnessState,
    debtBurned: (flags & UNDERHELL_FLAGS.DEBT_BURNED) !== 0,
    voidGateState,
    flags,
  };
}

export function scoreUnderhellThresholdChain(world: World, ritual: UnderhellRitualState): UnderhellThresholdChainScore {
  const audit = auditReachability(world, world.idx(SPAWN_X, SPAWN_Y));
  const reachableRooms = reachableRoomIds(world, audit);
  const nodes: UnderhellThresholdChainNode[] = [
    underhellChainNode(world, reachableRooms, 'entry', ritual.entryRoomId),
    underhellChainNode(world, reachableRooms, 'threat', ritual.thresholdRoomId),
    underhellChainNode(world, reachableRooms, 'fallback', ritual.fallbackRoomId),
    underhellChainNode(world, reachableRooms, 'reward', ritual.debtRoomId),
    underhellChainNode(world, reachableRooms, 'exit', ritual.voidGateRoomId),
  ];
  const reachableCount = nodes.reduce((sum, node) => sum + (node.reachable ? 1 : 0), 0);
  const hasRetreat = reachableRooms.has(ritual.fallbackRoomId)
    && reachableRooms.has(ritual.lowerFallbackRoomId)
    && ritual.shelterCells >= 18;
  const hasWitnessBranch = ritual.witnessRoomIds.length >= 2
    && ritual.witnessRoomIds.some(roomId => reachableRooms.has(roomId))
    && ritual.witnessDoorCells.some(cell => world.doors.has(cell));
  const hasDebtReward = reachableRooms.has(ritual.debtRoomId) && ritual.debtWellCell >= 0;
  const hasVoidExit = reachableRooms.has(ritual.voidGateRoomId)
    && ritual.voidGateCell >= 0
    && audit.reachable[ritual.voidGateCell] === 1;
  const score =
    reachableCount
    + (hasRetreat ? 1 : 0)
    + (hasWitnessBranch ? 1 : 0)
    + (hasDebtReward ? 1 : 0)
    + (hasVoidExit ? 1 : 0)
    + (ritual.capillaryCells >= 72 ? 1 : 0)
    + (ritual.tributeFrontCells >= 24 && ritual.shelterCells >= 18 ? 1 : 0);

  return {
    routeId: ritual.routeId,
    z: ritual.z,
    score,
    minScore: UNDERHELL_THRESHOLD_CHAIN_MIN_SCORE,
    nodes,
    hasRetreat,
    hasWitnessBranch,
    hasDebtReward,
    hasVoidExit,
    capillaryCells: ritual.capillaryCells,
    tributeFrontCells: ritual.tributeFrontCells,
    shelterCells: ritual.shelterCells,
  };
}

export function payUnderhellThreshold(
  state: GameState,
  player: Entity,
  ritual: UnderhellRitualState,
  costId: UnderhellThresholdCostId,
  world?: World,
): boolean {
  const cost = UNDERHELL_THRESHOLD_COSTS.find(c => c.id === costId) as UnderhellThresholdCost | undefined;
  if (!cost) return false;
  if (cost.item && !consumeInventoryItem(player, cost.item.defId, cost.item.count)) return false;
  if (cost.hp !== undefined) {
    const hp = player.hp ?? 0;
    if (hp <= cost.hp) return false;
    player.hp = hp - cost.hp;
  }

  ritual.flags = (ritual.flags & ~THRESHOLD_MASK) | cost.flag;
  publishEvent(state, {
    type: 'quest_completed',
    z: UNDERHELL_FLOOR,
    zoneId: world && player ? zoneFor(world, player) : undefined,
    actorId: player.id,
    actorName: player.name,
    actorFaction: player.faction,
    targetName: `Подпорог: ${cost.label}`,
    itemId: cost.item?.defId,
    itemCount: cost.item?.count,
    severity: 3,
    privacy: 'local',
    tags: ['underhell', 'threshold', cost.id],
    data: {
      routeId: ritual.routeId,
      z: ritual.z,
      cost: cost.label,
      hpCost: cost.hp ?? 0,
      flags: ritual.flags,
      warning: 'Порог оплачен. Проверь свидетелей и держи обратный уступ открытым до разреза.',
    },
  });

  if (cost.backlash === 'identity') {
    publishUnderhellBacklash(state, 'identity', 4, player, {
      costId,
      burnedItem: cost.item?.defId ?? '',
      consequence: 'identity_stub_missing',
    });
  }

  if (world) tryOpenUnderhellVoidGate(world, ritual);
  return true;
}

export function resolveUnderhellWitness(
  state: GameState,
  ritual: UnderhellRitualState,
  outcome: Exclude<UnderhellWitnessState, 'sealed'>,
  actor?: Entity,
  world?: World,
): void {
  ritual.flags &= ~WITNESS_MASK;
  ritual.flags |= outcome === 'rescued'
    ? UNDERHELL_FLAGS.WITNESS_RESCUED
    : UNDERHELL_FLAGS.WITNESS_SILENCED;

  if (outcome === 'rescued' && world) openWitnessCells(world, ritual);

  publishEvent(state, {
    type: outcome === 'rescued' ? 'quest_completed' : 'death_seen',
    z: UNDERHELL_FLOOR,
    zoneId: world && actor ? zoneFor(world, actor) : undefined,
    actorId: actor?.id,
    actorName: actor?.name,
    actorFaction: actor?.faction,
    targetName: outcome === 'rescued' ? 'Свидетельская клетка открыта' : 'Свидетельская клетка замолчала',
    severity: outcome === 'rescued' ? 3 : 4,
    privacy: outcome === 'rescued' ? 'witnessed' : 'secret',
    tags: ['underhell', 'witness', outcome],
    data: {
      routeId: ritual.routeId,
      z: ritual.z,
      flags: ritual.flags,
      consequence: outcome === 'rescued' ? 'witness_can_testify' : 'witness_silenced_backlash',
      warning: outcome === 'rescued'
        ? 'Свидетель вышел. Слух станет публичнее, но клетки больше не держат маршрут.'
        : 'Свидетель замолчал. Цена порога станет тайным поздним слухом.',
    },
  });
}

export function burnUnderhellDebt(
  state: GameState,
  player: Entity,
  ritual: UnderhellRitualState,
  world?: World,
): boolean {
  if (!consumeInventoryItem(player, 'forged_stamp_sheet', 1)) return false;
  ritual.flags |= UNDERHELL_FLAGS.DEBT_BURNED;
  publishUnderhellBacklash(state, 'debt', 5, player, {
    routeId: ritual.routeId,
    z: ritual.z,
    burnedItem: 'forged_stamp_sheet',
    debtClearedFor: ['market_88', 'floor_69'],
    consequence: 'future_collector_knows_player',
  });
  publishEvent(state, {
    type: 'faction_relation_changed',
    z: UNDERHELL_FLOOR,
    zoneId: world ? zoneFor(world, player) : undefined,
    actorId: player.id,
    actorName: player.name,
    actorFaction: player.faction,
    severity: 4,
    privacy: 'secret',
    tags: ['underhell', 'debt_burn', 'market_88', 'floor_69'],
    data: {
      flags: ritual.flags,
      relationDelta: -6,
      note: 'Debt erased locally; backlash is published for later market/floor hooks.',
      warning: 'Долг сожжен. Рынок и этаж 69 получат слух, но нижний уступ остается путем отхода.',
    },
  });
  return true;
}

export function breakUnderhellVoidAnchor(
  state: GameState,
  ritual: UnderhellRitualState,
  actor?: Entity,
  world?: World,
): boolean {
  ritual.flags |= UNDERHELL_FLAGS.VOID_ANCHOR_BROKEN;
  const opened = world ? tryOpenUnderhellVoidGate(world, ritual) : false;
  publishEvent(state, {
    type: 'quest_completed',
    z: UNDERHELL_FLOOR,
    zoneId: world && actor ? zoneFor(world, actor) : undefined,
    actorId: actor?.id,
    actorName: actor?.name,
    actorFaction: actor?.faction,
    targetId: ritual.voidAnchorEntityId,
    targetName: 'Идол-якорь нижнего поста',
    severity: opened ? 5 : 4,
    privacy: 'local',
    tags: ['underhell', 'void_gate', opened ? 'open' : 'anchor_broken'],
    data: {
      routeId: ritual.routeId,
      z: ritual.z,
      thresholdPaid: snapshotUnderhellFlags(ritual.flags).thresholdPaid,
      flags: ritual.flags,
      warning: opened
        ? 'Разрез открыт. Забери награду и уходи через нижний уступ или к Пустоте.'
        : 'Якорь сломан, но пост еще не оплачен. Возвращайся к трем платам, отход открыт.',
    },
  });
  return opened;
}

export function canOpenUnderhellVoidGate(flags: number): boolean {
  return (flags & THRESHOLD_MASK) !== 0 && (flags & UNDERHELL_FLAGS.VOID_ANCHOR_BROKEN) !== 0;
}

export function tryOpenUnderhellVoidGate(world: World, ritual: UnderhellRitualState): boolean {
  if (!canOpenUnderhellVoidGate(ritual.flags)) return false;
  openUnderhellVoidGate(world, ritual);
  ritual.flags |= UNDERHELL_FLAGS.VOID_GATE_OPEN;
  return true;
}

export function openUnderhellVoidGate(world: World, ritual: UnderhellRitualState): void {
  const gx = ritual.voidGateCell % W;
  const gy = (ritual.voidGateCell / W) | 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d2 = dx * dx + dy * dy;
      const ci = world.idx(gx + dx, gy + dy);
      if (d2 <= 2) {
        world.cells[ci] = Cell.FLOOR;
        world.floorTex[ci] = Tex.PORTAL;
        world.wallTex[ci] = 0;
        world.features[ci] = Feature.NONE;
      } else if (world.cells[ci] === Cell.FLOOR) {
        world.floorTex[ci] = Tex.F_VOID;
      }
    }
  }
  world.markCellsDirty();
  world.markWallTexDirty();
  world.markFloorTexDirty();
  world.markFeaturesDirty();
}

export function publishUnderhellBacklash(
  state: GameState,
  kind: 'debt' | 'identity',
  severity: WorldEventSeverity,
  actor?: Entity,
  data: Record<string, unknown> = {},
): WorldEvent {
  return publishEvent(state, {
    type: 'rumor_observed',
    z: UNDERHELL_FLOOR,
    actorId: actor?.id,
    actorName: actor?.name,
    actorFaction: actor?.faction,
    severity,
    privacy: 'secret',
    tags: ['underhell', 'backlash', kind],
    data: {
      routeId: UNDERHELL_ROUTE_ID,
      z: UNDERHELL_Z,
      warning: kind === 'identity'
        ? 'Паспортный корешок сгорел в цене порога. Следующий слух спросит фамилию.'
        : 'Сожженный долг ушел слухом наверх. Это отсрочка, не чистый выход.',
      ...data,
    },
  });
}

export function publishUnderhellLateWarning(
  state: GameState,
  warningId: UnderhellLateWarningId,
  actor?: Entity,
  world?: World,
): WorldEvent {
  const warning = UNDERHELL_LATE_WARNINGS.find(item => item.id === warningId);
  return publishEvent(state, {
    type: 'samosbor_warning',
    z: UNDERHELL_FLOOR,
    zoneId: world && actor ? zoneFor(world, actor) : undefined,
    actorId: actor?.id,
    actorName: actor?.name,
    actorFaction: actor?.faction,
    severity: 4,
    privacy: 'local',
    tags: ['underhell', 'late_warning', warningId, ...(warning?.tags ?? [])],
    data: {
      routeId: UNDERHELL_ROUTE_ID,
      z: UNDERHELL_Z,
      warningId,
      warning: warning?.warning,
    },
  });
}

export function registerUnderhellRouteCues(
  world: World,
  ritual: UnderhellRitualState,
  entry: Room,
  fallback: Room,
  threshold: Room,
  witness: Room,
  toll: Room,
  lowerFallback: Room,
  sacrifice: Room,
  gate: Room,
): void {
  const entryMarkerX = entry.x + (entry.w >> 1) + 0.5;
  const entryMarkerY = entry.y + (entry.h >> 1) + 0.5;
  const fallbackTargetX = fallback.x + (fallback.w >> 1) + 0.5;
  const fallbackTargetY = fallback.y + (fallback.h >> 1) + 0.5;
  const entryCell = world.idx(Math.floor(entryMarkerX), Math.floor(entryMarkerY));
  registerRouteCue(world, {
    id: 'underhell_root_retreat_ledge',
    x: entryMarkerX,
    y: entryMarkerY,
    targetX: fallbackTargetX,
    targetY: fallbackTargetY,
    z: UNDERHELL_FLOOR,
    roomId: entry.id,
    targetRoomId: fallback.id,
    zoneId: world.zoneMap[entryCell],
    label: 'верхний отход',
    hint: 'обратный уступ и корневая лестница ведут назад к лифту',
    targetName: 'обратный уступ',
    color: '#9cf',
    tags: ['underhell', 'retreat', 'threshold', 'warning'],
    toneSeed: ritual.seed + entry.id * 19 + fallback.id,
    radius: 10,
    targetRadius: 4,
    cooldownSec: 42,
    heardText: 'Корневой вход показывает обратный уступ: до платы отметь путь к лифту.',
    followedText: 'Обратный уступ найден. Тут есть перевязка и короткий возврат к корневому входу.',
    ignoredText: 'Пост трех оплат впереди, но верхний отход не проверен.',
  });

  const thresholdMarkerX = threshold.x + (threshold.w >> 1) + 0.5;
  const thresholdMarkerY = threshold.y + 3.5;
  const witnessTargetX = witness.x + 4.5;
  const witnessTargetY = witness.y + 4.5;
  const thresholdCell = world.idx(Math.floor(thresholdMarkerX), Math.floor(thresholdMarkerY));
  registerRouteCue(world, {
    id: 'underhell_threshold_price_echo',
    x: thresholdMarkerX,
    y: thresholdMarkerY,
    targetX: witnessTargetX,
    targetY: witnessTargetY,
    z: UNDERHELL_FLOOR,
    roomId: threshold.id,
    targetRoomId: witness.id,
    zoneId: world.zoneMap[thresholdCell],
    label: 'цена пропуска',
    hint: 'свидетели знают, чем платили',
    targetName: 'свидетельская клетка',
    color: '#f88',
    tags: ['underhell', 'late_warning', 'threshold', 'witness'],
    toneSeed: threshold.id * 1901 + witness.id,
    radius: 9,
    targetRadius: 3,
    cooldownSec: 40,
    heardText: 'У поста скребет решетка: после оплаты реши, что делать со свидетелем.',
    followedText: 'Свидетельская клетка найдена. Ее можно открыть, замолчать или оставить долг расти.',
    ignoredText: 'Цена пропуска ушла в журнал. Свидетель останется чужим поздним слухом.',
  });

  const lowerMarkerX = toll.x + (toll.w >> 1) + 0.5;
  const lowerMarkerY = toll.y + (toll.h >> 1) + 0.5;
  const lowerTargetX = lowerFallback.x + (lowerFallback.w >> 1) + 0.5;
  const lowerTargetY = lowerFallback.y + (lowerFallback.h >> 1) + 0.5;
  const lowerCell = world.idx(Math.floor(lowerMarkerX), Math.floor(lowerMarkerY));
  registerRouteCue(world, {
    id: 'underhell_lower_retreat_ledge',
    x: lowerMarkerX,
    y: lowerMarkerY,
    targetX: lowerTargetX,
    targetY: lowerTargetY,
    z: UNDERHELL_FLOOR,
    roomId: toll.id,
    targetRoomId: lowerFallback.id,
    zoneId: world.zoneMap[lowerCell],
    label: 'нижний отход',
    hint: 'долг, якорь и разрез сходятся через уступ с водой',
    targetName: 'нижний обратный уступ',
    color: '#9fd',
    tags: ['underhell', 'retreat', 'reward', 'warning'],
    toneSeed: ritual.seed + toll.id * 23 + lowerFallback.id,
    radius: 10,
    targetRadius: 4,
    cooldownSec: 44,
    heardText: 'Пошлинная палата шуршит списком: нижний уступ связывает долг, якорь и отход.',
    followedText: 'Нижний обратный уступ найден. Вода здесь не победа, а право развернуться.',
    ignoredText: 'Долг, якорь и разрез остались впереди без проверенного нижнего отхода.',
  });

  const gateMarkerX = sacrifice.x + (sacrifice.w >> 1) + 0.5;
  const gateMarkerY = sacrifice.y + sacrifice.h - 4 + 0.5;
  const gateTargetX = gate.x + (gate.w >> 1) + 0.5;
  const gateTargetY = gate.y + (gate.h >> 1) + 0.5;
  const gateCell = world.idx(Math.floor(gateMarkerX), Math.floor(gateMarkerY));
  registerRouteCue(world, {
    id: 'underhell_void_cut_darkness_trace',
    x: gateMarkerX,
    y: gateMarkerY,
    targetX: gateTargetX,
    targetY: gateTargetY,
    z: UNDERHELL_FLOOR,
    roomId: sacrifice.id,
    targetRoomId: gate.id,
    zoneId: world.zoneMap[gateCell],
    label: 'разрез после поста',
    hint: 'створка ведет к Пустоте и темному отсеку',
    targetName: 'разрез к Пустоте',
    color: '#f4a',
    tags: ['underhell', 'void_gate', 'darkness', 'warning'],
    toneSeed: ritual.seed + ritual.voidGateCell,
    radius: 10,
    targetRadius: 4,
    cooldownSec: 44,
    heardText: 'Списочная створка предупреждает: короткий разрез к Пустоте оставит мокрый след позже.',
    followedText: 'Разрез найден. Открыть его можно, но в темном отсеке останется след оплаченного маршрута.',
    ignoredText: 'Разрез остался позади. Темный отсек пока не получил этот след.',
  });
}

export function thresholdCostFromFlags(flags: number): UnderhellThresholdCostId | 'none' {
  for (const cost of UNDERHELL_THRESHOLD_COSTS) {
    if ((flags & cost.flag) !== 0) return cost.id;
  }
  return 'none';
}

export function consumeInventoryItem(entity: Entity, defId: string, count: number): boolean {
  if (!entity.inventory) return false;
  let remaining = count;
  for (const item of entity.inventory) {
    if (item.defId === defId) remaining -= item.count;
  }
  if (remaining > 0) return false;

  let need = count;
  for (let i = entity.inventory.length - 1; i >= 0 && need > 0; i--) {
    const item = entity.inventory[i];
    if (item.defId !== defId) continue;
    const take = Math.min(item.count, need);
    item.count -= take;
    need -= take;
    if (item.count <= 0) entity.inventory.splice(i, 1);
  }
  return true;
}

export function zoneFor(world: World, actor: Entity): number {
  return world.zoneMap[world.idx(Math.floor(actor.x), Math.floor(actor.y))];
}

export function reachableRoomIds(world: World, audit: ReachabilityAudit): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < world.roomMap.length; i++) {
    if (!audit.reachable[i]) continue;
    const roomId = world.roomMap[i];
    if (roomId >= 0) out.add(roomId);
  }
  return out;
}

export function underhellChainNode(
  world: World,
  reachableRooms: ReadonlySet<number>,
  role: UnderhellThresholdChainRole,
  roomId: number,
): UnderhellThresholdChainNode {
  const room = world.rooms[roomId];
  if (!room) {
    return { role, roomId, roomDefId: '', x: -1, y: -1, reachable: false };
  }
  const center = roomCenter(room);
  return {
    role,
    roomId,
    roomDefId: room.name,
    x: center.x + 0.5,
    y: center.y + 0.5,
    reachable: reachableRooms.has(roomId),
  };
}

export function paintBaseUnderhell(world: World): void {
  for (let i = 0; i < W * W; i++) {
    world.cells[i] = Cell.WALL;
    world.wallTex[i] = (i & 7) === 0 ? Tex.GUT : Tex.MEAT;
    world.floorTex[i] = 0;
    world.features[i] = Feature.NONE;
  }
}

export function createUnderhellRoom(
  world: World,
  x: number,
  y: number,
  w: number,
  h: number,
  type: RoomType,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, world.wrap(x), world.wrap(y), w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  paintRoomSkin(world, room, wallTex, floorTex);
  return room;
}

export function paintRoomSkin(world: World, room: Room, wallTex: Tex, floorTex: Tex): void {
  for (let dy = -1; dy <= room.h; dy++) {
    for (let dx = -1; dx <= room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (dx >= 0 && dx < room.w && dy >= 0 && dy < room.h) {
        world.floorTex[ci] = floorTex;
        world.wallTex[ci] = 0;
      } else {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

export function connectRooms(world: World, a: Room, b: Room, width: number, state: DoorState, floorTex: Tex = Tex.F_GUT): number[] {
  const ac = roomCenter(a);
  const bc = roomCenter(b);
  const ae = roomExitToward(world, a, bc.x, bc.y);
  const be = roomExitToward(world, b, ac.x, ac.y);
  placeDoorAt(world, ae.doorX, ae.doorY, a.id);
  placeDoorAt(world, be.doorX, be.doorY, b.id);
  configureDoor(world, a, ae.doorX, ae.doorY, state);
  configureDoor(world, b, be.doorX, be.doorY, state);
  carveRootTunnel(world, ae.outX, ae.outY, be.outX, be.outY, width, floorTex);
  return [world.idx(ae.doorX, ae.doorY), world.idx(be.doorX, be.doorY)];
}

export function roomCenter(room: Room): { x: number; y: number } {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

export function roomExitToward(world: World, room: Room, tx: number, ty: number): { doorX: number; doorY: number; outX: number; outY: number } {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  const dx = world.delta(cx, tx);
  const dy = world.delta(cy, ty);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const doorY = world.wrap(cy);
    if (dx >= 0) return { doorX: world.wrap(room.x + room.w), doorY, outX: world.wrap(room.x + room.w + 1), outY: doorY };
    return { doorX: world.wrap(room.x - 1), doorY, outX: world.wrap(room.x - 2), outY: doorY };
  }
  const doorX = world.wrap(cx);
  if (dy >= 0) return { doorX, doorY: world.wrap(room.y + room.h), outX: doorX, outY: world.wrap(room.y + room.h + 1) };
  return { doorX, doorY: world.wrap(room.y - 1), outX: doorX, outY: world.wrap(room.y - 2) };
}

export function configureDoor(world: World, room: Room, x: number, y: number, state: DoorState): void {
  const ci = world.idx(x, y);
  world.wallTex[ci] = Tex.DOOR_METAL;
  const door = world.doors.get(ci);
  if (!door) return;
  door.state = state;
  door.keyId = '';
  if (!room.doors.includes(ci)) room.doors.push(ci);
}

export function carveRootTunnel(world: World, ax: number, ay: number, bx: number, by: number, width: number, floorTex: Tex): void {
  const ddx = world.delta(ax, bx);
  const ddy = world.delta(ay, by);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ddx), Math.abs(ddy))));
  const len = Math.max(1, Math.sqrt(ddx * ddx + ddy * ddy));
  const nx = -ddy / len;
  const ny = ddx / len;
  const carved: number[] = [];

  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const wiggle = Math.sin((step + ax * 0.17 + by * 0.11) * 0.45) * width * 0.55;
    const x = world.wrap(Math.round(ax + ddx * t + nx * wiggle));
    const y = world.wrap(Math.round(ay + ddy * t + ny * wiggle));
    carveDisc(world, x, y, width, floorTex, carved);
  }

  for (const ci of carved) {
    const x = ci % W;
    const y = (ci / W) | 0;
    for (let dy2 = -1; dy2 <= 1; dy2++) {
      for (let dx2 = -1; dx2 <= 1; dx2++) {
        const ni = world.idx(x + dx2, y + dy2);
        if (world.cells[ni] === Cell.WALL) world.wallTex[ni] = Tex.GUT;
      }
    }
  }
}

export function carveDisc(world: World, cx: number, cy: number, radius: number, floorTex: Tex, carved: number[]): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + 1) continue;
      const ci = world.idx(cx + dx, cy + dy);
      if (world.cells[ci] === Cell.LIFT) continue;
      if (world.roomMap[ci] >= 0) continue;
      world.cells[ci] = Cell.FLOOR;
      world.floorTex[ci] = floorTex;
      world.wallTex[ci] = 0;
      world.features[ci] = Feature.NONE;
      carved.push(ci);
    }
  }
}

export function touchesRoomInterior(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (world.roomMap[world.idx(x + dx, y + dy)] >= 0) return true;
    }
  }
  return false;
}

export function markBridgeCandles(world: World, a: Room, b: Room, interval: number): void {
  const ac = roomCenter(a);
  const bc = roomCenter(b);
  const ddx = world.delta(ac.x, bc.x);
  const ddy = world.delta(ac.y, bc.y);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(ddx), Math.abs(ddy))));
  for (let step = interval; step < steps; step += interval) {
    const x = world.wrap(Math.round(ac.x + ddx * (step / steps)));
    const y = world.wrap(Math.round(ac.y + ddy * (step / steps)));
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0 && world.features[ci] === Feature.NONE) {
      world.features[ci] = Feature.CANDLE;
    }
  }
}

export function decorateEntry(world: World, room: Room): void {
  setFeature(world, room.x + 2, room.y + 2, Feature.LAMP);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.CANDLE);
  setFeature(world, room.x + 3, room.y + room.h - 3, Feature.SHELF);
  const liftCell = world.idx(room.x + room.w - 3, room.y + room.h - 3);
  world.cells[liftCell] = Cell.LIFT;
  world.wallTex[liftCell] = Tex.LIFT_DOOR;
  world.liftDir[liftCell] = LiftDirection.UP;
  world.features[world.idx(room.x + room.w - 4, room.y + room.h - 3)] = Feature.LIFT_BUTTON;
  stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 5, 130, 19032, 75, 18, 40, false);
}

export function decorateFallbackLedge(world: World, room: Room): void {
  setFeature(world, room.x + 2, room.y + 2, Feature.CANDLE);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
  setFeature(world, room.x + 2, room.y + room.h - 3, Feature.TABLE);
  stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 4, 110, room.id * 19039, 92, 78, 64, false);
}

export function decorateRootStair(world: World, room: Room): void {
  for (let i = 2; i < room.w - 2; i += 4) {
    setFeature(world, room.x + i, room.y + 2 + (i & 3), Feature.CANDLE);
  }
  setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.APPARATUS);
  stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 4, 130, 19040, 54, 24, 18, false);
}

export function decorateThreshold(world: World, room: Room): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, cx, cy, Feature.APPARATUS);
  for (const [dx, dy] of [[-6, -3], [0, -4], [6, -3], [-6, 3], [0, 4], [6, 3]] as const) {
    setFeature(world, cx + dx, cy + dy, Feature.CANDLE);
  }
  setFeature(world, room.x + 3, room.y + room.h - 3, Feature.SINK);
  setFeature(world, room.x + room.w - 4, room.y + room.h - 3, Feature.DESK);
  stampSurfaceSplat(world, cx, cy, 0.5, 0.5, 6, 160, 19033, 90, 12, 60, false);
}

export function decorateWitnessCell(world: World, room: Room, lit: boolean): void {
  setFeature(world, room.x + 2, room.y + 2, lit ? Feature.LAMP : Feature.CANDLE);
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.BED);
  setFeature(world, room.x + 2, room.y + room.h - 3, Feature.TABLE);
  stampSurfaceSplat(world, room.x + (room.w >> 1), room.y + (room.h >> 1), 0.5, 0.5, 3, 110, lit ? 19034 : 19035, 40, 35, 35, false);
}

export function decorateTollChamber(world: World, room: Room): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, cx, cy, Feature.DESK);
  setFeature(world, room.x + 4, cy, Feature.SHELF);
  setFeature(world, room.x + room.w - 5, cy, Feature.APPARATUS);
  for (const [dx, dy] of [[-9, -4], [-3, 4], [3, 4], [9, -4]] as const) {
    setFeature(world, cx + dx, cy + dy, Feature.CANDLE);
  }
  stampSurfaceSplat(world, cx, cy, 0.5, 0.5, 5, 130, 19041, 86, 16, 18, false);
}

export function decorateDebtWell(world: World, room: Room): number {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, room.x + 2, room.y + 2, Feature.APPARATUS);
  setFeature(world, room.x + room.w - 3, room.y + 2, Feature.SHELF);
  setFeature(world, room.x + 2, room.y + room.h - 3, Feature.CANDLE);
  setFeature(world, room.x + room.w - 3, room.y + room.h - 3, Feature.CANDLE);
  addBlackWell(world, cx, cy, 2);
  return world.idx(cx, cy);
}

export function decorateInvertedChapel(world: World, room: Room): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  for (let dx = 3; dx < room.w - 3; dx += 3) setFeature(world, room.x + dx, room.y + 2, Feature.CANDLE);
  for (let dx = 3; dx < room.w - 3; dx += 3) setFeature(world, room.x + dx, room.y + room.h - 3, Feature.CANDLE);
  setFeature(world, cx, cy + 5, Feature.APPARATUS);
  setFeature(world, cx, cy - 5, Feature.SCREEN);
  world.wallTex[world.idx(cx, room.y - 1)] = Tex.ICON;
  stampSurfaceSplat(world, cx, cy + 4, 0.5, 0.5, 7, 140, 19036, 110, 18, 45, false);
}

export function decorateSacrificeGate(world: World, room: Room): void {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, cx - 8, cy - 4, Feature.SINK);
  setFeature(world, cx, cy - 5, Feature.DESK);
  setFeature(world, cx + 8, cy - 4, Feature.APPARATUS);
  setFeature(world, cx - 8, cy + 5, Feature.CANDLE);
  setFeature(world, cx, cy + 5, Feature.CANDLE);
  setFeature(world, cx + 8, cy + 5, Feature.CANDLE);
  addBlackWell(world, cx, cy, 1);
  stampSurfaceSplat(world, cx, cy, 0.5, 0.5, 6, 150, 19042, 120, 28, 24, false);
}

export function decorateVoidGate(world: World, room: Room): number {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  setFeature(world, cx, cy - 4, Feature.CANDLE);
  setFeature(world, cx - 5, cy, Feature.CANDLE);
  setFeature(world, cx + 5, cy, Feature.CANDLE);
  setFeature(world, cx, cy + 4, Feature.APPARATUS);
  world.floorTex[world.idx(cx, cy)] = Tex.F_ABYSS;
  stampSurfaceSplat(world, cx, cy, 0.5, 0.5, 6, 180, 19037, 5, 80, 70, false);
  return world.idx(cx, cy);
}

export function addBlackWell(world: World, cx: number, cy: number, radius: number): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const ci = world.idx(cx + dx, cy + dy);
      world.cells[ci] = Cell.ABYSS;
      world.floorTex[ci] = Tex.F_ABYSS;
      world.wallTex[ci] = 0;
      world.features[ci] = Feature.NONE;
    }
  }
}

export function measureUnderhellSdfMetrics(
  world: World,
  entry: Room,
  fallback: Room,
  rootStair: Room,
  threshold: Room,
  toll: Room,
  lowerFallback: Room,
): UnderhellSdfMetrics {
  const tributeRooms = [threshold, toll];
  const shelterRooms = [entry, fallback, rootStair, lowerFallback];
  let tributeFrontCells = 0;
  let shelterCells = 0;

  for (let y = SPAWN_Y - 24; y <= SPAWN_Y + 220; y++) {
    for (let x = SPAWN_X - 96; x <= SPAWN_X + 96; x++) {
      const ci = world.idx(x, y);
      if (!isUnderhellWalkableCell(world, ci)) continue;
      const tributeD2 = minRoomCenterDist2(world, x + 0.5, y + 0.5, tributeRooms);
      const shelterD2 = minRoomCenterDist2(world, x + 0.5, y + 0.5, shelterRooms);
      if (tributeD2 <= 32 * 32 && tributeD2 <= shelterD2 * 1.18) tributeFrontCells++;
      if (shelterD2 <= 24 * 24 && shelterD2 < tributeD2) shelterCells++;
    }
  }

  return { tributeFrontCells, shelterCells };
}

export function minRoomCenterDist2(world: World, x: number, y: number, rooms: readonly Room[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const room of rooms) {
    const center = roomCenter(room);
    const d2 = world.dist2(x, y, center.x + 0.5, center.y + 0.5);
    if (d2 < best) best = d2;
  }
  return best;
}

export function isUnderhellWalkableCell(world: World, ci: number): boolean {
  const cell = world.cells[ci];
  return cell === Cell.FLOOR || cell === Cell.DOOR || cell === Cell.LIFT;
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR) world.features[ci] = feature;
}

export function retuneUnderhellZones(world: World): void {
  for (const zone of world.zones) {
    zone.level = calcZoneLevel(zone.cx, zone.cy, 180) + 5;
    const roll = Math.abs(Math.sin((zone.cx * 12.9898 + zone.cy * 78.233 + 19) * 0.01));
    zone.faction = roll < 0.62 ? ZoneFaction.CULTIST : roll < 0.84 ? ZoneFaction.WILD : ZoneFaction.LIQUIDATOR;
    zone.hqRoomId = -1;
  }
}

export function addItemDrop(
  entities: Entity[],
  nextId: { v: number },
  x: number,
  y: number,
  defId: string,
  count: number,
): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId, count }],
  });
}

export function addNote(entities: Entity[], nextId: { v: number }, x: number, y: number, text: string): void {
  entities.push({
    id: nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{ defId: 'note', count: 1, data: { text } }],
  });
}

export function openWitnessCells(world: World, ritual: UnderhellRitualState): void {
  for (const doorCell of ritual.witnessDoorCells) {
    const door = world.doors.get(doorCell);
    if (door) {
      door.state = DoorState.HERMETIC_OPEN;
      door.timer = 0;
    }
    world.cells[doorCell] = Cell.DOOR;
    world.wallTex[doorCell] = Tex.DOOR_METAL;
  }
}

