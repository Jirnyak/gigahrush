const fs = require('fs');
const path = 'src/gen/black_market_88/index.ts';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes("import { rng } from '../../core/rand';")) {
  content = content.replace(
    /import \{ getPlotNpcNumericId \} from '\.\.\/\.\.\/data\/npc_packages';/,
    `import { getPlotNpcNumericId } from '../../data/npc_packages';\nimport { rng } from '../../core/rand';`
  );
}

// I need to rename expandBlackMarket88Bazaar to something else, or if expandBlackMarket88Bazaar is defined in the same file, maybe it's missing?
// Wait, is expandBlackMarket88Bazaar defined in black_market_88/index.ts?
// Let's check!
fs.writeFileSync(path, content);
