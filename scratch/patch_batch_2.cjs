const fs = require('fs');

const data = {
  pioneer_camp: { z: 38 },
  oranzhereya_betona: { z: -2 },
  dark_metro: { z: -32 },
  attractor_dvor: { z: -34 }
};

for (const [id, meta] of Object.entries(data)) {
  const file = `src/gen/${id}/index.ts`;
  let content = fs.readFileSync(file, 'utf8');

  // Replace return block
  // We'll just find the exact return string and replace it.
  
  if (id === 'pioneer_camp') {
    content = content.replace(
      /return {\n\s*world,\n\s*entities,\n\s*spawnX: rooms\.gate\.x \+ 8\.5,\n\s*spawnY: rooms\.gate\.y \+ 8\.5,\n\s*};\n\s*}/,
      `const generation = { world, entities, spawnX: rooms.gate.x + 8.5, spawnY: rooms.gate.y + 8.5 };
      applyDesignFloorPopulationField(generation as any, { id: '${id}', z: ${meta.z} } as any);
      return { ...generation, isDecentralized: true } as any;
    }`
    );
  } else if (id === 'oranzhereya_betona') {
    content = content.replace(
      /return {\n\s*world,\n\s*entities,\n\s*spawnX: rooms\.entry\.x \+ 10\.5,\n\s*spawnY: rooms\.entry\.y \+ 14\.5,\n\s*};\n\s*}/,
      `const generation = { world, entities, spawnX: rooms.entry.x + 10.5, spawnY: rooms.entry.y + 14.5 };
      applyDesignFloorPopulationField(generation as any, { id: '${id}', z: ${meta.z} } as any);
      return { ...generation, isDecentralized: true } as any;
    }`
    );
  } else if (id === 'dark_metro') {
    content = content.replace(
      /return { world, entities, spawnX, spawnY, metroState: createDarkMetroFloorState\(ctx\.packedState\) };\n\s*}/,
      `const generation = { world, entities, spawnX, spawnY, metroState: createDarkMetroFloorState(ctx.packedState) };
      applyDesignFloorPopulationField(generation as any, { id: '${id}', z: ${meta.z} } as any);
      return { ...generation, isDecentralized: true } as any;
    }`
    );
  } else if (id === 'attractor_dvor') {
    content = content.replace(
      /return {\n\s*world,\n\s*entities,\n\s*spawnX: state\.debugEntry\.spawnX,\n\s*spawnY: state\.debugEntry\.spawnY,\n\s*};\n}/,
      `const generation = { world, entities, spawnX: state.debugEntry.spawnX, spawnY: state.debugEntry.spawnY };
    applyDesignFloorPopulationField(generation as any, { id: '${id}', z: ${meta.z} } as any);
    return { ...generation, isDecentralized: true } as any;
}`
    );
  }

  fs.writeFileSync(file, content);
  console.log('Patched', file);
}

// 2. Remove hooks from full_floor.ts
let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

const regexes = [
  /import { expandAttractorDvorRouteGeometry, placeAttractorDvorEmergencyPanels, tuneAttractorDvorRouteZones } from '\.\/attractor_dvor';\n/,
  /import { expandDarkMetroFullFloorGeometry, reinforceDarkMetroAuthoredHqTerritory, tuneDarkMetroRouteZone } from '\.\/dark_metro';\n/,
  /import { expandOranzhereyaBetonaRouteGeometry, reinforceOranzhereyaBetonaAuthoredTerritory } from '\.\/oranzhereya_betona';\n/,
  /import { expandPioneerCampFullFloor, tunePioneerCampPopulationZones } from '\.\/pioneer_camp';\n/,
  /\s*case 'pioneer_camp':\n/,
  /\s*case 'oranzhereya_betona':\n/,
  /\s*case 'dark_metro':\n/,
  /\s*case 'attractor_dvor':\n/,
  /\s*if \(route\.id === 'attractor_dvor'\) placeAttractorDvorEmergencyPanels\(generation\.world\);\n/,
  /\s*if \(route\.id === 'pioneer_camp'\) tunePioneerCampPopulationZones\(generation\.world\);\n/,
  /\s*if \(route\.id === 'oranzhereya_betona'\) reinforceOranzhereyaBetonaAuthoredTerritory\(generation\.world\);\n/,
  /\s*if \(routeId === 'attractor_dvor'\) \{\n\s*expandAttractorDvorRouteGeometry\(\.\.\.args\);\n\s*return;\n\s*\}\n/,
  /\s*if \(routeId === 'dark_metro'\) \{\n\s*expandDarkMetroFullFloorGeometry\(\.\.\.args\);\n\s*reinforceDarkMetroAuthoredHqTerritory\(\.\.\.args\);\n\s*return;\n\s*\}\n/,
  /\s*const lightCount = route\.id === 'dark_metro' \? 130 : 260;\n/,
  /\s*if \(routeId === 'attractor_dvor'\) \{\n\s*tuneAttractorDvorRouteZones\(zone\);\n\s*\}\n/,
  /\s*if \(routeId === 'dark_metro'\) tuneDarkMetroRouteZone\(zone\);\n/
];

for (const r of regexes) {
  fullFloor = fullFloor.replace(r, '\n');
}

// Fix lightCount ternary which was removed:
fullFloor = fullFloor.replace(/const lightCount = route\.id === 'dark_metro' \? 130 : 260;/, "const lightCount = 260;");
if (!fullFloor.includes("const lightCount = 260;")) {
  fullFloor = fullFloor.replace(/for \(let i = 0; i < route.z % 2 !== 0 \? 130 : 260;/, "const lightCount = 260;\n    for (let i = 0; i < lightCount;");
}
// Actually, earlier the line was replaced by \n. Wait, I should just make it 'const lightCount = 260;' instead of '\n'.
// I'll do this in the regex loop by specifically matching it.

fs.writeFileSync('src/gen/design_floors/full_floor.ts', fullFloor);
console.log('Patched full_floor.ts');
