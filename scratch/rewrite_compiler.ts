import * as fs from 'fs';

const prototypeSrc = fs.readFileSync('scripts/markov_core_prototype.ts', 'utf8');
const compilerSrc = fs.readFileSync('scripts/compile_markov_matrix.ts', 'utf8');

// The MarkovModel code and interfaces (without generate and resolveCategory which go to systems)
const modelClassStr = `
const START_TOKEN = "<s>";
const END_TOKEN = "</s>";

interface TransitionInfo {
  count: number;
  tags: Record<string, number>;
}

type MarkovGraph = Map<string, Map<string, TransitionInfo>>;

class MarkovModel {
  public graph: MarkovGraph = new Map();
  private order: number;
  public patternDistances: Map<string, Map<string, number>> = new Map();

  constructor(order: number = 2) {
    this.order = order;
  }

  private tokenize(text: string): string[] {
    const cleaned = text.trim();
    return cleaned.split(/\\s+/).map(w => {
      if (w.startsWith('<') && w.includes('>')) {
        const tagMatch = w.match(/(<[^>]+>)/);
        return tagMatch ? tagMatch[1] : w.toLowerCase();
      }
      return w.toLowerCase().replace(/[^а-яё\\-<>\\w]/gi, '');
    }).filter(w => w.length > 0);
  }

  public train(corpus: { text: string; tags: string[] }[]) {
    for (const item of corpus) {
      const tokens = this.tokenize(item.text);
      if (tokens.length < 3) continue;
      const sequence = Array(this.order).fill(START_TOKEN).concat(tokens).concat([END_TOKEN]);

      for (let i = 0; i < sequence.length - this.order; i++) {
        const history = sequence.slice(i, i + this.order).join(' ');
        const nextToken = sequence[i + this.order];

        if (!this.graph.has(history)) {
          this.graph.set(history, new Map());
        }

        const transitions = this.graph.get(history)!;
        if (!transitions.has(nextToken)) {
          transitions.set(nextToken, { count: 0, tags: {} });
        }

        const transInfo = transitions.get(nextToken)!;
        transInfo.count += 1;
        
        for (const tag of item.tags) {
          transInfo.tags[tag] = (transInfo.tags[tag] || 0) + 1;
        }
      }
    }
  }

  public buildHeuristics(targets: string[]) {
    const reverseGraph = new Map<string, Set<string>>();
    
    for (const [history, transitions] of this.graph.entries()) {
      for (const nextWord of transitions.keys()) {
        const nextHistory = history.split(' ').slice(1).concat(nextWord).join(' ');
        if (!reverseGraph.has(nextHistory)) reverseGraph.set(nextHistory, new Set());
        reverseGraph.get(nextHistory)!.add(history);
      }
    }

    for (const target of targets) {
      const distMap = new Map<string, number>();
      this.patternDistances.set(target, distMap);

      const queue: { hist: string, d: number }[] = [];
      
      for (const hist of this.graph.keys()) {
        if (hist.endsWith(target)) {
          distMap.set(hist, 0);
          queue.push({ hist, d: 0 });
        }
      }

      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
        if (current.d >= 15) continue;

        const incomings = reverseGraph.get(current.hist);
        if (incomings) {
          for (const inc of incomings) {
            if (!distMap.has(inc)) {
              distMap.set(inc, current.d + 1);
              queue.push({ hist: inc, d: current.d + 1 });
            }
          }
        }
      }
    }
  }
}
`;

const corpusLoaderStr = `
const RAW_CORPUS: { text: string; tags: string[] }[] = [];
try {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (fs.existsSync(corpusDir)) {
    const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
    console.log(\`[System] Loading corpus (\${files.length} files: \${files.join(', ')})...\`);
    let added = 0;
    
    const categoryMap: Array<[RegExp, string]> = [
      [/(Рэдрик[а-я]*|Шухарт[а-я]*|Ричард[а-я]*|Нунан[а-я]*|Артем[а-я]*|Меченый|Стрелок[а-я]*|Сидорович[а-я]*|Бармен[а-я]*|Мельник[а-я]*|Хантер[а-я]*|Бурбон[а-я]*|Сухой|Андрей[а-я]*|Воронин[а-я]*|ликвидатор[а-я]*|слесарь[а-я]*|патрульны[йеам]*|бригадир[а-я]*|мясник[а-я]*|проходчик[а-я]*|экспедитор[а-я]*|инженер[а-я]*|мусорщик[а-я]*|гражданин[а-я]*|сталкер[а-я]*|ходок[а-я]*|анон[а-я]*)/gi, '<SUBJ>'],
      [/(ЧАЭС|Чернобыль[а-я]*|Кордон[а-я]*|Свалк[аиуе]|Агропром[а-я]*|Темная Долина|Армейские Склады|Рыжий Лес|Радар[а-я]*|Припять[а-я]*|Затон[а-я]*|Юпитер[а-я]*|Выжигатель[а-я]*|ВДНХ|Полис[а-я]*|Алексеевск[а-я]*|Рижск[а-я]*|Смоленск[а-я]*|Арбатск[а-я]*|Красная Линия|Зон[ауеы]|зоной|зоне|институт[а-я]*|бункер[а-я]*|гермодвер[ьяием]*|герма[аммиуе]*|гермозатвор[а-я]*|цех[а-я]*|сектор[а-я]*|этаж[а-я]*|тупик[а-я]*|Клеть|Здания-Стен[аыеу]|Город[а-я]*)/gi, '<PLACE>'],
      [/(снорк[а-я]*|контролер[а-я]*|полтергейст[а-я]*|бюрер[а-я]*|слепые псы|слепой пес|псевдогигант[а-я]*|кровосос[а-я]*|кикимор[а-я]*|Чёрны[хеим]*|Самосбор[а-я]*|радиаци[яиюей]*|аномали[яиюей]*|слизь|бетонник[а-я]*|выброс[а-я]*|пси-излучени[яе]*|удушь[яе]*|голод[а-я]*)/gi, '<THREAT>'],
      [/(хабар[а-я]*|деньг[иами]*|пустышк[аиуей]*|фильтр[а-я]*|тушенк[аиуей]*|бинт[а-я]*|гаусс-пушк[аиуей]*|гаусс[а-я]*|дозиметр[а-я]*|патрон[а-я]*|артефакт[а-я]*|медуз[аыуей]*|ломоть мяса|мамина бусы|контейнер[а-я]*)/gi, '<ITEM>'],
      [/(Долг[а-я]*|Свобод[аыеу]|Монолит[а-я]*|Чистое Небо|Наемники|Ганз[аыеу]|Орден[а-я]*|Спарта)/gi, '<FACTION>'],
    ];

    for (const file of files) {
      const filePath = path.join(corpusDir, file);
      const text = fs.readFileSync(filePath, 'utf8');
      const sentences = text.match(/[^\\.!\\?]+[\\.!\\?]+/g) || [];

      for (const s of sentences) {
        let clean = s.replace(/[\\n\\r]+/g, ' ').replace(/\\s+/g, ' ').trim();
        for (const [regex, replacement] of categoryMap) {
          clean = clean.replace(regex, replacement);
        }
        clean = clean
          .replace(/\\bсталкер[а-я]*\\b/gi, '<SUBJ>')
          .replace(/\\bчаэс\\b/gi, '<PLACE>')
          .replace(/\\bсидорович[а-я]*\\b/gi, '<SUBJ>')
          .replace(/\\bконтролер[а-я]*\\b/gi, '<THREAT>')
          .replace(/\\bснорк[а-я]*\\b/gi, '<THREAT>');

        const wordsCount = clean.split(' ').length;
        if (wordsCount >= 3 && wordsCount <= 35) {
          RAW_CORPUS.push({ text: clean, tags: ['lore', 'neutral'] });
          added++;
        }
      }
    }
    console.log(\`[System] Loaded \${added} sentences from corpus.\`);
  }
} catch (e) {
  console.log('[System] Error loading corpus:', e);
}
`;

const compilerFuncStr = `
function compileAndVerify(): void {
  for (const [catName, items] of Object.entries(CANONICAL_CATEGORIES)) {
    for (const item of items) {
      if (!isSanitizedWord(item.text)) {
        throw new Error(\`Sanitization check failed for item in \${catName}: \${item.text}\`);
      }
    }
  }

  console.log('[Compile Markov Matrix] Training Markov Model...');
  const model = new MarkovModel(2);
  model.train(RAW_CORPUS);

  console.log('[Compile Markov Matrix] Building heuristics...');
  const targetTags = Object.keys(CANONICAL_CATEGORIES).map(k => \`<\${k}>\`);
  model.buildHeuristics(targetTags);

  console.log('[Compile Markov Matrix] Serializing graph...');
  const objGraph: any = {};
  for (const [hist, trans] of model.graph.entries()) {
    objGraph[hist] = {};
    for (const [next, info] of trans.entries()) {
      objGraph[hist][next] = { count: info.count, tags: info.tags };
    }
  }

  const objDistances: any = {};
  for (const [target, distMap] of model.patternDistances.entries()) {
    objDistances[target] = Object.fromEntries(distMap.entries());
  }

  const outPath = path.resolve(__dirname, '../src/data/markov_compiled_matrix.ts');
  const fileContent = \`/* ── Precompiled Markov Matrix & Categories (Build-Time Generated) ── */
/* Do not edit manually. Generated by scripts/compile_markov_matrix.ts */
/* Contains 100% canonical Gigahrush & Samosbor entities with PCA axes. */

export interface CompiledCategoryItem {
  readonly text: string;
  readonly weight: number;
  readonly tags: readonly string[];
}

export interface CompiledSyntaxSkeleton {
  readonly id: string;
  readonly pattern: readonly string[];
  readonly intent: string;
  readonly weight: number;
}

export const COMPILED_CATEGORIES: Readonly<Record<string, readonly CompiledCategoryItem[]>> = \${JSON.stringify(CANONICAL_CATEGORIES, null, 2)} as const;
export const COMPILED_SKELETONS: readonly CompiledSyntaxSkeleton[] = \${JSON.stringify(CANONICAL_SKELETONS, null, 2)} as const;

export const COMPILED_MARKOV_GRAPH: Record<string, Record<string, { count: number, tags: Record<string, number> }>> = \${JSON.stringify(objGraph)};
export const COMPILED_PATTERN_DISTANCES: Record<string, Record<string, number>> = \${JSON.stringify(objDistances)};
\`;

  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(\`[Compile Markov Matrix] Successfully wrote \${outPath} (\${(fileContent.length / 1024 / 1024).toFixed(2)} MB)\`);
}
compileAndVerify();
`;

const oldCompileFuncRegex = /function compileAndVerify\(\)[\s\S]*$/;
const newCompilerSrc = compilerSrc.replace(oldCompileFuncRegex, modelClassStr + '\n' + corpusLoaderStr + '\n' + compilerFuncStr);

fs.writeFileSync('scripts/compile_markov_matrix.ts', newCompilerSrc, 'utf8');
