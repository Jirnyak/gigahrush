import { simulate, MarkovContext } from './markov_core_prototype';

console.log("===============================================================");
console.log("   ГИГАХРУЩ - ПРОЦЕДУРНЫЙ ТЕСТОВЫЙ ПРОГОН МАРКОВСКОГО ЯДРА     ");
console.log("===============================================================");

const proceduralScenarios: Array<{ name: string, context: Partial<MarkovContext> }> = [
  {
    name: "1. ТРЕВОГА САМОСБОРА: Ликвидатор у северного гермозатвора",
    context: {
      occupation: "ликвидатор",
      faction: "Орден Спарта",
      roomType: "северный гермозатвор",
      dangerLevel: 95,
      isSamosborActive: true,
      recentTrauma: true,
      thirst: 40,
      hunger: 30,
      karma: 80,
      targetRelation: 60,
    }
  },
  {
    name: "2. НАХОДКА ХАБАРА: Сталкер нашел Гаусс-пушку в аномальной зоне",
    context: {
      occupation: "сталкер",
      faction: "Свобода",
      roomType: "влажный сектор",
      dangerLevel: 45,
      isSamosborActive: false,
      recentTrauma: false,
      foundItemValue: 5000, // Высокая стоимость предмета
      thirst: 70,
      hunger: 50,
      karma: 20,
      targetRelation: 40,
    }
  },
  {
    name: "3. ЖАЖДА И ИСТОЩЕНИЕ: Обыватель без воды в заброшенном цеху",
    context: {
      occupation: "обыватель",
      faction: "none",
      roomType: "сборочный цех",
      dangerLevel: 25,
      isSamosborActive: false,
      recentTrauma: false,
      thirst: 95, // Критическая жажда
      hunger: 85,
      karma: -10,
      targetRelation: -30,
    }
  },
  {
    name: "4. ТОРГОВЫЙ ПОСТ ГАНЗЫ: Разговор у фильтровентиляционного шлюза",
    context: {
      occupation: "торговец",
      faction: "Ганза",
      roomType: "станция Полис",
      dangerLevel: 10,
      isSamosborActive: false,
      recentTrauma: false,
      foundItemValue: 450, // Чистый фильтр / Дозиметр
      thirst: 20,
      hunger: 15,
      karma: 50,
      targetRelation: 75,
    }
  },
  {
    name: "5. ОПАСНОСТЬ МУТАНТА: Слесарь заметил снорка у трансформатора",
    context: {
      occupation: "слесарь",
      faction: "Гильдия слесарей",
      roomType: "трансформаторная ячейка",
      dangerLevel: 85,
      isSamosborActive: false,
      recentTrauma: true,
      thirst: 60,
      hunger: 40,
      karma: 0,
      targetRelation: -10,
    }
  }
];

for (const sc of proceduralScenarios) {
  simulate(sc.name, sc.context);
}
