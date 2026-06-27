import { readFileSync, writeFileSync } from 'fs';

// 2. Remove ownerId crutch from main.ts
let mainTs = readFileSync('src/main.ts', 'utf8');
mainTs = mainTs.replace(/if \(!e\.alive \|\| e\.id === p\.ownerId\) continue;/g, 'if (!e.alive) continue;');

// 3. Fix 0.85 offset in main.ts
mainTs = mainTs.replace(/x: player\.x \+ cos \* 0\.5,/g, 'x: player.x + cos * 0.85,');
mainTs = mainTs.replace(/y: player\.y \+ sin \* 0\.5,/g, 'y: player.y + sin * 0.85,');

writeFileSync('src/main.ts', mainTs);
console.log("Done");
