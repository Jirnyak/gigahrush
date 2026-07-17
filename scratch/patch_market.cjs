const fs = require('fs');
const path = 'src/gen/black_market_88/index.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ type FloorGeneration \} from '\.\.\/floor_manifest';/,
  `import { type FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import { ensureRouteWideFootprint } from '../design_floors/route_shell';
import { finalizeExpandedFloor } from '../design_floors/full_floor';
import { applyDesignFloorPopulationField } from '../design_floors/population';`
);

const returnRegex = /    sanitizeDoors\(world\);\n    world\.bakeLights\(\);\n\n    return \{\n      world,\n      entities,\n      spawnX:(.*?),\n      spawnY:(.*?),\n    \};\n\}/s;

const match = content.match(returnRegex);
if (match) {
  const spawnX = match[1].trim();
  const spawnY = match[2].trim();

  content = content.replace(returnRegex,
`    sanitizeDoors(world);

    const route = designFloorById('black_market_88')!;
    const rngGen = () => rng();
    expandBlackMarket88Bazaar(world, rngGen);

    const generation = {
      world,
      entities,
      spawnX: ${spawnX},
      spawnY: ${spawnY},
      isDecentralized: true,
    };

    ensureRouteWideFootprint(world, route, rngGen);
    finalizeExpandedFloor(generation, route, rngGen);
    applyDesignFloorPopulationField(generation, route);

    return generation;
}`);
  fs.writeFileSync(path, content);
  console.log('Patched black_market_88');
} else {
  console.log('Could not find return block in black_market_88');
}
