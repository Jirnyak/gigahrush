import { COMPILED_PATTERN_DISTANCES } from '../src/data/markov_compiled_matrix';
console.log('<PLACE> paths count:', Object.keys(COMPILED_PATTERN_DISTANCES['<PLACE>'] || {}).length);
console.log('<THREAT> paths count:', Object.keys(COMPILED_PATTERN_DISTANCES['<THREAT>'] || {}).length);
