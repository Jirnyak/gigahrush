const fs = require('fs');
const files = fs.readdirSync('tests').filter(f => f.endsWith('.test.ts'));
for (const file of files) {
  let content = fs.readFileSync('tests/' + file, 'utf8');
  content = content.replace(/setAlifeState\(([^,]+),\s*(\{[\s\S]*?\})\)( as.*)?;?/g, (match, p1, p2, p3) => {
    if (match.includes('empty_packages')) return match;
    const suffix = p3 ? p3 : '';
    const semi = match.endsWith(';') ? ';' : '';
    return `setAlifeState(${p1}, ${p2}, { populationPlan: 'empty_packages' })${suffix}${semi}`;
  });
  fs.writeFileSync('tests/' + file, content);
}
