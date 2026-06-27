import { readFileSync, writeFileSync } from 'fs';

// 1. Remove ownerId crutch from main.ts
let mainTs = readFileSync('src/main.ts', 'utf8');
mainTs = mainTs.replace(/        if \(e\.id === p\.ownerId\) continue;\n/g, '');
mainTs = mainTs.replace(/      if \(e\.id === p\.ownerId\) continue;\n/g, '');

// 2. Change 0.5 offset to 0.85 in main.ts
mainTs = mainTs.replace(/player\.x \+ cos \* 0\.5/g, 'player.x + cos * 0.85');
mainTs = mainTs.replace(/player\.y \+ sin \* 0\.5/g, 'player.y + sin * 0.85');

writeFileSync('src/main.ts', mainTs);

// 3. Change 0.5 offset to 0.85 in combat.ts
let combatTs = readFileSync('src/systems/ai/combat.ts', 'utf8');
combatTs = combatTs.replace(/e\.x \+ Math\.cos\(ang\) \* 0\.5/g, 'e.x + Math.cos(ang) * 0.85');
combatTs = combatTs.replace(/e\.y \+ Math\.sin\(ang\) \* 0\.5/g, 'e.y + Math.sin(ang) * 0.85');
writeFileSync('src/systems/ai/combat.ts', combatTs);

// 4. Change 0.5 offset to 0.85 in monster.ts
let monsterTs = readFileSync('src/systems/ai/monster.ts', 'utf8');
monsterTs = monsterTs.replace(/e\.x \+ Math\.cos\(a\) \* 0\.5/g, 'e.x + Math.cos(a) * 0.85');
monsterTs = monsterTs.replace(/e\.y \+ Math\.sin\(a\) \* 0\.5/g, 'e.y + Math.sin(a) * 0.85');
monsterTs = monsterTs.replace(/e\.x \+ Math\.cos\(targetAngle\) \* 0\.5/g, 'e.x + Math.cos(targetAngle) * 0.85');
monsterTs = monsterTs.replace(/e\.y \+ Math\.sin\(targetAngle\) \* 0\.5/g, 'e.y + Math.sin(targetAngle) * 0.85');
monsterTs = monsterTs.replace(/e\.x \+ Math\.cos\(ang\) \* 0\.5/g, 'e.x + Math.cos(ang) * 0.85');
monsterTs = monsterTs.replace(/e\.y \+ Math\.sin\(ang\) \* 0\.5/g, 'e.y + Math.sin(ang) * 0.85');

writeFileSync('src/systems/ai/monster.ts', monsterTs);

console.log("Done");
