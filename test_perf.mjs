import { performance } from 'perf_hooks';

const state = {
  quests: Array.from({ length: 1000 }, (_, i) => ({ done: i % 2 === 0 }))
};

const N = 100000;

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
  let count = 0;
  for (let j = 0; j < state.quests.length; j++) {
    if (!state.quests[j].done) count++;
  }
  result2 += count;
}
end = performance.now();
console.log('Manual loop:', end - start, 'ms', result2);

start = performance.now();
let result3 = 0;
for (let i = 0; i < N; i++) {
  result3 += state.quests.reduce((acc, q) => acc + (q.done ? 0 : 1), 0);
}
end = performance.now();
console.log('Reduce:', end - start, 'ms', result3);
