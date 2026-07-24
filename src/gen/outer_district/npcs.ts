import { Entity, type Room } from '../../core/types';
import { World } from '../../core/world';
import { SeedRng } from '../../core/rand';

export function spawnOuterDistrictNpcs(_rng: SeedRng, _world: World, _entities: Entity[], _nextId: { v: number }, _rooms: Room[]): number[] {
  // Empty, no NPCs according to "Silent Hill vibe"
  return [];
}
