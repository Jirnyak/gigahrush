import * as fs from 'fs';
import * as path from 'path';

// Расширенный список стоп-слов для русского языка
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

// Стеммер для русского языка
function stem(word: string): string {
  if (word.length <= 4) return word;
  return word.replace(/(о|а|у|е|ом|ам|ах|и|ы|ой|ей|ов|ев|ям|ях|ью|ию|ия|ие|ии)$/, '');
}

async function run() {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (!fs.existsSync(corpusDir)) {
    console.error('Директория корпусов не найдена:', corpusDir);
    return;
  }

  const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
  console.log(`[Category Discovery] Найдено файлов корпусов: ${files.length} (${files.join(', ')})`);
  
  let fullText = '';
  for (const file of files) {
    const filePath = path.join(corpusDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    fullText += content + '\n\n';
  }
  
  const sentences = fullText.match(/[^\.!\?]+[\.!\?]+/g) || [];
  
  const contexts = new Map<string, Map<string, number>>();
  const wordFreq = new Map<string, number>();
  const origWords = new Map<string, Set<string>>();

  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    for (let i = 0; i < tokens.length; i++) {
      const origWord = tokens[i];
      if (origWord.length < 3 || STOP_WORDS.has(origWord)) continue;
      
      const target = stem(origWord);
      
      wordFreq.set(target, (wordFreq.get(target) || 0) + 1);
      
      if (!origWords.has(target)) origWords.set(target, new Set());
      origWords.get(target)!.add(origWord);

      if (!contexts.has(target)) {
        contexts.set(target, new Map<string, number>());
      }
      const ctxMap = contexts.get(target)!;

      for (let j = Math.max(0, i - 2); j <= Math.min(tokens.length - 1, i + 2); j++) {
        if (i === j) continue;
        const ctxWord = tokens[j];
        const ctxStem = STOP_WORDS.has(ctxWord) ? ctxWord : stem(ctxWord);
        const prefix = j < i ? 'L_' : 'R_';
        const feature = `${prefix}${ctxStem}`;
        ctxMap.set(feature, (ctxMap.get(feature) || 0) + 1);
      }
    }
  }

  const MIN_FREQ = 10;
  const vocab = Array.from(wordFreq.keys()).filter(w => wordFreq.get(w)! >= MIN_FREQ);
  
  console.log(`Всего предложений по всем корпусам: ${sentences.length}`);
  console.log(`Всего уникальных основ: ${wordFreq.size}, частых (>=${MIN_FREQ}): ${vocab.length}`);

  const vectors = new Map<string, Map<string, number>>();
  for (const w of vocab) {
    const ctxMap = contexts.get(w)!;
    let sumSq = 0;
    for (const val of ctxMap.values()) {
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq);
    const normalizedMap = new Map<string, number>();
    if (norm > 0) {
      for (const [feat, val] of ctxMap.entries()) {
        normalizedMap.set(feat, val / norm);
      }
    }
    vectors.set(w, normalizedMap);
  }

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

  vocab.sort((a, b) => wordFreq.get(b)! - wordFreq.get(a)!);

  const clustered = new Set<string>();
  const clusters: Array<{ center: string, members: string[] }> = [];

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
      clusters.push({ center: w, members });
    }
  }

  function calculatePCA1D(members: string[]): number[] {
    const N = members.length;
    if (N <= 1) return members.map(() => 0);

    const features = new Set<string>();
    for (const w of members) {
      const vec = vectors.get(w);
      if (vec) {
        for (const f of vec.keys()) features.add(f);
      }
    }
    const featArr = Array.from(features);
    const M = featArr.length;

    const X: number[][] = [];
    for (let i = 0; i < N; i++) {
      const vec = vectors.get(members[i]);
      const row = new Float64Array(M);
      for (let j = 0; j < M; j++) {
        row[j] = vec ? (vec.get(featArr[j]) || 0) : 0;
      }
      X.push(Array.from(row));
    }

    const mean = new Float64Array(M);
    for (let j = 0; j < M; j++) {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += X[i][j];
      mean[j] = sum / N;
    }
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        X[i][j] -= mean[j];
      }
    }

    const G: number[][] = Array(N).fill(0).map(() => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let dot = 0;
        for (let k = 0; k < M; k++) {
          dot += X[i][k] * X[j][k];
        }
        G[i][j] = dot;
      }
    }

    let u = Array(N).fill(0).map((_, i) => Math.sin(i + 1)); 
    let norm = Math.sqrt(u.reduce((acc, val) => acc + val * val, 0));
    u = u.map(v => v / norm);

    for (let iter = 0; iter < 100; iter++) {
      let nextU = Array(N).fill(0);
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          nextU[i] += G[i][j] * u[j];
        }
      }
      norm = Math.sqrt(nextU.reduce((acc, val) => acc + val * val, 0));
      if (norm === 0) break;
      u = nextU.map(v => v / norm);
    }

    const maxAbs = Math.max(...u.map(Math.abs));
    if (maxAbs === 0) return u;
    
    return u.map(v => v / maxAbs);
  }

  console.log(`\n--- МАТЕМАТИЧЕСКИ ВЫЯВЛЕННЫЕ КАТЕГОРИИ С ОСЯМИ PCA (АБСТРАКТНЫЕ ВЕСА) ---`);
  for (let i = 0; i < Math.min(clusters.length, 30); i++) {
    const c = clusters[i];
    const weights = calculatePCA1D(c.members);
    
    const scoredMembers = c.members.map((m, idx) => ({
      word: Array.from(origWords.get(m) || [m]).slice(0, 2).join('/'),
      weight: weights[idx]
    })).sort((a, b) => a.weight - b.weight);

    console.log(`\n[Категория #${i+1}] (Узел: ${c.center.toUpperCase()})`);
    const repr = scoredMembers.map(m => `${m.word}(${m.weight > 0 ? '+' : ''}${m.weight.toFixed(2)})`).join(', ');
    console.log(`Ось дисперсии [-1.0 ... 1.0]:\n  ${repr}`);
  }
}

run().catch(console.error);
