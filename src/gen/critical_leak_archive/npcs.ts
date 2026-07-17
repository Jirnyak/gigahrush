import {
  AIGoal,
  Cell,
  ContainerKind,
  Faction,
  Feature,
  type Entity,
  type Item,
  type Room,
  type WorldContainer,
} from '../../core/types';
import { World } from '../../core/world';
import { type PlotNpcDef } from '../../data/plot';
import { requireSpawnedPlotNpcFromPackage } from '../plot_npc_spawn';
import { CRITICAL_LEAK_ARCHIVE_ROUTE_ID, CRITICAL_LEAK_ARCHIVE_BASE_FLOOR, CRITICAL_LEAK_ARCHIVE_ROOM_NAMES, CriticalLeakArchiveState, PercolationField, NextId, GRID_W, GRID_H, SITE_P, BOND_P, WATER_TAGS } from "./meta";
import { gridIndex, gridCenter, largestBondComponent, carveDisc, carveLine, setFeature } from "./geometry";

export function rand01(seed: number, i: number, salt: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(i ^ 0xc2b2ae35, 0x27d4eb2d) + salt;
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 0x100000000;
}

export function buildPercolationField(seed: number): PercolationField {
  const open = new Uint8Array(GRID_W * GRID_H);
  const east = new Uint8Array(GRID_W * GRID_H);
  const south = new Uint8Array(GRID_W * GRID_H);

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const i = gridIndex(gx, gy);
      const centralLeak = Math.abs(gx - 22) <= 2 || Math.abs(gy - 22) <= 2;
      const archiveBias = gx > 7 && gx < 38 && gy > 7 && gy < 38 ? 0.026 : -0.018;
      open[i] = rand01(seed, i, 11) < SITE_P + archiveBias + (centralLeak ? 0.035 : 0) ? 1 : 0;
    }
  }

  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const i = gridIndex(gx, gy);
      if (!open[i]) continue;
      if (gx + 1 < GRID_W && open[gridIndex(gx + 1, gy)]) {
        east[i] = rand01(seed, i, 23) < BOND_P + (Math.abs(gy - 22) <= 2 ? 0.07 : 0) ? 1 : 0;
      }
      if (gy + 1 < GRID_H && open[gridIndex(gx, gy + 1)]) {
        south[i] = rand01(seed, i, 37) < BOND_P + (Math.abs(gx - 22) <= 2 ? 0.07 : 0) ? 1 : 0;
      }
    }
  }

  const largestCells = largestBondComponent(open, east, south);
  const inLargest = new Uint8Array(GRID_W * GRID_H);
  for (const i of largestCells) inLargest[i] = 1;
  const centers = largestCells.map(i => gridCenter(i % GRID_W, Math.floor(i / GRID_W)));
  return { inLargest, east, south, largestCells, centers };
}

export function wetNode(seed: number, i: number): boolean {
  return rand01(seed, i, 401) < 0.47;
}

export function carvePercolationComponent(world: World, field: PercolationField, seed: number, state: CriticalLeakArchiveState): void {
  for (const i of field.largestCells) {
    const p = gridCenter(i % GRID_W, Math.floor(i / GRID_W));
    carveDisc(world, p.x, p.y, wetNode(seed, i) ? 2 : 1, wetNode(seed, i) ? Cell.WATER : Cell.FLOOR, state);
  }

  for (const i of field.largestCells) {
    const gx = i % GRID_W;
    const gy = Math.floor(i / GRID_W);
    const p = gridCenter(gx, gy);
    if (gx + 1 < GRID_W && field.east[i] && field.inLargest[gridIndex(gx + 1, gy)]) {
      const next = gridCenter(gx + 1, gy);
      carveLine(world, p, next, 1, wetNode(seed, i) || wetNode(seed, gridIndex(gx + 1, gy)) ? Cell.WATER : Cell.FLOOR, state);
    }
    if (gy + 1 < GRID_H && field.south[i] && field.inLargest[gridIndex(gx, gy + 1)]) {
      const next = gridCenter(gx, gy + 1);
      carveLine(world, p, next, 1, wetNode(seed, i) || wetNode(seed, gridIndex(gx, gy + 1)) ? Cell.WATER : Cell.FLOOR, state);
    }
  }
}

export function nextContainerId(world: World): number {
  let id = 1;
  for (const container of world.containers) id = Math.max(id, container.id + 1);
  return id;
}

export function addContainer(
  world: World,
  room: Room,
  x: number,
  y: number,
  kind: ContainerKind,
  name: string,
  access: WorldContainer['access'],
  inventory: readonly Item[],
  tags: readonly string[],
  lockDifficulty?: number,
): WorldContainer {
  const container: WorldContainer = {
    id: nextContainerId(world),
    x,
    y,
    z: CRITICAL_LEAK_ARCHIVE_BASE_FLOOR,
    roomId: room.id,
    zoneId: world.zoneMap[world.idx(x, y)],
    kind,
    name,
    inventory: inventory.map(item => ({ ...item })),
    capacitySlots: Math.max(8, inventory.length + 5),
    faction: tags.includes('liquidator') ? Faction.LIQUIDATOR : Faction.SCIENTIST,
    access,
    lockDifficulty,
    discovered: true,
    tags: [CRITICAL_LEAK_ARCHIVE_ROUTE_ID, ...tags],
  };
  world.addContainer(container);
  setFeature(world, x, y, kind === ContainerKind.EMERGENCY_BOX ? Feature.APPARATUS : Feature.SHELF);
  return container;
}

export function spawnLeakNpc(
  entities: Entity[],
  nextId: NextId,
  _def: PlotNpcDef,
  plotNpcId: string,
  x: number,
  y: number,
  weapon?: string,
): Entity {
  return requireSpawnedPlotNpcFromPackage(entities, nextId, plotNpcId, x + 0.5, y + 0.5, {
    angle: 0,
    canGiveQuest: true,
    weapon,
    aiTarget: { x, y },
    extra: {
      ai: { goal: AIGoal.WANDER, tx: x, ty: y, path: [], pi: 0, stuck: 0, timer: 0 },
    },
  });
}

export function populateContainers(world: World, rooms: Record<keyof typeof CRITICAL_LEAK_ARCHIVE_ROOM_NAMES, Room>, state: CriticalLeakArchiveState): void {
  const dryA = addContainer(
    world,
    rooms.dryIndex,
    rooms.dryIndex.x + rooms.dryIndex.w - 8,
    rooms.dryIndex.y + 8,
    ContainerKind.FILING_CABINET,
    'Сухой пакет причины протечки',
    'locked',
    [
      { defId: 'sealed_complaint', count: 1 },
      { defId: 'blank_form', count: 2 },
      { defId: 'seal_wax', count: 1 },
    ],
    ['dry_archive_packet', 'documents', 'carry_dry_documents', 'trade'],
    3,
  );
  const dryB = addContainer(
    world,
    rooms.witness,
    rooms.witness.x + rooms.witness.w - 7,
    rooms.witness.y + 7,
    ContainerKind.FILING_CABINET,
    'Копии свидетельских сухих листов',
    'room',
    [
      { defId: 'sealed_complaint', count: 1 },
      { defId: 'emergency_roster', count: 1 },
    ],
    ['dry_archive_packet', 'witness', 'documents', 'public_trade'],
  );
  addContainer(
    world,
    rooms.shortcut,
    rooms.shortcut.x + rooms.shortcut.w - 8,
    rooms.shortcut.y + 8,
    ContainerKind.EMERGENCY_BOX,
    'Ящик проб зараженного короткого хода',
    'public',
    [
      { defId: 'contaminated_swab', count: 1 },
      { defId: 'wet_rag_bundle', count: 1 },
    ],
    [...WATER_TAGS, 'sample', 'shortcut_risk'],
  );
  const floodgate = addContainer(
    world,
    rooms.floodgate,
    rooms.floodgate.x + 8,
    rooms.floodgate.y + 7,
    ContainerKind.TOOL_LOCKER,
    'Пломбированный шкаф водоотсечки',
    'faction',
    [
      { defId: 'valve_tag', count: 1 },
      { defId: 'decon_fluid', count: 1 },
      { defId: 'filter_receipt', count: 1 },
    ],
    ['floodgate_control', 'raise_floodgate', 'liquidator', 'water'],
    4,
  );
  addContainer(
    world,
    rooms.dryingRoom,
    rooms.dryingRoom.x + rooms.dryingRoom.w - 8,
    rooms.dryingRoom.y + 9,
    ContainerKind.TOOL_LOCKER,
    'Ремонтный ящик аварийной просушки',
    'room',
    [
      { defId: 'cloth_roll', count: 1 },
      { defId: 'wet_rag_bundle', count: 1 },
      { defId: 'filter_receipt', count: 1 },
    ],
    ['drying_room', 'counterplay', 'water'],
  );
  state.dryPacketContainerIds.push(dryA.id, dryB.id);
  state.floodgateContainerId = floodgate.id;
}

