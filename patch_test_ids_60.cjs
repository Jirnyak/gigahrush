const fs = require('fs');

function patchFile(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(file, content);
}

patchFile('tests/alife.test.ts', [
  ['overrides: [{ id: 1, money: 640, accountRubles: 999_360 }]', 'overrides: [{ id: 60, money: 640, accountRubles: 999_360 }]'],
  ["alife.floorIndex['story:living'] = [0];", "alife.floorIndex['story:living'] = [59];"],
  ['ambientTemplate(1, 12.5, 10.5)', 'ambientTemplate(60, 12.5, 10.5)'],
  ['item.id === 1 &&', 'item.id === 60 &&'],
]);

patchFile('tests/alife-migration.test.ts', [
  ['maxRecords: 32', 'maxRecords: 256'],
  ['maxRecords: 8', 'maxRecords: 256'],
  ['maxRecords: 1, activeFloorKey', 'maxRecords: 256, activeFloorKey'],
  ['maxRecords: 1 }', 'maxRecords: 256 }'],
  ['deadIds: [1]', 'deadIds: [60]'],
  ["journey('test', 1, 'design:black_market_88'", "journey('test', 60, 'design:black_market_88'"],
  ["moveAlifeNpcRecord(state, 1, 'story:ministry')", "moveAlifeNpcRecord(state, 60, 'story:ministry')"],
  ["journey('test', 1, 'story:living'", "journey('test', 60, 'story:living'"],
  ["alifeId: 1)", "alifeId: 60)"],
  ["alifeId: i + 2", "alifeId: i + 61"],
  ["alifeId: i + 3", "alifeId: i + 62"],
  ["mobility.journeys.test?.alifeId, 1", "mobility.journeys.test?.alifeId, 60"],
  ["getAlifeNpcRecordSnapshot(state, 1)", "getAlifeNpcRecordSnapshot(state, 60)"],
  ["pendingArrivals.at(-1)?.alifeId, 1", "pendingArrivals.at(-1)?.alifeId, 60"],
  ["moveAlifeNpcRecord(state, 2, 'story:ministry')", "moveAlifeNpcRecord(state, 61, 'story:ministry')"],
  ["journey('blocked', 1, 'story:living'", "journey('blocked', 60, 'story:living'"],
  ["journey('inactive', 2, 'design:black_market_88'", "journey('inactive', 61, 'design:black_market_88'"],
  ["mobility.journeys.blocked?.alifeId, 1", "mobility.journeys.blocked?.alifeId, 60"],
  ["getAlifeNpcRecordSnapshot(state, 2)", "getAlifeNpcRecordSnapshot(state, 61)"],
]);

patchFile('tests/demos-social-feedback.test.ts', [
  ['overrides.gameOver ? [1] : []', 'overrides.gameOver ? [60] : []'],
  ["moveAlifeNpcRecord(state, 1, 'story:ministry')", "moveAlifeNpcRecord(state, 60, 'story:ministry')"],
  ["entityForTest(1)", "entityForTest(60)"],
  ["sourceAlifeId: 1,", "sourceAlifeId: 60,"],
  ["sourceAlifeId: 1}", "sourceAlifeId: 60}"],
  ["targetAlifeId: 2", "targetAlifeId: 61"],
  ["alifeId: 1,", "alifeId: 60,"],
  ["alifeId: 1}", "alifeId: 60}"],
  ["journey('social', 1,", "journey('social', 60,"],
  ["id: 1, npcVisualId", "id: 60, npcVisualId"],
]);

patchFile('tests/alife-migration-active.test.ts', [
  ["recordId: 1,", "recordId: 60,"],
  ["recordId: 2,", "recordId: 61,"],
  ["id: 1,", "id: 60,"],
  ["id: 2,", "id: 61,"],
  ["alifeId: 1,", "alifeId: 60,"],
  ["alifeId: 2,", "alifeId: 61,"],
  ["moveAlifeNpcRecord(state, 1,", "moveAlifeNpcRecord(state, 60,"],
  ["moveAlifeNpcRecord(state, 2,", "moveAlifeNpcRecord(state, 61,"],
  ["entityForTest(1)", "entityForTest(60)"],
  ["entityForTest(2)", "entityForTest(61)"],
]);

