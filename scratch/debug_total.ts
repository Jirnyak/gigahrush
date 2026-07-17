import { makeGameState } from '../tests/helpers';
import { ensureGraph } from '../src/systems/demos_social';
const state = makeGameState();
const graph = ensureGraph(state);
console.log("graph.total =", graph.total);
