import { execSync } from 'child_process';
try {
  execSync('npx tsx --test tests/alife.test.ts', { stdio: 'inherit' });
} catch (e) {
  console.log('Failed');
}
