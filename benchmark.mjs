import { readFileSync } from 'node:fs';

console.log("Setting up benchmark");

const MOCK_SIZE = 10000;
const ITERATIONS = 10000;

const entities = Array.from({ length: MOCK_SIZE }, (_, i) => ({ id: i }));
const npcMenuTarget = MOCK_SIZE - 1;

const entityIndex = {
    byId: new Map(entities.map(e => [e.id, e]))
};

function getEntityIndex() {
    return entityIndex;
}

let start = performance.now();
let found = null;
for (let i = 0; i < ITERATIONS; i++) {
    found = entities.find(e => e.id === npcMenuTarget);
}
let timeOld = performance.now() - start;
console.log(`Old approach: ${timeOld}ms, Found:`, found);

start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    found = getEntityIndex().byId.get(npcMenuTarget) ?? entities.find(e => e.id === npcMenuTarget);
}
let timeNew = performance.now() - start;
console.log(`New approach: ${timeNew}ms, Found:`, found);

console.log(`Speedup: ${(timeOld / timeNew).toFixed(2)}x`);
