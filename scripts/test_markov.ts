import { generateMarkovText } from '../src/systems/markov_text';
import { seedGlobalRng } from '../src/core/rand';

seedGlobalRng(Date.now()); // use random seed

console.log('--- TALK AMBIENT ---');
for (let i = 0; i < 15; i++) {
    console.log(generateMarkovText({ intent: 'talk_ambient', context: { tags: ['ambient'] } }).text);
}

console.log('\n--- TALK CONTEXT (DANGER) ---');
for (let i = 0; i < 15; i++) {
    console.log(generateMarkovText({ intent: 'talk_context', context: { tags: ['danger'] } }).text);
}

console.log('\n--- RUMOR ---');
for (let i = 0; i < 15; i++) {
    console.log(generateMarkovText({ intent: 'rumor_flavor', context: { tags: ['mystery'] } }).text);
}

console.log('\n--- DEMOS POST ---');
for (let i = 0; i < 15; i++) {
    console.log(generateMarkovText({ intent: 'demos_post', context: { tags: ['event'] } }).text);
}
