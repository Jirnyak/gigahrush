import { COMPILED_MARKOV_GRAPH } from '../src/data/markov_compiled_matrix';
let placeHistories = 0;
for (const hist of Object.keys(COMPILED_MARKOV_GRAPH)) {
  if (hist.endsWith('<PLACE>')) {
    placeHistories++;
  }
}
console.log('<PLACE> histories count:', placeHistories);
