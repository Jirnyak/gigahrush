import { execSync } from 'child_process';
import fs from 'fs';

const branches = fs.readFileSync('merge_logs/failed_tests.txt', 'utf8').split('\n').filter(Boolean);

for (const branch of branches) {
  console.log(`\n\n=== Processing ${branch} ===`);
  try {
    execSync(`git checkout main && git merge "marko1olo/${branch}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log(`Conflict in ${branch}, aborting...`);
    execSync(`git merge --abort`);
    continue;
  }
  
  try {
    console.log(`Running tests for ${branch}...`);
    execSync(`npm run check:readonly`, { stdio: 'inherit' });
    console.log(`SUCCESS! Tests pass now.`);
  } catch (e) {
    console.log(`TESTS FAILED for ${branch}.`);
    // Check if it's just tests/
    const status = execSync(`git status --short`).toString();
    console.log(`Status:\n${status}`);
    
    // We will leave it in the merged state for manual fixing,
    // so we break the loop!
    console.log(`Stopping to allow manual test fix.`);
    process.exit(1);
  }
}
console.log('All done!');
