import { Cell, Feature, RoomType, type Room, DoorState, W } from '../../core/types';
import { World } from '../../core/world';
import { SeedRng, irandFrom, pickFrom } from '../../core/rand';
import { GRASS_TEX, HOUSE_FLOOR_TEX, HOUSE_WALL_TEX, ROAD_TEX, SIDEWALK_TEX } from './meta';

const BLOCK_SIZE = 64;
const STREET_WIDTH = 10;
const INNER_MIN = Math.floor(STREET_WIDTH / 2);
const INNER_MAX = BLOCK_SIZE - Math.floor(STREET_WIDTH / 2);

enum BlockType {
  PARK,
  RESIDENTIAL,
  PLAZA,
}

export function generateOuterDistrictCity(world: World, rng: SeedRng, nextRoomId: {v: number}, baseRoomId: number): Room[] {
  const rooms: Room[] = [];
  const blocksX = W / BLOCK_SIZE;
  const blocksY = W / BLOCK_SIZE;

  // First pass: assign block types and fill base terrain
  const blockTypes = new Int32Array(blocksX * blocksY);
  
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const type = pickFrom(rng.random.bind(rng), [BlockType.PARK, BlockType.PARK, BlockType.RESIDENTIAL, BlockType.RESIDENTIAL, BlockType.PLAZA]) as BlockType;
      blockTypes[by * blocksX + bx] = type;
      
      const baseX = bx * BLOCK_SIZE;
      const baseY = by * BLOCK_SIZE;
      
      // Carve block footprint
      for (let dy = 0; dy < BLOCK_SIZE; dy++) {
        for (let dx = 0; dx < BLOCK_SIZE; dx++) {
          const x = world.wrap(baseX + dx);
          const y = world.wrap(baseY + dy);
          const idx = world.idx(x, y);
          
          world.cells[idx] = Cell.FLOOR;
          world.roomMap[idx] = baseRoomId;
          
          // Streets on the edges of the block
          if (dx < INNER_MIN || dx >= INNER_MAX || dy < INNER_MIN || dy >= INNER_MAX) {
            world.floorTex[idx] = ROAD_TEX;
          } else {
            // Block interior
            if (type === BlockType.PARK) {
              world.floorTex[idx] = GRASS_TEX;
            } else if (type === BlockType.RESIDENTIAL) {
              world.floorTex[idx] = GRASS_TEX;
            } else {
              world.floorTex[idx] = ROAD_TEX; // concrete plaza
              if (rng.random() < 0.1) world.floorTex[idx] = GRASS_TEX; // some grass patches
            }
          }
        }
      }
    }
  }

  // Second pass: generate specific block contents
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const type = blockTypes[by * blocksX + bx];
      const baseX = bx * BLOCK_SIZE;
      const baseY = by * BLOCK_SIZE;
      
      if (type === BlockType.PARK) {
        generateParkBlock(world, rng, baseX, baseY);
      } else if (type === BlockType.RESIDENTIAL) {
        generateResidentialBlock(world, rng, baseX, baseY, nextRoomId, rooms);
      } else {
        generatePlazaBlock(world, rng, baseX, baseY);
      }
    }
  }

  return rooms;
}

function generateParkBlock(world: World, rng: SeedRng, baseX: number, baseY: number) {
  // Add trees
  for (let dy = INNER_MIN; dy < INNER_MAX; dy++) {
    for (let dx = INNER_MIN; dx < INNER_MAX; dx++) {
      const x = world.wrap(baseX + dx);
      const y = world.wrap(baseY + dy);
      const idx = world.idx(x, y);
      if (world.floorTex[idx] === GRASS_TEX && rng.random() < 0.15) {
        world.features[idx] = Feature.TREE;
      }
    }
  }
  
  // 1-tile wide tile paths
  let px = irandFrom(rng.random.bind(rng), INNER_MIN + 5, INNER_MAX - 5);
  let py = INNER_MIN; // start from top street
  
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const gx = world.wrap(baseX + px);
    const gy = world.wrap(baseY + py);
    const ci = world.idx(gx, gy);
    world.floorTex[ci] = SIDEWALK_TEX;
    world.features[ci] = Feature.NONE;
    
    const r = rng.random();
    if (r < 0.2) px++;
    else if (r < 0.4) px--;
    else if (r < 0.8) py++;
    else py--;
    
    px = Math.max(INNER_MIN, Math.min(INNER_MAX - 1, px));
    py = Math.max(INNER_MIN, Math.min(INNER_MAX - 1, py));
  }
}

function generatePlazaBlock(world: World, rng: SeedRng, baseX: number, baseY: number) {
  // Sparse trees in concrete plaza
  for (let dy = INNER_MIN; dy < INNER_MAX; dy++) {
    for (let dx = INNER_MIN; dx < INNER_MAX; dx++) {
      const x = world.wrap(baseX + dx);
      const y = world.wrap(baseY + dy);
      const idx = world.idx(x, y);
      if (world.floorTex[idx] === ROAD_TEX && rng.random() < 0.01) {
        world.features[idx] = Feature.TREE;
      }
    }
  }
}

function generateResidentialBlock(world: World, rng: SeedRng, baseX: number, baseY: number, nextRoomId: {v: number}, rooms: Room[]) {
  const isHorizontal = rng.random() < 0.5;
  const houseCount = irandFrom(rng.random.bind(rng), 2, 4);
  
  for (let i = 0; i < houseCount; i++) {
    let w = 0;
    let h = 0;
    let rx = 0;
    let ry = 0;
    
    if (isHorizontal) {
      w = irandFrom(rng.random.bind(rng), 20, 36);
      h = irandFrom(rng.random.bind(rng), 8, 12);
      rx = baseX + INNER_MIN + irandFrom(rng.random.bind(rng), 2, BLOCK_SIZE - STREET_WIDTH - w - 2);
      ry = baseY + INNER_MIN + Math.floor((i + 1) * ((BLOCK_SIZE - STREET_WIDTH) / (houseCount + 1))) - Math.floor(h / 2);
    } else {
      h = irandFrom(rng.random.bind(rng), 20, 36);
      w = irandFrom(rng.random.bind(rng), 8, 12);
      ry = baseY + INNER_MIN + irandFrom(rng.random.bind(rng), 2, BLOCK_SIZE - STREET_WIDTH - h - 2);
      rx = baseX + INNER_MIN + Math.floor((i + 1) * ((BLOCK_SIZE - STREET_WIDTH) / (houseCount + 1))) - Math.floor(w / 2);
    }
    
    const room = stampPanelHouse(world, rng, nextRoomId, rx, ry, w, h);
    if (room) rooms.push(room);
  }
}

function stampPanelHouse(world: World, rng: SeedRng, nextRoomId: {v: number}, rx: number, ry: number, w: number, h: number): Room | null {
  const id = nextRoomId.v++;
  
  const room: Room = {
    id, type: RoomType.COMMON, x: world.wrap(rx), y: world.wrap(ry), w, h,
    doors: [], sealed: false,
    name: `Панелька #${id}`,
    apartmentId: -1,
    wallTex: HOUSE_WALL_TEX,
    floorTex: HOUSE_FLOOR_TEX,
    ceilingTier: 4, // standard low ceiling
  };

  // Build walls and floor
  for (let dy = -1; dy <= h; dy++) {
    for (let dx = -1; dx <= w; dx++) {
      const gx = world.wrap(rx + dx);
      const gy = world.wrap(ry + dy);
      const ci = world.idx(gx, gy);
      
      // If we overlap an existing house, just skip building this tile (might clip, but fine for simple generation)
      if (world.cells[ci] === Cell.WALL && world.wallTex[ci] === HOUSE_WALL_TEX) continue;
      
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

  // Add 1 or 2 doors
  const doorCount = rng.random() < 0.5 ? 1 : 2;
  for (let i = 0; i < doorCount; i++) {
    let doorDx = 0;
    let doorDy = 0;
    
    if (w > h) { // horizontal house, door on top or bottom long edge
      doorDx = irandFrom(rng.random.bind(rng), 1, w - 2);
      doorDy = rng.random() < 0.5 ? -1 : h;
    } else {
      doorDx = rng.random() < 0.5 ? -1 : w;
      doorDy = irandFrom(rng.random.bind(rng), 1, h - 2);
    }
    
    const doorX = world.wrap(rx + doorDx);
    const doorY = world.wrap(ry + doorDy);
    const doorIdx = world.idx(doorX, doorY);
    
    world.cells[doorIdx] = Cell.DOOR;
    world.doors.set(doorIdx, {
      idx: doorIdx,
      state: DoorState.CLOSED,
      roomA: room.id,
      roomB: -1,
      keyId: '',
      timer: 0,
    });
    room.doors.push(doorIdx);
    
    // Connect a short tile path to the street
    let px = doorX;
    let py = doorY;
    const stepX = (doorDx === -1) ? -1 : (doorDx === w) ? 1 : 0;
    const stepY = (doorDy === -1) ? -1 : (doorDy === h) ? 1 : 0;
    
    for (let step = 0; step < 8; step++) {
      px = world.wrap(px + stepX);
      py = world.wrap(py + stepY);
      const ci = world.idx(px, py);
      if (world.cells[ci] === Cell.FLOOR && world.floorTex[ci] !== ROAD_TEX) {
        world.floorTex[ci] = SIDEWALK_TEX;
        world.features[ci] = Feature.NONE;
      } else if (world.floorTex[ci] === ROAD_TEX) {
        break;
      }
    }
  }

  world.rooms.push(room);
  return room;
}
