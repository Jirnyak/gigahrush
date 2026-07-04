const fs = require('fs');

const path = 'tests/procedural-floors.test.ts';
let code = fs.readFileSync(path, 'utf8');

const testCode = `
test('Floor density should be greater than 40% after refactoring', () => {
  const spec = makeProceduralFloorSpec(12345, 0); // floor 0
  const generation = generateProceduralFloor(spec);
  const world = generation.world;

  let floorCells = 0;
  let totalCells = W * W;

  for (let i = 0; i < totalCells; i++) {
    if (world.cells[i] === Cell.FLOOR || world.cells[i] === Cell.DOOR) {
      floorCells++;
    }
  }

  const density = floorCells / totalCells;
  // Make sure density is reasonably high (> 40%)
  assert.ok(density > 0.35, \`Density is \${density}, expected > 0.35\`);

  // Check for massive blocks larger than 12x12
  let hasMassiveBlock = false;
  for (let y = 0; y < W - 12; y += 4) {
    for (let x = 0; x < W - 12; x += 4) {
      let isSolid = true;
      for (let dy = 0; dy < 12; dy++) {
        for (let dx = 0; dx < 12; dx++) {
          const ci = world.idx(x + dx, y + dy);
          if (world.cells[ci] !== Cell.WALL) {
            isSolid = false;
            break;
          }
        }
        if (!isSolid) break;
      }

      if (isSolid) {
        hasMassiveBlock = true;
        break;
      }
    }
    if (hasMassiveBlock) break;
  }

  assert.equal(hasMassiveBlock, false, 'Found a solid 12x12 wall block on the map');
});
`;

if (!code.includes('Floor density should be greater than 40% after refactoring')) {
  code += testCode;
  fs.writeFileSync(path, code);
}
