const { Project } = require('ts-morph');
const path = require('path');

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const targetDirs = [
  'bank_floor',
  'black_market_88',
  'chthonic_attic',
  'floor_69',
  'service_floor',
  'manhattan_crossroads',
  'roof',
  'dark_metro',
  'darkness',
  'voronoi_quarantine',
  'upper_bureau'
];

for (const dir of targetDirs) {
  const sourceFiles = project.getSourceFiles(`src/gen/${dir}/*.ts`);
  for (const sf of sourceFiles) {
    sf.fixUnusedIdentifiers();
  }
}

project.saveSync();
console.log('Fixed unused identifiers across all split floor directories.');
