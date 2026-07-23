import { generateMarkovText } from './src/systems/markov_text';

for (let i = 0; i < 5; i++) {
  console.log(generateMarkovText({ 
    intent: 'talk_ambient', 
    source: 'generated_markov', 
    context: { tags: ['activity_query', 'ai_state.WORKING', 'ai_goal.WANDER'], contextHash: '' } 
  }).text);
}
