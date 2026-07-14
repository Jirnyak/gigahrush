const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');

  // If already fixed, skip
  if (content.includes('buildAlifePopulationPlan({')) {
     console.log(file, 'already has customPlan');
     // Actually let's just make sure we do the correct replacement
  }

  if (!content.includes("import { buildAlifePopulationPlan }")) {
    content = content.replace("import { createAlifeNumericColumns, alifeActiveRouteKeys", "import { buildAlifePopulationPlan } from '../src/data/alife_population_plan';\nimport { createAlifeNumericColumns, alifeActiveRouteKeys");
    if (!content.includes("import { buildAlifePopulationPlan }")) {
      content = "import { buildAlifePopulationPlan } from '../src/data/alife_population_plan';\n" + content;
    }
  }

  // We need to pass the custom plan to setAlifeState everywhere it's called.
  // Instead of parsing, we can just replace all setAlifeState(state, { ... }) with setAlifeState(state, { ... }, customPlan)
  // BUT we need to define customPlan in the scope.
  // Let's just create a helper in the test file.

  const helper = `\nfunction getTestPlan() {
  return buildAlifePopulationPlan({ runSeed: 123, routeKeys: ['story:living', 'story:ministry', 'story:kvartiry'], total: 100_000, npcPackages: [] });
}\n`;
  if (!content.includes("function getTestPlan()")) {
    content = content.replace("function minimalState", helper + "\nfunction minimalState");
    content = content.replace("function stateAtLiving", helper + "\nfunction stateAtLiving");
    content = content.replace("function stateAtVoid", helper + "\nfunction stateAtVoid");
  }

  // Now replace all `{ buckets: [] }` with `getTestPlan()`
  content = content.replace(/\{ buckets: \[\] \}/g, "getTestPlan()");
  
  // Replace un-fixed setAlifeState calls
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 100_000 \}\)/g, "setAlifeState(state, { seed: 12345, total: 100_000 }, getTestPlan())");
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 20_000 \}\)/g, "setAlifeState(state, { seed: 12345, total: 20_000 }, getTestPlan())");
  content = content.replace(/setAlifeState\(state, \{ seed: 12345, total: 1_000 \}\)/g, "setAlifeState(state, { seed: 12345, total: 1_000 }, getTestPlan())");

  fs.writeFileSync(file, content);
}

['tests/alife.test.ts', 'tests/alife-migration.test.ts', 'tests/alife-migration-active.test.ts', 'tests/demos-social-feedback.test.ts'].forEach(fixFile);
