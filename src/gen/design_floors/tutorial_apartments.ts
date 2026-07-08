import { Cell, ContainerKind, DoorState, FloorLevel, Tex, type WorldContainer } from '../../core/types';
import type { World } from '../../core/world';

export function spawnTutorialExitDoor(world: World, cellX: number, cellY: number): void {
  const doorIdx = world.idx(cellX, cellY);
  world.cells[doorIdx] = Cell.DOOR;
  world.wallTex[doorIdx] = Tex.DOOR_METAL;
  world.floorTex[doorIdx] = Tex.F_LINO;
  world.aptMask[doorIdx] = 1;
  world.hermoWall[doorIdx] = 1;
  world.doors.set(doorIdx, {
    idx: doorIdx,
    state: DoorState.LOCKED,
    roomA: -1,
    roomB: -1,
    keyId: 'key_tutorial_apartment',
    timer: 0,
    isTutorialExit: true,
  });
}

export function spawnTutorialKey(world: World, nextId: {v: number}, x: number, y: number): void {
  const containerId = nextId.v++;
  const container: WorldContainer = {
    id: containerId,
    x,
    y,
    floor: FloorLevel.LIVING,
    roomId: -1,
    zoneId: world.zoneMap[world.idx(x, y)] ?? 0,
    kind: ContainerKind.FILING_CABINET,
    name: 'Старая тумбочка',
    inventory: [{ defId: 'key_tutorial_apartment', count: 1 }],
    capacitySlots: 4,
    access: 'public',
    discovered: true,
    tags: ['tutorial_key_container'],
  };
  world.addContainer(container);
}
