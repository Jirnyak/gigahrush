import { performance } from 'perf_hooks';

function oldInventoryItemTags(defId: string, itemTagsArr: string[], defTagsArr: string[]): string[] {
  const tags = ['player', 'inventory', 'item_type_test'];
  for (const tag of itemTagsArr) if (!tags.includes(tag)) tags.push(tag);
  for (const tag of defTagsArr) if (!tags.includes(tag)) tags.push(tag);
  return tags;
}

function newInventoryItemTags(defId: string, itemTagsArr: string[], defTagsArr: string[]): string[] {
  const tagsSet = new Set(['player', 'inventory', 'item_type_test']);
  for (let i = 0; i < itemTagsArr.length; i++) tagsSet.add(itemTagsArr[i]);
  for (let i = 0; i < defTagsArr.length; i++) tagsSet.add(defTagsArr[i]);
  return Array.from(tagsSet);
}

const itemTagsArr = Array.from({ length: 100 }, (_, i) => `tag_${i % 20}`);
const defTagsArr = Array.from({ length: 100 }, (_, i) => `tag_${i % 25}`);

const ITERATIONS = 100000;

const startOld = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  oldInventoryItemTags('test', itemTagsArr, defTagsArr);
}
const endOld = performance.now();
console.log(`Old Inventory: ${(endOld - startOld).toFixed(2)}ms`);

const startNew = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  newInventoryItemTags('test', itemTagsArr, defTagsArr);
}
const endNew = performance.now();
console.log(`New Inventory: ${(endNew - startNew).toFixed(2)}ms`);

function oldContractTags(tagsArray: string[]) {
  const tags = ['quest', 'contract', 'completed', 'cleanup_completed'];
  for (const tag of ['slime', 'brown_slime', 'cleanup']) {
    if (tagsArray.includes(tag)) tags.push(tag);
  }
  for (const tag of tagsArray) if (!tags.includes(tag)) tags.push(tag);
  return tags;
}

function newContractTags(tagsArray: string[]) {
  const tagsSet = new Set(['quest', 'contract', 'completed', 'cleanup_completed']);
  for (const tag of ['slime', 'brown_slime', 'cleanup']) {
    if (tagsArray.includes(tag)) tagsSet.add(tag);
  }
  for (let i = 0; i < tagsArray.length; i++) tagsSet.add(tagsArray[i]);
  return Array.from(tagsSet);
}

const contractTagsArr = Array.from({ length: 100 }, (_, i) => `tag_${i % 20}`);

const startOldContract = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  oldContractTags(contractTagsArr);
}
const endOldContract = performance.now();
console.log(`Old Contract: ${(endOldContract - startOldContract).toFixed(2)}ms`);

const startNewContract = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  newContractTags(contractTagsArr);
}
const endNewContract = performance.now();
console.log(`New Contract: ${(endNewContract - startNewContract).toFixed(2)}ms`);
