import { readFileSync, writeFileSync } from 'fs';

let monsterTs = readFileSync('src/systems/ai/monster.ts', 'utf8');
monsterTs = monsterTs.replace(/x: world\.wrap\(e\.x \+ cos \* 0\.5\)/g, 'x: world.wrap(e.x + cos * 0.85)');
monsterTs = monsterTs.replace(/y: world\.wrap\(e\.y \+ sin \* 0\.5\)/g, 'y: world.wrap(e.y + sin * 0.85)');
writeFileSync('src/systems/ai/monster.ts', monsterTs);

console.log("Done");
