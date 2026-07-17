import { ServiceUtilityDomain, ServiceUtilityFront, ServiceUtilityEdgeKind, DESIGN_FLOOR_ID } from './meta';
import { Cell, type Room } from '../../core/types';
import { World } from '../../core/world';

export interface ServiceUtilityNode {
  id: string;
  domain: ServiceUtilityDomain;
  front: ServiceUtilityFront;
  roomDefId: string;
  roomId: number;
  x: number;
  y: number;
  panelId?: 'panel_power' | 'panel_water' | 'panel_doors' | 'panel_vent';
}

export interface ServiceUtilityEdge {
  from: string;
  to: string;
  kind: ServiceUtilityEdgeKind;
  risk: 1 | 2 | 3 | 4 | 5;
  clue: string;
}

export interface ServiceDrainageBasin {
  id: string;
  roomDefId: string;
  roomId: number;
  x: number;
  y: number;
  waterCells: number;
  pressure: 1 | 2 | 3 | 4 | 5;
}

export interface ServiceUtilityGraph {
  routeId: typeof DESIGN_FLOOR_ID;
  nodes: ServiceUtilityNode[];
  edges: ServiceUtilityEdge[];
  drainageBasins: ServiceDrainageBasin[];
}

export type ServiceLiftMachineState = 'faulty' | 'repaired';
export type ServicePowerZoneId = 'machine_hall' | 'breaker_room' | 'staff_route' | 'ventilation';

export const serviceUtilityGraphs = new WeakMap<World, ServiceUtilityGraph>();

export function getServiceUtilityGraph(world: World): ServiceUtilityGraph | undefined {
  const graph = serviceUtilityGraphs.get(world);
  if (!graph) return undefined;
  return {
    routeId: graph.routeId,
    nodes: graph.nodes.map(node => ({ ...node })),
    edges: graph.edges.map(edge => ({ ...edge })),
    drainageBasins: graph.drainageBasins.map(basin => ({ ...basin })),
  };
}

export function ensureServiceUtilityGraph(world: World): ServiceUtilityGraph {
  let graph = serviceUtilityGraphs.get(world);
  if (!graph) {
    graph = { routeId: DESIGN_FLOOR_ID, nodes: [], edges: [], drainageBasins: [] };
    serviceUtilityGraphs.set(world, graph);
  }
  return graph;
}

export function registerUtilityNode(
  world: World,
  room: Room,
  id: string,
  domain: ServiceUtilityDomain,
  front: ServiceUtilityFront,
  panelId?: ServiceUtilityNode['panelId'],
): void {
  const graph = ensureServiceUtilityGraph(world);
  if (graph.nodes.some(node => node.id === id)) return;
  graph.nodes.push({
    id,
    domain,
    front,
    roomDefId: room.name,
    roomId: room.id,
    x: room.x + room.w / 2,
    y: room.y + room.h / 2,
    panelId,
  });
}

export function registerUtilityEdge(
  world: World,
  from: string,
  to: string,
  kind: ServiceUtilityEdgeKind,
  risk: ServiceUtilityEdge['risk'],
  clue: string,
): void {
  const graph = ensureServiceUtilityGraph(world);
  if (graph.edges.some(edge => edge.from === from && edge.to === to && edge.kind === kind)) return;
  graph.edges.push({ from, to, kind, risk, clue });
}

export function registerDrainageBasin(
  world: World,
  room: Room,
  id: string,
  pressure: ServiceDrainageBasin['pressure'],
): void {
  const graph = ensureServiceUtilityGraph(world);
  if (graph.drainageBasins.some(basin => basin.id === id)) return;
  let waterCells = 0;
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const idx = world.idx(room.x + dx, room.y + dy);
      if (world.roomMap[idx] === room.id && world.cells[idx] === Cell.WATER) waterCells++;
    }
  }
  graph.drainageBasins.push({
    id,
    roomDefId: room.name,
    roomId: room.id,
    x: room.x + room.w / 2,
    y: room.y + room.h / 2,
    waterCells,
    pressure,
  });
}

export function registerServiceBaseUtilityGraph(
  world: World,
  rooms: {
    westLift: Room;
    eastLift: Room;
    machine: Room;
    breaker: Room;
    janitor: Room;
    vent: Room;
    canteen: Room;
    clerk: Room;
  },
): void {
  const graph: ServiceUtilityGraph = { routeId: DESIGN_FLOOR_ID, nodes: [], edges: [], drainageBasins: [] };
  serviceUtilityGraphs.set(world, graph);
  registerUtilityNode(world, rooms.westLift, 'west_service_lift', 'lift', 'staff_safe', 'panel_doors');
  registerUtilityNode(world, rooms.eastLift, 'east_service_lift', 'lift', 'route_transfer');
  registerUtilityNode(world, rooms.machine, 'lift_machine_front', 'lift', 'machine_maze', 'panel_doors');
  registerUtilityNode(world, rooms.breaker, 'breaker_power_front', 'power', 'staff_safe', 'panel_power');
  registerUtilityNode(world, rooms.vent, 'vent_signal_front', 'vent', 'route_transfer', 'panel_vent');
  registerUtilityNode(world, rooms.janitor, 'janitor_key_front', 'lift', 'staff_safe');
  registerUtilityNode(world, rooms.canteen, 'crew_safe_front', 'water', 'staff_safe');
  registerUtilityNode(world, rooms.clerk, 'raid_reroute_front', 'power', 'route_transfer');

  registerUtilityEdge(world, 'west_service_lift', 'lift_machine_front', 'lift_cable', 2, 'Западный лифт кормит машинный зал через открытый персональный ход.');
  registerUtilityEdge(world, 'lift_machine_front', 'east_service_lift', 'lift_cable', 3, 'Восточный служебный лифт становится производственным обходом после ремонта.');
  registerUtilityEdge(world, 'breaker_power_front', 'lift_machine_front', 'power_cable', 2, 'Щитовая питает реле лебедки и аварийный дверной контур.');
  registerUtilityEdge(world, 'breaker_power_front', 'vent_signal_front', 'power_cable', 3, 'Запитанная вентиляция открывает темный сигнальный лаз.');
  registerUtilityEdge(world, 'janitor_key_front', 'raid_reroute_front', 'duct', 2, 'Кладовая и диспетчерская входят в малый круг служебного ключа.');
  registerUtilityEdge(world, 'crew_safe_front', 'breaker_power_front', 'water_pipe', 1, 'Столовая держит безопасный бытовой стояк рядом со щитовой.');
}

export function registerExpandedServiceUtilityGraph(
  world: World,
  cores: readonly Room[],
  booths: readonly Room[],
  pumps: readonly Room[],
  basins: readonly Room[],
): void {
  for (let i = 0; i < cores.length; i++) {
    const core = cores[i];
    const nodeId = `machine_core_${i}`;
    registerUtilityNode(world, core, nodeId, 'lift', 'machine_maze', 'panel_doors');
    registerUtilityEdge(
      world,
      'lift_machine_front',
      nodeId,
      'lift_cable',
      i < 2 ? 3 : 4,
      `${core.name}: лебедка подключена к общему машинному фронту С-15.`,
    );
  }

  for (let i = 0; i < booths.length; i++) {
    const booth = booths[i];
    const nodeId = `control_booth_${i}`;
    registerUtilityNode(world, booth, nodeId, i < 4 ? 'lift' : 'power', i < 4 ? 'route_transfer' : 'machine_maze', 'panel_power');
    registerUtilityEdge(
      world,
      'breaker_power_front',
      nodeId,
      'power_cable',
      i < 4 ? 2 : 3,
      `${booth.name}: пульт питается от щитовой и видит служебные обходы.`,
    );
    if (cores.length) {
      registerUtilityEdge(
        world,
        nodeId,
        `machine_core_${i % cores.length}`,
        'lift_cable',
        3,
        `${booth.name}: ручной пульт замыкает соседнее лифтовое ядро.`,
      );
    }
  }

  for (let i = 0; i < pumps.length; i++) {
    const pump = pumps[i];
    const nodeId = `pump_front_${i}`;
    registerUtilityNode(world, pump, nodeId, 'water', 'pressure_basin', 'panel_water');
    registerUtilityEdge(
      world,
      'crew_safe_front',
      nodeId,
      'water_pipe',
      i === 0 ? 3 : 4,
      `${pump.name}: бытовой стояк уходит в напорный карман.`,
    );
  }

  for (let i = 0; i < basins.length; i++) {
    const basin = basins[i];
    const nodeId = `drainage_basin_${i}`;
    registerUtilityNode(world, basin, nodeId, 'water', 'pressure_basin', 'panel_water');
    registerDrainageBasin(world, basin, nodeId, (3 + (i & 1)) as ServiceDrainageBasin['pressure']);
    registerUtilityEdge(
      world,
      `pump_front_${i % Math.max(1, pumps.length)}`,
      nodeId,
      'water_pipe',
      4,
      `${basin.name}: кабельный фронт набирает воду через насосный обратный напор.`,
    );
    registerUtilityEdge(
      world,
      'vent_signal_front',
      nodeId,
      'duct',
      3,
      `${basin.name}: узкий тензорный лаз проходит над мокрой кабельной кромкой.`,
    );
  }
}

