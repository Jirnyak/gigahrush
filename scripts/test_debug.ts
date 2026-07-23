import { generateMarkovText } from '../src/systems/markov_text';
import { seedGlobalRng } from '../src/core/rand';
seedGlobalRng(Date.now());
const res = generateMarkovText({ intent: 'rumor_flavor', context: { tags: ['mystery'] } });
console.log(res);
