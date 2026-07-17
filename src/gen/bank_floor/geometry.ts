/* -- Design z: bank_floor - cash desks, debt and vault risk -- */

import { BANK_HQ_CLUSTERS, addExpandedBankContainers } from './npcs';
import {
  Cell,
  DoorState,
  Feature,
  RoomType,
  Tex,
  W,
  ZoneFaction,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { canPlaceRoom, stampRoom } from '../shared';
import { BANK_ROOM_NAMES } from './meta';

export const BANK_VAULT_RISK_RADIUS = 96;
export const BANK_VAULT_RISK_INNER_RADIUS = 10;

export interface BankVaultRiskSource {
  x: number;
  y: number;
  radius: number;
}

export interface BankMicroBlockSpec {
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
  stepX: number;
  stepY: number;
  wallTex: Tex;
  floorTex: Tex;
}

export function expandBankFloorRouteGeometry(world: World, rng: () => number): void {
  carveRun(world, 220, 318, 804, 318, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 220, 706, 804, 706, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 220, 318, 220, 706, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 804, 318, 804, 706, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 512, 318, 512, 706, 5, Tex.F_GREEN_CARPET, Tex.MARBLE);
  carveRun(world, 220, 512, 804, 512, 5, Tex.F_GREEN_CARPET, Tex.MARBLE);

  const annexes = [
    stampBankRoom(world, RoomType.OFFICE, 250, 282, 38, 22, 'Северная бухгалтерия банка Б-22', Tex.MARBLE, Tex.F_PARQUET),
    stampBankRoom(world, RoomType.STORAGE, 736, 282, 38, 22, 'Архив просроченных вкладов Б-22', Tex.METAL, Tex.F_GREEN_CARPET),
    stampBankRoom(world, RoomType.OFFICE, 252, 718, 40, 22, 'Комната сверки вкладчиков Б-22', Tex.MARBLE, Tex.F_PARQUET),
    stampBankRoom(world, RoomType.OFFICE, 728, 718, 44, 24, 'Пост инкассации банка Б-22', Tex.METAL, Tex.F_CONCRETE),
    stampBankRoom(world, RoomType.STORAGE, 482, 280, 62, 20, 'Полка невыплаченных процентов Б-22', Tex.PANEL, Tex.F_GREEN_CARPET),
    stampBankRoom(world, RoomType.CORRIDOR, 482, 724, 62, 18, 'Нижний банковский обход Б-22', Tex.PANEL, Tex.F_LINO),
    stampBankRoom(world, RoomType.COMMON, 368, 338, 128, 34, 'Очередной зал вкладчиков Б-22', Tex.MARBLE, Tex.F_MARBLE_TILE),
    stampBankRoom(world, RoomType.COMMON, 528, 338, 128, 34, 'Очередной зал должников Б-22', Tex.MARBLE, Tex.F_MARBLE_TILE),
    stampBankRoom(world, RoomType.OFFICE, 334, 472, 90, 34, 'Кассовая галерея мелких выплат Б-22', Tex.MARBLE, Tex.F_GREEN_CARPET),
    stampBankRoom(world, RoomType.OFFICE, 334, 530, 104, 34, 'Кредитная кишка просрочек Б-22', Tex.PANEL, Tex.F_LINO),
    stampBankRoom(world, RoomType.OFFICE, 622, 458, 64, 38, 'Сейфовый пост ликвидаторов Б-22', Tex.METAL, Tex.F_CONCRETE),
    stampBankRoom(world, RoomType.STORAGE, 632, 536, 82, 44, 'Архив испорченных депозитов Б-22', Tex.METAL, Tex.F_GREEN_CARPET),
    stampBankRoom(world, RoomType.CORRIDOR, 548, 638, 140, 30, 'Черная кассовая перемычка Б-22', Tex.PANEL, Tex.F_LINO),
    stampBankRoom(world, RoomType.STORAGE, 326, 636, 84, 42, 'Склад залогового хлама Б-22', Tex.PANEL, Tex.F_CONCRETE),
  ];
  for (const room of annexes) {
    openRoomToNearestCorridor(world, room);
    scatterRoomFurniture(world, room, rng);
  }

  const tellerLane = stampBankRoom(world, RoomType.COMMON, 306, 392, 160, 32, BANK_ROOM_NAMES.tellerLane, Tex.MARBLE, Tex.F_MARBLE_TILE);
  const debtorCircuit = stampBankRoom(world, RoomType.COMMON, 306, 578, 160, 34, BANK_ROOM_NAMES.debtorCircuit, Tex.PANEL, Tex.F_LINO);
  const bribeQueue = stampBankRoom(world, RoomType.OFFICE, 472, 580, 52, 30, BANK_ROOM_NAMES.bribeQueue, Tex.PANEL, Tex.F_GREEN_CARPET);
  const vaultShell = stampBankRoom(world, RoomType.STORAGE, 594, 392, 104, 52, BANK_ROOM_NAMES.vaultShell, Tex.METAL, Tex.F_CONCRETE);
  const bypassGate = stampBankRoom(world, RoomType.CORRIDOR, 692, 582, 70, 32, BANK_ROOM_NAMES.bypassGate, Tex.PANEL, Tex.F_LINO);
  const circuitRooms = [tellerLane, debtorCircuit, bribeQueue, vaultShell, bypassGate];
  for (const room of circuitRooms) openRoomToNearestCorridor(world, room);
  decorateExpandedBankDecisionRooms(world, { tellerLane, debtorCircuit, bribeQueue, vaultShell, bypassGate });
  buildDebtCircuitLoop(world);
  addExpandedBankContainers(world, { bribeQueue, vaultShell, bypassGate });
  buildBankMicroLayer(world, rng);
  applyBankVaultRiskSdf(world);

  for (let i = 0; i < 32; i++) {
    const x = 236 + Math.floor(rng() * 552);
    const y = rng() < 0.5 ? 318 + Math.floor(rng() * 390) : 500 + Math.floor(rng() * 28);
    const ci = world.idx(x, y);
    if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0 && world.features[ci] === Feature.NONE) {
      world.features[ci] = rng() < 0.5 ? Feature.DESK : Feature.SHELF;
    }
  }
}

export function bankVaultRiskSources(world: World): BankVaultRiskSource[] {
  const sources: BankVaultRiskSource[] = [];
  for (const container of world.containers) {
    if (!container.tags.includes('banking')) continue;
    if (!container.tags.includes('vault') && !container.tags.includes('high_value')) continue;
    sources.push({ x: container.x + 0.5, y: container.y + 0.5, radius: BANK_VAULT_RISK_INNER_RADIUS });
  }
  for (const room of world.rooms) {
    if (!room) continue;
    const isVaultRoom = room.name === BANK_ROOM_NAMES.vault || room.name === BANK_ROOM_NAMES.vaultShell;
    if (!isVaultRoom) continue;
    sources.push({
      x: room.x + room.w / 2,
      y: room.y + room.h / 2,
      radius: Math.max(BANK_VAULT_RISK_INNER_RADIUS, Math.min(room.w, room.h) / 2),
    });
  }
  return sources;
}

export function bankVaultRiskSignedDistance(world: World, x: number, y: number, sources = bankVaultRiskSources(world)): number {
  let best = Infinity;
  for (const source of sources) {
    const d = Math.sqrt(world.dist2(x, y, source.x, source.y)) - source.radius;
    if (d < best) best = d;
  }
  return best;
}

export function bankVaultRiskTierAt(world: World, x: number, y: number, sources = bankVaultRiskSources(world)): number {
  const signedDistance = bankVaultRiskSignedDistance(world, x, y, sources);
  if (!Number.isFinite(signedDistance) || signedDistance > BANK_VAULT_RISK_RADIUS) return 0;
  const outside = Math.max(0, signedDistance);
  return Math.max(1, Math.min(5, 1 + Math.floor((BANK_VAULT_RISK_RADIUS - outside) / (BANK_VAULT_RISK_RADIUS / 5))));
}

export function decorateExpandedBankDecisionRooms(
  world: World,
  rooms: {
    tellerLane: Room;
    debtorCircuit: Room;
    bribeQueue: Room;
    vaultShell: Room;
    bypassGate: Room;
  },
): void {
  for (let x = rooms.tellerLane.x + 8; x < rooms.tellerLane.x + rooms.tellerLane.w - 8; x += 10) {
    setFeature(world, x, rooms.tellerLane.y + 6, Feature.DESK);
    setFeature(world, x, rooms.tellerLane.y + 16, Feature.CHAIR);
    setFeature(world, x + 4, rooms.tellerLane.y + 25, Feature.CHAIR);
  }
  setFeature(world, rooms.tellerLane.x + 4, rooms.tellerLane.y + 4, Feature.SCREEN);

  for (let x = rooms.debtorCircuit.x + 6; x < rooms.debtorCircuit.x + rooms.debtorCircuit.w - 8; x += 9) {
    const upper = ((x - rooms.debtorCircuit.x) / 9) % 2 < 1;
    setFeature(world, x, rooms.debtorCircuit.y + (upper ? 8 : rooms.debtorCircuit.h - 9), Feature.CHAIR);
    setFeature(world, x + 3, rooms.debtorCircuit.y + (upper ? rooms.debtorCircuit.h - 9 : 8), Feature.CHAIR);
  }
  setFeature(world, rooms.debtorCircuit.x + rooms.debtorCircuit.w - 5, rooms.debtorCircuit.y + 5, Feature.SCREEN);

  setFeature(world, rooms.bribeQueue.x + 6, rooms.bribeQueue.y + 6, Feature.DESK);
  setFeature(world, rooms.bribeQueue.x + 14, rooms.bribeQueue.y + 6, Feature.SCREEN);
  setFeature(world, rooms.bribeQueue.x + rooms.bribeQueue.w - 8, rooms.bribeQueue.y + rooms.bribeQueue.h - 7, Feature.SHELF);

  for (let x = rooms.vaultShell.x + 6; x < rooms.vaultShell.x + rooms.vaultShell.w - 6; x += 12) {
    setFeature(world, x, rooms.vaultShell.y + 6, Feature.SHELF);
    setFeature(world, x, rooms.vaultShell.y + rooms.vaultShell.h - 7, Feature.SHELF);
  }
  for (let y = rooms.vaultShell.y + 12; y < rooms.vaultShell.y + rooms.vaultShell.h - 12; y += 12) {
    setFeature(world, rooms.vaultShell.x + 5, y, Feature.LAMP);
    setFeature(world, rooms.vaultShell.x + rooms.vaultShell.w - 6, y, Feature.SCREEN);
  }

  for (let x = rooms.bypassGate.x + 6; x < rooms.bypassGate.x + rooms.bypassGate.w - 6; x += 12) {
    setFeature(world, x, rooms.bypassGate.y + 8, Feature.SCREEN);
    setFeature(world, x + 4, rooms.bypassGate.y + rooms.bypassGate.h - 8, Feature.LAMP);
  }
}

export function buildDebtCircuitLoop(world: World): void {
  const loop: [number, number][] = [
    [386, 408],
    [512, 408],
    [650, 418],
    [742, 598],
    [498, 598],
    [386, 594],
    [386, 408],
  ];
  for (let i = 1; i < loop.length; i++) {
    const [ax, ay] = loop[i - 1];
    const [bx, by] = loop[i];
    if (ax !== bx && ay !== by) {
      carveRun(world, ax, ay, bx, ay, 3, Tex.F_GREEN_CARPET, Tex.PANEL);
      carveRun(world, bx, ay, bx, by, 3, Tex.F_GREEN_CARPET, Tex.PANEL);
    } else {
      carveRun(world, ax, ay, bx, by, 3, Tex.F_GREEN_CARPET, Tex.PANEL);
    }
  }
  for (const [x, y] of loop) {
    setFeature(world, x, y, Feature.LAMP);
    setFeature(world, x + 2, y, Feature.SCREEN);
  }
}

export function buildBankMicroLayer(world: World, rng: () => number): void {
  carveBankWingCorridors(world);
  for (const cluster of BANK_HQ_CLUSTERS) {
    stampOptionalBankRoom(world, RoomType.HQ, cluster.x, cluster.y, cluster.w, cluster.h, cluster.hqName, cluster.wallTex, cluster.floorTex, rng);
    for (const support of cluster.support) {
      stampOptionalBankRoom(world, support.type, support.x, support.y, support.w, support.h, support.name, support.wallTex, support.floorTex, rng);
    }
  }

  const blocks: readonly BankMicroBlockSpec[] = [
    { name: 'Северная депозитная ячейка Б-22', type: RoomType.STORAGE, x: 250, y: 154, w: 22, h: 12, count: 7, stepX: 64, stepY: 0, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { name: 'Северный кабинет вкладов Б-22', type: RoomType.OFFICE, x: 250, y: 206, w: 22, h: 12, count: 7, stepX: 64, stepY: 0, wallTex: Tex.MARBLE, floorTex: Tex.F_PARQUET },
    { name: 'Южная долговая клетка Б-22', type: RoomType.OFFICE, x: 318, y: 794, w: 22, h: 12, count: 6, stepX: 66, stepY: 0, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    { name: 'Южный склад залога Б-22', type: RoomType.STORAGE, x: 318, y: 866, w: 22, h: 12, count: 6, stepX: 66, stepY: 0, wallTex: Tex.PANEL, floorTex: Tex.F_CONCRETE },
    { name: 'Западный кассовый кабинет Б-22', type: RoomType.OFFICE, x: 78, y: 318, w: 18, h: 18, count: 5, stepX: 0, stepY: 84, wallTex: Tex.MARBLE, floorTex: Tex.F_GREEN_CARPET },
    { name: 'Западный склад очереди Б-22', type: RoomType.STORAGE, x: 154, y: 318, w: 18, h: 18, count: 5, stepX: 0, stepY: 84, wallTex: Tex.PANEL, floorTex: Tex.F_LINO },
    { name: 'Восточный сейфовый кабинет Б-22', type: RoomType.OFFICE, x: 834, y: 318, w: 18, h: 18, count: 5, stepX: 0, stepY: 84, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
    { name: 'Восточная архивная клетка Б-22', type: RoomType.STORAGE, x: 916, y: 318, w: 18, h: 18, count: 5, stepX: 0, stepY: 84, wallTex: Tex.METAL, floorTex: Tex.F_CONCRETE },
  ];

  for (const block of blocks) {
    for (let i = 0; i < block.count; i++) {
      stampOptionalBankRoom(
        world,
        block.type,
        block.x + block.stepX * i,
        block.y + block.stepY * i,
        block.w,
        block.h,
        `${block.name} ${i + 1}`,
        block.wallTex,
        block.floorTex,
        rng,
      );
    }
  }
}

export function carveBankWingCorridors(world: World): void {
  carveRun(world, 512, 318, 512, 188, 4, Tex.F_GREEN_CARPET, Tex.MARBLE);
  carveRun(world, 244, 188, 768, 188, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 512, 706, 512, 842, 4, Tex.F_GREEN_CARPET, Tex.PANEL);
  carveRun(world, 238, 842, 786, 842, 4, Tex.F_LINO, Tex.PANEL);
  carveRun(world, 220, 512, 128, 512, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 128, 310, 128, 714, 4, Tex.F_MARBLE_TILE, Tex.MARBLE);
  carveRun(world, 804, 512, 894, 512, 4, Tex.F_CONCRETE, Tex.METAL);
  carveRun(world, 894, 310, 894, 714, 4, Tex.F_CONCRETE, Tex.METAL);
}

export function stampOptionalBankRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
  rng: () => number,
): Room | null {
  if (!canPlaceRoom(world, x, y, w, h)) return null;
  const room = stampBankRoom(world, type, x, y, w, h, name, wallTex, floorTex);
  openRoomToNearestCorridor(world, room);
  decorateBankMicroRoom(world, room, rng);
  return room;
}

export function decorateBankMicroRoom(world: World, room: Room, rng: () => number): void {
  const fixtures = Math.max(2, Math.min(8, Math.floor((room.w * room.h) / 32)));
  for (let i = 0; i < fixtures; i++) {
    const x = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
    const y = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
    let feature = Feature.CHAIR;
    switch (room.type) {
      case RoomType.HQ:
        feature = i % 3 === 0 ? Feature.DESK : i % 3 === 1 ? Feature.SCREEN : Feature.LAMP;
        break;
      case RoomType.KITCHEN:
        feature = i % 3 === 0 ? Feature.STOVE : i % 3 === 1 ? Feature.SINK : Feature.TABLE;
        break;
      case RoomType.BATHROOM:
        feature = i % 2 === 0 ? Feature.TOILET : Feature.SINK;
        break;
      case RoomType.MEDICAL:
        feature = i % 2 === 0 ? Feature.BED : Feature.APPARATUS;
        break;
      case RoomType.PRODUCTION:
        feature = i % 2 === 0 ? Feature.MACHINE : Feature.APPARATUS;
        break;
      case RoomType.STORAGE:
        feature = Feature.SHELF;
        break;
      case RoomType.OFFICE:
        feature = i % 3 === 0 ? Feature.DESK : i % 3 === 1 ? Feature.CHAIR : Feature.SCREEN;
        break;
      case RoomType.SMOKING:
        feature = i % 2 === 0 ? Feature.TABLE : Feature.CHAIR;
        break;
      case RoomType.COMMON:
      default:
        feature = i % 3 === 0 ? Feature.TABLE : i % 3 === 1 ? Feature.CHAIR : Feature.LAMP;
        break;
    }
    setFeature(world, x, y, feature);
  }
}

export function applyBankVaultRiskSdf(world: World): void {
  const sources = bankVaultRiskSources(world);
  if (sources.length === 0) return;

  for (const container of world.containers) {
    if (!container.tags.includes('banking')) continue;
    if (!container.tags.includes('vault') && !container.tags.includes('high_value')) continue;
    const tier = bankVaultRiskTierAt(world, container.x + 0.5, container.y + 0.5, sources);
    addBankTag(container, 'vault_risk_sdf');
    addBankTag(container, `vault_risk_${tier}`);
    if (tier >= 4) addBankTag(container, 'escape_pressure');
  }

  for (const source of sources) {
    const radius = Math.ceil(source.radius + BANK_VAULT_RISK_RADIUS);
    const minX = Math.floor(source.x - radius);
    const maxX = Math.ceil(source.x + radius);
    const minY = Math.floor(source.y - radius);
    const maxY = Math.ceil(source.y + radius);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const wx = world.wrap(x);
        const wy = world.wrap(y);
        const ci = world.idx(wx, wy);
        if (world.cells[ci] !== Cell.FLOOR || world.aptMask[ci]) continue;
        const tier = bankVaultRiskTierAt(world, wx + 0.5, wy + 0.5, sources);
        if (tier <= 0) continue;
        if (tier >= 4) world.floorTex[ci] = Tex.F_RED_CARPET;
        else if (tier >= 2 && world.roomMap[ci] < 0) world.floorTex[ci] = Tex.F_GREEN_CARPET;
        if (tier >= 4 && world.features[ci] === Feature.NONE && ((wx * 31 + wy * 17) & 31) === 0) {
          world.features[ci] = ((wx + wy) & 1) === 0 ? Feature.SCREEN : Feature.LAMP;
        }
      }
    }
  }
}

export function addBankTag(container: WorldContainer, tag: string): void {
  if (!container.tags.includes(tag)) container.tags.push(tag);
}

export function createBankRooms(world: World): {
  liftLobby: Room;
  hall: Room;
  teller: Room;
  deposit: Room;
  credit: Room;
  queue: Room;
  vault: Room;
  bypass: Room;
} {
  const liftLobby = stampBankRoom(world, RoomType.CORRIDOR, 444, 504, 23, 20, BANK_ROOM_NAMES.liftLobby, Tex.LIFT_DOOR, Tex.F_CONCRETE);
  const hall = stampBankRoom(world, RoomType.COMMON, 468, 488, 92, 50, BANK_ROOM_NAMES.hall, Tex.MARBLE, Tex.F_MARBLE_TILE);
  const teller = stampBankRoom(world, RoomType.OFFICE, 480, 468, 28, 19, BANK_ROOM_NAMES.teller, Tex.MARBLE, Tex.F_GREEN_CARPET);
  const deposit = stampBankRoom(world, RoomType.OFFICE, 514, 468, 28, 19, BANK_ROOM_NAMES.deposit, Tex.MARBLE, Tex.F_GREEN_CARPET);
  const credit = stampBankRoom(world, RoomType.OFFICE, 561, 500, 23, 20, BANK_ROOM_NAMES.credit, Tex.MARBLE, Tex.F_PARQUET);
  const queue = stampBankRoom(world, RoomType.COMMON, 472, 539, 68, 17, BANK_ROOM_NAMES.queue, Tex.PANEL, Tex.F_LINO);
  const bypass = stampBankRoom(world, RoomType.CORRIDOR, 561, 522, 23, 36, BANK_ROOM_NAMES.bypass, Tex.PANEL, Tex.F_LINO);
  const vault = stampBankRoom(world, RoomType.STORAGE, 585, 497, 36, 36, BANK_ROOM_NAMES.vault, Tex.METAL, Tex.F_CONCRETE);

  placeBankDoor(world, liftLobby, hall, DoorState.CLOSED);
  placeBankDoor(world, hall, teller, DoorState.CLOSED);
  placeBankDoor(world, hall, deposit, DoorState.CLOSED);
  placeBankDoor(world, hall, credit, DoorState.CLOSED);
  placeBankDoor(world, hall, queue, DoorState.CLOSED);
  placeBankDoor(world, hall, bypass, DoorState.CLOSED);
  placeBankDoor(world, credit, vault, DoorState.CLOSED);
  placeBankDoor(world, bypass, vault, DoorState.CLOSED);
  placeBankDoor(world, bypass, queue, DoorState.CLOSED);

  return { liftLobby, hall, teller, deposit, credit, queue, vault, bypass };
}

export function stampBankRoom(
  world: World,
  type: RoomType,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  wallTex: Tex,
  floorTex: Tex,
): Room {
  const room = stampRoom(world, world.rooms.length, type, x, y, w, h, -1);
  room.name = name;
  room.wallTex = wallTex;
  room.floorTex = floorTex;
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        world.floorTex[ci] = floorTex;
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
  return room;
}

export function placeBankDoor(world: World, a: Room, b: Room, state: DoorState): number {
  const candidates: number[] = [];
  for (let dy = -1; dy <= a.h; dy++) {
    for (let dx = -1; dx <= a.w; dx++) {
      if (dx >= 0 && dx < a.w && dy >= 0 && dy < a.h) continue;
      const wx = world.wrap(a.x + dx);
      const wy = world.wrap(a.y + dy);
      const ci = world.idx(wx, wy);
      if (world.cells[ci] !== Cell.WALL) continue;
      let facesA = false;
      let facesB = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = world.idx(wx + ox, wy + oy);
        if (world.roomMap[ni] === a.id) facesA = true;
        if (world.roomMap[ni] === b.id) facesB = true;
      }
      if (facesA && facesB) candidates.push(ci);
    }
  }
  const ci = candidates[(candidates.length / 2) | 0];
  if (ci === undefined) return -1;
  world.cells[ci] = Cell.DOOR;
  world.doors.set(ci, { idx: ci, state, roomA: a.id, roomB: b.id, keyId: '', timer: 0 });
  a.doors.push(ci);
  b.doors.push(ci);
  return ci;
}

export function dressBankRooms(
  world: World,
  rooms: ReturnType<typeof createBankRooms>,
): void {
  for (let x = rooms.hall.x + 8; x < rooms.hall.x + rooms.hall.w - 8; x += 10) {
    setFeature(world, x, rooms.hall.y + 9, Feature.CHAIR);
    setFeature(world, x, rooms.hall.y + 38, Feature.CHAIR);
  }
  for (let x = rooms.teller.x + 3; x < rooms.teller.x + rooms.teller.w - 2; x += 5) {
    setFeature(world, x, rooms.teller.y + rooms.teller.h - 3, Feature.DESK);
  }
  for (let x = rooms.deposit.x + 3; x < rooms.deposit.x + rooms.deposit.w - 2; x += 5) {
    setFeature(world, x, rooms.deposit.y + 3, Feature.SHELF);
    setFeature(world, x, rooms.deposit.y + rooms.deposit.h - 4, Feature.DESK);
  }
  setFeature(world, rooms.credit.x + 5, rooms.credit.y + 5, Feature.DESK);
  setFeature(world, rooms.credit.x + rooms.credit.w - 4, rooms.credit.y + 4, Feature.SHELF);
  setFeature(world, rooms.credit.x + 8, rooms.credit.y + rooms.credit.h - 4, Feature.LAMP);

  for (let x = rooms.queue.x + 5; x < rooms.queue.x + rooms.queue.w - 5; x += 8) {
    setFeature(world, x, rooms.queue.y + 5, Feature.CHAIR);
    setFeature(world, x, rooms.queue.y + 10, Feature.CHAIR);
  }
  for (let y = rooms.vault.y + 4; y < rooms.vault.y + rooms.vault.h - 3; y += 5) {
    setFeature(world, rooms.vault.x + 4, y, Feature.SHELF);
    setFeature(world, rooms.vault.x + 11, y, Feature.SHELF);
    setFeature(world, rooms.vault.x + rooms.vault.w - 5, y, Feature.SHELF);
  }
  for (let y = rooms.bypass.y + 4; y < rooms.bypass.y + rooms.bypass.h - 3; y += 7) {
    setFeature(world, rooms.bypass.x + 4, y, Feature.SCREEN);
    setFeature(world, rooms.bypass.x + rooms.bypass.w - 5, y, Feature.LAMP);
  }
  for (const room of Object.values(rooms)) {
    setFeature(world, room.x + room.w - 3, room.y + 2, Feature.LAMP);
  }
}



export function generateBankZones(world: World): void {
  const zoneSize = W / 8;
  world.zones = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const id = y * 8 + x;
      const faction = x >= 4 && y >= 3 && y <= 4 ? ZoneFaction.LIQUIDATOR : ZoneFaction.CITIZEN;
      world.zones.push({
        id,
        cx: Math.floor(x * zoneSize + zoneSize / 2),
        cy: Math.floor(y * zoneSize + zoneSize / 2),
        faction,
        hasLift: false,
        fogged: false,
        level: faction === ZoneFaction.LIQUIDATOR ? 3 : 2,
        hqRoomId: -1,
      });
    }
  }
  for (let y = 0; y < W; y++) {
    const zy = Math.min(7, Math.floor(y / zoneSize));
    for (let x = 0; x < W; x++) {
      const zx = Math.min(7, Math.floor(x / zoneSize));
      const zoneId = zy * 8 + zx;
      world.zoneMap[y * W + x] = zoneId;
      world.factionControl[y * W + x] = world.zones[zoneId]?.faction ?? ZoneFaction.CITIZEN;
    }
  }
  for (let i = 0; i < W * W; i++) {
    if (world.cells[i] === Cell.LIFT) world.zones[world.zoneMap[i]].hasLift = true;
  }
}

export function setFeature(world: World, x: number, y: number, feature: Feature): void {
  const ci = world.idx(x, y);
  if (world.cells[ci] === Cell.FLOOR || world.cells[ci] === Cell.WATER) world.features[ci] = feature;
}

export function carveRun(
  world: World,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  floorTex: Tex,
  wallTex: Tex,
): void {
  const half = width >> 1;
  if (ay === by) {
    const minX = Math.min(ax, bx);
    carveRect(world, minX, ay - half, Math.abs(bx - ax) + 1, width, floorTex, wallTex);
    return;
  }
  const minY = Math.min(ay, by);
  carveRect(world, ax - half, minY, width, Math.abs(by - ay) + 1, floorTex, wallTex);
}

export function carveRect(world: World, x: number, y: number, w: number, h: number, floorTex: Tex, wallTex: Tex): void {
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const ci = world.idx(x + dx, y + dy);
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
        if (world.cells[ci] !== Cell.LIFT && world.cells[ci] !== Cell.DOOR) {
          world.cells[ci] = Cell.FLOOR;
          world.roomMap[ci] = -1;
          world.floorTex[ci] = floorTex;
        }
      } else if (world.cells[ci] === Cell.WALL) {
        world.wallTex[ci] = wallTex;
      }
    }
  }
}

export function openRoomToNearestCorridor(world: World, room: Room): void {
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  const probes: [number, number, number, number][] = [
    [cx, room.y - 1, 0, -1],
    [cx, room.y + room.h, 0, 1],
    [room.x - 1, cy, -1, 0],
    [room.x + room.w, cy, 1, 0],
  ];
  let best: { sx: number; sy: number; path: number[] } | null = null;
  for (const [sx, sy, dx, dy] of probes) {
    const path: number[] = [];
    let x = sx;
    let y = sy;
    for (let i = 0; i < 80; i++) {
      const ci = world.idx(x, y);
      if (world.cells[ci] === Cell.FLOOR && world.roomMap[ci] < 0) {
        if (!best || path.length < best.path.length) best = { sx, sy, path: [...path] };
        break;
      }
      path.push(ci);
      x += dx;
      y += dy;
    }
  }
  if (!best) return;
  const doorIdx = world.idx(best.sx, best.sy);
  world.cells[doorIdx] = Cell.DOOR;
  world.doors.set(doorIdx, { idx: doorIdx, state: DoorState.CLOSED, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
  room.doors.push(doorIdx);
  for (const ci of best.path) {
    if (ci === doorIdx) continue;
    if (world.cells[ci] !== Cell.LIFT) {
      world.cells[ci] = Cell.FLOOR;
      world.roomMap[ci] = -1;
      world.floorTex[ci] = Tex.F_MARBLE_TILE;
    }
  }
}

export function scatterRoomFurniture(world: World, room: Room, rng: () => number): void {
  for (let i = 0; i < 8; i++) {
    const x = room.x + 2 + Math.floor(rng() * Math.max(1, room.w - 4));
    const y = room.y + 2 + Math.floor(rng() * Math.max(1, room.h - 4));
    if (world.features[world.idx(x, y)] === Feature.NONE) {
      setFeature(world, x, y, i % 3 === 0 ? Feature.DESK : i % 3 === 1 ? Feature.SHELF : Feature.CHAIR);
    }
  }
}

