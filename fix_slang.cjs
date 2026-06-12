const fs = require('fs');
const path = require('path');

const dir = '/Users/jirnyak/Mirror/gigahrush/src/data';
const replacements = [
  { match: /спавнит угрозу/g, replace: 'плодит тварей' },
  { match: /плотнее спавн из тумана/g, replace: 'больше тварей лезет из тумана' },
  { match: /усиленный спавн тварей/g, replace: 'наплыв тварей' },
  { match: /квестовые бумаги/g, replace: 'нужные бумаги' },
  { match: /квест просит/g, replace: 'задание требует' },
  { match: /квестовый предмет/g, replace: 'целевой предмет' },
  { match: /Квестовый документ/g, replace: 'Документ по заданию' },
  { match: /Вестник не босс/g, replace: 'Вестник не главарь' }
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
        console.log('Fixed slang in', fullPath);
      }
    }
  }
}

processDir(dir);
