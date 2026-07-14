const fs = require('fs');

function fixAlifeTest() {
  let content = fs.readFileSync('tests/alife.test.ts', 'utf8');
  content = content.replace(/id: 1, money: 640/g, 'id: 1001, money: 640');
  content = content.replace(/floorIndex\['story:living'\] = \[0\]/g, "floorIndex['story:living'] = [1000]");
  content = content.replace(/ambientTemplate\(1, /g, 'ambientTemplate(1001, ');
  content = content.replace(/item\.id === 1 &&/g, 'item.id === 1001 &&');
  fs.writeFileSync('tests/alife.test.ts', content);
}

function fixAlifeMigrationTest() {
  let content = fs.readFileSync('tests/alife-migration.test.ts', 'utf8');
  // First, replace IDs
  content = content.replace(/deadIds: \[1\]/g, 'deadIds: [1001]');
  content = content.replace(/journey\('test', 1,/g, "journey('test', 1001,");
  content = content.replace(/moveAlifeNpcRecord\(state, 1,/g, "moveAlifeNpcRecord(state, 1001,");
  content = content.replace(/moveAlifeNpcRecord\(state, 2,/g, "moveAlifeNpcRecord(state, 1002,");
  content = content.replace(/alifeId: i \+ 2,/g, "alifeId: i + 1002,");
  content = content.replace(/alifeId: i \+ 3,/g, "alifeId: i + 1003,");
  content = content.replace(/alifeId: 1\)/g, "alifeId: 1001)");
  content = content.replace(/alifeId: 1,/g, "alifeId: 1001,");
  content = content.replace(/alifeId: 1;/g, "alifeId: 1001;");
  content = content.replace(/getAlifeNpcRecordSnapshot\(state, 1\)/g, "getAlifeNpcRecordSnapshot(state, 1001)");
  content = content.replace(/getAlifeNpcRecordSnapshot\(state, 2\)/g, "getAlifeNpcRecordSnapshot(state, 1002)");
  content = content.replace(/journey\('inactive', 2,/g, "journey('inactive', 1002,");
  content = content.replace(/journey\('blocked', 1,/g, "journey('blocked', 1001,");
  content = content.replace(/test\?\.alifeId, 1/g, "test?.alifeId, 1001");
  content = content.replace(/blocked\?\.alifeId, 1/g, "blocked?.alifeId, 1001");
  content = content.replace(/at\(-1\)\?\.alifeId, 1/g, "at(-1)?.alifeId, 1001");

  // Now, we must inject mobility.cursor = 1000 before tickAlifeMigration where needed.
  // There are several tickAlifeMigration calls.
  // In `test('cold A-Life migration skips dead records...`
  // We can just replace `tickAlifeMigration(` with `(ensureAlifeMobilityState(deadState || state || journeyState).cursor = 1000, tickAlifeMigration(` ? No, it's safer to just replace maxRecords: 1 with maxRecords: 2000, BUT then the return value processed would be 2000, not 1.
  // Let's just set the cursor. 
  
  // Actually, we can use `maxRecords: 1001` and assert `> 0` instead of `== 1`?
  // Let's just do:
  content = content.replace(/assert\.equal\(tickAlifeMigration\(([^,]+), 0, \{ force: true, maxRecords: 1, activeFloorKey: 'story:living' \}\), 1\);/g, 
    "(ensureAlifeMobilityState($1).cursor = 1000);\n  assert.equal(tickAlifeMigration($1, 0, { force: true, maxRecords: 1, activeFloorKey: 'story:living' }), 1);");

  // For the first test: tickAlifeMigration(state, 0, { force: true, maxRecords: 32, ...
  content = content.replace(/maxRecords: 32/g, 'maxRecords: 2000');
  content = content.replace(/assert\.ok\(processed <= 32\);/g, 'assert.ok(processed <= 2000);');
  
  fs.writeFileSync('tests/alife-migration.test.ts', content);
}

function fixAlifeMigrationActiveTest() {
  let content = fs.readFileSync('tests/alife-migration-active.test.ts', 'utf8');
  content = content.replace(/recordId: 1,/g, "recordId: 1001,");
  content = content.replace(/recordId: 2,/g, "recordId: 1002,");
  content = content.replace(/id: 1,/g, "id: 1001,");
  content = content.replace(/id: 2,/g, "id: 1002,");
  content = content.replace(/alifeId: 1,/g, "alifeId: 1001,");
  content = content.replace(/alifeId: 2,/g, "alifeId: 1002,");
  content = content.replace(/moveAlifeNpcRecord\(state, 1,/g, "moveAlifeNpcRecord(state, 1001,");
  content = content.replace(/moveAlifeNpcRecord\(state, 2,/g, "moveAlifeNpcRecord(state, 1002,");
  content = content.replace(/entityForTest\(1\)/g, "entityForTest(1001)");
  content = content.replace(/entityForTest\(2\)/g, "entityForTest(1002)");
  
  // Here tickAlifeMigration doesn't exist? Wait, it does.
  // There are some tickAlifeMigration calls? No, alife-migration-active uses materializeAlifeFloorPopulation.
  fs.writeFileSync('tests/alife-migration-active.test.ts', content);
}

function fixDemosSocialFeedbackTest() {
  let content = fs.readFileSync('tests/demos-social-feedback.test.ts', 'utf8');
  content = content.replace(/overrides\.gameOver \? \[1\] : \[\]/g, "overrides.gameOver ? [1001] : []");
  content = content.replace(/moveAlifeNpcRecord\(state, 1,/g, "moveAlifeNpcRecord(state, 1001,");
  content = content.replace(/entityForTest\(1\)/g, "entityForTest(1001)");
  content = content.replace(/sourceAlifeId: 1,/g, "sourceAlifeId: 1001,");
  content = content.replace(/sourceAlifeId: 1}/g, "sourceAlifeId: 1001}");
  content = content.replace(/targetAlifeId: 2/g, "targetAlifeId: 1002");
  content = content.replace(/alifeId: 1,/g, "alifeId: 1001,");
  content = content.replace(/alifeId: 1}/g, "alifeId: 1001}");
  content = content.replace(/journey\('social', 1,/g, "journey('social', 1001,");
  content = content.replace(/id: 1, npcVisualId/g, "id: 1001, npcVisualId");
  
  // Need to fix helperAlifeId: 1, targetAlifeId: 61, clearDemosNpcSocialEdges(state, 2), setDemosSocialEdge(state, 2, 1, 0)
  content = content.replace(/helperAlifeId: 1/g, "helperAlifeId: 1001");
  content = content.replace(/targetAlifeId: 61/g, "targetAlifeId: 1002"); // Wait, previously it was 2!
  // In Demos help and rescue feedback improves directed relation
  content = content.replace(/clearDemosNpcSocialEdges\(state, 2\)/g, "clearDemosNpcSocialEdges(state, 1002)");
  content = content.replace(/setDemosSocialEdge\(state, 2, 1, 0\)/g, "setDemosSocialEdge(state, 1002, 1001, 0)");
  content = content.replace(/relationFromTo\(state, 2, 1\)/g, "relationFromTo(state, 1002, 1001)");
  
  // Also total: 64 should be total: 100_000 so that 1001 and 1002 exist!
  content = content.replace(/total: 64/g, "total: 100_000");
  
  fs.writeFileSync('tests/demos-social-feedback.test.ts', content);
}

fixAlifeTest();
fixAlifeMigrationTest();
fixAlifeMigrationActiveTest();
fixDemosSocialFeedbackTest();
