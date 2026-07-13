/**
 * GIGAHRUSH - Universal Markov Core Prototype
 * Версия 4: Category Isomorphism & Context Weights
 * 
 * Прототип интегрирует Теорию Категорий:
 * 1. Внешний корпус (Пикник на обочине) проецируется на абстрактные множества (Категории).
 * 2. При генерации абстрактные множества изоморфно отображаются на лор/предметы Гигахруща.
 * 3. Выбор элемента из множества (изоморфизм) управляется Игровым Контекстом (Весами).
 */

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

  // 5) Item & Value Weights (НОВЫЙ БЛОК)
  foundItemValue?: number; // Цена найденного предмета (Контекстный Вес)
}

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------
// CATEGORY ISOMORPHISM (СЛОВАРИ ГИГАХРУЩА)
// Множества понятий из Гигахруща с их внутренними весами
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
    { text: 'бригадир', weight: 60, tags: ['guard'] },
    { text: 'обыватель', weight: 10, tags: ['neutral'] },
    { text: 'мясник', weight: 90, tags: ['blood', 'mystic'] },
  ],
  '<ЦЕННЫЙ_ПРЕДМЕТ>': [
    { text: 'гаусс-пушка', weight: 5000, tags: ['combat', 'expensive'] },
    { text: 'артефакт "Пустышка"', weight: 1500, tags: ['mystic', 'expensive'] },
    { text: 'чистый фильтр', weight: 100, tags: ['survival'] },
    { text: 'банка тушенки', weight: 50, tags: ['survival', 'food'] },
    { text: 'грязный бинт', weight: 5, tags: ['blood', 'survival'] },
  ],
  '<МЕСТО>': [
    { text: 'гермодверь', weight: 10, tags: ['door', 'safe'] },
    { text: 'распределитель', weight: 20, tags: ['repair'] },
    { text: 'влажный сектор', weight: 40, tags: ['water', 'danger'] },
    { text: 'сборочный цех', weight: 30, tags: ['neutral'] },
    { text: 'кровавый тупик', weight: 100, tags: ['blood', 'mystic'] },
  ],
  '<УГРОЗА>': [
    { text: 'Самосбор', weight: 100, tags: ['samosbor', 'danger'] },
    { text: 'аномалия', weight: 50, tags: ['mystic', 'danger'] },
    { text: 'бетонник', weight: 80, tags: ['combat', 'danger'] },
    { text: 'голод', weight: 20, tags: ['survival'] },
  ]
};

function resolveCategory(cat: string, ctx: MarkovContext): string {
  const items = GameCategories[cat];
  if (!items) return cat;

  // Изоморфизм (PCA Scoring)
  // Мы оцениваем каждого кандидата математически относительно контекста
  
  // Сбор контекстных тегов
  const activeTags = new Set<string>();
  if (ctx.occupation === 'охранник') activeTags.add('guard');
  if (ctx.occupation === 'сталкер') activeTags.add('stalker');
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

    // 1. Теговый буст
    let tagMatchCount = 0;
    for (const tag of item.tags) {
      if (activeTags.has(tag)) tagMatchCount++;
    }
    score *= (1 + tagMatchCount * 5);

    // 2. Радикальный сдвиг весов через память (recentTrauma)
    if (ctx.recentTrauma && (item.tags.includes('blood') || item.tags.includes('mystic'))) {
      score *= 50.0;
    }

    // 3. PCA Axis Distance (Математический изоморфизм)
    let targetWeight: number | undefined;
    if (cat === '<ЦЕННЫЙ_ПРЕДМЕТ>') targetWeight = ctx.foundItemValue;
    else if (cat === '<УГРОЗА>' || cat === '<СУБЪЕКТ>' || cat === '<МЕСТО>') targetWeight = ctx.dangerLevel;

    if (targetWeight !== undefined) {
      const diff = Math.abs(item.weight - targetWeight);
      score *= (1000 / (diff + 1)); // Чем ближе значение, тем мощнее буст
    }

    return { text: item.text, score };
  });

  // Выбираем лучший по Score (можно Random Weighted Selection, для стабильности берем Top 1)
  scoredItems.sort((a, b) => b.score - a.score);
  return scoredItems[0].text;
}

// ---------------------------
// TRAINING CORPUS
// Реальные фразы из лора игры и примеры с категориями
// ---------------------------

interface CorpusItem {
  text: string;
  tags: string[];
}

const RAW_CORPUS: CorpusItem[] = [
  // Фракции и охранники
  { text: "Приказ есть приказ. Мы чистим сектор не для того, чтобы вы жили, а чтобы он не расширялся.", tags: ['guard', 'hostile'] },
  { text: "Патронов мало. Если не можешь уложить с одного выстрела — бери инструмент потяжелее.", tags: ['guard', 'ammo'] },
  
  // Выживание, жажда, голод
  { text: "В горле пересохло так, что слюна стала как клей.", tags: ['thirst'] },
  { text: "Пайковый концентрат на вкус как сырость, но после третьего акта о голоде желудок перестает спорить.", tags: ['hunger'] },
  
  // Пример с весами ценностей и категориями (Добавлено для теста)
  { text: "Ого, <ЦЕННЫЙ_ПРЕДМЕТ>! Это стоит целое состояние!", tags: ['expensive_item'] },
  { text: "Опять <ЦЕННЫЙ_ПРЕДМЕТ>... Копейки, но на сухпаек хватит.", tags: ['cheap_item'] },
  { text: "<СУБЪЕКТ> сказал, что <УГРОЗА> уже близко. Надо уходить за <МЕСТО>.", tags: ['danger', 'rumor'] },
  
  // Бандиты, агрессия, карма
  { text: "Каждый выживает как может. Мой способ просто надежнее.", tags: ['stalker', 'neutral'] },
  { text: "Бетон помнит всё. Долг у двери помнят дольше, чем крик за дверью.", tags: ['karma_low', 'lore'] },
];

try {
  const corpusPath = path.join(process.cwd(), 'src/data/training_corpus/piknik.txt');
  if (fs.existsSync(corpusPath)) {
    console.log('[Система] Загружаю внешний корпус: Пикник на обочине...');
    const text = fs.readFileSync(corpusPath, 'utf8');
    const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [];
    let added = 0;
    
    // ТЕОРИЯ КАТЕГОРИЙ: Отображение корпуса Пикника на абстрактные Множества
    const categoryMap: Array<[RegExp, string]> = [
      [/(Рэдрик|Шухарт[а-я]*|Ричард[а-я]*|Нунан[а-я]*|Кирилл[а-я]*|Стервятник[а-я]*|Дик[а-я]*|Артур[а-я]*|Тендер[а-я]*)/gi, '<СУБЪЕКТ>'],
      [/(Зон[ауеы]|зоной|зоне|институт[а-я]*|бар[ауе]?|боржч[а-я]*)/gi, '<МЕСТО>'],
      [/(радиаци[яиюей]*|радиант[а-я]*|Бог[ау]?|Господ[иь])/gi, '<УГРОЗА>'],
      [/(хабар[а-я]*|деньг[иами]*|четвертак[а-я]*|пустышк[аиуей]*|слиз[ьиюя]*|колечк[оами]*)/gi, '<ЦЕННЫЙ_ПРЕДМЕТ>'],
    ];

    for (const s of sentences) {
      let clean = s.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Изоморфизм Пикника -> Категории
      for (const [regex, replacement] of categoryMap) {
        clean = clean.replace(regex, replacement);
      }

      const wordsCount = clean.split(' ').length;
      if (wordsCount >= 3) {
        RAW_CORPUS.push({ text: clean, tags: ['lore', 'neutral'] });
        added++;
      }
    }
    console.log(`[Система] Добавлено ${added} предложений из книги в обучающую выборку через абстрактные множества.`);
  }
} catch (e) {
  console.log('[Система] Внешний корпус не найден, продолжаю работу на базовом.');
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
    // Разбиваем по пробелам, сохраняя теги вида <ТЕГ>
    // Простая токенизация, убираем знаки препинания кроме внутри тегов
    return cleaned.split(/\s+/).map(w => {
      if (w.startsWith('<') && w.includes('>')) {
        // Очищаем знаки препинания вокруг тегов, например "<ЦЕННЫЙ_ПРЕДМЕТ>!" -> "<ЦЕННЫЙ_ПРЕДМЕТ>"
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
      
      // Initialize queue with all histories that END with the target
      for (const hist of this.graph.keys()) {
        if (hist.endsWith(target)) {
          distMap.set(hist, 0);
          queue.push({ hist, d: 0 });
        }
      }

      // Run BFS backwards
      let head = 0;
      while (head < queue.length) {
        const current = queue[head++];
        if (current.d >= 15) continue; // max depth 15

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

    // Извлекаем активные теги на основе контекста
    const activeTags = new Set<string>();
    if (ctx.occupation === 'охранник') activeTags.add('guard');
    if (ctx.occupation === 'сталкер') activeTags.add('stalker');
    if (ctx.thirst > 60) activeTags.add('thirst');
    if (ctx.hunger > 60) activeTags.add('hunger');
    if (ctx.isSamosborActive) activeTags.add('samosbor');
    if (ctx.dangerLevel > 50) activeTags.add('danger');
    if (ctx.targetRelation < -20) activeTags.add('hostile');
    if (ctx.karma < -40) activeTags.add('karma_low');
    if (ctx.recentTrauma) activeTags.add('fear');
    
    // ВЕСА КОНТЕКСТА -> ТЕГИ
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
            matchBoost += 15; // Сильный буст для совпадений контекста
          }
        }
        
        weight *= matchBoost;

        // GUIDED MARKOV HEURISTIC
        if (currentTarget && targetDistMap) {
           const nextHistory = history.split(' ').slice(1).concat(nextWord).join(' ');
           const dist = targetDistMap.get(nextHistory);
           
           if (dist !== undefined) {
              // Чем ближе цель, тем мощнее множитель
              weight *= (100 / (dist + 1));
           } else {
              // Если пути к цели нет, сильно пенализируем этот шаг
              weight *= 0.01;
           }
        }

        candidates.push({ word: nextWord, weight });
        totalWeight += weight;
      }

      let r = Math.random() * totalWeight;
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
            // Если мы пытаемся завершить предложение, но не выполнили паттерн, продолжаем искать
            // Но для простоты прототипа - выходим, если застряли
            break;
         }
         break;
      }

      result.push(chosenWord);
      currentSequence.push(chosenWord);

      // Проверяем, не достигли ли мы целевого узла
      if (currentTarget && chosenWord === currentTarget) {
         patternIndex++;
      }
    }

    // Изоморфизм: разрешение абстрактных категорий в слова Гигахруща с учетом весов
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
model.buildHeuristics(['<СУБЪЕКТ>', '<МЕСТО>', '<УГРОЗА>', '<ЦЕННЫЙ_ПРЕДМЕТ>']);

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
  
  // Выбираем паттерн на основе контекста
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
    const selectedPattern = validPatterns[Math.floor(Math.random() * validPatterns.length)];
    console.log(` [Скелет: ${selectedPattern.join(' -> ')}]`);
    console.log(` -> ${model.generate(fullCtx, selectedPattern)}`);
  }
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('markov_core_prototype.ts')) {
  
  function getRandomContext(): Partial<MarkovContext> {
    const occupations = ['обыватель', 'сталкер', 'охранник', 'ликвидатор'];
    const roomTypes = ['коридор', 'влажный сектор', 'сборочный цех', 'распределитель'];
    
    return {
      occupation: occupations[Math.floor(Math.random() * occupations.length)],
      roomType: roomTypes[Math.floor(Math.random() * roomTypes.length)],
      dangerLevel: Math.floor(Math.random() * 100),
      thirst: Math.floor(Math.random() * 100),
      hunger: Math.floor(Math.random() * 100),
      karma: Math.floor(Math.random() * 200) - 100, // -100 to 100
      targetRelation: Math.floor(Math.random() * 200) - 100,
      isSamosborActive: Math.random() > 0.8,
      recentTrauma: Math.random() > 0.8, // 20% шанс травмы
      foundItemValue: Math.random() > 0.5 ? Math.floor(Math.random() * 5000) : undefined
    };
  }

  console.log("\n--- ГЕНЕРАЦИЯ 10 РАНДОМНЫХ КОНТЕКСТОВ ДЛЯ АНАЛИЗА ---");
  for (let i = 1; i <= 10; i++) {
    const ctx = getRandomContext();
    const itemValStr = ctx.foundItemValue !== undefined ? ctx.foundItemValue : 'НЕТ';
    const samosborStr = ctx.isSamosborActive ? 'ДА' : 'НЕТ';
    const traumaStr = ctx.recentTrauma ? 'ДА' : 'НЕТ';
    const title = `ТЕСТ #${i} | Профа: ${ctx.occupation} | Опасность: ${ctx.dangerLevel} | Травма: ${traumaStr} | Самосбор: ${samosborStr} | Находка: ${itemValStr}`;
    simulate(title, ctx);
  }
}
