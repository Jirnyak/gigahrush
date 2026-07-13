import * as fs from 'fs';
import * as path from 'path';

const corpusPath = path.join(process.cwd(), 'src/data/training_corpus/piknik.txt');

const categoryMap: Array<[RegExp, string]> = [
  [/(Рэдрик|Шухарт[а-я]*|Ричард[а-я]*|Нунан[а-я]*|Кирилл[а-я]*|Стервятник[а-я]*|Дик[а-я]*|Артур[а-я]*|Тендер[а-я]*)/gi, '<СУБЪЕКТ>'],
  [/(Зон[ауеы]|зоной|зоне|институт[а-я]*|бар[ауе]?|боржч[а-я]*)/gi, '<МЕСТО>'],
  [/(радиаци[яиюей]*|радиант[а-я]*|Бог[ау]?|Господ[иь])/gi, '<УГРОЗА>'],
  [/(хабар[а-я]*|деньг[иами]*|четвертак[а-я]*|пустышк[аиуей]*|слиз[ьиюя]*|колечк[оами]*)/gi, '<ЦЕННЫЙ_ПРЕДМЕТ>'],
];

function run() {
  if (!fs.existsSync(corpusPath)) {
    console.error('Корпус не найден:', corpusPath);
    return;
  }
  const text = fs.readFileSync(corpusPath, 'utf8');
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];

  const patternCounts = new Map<string, number>();

  for (const s of sentences) {
    let clean = s.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    
    for (const [regex, replacement] of categoryMap) {
      clean = clean.replace(regex, replacement);
    }

    const tokens = clean.split(' ');
    const patternNodes: string[] = [];
    
    for (const token of tokens) {
      // Find tags in the token
      const match = token.match(/(<[^>]+>)/);
      if (match) {
        // Prevent consecutive duplicates in pattern (e.g. <СУБЪЕКТ> <СУБЪЕКТ>)
        if (patternNodes.length === 0 || patternNodes[patternNodes.length - 1] !== match[1]) {
          patternNodes.push(match[1]);
        }
      }
    }

    // Only save patterns that have at least 2 nodes
    if (patternNodes.length >= 2) {
      const patternKey = patternNodes.join(' -> ');
      patternCounts.set(patternKey, (patternCounts.get(patternKey) || 0) + 1);
    }
  }

  // Sort and display top patterns
  const sortedPatterns = Array.from(patternCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(p => p[1] > 2); // At least 3 occurrences

  console.log(`\n--- TOP EXTRACTED STRUCTURAL SKELETONS ---`);
  for (let i = 0; i < Math.min(20, sortedPatterns.length); i++) {
    console.log(`Freq: ${sortedPatterns[i][1].toString().padStart(3)} | Pattern: ${sortedPatterns[i][0]}`);
  }
  
  // Output a JSON representation for use in markov_core_prototype
  const exportPatterns = sortedPatterns.slice(0, 15).map(p => p[0].split(' -> '));
  console.log('\n--- JSON EXPORT FOR CORE ---');
  console.log(JSON.stringify(exportPatterns, null, 2));
}

run();
