import { Cell, Feature, RoomType, type Room, DoorState } from '../../core/types';
import { World } from '../../core/world';
import { SeedRng, irandFrom } from '../../core/rand';
import { DISTRICT_MIN, DISTRICT_MAX, GRASS_TEX, HOUSE_FLOOR_TEX, HOUSE_WALL_TEX, ROAD_TEX } from './meta';

export function carveOuterDistrictGrid(world: World, rng: SeedRng, baseRoomId: number) {
  // Fill base room with grass
  for (let y = DISTRICT_MIN; y < DISTRICT_MAX; y++) {
    for (let x = DISTRICT_MIN; x < DISTRICT_MAX; x++) {
      const idx = world.idx(x, y);
      world.cells[idx] = Cell.FLOOR;
      world.floorTex[idx] = GRASS_TEX;
      world.roomMap[idx] = baseRoomId;
    }
  }

  // Draw some roads (grid)
  const ROAD_W = 12;
  const blocks = 4;
  const step = (DISTRICT_MAX - DISTRICT_MIN) / blocks;
  
  const roadCentersX = [];
  const roadCentersY = [];
  for (let i = 1; i < blocks; i++) {
    roadCentersX.push(DISTRICT_MIN + Math.floor(i * step));
    roadCentersY.push(DISTRICT_MIN + Math.floor(i * step));
  }

  for (let y = DISTRICT_MIN; y < DISTRICT_MAX; y++) {
    for (let x = DISTRICT_MIN; x < DISTRICT_MAX; x++) {
      let isRoad = false;
      for (const rx of roadCentersX) {
        if (Math.abs(x - rx) < ROAD_W) isRoad = true;
      }
      for (const ry of roadCentersY) {
        if (Math.abs(y - ry) < ROAD_W) isRoad = true;
      }

      if (isRoad) {
        const idx = world.idx(x, y);
        world.floorTex[idx] = ROAD_TEX;
      }
    }
  }

  // Place trees randomly on grass
  for (let y = DISTRICT_MIN; y < DISTRICT_MAX; y++) {
    for (let x = DISTRICT_MIN; x < DISTRICT_MAX; x++) {
      const idx = world.idx(x, y);
      if (world.floorTex[idx] === GRASS_TEX && rng.random() < 0.05) {
        world.features[idx] = Feature.TREE;
      }
    }
  }
}

export function stampOuterDistrictHouses(world: World, rng: SeedRng, nextRoomId: {v: number}): Room[] {
  const rooms: Room[] = [];
  
  const blocks = 4;
  const step = (DISTRICT_MAX - DISTRICT_MIN) / blocks;

  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) {
      if (rng.random() < 0.3) continue; // skip some blocks
      
      const cx = DISTRICT_MIN + Math.floor((bx + 0.5) * step);
      const cy = DISTRICT_MIN + Math.floor((by + 0.5) * step);
      
      const w = irandFrom(rng.random.bind(rng), 12, 18);
      const h = irandFrom(rng.random.bind(rng), 12, 18);
      
      const rx = cx - Math.floor(w / 2);
      const ry = cy - Math.floor(h / 2);

      const id = nextRoomId.v++;
      
      const room: Room = {
        id, type: RoomType.COMMON, x: world.wrap(rx), y: world.wrap(ry), w, h,
        doors: [], sealed: false,
        name: `Дом #${id}`,
        apartmentId: -1,
        wallTex: HOUSE_WALL_TEX,
        floorTex: HOUSE_FLOOR_TEX,
        ceilingTier: 4, // standard height
      };

      for (let dy = -1; dy <= h; dy++) {
        for (let dx = -1; dx <= w; dx++) {
          const gx = world.wrap(rx + dx);
          const gy = world.wrap(ry + dy);
          const ci = world.idx(gx, gy);
          if (dx === -1 || dx === w || dy === -1 || dy === h) {
            world.cells[ci] = Cell.WALL;
            world.wallTex[ci] = HOUSE_WALL_TEX;
            world.roomMap[ci] = -1;
          } else {
            world.cells[ci] = Cell.FLOOR;
            world.floorTex[ci] = HOUSE_FLOOR_TEX;
            world.features[ci] = Feature.NONE;
            world.roomMap[ci] = room.id;
          }
        }
      }

      // Add a door
      const doorDx = Math.floor(w / 2);
      const doorDy = rng.random() < 0.5 ? -1 : h;
      const doorX = world.wrap(rx + doorDx);
      const doorY = world.wrap(ry + doorDy);
      
      world.cells[world.idx(doorX, doorY)] = Cell.DOOR;
      const doorIdx = world.idx(doorX, doorY);
      world.doors.set(doorIdx, {
        idx: doorIdx,
        state: DoorState.CLOSED,
        roomA: room.id,
        roomB: -1,
        keyId: '',
        timer: 0,
      });
      room.doors.push(doorIdx);

      world.rooms.push(room);
      rooms.push(room);
    }
  }

  return rooms;
}
