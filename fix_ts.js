import fs from 'fs';
import { execSync } from 'child_process';

let output = '';
try {
  execSync('npx tsc --noEmit');
  console.log("No errors!");
  process.exit(0);
} catch (e) {
  output = e.stdout.toString();
}

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
  let contentStr = fs.readFileSync(file, 'utf8');
  const removes = files[file];
  // To avoid line shifting, we just replace the declarations with spaces or remove the function blocks safely.
  for (const r of removes) {
    if (r.varName === 'ALL_IMPORTS') {
      // Not safe to remove line if we don't recalculate lines, but we just do it via regex
      continue;
    }
    // Remove unused functions
    const funcRegex = new RegExp(`function ${r.varName}\\s*\\([\\s\\S]*?\\)\\s*(?::\\s*[^{]+)?\\s*{`);
    const match = contentStr.match(funcRegex);
    if (match) {
      let braceCount = 0;
      let startIndex = match.index;
      let endIndex = startIndex + match[0].length;
      braceCount = 1;
      while (endIndex < contentStr.length && braceCount > 0) {
        if (contentStr[endIndex] === '{') braceCount++;
        if (contentStr[endIndex] === '}') braceCount--;
        endIndex++;
      }
      contentStr = contentStr.substring(0, startIndex) + contentStr.substring(endIndex);
    }
  }
  fs.writeFileSync(file, contentStr);
}
