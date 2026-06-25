import { performance } from 'perf_hooks';

const state = {
  quests: Array.from({ length: 50 }, (_, i) => ({ done: i % 2 === 0 }))
};

const N = 1000000;

let start = performance.now();
let result1 = 0;
for (let i = 0; i < N; i++) {
  result1 += state.quests.filter(q => !q.done).length;
}
let end = performance.now();
console.log('Filter + length:', end - start, 'ms', result1);

function countActiveQuests(quests) {
  let count = 0;
  for (let i = 0; i < quests.length; i++) {
    if (!quests[i].done) count++;
  }
  return count;
}

start = performance.now();
let result2 = 0;
for (let i = 0; i < N; i++) {
  result2 += countActiveQuests(state.quests);
}
end = performance.now();
console.log('Manual loop:', end - start, 'ms', result2);

function getActiveQuests(quests) {
  const result = [];
  for (let i = 0; i < quests.length; i++) {
    if (!quests[i].done) result.push(quests[i]);
  }
  return result;
}

start = performance.now();
let result3 = 0;
for (let i = 0; i < N; i++) {
  result3 += getActiveQuests(state.quests).length;
}
end = performance.now();
console.log('Push to array:', end - start, 'ms', result3);
