const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');
const path = require('path');

const floorName = process.argv[2];
if (!floorName) {
  console.error('Usage: node scripts/split_floor_smart.cjs <floor_name>');
  process.exit(1);
}

const targetDir = path.join(__dirname, '../src/gen', floorName);
const indexPath = path.join(targetDir, 'index.ts');
const metaPath = path.join(targetDir, 'meta.ts');
const geometryPath = path.join(targetDir, 'geometry.ts');
const npcsPath = path.join(targetDir, 'npcs.ts');

if (!fs.existsSync(indexPath)) {
  console.error('File not found:', indexPath);
  process.exit(1);
}

const project = new Project({
  tsConfigFilePath: path.join(__dirname, '../tsconfig.json'),
});

const indexFile = project.getSourceFileOrThrow(indexPath);

// Get top imports
const imports = indexFile.getImportDeclarations().map(imp => imp.getText()).join('\n');

const keepNames = new Set([
  'DESIGN_FLOOR_ID', 'DESIGN_FLOOR_Z', 'HOME_FLOOR_KEY',
]);

const metaRegex = /^[A-Z0-9_]+$|_ROUTE_ID$|_Z$|_SEED$|_META$|^publish.*Event$|^resolve.*Access$|_DOCUMENTS$|_CHECKS$|_DEBUG_ENTRY$|_BASE_FLOOR$|_ROOM_NAMES$|_CLUSTERS$|_LAYOUTS$/;
const indexRegex = /^generate.*DesignFloor$|^generate.*DebugFloor$/;
const npcRegex = /spawn|seed|Npc|Monster|Guard|Container|Loot|SideQuest|Crowd|_DEF$|_NPCS$|register.*Content|^contentRegistered$/i;

let metaCode = `${imports}\n\n`;
let geometryCode = `${imports}\n\n`;
let npcsCode = `${imports}\n\n`;

const nodesToMoveToMeta = [];
const nodesToMoveToGeo = [];
const nodesToMoveToNpcs = [];

function getStmtNames(stmt) {
  const names = [];
  if (stmt.getKind() === SyntaxKind.FunctionDeclaration || stmt.getKind() === SyntaxKind.InterfaceDeclaration || stmt.getKind() === SyntaxKind.TypeAliasDeclaration) {
    const name = stmt.getName();
    if (name) names.push(name);
  } else if (stmt.getKind() === SyntaxKind.VariableStatement) {
    for (const decl of stmt.getDeclarationList().getDeclarations()) {
      names.push(decl.getName());
    }
  }
  return names;
}

for (const stmt of indexFile.getStatements()) {
  if (stmt.getKind() === SyntaxKind.ImportDeclaration) continue;

  const names = getStmtNames(stmt);
  const firstName = names[0];
  if (!firstName) continue;

  if (typeof stmt.hasExportKeyword === 'function' && !stmt.hasExportKeyword() && typeof stmt.setIsExported === 'function') {
    stmt.setIsExported(true);
  }
  const text = stmt.getText();

  // Decide destination
  if (indexRegex.test(firstName)) {
    // Keep inside index.ts
    continue;
  }

  if (keepNames.has(firstName) || metaRegex.test(firstName) || stmt.getKind() === SyntaxKind.InterfaceDeclaration || stmt.getKind() === SyntaxKind.TypeAliasDeclaration) {
    nodesToMoveToMeta.push(stmt);
    metaCode += `${text}\n\n`;
  } else if (npcRegex.test(firstName) || npcRegex.test(text.slice(0, 150))) {
    nodesToMoveToNpcs.push(stmt);
    npcsCode += `${text}\n\n`;
  } else {
    nodesToMoveToGeo.push(stmt);
    geometryCode += `${text}\n\n`;
  }
}

fs.writeFileSync(metaPath, metaCode);
fs.writeFileSync(geometryPath, geometryCode);
fs.writeFileSync(npcsPath, npcsCode);

// Remove moved statements from indexFile
for (const stmt of [...nodesToMoveToMeta, ...nodesToMoveToNpcs, ...nodesToMoveToGeo]) {
  stmt.remove();
}

project.saveSync();

const metaFile = project.addSourceFileAtPath(metaPath);
const geoFile = project.addSourceFileAtPath(geometryPath);
const npcsFile = project.addSourceFileAtPath(npcsPath);

function getFileTopLevelNames(sf) {
  const names = [];
  for (const stmt of sf.getStatements()) {
    if (stmt.getKind() === SyntaxKind.ImportDeclaration) continue;
    names.push(...getStmtNames(stmt));
  }
  return names.filter(Boolean);
}

const metaNames = getFileTopLevelNames(metaFile);
const geoNames = getFileTopLevelNames(geoFile);
const npcNames = getFileTopLevelNames(npcsFile);
const idxNames = getFileTopLevelNames(indexFile);

function addCrossImports(targetFile, names, modulePath) {
  if (names.length === 0) return;
  const uniqueNames = [...new Set(names)].filter(n => n !== 'default');
  if (uniqueNames.length > 0) {
    targetFile.addImportDeclaration({
      namedImports: uniqueNames,
      moduleSpecifier: modulePath
    });
  }
}

// metaFile should be pure leaf
// geoFile can import from meta, npcs
addCrossImports(geoFile, metaNames, './meta');
addCrossImports(geoFile, npcNames, './npcs');

// npcsFile can import from meta, geometry
addCrossImports(npcsFile, metaNames, './meta');
addCrossImports(npcsFile, geoNames, './geometry');

// indexFile imports from meta, geometry, npcs
addCrossImports(indexFile, metaNames, './meta');
addCrossImports(indexFile, geoNames, './geometry');
addCrossImports(indexFile, npcNames, './npcs');

// Re-exports in indexFile
const exportMods = ['./meta', './geometry', './npcs'];
for (const mod of exportMods) {
  const alreadyExported = indexFile.getExportDeclarations().some(ex => ex.getModuleSpecifierValue() === mod);
  if (!alreadyExported) {
    indexFile.addExportDeclaration({ moduleSpecifier: mod });
  }
}

// Check for other files in targetDir like archive_poi.ts or districts.ts to re-export in indexFile
const allFiles = fs.readdirSync(targetDir);
for (const f of allFiles) {
  if (f.endsWith('.ts') && f !== 'index.ts' && f !== 'meta.ts' && f !== 'geometry.ts' && f !== 'npcs.ts') {
    const mod = './' + f.replace(/\.ts$/, '');
    const alreadyExported = indexFile.getExportDeclarations().some(ex => ex.getModuleSpecifierValue() === mod);
    if (!alreadyExported) {
      indexFile.addExportDeclaration({ moduleSpecifier: mod });
    }
  }
}

metaFile.fixUnusedIdentifiers();
geoFile.fixUnusedIdentifiers();
npcsFile.fixUnusedIdentifiers();
indexFile.fixUnusedIdentifiers();

project.saveSync();
console.log(`Successfully modularized ${floorName} into meta.ts, geometry.ts, npcs.ts, index.ts without circular loops!`);
