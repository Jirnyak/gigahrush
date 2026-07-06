const { performance } = require('perf_hooks');

const RoomType = { HQ: 'hq', OTHER: 'other' };

const TURING_HQ_SPECS = [
  { name: 'Герметичный штаб матриц НИИ', owner: 1, wallTex: 1, floorTex: 1 },
  { name: 'Герметичный штаб нижней линии обучения', owner: 2, wallTex: 2, floorTex: 2 },
  { name: 'Герметичный штаб прожига узора', owner: 3, wallTex: 3, floorTex: 3 },
  { name: 'Герметичный штаб родителей контрольной группы', owner: 4, wallTex: 4, floorTex: 4 },
  { name: 'Скрытый герметичный штаб мокрой рекурсии', owner: 5, wallTex: 5, floorTex: 5 },
  { name: 'Разорённый герметичный штаб сбежавших образцов', owner: 6, wallTex: 6, floorTex: 6 },
];

function hardenTuringHqRoom(world, room, owner, wallTex, floorTex) {
    room.owner = owner;
}

const rooms = [];
// Assuming realistic room counts: maybe 100-200 rooms per floor? Let's say 200 rooms.
for (let i = 0; i < 200; i++) {
    rooms.push({ type: RoomType.OTHER, name: 'Room ' + i });
}
TURING_HQ_SPECS.forEach((spec, i) => {
    rooms[10 + i * 30] = { type: RoomType.HQ, name: spec.name };
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

// Just map the specs at the top
const hqSpecsByName = new Map(TURING_HQ_SPECS.map(spec => [spec.name, spec]));

function reinforceTuringNurseryAuthoredHqTerritory_Optimized(world) {
  let foundCount = 0;
  const targetCount = TURING_HQ_SPECS.length;
  for (const room of world.rooms) {
    if (room?.type === RoomType.HQ) {
      const spec = hqSpecsByName.get(room.name);
      if (spec) {
        hardenTuringHqRoom(world, room, spec.owner, spec.wallTex, spec.floorTex);
        foundCount++;
        if (foundCount >= targetCount) break;
      }
    }
  }
}

function runPerf(name, fn) {
    const start = performance.now();
    for (let i = 0; i < 100000; i++) {
        fn(world);
    }
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)} ms`);
}

runPerf('Current (200 rooms)', reinforceTuringNurseryAuthoredHqTerritory_Current);
runPerf('Optimized (200 rooms)', reinforceTuringNurseryAuthoredHqTerritory_Optimized);
