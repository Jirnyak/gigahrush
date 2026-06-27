import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function walk(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, file.name);
    if (file.isDirectory()) walk(fullPath);
    else if (fullPath.endsWith('.ts')) {
      let content = readFileSync(fullPath, 'utf8');
      if (content.includes('world.cells.fill(Cell.FLOOR);')) {
        content = content.replace(/world\.cells\.fill\(Cell\.FLOOR\);/g, 
`world.cells.fill(Cell.WALL);
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 30; x++) {
      world.cells[world.idx(x, y)] = Cell.FLOOR;
    }
  }`);
        writeFileSync(fullPath, content);
        console.log('Fixed', fullPath);
      }
    }
  }
}
walk('./tests');
