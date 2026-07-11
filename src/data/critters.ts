import { mathRng as rng } from '../core/rand';
export type CritterBehavior = 'flee_player' | 'wander_pause' | 'swarm';

export interface CritterDef {
  id: string;
  color: readonly [number, number, number]; // RGB 0-255
  size: number;
  baseZ: number;          // Baseline height from floor
  zVariance: number;      // Amplitude of Z oscillation (for flying critters)
  speed: number;
  fleeDist: number;      // Distance at which they react to player (0 if they don't flee)
  fleeSpeed: number;     // Speed when fleeing
  behavior: CritterBehavior;
  spawnBatch: readonly [number, number]; // Min/max instances to spawn at once
  crunchable: boolean;   // Can be stepped on (despawns on touch)
  spawnWeight: number;   // Relative weight for random spawning
}

export const CRITTER_DEFS: Record<string, CritterDef> = {
  rat: {
    id: 'rat',
    color: [120, 100, 100],
    size: 12.0,
    baseZ: 0.05,
    zVariance: 0.0,
    speed: 1.0,
    fleeDist: 3.0,
    fleeSpeed: 4.0,
    behavior: 'flee_player',
    spawnBatch: [1, 1],
    crunchable: false,
    spawnWeight: 40,
  },
  roach: {
    id: 'roach',
    color: [140, 90, 50],
    size: 6.0,
    baseZ: 0.02,
    zVariance: 0.0,
    speed: 1.5,
    fleeDist: 2.0,
    fleeSpeed: 1.5, // Roaches don't necessarily speed up, they just freeze or wander
    behavior: 'wander_pause',
    spawnBatch: [1, 2],
    crunchable: true,
    spawnWeight: 40,
  },
  fly: {
    id: 'fly',
    color: [15, 15, 15],
    size: 1.5,
    baseZ: 0.3,
    zVariance: 0.2, // Will fly up and down
    speed: 2.0,
    fleeDist: 0.0,  // Flies don't care about the player
    fleeSpeed: 2.0,
    behavior: 'swarm',
    spawnBatch: [6, 12], // Spawns a whole cloud
    crunchable: false,
    spawnWeight: 20,
  }
};

const _spawnWeights = Object.values(CRITTER_DEFS).map(d => ({ id: d.id, w: d.spawnWeight }));
const _totalWeight = _spawnWeights.reduce((a, b) => a + b.w, 0);

export function getRandomCritterDefId(): string {
  let r = rng() * _totalWeight;
  for (const { id, w } of _spawnWeights) {
    if (r < w) return id;
    r -= w;
  }
  return 'roach'; // fallback
}
