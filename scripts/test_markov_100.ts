import { generateMarkovText } from '../src/systems/markov_text';
import { seedGlobalRng } from '../src/core/rand';

seedGlobalRng(Date.now()); // use random seed

const intents = ['talk_ambient', 'talk_context', 'rumor_flavor', 'demos_post', 'procedural_quest'];
const tags = ['ambient', 'danger', 'mystery', 'event', 'quest'];

for (let i = 0; i < 50; i++) {
    const intent = intents[i % intents.length] as any;
    const tag = tags[i % tags.length];
    const res = generateMarkovText({ intent, context: { tags: [tag] } });
    console.log(`[${intent}] ${res.text}`);
}
