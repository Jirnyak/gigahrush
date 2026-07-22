import * as fs from 'fs';
import * as path from 'path';

// Стоп-слова для токенизатора
const STOP_WORDS = new Set([
  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 
  'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 
  'бы', 'по', 'только', 'ее', 'мне', 'было', 'вот', 'от', 'меня', 'еще', 'нет', 
  'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг', 'ли', 'если', 'уже', 
  'или', 'ни', 'быть', 'был', 'него', 'до', 'вас', 'нибудь', 'опять', 'уж', 'вам', 
  'ведь', 'там', 'потом', 'себя', 'ничего', 'ей', 'может', 'они', 'тут', 'где', 'есть', 
  'надо', 'ней', 'для', 'мы', 'тебя', 'их', 'чем', 'была', 'сам', 'чтоб', 'без', 
  'будто', 'чего', 'раз', 'тоже', 'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот', 
  'того', 'потому', 'этого', 'какой', 'совсем', 'ним', 'здесь', 'этом', 'один', 'почти', 
  'мой', 'тем', 'чтобы', 'нее', 'сейчас', 'были', 'куда', 'зачем', 'всех', 'никогда', 
  'можно', 'при', 'наконец', 'два', 'об', 'другой', 'хоть', 'после', 'над', 'больше', 
  'тот', 'через', 'эти', 'нас', 'про', 'всего', 'них', 'какая', 'много', 'разве', 
  'три', 'эту', 'моя', 'впрочем', 'хорошо', 'свою', 'этой', 'перед', 'иногда', 'лучше', 
  'чуть', 'том', 'нельзя', 'такой', 'им', 'более', 'всегда', 'конечно', 'всю', 'между'
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^а-яё\- \n]/g, ' ').split(/\s+/).filter(w => w.length > 0);
}

function stem(word: string): string {
  if (word.length <= 4) return word;
  return word.replace(/(о|а|у|е|ом|ам|ах|и|ы|ой|ей|ов|ев|ям|ях|ью|ию|ия|ие|ии)$/, '');
}

interface ClusterTagMap {
  tag: string;
  stems: Set<string>;
}

function buildCategoryClusters(vocab: string[], vectors: Map<string, Map<string, number>>): ClusterTagMap[] {
  function cosineSim(w1: string, w2: string): number {
    const v1 = vectors.get(w1)!;
    const v2 = vectors.get(w2)!;
    let dot = 0;
    const [smaller, larger] = v1.size < v2.size ? [v1, v2] : [v2, v1];
    for (const [feat, val] of smaller.entries()) {
      if (larger.has(feat)) {
        dot += val * larger.get(feat)!;
      }
    }
    return dot;
  }

  const clustered = new Set<string>();
  const rawClusters: Array<{ center: string, members: string[] }> = [];

  for (const w of vocab) {
    if (clustered.has(w)) continue;
    const THRESHOLD = 0.35; 
    const neighbors: Array<{word: string, sim: number}> = [];
    
    for (const other of vocab) {
      if (w === other || clustered.has(other)) continue;
      const sim = cosineSim(w, other);
      if (sim > THRESHOLD) {
        neighbors.push({word: other, sim});
      }
    }
    
    neighbors.sort((a, b) => b.sim - a.sim);
    
    if (neighbors.length >= 2) {
      clustered.add(w);
      const members = [w];
      for (const n of neighbors.slice(0, 15)) {
        clustered.add(n.word);
        members.push(n.word);
      }
      rawClusters.push({ center: w, members });
    }
  }

  const result: ClusterTagMap[] = [];
  for (let i = 0; i < rawClusters.length; i++) {
    const c = rawClusters[i];
    let tag = `<КАТЕГОРИЯ_${i + 1}>`;
    
    const centerStem = c.center;
    if (['родрик', 'шухарт', 'артем', 'мечен', 'стрелок', 'сидорович', 'слесар', 'ликвидатор', 'патрульн', 'бригадир', 'мясник', 'комиссар', 'экспедитор', 'инженер'].some(s => centerStem.includes(s))) {
      tag = '<СУБЪЕКТ>';
    } else if (['зон', 'институт', 'вднх', 'полис', 'бункер', 'кордон', 'припять', 'гермодвер', 'герм', 'гермозатвор', 'цех', 'сектор', 'этаж', 'шахт', 'город'].some(s => centerStem.includes(s))) {
      tag = '<МЕСТО>';
    } else if (['самосбор', 'радиац', 'аномал', 'слизь', 'бетонник', 'выброс', 'снорк', 'контролер', 'черн', 'удушь', 'голод'].some(s => centerStem.includes(s))) {
      tag = '<УГРОЗА>';
    } else if (['хабар', 'пустышк', 'фильтр', 'тушенк', 'бинт', 'гаусс', 'дозиметр', 'патрон', 'артефакт', 'медуз', 'контейнер'].some(s => centerStem.includes(s))) {
      tag = '<ЦЕННЫЙ_ПРЕДМЕТ>';
    } else if (['ганз', 'орден', 'долг', 'свобод', 'монолит', 'ликвидатор'].some(s => centerStem.includes(s))) {
      tag = '<ФРАКЦИЯ>';
    }

    result.push({
      tag,
      stems: new Set(c.members),
    });
  }

  return result;
}

function run() {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (!fs.existsSync(corpusDir)) {
    console.error('Директория корпусов не найдена:', corpusDir);
    return;
  }

  const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
  console.log(`[Pattern Discovery - Vector Pipeline] Найдено файлов корпусов: ${files.length} (${files.join(', ')})`);

  let fullText = '';
  for (const file of files) {
    const filePath = path.join(corpusDir, file);
    fullText += fs.readFileSync(filePath, 'utf8') + '\n\n';
  }

  const sentences = fullText.match(/[^\.!\?]+[\.!\?]+/g) || [];
  
  const contexts = new Map<string, Map<string, number>>();
  const wordFreq = new Map<string, number>();

  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    for (let i = 0; i < tokens.length; i++) {
      const origWord = tokens[i];
      if (origWord.length < 3 || STOP_WORDS.has(origWord)) continue;
      const target = stem(origWord);
      wordFreq.set(target, (wordFreq.get(target) || 0) + 1);

      if (!contexts.has(target)) contexts.set(target, new Map<string, number>());
      const ctxMap = contexts.get(target)!;

      for (let j = Math.max(0, i - 2); j <= Math.min(tokens.length - 1, i + 2); j++) {
        if (i === j) continue;
        const ctxWord = tokens[j];
        const ctxStem = STOP_WORDS.has(ctxWord) ? ctxWord : stem(ctxWord);
        const prefix = j < i ? 'L_' : 'R_';
        ctxMap.set(`${prefix}${ctxStem}`, (ctxMap.get(`${prefix}${ctxStem}`) || 0) + 1);
      }
    }
  }

  const MIN_FREQ = 10;
  const vocab = Array.from(wordFreq.keys()).filter(w => wordFreq.get(w)! >= MIN_FREQ);
  vocab.sort((a, b) => wordFreq.get(b)! - wordFreq.get(a)!);

  const vectors = new Map<string, Map<string, number>>();
  for (const w of vocab) {
    const ctxMap = contexts.get(w)!;
    let sumSq = 0;
    for (const val of ctxMap.values()) sumSq += val * val;
    const norm = Math.sqrt(sumSq);
    const normalizedMap = new Map<string, number>();
    if (norm > 0) {
      for (const [feat, val] of ctxMap.entries()) {
        normalizedMap.set(feat, val / norm);
      }
    }
    vectors.set(w, normalizedMap);
  }

  const categoryClusters = buildCategoryClusters(vocab, vectors);

  const stemToTag = new Map<string, string>();
  for (const cluster of categoryClusters) {
    for (const st of cluster.stems) {
      if (!stemToTag.has(st)) {
        stemToTag.set(st, cluster.tag);
      }
    }
  }

  const patternCounts = new Map<string, number>();

  for (const s of sentences) {
    const tokens = tokenize(s);
    const patternNodes: string[] = [];

    for (const token of tokens) {
      if (STOP_WORDS.has(token)) continue;
      const st = stem(token);
      const tag = stemToTag.get(st);
      if (tag) {
        if (patternNodes.length === 0 || patternNodes[patternNodes.length - 1] !== tag) {
          patternNodes.push(tag);
        }
      }
    }

    if (patternNodes.length >= 2) {
      const patternKey = patternNodes.join(' -> ');
      patternCounts.set(patternKey, (patternCounts.get(patternKey) || 0) + 1);
    }
  }

  const sortedPatterns = Array.from(patternCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(p => p[1] >= 2);

  console.log(`\n--- ВЕКТОРНО ВЫЯВЛЕННЫЕ СИНТАКСИЧЕСКИЕ СКЕЛЕТЫ ---`);
  for (let i = 0; i < Math.min(25, sortedPatterns.length); i++) {
    console.log(`Freq: ${sortedPatterns[i][1].toString().padStart(4)} | Pattern: ${sortedPatterns[i][0]}`);
  }
  
  const exportPatterns = sortedPatterns.slice(0, 15).map(p => p[0].split(' -> '));
  console.log('\n--- JSON EXPORT FOR CORE ---');
  console.log(JSON.stringify(exportPatterns, null, 2));
}

run();
