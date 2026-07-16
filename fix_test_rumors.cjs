const fs = require('fs');

let contextLinesTest = fs.readFileSync('tests/context-lines.test.ts', 'utf8');
contextLinesTest = contextLinesTest.replace(/z: 140/g, "floorId: 'design:maintenance'");
fs.writeFileSync('tests/context-lines.test.ts', contextLinesTest, 'utf8');

let consequenceTest = fs.readFileSync('tests/consequence-residue.test.ts', 'utf8');
consequenceTest = consequenceTest.replace(/currentZ: 14,/g, "currentZ: 100,");
fs.writeFileSync('tests/consequence-residue.test.ts', consequenceTest, 'utf8');

