import type { World } from '../core/world';
import { pathBlockedAt } from '../core/path_blockers';

export interface ActorOccupyOptions {
  ignoreFineBlockers?: boolean;
  ignoreCoarseSolids?: boolean;
}

export function canActorOccupyCoarse(world: World, x: number, y: number, radius: number): boolean {
  return !world.solid(Math.floor(x + radius), Math.floor(y + radius)) &&
    !world.solid(Math.floor(x + radius), Math.floor(y - radius)) &&
    !world.solid(Math.floor(x - radius), Math.floor(y + radius)) &&
    !world.solid(Math.floor(x - radius), Math.floor(y - radius));
}

export function canActorOccupyFine(world: World, x: number, y: number, radius: number): boolean {
  void radius;
  return !pathBlockedAt(world, x, y);
}

export function canActorOccupy(
  world: World,
  x: number,
  y: number,
  radius: number,
  options: ActorOccupyOptions = {},
): boolean {
  if (!options.ignoreCoarseSolids && !canActorOccupyCoarse(world, x, y, radius)) return false;
  if (!options.ignoreFineBlockers && !canActorOccupyFine(world, x, y, radius)) return false;
  return true;
}
