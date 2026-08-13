import { generateLiquidatorBaseDesignFloor } from '../liquidatorbase';
import { generateOuterDistrictDesignFloor } from '../outer_district';
import {
  DESIGN_FLOOR_ROUTES,
  designFloorById,
  type DesignFloorId,
} from '../../data/design_floors';
import { territorySharesForDesignFloor } from '../../data/floor_territory';
import { hashSeed, withSeededRandom } from '../../core/rand';
import { floorRunZAllowsNpcs, routeExpectedLiftDirections } from '../../data/procedural_floors';
import { ensureReachableRouteLifts, generateZones } from '../shared';
import { initializeCellTerritory } from '../../systems/territory';
import type { FloorGeneration } from '../floor_manifest';
import { withoutNpcEntities } from '../entity_filters';
import { applyDesignFloorObjectProfile } from '../floor_object_placement';
import { fillVisualSlotsForWorldFeatures } from '../visual_cell_slots';
import { rebuildGeneratedFloorPathBlockers } from '../path_blockers';
import { populateDesignFloorAmbientNpcs, populateDesignFloorMonsters } from './population';
import { generateAntennaCourtDesignFloor } from '../antenna_court';
import { generateAttractorDvorDesignFloor } from '../attractor_dvor';
import { generateBankFloorDesignFloor } from '../bank_floor';
import { generateBolnichnyKorpusDesignFloor } from '../bolnichny_korpus';
import { generateBlackMarket88DesignFloor, reinforceBlackMarket88AuthoredHqTerritory } from '../black_market_88';
import { generateCantorPustotyDesignFloor } from '../cantor_pustoty';
import { generateCayleyByuroDesignFloor } from '../cayley_byuro';
import { generateChthonicAtticDesignFloor } from '../chthonic_attic';
import { generateCommunalRingDesignFloor } from '../communal_ring';
import { generateCriticalLeakArchiveDesignFloor } from '../critical_leak_archive';
import { generateDarkMetroDesignFloor } from '../dark_metro';
import { generateDarknessDesignFloor } from '../darkness';
import { generateHorrorFloorDesignFloor } from '../horrorfloor';
import { generateFloor69DesignFloor } from '../floor_69';
import { generateHarmonicBathhouseDesignFloor } from '../harmonic_bathhouse';
import { generateHilbertDepotDesignFloor } from '../hilbert_depot';
import { generateHyperbolicSwitchyardDesignFloor } from '../hyperbolic_switchyard';
import { generateIstinniyLabirintDesignFloor } from '../istinniy_labirint';
import { generateManhattanCrossroadsDesignFloor } from '../manhattan_crossroads';
import { generateMarkovStairwellDesignFloor, reinforceMarkovStairwellAuthoredHqTerritory } from '../markov_stairwell';
import { generateMoebiusPodezdDesignFloor } from '../moebius_podezd';
import { generateNumberRegistryDesignFloor } from '../number_registry';
import { generateObschezhitieSmenyDesignFloor } from '../obschezhitie_smeny';
import { generateOranzhereyaBetonaDesignFloor } from '../oranzhereya_betona';
import { generatePenroseLaundryDesignFloor, reinforcePenroseLaundryAuthoredHqTerritory } from '../penrose_laundry';
import { generatePerevalkaDesignFloor, reinforcePerevalkaAuthoredHqTerritory } from '../perevalka';
import { generatePioneerCampDesignFloor } from '../pioneer_camp';
import { generatePodadDesignFloor } from '../podad';
import {
  generateProductionBeltDesignFloor,
  reinforceProductionBeltAuthoredHqTerritory,
} from '../production_belt';
import { generateRadonExchangeDesignFloor } from '../radon_exchange';
import { generateRaionsovetArchiveDesignFloor } from '../raionsovet_archive';
import { generateRegistryMorgueDesignFloor } from '../registry_morgue';
import { generateRoofDesignFloor } from '../roof';
import { generateServiceFloorDesignFloor, reinforceServiceFloorAuthoredHqTerritory } from '../service_floor';
import { generateShahtaAtriumDesignFloor, reinforceShahtaAtriumAuthoredHqTerritory } from '../shahta_atrium';
import { generateSiliconNetWellDesignFloor } from '../silicon_net_well';
import { generateSlimeNiiDesignFloor } from '../slime_nii';
import { generateSpetspriemnikDesignFloor } from '../spetspriemnik';
import { generateSpectralChasovnyaDesignFloor } from '../spectral_chasovnya';
import { generateTuringNurseryDesignFloor } from '../turing_nursery';
import { generateUnderhellDesignFloor } from '../underhell';
import { generateUpperBureauDesignFloor } from '../upper_bureau';
import { generateVoronoiQuarantineDesignFloor } from '../voronoi_quarantine';
import { generateMinistry } from '../ministry';
import { generateKvartiry } from '../kvartiry';
import { generateWorld as generateLivingDesignFloor } from '../living';
import { generateMaintenance } from '../maintenance';
import { generateHell } from '../hell';
import { generateVoid } from '../void';

const DESIGN_FLOOR_GENERATORS: Record<DesignFloorId, (seed: number) => FloorGeneration> = {
  liquidatorbase: generateLiquidatorBaseDesignFloor,
  outer_district: generateOuterDistrictDesignFloor,
  roof: generateRoofDesignFloor,
  // takes an optional rootChoice variant, not a seed — global rng is already seeded by withSeededRandom below
  chthonic_attic: () => generateChthonicAtticDesignFloor(),
  radon_exchange: generateRadonExchangeDesignFloor,
  antenna_court: generateAntennaCourtDesignFloor,
  spetspriemnik: generateSpetspriemnikDesignFloor,
  cayley_byuro: generateCayleyByuroDesignFloor,
  upper_bureau: generateUpperBureauDesignFloor,
  number_registry: generateNumberRegistryDesignFloor,
  istinniy_labirint: generateIstinniyLabirintDesignFloor,
  bank_floor: generateBankFloorDesignFloor,
  critical_leak_archive: generateCriticalLeakArchiveDesignFloor,
  raionsovet_archive: generateRaionsovetArchiveDesignFloor,
  markov_stairwell: generateMarkovStairwellDesignFloor,
  registry_morgue: generateRegistryMorgueDesignFloor,
  bolnichny_korpus: generateBolnichnyKorpusDesignFloor,
  slime_nii: generateSlimeNiiDesignFloor,
  turing_nursery: generateTuringNurseryDesignFloor,
  manhattan_crossroads: generateManhattanCrossroadsDesignFloor,
  voronoi_quarantine: generateVoronoiQuarantineDesignFloor,
  communal_ring: generateCommunalRingDesignFloor,
  moebius_podezd: generateMoebiusPodezdDesignFloor,
  pioneer_camp: generatePioneerCampDesignFloor,
  oranzhereya_betona: generateOranzhereyaBetonaDesignFloor,
  floor_69: generateFloor69DesignFloor,
  obschezhitie_smeny: generateObschezhitieSmenyDesignFloor,
  penrose_laundry: generatePenroseLaundryDesignFloor,
  black_market_88: generateBlackMarket88DesignFloor,
  perevalka: generatePerevalkaDesignFloor,
  production_belt: generateProductionBeltDesignFloor,
  service_floor: generateServiceFloorDesignFloor,
  silicon_net_well: generateSiliconNetWellDesignFloor,
  shahta_atrium: generateShahtaAtriumDesignFloor,
  hyperbolic_switchyard: generateHyperbolicSwitchyardDesignFloor,
  harmonic_bathhouse: generateHarmonicBathhouseDesignFloor,
  hilbert_depot: generateHilbertDepotDesignFloor,
  dark_metro: generateDarkMetroDesignFloor,
  attractor_dvor: generateAttractorDvorDesignFloor,
  // takes optional generation options, not a seed — global rng is already seeded by withSeededRandom below
  underhell: () => generateUnderhellDesignFloor(),
  podad: generatePodadDesignFloor,
  spectral_chasovnya: generateSpectralChasovnyaDesignFloor,
  cantor_pustoty: generateCantorPustotyDesignFloor,
  darkness: generateDarknessDesignFloor,
  horrorfloor: generateHorrorFloorDesignFloor,
  living: generateLivingDesignFloor,
  kvartiry: generateKvartiry,
  ministry: generateMinistry,
  maintenance: generateMaintenance,
  hell: generateHell,
  void: generateVoid,
};

const DEFAULT_DESIGN_FLOOR_SEED = 0x4453474e;

export function designFloorGenerationSeed(id: DesignFloorId, runSeed = DEFAULT_DESIGN_FLOOR_SEED): number {
  return hashSeed(`design-z: ${id}`, runSeed);
}

export function isDesignFloorId(id: string): id is DesignFloorId {
  return designFloorById(id) !== undefined;
}

export function designFloorGeneratorIds(): readonly DesignFloorId[] {
  return Object.keys(DESIGN_FLOOR_GENERATORS) as DesignFloorId[];
}

export function generateDesignFloor(id: DesignFloorId, runSeed = DEFAULT_DESIGN_FLOOR_SEED, isTutorial = false): FloorGeneration {
  const route = designFloorById(id);
  const seed = designFloorGenerationSeed(id, runSeed);
  return withSeededRandom(seed, () => {
    let gen: FloorGeneration;
    if (id === 'living' && isTutorial) {
      gen = (DESIGN_FLOOR_GENERATORS[id] as unknown as (s?: number, t?: boolean) => FloorGeneration)(seed, true);
    } else {
      gen = DESIGN_FLOOR_GENERATORS[id](seed);
    }
    if (!route) return gen;
    gen.world.hasOpenSky = route.hasOpenSky;
    // Route-contract lift guarantee (still geometry phase, before objects/territory):
    // every expected direction gets a lift reachable from spawn; lifts of unexpected
    // directions (or stranded in sealed pockets) are demoted. Void z=MIN expects [] —
    // the intentional no-return terminus stays lift-free.
    ensureReachableRouteLifts(gen.world, gen.spawnX, gen.spawnY, routeExpectedLiftDirections(route.z));
    applyDesignFloorObjectProfile(gen.world, gen.spawnX, gen.spawnY, route);
    if (id === 'markov_stairwell') reinforceMarkovStairwellAuthoredHqTerritory(gen.world);
    if (id === 'service_floor') reinforceServiceFloorAuthoredHqTerritory(gen.world);

    // Zone fallback: canonical generators build zones themselves before territory init
    // (hell, kvartiry); if a generator skipped it, world.zones stays empty and zone-level
    // consumers (population placement, HUD map, runtime) see 0 of 64 zones. Never
    // overwrite zones a floor authored itself.
    if (gen.world.zones.length === 0) generateZones(gen.world);
    initializeCellTerritory(gen.world, {
      seed,
      targetShares: territorySharesForDesignFloor(id),
    });
    if (id === 'black_market_88') reinforceBlackMarket88AuthoredHqTerritory(gen.world);
    if (id === 'shahta_atrium') reinforceShahtaAtriumAuthoredHqTerritory(gen.world);
    if (id === 'production_belt') reinforceProductionBeltAuthoredHqTerritory(gen.world);
    if (id === 'penrose_laundry') reinforcePenroseLaundryAuthoredHqTerritory(gen.world);
    if (id === 'perevalka') reinforcePerevalkaAuthoredHqTerritory(gen.world);
    // Floor-authored post-territory reinforcement (HQ ownership, zone tuning) that the
    // generator deferred to a hook; previously this hook was set but never invoked.
    gen.onAfterTerritory?.(gen.world, gen.entities);

    // Single authoritative ambient-NPC populate for every design floor. Runs after
    // territory init so NPC faction derives from cell ownership, and uses the real
    // route (theme/z/danger) so counts are correct — the per-generator populate calls
    // that passed hardcoded/partial routes have been removed.
    populateDesignFloorAmbientNpcs(gen, route);
    // Monster packs after NPCs: both draw from one shared active-actor budget, so placing
    // NPCs first then fitting monsters into the remaining slots starves neither. Packs are
    // anisotropic (crowds, loners, territorial holds, roamers) driven by monster ecology.
    populateDesignFloorMonsters(gen, route);
    rebuildGeneratedFloorPathBlockers(gen.world, seed, gen.spawnX, gen.spawnY);
    fillVisualSlotsForWorldFeatures(gen.world, seed);
    return floorRunZAllowsNpcs(route.z) ? gen : withoutNpcEntities(gen);
  });
}

export function validateDesignFloorGenerators(): void {
  for (const def of DESIGN_FLOOR_ROUTES) {
    if (!DESIGN_FLOOR_GENERATORS[def.id]) {
      throw new Error(`Missing design floor generator: ${def.id}`);
    }
  }
}
