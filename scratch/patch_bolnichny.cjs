const fs = require('fs');

const path = 'src/gen/bolnichny_korpus/index.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /import \{ type FloorGeneration \} from '\.\.\/floor_manifest';/,
  `import { type FloorGeneration } from '../floor_manifest';
import { designFloorById } from '../../data/design_floors';
import { ensureRouteWideFootprint } from '../design_floors/route_shell';
import { finalizeExpandedFloor } from '../design_floors/full_floor';
import { applyDesignFloorPopulationField } from '../design_floors/population';`
);

content = content.replace(
  /    sanitizeDoors\(world\);\n    ensureConnectivity\(world, rooms\.triageEntrance\.x \+ 58\.5, rooms\.triageEntrance\.y \+ 17\.5\);\n    reinforceBolnichnyKorpusGates\(world\);\n    world\.rebuildContainerMap\(\);\n    world\.bakeLights\(\);\n\n    return \{\n      world,\n      entities,\n      spawnX: rooms\.triageEntrance\.x \+ 58\.5,\n      spawnY: rooms\.triageEntrance\.y \+ 17\.5,\n    \};\n  \}\);\n\}/s,
  `    sanitizeDoors(world);
    ensureConnectivity(world, rooms.triageEntrance.x + 58.5, rooms.triageEntrance.y + 17.5);
    reinforceBolnichnyKorpusGates(world);

    const route = designFloorById(BOLNICHNY_KORPUS_ROUTE_ID)!;
    const rngGen = () => rng();
    expandBolnichnyKorpusRouteGeometry(world, rngGen);

    const generation = {
      world,
      entities,
      spawnX: rooms.triageEntrance.x + 58.5,
      spawnY: rooms.triageEntrance.y + 17.5,
      isDecentralized: true,
    };

    ensureRouteWideFootprint(world, route, rngGen);
    finalizeExpandedFloor(generation, route, rngGen);
    applyDesignFloorPopulationField(generation, route);

    return generation;
  });
}`
);

fs.writeFileSync(path, content);
console.log('Patched bolnichny_korpus');
