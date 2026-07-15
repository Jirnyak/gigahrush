import fs from 'fs';

let agents = fs.readFileSync('AGENTS.md', 'utf8');
let readme = fs.readFileSync('README.md', 'utf8');

// Replace reference in AGENTS.md
agents = agents.replace('Этот файл не заменяет `README.md` и root system docs', 'Этот документ описывает корневую архитектуру и является обязательной инструкцией для агентов');

const insertPoint = readme.indexOf('## Project Bible');
if (insertPoint !== -1) {
  const newReadme = readme.substring(0, insertPoint) + agents + '\n\n---\n\n' + readme.substring(insertPoint);
  fs.writeFileSync('README.md', newReadme);
  console.log('Merged successfully.');
} else {
  console.log('Could not find insert point.');
}
