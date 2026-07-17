const fs = require('fs');

let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

const hangingCalls = [
  /\s*expandPioneerCampFullFloor\(generation\.world, rng\);\n\s*break;\n/,
  /\s*expandOranzhereyaBetonaRouteGeometry\(generation\.world, rng\);\n\s*break;\n/,
  /\s*expandDarkMetroFullFloorGeometry\(generation\.world, rng, style\(route\), generation\.entities\);\n\s*break;\n/,
  /\s*expandAttractorDvorRouteGeometry\(generation\.world, rng\);\n\s*break;\n/
];

for (const r of hangingCalls) {
  fullFloor = fullFloor.replace(r, '\n');
}

fs.writeFileSync('src/gen/design_floors/full_floor.ts', fullFloor);
console.log('Cleaned full_floor.ts');
