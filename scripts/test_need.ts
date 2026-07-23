import { generateMarkovText } from '../src/systems/markov_text';
import { seedGlobalRng } from '../src/core/rand';
seedGlobalRng(Date.now());
for (let i = 0; i < 5; i++) {
  const res = generateMarkovText({ intent: 'talk_context', context: { tags: ['need.food', 'hunger'] } });
  console.log(res);
}
