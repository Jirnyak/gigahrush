const fs = require('fs');
const { execSync } = require('child_process');

try {
  execSync('npx tsc --noEmit');
  console.log("No errors!");
} catch (e) {
  const output = e.stdout.toString();
  console.log(output);
  const lines = output.split('\n');
  const files = {};
  for (const line of lines) {
    const match = line.match(/(src\/.*?\.ts)\((\d+),(\d+)\): error TS6133: '(.*?)' is declared but its value is never read./);
    if (match) {
      const file = match[1];
      const ln = parseInt(match[2]) - 1;
      const varName = match[4];
      if (!files[file]) files[file] = [];
      files[file].push({ln, varName});
    }
    const match2 = line.match(/(src\/.*?\.ts)\((\d+),(\d+)\): error TS6192: All imports in import declaration are unused./);
    if (match2) {
      const file = match2[1];
      const ln = parseInt(match2[2]) - 1;
      if (!files[file]) files[file] = [];
      files[file].push({ln, varName: 'ALL_IMPORTS'});
    }
  }
  
  for (const file of Object.keys(files)) {
    const content = fs.readFileSync(file, 'utf8').split('\n');
    const removes = files[file];
    removes.sort((a,b) => b.ln - a.ln); // bottom up
    for (const r of removes) {
      if (r.varName === 'ALL_IMPORTS') {
         content.splice(r.ln, 1);
      } else {
         const cl = content[r.ln];
         content[r.ln] = cl.replace(new RegExp('\\b' + r.varName + '\\b\\s*,?'), '');
         if (content[r.ln].match(/import\s*{\s*}\s*from/)) content[r.ln] = '';
      }
    }
    fs.writeFileSync(file, content.join('\n'));
  }
}
