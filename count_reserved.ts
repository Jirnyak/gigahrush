import { buildAlifePopulationPlan } from './src/data/alife_population_plan';

const plan = buildAlifePopulationPlan({ runSeed: 1, routeKeys: [] });
console.log("Reserved:", plan.reserved.length);
