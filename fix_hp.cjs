const fs = require('fs');
const path = require('path');

const dir = '/Users/jirnyak/Mirror/gigahrush/src/data';
const replacements = [
  { match: /с запасом HP/g, replace: 'при крепком здоровье' },
  { match: /проверьте HP сразу/g, replace: 'проверьте раны сразу' },
  { match: /быстрее HP/g, replace: 'быстрее здоровья' },
  { match: /проверьте стену и HP/g, replace: 'проверьте стену и здоровье' },
  { match: /стоить HP/g, replace: 'стоить здоровья' },
  { match: /не последним HP/g, replace: 'не из последних сил' },
  { match: /снимает HP/g, replace: 'сажает здоровье' },
  { match: /бьёт по HP/g, replace: 'бьёт по здоровью' },
  { match: /не лечит HP/g, replace: 'не затягивает раны' },
  { match: /лечат HP/g, replace: 'лечат раны' }
];

function processDir(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const r of replacements) {
        if (content.match(r.match)) {
          content = content.replace(r.match, r.replace);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed HP slang in', fullPath);
      }
    }
  }
}

processDir(dir);
