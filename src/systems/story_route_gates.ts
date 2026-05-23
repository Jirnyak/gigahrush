/* ── Story route gates: small floor mutations keyed by plot state ─ */

import {
  Cell,
  LiftDirection,
  type Entity,
  type GameState,
} from '../core/types';
import { World } from '../core/world';
import { ensureFloorRouteLiftLayout } from './floor_memory';
import {
  currentFloorRunEntry,
  floorRunEntryLiftDirections,
  podadLowerRouteOpen,
  ROUTE_LIFTS_PER_DIRECTION,
} from './procedural_floors';

function hasUsableLift(world: World, direction: LiftDirection): boolean {
  for (let i = 0; i < world.cells.length; i++) {
    if (world.cells[i] === Cell.LIFT && world.liftDir[i] === direction) return true;
  }
  return false;
}

export function applyStoryRouteGates(world: World, player: Entity, state: GameState): boolean {
  const entry = currentFloorRunEntry(state);
  if (entry.designFloorId !== 'podad' || !podadLowerRouteOpen(state)) return false;
  const hadDownLift = hasUsableLift(world, LiftDirection.DOWN);
  ensureFloorRouteLiftLayout(world, player.x, player.y, floorRunEntryLiftDirections(entry, true), {
    countPerDirection: ROUTE_LIFTS_PER_DIRECTION,
  });
  return !hadDownLift && hasUsableLift(world, LiftDirection.DOWN);
}
