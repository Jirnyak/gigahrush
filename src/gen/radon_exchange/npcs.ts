import {
  Cell,
  ContainerKind,
  LiftDirection,
  W,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { REACH_GATE_NONE, auditReachability } from '../../core/world';
import { World } from '../../core/world';
import { registerRouteCue } from '../../systems/route_cues';
import { RADON_EXCHANGE_ROUTE_ID, RADON_EXCHANGE_BASE_FLOOR, RadonRooms, RadonTerritoryAnchor, TERRITORY_UNASSIGNED } from "./meta";
import { isRadonTerritoryPassable, radonRoomOwnerHint, claimRadonTerritoryCell, claimRadonRoomTerritory } from "./geometry";

export function addContainer(
  world: World,
  nextContainerId: { v: number },
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  inventory: WorldContainer['inventory'],
  tags: string[],
  access: WorldContainer['access'] = 'public',
  ownerName?: string,
): void {
  world.addContainer({
    id: nextContainerId.v++,
    x: world.wrap(x),
    y: world.wrap(y),
    z: RADON_EXCHANGE_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind,
    name,
    inventory,
    capacitySlots: Math.max(6, inventory.length + 3),
    access,
    ownerName,
    lockDifficulty: access === 'locked' ? 3 : undefined,
    discovered: access !== 'secret',
    tags: [RADON_EXCHANGE_ROUTE_ID, ...tags],
  });
}

export function registerRadonRouteCues(world: World, rooms: RadonRooms, keyContainer: WorldContainer): void {
  registerRouteCue(world, {
    id: 'radon_exchange_exposed_scanline',
    x: rooms.exchangeHall.x + 8.5,
    y: rooms.exchangeHall.y + 18.5,
    targetX: rooms.shutterEast.x + 12.5,
    targetY: rooms.shutterEast.y + 7.5,
    z: RADON_EXCHANGE_BASE_FLOOR,
    roomId: rooms.exchangeHall.id,
    targetRoomId: rooms.shutterEast.id,
    zoneId: world.zoneMap[world.idx(rooms.exchangeHall.x + 8, rooms.exchangeHall.y + 18)],
    label: 'длинная скан-линия',
    hint: 'открытый коридор простреливается до восточной кассеты',
    targetName: rooms.shutterEast.name,
    color: '#bdf',
    tags: [RADON_EXCHANGE_ROUTE_ID, 'scanline', 'long_sight', 'exposed_route'],
    toneSeed: 7401,
    radius: 10,
    targetRadius: 3,
    cooldownSec: 32,
    heardText: 'Радоновая линия гудит ровно: восточная кассета видна слишком далеко.',
    followedText: 'Вы вышли на длинную скан-линию. Здесь быстро, но укрытия считают шаги.',
    ignoredText: 'Длинная линия осталась за бетоном. Обход дольше, зато не смотрит через весь этаж.',
    routeGroup: {
      id: 'radon_scanline_choice',
      lead: 'гул радоновой линии',
      risk: 'дальний прострел и открытая видимость',
      decision: 'пересечь линию быстро или искать сервисную хорду',
      reward: 'короткий проход к восточной кассете',
      mapLabel: 'скан-линия',
      mapHint: 'быстро, открыто, мало укрытий',
    },
  });

  registerRouteCue(world, {
    id: 'radon_exchange_service_chord',
    x: rooms.downLift.x + 8.5,
    y: rooms.downLift.y + 8.5,
    targetX: rooms.serviceChord.x + 14.5,
    targetY: rooms.serviceChord.y + 7.5,
    z: RADON_EXCHANGE_BASE_FLOOR,
    roomId: rooms.downLift.id,
    targetRoomId: rooms.serviceChord.id,
    zoneId: world.zoneMap[world.idx(rooms.downLift.x + 8, rooms.downLift.y + 8)],
    label: 'сервисная хорда',
    hint: 'бетонная диагональ режет скан-линии без дальнего обзора',
    targetName: rooms.serviceChord.name,
    color: '#8cf',
    tags: [RADON_EXCHANGE_ROUTE_ID, 'service_chord', 'covered_route', 'route_choice'],
    toneSeed: 7402,
    radius: 9,
    targetRadius: 3,
    cooldownSec: 34,
    heardText: 'Под плитами стучит сервисная хорда: длиннее, зато заслонки не смотрят прямо.',
    followedText: 'Сервисная хорда найдена. Бетон держит обзор коротким и выводит к верхней кабине.',
    ignoredText: 'Сервисная хорда ушла в сторону. Открытые линии снова стали короче по времени.',
    routeGroup: {
      id: 'radon_service_chord',
      lead: 'низкий стук под плитой',
      risk: 'дольше и теснее',
      decision: 'идти сервисным обходом или резать через скан-линию',
      reward: 'укрытый путь между лифтами',
      mapLabel: 'сервисная хорда',
      mapHint: 'укрытый обход',
    },
  });

  registerRouteCue(world, {
    id: 'radon_exchange_projection_key',
    x: rooms.projectionKey.x + 6.5,
    y: rooms.projectionKey.y + 5.5,
    targetX: keyContainer.x + 0.5,
    targetY: keyContainer.y + 0.5,
    z: RADON_EXCHANGE_BASE_FLOOR,
    roomId: rooms.projectionKey.id,
    targetRoomId: rooms.projectionKey.id,
    zoneId: world.zoneMap[world.idx(rooms.projectionKey.x + 6, rooms.projectionKey.y + 5)],
    label: 'проекционный ключ',
    hint: 'чужой лоток открывает часть радоновых заслонок',
    targetName: keyContainer.name,
    color: '#ffd86b',
    tags: [RADON_EXCHANGE_ROUTE_ID, 'projection_key', 'theft', 'shutter'],
    toneSeed: 7403,
    radius: 8,
    targetRadius: 2.5,
    cooldownSec: 40,
    heardText: 'В комнате проекции щелкает ключ: заслонки слушают его лучше приказа.',
    followedText: 'Лоток проекционного ключа рядом. Взять можно как кражу или оставить длинной линии её право.',
    ignoredText: 'Ключ остался в лотке. Закрытые створки всё ещё требуют чужую руку.',
    routeGroup: {
      id: 'radon_projection_key',
      lead: 'щелчок чужого ключа',
      risk: 'кража у операторов обменника',
      decision: 'украсть ключ или идти без коротких заслонок',
      reward: 'часть закрытых створок признает проход',
      mapLabel: 'ключ заслонок',
      mapHint: 'кража открывает короткий ход',
    },
  });
}

export function seedRadonTerritory(
  world: World,
  anchors: readonly RadonTerritoryAnchor[],
  ownerQueues: number[][],
  ownerCounts: Uint32Array,
): number {
  let passable = 0;
  world.factionControl.fill(TERRITORY_UNASSIGNED);
  for (let i = 0; i < W * W; i++) {
    if (isRadonTerritoryPassable(world.cells[i] as Cell)) passable++;
  }
  for (const room of world.rooms) {
    if (!room) continue;
    const owner = radonRoomOwnerHint(room);
    if (owner !== null) claimRadonRoomTerritory(world, room, owner, ownerQueues, ownerCounts);
  }
  for (const anchor of anchors) {
    const r = Math.max(4, Math.round(anchor.strength));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        claimRadonTerritoryCell(world, world.idx(anchor.x + dx, anchor.y + dy), anchor.owner, ownerQueues, ownerCounts);
      }
    }
  }
  return passable;
}

export function liftReachableWithoutGate(world: World, spawnX: number, spawnY: number, direction: LiftDirection): boolean {
  const audit = auditReachability(world, world.idx(Math.floor(spawnX), Math.floor(spawnY)));
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] !== Cell.LIFT || world.liftDir[i] !== direction) continue;
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const ni = world.idx(x + dx, y + dy);
      if (audit.reachable[ni] && audit.gateMask[ni] === REACH_GATE_NONE) return true;
    }
  }
  return false;
}

