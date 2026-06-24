import { performance } from 'perf_hooks';

const state = {
  quests: Array.from({ length: 50 }, (_, i) => ({ done: i % 2 === 0 }))
};

const N = 1000000;

function countActiveQuests(quests) {
  let count = 0;
  for (let i = 0; i < quests.length; i++) {
    if (!quests[i].done) count++;
  }
  return count;
}

let start = performance.now();
let result1 = 0;
for (let i = 0; i < N; i++) {
  result1 += state.quests.filter(q => !q.done).length;
}
let end = performance.now();
console.log('Filter + length:', end - start, 'ms', result1);

start = performance.now();
let result2 = 0;
for (let i = 0; i < N; i++) {
  result2 += countActiveQuests(state.quests);
}
end = performance.now();
console.log('Manual loop:', end - start, 'ms', result2);
