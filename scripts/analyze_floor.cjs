const fs = require('fs');

const file = 'src/gen/manhattan_crossroads/index.ts';
const content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');
let insideFunction = false;
let funcName = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('function ') || line.startsWith('export function ')) {
    const match = line.match(/(?:export )?function (\w+)/);
    if (match) {
      console.log(`[Line ${i+1}] Function: ${match[1]}`);
    }
  }
}
