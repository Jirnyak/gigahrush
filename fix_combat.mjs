import { readFileSync, writeFileSync } from 'fs';

const dummy = `const dummy = { armorDefId: undefined } as any;\n`;

for (const file of ['tests/combat.test.ts', 'tests/calculateDamage.test.ts']) {
  try {
    let content = readFileSync(file, 'utf8');
    content = content.replace(/import \{ calculateDamage \} from '\.\.\/src\/systems\/combat';/, `import { calculateDamage } from '../src/systems/combat';\n\nconst dummy = { armorDefId: undefined } as any;`);
    content = content.replace(/calculateDamage\(([^,]+), ([^)]+)\)/g, 'calculateDamage($1, undefined, dummy)');
    writeFileSync(file, content);
    console.log('Fixed', file);
  } catch (e) {
    console.error(e.message);
  }
}
