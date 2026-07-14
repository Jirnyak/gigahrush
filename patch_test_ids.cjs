const fs = require('fs');

function patchFile(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  fs.writeFileSync(file, content);
}

patchFile('tests/alife.test.ts', [
  ['overrides: [{ id: 1, money: 640, accountRubles: 999_360 }]', 'overrides: [{ id: 9001, money: 640, accountRubles: 999_360 }]'],
  ["alife.floorIndex['story:living'] = [0];", "alife.floorIndex['story:living'] = [9000];"],
  ['ambientTemplate(1, 12.5, 10.5)', 'ambientTemplate(9001, 12.5, 10.5)'],
  ['item.id === 1 &&', 'item.id === 9001 &&'],
]);

patchFile('tests/alife-migration.test.ts', [
  ['deadIds: [1]', 'deadIds: [9001]'],
  ["journey('test', 1, 'design:black_market_88'", "journey('test', 9001, 'design:black_market_88'"],
  ["moveAlifeNpcRecord(state, 1, 'story:ministry')", "moveAlifeNpcRecord(state, 9001, 'story:ministry')"],
  ["journey('test', 1, 'story:living'", "journey('test', 9001, 'story:living'"],
  ["alifeId: 1)", "alifeId: 9001)"],
  ["alifeId: i + 2", "alifeId: i + 9002"],
  ["alifeId: i + 3", "alifeId: i + 9003"],
  ["mobility.journeys.test?.alifeId, 1", "mobility.journeys.test?.alifeId, 9001"],
  ["getAlifeNpcRecordSnapshot(state, 1)", "getAlifeNpcRecordSnapshot(state, 9001)"],
  ["pendingArrivals.at(-1)?.alifeId, 1", "pendingArrivals.at(-1)?.alifeId, 9001"],
  ["moveAlifeNpcRecord(state, 2, 'story:ministry')", "moveAlifeNpcRecord(state, 9002, 'story:ministry')"],
  ["journey('blocked', 1, 'story:living'", "journey('blocked', 9001, 'story:living'"],
  ["journey('inactive', 2, 'design:black_market_88'", "journey('inactive', 9002, 'design:black_market_88'"],
  ["mobility.journeys.blocked?.alifeId, 1", "mobility.journeys.blocked?.alifeId, 9001"],
  ["getAlifeNpcRecordSnapshot(state, 2)", "getAlifeNpcRecordSnapshot(state, 9002)"],
]);

patchFile('tests/demos-social-feedback.test.ts', [
  ['overrides.gameOver ? [1] : []', 'overrides.gameOver ? [9001] : []'],
  ["moveAlifeNpcRecord(state, 1, 'story:ministry')", "moveAlifeNpcRecord(state, 9001, 'story:ministry')"],
  ["entityForTest(1)", "entityForTest(9001)"],
  ["sourceAlifeId: 1,", "sourceAlifeId: 9001,"],
  ["sourceAlifeId: 1}", "sourceAlifeId: 9001}"],
  ["targetAlifeId: 2", "targetAlifeId: 9002"],
  ["alifeId: 1,", "alifeId: 9001,"],
  ["alifeId: 1}", "alifeId: 9001}"],
  ["journey('social', 1,", "journey('social', 9001,"],
  ["id: 1, npcVisualId", "id: 9001, npcVisualId"],
]);

patchFile('tests/alife-migration-active.test.ts', [
  ["recordId: 1,", "recordId: 9001,"],
  ["recordId: 2,", "recordId: 9002,"],
  ["id: 1,", "id: 9001,"],
  ["id: 2,", "id: 9002,"],
  ["alifeId: 1,", "alifeId: 9001,"],
  ["alifeId: 2,", "alifeId: 9002,"],
  ["moveAlifeNpcRecord(state, 1,", "moveAlifeNpcRecord(state, 9001,"],
  ["moveAlifeNpcRecord(state, 2,", "moveAlifeNpcRecord(state, 9002,"],
  ["entityForTest(1)", "entityForTest(9001)"],
  ["entityForTest(2)", "entityForTest(9002)"],
]);

