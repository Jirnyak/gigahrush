/**
 * GIGAHRUSH - Universal Markov Core Prototype
 * Итеративная песочница для генерации NPC реплик без хардкода.
 */

export interface MarkovContext {
  // 1) Space
  floorZ: number;
  roomType: string;
  distanceToTarget: number;

  // 2) Needs
  hp: number; // 0-100
  thirst: number; // 0-100
  hunger: number; // 0-100

  // 3) RPG
  level: number;
  str: number;
  agi: number;
  int: number;
  karma: number; // -100 to 100
  reputation: number;

  // 4) Inventory
  inventoryValue: number;
  hasWeapon: boolean;

  // 5) Relations
  factionRelation: number; // -100 to 100
  targetRelation: number; // -100 to 100

  // 6) Lore Context
  isSamosborActive: boolean;
  isConcrete: boolean;

  // 7) Danger
  dangerLevel: number; // 0-100
  monsterName?: string;
}

interface Transition {
  from: string;
  to: string;
  baseWeight: number;
  weightMod: (ctx: MarkovContext) => number;
}

const TRANSITIONS: Transition[] = [
  // ==========================================
  // ДОМЕН: СТАРТ -> СУБЪЕКТЫ
  // ==========================================
  { from: 'START', to: 'Я', baseWeight: 10, weightMod: () => 1 },
  { from: 'START', to: 'Он', baseWeight: 5, weightMod: ctx => ctx.targetRelation !== 0 ? 3 : 1 },
  { from: 'START', to: 'Тварь', baseWeight: 2, weightMod: ctx => ctx.dangerLevel > 30 ? (ctx.dangerLevel / 10) : 0 },
  { from: 'START', to: 'Самосбор', baseWeight: 1, weightMod: ctx => ctx.isSamosborActive ? 50 : 0.1 },
  { from: 'START', to: 'Бетон', baseWeight: 5, weightMod: ctx => ctx.isConcrete ? 2 : 0.5 },
  { from: 'START', to: 'Мрак', baseWeight: 2, weightMod: ctx => ctx.karma < -30 ? 5 : 0.5 }, // Мистика

  // ==========================================
  // ДОМЕН: ВЫЖИВАНИЕ И БАЗОВЫЕ ПОТРЕБНОСТИ
  // ==========================================
  // Глаголы выживания
  { from: 'Я', to: 'хотеть', baseWeight: 5, weightMod: ctx => (ctx.thirst + ctx.hunger) / 20 },
  { from: 'Я', to: 'искать', baseWeight: 5, weightMod: ctx => ctx.hp < 50 ? 5 : 1 },
  { from: 'Я', to: 'чувствовать', baseWeight: 2, weightMod: ctx => ctx.recentTrauma ? 10 : 1 },
  
  // Объекты выживания
  { from: 'хотеть', to: 'вода', baseWeight: 1, weightMod: ctx => ctx.thirst / 10 },
  { from: 'хотеть', to: 'еда', baseWeight: 1, weightMod: ctx => ctx.hunger / 10 },
  { from: 'искать', to: 'аптечка', baseWeight: 2, weightMod: ctx => ctx.hp < 50 ? 10 : 1 },
  { from: 'чувствовать', to: 'боль', baseWeight: 2, weightMod: ctx => ctx.hp < 30 ? 10 : 0.1 },
  { from: 'чувствовать', to: 'жажда', baseWeight: 2, weightMod: ctx => ctx.thirst > 70 ? 10 : 0.1 },

  // ==========================================
  // ДОМЕН: САМОСБОР И БЕТОН
  // ==========================================
  { from: 'Самосбор', to: 'идти', baseWeight: 10, weightMod: ctx => ctx.isSamosborActive ? 10 : 1 },
  { from: 'Самосбор', to: 'быть', baseWeight: 5, weightMod: () => 1 },
  { from: 'Бетон', to: 'слышать', baseWeight: 2, weightMod: ctx => ctx.isSamosborActive ? 5 : 1 },
  { from: 'Бетон', to: 'знать', baseWeight: 2, weightMod: ctx => ctx.karma < -50 ? 3 : 1 },

  { from: 'идти', to: 'гермодверь', baseWeight: 2, weightMod: ctx => ctx.isSamosborActive ? 20 : 1 },
  { from: 'слышать', to: 'гул', baseWeight: 5, weightMod: ctx => ctx.isSamosborActive ? 10 : 1 },
  { from: 'прятаться', to: 'гермодверь', baseWeight: 5, weightMod: ctx => ctx.isSamosborActive ? 10 : 1 },

  // ==========================================
  // ДОМЕН: БОЙ И ОПАСНОСТЬ
  // ==========================================
  { from: 'Я', to: 'убить', baseWeight: 2, weightMod: ctx => (ctx.dangerLevel > 40 && ctx.hasWeapon) ? 5 : 0.1 },
  { from: 'Я', to: 'видеть', baseWeight: 3, weightMod: ctx => ctx.dangerLevel > 20 ? 3 : 1 },
  { from: 'Он', to: 'убить', baseWeight: 2, weightMod: ctx => ctx.targetRelation < -50 ? 10 : 1 },
  { from: 'Тварь', to: 'идти', baseWeight: 5, weightMod: ctx => ctx.dangerLevel > 50 ? 5 : 1 },

  { from: 'убить', to: 'враг', baseWeight: 5, weightMod: ctx => ctx.targetRelation < 0 ? 10 : 1 },
  { from: 'убить', to: 'ТВАРЬ', baseWeight: 5, weightMod: ctx => ctx.dangerLevel > 30 ? 10 : 1 },
  { from: 'видеть', to: 'кровь', baseWeight: 2, weightMod: ctx => ctx.recentTrauma ? 20 : 1 },
  { from: 'видеть', to: 'ТВАРЬ', baseWeight: 2, weightMod: ctx => ctx.dangerLevel > 50 ? 10 : 1 },

  // ==========================================
  // ДОМЕН: ЭКОНОМИКА И ТОРГОВЛЯ
  // ==========================================
  { from: 'Он', to: 'иметь', baseWeight: 2, weightMod: ctx => ctx.roomType === 'торговая' ? 5 : 1 },
  { from: 'Я', to: 'отдать', baseWeight: 2, weightMod: ctx => ctx.inventoryValue > 50 ? 3 : 0.1 },

  { from: 'хотеть', to: 'купоны', baseWeight: 5, weightMod: ctx => ctx.inventoryValue < 50 ? 3 : 1 },
  { from: 'иметь', to: 'купоны', baseWeight: 5, weightMod: () => 1 },
  { from: 'отдать', to: 'оружие', baseWeight: 2, weightMod: ctx => ctx.hasWeapon ? 2 : 0 },

  // ==========================================
  // МАРШРУТИЗАЦИЯ И ДВИЖЕНИЕ
  // ==========================================
  { from: 'Я', to: 'идти', baseWeight: 5, weightMod: ctx => ctx.distanceToTarget > 10 ? 3 : 1 },
  { from: 'Я', to: 'прятаться', baseWeight: 2, weightMod: ctx => (ctx.dangerLevel > 50 || ctx.isSamosborActive) ? 10 : 0.1 },
  
  { from: 'идти', to: 'выход', baseWeight: 5, weightMod: ctx => ctx.dangerLevel > 30 ? 3 : 1 },
  { from: 'идти', to: 'ТУДА', baseWeight: 1, weightMod: ctx => ctx.distanceToTarget > 0 ? 5 : 1 },
  { from: 'идти', to: 'быстро', baseWeight: 2, weightMod: ctx => ctx.dangerLevel > 50 ? 10 : 1 },

  // ==========================================
  // МОДИФИКАЦИИ И КОНЦЫ (-> END)
  // ==========================================
  { from: 'быстро', to: 'END', baseWeight: 10, weightMod: () => 1 },
  { from: 'тихо', to: 'END', baseWeight: 10, weightMod: () => 1 },
  { from: 'дорого', to: 'END', baseWeight: 10, weightMod: () => 1 },
  { from: 'сейчас', to: 'END', baseWeight: 10, weightMod: () => 1 },

  // Прямые переходы от объектов в конец
  { from: 'вода', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'еда', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'купоны', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'оружие', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'выход', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'гермодверь', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'ТУДА', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'враг', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'ТВАРЬ', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'аптечка', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'кровь', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'гул', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'боль', to: 'END', baseWeight: 5, weightMod: () => 1 },
  { from: 'жажда', to: 'END', baseWeight: 5, weightMod: () => 1 },

  // Цепные модификаторы
  { from: 'вода', to: 'быстро', baseWeight: 2, weightMod: ctx => ctx.thirst > 80 ? 5 : 1 },
  { from: 'гермодверь', to: 'быстро', baseWeight: 5, weightMod: ctx => ctx.isSamosborActive ? 10 : 1 },
  { from: 'кровь', to: 'везде', baseWeight: 5, weightMod: ctx => ctx.recentTrauma ? 10 : 1 },
  { from: 'везде', to: 'END', baseWeight: 10, weightMod: () => 1 },
  
  // Экстренный выход для глаголов (если дальше некуда)
  { from: 'быть', to: 'END', baseWeight: 1, weightMod: () => 1 },
  { from: 'знать', to: 'END', baseWeight: 1, weightMod: () => 1 },
  { from: 'делать', to: 'END', baseWeight: 1, weightMod: () => 1 },
  { from: 'идти', to: 'END', baseWeight: 1, weightMod: () => 1 }
];

// ---------------------------
// GENERATOR ENGINE (PURE MARKOV GRAPH)
// ---------------------------

export function generatePhrase(ctx: MarkovContext): string {
  let currentWord = 'START';
  const phrase: string[] = [];

  // Safe-guard to prevent infinite loops (max 10 atoms per sentence)
  for (let step = 0; step < 10; step++) {
    const nextTransitions = TRANSITIONS.filter(t => t.from === currentWord);
    
    if (nextTransitions.length === 0) break;

    const choices = nextTransitions.map(t => ({
      word: t.to,
      weight: Math.max(0, t.baseWeight * t.weightMod(ctx))
    })).filter(c => c.weight > 0);

    if (choices.length === 0) break;

    const totalWeight = choices.reduce((sum, c) => sum + c.weight, 0);
    let r = Math.random() * totalWeight;
    let nextWord = choices[choices.length - 1].word;
    
    for (const choice of choices) {
      r -= choice.weight;
      if (r <= 0) {
        nextWord = choice.word;
        break;
      }
    }

    if (nextWord === 'END') break;

    // Inject dynamic actual strings from context
    let finalWord = nextWord;
    if (nextWord === 'ТУДА') finalWord = ctx.roomType;
    if (nextWord === 'ТВАРЬ') finalWord = ctx.monsterName || 'монстр';

    phrase.push(finalWord);
    currentWord = nextWord; // Move state machine forward
  }

  return phrase.join(' ') + '.';
}

// ---------------------------
// TEST SIMULATION
// ---------------------------

export function simulate(scenario: string, ctx: MarkovContext) {
  console.log(`\n=== СИМУЛЯЦИЯ: ${scenario} ===`);
  console.log(`[HP:${ctx.hp} | Жажда:${ctx.thirst} | Опасность:${ctx.dangerLevel} | Травма:${!!ctx.recentTrauma} | Самосбор:${ctx.isSamosborActive}]`);
  for (let i = 0; i < 5; i++) {
    console.log(` -> ${generatePhrase(ctx)}`);
  }
}

  simulate("Выживший после кровавой бойни", {
    floorZ: -5, roomType: 'склад', distanceToTarget: 5,
    hp: 40, thirst: 40, hunger: 30, recentTrauma: true,
    level: 7, str: 8, agi: 6, int: 3, karma: -80, reputation: -50,
    inventoryValue: 10, hasWeapon: true,
    factionRelation: -50, targetRelation: -80,
    isSamosborActive: false, isConcrete: true,
    dangerLevel: 30
  });

  simulate("Раненый НПЦ убегает от Бенника во время Самосбора", {
    floorZ: 20, roomType: 'коридор', distanceToTarget: 100,
    hp: 20, thirst: 80, hunger: 50, recentTrauma: true,
    level: 2, str: 3, agi: 8, int: 4, karma: 0, reputation: 0,
    inventoryValue: 5, hasWeapon: false,
    factionRelation: 0, targetRelation: 0,
    isSamosborActive: true, isConcrete: true,
    dangerLevel: 90, monsterName: 'Бенник'
  });

  simulate("Агрессивный бандит ищет цель", {
    floorZ: -5, roomType: 'склад', distanceToTarget: 5,
    hp: 100, thirst: 40, hunger: 30,
    level: 7, str: 8, agi: 6, int: 3, karma: -80, reputation: -50,
    inventoryValue: 10, hasWeapon: true,
    factionRelation: -50, targetRelation: -80,
    isSamosborActive: false, isConcrete: true,
    dangerLevel: 20
  });

  simulate("Умирающий от жажды в безопасной зоне", {
    floorZ: 0, roomType: 'укрытие', distanceToTarget: 2,
    hp: 10, thirst: 100, hunger: 60,
    level: 1, str: 2, agi: 2, int: 2, karma: 0, reputation: 0,
    inventoryValue: 0, hasWeapon: false,
    factionRelation: 0, targetRelation: 0,
    isSamosborActive: false, isConcrete: true,
    dangerLevel: 0
  });
