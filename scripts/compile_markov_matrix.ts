/* ── Offline Markov Matrix & Skeleton Compiler ────────────────── */
/* Generates src/data/markov_compiled_matrix.ts at build-time.       */
/* Zero runtime filesystem (node:fs) or text parsing in browser.     */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alien franchise words strictly banned from the compiled browser matrix
const ALIEN_FRANCHISE_BLACKLIST = new Set([
  'чаэс', 'припять', 'чернобыль', 'сидорович', 'контролер', 'контролёр',
  'снорк', 'меченый', 'стрелок', 'вднх', 'полис', 'ганза', 'орден',
  'монолит', 'долг', 'свобода', 'артем', 'артём', 'родрик', 'шухарт',
  'сталкер', 'сталкеры', 'кордон', 'радар', 'саркофаг', 'янтарь'
]);

function isSanitizedWord(word: string): boolean {
  const lower = word.toLocaleLowerCase('ru-RU');
  for (const alien of ALIEN_FRANCHISE_BLACKLIST) {
    const re = new RegExp(`(?:^|\\s|[,;.!?«»"'])${alien}(?:$|\\s|[,;.!?«»"'])`, 'i');
    if (re.test(lower)) return false;
  }
  return true;
}

interface CategoryItem {
  text: string;
  weight: number;
  tags: string[];
}

// Canonical Gigahrush & Samosbor dictionary categories with PCA-like weights
const CANONICAL_CATEGORIES: Record<string, CategoryItem[]> = {
  SUBJ: [
    { text: 'ликвидатор', weight: 80, tags: ['guard', 'combat', 'danger'] },
    { text: 'слесарь-параноик', weight: 40, tags: ['repair', 'stalker'] },
    { text: 'бригадир смены', weight: 60, tags: ['guard', 'work'] },
    { text: 'обыватель', weight: 10, tags: ['neutral', 'survival'] },
    { text: 'мясник', weight: 90, tags: ['blood', 'mystic', 'combat'] },
    { text: 'проходчик', weight: 50, tags: ['stalker', 'survival', 'work'] },
    { text: 'домком', weight: 70, tags: ['guard', 'bureaucracy'] },
    { text: 'дежурный электрик', weight: 35, tags: ['repair', 'survival'] },
    { text: 'дежурный по гермозатвору', weight: 65, tags: ['guard', 'door'] },
    { text: 'лаборант НИИ', weight: 30, tags: ['neutral', 'science'] },
    { text: 'санитар секции', weight: 45, tags: ['medical', 'clean'] },
    { text: 'инспектор по герметичности', weight: 75, tags: ['guard', 'door', 'bureaucracy'] }
  ],
  ITEM: [
    { text: 'гаусс-пушка', weight: 5000, tags: ['combat', 'expensive'] },
    { text: 'артефакт "Пустышка"', weight: 1500, tags: ['mystic', 'expensive'] },
    { text: 'чистый фильтр АФУ-300', weight: 100, tags: ['survival', 'repair'] },
    { text: 'банка тушенки', weight: 50, tags: ['survival', 'food'] },
    { text: 'грязный бинт', weight: 5, tags: ['blood', 'survival', 'medical'] },
    { text: 'патроны 5.45', weight: 200, tags: ['combat', 'expensive'] },
    { text: 'дозиметр ДП-5В', weight: 450, tags: ['survival', 'repair', 'science'] },
    { text: 'малахитовый артефакт', weight: 1200, tags: ['mystic', 'expensive'] },
    { text: 'герметизирующая мастика', weight: 80, tags: ['repair'] },
    { text: 'пайковый концентрат', weight: 40, tags: ['food', 'survival'] },
    { text: 'талон на воду', weight: 15, tags: ['survival', 'trade'] },
    { text: 'обрывок журнала ГО', weight: 25, tags: ['document', 'lore'] },
    { text: 'инструкция по герметизации', weight: 35, tags: ['document', 'repair', 'lore'] }
  ],
  PLACE: [
    { text: 'гермодверь', weight: 10, tags: ['door', 'safe'] },
    { text: 'распределитель', weight: 20, tags: ['repair', 'work'] },
    { text: 'влажный сектор', weight: 40, tags: ['water', 'danger'] },
    { text: 'сборочный цех', weight: 30, tags: ['neutral', 'work'] },
    { text: 'кровавый тупик', weight: 100, tags: ['blood', 'mystic', 'danger'] },
    { text: 'защитный шлюз', weight: 15, tags: ['door', 'guard', 'safe'] },
    { text: 'бункер Гражданской Обороны', weight: 5, tags: ['safe', 'door'] },
    { text: 'вентиляционная шахта', weight: 45, tags: ['danger', 'repair'] },
    { text: 'трансформаторная ячейка', weight: 55, tags: ['danger', 'repair'] },
    { text: 'жилая ячейка', weight: 12, tags: ['safe', 'neutral'] },
    { text: 'продувочная прачечная', weight: 25, tags: ['water', 'neutral'] },
    { text: 'архив комендатуры', weight: 20, tags: ['document', 'bureaucracy', 'safe'] }
  ],
  THREAT: [
    { text: 'Самосбор', weight: 100, tags: ['samosbor', 'danger'] },
    { text: 'процедурная аномалия', weight: 50, tags: ['mystic', 'danger'] },
    { text: 'бетонник', weight: 80, tags: ['combat', 'danger'] },
    { text: 'истощение и голод', weight: 20, tags: ['survival'] },
    { text: 'пси-излучение', weight: 90, tags: ['mystic', 'fear', 'danger'] },
    { text: 'черная слизь', weight: 75, tags: ['samosbor', 'danger'] },
    { text: 'удушливый газ', weight: 40, tags: ['survival', 'danger', 'air'] },
    { text: 'радиационная капель', weight: 35, tags: ['survival', 'danger'] },
    { text: 'гидроудар в трубах', weight: 30, tags: ['repair', 'danger'] }
  ],
  FACTION: [
    { text: 'Служба ликвидации', weight: 80, tags: ['guard', 'combat'] },
    { text: 'Служба герметизации', weight: 70, tags: ['guard', 'door'] },
    { text: 'Независимая гильдия слесарей', weight: 40, tags: ['repair'] },
    { text: 'Администрация корпуса', weight: 65, tags: ['bureaucracy'] },
    { text: 'НИИ "Щит"', weight: 85, tags: ['science'] }
  ],
  ACTION: [
    { text: 'смазывали поворотные механизмы', weight: 30, tags: ['repair', 'door'] },
    { text: 'задраили шлюз', weight: 70, tags: ['guard', 'door', 'samosbor'] },
    { text: 'сдали карточки', weight: 40, tags: ['bureaucracy', 'survival'] },
    { text: 'записали показания манометра', weight: 20, tags: ['repair', 'science'] },
    { text: 'проверили герметик', weight: 50, tags: ['repair', 'door'] },
    { text: 'опечатали сектор', weight: 85, tags: ['guard', 'danger'] },
    { text: 'оставили заметку на стене', weight: 15, tags: ['document', 'lore'] }
  ],
  INSTRUMENT: [
    { text: 'дозиметр', weight: 100, tags: ['survival', 'science'] },
    { text: 'гаечный ключ', weight: 50, tags: ['repair'] },
    { text: 'противогаз ГП-7', weight: 150, tags: ['survival', 'air'] },
    { text: 'переносной фонарь', weight: 30, tags: ['survival'] },
    { text: 'прижимной клин', weight: 40, tags: ['door', 'repair'] }
  ],
  STATE_FACT: [
    { text: 'дверь набухла снизу', weight: 60, tags: ['door', 'water'] },
    { text: 'этаж сегодня врёт номером', weight: 40, tags: ['lift', 'route', 'danger'] },
    { text: 'кухня стала за шкафом', weight: 50, tags: ['room', 'food'] },
    { text: 'дверь слушает громче людей', weight: 60, tags: ['room', 'danger'] },
    { text: 'завтра говорит кладовщик', weight: 50, tags: ['trade', 'production'] },
    { text: 'стены сырые', weight: 45, tags: ['water', 'room'] },
    { text: 'воздух плохой', weight: 55, tags: ['air', 'danger'] },
    { text: 'руки держи на виду', weight: 60, tags: ['relation', 'theft'] },
    { text: 'цену назовут мягче', weight: 50, tags: ['trade', 'help'] },
    { text: 'список укрытых опять не сошёлся', weight: 70, tags: ['shelter', 'event'] },
    { text: 'цены не стоят', weight: 60, tags: ['trade', 'shortage'] },
    { text: 'дверь держится лучше', weight: 40, tags: ['repair', 'door'] },
    { text: 'сначала считают своих', weight: 70, tags: ['faction', 'order'] },
    { text: 'держат сектор, пока есть патроны', weight: 70, tags: ['faction', 'danger', 'combat'] },
    { text: 'имя запоминают', weight: 55, tags: ['relation', 'help'] },
    { text: 'свидетель уже у двери', weight: 60, tags: ['relation', 'theft'] }
  ],
  NEED: [
    { text: 'Воды мало', weight: 90, tags: ['need', 'water'] },
    { text: 'Хлеб кончается', weight: 80, tags: ['need', 'food'] },
    { text: 'Кровь пошла сильнее', weight: 70, tags: ['need', 'wound', 'medical'] },
    { text: 'горло пересохло', weight: 85, tags: ['need', 'water'] },
    { text: 'ноги тяжелеют', weight: 50, tags: ['need', 'wound'] },
    { text: 'в глазах рябит', weight: 60, tags: ['need', 'wound', 'danger'] }
  ],
  SEVERITY: [
    { text: 'это уже срочно', weight: 70, tags: ['urgent'] },
    { text: 'терпит недолго', weight: 50, tags: ['low'] },
    { text: 'паника ближе драки', weight: 40, tags: ['panic', 'danger'] },
    { text: 'хуже не бывает', weight: 80, tags: ['urgent', 'danger'] },
    { text: 'пока держится', weight: 30, tags: ['low'] }
  ],
  TRADE_RULE: [
    { text: 'плати водой или маршрутом', weight: 70, tags: ['trade', 'water'] },
    { text: 'торгуйся при свидетеле', weight: 50, tags: ['trade', 'queue'] },
    { text: 'платить будут претензиями', weight: 40, tags: ['contract'] },
    { text: 'без свидетелей не берут', weight: 60, tags: ['trade', 'theft'] },
    { text: 'цена по карточке и ни литра сверху', weight: 55, tags: ['trade', 'water', 'bureaucracy'] }
  ],
  BAN: [
    { text: 'не шагай первым', weight: 50, tags: ['danger'] },
    { text: 'не открывай на знакомый голос', weight: 80, tags: ['door', 'samosbor', 'danger'] },
    { text: 'не показывай пайку очереди', weight: 50, tags: ['food', 'queue'] },
    { text: 'не выноси молча', weight: 70, tags: ['theft'] },
    { text: 'не спорь у чужой гермы', weight: 50, tags: ['faction', 'shelter'] },
    { text: 'не верь голосу за стеной', weight: 60, tags: ['danger', 'samosbor'] },
    { text: 'не лезь без фонаря', weight: 40, tags: ['danger', 'survival'] }
  ],
  FACTION_NAME: [
    { text: 'Гражданские', weight: 60, tags: ['faction', 'citizen'] },
    { text: 'Ликвидаторы', weight: 80, tags: ['faction', 'liquidator', 'combat'] },
    { text: 'Культисты', weight: 50, tags: ['faction', 'cult', 'mystic'] },
    { text: 'Дикие', weight: 60, tags: ['faction', 'wild'] },
    { text: 'Администрация', weight: 65, tags: ['faction', 'bureaucracy'] }
  ],
  TERMINAL: [
    { text: 'верят на одну карту больше', weight: 40, tags: ['relation'] },
    { text: 'и точка', weight: 20, tags: [] },
    { text: 'так и живём', weight: 30, tags: ['survival'] },
    { text: 'без вариантов', weight: 35, tags: ['danger'] },
    { text: 'пока не забыли', weight: 25, tags: ['relation', 'event'] }
  ]
};

// Mined syntax skeletons grouped by intent
interface SyntaxSkeleton {
  id: string;
  pattern: string[]; // e.g. ['SUBJ', 'ACTION', 'PLACE']
  intent: string;    // e.g. 'talk_context', 'document_flavor', 'lore_note', 'bark_ambient'
  weight: number;
}

const CANONICAL_SKELETONS: SyntaxSkeleton[] = [
  // talk_context
  { id: 'sk.talk.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'talk_context', weight: 10 },
  { id: 'sk.talk.2', pattern: ['PLACE', 'THREAT'], intent: 'talk_context', weight: 12 },
  { id: 'sk.talk.3', pattern: ['SUBJ', 'THREAT'], intent: 'talk_context', weight: 15 },
  { id: 'sk.talk.4', pattern: ['PLACE', 'ITEM'], intent: 'talk_context', weight: 14 },
  { id: 'sk.talk.5', pattern: ['FACTION', 'ACTION', 'PLACE'], intent: 'talk_context', weight: 11 },
  // talk_ambient
  { id: 'sk.ambient.1', pattern: ['SUBJ', 'ACTION'], intent: 'talk_ambient', weight: 10 },
  { id: 'sk.ambient.2', pattern: ['PLACE', 'THREAT'], intent: 'talk_ambient', weight: 8 },
  { id: 'sk.ambient.3', pattern: ['SUBJ', 'ITEM'], intent: 'talk_ambient', weight: 10 },
  // bark_ambient
  { id: 'sk.bark.1', pattern: ['THREAT', 'SUBJ'], intent: 'bark_ambient', weight: 10 },
  { id: 'sk.bark.2', pattern: ['PLACE', 'THREAT'], intent: 'bark_ambient', weight: 12 },
  { id: 'sk.bark.3', pattern: ['SUBJ', 'INSTRUMENT'], intent: 'bark_ambient', weight: 8 },
  // procedural_quest
  { id: 'sk.quest.1', pattern: ['PLACE', 'THREAT', 'ITEM'], intent: 'procedural_quest', weight: 15 },
  { id: 'sk.quest.2', pattern: ['FACTION', 'THREAT', 'PLACE'], intent: 'procedural_quest', weight: 12 },
  // document_flavor (записки, дневники, документы)
  { id: 'sk.doc.1', pattern: ['SUBJ', 'ACTION', 'PLACE'], intent: 'document_flavor', weight: 14 },
  { id: 'sk.doc.2', pattern: ['PLACE', 'THREAT', 'ACTION'], intent: 'document_flavor', weight: 16 },
  { id: 'sk.doc.3', pattern: ['FACTION', 'THREAT'], intent: 'document_flavor', weight: 12 },
  { id: 'sk.doc.4', pattern: ['SUBJ', 'ITEM', 'PLACE'], intent: 'document_flavor', weight: 13 },
  // lore_note
  { id: 'sk.lore.1', pattern: ['PLACE', 'THREAT', 'SUBJ'], intent: 'lore_note', weight: 15 },
  { id: 'sk.lore.2', pattern: ['FACTION', 'PLACE', 'ACTION'], intent: 'lore_note', weight: 14 },
  // demos_post
  { id: 'sk.demos.1', pattern: ['PLACE', 'THREAT'], intent: 'demos_post', weight: 12 },
  { id: 'sk.demos.2', pattern: ['SUBJ', 'ITEM', 'PLACE'], intent: 'demos_post', weight: 14 }
];


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
    // Split keeping punctuation as separate tokens, and tags as single tokens
    const matches = cleaned.match(/(?:<[^>]+>)|(?:[a-zа-яё\-]+)|(?:[.,!?])/gi);
    if (!matches) return [];
    return matches.map(w => {
      if (w.startsWith('<') && w.includes('>')) return w;
      if (/^[.,!?]$/.test(w)) return w;
      return w.toLowerCase();
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


const RAW_CORPUS: { text: string; tags: string[] }[] = [];
try {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (fs.existsSync(corpusDir)) {
    const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
    console.log(`[System] Loading corpus (${files.length} files: ${files.join(', ')})...`);
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
      const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];

      for (const s of sentences) {
        let clean = s.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        for (const [regex, replacement] of categoryMap) {
          clean = clean.replace(regex, replacement);
        }
        clean = clean
          .replace(/\bсталкер[а-я]*\b/gi, '<SUBJ>')
          .replace(/\bчаэс\b/gi, '<PLACE>')
          .replace(/\bсидорович[а-я]*\b/gi, '<SUBJ>')
          .replace(/\bконтролер[а-я]*\b/gi, '<THREAT>')
          .replace(/\bснорк[а-я]*\b/gi, '<THREAT>');

        const wordsCount = clean.split(' ').length;
        if (wordsCount >= 3 && wordsCount <= 35) {
          RAW_CORPUS.push({ text: clean, tags: ['lore', 'neutral'] });
          added++;
        }
      }
    }
    console.log(`[System] Loaded ${added} sentences from corpus.`);
  }
} catch (e) {
  console.log('[System] Error loading corpus:', e);
}


function compileAndVerify(): void {
  for (const [catName, items] of Object.entries(CANONICAL_CATEGORIES)) {
    for (const item of items) {
      if (!isSanitizedWord(item.text)) {
        throw new Error(`Sanitization check failed for item in ${catName}: ${item.text}`);
      }
    }
  }

  console.log('[Compile Markov Matrix] Training Markov Model...');
  const model = new MarkovModel(2);
  model.train(RAW_CORPUS);

  console.log('[Compile Markov Matrix] Building heuristics...');
  const targetTags = Object.keys(CANONICAL_CATEGORIES).map(k => `<${k}>`);
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
  const fileContent = `/* ── Precompiled Markov Matrix & Categories (Build-Time Generated) ── */
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

export const COMPILED_CATEGORIES: Readonly<Record<string, readonly CompiledCategoryItem[]>> = ${JSON.stringify(CANONICAL_CATEGORIES, null, 2)} as const;
export const COMPILED_SKELETONS: readonly CompiledSyntaxSkeleton[] = ${JSON.stringify(CANONICAL_SKELETONS, null, 2)} as const;

export const COMPILED_MARKOV_GRAPH: Record<string, Record<string, { count: number, tags: Record<string, number> }>> = ${JSON.stringify(objGraph)};
export const COMPILED_PATTERN_DISTANCES: Record<string, Record<string, number>> = ${JSON.stringify(objDistances)};
`;

  fs.writeFileSync(outPath, fileContent, 'utf-8');
  console.log(`[Compile Markov Matrix] Successfully wrote ${outPath} (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)`);
}
compileAndVerify();
