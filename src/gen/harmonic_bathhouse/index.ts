/* -- Design z: harmonic_bathhouse - heat, steam and pressure routes -- */

import {
  type Entity,
} from '../../core/types';
import { World } from '../../core/world';
import { withSeededRandom, xorshift32 } from '../../core/rand';
import {
  ensureConnectivity,
  generateZones,
  sanitizeDoors,
} from '../shared';
import { HARMONIC_BATHHOUSE_ROUTE_ID, HARMONIC_BATHHOUSE_Z, HarmonicBathhouseGeneration, SEED } from "./meta";
import { initWorld, buildRooms, connectRooms, placeLifts, tuneBathhouseZones, expandHarmonicBathhouseRouteGeometry, placePanels, registerCues, decisionNode } from "./geometry";
import { solveHarmonicBathhouseField, carveLevelSetCorridors, applyThermalBands, decorateRooms, alignHarmonicBathhouseAmbientNpcTerritory, registerHazards, placeContainers, spawnBathhouseNpcs, spawnBathhouseThreats } from "./npcs";

export function generateHarmonicBathhouseDesignFloor(seed = SEED): HarmonicBathhouseGeneration {
  return withSeededRandom(seed, () => {
    const world = new World();
    const entities: Entity[] = [];
    const nextId = { v: 10000 };
    const rand = xorshift32(seed);

    initWorld(world);
    const field = solveHarmonicBathhouseField(seed);
    carveLevelSetCorridors(world, field, seed);
    const rooms = buildRooms(world);
    connectRooms(world, rooms);
    placeLifts(world, rooms);
    const bands = applyThermalBands(world, field, rooms, seed);
    decorateRooms(world, rooms, seed);

    generateZones(world);
    expandHarmonicBathhouseRouteGeometry(world, rand);
    tuneBathhouseZones(world);
    alignHarmonicBathhouseAmbientNpcTerritory(world, entities);
    
    const panelIds = placePanels(world, rooms);
    const hazardIds = registerHazards(world, rooms, seed);
    const cueIds = registerCues(world, rooms);
    placeContainers(world, rooms);
    spawnBathhouseNpcs(entities, nextId, rooms);
    spawnBathhouseThreats(world, entities, nextId, rooms);

    sanitizeDoors(world);
    ensureConnectivity(world, rooms.entry.x + 46.5, rooms.entry.y + 13.5);
    world.rebuildContainerMap();
    world.bakeLights();

    return {
      isDecentralized: true,
      world,
      entities,
      spawnX: rooms.entry.x + 46.5,
      spawnY: rooms.entry.y + 13.5,
      bathhouseState: {
        routeId: HARMONIC_BATHHOUSE_ROUTE_ID,
        anchorZ: HARMONIC_BATHHOUSE_Z,
        bands,
        decisions: [
          decisionNode('turn_valve', rooms.boiler, ['valve', 'steam', 'pressure']),
          decisionNode('hot_fast_path', rooms.hotGallery, ['hot_fast_path', 'steam', 'risk']),
          decisionNode('cold_flooded_bypass', rooms.coldBypass, ['cold_flooded_bypass', 'water', 'slow']),
          decisionNode('repair_pressure_route', rooms.repairGallery, ['repair_pressure_route', 'panel', 'pressure']),
        ],
        cueIds,
        hazardIds,
        panelIds,
      },
    };
  });
}

/* The candidate asks for a harmonic z: fixed hot/cold sources are relaxed
 * into a scalar potential, then corridor bands follow its level sets. */
export * from "./meta";
export * from "./geometry";
export * from "./npcs";
