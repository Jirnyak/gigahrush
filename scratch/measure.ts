import * as fs from 'fs';
import * as path from 'path';

interface CorpusItem { text: string; tags: string[]; }
const RAW_CORPUS: CorpusItem[] = [];

// Simplified corpus loader
const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
if (fs.existsSync(corpusDir)) {
  const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
  for (const file of files) {
    const filePath = path.join(corpusDir, file);
    const text = fs.readFileSync(filePath, 'utf8');
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];
    for (const s of sentences) {
      RAW_CORPUS.push({ text: s, tags: ['lore'] });
    }
  }
}

const START_TOKEN = "<s>";
const END_TOKEN = "</s>";
interface TransitionInfo { count: number; tags: Record<string, number>; }
type MarkovGraph = Map<string, Map<string, TransitionInfo>>;

class MarkovModel {
  public graph: MarkovGraph = new Map();
  private order: number;
  constructor(order: number = 2) { this.order = order; }

  private tokenize(text: string): string[] {
    return text.trim().split(/\s+/).map(w => w.toLowerCase().replace(/[^а-яё\-<>\w]/gi, '')).filter(w => w.length > 0);
  }

  public train(corpus: CorpusItem[]) {
    for (const item of corpus) {
      const tokens = this.tokenize(item.text);
      if (tokens.length < 3) continue;
      const sequence = Array(this.order).fill(START_TOKEN).concat(tokens).concat([END_TOKEN]);
      for (let i = 0; i < sequence.length - this.order; i++) {
        const history = sequence.slice(i, i + this.order).join(' ');
        const nextToken = sequence[i + this.order];
        if (!this.graph.has(history)) this.graph.set(history, new Map());
        const transitions = this.graph.get(history)!;
        if (!transitions.has(nextToken)) transitions.set(nextToken, { count: 0, tags: {} });
        const transInfo = transitions.get(nextToken)!;
        transInfo.count += 1;
      }
    }
  }
}

const model = new MarkovModel(2);
model.train(RAW_CORPUS);

// Serialize to JSON
const objGraph: any = {};
for (const [hist, trans] of model.graph.entries()) {
  objGraph[hist] = {};
  for (const [next, info] of trans.entries()) {
    objGraph[hist][next] = info.count; // Only store counts to save space
  }
}

const jsonStr = JSON.stringify(objGraph);
console.log(`Corpus size: ${RAW_CORPUS.length} sentences`);
console.log(`Graph keys (histories): ${model.graph.size}`);
console.log(`JSON representation size: ${(jsonStr.length / 1024 / 1024).toFixed(2)} MB`);
