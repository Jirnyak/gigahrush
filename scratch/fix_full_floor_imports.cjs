const fs = require('fs');

let fullFloor = fs.readFileSync('src/gen/design_floors/full_floor.ts', 'utf8');

fullFloor = fullFloor.replace(/import \{ blackoutDarknessLights, expandDarknessRouteGeometry, reinforceDarknessAuthoredHqTerritory \} from '\.\/darkness';/, "import { blackoutDarknessLights, expandDarknessRouteGeometry, reinforceDarknessAuthoredHqTerritory } from '../darkness';");
fullFloor = fullFloor.replace(/import \{ expandProductionBeltGeometry \} from '\.\/production_belt';/, "import { expandProductionBeltGeometry } from '../production_belt';");
fullFloor = fullFloor.replace(/import \{ expandSiliconNetWellRouteGeometry, tuneSiliconNetWellRouteZones \} from '\.\/silicon_net_well';/, "import { expandSiliconNetWellRouteGeometry, tuneSiliconNetWellRouteZones } from '../silicon_net_well';");
fullFloor = fullFloor.replace(/import \{ expandUnderhellRouteGeometry \} from '\.\/underhell';/, "import { expandUnderhellRouteGeometry } from '../underhell';");

fs.writeFileSync('src/gen/design_floors/full_floor.ts', fullFloor);
console.log('Fixed full_floor.ts imports.');
