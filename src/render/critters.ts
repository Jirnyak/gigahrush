import { crittersEnabled } from '../systems/ui_orchestrator';
import { World } from '../core/world';
import { Cell } from '../core/types';
import { playRoachCrunch, playSoundAt } from '../systems/audio';
import { SeedRng } from '../core/rand.js';
const _localCritterRng = new SeedRng(Date.now() % 99999);
const rng = () => _localCritterRng.random();
import { CRITTER_DEFS, getRandomCritterDefId } from '../data/critters';

/**
 * Returns whether critters (and small particles like flies/roaches) should be rendered.
 * Automatically disables them on mobile devices (maxTouchPoints > 0) or if the UI toggle is disabled.
 * A runtime FPS check can optionally be passed to disable them below 30 FPS.
 */
export function getCritterRenderEnabled(fps?: number): boolean {
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
    return false;
  }
  if (fps !== undefined && fps < 30) {
    return false;
  }
  return crittersEnabled();
}

export interface Critter {
  active: boolean;
  defId: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  speed: number;
  phase: number;
}

export const MAX_CRITTERS = 256;
export const CRITTERS_POOL: Critter[] = Array.from({ length: MAX_CRITTERS }, () => ({
  active: false, defId: 'roach', x: 0, y: 0, z: 0, targetX: 0, targetY: 0, speed: 1, phase: 0
}));

export function updateCritters(world: World, dt: number, playerX: number, playerY: number) {
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return;

  let activeCount = 0;
  for (let i = 0; i < MAX_CRITTERS; i++) {
    const c = CRITTERS_POOL[i];
    if (c.active) activeCount++;
  }

  if (activeCount < MAX_CRITTERS && rng() < 0.1) {
    // Attempt to spawn
    const angle = rng() * Math.PI * 2;
    const dist = 5 + rng() * 10; // spawn between 5 and 15 cells away
    const sx = Math.round(playerX + Math.cos(angle) * dist);
    const sy = Math.round(playerY + Math.sin(angle) * dist);
    const cell = world.get(sx, sy);
    
    if (cell === Cell.FLOOR) {
      const defId = getRandomCritterDefId();
      const def = CRITTER_DEFS[defId];
      
      const spawnCount = def.spawnBatch[0] + Math.floor(rng() * (def.spawnBatch[1] - def.spawnBatch[0] + 1));
      let spawned = 0;
      
      for (let i = 0; i < MAX_CRITTERS && spawned < spawnCount; i++) {
        if (!CRITTERS_POOL[i].active) {
          const nc = CRITTERS_POOL[i];
          nc.active = true;
          nc.defId = defId;
          
          // Spread swarms slightly, precise center for single entities
          const offsetX = spawnCount > 1 ? (rng() - 0.5) * 1.5 : 0;
          const offsetY = spawnCount > 1 ? (rng() - 0.5) * 1.5 : 0;
          
          nc.x = sx + offsetX;
          nc.y = sy + offsetY;
          nc.z = def.baseZ + (rng() - 0.5) * def.zVariance;
          nc.targetX = nc.x;
          nc.targetY = nc.y;
          nc.speed = def.speed;
          nc.phase = rng() * 100;
          spawned++;
        }
      }
    }
  }

  for (let i = 0; i < MAX_CRITTERS; i++) {
    const c = CRITTERS_POOL[i];
    if (!c.active) continue;

    const def = CRITTER_DEFS[c.defId];
    if (!def) {
      c.active = false;
      continue;
    }

    // Despawn if too far
    const dxP = c.x - playerX;
    const dyP = c.y - playerY;
    const distP = Math.sqrt(dxP * dxP + dyP * dyP);
    if (distP > 25) {
      c.active = false;
      continue;
    }

    if (def.crunchable && distP < 0.5) {
      c.active = false;
      playSoundAt(playRoachCrunch, c.x, c.y);
      continue;
    }

    // Update Z for flying critters
    if (def.zVariance > 0) {
      c.phase += dt * 2.0; // Phase speed
      c.z = def.baseZ + Math.sin(c.phase) * def.zVariance;
    }

    const dx = c.targetX - c.x;
    const dy = c.targetY - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      pickNewCritterTarget(world, c, playerX, playerY, def, distP);
    } else {
      c.x += (dx / dist) * c.speed * dt;
      c.y += (dy / dist) * c.speed * dt;
    }
  }
}

function getAdjacentFloors(world: World, x: number, y: number) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const floors = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = rx + dx;
      const ny = ry + dy;
      if (world.get(nx, ny) === Cell.FLOOR) {
        floors.push({ x: nx, y: ny });
      }
    }
  }
  return floors;
}

function hasAdjacentWall(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (world.get(x + dx, y + dy) === Cell.WALL) {
        return true;
      }
    }
  }
  return false;
}

export function pickNewCritterTarget(world: World, c: Critter, playerX: number, playerY: number, def: any, distToPlayer: number) {
  if (rng() > 0.05) return;

  if (def.behavior === 'flee_player') {
    if (distToPlayer < def.fleeDist) {
      c.speed = def.fleeSpeed;
      const dx = c.x - playerX;
      const dy = c.y - playerY;
      c.targetX = c.x + (dx > 0 ? 1 : -1);
      c.targetY = c.y + (dy > 0 ? 1 : -1);
    } else {
      c.speed = def.speed;
      const candidates = getAdjacentFloors(world, c.x, c.y);
      if (candidates.length > 0) {
        let nearWall = null;
        for (let i = 0; i < candidates.length; i++) {
          if (hasAdjacentWall(world, candidates[i].x, candidates[i].y)) {
            nearWall = candidates[i];
            break;
          }
        }
        if (nearWall) {
          c.targetX = nearWall.x;
          c.targetY = nearWall.y;
        } else {
          const rC = candidates[Math.floor(rng() * candidates.length)];
          c.targetX = rC.x;
          c.targetY = rC.y;
        }
      }
    }
  } else if (def.behavior === 'wander_pause') {
    if (distToPlayer < def.fleeDist && rng() < 0.8) {
      // Roaches tend to freeze when approached
      c.speed = 0;
    } else {
      c.speed = def.speed;
      const candidates = getAdjacentFloors(world, c.x, c.y);
      if (candidates.length > 0) {
        const rC = candidates[Math.floor(rng() * candidates.length)];
        c.targetX = rC.x;
        c.targetY = rC.y;
      }
    }
  } else if (def.behavior === 'swarm') {
    c.speed = def.speed;
    // Erratic, tight orbit
    const tx = c.x + (rng() - 0.5) * 2.0;
    const ty = c.y + (rng() - 0.5) * 2.0;
    const cell = world.get(Math.round(tx), Math.round(ty));
    // Flies don't care too much about precise floors, but let's keep them from flying completely through walls
    if (cell === Cell.FLOOR) {
      c.targetX = tx;
      c.targetY = ty;
    }
  }
}
