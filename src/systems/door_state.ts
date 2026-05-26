import { DoorState, type Door } from '../core/types';
import type { World } from '../core/world';

function blocksNavigation(state: DoorState): boolean {
  return state === DoorState.LOCKED || state === DoorState.HERMETIC_CLOSED;
}

export function setDoorState(world: World, door: Door | undefined, state: DoorState): boolean {
  if (!door || door.state === state) return false;
  const oldBlocks = blocksNavigation(door.state);
  door.state = state;
  if (oldBlocks !== blocksNavigation(state)) world.markCellsDirty();
  return true;
}
