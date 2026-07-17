const fs = require('fs');
const path = require('path');

const targetFloor = 'manhattan_crossroads';
const targetDir = path.join('src/gen', targetFloor);
const indexPath = path.join(targetDir, 'index.ts');
const geometryPath = path.join(targetDir, 'geometry.ts');
const npcsPath = path.join(targetDir, 'npcs.ts');

if (!fs.existsSync(indexPath)) {
  console.error('File not found:', indexPath);
  process.exit(1);
}

const content = fs.readFileSync(indexPath, 'utf8');

// Just initialize the files to get ready
fs.writeFileSync(geometryPath, `// Geometry for ${targetFloor}\n`);
fs.writeFileSync(npcsPath, `// NPCs for ${targetFloor}\n`);

console.log('Split initialized for', targetFloor);
