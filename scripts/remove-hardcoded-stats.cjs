const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');

let modifiedCount = 0;

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let original = c;
  
  // Replace hp, maxHp
  c = c.replace(/hp:\s*[\w\.]+,\s*maxHp:\s*[\w\.]+,\s*/g, '');
  // sometimes they are just separated by spaces and without trailing comma
  c = c.replace(/hp:\s*[\w\.]+,\s*maxHp:\s*[\w\.]+,/g, '');
  c = c.replace(/hp:\s*[\w\.]+,\s*maxHp:\s*[\w\.]+/g, '');
  
  // Replace speed (often "speed: 1.0,")
  c = c.replace(/speed:\s*[\d\.]+,\s*/g, '');
  c = c.replace(/speed:\s*[\d\.]+/g, '');

  // specific to plot.ts examples like "hp: 100, maxHp: 100, level: 10, money: 500, speed: 1.0,"
  
  // also clean up empty lines or multiple commas if left behind
  // Actually, let's use a simpler regex for PlotNpcDef files:
  if (c !== original) {
    fs.writeFileSync(f, c, 'utf8');
    modifiedCount++;
  }
});

console.log(`Modified ${modifiedCount} files.`);
