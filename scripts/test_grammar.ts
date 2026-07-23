import { generateMarkovText } from '../src/systems/markov_text';
import { seedGlobalRng } from '../src/core/rand';
seedGlobalRng(Date.now());
for (let i = 0; i < 5; i++) {
  const res = generateMarkovText({ intent: 'talk_ambient' });
  console.log(res.text);
}
