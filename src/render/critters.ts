import { crittersEnabled } from '../systems/ui_orchestrator';
import { World } from '../core/world';
import { Cell } from '../core/types';
import { playRoachCrunch, playSoundAt } from '../systems/audio';

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

export type CritterType = 'rat' | 'roach' | 'fly';

export interface Critter {
  active: boolean;
  type: CritterType;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  speed: number;
  phase: number;
}

export const MAX_CRITTERS = 64;
export const CRITTERS_POOL: Critter[] = Array.from({ length: MAX_CRITTERS }, () => ({
  active: false, type: 'roach', x: 0, y: 0, z: 0, targetX: 0, targetY: 0, speed: 1, phase: 0
}));

export function updateCritters(world: World, dt: number, playerX: number, playerY: number) {
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return;

  let activeCount = 0;
  for (let i = 0; i < MAX_CRITTERS; i++) {
    const c = CRITTERS_POOL[i];
    if (c.active) activeCount++;
  }

  if (activeCount < MAX_CRITTERS && Math.random() < 0.1) {
    // Attempt to spawn
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 10; // spawn between 5 and 15 cells away
    const sx = Math.round(playerX + Math.cos(angle) * dist);
    const sy = Math.round(playerY + Math.sin(angle) * dist);
    const cell = world.get(sx, sy);
    if (cell === Cell.FLOOR) {
      for (let i = 0; i < MAX_CRITTERS; i++) {
        if (!CRITTERS_POOL[i].active) {
          const nc = CRITTERS_POOL[i];
          nc.active = true;
          const r = Math.random();
          nc.type = r < 0.4 ? 'roach' : (r < 0.8 ? 'rat' : 'fly');
          nc.x = sx;
          nc.y = sy;
          nc.z = nc.type === 'fly' ? 0.2 + Math.random() * 0.3 : (nc.type === 'rat' ? 0.05 : 0.02);
          nc.targetX = sx;
          nc.targetY = sy;
          nc.speed = 1.0;
          nc.phase = Math.random() * 10;
          break;
        }
      }
    }
  }

  for (let i = 0; i < MAX_CRITTERS; i++) {
    const c = CRITTERS_POOL[i];
    if (!c.active) continue;

    // Despawn if too far
    const dxP = c.x - playerX;
    const dyP = c.y - playerY;
    const distP = Math.sqrt(dxP * dxP + dyP * dyP);
    if (distP > 25) {
      c.active = false;
      continue;
    }

    if (c.type === 'roach' && distP < 0.5) {
      c.active = false;
      playSoundAt(playRoachCrunch, c.x, c.y);
      continue;
    }

    const dx = c.targetX - c.x;
    const dy = c.targetY - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      pickNewCritterTarget(world, c, playerX, playerY);
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

export function pickNewCritterTarget(world: World, c: Critter, playerX: number, playerY: number) {
  if (Math.random() > 0.05) return;

  if (c.type === 'rat') {
    const dx = c.x - playerX;
    const dy = c.y - playerY;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);
    if (distToPlayer < 3.0) {
      c.speed = 4.0;
      c.targetX = c.x + (dx > 0 ? 1 : -1);
      c.targetY = c.y + (dy > 0 ? 1 : -1);
    } else {
      c.speed = 1.0;
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
          const rC = candidates[Math.floor(Math.random() * candidates.length)];
          c.targetX = rC.x;
          c.targetY = rC.y;
        }
      }
    }
  } else if (c.type === 'roach') {
    const dx = c.x - playerX;
    const dy = c.y - playerY;
    const distToPlayer = Math.sqrt(dx * dx + dy * dy);
    if (distToPlayer < 2.0 && Math.random() < 0.8) {
      c.speed = 0;
    } else {
      c.speed = 1.5;
      const candidates = getAdjacentFloors(world, c.x, c.y);
      if (candidates.length > 0) {
        const rC = candidates[Math.floor(Math.random() * candidates.length)];
        c.targetX = rC.x;
        c.targetY = rC.y;
      }
    }
  } else if (c.type === 'fly') {
    c.speed = 2.0;
    const tx = Math.round(c.x) + (Math.random() > 0.5 ? 1 : -1);
    const ty = Math.round(c.y) + (Math.random() > 0.5 ? 1 : -1);
    if (world.get(tx, ty) === Cell.FLOOR) {
      c.targetX = tx;
      c.targetY = ty;
    }
  }
}
