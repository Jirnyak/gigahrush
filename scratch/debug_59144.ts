import { makeGameState } from '../tests/helpers';
import { getAlifeNpcRecordSnapshot } from '../src/systems/alife';
import { ensureGraph, getDemosNpcOnlySocialEdges, findPlotNpcAlifeId } from '../src/systems/demos_social';

const state = makeGameState();
const graph = ensureGraph(state);
const olgaId = findPlotNpcAlifeId(state, graph, "olga");
console.log("Olga alifeId =", olgaId);
if (olgaId) {
  const before = Array.from({length: 10}, (_, i) => graph.targets[(olgaId - 1) * 10 + i]);
  console.log("Before initializeLazyRow targets:", before);
  getDemosNpcOnlySocialEdges(state, olgaId);
  const after = Array.from({length: 10}, (_, i) => graph.targets[(olgaId - 1) * 10 + i]);
  console.log("After initializeLazyRow targets:", after);
}
