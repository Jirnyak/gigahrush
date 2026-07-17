const fs = require('fs');

const floors = [
  {
    path: 'src/gen/slime_nii/index.ts',
    routeId: 'SLIME_NII_ROUTE_ID',
    expandFunc: 'expandSlimeNiiRouteGeometry',
  },
  {
    path: 'src/gen/turing_nursery/index.ts',
    routeId: 'TURING_NURSERY_ROUTE_ID',
    expandFunc: 'expandTuringNurseryRouteGeometry',
  },
  {
    path: 'src/gen/black_market_88/index.ts',
    routeId: 'BLACK_MARKET_88_ROUTE_ID',
    expandFunc: 'expandBlackMarket88Bazaar',
  }
];

floors.forEach(f => {
  let content = fs.readFileSync(f.path, 'utf8');

  content = content.replace(
    /import \{ type FloorGeneration \} from '\.\.\/floor_manifest';/,
    `import { type FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import { ensureRouteWideFootprint } from '../design_floors/route_shell';
import { finalizeExpandedFloor } from '../design_floors/full_floor';
import { applyDesignFloorPopulationField } from '../design_floors/population';`
  );

  // find the return { ... } statement
  const returnRegex = /    world\.bakeLights\(\);\n\n    return \{\n      world,\n      entities,\n      spawnX:(.*?),\n      spawnY:(.*?),\n    \};\n  \}\);\n\}/s;
  
  const match = content.match(returnRegex);
  if (match) {
    const spawnX = match[1].trim();
    const spawnY = match[2].trim();
    
    content = content.replace(returnRegex, 
`    world.bakeLights();

    const route = designFloorById(${f.routeId})!;
    const rngGen = () => rng();
    ${f.expandFunc}(world, rngGen);

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
  });
}`);
    fs.writeFileSync(f.path, content);
    console.log('Patched ' + f.path);
  } else {
    console.log('Could not find return block in ' + f.path);
  }
});
