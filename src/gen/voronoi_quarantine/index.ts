/* -- Design z: voronoi_quarantine - Laguerre quarantine cells -- */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom } from '../../core/rand';
import { ensureConnectivity, generateZones, sanitizeDoors } from '../shared';
import type { FloorGeneration } from '../floor_manifest';
import {
  SEED,
  LLOYD_PASSES,
  layouts,
  tuneVoronoiQuarantineRouteZones,
  initWorld,
  buildSites,
  assignLaguerreCells,
  collectRidgeCandidates,
  placeRidgeDoors,
  buildRoomsFromOwners,
  placeFactionMiniHqs,
  placeQuarantineMidMicroRooms,
  countMicroVoronoiDoors,
  decorateSites,
  placeLifts,
  placeQuarantineEmergencyPanels,
  spawnNpcs,
  placeContainers,
  placeDrops,
  spawnThreats,
  stampContamination,
  sortedAdjacency,
  ridgeGraphConnected,
  findSiteCell,
  siteId,
  countSiteCells} from './geometry';

export * from './meta';
import {
  VORONOI_QUARANTINE_ROUTE_ID,
} from './meta';



export function generateVoronoiQuarantineDesignFloor(seed = SEED): FloorGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };

    initWorld(world);
    const sites = buildSites(world, seed);
    const owner = assignLaguerreCells(world, sites);
    const edgeMap = collectRidgeCandidates(world, owner, sites);
    const ridgeDoors = placeRidgeDoors(world, sites, edgeMap);
    buildRoomsFromOwners(world, sites, owner);
    placeFactionMiniHqs(world, sites, owner, seed);
    const cellStats = placeQuarantineMidMicroRooms(world, sites, owner, seed);
    decorateSites(world, sites, owner, seed);
    placeLifts(world, sites, owner);
    generateZones(world);
    tuneVoronoiQuarantineRouteZones(world);
    placeQuarantineEmergencyPanels(world, sites, owner, seed);

    const owners = spawnNpcs(world, entities, nextId, sites, owner);
    placeContainers(world, sites, owner, owners);
    placeDrops(world, entities, nextId, sites, owner);
    spawnThreats(world, entities, nextId, sites, owner);
    stampContamination(world, sites, seed);

    const spawn = findSiteCell(world, owner, sites, siteId(sites, 'northCheckpoint'));
    sanitizeDoors(world);
    ensureConnectivity(world, spawn.x + 0.5, spawn.y + 0.5);
    world.rebuildContainerMap();
    world.bakeLights();

    layouts.set(world, {
      routeId: VORONOI_QUARANTINE_ROUTE_ID,
      lloydPasses: LLOYD_PASSES,
      siteCount: sites.length + cellStats.mid + cellStats.micro,
      macroSiteCount: sites.length,
      midCellCount: cellStats.mid,
      microCellCount: cellStats.micro,
      microDoorCount: countMicroVoronoiDoors(world),
      siteCellCounts: countSiteCells(owner, sites.length),
      adjacencyEdges: sortedAdjacency(edgeMap),
      ridgeDoorCount: ridgeDoors.total,
      lockedPassDoorCount: ridgeDoors.lockedPass,
      supplyConnectorDoorCount: ridgeDoors.supplyConnector,
      connected: ridgeGraphConnected(sites, sortedAdjacency(edgeMap)),
    });

    return { world, entities, spawnX: spawn.x + 0.5, spawnY: spawn.y + 0.5 };
  });
}

export * from './geometry';
export * from './npcs';
