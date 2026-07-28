import { Cell, Tex, RoomType, Feature, DoorState, type Entity, W } from '../../core/types';
import { World } from '../../core/world';
import { stampRoom } from '../shared';
import { irand } from '../../core/rand';

export function generateLiquidatorBaseArena(world: World, entities: Entity[], nextId: number): number {
  const size = 50;
  // Let's find a place for the arena, let's say near the center but avoiding spawn.
  const cx = Math.floor(W / 2) + irand(-50, 50);
  const cy = Math.floor(W / 2) + irand(-50, 50);

  // We need to carve out a room.
  const room = stampRoom(world, world.rooms.length, RoomType.COMMON, cx, cy, size, size, 0);
  room.name = 'Арена';
  room.tags = ['arena'];

  const ringSize = 20;
  const rx = cx + Math.floor(size / 2) - Math.floor(ringSize / 2);
  const ry = cy + Math.floor(size / 2) - Math.floor(ringSize / 2);

  for (let yy = -1; yy <= size; yy++) {
    for (let xx = -1; xx <= size; xx++) {
      const px = cx + xx;
      const py = cy + yy;
      const idx = world.idx(px, py);

      if (xx === -1 || xx === size || yy === -1 || yy === size) {
        world.cells[idx] = Cell.WALL;
        world.wallTex[idx] = Tex.METAL;
      } else {
        world.cells[idx] = Cell.FLOOR;
        world.floorTex[idx] = Tex.F_CONCRETE;

        // Ring
        if (px >= rx && px < rx + ringSize && py >= ry && py < ry + ringSize) {
          // Ring bounds
          if (px === rx || px === rx + ringSize - 1 || py === ry || py === ry + ringSize - 1) {
            world.setFeatureAt(idx, Feature.TABLE);
          }
        } else {
           // Tribunes
           if (irand(1, 100) <= 30) {
             world.setFeatureAt(idx, Feature.CHAIR);
           }
        }
      }
    }
  }

  // Two deterministic doors at the mid-points of the top and bottom walls, each
  // registered in world.doors + room.doors. The previous 5% roll wrote orphan
  // Cell.DOOR cells (never world.doors.set) and could place 0 doors on unlucky
  // seeds; world.solid() treats an unregistered door as a solid wall, so the arena
  // sealed into an unreachable 50×50 box. The maintenance floor's ensureConnectivity()
  // pass (index.ts, phase 15) carves the outside approach to these registered doors.
  const doorMidX = cx + Math.floor(size / 2);
  const topDoorI = world.idx(doorMidX, cy - 1);
  const bottomDoorI = world.idx(doorMidX, cy + size);
  for (const doorI of [topDoorI, bottomDoorI]) {
    world.cells[doorI] = Cell.DOOR;
    world.doors.set(doorI, { idx: doorI, state: DoorState.CLOSED, roomA: room.id, roomB: -1, keyId: '', timer: 0 });
    room.doors.push(doorI);
  }

  if (entities.length > 0) {
    // dummy check to avoid ts warning, usually we do something with entities.
  }

  return nextId;
}
