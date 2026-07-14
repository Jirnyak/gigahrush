const fs = require('fs');

function replaceInFile(file, from, to) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.split(from).join(to);
  fs.writeFileSync(file, content);
}

replaceInFile('tests/alife.test.ts', 'id: 1, money: 640', 'id: 9001, money: 640');
replaceInFile('tests/alife.test.ts', "alife.floorIndex['story:living'] = [0];", "alife.floorIndex['story:living'] = [9000];");
replaceInFile('tests/alife.test.ts', 'ambientTemplate(1, 12.5, 10.5)', 'ambientTemplate(9001, 12.5, 10.5)');
replaceInFile('tests/alife.test.ts', 'item.id === 1 &&', 'item.id === 9001 &&');

replaceInFile('tests/alife-migration.test.ts', 'deadIds: [1]', 'deadIds: [9001]');
replaceInFile('tests/alife-migration.test.ts', "journey('test', 1,", "journey('test', 9001,");
replaceInFile('tests/alife-migration.test.ts', "moveAlifeNpcRecord(state, 1,", "moveAlifeNpcRecord(state, 9001,");
replaceInFile('tests/alife-migration.test.ts', "moveAlifeNpcRecord(state, 2,", "moveAlifeNpcRecord(state, 9002,");
replaceInFile('tests/alife-migration.test.ts', "alifeId: i + 2,", "alifeId: i + 9002,");
replaceInFile('tests/alife-migration.test.ts', "alifeId: i + 3,", "alifeId: i + 9003,");
replaceInFile('tests/alife-migration.test.ts', "alifeId: 1)", "alifeId: 9001)");
replaceInFile('tests/alife-migration.test.ts', "getAlifeNpcRecordSnapshot(state, 1)", "getAlifeNpcRecordSnapshot(state, 9001)");
replaceInFile('tests/alife-migration.test.ts', "getAlifeNpcRecordSnapshot(state, 2)", "getAlifeNpcRecordSnapshot(state, 9002)");
replaceInFile('tests/alife-migration.test.ts', "journey('inactive', 2,", "journey('inactive', 9002,");
replaceInFile('tests/alife-migration.test.ts', "alifeId: 1;", "alifeId: 9001;");
replaceInFile('tests/alife-migration.test.ts', "alifeId: 1,", "alifeId: 9001,");

replaceInFile('tests/demos-social-feedback.test.ts', "overrides.gameOver ? [1] : []", "overrides.gameOver ? [9001] : []");
replaceInFile('tests/demos-social-feedback.test.ts', "moveAlifeNpcRecord(state, 1,", "moveAlifeNpcRecord(state, 9001,");
replaceInFile('tests/demos-social-feedback.test.ts', "entityForTest(1)", "entityForTest(9001)");
replaceInFile('tests/demos-social-feedback.test.ts', "sourceAlifeId: 1,", "sourceAlifeId: 9001,");
replaceInFile('tests/demos-social-feedback.test.ts', "sourceAlifeId: 1}", "sourceAlifeId: 9001}");
replaceInFile('tests/demos-social-feedback.test.ts', "targetAlifeId: 2", "targetAlifeId: 9002");
replaceInFile('tests/demos-social-feedback.test.ts', "alifeId: 1,", "alifeId: 9001,");
replaceInFile('tests/demos-social-feedback.test.ts', "journey('social', 1,", "journey('social', 9001,");
replaceInFile('tests/demos-social-feedback.test.ts', "id: 1, npcVisualId", "id: 9001, npcVisualId");
replaceInFile('tests/demos-social-feedback.test.ts', "alifeId: 1}", "alifeId: 9001}");

replaceInFile('tests/alife-migration-active.test.ts', "recordId: 1,", "recordId: 9001,");
replaceInFile('tests/alife-migration-active.test.ts', "recordId: 2,", "recordId: 9002,");
replaceInFile('tests/alife-migration-active.test.ts', "id: 1,", "id: 9001,");
replaceInFile('tests/alife-migration-active.test.ts', "id: 2,", "id: 9002,");
replaceInFile('tests/alife-migration-active.test.ts', "alifeId: 1,", "alifeId: 9001,");
replaceInFile('tests/alife-migration-active.test.ts', "alifeId: 2,", "alifeId: 9002,");
replaceInFile('tests/alife-migration-active.test.ts', "moveAlifeNpcRecord(state, 1,", "moveAlifeNpcRecord(state, 9001,");
replaceInFile('tests/alife-migration-active.test.ts', "moveAlifeNpcRecord(state, 2,", "moveAlifeNpcRecord(state, 9002,");
replaceInFile('tests/alife-migration-active.test.ts', "entityForTest(1)", "entityForTest(9001)");
replaceInFile('tests/alife-migration-active.test.ts', "entityForTest(2)", "entityForTest(9002)");

