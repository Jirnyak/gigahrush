import fs from 'fs';
const code = fs.readFileSync('src/systems/demos_profiles.ts', 'utf8');
const match = code.match(/fallbackSocialSeeds[\s\S]*?\}/);
console.log(match ? match[0] : "Not found");
