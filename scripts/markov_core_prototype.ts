/**
 * GIGAHRUSH - Universal Markov Core Prototype
 * Версия 6: Pure Gigahrush Lore & Universal Category Isomorphism
 * 
 * Внешние корпуса (Пикник, Метро, STALKER, Град обреченный, Советский индастриал)
 * используются ИСКЛЮЧИТЕЛЬНО для синтаксиса, ритма фразы и грамматических скелетов.
 * Любые внешние имена и термины (ЧАЭС, Сидорович, Контролер, ВДНХ) при загрузке 
 * строжайше проецируются на абстрактные категории (<СУБЪЕКТ>, <МЕСТО>, <УГРОЗА> и т.д.),
 * а при генерации подставляются ИСКЛЮЧИТЕЛЬНО сущности мира ГИГАХРУЩА и САМОСБОРА.
 */

import * as fs from 'fs';
import * as path from 'path';
import { rng } from '../src/core/rand';

export interface MarkovContext {
  // 1) Space & Environment
  floorZ: number;
  roomType: string;
  isConcrete: boolean;
  powerStatus: 'on' | 'flickering' | 'off';
  roomMemory: string[];

  // 2) Needs & State
  hp: number;
  thirst: number;
  hunger: number;
  recentTrauma: boolean;

  // 3) RPG & Identity
  karma: number;
  occupation: string;
  faction: string; 

  // 4) Danger & Social
  dangerLevel: number;
  targetRelation: number;
  isSamosborActive: boolean;

  // 5) Item & Value Weights
  foundItemValue?: number; // Цена найденного предмета
}

// ---------------------------
// CATEGORY ISOMORPHISM (СЛОВАРИ ГИГАХРУЩА И САМОСБОРА)
// Настоящие сущности канона Гигахруща
// ---------------------------

interface CategoryItem {
  text: string;
  weight: number; // Ось PCA (напр. dangerLevel, itemPrice, karma)
  tags: string[];
}

const GameCategories: Record<string, CategoryItem[]> = {
  '<СУБЪЕКТ>': [
    { text: 'ликвидатор', weight: 80, tags: ['guard', 'combat'] },
    { text: 'слесарь-параноик', weight: 40, tags: ['stalker', 'repair'] },
    { text: 'бригадир смены', weight: 60, tags: ['guard'] },
    { text: 'обыватель', weight: 10, tags: ['neutral'] },
    { text: 'мясник', weight: 90, tags: ['blood', 'mystic'] },
    { text: 'проходчик', weight: 50, tags: ['stalker', 'survival'] },
    { text: 'домком', weight: 70, tags: ['guard', 'bureaucracy'] },
    { text: 'дежурный электрик', weight: 35, tags: ['repair', 'survival'] },
    { text: 'дежурный по гермозатвору', weight: 65, tags: ['guard', 'door'] },
    { text: 'лаборант НИИ', weight: 30, tags: ['neutral', 'science'] },
  ],
  '<ЦЕННЫЙ_ПРЕДМЕТ>': [
    { text: 'гаусс-пушка', weight: 5000, tags: ['combat', 'expensive'] },
    { text: 'артефакт "Пустышка"', weight: 1500, tags: ['mystic', 'expensive'] },
    { text: 'чистый фильтр АФУ-300', weight: 100, tags: ['survival'] },
    { text: 'банка тушенки', weight: 50, tags: ['survival', 'food'] },
    { text: 'грязный бинт', weight: 5, tags: ['blood', 'survival'] },
    { text: 'патроны 5.45', weight: 200, tags: ['combat', 'expensive'] },
    { text: 'дозиметр ДП-5В', weight: 450, tags: ['survival', 'repair'] },
    { text: 'малахитовый артефакт', weight: 1200, tags: ['mystic', 'expensive'] },
    { text: 'герметизирующая мастика', weight: 80, tags: ['repair'] },
    { text: 'пайковый концентрат', weight: 40, tags: ['food', 'survival'] },
    { text: 'талон на воду', weight: 15, tags: ['survival'] },
  ],
  '<МЕСТО>': [
    { text: 'гермодверь', weight: 10, tags: ['door', 'safe'] },
    { text: 'распределитель', weight: 20, tags: ['repair'] },
    { text: 'влажный сектор', weight: 40, tags: ['water', 'danger'] },
    { text: 'сборочный цех', weight: 30, tags: ['neutral'] },
    { text: 'кровавый тупик', weight: 100, tags: ['blood', 'mystic'] },
    { text: 'защитный шлюз', weight: 15, tags: ['door', 'guard'] },
    { text: 'бункер Гражданской Обороны', weight: 5, tags: ['safe', 'door'] },
    { text: 'вентиляционная шахта', weight: 45, tags: ['danger', 'repair'] },
    { text: 'трансформаторная ячейка', weight: 55, tags: ['danger', 'repair'] },
    { text: 'жилая ячейка', weight: 12, tags: ['safe', 'neutral'] },
    { text: 'продувочная прачечная', weight: 25, tags: ['water', 'neutral'] },
  ],
  '<УГРОЗА>': [
    { text: 'Самосбор', weight: 100, tags: ['samosbor', 'danger'] },
    { text: 'процедурная аномалия', weight: 50, tags: ['mystic', 'danger'] },
    { text: 'бетонник', weight: 80, tags: ['combat', 'danger'] },
    { text: 'истощение и голод', weight: 20, tags: ['survival'] },
    { text: 'пси-излучение', weight: 90, tags: ['mystic', 'fear'] },
    { text: 'черная слизь', weight: 75, tags: ['samosbor', 'danger'] },
    { text: 'удушливый газ', weight: 40, tags: ['survival', 'danger'] },
    { text: 'радиационная капель', weight: 35, tags: ['survival'] },
    { text: 'гидроудар в трубах', weight: 30, tags: ['repair'] },
  ],
  '<ФРАКЦИЯ>': [
    { text: 'Служба ликвидации', weight: 80, tags: ['guard', 'combat'] },
    { text: 'Служба герметизации', weight: 70, tags: ['guard', 'door'] },
    { text: 'Независимая гильдия слесарей', weight: 40, tags: ['repair'] },
    { text: 'Администрация корпуса', weight: 65, tags: ['bureaucracy'] },
    { text: 'НИИ "Щит"', weight: 85, tags: ['science'] },
  ],
  '<ИНСТРУМЕНТ>': [
    { text: 'дозиметр', weight: 100, tags: ['survival'] },
    { text: 'гаечный ключ', weight: 50, tags: ['repair'] },
    { text: 'противогаз ГП-7', weight: 150, tags: ['survival'] },
    { text: 'переносной фонарь', weight: 30, tags: ['survival'] },
    { text: 'прижимной клин', weight: 40, tags: ['door', 'repair'] },
  ]
};

function resolveCategory(cat: string, ctx: MarkovContext): string {
  const items = GameCategories[cat];
  if (!items) return cat;

  const activeTags = new Set<string>();
  if (ctx.occupation === 'охранник' || ctx.occupation === 'ликвидатор') {
    activeTags.add('guard');
    activeTags.add('combat');
  }
  if (ctx.occupation === 'слесарь') activeTags.add('repair');
  if (ctx.dangerLevel > 50) activeTags.add('danger');
  if (ctx.isSamosborActive) activeTags.add('samosbor');
  if (ctx.thirst > 60 || ctx.hunger > 60) activeTags.add('survival');
  if (ctx.recentTrauma) {
    activeTags.add('blood');
    activeTags.add('mystic');
    activeTags.add('fear');
  }

  const scoredItems = items.map(item => {
    let score = 1.0;

    let tagMatchCount = 0;
    for (const tag of item.tags) {
      if (activeTags.has(tag)) tagMatchCount++;
    }
    score *= (1 + tagMatchCount * 5);

    if (ctx.recentTrauma && (item.tags.includes('blood') || item.tags.includes('mystic') || item.tags.includes('fear'))) {
      score *= 50.0;
    }

    let targetWeight: number | undefined;
    if (cat === '<ЦЕННЫЙ_ПРЕДМЕТ>') targetWeight = ctx.foundItemValue;
    else if (cat === '<УГРОЗА>' || cat === '<СУБЪЕКТ>' || cat === '<МЕСТО>') targetWeight = ctx.dangerLevel;

    if (targetWeight !== undefined) {
      const diff = Math.abs(item.weight - targetWeight);
      score *= (1000 / (diff + 1));
    }

    return { text: item.text, score };
  });

  scoredItems.sort((a, b) => b.score - a.score);
  return scoredItems[0].text;
}

// ---------------------------
// TRAINING CORPUS LOADING & SANITIZED CATEGORY MAPPING
// ---------------------------

interface CorpusItem {
  text: string;
  tags: string[];
}

const RAW_CORPUS: CorpusItem[] = [
  { text: "Приказ есть приказ. Мы чистим сектор не для того, чтобы вы жили, а чтобы он не расширялся.", tags: ['guard', 'hostile'] },
  { text: "Патронов мало. Если не можешь уложить с одного выстрела — бери инструмент потяжелее.", tags: ['guard', 'ammo'] },
  { text: "В горле пересохло так, что слюна стала как клей.", tags: ['thirst'] },
  { text: "Пайковый концентрат на вкус как сырость, но после третьего акта о голоде желудок перестает спорить.", tags: ['hunger'] },
  { text: "Ого, <ЦЕННЫЙ_ПРЕДМЕТ>! Это стоит целое состояние!", tags: ['expensive_item'] },
  { text: "Опять <ЦЕННЫЙ_ПРЕДМЕТ>... Копейки, но на сухпаек хватит.", tags: ['cheap_item'] },
  { text: "<СУБЪЕКТ> сказал, что <УГРОЗА> уже близко. Надо уходить за <МЕСТО>.", tags: ['danger', 'rumor'] },
  { text: "Каждый выживает как может. Мой способ просто надежнее.", tags: ['neutral'] },
  { text: "Бетон помнит всё. Долг у двери помнят дольше, чем крик за дверью.", tags: ['karma_low', 'lore'] },
];

try {
  const corpusDir = path.join(process.cwd(), 'src/data/training_corpus');
  if (fs.existsSync(corpusDir)) {
    const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.txt') || f.endsWith('.jsonl'));
    console.log(`[Система] Загружаю объединение корпусов (${files.length} файлов: ${files.join(', ')})...`);
    let added = 0;
    
    // ИЗОМОРФНЫЙ МАППИНГ И САНИТИЗАЦИЯ ВНЕШНИХ ТЕРМИНОВ НА КАТЕГОРИИ ГИГАХРУЩА
    const categoryMap: Array<[RegExp, string]> = [
      // 1. Имена и Субъекты (STALKER, Метро, Стругацкие, Советские)
      [/(Рэдрик[а-я]*|Шухарт[а-я]*|Ричард[а-я]*|Нунан[а-я]*|Артем[а-я]*|Меченый|Стрелок[а-я]*|Сидорович[а-я]*|Бармен[а-я]*|Мельник[а-я]*|Хантер[а-я]*|Бурбон[а-я]*|Сухой|Андрей[а-я]*|Воронин[а-я]*|ликвидатор[а-я]*|слесарь[а-я]*|патрульны[йеам]*|бригадир[а-я]*|мясник[а-я]*|проходчик[а-я]*|экспедитор[а-я]*|инженер[а-я]*|мусорщик[а-я]*|гражданин[а-я]*|сталкер[а-я]*|ходок[а-я]*|анон[а-я]*)/gi, '<СУБЪЕКТ>'],
      
      // 2. Локации и Внешние топонимы (ЧАЭС, Припять, Кордон, ВДНХ, Полис, Здании-Стена)
      [/(ЧАЭС|Чернобыль[а-я]*|Кордон[а-я]*|Свалк[аиуе]|Агропром[а-я]*|Темная Долина|Армейские Склады|Рыжий Лес|Радар[а-я]*|Припять[а-я]*|Затон[а-я]*|Юпитер[а-я]*|Выжигатель[а-я]*|ВДНХ|Полис[а-я]*|Алексеевск[а-я]*|Рижск[а-я]*|Смоленск[а-я]*|Арбатск[а-я]*|Красная Линия|Зон[ауеы]|зоной|зоне|институт[а-я]*|бункер[а-я]*|гермодвер[ьяием]*|герма[аммиуе]*|гермозатвор[а-я]*|цех[а-я]*|сектор[а-я]*|этаж[а-я]*|тупик[а-я]*|Клеть|Здания-Стен[аыеу]|Город[а-я]*)/gi, '<МЕСТО>'],
      
      // 3. Монстры и Внешние угрозы (Снорк, Контролер, Черные, Выброс)
      [/(снорк[а-я]*|контролер[а-я]*|полтергейст[а-я]*|бюрер[а-я]*|слепые псы|слепой пес|псевдогигант[а-я]*|кровосос[а-я]*|кикимор[а-я]*|Чёрны[хеим]*|Самосбор[а-я]*|радиаци[яиюей]*|аномали[яиюей]*|слизь|бетонник[а-я]*|выброс[а-я]*|пси-излучени[яе]*|удушь[яе]*|голод[а-я]*)/gi, '<УГРОЗА>'],
      
      // 4. Внешний хабар и предметы
      [/(хабар[а-я]*|деньг[иами]*|пустышк[аиуей]*|фильтр[а-я]*|тушенк[аиуей]*|бинт[а-я]*|гаусс-пушк[аиуей]*|гаусс[а-я]*|дозиметр[а-я]*|патрон[а-я]*|артефакт[а-я]*|медуз[аыуей]*|ломоть мяса|мамина бусы|контейнер[а-я]*)/gi, '<ЦЕННЫЙ_ПРЕДМЕТ>'],
      
      // 5. Внешние группировки
      [/(Долг[а-я]*|Свобод[аыеу]|Монолит[а-я]*|Чистое Небо|Наемники|Ганз[аыеу]|Орден[а-я]*|Спарта)/gi, '<ФРАКЦИЯ>'],
    ];

    for (const file of files) {
      const filePath = path.join(corpusDir, file);
      const text = fs.readFileSync(filePath, 'utf8');
      const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];

      for (const s of sentences) {
        let clean = s.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Применяем категориальную санитизацию
        for (const [regex, replacement] of categoryMap) {
          clean = clean.replace(regex, replacement);
        }

        // Финальная очистка: если в строке случайно остались сырые слова вроде "сталкер", "чаэс", "сидорович", проецируем их
        clean = clean
          .replace(/\bсталкер[а-я]*\b/gi, '<СУБЪЕКТ>')
          .replace(/\bчаэс\b/gi, '<МЕСТО>')
          .replace(/\bсидорович[а-я]*\b/gi, '<СУБЪЕКТ>')
          .replace(/\bконтролер[а-я]*\b/gi, '<УГРОЗА>')
          .replace(/\bснорк[а-я]*\b/gi, '<УГРОЗА>');

        const wordsCount = clean.split(' ').length;
        if (wordsCount >= 3 && wordsCount <= 35) {
          RAW_CORPUS.push({ text: clean, tags: ['lore', 'neutral'] });
          added++;
        }
      }
    }
    console.log(`[Система] Успешно загружено и очищено от внешних франшиз ${added} предложений из всех корпусов.`);
  }
} catch (e) {
  console.log('[Система] Ошибка загрузки корпусов:', e);
}

// ---------------------------
// N-GRAM COMPILER (AUTO-LEARNER)
// ---------------------------

const START_TOKEN = "<s>";
const END_TOKEN = "</s>";

interface TransitionInfo {
  count: number;
  tags: Record<string, number>;
}

type MarkovGraph = Map<string, Map<string, TransitionInfo>>;

class MarkovModel {
  private graph: MarkovGraph = new Map();
  private order: number;
  private patternDistances: Map<string, Map<string, number>> = new Map();

  constructor(order: number = 2) {
    this.order = order;
  }

  private tokenize(text: string): string[] {
    const cleaned = text.trim();
    return cleaned.split(/\s+/).map(w => {
      if (w.startsWith('<') && w.includes('>')) {
        const tagMatch = w.match(/(<[^>]+>)/);
        return tagMatch ? tagMatch[1] : w.toLowerCase();
      }
      return w.toLowerCase().replace(/[^а-яё\-<>\w]/gi, '');
    }).filter(w => w.length > 0);
  }

  public train(corpus: CorpusItem[]) {
    for (const item of corpus) {
      const tokens = this.tokenize(item.text);
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

  public generate(ctx: MarkovContext, pattern: string[] = [], maxWords: number = 35): string {
    let currentSequence = Array(this.order).fill(START_TOKEN);
    const result: string[] = [];

    const activeTags = new Set<string>();
    if (ctx.occupation === 'охранник' || ctx.occupation === 'ликвидатор') activeTags.add('guard');
    if (ctx.occupation === 'слесарь') activeTags.add('repair');
    if (ctx.thirst > 60) activeTags.add('thirst');
    if (ctx.hunger > 60) activeTags.add('hunger');
    if (ctx.isSamosborActive) activeTags.add('samosbor');
    if (ctx.dangerLevel > 50) activeTags.add('danger');
    if (ctx.targetRelation < -20) activeTags.add('hostile');
    if (ctx.karma < -40) activeTags.add('karma_low');
    if (ctx.recentTrauma) activeTags.add('fear');
    
    if (ctx.foundItemValue !== undefined) {
      if (ctx.foundItemValue >= 1000) activeTags.add('expensive_item');
      if (ctx.foundItemValue < 100) activeTags.add('cheap_item');
    }

    let patternIndex = 0;

    for (let step = 0; step < maxWords; step++) {
      let history = currentSequence.slice(-this.order).join(' ');
      let transitions = this.graph.get(history);

      if (!transitions || transitions.size === 0) {
        history = currentSequence.slice(-1).join(' '); 
        transitions = this.graph.get(history);
      }

      if (!transitions || transitions.size === 0) break;

      const candidates: { word: string, weight: number }[] = [];
      let totalWeight = 0;

      const currentTarget = patternIndex < pattern.length ? pattern[patternIndex] : null;
      const targetDistMap = currentTarget ? this.patternDistances.get(currentTarget) : null;

      for (const [nextWord, info] of transitions.entries()) {
        let weight = info.count;

        let matchBoost = 1;
        for (const tag of Object.keys(info.tags)) {
          if (activeTags.has(tag)) {
            matchBoost += 15;
          }
        }
        
        weight *= matchBoost;

        if (currentTarget && targetDistMap) {
           const nextHistory = history.split(' ').slice(1).concat(nextWord).join(' ');
           const dist = targetDistMap.get(nextHistory);
           
           if (dist !== undefined) {
              weight *= (100 / (dist + 1));
           } else {
              weight *= 0.01;
           }
        }

        candidates.push({ word: nextWord, weight });
        totalWeight += weight;
      }

      let r = rng() * totalWeight;
      let chosenWord = END_TOKEN;
      for (const cand of candidates) {
        r -= cand.weight;
        if (r <= 0) {
          chosenWord = cand.word;
          break;
        }
      }

      if (chosenWord === END_TOKEN) {
         if (patternIndex < pattern.length) {
            break;
         }
         break;
      }

      result.push(chosenWord);
      currentSequence.push(chosenWord);

      if (currentTarget && chosenWord === currentTarget) {
         patternIndex++;
      }
    }

    const resolvedResult = result.map(word => {
      if (word.startsWith('<') && word.endsWith('>')) {
        return resolveCategory(word, ctx);
      }
      return word;
    });

    let finalSentence = resolvedResult.join(' ');
    if (finalSentence.length > 0) {
      finalSentence = finalSentence.charAt(0).toUpperCase() + finalSentence.slice(1);
    }
    return finalSentence;
  }
}

// ---------------------------
// INITIALIZATION
// ---------------------------

const model = new MarkovModel(2);
model.train(RAW_CORPUS);
model.buildHeuristics(['<СУБЪЕКТ>', '<МЕСТО>', '<УГРОЗА>', '<ЦЕННЫЙ_ПРЕДМЕТ>', '<ФРАКЦИЯ>']);

const backoffModel = new MarkovModel(1);
backoffModel.train(RAW_CORPUS);

for (const [hist, trans] of backoffModel['graph'].entries()) {
  if (!model['graph'].has(hist)) {
    model['graph'].set(hist, trans);
  }
}

// ---------------------------
// TEST SIMULATION
// ---------------------------

export function simulate(scenario: string, ctx: Partial<MarkovContext>) {
  const fullCtx: MarkovContext = {
    floorZ: 0, roomType: 'коридор', isConcrete: true, powerStatus: 'on', roomMemory: [],
    hp: 100, thirst: 0, hunger: 0, recentTrauma: false,
    karma: 0, occupation: 'обыватель', faction: 'none',
    dangerLevel: 0, targetRelation: 0, isSamosborActive: false,
    ...ctx
  };

  console.log(`\n=== СИМУЛЯЦИЯ: ${scenario} ===`);
  const ctxStr = Object.entries(ctx).map(([k, v]) => `${k}: ${v}`).join(' | ');
  console.log(`[Полный входящий контекст -> ${ctxStr}]`);
  
  let validPatterns = [
    ["<СУБЪЕКТ>", "<МЕСТО>"],
    ["<МЕСТО>", "<СУБЪЕКТ>"],
    ["<СУБЪЕКТ>", "<МЕСТО>", "<СУБЪЕКТ>"]
  ];

  if (fullCtx.dangerLevel > 50 || fullCtx.isSamosborActive) {
    validPatterns = [
      ["<УГРОЗА>", "<СУБЪЕКТ>"],
      ["<СУБЪЕКТ>", "<УГРОЗА>"],
      ["<МЕСТО>", "<УГРОЗА>"]
    ];
  } else if (fullCtx.foundItemValue !== undefined) {
    validPatterns = [
      ["<СУБЪЕКТ>", "<ЦЕННЫЙ_ПРЕДМЕТ>"],
      ["<ЦЕННЫЙ_ПРЕДМЕТ>", "<СУБЪЕКТ>"],
      ["<МЕСТО>", "<ЦЕННЫЙ_ПРЕДМЕТ>"]
    ];
  }

  for (let i = 0; i < 3; i++) {
    const selectedPattern = validPatterns[Math.floor(rng() * validPatterns.length)];
    console.log(` [Скелет: ${selectedPattern.join(' -> ')}]`);
    console.log(` -> ${model.generate(fullCtx, selectedPattern)}`);
  }
}
