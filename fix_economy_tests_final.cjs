const fs = require('fs');

function processFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  let originalContent = content;

  content = content.replace(/['"]living['"]/g, '0');
  content = content.replace(/['"]kvartiry['"]/g, '14');
  content = content.replace(/['"]ministry['"]/g, '30');
  content = content.replace(/['"]maintenance['"]/g, '-26');
  content = content.replace(/['"]hell['"]/g, '-36');
  content = content.replace(/['"]void['"]/g, '-50');
  // Handle economy.floors['living'] cases if they used strings that are now replaced by numbers
  // Note: ['0'] is not ideal, but in JS it works identically to [0] for indexing an object. But let's fix it:
  content = content.replace(/\[0\]/g, '[0]'); // already handled since the regex replaces just the string

  // But we replaced "'living'" with "0", so economy.floors[0] is created.
  // Wait, let's fix `economy.floors[0]`
  content = content.replace(/economy\.floors\['living'\]/g, 'economy.floors[0]');
  content = content.replace(/economy\.floors\['kvartiry'\]/g, 'economy.floors[14]');

  if (content !== originalContent) {
    fs.writeFileSync(path, content);
    console.log(`Fixed ${path}`);
  }
}

const files = [
  'tests/economy-ensure.test.ts',
  'tests/economy-invalidate.test.ts',
  'tests/economy-normalize.test.ts',
  'tests/economy-pressure.test.ts',
  'tests/economy-price-multiplier.test.ts',
  'tests/economy-prices.test.ts',
  'tests/economy-resources.test.ts'
];

files.forEach(processFile);
