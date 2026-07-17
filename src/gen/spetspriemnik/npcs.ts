import {
  AIGoal,
  Cell,
  ContainerKind,
  DoorState,
  EntityType,
  Faction,
  Feature,
  LiftDirection,
  MonsterKind,
  RoomType,
  Tex,
  ZoneFaction,
  type Entity,
  type Item,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { MONSTERS } from '../../entities/monster';
import { monsterSpr } from '../../render/sprite_index';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { rng } from '../../core/rand';
import { SPETSPRIEMNIK_BASE_FLOOR, SPETSPRIEMNIK_CELL_KEY, SPETSPRIEMNIK_PERMIT_KEY, SPETSPRIEMNIK_GUARD_KEY, SPETSPRIEMNIK_ROOM_NAMES, CX, CY, BASE_TAGS, NextId, NpcId } from "./meta";
import { addRoom, carveLine, connectRoomToPoint, addGateAt, paintRoomTerritory, setFeature, setLift, placeBarredSightline, decorateRoom, buildCellblockBsp } from "./geometry";

export function buildGuardLoop(world: World): number {
  const cells = new Set<number>();
  carveLine(world, 218, 258, 806, 258, 6, Tex.F_CONCRETE, Tex.METAL, cells);
  carveLine(world, 806, 258, 806, 774, 6, Tex.F_CONCRETE, Tex.METAL, cells);
  carveLine(world, 806, 774, 218, 774, 6, Tex.F_CONCRETE, Tex.METAL, cells);
  carveLine(world, 218, 774, 218, 258, 6, Tex.F_CONCRETE, Tex.METAL, cells);
  carveLine(world, CX, 252, CX, 812, 10, Tex.F_RED_CARPET, Tex.MARBLE, cells);
  carveLine(world, 248, CY, 780, CY, 8, Tex.F_CONCRETE, Tex.METAL, cells);
  for (const [x, y] of [[218, 258], [806, 258], [806, 774], [218, 774], [CX, CY]] as const) {
    setFeature(world, x, y, Feature.LAMP);
  }
  return cells.size;
}

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: Item[],
  tags: string[],
  lockDifficulty?: number,
  faction?: Faction,
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: SPETSPRIEMNIK_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind,
    name,
    inventory,
    capacitySlots: Math.max(8, inventory.length + 4),
    faction,
    access,
    lockDifficulty,
    discovered: access !== 'secret',
    tags,
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.SAFE || kind === ContainerKind.CASHBOX ? Feature.DESK : Feature.SHELF);
  return container;
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function spawnPlotNpc(
  entities: Entity[],
  nextId: NextId,
  plotNpcId: NpcId,
  room: Room,
  dx: number,
  dy: number,
  angle: number,
  canGiveQuest = true,
): number {
  const npc = requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, room.x + dx + 0.5, room.y + dy + 0.5, {
    angle,
    aiTarget: { x: room.x + dx, y: room.y + dy },
    canGiveQuest,
  });
  return npc.id;
}

export function spawnMonster(
  world: World,
  entities: Entity[],
  nextId: NextId,
  kind: MonsterKind,
  x: number,
  y: number,
  level: number,
  name: string,
): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] !== Cell.FLOOR && world.cells[ci] !== Cell.WATER) return;
  const def = MONSTERS[kind];
  if (!def) return;
  const hp = Math.round(def.hp * (1 + level * 0.18));
  entities.push({
    id: nextId.v++,
    type: EntityType.MONSTER,
    x: x + 0.5,
    y: y + 0.5,
    angle: rng() * Math.PI * 2,
    pitch: 0,
    alive: true,
    speed: def.speed * (1 + level * 0.04),
    sprite: monsterSpr(kind),
    name,
    hp,
    maxHp: hp,
    monsterKind: kind,
    attackCd: 0,
    ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    phasing: kind === MonsterKind.SPIRIT,
  });
}

export function placeContainers(world: World, rooms: {
  guardPost: Room;
  command: Room;
  visitor: Room;
  riotYard: Room;
  contraband: Room;
}): void {
  addContainer(world, rooms.guardPost, rooms.guardPost.x + 8, rooms.guardPost.y + 9, ContainerKind.METAL_CABINET, 'Шкаф ключей камеры выпуска', 'faction', [
    { defId: SPETSPRIEMNIK_CELL_KEY, count: 2 },
    { defId: SPETSPRIEMNIK_GUARD_KEY, count: 1 },
    { defId: 'ammo_9mm', count: 12 },
  ], [...BASE_TAGS, 'release_prisoners', 'key_gate', 'bribe_guard'], 3, Faction.LIQUIDATOR);

  addContainer(world, rooms.command, rooms.command.x + rooms.command.w - 9, rooms.command.y + 8, ContainerKind.SAFE, 'Сейф списка заложников', 'locked', [
    { defId: 'personal_file_copy', count: 2 },
    { defId: 'denunciation', count: 1 },
    { defId: SPETSPRIEMNIK_PERMIT_KEY, count: 1 },
  ], [...BASE_TAGS, 'trade_names', 'hostage_list', 'official'], 5, Faction.LIQUIDATOR);

  addContainer(world, rooms.visitor, rooms.visitor.x + 8, rooms.visitor.y + rooms.visitor.h - 7, ContainerKind.FILING_CABINET, 'Окно обмена фамилий', 'owner', [
    { defId: 'blank_form', count: 2 },
    { defId: 'ration_registry_extract', count: 1 },
    { defId: 'forged_permit_slip', count: 1 },
  ], [...BASE_TAGS, 'trade_names', 'forgery', 'paperwork']);

  addContainer(world, rooms.riotYard, rooms.riotYard.x + 12, rooms.riotYard.y + 12, ContainerKind.SECRET_STASH, 'Тайник сорванной переклички', 'secret', [
    { defId: 'stolen_terminal_stamp', count: 1 },
    { defId: 'cigs', count: 2 },
    { defId: 'bread', count: 2 },
  ], [...BASE_TAGS, 'riot', 'bounded_event', 'stash']);

  addContainer(world, rooms.contraband, rooms.contraband.x + 8, rooms.contraband.y + 8, ContainerKind.SECRET_STASH, 'Пакет передач без подписи', 'owner', [
    { defId: 'cigs', count: 3 },
    { defId: 'fake_pass', count: 1 },
    { defId: 'water', count: 2 },
  ], [...BASE_TAGS, 'contraband', 'bribe_guard', 'hostage_economy']);
}

export function buildCore(world: World): {
  lobby: Room;
  intake: Room;
  guardPost: Room;
  command: Room;
  visitor: Room;
  riotYard: Room;
  lowerLift: Room;
  contraband: Room;
  guardLoopCells: number;
  cellRooms: Room[];
  shelterCellRooms: number;
  lockedCellDoors: number;
  barredSightlineCells: number;
  lockedPermitDoors: number;
} {
  const guardLoopCells = buildGuardLoop(world);
  const lobby = addRoom(world, RoomType.CORRIDOR, 454, 204, 116, 48, SPETSPRIEMNIK_ROOM_NAMES.lobby, Tex.LIFT_DOOR, Tex.F_CONCRETE);
  const intake = addRoom(world, RoomType.OFFICE, 424, 282, 176, 56, SPETSPRIEMNIK_ROOM_NAMES.intake, Tex.MARBLE, Tex.F_PARQUET);
  const guardPost = addRoom(world, RoomType.HQ, 610, 296, 104, 58, SPETSPRIEMNIK_ROOM_NAMES.guardPost, Tex.METAL, Tex.F_CONCRETE);
  const visitor = addRoom(world, RoomType.COMMON, 330, 684, 152, 62, SPETSPRIEMNIK_ROOM_NAMES.visitor, Tex.METAL, Tex.F_CONCRETE);
  const command = addRoom(world, RoomType.OFFICE, 594, 688, 128, 64, SPETSPRIEMNIK_ROOM_NAMES.command, Tex.MARBLE, Tex.F_RED_CARPET);
  const riotYard = addRoom(world, RoomType.COMMON, 408, 754, 210, 58, SPETSPRIEMNIK_ROOM_NAMES.riotYard, Tex.METAL, Tex.F_CONCRETE);
  const lowerLift = addRoom(world, RoomType.CORRIDOR, 454, 836, 116, 44, SPETSPRIEMNIK_ROOM_NAMES.lowerLift, Tex.LIFT_DOOR, Tex.F_CONCRETE);
  const contraband = addRoom(world, RoomType.STORAGE, 274, 728, 92, 52, SPETSPRIEMNIK_ROOM_NAMES.contraband, Tex.METAL, Tex.F_CONCRETE);
  paintRoomTerritory(world, guardPost, ZoneFaction.LIQUIDATOR);
  paintRoomTerritory(world, command, ZoneFaction.LIQUIDATOR);

  setLift(world, CX, lobby.y + 18, LiftDirection.UP);
  setFeature(world, CX + 8, lobby.y + 18, Feature.LIFT_BUTTON);
  setLift(world, CX, lowerLift.y + 22, LiftDirection.DOWN);
  setFeature(world, CX - 8, lowerLift.y + 22, Feature.LIFT_BUTTON);

  connectRoomToPoint(world, lobby, 'south', CX, 260, DoorState.CLOSED);
  connectRoomToPoint(world, intake, 'south', CX, 348, DoorState.CLOSED);
  connectRoomToPoint(world, guardPost, 'west', CX + 54, 325, DoorState.LOCKED, SPETSPRIEMNIK_GUARD_KEY);
  connectRoomToPoint(world, visitor, 'north', CX - 58, 648, DoorState.CLOSED);
  connectRoomToPoint(world, command, 'north', CX + 62, 648, DoorState.LOCKED, SPETSPRIEMNIK_PERMIT_KEY);
  connectRoomToPoint(world, riotYard, 'north', CX, 706, DoorState.CLOSED);
  connectRoomToPoint(world, lowerLift, 'north', CX, 812, DoorState.CLOSED);
  connectRoomToPoint(world, contraband, 'east', CX - 132, 754, DoorState.LOCKED, SPETSPRIEMNIK_CELL_KEY);

  for (const [room, feature] of [
    [lobby, Feature.LAMP],
    [intake, Feature.DESK],
    [guardPost, Feature.SCREEN],
    [visitor, Feature.TABLE],
    [command, Feature.DESK],
    [riotYard, Feature.CHAIR],
    [lowerLift, Feature.LAMP],
    [contraband, Feature.SHELF],
  ] as const) decorateRoom(world, room, feature);

  const west = buildCellblockBsp(world, 250, 318, 1);
  const east = buildCellblockBsp(world, 548, 318, 13);
  const lockedPermitDoors = [
    addGateAt(world, CX, 382, DoorState.LOCKED, SPETSPRIEMNIK_PERMIT_KEY),
    addGateAt(world, CX, 650, DoorState.LOCKED, SPETSPRIEMNIK_GUARD_KEY),
  ].length;
  const barredSightlineCells = west.barredCells + east.barredCells +
    placeBarredSightline(world, 312, 712, 642) +
    placeBarredSightline(world, 312, 712, 386);

  return {
    lobby,
    intake,
    guardPost,
    command,
    visitor,
    riotYard,
    lowerLift,
    contraband,
    guardLoopCells,
    cellRooms: [...west.rooms, ...east.rooms],
    shelterCellRooms: west.shelterRooms + east.shelterRooms,
    lockedCellDoors: west.lockedDoors + east.lockedDoors,
    barredSightlineCells,
    lockedPermitDoors,
  };
}

export function spawnAuthoredActors(world: World, entities: Entity[], nextId: NextId, rooms: ReturnType<typeof buildCore>): void {
  spawnPlotNpc(entities, nextId, 'spetspriemnik_nachalnik_krivda', rooms.command, 24, 28, Math.PI);
  spawnPlotNpc(entities, nextId, 'spetspriemnik_guard_savva', rooms.guardPost, 22, 28, Math.PI);
  spawnPlotNpc(entities, nextId, 'spetspriemnik_clerk_alla', rooms.intake, 26, 28, Math.PI / 2);
  spawnPlotNpc(entities, nextId, 'spetspriemnik_prisoner_mira', rooms.visitor, 42, 32, 0);
  const informantRoom = rooms.cellRooms[8] ?? rooms.visitor;
  spawnPlotNpc(entities, nextId, 'spetspriemnik_informant_tolya', informantRoom, 18, 16, 0);

  spawnMonster(world, entities, nextId, MonsterKind.PROTOKOLNIK, rooms.command.x + rooms.command.w - 18, rooms.command.y + 44, 3, 'Протокольник заложников');
  spawnMonster(world, entities, nextId, MonsterKind.NELYUD, rooms.riotYard.x + rooms.riotYard.w - 24, rooms.riotYard.y + 28, 3, 'Нелюдь бунтовой переклички');
  spawnMonster(world, entities, nextId, MonsterKind.BEZEKHIY, rooms.contraband.x + 62, rooms.contraband.y + 28, 2, 'Безэхий под передачами');
}

