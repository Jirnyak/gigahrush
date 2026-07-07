const fs = require('fs');
const { performance } = require('perf_hooks');

// Mock data structures based on what we've seen
const RoomType = { HQ: 'hq', OTHER: 'other' };

const TURING_HQ_SPECS = [
  { name: 'Герметичный штаб матриц НИИ', owner: 1, wallTex: 1, floorTex: 1 },
  { name: 'Герметичный штаб нижней линии обучения', owner: 2, wallTex: 2, floorTex: 2 },
  { name: 'Герметичный штаб прожига узора', owner: 3, wallTex: 3, floorTex: 3 },
  { name: 'Герметичный штаб контроля популяции', owner: 4, wallTex: 4, floorTex: 4 },
];

function hardenTuringHqRoom(world, room, owner, wallTex, floorTex) {
    // dummy
    room.owner = owner;
}

// Generate a large number of rooms to simulate a real world
const rooms = [];
for (let i = 0; i < 5000; i++) {
    rooms.push({ type: RoomType.OTHER, name: 'Room ' + i });
}
// Add the ones we're looking for, spread out
TURING_HQ_SPECS.forEach((spec, i) => {
    rooms[1000 + i * 500] = { type: RoomType.HQ, name: spec.name };
});

const world = {
    rooms: rooms
};

function reinforceTuringNurseryAuthoredHqTerritory_Current(world) {
  for (const spec of TURING_HQ_SPECS) {
    const room = world.rooms.find(candidate => candidate?.type === RoomType.HQ && candidate.name === spec.name);
    if (!room) continue;
    hardenTuringHqRoom(world, room, spec.owner, spec.wallTex, spec.floorTex);
  }
}

// Map based optimization
function reinforceTuringNurseryAuthoredHqTerritory_Optimized_Map(world) {
    const hqRooms = new Map();
    for (const room of world.rooms) {
        if (room?.type === RoomType.HQ) {
            hqRooms.set(room.name, room);
        }
    }
    for (const spec of TURING_HQ_SPECS) {
        const room = hqRooms.get(spec.name);
        if (!room) continue;
        hardenTuringHqRoom(world, room, spec.owner, spec.wallTex, spec.floorTex);
    }
}

// Since TURING_HQ_SPECS is small (looks like around 4 items based on the snippet),
// maybe building a map of rooms is slower than just iterating?
// Wait, the find() iterates the entire `world.rooms` for EACH spec.
// If world.rooms is very large, that's O(specs * rooms).

// Reverse indexing: Iterate over rooms ONCE, and check against specs.
// But specs is small.
function reinforceTuringNurseryAuthoredHqTerritory_Optimized_IterRooms(world) {
    let foundCount = 0;
    const targetCount = TURING_HQ_SPECS.length;
    for (const room of world.rooms) {
        if (room?.type === RoomType.HQ) {
            const spec = TURING_HQ_SPECS.find(s => s.name === room.name);
            if (spec) {
                hardenTuringHqRoom(world, room, spec.owner, spec.wallTex, spec.floorTex);
                foundCount++;
                if (foundCount >= targetCount) break; // Optimization if we know they are unique
            }
        }
    }
}

function runPerf(name, fn) {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
        fn(world);
    }
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)} ms`);
}

runPerf('Current', reinforceTuringNurseryAuthoredHqTerritory_Current);
runPerf('Map', reinforceTuringNurseryAuthoredHqTerritory_Optimized_Map);
runPerf('IterRooms', reinforceTuringNurseryAuthoredHqTerritory_Optimized_IterRooms);
