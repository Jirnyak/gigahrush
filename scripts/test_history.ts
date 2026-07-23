import { COMPILED_MARKOV_GRAPH } from '../src/data/markov_compiled_matrix';
console.log(Object.keys(COMPILED_MARKOV_GRAPH).filter(k => k.startsWith('<s>')).slice(0, 10));
