import { generateMarkovText } from '../src/systems/markov_text';
const result = generateMarkovText({ intent: 'talk_context' });
console.log('Result:', result);
