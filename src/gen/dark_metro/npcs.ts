/* ── Design z: dark_metro / Темная пересадка ─────────────── */

import {
  AIGoal,
  Cell,
  ContainerKind,
  EntityType,
  Faction,
  Feature,
  MonsterKind,
  RoomType,
  W,
  type Entity,
  type RailTrainTrack,
  type Room,
  type TerritoryOwner,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { HUMAN_TERRITORY_OWNERS } from '../../data/factions';
import { type PlotNpcDef } from '../../data/plot';
import { MONSTERS } from '../../entities/monster';
import { Spr } from '../../render/sprite_index';
import { addRailTrainRoute } from '../../systems/rail_trains';
import { registerRouteCue } from '../../systems/route_cues';
import { randomRPG, scaleMonsterHp, scaleMonsterSpeed } from '../../systems/rpg';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { territoryOwnerAtIndex } from '../../systems/territory';

import {
  DARK_METRO_BASE_FLOOR,
  DarkMetroPackedState,
  DARK_METRO_ROUTES,
  DARK_METRO_AMBUSH_CUES,
  NORA_DEF,
  VENDOR_DEF,
  STRANDED_DEF,
  MISHA_DEF,
  unpackDarkMetroState,
  BuildCtx,
  DARK_METRO_FULL_LINE_YS} from './meta';
import {
  DarkMetroLayout,
  setFeature} from './geometry';

export function nextDarkMetroContainerId(world: World): number {
  let next = 1;
  for (const container of world.containers) next = Math.max(next, container.id + 1);
  return next;
}

export function addDarkMetroTransitCache(world: World, room: Room, x: number, y: number, line: number, slot: number): void {
  const inventory: WorldContainer['inventory'] = line % 3 === 0
    ? [{ defId: 'metro_ticket', count: 1 }, { defId: 'ammo_9mm', count: 10 }, { defId: 'bandage', count: 1 }]
    : line % 3 === 1
      ? [{ defId: 'fuse', count: 1 }, { defId: 'lamp_bulb', count: 1 }, { defId: 'water', count: 1 }]
      : [{ defId: 'gasmask_filter', count: 1 }, { defId: 'ammo_9mm', count: 6 }, { defId: 'metro_ticket', count: 1 }];
  const ci = world.idx(x, y);
  world.addContainer({
    id: nextDarkMetroContainerId(world),
    x,
    y,
    z: DARK_METRO_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[ci],
    kind: slot === 0 ? ContainerKind.TOOL_LOCKER : ContainerKind.EMERGENCY_BOX,
    name: slot === 0 ? `Постовой ящик линии ${line + 1}` : `Аварийный кэш линии ${line + 1}`,
    inventory,
    capacitySlots: 8,
    ownerName: 'пост белой лампы',
    faction: Faction.LIQUIDATOR,
    access: slot === 0 ? 'faction' : 'locked',
    lockDifficulty: slot === 0 ? undefined : 4,
    discovered: true,
    tags: ['dark_metro', 'transit_cache', 'platform', 'train_risk'],
  });
}

export function nextTrainEntityId(entities: Entity[]): { v: number } {
  return { v: entities.reduce((mx, e) => Math.max(mx, e.id), 0) + 1 };
}

export function addPlatformCells(world: World, out: number[], x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    const ci = world.idx(x, y);
    if (world.cells[ci] !== Cell.LIFT && world.cells[ci] !== Cell.WALL) out.push(ci);
  }
}

export function seedCoreMetroTrain(ctx: BuildCtx, layout: DarkMetroLayout): void {
  const y = layout.platform.y + layout.platform.h - 2;
  const cells: number[] = [];
  for (let x = layout.platform.x + 2; x < layout.platform.x + layout.platform.w - 2; x++) {
    const ci = ctx.world.idx(x, y);
    if (ctx.world.cells[ci] === Cell.WATER) cells.push(ci);
  }
  const platformCells: number[] = [];
  addPlatformCells(ctx.world, platformCells, layout.platform.x + 3, layout.platform.x + layout.platform.w - 4, y - 3);
  const track: RailTrainTrack = {
    id: 'dark_metro_platform_loop',
    label: 'Петля платформы',
    cells,
    stationOffsets: [Math.floor(cells.length / 2)],
    platformCells,
    loop: true,
  };
  addRailTrainRoute(ctx.world, ctx.entities, ctx.nextId, track, {
    id: 'dark_metro_platform_train',
    label: 'Короткий состав платформы',
    speed: 3.4,
    length: 7,
    initialOffset: track.stationOffsets[0],
    stopSeconds: 3.8,
  });
}

export function buildFullFloorMetroTrack(world: World, lineY: number, line: number): RailTrainTrack | null {
  const trackY = lineY + (line % 2 === 0 ? 6 : -5);
  const platformY = lineY + (line % 2 === 0 ? 12 : -11);
  const cells: number[] = [];
  for (let x = 48; x < W - 48; x++) {
    const ci = world.idx(x, trackY);
    if (world.cells[ci] === Cell.WATER) cells.push(ci);
  }
  if (cells.length < 180) return null;

  const platformCells: number[] = [];
  const stationOffsets: number[] = [];
  const stations = [
    132 + line * 11,
    398 + (line % 2) * 54,
    690 - (line % 3) * 23,
    884 - line * 7,
  ];
  for (const sx of stations) {
    const x = Math.max(72, Math.min(W - 72, sx));
    let bestOffset = 0;
    let bestD = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const cx = cells[i] % W;
      const d = Math.abs(world.delta(cx, x));
      if (d < bestD) {
        bestD = d;
        bestOffset = i;
      }
    }
    stationOffsets.push(bestOffset);
    for (let dx = -13; dx <= 13; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const ci = world.idx(x + dx, platformY + dy);
        if (world.cells[ci] !== Cell.LIFT && world.cells[ci] !== Cell.WALL) platformCells.push(ci);
      }
    }
    setFeature(world, x, platformY, Feature.SCREEN);
    setFeature(world, x + 8, platformY, Feature.LAMP);
  }

  return {
    id: `dark_metro_line_${line + 1}`,
    label: `Линия ${line + 1}`,
    cells,
    stationOffsets,
    platformCells,
    loop: true,
  };
}

export function seedFullFloorMetroTrains(world: World, entities: Entity[]): void {
  const nextId = nextTrainEntityId(entities);
  for (let i = 0; i < DARK_METRO_FULL_LINE_YS.length; i++) {
    const track = buildFullFloorMetroTrack(world, DARK_METRO_FULL_LINE_YS[i], i);
    if (!track) continue;
    addRailTrainRoute(world, entities, nextId, track, {
      id: `${track.id}_train`,
      label: i % 3 === 0 ? `Состав ${i + 1} без машиниста` : `Состав ${i + 1}`,
      speed: 4.8 + i * 0.45,
      length: 11 + (i % 3),
      direction: i % 2 === 0 ? 1 : -1,
      initialOffset: track.stationOffsets[0],
      stopSeconds: 3.4,
    });
  }
}

export function spawnDarkMetroNpcs(ctx: BuildCtx, layout: DarkMetroLayout): void {
  spawnPlotNpc(ctx, 'dark_metro_dispatcher_nora', NORA_DEF, layout.signal.x + 5, layout.signal.y + 5, Math.PI);
  spawnPlotNpc(ctx, 'dark_metro_lamp_vendor', VENDOR_DEF, layout.kiosk.x + 4, layout.kiosk.y + 5, 0);
  spawnPlotNpc(ctx, 'dark_metro_stranded_liquidator', STRANDED_DEF, layout.blindTunnel.x + 7, layout.blindTunnel.y + 2, 0);
  spawnPlotNpc(ctx, 'dark_metro_child_omen_misha', MISHA_DEF, layout.hall.x + 23, layout.hall.y + 13, Math.PI * 0.5, {
    canGiveQuest: false,
    spriteScale: 0.65,
  });
}

export function spawnPlotNpc(
  ctx: BuildCtx,
  npcId: string,
  _def: PlotNpcDef,
  x: number,
  y: number,
  angle: number,
  extra?: Partial<Entity>,
): void {
  const px = x + 0.5;
  const py = y + 0.5;
  requireSpawnedPlotNpcFromPackage(ctx.entities, ctx.nextId, npcId, px, py, {
    angle,
    aiTarget: { x: px, y: py },
    extra,
  });
}

export function spawnDarkMetroLoot(ctx: BuildCtx, layout: DarkMetroLayout): void {
  dropItem(ctx, layout.platform.x + 5, layout.platform.y + 5, 'metro_ticket', 1);
  dropItem(ctx, layout.platform.x + 13, layout.platform.y + 4, 'note', 1, DARK_METRO_ROUTES[2].clue);
  dropItem(ctx, layout.underpass.x + 2, layout.underpass.y + 6, 'note', 1, DARK_METRO_AMBUSH_CUES[0].warning);
  dropItem(ctx, layout.underpass.x + 5, layout.underpass.y + 10, 'lamp_bulb', 1);
  dropItem(ctx, layout.blindTunnel.x + 19, layout.blindTunnel.y + 2, 'bandage', 1);
  dropItem(ctx, layout.exit.x + 4, layout.exit.y + 4, 'fuse', 1);

  addContainer(ctx, layout.kiosk, layout.kiosk.x + 2, layout.kiosk.y + 2, ContainerKind.CASHBOX, 'Касса ламповщика', [
    { defId: 'metro_ticket', count: 4 },
    { defId: 'lamp_bulb', count: 3 },
    { defId: 'cigs', count: 2 },
  ], 'owner', Faction.CITIZEN, VENDOR_DEF.name, ['dark_metro', 'tickets', 'light']);

  addContainer(ctx, layout.signal, layout.signal.x + 11, layout.signal.y + 5, ContainerKind.TOOL_LOCKER, 'Шкаф сигнальной будки', [
    { defId: 'fuse', count: 2 },
    { defId: 'relay_diagram', count: 1 },
    { defId: 'circuit_board', count: 1 },
    { defId: 'inspection_mirror', count: 1 },
  ], 'locked', Faction.CITIZEN, NORA_DEF.name, ['dark_metro', 'signal', 'repair']);

  addContainer(ctx, layout.hall, layout.hall.x + 3, layout.hall.y + layout.hall.h - 3, ContainerKind.EMERGENCY_BOX, 'Аварийный ящик белой петли', [
    { defId: 'water', count: 1 },
    { defId: 'bandage', count: 1 },
    { defId: 'flashlight', count: 1 },
  ], 'public', undefined, undefined, ['dark_metro', 'fallback', 'light']);
}

export function addContainer(
  ctx: BuildCtx,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  inventory: WorldContainer['inventory'],
  access: WorldContainer['access'],
  faction: Faction | undefined,
  ownerName: string | undefined,
  tags: string[],
): void {
  const ci = ctx.world.idx(x, y);
  ctx.world.addContainer({
    id: ctx.nextContainerId.v++,
    x,
    y,
    z: DARK_METRO_BASE_FLOOR,
    roomId: room.id,
    zoneId: ctx.world.zoneMap[ci],
    kind,
    name,
    inventory,
    capacitySlots: 8,
    ownerName,
    faction,
    access,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: true,
    tags,
  });
  setFeature(ctx.world, x, y, Feature.SHELF);
}

export function dropItem(ctx: BuildCtx, x: number, y: number, defId: string, count = 1, noteText?: string): void {
  ctx.entities.push({
    id: ctx.nextId.v++,
    type: EntityType.ITEM_DROP,
    x: x + 0.5,
    y: y + 0.5,
    angle: 0,
    pitch: 0,
    alive: true,
    speed: 0,
    sprite: Spr.ITEM_DROP,
    inventory: [{
      defId,
      count,
      data: noteText,
    }],
  });
}

export function spawnDarkMetroThreats(ctx: BuildCtx, layout: DarkMetroLayout): void {
  spawnMonster(ctx, MonsterKind.SHADOW, layout.blindTunnel.x + 26, layout.blindTunnel.y + 2, layout.hall);
  spawnMonster(ctx, MonsterKind.LAMPOVY, layout.platform.x + 31, layout.platform.y + 5, layout.hall);
  spawnMonster(ctx, MonsterKind.REBAR, layout.underpass.x + 4, layout.underpass.y + 16, layout.hall);
  spawnMonster(ctx, MonsterKind.TUBE_EEL, layout.platform.x + 20, layout.platform.y + 7, layout.hall);
}

export function spawnMonster(ctx: BuildCtx, kind: MonsterKind, x: number, y: number, anchor: Room): void {
  const def = MONSTERS[kind];
  if (!def) return;
  const ci = ctx.world.idx(x, y);
  const zone = ctx.world.zones[ctx.world.zoneMap[ci]];
  const zoneLevel = zone?.level ?? 4;
  const hp = scaleMonsterHp(def.hp, zoneLevel);
  const monster: Entity = {
    id: ctx.nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: Math.atan2(anchor.y + anchor.h / 2 - y, anchor.x + anchor.w / 2 - x),
    pitch: 0,
    alive: true,
    speed: scaleMonsterSpeed(def.speed, zoneLevel),
    sprite: def.sprite,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: anchor.x + Math.floor(anchor.w / 2), ty: anchor.y + Math.floor(anchor.h / 2), path: [], pi: 0, stuck: 0, timer: 0 },
    rpg: randomRPG(zoneLevel),
  };
  ctx.entities.push(monster);
}

export function registerDarkMetroRouteCues(ctx: BuildCtx, layout: DarkMetroLayout): void {
  const ambushMarkerX = layout.underpass.x + 1.5;
  const ambushMarkerY = layout.underpass.y + layout.underpass.h - 5 + 0.5;
  const ambushTargetX = layout.blindTunnel.x + 26.5;
  const ambushTargetY = layout.blindTunnel.y + 2.5;
  const ambushCell = ctx.world.idx(Math.floor(ambushMarkerX), Math.floor(ambushMarkerY));
  registerRouteCue(ctx.world, {
    id: 'dark_metro_white_lamp_ambush',
    x: ambushMarkerX,
    y: ambushMarkerY,
    targetX: ambushTargetX,
    targetY: ambushTargetY,
    z: DARK_METRO_BASE_FLOOR,
    roomId: layout.underpass.id,
    targetRoomId: layout.blindTunnel.id,
    zoneId: ctx.world.zoneMap[ambushCell],
    label: 'обрыв белого света',
    hint: 'лампы кончаются перед слепым тоннелем',
    targetName: 'засада слепого тоннеля',
    color: '#bbf',
    tags: ['dark_metro', 'ambush', 'warning', 'shadow'],
    toneSeed: layout.underpass.id * 1709 + layout.blindTunnel.id,
    radius: 8,
    targetRadius: 4,
    cooldownSec: 30,
    heardText: 'Белые лампы сбиваются: впереди слепой тоннель, в углу слышно чужое дыхание.',
    followedText: 'Засада прочитана до выстрела. Можно идти медленно, светить или вернуться петлей.',
    ignoredText: 'Белые лампы остались позади. Слепой тоннель встретит без предупреждения.',
  });

  const shortcutMarkerX = layout.platform.x + 4 + DARK_METRO_ROUTES[1].panelSlot * 9 + 0.5;
  const shortcutMarkerY = layout.platform.y + 2.5;
  const shortcutTargetX = layout.exit.x + 8.5;
  const shortcutTargetY = layout.exit.y + 3.5;
  const shortcutCell = ctx.world.idx(Math.floor(shortcutMarkerX), Math.floor(shortcutMarkerY));
  registerRouteCue(ctx.world, {
    id: 'dark_metro_service_floor_shortcut',
    x: shortcutMarkerX,
    y: shortcutMarkerY,
    targetX: shortcutTargetX,
    targetY: shortcutTargetY,
    z: DARK_METRO_BASE_FLOOR,
    roomId: layout.platform.id,
    targetRoomId: layout.exit.id,
    zoneId: ctx.world.zoneMap[shortcutCell],
    label: 'стрелочный коридор',
    hint: 'предохранитель держит короткий путь к С-15',
    targetName: DARK_METRO_ROUTES[1].label,
    color: '#79f',
    tags: ['dark_metro', 'service_floor', 'shortcut', 'transfer'],
    toneSeed: layout.platform.id * 1721 + layout.exit.id,
    radius: 8,
    targetRadius: 3,
    cooldownSec: 36,
    heardText: 'Табло щелкает служебным маршрутом: предохранитель покупает короткий ход к С-15.',
    followedText: 'Служебный выход найден. Можно потратить предохранитель на путь или сохранить его для ремонта.',
    ignoredText: 'Стрелочный коридор погас. Служебный короткий путь остался на табло.',
  });
}

export function isDarkMetroAmbientNpc(entity: Entity): boolean {
  return entity.type === EntityType.NPC &&
    !entity.id &&
    !entity.persistentNpcId &&
    entity.alifeId === undefined &&
    entity.questId === -1 &&
    entity.faction !== undefined;
}

export function darkMetroTerritorySpawnCells(world: World): Map<TerritoryOwner, number[]> {
  const cells = new Map<TerritoryOwner, number[]>();
  for (const owner of HUMAN_TERRITORY_OWNERS) cells.set(owner, []);
  for (let i = 0; i < W * W; i++) {
    const cell = world.cells[i];
    if (cell !== Cell.FLOOR && cell !== Cell.DOOR) continue;
    const owner = territoryOwnerAtIndex(world, i);
    const list = cells.get(owner);
    if (!list) continue;
    const roomId = world.roomMap[i];
    if (roomId >= 0) {
      const room = world.rooms[roomId];
      if (room?.type === RoomType.HQ || room?.type === RoomType.COMMON || room?.type === RoomType.STORAGE || room?.type === RoomType.PRODUCTION) {
        list.push(i);
        list.push(i);
        continue;
      }
    }
    list.push(i);
  }
  return cells;
}

export function applyDarkMetroAmbientLight(world: World, layout: DarkMetroLayout, packedState: DarkMetroPackedState): void {
  const state = unpackDarkMetroState(packedState);
  const platformMin = state.platformLight === 'on' ? 0.38 : state.platformLight === 'weak' ? 0.18 : 0.1;
  raiseRoomLight(world, layout.hall, 0.34);
  raiseRoomLight(world, layout.platform, platformMin);
  raiseRoomLight(world, layout.underpass, 0.2);
  raiseRoomLight(world, layout.kiosk, 0.3);
  raiseRoomLight(world, layout.signal, 0.28);
  raiseRoomLight(world, layout.blindTunnel, 0.08);
  raiseRoomLight(world, layout.exit, 0.22);
}

export function raiseRoomLight(world: World, room: Room, minLight: number): void {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const ci = world.idx(room.x + dx, room.y + dy);
      if (world.cells[ci] === Cell.WALL) continue;
      world.light[ci] = Math.max(world.light[ci], minLight);
    }
  }
}

